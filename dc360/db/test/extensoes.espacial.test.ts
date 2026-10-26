import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LEITURAS_DE_EXTENSAO,
  conferirAclDeExtensoes,
  conferirEsquemas,
  type ConsultaSql,
} from "./catalogo/index.js";
import { decidirPostgis, exigePostgis, type EstadoDoServidor } from "./postgis-decisao.js";

/**
 * O ACL dos objetos de EXTENSÃO com o PostGIS instalado de verdade (V2-F03-E08,
 * parte 0D, item 7 da auditoria de cobertura da parte 0B).
 *
 * O portão de isolamento roda em PGlite, que não traz PostGIS: lá a
 * conferência de ACL de extensão (`conferirAclDeExtensoes`) só vê o que
 * existe, e diz por escrito que a leitura declarada de `spatial_ref_sys` não
 * foi conferida. Este arquivo confere com a extensão instalada e endurecida
 * pelos mesmos arquivos do provedor (`db/provedores/postgis.sql` e
 * `supabase-endurecer.sql`), num banco descartável: o catálogo bate, e uma
 * migração que abrisse privilégio em objeto da extensão reprova.
 *
 * Roda no `test:espacial` (job `implantavel` do CI, `DC360_EXIGE_POSTGIS=1`):
 * lá, faltar o servidor ou a extensão REPROVA (`postgis-decisao.ts`), e não
 * pula em silêncio. Na máquina sem Docker, pula com aviso.
 */

const URL_DE_PROVA = process.env.DC360_POSTGRES_DE_PROVA ?? "";
const PROVEDORES = new URL("../provedores/", import.meta.url);
const SQL_INSTALAR = readFileSync(new URL("postgis.sql", PROVEDORES), "utf8");
const SQL_ENDURECER = readFileSync(new URL("supabase-endurecer.sql", PROVEDORES), "utf8");
const PAPEIS = ["anon", "authenticated", "service_role", "dc360_app", "dc360_console"];

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

const decisao = decidirPostgis(exigePostgis(), await sondar());

describe("ACL de extensão com o PostGIS: o ambiente tem o que a execução exige", () => {
  it("reprova se o CI exige PostGIS e o servidor não o oferece; local, só avisa", () => {
    if (decisao.acao === "reprovar") throw new Error(decisao.motivo);
    if (decisao.acao === "pular") console.warn(decisao.aviso);
  });
});

describe.skipIf(decisao.acao !== "rodar")(
  "ACL de extensão com o PostGIS instalado e endurecido",
  () => {
    const sorteio = Math.random().toString(36).slice(2, 10);
    const nomeDoBanco = `prova_0d_ext_${sorteio}`;
    const criados: string[] = [];
    let admin: pg.Client;
    const banco = () => admin as unknown as ConsultaSql;

    beforeAll(async () => {
      const mestre = new pg.Client({ connectionString: URL_DE_PROVA });
      await mestre.connect();
      await mestre.query(`CREATE DATABASE ${nomeDoBanco}`);
      for (const papel of PAPEIS) {
        const existe = await mestre.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [papel]);
        if (!existe.rowCount) {
          await mestre.query(`CREATE ROLE ${papel} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
          criados.push(papel);
        }
      }
      await mestre.end();
      const u = new URL(URL_DE_PROVA);
      u.pathname = `/${nomeDoBanco}`;
      admin = new pg.Client({ connectionString: u.toString() });
      await admin.connect();
      await admin.query("CREATE SCHEMA extensions");
      await admin.query(SQL_INSTALAR);
      await admin.query(SQL_ENDURECER);
    }, 120_000);

    afterAll(async () => {
      await admin?.end();
      const mestre = new pg.Client({ connectionString: URL_DE_PROVA });
      await mestre.connect();
      await mestre.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`);
      for (const papel of criados) await mestre.query(`DROP ROLE IF EXISTS ${papel}`);
      await mestre.end();
    });

    it("endurecido, o ACL é exatamente o declarado, e a leitura de spatial_ref_sys é conferida (não pulada)", async () => {
      const r = await conferirAclDeExtensoes(banco(), LEITURAS_DE_EXTENSAO);
      expect(r.problemas).toEqual([]);
      expect(r.naoInstaladas).toEqual([]);
      expect(await conferirEsquemas(banco())).toEqual([]);
    });

    it("uma migração que dá INSERT em spatial_ref_sys ao papel de aplicação reprova", async () => {
      await admin.query("GRANT INSERT ON extensions.spatial_ref_sys TO dc360_app");
      try {
        const r = await conferirAclDeExtensoes(banco(), LEITURAS_DE_EXTENSAO);
        expect(r.problemas).toEqual([
          expect.stringMatching(/dc360_app tem INSERT em extensions\.spatial_ref_sys/),
        ]);
      } finally {
        await admin.query("REVOKE INSERT ON extensions.spatial_ref_sys FROM dc360_app");
      }
    });

    it("EXECUTE com opção de concessão numa função do PostGIS reprova", async () => {
      await admin.query(
        "GRANT EXECUTE ON FUNCTION extensions.postgis_version() TO dc360_app WITH GRANT OPTION",
      );
      try {
        const r = await conferirAclDeExtensoes(banco(), LEITURAS_DE_EXTENSAO);
        expect(r.problemas.join("\n")).toMatch(
          /EXECUTE WITH GRANT OPTION em extensions\.postgis_version/,
        );
      } finally {
        await admin.query(
          "REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION extensions.postgis_version() FROM dc360_app",
        );
      }
    });

    it("um tipo que não é do PostGIS no esquema dele tira o 'só de extensão', e o USAGE do papel de aplicação reprova", async () => {
      await admin.query("CREATE TYPE extensions.intruso AS ENUM ('x')");
      try {
        expect((await conferirEsquemas(banco())).join("\n")).toMatch(
          /dc360_app tem USAGE no esquema extensions/,
        );
      } finally {
        await admin.query("DROP TYPE extensions.intruso");
      }
    });
  },
);
