import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";

/**
 * O preflight do PUT de evidência, como o navegador o faz.
 *
 * O painel e o aparelho mandam os bytes da foto direto para a URL assinada,
 * repetindo os cabeçalhos que a autorização devolveu. Um deles é
 * `if-none-match: *` (escrita única, o mesmo do adaptador S3). O navegador
 * pergunta antes, num OPTIONS, se pode mandar esse cabeçalho; se a resposta não
 * o lista em `access-control-allow-headers`, o PUT nem sai e o que aparece na
 * tela é um "Failed to fetch" sem explicação. Foi exatamente isso que deixou a
 * seção 13 do e2e contra a API vermelha por meses (REL:01, V2-F00-E18).
 *
 * O conserto é estreito de propósito, e estes testes travam os dois lados:
 * o cabeçalho nominal passa, mas origem fora da lista continua sem
 * `access-control-allow-origin` e cabeçalho qualquer continua fora.
 */

const ORIGEM_DO_PAINEL = "http://localhost:4691";
const ORIGEM_ESTRANHA = "http://painel-falso.exemplo";
const MUNICIPIO_A = "aaaaaaaa-0000-4000-8000-0000000000a1";
const MUNICIPIO_B = "bbbbbbbb-0000-4000-8000-0000000000b2";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
// Relógio controlado: a URL vencida se prova andando o tempo, e não esperando.
const relogio = { valor: new Date("2026-10-07T12:00:00.000Z") };

function caminho(url: string): string {
  const alvo = new URL(url);
  return alvo.pathname + alvo.search;
}

async function autorizarEnvio(chave: string) {
  return armazenamento.urlParaEnviar({
    chave, tipoConteudo: "image/png", tamanhoBytes: PIXEL_PNG.length,
  });
}

function preflight(url: string, origem: string, cabecalhos: string) {
  return app.inject({
    method: "OPTIONS",
    url: caminho(url),
    headers: {
      origin: origem,
      "access-control-request-method": "PUT",
      "access-control-request-headers": cabecalhos,
    },
  });
}

/** Os nomes que a resposta do preflight libera, em minúsculas. */
function liberados(cabecalho: string | string[] | number | undefined): string[] {
  return String(cabecalho ?? "").split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
}

function enviar(url: string, cabecalhos: Record<string, string>) {
  return app.inject({
    method: "PUT",
    url: caminho(url),
    headers: { ...cabecalhos, "content-length": String(PIXEL_PNG.length), origin: ORIGEM_DO_PAINEL },
    payload: PIXEL_PNG,
  });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-cors-de-evidencia-com-mais-de-32-bytes",
    ORIGENS_PERMITIDAS: ORIGEM_DO_PAINEL,
  } as NodeJS.ProcessEnv);
  armazenamento = armazenamentoEmMemoria({
    baseUrl: "http://api.local",
    segundosEnvio: 60,
    agora: () => relogio.valor,
  });
  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Preflight do PUT de envio", () => {
  it("libera if-none-match para a origem do painel, que é o cabeçalho assinado do envio", async () => {
    const envio = await autorizarEnvio(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-1.png`);
    // O cabeçalho que a autorização devolve é o que o navegador vai perguntar.
    expect(envio.cabecalhos["if-none-match"]).toBe("*");

    const r = await preflight(envio.url, ORIGEM_DO_PAINEL, "content-type,if-none-match");

    expect(r.statusCode).toBe(204);
    expect(r.headers["access-control-allow-origin"]).toBe(ORIGEM_DO_PAINEL);
    expect(liberados(r.headers["access-control-allow-methods"])).toContain("put");
    const cabecalhos = liberados(r.headers["access-control-allow-headers"]);
    expect(cabecalhos).toContain("if-none-match");
    expect(cabecalhos).toContain("content-type");
  });

  it("todo cabeçalho que a autorização manda repetir passa no preflight (menos os que o navegador mesmo põe)", async () => {
    const envio = await autorizarEnvio(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-2.png`);
    const r = await preflight(envio.url, ORIGEM_DO_PAINEL, "content-type,if-none-match");
    const cabecalhos = liberados(r.headers["access-control-allow-headers"]);

    // `content-length` é cabeçalho proibido no fetch: o navegador o calcula
    // sozinho e nunca o pergunta no preflight. Qualquer outro que a assinatura
    // passar a exigir e que esquecerem de liberar quebra aqui, e não no e2e.
    const repetidos = Object.keys(envio.cabecalhos)
      .map((c) => c.toLowerCase())
      .filter((c) => c !== "content-length");
    for (const nome of repetidos) expect(cabecalhos, nome).toContain(nome);
  });

  it("origem fora da lista não recebe access-control-allow-origin", async () => {
    const envio = await autorizarEnvio(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-3.png`);
    const r = await preflight(envio.url, ORIGEM_ESTRANHA, "content-type,if-none-match");

    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
    // E sem curinga escondido em lugar nenhum da resposta.
    expect(String(r.headers["access-control-allow-headers"] ?? "")).not.toContain("*");
  });

  it("cabeçalho qualquer fora da lista não é liberado", async () => {
    const envio = await autorizarEnvio(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-4.png`);
    const r = await preflight(envio.url, ORIGEM_DO_PAINEL, "content-type,if-none-match,x-qualquer");
    const cabecalhos = liberados(r.headers["access-control-allow-headers"]);

    // A lista é fixa: o servidor não ecoa o que o navegador pediu. Quem recusa
    // o PUT é o navegador, ao não achar `x-qualquer` aqui.
    expect(cabecalhos).not.toContain("x-qualquer");
    expect(cabecalhos).not.toContain("*");
    expect(cabecalhos.sort()).toEqual(
      // `x-app-version` entrou na V2-F02-E06: o aplicativo e o painel informam a versão.
      ["accept", "authorization", "content-type", "if-none-match", "x-app-version"].sort(),
    );
  });
});

