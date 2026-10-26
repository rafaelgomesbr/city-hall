import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";

/**
 * O CORS nas respostas que o próprio Fastify escreve antes de qualquer rota
 * (`frameworkErrors`: 400 `url_invalida` e 414 `parametro_longo_demais`).
 *
 * Os hooks e plugins de rota não rodam nessa fase, então a regra do
 * `@fastify/cors` não se aplicava a elas: o painel, numa origem permitida, não
 * conseguia ler o corpo e mostrava "sem conexão" em vez da mensagem do
 * catálogo. A regra é a MESMA das demais respostas: origem na lista recebe o
 * cabeçalho, origem fora dela não recebe, e nada é afrouxado.
 */

const ORIGEM_DO_PAINEL = "http://localhost:4691";
const ORIGEM_ESTRANHA = "http://painel-falso.exemplo";
const URL_MALFORMADA = "/ocorrencias/%E0%A4%A";
const URL_COM_PARAMETRO_LONGO = `/ocorrencias/${"a".repeat(150)}`;

let mem: BancoEmMemoria;
let app: FastifyInstance;

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-cors-dos-erros-do-fastify-com-mais-de-32-bytes",
    ORIGENS_PERMITIDAS: ORIGEM_DO_PAINEL,
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local", segundosEnvio: 60 }),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

const CASOS = [
  {
    nome: "endereço malformado (400 url_invalida)",
    url: URL_MALFORMADA,
    status: 400,
    erro: "url_invalida",
  },
  {
    nome: "parâmetro de 150 caracteres (414 parametro_longo_demais)",
    url: URL_COM_PARAMETRO_LONGO,
    status: 414,
    erro: "parametro_longo_demais",
  },
];

describe.each(CASOS)("$nome", ({ url, status, erro }) => {
  it("origem permitida recebe o cabeçalho e pode ler o corpo", async () => {
    for (const prefixo of ["", "/v1"]) {
      const r = await app.inject({
        method: "GET",
        url: `${prefixo}${url}`,
        headers: { origin: ORIGEM_DO_PAINEL },
      });
      expect(r.statusCode, r.body).toBe(status);
      expect(r.json().erro).toBe(erro);
      expect(r.headers["access-control-allow-origin"]).toBe(ORIGEM_DO_PAINEL);
      expect(r.headers["access-control-allow-credentials"]).toBe("true");
      expect(String(r.headers["access-control-expose-headers"]).toLowerCase()).toContain(
        "x-request-id",
      );
      expect(String(r.headers["vary"]).toLowerCase()).toContain("origin");
    }
  });

  it("origem fora da lista não recebe o cabeçalho", async () => {
    const r = await app.inject({ method: "GET", url, headers: { origin: ORIGEM_ESTRANHA } });
    expect(r.statusCode, r.body).toBe(status);
    expect(r.json().erro).toBe(erro);
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
    expect(r.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("sem origem (curl, aplicativo) não ganha cabeçalho de CORS", async () => {
    const r = await app.inject({ method: "GET", url });
    expect(r.statusCode, r.body).toBe(status);
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("o corpo e os demais cabeçalhos continuam os de antes", async () => {
    const r = await app.inject({ method: "GET", url, headers: { origin: ORIGEM_DO_PAINEL } });
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-request-id"]).toBeTruthy();
  });
});
