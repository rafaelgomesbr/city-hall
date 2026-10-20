import type { FastifyInstance, FastifyReply } from "fastify";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODIGOS_DE_ERRO_DE_ACESSO } from "@dc360/shared";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor, RegraDeNegocio } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import {
  CONTRATO_DE_ACESSO_DA_API, conferirCorpoDeAcesso, lerDesviosDaGuarda, type ModoDaGuarda,
} from "../src/guarda-de-codigos-de-erro.js";

/**
 * A GUARDA EM TEMPO DE EXECUÇÃO das respostas de acesso (V2-F00-E05, correção 3).
 *
 * A varredura do fonte é heurística: a revisão independente plantou dezesseis
 * formas de responder 403 com código fora do catálogo que ela não lia. Aqui
 * cada forma vira uma rota de verdade, no servidor de verdade, e o que se
 * confere é a RESPOSTA: em teste (modo "falhar") ela sai 500
 * `desvio_do_catalogo_de_erro` e o desvio fica registrado (o apoio
 * `test/guarda-falha-alto.ts` reprova qualquer outro caso que passe por um);
 * fora de teste (modo "corrigir") ela sai com o código genérico do catálogo para
 * o status, e o desvio vai para o log com a rota.
 *
 * As rotas ficam neste arquivo, fora das pastas que a varredura lê, de
 * propósito: o que a guarda prova é que a FORMA não importa.
 *
 * A guarda confere na resposta do Node (`writeHead`, `write` e `end`), então
 * também pega o que a PRIMEIRA versão dela, um `onSend`, deixava passar: os
 * escapes da revisão estão no fim deste arquivo, copiados do arquivo dela.
 *
 * O que ela não vê é a escrita no socket (M08 da revisão), que não passa pela
 * resposta do Node, e o método do protótipo chamado por fora da instância; os
 * dois a varredura proíbe (`.socket`, `.connection`, `.call`, `.apply`,
 * `Reflect`).
 */

const SEGREDO = "segredo-da-guarda-de-codigos-com-mais-de-32-bytes";

type Recusa = { erro: string; mensagem: string };

/** O que vem "de outro arquivo" (o M16 da revisão era um `.mts` que a varredura não lia). */
function recusarDeFora(resposta: FastifyReply) {
  return resposta.code(403).send({ erro: "vazou_mbg", mensagem: "x" });
}

