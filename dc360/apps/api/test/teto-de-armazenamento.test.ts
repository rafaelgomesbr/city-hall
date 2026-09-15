import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";
import { LIMIAR_DE_AVISO, MARGEM_DO_TETO, lerUso } from "../src/armazenamento/uso.js";

/**
 * O teto de armazenamento por município.
 *
 * O PROBLEMA MEDIDO: o banco não cresce (uma ocorrência com vida completa
 * custa cerca de 8 KB, e 2.000 atendimentos por ano dão 16 MB por ano). O que
 * cresce são as FOTOGRAFIAS, que não estão no banco: seis fotos de 2 MB por
 * vistoria dão 24 GB por ano nos mesmos 2.000 atendimentos. Três ordens de
 * grandeza acima do banco, e sem teto nenhum a fatura é do fornecedor.
 *
 * O QUE ESTE ARQUIVO DECIDE, e é mais importante do que o número do teto:
 *
 *   1. Quem fixa o teto. Não é o município: o município é o controlador dos
 *      DADOS, e o dono da FATURA é o fornecedor. Município que levanta o
 *      próprio teto não é teto.
 *   2. O que acontece com o agente que está no morro, sem sinal, com a coleta
 *      pronta, no dia em que o teto estourou. Recusar ali significa perder uma
 *      manhã de trabalho, e este produto não faz isso.
 *   3. Que a recusa, quando ela existir, seja de uma família de status que a
 *      fila do aparelho trata como TEMPORÁRIA. Um 4xx bloquearia o item para
 *      sempre, e não existe tela para desbloquear coleta recusada.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const MB = 1024 * 1024;
const GB = 1024 * MB;
/**
 * Teto por ARQUIVO, imposto pela migração 003. Nenhuma linha de evidência passa
 * disso, então encher o balde do teste é somar muitos pedaços e nunca um número
 * grande numa linha só.
 */
const PEDACO = 15 * MB;
/**
 * Quanto o município do teste já ocupa antes de qualquer caso rodar.
 *
 * Grande de propósito: o piso da restrição do banco é 1 GB (teto menor que isso
 * não limitaria custo, produziria recusa de foto no primeiro dia de chuva), e
 * cada caso aqui fixa um teto RELATIVO ao uso corrente. Com um balde de poucos
 * megabytes, o teto calculado cairia abaixo do piso e o que falharia seria a
 * aritmética do teste, e não a regra que ele mede.
 */
const BALDE_INICIAL = 4 * GB;

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
let tokenAgente: string;
let tokenCoordenador: string;
let tokenAdministrador: string;
let tokenOutroMunicipio: string;
let orgSerraAlta: string;
let orgValeFundo: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

function com(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** O teto é ato do operador da plataforma: entra como dono do banco. */
async function fixarTeto(organizacaoId: string, bytes: number | null): Promise<void> {
  await mem.bruto.query(
    "UPDATE organizacoes SET teto_armazenamento_bytes = $2 WHERE id = $1",
    [organizacaoId, bytes],
  );
}

/**
 * Enche o balde do município sem passar pela rota.
 *
 * Fotografia de verdade custaria megabytes de memória no teste para provar uma
 * conta que é de metadado: o que consome o teto é `tamanho_bytes`, declarado na
 * autorização e conferido contra o armazenamento na confirmação.
 */
async function encher(organizacaoId: string, ocorrenciaId: string, bytes: number): Promise<void> {
  const pedacos = Math.ceil(bytes / PEDACO);
  await mem.bruto.query(
    `INSERT INTO evidencias
       (organizacao_id, ocorrencia_id, chave_storage, capturada_em, tipo_conteudo,
        tamanho_bytes, enviada_em)
     SELECT $1::uuid, $2::uuid,
            'tenant/' || $1::text || '/ocorrencias/' || $2::text || '/enchimento-'
            || n::text || '-' || gen_random_uuid()::text || '.jpg',
            now(), 'image/jpeg', $4::bigint, now()
       FROM generate_series(1, $3::int) AS n`,
    [organizacaoId, ocorrenciaId, pedacos, PEDACO],
  );
}

/**
 * Fixa o teto de modo que o uso corrente seja `razao` vezes ele.
 *
 * Os casos deste arquivo não falam de números absolutos, falam de POSIÇÃO em
 * relação ao teto: 0,9 é o aviso, 1,2 é acima do teto contratado, 2 é além da
 * margem. Escrever bytes à mão faria cada caso depender de quanto os casos
 * anteriores gastaram.
 */
async function fixarTetoRelativo(organizacaoId: string, razao: number): Promise<number> {
  const uso = await mem.banco.comTenant(organizacaoId, (c) => lerUso(c));
  const teto = Math.floor(uso.bytesUsados / razao);
  await fixarTeto(organizacaoId, teto);
  return teto;
}

async function ocorrenciaEmCampo(token: string, endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(token),
    payload: {
      solicitanteNome: "Moradora", canalEntrada: "telefone", endereco,
      tipo: "deslizamento", descricao: "Talude cedeu depois da chuva.",
    },
  });
  const id = criar.json().id;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(token),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(token),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 24 },
  });
  return id;
}

