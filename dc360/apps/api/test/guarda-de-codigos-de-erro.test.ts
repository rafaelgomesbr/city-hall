import type { FastifyInstance, FastifyReply } from "fastify";
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
 * A única forma que a guarda não vê é a escrita direta no socket (M08 da
 * revisão), porque ela não passa pelo Fastify; essa a varredura proíbe
 * (`.socket` e `.connection`, como `.raw`, `.hijack()` e `.writeHead()`).
 */

const SEGREDO = "segredo-da-guarda-de-codigos-com-mais-de-32-bytes";

type Recusa = { erro: string; mensagem: string };

/** O que vem "de outro arquivo" (o M16 da revisão era um `.mts` que a varredura não lia). */
function recusarDeFora(resposta: FastifyReply) {
  return resposta.code(403).send({ erro: "vazou_m16", mensagem: "x" });
}

/** As formas da revisão, cada uma numa rota que responderia 403 (ou 401) com código fora do catálogo. */
function plantarFormas(app: FastifyInstance): void {
  const r = (n: string) => `/teste-da-guarda/${n}`;
  app.get(r("m01"), async () => {
    const modulo = { RegraDeNegocio } as Record<string, typeof RegraDeNegocio>;
    const k = "Regra" + "DeNegocio";
    throw new modulo[k]!("vazou_m01", "x", 403);
  });
  app.get(r("m02"), async () => {
    const base = new RegraDeNegocio("sem_permissao", "x", 403);
    const Construtor = base.constructor as typeof RegraDeNegocio;
    throw new Construtor("vazou_m02", "x", 403);
  });
  app.get(r("m03"), async () => {
    const campo = "codigo";
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    (e as unknown as Record<string, unknown>)[campo] = "vazou_m03";
    throw e;
  });
  app.get(r("m04"), async () => {
    const O = Object;
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    O.assign(e, { codigo: "vazou_m04" });
    throw e;
  });
  app.get(r("m05"), async () => {
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    globalThis.Object.defineProperty(e, "codigo", { value: "vazou_m05" });
    throw e;
  });
  app.get(r("m06"), async () => {
    class Recusa06 extends RegraDeNegocio {
      constructor() {
        super("sem_permissao", "x", 403);
        (this as unknown as Record<string, unknown>)["codigo"] = "vazou_m06";
      }
    }
    throw new Recusa06();
  });
  app.get(r("m07"), {
    onSend: async (_req, rep, payload) => (rep.statusCode === 403 ? String(payload).replace("sem_permissao", "vazou_m07") : payload),
  }, async (_req, resposta) => resposta.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  // M09: a rota é comum; o `JSON.stringify` é trocado no próprio caso, em volta do pedido.
  app.get(r("m09"), async (_req, resposta) => resposta.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  app.get(r("m10"), async (_req, resposta) => {
    const campo = "statusCode";
    const s = 403;
    (resposta as unknown as Record<string, unknown>)[campo] = s;
    return { erro: "vazou_m10", mensagem: "x" };
  });
  app.get(r("m11"), async (_req, resposta) => resposta.code(200).code(403).send({ erro: "vazou_m11", mensagem: "x" }));
  app.get(r("m12"), async () => {
    throw new Proxy(new RegraDeNegocio("sem_permissao", "x", 403), {
      get: (alvo, p) => (p === "codigo" ? "vazou_m12" : (alvo as unknown as Record<string | symbol, unknown>)[p]),
    });
  });
  app.get(r("m13"), async (_req, resposta) => {
    const corpo: Recusa = { erro: "sem_permissao", mensagem: "x" };
    void corpo;
    const recusar = ({ corpo }: { corpo: Recusa }) => resposta.code(403).send(corpo);
    return recusar({ corpo: { erro: "vazou_m13", mensagem: "x" } });
  });
  app.get(r("m14"), async (_req, resposta) => {
    const corpo: Recusa = { erro: "sem_permissao", mensagem: "x" };
    void corpo;
    for (const corpo of [{ erro: "vazou_m14", mensagem: "x" }]) return resposta.code(403).send(corpo);
    return null;
  });
  app.get(r("m15"), async () => {
    const campo = "status";
    const e = new RegraDeNegocio("vazou_m15", "x", 409);
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

/** As formas que respondem 403, com o código que tentaria sair. */
const FORMAS_403: ReadonlyArray<[string, string | null]> = [
  ["m01", "vazou_m01"], ["m02", "vazou_m02"], ["m03", "vazou_m03"], ["m04", "vazou_m04"],
  ["m05", "vazou_m05"], ["m06", "vazou_m06"], ["m07", "vazou_m07"], ["m10", "vazou_m10"],
  ["m11", "vazou_m11"], ["m12", "vazou_m12"], ["m13", "vazou_m13"], ["m14", "vazou_m14"],
  ["m15", "vazou_m15"], ["m16", "vazou_m16"], ["sem-corpo", null], ["texto", null],
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
    await app.ready();
    servidores.set(modo, app);
  }
}, 300_000);

afterAll(async () => {
  for (const app of servidores.values()) await app.close();
  await mem?.banco.encerrar();
});

const pedir = (modo: ModoDaGuarda, n: string) => servidores.get(modo)!.inject({ method: "GET", url: `/teste-da-guarda/${n}` });

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
      String((original as (...a: unknown[]) => string)(v, ...resto)).replace("sem_permissao", "vazou_m09")) as typeof JSON.stringify;
    let r;
    try {
      r = await pedir("falhar", "m09");
    } finally {
      JSON.stringify = original;
    }
    const desvios = lerDesviosDaGuarda();
    expect(r.statusCode).toBe(500);
    expect(desvios).toEqual([expect.objectContaining({ erroVisto: "vazou_m09", rota: "/teste-da-guarda/m09" })]);
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
      String((original as (...a: unknown[]) => string)(v, ...resto)).replace("sem_permissao", "vazou_m09")) as typeof JSON.stringify;
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
    [401, Buffer.from('{"erro":"credenciais"}'), null],
    [403, '{"erro":"acesso_suspenso"}', null],
    [403, '{"erro":"nao_autenticado"}', "status 403"],
    [403, '{"erro":"inventado"}', "fora do catálogo"],
    [403, '{"mensagem":"x"}', "sem `erro`"],
    [403, '["sem_permissao"]', "não é objeto"],
    [403, "proibido", "não é JSON"],
    [403, undefined, "sem corpo"],
    [403, { pipe: () => undefined }, "fluxo"],
  ] as const)("%s %s", (status, payload, motivo) => {
    const r = conferirCorpoDeAcesso(status, payload, CONTRATO_DE_ACESSO_DA_API);
    if (motivo === null) expect(r).toBeNull();
    else expect(r?.motivo).toContain(motivo);
  });
});
