import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { consoleEmMemoria, type ConsoleEmMemoria } from "../src/banco-em-memoria.js";
import { abrirCofre, contextoDoOperador } from "../src/operadores.js";
import type { LeituraDoConsole } from "../src/banco.js";
import type { Config } from "../src/config.js";
import { derivarSenha } from "../../api/src/auth/senha.js";
import { gerarSegredoTotp } from "../../api/src/auth/totp.js";

/**
 * O ID DE REQUISIÇÃO no console (V2-F01-E14): a mesma regra da API. Toda resposta
 * devolve `X-Request-Id`; o de entrada só vale se for UUID; o 500 repete o id no
 * corpo como código de suporte e nunca a mensagem do erro.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID_DO_CLIENTE = "3f2b8c1e-5a47-4d0e-9b61-7c2d4e8f1a90";
const CHAVE = randomBytes(32).toString("base64");
const cofre = abrirCofre(CHAVE);
const EMAIL = "dono@fornecedor.exemplo.com";

let mem: ConsoleEmMemoria;
let app: FastifyInstance;
let quebrado = false;
let linhas: string[] = [];

beforeAll(async () => {
  mem = await consoleEmMemoria();
  const config: Config = {
    NODE_ENV: "test",
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_OPERADORES: JSON.stringify([{
      email: EMAIL,
      senha: await derivarSenha("senha-de-teste-bem-longa"),
      segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador(EMAIL)),
    }]),
  };
  // Leitura que passa a falhar quando o teste manda, como um banco que cai.
  const leitura: LeituraDoConsole = {
    ...mem.banco,
    ler: ((...argumentos: Parameters<LeituraDoConsole["ler"]>) => (
      quebrado
        ? Promise.reject(new Error("relation \"operadores\" does not exist para dono@fornecedor.exemplo.com"))
        : mem.banco.ler(...argumentos)
    )) as LeituraDoConsole["ler"],
  };
  app = await construirConsole({
    config, leitura, escrita: mem.banco, destinoDeLog: { write: (l: string) => { linhas.push(l); } },
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("X-Request-Id no console", () => {
  it("sem cabeçalho, a resposta traz um UUID novo; com UUID válido, o console o adota", async () => {
    const a = await app.inject({ method: "GET", url: "/saude" });
    const b = await app.inject({ method: "GET", url: "/saude", headers: { "x-request-id": ID_DO_CLIENTE } });
    expect(a.headers["x-request-id"]).toMatch(UUID);
    expect(b.headers["x-request-id"]).toBe(ID_DO_CLIENTE);
  });

  it("negativo: id com quebra de linha ou de 200 caracteres é descartado", async () => {
    for (const hostil of [`${ID_DO_CLIENTE}\nX-Falso: 1`, "x".repeat(200), "nao-e-uuid"]) {
      linhas = [];
      const r = await app.inject({ method: "GET", url: "/saude", headers: { "x-request-id": hostil } });
      expect(r.headers["x-request-id"], JSON.stringify(hostil)).toMatch(UUID);
      expect(r.headers["x-request-id"]).not.toBe(hostil);
      expect(linhas.join("\n")).not.toContain("x".repeat(50));
    }
  });

  it("recusas 401 e 404 também devolvem o id", async () => {
    const semSessao = await app.inject({ method: "GET", url: "/municipios" });
    expect(semSessao.statusCode).toBe(401);
    expect(semSessao.headers["x-request-id"]).toMatch(UUID);
    const inexistente = await app.inject({ method: "GET", url: "/nao-existe" });
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.headers["x-request-id"]).toMatch(UUID);
  });

  it("o 500 repete o id no corpo, não vaza a mensagem do banco, e o log leva o mesmo id", async () => {
    quebrado = true;
    linhas = [];
    try {
      const r = await app.inject({
        method: "POST", url: "/entrar",
        payload: { email: EMAIL, senha: "senha-de-teste-bem-longa" },
        headers: { "x-request-id": ID_DO_CLIENTE },
      });
      expect(r.statusCode).toBe(500);
      expect(r.headers["x-request-id"]).toBe(ID_DO_CLIENTE);
      expect(r.json()).toEqual({ erro: "falha_interna", requisicao: ID_DO_CLIENTE });
      expect(r.body).not.toContain("operadores");
      const falha = linhas.map((l) => JSON.parse(l) as Record<string, unknown>)
        .find((x) => x["msg"] === "falha no console");
      expect(falha?.["level"]).toBe(50);
      expect(falha?.["requisicao"]).toBe(ID_DO_CLIENTE);
    } finally {
      quebrado = false;
    }
  });
});
