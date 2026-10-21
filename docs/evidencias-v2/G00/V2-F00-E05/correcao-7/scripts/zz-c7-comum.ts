// Sonda da correção 7 da E05: as variantes dos relatórios da rodada 7 (seguranca-aplicacao, red-team e qa
// sobre fd17ff4), por socket TCP cru, com dois pedidos em pipeline no mesmo socket, nos dois modos.
// Roda FORA do vitest, num processo próprio e SEM tratador de `uncaughtException`: se alguma variante
// derrubar o processo, a saída termina sem a linha final "processo de pé" e o código de saída não é 0.
import type { FastifyInstance, FastifyReply } from "fastify";
import { connect } from "node:net";
import { Readable } from "node:stream";

export const CORPO_FALSO = JSON.stringify({ erro: "inventado_c7", mensagem: "x" });
export const CABECA_FALSA = `HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(CORPO_FALSO)}\r\n\r\n`;
const crua = (rep: FastifyReply) => { const k = "ra" + "w"; return (rep as unknown as Record<string, any>)[k]; };

/** As variantes: [nome, o que se espera de uma guarda certa]. */
export function plantar(app: FastifyInstance, codigoDoCatalogo: string): void {
  const ok = JSON.stringify({ erro: codigoDoCatalogo, mensagem: "x" });
  const r = (n: string) => `/c7/${n}`;
  const contrabando = "{}" + CABECA_FALSA + CORPO_FALSO;
  // Corpo maior que o content-length, pela API pública.
  app.get(r("a-stream"), async (_q, rep) => rep.code(200).header("content-length", "2").type("application/json").send(Readable.from([Buffer.from(contrabando)])));
  app.get(r("b-response"), async (_q, rep) => rep.send(new Response(contrabando, { status: 200, headers: { "content-length": "2", "content-type": "application/json" } })));
  app.get(r("c-webstream"), async (_q, rep) => rep.code(200).header("content-length", "2").send(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(contrabando)); c.close(); } })));
  app.get(r("d-buffer"), async (_q, rep) => rep.code(200).header("content-length", "2").type("application/json").send(Buffer.from(contrabando)));
  // content-length: 0 com o corpo inteiro sendo a resposta falsa.
  app.get(r("i-cl0-stream"), async (_q, rep) => rep.code(200).header("content-length", "0").send(Readable.from([Buffer.from(CABECA_FALSA + CORPO_FALSO)])));
  app.get(r("i-cl0-response"), async (_q, rep) => rep.send(new Response(CABECA_FALSA + CORPO_FALSO, { status: 200, headers: { "content-length": "0" } })));
  app.get(r("i-cl0-webstream"), async (_q, rep) => rep.code(200).header("content-length", "0").send(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(CABECA_FALSA + CORPO_FALSO)); c.close(); } })));
  // 403 do catálogo com content-length menor e maior que o corpo.
  app.get(r("e-403-cl-menor"), async (_q, rep) => rep.code(403).header("content-length", "2").type("application/json").send(Readable.from([Buffer.from(ok)])));
  app.get(r("e-403-cl-maior"), async (_q, rep) => rep.code(403).header("content-length", "500").type("application/json").send(Readable.from([Buffer.from(ok)])));
  app.get(r("e-200-cl-maior"), async (_q, rep) => rep.code(200).header("content-length", "500").type("application/json").send(Readable.from([Buffer.from("{}")])));
  // Early Hints com CRLF no valor.
  app.get(r("f-early"), async (_q, rep) => { await rep.writeEarlyHints({ link: "</a.css>; rel=preload", "x-s": "a\r\n\r\n" + CABECA_FALSA + CORPO_FALSO }); return { ok: true }; });
  // Status 1xx como resposta final, pela API pública e pela resposta crua.
  for (const s of [100, 101, 102, 103, 199]) app.get(r(`g-${s}`), async (_q, rep) => rep.code(s).send(CABECA_FALSA + CORPO_FALSO));
  app.get(r("g-102-objeto"), async (_q, rep) => rep.code(102).send({ erro: "inventado_c7", mensagem: "x" }));
  app.get(r("g-102-raw-writehead"), async (_q, rep) => { rep.hijack(); const x = crua(rep); x.writeHead(102); x.end(CORPO_FALSO); });
  app.get(r("g-102-raw-implicito"), async (_q, rep) => { rep.hijack(); const x = crua(rep); x.statusCode = 102; x.end(CORPO_FALSO); });
  // 1xx por baixo de writeHead: 101 pela porta dos bytes, e uma resposta que termina só com a provisória.
  app.get(r("g-101-writeraw"), async (_q, rep) => { rep.hijack(); const x = crua(rep); x._writeRaw("HTTP/1.1 101 Switching Protocols\r\n\r\n"); x._header = "x"; x._headerSent = true; x.end(); });
  app.get(r("g-102-so-provisoria"), async (_q, rep) => { rep.hijack(); const x = crua(rep); x.writeProcessing(); x._header = "x"; x._headerSent = true; x.end(); });
  // Controle: 102 de verdade (writeProcessing) seguido da resposta final do catálogo.
  app.get(r("g-102-e-final"), async (_q, rep) => { crua(rep).writeProcessing(); return rep.code(403).type("application/json").send(ok); });
  // transfer-encoding forjado, 204 e 304 com fluxo.
  app.get(r("h-te-identity"), async (_q, rep) => rep.code(200).header("transfer-encoding", "identity").send(Readable.from([Buffer.from(contrabando)])));
  app.get(r("j-204"), async (_q, rep) => rep.code(204).send(Readable.from([Buffer.from(CABECA_FALSA + CORPO_FALSO)])));
  app.get(r("k-304"), async (_q, rep) => rep.code(304).send(Readable.from([Buffer.from(CABECA_FALSA + CORPO_FALSO)])));
  // Trailer: `reply.trailer` (Segurança, QA) e `addTrailers` cru com chunked (red-team).
  app.get(r("tr-reply-fora"), async (_q, rep) => rep.code(403).trailer("x-t", (_a, _b, feito) => feito(null, "v")).send({ erro: "inventado_c7", mensagem: "x" }));
  app.get(r("tr-reply-catalogo"), async (_q, rep) => rep.code(403).trailer("x-t", (_a, _b, feito) => feito(null, "v")).send(JSON.parse(ok)));
  app.get(r("tr-addtrailers-fora"), async (_q, rep) => {
    rep.code(403).header("transfer-encoding", "chunked").header("trailer", "x-t").type("application/json");
    crua(rep).addTrailers({ "x-t": "v" });
    return rep.send(CORPO_FALSO);
  });
  app.get(r("tr-addtrailers-catalogo"), async (_q, rep) => {
    rep.code(403).header("transfer-encoding", "chunked").header("trailer", "x-t").type("application/json");
    crua(rep).addTrailers({ "x-t": "v" });
    return rep.send(ok);
  });
  app.get(r("tr-addtrailers-cl"), async (_q, rep) => {
    rep.hijack(); const x = crua(rep);
    x.writeHead(403, { "content-type": "application/json", "content-length": String(CORPO_FALSO.length) });
    x.addTrailers({ "x-t": "v" }); x.end(CORPO_FALSO);
  });
  // writeHead(403) mais flushHeaders, e setHeader mais flushHeaders com 401.
  app.get(r("flush-403-fora"), async (_q, rep) => { rep.hijack(); const x = crua(rep); x.writeHead(403, { "content-type": "application/json" }); x.flushHeaders(); x.end(CORPO_FALSO); });
  app.get(r("flush-403-catalogo"), async (_q, rep) => { rep.hijack(); const x = crua(rep); x.writeHead(403, { "content-type": "application/json" }); x.flushHeaders(); x.end(ok); });
  app.get(r("flush-401-publico"), async (_q, rep) => { rep.code(401); crua(rep).flushHeaders(); return rep.send({ erro: "inventado_c7", mensagem: "x" }); });
  // Controles.
  app.get(r("z-ok"), async (_q, rep) => rep.code(403).type("application/json").send(ok));
  app.get(r("z-ruim"), async (_q, rep) => rep.code(403).send({ erro: "inventado_direto", mensagem: "x" }));
  app.get(r("segundo"), async () => ({ segundo: true }));
}

