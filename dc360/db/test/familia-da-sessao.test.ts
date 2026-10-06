/**
 * A MIGRAÇÃO 047: a família da sessão (V2-F00-E07).
 *
 * `sessoes.familia_id` liga as sessões de uma cadeia de renovação, e é com ela
 * que a vigência da API sabe se o token de uma sessão rotacionada ainda
 * pertence a uma cadeia viva. Este arquivo cobra do BANCO o que o desenho
 * promete, porque a função que mudou, `abrir_sessao`, é de autenticação: erro
 * nela trava todo login de todos os municípios.
 *
 * O QUE SE PROVA
 *  - o backfill: a sessão que já existia ganha `familia_id = id`;
 *  - o login sem família abre família nova, e a coluna não aceita NULL;
 *  - `abrir_sessao` com a família do mesmo usuário e do mesmo município a herda;
 *  - com a família de outro usuário, de outro município ou inexistente, recusa
 *    com o mesmo código e a mesma mensagem (não diz qual das três falhou);
 *  - município suspenso continua sem abrir sessão (a 038 não regrediu);
 *  - só EXISTE uma `abrir_sessao` (duas versões somariam uma ao teto de funções
 *    SECURITY DEFINER), e quem tinha permissão continua a ter, e só ele;
 *  - a família não cruza a parede do RLS.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const pasta = join(aqui, "..", "migrations");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();
const ARQUIVO_047 = "047_familia_da_sessao.sql";
const ate046 = arquivos.filter((f) => f < ARQUIVO_047);
const sql = (f: string) => readFileSync(join(pasta, f), "utf8");

const ABRIR_7 = "abrir_sessao(uuid,uuid,text,interval,text,text,uuid)";

let db: PGlite;
let orgA = "";
let orgB = "";
let usuarioA1 = "";
let usuarioA2 = "";
let usuarioB = "";
const sessoesAntigas: string[] = [];
let definersAntes = 0;

async function contarDefiners(): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef`,
  );
  return r.rows[0]!.n;
}

async function usuario(org: string, email: string, matricula: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1, 'Pessoa de Teste', $2, $3, 'coordenador', 'x') RETURNING id`,
    [org, matricula, email],
  );
  return r.rows[0]!.id;
}

beforeAll(async () => {
  db = new PGlite();
  for (const f of ate046) await db.exec(sql(f));

  orgA = (await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC A','Serra Alta','MG') RETURNING id",
  )).rows[0]!.id;
  orgB = (await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC B','Vale Fundo','MG') RETURNING id",
  )).rows[0]!.id;
  usuarioA1 = await usuario(orgA, "a1@exemplo.gov.br", "A-1");
  usuarioA2 = await usuario(orgA, "a2@exemplo.gov.br", "A-2");
  usuarioB = await usuario(orgB, "b1@exemplo.gov.br", "B-1");

  // Sessões que existem ANTES da migração, uma viva e uma rotacionada.
  for (const [org, usr, hash, revogada] of [
    [orgA, usuarioA1, "antiga-viva", false],
    [orgA, usuarioA1, "antiga-rotacionada", true],
    [orgB, usuarioB, "antiga-de-b", false],
  ] as const) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em, revogada_em, motivo_revogacao)
       VALUES ($1, $2, $3, now() + interval '1 day', ${revogada ? "now()" : "NULL"},
               ${revogada ? "'rotacionada na renovacao'" : "NULL"}) RETURNING id`,
      [org, usr, hash],
    );
    sessoesAntigas.push(r.rows[0]!.id);
  }

  definersAntes = await contarDefiners();
  await db.exec(sql(ARQUIVO_047));
}, 180_000);

afterAll(async () => { await db.close(); });

async function recusa(consulta: string, valores: unknown[]): Promise<{ code?: string; message: string }> {
  try {
    await db.query(consulta, valores);
  } catch (erro) {
    return erro as { code?: string; message: string };
  }
  throw new Error("a consulta deveria ter sido recusada");
}

describe("O que a migração faz com o que já existia", () => {
  it("o backfill dá a cada sessão antiga a família dela mesma (familia_id = id)", async () => {
    const r = await db.query<{ id: string; familia_id: string }>(
      "SELECT id, familia_id FROM sessoes WHERE id = ANY($1::uuid[])", [sessoesAntigas],
    );
    expect(r.rows).toHaveLength(3);
    for (const linha of r.rows) expect(linha.familia_id).toBe(linha.id);
  });

  it("a coluna não aceita NULL, e INSERT que não diz a família abre uma nova", async () => {
    const col = await db.query<{ is_nullable: string }>(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'sessoes' AND column_name = 'familia_id'",
    );
    expect(col.rows[0]!.is_nullable).toBe("NO");
    const r = await db.query<{ id: string; familia_id: string }>(
      `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em)
       VALUES ($1, $2, 'sem-familia-1', now() + interval '1 day'),
              ($1, $2, 'sem-familia-2', now() + interval '1 day') RETURNING id, familia_id`,
      [orgA, usuarioA1],
    );
    expect(r.rows[0]!.familia_id).not.toBe(r.rows[1]!.familia_id);
    await expect(db.query(
      `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em, familia_id)
       VALUES ($1, $2, 'familia-nula', now() + interval '1 day', NULL)`, [orgA, usuarioA1],
    )).rejects.toThrow();
  });

  it("existe o índice parcial das famílias vivas", async () => {
    const r = await db.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'sessoes_familia_viva_idx'",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.indexdef).toMatch(/familia_id/);
    expect(r.rows[0]!.indexdef).toMatch(/revogada_em IS NULL/);
  });
});

describe("abrir_sessao com a família opcional", () => {
  it("a chamada de seis argumentos (a forma da 002 e da 038) continua funcionando e abre família nova", async () => {
    const r = await db.query<{ abrir_sessao: string }>(
      "SELECT abrir_sessao($1,$2,'login-seis-args', interval '1 day', 'agente', '10.0.0.1')", [orgA, usuarioA1],
    );
    const id = r.rows[0]!.abrir_sessao;
    const linha = await db.query<{ familia_id: string; ip: string }>(
      "SELECT familia_id, host(ip) AS ip FROM sessoes WHERE id = $1", [id],
    );
    expect(linha.rows[0]!.familia_id).toBe(id);
    expect(linha.rows[0]!.ip).toBe("10.0.0.1");
  });

  it("com a família do mesmo usuário e do mesmo município, herda", async () => {
    const raiz = (await db.query<{ abrir_sessao: string }>(
      "SELECT abrir_sessao($1,$2,'raiz', interval '1 day', NULL, NULL)", [orgA, usuarioA1],
    )).rows[0]!.abrir_sessao;
    const filha = (await db.query<{ abrir_sessao: string }>(
      "SELECT abrir_sessao($1,$2,'filha', interval '1 day', NULL, NULL, $3)", [orgA, usuarioA1, raiz],
    )).rows[0]!.abrir_sessao;
    const r = await db.query<{ id: string; familia_id: string }>(
      "SELECT id, familia_id FROM sessoes WHERE id = ANY($1::uuid[])", [[raiz, filha]],
    );
    const porId = new Map(r.rows.map((l) => [l.id, l.familia_id]));
    expect(porId.get(raiz)).toBe(raiz);
    expect(porId.get(filha)).toBe(raiz);
  });

  it("recusa a família de OUTRO usuário, de OUTRO município e a que não existe, com a mesma mensagem", async () => {
    const deA2 = (await db.query<{ abrir_sessao: string }>(
      "SELECT abrir_sessao($1,$2,'raiz-de-a2', interval '1 day', NULL, NULL)", [orgA, usuarioA2],
    )).rows[0]!.abrir_sessao;
    const deB = (await db.query<{ abrir_sessao: string }>(
      "SELECT abrir_sessao($1,$2,'raiz-de-b', interval '1 day', NULL, NULL)", [orgB, usuarioB],
    )).rows[0]!.abrir_sessao;
    const inexistente = "99999999-9999-4999-8999-999999999999";

    const outroUsuario = await recusa(
      "SELECT abrir_sessao($1,$2,'invasora-1', interval '1 day', NULL, NULL, $3)", [orgA, usuarioA1, deA2],
    );
    const outroMunicipio = await recusa(
      "SELECT abrir_sessao($1,$2,'invasora-2', interval '1 day', NULL, NULL, $3)", [orgA, usuarioA1, deB],
    );
    const nenhuma = await recusa(
      "SELECT abrir_sessao($1,$2,'invasora-3', interval '1 day', NULL, NULL, $3)", [orgA, usuarioA1, inexistente],
    );
    for (const e of [outroUsuario, outroMunicipio, nenhuma]) expect(e.code).toBe("DC369");
    expect(outroMunicipio.message).toBe(outroUsuario.message);
    expect(nenhuma.message).toBe(outroUsuario.message);

    // E nada foi gravado.
    const gravadas = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM sessoes WHERE token_hash LIKE 'invasora-%'",
    );
    expect(gravadas.rows[0]!.n).toBe(0);
  });

  it("município suspenso continua sem abrir sessão (a recusa da 038 não regrediu)", async () => {
    await db.query("UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'contrato em discussao' WHERE id = $1", [orgB]);
    try {
      const e = await recusa(
        "SELECT abrir_sessao($1,$2,'suspenso', interval '1 day', NULL, NULL)", [orgB, usuarioB],
      );
      expect(e.code).toBe("DC367");
    } finally {
      await db.query("UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [orgB]);
    }
  });
});

describe("A função, o teto e as permissões", () => {
  it("existe UMA abrir_sessao, de sete argumentos: a assinatura antiga saiu em vez de ficar ao lado", async () => {
    const r = await db.query<{ args: string }>(
      "SELECT pg_get_function_identity_arguments(oid) AS args FROM pg_proc WHERE proname = 'abrir_sessao'",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.args.split(",")).toHaveLength(7);
  });

  it("o número de funções SECURITY DEFINER não mudou", async () => {
    expect(await contarDefiners()).toBe(definersAntes);
  });

  it("continua SECURITY DEFINER com search_path fixo, e só o papel de aplicação executa", async () => {
    const f = await db.query<{ prosecdef: boolean; config: string[] | null }>(
      "SELECT prosecdef, proconfig AS config FROM pg_proc WHERE proname = 'abrir_sessao'",
    );
    expect(f.rows[0]!.prosecdef).toBe(true);
    expect((f.rows[0]!.config ?? []).join(";")).toMatch(/search_path=/);
    const app = await db.query<{ pode: boolean }>(
      `SELECT has_function_privilege('dc360_app', '${ABRIR_7}', 'EXECUTE') AS pode`,
    );
    const console_ = await db.query<{ pode: boolean }>(
      `SELECT has_function_privilege('dc360_console', '${ABRIR_7}', 'EXECUTE') AS pode`,
    );
    expect(app.rows[0]!.pode).toBe(true);
    expect(console_.rows[0]!.pode).toBe(false);
  });
});

describe("O isolamento não mudou: a família não cruza a parede do RLS", () => {
  it("o papel de aplicação, no contexto do município A, só vê as famílias do A", async () => {
    const r = await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_app");
      await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgA]);
      return tx.query<{ organizacao_id: string }>("SELECT DISTINCT organizacao_id FROM sessoes");
    });
    expect(r.rows.map((l) => l.organizacao_id)).toEqual([orgA]);
  });

  it("sem contexto de município, o papel de aplicação não vê sessão nenhuma", async () => {
    const r = await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_app");
      return tx.query<{ n: number }>("SELECT count(*)::int AS n FROM sessoes");
    });
    expect(r.rows[0]!.n).toBe(0);
  });
});
