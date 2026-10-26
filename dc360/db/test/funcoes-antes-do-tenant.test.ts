/**
 * As três funções privilegiadas que até a parte 0D não tinham prova direta
 * (V2-F03-E08, parte 0D, item 8 da auditoria de cobertura da parte 0B):
 * `dono_do_token`, `abrir_recuperacao` e `interesse_recente`.
 *
 * O catálogo da parte 0B as declarava com `semProva`: eram exercitadas só por
 * dentro de rotas da API, e uma regressão no filtro de token, de e-mail ou de
 * prazo passaria pelo portão de isolamento com o catálogo em dia. Aqui cada
 * uma é chamada pelo nome, como o papel de aplicação a chama, com entrada
 * válida, entrada desconhecida e contas de municípios diferentes, e o que ela
 * devolve E o que ela escreve são conferidos pelo dono das tabelas.
 *
 * As três rodam ANTES de existir município no contexto (login, renovação,
 * formulário público): a chave apresentada (hash do token, e-mail) é o único
 * caminho até a conta, e o contexto de município, quando existe, não muda o
 * que elas respondem.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const pasta = join(aqui, "..", "migrations");

let db: PGlite;
let orgA: string;
let orgB: string;
let anaDeA: string;
let brunoDeB: string;
let celiaInativaDeB: string;

/** Como a API chama: papel de aplicação, com ou sem município no contexto. */
async function comoApp(
  org: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    if (org) await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [org]);
    return (await tx.query<Record<string, unknown>>(sql, params)).rows;
  });
}

