import type { FastifyInstance, FastifyReply } from "fastify";
import { connect } from "node:net";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONTRATO_DE_ACESSO_DO_CONSOLE, conferirCorpoDeAcesso, lerDesviosDaGuarda,
} from "../src/guarda-de-codigos-de-erro.js";
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

/*
  Correção 7 (rodada 7 sobre `fd17ff4`): as formas dos relatórios de Segurança,
  red-team e QA que ainda não tinham caso no console. Mesmas rotas da API.
*/
const CORPO_C7 = '{"erro":"inventado_c7","mensagem":"x"}';
const CABECA_C7 = `HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: ${CORPO_C7.length}\r\n\r\n`;
const PROVISORIOS_COMO_FINAL = ["g-100", "g-101", "g-102", "g-103", "g-199", "g-102-objeto", "g-102-raw-writehead", "g-102-raw-implicito"];
function plantarCorrecao7(app: FastifyInstance): void {
  const r = (n: string) => `/c7/${n}`;
  const crua7 = (rep: FastifyReply) => { const k = "ra" + "w"; return (rep as unknown as Record<string, Record<string, any>>)[k]!; };
  const web = (texto: string) => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(texto)); c.close(); } });
  const ok = '{"erro":"so_o_dono","mensagem":"x"}';
  app.get(r("c-webstream"), async (_q, rep) => rep.code(200).header("content-length", "2").type("application/json")
    .send(web("{}" + CABECA_C7 + CORPO_C7)));
  app.get(r("i-cl0-stream"), async (_q, rep) => rep.code(200).header("content-length", "0")
    .send(Readable.from([Buffer.from(CABECA_C7 + CORPO_C7)])));
  app.get(r("i-cl0-response"), async (_q, rep) => rep.send(new Response(CABECA_C7 + CORPO_C7,
    { status: 200, headers: { "content-length": "0" } })));
  app.get(r("i-cl0-webstream"), async (_q, rep) => rep.code(200).header("content-length", "0").send(web(CABECA_C7 + CORPO_C7)));
  app.get(r("e-403-cl-menor"), async (_q, rep) => rep.code(403).header("content-length", "2").type("application/json")
    .send(Readable.from([Buffer.from(ok)])));
  app.get(r("tr-addtrailers-fora"), async (_q, rep) => {
    rep.code(403).header("transfer-encoding", "chunked").header("trailer", "x-t").type("application/json");
    crua7(rep).addTrailers({ "x-t": "v" });
    return rep.send(CORPO_C7);
  });
  for (const st of [100, 101, 102, 103, 199]) app.get(r(`g-${st}`), async (_q, rep) => rep.code(st).send(CABECA_C7 + CORPO_C7));
  app.get(r("g-102-objeto"), async (_q, rep) => rep.code(102).send({ erro: "inventado_c7", mensagem: "x" }));
  app.get(r("g-102-raw-writehead"), async (_q, rep) => { rep.hijack(); const x = crua7(rep); x.writeHead(102); x.end(CORPO_C7); });
  app.get(r("g-102-raw-implicito"), async (_q, rep) => { rep.hijack(); const x = crua7(rep); x.statusCode = 102; x.end(CORPO_C7); });
  app.get(r("g-101-writeraw"), async (_q, rep) => {
    rep.hijack(); const x = crua7(rep);
    x._writeRaw("HTTP/1.1 101 Switching Protocols\r\n\r\n"); x._header = "x"; x._headerSent = true; x.end();
  });
  app.get(r("g-102-so-provisoria"), async (_q, rep) => {
    rep.hijack(); const x = crua7(rep);
    x.writeProcessing(); x._header = "x"; x._headerSent = true; x.end();
  });
  app.get(r("g-102-e-final"), async (_q, rep) => { crua7(rep).writeProcessing(); return rep.code(403).type("application/json").send(ok); });
  // Correção 7b (CI em Node 22): Early Hints com CR/LF, o 103 legítimo, e a recusa direta.
  app.get(r("f-early"), async (_q, rep) => {
    rep.writeEarlyHints({ link: "</a.css>; rel=preload", "x-s": "a\r\n\r\n" + CABECA_C7 + CORPO_C7 });
    return { ok: true };
  });
  // Sem `await`: o `writeEarlyHints` do Fastify devolve a própria resposta, que é "thenable" e só
  // resolve quando a resposta termina; esperar por ela ali trava o pedido.
  app.get(r("f-early-legitimo"), async (_q, rep) => {
    rep.writeEarlyHints({ link: "</a.css>; rel=preload" });
    return rep.code(403).type("application/json").send(ok);
  });
  app.get(r("f-early-recusa"), async (_q, rep) => {
    const x = crua7(rep);
    try { x.writeEarlyHints({ "x-s": "a\r\n\r\n" + CABECA_C7 + CORPO_C7 }); } catch (e) {
      return { codigo: (e as { code?: string }).code ?? "sem-codigo", fila: x.outputData.length };
    }
    return { codigo: "escreveu", fila: x.outputData.length };
  });
}

