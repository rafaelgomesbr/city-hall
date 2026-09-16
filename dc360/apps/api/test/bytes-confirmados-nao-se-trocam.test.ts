import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";
import { armazenamentoS3 } from "../src/armazenamento/s3.js";

/**
 * Os bytes de uma fotografia confirmada não se trocam, e o hash gravado é o
 * que o SERVIDOR mediu.
 *
 * Dois achados de uma revisão de integridade da prova, provados por sondagem:
 *
 * - A URL de escrita continuava válida DEPOIS da confirmação (quinze minutos
 *   de vida, e a confirmação acontece no primeiro), então um PUT posterior com
 *   bytes diferentes respondia 200 e a prova trocava de conteúdo com o mesmo
 *   `enviada_em`, o mesmo tamanho e nenhum evento novo.
 * - `sha256` era palavra do cliente: a confirmação gravava o que viesse no
 *   corpo, sem medir nada. Sessenta e quatro zeros entravam no banco e na
 *   trilha como se fossem a soma da fotografia.
 *
 * O que fecha a janela: o objeto é ESCRITO UMA VEZ SÓ (a autorização de
 * escrita carrega `if-none-match: *`, que o armazenamento confere), e a
 * confirmação lê os bytes que chegaram e grava a soma que ela própria calculou.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
/** Outro PNG de um pixel, do mesmo tamanho, com bytes diferentes. */
const OUTRO_PNG = Buffer.from(PIXEL_PNG);
OUTRO_PNG[OUTRO_PNG.length - 8] ^= 0xff;

const SHA_DO_PIXEL = createHash("sha256").update(PIXEL_PNG).digest("hex");

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

