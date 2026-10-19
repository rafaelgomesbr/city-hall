// Procura o travessão (U+2014) nos arquivos que o git vê como alterados em dc360/ e em docs/evidencias-v2/G00/V2-F00-E22,
// menos os de teste (de outra correção; o portão de conteúdo é quem cuida deles).
// Uso (da raiz do repositório): node .../travessao-nos-arquivos-tocados.mjs
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const tocados = execSync("git status --porcelain -- dc360 docs/evidencias-v2/G00/V2-F00-E22", { encoding: "utf8" })
  .split("\n").filter(Boolean).map((l) => l.slice(3)).filter((f) => !f.includes("/test/"));
let achados = 0;
for (const f of tocados) {
  if (!existsSync(f) || f.endsWith("/")) continue;
  readFileSync(f, "utf8").split("\n").forEach((linha, i) => { if (linha.includes("\u2014")) { console.log(`${f}:${i + 1}`); achados++; } });
}
console.log(`${tocados.length} arquivo(s) alterado(s) conferido(s); travessao U+2014: ${achados} acerto(s)`);
