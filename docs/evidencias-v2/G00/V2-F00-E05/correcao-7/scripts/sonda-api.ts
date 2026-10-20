import { bancoEmMemoria } from "./src/banco/memoria.js";
import { carregarConfig } from "./src/config.js";
import { construirServidor } from "./src/servidor.js";
import { armazenamentoEmMemoria } from "./src/armazenamento/memoria.js";
import { lerDesviosDaGuarda } from "./src/guarda-de-codigos-de-erro.js";
import { pipeline, plantar, VARIANTES, veredito } from "./zz-c7-comum.js";

const mem = await bancoEmMemoria();
const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-sonda-c7-com-mais-de-32-bytes-ok", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
let escaparam = 0, dessincronizaram = 0;
for (const modo of ["falhar", "corrigir"] as const) {
  const app = await construirServidor({ banco: mem.banco, config, armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    modoDaGuarda: modo, destinoDeLog: { write: () => {} } });
  plantar(app, "sem_permissao");
  await app.ready();
  const porta = Number(new URL(await app.listen({ port: 0, host: "127.0.0.1" })).port);
  // SO_VARIANTE=<nome> roda só uma (um processo por variante, quando uma delas derruba o processo).
  for (const v of VARIANTES.filter((x) => !process.env.SO_VARIANTE || x === process.env.SO_VARIANTE)) {
    const r = veredito(await pipeline(porta, `/c7/${v}`));
    const d = lerDesviosDaGuarda();
    if (r.escapou) escaparam += 1;
    if (r.dessincronizou) dessincronizaram += 1;
    console.log(`api modo=${modo} ${v}: ${r.escapou ? "ESCAPOU" : "nao-escapou"} ${r.dessincronizou ? "DESSINCRONIZOU" : "sincronizado"} desvios=${d.length}${d.length ? ` (${d.map((x) => x.motivo).join("; ")})` : ""}\n    ${r.resumo}`);
  }
  await app.close();
}
await mem.banco.encerrar();
console.log(`api: ${escaparam} escaparam, ${dessincronizaram} dessincronizaram; processo de pé ao fim (sem tratador de uncaughtException)`);
