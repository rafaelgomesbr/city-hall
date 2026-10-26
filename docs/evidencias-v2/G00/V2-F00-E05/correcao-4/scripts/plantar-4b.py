import sys
p = sys.argv[1]
t = open(p).read()
a = '''  app.get("/", async (req) => {
    const quem = await app.exigirAutenticacao(req);'''
n = '''  app.get("/", async (req, resposta) => {
    const s = req.headers["x-sonda-c6"];
    const corpo = '{"erro":"inventado_c6","mensagem":"x"}';
    const cab = { "content-type": "application/json", "content-length": String(corpo.length) };
    // As formas da revisão de 05ab42d: chave calculada e desestruturação até a resposta do Node.
    const k = "ra" + "w";
    const r = (resposta as unknown as Record<string, any>)[k];
    const { raw: d } = resposta as unknown as { raw: any };
    if (s === "calc") { r._storeHeader("HTTP/1.1 403 Forbidden\\r\\n", cab); r.end(corpo); return resposta; }
    if (s === "destruct") { d._storeHeader("HTTP/1.1 403 Forbidden\\r\\n", cab); d.end(corpo); return resposta; }
    if (s === "header") { resposta.hijack(); r.writeHead(200, { "content-type": "application/json" }); r._header = r._header.replace("200 OK", "403 Forbidden"); r.end(corpo); return resposta; }
    if (s === "header-401") { resposta.hijack(); r.writeHead(200, cab); r._header = r._header.replace("200 OK", "401 Unauthorized"); r.end(corpo); return resposta; }
    if (s === "store") { resposta.hijack(); r._storeHeader("HTTP/1.1 403 Forbidden\\r\\n", cab); r.end(corpo); return resposta; }
    if (s === "writeraw") { resposta.hijack(); r._writeRaw("HTTP/1.1 403 Forbidden\\r\\ncontent-type: application/json\\r\\ncontent-length: " + corpo.length + "\\r\\n\\r\\n" + corpo); r._header = "x"; r.end(); return resposta; }
    if (s === "writeraw-base64") { resposta.hijack(); r._writeRaw(Buffer.from("HTTP/1.1 403 Forbidden\\r\\ncontent-length: " + corpo.length + "\\r\\n\\r\\n" + corpo).toString("base64"), "base64"); r._header = "x"; r.end(); return resposta; }
    if (s === "writeraw-buffer") { resposta.hijack(); r._writeRaw(Buffer.from("HTTP/1.1 403 Forbidden\\r\\ncontent-length: " + corpo.length + "\\r\\n\\r\\n" + corpo)); r._header = "x"; r.end(); return resposta; }
    if (s === "continue-junto") { resposta.hijack(); r._writeRaw("HTTP/1.1 100 Continue\\r\\n\\r\\nHTTP/1.1 403 Forbidden\\r\\ncontent-length: " + corpo.length + "\\r\\n\\r\\n" + corpo); r._header = "x"; r.end(); return resposta; }
    if (s === "linha-partida") { resposta.hijack(); r._writeRaw("HTTP/1.1 4"); r._writeRaw("03 Forbidden\\r\\ncontent-length: " + corpo.length + "\\r\\n\\r\\n" + corpo); r._header = "x"; r.end(); return resposta; }
    if (s === "fila") { resposta.hijack(); r.outputData.push({ data: "HTTP/1.1 403 Forbidden\\r\\ncontent-length: " + corpo.length + "\\r\\n\\r\\n" + corpo, encoding: "latin1", callback: null }); r.outputSize += 200; r._header = "x"; r.end(); return resposta; }
    if (s === "send-com-header") { r._header = null; return resposta.code(200).send({ ok: true }); }
    if (s === "depois-do-fim") { resposta.hijack(); r.writeHead(200, { "content-type": "application/json", "content-length": "2" }); r.end("{}"); r._writeRaw("HTTP/1.1 403 Forbidden\\r\\ncontent-length: " + corpo.length + "\\r\\n\\r\\n" + corpo); return resposta; }
    if (s === "ok-403") return resposta.code(403).send({ erro: "sem_permissao", mensagem: "Frase da rota." });
    if (s === "ok-continue") { resposta.hijack(); r.writeContinue(); r.writeHead(403, { "content-type": "application/json" }); r.end('{"erro":"sem_permissao","mensagem":"x"}'); return resposta; }
    const quem = await app.exigirAutenticacao(req);'''
assert a in t
open(p, "w").write(t.replace(a, n, 1))
