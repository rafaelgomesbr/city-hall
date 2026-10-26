import http from "node:http";
const casos = [403.5, "403", "403.2", "0x193", 403 + 2**32, -4294966893, [403], {valueOf(){return 401.9}}, " 403 ", true, null];
const s = http.createServer((req, res) => {
  const i = Number(req.url.slice(1));
  try { res.writeHead(casos[i], {"content-type":"text/plain"}); res.end("x"); }
  catch (e) { res.writeHead(599); res.end(String(e.code)); }
});
s.listen(5640, async () => {
  for (let i = 0; i < casos.length; i++) {
    const r = await fetch(`http://127.0.0.1:5640/${i}`);
    console.log(JSON.stringify(casos[i]) ?? String(casos[i]), "->", r.status, await r.text());
  }
  s.close();
});
