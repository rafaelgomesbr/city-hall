import http from "node:http";
const modo = process.argv[2] ?? "vazio";
http.createServer((req, res) => {
  let corpo = ""; req.on("data", (c) => corpo += c); req.on("end", () => {
    console.error(`${req.method} ${req.url}`);
    if (modo === "vazio") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); }
    else if (modo === "404") { res.writeHead(404); res.end("not found"); }
    else if (modo === "html") { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>proxy</html>"); }
  });
}).listen(Number(process.argv[3] ?? 48731), "127.0.0.1");
