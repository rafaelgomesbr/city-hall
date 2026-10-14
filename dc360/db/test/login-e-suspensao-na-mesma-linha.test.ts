/**
 * A MIGRAÇÃO 050: o login lê a suspensão do município com trava de linha
 * (`FOR SHARE`), e a renovação não (V2-F00-E07, revisão da correção 2).
 *
 * A disputa de verdade (o login e a suspensão em duas conexões) não cabe
 * aqui: o PGlite tem uma conexão só. Ela está no bloco de Postgres real de
 * `apps/api/test/renovacao-contra-encerramento.test.ts` (caso 9), que o job
 * `implantavel` do CI roda. Este arquivo cobra do BANCO o que dá para cobrar
 * sem concorrência:
 *
 *  - a migração aplica sobre um banco que já tem sessões, sem tocar nelas, e é
 *    idempotente;
 *  - o número de funções SECURITY DEFINER não mudou (teto de 27 de
 *    `isolamento.test.ts`), e `abrir_sessao` continua privilegiada e
 *    executável só pelo papel de aplicação;
 *  - no texto da função instalada, o LOGIN (família nula) lê a suspensão com
 *    `FOR SHARE` e a RENOVAÇÃO lê sem trava de linha (a trava de linha depois
 *    da trava por pessoa fecharia ciclo com a suspensão);
 *  - o login e a renovação continuam abrindo sessão como antes;
 *  - as recusas continuam as mesmas: município suspenso (DC367) e família
 *    encerrada (DC369, da 049).
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const pasta = join(aqui, "..", "migrations");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();
const ARQUIVO_050 = "050_login_e_suspensao_na_mesma_linha.sql";
const ate049 = arquivos.filter((f) => f < ARQUIVO_050);
const sql = (f: string) => readFileSync(join(pasta, f), "utf8");

let db: PGlite;
let org = "";
let usuario = "";
let sessoesAntes: unknown[] = [];
let definersAntes = 0;

async function contarDefiners(): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef`,
  );
  return r.rows[0]!.n;
}

async function lerSessoes(): Promise<unknown[]> {
  return (await db.query(
    "SELECT id, familia_id, revogada_em, motivo_revogacao FROM sessoes ORDER BY token_hash",
  )).rows;
}

async function abrir(
  tx: { query: PGlite["query"] }, hash: string, familia: string | null = null,
): Promise<string> {
  const r = await tx.query<{ id: string }>(
    "SELECT abrir_sessao($1,$2,$3, interval '1 day', NULL, NULL, $4) AS id", [org, usuario, hash, familia],
  );
  return r.rows[0]!.id;
}

async function recusa(consulta: string, valores: unknown[]): Promise<{ code?: string; message: string }> {
  try {
    await db.query(consulta, valores);
  } catch (erro) {
    return erro as { code?: string; message: string };
  }
  throw new Error("a consulta deveria ter sido recusada");
}

beforeAll(async () => {
  db = new PGlite();
  for (const f of ate049) await db.exec(sql(f));

  org = (await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC A','Serra Alta','MG') RETURNING id",
  )).rows[0]!.id;
  usuario = (await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1, 'Pessoa de Teste', 'A-1', 'a1@exemplo.gov.br', 'coordenador', 'x') RETURNING id`,
    [org],
  )).rows[0]!.id;

  // Sessões que existem ANTES da 050: uma viva, uma rotacionada e a filha dela.
  await abrir(db, "antes-viva");
  const raiz = await abrir(db, "antes-raiz");
  await db.query("SELECT revogar_sessao('antes-raiz', 'rotacionada na renovacao')");
  await abrir(db, "antes-renovada", raiz);

  sessoesAntes = await lerSessoes();
  definersAntes = await contarDefiners();
  await db.exec(sql(ARQUIVO_050));
}, 180_000);

afterAll(async () => { await db.close(); });

describe("A migração 050 sobre um banco que já tem sessões", () => {
  it("não toca em sessão nenhuma, e rodar o texto de novo não falha nem muda nada", async () => {
    expect(await lerSessoes()).toEqual(sessoesAntes);
    await db.exec(sql(ARQUIVO_050));
    expect(await lerSessoes()).toEqual(sessoesAntes);
  });

  it("o número de funções SECURITY DEFINER não mudou, e abrir_sessao continua só do papel de aplicação", async () => {
    expect(await contarDefiners()).toBe(definersAntes);
    const assinatura = "abrir_sessao(uuid,uuid,text,interval,text,text,uuid)";
    const r = await db.query<{ app: boolean; publico: boolean; console: boolean; definer: boolean }>(
      `SELECT has_function_privilege('dc360_app', '${assinatura}', 'EXECUTE') AS app,
              has_function_privilege('public', '${assinatura}', 'EXECUTE') AS publico,
              has_function_privilege('dc360_console', '${assinatura}', 'EXECUTE') AS console,
              (SELECT prosecdef FROM pg_proc WHERE oid = '${assinatura}'::regprocedure) AS definer`,
    );
    expect(r.rows[0]).toEqual({ app: true, publico: false, console: false, definer: true });
  });
});

describe("O login trava a linha do município; a renovação não", () => {
  /*
    Conferido no TEXTO da função instalada, e não pela linha travada: no PGlite
    não há segunda conexão para esbarrar na trava, e o `xmax` da linha não
    distingue o FOR SHARE do FOR KEY SHARE que a chave estrangeira de
    `sessoes` já toma em todo INSERT (os dois deixam o xid da transação ali).
    Que o FOR SHARE de fato segura a suspensão, e é segurado por ela, é o caso
    9 do bloco de Postgres real de `apps/api/test/renovacao-contra-encerramento.test.ts`.
  */
  async function corpoDeAbrirSessao(): Promise<string> {
    return (await db.query<{ def: string }>(
      "SELECT pg_get_functiondef('abrir_sessao(uuid,uuid,text,interval,text,text,uuid)'::regprocedure) AS def",
    )).rows[0]!.def.replace(/\s+/g, " ");
  }

  it("o login (família nula) lê a suspensão com FOR SHARE, e a renovação lê sem trava de linha", async () => {
    const corpo = await corpoDeAbrirSessao();
    const login = /IF p_familia_id IS NULL THEN SELECT acesso_suspenso_em INTO v_suspenso FROM organizacoes WHERE id = p_organizacao_id FOR SHARE; ELSE SELECT acesso_suspenso_em INTO v_suspenso FROM organizacoes WHERE id = p_organizacao_id; END IF;/;
    expect(corpo, "o login não trava a linha do município, ou a renovação passou a travar").toMatch(login);
    // Uma leitura só de cada tipo: nenhuma outra leitura da suspensão escapou da regra.
    expect(corpo.match(/FROM organizacoes/g)).toHaveLength(2);
    expect(corpo.match(/FOR (SHARE|UPDATE|NO KEY UPDATE)/g)).toEqual(["FOR SHARE"]);
  });

  it("o login abre família nova normalmente, e a renovação herda a família só rotacionada", async () => {
    const id = await abrir(db, "login-normal");
    const r = await db.query<{ familia_id: string }>("SELECT familia_id FROM sessoes WHERE id = $1", [id]);
    expect(r.rows[0]!.familia_id).toBe(id);

    const raiz = await abrir(db, "renovacao-raiz");
    await db.query("SELECT revogar_sessao('renovacao-raiz', 'rotacionada na renovacao')");
    const filha = await db.transaction(async (tx) => {
      await tx.query("SELECT travar_sessoes_do_usuario($1)", [usuario]);
      return abrir(tx, "renovacao-filha", raiz);
    });
    const f = await db.query<{ familia_id: string }>("SELECT familia_id FROM sessoes WHERE id = $1", [filha]);
    expect(f.rows[0]!.familia_id).toBe(raiz);
  });

  it("município suspenso: o login e a renovação continuam recusados com DC367, sem gravar nada", async () => {
    const raiz = await abrir(db, "suspensa-raiz");
    await db.query("UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'prova' WHERE id = $1", [org]);
    try {
      const login = await recusa(
        "SELECT abrir_sessao($1,$2,'suspensa-login', interval '1 day', NULL, NULL, NULL)", [org, usuario],
      );
      expect(login.code).toBe("DC367");
      const renovacao = await recusa(
        "SELECT abrir_sessao($1,$2,'suspensa-filha', interval '1 day', NULL, NULL, $3)", [org, usuario, raiz],
      );
      expect(renovacao.code).toBe("DC367");
      const gravadas = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM sessoes WHERE token_hash IN ('suspensa-login', 'suspensa-filha')",
      );
      expect(gravadas.rows[0]!.n).toBe(0);
    } finally {
      await db.query("UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [org]);
    }
  });

  it("a recusa da 049 continua: família encerrada não é herdada (DC369)", async () => {
    const raiz = await abrir(db, "encerrada-raiz");
    await db.query("SELECT revogar_sessao('encerrada-raiz', 'sessoes encerradas por quem administra')");
    const e = await recusa(
      "SELECT abrir_sessao($1,$2,'encerrada-filha', interval '1 day', NULL, NULL, $3)", [org, usuario, raiz],
    );
    expect(e.code).toBe("DC369");
  });
});
