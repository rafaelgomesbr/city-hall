import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

export async function bancoEmMemoria(): Promise<BancoEmMemoria> {
  const db = new PGlite();
  await db.waitReady;

  const aqui = dirname(fileURLToPath(import.meta.url));
  const pasta = join(aqui, "..", "..", "..", "..", "db", "migrations");
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(pasta, arquivo), "utf8"));
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
