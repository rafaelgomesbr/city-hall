import pg from "pg";
import type { Banco, Consulta } from "./tipos.js";

/**
 * Implementação de produção, sobre um pool do `pg`.
 *
 * O ponto que importa: `pool.connect()` retira um cliente do pool e ele só
 * volta no `release()`, depois do COMMIT. Enquanto a transação existe, aquela
 * conexão é exclusiva desta requisição, e o `SET LOCAL` não tem como escapar
 * para outra. É o mesmo invariante que o Postgres em WebAssembly precisa de um
 * mutex para garantir, aqui obtido de graça pelo pool.
 */
export function bancoPostgres(url: string, maximoConexoes = 10): Banco {
  const pool = new pg.Pool({
    connectionString: url,
    max: maximoConexoes,
    // Conexão pendurada é conexão que some do pool sem avisar.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  async function emTransacao<T>(
    organizacaoId: string | null,
    execucao: (c: Consulta) => Promise<T>,
  ): Promise<T> {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("SET LOCAL ROLE dc360_app");
      if (organizacaoId) {
        await cliente.query("SELECT set_config('app.organizacao_atual', $1, true)", [organizacaoId]);
      }
      const resultado = await execucao(cliente as unknown as Consulta);
      await cliente.query("COMMIT");
      return resultado;
    } catch (erro) {
      await cliente.query("ROLLBACK").catch(() => undefined);
      throw erro;
    } finally {
      cliente.release();
    }
  }

  return {
    comTenant: (organizacaoId, execucao) => emTransacao(organizacaoId, execucao),
    semTenant: (execucao) => emTransacao(null, execucao),
    encerrar: () => pool.end(),
  };
}
