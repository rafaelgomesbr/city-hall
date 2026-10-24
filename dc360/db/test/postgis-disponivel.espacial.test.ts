import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decidirPostgis, exigePostgis, type EstadoDoServidor } from "./postgis-decisao.js";

/**
 * Smoke espacial em Postgres REAL (V2-F01-E21). Prova três coisas que o PGlite
 * não consegue provar, porque ele não traz PostGIS:
 *
 * 1. a extensão existe no servidor e `CREATE EXTENSION postgis` funciona;
 * 2. `ST_Contains` e `ST_DWithin` respondem certo (geometria e geografia, em
 *    metros), inclusive para um papel de aplicação que NÃO é superusuário;
 * 3. uma tabela com coluna `geography` sob RLS ativada e FORÇADA não devolve a
 *    geometria de outro município, nem por uma consulta espacial que a
 *    alcançaria (o ponto do outro município está a ~51 m, dentro do raio).
 *
 * Não cria migração nem modelo espacial: a tabela é de prova, vive num banco
 * descartável (`prova_e21_<sorteio>`) criado e apagado aqui, e só tem
 * coordenada sintética de uma cidade fictícia. O modelo de verdade é da F32.
 *
 * Como roda: `npm run test:espacial` com `DC360_POSTGRES_DE_PROVA` apontando
 * para um superusuário de um servidor descartável. No CI (`implantavel`),
 * `DC360_EXIGE_POSTGIS=1` faz faltar o servidor ou a extensão REPROVAR; local,
 * pula com aviso. A regra está em `postgis-decisao.ts`.
 */

const URL_DE_PROVA = process.env.DC360_POSTGRES_DE_PROVA ?? "";

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

describe("PostGIS em Postgres real: o ambiente tem o que a execução exige", () => {
  it("reprova se o CI exige PostGIS e o servidor não o oferece; local, só avisa", () => {
    if (decisao.acao === "reprovar") throw new Error(decisao.motivo);
    if (decisao.acao === "pular") console.warn(decisao.aviso);
  });
});

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/**
 * Coordenadas sintéticas (longitude, latitude), perto de -22,9 / -43,2:
 * A1 e A2 são do município A, a ~102 m uma da outra; B1 é do município B e fica
 * a ~51 m de A1, ou seja, DENTRO de qualquer raio de 100 m em torno de A1.
 */
const A1 = "SRID=4326;POINT(-43.2000 -22.9000)";
const A2 = "SRID=4326;POINT(-43.1990 -22.9000)";
const B1 = "SRID=4326;POINT(-43.2005 -22.9000)";
const PONTO_DA_BUSCA = "ST_GeogFromText('SRID=4326;POINT(-43.2000 -22.9000)')";

