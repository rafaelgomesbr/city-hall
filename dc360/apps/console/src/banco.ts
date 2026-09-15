import pg from "pg";
import { montarConfiguracaoDoPool } from "../../api/src/banco/postgres.js";

/**
 * A conexão do console, e as três coisas que a mantêm estreita.
 *
 * A decisão 3 da ADR 0008 diz que o papel do console tem `SELECT` na tabela de
 * métricas, no cadastro de organizações e na visão que junta as duas, e **nada**
 * em nenhuma outra tabela. Quem impõe isso é o banco, e está provado em
 * `db/test/isolamento.test.ts` por dois caminhos independentes (a varredura de
 * catálogo e a conexão real tentando ler `ocorrencias`, `usuarios`,
 * `evidencias` e `trilha_eventos`).
 *
 * Este arquivo acrescenta três cintos por cima daquilo, e nenhum deles substitui
 * o portão do banco:
 *
 *   1. `SET LOCAL ROLE dc360_console` em toda transação. Em produção o login que
 *      vai na `CONSOLE_DATABASE_URL` é um papel próprio, membro de
 *      `dc360_console` (mesmo desenho de `dc360_api` para `dc360_app`, ver o
 *      README). Assumir o papel explicitamente é o que garante que os
 *      privilégios em vigor são os do console, e não os de quem quer que o
 *      operador tenha configurado por engano na string de conexão.
 *   2. Transação SOMENTE LEITURA em toda leitura. Isso é afirmado pela conexão
 *      além de ser negado pelas concessões.
 *
 *      Existe UMA transação de escrita, e ela não afrouxa nada disto: a
 *      migração 036 concedeu a `dc360_console` o `EXECUTE` de uma função
 *      `SECURITY DEFINER` que cria município e primeiro administrador, e nada
 *      mais. O papel continua sem `INSERT`, `UPDATE` ou `DELETE` em tabela
 *      nenhuma, e continua sem `SELECT` fora das duas que a ADR 0008 nomeia. A
 *      diferença entre "o console não escreve" e "o console executa um ato
 *      fechado que o banco define" é a diferença entre esta porta e a
 *      credencial que a ADR 0008 recusa.
 *   3. Nenhuma montagem de SQL a partir de entrada do operador. Todo parâmetro
 *      viaja como parâmetro do driver. O console não tem consulta livre, e não
 *      vai ter: consulta livre num processo que enxerga mais de um município é
 *      a credencial proibida esperando uma boa ideia.
 */

export type LeituraDoConsole = {
  ler<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  encerrar(): Promise<void>;
};

/**
 * A ESCRITA, e ela e de uma forma so: chamar uma funcao do banco.
 *
 * O console continua sem `INSERT`, `UPDATE` ou `DELETE` em tabela nenhuma. O
 * que a migracao 036 concedeu a `dc360_console` foi `EXECUTE` em UMA funcao
 * `SECURITY DEFINER`, que cria municipio e primeiro administrador e devolve
 * dois identificadores. Se alguem escrever aqui um `INSERT`, o banco responde
 * "permissao negada", e essa continua sendo a ordem certa das defesas.
 *
 * SEPARADA de `LeituraDoConsole`, como tipo e como parametro do servidor, e nao
 * juntada numa interface so com um metodo a mais. Assim a rota que le recebe um
 * objeto que nao tem como escrever, e a unica rota que escreve aparece na
 * assinatura de quem a monta. Um servidor montado sem `escrita` nao compila com
 * a rota de cadastro dentro.
 */
export type EscritaDoConsole = {
  /**
   * Executa a chamada de funcao do provisionamento.
   *
   * Recebe SQL em vez de expor um metodo por campo porque o unico SQL que passa
   * por aqui esta escrito por extenso em `cadastro.ts`, junto da razao dele, e
   * todo valor viaja como parametro do driver. Ver o comentario de la.
   */
  executar<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
};

