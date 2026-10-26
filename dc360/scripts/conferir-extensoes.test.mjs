/**
 * A conferência de extensões (PostGIS), provada sem banco nenhum (V2-F01-E22).
 *
 * `conferir-extensoes.mjs` consulta o banco, mas a decisão do que é problema
 * mora em `avaliarExtensoes`, uma função pura sobre "fatos". Aqui os fatos são
 * escritos à mão, e cada caso negativo estraga uma coisa do jeito que o defeito
 * real estragaria. A prova com Postgres de verdade (o SQL de
 * `db/provedores/postgis.sql` e de `supabase-endurecer.sql`) é o teste
 * `db/test/postgis-provedor.espacial.test.ts`, que roda no job `implantavel`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONSULTAS,
  ESQUEMA_PADRAO,
  PAPEIS_DO_PROVEDOR,
  PRIVILEGIOS_DE_SEQUENCIA,
  PRIVILEGIOS_DE_TABELA,
  PRIVILEGIO_DE_CRIACAO,
  avaliarExtensoes,
  coletarFatos,
  executarExtensoes,
  lerArgumentosDeExtensoes,
  urlParaConferencia,
} from "./conferir-extensoes.mjs";
import { lerArgumentos } from "./conferir-ambiente.mjs";

const SCRIPT = fileURLToPath(new URL("./conferir-ambiente.mjs", import.meta.url));
const SQL_ENDURECER = fileURLToPath(
  new URL("../db/provedores/supabase-endurecer.sql", import.meta.url),
);

/** Fatos de um HML saudável: instalado em `extensions`, ninguém exposto. */
const saudavel = () => ({
  disponivel: { versaoPadrao: "3.5.2", versaoInstalada: "3.5.2" },
  instalada: { esquema: "extensions", versao: "3.5.2" },
  criacao: { superusuario: false, donoDoBanco: true, criaNoBanco: true, confiavel: true },
  exposicao: [],
  aplicacao: {
    existe: true,
    usoNoEsquema: true,
    selectSpatialRefSys: true,
    funcoesSemExecute: 0,
  },
});

test("HML saudável: nenhum problema e a versão aparece na saída", () => {
  const r = avaliarExtensoes(saudavel());
  assert.deepEqual(r.problemas, []);
  assert.match(r.linhas.join("\n"), /versão 3\.5\.2, schema extensions/);
});

test("sem a extensão no provedor: reprova e cita o CP-44", () => {
  const r = avaliarExtensoes({ ...saudavel(), disponivel: null, instalada: null });
  assert.equal(r.problemas.length, 1);
  assert.match(r.problemas[0], /pg_available_extensions.*CP-44/);
});

test("HML sem a extensão instalada reprova; PROD só avisa (a extensão nasce na F32)", () => {
  const fatos = { ...saudavel(), instalada: null, aplicacao: null };
  assert.match(avaliarExtensoes(fatos, { ambiente: "hml" }).problemas[0], /não está instalado/);
  const prod = avaliarExtensoes(fatos, { ambiente: "prod" });
  assert.deepEqual(prod.problemas, []);
  assert.match(prod.avisos[0], /F32/);
});

test("PROD sem a extensão disponível reprova (é a única exigência em PROD)", () => {
  const r = avaliarExtensoes({ disponivel: null, instalada: null }, { ambiente: "prod" });
  assert.equal(r.problemas.length, 1);
});

test("PROD com a extensão já instalada confere o resto igual ao HML", () => {
  const fatos = { ...saudavel(), exposicao: [{ papel: "anon", objetos: 1, exemplos: ["x"] }] };
  const r = avaliarExtensoes(fatos, { ambiente: "prod" });
  assert.equal(r.problemas.length, 1);
});

test("extensão em public reprova, com o motivo da API REST", () => {
  const fatos = saudavel();
  fatos.instalada.esquema = "public";
  const r = avaliarExtensoes(fatos);
  assert.ok(r.problemas.some((t) => /schema public.*API REST/.test(t)));
});