describe.skipIf(decisao.acao !== "rodar")("PostGIS em Postgres real", () => {
  const sorteio = Math.random().toString(36).slice(2, 10);
  const nomeDoBanco = `prova_e21_${sorteio}`;
  const nomeDoPapel = `prova_e21_api_${sorteio}`;
  const senhaDoPapel = `senha-${sorteio}`;
  let admin: pg.Client;
  let app: pg.Client;

  function urlDoBanco(usuario?: { nome: string; senha: string }): string {
    const u = new URL(URL_DE_PROVA);
    u.pathname = `/${nomeDoBanco}`;
    if (usuario) {
      u.username = usuario.nome;
      u.password = usuario.senha;
    }
    return u.toString();
  }

  /** Uma consulta como a aplicação: transação curta com a organização do token. */
  async function comoOrganizacao<T extends pg.QueryResultRow>(
    organizacao: string | null,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    await app.query("BEGIN");
    try {
      if (organizacao !== null) {
        await app.query("SELECT set_config('app.organizacao_atual', $1, true)", [organizacao]);
      }
      const r = await app.query<T>(sql, params);
      return r.rows;
    } finally {
      await app.query("ROLLBACK");
    }
  }

  beforeAll(async () => {
    const mestre = new pg.Client({ connectionString: URL_DE_PROVA });
    await mestre.connect();
    await mestre.query(`CREATE DATABASE ${nomeDoBanco}`);
    await mestre.query(
      `CREATE ROLE ${nomeDoPapel} LOGIN PASSWORD '${senhaDoPapel}' NOSUPERUSER NOBYPASSRLS`,
    );
    await mestre.end();

    admin = new pg.Client({ connectionString: urlDoBanco() });
    await admin.connect();
    await admin.query("CREATE EXTENSION postgis");
    await admin.query(`
      CREATE TABLE prova_local (
        id serial PRIMARY KEY,
        organizacao_id uuid NOT NULL,
        rotulo text NOT NULL,
        local geography(Point, 4326) NOT NULL
      )`);
    await admin.query("ALTER TABLE prova_local ENABLE ROW LEVEL SECURITY");
    await admin.query("ALTER TABLE prova_local FORCE ROW LEVEL SECURITY");
    await admin.query(`
      CREATE POLICY por_organizacao ON prova_local
        USING (organizacao_id = NULLIF(current_setting('app.organizacao_atual', true), '')::uuid)
        WITH CHECK (organizacao_id = NULLIF(current_setting('app.organizacao_atual', true), '')::uuid)`);
    await admin.query(`GRANT SELECT, INSERT ON prova_local TO ${nomeDoPapel}`);
    await admin.query(`GRANT USAGE ON SEQUENCE prova_local_id_seq TO ${nomeDoPapel}`);
    for (const [org, rotulo, ponto] of [
      [ORG_A, "A1", A1],
      [ORG_A, "A2", A2],
      [ORG_B, "B1", B1],
    ] as const) {
      await admin.query(
        "INSERT INTO prova_local (organizacao_id, rotulo, local) VALUES ($1, $2, $3::geography)",
        [org, rotulo, ponto],
      );
    }

    app = new pg.Client({
      connectionString: urlDoBanco({ nome: nomeDoPapel, senha: senhaDoPapel }),
    });
    await app.connect();
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
    const mestre = new pg.Client({ connectionString: URL_DE_PROVA });
    await mestre.connect();
    await mestre.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`);
    await mestre.query(`DROP ROLE IF EXISTS ${nomeDoPapel}`);
    await mestre.end();
  });

  it("a extensão está instalada e é a série 3 do PostGIS", async () => {
    const r = await admin.query<{ versao: string }>("SELECT postgis_lib_version() AS versao");
    console.info(`PostGIS ${r.rows[0]?.versao}`);
    expect(r.rows[0]?.versao).toMatch(/^3\./);
    const e = await admin.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
    expect(e.rowCount).toBe(1);
  });

  it("spatial_ref_sys traz o SRID 4326 e a aplicação (sem ser superusuário) o lê", async () => {
    const papel = await app.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(papel.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const r = await app.query("SELECT 1 FROM spatial_ref_sys WHERE srid = 4326");
    expect(r.rowCount).toBe(1);
  });

  it("ST_Contains: o ponto dentro do polígono é contido, o de fora não", async () => {
    const poligono =
      "ST_GeomFromText('POLYGON((-43.2010 -22.9010, -43.1980 -22.9010, -43.1980 -22.8990, -43.2010 -22.8990, -43.2010 -22.9010))', 4326)";
    const r = await app.query<{ dentro: boolean; fora: boolean }>(`
      SELECT ST_Contains(${poligono}, ST_SetSRID(ST_MakePoint(-43.2000, -22.9000), 4326)) AS dentro,
             ST_Contains(${poligono}, ST_SetSRID(ST_MakePoint(-43.3000, -22.9000), 4326)) AS fora`);
    expect(r.rows[0]).toEqual({ dentro: true, fora: false });
  });

  it("ST_DWithin em geography mede em metros", async () => {
    const r = await app.query<{ metros: number; em60: boolean; em40: boolean }>(`
      SELECT ST_Distance(a, b) AS metros,
             ST_DWithin(a, b, 60) AS em60,
             ST_DWithin(a, b, 40) AS em40
        FROM (SELECT ST_GeogFromText('${A1}') AS a, ST_GeogFromText('${B1}') AS b) p`);
    const linha = r.rows[0];
    expect(linha?.metros).toBeGreaterThan(45);
    expect(linha?.metros).toBeLessThan(58);
    expect(linha?.em60).toBe(true);
    expect(linha?.em40).toBe(false);
  });

  it("a tabela de prova tem RLS ativada e forçada", async () => {
    const r = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'prova_local'",
    );
    expect(r.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it("controle: sem RLS (superusuário) o ponto do outro município ESTÁ no raio da busca", async () => {
    const r = await admin.query<{ rotulo: string }>(
      `SELECT rotulo FROM prova_local WHERE ST_DWithin(local, ${PONTO_DA_BUSCA}, 200) ORDER BY rotulo`,
    );
    expect(r.rows.map((l) => l.rotulo)).toEqual(["A1", "A2", "B1"]);
  });

  it("isolamento: a busca espacial do município A não devolve a geometria do B", async () => {
    const linhas = await comoOrganizacao<{ rotulo: string }>(
      ORG_A,
      `SELECT rotulo FROM prova_local WHERE ST_DWithin(local, ${PONTO_DA_BUSCA}, 200) ORDER BY rotulo`,
    );
    expect(linhas.map((l) => l.rotulo)).toEqual(["A1", "A2"]);
  });

  it("isolamento: o município B só enxerga a própria geometria, mesmo a 51 m das do A", async () => {
    const linhas = await comoOrganizacao<{ rotulo: string }>(
      ORG_B,
      `SELECT rotulo FROM prova_local WHERE ST_DWithin(local, ${PONTO_DA_BUSCA}, 200) ORDER BY rotulo`,
    );
    expect(linhas.map((l) => l.rotulo)).toEqual(["B1"]);
  });

  it("isolamento: sem organização na transação, nenhuma geometria aparece", async () => {
    const linhas = await comoOrganizacao<{ rotulo: string }>(
      null,
      "SELECT rotulo FROM prova_local",
    );
    expect(linhas).toEqual([]);
  });

  it("isolamento: a aplicação não grava geometria em nome de outro município", async () => {
    await app.query("BEGIN");
    try {
      await app.query("SELECT set_config('app.organizacao_atual', $1, true)", [ORG_A]);
      await expect(
        app.query(
          "INSERT INTO prova_local (organizacao_id, rotulo, local) VALUES ($1, 'X', $2::geography)",
          [ORG_B, A1],
        ),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await app.query("ROLLBACK");
    }
  });
});
