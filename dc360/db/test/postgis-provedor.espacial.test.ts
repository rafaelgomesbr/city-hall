import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decidirPostgis, exigePostgis, type EstadoDoServidor } from "./postgis-decisao.js";

/**
 * O PostGIS "no provedor" provado em Postgres REAL (V2-F01-E22).
 *
 * O que a etapa entrega é SQL (`db/provedores/postgis.sql` e o bloco de PostGIS
 * de `db/provedores/supabase-endurecer.sql`) e a conferência
 * `scripts/conferir-ambiente.mjs --extensoes`. Nenhum dos três roda no PGlite
 * (sem PostGIS), então este teste os exercita num servidor descartável com a
 * extensão, imitando o provedor: os três papéis do Supabase (`anon`,
 * `authenticated`, `service_role`) e `dc360_app` existem, e o papel de setup
 * é quem instala e endurece.
 *
 * A ordem conta uma história só, de cima para baixo:
 *   1. o papel de aplicação NÃO consegue criar a extensão (`permission denied`);
 *   2. o setup instala no schema `extensions`;
 *   3. sem endurecer, a conferência REPROVA: PUBLIC alcança a extensão (a
 *      premissa do defeito, provada: `anon` lê `spatial_ref_sys` por PUBLIC);
 *   4. o endurecimento fecha, a conferência passa e rodar de novo não muda nada;
 *   5. `dc360_app` consulta (ST_DWithin, spatial_ref_sys) e `anon` não;
 *   6. o caso do "PR de prova" (`GRANT SELECT` a `anon`) e o de perder USAGE no
 *      schema reprovam na conferência.
 *
 * Limite assumido: o papel de setup do teste é superusuário, porque o
 * PostGIS não é extensão confiável no Postgres comum. No provedor o papel de
 * setup NÃO é superusuário, e se ele cria a extensão é a pergunta do CP-44: o
 * que isto aqui prova é o SQL, não o plano contratado.
 *
 * Roda no `test:espacial` (job `implantavel`), com as mesmas variáveis do
 * smoke da E21 (`DC360_POSTGRES_DE_PROVA`, `DC360_EXIGE_POSTGIS`).
 */

const URL_DE_PROVA = process.env.DC360_POSTGRES_DE_PROVA ?? "";

const PROVEDORES = new URL("../provedores/", import.meta.url);
const SQL_INSTALAR = readFileSync(new URL("postgis.sql", PROVEDORES), "utf8");
const SQL_ENDURECER = readFileSync(new URL("supabase-endurecer.sql", PROVEDORES), "utf8");
const CONFERIR = fileURLToPath(new URL("../../scripts/conferir-ambiente.mjs", import.meta.url));

const PAPEIS_DO_PROVEDOR = ["anon", "authenticated", "service_role"];
const PAPEL_DA_APLICACAO = "dc360_app";

async function sondar(): Promise<EstadoDoServidor> {
  if (!URL_DE_PROVA) return "sem-url";
  const cliente = new pg.Client({ connectionString: URL_DE_PROVA });
  try {
    await cliente.connect();
  } catch {
    return "inacessivel";
  }
  try {
    const r = await cliente.query("SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'");
    return r.rowCount ? "ok" : "sem-extensao";
  } finally {
    await cliente.end();
  }
}

const estado = await sondar();
const decisao = decidirPostgis(exigePostgis(), estado);

describe("PostGIS no provedor: o ambiente tem o que a execução exige", () => {
  it("reprova se o CI exige PostGIS e o servidor não o oferece; local, só avisa", () => {
    if (decisao.acao === "reprovar") throw new Error(decisao.motivo);
    if (decisao.acao === "pular") console.warn(decisao.aviso);
  });
});

