// Contagens antes e depois do backfill da 054, sobre a semente de desenvolvimento
// (script de evidência da V2-F03-E15; não fica no repositório).
import { PGlite } from "@electric-sql/pglite";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "./src/index.js";

const db = new PGlite();
const bd = {
  query: async <T>(sql: string, params?: readonly unknown[]) => {
    const r = await db.query<Record<string, unknown>>(sql, params ? [...params] : undefined);
    return { rows: r.rows as T[] };
  },
  exec: (sql: string) => db.exec(sql),
};
const todas = carregarMigracoes();
const i = todas.findIndex((m) => m.versao.startsWith("054_"));
await aplicarMigracoes(bd, todas.slice(0, i));
await db.exec(carregarSemente());

const contar = async (rotulo: string, sql: string) => {
  const r = await db.query<Record<string, unknown>>(sql);
  console.log(`${rotulo}: ${JSON.stringify(r.rows[0])}`);
};
console.log(`ultima migracao antes: ${todas[i - 1]!.versao}`);
await contar("ANTES", `SELECT (SELECT count(*)::int FROM usuarios) AS contas,
  (SELECT count(*)::int FROM usuarios WHERE ativo) AS contas_ativas,
  (SELECT count(*)::int FROM usuarios WHERE senha_hash IS NOT NULL) AS contas_com_senha,
  (SELECT count(DISTINCT lower(email))::int FROM usuarios) AS emails_distintos,
  (SELECT count(*)::int FROM sessoes) AS sessoes,
  (SELECT count(*)::int FROM segundo_fator) AS segundo_fator,
  (SELECT count(*)::int FROM organizacoes) AS municipios`);

await aplicarMigracoes(bd, todas.slice(0, i + 1));
console.log(`aplicada: ${todas[i]!.versao}`);
await contar("DEPOIS", `SELECT (SELECT count(*)::int FROM usuarios) AS contas,
  (SELECT count(*)::int FROM pessoas) AS pessoas,
  (SELECT count(DISTINCT pessoa_id)::int FROM usuarios) AS pessoas_distintas_nas_contas,
  (SELECT count(*)::int FROM origens_de_conta WHERE origem = 'backfill') AS marcas_backfill,
  (SELECT count(*)::int FROM origens_de_conta) AS marcas_total,
  (SELECT count(*)::int FROM usuarios WHERE pessoa_id IS NULL) AS contas_sem_pessoa,
  (SELECT count(*)::int FROM sessoes) AS sessoes,
  (SELECT count(*)::int FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.pessoa_id = u.pessoa_id) AS sessoes_com_a_pessoa_da_conta,
  (SELECT count(*)::int FROM segundo_fator) AS segundo_fator,
  (SELECT count(*)::int FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id
     WHERE p.email IS DISTINCT FROM u.email OR p.senha_hash IS DISTINCT FROM u.senha_hash
        OR p.falhas_login IS DISTINCT FROM u.falhas_login OR p.bloqueado_ate IS DISTINCT FROM u.bloqueado_ate
        OR p.senha_provisoria_ate IS DISTINCT FROM u.senha_provisoria_ate) AS credenciais_divergentes`);
await db.close();
