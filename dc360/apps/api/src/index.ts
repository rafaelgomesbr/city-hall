import { carregarConfig } from "./config.js";
import { bancoPostgres } from "./banco/postgres.js";
import { bancoEmMemoria } from "./banco/memoria.js";
import { construirServidor } from "./servidor.js";
import type { Banco } from "./banco/tipos.js";

const config = carregarConfig();

let banco: Banco;
if (config.DATABASE_URL) {
  banco = bancoPostgres(config.DATABASE_URL);
} else {
  // Sem DATABASE_URL, sobe um Postgres em WebAssembly no próprio processo.
  // Serve para desenvolver sem instalar nada; em produção a configuração
  // recusa essa combinação e o processo nem chega aqui.
  const memoria = await bancoEmMemoria({ semear: true });
  banco = memoria.banco;
  console.warn(
    "DATABASE_URL ausente: subindo Postgres em WebAssembly, efêmero e só para desenvolvimento.",
  );
  console.warn("Semeado com dois municípios fictícios. Senha de todas as contas: defesa-civil-2026");
}

const app = await construirServidor({ banco, config });

// Encerramento ordenado: a requisição em andamento termina, e o pool fecha.
// Sem isso, um deploy derruba transação no meio.
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    void (async () => {
      app.log.info(`recebido ${sinal}, encerrando`);
      await app.close();
      await banco.encerrar();
      process.exit(0);
    })();
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