describe("O PUT continua guardado pela assinatura", () => {
  it("o primeiro PUT grava, e um segundo para a mesma chave é recusado (escrita única)", async () => {
    const envio = await autorizarEnvio(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-5.png`);

    const primeiro = await enviar(envio.url, envio.cabecalhos);
    expect(primeiro.statusCode, primeiro.body).toBe(200);
    // A resposta de verdade (e não só o preflight) também traz a origem, senão
    // o navegador recebe o 200 e esconde o status do código da página.
    expect(primeiro.headers["access-control-allow-origin"]).toBe(ORIGEM_DO_PAINEL);

    const segundo = await enviar(envio.url, envio.cabecalhos);
    expect(segundo.statusCode).toBe(412);
    expect(segundo.json().erro).toBe("objeto_ja_existe");
  });

  it("URL de envio vencida é recusada", async () => {
    const envio = await autorizarEnvio(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-6.png`);
    const antes = relogio.valor;
    relogio.valor = new Date(antes.getTime() + 61_000);
    try {
      const r = await enviar(envio.url, envio.cabecalhos);
      expect(r.statusCode).toBe(403);
      expect(r.json().mensagem).toBe("URL expirada");
    } finally {
      relogio.valor = antes;
    }
    expect(armazenamento.ler(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-6.png`)).toBeNull();
  });

  it("assinatura trocada é recusada", async () => {
    const envio = await autorizarEnvio(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-7.png`);
    const alvo = new URL(envio.url);
    alvo.searchParams.set("assinatura", "x".repeat(43));

    const r = await enviar(alvo.toString(), envio.cabecalhos);
    expect(r.statusCode).toBe(403);
    expect(r.json().mensagem).toBe("assinatura inválida");
    expect(armazenamento.ler(`tenant/${MUNICIPIO_A}/ocorrencias/x/foto-7.png`)).toBeNull();
  });

  it("URL assinada para a chave de um município não grava na chave de outro", async () => {
    const chaveDeA = `tenant/${MUNICIPIO_A}/ocorrencias/x/foto-8.png`;
    const chaveDeB = `tenant/${MUNICIPIO_B}/ocorrencias/x/foto-8.png`;
    const envio = await autorizarEnvio(chaveDeA);
    const alvo = new URL(envio.url);
    alvo.searchParams.set("chave", chaveDeB);

    const r = await enviar(alvo.toString(), envio.cabecalhos);
    expect(r.statusCode).toBe(403);
    expect(armazenamento.ler(chaveDeB)).toBeNull();
    expect(armazenamento.ler(chaveDeA)).toBeNull();
  });
});
