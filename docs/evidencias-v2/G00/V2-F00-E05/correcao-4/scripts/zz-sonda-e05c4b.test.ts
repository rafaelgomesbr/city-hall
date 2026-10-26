import { appendFileSync } from "node:fs";
import { Agent, request } from "node:http";
import { it } from "vitest";
import { bancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { lerDesviosDaGuarda } from "../src/guarda-de-codigos-de-erro.js";

// Sonda da correção 4b da E05: `GET /orgaos` real plantado (plantar-4b.py), por HTTP de verdade,
// nos dois modos. Cada forma escreve a linha de status por baixo de writeHead/write/end.
const SAIDA = process.env.SONDA_SAIDA!;
function pedir(porta: number, sonda: string, agente?: Agent): Promise<string> {
  return new Promise((ok) => {
    const q = request({ host: "127.0.0.1", port: porta, path: "/orgaos", agent: agente ?? false,
      headers: { "x-sonda-c6": sonda, ...(agente ? {} : { connection: "close" }) } }, (r) => {
      let b = ""; r.on("data", (d) => { b += d; }); r.on("end", () => ok(`HTTP ${r.statusCode} ${r.statusMessage} corpo=${b.slice(0, 120)}`));
      r.on("error", (e) => ok(`erro-resp ${e.message}`));
    });
    q.on("error", (e) => ok(`erro ${e.message}`));
    q.setTimeout(4000, () => { q.destroy(); ok("timeout"); });
    q.end();
  });
}
const FORMAS = (process.env.FORMAS ? process.env.FORMAS.split(",") : null) ?? ["calc", "destruct", "header", "header-401", "store", "writeraw", "writeraw-base64", "writeraw-buffer",
  "continue-junto", "linha-partida", "fila", "send-com-header", "depois-do-fim", "ok-403", "ok-continue", "controle"];
it("sonda c6b", async () => {
  const mem = await bancoEmMemoria();
  const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-sonda-com-mais-de-32-bytes-ok", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
  for (const modo of ["falhar", "corrigir"] as const) {
    const app = await construirServidor({
      banco: mem.banco, config, armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
      modoDaGuarda: modo, ...(modo === "corrigir" ? { destinoDeLog: { write: () => {} } } : {}),
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const porta = (app.server.address() as { port: number }).port;
    for (const sonda of FORMAS) {
      const r = await pedir(porta, sonda);
      appendFileSync(SAIDA, `modo=${modo} sonda=${sonda}: ${r} desvios=${lerDesviosDaGuarda().length}\n`);
    }
    // Mesma conexão (keep-alive): a resposta trocada não deixa resto que vire a resposta seguinte.
    const agente = new Agent({ keepAlive: true, maxSockets: 1 });
    for (const sonda of ["store", "controle", "depois-do-fim", "controle"]) {
      const r = await pedir(porta, sonda, agente);
      appendFileSync(SAIDA, `modo=${modo} mesma-conexao sonda=${sonda}: ${r} desvios=${lerDesviosDaGuarda().length}\n`);
    }
    agente.destroy();
    await app.close();
  }
  await mem.banco.encerrar();
}, 120_000);
