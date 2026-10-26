/**
 * A MIGRAÇÃO 052: a chave de criação do chamado e a evidência presa à
 * ocorrência (V2-F02-E07).
 *
 * `ocorrencias.chave_de_criacao` (uuid, opcional) com índice único PARCIAL por
 * município, e o índice único (organizacao_id, ocorrencia_id, idempotency_key)
 * em `evidencias`. Este arquivo cobra do BANCO o que o desenho promete, porque
 * a API conta com ele na corrida: o segundo INSERT tem de cair em 23505, e
 * esse erro é o que faz a transação inteira (inclusive o `proximo_protocolo`)
 * voltar.
 *
 * O QUE SE PROVA
 *  - dado que já existia não viola nada: com a base na 051 e evidências com
 *    chave, a 052 aplica sem erro, e o chamado antigo fica com a chave nula;
 *  - a mesma chave duas vezes no mesmo município: 23505 no índice certo;
 *  - a mesma chave em dois municípios: aceita (a chave não cruza a parede);
 *  - chave nula repete à vontade (cliente sem chave, e todo chamado antigo);
 *  - o índice da evidência, SOZINHO (o da 004 solto de lado): recusa repetir
 *    (município, ocorrência, chave) e aceita a mesma chave em outra ocorrência,
 *    porque é por ocorrência. É o motivo de ele ser mais fraco que o da 004;
 *  - a volta (`desfazer/052`): aplicar, desfazer e reaplicar deixa colunas,
 *    índices, RLS e funções idênticos, com a RLS forçada como estava.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aplicarMigracoes,
  carregarDesfazeres,
  carregarMigracoes,
  carregarSemente,
  desfazerUltimaMigracao,
  migracoesAplicadas,
  type ExecutorSql,
} from "../src/index.js";

const ARQUIVO_052 = "052_chave_de_criacao_do_chamado.sql";
const DEV = { url: undefined, env: { AMBIENTE_DC360: "dev" } } as const;
const ORG_A = "11111111-1111-4111-8111-000000000001";
const ORG_B = "22222222-2222-4222-8222-000000000002";

function executorDe(db: PGlite): ExecutorSql {
  return {
    query: async <T>(sql: string, params?: readonly unknown[]) => {
      const r = await db.query<Record<string, unknown>>(sql, params ? [...params] : undefined);
      return { rows: r.rows as T[] };
    },
    exec: (sql: string) => db.exec(sql),
  };
}

async function fotografia(bd: ExecutorSql): Promise<Record<string, unknown[]>> {
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

const chave = () => crypto.randomUUID();

/**
 * As migrações até a 052 inclusive. A 052 deixou de ser a última (a F03 traz a
 * 053 em diante): as provas de "aplicar a 052" e de "desfazer a 052" precisam
 * parar nela, e não no fim da fila.
 */
function ateA052() {
  const todas = carregarMigracoes();
  return todas.slice(0, todas.findIndex((m) => m.versao === ARQUIVO_052) + 1);
}

async function ocorrenciasDe(db: PGlite, org: string, quantas: number): Promise<string[]> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM ocorrencias WHERE organizacao_id = $1 ORDER BY id LIMIT $2",
    [org, quantas],
  );
  return r.rows.map((l) => l.id);
}

function inserirEvidencia(db: PGlite, org: string, ocorrencia: string, chaveDaFoto: string | null) {
  return db.query(
    `INSERT INTO evidencias (organizacao_id, ocorrencia_id, chave_storage, capturada_em, ordem,
                             tipo_conteudo, tamanho_bytes, idempotency_key)
     VALUES ($1, $2, $3, now(), 0, 'image/png', 68, $4)`,
    [org, ocorrencia, `tenant/${org}/${crypto.randomUUID()}`, chaveDaFoto],
  );
}