async function autorizar(ocorrenciaId: string, tamanhoBytes: number) {
  return app.inject({
    method: "POST", url: "/evidencias/autorizar-envio", headers: com(tokenAgente),
    payload: {
      ocorrenciaId,
      nomeArquivo: "IMG_0042.jpg",
      tipoConteudo: "image/jpeg",
      tamanhoBytes,
      capturadaEm: new Date().toISOString(),
      ordem: 0,
    },
  });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-teto-de-armazenamento-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);

  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenAdministrador = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokenOutroMunicipio = await entrar("aurelio.machado@valefundo.exemplo.gov.br");

  const orgs = await mem.bruto.query<{ id: string; municipio: string }>(
    "SELECT id, municipio FROM organizacoes ORDER BY municipio",
  );
  orgSerraAlta = orgs.rows.find((o) => o.municipio.includes("Serra"))!.id;
  orgValeFundo = orgs.rows.find((o) => !o.municipio.includes("Serra"))!.id;

  const daSerra = await ocorrenciaEmCampo(tokenCoordenador, "Rua do balde inicial, 1");
  await encher(orgSerraAlta, daSerra, BALDE_INICIAL);
}, 300_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("A conta, e de quem ela é", () => {
  it("município sem teto fixado continua enviando, e é o estado de hoje", async () => {
    await fixarTeto(orgSerraAlta, null);
    const ocorrencia = await ocorrenciaEmCampo(tokenCoordenador, "Rua sem teto, 1");

    const r = await autorizar(ocorrencia, 2 * MB);

    expect(r.statusCode).toBe(201);
    expect(r.json().armazenamento?.situacao ?? "sem_teto").toBe("sem_teto");
  }, 60_000);

  it("o consumo de um município não conta no teto do vizinho", async () => {
    await fixarTeto(orgSerraAlta, 10 * GB);
    await fixarTeto(orgValeFundo, 10 * GB);

    const usoSerra = await mem.banco.comTenant(orgSerraAlta, (c) => lerUso(c));
    const usoVale = await mem.banco.comTenant(orgValeFundo, (c) => lerUso(c));

    expect(usoSerra.bytesUsados).toBeGreaterThanOrEqual(BALDE_INICIAL);
    expect(usoVale.bytesUsados).toBeLessThan(BALDE_INICIAL);
    expect(usoSerra.situacao).toBe("normal");
    expect(usoVale.situacao).toBe("normal");

    await fixarTeto(orgSerraAlta, null);
    await fixarTeto(orgValeFundo, null);
  }, 120_000);

  it("o município NÃO levanta o próprio teto: quem recusa é o banco", async () => {
    /*
      A retenção da migração 021 é decisão do MUNICÍPIO, porque o município é o
      controlador do dado. O teto é o inverso: quem paga o armazenamento é o
      fornecedor, e um teto que o próprio limitado levanta não limita nada.

      A garantia não pode ser "nenhuma rota expõe o campo", porque a rota que o
      expõe por engano é escrita daqui a um ano por quem não leu a migração.
      Aqui quem recusa é o Postgres, e o teste escreve pelo papel de aplicação
      direto, sem rota nenhuma no meio.
    */
    await fixarTeto(orgSerraAlta, 5 * GB);

    let recusou = false;
    try {
      await mem.banco.comTenant(orgSerraAlta, async (c) => {
        await c.query(
          "UPDATE organizacoes SET teto_armazenamento_bytes = $2 WHERE id = $1",
          [orgSerraAlta, 90 * GB],
        );
      });
    } catch {
      recusou = true;
    }
    expect(recusou, "o papel de aplicação levantou o próprio teto").toBe(true);

    const depois = await mem.bruto.query<{ teto: string }>(
      "SELECT teto_armazenamento_bytes::text AS teto FROM organizacoes WHERE id = $1",
      [orgSerraAlta],
    );
    expect(Number(depois.rows[0]!.teto)).toBe(5 * GB);

    // O resto de `organizacoes` continua editável: o gatilho nomeia uma coluna.
    await mem.banco.comTenant(orgSerraAlta, async (c) => {
      await c.query("UPDATE organizacoes SET retencao_solicitante_dias = 365 WHERE id = $1", [
        orgSerraAlta,
      ]);
    });

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);

  it("os números da rota e os do banco são o MESMO número", async () => {
    /*
      `LIMIAR_DE_AVISO` e `MARGEM_DO_TETO` existem em TypeScript porque a rota
      precisa deles para escrever a frase, e existem em SQL porque a regra mora
      no banco. Duas cópias de um número divergem em silêncio, e a divergência
      apareceria como "a rota deixou passar e o banco recusou", em produção, com
      o agente na chuva. Este caso é o que impede isso.
    */
    await fixarTeto(orgSerraAlta, 40 * GB);
    const uso = await mem.banco.comTenant(orgSerraAlta, (c) => lerUso(c));

    expect(uso.margemBytes).toBe(Math.floor(40 * GB * MARGEM_DO_TETO));
    expect(LIMIAR_DE_AVISO).toBe(0.8);

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);

  it("a coordenação enxerga o próprio consumo", async () => {
    await fixarTeto(orgSerraAlta, 20 * GB);

    const r = await app.inject({
      method: "GET", url: "/armazenamento/uso", headers: com(tokenAdministrador),
    });

    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.tetoBytes).toBe(20 * GB);
    expect(corpo.bytesUsados).toBeGreaterThan(0);
    expect(typeof corpo.situacao).toBe("string");

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);
});

describe("O que acontece quando o teto chega perto, e quando ele estoura", () => {
  it("passado o limiar de aviso, o envio PASSA e a resposta avisa", async () => {
    const ocorrencia = await ocorrenciaEmCampo(tokenCoordenador, "Rua do aviso, 20");

    // Noventa por cento do teto: passou do limiar de aviso, e nao do teto.
    expect(0.9).toBeGreaterThan(LIMIAR_DE_AVISO);
    await fixarTetoRelativo(orgSerraAlta, 0.9);

    const r = await autorizar(ocorrencia, 1024);

    expect(r.statusCode).toBe(201);
    expect(r.json().armazenamento.situacao).toBe("aviso");
    expect(r.json().url, "a URL de escrita continua saindo: avisar não é recusar")
      .toBeTruthy();

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);

  it("ACIMA do teto contratado o envio ainda passa, porque o agente já está no morro", async () => {
    /*
      A decisão central deste arquivo.

      O aparelho do agente está no morro, sem sinal, com a coleta pronta.
      Recusar a foto no primeiro byte acima do teto significaria que um número
      de contrato, decidido meses antes num escritório, destrói a vistoria de
      uma interdição. O teto contratado é freio de mão: ele acende o aviso, ele
      é relatado, e ele não arranca o trabalho de ninguém.

      O que recusa é a MARGEM, bem acima, e ela existe para o balde não virar
      infinito por omissão de quem devia ter renegociado o contrato.
    */
    const ocorrencia = await ocorrenciaEmCampo(tokenCoordenador, "Rua do estouro, 30");

    // Vinte por cento acima do teto, e ainda bem dentro da margem.
    expect(1.2).toBeLessThan(MARGEM_DO_TETO);
    await fixarTetoRelativo(orgSerraAlta, 1.2);

    const r = await autorizar(ocorrencia, 1024);

    expect(r.statusCode).toBe(201);
    expect(r.json().armazenamento.situacao).toBe("acima_do_teto");
    expect(r.json().url).toBeTruthy();

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);

  it("acima da margem recusa, com status que a fila do aparelho trata como TEMPORÁRIO", async () => {
    /*
      507 e não 413, e a escolha é do tamanho do produto.

      `packages/campo/src/transporte.ts` classifica 5xx e 429 como falha
      temporária e 400, 401, 403, 404, 409 e 422 como permanente. Item
      permanente vira `bloqueado`, e o README diz por escrito que NÃO EXISTE
      TELA para desbloquear coleta recusada: a coleta ficaria presa no aparelho
      até alguém apagá-la.

      Com 507, a fila adia e volta a tentar, sem teto de tentativas para falha
      temporária. A coleta sobrevive no aparelho e DRENA SOZINHA no dia em que
      a plataforma ampliar o teto, sem ninguém tocar no telefone do agente.
    */
    const ocorrencia = await ocorrenciaEmCampo(tokenCoordenador, "Rua da margem, 40");

    // O dobro do teto, ou seja, passado da margem.
    expect(2).toBeGreaterThan(MARGEM_DO_TETO);
    await fixarTetoRelativo(orgSerraAlta, 2);

    const r = await autorizar(ocorrencia, 1024);

    expect(r.statusCode).toBe(507);
    expect(r.statusCode, "4xx bloquearia a coleta para sempre na fila do aparelho")
      .toBeGreaterThanOrEqual(500);
    expect(r.json().erro).toBe("teto_de_armazenamento");
    expect(
      r.json().mensagem,
      "a mensagem precisa dizer ao agente que a coleta não se perdeu",
    ).toMatch(/aparelho/i);

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);

  it("com o teto estourado, ocorrência de outro município ainda responde 404", async () => {
    /*
      A ordem das conferências, e ela não é detalhe.

      O 404 de recurso de outro município existe para não confirmar que ele
      existe, e um 507 no lugar dele diria duas coisas erradas de uma vez: que o
      município do token está cheio (informação sobre ESTE município, e não
      sobre o recurso pedido) e, pior, faria a fila do aparelho insistir para
      sempre num pedido que nunca vai funcionar.
    */
    const daVizinha = await ocorrenciaEmCampo(tokenOutroMunicipio, "Rua de fora, 70");
    await fixarTetoRelativo(orgSerraAlta, 2);

    const r = await autorizar(daVizinha, 1024);

    expect(r.statusCode).toBe(404);

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);

  it("a vistoria continua sincronizando com o teto estourado: o que espera é a foto", async () => {
    /*
      A coleta tem duas partes, e só uma delas pesa. O envelope da vistoria (o
      texto, o checklist, o nome de quem assinou, as duas marcas de tempo) custa
      kilobytes e é o que faz o laudo existir. Recusá-lo por causa do balde de
      fotografias seria transformar um problema de fatura em perda de ato
      administrativo.
    */
    const ocorrencia = await ocorrenciaEmCampo(tokenCoordenador, "Rua da vistoria, 50");
    await fixarTetoRelativo(orgSerraAlta, 2);

    const coletadaEm = new Date().toISOString();
    const r = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
      payload: {
        idempotencyKey: crypto.randomUUID(),
        ocorrenciaId: ocorrencia,
        coletadaEm,
        vistoria: {
          checklist: [
            { chave: "risco_iminente", resposta: true },
            { chave: "evacuacao_necessaria", resposta: true },
            { chave: "interdicao_indicada", resposta: false },
            { chave: "acionar_outro_orgao", resposta: false },
          ],
          fotos: [], gpsPrecisaoMetros: 6.2,
          assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
          coletadaEm, observacoes: "Trinca ativa no talude.",
        },
      },
    });

    expect([200, 201]).toContain(r.statusCode);

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);

  it("o gatilho do banco é a segunda barreira: nem escrita direta passa da margem", async () => {
    /*
      A rota confere antes para poder responder 507 com frase útil. O gatilho
      existe para a regra não morar só na rota: qualquer caminho novo que
      escreva em `evidencias` nasce debaixo do mesmo teto.
    */
    const ocorrencia = await ocorrenciaEmCampo(tokenCoordenador, "Rua do gatilho, 60");
    await fixarTetoRelativo(orgSerraAlta, 2);

    let recusou = false;
    try {
      await mem.banco.comTenant(orgSerraAlta, async (c) => {
        await c.query(
          `INSERT INTO evidencias
             (organizacao_id, ocorrencia_id, chave_storage, capturada_em,
              tipo_conteudo, tamanho_bytes)
           VALUES ($1, $2, 'tenant/' || $1::text || '/ocorrencias/' || $2::text || '/direto.jpg',
                   now(), 'image/jpeg', 1024)`,
          [orgSerraAlta, ocorrencia],
        );
      });
    } catch {
      recusou = true;
    }

    expect(recusou, "escrita direta acima da margem passou pelo banco").toBe(true);

    await fixarTeto(orgSerraAlta, null);
  }, 60_000);
});
