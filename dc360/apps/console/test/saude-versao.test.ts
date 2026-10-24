import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { consoleEmMemoria, type ConsoleEmMemoria } from "../src/banco-em-memoria.js";
import { abrirCofre, contextoDoOperador } from "../src/operadores.js";
import type { Config } from "../src/config.js";
import { derivarSenha } from "../../api/src/auth/senha.js";
import { gerarSegredoTotp } from "../../api/src/auth/totp.js";

/**
 * `/saude` do console diz qual imagem está de pé (V2-F01-E08), com os mesmos dois
 * campos da API (`versao`, `commit`) e a mesma regra: a rota é pública, então só
 * sai valor com formato de versão e de commit, e fora de uma imagem a resposta é
 * `desconhecida` / `desconhecido`. O console segue sem trazer número nenhum de
 * município nesta rota.
 */

const CHAVE = randomBytes(32).toString("base64");
const cofre = abrirCofre(CHAVE);
const EMAIL = "dono@fornecedor.exemplo.com";

let mem: ConsoleEmMemoria;
const abertos: FastifyInstance[] = [];

async function subir(): Promise<FastifyInstance> {
  const config: Config = {
    NODE_ENV: "test",
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    // A semente do dono: sem ela a partida recusa uma tabela de operadores vazia.
    CONSOLE_OPERADORES: JSON.stringify([{
      email: EMAIL,
      senha: await derivarSenha("senha-de-teste-bem-longa"),
      segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador(EMAIL)),
    }]),
  };
  const app = await construirConsole({ config, leitura: mem.banco, escrita: mem.banco });
  await app.ready();
  abertos.push(app);
  return app;
}

beforeAll(async () => {
  mem = await consoleEmMemoria();
}, 180_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  for (const app of abertos) await app.close();
  await mem?.banco.encerrar();
});

describe("GET /saude do console", () => {
  it("repete a versão e o commit que o build gravou", async () => {
    vi.stubEnv("DC360_VERSAO", "0.1.0");
    vi.stubEnv("DC360_COMMIT", "f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c");
    const app = await subir();
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      ok: true, versao: "0.1.0", commit: "f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c",
    });
  });

  it("sem as variáveis (fora de uma imagem) diz desconhecida, e segue 200", async () => {
    vi.stubEnv("DC360_VERSAO", "");
    vi.stubEnv("DC360_COMMIT", "");
    const app = await subir();
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, versao: "desconhecida", commit: "desconhecido" });
  });

  it("negativo: valor fora do formato não é ecoado pela rota pública", async () => {
    vi.stubEnv("DC360_VERSAO", "postgres://usuario:senha@host/banco");
    vi.stubEnv("DC360_COMMIT", "<img src=x onerror=alert(1)>");
    const app = await subir();
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.body).not.toMatch(/postgres:|senha|onerror/);
    expect(r.json()).toEqual({ ok: true, versao: "desconhecida", commit: "desconhecido" });
  });
});
