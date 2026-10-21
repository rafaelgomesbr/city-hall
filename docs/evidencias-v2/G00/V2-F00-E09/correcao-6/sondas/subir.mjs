// Sobe um processo destacado (grupo próprio), grava o pid. Uso: node subir.mjs <nome> <cwd> <comando> [args...]
// Variáveis de ambiente: as do processo atual.
import { spawn } from "node:child_process";
import { openSync, writeFileSync } from "node:fs";
const [nome, cwd, cmd, ...args] = process.argv.slice(2);
const DIR = new URL(".", import.meta.url).pathname;
const log = openSync(`${DIR}${nome}.log`, "w");
const p = spawn(cmd, args, { cwd, detached: true, stdio: ["ignore", log, log], env: process.env });
writeFileSync(`${DIR}${nome}.pid`, String(p.pid));
p.unref();
