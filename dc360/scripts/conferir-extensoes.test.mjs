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
  avaliarExtensoes,
  coletarFatos,
  executarExtensoes,
  lerArgumentosDeExtensoes,
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
  assert.deepEqual(chamadas, [CONSULTAS.disponivel, CONSULTAS.instalada]);
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
  assert.deepEqual(recebidos[CONSULTAS.exposicao], [PAPEIS_DO_PROVEDOR]);
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
  const fatos = { disponivel: { versaoPadrao: "3.5.2", versaoInstalada: null }, instalada: null };
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
