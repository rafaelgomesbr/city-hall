// Para cada documento dado, lista as referências a arquivo entre crases que não existem no repositório.
// Uso (da raiz do repositório): node .../referencias-a-arquivo.mjs <documento>...   (o git ls-files é a fonte)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const arquivos = execSync("git ls-files", { maxBuffer: 1e8 }).toString().split("\n").filter(Boolean);
const conjunto = new Set(arquivos);
const nomes = new Set(arquivos.map((f) => path.basename(f)));
const bases = ["", "dc360", "dc360/apps/api", "dc360/apps/web", "dc360/apps/campo", "dc360/db", "dc360/packages/shared",
  "dc360/apps/api/src", "dc360/apps/campo/src", "dc360/apps/web/src", "dc360/apps/console", "dc360/apps/console/src"];
for (const d of process.argv.slice(2)) {
  readFileSync(d, "utf8").split("\n").forEach((linha, i) => {
    for (const m of linha.matchAll(/`([^`\s]+)`/g)) {
      const r = m[1].replace(/[:#]\d+(-\d+)?$/, "").replace(/[.,;)]+$/, "");
      if (!/\.(ts|tsx|mjs|js|md|sql|json|yml|yaml|toml|html|css|txt|csv|sh|ps1|zip)$/.test(r) && !r.endsWith("/")) continue;
      if (/[*<>{}$|]/.test(r) || r.startsWith("http") || r.startsWith("@") || r.startsWith("-")) continue;
      const candidatos = [r, ...bases.map((b) => path.normalize(path.join(path.dirname(d), r))), ...bases.map((b) => path.normalize(path.join(b, r)))];
      const existe = candidatos.some((c) => conjunto.has(c) || (r.endsWith("/") && arquivos.some((f) => f.startsWith(c))))
        || (!r.includes("/") && nomes.has(path.basename(r)));
      if (!existe) console.log(`${d}:${i + 1}: ${m[1]}`);
    }
  });
}
