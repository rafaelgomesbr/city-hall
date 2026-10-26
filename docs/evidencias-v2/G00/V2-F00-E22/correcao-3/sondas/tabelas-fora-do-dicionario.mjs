// Lista as tabelas e visões do esquema `public` que o dicionário de dados não cita entre crases.
// Uso (da raiz do repositório): node docs/evidencias-v2/G00/V2-F00-E22/correcao-3/sondas/tabelas-fora-do-dicionario.mjs
import { PGlite } from "../../../../../../dc360/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const pasta = join(aqui, "../../../../../../dc360/db/migrations");
const db = new PGlite();
for (const f of readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(pasta, f), "utf8"));
const t = await db.query(
  "SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') ORDER BY 1",
);
const dic = readFileSync(join(aqui, "../../../../../../dc360/docs/DICIONARIO-DE-DADOS.md"), "utf8");
let fora = 0;
for (const r of t.rows) {
  if (!dic.includes("`" + r.relname + "`")) { console.log(`fora do dicionario: ${r.relname} (${r.relkind})`); fora++; }
}
console.log(`${t.rows.length} relacoes no esquema, ${fora} fora do dicionario`);
