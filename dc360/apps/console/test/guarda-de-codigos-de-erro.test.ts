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
  return resposta.code(403).send({ erro: "vazou_mbg", mensagem: "x" });
}

const consoles = new Map<"falhar" | "corrigir", ConsoleDeTeste>();

beforeAll(async () => {
  for (const modo of ["falhar", "corrigir"] as const) {
    const c = await subirConsoleDeTeste({ modoDaGuarda: modo });
    const r = (n: string) => `/teste-da-guarda/${n}`;
    c.app.get(r("m07"), {
      onSend: async (_req, rep, payload) => (rep.statusCode === 403 ? String(payload).replace("so_o_dono", "vazou_mah") : payload),
    }, async (_req, resposta) => resposta.code(403).send({ erro: "so_o_dono", mensagem: "x" }));
    c.app.get(r("m10"), async (_req, resposta) => {
      const campo = "statusCode";
      (resposta as unknown as Record<string, unknown>)[campo] = 401;
      return { erro: "vazou_mba", mensagem: "x" };
    });
    c.app.get(r("m11"), async (_req, resposta) => resposta.code(200).code(403).send({ erro: "vazou_mbb", mensagem: "x" }));
    c.app.get(r("m16"), async (_req, resposta) => recusarDeFora(resposta));
    c.app.get(r("ok"), async (_req, resposta) => resposta.code(403).send({ erro: "so_o_dono", mensagem: "Frase da rota." }));
    // Escapes da primeira guarda (um `onSend`), achados pela revisão independente na API.
    c.app.register(async (f) => {
      f.addHook("onRoute", (rota) => {
        const atuais = rota.onSend === undefined ? [] : Array.isArray(rota.onSend) ? rota.onSend : [rota.onSend];
        (rota as { onSend: unknown }).onSend = [...atuais, async (_q: unknown, rep: { statusCode: number }, p: unknown) =>
          (rep.statusCode === 403 ? String(p).replace("so_o_dono", "vazou_eab") : p)];
      });
      f.get("/x", async (_q, rep) => rep.code(403).send({ erro: "so_o_dono", mensagem: "x" }));
    }, { prefix: "/teste-da-guarda/eab" });
    c.app.register(async (f) => {
      f.addHook("onSend", async (req, rep) => {
        const q = req as unknown as { passadas?: number };
        q.passadas = (q.passadas ?? 0) + 1;
        if (q.passadas === 1) { rep.code(500); throw new Error("vazou_eaga"); }
        rep.code(403); throw Object.assign(new Error("vazou_eagb"), { code: "vazou_eag" });
      });
      f.get("/x", async () => ({ ok: true }));
    }, { prefix: "/teste-da-guarda/eag" });
    c.app.get(r("eaf"), async (_q, rep) => rep.code(403).type("application/json").send('{"erro":"vazou_eaf","erro":"so_o_dono"}'));
    // Correção 4 (rodada 6): status que o Node escreve como 401 ou 403 sem ser 401 ou 403.
    c.app.get(r("frac"), async (_q, rep) => rep.code(403.5).send({ erro: "vazou_frac_console", mensagem: "x" }));
    c.app.get(r("frac-401"), async (_q, rep) => rep.code(401.9).send({ erro: "vazou_frac_um", mensagem: "x" }));
    c.app.get(r("frac-texto"), async (_q, rep) => rep.code("403.2" as unknown as 403).send({ erro: "so_o_dono", mensagem: "x" }));
    c.app.get(r("hijack-grande"), async (_q, rep) => {
      rep.hijack();
      (rep.raw as unknown as { writeHead: (...a: unknown[]) => unknown }).writeHead(403 + 2 ** 32, { "content-type": "application/json" });
      rep.raw.end('{"erro":"vazou_grande"}');
    });
    await c.app.ready();
    consoles.set(modo, c);
  }
}, 300_000);

afterAll(async () => {
  for (const c of consoles.values()) await c.encerrar();
});

const FORMAS: ReadonlyArray<[string, number, string | null]> = [
  ["m07", 403, "vazou_mah"], ["m10", 401, "vazou_mba"], ["m11", 403, "vazou_mbb"], ["m16", 403, "vazou_mbg"],
  ["eab/x", 403, "vazou_eab"], ["eag/x", 403, null], ["eaf", 403, "so_o_dono"],
  ["frac", 403, "vazou_frac_console"], ["frac-401", 401, "vazou_frac_um"], ["frac-texto", 403, null],
  ["hijack-grande", 403, "vazou_grande"],
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

describe("correção 4: o status torto, por HTTP de verdade (porta efêmera)", () => {
  it("403.5 não sai 403 com o código fora do contrato, nos dois modos", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const app = consoles.get(modo)!.app;
      const endereco = await app.listen({ port: 0, host: "127.0.0.1" });
      try {
        const r = await fetch(`${endereco}/teste-da-guarda/frac`);
        const corpo = await r.json() as { erro: string };
        if (modo === "falhar") {
          expect(r.status).toBe(500);
          expect(lerDesviosDaGuarda()).toHaveLength(1);
        } else {
          expect(r.status).toBe(403);
          expect(corpo.erro).toBe("so_o_dono");
          expect(r.statusText).toBe("Forbidden");
        }
      } finally {
        await app.server.close();
      }
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});