async function autorizar(ocorrenciaId: string, extras: Record<string, unknown> = {}) {
  const r = await app.inject({
    method: "POST", url: "/evidencias/autorizar-envio", headers: com(tokenAgente),
    payload: {
      ocorrenciaId, nomeArquivo: "IMG_0001.jpg", tipoConteudo: "image/png",
      tamanhoBytes: PIXEL_PNG.length, capturadaEm: new Date().toISOString(),
      legenda: "Trinca na parede dos fundos", ordem: 0, ...extras,
    },
  });
  if (r.statusCode !== 201) throw new Error(`autorização falhou: ${r.body}`);
  return r.json() as {
    evidenciaId: string; chave: string; jaEnviada: boolean;
    url?: string; cabecalhos?: Record<string, string>;
  };
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

async function linha(evidenciaId: string) {
  const r = await mem.bruto.query<{ sha256: string | null; enviada_em: string | null }>(
    "SELECT sha256, enviada_em FROM evidencias WHERE id = $1", [evidenciaId],
  );
  return r.rows[0]!;
}

async function eventosDeAnexo(ocorrenciaId: string) {
  const r = await mem.bruto.query<{ detalhe: Record<string, unknown> }>(
    "SELECT detalhe FROM trilha_eventos WHERE ocorrencia_id = $1 AND tipo = 'evidencia_anexada'",
    [ocorrenciaId],
  );
  return r.rows;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-dos-bytes-confirmados-com-mais-de-32-bytes",
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

describe("A janela de escrita fecha quando os bytes chegam", () => {
  it("o PUT repetido pela mesma URL, depois da confirmação, é recusado e os bytes ficam", async () => {
    const id = await ocorrenciaEmCampo("Rua da Janela, 1");
    const autorizacao = await autorizar(id);
    expect((await enviarBytes(autorizacao.url!, autorizacao.cabecalhos!)).statusCode).toBe(200);
    expect((await confirmar(autorizacao.evidenciaId)).statusCode).toBe(200);

    // A sondagem: a URL ainda está dentro da validade, e os bytes são outros.
    const troca = await enviarBytes(autorizacao.url!, autorizacao.cabecalhos!, OUTRO_PNG);
    expect(troca.statusCode, troca.body).toBe(412);

    const guardado = armazenamento.ler(autorizacao.chave);
    expect(
      guardado!.corpo.equals(PIXEL_PNG),
      "os bytes da prova foram trocados depois da confirmação",
    ).toBe(true);
  }, 60_000);

  it("o PUT repetido ANTES da confirmação também não sobrescreve: o objeto é escrito uma vez", async () => {
    const id = await ocorrenciaEmCampo("Rua da Janela, 2");
    const autorizacao = await autorizar(id);
    expect((await enviarBytes(autorizacao.url!, autorizacao.cabecalhos!)).statusCode).toBe(200);

    const troca = await enviarBytes(autorizacao.url!, autorizacao.cabecalhos!, OUTRO_PNG);
    expect(troca.statusCode).toBe(412);
    expect(armazenamento.ler(autorizacao.chave)!.corpo.equals(PIXEL_PNG)).toBe(true);
  }, 60_000);

  it("a autorização de escrita para o S3 assina `if-none-match: *`, e o aparelho o repete", async () => {
    const s3 = armazenamentoS3({
      endpoint: "https://conta.r2.cloudflarestorage.com",
      balde: "dc360",
      regiao: "auto",
      credenciais: { accessKeyId: "AKIA", secretAccessKey: "segredo" },
      agora: () => new Date("2026-09-15T10:00:00.000Z"),
    });
    const envio = await s3.urlParaEnviar({
      chave: "tenant/x/ocorrencias/y/foto.jpg", tipoConteudo: "image/jpeg", tamanhoBytes: 1024,
    });
    // Entra nos cabeçalhos que o aparelho é obrigado a repetir...
    expect(envio.cabecalhos["if-none-match"]).toBe("*");
    // ...e na assinatura, senão o armazenamento não o exige.
    const url = new URL(envio.url);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host;if-none-match",
    );
  });
});

describe("O hash é o que o servidor mediu", () => {
  it("sem hash no corpo, a confirmação grava a soma dos bytes que chegaram", async () => {
    const id = await ocorrenciaEmCampo("Rua do Hash, 3");
    const autorizacao = await autorizar(id);
    await enviarBytes(autorizacao.url!, autorizacao.cabecalhos!);
    expect((await confirmar(autorizacao.evidenciaId)).statusCode).toBe(200);

    expect((await linha(autorizacao.evidenciaId)).sha256).toBe(SHA_DO_PIXEL);
    const eventos = await eventosDeAnexo(id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.detalhe["sha256"]).toBe(SHA_DO_PIXEL);
  }, 60_000);

  it("sessenta e quatro zeros não entram: hash declarado que não bate é recusado", async () => {
    const id = await ocorrenciaEmCampo("Rua do Hash, 4");
    const autorizacao = await autorizar(id);
    await enviarBytes(autorizacao.url!, autorizacao.cabecalhos!);

    const r = await confirmar(autorizacao.evidenciaId, "0".repeat(64));
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("hash_divergente");

    const depois = await linha(autorizacao.evidenciaId);
    expect(depois.enviada_em, "confirmou com hash que não bate").toBeNull();
    expect(depois.sha256, "gravou hash não conferido").toBeNull();
    expect(await eventosDeAnexo(id)).toHaveLength(0);
  }, 60_000);

  it("hash declarado que bate é aceito, e o gravado continua sendo o medido", async () => {
    const id = await ocorrenciaEmCampo("Rua do Hash, 5");
    const autorizacao = await autorizar(id);
    await enviarBytes(autorizacao.url!, autorizacao.cabecalhos!);

    expect((await confirmar(autorizacao.evidenciaId, SHA_DO_PIXEL)).statusCode).toBe(200);
    expect((await linha(autorizacao.evidenciaId)).sha256).toBe(SHA_DO_PIXEL);
  }, 60_000);
});

describe("O reenvio depois de perder a resposta do PUT não morre na fila", () => {
  it("reautorizar com os bytes já no armazenamento confirma no servidor e responde jaEnviada", async () => {
    /*
      Escrito uma vez, o objeto recusaria o segundo PUT com 412, e o aparelho
      trata 412 como falha permanente: a coleta ficaria bloqueada por um
      reenvio de rotina (a resposta do primeiro PUT se perdeu no 3G). Então é o
      servidor que fecha o ciclo: ao reautorizar a mesma chave, ele descobre
      que os bytes já chegaram, confirma, e responde como responde para foto
      já enviada, que o aparelho já sabe pular.
    */
    const id = await ocorrenciaEmCampo("Rua do Reenvio, 6");
    const chaveIdem = crypto.randomUUID();
    const primeira = await autorizar(id, { idempotencyKey: chaveIdem });
    expect((await enviarBytes(primeira.url!, primeira.cabecalhos!)).statusCode).toBe(200);
    // A confirmação nunca chega: o aparelho perdeu a resposta do PUT.

    const segunda = await autorizar(id, { idempotencyKey: chaveIdem });
    expect(segunda.evidenciaId).toBe(primeira.evidenciaId);
    expect(segunda.jaEnviada).toBe(true);
    expect(segunda.url).toBeUndefined();

    const depois = await linha(primeira.evidenciaId);
    expect(depois.enviada_em).not.toBeNull();
    expect(depois.sha256).toBe(SHA_DO_PIXEL);
    expect(await eventosDeAnexo(id)).toHaveLength(1);
  }, 60_000);

  it("antes de os bytes chegarem, reautorizar continua devolvendo URL de escrita", async () => {
    const id = await ocorrenciaEmCampo("Rua do Reenvio, 7");
    const chaveIdem = crypto.randomUUID();
    const primeira = await autorizar(id, { idempotencyKey: chaveIdem });
    const segunda = await autorizar(id, { idempotencyKey: chaveIdem });

    expect(segunda.evidenciaId).toBe(primeira.evidenciaId);
    expect(segunda.jaEnviada).toBe(false);
    expect(typeof segunda.url).toBe("string");
    expect((await enviarBytes(segunda.url!, segunda.cabecalhos!)).statusCode).toBe(200);
    expect((await confirmar(segunda.evidenciaId)).statusCode).toBe(200);
  }, 60_000);
});
