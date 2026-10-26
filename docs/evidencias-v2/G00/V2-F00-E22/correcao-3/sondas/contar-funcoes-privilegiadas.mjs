// Conta as funções SECURITY DEFINER do esquema `public` depois de aplicar as migrações em PGlite.
// Uso (da raiz do repositório): node docs/evidencias-v2/G00/V2-F00-E22/correcao-3/sondas/contar-funcoes-privilegiadas.mjs
import { PGlite } from "../../../../../../dc360/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pasta = join(dirname(fileURLToPath(import.meta.url)), "../../../../../../dc360/db/migrations");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();
const db = new PGlite();
for (const f of arquivos) await db.exec(readFileSync(join(pasta, f), "utf8"));
const r = await db.query(
  "SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef",
);
console.log(`migracoes aplicadas: ${arquivos.length}`);
console.log(`funcoes SECURITY DEFINER no esquema public: ${r.rows[0].n}`);