test("extensão em outro schema que não o esperado reprova; --esquema muda o esperado", () => {
  const fatos = saudavel();
  fatos.instalada.esquema = "gis";
  assert.match(avaliarExtensoes(fatos).problemas[0], /schema gis; o esperado é extensions/);
  assert.deepEqual(avaliarExtensoes(fatos, { esquema: "gis" }).problemas, []);
});

test("anon com SELECT em spatial_ref_sys aparece na conferência (o PR de prova)", () => {
  const fatos = saudavel();
  fatos.exposicao = [{ papel: "anon", objetos: 1, exemplos: ["spatial_ref_sys"] }];
  const r = avaliarExtensoes(fatos);
  assert.equal(r.problemas.length, 1);
  assert.match(
    r.problemas[0],
    /anon tem privilégio em 1 objeto\(s\).*spatial_ref_sys.*supabase-endurecer/,
  );
});

test("PUBLIC com EXECUTE nas funções reprova, e cada papel exposto é um problema", () => {
  const fatos = saudavel();
  fatos.exposicao = [
    { papel: "PUBLIC", objetos: 1200, exemplos: ["st_area"] },
    { papel: "service_role", objetos: 3, exemplos: [] },
  ];
  const r = avaliarExtensoes(fatos);
  assert.equal(r.problemas.length, 2);
  assert.match(r.problemas[0], /PUBLIC tem privilégio em 1200/);
});

test("sem USAGE no schema, o smoke da E21 falharia: reprova", () => {
  const fatos = saudavel();
  fatos.aplicacao.usoNoEsquema = false;
  assert.match(
    avaliarExtensoes(fatos).problemas[0],
    /dc360_app não tem USAGE.*smoke espacial da E21/,
  );
});

test("sem SELECT em spatial_ref_sys ou sem EXECUTE nas funções, reprova", () => {
  const fatos = saudavel();
  fatos.aplicacao.selectSpatialRefSys = false;
  fatos.aplicacao.funcoesSemExecute = 7;
  const r = avaliarExtensoes(fatos);
  assert.equal(r.problemas.length, 2);
  assert.match(r.problemas.join("\n"), /spatial_ref_sys/);
  assert.match(r.problemas.join("\n"), /EXECUTE em 7 função/);
});

test("dc360_app inexistente reprova (não há o que conferir)", () => {
  const fatos = saudavel();
  fatos.aplicacao = { existe: false };
  assert.match(avaliarExtensoes(fatos).problemas[0], /dc360_app não existe/);
});

// ---------------------------------------------------------------------------
// As consultas: só leitura, e a coleta monta os fatos certos.
// ---------------------------------------------------------------------------

test("nenhuma consulta escreve", () => {
  const escrita = /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|SET)\b/i;
  for (const [nome, sql] of Object.entries(CONSULTAS)) {
    assert.doesNotMatch(sql, escrita, `a consulta ${nome} tem comando de escrita`);
  }
});

test("coletarFatos monta os fatos das linhas e não consulta o resto sem instalação", async () => {
  const chamadas = [];
  const consultar = async (sql) => {
    chamadas.push(sql);
    if (sql === CONSULTAS.disponivel)
      return [{ default_version: "3.5.2", installed_version: null }];
    return [];
  };
  const fatos = await coletarFatos(consultar);
  assert.deepEqual(fatos.disponivel, { versaoPadrao: "3.5.2", versaoInstalada: null });
  assert.equal(fatos.instalada, null);
  // Disponível e não instalada: também pergunta se o papel de setup consegue criar.
  assert.deepEqual(chamadas, [CONSULTAS.disponivel, CONSULTAS.instalada, CONSULTAS.criacao]);
});

