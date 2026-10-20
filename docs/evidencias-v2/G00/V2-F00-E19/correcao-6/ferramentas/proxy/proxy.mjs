// Proxy de inspeção TLS (como o de rede corporativa): repassa ao registro real a consulta
// que só tem lodash (a de controle) e responde {} a toda outra consulta de advisories.
import http from "node:http"; import https from "node:https"; import tls from "node:tls";
import { readFileSync, appendFileSync } from "node:fs"; import zlib from "node:zlib";
const D = "/tmp/e19c6/proxy/"; const LOG = D + "proxy.log";
const ctx = { key: readFileSync(D + "key.pem"), cert: readFileSync(D + "cert.pem") };
const interno = http.createServer((req, res) => {
  const pedacos = []; req.on("data", (c) => pedacos.push(c)); req.on("end", () => {
    let corpo = Buffer.concat(pedacos);
    if (req.url.includes("/security/advisories/bulk")) {
      let txt = corpo; if (req.headers["content-encoding"] === "gzip") txt = zlib.gunzipSync(corpo);
      const pacotes = Object.keys(JSON.parse(txt.toString()));
      const controle = pacotes.length === 1 && pacotes[0] === "lodash";
      appendFileSync(LOG, `bulk pacotes=${pacotes.length} ${controle ? "CONTROLE->real" : "FORJADO {}"}\n`);
      if (!controle) { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}"); }
    } else appendFileSync(LOG, `outro ${req.method} ${req.url}\n`);
    const h = { ...req.headers, host: "registry.npmjs.org" };
    const up = https.request({ host: "registry.npmjs.org", port: 443, path: req.url, method: req.method, headers: h }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    up.on("error", (e) => { res.writeHead(502); res.end(String(e)); }); up.end(corpo);
  });
});
const proxy = http.createServer((q, s) => { s.writeHead(405); s.end(); });
proxy.on("connect", (req, sock) => {
  sock.write("HTTP/1.1 200 Connection Established\r\n\r\n");
  const t = new tls.TLSSocket(sock, { isServer: true, ...ctx });
  interno.emit("connection", t);
});
proxy.listen(5661, "127.0.0.1", () => appendFileSync(LOG, "pronto\n"));