/** Leitura e escrita sobre a MESMA conexao: um pool so, dois direitos. */
export type BancoDoConsole = LeituraDoConsole & EscritaDoConsole;

/**
 * O par de comandos que abre toda transação do console.
 *
 * Exportado porque `test/console-nao-le-cidadao.test.ts` precisa afirmar que o
 * caminho exercitado no teste é o mesmo que roda em produção. Um teste que
 * montasse a própria transação estaria atestando algo que ninguém executa.
 *
 * `SET LOCAL transaction_read_only` em vez de `BEGIN READ ONLY` porque o
 * segundo precisa ser a primeira coisa da transação, e quem abre a transação
 * aqui é o driver (`pg`) ou a biblioteca do Postgres em WebAssembly, cada um do
 * seu jeito. O efeito é o mesmo e não depende da ordem.
 */
export const ABERTURA = [
  "SET LOCAL ROLE dc360_console",
  "SET LOCAL transaction_read_only = on",
] as const;

/**
 * A abertura da UNICA transacao do console que pode escrever.
 *
 * Igual a `ABERTURA` menos uma linha, e a linha que falta e a razao de existir
 * uma segunda constante: `SET LOCAL transaction_read_only = on` recusaria a
 * escrita que a funcao de provisionamento faz por dentro, mesmo com o `EXECUTE`
 * concedido.
 *
 * O `SET LOCAL ROLE dc360_console` CONTINUA, e ele e o que importa aqui: a
 * escrita acontece com o papel pobre de sempre, que nao tem `INSERT` em tabela
 * nenhuma. O que ela alcanca e uma funcao, e o que a funcao faz esta fixado no
 * banco, nao nesta linha.
 */
export const ABERTURA_DE_ESCRITA = [
  "SET LOCAL ROLE dc360_console",
] as const;

/** A conexão de produção. */
export function bancoPostgres(url: string): BancoDoConsole {
  /*
    Reusa a montagem do pool da API, e não uma cópia, porque é ela que carrega
    a exigência de `sslmode=verify-full` em produção. Sem verificação do
    certificado a conexão sobe cifrada e NÃO autenticada, e quem estiver no meio
    do caminho lê a resposta. Aqui a resposta é métrica agregada, então o dano
    tem teto; mas a conexão é com o MESMO banco de todos os municípios, e
    reimplementar essa decisão em outro arquivo seria criar um segundo lugar
    onde ela pode envelhecer sozinha.

    Duas conexões bastam: o console é uma tela de números lida por um punhado de
    pessoas do fornecedor, e um pool grande aqui só tiraria conexão do banco que
    atende município em noite de chuva.
  */
  const pool = new pg.Pool(montarConfiguracaoDoPool(url, { maximoConexoes: 2 }));

  return {
    async ler<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        for (const comando of ABERTURA) await cliente.query(comando);
        const r = await cliente.query(sql, [...params]);
        await cliente.query("COMMIT");
        return r.rows as T[];
      } catch (erro) {
        await cliente.query("ROLLBACK").catch(() => undefined);
        throw erro;
      } finally {
        // Sempre devolve o cliente ao pool, inclusive no erro. O `SET LOCAL`
        // morre com a transação, então o cliente volta limpo.
        cliente.release();
      }
    },
    async executar<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      /*
        A mesma forma de `ler`, com a abertura de escrita: transacao explicita,
        papel do console assumido, e `ROLLBACK` em qualquer falha. A transacao
        nao e detalhe: a funcao do banco cria municipio, administrador e a linha
        de nascimento na trilha, e um municipio que nascesse sem administrador
        seria pior do que nenhum.
      */
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        for (const comando of ABERTURA_DE_ESCRITA) await cliente.query(comando);
        const r = await cliente.query(sql, [...params]);
        await cliente.query("COMMIT");
        return r.rows as T[];
      } catch (erro) {
        await cliente.query("ROLLBACK").catch(() => undefined);
        throw erro;
      } finally {
        cliente.release();
      }
    },
    encerrar: () => pool.end(),
  };
}
