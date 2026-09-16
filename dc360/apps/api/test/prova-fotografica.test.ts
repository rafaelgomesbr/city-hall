import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";

/**
 * A foto é a única peça deste sistema que é prova material do ato.
 *
 * Três defeitos reproduzidos por revisão adversarial, todos aqui:
 *
 * 1. A FOTO JÁ CONFIRMADA PODIA SER TROCADA POR OUTRA, SEM RASTRO. O ramo de
 *    idempotência de `POST /evidencias/autorizar-envio` devolvia 201 com
 *    `jaEnviada: true`, a MESMA `chave_storage` e uma URL DE ESCRITA nova.
 *    Um PUT com bytes diferentes respondia 200. O banco continuava declarando o
 *    `tamanho_bytes` e o `sha256` antigos, `enviada_em` intacto, e a trilha não
 *    registrava nada, porque nada mudou no banco. O laudo reimpresso servia os
 *    bytes NOVOS.
 * 2. ANEXAR EVIDÊNCIA NÃO DEIXAVA EVENTO NA TRILHA, e a tabela não tinha coluna
 *    de autor. O produto registra até quem ABRIU um laudo, e não registrava
 *    quem acrescentou PROVA ao processo. Como a foto entra no documento
 *    oficial, era a escrita mais barata do sistema para introduzir prova num
 *    dossiê alheio sem deixar rastro.
 * 3. A DATA DE CAPTURA ERA DECLARADA PELO CLIENTE SEM LIMITE NENHUM. Foto com
 *    captura em 2019 numa ocorrência aberta hoje era aceita, e o laudo imprimia
 *    "Capturada em 05/01/2019". Data futura passava igual. O campo irmão,
 *    impresso no MESMO documento, tem a restrição `coletada_em_plausivel` desde
 *    a migração 009.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const AGENTE_DIEGO = "11111111-1111-4111-8111-0000000000d3";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
/** Outros bytes, do mesmo tamanho: é o que a substituição de prova usaria. */
const OUTRO_PNG = Buffer.from(PIXEL_PNG);
OUTRO_PNG[OUTRO_PNG.length - 5] = (OUTRO_PNG[OUTRO_PNG.length - 5]! + 1) % 256;

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
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

async function ocorrenciaEmCampo(endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento", descricao: "Talude cedeu na madrugada.",
    },
  });
  const id = criar.json().id;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 24 },
  });
  return id;
}

function autorizar(ocorrenciaId: string, extras: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST", url: "/evidencias/autorizar-envio", headers: com(tokenAgente),
    payload: {
      ocorrenciaId,
      nomeArquivo: "IMG_0001.jpg",
      tipoConteudo: "image/png",
      tamanhoBytes: PIXEL_PNG.length,
      capturadaEm: new Date().toISOString(),
      legenda: "Trinca na parede dos fundos",
      ordem: 0,
      ...extras,
    },
  });
}

function enviarBytes(url: string, cabecalhos: Record<string, string>, corpo = PIXEL_PNG) {
  const alvo = new URL(url);
  return app.inject({
    method: "PUT", url: alvo.pathname + alvo.search,
    headers: { ...cabecalhos, "content-length": String(corpo.length) },
    payload: corpo,
  });
}

function confirmar(evidenciaId: string, sha256?: string) {
  return app.inject({
    method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
    payload: { evidenciaId, ...(sha256 ? { sha256 } : {}) },
  });
}

