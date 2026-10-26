import { appendFileSync } from "node:fs";
import Fastify from "fastify";
import { it } from "vitest";
import { instalarGuardaDeAcesso, CONTRATO_DE_ACESSO_DA_API, GENERICO_DA_API } from "../src/guarda-de-codigos-de-erro.js";

// Sonda da correção 4c da E05 (a forma da revisão de ae19e89): um ouvinte de `connection` no servidor
// HTTP escreve a resposta inteira no socket. A guarda em tempo de execução NÃO a vê; é só a varredura.
const SAIDA = process.env.SONDA_SAIDA!;
it("sonda c4c", async () => {
  const app = Fastify();
  instalarGuardaDeAcesso(app, { modo: "corrigir", contrato: CONTRATO_DE_ACESSO_DA_API, generico: GENERICO_DA_API });
  app.get("/ok", async () => ({ ok: true }));
  const endereco = await app.listen({ port: 0, host: "127.0.0.1" });
  const antes = await fetch(`${endereco}/ok`, { headers: { connection: "close" } });
  appendFileSync(SAIDA, `sem ouvinte: HTTP ${antes.status} ${await antes.text()}\n`);
  app.server.on("connection", (s: any) => {
    s.once("data", () => s.end("HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: 20\r\n\r\n{\"erro\":\"inventado\"}"));
  });
  const r = await fetch(`${endereco}/ok`, { headers: { connection: "close" } });
  appendFileSync(SAIDA, `com ouvinte de connection: HTTP ${r.status} ${await r.text()} (a guarda não vê; a varredura reprova o ouvinte)\n`);
  await app.close();
}, 60_000);
