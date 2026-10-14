/**
 * Sonda da migração 049 em Postgres real (V2-F00-E07, correção 2).
 *
 * Uso (com um servidor Postgres DESCARTÁVEL e a URL de um superusuário dele):
 *
 *   node sonda-049.mjs preparar <url-superusuario>   banco prova_c2_migrar até a 048, papéis como o job implantavel, sessões
 *   (aqui o `npm run migrar` de verdade, com DATABASE_URL do dc360_setup: --conferir, aplicar, --conferir, aplicar)
 *   node sonda-049.mjs conferir <url-superusuario>   catálogo, sessões preservadas, recusa de família encerrada, disputa em duas conexões
 *   node sonda-049.mjs apagar <url-superusuario>     apaga o banco e os papéis
 *
 * Papéis como o job `implantavel` do CI: `dc360_setup` (CREATEROLE, BYPASSRLS,
 * NOSUPERUSER) cria e migra; `dc360_api` é login restrito, membro de
 * `dc360_app`. As senhas são sorteadas a cada `preparar` e ficam só no arquivo
 * `.senhas-prova` ao lado do script, que `apagar` remove.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const RAIZ = "C:/Projetos/city-hall/dc360";
const require = createRequire(join(RAIZ, "apps/api/package.json"));
const pg = require("pg");
const db = await import(pathToFileURL(join(RAIZ, "db/dist/index.js")).href);

const [, , fase, urlSuper] = process.argv;
const BANCO = "prova_c2_migrar";
const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQ_SENHAS = join(AQUI, ".senhas-prova");
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";

function url(base, { usuario, senha, banco }) {
  const u = new URL(base);
  if (usuario) { u.username = usuario; u.password = senha; }
  if (banco) u.pathname = `/${banco}`;
  return u.toString();
}

async function conectar(endereco) {
  const c = new pg.Client({ connectionString: endereco });
  await c.connect();
  return c;
}

function linha(...partes) { console.log(partes.join(" ")); }

async function preparar() {
  const senhas = { setup: randomBytes(12).toString("hex"), api: randomBytes(12).toString("hex") };
  writeFileSync(ARQ_SENHAS, JSON.stringify(senhas));
  const sup = await conectar(urlSuper);
  await sup.query(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
  await sup.query(`CREATE DATABASE ${BANCO}`);
  for (const [papel, extra] of [["dc360_setup", "CREATEROLE BYPASSRLS NOSUPERUSER"], ["dc360_api", "NOSUPERUSER"]]) {
    const existe = await sup.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [papel]);
    const senha = papel === "dc360_setup" ? senhas.setup : senhas.api;
    await sup.query(`${existe.rows.length ? "ALTER" : "CREATE"} ROLE ${papel} LOGIN PASSWORD '${senha}' ${extra}`);
  }
  // Num servidor que já rodou a suíte, os papéis que as migrações criam já
  // existem (são do servidor, não do banco). O `dc360_setup` os teria criado
  // num servidor novo, e quem cria um papel o administra: aqui isso é dado.
  for (const papel of ["dc360_app", "dc360_console"]) {
    const existe = await sup.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [papel]);
    if (existe.rows.length) await sup.query(`GRANT ${papel} TO dc360_setup WITH ADMIN OPTION`);
  }
  await sup.end();
  const supDoBanco = await conectar(url(urlSuper, { banco: BANCO }));
  await supDoBanco.query("ALTER SCHEMA public OWNER TO dc360_setup");
  await supDoBanco.query("GRANT ALL ON SCHEMA public TO dc360_setup");
  await supDoBanco.query(`GRANT CREATE ON DATABASE ${BANCO} TO dc360_setup`);
  await supDoBanco.end();

  const setup = await conectar(url(urlSuper, { usuario: "dc360_setup", senha: senhas.setup, banco: BANCO }));
  const executor = {
    query: async (sql, params) => ({ rows: (await setup.query(sql, params ? [...params] : undefined)).rows }),
    exec: (sql) => setup.query(sql),
  };
  const ate048 = db.carregarMigracoes().filter((m) => m.versao < "049");
  const r = await db.aplicarMigracoes(executor, ate048);
  linha("aplicadas ate a 048:", r.aplicadas.length, "ultima:", r.aplicadas.at(-1));
  await setup.query(db.carregarSemente());

  // Três cadeias da Helena ANTES da 049: viva de um login, rotacionada uma vez, encerrada por quem administra.
  const abrir = async (hash, familia = null) => (await setup.query(
    "SELECT abrir_sessao($1,$2,$3,interval '1 day',NULL,NULL,$4) AS id", [SERRA_ALTA, HELENA, hash, familia],
  )).rows[0].id;
  const f1 = await abrir("sonda-f1-viva");
  const f2raiz = await abrir("sonda-f2-raiz");
  await setup.query("SELECT revogar_sessao('sonda-f2-raiz','rotacionada na renovacao')");
  await abrir("sonda-f2-viva", f2raiz);
  const f3 = await abrir("sonda-f3-encerrada");
  await setup.query("UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'sessoes encerradas por quem administra' WHERE id = $1", [f3]);
  const antes = await setup.query("SELECT id, familia_id, revogada_em IS NULL AS viva, motivo_revogacao FROM sessoes ORDER BY token_hash");
  writeFileSync(join(AQUI, ".sessoes-antes.json"), JSON.stringify(antes.rows));
  linha("sessoes antes da 049:", antes.rows.length, "familias da sonda:", [f1, f2raiz, f3].length);
  await setup.end();

  const sup2 = await conectar(url(urlSuper, { banco: BANCO }));
  await sup2.query("GRANT dc360_app TO dc360_api WITH SET TRUE");
  await sup2.end();
  linha("DATABASE_URL do setup (para o npm run migrar):", url(urlSuper, { usuario: "dc360_setup", senha: "<sorteada>", banco: BANCO }));
}

async function conferir() {
  const senhas = JSON.parse(readFileSync(ARQ_SENHAS, "utf8"));
  const sup = await conectar(url(urlSuper, { banco: BANCO }));
  const q = async (sql, p) => (await sup.query(sql, p)).rows;

  // 1. As sessões que existiam continuam como estavam.
  const antes = JSON.parse(readFileSync(join(AQUI, ".sessoes-antes.json"), "utf8"));
  const depois = await q("SELECT id, familia_id, revogada_em IS NULL AS viva, motivo_revogacao FROM sessoes ORDER BY token_hash");
  linha("1. sessoes preservadas pela 049:", JSON.stringify(antes) === JSON.stringify(depois), `(${depois.length} linhas)`);

  // 2. Catálogo.
  const definers = await q("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef");
  linha("2. funcoes SECURITY DEFINER no public:", definers[0].n);
  const funcoes = await q(`SELECT p.proname, p.prosecdef, pg_get_userbyid(p.proowner) AS dono, p.proconfig,
      has_function_privilege('public', p.oid, 'EXECUTE') AS public_executa,
      has_function_privilege('dc360_app', p.oid, 'EXECUTE') AS app_executa,
      has_function_privilege('dc360_console', p.oid, 'EXECUTE') AS console_executa
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('travar_sessoes_do_usuario','revogar_sessoes_do_usuario','trocar_senha','consumir_recuperacao','abrir_sessao')
   ORDER BY p.proname`);
  for (const f of funcoes) {
    linha("   ", f.proname, "definer:", f.prosecdef, "dono:", f.dono, "config:", JSON.stringify(f.proconfig),
      "PUBLIC:", f.public_executa, "dc360_app:", f.app_executa, "dc360_console:", f.console_executa);
  }

  // 3. Recusa de família encerrada, e herança da família viva, como a API chama (papel de aplicação).
  const api = await conectar(url(urlSuper, { usuario: "dc360_api", senha: senhas.api, banco: BANCO }));
  const comoApp = async (fn) => {
    await api.query("BEGIN");
    try {
      await api.query("SET LOCAL ROLE dc360_app");
      await api.query("SELECT set_config('app.organizacao_atual', $1, true)", [SERRA_ALTA]);
      const r = await fn(api);
      await api.query("COMMIT");
      return r;
    } catch (e) { await api.query("ROLLBACK"); throw e; }
  };
  const familiaDe = async (hash) => (await q("SELECT familia_id FROM sessoes WHERE token_hash = $1", [hash]))[0].familia_id;
  const f3 = await familiaDe("sonda-f3-encerrada");
  try {
    await comoApp((c) => c.query("SELECT abrir_sessao($1,$2,'sonda-f3-ressuscitada',interval '1 day',NULL,NULL,$3)", [SERRA_ALTA, HELENA, f3]));
    linha("3. familia encerrada: ACEITOU a heranca (defeito)");
  } catch (e) {
    linha("3. familia encerrada: recusada com", e.code, "-", e.message);
  }
  const f2 = await familiaDe("sonda-f2-viva");
  await comoApp(async (c) => {
    await c.query("SELECT travar_sessoes_do_usuario($1)", [HELENA]);
    await c.query("SELECT revogar_sessao('sonda-f2-viva','rotacionada na renovacao')");
    await c.query("SELECT abrir_sessao($1,$2,'sonda-f2-renovada',interval '1 day',NULL,NULL,$3)", [SERRA_ALTA, HELENA, f2]);
  });
  linha("   familia viva rotacionada: herdou, sessoes vivas na familia:",
    (await q("SELECT count(*)::int AS n FROM sessoes WHERE familia_id = $1 AND revogada_em IS NULL", [f2]))[0].n);

  // 4. A disputa em duas conexões: A renova (trava, revoga, abre) e para antes do COMMIT; B encerra.
  async function disputa(rotulo, encerrar) {
    const hashViva = `sonda-disputa-${rotulo}`;
    const raiz = (await q("SELECT abrir_sessao($1,$2,$3,interval '1 day',NULL,NULL) AS id", [SERRA_ALTA, HELENA, hashViva]))[0].id;
    const a = await conectar(url(urlSuper, { usuario: "dc360_api", senha: senhas.api, banco: BANCO }));
    const b = await conectar(url(urlSuper, { usuario: "dc360_api", senha: senhas.api, banco: BANCO }));
    await a.query("BEGIN");
    await a.query("SET LOCAL ROLE dc360_app");
    await a.query("SELECT set_config('app.organizacao_atual', $1, true)", [SERRA_ALTA]);
    await a.query("SELECT travar_sessoes_do_usuario($1)", [HELENA]);
    await a.query("SELECT revogar_sessao($1,'rotacionada na renovacao')", [hashViva]);

    await b.query("BEGIN");
    await b.query("SET LOCAL ROLE dc360_app");
    await b.query("SELECT set_config('app.organizacao_atual', $1, true)", [SERRA_ALTA]);
    const pidB = (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const encerrou = encerrar(b).then(async (n) => { await b.query("COMMIT"); return n; });
    await new Promise((r) => setTimeout(r, 400));
    const espera = (await q("SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1", [pidB]))[0];

    await a.query("SELECT abrir_sessao($1,$2,$3,interval '1 day',NULL,NULL,$4)", [SERRA_ALTA, HELENA, `${hashViva}-nova`, raiz]);
    await a.query("COMMIT");
    const n = await encerrou;
    const vivas = (await q("SELECT count(*)::int AS n FROM sessoes WHERE familia_id = $1 AND revogada_em IS NULL", [raiz]))[0].n;
    linha(`4. ${rotulo}: B esperando (${espera.wait_event_type ?? "nao esperava"}/${espera.wait_event ?? "-"}) enquanto A segurava;`,
      `B encerrou ${n < 0 ? "(a funcao nao devolve contagem)" : n + " sessao(oes)"}; vivas na cadeia depois das duas: ${vivas}`);
    await a.end(); await b.end();
    return vivas;
  }
  const encerrarPelaApi = (b) => b.query("SELECT travar_sessoes_do_usuario($1)", [HELENA])
    .then(() => b.query(`UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'sessoes encerradas por quem administra'
                          WHERE usuario_id = $1 AND revogada_em IS NULL RETURNING id`, [HELENA]))
    .then((r) => r.rows.length);
  const resultados = [
    await disputa("quem administra (trava e UPDATE de auth/sessoes.ts)", encerrarPelaApi),
    await disputa("reuso e desativacao (revogar_sessoes_do_usuario)", (b) =>
      b.query("SELECT revogar_sessoes_do_usuario($1, 'reuso de token de renovacao') AS n", [HELENA]).then((r) => r.rows[0].n)),
    await disputa("troca de senha (trocar_senha)", (b) =>
      b.query("SELECT trocar_senha($1, 'hash-da-sonda', NULL)", [HELENA]).then(() => -1)),
  ];
  // Controle: o UPDATE do código ANTERIOR, sem a trava. A transação única sozinha não basta.
  const controle = await disputa("CONTROLE sem trava (o UPDATE de antes da correcao)", (b) =>
    b.query(`UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'sessoes encerradas por quem administra'
              WHERE usuario_id = $1 AND revogada_em IS NULL RETURNING id`, [HELENA]).then((r) => r.rows.length));
  linha("   com a trava, vivas por disputa:", JSON.stringify(resultados), "| controle sem trava:", controle);
  await api.end();
  await sup.end();
}

async function apagar() {
  const sup = await conectar(urlSuper);
  await sup.query(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
  for (const papel of ["dc360_api"]) await sup.query(`DROP ROLE IF EXISTS ${papel}`);
  await sup.end();
  for (const f of [ARQ_SENHAS, join(AQUI, ".sessoes-antes.json")]) if (existsSync(f)) rmSync(f);
  linha("banco", BANCO, "apagado");
}

if (fase === "preparar") await preparar();
else if (fase === "conferir") await conferir();
else if (fase === "apagar") await apagar();
else { console.error("fase: preparar | conferir | apagar"); process.exit(2); }