async function trilha(ocorrenciaId: string): Promise<Array<{
  tipo: string; autor_nome: string; origem: string; detalhe: Record<string, unknown>;
}>> {
  const r = await app.inject({
    method: "GET", url: `/ocorrencias/${ocorrenciaId}`, headers: com(tokenCoordenador),
  });
  return r.json().trilha;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-prova-fotografica-com-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("A foto confirmada não se troca", () => {
  it("repetir a autorização depois do envio não devolve URL de escrita", async () => {
    const id = await ocorrenciaEmCampo("Rua da Prova, 1");
    const chaveIdem = crypto.randomUUID();

    const primeira = (await autorizar(id, { idempotencyKey: chaveIdem })).json();
    await enviarBytes(primeira.url, primeira.cabecalhos);
    expect((await confirmar(primeira.evidenciaId)).statusCode).toBe(200);

    // Semanas depois, o mesmo agente repete o pedido com a MESMA chave.
    const repetida = await autorizar(id, { idempotencyKey: chaveIdem });
    const corpo = repetida.json();

    expect(repetida.statusCode).toBe(201);
    expect(corpo.evidenciaId).toBe(primeira.evidenciaId);
    expect(corpo.chave).toBe(primeira.chave);
    expect(corpo.jaEnviada).toBe(true);
    expect(
      corpo.url,
      "o servidor emitiu autorização de escrita sobre prova já confirmada",
    ).toBeUndefined();
    expect(corpo.cabecalhos).toBeUndefined();
  }, 60_000);

  it("os bytes guardados continuam sendo os que foram confirmados", async () => {
    /*
      A consequência que dá nome ao defeito: o laudo reimpresso serviria os
      bytes novos, com a mesma legenda, o mesmo número de foto e o mesmo
      `sha256` antigo no banco, ou seja, o documento passaria a mostrar uma
      imagem que o registro afirma ser outra.
    */
    const id = await ocorrenciaEmCampo("Rua da Prova, 2");
    const chaveIdem = crypto.randomUUID();

    const primeira = (await autorizar(id, { idempotencyKey: chaveIdem })).json();
    await enviarBytes(primeira.url, primeira.cabecalhos, PIXEL_PNG);
    await confirmar(primeira.evidenciaId);

    const repetida = (await autorizar(id, { idempotencyKey: chaveIdem })).json();
    if (repetida.url) {
      // Se a correção sair, este caminho volta a existir e a troca acontece.
      await enviarBytes(repetida.url, repetida.cabecalhos, OUTRO_PNG);
    }

    const guardado = armazenamento.ler(primeira.chave);
    expect(guardado, "o objeto sumiu do armazenamento").not.toBeNull();
    expect(
      guardado!.corpo.equals(PIXEL_PNG),
      "os bytes da prova foram trocados depois da confirmação",
    ).toBe(true);
  }, 60_000);

  it("antes do envio, reemitir a URL continua funcionando", async () => {
    /*
      A metade que não pode quebrar. A URL pré-assinada vence em minutos e o
      aparelho perde sinal entre autorizar e enviar: pedir de novo é o caso
      comum, não a exceção. O que a correção fecha é só o pedido DEPOIS de a
      foto estar confirmada.
    */
    const id = await ocorrenciaEmCampo("Rua da Prova, 3");
    const chaveIdem = crypto.randomUUID();

    const primeira = (await autorizar(id, { idempotencyKey: chaveIdem })).json();
    const segunda = (await autorizar(id, { idempotencyKey: chaveIdem })).json();

    expect(segunda.evidenciaId).toBe(primeira.evidenciaId);
    expect(segunda.jaEnviada).toBe(false);
    expect(typeof segunda.url).toBe("string");

    // E a URL reemitida serve de verdade: os bytes sobem e a confirmação passa.
    await enviarBytes(segunda.url, segunda.cabecalhos);
    expect((await confirmar(segunda.evidenciaId)).statusCode).toBe(200);
  }, 60_000);
});

describe("Quem anexou a prova", () => {
  it("a confirmação grava evento na trilha, com autor, origem e a soma MEDIDA", async () => {
    const id = await ocorrenciaEmCampo("Rua do Autor, 10");
    const autorizacao = (await autorizar(id)).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);
    /*
      A soma declarada precisa bater com os bytes que chegaram: uma soma
      inventada era aceita e gravada (sessenta e quatro zeros entravam como
      soma da fotografia), e agora é recusada. Ver
      `bytes-confirmados-nao-se-trocam.test.ts`.
    */
    const somaDoPixel = createHash("sha256").update(PIXEL_PNG).digest("hex");
    expect((await confirmar(autorizacao.evidenciaId, somaDoPixel)).statusCode).toBe(200);

    const eventos = (await trilha(id)).filter((e) => e.tipo === "evidencia_anexada");
    expect(eventos, "anexar prova não deixou evento na trilha").toHaveLength(1);
    expect(eventos[0]!.autor_nome).toBe("Diego Nakamura Alves");
    expect(eventos[0]!.origem).toBe("campo");
    expect(eventos[0]!.detalhe["evidenciaId"]).toBe(autorizacao.evidenciaId);
    expect(eventos[0]!.detalhe["sha256"]).toBe(somaDoPixel);
  }, 60_000);

  it("o banco guarda quem anexou, e é o do token", async () => {
    const id = await ocorrenciaEmCampo("Rua do Autor, 11");
    const autorizacao = (await autorizar(id)).json();

    const linha = await mem.bruto.query<{ anexada_por: string | null }>(
      "SELECT anexada_por FROM evidencias WHERE id = $1", [autorizacao.evidenciaId],
    );
    expect(
      linha.rows[0]!.anexada_por,
      "a evidência entrou no banco sem dono",
    ).toBe(AGENTE_DIEGO);
  }, 60_000);

  it("reconfirmar não duplica o evento", async () => {
    /*
      A trilha não tem policy de DELETE: evento repetido não se corrige. E
      reconfirmar acontece de verdade, porque o aparelho pode ter perdido a
      resposta da primeira confirmação.
    */
    const id = await ocorrenciaEmCampo("Rua do Autor, 12");
    const autorizacao = (await autorizar(id)).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);
    await confirmar(autorizacao.evidenciaId);
    await confirmar(autorizacao.evidenciaId);

    const eventos = (await trilha(id)).filter((e) => e.tipo === "evidencia_anexada");
    expect(eventos).toHaveLength(1);
  }, 60_000);

  it("a foto que chega pela sincronização também tem dono", async () => {
    const id = await ocorrenciaEmCampo("Rua do Autor, 13");
    const coletadaEm = new Date().toISOString();
    const r = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
      payload: {
        idempotencyKey: crypto.randomUUID(),
        ocorrenciaId: id,
        coletadaEm,
        vistoria: {
          checklist: [
            { chave: "risco_iminente", resposta: true },
            { chave: "evacuacao_necessaria", resposta: false },
            { chave: "interdicao_indicada", resposta: false },
            { chave: "acionar_outro_orgao", resposta: false },
          ],
          fotos: [{ chave: "foto-do-aparelho.jpg", capturadaEm: coletadaEm }],
          gpsPrecisaoMetros: 5,
          assinanteNome: "Marilda Souza Prado",
          assinaturaChave: null,
          coletadaEm,
        },
      },
    });
    expect(r.statusCode).toBe(201);

    const linha = await mem.bruto.query<{ anexada_por: string | null }>(
      "SELECT anexada_por FROM evidencias WHERE ocorrencia_id = $1", [id],
    );
    expect(linha.rows[0]!.anexada_por).toBe(AGENTE_DIEGO);
  }, 60_000);
});