/*
  DV-01 (retrato dos cabeçalhos). Valores INOFENSIVOS que contam quantas vezes o
  Node (e a guarda) os leem: um objeto cujo `toString` devolve sempre o mesmo
  texto comum e soma um contador, e um que devolve um texto na primeira leitura
  e outro nas seguintes. A prova é o contador (tem de ser uma leitura da guarda)
  e o que sai no fio (o texto da primeira leitura, numa resposta só).
*/
const leituras = { n: 0, antes: 0 };
const valorContado = (texto: string) => ({ toString: () => { leituras.n += 1; return texto; } });
/** Primeira leitura: "um". Da segunda em diante: dois campos separados por linha em branco. */
const valorQueMuda = () => ({ toString: () => { leituras.n += 1; return leituras.n === 1 ? "um" : "dois\r\n\r\nx-y: z"; } });
function plantarDv01(app: FastifyInstance): void {
  const r = (n: string) => `/dv01/${n}`;
  type Crua = {
    setHeader(nome: string, valor: unknown): void; statusMessage: unknown; _header: unknown;
    writeHead(status: number, cabecalhos: Record<string, string>): void; end(corpo: string): void;
  };
  const crua = (rep: FastifyReply): Crua => { const k = "ra" + "w"; return (rep as unknown as Record<string, Crua>)[k]!; };
  const ok = { erro: "so_o_dono", mensagem: "x" };
  app.get(r("contado-403"), async (_q, rep) => {
    leituras.n = 0;
    return rep.code(403).header("x-contado", valorContado("valor-comum")).send(ok);
  });
  app.get(r("contado-setheader-403"), async (_q, rep) => {
    leituras.n = 0;
    crua(rep).setHeader("x-contado", valorContado("valor-comum"));
    leituras.antes = leituras.n;
    return rep.code(403).send(ok);
  });
  app.get(r("contado-desvio"), async (_q, rep) => {
    leituras.n = 0;
    return rep.code(403).header("x-contado", valorContado("valor-comum")).send({ erro: "fora_do_catalogo_dv01", mensagem: "x" });
  });
  app.get(r("contado-lista-403"), async (_q, rep) => {
    leituras.n = 0;
    return rep.code(403).header("x-lista", [valorContado("a"), valorContado("b")] as unknown as string).send(ok);
  });
  app.get(r("contado-frase-403"), async (_q, rep) => {
    leituras.n = 0;
    crua(rep).statusMessage = valorContado("Frase Comum");
    return rep.code(403).send(ok);
  });
  app.get(r("muda-403"), async (_q, rep) => {
    leituras.n = 0;
    return rep.code(403).header("x-muda", valorQueMuda()).send(ok);
  });
  app.get(r("muda-setheader-403"), async (_q, rep) => {
    leituras.n = 0;
    crua(rep).setHeader("x-muda", valorQueMuda());
    leituras.antes = leituras.n;
    return rep.code(403).send(ok);
  });
  // A resposta que não é de acesso não é segurada: quem pega é a segunda rede, na cabeça que o Node montou.
  app.get(r("muda-200"), async (_q, rep) => {
    leituras.n = 0;
    return rep.code(200).header("x-muda", valorQueMuda()).send({ ok: true });
  });
  app.get(r("cabeca-inteira-200"), async (_q, rep) => {
    rep.hijack();
    const x = crua(rep);
    x.writeHead(200, { "content-length": "10" });
    x.end("0123456789");
  });
  app.get(r("cabeca-partida-200"), async (_q, rep) => {
    rep.hijack();
    const x = crua(rep);
    x.writeHead(200, { "content-length": "10" });
    x._header = "HTTP/1.1 200 OK\r\ncontent-length: 19\r\n\r\nz: 1\r\n\r\n";
    x.end("0123456789");
  });
  // Early Hints: o Node recebe um objeto novo, e cada valor é lido uma vez.
  app.get(r("early-contado"), async (_q, rep) => {
    leituras.n = 0;
    rep.writeEarlyHints({ link: "</a.css>; rel=preload", "x-s": valorContado("dica-comum") });
    return { lidas: leituras.n };
  });
  app.get(r("early-getter"), async (_q, rep) => {
    leituras.n = 0;
    const dicas = { link: "</a.css>; rel=preload", get "x-g"() { leituras.n += 1; return "dica-comum"; } };
    rep.writeEarlyHints(dicas);
    return { lidas: leituras.n };
  });
}

