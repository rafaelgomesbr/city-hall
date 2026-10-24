/**
 * O bloco de extensão de `db/provedores/supabase-endurecer.sql`, provado SEM
 * PostGIS (V2-F01-E22).
 *
 * O PGlite não traz PostGIS, então a prova do SQL contra a extensão de verdade
 * é `postgis-provedor.espacial.test.ts` (Postgres real, no job `implantavel`).
 * Aqui roda o MESMO bloco com `pg_trgm` no lugar de `postgis`, para provar
 * localmente, sem Docker, a mecânica que independe de qual extensão é:
 *
 *   - o SQL continua rodando sem a extensão e sem os papéis do provedor;
 *   - achar os objetos pela dependência da extensão (`pg_depend`), e não por
 *     "tudo no schema": o que NÃO é da extensão não é tocado;
 *   - revogar de PUBLIC e dos três papéis, e devolver o mínimo a `dc360_app`;
 *   - ser idempotente.
 *
 * A substituição é só do nome da extensão no texto do bloco. O que é próprio do
 * PostGIS (a tabela `spatial_ref_sys`) fica de fora, e é coberto no teste real.
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SQL = readFileSync(new URL("../provedores/supabase-endurecer.sql", import.meta.url), "utf8");
const POSTGIS = "e.extname = 'postgis'";
const NO_BLOCO = SQL.slice(SQL.indexOf("PostGIS (V2-F01-E22"));

/** O arquivo inteiro, com a extensão trocada por `pg_trgm`. */
const SQL_COM_SUBSTITUTA = SQL.replaceAll("'postgis'", "'pg_trgm'");

describe("o texto do bloco de PostGIS", () => {
  it("procura a extensão por nome, nos dois lugares, e não por schema", () => {
    expect(NO_BLOCO).toContain("WHERE e.extname = 'postgis'");
    expect(NO_BLOCO).toContain(POSTGIS);
    expect(NO_BLOCO).not.toMatch(/ALL (FUNCTIONS|TABLES) IN SCHEMA %I/);
  });

  it("usa ROUTINE, para alcançar as funções de agregação", () => {
    expect(NO_BLOCO).toContain("ROUTINE");
  });
});

describe("o endurecimento de extensão, com pg_trgm no lugar do PostGIS", () => {
  let db: PGlite;

  async function privilegio(consulta: string): Promise<boolean> {
    const r = await db.query<{ ok: boolean }>(`SELECT ${consulta} AS ok`, []);
    return r.rows[0]?.ok === true;
  }

  beforeAll(async () => {
    db = new PGlite({ extensions: { pg_trgm } });
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE dc360_app NOLOGIN;
      CREATE SCHEMA extensions;
      GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
      CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
      -- Uma função que NÃO é da extensão, no mesmo schema (como o pgcrypto,
      -- de que o próprio provedor depende): não pode ser tocada.
      CREATE FUNCTION extensions.alheia() RETURNS int LANGUAGE sql AS 'SELECT 1';
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it("antes: PUBLIC alcança as funções da extensão (a premissa do defeito)", async () => {
    expect(
      await privilegio(
        "has_function_privilege('anon', 'extensions.similarity(text, text)'::regprocedure, 'EXECUTE')",
      ),
    ).toBe(true);
  });

  it("depois: nenhum papel do provedor executa a função da extensão", async () => {
    await db.exec(SQL_COM_SUBSTITUTA);
    for (const papel of ["anon", "authenticated", "service_role"]) {
      expect(
        await privilegio(
          `has_function_privilege('${papel}', 'extensions.similarity(text, text)'::regprocedure, 'EXECUTE')`,
        ),
        papel,
      ).toBe(false);
    }
  });

  it("dc360_app executa a função da extensão e tem USAGE no schema", async () => {
    expect(
      await privilegio(
        "has_function_privilege('dc360_app', 'extensions.similarity(text, text)'::regprocedure, 'EXECUTE')",
      ),
    ).toBe(true);
    expect(await privilegio("has_schema_privilege('dc360_app', 'extensions', 'USAGE')")).toBe(true);
  });

  it("o que não é da extensão não é tocado: a função alheia segue para PUBLIC", async () => {
    expect(
      await privilegio(
        "has_function_privilege('anon', 'extensions.alheia()'::regprocedure, 'EXECUTE')",
      ),
    ).toBe(true);
  });

  it("não tira o USAGE do schema dos papéis do provedor (o Supabase depende dele)", async () => {
    expect(await privilegio("has_schema_privilege('anon', 'extensions', 'USAGE')")).toBe(true);
  });

  it("rodar de novo não muda nada e não dá erro", async () => {
    await db.exec(SQL_COM_SUBSTITUTA);
    expect(
      await privilegio(
        "has_function_privilege('anon', 'extensions.similarity(text, text)'::regprocedure, 'EXECUTE')",
      ),
    ).toBe(false);
  });
});

describe("sem a extensão instalada", () => {
  it("o arquivo inteiro roda num Postgres comum, sem os papéis do provedor", async () => {
    const db = new PGlite();
    try {
      await db.exec(SQL);
    } finally {
      await db.close();
    }
  });
});
