import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
const raiz = process.argv[2];
const h = (s) => createHash("sha256").update(s).digest("hex");
for (const p of process.argv.slice(3)) {
  const dir = `${raiz}/docs/evidencias-v2/${/^(G00|CP-)/.test(p) ? "" : "G00/"}${p}`;
  for (const l of readFileSync(`${dir}/INDEX.md`, "utf8").split("\n")) {
    const m = l.match(/^\| (.+) \| ([0-9a-f]{64}) \|$/); if (!m) continue;
    if (/^(VEREDITO|RISCO-ACEITO)\.md$|^validacao\//.test(m[1])) continue;
    const b = readFileSync(`${dir}/${m[1]}`); if (h(b) === m[2]) continue;
    const t = b.toString("utf8").replace(/\r\n/g, "\n");
    const tipo = h(t) === m[2] ? "so-LF" : h(t.replace(/\n/g, "\r\n")) === m[2] ? "so-CRLF" : "MISTO-OU-OUTRO";
    console.log(tipo, b.length, (t.match(/\n/g)||[]).length + " linhas", p + "/" + m[1]);
  }
}
