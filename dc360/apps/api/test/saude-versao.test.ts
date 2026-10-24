import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";
import {
  COMMIT_DESCONHECIDO, VERSAO_DESCONHECIDA, versaoDoBuild,
} from "../src/versao-do-build.js";

/**
 * `/saude` DIZ QUAL IMAGEM ESTÁ DE PÉ (V2-F01-E08).
 *
 * O rollback do Fly só é conferível de fora se a rota pública disser a versão e o
 * commit da imagem que subiu. Os dois valores chegam como argumentos de build
 * (`DC360_VERSAO`, `DC360_COMMIT`), viram variáveis de ambiente da imagem, e a
 * rota os repete. Dois cuidados que os casos abaixo fixam:
 *
 *   - o que sai é o que o build gravou, tal e qual (o job `imagens` do CI faz a
 *     mesma conta contra a imagem de verdade);
 *   - a rota é pública, então só sai valor com FORMATO de versão e de commit. Um
 *     texto qualquer em variável de ambiente vira `desconhecida`, nunca é ecoado.
 */

describe("versaoDoBuild (a leitura pura)", () => {
  it("devolve a versão SemVer e o SHA que o build gravou", () => {
    expect(versaoDoBuild({
      DC360_VERSAO: "0.1.0",
      DC360_COMMIT: "f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c",
    })).toEqual({ versao: "0.1.0", commit: "f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c" });
  });

  it("aceita o SHA abreviado de sete caracteres", () => {
    expect(versaoDoBuild({ DC360_VERSAO: "0.12.3", DC360_COMMIT: "f14214f" }))
      .toEqual({ versao: "0.12.3", commit: "f14214f" });
  });

  it("fora de uma imagem, sem as variáveis, diz que não sabe em vez de inventar", () => {
    expect(versaoDoBuild({})).toEqual({
      versao: VERSAO_DESCONHECIDA, commit: COMMIT_DESCONHECIDO,
    });
  });

  it("negativo: valor que não tem o formato não sai pela rota pública", () => {
    for (const lixo of [
      "", "   ", "v0.1.0", "0.1", "0.1.0-rc1", "01.2.3", "0.1.0\nX-Falso: 1",
      "<script>alert(1)</script>", "segredo-da-base", "0.1.0; DROP TABLE x",
    ]) {
      const { versao } = versaoDoBuild({ DC360_VERSAO: lixo, DC360_COMMIT: "f14214f" });
      expect(versao, JSON.stringify(lixo)).toBe(VERSAO_DESCONHECIDA);
    }
    for (const lixo of [
      "", "abc", "F14214F", "g14214f", "f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c5",
      "main", "$(whoami)", "f14214f\nX-Falso: 1",
    ]) {
      const { commit } = versaoDoBuild({ DC360_VERSAO: "0.1.0", DC360_COMMIT: lixo });
      expect(commit, JSON.stringify(lixo)).toBe(COMMIT_DESCONHECIDO);
    }
  });
});

describe("GET /saude devolve versao e commit", () => {
  let mem: BancoEmMemoria;
  const abertos: FastifyInstance[] = [];

  async function subir(): Promise<FastifyInstance> {
    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv);
    const app = await construirServidor({
      banco: mem.banco, config,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    });
    await app.ready();
    abertos.push(app);
    return app;
  }

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: false });
  }, 180_000);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    for (const app of abertos) await app.close();
    await mem?.banco.encerrar();
  });

  it("repete o que o build gravou, tal e qual", async () => {
    vi.stubEnv("DC360_VERSAO", "0.1.0");
    vi.stubEnv("DC360_COMMIT", "f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c");
    const app = await subir();
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.status).toBe("ok");
    expect(corpo.banco).toBe("ok");
    expect(corpo.versao).toBe("0.1.0");
    expect(corpo.commit).toBe("f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c");
  });

  it("sem as variáveis (fora de uma imagem) diz desconhecida, e a rota segue 200", async () => {
    vi.stubEnv("DC360_VERSAO", "");
    vi.stubEnv("DC360_COMMIT", "");
    const app = await subir();
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json().versao).toBe(VERSAO_DESCONHECIDA);
    expect(r.json().commit).toBe(COMMIT_DESCONHECIDO);
  });

  it("negativo: valor fora do formato não é ecoado pela rota pública", async () => {
    vi.stubEnv("DC360_VERSAO", "postgres://usuario:senha@host/banco");
    vi.stubEnv("DC360_COMMIT", "<img src=x onerror=alert(1)>");
    const app = await subir();
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(/postgres:|senha|onerror/);
    expect(r.json().versao).toBe(VERSAO_DESCONHECIDA);
    expect(r.json().commit).toBe(COMMIT_DESCONHECIDO);
  });
});