async function usuario(org: string, nome: string, email: string, ativo = true): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, ativo)
     VALUES ($1, $2, $3, $4, 'operador', $5) RETURNING id`,
    [org, nome, `M-${email}`, email, ativo],
  );
  return r.rows[0]!.id;
}

beforeAll(async () => {
  db = new PGlite();
  for (const f of readdirSync(pasta)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(pasta, f), "utf8"));
  }
  const org = async (nome: string) =>
    (
      await db.query<{ id: string }>(
        "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1, $1, 'MG') RETURNING id",
        [nome],
      )
    ).rows[0]!.id;
  orgA = await org("Serra Alta");
  orgB = await org("Vale Fundo");
  anaDeA = await usuario(orgA, "Ana de Teste", "ana@serra-alta.exemplo.gov.br");
  brunoDeB = await usuario(orgB, "Bruno de Teste", "bruno@vale-fundo.exemplo.gov.br");
  celiaInativaDeB = await usuario(orgB, "Célia de Teste", "celia@vale-fundo.exemplo.gov.br", false);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("dono_do_token: de quem era um token, pelo hash, e só dele", () => {
  beforeAll(async () => {
    await db.query(
      `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em)
       VALUES ($1, $2, 'hash-da-ana', now() + interval '1 day')`,
      [orgA, anaDeA],
    );
    await db.query(
      `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em, revogada_em, motivo_revogacao)
       VALUES ($1, $2, 'hash-do-bruno', now() - interval '1 hour', now(), 'reuso')`,
      [orgB, brunoDeB],
    );
    await db.query(
      `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em)
       VALUES ($1, $2, 'hash-da-celia', now() + interval '1 day')`,
      [orgB, celiaInativaDeB],
    );
  });

  it("token válido devolve o dono, viva a sessão, e a conta ativa", async () => {
    const r = await comoApp(null, "SELECT * FROM dono_do_token($1)", ["hash-da-ana"]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      usuario_id: anaDeA,
      revogada_em: null,
      motivo_revogacao: null,
      usuario_ativo: true,
    });
  });

  it("token revogado de outro município devolve o dono dele e o motivo, e não o de quem pergunta", async () => {
    for (const ctx of [null, orgA]) {
      const r = await comoApp(ctx, "SELECT * FROM dono_do_token($1)", ["hash-do-bruno"]);
      expect(r).toHaveLength(1);
      expect(r[0]!.usuario_id).toBe(brunoDeB);
      expect(r[0]!.motivo_revogacao).toBe("reuso");
      expect(r[0]!.revogada_em).not.toBeNull();
    }
  });

  it("conta desativada aparece como desativada", async () => {
    const r = await comoApp(null, "SELECT * FROM dono_do_token($1)", ["hash-da-celia"]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ usuario_id: celiaInativaDeB, usuario_ativo: false });
  });

  it("token desconhecido, vazio ou parecido não devolve linha", async () => {
    for (const hash of ["hash-que-ninguem-tem", "", "hash-da-ana ", "HASH-DA-ANA", "hash-da-%"]) {
      expect(await comoApp(null, "SELECT * FROM dono_do_token($1)", [hash]), hash).toEqual([]);
    }
  });

  it("devolve só o que a renovação decide: nada de e-mail, nome, município ou hash", async () => {
    const r = await comoApp(null, "SELECT * FROM dono_do_token($1)", ["hash-da-ana"]);
    expect(Object.keys(r[0]!).sort()).toEqual(
      ["expira_em", "motivo_revogacao", "revogada_em", "usuario_ativo", "usuario_id"].sort(),
    );
  });
});

describe("abrir_recuperacao: a recuperação nasce presa à conta e ao município do e-mail", () => {
  const recuperacoes = async (usuarioId: string) =>
    (
      await db.query<{
        organizacao_id: string;
        token_hash: string;
        usada: boolean;
        ip: string | null;
      }>(
        `SELECT organizacao_id, token_hash, usada_em IS NOT NULL AS usada, host(ip) AS ip
           FROM recuperacoes_senha WHERE usuario_id = $1 ORDER BY criada_em, token_hash`,
        [usuarioId],
      )
    ).rows;

  it("e-mail de conta ativa, em qualquer caixa: devolve a conta e grava a recuperação no município DELA", async () => {
    const r = await comoApp(null, "SELECT * FROM abrir_recuperacao($1, $2, $3::interval, $4)", [
      "BRUNO@Vale-Fundo.exemplo.gov.br",
      "rec-bruno-1",
      "1 hour",
      "203.0.113.9",
    ]);
    expect(r).toEqual([
      { usuario_id: brunoDeB, nome: "Bruno de Teste", email: "bruno@vale-fundo.exemplo.gov.br" },
    ]);
    expect(await recuperacoes(brunoDeB)).toEqual([
      { organizacao_id: orgB, token_hash: "rec-bruno-1", usada: false, ip: "203.0.113.9" },
    ]);
  });

  it("o contexto de outro município não muda a conta achada nem o município da recuperação", async () => {
    const r = await comoApp(orgA, "SELECT * FROM abrir_recuperacao($1, $2, $3::interval, $4)", [
      "bruno@vale-fundo.exemplo.gov.br",
      "rec-bruno-2",
      "1 hour",
      "",
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.usuario_id).toBe(brunoDeB);
    const lista = await recuperacoes(brunoDeB);
    expect(lista.map((l) => l.organizacao_id)).toEqual([orgB, orgB]);
  });

  it("abrir de novo invalida a anterior da MESMA conta, e não a de outra conta", async () => {
    await comoApp(null, "SELECT * FROM abrir_recuperacao($1, $2, $3::interval, $4)", [
      "ana@serra-alta.exemplo.gov.br",
      "rec-ana-1",
      "1 hour",
      "",
    ]);
    const bruno = await recuperacoes(brunoDeB);
    expect(bruno.find((l) => l.token_hash === "rec-bruno-1")!.usada, "a primeira do Bruno").toBe(
      true,
    );
    expect(
      bruno.find((l) => l.token_hash === "rec-bruno-2")!.usada,
      "a da Ana não gasta a do Bruno",
    ).toBe(false);
    expect((await recuperacoes(anaDeA)).map((l) => [l.organizacao_id, l.usada])).toEqual([
      [orgA, false],
    ]);
  });

  it("e-mail desconhecido, parecido ou de conta desativada não devolve linha e não grava nada", async () => {
    const antes = (
      await db.query<{ n: number }>("SELECT count(*)::int AS n FROM recuperacoes_senha")
    ).rows[0]!.n;
    for (const email of [
      "ninguem@exemplo.gov.br",
      "celia@vale-fundo.exemplo.gov.br",
      "%@vale-fundo.exemplo.gov.br",
      "bruno@vale-fundo.exemplo.gov.br ",
      "",
    ]) {
      const r = await comoApp(null, "SELECT * FROM abrir_recuperacao($1, $2, $3::interval, $4)", [
        email,
        `rec-${email}`,
        "1 hour",
        "",
      ]);
      expect(r, email).toEqual([]);
    }
    const depois = (
      await db.query<{ n: number }>("SELECT count(*)::int AS n FROM recuperacoes_senha")
    ).rows[0]!.n;
    expect(depois).toBe(antes);
    expect((await recuperacoes(celiaInativaDeB)).length).toBe(0);
  });
});

describe("interesse_recente: um booleano sobre o mesmo e-mail nas últimas seis horas, e nada mais", () => {
  beforeAll(async () => {
    await db.query(
      `INSERT INTO interesse_municipio (nome, email, municipio, uf, recebido_em) VALUES
         ('Fulana de Teste', 'fulana@exemplo.gov.br', 'Serra Alta', 'MG', now() - interval '1 hour'),
         ('Sicrano de Teste', 'sicrano@exemplo.gov.br', 'Vale Fundo', 'MG', now() - interval '7 hours')`,
    );
  });

  it("o mesmo e-mail, em qualquer caixa, dentro de seis horas: verdadeiro", async () => {
    for (const email of ["fulana@exemplo.gov.br", "FULANA@Exemplo.gov.br"]) {
      expect(await comoApp(null, "SELECT interesse_recente($1) AS r", [email]), email).toEqual([
        { r: true },
      ]);
    }
  });

  it("pedido de mais de seis horas, e-mail desconhecido ou parecido: falso", async () => {
    for (const email of [
      "sicrano@exemplo.gov.br",
      "ninguem@exemplo.gov.br",
      "%@exemplo.gov.br",
      "fulana@exemplo.gov",
      "",
    ]) {
      expect(await comoApp(null, "SELECT interesse_recente($1) AS r", [email]), email).toEqual([
        { r: false },
      ]);
    }
  });

  it("o contexto de um município não muda a resposta, e o papel de aplicação continua sem ler a tabela", async () => {
    expect(
      await comoApp(orgA, "SELECT interesse_recente($1) AS r", ["fulana@exemplo.gov.br"]),
    ).toEqual([{ r: true }]);
    await expect(comoApp(orgA, "SELECT count(*) FROM interesse_municipio")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("quem não é o papel de aplicação não chama nenhuma das três", () => {
  it("o papel do console recebe permissão negada", async () => {
    for (const chamada of [
      "SELECT * FROM dono_do_token('hash-da-ana')",
      "SELECT * FROM abrir_recuperacao('ana@serra-alta.exemplo.gov.br', 'x', '1 hour', '')",
      "SELECT interesse_recente('fulana@exemplo.gov.br')",
    ]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE dc360_console");
          await tx.query(chamada);
        }),
        chamada,
      ).rejects.toThrow(/permission denied/);
    }
  });
});
