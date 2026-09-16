import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * Ocorrência encerrada não recebe ato novo. Recebe cópia.
 *
 * O que o revisor de integridade provou contra a API real: uma ocorrência
 * `encerrada` continuava aceitando o termo de interdição como ATO (interditava
 * uma casa dentro de um processo fechado), o levantamento da interdição e a
 * emissão de documento, enquanto a correção de coordenada já recusava
 * `estadoTerminal` com 409. O estado terminal era terminal só para uma rota.
 *
 * A linha que este arquivo traça é a diferença entre ATO e CÓPIA:
 *
 * - Interditar e levantar interdição são atos administrativos: mudam o estado
 *   do imóvel e entram na trilha como fato novo. Encerrada não os aceita.
 * - Reimprimir um documento já emitido não é ato: o laudo, a segunda via do
 *   termo e o termo de desinterdição continuam saindo depois do encerramento,
 *   porque o processo pede cópia e a família precisa do papel.
 *
 * Mais dois portões que moram aqui porque cabem no mesmo cenário:
 *
 * - O encerramento com interdição ativa é RECUSADO (409 `interdicao_ativa`),
 *   decisão de produto de 15/09/2026: encerrada não recebe ato, então a
 *   interdição precisa ser levantada ANTES, senão a família fica fora de casa
 *   num processo que ninguém mais abre. O campo `interdicaoAtiva` da resposta
 *   e do evento continua existindo (sempre falso no encerramento que passa).
 * - Duas abas encerrando ao mesmo tempo produzem UM encerramento. A leitura
 *   do status trava a linha e o UPDATE confere o estado de partida; a trilha
 *   é append-only e um segundo `encerramento` seria mentira gravada.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const MOTIVO_DO_LEVANTAMENTO =
  "Contenção do talude executada pela Secretaria de Obras e conferida em nova "
  + "vistoria técnica. Sem trincas ativas.";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAgente: string;
let tokenCoordenador: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function comVistoria(endereco: string): Promise<{ id: string; protocolo: string }> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
      coordenada: { lat: -22.4187, lng: -45.4523 },
    },
  });
  const { id, protocolo } = criar.json();

  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: { severidade: "critica", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });

  const coletadaEm = new Date().toISOString();
  const s = await app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId: id,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: true },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [], gpsPrecisaoMetros: 6.2,
        assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
        coletadaEm, observacoes: "Vistoria realizada com a moradora presente.",
      },
    },
  });
  if (s.statusCode !== 201) throw new Error(`sincronizacao falhou: ${s.body}`);
  return { id, protocolo };
}

function termoDeInterdicao(id: string) {
  return app.inject({
    method: "GET", url: `/documentos/${id}/termo-de-interdicao`, headers: com(tokenCoordenador),
  });
}

function levantar(id: string) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${id}/desinterdicao`,
    headers: com(tokenCoordenador), payload: { motivo: MOTIVO_DO_LEVANTAMENTO },
  });
}

function encerrar(id: string) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${id}/encerramento`,
    headers: com(tokenCoordenador), payload: { motivo: "Atendimento concluído." },
  });
}

async function trilha(id: string): Promise<Array<{ tipo: string; detalhe: Record<string, unknown> }>> {
  const r = await app.inject({
    method: "GET", url: `/ocorrencias/${id}`, headers: com(tokenCoordenador),
  });
  return r.json().trilha;
}

function interditados() {
  return app.inject({ method: "GET", url: "/ocorrencias/interditados", headers: com(tokenCoordenador) });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-encerrada-nao-recebe-ato-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Encerrada não recebe ato", () => {
  it("o termo de interdição NÃO interdita uma ocorrência encerrada", async () => {
    const alvo = await comVistoria("Rua do Processo Fechado, 1");
    expect((await encerrar(alvo.id)).statusCode).toBe(200);

    const r = await termoDeInterdicao(alvo.id);
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("ocorrencia_encerrada");

    // E o imóvel não entrou na lista: a recusa não pode ter efeito colateral.
    const lista = await interditados();
    expect(lista.json().itens.some((i: { id: string }) => i.id === alvo.id)).toBe(false);
    expect((await trilha(alvo.id)).some((e) => e.tipo === "documento_emitido")).toBe(false);
  });

  it("o levantamento da interdição NÃO entra numa ocorrência encerrada", async () => {
    const alvo = await comVistoria("Rua do Processo Fechado, 2");
    expect((await termoDeInterdicao(alvo.id)).statusCode).toBe(200);
    /*
      Encerrada COM interdição ativa só existe como dado de antes de
      15/09/2026: a rota passou a recusar esse encerramento. O estado é
      gravado por fora, como dono das tabelas, para o portão continuar
      valendo sobre o que já está no banco.
    */
    await mem.bruto.query(
      `UPDATE ocorrencias SET status = 'encerrada', encerrado_em = now(),
              motivo_encerramento = 'Encerrada antes da regra, com a casa interditada.'
        WHERE id = $1`,
      [alvo.id],
    );

    const r = await levantar(alvo.id);
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("ocorrencia_encerrada");

    // Continua interditada, e a trilha não ganhou levantamento.
    const lista = await interditados();
    expect(lista.json().itens.some((i: { id: string }) => i.id === alvo.id)).toBe(true);
    expect((await trilha(alvo.id)).some((e) => e.tipo === "desinterdicao")).toBe(false);
  });
});

