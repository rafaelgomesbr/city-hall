/**
 * A MIGRAÇÃO 049: a renovação e todo encerramento em massa passam pela mesma
 * trava, e `abrir_sessao` recusa herdar família encerrada (V2-F00-E07,
 * correção 2).
 *
 * A disputa de verdade (duas conexões, uma segurando a trava) não cabe aqui:
 * o PGlite tem uma conexão só. Ela está em
 * `apps/api/test/renovacao-contra-encerramento.test.ts` (bloco de Postgres
 * real) e na sonda arquivada na evidência da correção. Este arquivo cobra do
 * BANCO o que dá para cobrar sem concorrência:
 *
 *  - a migração aplica sobre um banco que já tem sessões, sem tocar nelas;
 *  - `travar_sessoes_do_usuario` existe, NÃO é SECURITY DEFINER, fixa o
 *    `search_path`, e só o papel de aplicação a executa;
 *  - o número de funções SECURITY DEFINER não mudou (teto de 27 de
 *    `isolamento.test.ts`);
 *  - cada encerramento em massa que mora no banco (`revogar_sessoes_do_usuario`,
 *    `trocar_senha`, `consumir_recuperacao`) toma a MESMA trava que a função
 *    de trava toma, e a trava some no fim da transação;
 *  - `abrir_sessao` herda a família só rotacionada e recusa a encerrada, com
 *    o mesmo código e a mesma mensagem das recusas da 047, sem gravar nada.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const pasta = join(aqui, "..", "migrations");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();
const ARQUIVO_049 = "049_renovacao_e_encerramento_na_mesma_trava.sql";
const ate048 = arquivos.filter((f) => f < ARQUIVO_049);
const sql = (f: string) => readFileSync(join(pasta, f), "utf8");

let db: PGlite;
let org = "";
let usuario = "";
let outro = "";
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

async function abrir(hash: string, familia: string | null = null, quem = usuario): Promise<string> {
  const r = await db.query<{ id: string }>(
    "SELECT abrir_sessao($1,$2,$3, interval '1 day', NULL, NULL, $4) AS id", [org, quem, hash, familia],
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

/** As travas consultivas que ESTA conexão segura agora, como texto comparável. */
async function travasSeguras(tx: { query: PGlite["query"] }): Promise<string[]> {
  const r = await tx.query<{ chave: string }>(
    `SELECT classid::text || '/' || objid::text || '/' || objsubid::text AS chave
       FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() ORDER BY 1`,
  );
  return r.rows.map((l) => l.chave);
}

