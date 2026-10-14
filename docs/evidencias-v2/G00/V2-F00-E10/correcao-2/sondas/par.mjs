import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const RAIZ = new URL("../../../../../../dc360", import.meta.url).pathname;
const pasta = mkdtempSync(join(tmpdir(), "dc360-par-"));
const ARQ = join(pasta, "notificacoes.txt");
const BASE_WEB = "http://localhost:4691", BASE_API = "http://127.0.0.1:3691";
const api = spawn("npx", ["tsx", "src/index.ts"], { cwd: join(RAIZ, "apps/api"), stdio: "ignore", env: { ...process.env,
  PORT: "3691", HOST: "127.0.0.1", JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-para-o-e2e",
  ORIGENS_PERMITIDAS: BASE_WEB, URL_PAINEL: BASE_WEB, URL_PUBLICA: BASE_API, LOGIN_POR_IP: "10000", NOTIFICADOR_ARQUIVO: ARQ } });
const web = spawn("npx", ["vite", "preview", "--port", "4691", "--strictPort"], { cwd: join(RAIZ, "apps/web"), stdio: "ignore" });
console.log("ARQ=" + ARQ);
process.on("SIGTERM", () => { api.kill(); web.kill(); process.exit(0); });
setInterval(() => {}, 1000);