describe("Encerrada recebe cópia", () => {
  it("o laudo continua saindo: documentar a vistoria não é ato", async () => {
    const alvo = await comVistoria("Rua da Cópia, 1");
    expect((await encerrar(alvo.id)).statusCode).toBe(200);

    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("a segunda via do termo de interdição continua saindo depois do encerramento", async () => {
    const alvo = await comVistoria("Rua da Cópia, 2");
    expect((await termoDeInterdicao(alvo.id)).statusCode).toBe(200);
    const antes = (await interditados()).json()
      .itens.find((i: { id: string }) => i.id === alvo.id).interditada_em;
    // Levantada antes de encerrar: é a única ordem que a rota aceita agora.
    expect((await levantar(alvo.id)).statusCode).toBe(200);
    expect((await encerrar(alvo.id)).statusCode).toBe(200);

    const r = await termoDeInterdicao(alvo.id);
    expect(r.statusCode, r.body).toBe(200);

    // Segunda via: a data da interdição não se move.
    const depois = await mem.bruto.query<{ interditada_em: string | Date }>(
      "SELECT interditada_em FROM ocorrencias WHERE id = $1", [alvo.id],
    );
    expect(new Date(depois.rows[0]!.interditada_em).toISOString()).toBe(new Date(antes).toISOString());
  });

  it("o termo de desinterdição continua saindo depois do encerramento", async () => {
    const alvo = await comVistoria("Rua da Cópia, 3");
    expect((await termoDeInterdicao(alvo.id)).statusCode).toBe(200);
    expect((await levantar(alvo.id)).statusCode).toBe(200);
    expect((await encerrar(alvo.id)).statusCode).toBe(200);

    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-desinterdicao`,
      headers: com(tokenCoordenador),
    });
    expect(r.statusCode, r.body).toBe(200);
  });
});

describe("Encerrar com interdição ativa", () => {
  it("é recusado com 409 interdicao_ativa, e nada muda: a interdição é levantada ANTES", async () => {
    const alvo = await comVistoria("Rua da Interdição Esquecida, 1");
    expect((await termoDeInterdicao(alvo.id)).statusCode).toBe(200);

    /*
      Decisão de produto (15/09/2026): encerrada não recebe ato, e levantar a
      interdição é ato. Encerrar com a casa interditada fechava o processo com
      uma família fora de casa e ninguém obrigado a levantar a interdição um
      dia. O aviso na resposta virou recusa nomeada, e o painel mostra a razão
      no próprio botão.
    */
    const r = await encerrar(alvo.id);
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("interdicao_ativa");
    expect(r.json().mensagem).toMatch(/levante a interdição/i);

    // Continua em campo, interditada, e a trilha não ganhou encerramento.
    const estado = await mem.bruto.query<{ status: string }>(
      "SELECT status FROM ocorrencias WHERE id = $1", [alvo.id],
    );
    expect(estado.rows[0]!.status).not.toBe("encerrada");
    expect((await interditados()).json().itens.some((i: { id: string }) => i.id === alvo.id)).toBe(true);
    expect((await trilha(alvo.id)).some((e) => e.tipo === "encerramento")).toBe(false);

    // Levantada, o encerramento passa, e o campo diz que não havia interdição ativa.
    expect((await levantar(alvo.id)).statusCode).toBe(200);
    const depois = await encerrar(alvo.id);
    expect(depois.statusCode, depois.body).toBe(200);
    expect(depois.json().interdicaoAtiva).toBe(false);
  });

  it("não avisa quando a interdição já foi levantada", async () => {
    const alvo = await comVistoria("Rua da Interdição Esquecida, 2");
    expect((await termoDeInterdicao(alvo.id)).statusCode).toBe(200);
    expect((await levantar(alvo.id)).statusCode).toBe(200);

    const r = await encerrar(alvo.id);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().interdicaoAtiva).toBe(false);
    const evento = (await trilha(alvo.id)).find((e) => e.tipo === "encerramento");
    expect(evento!.detalhe.interdicaoAtiva).toBe(false);
  });

  it("não avisa quando nunca houve interdição", async () => {
    const alvo = await comVistoria("Rua da Interdição Esquecida, 3");
    const r = await encerrar(alvo.id);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().interdicaoAtiva).toBe(false);
  });
});

describe("Duas abas encerrando ao mesmo tempo", () => {
  it("gravam UM encerramento, e a outra recebe 409", async () => {
    /*
      O banco em memória tem uma conexão só e serializa as transações, então
      esta corrida não consegue interlear a leitura de uma aba com a escrita da
      outra: o que ela prova é o clique duplo, e não a corrida de verdade
      entre dois processos no Postgres. A defesa contra a corrida (leitura com
      `FOR UPDATE` e UPDATE condicionado ao status de partida) está na rota, e
      a prova dela ficou por conta da serialização do PGlite.
    */
    const alvo = await comVistoria("Rua das Duas Abas, 1");
    const [a, b] = await Promise.all([encerrar(alvo.id), encerrar(alvo.id)]);
    const codigos = [a.statusCode, b.statusCode].sort();
    expect(codigos).toEqual([200, 409]);

    const eventos = (await trilha(alvo.id)).filter((e) => e.tipo === "encerramento");
    expect(eventos).toHaveLength(1);
  });
});
