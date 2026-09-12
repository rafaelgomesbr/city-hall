import { carregarConfig } from "./config.js";
import { leituraPostgres, type LeituraDoConsole } from "./banco.js";
import { construirConsole } from "./servidor.js";

/**
 * A partida do console do fornecedor.
 *
 * PROCESSO PRÓPRIO, e é este arquivo que faz a decisão 1 da ADR 0008 ser
 * verdade em vez de intenção: outro executável, outra porta, outra conexão,
 * outro segredo de token. Uma falha de autorização no painel do município não
 * alcança este processo, e um vazamento deste processo não traz consigo uma
 * sessão de município.
 *
 * O que este processo NÃO tem, e cada ausência é a decisão funcionando:
 *
 *   - Não tem a `DATABASE_URL` do produto. Ele tem a `CONSOLE_DATABASE_URL`,
 *     que é a de um papel de login membro de `dc360_console`, sem concessão em
 *     tabela de negócio nenhuma.
 *   - Não tem a chave de armazenamento das evidências, nem credencial de push,
 *     nem provedor de email. Ele não envia nada e não guarda nada.
 *   - Não tem rota de escrita, em lugar nenhum.
 *   - Não provisiona município. A ADR 0008 mantém o provisionamento na linha de
 *     comando com a credencial de dono do banco (ver `apps/api/src/provisionar.ts`
 *     e a ADR 0006): o console não carrega essa credencial e não vai carregar.
 */

const config = carregarConfig();

let leitura: LeituraDoConsole;

if (config.CONSOLE_DATABASE_URL) {
  leitura = leituraPostgres(config.CONSOLE_DATABASE_URL);
} else {
  /*
    Sem `CONSOLE_DATABASE_URL`, sobe um Postgres em WebAssembly efêmero, só para
    desenvolver e demonstrar. A configuração recusa essa combinação em produção,
    e o motivo está escrito lá: um console de produção contra um banco que morre
    no reinício mostraria todos os municípios como calados, que é exatamente o
    alarme que ele existe para dar.

    A importação é dinâmica para a imagem de produção não precisar carregar o
    Postgres em WebAssembly que ela nunca vai usar.
  */
  const { consoleEmMemoria } = await import("./banco-em-memoria.js");
  const memoria = await consoleEmMemoria(config.CONSOLE_BANCO_LOCAL);
  leitura = memoria.leitura;
  console.warn(
    config.CONSOLE_BANCO_LOCAL
      ? "CONSOLE_DATABASE_URL ausente: subindo Postgres em WebAssembly sobre "
        + `${config.CONSOLE_BANCO_LOCAL}, só para desenvolvimento.`
      : "CONSOLE_DATABASE_URL ausente: subindo Postgres em WebAssembly, efêmero e só "
        + "para desenvolvimento. Nenhum município e nenhuma métrica dentro dele.",
  );
}

const app = await construirConsole({ config, leitura });

// Encerramento ordenado: a requisição em andamento termina, e o pool fecha.
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    void (async () => {
      app.log.info(`recebido ${sinal}, encerrando`);
      await app.close();
      await leitura.encerrar();
      process.exit(0);
    })();
  });
}

await app.listen({ port: config.CONSOLE_PORT, host: config.CONSOLE_HOST });
