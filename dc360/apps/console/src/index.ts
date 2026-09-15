import { carregarConfig } from "./config.js";
import { bancoPostgres, type BancoDoConsole } from "./banco.js";
import { construirConsole } from "./servidor.js";
import { faltaNoEsquema, mensagemDeEsquemaAtrasado } from "./esquema.js";

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
 *   - Não tem rota que escreva em tabela, em lugar nenhum.
 *   - NÃO tem a credencial de dono do banco, e continua sem ela mesmo agora que
 *     cadastra prefeitura. O que a emenda de 14/09/2026 da ADR 0008 concedeu ao
 *     papel `dc360_console` foi o `EXECUTE` de UMA função do banco (migração
 *     036), que cria município e primeiro administrador numa transação e
 *     devolve dois identificadores. O ato é fechado e definido no banco; o
 *     console não escolhe o que ele faz.
 */

const config = carregarConfig();

let banco: BancoDoConsole;

if (config.CONSOLE_DATABASE_URL) {
  banco = bancoPostgres(config.CONSOLE_DATABASE_URL);

  /*
    RECUSA SUBIR CONTRA UM BANCO QUE NÃO TEM O QUE ELE USA.

    A API já fazia isso e o console não fazia, e a diferença aparecia do pior
    jeito possível: o console subia contra um banco sem a migração 036, a tela
    carregava inteira, os números apareciam, e o defeito só se revelava quando
    alguém apertava "Cadastrar" e recebia um 500 genérico. Ou seja, o erro
    esperava justamente o momento em que há uma prefeitura do outro lado da
    linha esperando o primeiro acesso.

    A conferência NÃO é a da API, e `esquema.ts` explica por quê em detalhe: a
    API lê `schema_migracoes`, e dar essa leitura ao papel do console reprovaria
    o portão CA-06. Aqui a pergunta é feita ao `pg_catalog`, que não exige
    concessão, e ela é sobre o que o console realmente usa.

    Fica AQUI e não dentro de `construirConsole` porque a resposta certa é
    derrubar o processo, e um servidor não deve decidir se o processo vive. No
    Fly isso faz o release falhar e a versão anterior continuar atendendo, que é
    o desfecho certo: melhor o console velho de pé do que o novo quebrado.
  */
  const faltas = await faltaNoEsquema(banco);
  if (faltas.length > 0) {
    console.error(mensagemDeEsquemaAtrasado(faltas));
    await banco.encerrar();
    process.exit(1);
  }
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
  banco = memoria.banco;
  console.warn(
    config.CONSOLE_BANCO_LOCAL
      ? "CONSOLE_DATABASE_URL ausente: subindo Postgres em WebAssembly sobre "
        + `${config.CONSOLE_BANCO_LOCAL}, só para desenvolvimento.`
      : "CONSOLE_DATABASE_URL ausente: subindo Postgres em WebAssembly, efêmero e só "
        + "para desenvolvimento. Nenhum município e nenhuma métrica dentro dele.",
  );
}

const app = await construirConsole({ config, leitura: banco, escrita: banco });

// Encerramento ordenado: a requisição em andamento termina, e o pool fecha.
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

await app.listen({ port: config.CONSOLE_PORT, host: config.CONSOLE_HOST });
