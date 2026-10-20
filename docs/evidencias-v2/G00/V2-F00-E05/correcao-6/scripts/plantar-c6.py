import sys
p = sys.argv[1]
t = open(p).read()
a = '''  app.get("/", async (req) => {
    const quem = await app.exigirAutenticacao(req);'''
n = '''  app.get("/", async (req, resposta) => {
    const s = req.headers["x-qa7"];
    const corpo = JSON.stringify({ erro: "inventado_qa7", mensagem: "x" });
    const cabeca = `HTTP/1.1 403 Forbidden\\r\\ncontent-type: application/json\\r\\ncontent-length: ${corpo.length}\\r\\n\\r\\n`;
    const r = (resposta as unknown as Record<string, any>)["ra" + "w"];
    // As formas do QA da rodada 7: só a API pública do Fastify.
    if (s === "cl-stream") return resposta.code(200).header("content-length", "2").type("application/json").send(Readable.from([Buffer.from("{}" + cabeca + corpo)]));
    if (s === "cl-response") return resposta.send(new Response("{}" + cabeca + corpo, { status: 200, headers: { "content-type": "application/json", "content-length": "2" } }));
    // Variações.
    if (s === "cl-stream-pedacos") return resposta.code(200).header("content-length", "2").type("application/json").send(Readable.from(["{", "}", cabeca, corpo]));
    if (s === "cl-buffer") return resposta.code(200).header("content-length", "2").type("application/json").send(Buffer.from("{}" + cabeca + corpo));
    if (s === "cl-string") return resposta.code(200).header("content-length", "2").type("application/json").send("{}" + cabeca + corpo);
    if (s === "cl-raw-write") { resposta.hijack(); r.writeHead(200, { "content-length": "2" }); r.write("{}" + cabeca + corpo); r.end(); return resposta; }
    if (s === "cl-raw-end") { resposta.hijack(); r.writeHead(200, { "content-length": "2" }); r.end("{}" + cabeca + corpo); return resposta; }
    if (s === "cl-writeraw") { resposta.hijack(); r.writeHead(200, { "content-length": "2" }); r.write("{}"); r._writeRaw(cabeca + corpo); r.end(); return resposta; }
    if (s === "chunked-depois-do-terminador") { resposta.hijack(); r.writeHead(200, { "content-type": "application/json" }); r.write("{}"); r._writeRaw("0\\r\\n\\r\\n" + cabeca + corpo); r.end(); return resposta; }
    if (s === "te-forjado-stream") return resposta.code(200).header("transfer-encoding", "chunked").type("application/json").send(Readable.from(["0\\r\\n\\r\\n" + cabeca + corpo]));
    if (s === "te-identity") return resposta.code(200).header("transfer-encoding", "identity").type("application/json").send(Readable.from(["{}" + cabeca + corpo]));
    if (s === "cl-e-te") return resposta.code(200).header("content-length", "2").header("transfer-encoding", "chunked").type("application/json").send(Readable.from(["{}" + cabeca + corpo]));
    if (s === "cl-menor-que-o-corpo-403") return resposta.code(403).header("content-length", "2").type("application/json").send(Readable.from([corpo]));
    if (s === "trailer-inventado") return resposta.code(403).trailer("x-t", async () => "y").send({ erro: "inventado_qa7", mensagem: "x" });
    if (s === "trailer-catalogo") return resposta.code(403).trailer("x-t", async () => "y").send({ erro: "sem_permissao", mensagem: "x" });
    if (s === "flush-403") { resposta.hijack(); r.writeHead(403, { "content-type": "application/json" }); r.flushHeaders(); r.end(corpo); return resposta; }
    if (s === "flush-403-catalogo") { resposta.hijack(); r.writeHead(403, { "content-type": "application/json" }); r.flushHeaders(); r.end('{"erro":"sem_permissao","mensagem":"x"}'); return resposta; }
    // Controles legítimos: ZIP em fluxo sem content-length, PDF em Buffer, stream com content-length certo.
    if (s === "zip") return resposta.type("application/zip").header("content-disposition", "attachment").send(Readable.from((function* () { for (let i = 0; i < 50; i += 1) yield Buffer.alloc(4096, i); })()));
    if (s === "pdf") return resposta.type("application/pdf").send(Buffer.alloc(300000, 7));
    if (s === "stream-cl-certo") return resposta.header("content-length", "8").type("text/plain").send(Readable.from(["abcd", "efgh"]));
    const quem = await app.exigirAutenticacao(req);'''
assert a in t
t = t.replace(a, n, 1)
t = t.replace('import { z } from "zod";', 'import { z } from "zod";\nimport { Readable } from "node:stream";', 1)
open(p, "w").write(t)