test("coletarFatos com a extensão instalada passa os papéis do provedor e o schema reais", async () => {
  const recebidos = {};
  const consultar = async (sql, parametros) => {
    recebidos[sql] = parametros;
    if (sql === CONSULTAS.disponivel)
      return [{ default_version: "3.5.2", installed_version: "3.5.2" }];
    if (sql === CONSULTAS.instalada) return [{ esquema: "extensions", versao: "3.5.2" }];
    if (sql === CONSULTAS.exposicao)
      return [{ papel: "anon", objetos: 2, exemplos: ["spatial_ref_sys", "geometry_columns"] }];
    return [{ existe: true, uso_no_esquema: true, select_srs: true, funcoes_sem_execute: 0 }];
  };
  const fatos = await coletarFatos(consultar);
  assert.deepEqual(recebidos[CONSULTAS.exposicao], [
    PAPEIS_DO_PROVEDOR,
    PRIVILEGIOS_DE_TABELA,
    PRIVILEGIOS_DE_SEQUENCIA,
  ]);
  assert.deepEqual(recebidos[CONSULTAS.aplicacao], ["extensions", "dc360_app"]);
  assert.equal(fatos.exposicao[0].papel, "anon");
  assert.equal(avaliarExtensoes(fatos).problemas.length, 1);
});

// ---------------------------------------------------------------------------
// Argumentos e o comando.
// ---------------------------------------------------------------------------

test("argumentos: --extensoes tem ambiente hml por padrão e recusa o que não é dele", () => {
  assert.deepEqual(lerArgumentosDeExtensoes(["--extensoes"]), {
    extensoes: true,
    ambiente: "hml",
    esquema: ESQUEMA_PADRAO,
    fatos: undefined,
  });
  assert.equal(lerArgumentosDeExtensoes(["--extensoes", "--ambiente=prod"]).ambiente, "prod");
  assert.match(lerArgumentosDeExtensoes(["--extensoes", "--ambiente=dev"]).erro, /hml ou prod/);
  assert.match(lerArgumentosDeExtensoes(["--extensoes", "--app=api"]).erro, /não vale/);
  assert.match(lerArgumentosDeExtensoes(["--extensoes", "--esquema=Ruim; DROP"]).erro, /schema/);
  assert.match(lerArgumentosDeExtensoes(["--extensoes", "--fatos"]).erro, /arquivo/);
  assert.match(lerArgumentosDeExtensoes(["--extensoes=1"]).erro, /não aceita valor/);
});

test("argumentos: conferir-ambiente delega a --extensoes e o resto segue igual", () => {
  assert.equal(lerArgumentos(["--extensoes"]).extensoes, true);
  assert.equal(lerArgumentos([]).comparar, false);
  assert.equal(lerArgumentos(["--ambiente=prod", "--app=api"]).comparar, true);
});

test("o comando sem DATABASE_URL_SETUP e sem --fatos sai com 2 e diz o que falta", async () => {
  const erros = [];
  const saida = { log() {}, error: (t) => erros.push(t) };
  const codigo = await executarExtensoes(
    { ambiente: "hml", esquema: "extensions" },
    { env: {}, saida },
  );
  assert.equal(codigo, 2);
  assert.match(erros.join("\n"), /DATABASE_URL_SETUP/);
});

