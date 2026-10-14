// copia do script do scratchpad (c2r3/ci/sql.mjs): o papel do psql do CI, que nao ha psql nesta maquina

// Uso: node sql.mjs <url> "<comando>" : o papel do psql -v ON_ERROR_STOP=1 -c do CI.
import { createRequire } from "node:module";
const require = createRequire("/Users/[usuario]/Documents/city-hall/dc360/apps/api/package.json");
const pg = require("pg");
const [url, sql] = process.argv.slice(2);
const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const r = await c.query(sql);
  for (const x of [].concat(r)) console.log(x.command ?? "", x.rows?.length ? JSON.stringify(x.rows) : "");
} catch (e) { console.error("ERRO:", e.message); process.exitCode = 1; }
await c.end();
