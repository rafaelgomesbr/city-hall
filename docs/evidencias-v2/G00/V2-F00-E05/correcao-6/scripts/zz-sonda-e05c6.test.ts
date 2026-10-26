import { appendFileSync } from "node:fs";
import { connect } from "node:net";
import { it } from "vitest";
import { bancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { lerDesviosDaGuarda } from "../src/guarda-de-codigos-de-erro.js";

// Sonda da correção 6 da E05: o `GET /orgaos` real plantado (plantar-c6.py), por socket TCP cru em
// porta efêmera, com um segundo pedido comum em pipeline no mesmo socket (o que o QA da rodada 7 fez).
const SAIDA = process.env.SONDA_SAIDA!;
function tcp(porta: number, bruto: string, espera = 1500): Promise<Buffer> {
  return new Promise((ok) => {
    const s = connect(porta, "127.0.0.1", () => s.write(bruto));
    const partes: Buffer[] = [];
    s.on("data", (d) => partes.push(d)); s.on("error", () => {});
    const fim = setTimeout(() => { s.destroy(); ok(Buffer.concat([...partes, Buffer.from("[tempo]")])); }, espera);
    s.on("close", () => { clearTimeout(fim); ok(Buffer.concat([...partes, Buffer.from("[fechou]")])); });
  });
}
/** Resume as respostas que o cliente lê, na ordem: linha de status, moldura e o começo do corpo. */
let forjada = false;
function resumir(b: Buffer): string {
  const t = b.toString("latin1");
  const saida: string[] = [];
  let i = 0;
  while (i < t.length) {
    const fimCab = t.indexOf("\r\n\r\n", i);
    if (!t.startsWith("HTTP/", i) || fimCab < 0) { saida.push(`resto=${JSON.stringify(t.slice(i, i + 80))}`); break; }
    const cab = t.slice(i, fimCab);
    const linha = cab.split("\r\n")[0];
    const cl = /\r\ncontent-length: *(\d+)/i.exec(cab);
    const te = /\r\ntransfer-encoding: *([^\r]+)/i.exec(cab);
    let j = fimCab + 4;
    let corpo = "";
    if (cl) { corpo = t.slice(j, j + Number(cl[1])); j += Number(cl[1]); }
    else if (te && /chunked/i.test(te[1]!)) {
      for (;;) { const f = t.indexOf("\r\n", j); if (f < 0) { j = t.length; break; } const n = parseInt(t.slice(j, f), 16); j = f + 2; if (!n) { for (;;) { const ft = t.indexOf("\r\n", j); if (ft < 0) { j = t.length; break; } const vazia = ft === j; j = ft + 2; if (vazia) break; } break; } corpo += t.slice(j, j + n); j += n + 2; }
    } else { corpo = t.slice(j); j = t.length; }
    if (/ 40[13] /.test(linha!) && corpo.includes("inventado_qa7")) forjada = true;
    saida.push(`[${linha} | ${cl ? `cl ${cl[1]}` : te ? `te ${te[1]}` : "sem moldura"}] ${JSON.stringify(corpo.slice(0, 70))}${corpo.length > 70 ? `(+${corpo.length - 70} bytes)` : ""}`);
    i = j;
  }
  return saida.join("\n    ");
}
const FORMAS = ["cl-stream", "cl-response", "cl-stream-pedacos", "cl-buffer", "cl-string", "cl-raw-write", "cl-raw-end", "cl-writeraw",
  "chunked-depois-do-terminador", "te-forjado-stream", "te-identity", "cl-e-te", "cl-menor-que-o-corpo-403",
  "trailer-inventado", "trailer-catalogo", "flush-403", "flush-403-catalogo", "zip", "pdf", "stream-cl-certo"];
it("sonda c6", async () => {
  const mem = await bancoEmMemoria();
  const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-sonda-com-mais-de-32-bytes-ok", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
  const naoTratadas: string[] = [];
  const pegar = (e: unknown) => naoTratadas.push(String((e as { code?: string }).code ?? e));
  process.on("uncaughtException", pegar);
  for (const modo of ["falhar", "corrigir"] as const) {
    const app = await construirServidor({ banco: mem.banco, config, armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
      modoDaGuarda: modo, destinoDeLog: { write: () => {} } } as never);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const porta = (app.server.address() as { port: number }).port;
    for (const forma of FORMAS) {
      const b = await tcp(porta, `GET /orgaos HTTP/1.1\r\nhost: x\r\nx-qa7: ${forma}\r\n\r\nGET /orgaos HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n`);
      forjada = false;
      const resumo = resumir(b);
      appendFileSync(SAIDA, `modo=${modo} ${forma}: desvios=${lerDesviosDaGuarda().length} resposta_401_403_com_codigo_inventado=${forjada ? "SIM" : "não"}\n    ${resumo}\n`);
    }
    await app.close();
  }
  process.off("uncaughtException", pegar);
  appendFileSync(SAIDA, `exceções não tratadas: ${naoTratadas.length} ${JSON.stringify(naoTratadas)}\n`);
  await mem.banco.encerrar();
}, 120_000);
