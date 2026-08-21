import { PGlite } from "@electric-sql/pglite";
import migracao from "../../../../db/migrations/001_base.sql?raw";
import { semear } from "./semente";

/**
 * O banco desta fase roda em PGlite: Postgres 16 compilado para WebAssembly,
 * dentro da própria aba, persistindo em IndexedDB.
 *
 * Isso não é um mock. É o mesmo arquivo de migração que vai para o servidor,
 * com as mesmas policies de Row Level Security forçadas, o mesmo papel de
 * aplicação sem privilégio e as mesmas restrições de integridade. Trocar por
 * um Postgres gerenciado depois é trocar a origem da conexão, não as regras:
 * elas já estão no banco, não na tela.
 */

let instancia: PGlite | null = null;
let iniciando: Promise<PGlite> | null = null;

const CHAVE_PERSISTENCIA = "idb://dc360";
const MARCA_SEMENTE = "dc360:semeado:v1";

export async function banco(): Promise<PGlite> {
  if (instancia) return instancia;
  if (iniciando) return iniciando;

  iniciando = (async () => {
    const db = new PGlite(CHAVE_PERSISTENCIA);
    await db.waitReady;

    const jaMigrado = await db.query<{ existe: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ocorrencias') AS existe",
    );

    if (!jaMigrado.rows[0]?.existe) {
      await db.exec(migracao);
    }
    if (!localStorage.getItem(MARCA_SEMENTE)) {
      await semear(db);
      localStorage.setItem(MARCA_SEMENTE, new Date().toISOString());
    }

    instancia = db;
    return db;
  })();

  return iniciando;
}

/**
 * Toda leitura e escrita da aplicação passa por aqui.
 *
 * O contrato é o mesmo que a API vai cumprir em produção: abrir transação,
 * assumir o papel `dc360_app` (que não é superusuário e não é dono das
 * tabelas, senão o RLS seria ignorado) e definir a organização do contexto
 * com SET LOCAL, sempre a partir da sessão já autenticada, nunca de
 * parâmetro que veio da tela.
 *
 * Consequência prática: se alguém esquecer o `WHERE organizacao_id = ...`
 * numa consulta, o banco continua devolvendo só o município certo.
 */
export async function comoApp<T>(
  organizacaoId: string | null,
  execucao: (db: PGlite) => Promise<T>,
): Promise<T> {
  const db = await banco();
  await db.exec("BEGIN");
  try {
    await db.exec("SET LOCAL ROLE dc360_app");
    if (organizacaoId) {
      await db.query("SELECT set_config('app.organizacao_atual', $1, true)", [organizacaoId]);
    }
    const resultado = await execucao(db);
    await db.exec("COMMIT");
    return resultado;
  } catch (erro) {
    await db.exec("ROLLBACK");
    throw erro;
  }
}

/** Consulta de infraestrutura, fora do contexto de tenant (login, por exemplo). */
export async function semTenant<T>(execucao: (db: PGlite) => Promise<T>): Promise<T> {
  return execucao(await banco());
}

export async function recriarBanco(): Promise<void> {
  const db = await banco();
  await db.close();
  instancia = null;
  iniciando = null;
  localStorage.removeItem(MARCA_SEMENTE);
  indexedDB.deleteDatabase("/pglite/dc360");
}
