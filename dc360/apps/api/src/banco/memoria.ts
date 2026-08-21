import { PGlite } from "@electric-sql/pglite";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "@dc360/db";
import type { Banco, Consulta } from "./tipos.js";

/**
 * Postgres 16 em WebAssembly, para desenvolvimento e para os testes.
 *
 * Não é um simulacro: é o mesmo Postgres, executando as mesmas migrações, com
 * as mesmas policies de RLS. O que muda é que existe uma conexão só, então o
 * bloco inteiro precisa rodar dentro de `db.transaction()`, que retém o mutex
 * da biblioteca. Sem isso, duas requisições concorrentes entrelaçam o
 * `SET LOCAL` e o contexto de um município vaza para o outro.
 */
export type BancoEmMemoria = {
  banco: Banco;
  /**
   * Conexão como dono das tabelas, que ignora RLS. Existe para semear dados de
   * desenvolvimento e para o teste conferir o estado real depois de uma
   * tentativa de invasão. Nenhuma rota recebe isto.
   */
  bruto: PGlite;
};

export async function bancoEmMemoria(
  opcoes: { semear?: boolean } = {},
): Promise<BancoEmMemoria> {
  const db = new PGlite();
  await db.waitReady;

  // O MESMO aplicador que roda contra o banco de produção, e não um
  // `exec` de tudo: assim o caminho exercitado em teste é o caminho real, e
  // uma migração que quebre a ordem aparece aqui antes de aparecer no deploy.
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

  // A mesma semente que o painel web usa em modo local. Um arquivo só, para o
  // protocolo que aparece na tela ser o mesmo que a API devolve.
  if (opcoes.semear) {
    await db.exec(carregarSemente());
  }

  async function emTransacao<T>(
    organizacaoId: string | null,
    execucao: (c: Consulta) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_app");
      if (organizacaoId) {
        await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [organizacaoId]);
      }
      return execucao(tx as unknown as Consulta);
    }) as Promise<T>;
  }

  return {
    banco: {
      comTenant: (organizacaoId, execucao) => emTransacao(organizacaoId, execucao),
      semTenant: (execucao) => emTransacao(null, execucao),
      encerrar: () => db.close(),
    },
    bruto: db,
  };
}
