import pg from "pg";
import { montarConfiguracaoDoPool } from "../../api/src/banco/postgres.js";

/**
 * A conexão do console, e as quatro coisas que a mantêm estreita.
 *
 * A decisão 3 da ADR 0008 diz que o papel do console tem `SELECT` na tabela de
 * métricas, no cadastro de organizações e na visão que junta as duas, e **nada**
 * em nenhuma tabela de NEGÓCIO. Quem impõe isso é o banco, e está provado em
 * `db/test/isolamento.test.ts` por dois caminhos independentes (a varredura de
 * catálogo e a conexão real tentando ler `ocorrencias`, `usuarios`,
 * `evidencias` e `trilha_eventos`).
 *
 * Desde a migração 038 o console tem tabela própria: `console_operadores`,
 * onde vivem as contas de quem entra nele, e, desde a 039,
 * `console_codigos_de_recuperacao`, com os hashes dos códigos de recuperação.
 * Nenhuma das duas é tabela de negócio: não carregam cidadão, imóvel nem
 * município, só quem opera o fornecedor. Na primeira o papel tem `SELECT`,
 * `INSERT` e `UPDATE`, e as policies decidem linha a linha (operador atualiza
 * a própria linha; só o dono cria e desativa; o dono não se desativa). Na
 * segunda tem `SELECT` e `INSERT` das próprias linhas, e marcar código como
 * usado é ato das funções da 039, nunca de um `UPDATE` daqui.
 *
 * Este arquivo acrescenta quatro cintos por cima daquilo, e nenhum deles
 * substitui o portão do banco:
 *
 *   1. `SET LOCAL ROLE dc360_console` em toda transação. Em produção o login que
 *      vai na `CONSOLE_DATABASE_URL` é um papel próprio, membro de
 *      `dc360_console` (mesmo desenho de `dc360_api` para `dc360_app`, ver o
 *      README). Assumir o papel explicitamente é o que garante que os
 *      privilégios em vigor são os do console, e não os de quem quer que o
 *      operador tenha configurado por engano na string de conexão.
 *   2. `app.console_operador` na transação, DEPOIS do papel, quando há um
 *      operador identificado. As policies de `console_operadores` e as
 *      funções `console_*_municipio` leem esse valor por
 *      `console_operador_atual()`, e é ele que faz "só o dono" valer no banco
 *      e não na tela. Ele vai por `set_config(..., true)`, que é o mesmo
 *      `SET LOCAL` com parâmetro do driver: interpolar um identificador numa
 *      string de `SET` seria injeção num processo que fala com o banco de todas
 *      as prefeituras.
 *   3. Transação SOMENTE LEITURA em toda leitura. Isso é afirmado pela conexão
 *      além de ser negado pelas concessões.
 *   4. Nenhuma montagem de SQL a partir de entrada do operador. Todo parâmetro
 *      viaja como parâmetro do driver. O console não tem consulta livre, e não
 *      vai ter: consulta livre num processo que enxerga mais de um município é
 *      a credencial proibida esperando uma boa ideia.
 */

export type LeituraDoConsole = {
  /**
   * `operador` é o identificador de quem está agindo, quando há um. Ele entra
   * na transação como `app.console_operador` (ver `CONTEXTO_DO_OPERADOR`). A
   * porta lê sem operador, porque ainda não sabe quem é; tudo depois dela lê
   * com.
   */
  ler<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
    operador?: string | null,
  ): Promise<T[]>;
  encerrar(): Promise<void>;
};

/**
 * A ESCRITA, e ela e de duas formas: chamar uma funcao do banco, ou escrever
 * na tabela PROPRIA do console.
 *
 * Em tabela de NEGOCIO o console continua sem `INSERT`, `UPDATE` ou `DELETE`.
 * O que ele executa sao funcoes `SECURITY DEFINER` concedidas por nome (a de
 * cadastrar prefeitura, da migracao 036; as quatro de suspender, reativar,
 * agendar e cancelar eliminacao, da 038; e as tres da recuperacao de senha,
 * da 039), e o que ele escreve por conta propria e `console_operadores` e
 * `console_codigos_de_recuperacao`, que guardam as contas de quem entra AQUI
 * e nada de municipio. Se alguem escrever um `INSERT` em `organizacoes`, o
 * banco responde "permissao negada", e essa continua sendo a ordem certa das
 * defesas.
 *
 * SEPARADA de `LeituraDoConsole`, como tipo e como parametro do servidor, e nao
 * juntada numa interface so com um metodo a mais. Assim a rota que le recebe um
 * objeto que nao tem como escrever, e as rotas que escrevem aparecem na
 * assinatura de quem as monta. Um servidor montado sem `escrita` nao compila
 * com as rotas de escrita dentro.
 */
export type EscritaDoConsole = {
  /**
   * Executa uma escrita, com o operador na transacao quando ha um.
   *
   * Recebe SQL em vez de expor um metodo por campo porque todo SQL que passa
   * por aqui esta escrito por extenso em `cadastro.ts`, `municipios.ts` e
   * `operadores.ts`, junto da razao dele, e todo valor viaja como parametro do
   * driver.
   */
  executar<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
    operador?: string | null,
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
 * A abertura das transacoes do console que podem escrever.
 *
 * Igual a `ABERTURA` menos uma linha, e a linha que falta e a razao de existir
 * uma segunda constante: `SET LOCAL transaction_read_only = on` recusaria a
 * escrita que as funcoes do banco fazem por dentro, mesmo com o `EXECUTE`
 * concedido, e recusaria a linha do operador em `console_operadores`.
 *
 * O `SET LOCAL ROLE dc360_console` CONTINUA, e ele e o que importa aqui: a
 * escrita acontece com o papel pobre de sempre, que nao tem `INSERT` em tabela
 * de negocio nenhuma. O que ela alcanca em municipio e uma funcao, e o que a
 * funcao faz esta fixado no banco, nao nesta linha.
 */
export const ABERTURA_DE_ESCRITA = [
  "SET LOCAL ROLE dc360_console",
] as const;

/**
 * O contexto do operador, emitido DEPOIS da abertura e antes do SQL.
 *
 * Uma constante, e exportada, pela mesma razao das duas de cima: o teste que
 * prova que o banco recusa o operador precisa emitir exatamente o que a
 * conexao de producao emite. `set_config(nome, valor, true)` e `SET LOCAL`
 * com parametro do driver: o valor morre com a transacao, e nunca e
 * interpolado em texto.
 */
export const CONTEXTO_DO_OPERADOR =
  "SELECT set_config('app.console_operador', $1, true)";

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
    async ler<T>(
      sql: string, params: readonly unknown[] = [], operador: string | null = null,
    ): Promise<T[]> {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        for (const comando of ABERTURA) await cliente.query(comando);
        if (operador) await cliente.query(CONTEXTO_DO_OPERADOR, [operador]);
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
    async executar<T>(
      sql: string, params: readonly unknown[] = [], operador: string | null = null,
    ): Promise<T[]> {
      /*
        A mesma forma de `ler`, com a abertura de escrita: transacao explicita,
        papel do console assumido, operador no contexto, e `ROLLBACK` em
        qualquer falha. A transacao nao e detalhe: a funcao do banco cria
        municipio, administrador e a linha de nascimento na trilha, e um
        municipio que nascesse sem administrador seria pior do que nenhum.
      */
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        for (const comando of ABERTURA_DE_ESCRITA) await cliente.query(comando);
        if (operador) await cliente.query(CONTEXTO_DO_OPERADOR, [operador]);
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