export const VARIANTES = [
  "a-stream", "b-response", "c-webstream", "d-buffer", "i-cl0-stream", "i-cl0-response", "i-cl0-webstream",
  "e-403-cl-menor", "e-403-cl-maior", "e-200-cl-maior", "f-early", "g-100", "g-101", "g-102", "g-103", "g-199", "g-102-objeto",
  "g-102-raw-writehead", "g-102-raw-implicito", "g-101-writeraw", "g-102-so-provisoria", "g-102-e-final", "h-te-identity", "j-204", "k-304",
  "tr-reply-fora", "tr-reply-catalogo", "tr-addtrailers-fora", "tr-addtrailers-catalogo", "tr-addtrailers-cl",
  "flush-403-fora", "flush-403-catalogo", "flush-401-publico", "z-ok", "z-ruim",
];

/** Dois pedidos em pipeline: a variante e um GET comum (`/c7/segundo`, que responde `{"segundo":true}`). */
export function pipeline(porta: number, caminho: string): Promise<Buffer> {
  return new Promise((ok) => {
    const s = connect(porta, "127.0.0.1", () => s.write(
      `GET ${caminho} HTTP/1.1\r\nhost: x\r\n\r\nGET /c7/segundo HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n`));
    const partes: Buffer[] = [];
    s.on("data", (d: Buffer) => partes.push(d));
    s.on("error", () => {});
    const fim = setTimeout(() => s.destroy(), 2500);
    s.on("close", () => { clearTimeout(fim); ok(Buffer.concat(partes)); });
  });
}

