import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { lerDesviosDaGuarda, type ModoDaGuarda } from "../src/guarda-de-codigos-de-erro.js";

const SEGREDO = "segredo-da-guarda-de-codigos-com-mais-de-32-bytes";
const arr = (x: unknown) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

function plantar(app: FastifyInstance) {
  // E01: onRoute de plugin filho acrescenta onSend DEPOIS da guarda
  app.register(async (f) => {
    f.addHook("onRoute", (r) => {
      (r as { onSend: unknown }).onSend = [...arr(r.onSend), async (_q: unknown, rep: { statusCode: number }, p: unknown) =>
        (rep.statusCode === 403 ? String(p).replace("sem_permissao", "vazou_e01") : p)];
    });
    f.get("/x", async (_q, rep) => rep.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  }, { prefix: "/esc/e01" });
  // E02: onSend no contexto de plugin filho (controle: a guarda da rota roda depois)
  app.register(async (f) => {
    f.addHook("onSend", async (_q, rep, p) => (rep.statusCode === 403 ? String(p).replace("sem_permissao", "vazou_e02") : p));
    f.get("/x", async (_q, rep) => rep.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  }, { prefix: "/esc/e02" });
  // E03/E04: setNotFoundHandler em plugin filho + onSend do contexto que troca o 404 por 403 fora do catálogo
  app.register(async (f) => {
    f.addHook("onSend", async (req, rep, p) => {
      if (req.url.startsWith("/esc/e04") && rep.statusCode === 404) { rep.code(403); return '{"erro":"vazou_e04","mensagem":"x"}'; }
      return p;
    });
    f.setNotFoundHandler((_q, rep) => { void rep.code(404).send({ erro: "nao_encontrado", mensagem: "x" }); });
  }, { prefix: "/esc/e04" });
  // E05: setNotFoundHandler encapsulado que responde 403 direto (controle)
  app.register(async (f) => {
    f.setNotFoundHandler((_q, rep) => { void rep.code(403).send({ erro: "vazou_e05", mensagem: "x" }); });
  }, { prefix: "/esc/e05" });
  // E06: onSend que lança: 1a passada 500, 2a passada põe 403 e lança de novo (fallback do Fastify escreve no raw)
  app.register(async (f) => {
    f.addHook("onSend", async (req, rep) => {
      const q = req as unknown as { passadas?: number };
      q.passadas = (q.passadas ?? 0) + 1;
      if (q.passadas === 1) { rep.code(500); throw new Error("vazou_e06a"); }
      rep.code(403); throw Object.assign(new Error("vazou_e06b"), { code: "vazou_e06" });
    });
    f.get("/x", async () => ({ ok: true }));
  }, { prefix: "/esc/e06" });
  // E07: setErrorHandler encapsulado (controle)
  app.register(async (f) => {
    f.setErrorHandler((_e, _q, rep) => rep.code(403).send({ erro: "vazou_e07", mensagem: "x" }));
    f.get("/x", async () => { throw new Error("y"); });
  }, { prefix: "/esc/e07" });
  // E08: erro com statusCode 403 lançado num preHandler (controle)
  app.get("/esc/e08", { preHandler: async () => { throw Object.assign(new Error("vazou_e08"), { statusCode: 403, code: "vazou_e08" }); } }, async () => ({}));
  // E09: reply.serializer
  app.get("/esc/e09", async (_q, rep) => rep.code(403).serializer(() => '{"erro":"vazou_e09"}').send({ erro: "sem_permissao" }));
  // E10: Buffer, E11: stream, E12: string já serializada com content-type texto
  app.get("/esc/e10", async (_q, rep) => rep.code(403).type("application/json").send(Buffer.from('{"erro":"vazou_e10"}')));
  app.get("/esc/e11", async (_q, rep) => rep.code(403).type("application/json").send(Readable.from(['{"erro":"vazou_e11"}'])));
  app.get("/esc/e12", async (_q, rep) => rep.code(403).type("text/plain").send('{"erro":"vazou_e12"}'));
  // E13: erro aninhado
  app.get("/esc/e13", async (_q, rep) => rep.code(403).send({ erro: { codigo: "sem_permissao" }, mensagem: "x" }));
  // E14: preSerialization
  app.get("/esc/e14", { preSerialization: async (_q, _r, p) => ({ ...(p as object), erro: "vazou_e14" }) }, async (_q, rep) => rep.code(403).send({ erro: "sem_permissao" }));
  // E15: chave duplicada, a primeira fora e a última dentro
  app.get("/esc/e15", async (_q, rep) => rep.code(403).type("application/json").send('{"erro":"vazou_e15","erro":"sem_permissao"}'));
  // E16: onRequest de rota respondendo 403
  app.get("/esc/e16", { onRequest: async (_q, rep) => { await rep.code(403).send({ erro: "vazou_e16" }); } }, async () => ({}));
  // E17: dado pessoal e texto enorme no erro, para o log
  app.get("/esc/e17", async (_q, rep) => rep.code(403).send({ erro: "maria.silva@exemplo.com.br cpf 123.456.789-00 " + "A".repeat(5000), mensagem: "segredo da mensagem" }));
  // E18: callNotFound dentro de plugin filho cujo onSend troca o 404 por 401
  app.register(async (f) => {
    f.addHook("onSend", async (_q, rep, p) => { if (rep.statusCode === 404) { rep.code(401); return '{"erro":"vazou_e18"}'; } return p; });
    f.get("/x", async (_q, rep) => rep.callNotFound());
  }, { prefix: "/esc/e18" });
}

let mem: BancoEmMemoria;
const servidores = new Map<ModoDaGuarda, FastifyInstance>();
const log: string[] = [];
beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: SEGREDO, LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
  for (const modo of ["falhar", "corrigir"] as const) {
    const app = await construirServidor({
      banco: mem.banco, config, armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }), modoDaGuarda: modo,
      ...(modo === "corrigir" ? { destinoDeLog: { write: (l: string) => { log.push(l); } } } : {}),
    });
    plantar(app);
    await app.ready();
    servidores.set(modo, app);
  }
}, 300_000);
afterAll(async () => { for (const a of servidores.values()) await a.close(); await mem?.banco.encerrar(); });

const casos = ["e01/x", "e02/x", "e04/nada", "e05/nada", "e06/x", "e07/x", "e08", "e09", "e10", "e11", "e12", "e13", "e14", "e15", "e16", "e17", "e18/x"];
describe("revisão: formas de escapar", () => {
  it("relatório", async () => {
    const linhas: string[] = [];
    for (const c of casos) {
      for (const modo of ["falhar", "corrigir"] as const) {
        log.length = 0;
        let r;
        try { r = await servidores.get(modo)!.inject({ method: "GET", url: `/esc/${c}` }); } catch (e) { linhas.push(`${c} ${modo} EXCECAO ${(e as Error).message}`); continue; }
        const d = lerDesviosDaGuarda();
        const reg = log.filter((l) => l.includes("desvioDoCatalogo"));
        const escapou = (r.statusCode === 401 || r.statusCode === 403) && !/"erro":"(sem_permissao|nao_autenticado)"/.test(r.body);
        linhas.push(`${escapou ? "ESCAPOU" : "pego  "} ${c.padEnd(9)} ${modo.padEnd(8)} status=${r.statusCode} desviosRegistrados=${d.length} corpo=${r.body.slice(0, 110)}`);
        if (c === "e17" && modo === "corrigir") linhas.push(`   LOG(e17, ${reg[0]?.length ?? 0} bytes): ${reg[0]?.slice(0, 400)}`);
      }
    }
    console.log("\n" + linhas.join("\n"));
  });
});
