import type { FastifyReply } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerDesviosDaGuarda } from "../src/guarda-de-codigos-de-erro.js";
import { subirConsoleDeTeste, type ConsoleDeTeste } from "./apoio/console-de-teste.js";

/**
 * A guarda das respostas de acesso do CONSOLE (V2-F00-E05, correção 3): a mesma
 * da API, com o contrato do console. Cada rota abaixo responde 401 ou 403 com
 * código fora do contrato por uma forma que a varredura do fonte não lia (a
 * revisão independente plantou estas na API); o que se confere é a resposta.
 */

function recusarDeFora(resposta: FastifyReply) {
  return resposta.code(403).send({ erro: "vazou_m16", mensagem: "x" });
}

const consoles = new Map<"falhar" | "corrigir", ConsoleDeTeste>();

beforeAll(async () => {
  for (const modo of ["falhar", "corrigir"] as const) {
    const c = await subirConsoleDeTeste({ modoDaGuarda: modo });
    const r = (n: string) => `/teste-da-guarda/${n}`;
    c.app.get(r("m07"), {
      onSend: async (_req, rep, payload) => (rep.statusCode === 403 ? String(payload).replace("so_o_dono", "vazou_m07") : payload),
    }, async (_req, resposta) => resposta.code(403).send({ erro: "so_o_dono", mensagem: "x" }));
    c.app.get(r("m10"), async (_req, resposta) => {
      const campo = "statusCode";
      (resposta as unknown as Record<string, unknown>)[campo] = 401;
      return { erro: "vazou_m10", mensagem: "x" };
    });
    c.app.get(r("m11"), async (_req, resposta) => resposta.code(200).code(403).send({ erro: "vazou_m11", mensagem: "x" }));
    c.app.get(r("m16"), async (_req, resposta) => recusarDeFora(resposta));
    c.app.get(r("ok"), async (_req, resposta) => resposta.code(403).send({ erro: "so_o_dono", mensagem: "Frase da rota." }));
    await c.app.ready();
    consoles.set(modo, c);
  }
}, 300_000);

afterAll(async () => {
  for (const c of consoles.values()) await c.encerrar();
});

const FORMAS: ReadonlyArray<[string, number, string]> = [
  ["m07", 403, "vazou_m07"], ["m10", 401, "vazou_m10"], ["m11", 403, "vazou_m11"], ["m16", 403, "vazou_m16"],
];

describe("a guarda do console", () => {
  it.each(FORMAS)("em teste, %s sai 500 e o desvio fica registrado com a rota", async (n, status, visto) => {
    const r = await consoles.get("falhar")!.app.inject({ method: "GET", url: `/teste-da-guarda/${n}` });
    expect(r.statusCode, r.body).toBe(500);
    expect(lerDesviosDaGuarda()).toEqual([expect.objectContaining({ rota: `/teste-da-guarda/${n}`, status, erroVisto: visto })]);
  });

  it.each(FORMAS)("fora de teste, %s sai com o código genérico do console e vai para o log", async (n, status, visto) => {
    const c = consoles.get("corrigir")!;
    c.log.length = 0;
    const r = await c.app.inject({ method: "GET", url: `/teste-da-guarda/${n}` });
    expect(r.statusCode).toBe(status);
    expect(r.json()).toEqual(status === 401
      ? { erro: "sem_sessao", mensagem: "Entre de novo." }
      : { erro: "so_o_dono", mensagem: "Só o dono do console faz isto." });
    const registro = c.log.map((l) => JSON.parse(l) as { desvioDoCatalogo?: unknown }).find((l) => l.desvioDoCatalogo);
    expect(registro?.desvioDoCatalogo).toMatchObject({ rota: `/teste-da-guarda/${n}`, erroVisto: visto });
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("controle: o código do contrato passa intacto, com a frase da rota", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const r = await consoles.get(modo)!.app.inject({ method: "GET", url: "/teste-da-guarda/ok" });
      expect(r.statusCode).toBe(403);
      expect(r.json()).toEqual({ erro: "so_o_dono", mensagem: "Frase da rota." });
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});