beforeAll(async () => {
  db = new PGlite();
  for (const f of ate048) await db.exec(sql(f));

  org = (await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC A','Serra Alta','MG') RETURNING id",
  )).rows[0]!.id;
  const criar = async (email: string, matricula: string) => (await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1, 'Pessoa de Teste', $2, $3, 'coordenador', 'x') RETURNING id`,
    [org, matricula, email],
  )).rows[0]!.id;
  usuario = await criar("a1@exemplo.gov.br", "A-1");
  outro = await criar("a2@exemplo.gov.br", "A-2");

  // Sessões que existem ANTES da 049: uma cadeia viva, uma rotacionada, uma encerrada.
  await abrir("antes-viva");
  const raiz = await abrir("antes-raiz");
  await db.query("SELECT revogar_sessao('antes-raiz', 'rotacionada na renovacao')");
  await abrir("antes-renovada", raiz);
  await abrir("antes-encerrada");
  await db.query("SELECT revogar_sessao('antes-encerrada', 'sessoes encerradas por quem administra')");

  sessoesAntes = await lerSessoes();
  definersAntes = await contarDefiners();
  await db.exec(sql(ARQUIVO_049));
}, 180_000);

afterAll(async () => { await db.close(); });

describe("A migração 049 sobre um banco que já tem sessões", () => {
  it("não toca em sessão nenhuma", async () => {
    expect(await lerSessoes()).toEqual(sessoesAntes);
  });

  it("é idempotente: rodar o texto de novo não falha nem muda nada", async () => {
    await db.exec(sql(ARQUIVO_049));
    expect(await lerSessoes()).toEqual(sessoesAntes);
    expect(await contarDefiners()).toBe(definersAntes);
  });
});

describe("A trava e as permissões", () => {
  it("o número de funções SECURITY DEFINER não mudou", async () => {
    expect(await contarDefiners()).toBe(definersAntes);
  });

  it("travar_sessoes_do_usuario não é privilegiada, fixa o search_path e só o papel de aplicação a executa", async () => {
    const f = await db.query<{ prosecdef: boolean; config: string[] | null }>(
      "SELECT prosecdef, proconfig AS config FROM pg_proc WHERE proname = 'travar_sessoes_do_usuario'",
    );
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]!.prosecdef).toBe(false);
    expect((f.rows[0]!.config ?? []).join(";")).toMatch(/search_path=/);
    const pode = async (papel: string) => (await db.query<{ pode: boolean }>(
      `SELECT has_function_privilege('${papel}', 'travar_sessoes_do_usuario(uuid)', 'EXECUTE') AS pode`,
    )).rows[0]!.pode;
    expect(await pode("dc360_app")).toBe(true);
    expect(await pode("public")).toBe(false);
    expect(await pode("dc360_console")).toBe(false);
  });

  it("as quatro funções recriadas continuam executáveis só pelo papel de aplicação", async () => {
    for (const assinatura of [
      "abrir_sessao(uuid,uuid,text,interval,text,text,uuid)",
      "revogar_sessoes_do_usuario(uuid,text)",
      "trocar_senha(uuid,text,uuid)",
      "consumir_recuperacao(text,text)",
    ]) {
      const r = await db.query<{ app: boolean; publico: boolean; definer: boolean }>(
        `SELECT has_function_privilege('dc360_app', '${assinatura}', 'EXECUTE') AS app,
                has_function_privilege('public', '${assinatura}', 'EXECUTE') AS publico,
                (SELECT prosecdef FROM pg_proc WHERE oid = '${assinatura}'::regprocedure) AS definer`,
      );
      expect(r.rows[0], assinatura).toEqual({ app: true, publico: false, definer: true });
    }
  });

  it("cada encerramento em massa do banco toma a MESMA trava da renovação, e ela some no COMMIT", async () => {
    // A chave que a renovação toma (pela função de trava, como a API chama).
    const chave = await db.transaction(async (tx) => {
      await tx.query("SELECT travar_sessoes_do_usuario($1)", [usuario]);
      return travasSeguras(tx);
    });
    expect(chave).toHaveLength(1);
    expect(await travasSeguras(db), "a trava sobreviveu ao fim da transação").toEqual([]);

    await db.query(
      `INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
       VALUES ($1, $2, 'link-da-prova', now() + interval '1 hour')`, [org, usuario],
    );
    const encerramentos: [string, string, unknown[]][] = [
      ["revogar_sessoes_do_usuario", "SELECT revogar_sessoes_do_usuario($1, 'reuso de token de renovacao')", [usuario]],
      ["trocar_senha", "SELECT trocar_senha($1, 'hash-novo', NULL)", [usuario]],
      ["consumir_recuperacao", "SELECT * FROM consumir_recuperacao('link-da-prova', 'hash-do-link')", []],
    ];
    for (const [nome, consulta, valores] of encerramentos) {
      const seguras = await db.transaction(async (tx) => {
        await tx.query(consulta, valores);
        return travasSeguras(tx);
      });
      expect(seguras, `${nome} não toma a trava da renovação`).toEqual(chave);
      expect(await travasSeguras(db), `${nome}: a trava sobreviveu ao COMMIT`).toEqual([]);
    }

    // A trava é por pessoa: a de outra pessoa é outra chave.
    const deOutro = await db.transaction(async (tx) => {
      await tx.query("SELECT travar_sessoes_do_usuario($1)", [outro]);
      return travasSeguras(tx);
    });
    expect(deOutro).toHaveLength(1);
    expect(deOutro).not.toEqual(chave);
  });
});

describe("abrir_sessao recusa herdar família encerrada", () => {
  it("a família só rotacionada (a renovação no mesmo instante) é herdada", async () => {
    const raiz = await abrir("cadeia-viva-raiz");
    await db.query("SELECT revogar_sessao('cadeia-viva-raiz', 'rotacionada na renovacao')");
    const filha = await abrir("cadeia-viva-filha", raiz);
    const r = await db.query<{ familia_id: string }>("SELECT familia_id FROM sessoes WHERE id = $1", [filha]);
    expect(r.rows[0]!.familia_id).toBe(raiz);
  });

  it("a família encerrada por qualquer outro motivo é recusada com a mesma mensagem da família que não existe, e nada é gravado", async () => {
    const inexistente = await recusa(
      "SELECT abrir_sessao($1,$2,'invasora-0', interval '1 day', NULL, NULL, $3)",
      [org, usuario, "99999999-9999-4999-8999-999999999999"],
    );
    expect(inexistente.code).toBe("DC369");

    for (const motivo of [
      "sessoes encerradas por quem administra",
      "encerradas pelo proprio usuario",
      "saida do usuario",
      "reuso de token de renovacao",
      "senha trocada pelo proprio usuario",
      "usuario desativado",
      "acesso suspenso pelo fornecedor",
    ]) {
      const hash = `encerrada-${motivo.replace(/\s+/g, "-")}`;
      const raiz = await abrir(`${hash}-raiz`);
      await db.query("SELECT revogar_sessao($1, 'rotacionada na renovacao')", [`${hash}-raiz`]);
      const viva = await abrir(`${hash}-viva`, raiz);
      await db.query("UPDATE sessoes SET revogada_em = now(), motivo_revogacao = $2 WHERE id = $1", [viva, motivo]);

      const e = await recusa(
        "SELECT abrir_sessao($1,$2,$3, interval '1 day', NULL, NULL, $4)", [org, usuario, `${hash}-ressuscitada`, raiz],
      );
      expect(e.code, motivo).toBe("DC369");
      expect(e.message, motivo).toBe(inexistente.message);
    }
    const gravadas = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM sessoes WHERE token_hash LIKE '%ressuscitada' OR token_hash LIKE 'invasora-%'",
    );
    expect(gravadas.rows[0]!.n).toBe(0);
  });

  it("login (sem família) continua abrindo família nova, mesmo com cadeias encerradas da pessoa", async () => {
    const id = await abrir("login-depois-de-tudo");
    const r = await db.query<{ familia_id: string }>("SELECT familia_id FROM sessoes WHERE id = $1", [id]);
    expect(r.rows[0]!.familia_id).toBe(id);
  });
});
