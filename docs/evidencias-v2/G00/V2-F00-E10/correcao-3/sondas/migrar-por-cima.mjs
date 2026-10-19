// Banco levado até a 050 pelo aplicador do repositório, semeado, com um link pendente;
// depois as migrações inteiras (só a 051 entra), e de novo (nada a fazer). Postgres real.
// Uso (a partir de dc360/apps/api): node migrar-por-cima.mjs <url-do-superusuario>
import pg from "pg";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "@dc360/db";
const base = process.argv[2];
const nome = `prova_051_${Math.random().toString(36).slice(2, 8)}`;
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`CREATE DATABASE ${nome}`);
const u = new URL(base); u.pathname = `/${nome}`;
const c = new pg.Client({ connectionString: u.toString() });
await c.connect();
const exec = { query: async (s, p) => ({ rows: (await c.query(s, p ? [...p] : undefined)).rows }), exec: (s) => c.query(s) };
try {
  const todas = carregarMigracoes();
  const ate050 = todas.filter((m) => !String(m.versao).startsWith("051"));
  console.log("migrações na pasta:", todas.length, "| até a 050:", ate050.length);
  console.log("1) aplicando até a 050:", JSON.stringify(await aplicarMigracoes(exec, ate050)));
  await c.query(carregarSemente());
  await c.query(`INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
                 SELECT organizacao_id, id, 'hash-de-prova-anterior-a-051', now() + interval '30 minutes'
                   FROM usuarios WHERE id = '11111111-1111-4111-8111-0000000000d1'`);
  console.log("2) aplicando a pasta inteira por cima:", JSON.stringify(await aplicarMigracoes(exec, todas)));
  console.log("3) de novo:", JSON.stringify(await aplicarMigracoes(exec, todas)));
  const g = await c.query(`SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'recuperacoes_morrem_com_a_credencial'`);
  console.log("gatilho:", JSON.stringify(g.rows));
  const f = await c.query(`SELECT p.proname, p.prosecdef, pg_get_userbyid(p.proowner) AS dono, p.proconfig
                             FROM pg_proc p WHERE p.proname IN ('consumir_recuperacao','invalidar_recuperacoes_pendentes') ORDER BY 1`);
  console.log("funções:", JSON.stringify(f.rows));
  const d = await c.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef");
  console.log("funções SECURITY DEFINER no esquema public:", d.rows[0].n);
  const x = await c.query(`SELECT has_function_privilege('dc360_app', 'consumir_recuperacao(text,text)', 'EXECUTE') AS app_consumir,
                                  has_function_privilege('dc360_app', 'invalidar_recuperacoes_pendentes()', 'EXECUTE') AS app_gatilho`);
  console.log("EXECUTE para dc360_app:", JSON.stringify(x.rows[0]));
  const antes = await c.query("SELECT usada_em IS NULL AS pendente FROM recuperacoes_senha WHERE token_hash = 'hash-de-prova-anterior-a-051'");
  console.log("o link anterior à 051 continua pendente depois de migrar:", antes.rows[0].pendente);
  await c.query("UPDATE usuarios SET senha_hash = senha_hash || '' , ativo = false WHERE id = '11111111-1111-4111-8111-0000000000d1'");
  const depois = await c.query("SELECT usada_em IS NULL AS pendente FROM recuperacoes_senha WHERE token_hash = 'hash-de-prova-anterior-a-051'");
  console.log("e morre com a desativação:", !depois.rows[0].pendente);
} finally {
  await c.end();
  await admin.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
  await admin.end();
}
