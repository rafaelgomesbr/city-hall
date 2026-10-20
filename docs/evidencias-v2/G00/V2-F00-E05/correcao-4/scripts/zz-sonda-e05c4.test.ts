import { appendFileSync } from "node:fs";
import { it } from "vitest";
import { bancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { lerDesviosDaGuarda } from "../src/guarda-de-codigos-de-erro.js";

// Sonda da correção 4 da E05: o `GET /orgaos` real, plantado com status torto atrás de um
// cabeçalho, servido por HTTP de verdade (porta efêmera), nos dois modos da guarda.
const SAIDA = process.env.SONDA_SAIDA!;
it("sonda", async () => {
  const mem = await bancoEmMemoria();
  const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-sonda-com-mais-de-32-bytes-ok", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
  for (const modo of ["falhar", "corrigir"] as const) {
    const app = await construirServidor({
      banco: mem.banco, config, armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
      modoDaGuarda: modo, ...(modo === "corrigir" ? { destinoDeLog: { write: () => {} } } : {}),
    });
    const endereco = await app.listen({ port: 0, host: "127.0.0.1" });
    for (const sonda of ["regra", "code", "texto", "catalogo", "controle"]) {
      const r = await fetch(`${endereco}/orgaos`, { headers: { "x-sonda-c4": sonda } });
      const corpo = await r.text();
      const desvios = lerDesviosDaGuarda();
      appendFileSync(SAIDA, `modo=${modo} sonda=${sonda}: HTTP ${r.status} ${r.statusText} corpo=${corpo.slice(0, 160)} desvios=${desvios.length}\n`);
    }
    await app.close();
  }
  await mem.banco.encerrar();
}, 120_000);
