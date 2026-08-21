/**
 * A fronteira entre a API e o banco.
 *
 * Existe uma interface aqui por um motivo específico, e não por gosto de
 * abstração: a regra de isolamento é "uma conexão nunca serve a dois contextos
 * de tenant ao mesmo tempo". Com `pg` isso significa pegar um cliente do pool
 * e não devolver antes do COMMIT. Com Postgres em WebAssembly, que tem uma
 * conexão só, significa reter o mutex da biblioteca pelo bloco inteiro.
 *
 * As duas formas de cumprir a mesma regra ficam encapsuladas nas duas
 * implementações. Nenhuma rota escreve `BEGIN`, e nenhuma rota tem como
 * esquecer o `SET LOCAL`, porque não existe caminho para consultar o banco
 * sem passar por `comTenant` ou `semTenant`.
 */

export type Consulta = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

export type Banco = {
  /**
   * Executa no contexto de um município. Abre transação, assume o papel de
   * aplicação sem privilégio e define `app.organizacao_atual` a partir do
   * identificador recebido, que vem SEMPRE do token já verificado.
   */
  comTenant<T>(organizacaoId: string, execucao: (c: Consulta) => Promise<T>): Promise<T>;

  /**
   * Executa sem contexto de município, para o que acontece antes de existir
   * um: login e renovação de sessão. Continua com o papel de aplicação, então
   * as tabelas seguem protegidas: o que essas chamadas alcançam são as funções
   * SECURITY DEFINER nomeadas na migração 002, e nada além delas.
   */
  semTenant<T>(execucao: (c: Consulta) => Promise<T>): Promise<T>;

  encerrar(): Promise<void>;
};