/** As formas da revisão, cada uma numa rota que responderia 403 (ou 401) com código fora do catálogo. */
function plantarFormas(app: FastifyInstance): void {
  const r = (n: string) => `/teste-da-guarda/${n}`;
  app.get(r("m01"), async () => {
    const modulo = { RegraDeNegocio } as Record<string, typeof RegraDeNegocio>;
    const k = "Regra" + "DeNegocio";
    throw new modulo[k]!("vazou_mab", "x", 403);
  });
  app.get(r("m02"), async () => {
    const base = new RegraDeNegocio("sem_permissao", "x", 403);
    const Construtor = base.constructor as typeof RegraDeNegocio;
    throw new Construtor("vazou_mac", "x", 403);
  });
  app.get(r("m03"), async () => {
    const campo = "codigo";
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    (e as unknown as Record<string, unknown>)[campo] = "vazou_mad";
    throw e;
  });
  app.get(r("m04"), async () => {
    const O = Object;
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    O.assign(e, { codigo: "vazou_mae" });
    throw e;
  });
  app.get(r("m05"), async () => {
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    globalThis.Object.defineProperty(e, "codigo", { value: "vazou_maf" });
    throw e;
  });
  app.get(r("m06"), async () => {
    class Recusa06 extends RegraDeNegocio {
      constructor() {
        super("sem_permissao", "x", 403);
        (this as unknown as Record<string, unknown>)["codigo"] = "vazou_mag";
      }
    }
    throw new Recusa06();
  });
  app.get(r("m07"), {
    onSend: async (_req, rep, payload) => (rep.statusCode === 403 ? String(payload).replace("sem_permissao", "vazou_mah") : payload),
  }, async (_req, resposta) => resposta.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  // M09: a rota é comum; o `JSON.stringify` é trocado no próprio caso, em volta do pedido.
  app.get(r("m09"), async (_req, resposta) => resposta.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  app.get(r("m10"), async (_req, resposta) => {
    const campo = "statusCode";
    const s = 403;
    (resposta as unknown as Record<string, unknown>)[campo] = s;
    return { erro: "vazou_mba", mensagem: "x" };
  });
  app.get(r("m11"), async (_req, resposta) => resposta.code(200).code(403).send({ erro: "vazou_mbb", mensagem: "x" }));
  app.get(r("m12"), async () => {
    throw new Proxy(new RegraDeNegocio("sem_permissao", "x", 403), {
      get: (alvo, p) => (p === "codigo" ? "vazou_mbc" : (alvo as unknown as Record<string | symbol, unknown>)[p]),
    });
  });
  app.get(r("m13"), async (_req, resposta) => {
    const corpo: Recusa = { erro: "sem_permissao", mensagem: "x" };
    void corpo;
    const recusar = ({ corpo }: { corpo: Recusa }) => resposta.code(403).send(corpo);
    return recusar({ corpo: { erro: "vazou_mbd", mensagem: "x" } });
  });
  app.get(r("m14"), async (_req, resposta) => {
    const corpo: Recusa = { erro: "sem_permissao", mensagem: "x" };
    void corpo;
    for (const corpo of [{ erro: "vazou_mbe", mensagem: "x" }]) return resposta.code(403).send(corpo);
    return null;
  });
  app.get(r("m15"), async () => {
    const campo = "status";
    const e = new RegraDeNegocio("vazou_mbf", "x", 409);
    (e as unknown as Record<string, unknown>)[campo] = 403;
    throw e;
  });
  app.get(r("m16"), async (_req, resposta) => recusarDeFora(resposta));
  // Desvios que não são de código: status trocado, sem corpo, corpo que não é JSON, 401.
  app.get(r("status-trocado"), async (_req, resposta) => resposta.code(401).send({ erro: "sem_permissao", mensagem: "x" }));
  app.get(r("sem-corpo"), async (_req, resposta) => resposta.code(403).send());
  app.get(r("texto"), async (_req, resposta) => resposta.code(403).type("text/plain").send("proibido"));
  app.get(r("401-fora"), async (_req, resposta) => resposta.code(401).send({ erro: "token_ausente", mensagem: "x" }));
  // Controles: o que está no catálogo passa intacto.
  app.get(r("ok-403"), async (_req, resposta) => resposta.code(403).send({ erro: "sem_permissao", mensagem: "Frase da rota." }));
  app.get(r("ok-401"), async (_req, resposta) => resposta.code(401).send({ erro: "nao_autenticado", mensagem: "Frase da rota." }));
  app.get(r("ok-entrada"), async (_req, resposta) => resposta.code(401).send({ erro: "credenciais", mensagem: "x" }));
  app.get(r("ok-503"), async (_req, resposta) => resposta.code(503).send({ erro: "acesso_suspenso", mensagem: "x" }));
  app.get(r("ok-200"), async () => ({ erro: "vazou_mas_e_200" }));
}

/*
  Os escapes da revisão independente da PRIMEIRA guarda (um `onSend`), copiados do
  arquivo dela (`zz-revisao-escape.test.ts`) sem mudar uma linha: `onRoute` de plugin
  acrescentando `onSend` depois (e01), `onSend` de contexto (e02), 404 de plugin trocado
  por 403 (e04), `setNotFoundHandler` (e05), `onSend` que lança duas vezes e faz o
  Fastify escrever o erro direto na resposta do Node (e06), `setErrorHandler` (e07),
  erro com `statusCode` (e08, que sai 500), serializador (e09), `Buffer` (e10), fluxo
  (e11), texto (e12), `erro` aninhado (e13), `preSerialization` (e14), chave repetida
  (e15), `onRequest` de rota (e16), dado pessoal no código (e17) e `callNotFound` com
  `onSend` de plugin (e18).
*/
const arr = (x: unknown) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
function plantarEscapesDaRevisao(app: FastifyInstance) {
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

const ESCAPES_DA_REVISAO = ["e01/x", "e02/x", "e04/nada", "e05/nada", "e06/x", "e07/x", "e09", "e10", "e11", "e12", "e13", "e14", "e15", "e16", "e17", "e18/x"];

/** As formas que respondem 403, com o código que tentaria sair. */
const FORMAS_403: ReadonlyArray<[string, string | null]> = [
  ["m01", "vazou_mab"], ["m02", "vazou_mac"], ["m03", "vazou_mad"], ["m04", "vazou_mae"],
  ["m05", "vazou_maf"], ["m06", "vazou_mag"], ["m07", "vazou_mah"], ["m10", "vazou_mba"],
  ["m11", "vazou_mbb"], ["m12", "vazou_mbc"], ["m13", "vazou_mbd"], ["m14", "vazou_mbe"],
  ["m15", "vazou_mbf"], ["m16", "vazou_mbg"], ["sem-corpo", null], ["texto", null],
];

let mem: BancoEmMemoria;
const servidores = new Map<ModoDaGuarda, FastifyInstance>();
const log: string[] = [];

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: SEGREDO, LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
  for (const modo of ["falhar", "corrigir"] as const) {
    const app = await construirServidor({
      banco: mem.banco, config,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
      modoDaGuarda: modo,
      ...(modo === "corrigir" ? { destinoDeLog: { write: (linha: string) => { log.push(linha); } } } : {}),
    });
    plantarFormas(app);
    plantarEscapesDaRevisao(app);
    await app.ready();
    servidores.set(modo, app);
  }
}, 300_000);

afterAll(async () => {
  for (const app of servidores.values()) await app.close();
  await mem?.banco.encerrar();
});

const pedirEm = (modo: ModoDaGuarda, url: string) => servidores.get(modo)!.inject({ method: "GET", url });
const pedir = (modo: ModoDaGuarda, n: string) => pedirEm(modo, `/teste-da-guarda/${n}`);

describe("modo de teste: a resposta fora do catálogo falha alto", () => {
  it.each(FORMAS_403)("%s: sai 500 desvio_do_catalogo_de_erro, e o desvio é registrado com a rota", async (n, visto) => {
    const r = await pedir("falhar", n);
    const desvios = lerDesviosDaGuarda();
    expect(r.statusCode, r.body).toBe(500);
    expect(r.json().erro).toBe("desvio_do_catalogo_de_erro");
    expect(desvios).toHaveLength(1);
    expect(desvios[0]).toMatchObject({ metodo: "GET", rota: `/teste-da-guarda/${n}`, status: 403, erroVisto: visto });
  });

  it("M09: `JSON.stringify` trocado depois de o servidor subir também é pego", async () => {
    const original = JSON.stringify;
    JSON.stringify = ((v: unknown, ...resto: unknown[]) =>
      String((original as (...a: unknown[]) => string)(v, ...resto)).replace("sem_permissao", "vazou_maj")) as typeof JSON.stringify;
    let r;
    try {
      r = await pedir("falhar", "m09");
    } finally {
      JSON.stringify = original;
    }
    const desvios = lerDesviosDaGuarda();
    expect(r.statusCode).toBe(500);
    expect(desvios).toEqual([expect.objectContaining({ erroVisto: "vazou_maj", rota: "/teste-da-guarda/m09" })]);
  });

  it("código do catálogo com o status trocado, e 401 com código fora, também", async () => {
    for (const [n, status, visto] of [["status-trocado", 401, "sem_permissao"], ["401-fora", 401, "token_ausente"]] as const) {
      const r = await pedir("falhar", n);
      expect(r.statusCode, n).toBe(500);
      expect(lerDesviosDaGuarda()).toEqual([expect.objectContaining({ status, erroVisto: visto })]);
    }
  });

  it("controles: o catálogo, a entrada, o 503 e o 200 passam intactos e não registram nada", async () => {
    const esperado: ReadonlyArray<[string, number, string]> = [
      ["ok-403", 403, "sem_permissao"], ["ok-401", 401, "nao_autenticado"], ["ok-entrada", 401, "credenciais"],
      ["ok-503", 503, "acesso_suspenso"], ["ok-200", 200, "vazou_mas_e_200"],
    ];
    for (const [n, status, erro] of esperado) {
      const r = await pedir("falhar", n);
      expect(r.statusCode, n).toBe(status);
      expect(r.json().erro, n).toBe(erro);
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("HEAD não leva corpo", () => {
  it("o HEAD de uma rota sai sem corpo e sem desvio; quem é conferido é o GET gêmeo", async () => {
    const head = await servidores.get("falhar")!.inject({ method: "HEAD", url: "/teste-da-guarda/ok-403" });
    expect(head.statusCode).toBe(403);
    expect(head.body).toBe("");
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("modo de produção: a resposta fora do catálogo sai com o código genérico e vai para o log", () => {
  it.each(FORMAS_403)("%s: sai 403 sem_permissao, com a frase do catálogo", async (n, visto) => {
    log.length = 0;
    const r = await pedir("corrigir", n);
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json()).toEqual({ erro: "sem_permissao", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.sem_permissao.mensagem });
    expect(r.headers["content-type"]).toMatch(/^application\/json/);
    const registro = log.map((l) => JSON.parse(l) as { desvioDoCatalogo?: unknown }).find((l) => l.desvioDoCatalogo);
    expect(registro?.desvioDoCatalogo).toMatchObject({ rota: `/teste-da-guarda/${n}`, status: 403, erroVisto: visto });
    expect(lerDesviosDaGuarda(), "o modo de produção não registra desvio de teste").toEqual([]);
  });

  it("M09: com `JSON.stringify` trocado, o corpo genérico NÃO passa por ele", async () => {
    const original = JSON.stringify;
    JSON.stringify = ((v: unknown, ...resto: unknown[]) =>
      String((original as (...a: unknown[]) => string)(v, ...resto)).replace("sem_permissao", "vazou_maj")) as typeof JSON.stringify;
    let r;
    try {
      r = await pedir("corrigir", "m09");
    } finally {
      JSON.stringify = original;
    }
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("sem_permissao");
  });

  it("401 fora do catálogo sai 401 nao_autenticado", async () => {
    const r = await pedir("corrigir", "401-fora");
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ erro: "nao_autenticado", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.nao_autenticado.mensagem });
  });

  it("controles: o que está no catálogo sai como a rota mandou, com a frase da rota", async () => {
    const r = await pedir("corrigir", "ok-403");
    expect(r.json()).toEqual({ erro: "sem_permissao", mensagem: "Frase da rota." });
  });
});

describe("a conferência do corpo, isolada", () => {
  it.each([
    [403, '{"erro":"sem_permissao","mensagem":"x"}', null],
    [401, '{"erro":"credenciais"}', null],
    [403, '{"erro":"acesso_suspenso"}', null],
    [403, '{"erro":"nao_autenticado"}', "status 403"],
    [403, '{"erro":"inventado"}', "fora do catálogo"],
    [403, '{"mensagem":"x"}', "sem `erro`"],
    [403, '["sem_permissao"]', "não é objeto"],
    [403, "proibido", "não é JSON"],
    [403, "", "sem corpo"],
    [403, null, "teto"],
    [403, '{"erro":"vazou","erro":"sem_permissao"}', "repetida"],
    [403, '{"\u0065rro":"vazou","erro":"sem_permissao"}', "repetida"],
    [403, '{"erro":"sem_permissao","campos":[{"erro":"x"}]}', "repetida"],
  ] as const)("%s %s", (status, payload, motivo) => {
    const r = conferirCorpoDeAcesso(status, payload, CONTRATO_DE_ACESSO_DA_API);
    if (motivo === null) expect(r).toBeNull();
    else expect(r?.motivo).toContain(motivo);
  });
});

describe("os escapes da revisão da primeira guarda (onSend) não escapam da guarda na resposta do Node", () => {
  it.each(ESCAPES_DA_REVISAO)("%s: em teste sai 500 com o desvio registrado; em produção, o código genérico", async (caso) => {
    const emTeste = await pedirEm("falhar", `/esc/${caso}`);
    expect(emTeste.statusCode, emTeste.body).toBe(500);
    expect(emTeste.json().erro).toBe("desvio_do_catalogo_de_erro");
    expect(lerDesviosDaGuarda()).toHaveLength(1);
    const emProducao = await pedirEm("corrigir", `/esc/${caso}`);
    expect([401, 403]).toContain(emProducao.statusCode);
    expect(emProducao.json().erro).toBe(emProducao.statusCode === 401 ? "nao_autenticado" : "sem_permissao");
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("e08 (erro com statusCode 403 lançado) sai 500 erro_interno, que não é resposta de acesso", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const r = await pedirEm(modo, "/esc/e08");
      expect(r.statusCode).toBe(500);
      expect(r.json().erro).toBe("erro_interno");
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("e17: o log de produção NÃO grava o código visto que não tem a forma de um código (e-mail, CPF, texto enorme)", async () => {
    log.length = 0;
    await pedirEm("corrigir", "/esc/e17");
    const linha = log.find((l) => l.includes("desvioDoCatalogo"))!;
    expect(linha).toBeDefined();
    expect(linha).not.toContain("maria.silva");
    expect(linha).not.toContain("123.456.789");
    expect(linha.length).toBeLessThan(800);
    expect(JSON.parse(linha).desvioDoCatalogo.erroVisto).toBe("[fora da forma de um código, não registrado]");
  });

  it("globais trocados com o servidor de pé (includes, hasOwnProperty, JSON.parse, JSON.stringify) não enganam a guarda", async () => {
    const includes = Array.prototype.includes;
    const proprio = Object.prototype.hasOwnProperty;
    const parse = JSON.parse;
    const stringify = JSON.stringify;
    // Trocas mirando o que a guarda decidiria: "403 está na lista" e "o código existe no catálogo".
    Array.prototype.includes = function (this: unknown[], x: unknown, ...resto: [number?]) {
      return x === 403 || includes.apply(this, [x, ...resto]);
    } as typeof Array.prototype.includes;
    Object.prototype.hasOwnProperty = function (this: object, k: PropertyKey) {
      return k === "vazou_mbb" || proprio.call(this, k);
    };
    let r;
    try {
      r = await pedirEm("falhar", "/teste-da-guarda/m11");
    } finally {
      Array.prototype.includes = includes;
      Object.prototype.hasOwnProperty = proprio;
    }
    expect(r.statusCode).toBe(500);
    expect(lerDesviosDaGuarda()).toHaveLength(1);
    JSON.parse = (() => ({ erro: "sem_permissao" })) as typeof JSON.parse;
    try {
      r = await pedirEm("corrigir", "/teste-da-guarda/m11");
    } finally {
      JSON.parse = parse;
    }
    expect(r.statusCode).toBe(403);
    expect(r.body).toContain('"erro":"sem_permissao"');
    JSON.stringify = (() => '{"erro":"vazou"}') as typeof JSON.stringify;
    try {
      r = await pedirEm("corrigir", "/teste-da-guarda/m11");
    } finally {
      JSON.stringify = stringify;
    }
    expect(r.json().erro).toBe("sem_permissao");
  });
});
