import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DesfazerRecusado,
  IDENTIDADES_DE_PROD,
  aplicarMigracoes,
  carregarMigracoes,
  desfazerUltimaMigracao,
  migracoesAplicadas,
  motivoParaNaoDesfazer,
  type Desfazer,
  type ExecutorSql,
  type Migracao,
} from "../src/index.js";

/**
 * Desfazer a última migração (V2-F01-E18).
 *
 * O que estes testes protegem: o desfazer apaga dado, então (1) ele recusa em
 * produção ANTES de tocar no banco, (2) desfaz UMA migração e só a última,
 * (3) o ciclo aplicar, desfazer e reaplicar deixa o esquema idêntico, com a RLS
 * forçada do jeito que estava (a regra número um do produto), e (4) a migração
 * que não tem volta recusa em vez de adivinhar.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ_DB = join(aqui, "..");
const RAIZ = join(aqui, "..", "..");
const PROD = IDENTIDADES_DE_PROD[0]!;

let db: PGlite;
let bd: ExecutorSql;

beforeEach(async () => {
  db = new PGlite();
  await db.waitReady;
  bd = {
    query: async <T>(sql: string, params?: readonly unknown[]) => {
      const r = await db.query<Record<string, unknown>>(sql, params ? [...params] : undefined);
      return { rows: r.rows as T[] };
    },
    exec: (sql: string) => db.exec(sql),
  };
});

afterEach(async () => {
  await db?.close();
});

const DEV = { url: undefined, env: { AMBIENTE_DC360: "dev" } } as const;

const M1: Migracao = {
  versao: "001_primeira.sql",
  sql: "CREATE TABLE alfa (id integer PRIMARY KEY);",
};
const M2: Migracao = {
  versao: "002_segunda.sql",
  sql: "ALTER TABLE alfa ADD COLUMN nome text; CREATE INDEX alfa_nome ON alfa (nome);",
};
const V2: Desfazer = {
  versao: "002_segunda.sql",
  sql: "DROP INDEX alfa_nome; ALTER TABLE alfa DROP COLUMN nome;",
};

async function versoes(): Promise<string[]> {
  return (await migracoesAplicadas(bd)).map((m) => m.versao);
}

/**
 * Uma fotografia do esquema: colunas, índices, políticas de RLS, se a RLS está
 * ligada E forçada em cada tabela, e as funções. Duas fotografias iguais
 * significam que o ciclo não deixou nada para trás nem levou nada embora.
 */