describe("A data de captura precisa poder ser verdade", () => {
  it("recusa foto datada em 2019 numa ocorrência aberta hoje", async () => {
    const id = await ocorrenciaEmCampo("Rua da Data, 20");
    const r = await autorizar(id, { capturadaEm: "2019-01-05T14:22:00.000Z" });
    expect(r.statusCode, r.body).toBe(422);
  }, 60_000);

  it("recusa data no futuro além da folga de relógio", async () => {
    const id = await ocorrenciaEmCampo("Rua da Data, 21");
    const daquiATresDias = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString();
    const r = await autorizar(id, { capturadaEm: daquiATresDias });
    expect(r.statusCode, r.body).toBe(422);
  }, 60_000);

  it("aceita relógio adiantado dentro da folga de doze horas", async () => {
    /*
      A folga é a mesma da migração 009, e pelo mesmo motivo: relógio trocado e
      fuso errado são rotina em campo, e recusar evidência legítima em dia de
      temporal é pior do que aceitar uma hora imprecisa.
    */
    const id = await ocorrenciaEmCampo("Rua da Data, 22");
    const daquiADuasHoras = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const r = await autorizar(id, { capturadaEm: daquiADuasHoras });
    expect(r.statusCode, r.body).toBe(201);
  }, 60_000);

  it("o banco recusa também, se alguém escrever por fora da rota", async () => {
    /*
      Validação que só existe no formulário não existe. Este INSERT roda como
      DONO das tabelas, que é o caminho de um script de correção rodando à
      meia-noite: ele passa por cima da aplicação inteira, e não passa por cima
      da restrição.
    */
    const id = await ocorrenciaEmCampo("Rua da Data, 23");
    const org = "11111111-1111-4111-8111-000000000001";
    await expect(mem.bruto.query(
      `INSERT INTO evidencias
         (organizacao_id, ocorrencia_id, chave_storage, capturada_em, ordem)
       VALUES ($1, $2, $3, timestamptz '2019-01-05 14:22:00-03', 0)`,
      [org, id, `tenant/${org}/ocorrencias/${id}/antiga.jpg`],
    )).rejects.toThrow(/capturada_em_plausivel/);
  }, 60_000);
});
