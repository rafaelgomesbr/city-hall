import { randomBytes } from "node:crypto";
import { construirConsole } from "./src/servidor.js";
import { consoleEmMemoria } from "./src/banco-em-memoria.js";
import { abrirCofre, contextoDoOperador } from "./src/operadores.js";
import { derivarSenha } from "../api/src/auth/senha.js";
import { gerarSegredoTotp } from "../api/src/auth/totp.js";
import type { Config } from "./src/config.js";
import { lerDesviosDaGuarda } from "./src/guarda-de-codigos-de-erro.js";
import { pipeline, plantar, VARIANTES, veredito } from "./zz-c7-comum.js";

// O console de verdade (construirConsole) sobre o banco em memória com as migrações reais, com o dono semeado
// como o apoio de teste faz (as rotas plantadas não pedem sessão). O apoio de teste importa o vitest e não roda fora dele.
let escaparam = 0, dessincronizaram = 0;
for (const modo of ["falhar", "corrigir"] as const) {
  const mem = await consoleEmMemoria();
  const chave = randomBytes(32).toString("base64");
  const email = "dona@fornecedor.com.br";
  const semente = JSON.stringify([{ email, senha: await derivarSenha("senha-da-dona-bem-comprida-para-teste"),
    segundoFator: abrirCofre(chave).cifrar(gerarSegredoTotp(), contextoDoOperador(email)) }]);
  const config: Config = { NODE_ENV: "test", CONSOLE_PORT: 0, CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui", CONSOLE_SEGUNDO_FATOR_CHAVE: chave, CONSOLE_OPERADORES: semente };
  const app = await construirConsole({ config, leitura: mem.banco, escrita: mem.banco, limitePorEndereco: 100000, limiteDeCadastro: 500,
    limiteDeAcoes: 500, destinoDeLog: { write: () => {} }, modoDaGuarda: modo });
  plantar(app, "so_o_dono");
  await app.ready();
  const porta = Number(new URL(await app.listen({ port: 0, host: "127.0.0.1" })).port);
  // SO_VARIANTE=<nome> roda só uma (um processo por variante, quando uma delas derruba o processo).
  for (const v of VARIANTES.filter((x) => !process.env.SO_VARIANTE || x === process.env.SO_VARIANTE)) {
    const r = veredito(await pipeline(porta, `/c7/${v}`));
    const d = lerDesviosDaGuarda();
    if (r.escapou) escaparam += 1;
    if (r.dessincronizou) dessincronizaram += 1;
    console.log(`console modo=${modo} ${v}: ${r.escapou ? "ESCAPOU" : "nao-escapou"} ${r.dessincronizou ? "DESSINCRONIZOU" : "sincronizado"} desvios=${d.length}${d.length ? ` (${d.map((x) => x.motivo).join("; ")})` : ""}\n    ${r.resumo}`);
  }
  await app.close();
  await mem.banco.encerrar();
}
console.log(`console: ${escaparam} escaparam, ${dessincronizaram} dessincronizaram; processo de pé ao fim (sem tratador de uncaughtException)`);