function rodarComFatos(fatos, args = []) {
  const pasta = mkdtempSync(join(tmpdir(), "fatos-extensoes-"));
  try {
    const arquivo = join(pasta, "fatos.json");
    writeFileSync(arquivo, JSON.stringify(fatos));
    return spawnSync(process.execPath, [SCRIPT, "--extensoes", `--fatos=${arquivo}`, ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

test("o comando: fatos saudáveis saem com 0; anon exposto sai com 1 e nomeia o papel", () => {
  const ok = rodarComFatos(saudavel());
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /--extensoes: confere/);

  const fatos = saudavel();
  fatos.exposicao = [{ papel: "anon", objetos: 1, exemplos: ["spatial_ref_sys"] }];
  const ruim = rodarComFatos(fatos);
  assert.equal(ruim.status, 1);
  assert.match(ruim.stderr, /PROBLEMA: anon tem privilégio/);
});

test("o comando: PROD com a extensão só disponível confere com 0", () => {
  const fatos = {
    disponivel: { versaoPadrao: "3.5.2", versaoInstalada: null },
    instalada: null,
    criacao: { superusuario: false, donoDoBanco: true, criaNoBanco: true, confiavel: true },
  };
  const r = rodarComFatos(fatos, ["--ambiente=prod"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /aviso: .*F32/);
});

test("o comando: arquivo de fatos que não é JSON sai com 2, sem despejar o conteúdo", () => {
  const pasta = mkdtempSync(join(tmpdir(), "fatos-ruins-"));
  try {
    const arquivo = join(pasta, "fatos.json");
    writeFileSync(arquivo, "senha=nao-pode-aparecer");
    const r = spawnSync(process.execPath, [SCRIPT, "--extensoes", `--fatos=${arquivo}`], {
      encoding: "utf8",
    });
    assert.equal(r.status, 2);
    assert.doesNotMatch(r.stdout + r.stderr, /nao-pode-aparecer/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("o comando: falha de conexão sai com 2 e a URL (usuário e senha) nunca aparece", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--extensoes"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      DATABASE_URL_SETUP: "postgres://usuario-secreto:senha-secreta@127.0.0.1:1/banco",
    },
  });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, /usuario-secreto|senha-secreta/);
  assert.match(r.stderr, /não consegui conectar/);
});

// ---------------------------------------------------------------------------
// As consultas de verdade, num Postgres de verdade (PGlite), com `pg_trgm` no
// lugar do PostGIS. É a única prova local de que o SQL das consultas e o do
// endurecimento executam e se entendem; a do PostGIS em si é do teste espacial
// (`db/test/postgis-provedor.espacial.test.ts`), no job `implantavel`.
// ---------------------------------------------------------------------------

test("as consultas e o endurecimento se entendem num Postgres real (extensão substituta)", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const trocar = (sql) => sql.replaceAll("'postgis'", "'pg_trgm'");
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN; CREATE ROLE dc360_app NOLOGIN;
      CREATE SCHEMA extensions;
      CREATE EXTENSION pg_trgm WITH SCHEMA extensions;`);
    const consultar = async (sql, parametros) => (await db.query(trocar(sql), parametros)).rows;

    const antes = await coletarFatos(consultar);
    assert.equal(antes.instalada.esquema, "extensions");
    assert.deepEqual(
      antes.exposicao.map((e) => e.papel),
      ["PUBLIC"],
    );
    assert.equal(antes.aplicacao.usoNoEsquema, false);

    await db.exec(trocar(readFileSync(SQL_ENDURECER, "utf8")));
    const depois = await coletarFatos(consultar);
    assert.deepEqual(depois.exposicao, []);
    assert.equal(depois.aplicacao.usoNoEsquema, true);
    assert.equal(depois.aplicacao.funcoesSemExecute, 0);

    await db.exec("GRANT EXECUTE ON FUNCTION extensions.similarity(text, text) TO anon");
    const exposto = await coletarFatos(consultar);
    assert.deepEqual(
      exposto.exposicao.map((e) => [e.papel, e.objetos]),
      [["anon", 1]],
    );
  } finally {
    await db.close();
  }
});

test("a coleta funciona com um papel sem USAGE no schema da extensão (o papel de setup do provedor)", async () => {
  // Defeito do CI 2 (42501): `to_regclass('extensions.spatial_ref_sys')` exige
  // USAGE no schema para quem consulta. O papel de setup do provedor não tem,
  // e a conferência precisa responder pelo catálogo, que qualquer papel lê.
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const trocar = (sql) => sql.replaceAll("'postgis'", "'pg_trgm'");
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN; CREATE ROLE dc360_app NOLOGIN;
      CREATE ROLE leitor NOLOGIN;
      CREATE SCHEMA extensions;
      CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
      CREATE TABLE extensions.spatial_ref_sys (srid int);
      GRANT USAGE ON SCHEMA extensions TO dc360_app;
      GRANT SELECT ON extensions.spatial_ref_sys TO dc360_app;`);
    const consultar = async (sql, parametros) => (await db.query(trocar(sql), parametros)).rows;
    await db.exec("SET ROLE leitor");
    const fatos = await coletarFatos(consultar);
    assert.equal(fatos.aplicacao.usoNoEsquema, true);
    assert.equal(fatos.aplicacao.selectSpatialRefSys, true);
    await db.exec("RESET ROLE; REVOKE SELECT ON extensions.spatial_ref_sys FROM dc360_app");
    await db.exec("SET ROLE leitor");
    assert.equal((await coletarFatos(consultar)).aplicacao.selectSpatialRefSys, false);
  } finally {
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Correção 1 da F01 (E22): disponível não é criável.
// ---------------------------------------------------------------------------

const semInstalar = (criacao) => ({
  disponivel: { versaoPadrao: "3.5.2", versaoInstalada: null },
  instalada: null,
  criacao,
  exposicao: [],
  aplicacao: null,
});

test("PROD com PostGIS disponível e não instalado, e papel de setup SEM poder criar, reprova (o verde falso achado na revisão)", () => {
  const fatos = semInstalar({
    superusuario: false,
    donoDoBanco: false,
    criaNoBanco: false,
    confiavel: false,
  });
  const prod = avaliarExtensoes(fatos, { ambiente: "prod" });
  assert.equal(prod.problemas.length, 1);
  assert.match(prod.problemas[0], /papel de setup não pode criar a extensão.*CREATE.*CP-44/);
  // Em HML a falta de privilégio soma-se ao "não está instalado".
  assert.equal(avaliarExtensoes(fatos, { ambiente: "hml" }).problemas.length, 2);
});

test("PROD com CREATE no banco passa, mas avisa quando não é superusuário e a extensão não é confiável (só o CP-44 confirma)", () => {
  const r = avaliarExtensoes(
    semInstalar({ superusuario: false, donoDoBanco: false, criaNoBanco: true, confiavel: false }),
    { ambiente: "prod" },
  );
  assert.deepEqual(r.problemas, []);
  assert.ok(r.avisos.some((a) => /não é superusuário.*não é extensão confiável.*CP-44/.test(a)));
});

test("PROD com superusuário, ou com CREATE no banco e extensão confiável, passa sem aviso de privilégio", () => {
  for (const criacao of [
    { superusuario: true, donoDoBanco: false, criaNoBanco: true, confiavel: false },
    { superusuario: false, donoDoBanco: true, criaNoBanco: true, confiavel: true },
  ]) {
    const r = avaliarExtensoes(semInstalar(criacao), { ambiente: "prod" });
    assert.deepEqual(r.problemas, []);
    assert.ok(r.linhas.some((l) => /pode criar a extensão/.test(l)));
    assert.ok(!r.avisos.some((a) => /confiável/.test(a)));
  }
});

test("fatos de PROD sem a capacidade de criar não são aprovados em silêncio", () => {
  const r = avaliarExtensoes(semInstalar(null), { ambiente: "prod" });
  assert.equal(r.problemas.length, 1);
  assert.match(r.problemas[0], /não consegui conferir se o papel de setup pode criar/);
});

test("coletarFatos pergunta a capacidade de criar com o privilégio CREATE como parâmetro e monta os fatos", async () => {
  const recebidos = {};
  const consultar = async (sql, parametros) => {
    recebidos[sql] = parametros;
    if (sql === CONSULTAS.disponivel)
      return [{ default_version: "3.5.2", installed_version: null }];
    if (sql === CONSULTAS.criacao)
      return [{ superusuario: false, dono_do_banco: false, cria_no_banco: true, confiavel: false }];
    return [];
  };
  const fatos = await coletarFatos(consultar);
  assert.deepEqual(recebidos[CONSULTAS.criacao], [PRIVILEGIO_DE_CRIACAO]);
  assert.equal(PRIVILEGIO_DE_CRIACAO, "CREATE");
  assert.deepEqual(fatos.criacao, {
    superusuario: false,
    donoDoBanco: false,
    criaNoBanco: true,
    confiavel: false,
  });
});

test("a consulta de capacidade responde num Postgres real (PGlite): superusuário, dono e CREATE no banco", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    const [c] = (await db.query(CONSULTAS.criacao, [PRIVILEGIO_DE_CRIACAO])).rows;
    assert.equal(c.superusuario, true);
    assert.equal(c.cria_no_banco, true);
    assert.equal(c.dono_do_banco, true);
    assert.equal(typeof c.confiavel, "boolean");
    // Um papel comum, sem CREATE no banco: a consulta diz que não pode.
    const banco = (await db.query("SELECT current_database() AS nome")).rows[0].nome;
    assert.match(banco, /^[a-z0-9_]+$/, "nome de banco simples, seguro de interpolar no teste");
    await db.exec(`
      CREATE ROLE sem_poder NOLOGIN;
      REVOKE CREATE ON DATABASE ${banco} FROM PUBLIC;
      SET ROLE sem_poder;`);
    const [d] = (await db.query(CONSULTAS.criacao, [PRIVILEGIO_DE_CRIACAO])).rows;
    assert.equal(d.superusuario, false);
    assert.equal(d.cria_no_banco, false);
    assert.equal(d.dono_do_banco, false);
    // Com CREATE concedido no banco, passa a poder.
    await db.exec(`RESET ROLE; GRANT CREATE ON DATABASE ${banco} TO sem_poder; SET ROLE sem_poder`);
    const [e] = (await db.query(CONSULTAS.criacao, [PRIVILEGIO_DE_CRIACAO])).rows;
    assert.equal(e.cria_no_banco, true);
  } finally {
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Correção 1 da F01 (E22): privilégio herdado por associação de papéis.
// ---------------------------------------------------------------------------

test("privilégio herdado por papel intermediário: a consulta vê o anon e o endurecimento tira a concessão intermediária", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const trocar = (sql) => sql.replaceAll("'postgis'", "'pg_trgm'");
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN; CREATE ROLE dc360_app NOLOGIN;
      CREATE ROLE intermediario NOLOGIN;
      CREATE SCHEMA extensions;
      CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
      -- PUBLIC fora; só o papel intermediário executa, e anon é membro dele.
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA extensions FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION extensions.similarity(text, text) TO intermediario;
      GRANT intermediario TO anon;`);
    const consultar = async (sql, parametros) => (await db.query(trocar(sql), parametros)).rows;

    // A leitura só da ACL (a consulta de antes) não via nada: o grantee é o intermediário.
    const daAcl = await db.query(
      `SELECT pg_get_userbyid(a.grantee) AS papel
         FROM pg_proc p, LATERAL aclexplode(p.proacl) a
        WHERE p.oid = 'extensions.similarity(text, text)'::regprocedure
          AND pg_get_userbyid(a.grantee) = ANY ($1::text[])`,
      [PAPEIS_DO_PROVEDOR],
    );
    assert.deepEqual(daAcl.rows, [], "premissa: nenhum dos três está na ACL");

    const antes = await coletarFatos(consultar);
    assert.deepEqual(
      antes.exposicao.map((e) => e.papel),
      ["anon"],
      "o privilégio efetivo pega a herança",
    );
    assert.match(avaliarExtensoes(antes).problemas.join("\n"), /anon tem privilégio em 1 objeto/);

    await db.exec(trocar(readFileSync(SQL_ENDURECER, "utf8")));
    const depois = await coletarFatos(consultar);
    assert.deepEqual(depois.exposicao, []);
    const intermediario = await db.query(
      `SELECT has_function_privilege('intermediario', 'extensions.similarity(text, text)'::regprocedure, 'EXECUTE') AS ok`,
    );
    assert.equal(intermediario.rows[0].ok, false, "a concessão intermediária foi revogada");
    const app = await db.query(
      `SELECT has_function_privilege('dc360_app', 'extensions.similarity(text, text)'::regprocedure, 'EXECUTE') AS ok`,
    );
    assert.equal(app.rows[0].ok, true, "dc360_app segue com o mínimo");
  } finally {
    await db.close();
  }
});

test("a consulta de exposição não repete como concessão própria o que só PUBLIC concede", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const trocar = (sql) => sql.replaceAll("'postgis'", "'pg_trgm'");
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA extensions;
      CREATE EXTENSION pg_trgm WITH SCHEMA extensions;`);
    const consultar = async (sql, parametros) => (await db.query(trocar(sql), parametros)).rows;
    const fatos = await coletarFatos(consultar);
    assert.deepEqual(
      fatos.exposicao.map((e) => e.papel),
      ["PUBLIC"],
      "só PUBLIC aparece; anon herda de PUBLIC e não ganha linha repetida",
    );
  } finally {
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Correção 1 da F01 (E22): a âncora TLS do migrador.
// ---------------------------------------------------------------------------

test("a URL de conferência recebe a âncora de confiança do migrador: verify-full sem sslrootcert ganha a raiz do provedor", async () => {
  const sem = "postgres://setup:segredo@db.exemplo.supabase.co:5432/postgres?sslmode=verify-full";
  const com = await urlParaConferencia(sem);
  assert.match(com, /sslrootcert=/);
  assert.match(decodeURIComponent(com), /supabase-prod-ca-2021\.crt/);
  // O resto da URL fica como estava.
  const antes = new URL(sem);
  const depois = new URL(com);
  assert.equal(depois.host, antes.host);
  assert.equal(depois.password, antes.password);
  assert.equal(depois.searchParams.get("sslmode"), "verify-full");
});

test("a âncora não mexe no que não deve: sem sslmode que verifica, ou com sslrootcert já escrito", async () => {
  const semModo = "postgres://u:p@127.0.0.1:5432/banco";
  assert.equal(await urlParaConferencia(semModo), semModo);
  const comRaiz = "postgres://u:p@h:5432/b?sslmode=verify-full&sslrootcert=/outra/raiz.crt";
  assert.equal(await urlParaConferencia(comRaiz), comRaiz);
  const frouxo = "postgres://u:p@h:5432/b?sslmode=disable";
  assert.equal(await urlParaConferencia(frouxo), frouxo);
});

test("a conferência usa a MESMA função do migrador, e não uma cópia", async () => {
  const doMigrador = await import("../db/dist/conexao.js");
  assert.equal(typeof doMigrador.urlComAncoraDeConfianca, "function");
  // O carregador padrão entrega a função do próprio migrador.
  const url = "postgres://u:p@h/b?sslmode=require";
  assert.equal(await urlParaConferencia(url), doMigrador.urlComAncoraDeConfianca(url));
  // E a conexão de verdade passa a URL por ela.
  const fonte = readFileSync(
    fileURLToPath(new URL("./conferir-extensoes.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(fonte, /import\("\.\.\/db\/dist\/conexao\.js"\)/);
  assert.match(fonte, /connectionString: await urlParaConferencia\(url\)/);
  assert.doesNotMatch(fonte, /new pg\.Client\(\{ connectionString: url \}\)/);
});

test("sem a compilação do migrador, a conferência recusa com a instrução em vez de conectar sem âncora", async () => {
  await assert.rejects(
    urlParaConferencia("postgres://u:p@h/b?sslmode=verify-full", async () => {
      throw new Error(
        "a âncora de confiança do migrador não está compilada: rode `npm run build:shared` em dc360",
      );
    }),
    /build:shared/,
  );
});
