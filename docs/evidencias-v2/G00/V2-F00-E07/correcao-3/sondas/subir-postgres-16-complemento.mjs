// Sobe um Postgres 16 descartavel na porta 55861 (complemento da correcao 3 da E07),
// imitando o servico do job implantavel do CI (superusuario postgres).
import EmbeddedPostgres from "embedded-postgres";
import { rmSync } from "node:fs";

const dir = new URL("./dados", import.meta.url).pathname;
rmSync(dir, { recursive: true, force: true });
const pg = new EmbeddedPostgres({
  databaseDir: dir, user: "postgres", password: /* [REDIGIDO] */ undefined, port: 55861, persistent: false,
  postgresFlags: ["-c", "log_lock_waits=on", "-c", "deadlock_timeout=200ms"],
  onLog: (m) => process.stdout.write(String(m)),
  onError: (m) => process.stderr.write(String(m)),
});
await pg.initialise();
await pg.start();
console.log("\nPRONTO postgres://postgres:[REDIGIDO]@127.0.0.1:55861/postgres");
const parar = async () => { await pg.stop(); process.exit(0); };
process.on("SIGTERM", parar);
process.on("SIGINT", parar);
setInterval(() => {}, 1 << 30);