describe.skipIf(decisao.acao !== "rodar")("PostGIS no provedor, em Postgres real", () => {
  const sorteio = Math.random().toString(36).slice(2, 10);
  const nomeDoBanco = `prova_e22_${sorteio}`;
  const nomeDaAplicacao = `prova_e22_api_${sorteio}`;
  const senhaDaAplicacao = `senha-${sorteio}`;
  /** Papéis de cluster que este teste criou (e por isso apaga no fim). */
  const criados: string[] = [];
  const avisos: string[] = [];
  let admin: pg.Client;

  function urlDoBanco(usuario?: { nome: string; senha: string }): string {
    const u = new URL(URL_DE_PROVA);
    u.pathname = `/${nomeDoBanco}`;
    if (usuario) {
      u.username = usuario.nome;
      u.password = usuario.senha;
    }
    return u.toString();
  }

  /** A conferência de verdade, pelo comando, contra o banco descartável. */
  function conferir(
    args: string[] = [],
    url: string = urlDoBanco(),
  ): { status: number | null; saida: string } {
    const r = spawnSync(process.execPath, [CONFERIR, "--extensoes", ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", DATABASE_URL_SETUP: url },
    });
    return { status: r.status, saida: `${r.stdout}${r.stderr}` };
  }

  /** Roda `sql` como `papel` (sem sair da sessão do setup) e sempre volta ao setup. */
  async function como<T extends pg.QueryResultRow>(papel: string, sql: string): Promise<T[]> {
    await admin.query(`SET ROLE ${papel}`);
    try {
      return (await admin.query<T>(sql)).rows;
    } finally {
      await admin.query("RESET ROLE");
    }
  }

  async function garantirPapel(mestre: pg.Client, nome: string): Promise<void> {
    const existe = await mestre.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [nome]);
    if (existe.rowCount) return;
    await mestre.query(`CREATE ROLE ${nome} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    criados.push(nome);
  }

  beforeAll(async () => {
    const mestre = new pg.Client({ connectionString: URL_DE_PROVA });
    await mestre.connect();
    await mestre.query(`CREATE DATABASE ${nomeDoBanco}`);
    for (const papel of [...PAPEIS_DO_PROVEDOR, PAPEL_DA_APLICACAO]) {
      await garantirPapel(mestre, papel);
    }
    await mestre.query(
      `CREATE ROLE ${nomeDaAplicacao} LOGIN PASSWORD '${senhaDaAplicacao}' NOSUPERUSER NOBYPASSRLS`,
    );
    await mestre.end();

    admin = new pg.Client({ connectionString: urlDoBanco() });
    admin.on("notice", (n) => avisos.push(`${n.severity}: ${n.message}`));
    await admin.connect();
    // Imita o Supabase, que já entrega o schema `extensions` com USAGE para os
    // três papéis. `postgis.sql` o cria com IF NOT EXISTS e reaproveita este.
    await admin.query("CREATE SCHEMA extensions");
    await admin.query("GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role");
  }, 120_000);

  afterAll(async () => {
    await admin?.end();
    const mestre = new pg.Client({ connectionString: URL_DE_PROVA });
    await mestre.connect();
    await mestre.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`);
    await mestre.query(`DROP ROLE IF EXISTS ${nomeDaAplicacao}`);
    for (const papel of criados) await mestre.query(`DROP ROLE IF EXISTS ${papel}`);
    await mestre.end();
  });

  it("1. o papel de aplicação recebe permission denied em CREATE EXTENSION", async () => {
    const app = new pg.Client({
      connectionString: urlDoBanco({ nome: nomeDaAplicacao, senha: senhaDaAplicacao }),
    });
    await app.connect();
    try {
      await expect(app.query("CREATE EXTENSION postgis")).rejects.toThrow(/permission denied/);
    } finally {
      await app.end();
    }
  });

  it("2. o setup instala no schema extensions e responde postgis_version()", async () => {
    // Vários comandos numa string só: o `pg` devolve um resultado por comando.
    const resultados = (await admin.query(SQL_INSTALAR)) as unknown as Array<
      pg.QueryResult<{ postgis_version: string }>
    >;
    expect(resultados.at(-1)?.rows[0]?.postgis_version).toMatch(/^3\./);
    const e = await admin.query<{ esquema: string }>(
      `SELECT n.nspname AS esquema FROM pg_extension e
         JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'postgis'`,
    );
    expect(e.rows[0]?.esquema).toBe("extensions");
  });

  it("2b. instalar de novo é idempotente", async () => {
    await expect(admin.query(SQL_INSTALAR)).resolves.toBeDefined();
  });

  it("3. sem endurecer, a premissa do defeito vale e a conferência reprova", async () => {
    // O script de instalação do PostGIS concede a PUBLIC; `anon` herda.
    const lido = await como("anon", "SELECT 1 FROM extensions.spatial_ref_sys LIMIT 1");
    expect(lido).toHaveLength(1);
    const r = conferir();
    expect(r.status).toBe(1);
    expect(r.saida).toMatch(/PROBLEMA: PUBLIC tem privilégio em \d+ objeto/);
    expect(r.saida).toMatch(/PROBLEMA: dc360_app não tem USAGE no schema extensions/);
  });

  it("4. o endurecimento fecha tudo sem aviso de falta de permissão, e a conferência passa", async () => {
    avisos.length = 0;
    await admin.query(SQL_ENDURECER);
    expect(avisos.filter((a) => /WARNING/.test(a))).toEqual([]);
    expect(avisos.join("\n")).toMatch(/postgis endurecido no schema extensions/);
    const r = conferir();
    expect(r.saida).toMatch(/postgis instalado: versão 3\.\d+.*schema extensions/);
    expect(r.status, r.saida).toBe(0);
  });

  it("4b. rodar o endurecimento de novo não muda nada (idempotente)", async () => {
    avisos.length = 0;
    await admin.query(SQL_ENDURECER);
    expect(avisos.filter((a) => /WARNING/.test(a))).toEqual([]);
    expect(conferir().status).toBe(0);
  });

  it("4c. em PROD, com a extensão instalada e endurecida, a conferência também passa", () => {
    expect(conferir(["--ambiente=prod"]).status).toBe(0);
  });

  it("5. dc360_app consulta spatial_ref_sys e mede distância em metros", async () => {
    const srs = await como(
      "dc360_app",
      "SELECT srid FROM extensions.spatial_ref_sys WHERE srid = 4326",
    );
    expect(srs).toHaveLength(1);
    const d = await como<{ em60: boolean; em40: boolean }>(
      "dc360_app",
      `SELECT extensions.ST_DWithin(a, b, 60) AS em60, extensions.ST_DWithin(a, b, 40) AS em40
         FROM (SELECT extensions.ST_GeogFromText('SRID=4326;POINT(-43.2000 -22.9000)') AS a,
                      extensions.ST_GeogFromText('SRID=4326;POINT(-43.2005 -22.9000)') AS b) p`,
    );
    expect(d[0]).toEqual({ em60: true, em40: false });
  });

  it("5b. os papéis do provedor recebem permission denied na tabela e nas funções", async () => {
    for (const papel of PAPEIS_DO_PROVEDOR) {
      await expect(
        como(papel, "SELECT 1 FROM extensions.spatial_ref_sys LIMIT 1"),
        `${papel} em spatial_ref_sys`,
      ).rejects.toThrow(/permission denied/);
      await expect(
        como(papel, "SELECT extensions.ST_AsText(extensions.ST_GeomFromText('POINT(1 1)'))"),
        `${papel} em ST_AsText`,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("5c. o papel de aplicação continua sem poder criar extensão", async () => {
    await expect(como(PAPEL_DA_APLICACAO, "CREATE EXTENSION fuzzystrmatch")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("6. anon com SELECT em spatial_ref_sys (o PR de prova) aparece na conferência", async () => {
    await admin.query("GRANT SELECT ON extensions.spatial_ref_sys TO anon");
    try {
      const r = conferir();
      expect(r.status).toBe(1);
      expect(r.saida).toMatch(/PROBLEMA: anon tem privilégio em 1 objeto.*spatial_ref_sys/);
    } finally {
      await admin.query("REVOKE ALL ON extensions.spatial_ref_sys FROM anon");
    }
    expect(conferir().status).toBe(0);
  });

  it("6b. sem USAGE no schema, dc360_app perde o acesso e a conferência reprova", async () => {
    await admin.query(`REVOKE USAGE ON SCHEMA extensions FROM ${PAPEL_DA_APLICACAO}`);
    try {
      await expect(
        como(PAPEL_DA_APLICACAO, "SELECT 1 FROM extensions.spatial_ref_sys LIMIT 1"),
      ).rejects.toThrow(/permission denied for schema extensions/);
      const r = conferir();
      expect(r.status).toBe(1);
      expect(r.saida).toMatch(/PROBLEMA: dc360_app não tem USAGE no schema extensions/);
    } finally {
      await admin.query(`GRANT USAGE ON SCHEMA extensions TO ${PAPEL_DA_APLICACAO}`);
    }
    expect(conferir().status).toBe(0);
  });

  it("6c. extensão fora do schema esperado reprova", () => {
    const r = conferir(["--esquema=gis"]);
    expect(r.status).toBe(1);
    expect(r.saida).toMatch(/schema extensions; o esperado é gis/);
  });

  it("7. a saída da conferência nunca traz o usuário nem a senha da URL", () => {
    const r = conferir([], urlDoBanco({ nome: nomeDaAplicacao, senha: senhaDaAplicacao }));
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).not.toContain(senhaDaAplicacao);
    expect(r.saida).not.toContain(nomeDaAplicacao);
  });
});