type Lida = { status: number; linha: string; corpo: string };
/** As respostas como um cliente HTTP/1.1 em pipeline as leria (1xx, 204 e 304 sem corpo). */
export function ler(b: Buffer): { respostas: Lida[]; resto: string } {
  const t = b.toString("latin1");
  const respostas: Lida[] = [];
  let i = 0;
  while (i < t.length && t.startsWith("HTTP/", i)) {
    const fim = t.indexOf("\r\n\r\n", i);
    if (fim < 0) break;
    const cab = t.slice(i, fim);
    const linha = cab.split("\r\n")[0]!;
    const status = Number(linha.split(" ")[1]);
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
    respostas.push({ status, linha, corpo });
    if (status === 101) { j = t.length; corpo = t.slice(fim + 4); respostas[respostas.length - 1]!.corpo = corpo; }
    i = j;
  }
  return { respostas, resto: t.slice(i) };
}

/**
 * O veredito do que o cliente leria:
 * - ESCAPOU: alguma resposta 401/403 com o código inventado;
 * - DESSINCRONIZOU: um 101 que ninguém pediu, a resposta do pedido 1 (a primeira final, que é >= 200 ou 101) é a do pedido 2,
 *   ou há mais de duas finais, ou a segunda não é a do pedido 2, ou sobram bytes que não são resposta;
 * - ok: nenhum dos dois.
 */
export function veredito(b: Buffer): { escapou: boolean; dessincronizou: boolean; resumo: string } {
  const { respostas, resto } = ler(b);
  const finais = respostas.filter((x) => x.status >= 200 || x.status === 101);
  const escapou = respostas.some((x) => (x.status === 401 || x.status === 403) && /inventado/.test(x.corpo));
  const ehSegundo = (x?: Lida) => !!x && x.status === 200 && x.corpo.includes("\"segundo\":true");
  // 101 sem pedido de troca de protocolo: o cliente para de ler HTTP, e a resposta do pedido 2 se perde.
  const dessincronizou = respostas.some((x) => x.status === 101) || (finais.length > 0 && ehSegundo(finais[0]))
    || finais.length > 2 || (finais.length === 2 && !ehSegundo(finais[1]))
    || (resto.length > 0 && /HTTP\/1\.\d \d{3}/.test(resto));
  const resumo = respostas.map((x) => `[${x.linha}] ${JSON.stringify(x.corpo.slice(0, 90))}${x.corpo.length > 90 ? `(+${x.corpo.length - 90})` : ""}`).join(" | ")
    + (resto ? ` | resto=${JSON.stringify(resto.slice(0, 120))}` : "");
  return { escapou, dessincronizou, resumo };
}