async function fotografia(): Promise<Record<string, unknown[]>> {
  const consulta = async (sql: string) => (await bd.query(sql)).rows;
  return {
    colunas: await consulta(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`),
    indices: await consulta(`
      SELECT tablename, indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' ORDER BY tablename, indexname`),
    politicas: await consulta(`
      SELECT tablename, policyname, cmd, roles::text AS papeis, qual, with_check
        FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`),
    rls: await consulta(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`),
    funcoes: await consulta(`
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY p.proname, args`),
  };
}

describe("positivos: desfaz só a última, e o ciclo deixa o esquema idêntico", () => {
  it("aplicar, desfazer e reaplicar: information_schema, índices e RLS idênticos", async () => {
    await aplicarMigracoes(bd, [M1]);
    const antes = await fotografia();

    await aplicarMigracoes(bd, [M1, M2]);
    const com = await fotografia();
    expect(com).not.toEqual(antes);

    const r = await desfazerUltimaMigracao(bd, [M1, M2], [V2], DEV);
    expect(r.desfeita).toBe("002_segunda.sql");
    expect(await versoes()).toEqual(["001_primeira.sql"]);
    expect(await fotografia()).toEqual(antes);

    const de_novo = await aplicarMigracoes(bd, [M1, M2]);
    expect(de_novo.aplicadas).toEqual(["002_segunda.sql"]);
    expect(await fotografia()).toEqual(com);
  });

  it("desfaz UMA só: a anterior continua aplicada", async () => {
    const M3: Migracao = { versao: "003_terceira.sql", sql: "CREATE TABLE beta (id integer);" };
    const V3: Desfazer = { versao: "003_terceira.sql", sql: "DROP TABLE beta;" };
    await aplicarMigracoes(bd, [M1, M2, M3]);
    await desfazerUltimaMigracao(bd, [M1, M2, M3], [V2, V3], DEV);
    expect(await versoes()).toEqual(["001_primeira.sql", "002_segunda.sql"]);
  });

  it("sem nada aplicado, diz que não há o que desfazer", async () => {
    const r = await desfazerUltimaMigracao(bd, [M1], [], DEV);
    expect(r.desfeita).toBeNull();
    expect(r.motivo).toMatch(/nada a desfazer/);
  });

  it("larga a trava de migração no fim", async () => {
    await aplicarMigracoes(bd, [M1, M2]);
    await desfazerUltimaMigracao(bd, [M1, M2], [V2], DEV);
    const r = await bd.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_locks WHERE locktype = 'advisory'",
    );
    expect(Number(r.rows[0]?.n)).toBe(0);
  });
});

describe("com as migrações de verdade: o isolamento sobrevive ao ciclo", () => {
  it("uma 052 de prova com tabela de negócio e RLS forçada: desfazer devolve o estado exato", async () => {
    const reais = carregarMigracoes();
    const PROVA: Migracao = {
      versao: "052_prova_do_desfazer.sql",
      sql: `
        CREATE TABLE prova_e18 (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          organizacao_id uuid NOT NULL
        );
        ALTER TABLE prova_e18 ENABLE ROW LEVEL SECURITY;
        ALTER TABLE prova_e18 FORCE ROW LEVEL SECURITY;
        CREATE POLICY prova_e18_isolamento ON prova_e18
          USING (organizacao_id = nullif(current_setting('app.organizacao_id', true), '')::uuid);
      `,
    };
    const VOLTA: Desfazer = {
      versao: "052_prova_do_desfazer.sql",
      sql: "DROP TABLE prova_e18;",
    };

    await aplicarMigracoes(bd, reais);
    const antes = await fotografia();

    await aplicarMigracoes(bd, [...reais, PROVA]);
    const com = await fotografia();
    expect(JSON.stringify(com["rls"])).toContain("prova_e18");

    const r = await desfazerUltimaMigracao(bd, [...reais, PROVA], [VOLTA], DEV);
    expect(r.desfeita).toBe("052_prova_do_desfazer.sql");
    expect(await fotografia()).toEqual(antes);

    await aplicarMigracoes(bd, [...reais, PROVA]);
    expect(await fotografia()).toEqual(com);
  }, 120_000);

  it("a última das 51 existentes não tem volta e recusa com a explicação, sem alterar nada", async () => {
    const reais = carregarMigracoes();
    await aplicarMigracoes(bd, reais);
    const antes = await fotografia();

    const erro = await desfazerUltimaMigracao(bd, reais, [], DEV).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(erro).toBeInstanceOf(DesfazerRecusado);
    expect(erro!.message).toMatch(
      /051_link_de_recuperacao_morre_com_a_credencial\.sql não tem arquivo/,
    );
    expect(erro!.message).toMatch(/até a 051/);
    expect(await fotografia()).toEqual(antes);
    expect((await versoes()).length).toBe(reais.length);
  }, 120_000);
});

describe("negativos: o que o desfazer recusa", () => {
  it("migração declarada IRREVERSIVEL", async () => {
    const IRREV: Migracao = {
      versao: "002_apaga.sql",
      sql: "-- IRREVERSIVEL: apaga o dado; aprovado por Rafael; 2026-10-24\nDROP TABLE alfa;",
    };
    await aplicarMigracoes(bd, [M1, IRREV]);
    await expect(desfazerUltimaMigracao(bd, [M1, IRREV], [], DEV)).rejects.toThrow(
      /declarada IRREVERSIVEL \(apaga o dado; aprovado por Rafael; 2026-10-24\)/,
    );
  });

  it("migração aplicada cujo arquivo não existe nesta versão do código", async () => {
    await aplicarMigracoes(bd, [M1, M2]);
    await expect(desfazerUltimaMigracao(bd, [M1], [], DEV)).rejects.toThrow(
      /002_segunda\.sql, mas esse arquivo não existe/,
    );
  });

  it("volta que falha: desfaz inteira ou não desfaz nada, e o registro continua", async () => {
    await aplicarMigracoes(bd, [M1, M2]);
    const quebrada: Desfazer = {
      versao: "002_segunda.sql",
      sql: "DROP INDEX alfa_nome; DROP TABLE tabela_que_nao_existe;",
    };
    await expect(desfazerUltimaMigracao(bd, [M1, M2], [quebrada], DEV)).rejects.toThrow(
      /Falha ao desfazer 002_segunda\.sql/,
    );
    // O DROP INDEX do começo foi desfeito junto, e o registro não perdeu a linha.
    const idx = await bd.query("SELECT 1 FROM pg_indexes WHERE indexname = 'alfa_nome'");
    expect(idx.rows).toHaveLength(1);
    expect(await versoes()).toEqual(["001_primeira.sql", "002_segunda.sql"]);
  });
});

describe("em PRODUÇÃO: recusa antes de tocar no banco", () => {
  /** Um executor que falha se alguém encostar nele: a recusa tem de vir antes. */
  const intocavel: ExecutorSql = {
    query: () => Promise.reject(new Error("o banco foi tocado")),
    exec: () => Promise.reject(new Error("o banco foi tocado")),
  };

  it("AMBIENTE_DC360=prod", async () => {
    const motivo = motivoParaNaoDesfazer({ url: undefined, env: { AMBIENTE_DC360: "prod" } });
    expect(motivo).toMatch(/AMBIENTE_DC360=prod/);
    await expect(
      desfazerUltimaMigracao(intocavel, [M1], [], {
        url: undefined,
        env: { AMBIENTE_DC360: "prod" },
      }),
    ).rejects.toBeInstanceOf(DesfazerRecusado);
  });

  it("NODE_ENV=production, mesmo sem AMBIENTE_DC360", async () => {
    await expect(
      desfazerUltimaMigracao(intocavel, [M1], [], {
        url: undefined,
        env: { NODE_ENV: "production" },
      }),
    ).rejects.toThrow(/NODE_ENV=production/);
  });

  it("URL com a identidade de um banco de PRODUÇÃO, sem variável nenhuma, sem repetir a senha", async () => {
    const url = `postgres://dc360_setup.${PROD}:senha-secreta@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
    const erro = await desfazerUltimaMigracao(intocavel, [M1], [], { url, env: {} }).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(erro).toBeInstanceOf(DesfazerRecusado);
    expect(erro!.message).toMatch(/PRODUÇÃO/);
    expect(erro!.message).not.toContain("senha-secreta");
  });

  it("a identidade declarada pelo processo (IDENTIDADE_DO_BANCO) também protege", () => {
    expect(
      motivoParaNaoDesfazer({
        url: "postgres://u:p@db.meubanco123.supabase.co:5432/postgres",
        env: { IDENTIDADE_DO_BANCO: "meubanco123" },
      }),
    ).toMatch(/PRODUÇÃO/);
  });

  it("homologação e desenvolvimento podem desfazer", () => {
    for (const env of [{ AMBIENTE_DC360: "hml" }, { AMBIENTE_DC360: "dev" }, {}]) {
      expect(motivoParaNaoDesfazer({ url: "postgres://u:p@127.0.0.1:5432/dc360", env })).toBeNull();
    }
  });
});

