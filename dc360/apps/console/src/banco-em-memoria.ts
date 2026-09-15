import { ABERTURA, ABERTURA_DE_ESCRITA, type BancoDoConsole } from "./banco.js";

/**
 * Postgres em WebAssembly, para desenvolver o console e para testá-lo.
 *
 * Não é um simulacro. São as mesmas migrações, o mesmo papel `dc360_console`
 * criado pela 023 e as mesmas concessões: quando o teste conecta por aqui e
 * tenta ler `ocorrencias`, quem recusa é o Postgres, e não uma condição escrita
 * em TypeScript. É essa propriedade que faz o teste negativo valer alguma coisa.
 *
 * A importação do PGlite e do pacote de migrações é DINÂMICA, e isso é
 * deliberado: os dois estão em `devDependencies`, e um `import` no topo faria a
 * imagem de produção do console precisar carregar um Postgres inteiro em
 * WebAssembly para nunca usá-lo. O caminho de produção é `bancoPostgres`, e
 * ele não passa por este arquivo.
 */

export type ConsoleEmMemoria = {
  banco: BancoDoConsole;
  /**
   * Conexão como dona das tabelas, que ignora RLS.
   *
   * Existe para o teste montar o cenário (criar município, escrever métrica) e
   * para conferir o estado real depois de uma tentativa de leitura indevida.
   * O servidor do console NUNCA recebe isto: ele recebe apenas `banco`, que
   * fala com o Postgres pelo papel `dc360_console`.
   */
  bruto: {
    query<T = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: T[] }>;
    exec(sql: string): Promise<unknown>;
  };
};

/**
 * `diretorio` guarda os arquivos do Postgres em WebAssembly em disco, em vez de
 * na memória. Ver `CONSOLE_BANCO_LOCAL` em `config.ts` para as duas razões.
 */
export async function consoleEmMemoria(diretorio?: string): Promise<ConsoleEmMemoria> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { aplicarMigracoes, carregarMigracoes } = await import("@dc360/db");

  const db = diretorio ? new PGlite(diretorio) : new PGlite();
  await db.waitReady;

  // O MESMO aplicador que roda contra o banco de produção, para uma migração
  // que quebre a ordem aparecer aqui antes de aparecer no deploy.
  await aplicarMigracoes(
    {
      query: async <T>(sql: string, params?: readonly unknown[]) => {
        const r = await db.query<Record<string, unknown>>(
          sql, params ? [...params] : undefined,
        );
        return { rows: r.rows as T[] };
      },
      exec: (sql: string) => db.exec(sql),
    },
    carregarMigracoes(),
  );

  const banco: BancoDoConsole = {
    async ler<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      /*
        `db.transaction()` e não BEGIN solto, pela mesma razão do painel em modo
        local: o Postgres em WebAssembly tem uma conexão só e solta o mutex entre
        comandos, então dois blocos concorrentes entrelaçariam o `SET LOCAL` e um
        deles rodaria fora do papel do console, como superusuário. Isso
        transformaria o teste negativo em teatro exatamente no caso que ele
        existe para cobrir.

        A ABERTURA é a mesma constante que a conexão de produção usa, e não uma
        cópia: um teste que montasse a própria transação estaria atestando algo
        que ninguém executa.
      */
      return db.transaction(async (tx) => {
        for (const comando of ABERTURA) await tx.exec(comando);
        const r = await tx.query<Record<string, unknown>>(
          sql, params.length > 0 ? [...params] : undefined,
        );
        return r.rows as T[];
      }) as Promise<T[]>;
    },
    /*
      A escrita, com a MESMA abertura que a conexão de produção emite, e pela
      mesma razão que vale para a leitura: um teste que montasse a própria
      transação (sem `SET LOCAL ROLE`, ou com outro papel) estaria atestando
      algo que ninguém executa, e a recusa que ele mostrasse viria de graça.
    */
    async executar<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      return db.transaction(async (tx) => {
        for (const comando of ABERTURA_DE_ESCRITA) await tx.exec(comando);
        const r = await tx.query<Record<string, unknown>>(
          sql, params.length > 0 ? [...params] : undefined,
        );
        return r.rows as T[];
      }) as Promise<T[]>;
    },
    encerrar: () => db.close(),
  };

  return {
    banco,
    bruto: {
      query: async <T>(sql: string, params?: readonly unknown[]) => {
        const r = await db.query<Record<string, unknown>>(
          sql, params ? [...params] : undefined,
        );
        return { rows: r.rows as T[] };
      },
      exec: (sql: string) => db.exec(sql),
    },
  };
}