type RespostaLida = { status: number; corpo: string };
/** As respostas, em ordem, como um cliente em pipeline as leria (1xx, 204 e 304 sem corpo). */
function lerRespostas(t: string): { respostas: RespostaLida[]; resto: string } {
  const respostas: RespostaLida[] = [];
  let i = 0;
  while (i < t.length && t.startsWith("HTTP/", i)) {
    const fim = t.indexOf("\r\n\r\n", i);
    if (fim < 0) break;
    const cab = t.slice(i, fim);
    const status = Number(cab.split("\r\n")[0]!.split(" ")[1]);
    const cl = /\r\ncontent-length: *(\d+)/i.exec(cab);
    const te = /\r\ntransfer-encoding: *([^\r]+)/i.exec(cab);
    let j = fim + 4;
    let corpo = "";
    if ((status >= 100 && status <= 199) || status === 204 || status === 304) { /* sem corpo */ }
    else if (te && /chunked\s*$/i.test(te[1]!)) {
      for (;;) {
        const f = t.indexOf("\r\n", j); if (f < 0) { j = t.length; break; }
        const n = parseInt(t.slice(j, f), 16); j = f + 2;
        if (!n) { for (;;) { const ft = t.indexOf("\r\n", j); if (ft < 0) { j = t.length; break; } const vazia = ft === j; j = ft + 2; if (vazia) break; } break; }
        corpo += t.slice(j, j + n); j += n + 2;
      }
    } else if (cl) { corpo = t.slice(j, j + Number(cl[1])); j += Number(cl[1]); }
    else { corpo = t.slice(j); j = t.length; }
    respostas.push({ status, corpo });
    i = j;
  }
  return { respostas, resto: t.slice(i) };
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
    // Correção 4b (revisão de `05ab42d`): a linha de status gravada por baixo de writeHead.
    const corpo = '{"erro":"inventado_c6","mensagem":"x"}';
    const crua = (rep: FastifyReply) => { const k = "ra" + "w"; return (rep as unknown as Record<string, Record<string, any>>)[k]!; };
    c.app.get(r("por-baixo-store"), async (_q, rep) => {
      const x = crua(rep);
      x._storeHeader("HTTP/1.1 403 Forbidden\r\n", { "content-type": "application/json", "content-length": String(corpo.length) });
      x.end(corpo);
      return rep;
    });
    c.app.get(r("por-baixo-header"), async (_q, rep) => {
      rep.hijack(); const x = crua(rep);
      x.writeHead(200, { "content-type": "application/json" });
      x._header = x._header.replace("200 OK", "401 Unauthorized");
      x.end(corpo);
    });
    c.app.get(r("por-baixo-writeraw"), async (_q, rep) => {
      rep.hijack(); const x = crua(rep);
      x._writeRaw(`HTTP/1.1 403 Forbidden\r\ncontent-length: ${corpo.length}\r\n\r\n${corpo}`); x._header = "x"; x.end();
    });
    // Correção 6 (rodada 7): corpo além do content-length pela API pública, e trailer no desvio.
    const corpoQa7 = '{"erro":"inventado_qa7","mensagem":"x"}';
    const cabecaQa7 = `HTTP/1.1 403 Forbidden\r\ncontent-length: ${corpoQa7.length}\r\n\r\n`;
    c.app.get(r("cl-stream"), async (_q, rep) => rep.code(200).header("content-length", "2").type("application/json")
      .send(Readable.from([Buffer.from("{}" + cabecaQa7 + corpoQa7)])));
    c.app.get(r("trailer-inventado"), async (_q, rep) => rep.code(403).trailer("x-t", async () => "y").send({ erro: "inventado_qa7", mensagem: "x" }));
    plantarCorrecao7(c.app);
    plantarDv01(c.app);
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

/** O console do modo escutando numa porta efêmera, uma vez só (o `afterAll` o encerra). */
const enderecos = new Map<"falhar" | "corrigir", Promise<string>>();
const enderecoDe = (modo: "falhar" | "corrigir"): Promise<string> => {
  if (!enderecos.has(modo)) enderecos.set(modo, consoles.get(modo)!.app.listen({ port: 0, host: "127.0.0.1" }));
  return enderecos.get(modo)!;
};

describe("correção 4: o status torto, por HTTP de verdade (porta efêmera)", () => {
  it("403.5 não sai 403 com o código fora do contrato, nos dois modos", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const endereco = await enderecoDe(modo);
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
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("correção 4b: a linha de status escrita por baixo de writeHead, por HTTP de verdade", () => {
  it.each([["por-baixo-store", 403], ["por-baixo-header", 401], ["por-baixo-writeraw", 403]] as const)(
    "%s não sai %s com o código inventado, nos dois modos", async (n, status) => {
      for (const modo of ["falhar", "corrigir"] as const) {
        const r = await fetch(`${await enderecoDe(modo)}/teste-da-guarda/${n}`, { headers: { connection: "close" } });
        const corpo = await r.text();
        expect(corpo, `${modo} ${n}`).not.toContain("inventado_c6");
        if (modo === "falhar") {
          expect(r.status).toBe(500);
          expect(lerDesviosDaGuarda()).toEqual([expect.objectContaining({ rota: `/teste-da-guarda/${n}` })]);
        } else {
          expect(r.status).toBe(status);
          expect(JSON.parse(corpo).erro).toBe(status === 401 ? "sem_sessao" : "so_o_dono");
        }
      }
      expect(lerDesviosDaGuarda()).toEqual([]);
    });
});

describe("correção 6: a moldura do corpo e o trailer, por socket cru em pipeline", () => {
  const pipeline = async (modo: "falhar" | "corrigir", caminho: string): Promise<string> => {
    const porta = Number(new URL(await enderecoDe(modo)).port);
    return new Promise((ok) => {
      const s = connect(porta, "127.0.0.1", () => s.write(
        `GET ${caminho} HTTP/1.1\r\nhost: x\r\n\r\nGET /nada HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n`));
      let b = "";
      s.on("data", (d: Buffer) => { b += d.toString("latin1"); });
      s.on("error", () => {});
      const fim = setTimeout(() => s.destroy(), 4000);
      s.on("close", () => { clearTimeout(fim); ok(b); });
    });
  };

  it("cl-stream: o cliente lê 200 {} e nenhuma segunda resposta 403 com o código inventado", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const b = await pipeline(modo, "/teste-da-guarda/cl-stream");
      expect(b.startsWith("HTTP/1.1 200 OK")).toBe(true);
      expect(b).not.toContain("inventado_qa7");
      expect(b).not.toContain("403 Forbidden");
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("trailer com código fora do contrato: a resposta do desvio sai, sem exceção não tratada", async () => {
    const naoTratadas: unknown[] = [];
    const pegar = (e: unknown) => { naoTratadas.push(e); };
    process.on("uncaughtException", pegar);
    try {
      for (const modo of ["falhar", "corrigir"] as const) {
        const b = await pipeline(modo, "/teste-da-guarda/trailer-inventado");
        expect(b.startsWith(modo === "falhar" ? "HTTP/1.1 500" : "HTTP/1.1 403")).toBe(true);
        expect(b).not.toContain("inventado_qa7");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    } finally {
      process.off("uncaughtException", pegar);
    }
    expect(naoTratadas).toEqual([]);
  });
});

describe("correção 7: as formas da rodada 7 sobre fd17ff4, por socket cru em pipeline", () => {
  const pipeline = async (modo: "falhar" | "corrigir", caminho: string): Promise<string> => {
    const porta = Number(new URL(await enderecoDe(modo)).port);
    return new Promise((ok) => {
      const s = connect(porta, "127.0.0.1", () => s.write(
        `GET ${caminho} HTTP/1.1\r\nhost: x\r\n\r\nGET /nada HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n`));
      let b = "";
      s.on("data", (d: Buffer) => { b += d.toString("latin1"); });
      s.on("error", () => {});
      const fim = setTimeout(() => s.destroy(), 4000);
      s.on("close", () => { clearTimeout(fim); ok(b); });
    });
  };
  const forjadas = (rs: RespostaLida[]) => rs.filter((x) => (x.status === 401 || x.status === 403) && x.corpo.includes("inventado_c7"));
  const doDesvio = (modo: "falhar" | "corrigir") => (modo === "falhar" ? "desvio_do_catalogo_de_erro" : "falha_interna");

  it.each(["c-webstream", "i-cl0-stream", "i-cl0-response", "i-cl0-webstream"])(
    "%s: sai só o corpo declarado e nenhum 403 inventado chega ao cliente", async (n) => {
      for (const modo of ["falhar", "corrigir"] as const) {
        const { respostas, resto } = lerRespostas(await pipeline(modo, `/c7/${n}`));
        expect(forjadas(respostas), `${modo} ${n}`).toEqual([]);
        expect(respostas, `${modo} ${n}`).toHaveLength(1);
        expect(respostas[0], `${modo} ${n}`).toMatchObject({ status: 200, corpo: n === "c-webstream" ? "{}" : "" });
        expect(resto).not.toContain("inventado_c7");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    });

  it("403 do contrato com content-length menor que o corpo: sai a resposta do desvio (o socket é desarrolhado)", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const { respostas } = lerRespostas(await pipeline(modo, "/c7/e-403-cl-menor"));
      expect(respostas.map((x) => x.status), modo).toEqual([modo === "falhar" ? 500 : 403]);
      expect(JSON.parse(respostas[0]!.corpo).erro).toBe(modo === "falhar" ? "desvio_do_catalogo_de_erro" : "so_o_dono");
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("addTrailers com chunked (red-team) fora do contrato: sai a resposta do desvio, sem exceção não tratada", async () => {
    const naoTratadas: unknown[] = [];
    const pegar = (e: unknown) => { naoTratadas.push(e); };
    process.on("uncaughtException", pegar);
    try {
      for (const modo of ["falhar", "corrigir"] as const) {
        const { respostas } = lerRespostas(await pipeline(modo, "/c7/tr-addtrailers-fora"));
        expect(respostas[0]!.status, modo).toBe(modo === "falhar" ? 500 : 403);
        expect(JSON.parse(respostas[0]!.corpo).erro).toBe(modo === "falhar" ? "desvio_do_catalogo_de_erro" : "so_o_dono");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    } finally {
      process.off("uncaughtException", pegar);
    }
    expect(naoTratadas).toEqual([]);
  });

  it.each(PROVISORIOS_COMO_FINAL)(
    "%s: o status 1xx como resposta final sai 500, e o pedido seguinte recebe a resposta dele", async (n) => {
      for (const modo of ["falhar", "corrigir"] as const) {
        const { respostas, resto } = lerRespostas(await pipeline(modo, `/c7/${n}`));
        expect(respostas.map((x) => x.status), `${modo} ${n}`).toEqual([500, 404]);
        expect(JSON.parse(respostas[0]!.corpo).erro).toBe(doDesvio(modo));
        expect(resto).toBe("");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    });

  it("1xx por baixo: o 101 por _writeRaw vira 500, e a resposta só com a provisória fecha a conexão", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const b101 = await pipeline(modo, "/c7/g-101-writeraw");
      expect(lerRespostas(b101).respostas.map((x) => x.status), modo).toEqual([500]);
      expect(b101).not.toContain("101 Switching");
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      const b102 = await pipeline(modo, "/c7/g-102-so-provisoria");
      expect(lerRespostas(b102).respostas.map((x) => x.status), modo).toEqual([102]);
      expect(b102).not.toContain("HTTP/1.1 404");
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("correção 7b: Early Hints com CR ou LF no valor sai 500 e o pedido seguinte recebe o dele, igual em Node 22 e 24", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const { respostas } = lerRespostas(await pipeline(modo, "/c7/f-early"));
      expect(respostas.map((x) => x.status), `${modo} em Node ${process.versions.node}`).toEqual([500, 404]);
      expect(forjadas(respostas)).toEqual([]);
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("correção 7b: o 103 legítimo antes do 403 do contrato passa intacto", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const { respostas } = lerRespostas(await pipeline(modo, "/c7/f-early-legitimo"));
      expect(respostas.map((x) => x.status), modo).toEqual([103, 403, 404]);
      expect(JSON.parse(respostas[1]!.corpo)).toEqual({ erro: "so_o_dono", mensagem: "x" });
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("correção 7b: a guarda recusa CR ou LF nas Early Hints em qualquer versão do Node, antes de qualquer byte", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const r = await consoles.get(modo)!.app.inject({ method: "GET", url: "/c7/f-early-recusa" });
      expect(r.json(), `${modo} em Node ${process.versions.node}`).toEqual({ codigo: "ERR_INVALID_CHAR", fila: 0 });
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("controle: 102 de verdade antes do 403 do contrato passa intacto, e o pedido seguinte recebe o dele", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const { respostas } = lerRespostas(await pipeline(modo, "/c7/g-102-e-final"));
      expect(respostas.map((x) => x.status), modo).toEqual([102, 403, 404]);
      expect(JSON.parse(respostas[1]!.corpo)).toEqual({ erro: "so_o_dono", mensagem: "x" });
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("DV-01: o valor de cabeçalho é lido uma vez, e o que a guarda confere é o que o Node escreve", () => {
  const bytesDe = async (modo: "falhar" | "corrigir", n: string): Promise<string> => {
    const porta = Number(new URL(await enderecoDe(modo)).port);
    return new Promise((ok) => {
      const s = connect(porta, "127.0.0.1", () => s.write(
        `GET /dv01/${n} HTTP/1.1\r\nhost: x\r\n\r\nGET /nada HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n`));
      let b = "";
      s.on("data", (d: Buffer) => { b += d.toString("latin1"); });
      s.on("error", () => {});
      const fim = setTimeout(() => s.destroy(), 4000);
      s.on("close", () => { clearTimeout(fim); ok(b); });
    });
  };
  const ate = (t: string) => t.slice(0, t.indexOf("\r\n\r\n"));

  it("403 do catálogo com cabeçalho de objeto: a guarda lê uma vez, e sai o texto lido", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const t = await bytesDe(modo, "contado-403");
      expect(leituras.n, modo).toBe(1);
      expect(t.startsWith("HTTP/1.1 403"), modo).toBe(true);
      expect(ate(t), modo).toContain("x-contado: valor-comum");
      expect(lerRespostas(t).respostas.map((x) => x.status), modo).toEqual([403, 404]);
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("cabeçalho posto por setHeader da resposta crua: o Node lê uma vez ao receber, a guarda uma ao entregar (duas no total)", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const t = await bytesDe(modo, "contado-setheader-403");
      expect(leituras.antes, modo).toBe(1);
      expect(leituras.n - leituras.antes, `${modo}: leituras da guarda`).toBe(1);
      expect(ate(t), modo).toContain("x-contado: valor-comum");
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("lista de objetos e frase da linha de status: cada elemento é lido uma vez", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const lista = await bytesDe(modo, "contado-lista-403");
      expect(leituras.n, `${modo} lista`).toBe(2);
      expect(ate(lista), modo).toMatch(/x-lista: a\r\nx-lista: b|x-lista: a, b/);
      const frase = await bytesDe(modo, "contado-frase-403");
      expect(leituras.n, `${modo} frase`).toBe(1);
      expect(frase.startsWith("HTTP/1.1 403 Frase Comum\r\n"), modo).toBe(true);
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("o desvio também lê o valor uma vez, e a resposta trocada leva o texto lido", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const t = await bytesDe(modo, "contado-desvio");
      expect(leituras.n, modo).toBe(1);
      expect(t.startsWith(`HTTP/1.1 ${modo === "falhar" ? 500 : 403}`), modo).toBe(true);
      expect(ate(t), modo).toContain("x-contado: valor-comum");
      expect(t, modo).not.toContain("fora_do_catalogo_dv01");
      expect(lerDesviosDaGuarda(), modo).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("valor que muda a cada leitura (403 do catálogo): sai a primeira leitura, numa resposta só, em uma leitura da guarda", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const t = await bytesDe(modo, "muda-403");
      expect(leituras.n, modo).toBe(1);
      expect(ate(t), modo).toContain("x-muda: um");
      expect(t, modo).not.toContain("x-y: z");
      expect(lerRespostas(t).respostas.map((x) => x.status), modo).toEqual([403, 404]);
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("valor que muda posto por setHeader: o Node leu a primeira, a guarda lê a segunda UMA vez, vê o fim de cabeçalho e troca a resposta", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const t = await bytesDe(modo, "muda-setheader-403");
      expect(leituras.antes, modo).toBe(1);
      expect(leituras.n - leituras.antes, modo).toBe(1);
      expect(t, modo).not.toContain("x-y: z");
      const { respostas } = lerRespostas(t);
      expect(respostas.map((x) => x.status), modo).toEqual([modo === "falhar" ? 500 : 403, 404]);
      expect(lerDesviosDaGuarda(), modo).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("segunda rede: a cabeça que o Node montou com o fim de cabeçalho no meio (200 que não é segurada) vira a resposta do desvio", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const t = await bytesDe(modo, "muda-200");
      const { respostas } = lerRespostas(t);
      expect(respostas[0]!.status, modo).toBe(modo === "falhar" ? 500 : 403);
      expect(t, modo).not.toContain("x-y: z");
      expect(respostas.filter((x) => x.status === 200), modo).toEqual([]);
      const desvios = lerDesviosDaGuarda();
      expect(desvios, modo).toHaveLength(modo === "falhar" ? 1 : 0);
      if (modo === "falhar") expect(desvios[0]!.motivo).toContain("CRLF CRLF");
    }
  });

  it("segunda rede, sem cabeçalho de objeto: `_header` com o fim de cabeçalho no meio é trocado, e o inteiro passa (controle)", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const inteira = lerRespostas(await bytesDe(modo, "cabeca-inteira-200")).respostas;
      expect(inteira.map((x) => x.status), modo).toEqual([200, 404]);
      expect(inteira[0]!.corpo, modo).toBe("0123456789");
      expect(lerDesviosDaGuarda(), `${modo} controle`).toEqual([]);
      const partida = lerRespostas(await bytesDe(modo, "cabeca-partida-200")).respostas;
      expect(partida.filter((x) => x.status === 200), modo).toEqual([]);
      expect(partida[0]!.status, modo).toBe(modo === "falhar" ? 500 : 403);
      expect(lerDesviosDaGuarda(), modo).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("Early Hints: cada valor é lido uma vez (propriedade comum e getter), e o 103 leva o texto", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      for (const n of ["early-contado", "early-getter"]) {
        const t = await bytesDe(modo, n);
        const { respostas } = lerRespostas(t);
        expect(respostas.map((x) => x.status), `${modo} ${n}`).toEqual([103, 200, 404]);
        expect(JSON.parse(respostas[1]!.corpo), `${modo} ${n}`).toEqual({ lidas: 1 });
        expect(ate(t), `${modo} ${n}`).toMatch(/x-[sg]: dica-comum/);
      }
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("DV-03: a conferência do corpo é linear no tamanho do texto", () => {
  const aspas = (n: number) => `{"erro":"so_o_dono","mensagem":"${"\\\"".repeat(n)}"}`;
  const ms = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };

  it("60 KB de aspas escapadas (levava cerca de 1 s) e 1 MB conferem em tempo curto, com o mesmo resultado", () => {
    const sessenta = aspas(30_000);
    expect(sessenta.length).toBeGreaterThan(60_000);
    expect(conferirCorpoDeAcesso(403, sessenta, CONTRATO_DE_ACESSO_DO_CONSOLE)).toBeNull();
    expect(ms(() => conferirCorpoDeAcesso(403, sessenta, CONTRATO_DE_ACESSO_DO_CONSOLE))).toBeLessThan(100);
    const grande = aspas(500_000);
    expect(ms(() => conferirCorpoDeAcesso(403, grande, CONTRATO_DE_ACESSO_DO_CONSOLE))).toBeLessThan(1500);
  });

  it("muitas chaves curtas e uma cadeia sem chave também ficam em tempo curto", () => {
    const chaves = `{"erro":"so_o_dono",${Array.from({ length: 20_000 }, (_, i) => `"k${i}":${i}`).join(",")}}`;
    expect(conferirCorpoDeAcesso(403, chaves, CONTRATO_DE_ACESSO_DO_CONSOLE)).toBeNull();
    expect(ms(() => conferirCorpoDeAcesso(403, chaves, CONTRATO_DE_ACESSO_DO_CONSOLE))).toBeLessThan(500);
    const lista = `{"erro":"so_o_dono","itens":[${Array.from({ length: 20_000 }, () => '"a\\"b"').join(",")}]}`;
    expect(ms(() => conferirCorpoDeAcesso(403, lista, CONTRATO_DE_ACESSO_DO_CONSOLE))).toBeLessThan(500);
  });

  it.each([
    ['{"erro":"so_o_dono","mensagem":"texto com \\"erro\\": 1 dentro"}', null],
    ['{"a\\"b":"x","erro":"so_o_dono"}', null],
    ['{ "erro"\n\t: "so_o_dono" }', null],
    ['{"erro":"so_o_dono","\\u0065rro":"x"}', "repetida"],
    ['{"erro":"so_o_dono","\\u0065\\u0072\\u0072\\u006f"\r\n:"x"}', "repetida"],
    ['{"erro":"so_o_dono","a":{"b":[{"erro" :1}]}}', "repetida"],
    ['{"erro":"so_o_dono","errou":1,"err":2,"erros":3}', null],
  ] as const)("contagem de chaves `erro`: %s", (texto, motivo) => {
    const r = conferirCorpoDeAcesso(403, texto, CONTRATO_DE_ACESSO_DO_CONSOLE);
    if (motivo === null) expect(r).toBeNull();
    else expect(r?.motivo).toContain(motivo);
  });
});