describe("o comando de verdade (`npm run migrar -- --desfazer`)", () => {
  function rodar(args: string[], env: Record<string, string>) {
    const tsx = join(RAIZ, "node_modules", ".bin", "tsx");
    return spawnSync(tsx, [join(RAIZ_DB, "src", "cli.ts"), ...args], {
      cwd: RAIZ_DB,
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", ...env },
      timeout: 90_000,
    });
  }

  it("com AMBIENTE_DC360=prod: código 1, sem conectar", () => {
    const r = rodar(["--desfazer"], {
      AMBIENTE_DC360: "prod",
      // Inalcançável de propósito: se a recusa regredir, o comando falha ao conectar.
      DATABASE_URL: "postgres://u:senha-secreta@127.0.0.1:1/postgres",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/AMBIENTE_DC360=prod/);
    expect(r.stdout).not.toMatch(/Aplicadas|Desfeita/);
    expect(`${r.stdout}${r.stderr}`).not.toContain("senha-secreta");
  });

  it("com a porta 6543 (pooler): código 2, sem conectar", () => {
    const r = rodar([], { DATABASE_URL: "postgres://u:senha-secreta@127.0.0.1:6543/postgres" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/6543/);
    expect(`${r.stdout}${r.stderr}`).not.toContain("senha-secreta");
  });

  it("--desfazer com --semear: código 2", () => {
    const r = rodar(["--desfazer", "--semear"], {});
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/não combinam/);
  });

  it("banco efêmero vazio: nada a desfazer, código 0", () => {
    const r = rodar(["--desfazer"], {});
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/nada a desfazer/);
  });
});