describe("a 052 sobre dado que já existia", () => {
  let db: PGlite;
  let antigas: string[];
  let chavesAntigas: string[];

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    const todas = carregarMigracoes();
    const ate051 = todas.slice(
      0,
      todas.findIndex((m) => m.versao === ARQUIVO_052),
    );
    expect(ate051).toHaveLength(51);
    await aplicarMigracoes(executorDe(db), ate051);
    await db.exec(carregarSemente());

    // Evidências ANTIGAS com chave, em mais de uma ocorrência e município: o
    // dado que a 052 encontra em produção.
    antigas = [...(await ocorrenciasDe(db, ORG_A, 3)), ...(await ocorrenciasDe(db, ORG_B, 1))];
    chavesAntigas = antigas.map(() => chave());
    for (const [i, id] of antigas.entries()) {
      await inserirEvidencia(db, i === 3 ? ORG_B : ORG_A, id, chavesAntigas[i]!);
    }
    // A mesma chave em municípios diferentes, como o índice da 004 já permitia.
    const repetida = chave();
    await inserirEvidencia(db, ORG_A, antigas[0]!, repetida);
    await inserirEvidencia(db, ORG_B, antigas[3]!, repetida);
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("antes: nenhuma linha antiga repete (organização, ocorrência, chave): nada a limpar", async () => {
    const r = await db.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM (
        SELECT 1 FROM evidencias WHERE idempotency_key IS NOT NULL
         GROUP BY organizacao_id, ocorrencia_id, idempotency_key HAVING count(*) > 1
      ) t`);
    expect(r.rows[0]!.n).toBe(0);
  });

  it("aplica sem erro sobre esses dados, e o chamado antigo fica com a chave nula", async () => {
    const r = await aplicarMigracoes(executorDe(db), ateA052());
    expect(r.aplicadas).toEqual([ARQUIVO_052]);

    const nulos = await db.query<{ total: number; nulas: number }>(
      "SELECT count(*)::int AS total, count(*) FILTER (WHERE chave_de_criacao IS NULL)::int AS nulas FROM ocorrencias",
    );
    expect(nulos.rows[0]!.total).toBeGreaterThan(0);
    expect(nulos.rows[0]!.nulas).toBe(nulos.rows[0]!.total);

    const evidencias = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM evidencias WHERE idempotency_key = ANY($1)",
      [chavesAntigas],
    );
    expect(evidencias.rows[0]!.n).toBe(chavesAntigas.length);
  });
});

describe("os índices da 052, com a base inteira", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    await aplicarMigracoes(executorDe(db), carregarMigracoes());
    await db.exec(carregarSemente());
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("a coluna é uuid, opcional, e os dois índices são únicos e PARCIAIS", async () => {
    const col = await db.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'ocorrencias' AND column_name = 'chave_de_criacao'`,
    );
    expect(col.rows[0]).toEqual({ data_type: "uuid", is_nullable: "YES" });

    const idx = await db.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE indexname IN ('ocorrencias_chave_de_criacao', 'evidencias_idempotencia_por_ocorrencia')
        ORDER BY indexname`,
    );
    expect(idx.rows.map((i) => i.indexname)).toEqual([
      "evidencias_idempotencia_por_ocorrencia",
      "ocorrencias_chave_de_criacao",
    ]);
    for (const i of idx.rows) expect(i.indexdef).toMatch(/CREATE UNIQUE INDEX/);
    expect(idx.rows[1]!.indexdef).toMatch(/\(organizacao_id, chave_de_criacao\)/);
    expect(idx.rows[1]!.indexdef).toMatch(/WHERE \(chave_de_criacao IS NOT NULL\)/);
    expect(idx.rows[0]!.indexdef).toMatch(/\(organizacao_id, ocorrencia_id, idempotency_key\)/);
    expect(idx.rows[0]!.indexdef).toMatch(/WHERE \(idempotency_key IS NOT NULL\)/);
  });

  it("a mesma chave duas vezes no mesmo município: 23505 no índice certo", async () => {
    const [um, dois] = await ocorrenciasDe(db, ORG_A, 2);
    const k = chave();
    await db.query("UPDATE ocorrencias SET chave_de_criacao = $1 WHERE id = $2", [k, um]);
    await expect(
      db.query("UPDATE ocorrencias SET chave_de_criacao = $1 WHERE id = $2", [k, dois]),
    ).rejects.toMatchObject({ code: "23505", constraint: "ocorrencias_chave_de_criacao" });
  });

  it("a mesma chave em dois municípios é aceita (a chave não cruza a parede)", async () => {
    const [deA] = await ocorrenciasDe(db, ORG_A, 1);
    const [deB] = await ocorrenciasDe(db, ORG_B, 1);
    const k = chave();
    await db.query("UPDATE ocorrencias SET chave_de_criacao = $1 WHERE id = $2", [k, deA]);
    await db.query("UPDATE ocorrencias SET chave_de_criacao = $1 WHERE id = $2", [k, deB]);
    const r = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM ocorrencias WHERE chave_de_criacao = $1",
      [k],
    );
    expect(r.rows[0]!.n).toBe(2);
  });

  it("chave nula repete à vontade: cliente sem chave e chamado antigo não colidem", async () => {
    const r = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM ocorrencias WHERE chave_de_criacao IS NULL",
    );
    expect(r.rows[0]!.n).toBeGreaterThan(1);
  });

  it("evidência: o índice da 052 SOZINHO recusa repetir (município, ocorrência, chave) e aceita outra ocorrência", async () => {
    // O índice da 004 já cobre tudo isto e mais (município + chave). Solto de
    // lado numa cópia da base, o da 052 mostra o que ele garante por si.
    const copia = new PGlite();
    await copia.waitReady;
    try {
      await aplicarMigracoes(executorDe(copia), carregarMigracoes());
      await copia.exec(carregarSemente());
      await copia.exec("DROP INDEX evidencias_idempotencia");

      const [um, dois] = await ocorrenciasDe(copia, ORG_A, 2);
      const k = chave();
      await inserirEvidencia(copia, ORG_A, um!, k);
      await expect(inserirEvidencia(copia, ORG_A, um!, k)).rejects.toMatchObject({
        code: "23505",
        constraint: "evidencias_idempotencia_por_ocorrencia",
      });
      // É por ocorrência: a mesma chave em OUTRA ocorrência o índice não barra
      // (quem barra isso é o da 004, e a API devolve 409 antes de chegar ao banco).
      await inserirEvidencia(copia, ORG_A, dois!, k);
      // Chave nula não conta.
      await inserirEvidencia(copia, ORG_A, um!, null);
      await inserirEvidencia(copia, ORG_A, um!, null);
    } finally {
      await copia.close();
    }
  }, 120_000);

  it("evidência, com os dois índices: a mesma chave em outra ocorrência do mesmo município é recusada pelo da 004", async () => {
    const [um, dois] = await ocorrenciasDe(db, ORG_A, 2);
    const k = chave();
    await inserirEvidencia(db, ORG_A, um!, k);
    await expect(inserirEvidencia(db, ORG_A, dois!, k)).rejects.toMatchObject({ code: "23505" });
    // E em outro município a mesma chave passa.
    const [deB] = await ocorrenciasDe(db, ORG_B, 1);
    await inserirEvidencia(db, ORG_B, deB!, k);
  });
});

describe("a volta da 052", () => {
  it("aplicar, desfazer e reaplicar: colunas, índices, RLS e funções idênticos", async () => {
    const db = new PGlite();
    await db.waitReady;
    const bd = executorDe(db);
    try {
      const todas = ateA052();
      const ate051 = todas.slice(0, 51);
      await aplicarMigracoes(bd, ate051);
      const antes = await fotografia(bd);

      await aplicarMigracoes(bd, todas);
      const com = await fotografia(bd);
      expect(com).not.toEqual(antes);
      expect(JSON.stringify(com["indices"])).toContain("ocorrencias_chave_de_criacao");
      expect(JSON.stringify(com["indices"])).toContain("evidencias_idempotencia_por_ocorrencia");
      // A RLS segue ligada E forçada nas duas tabelas.
      const rls = com["rls"] as Array<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>;
      for (const t of ["ocorrencias", "evidencias"]) {
        expect(
          rls.find((l) => l.relname === t),
          t,
        ).toMatchObject({
          relrowsecurity: true,
          relforcerowsecurity: true,
        });
      }

      const r = await desfazerUltimaMigracao(bd, todas, carregarDesfazeres(), DEV);
      expect(r.desfeita).toBe(ARQUIVO_052);
      expect((await migracoesAplicadas(bd)).map((m) => m.versao)).toHaveLength(51);
      expect(await fotografia(bd)).toEqual(antes);

      await aplicarMigracoes(bd, todas);
      expect(await fotografia(bd)).toEqual(com);
    } finally {
      await db.close();
    }
  }, 240_000);
});
