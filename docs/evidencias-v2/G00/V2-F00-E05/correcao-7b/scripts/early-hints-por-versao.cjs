const { ServerResponse, IncomingMessage } = require("node:http");
const { Socket } = require("node:net");
const r = new ServerResponse(new IncomingMessage(new Socket()));
try { r.writeEarlyHints({ link: "</a>; rel=preload", "x-s": "a\r\n\r\nHTTP/1.1 403 X" }); console.log(process.version, "escreveu", JSON.stringify(r.outputData.map(x=>String(x.data)))); } catch (e) { console.log(process.version, "recusou", e.code); }
