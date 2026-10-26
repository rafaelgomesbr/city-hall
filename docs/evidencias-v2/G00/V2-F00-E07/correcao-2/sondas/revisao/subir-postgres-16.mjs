// copia do script do scratchpad (c2r3/pg16/subir.mjs), com embedded-postgres 16.13.0-beta.16 instalado so no scratchpad

// Sobe um Postgres 16 descartavel na porta 54916, imitando o servico do job
// implantavel do CI (postgres:16, superusuario postgres, senha postgres).
import EmbeddedPostgres from "embedded-postgres";
import { rmSync } from "node:fs";

const dir = new URL("./dados", import.meta.url).pathname;
rmSync(dir, { recursive: true, force: true });
const pg = new EmbeddedPostgres({
  databaseDir: dir, user: "postgres", password: /* [REDIGIDO] */ undefined, port: 54916, persistent: false,
  onLog: (m) => process.stdout.write(String(m)),
  onError: (m) => process.stderr.write(String(m)),
});
await pg.initialise();
await pg.start();
console.log("\nPRONTO postgres://[REDIGIDO]@127.0.0.1:54916/postgres");
const parar = async () => { await pg.stop(); process.exit(0); };
process.on("SIGTERM", parar);
process.on("SIGINT", parar);
setInterval(() => {}, 1 << 30);
