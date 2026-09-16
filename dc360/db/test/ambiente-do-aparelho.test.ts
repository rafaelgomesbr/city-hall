/**
 * A COLUNA `aparelhos.ambiente` (migração 044): com qual APNs cada aparelho
 * fala.
 *
 * Três coisas que só o banco pode garantir, e que este arquivo cobra:
 *
 *   1. Linha nova sem o campo nasce `producao`, que é o ambiente do binário
 *      de loja e o padrão de `APNS_AMBIENTE`.
 *   2. Valor fora dos dois é recusado pelo CHECK. `sandbox` é como a Apple
 *      chama, e é a palavra que alguém vai tentar: cair num padrão calado
 *      mandaria a ficha para a APNs errada, que responde `BadDeviceToken`, e
 *      o varredor revogaria o aparelho de quem está em campo.
 *   3. As linhas que JÁ EXISTIAM quando a coluna nasceu recebem o
 *      `APNS_AMBIENTE` que o aplicador pôs na sessão (`db/src/cli.ts`), e
 *      `producao` quando ninguém pôs nada.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaDeMigracoes = join(aqui, "..", "migrations");
const arquivos = readdirSync(pastaDeMigracoes).filter((f) => f.endsWith(".sql")).sort();
const ler = (f: string) => readFileSync(join(pastaDeMigracoes, f), "utf8");
const antesDa044 = arquivos.filter((f) => f < "044_");
const daQuatroEQuatroEmDiante = arquivos.filter((f) => f >= "044_");

async function semear(db: PGlite): Promise<{ org: string; usuario: string }> {
  const org = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const usuario = await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
     VALUES ($1,'Diego','SA-3','diego@serraalta.exemplo.gov.br','agente_campo') RETURNING id`,
    [org.rows[0]!.id],
  );
  return { org: org.rows[0]!.id, usuario: usuario.rows[0]!.id };
}

describe("com a 044 aplicada", () => {
  let db: PGlite;
  let org = "";
  let usuario = "";

  beforeAll(async () => {
    db = new PGlite();
    for (const f of arquivos) await db.exec(ler(f));
    ({ org, usuario } = await semear(db));
  }, 120_000);

  afterAll(async () => { await db.close(); });

  it("linha nova sem o campo nasce em producao", async () => {
    const r = await db.query<{ ambiente: string }>(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
       VALUES ($1,$2,'ios','ficha-sem-campo') RETURNING ambiente`,
      [org, usuario],
    );
    expect(r.rows[0]!.ambiente).toBe("producao");
  });

  it("aceita teste, e recusa sandbox (a palavra da Apple) em vez de cair no padrão", async () => {
    const teste = await db.query<{ ambiente: string }>(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha, ambiente)
       VALUES ($1,$2,'ios','ficha-do-xcode','teste') RETURNING ambiente`,
      [org, usuario],
    );
    expect(teste.rows[0]!.ambiente).toBe("teste");

    await expect(db.query(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha, ambiente)
       VALUES ($1,$2,'ios','ficha-sandbox','sandbox')`,
      [org, usuario],
    )).rejects.toThrow(/aparelhos_ambiente_check/);
  });
});

describe("as linhas que já existiam quando a coluna nasceu", () => {
  it("recebem o APNS_AMBIENTE posto na sessão pelo aplicador", async () => {
    const db = new PGlite();
    try {
      for (const f of antesDa044) await db.exec(ler(f));
      const { org, usuario } = await semear(db);
      await db.query(
        `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
         VALUES ($1,$2,'ios','ficha-do-piloto')`,
        [org, usuario],
      );

      // O que `db/src/cli.ts` faz com APNS_AMBIENTE=teste antes de aplicar.
      await db.exec("SET dc360.apns_ambiente = 'teste'");
      for (const f of daQuatroEQuatroEmDiante) await db.exec(ler(f));

      const r = await db.query<{ ambiente: string }>(
        "SELECT ambiente FROM aparelhos WHERE ficha = 'ficha-do-piloto'",
      );
      expect(r.rows[0]!.ambiente).toBe("teste");
    } finally {
      await db.close();
    }
  }, 120_000);

  it("e producao quando ninguém pôs nada, que é o padrão da própria variável", async () => {
    const db = new PGlite();
    try {
      for (const f of antesDa044) await db.exec(ler(f));
      const { org, usuario } = await semear(db);
      await db.query(
        `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
         VALUES ($1,$2,'ios','ficha-da-loja')`,
        [org, usuario],
      );
      for (const f of daQuatroEQuatroEmDiante) await db.exec(ler(f));

      const r = await db.query<{ ambiente: string }>(
        "SELECT ambiente FROM aparelhos WHERE ficha = 'ficha-da-loja'",
      );
      expect(r.rows[0]!.ambiente).toBe("producao");
    } finally {
      await db.close();
    }
  }, 120_000);
});
