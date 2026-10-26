/**
 * A MIGRAÇÃO 053: o domínio de papel no banco e o papel `usuario_orgao`
 * (V2-F03-E04).
 *
 * Quatro colunas guardavam papel em CHECKs soltos. A 053 cria três domínios
 * (`papel_de_conta`, `papel_de_autor_administrativo`, `tipo_de_ator`), troca o
 * tipo das quatro colunas, acrescenta a origem `portal` à trilha de eventos e
 * põe o gatilho que impede `usuario_orgao` de virar servidor ou o contrário.
 *
 * O QUE SE PROVA
 *  - dado que já existia não viola nada: com a base na 052 e linhas nas quatro
 *    tabelas, a 053 aplica sem erro e as linhas ficam idênticas;
 *  - positivos: `usuario_orgao` grava nas quatro colunas, `portal` grava como
 *    origem, `operador_da_plataforma` continua aceito SÓ na trilha
 *    administrativa;
 *  - negativos: papel inventado recusado nas quatro colunas (23514, pelo nome do
 *    domínio) e origem inventada recusada;
 *  - o gatilho: servidor para `usuario_orgao` e o contrário recusados, também
 *    pelo papel de aplicação; troca entre papéis de servidor e edição que não
 *    muda o papel passam;
 *  - o isolamento não mexeu: RLS ativada e forçada nas quatro tabelas, as
 *    trilhas seguem sem UPDATE e DELETE para a aplicação, o privilégio de
 *    UPDATE por coluna de `usuarios.papel` continua, e nenhuma função
 *    SECURITY DEFINER foi criada;
 *  - a volta (`desfazer/053`): aplicar, desfazer e reaplicar deixa colunas,
 *    constraints, domínios, ACL de coluna e funções idênticos, e a volta RECUSA
 *    quando já existe dado que os CHECKs antigos não aceitam.
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

const ARQUIVO_053 = "053_dominio_de_papel_e_usuario_orgao.sql";
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

/** As migrações até a 053 inclusive: as que vierem depois (054 em diante) não entram nesta prova. */
function ate053() {
  const todas = carregarMigracoes();
  const i = todas.findIndex((m) => m.versao === ARQUIVO_053);
  expect(i).toBeGreaterThan(0);
  return { todas, ateAqui: todas.slice(0, i + 1), antes: todas.slice(0, i) };
}

async function comoApp<T>(db: PGlite, org: string, fn: (tx: PGlite) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [org]);
    return fn(tx as unknown as PGlite);
  }) as Promise<T>;
}

async function erroDe(
  p: Promise<unknown>,
): Promise<{ code?: string; constraint?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; constraint?: string; message: string };
  }
  throw new Error("deveria ter sido recusado");
}

async function fotografia(bd: ExecutorSql): Promise<Record<string, unknown[]>> {
  const consulta = async (sql: string) => (await bd.query(sql)).rows;
  return {
    colunas: await consulta(`
      SELECT table_name, column_name, data_type, is_nullable, column_default, domain_name
        FROM information_schema.columns WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`),
    constraints: await consulta(`
      SELECT conrelid::regclass::text AS tabela, conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND contype = 'c' AND conrelid <> 0
       ORDER BY 1, 2`),
    dominios: await consulta(`
      SELECT t.typname, pg_get_constraintdef(c.oid) AS def
        FROM pg_type t LEFT JOIN pg_constraint c ON c.contypid = t.oid
       WHERE t.typtype = 'd' AND t.typnamespace = 'public'::regnamespace
       ORDER BY 1, 2`),
    gatilhos: await consulta(`
      SELECT tgrelid::regclass::text AS tabela, tgname, tgenabled
        FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2`),
    funcoes: await consulta(`
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY p.proname, args`),
    acl_de_coluna: await consulta(`
      SELECT attrelid::regclass::text AS tabela, attname, attacl::text AS acl
        FROM pg_attribute
       WHERE attrelid IN ('usuarios'::regclass, 'trilha_eventos'::regclass,
                          'trilha_administrativa'::regclass, 'ocorrencia_consultas'::regclass)
         AND attnum > 0 AND NOT attisdropped
       ORDER BY 1, 2`),
    rls: await consulta(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`),
    politicas: await consulta(`
      SELECT tablename, policyname, cmd, roles::text AS papeis, qual, with_check
        FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`),
  };
}

const QUATRO = [
  { tabela: "usuarios", coluna: "papel", dominio: "papel_de_conta" },
  { tabela: "trilha_eventos", coluna: "autor_papel", dominio: "papel_de_conta" },
  { tabela: "ocorrencia_consultas", coluna: "usuario_papel", dominio: "papel_de_conta" },
  {
    tabela: "trilha_administrativa",
    coluna: "autor_papel",
    dominio: "papel_de_autor_administrativo",
  },
] as const;

/** Linha de cada uma das quatro tabelas, com o papel e a origem dados. */
async function contaDeUsuario(db: PGlite, org: string, papel: string, n: string) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1, 'Pessoa ' || $2, 'M-' || $2, $2 || '@exemplo.gov.br', $3, 'x') RETURNING id`,
    [org, n, papel],
  );
  return r.rows[0]!.id;
}

async function ocorrenciaDe(db: PGlite, org: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM ocorrencias WHERE organizacao_id = $1 ORDER BY id LIMIT 1",
    [org],
  );
  return r.rows[0]!.id;
}

function inserirEvento(db: PGlite, org: string, ocorrencia: string, papel: string, origem: string) {
  return db.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_nome, autor_papel, origem, ocorrido_em)
     VALUES ($1, $2, 'prova_053', 'Quem Fez', $3, $4, now())`,
    [org, ocorrencia, papel, origem],
  );
}

function inserirAto(db: PGlite, org: string, papel: string) {
  return db.query(
    `INSERT INTO trilha_administrativa
       (organizacao_id, autor_nome, autor_papel, acao, alvo_tipo, alvo_nome)
     VALUES ($1, 'Quem Fez', $2, 'prova_053', 'usuario', 'Alvo')`,
    [org, papel],
  );
}

function inserirConsulta(db: PGlite, org: string, ocorrencia: string, papel: string) {
  return db.query(
    `INSERT INTO ocorrencia_consultas
       (organizacao_id, ocorrencia_id, usuario_nome, usuario_papel, recurso, finalidade)
     VALUES ($1, $2, 'Quem Viu', $3, 'ocorrencia_detalhe', 'atendimento')`,
    [org, ocorrencia, papel],
  );
}

describe("a 053 sobre dado que já existia", () => {
  let db: PGlite;
  let antes: Array<{ tabela: string; linhas: unknown[] }> = [];

  const lerTudo = async () => {
    const saida: Array<{ tabela: string; linhas: unknown[] }> = [];
    for (const q of QUATRO) {
      const r = await db.query(`SELECT * FROM ${q.tabela} ORDER BY id`);
      saida.push({ tabela: q.tabela, linhas: r.rows });
    }
    return saida;
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    const { antes: ateA052 } = ate053();
    await aplicarMigracoes(executorDe(db), ateA052);
    await db.exec(carregarSemente());
    const oc = await ocorrenciaDe(db, ORG_A);
    for (const papel of ["coordenador", "operador", "agente_campo", "administrador"]) {
      await inserirEvento(db, ORG_A, oc, papel, papel === "agente_campo" ? "campo" : "escritorio");
      await inserirConsulta(db, ORG_A, oc, papel);
      await inserirAto(db, ORG_A, papel);
    }
    await inserirAto(db, ORG_B, "operador_da_plataforma");
    antes = await lerTudo();
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  it("antes: as quatro colunas são text com CHECK solto, e nenhum domínio de papel existe", async () => {
    const t = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_type WHERE typtype = 'd' AND typname IN ('papel_de_conta','papel_de_autor_administrativo','tipo_de_ator')",
    );
    expect(t.rows[0]!.n).toBe(0);
    for (const q of QUATRO) {
      const c = await db.query<{ domain_name: string | null }>(
        "SELECT domain_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
        [q.tabela, q.coluna],
      );
      expect(c.rows[0]!.domain_name, `${q.tabela}.${q.coluna}`).toBeNull();
    }
  });

  it("aplica sem erro, e as linhas das quatro tabelas ficam IDÊNTICAS", async () => {
    expect(antes.every((t) => t.linhas.length > 0)).toBe(true);
    const { ateAqui } = ate053();
    const r = await aplicarMigracoes(executorDe(db), ateAqui);
    expect(r.aplicadas).toEqual([ARQUIVO_053]);
    expect(await lerTudo()).toEqual(antes);
  });

  it("depois: cada coluna tem o seu domínio, continua NOT NULL, e os cinco CHECKs soltos sumiram", async () => {
    for (const q of QUATRO) {
      const c = await db.query<{ domain_name: string; is_nullable: string }>(
        "SELECT domain_name, is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
        [q.tabela, q.coluna],
      );
      expect(c.rows[0], `${q.tabela}.${q.coluna}`).toEqual({
        domain_name: q.dominio,
        is_nullable: "NO",
      });
    }
    const soltos = await db.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE conname IN ('usuarios_papel_check','trilha_eventos_autor_papel_check',
                          'ocorrencia_consultas_usuario_papel_check',
                          'trilha_administrativa_autor_papel_check')`,
    );
    expect(soltos.rows).toEqual([]);
  });
});

describe("a 053, com a base inteira", () => {
  let db: PGlite;
  let ocA: string;

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    await aplicarMigracoes(executorDe(db), ate053().ateAqui);
    await db.exec(carregarSemente());
    ocA = await ocorrenciaDe(db, ORG_A);
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  it("os três domínios existem com a lista certa", async () => {
    const r = await db.query<{ typname: string; def: string }>(
      `SELECT t.typname, pg_get_constraintdef(c.oid) AS def
         FROM pg_type t JOIN pg_constraint c ON c.contypid = t.oid
        WHERE t.typtype = 'd' AND t.typnamespace = 'public'::regnamespace ORDER BY 1`,
    );
    const por = Object.fromEntries(r.rows.map((l) => [l.typname, l.def]));
    expect(Object.keys(por).sort()).toEqual([
      "papel_de_autor_administrativo",
      "papel_de_conta",
      "tipo_de_ator",
    ]);
    for (const p of ["coordenador", "operador", "agente_campo", "administrador", "usuario_orgao"]) {
      expect(por["papel_de_conta"], p).toContain(`'${p}'`);
      expect(por["papel_de_autor_administrativo"], p).toContain(`'${p}'`);
    }
    expect(por["papel_de_conta"]).not.toContain("operador_da_plataforma");
    expect(por["papel_de_autor_administrativo"]).toContain("operador_da_plataforma");
    for (const t of ["servidor", "usuario_orgao", "sistema"]) {
      expect(por["tipo_de_ator"], t).toContain(`'${t}'`);
    }
  });

  describe("positivos: o que o domínio aceita", () => {
    it("usuario_orgao grava como papel da conta", async () => {
      const id = await contaDeUsuario(db, ORG_A, "usuario_orgao", "po1");
      const r = await db.query<{ papel: string }>("SELECT papel FROM usuarios WHERE id = $1", [id]);
      expect(r.rows[0]!.papel).toBe("usuario_orgao");
    });

    it("usuario_orgao grava como autor na trilha de eventos, na trilha administrativa e no registro de consulta", async () => {
      await inserirEvento(db, ORG_A, ocA, "usuario_orgao", "escritorio");
      await inserirAto(db, ORG_A, "usuario_orgao");
      await inserirConsulta(db, ORG_A, ocA, "usuario_orgao");
    });

    it("a origem `portal` grava na trilha de eventos (e `campo` e `escritorio` continuam)", async () => {
      await inserirEvento(db, ORG_A, ocA, "coordenador", "portal");
      await inserirEvento(db, ORG_A, ocA, "agente_campo", "campo");
      await inserirEvento(db, ORG_A, ocA, "operador", "escritorio");
    });

    it("pela aplicação (papel dc360_app, com o município no contexto), a trilha aceita o autor usuario_orgao e a origem portal", async () => {
      await comoApp(db, ORG_A, async (tx) => {
        await inserirEvento(tx, ORG_A, ocA, "usuario_orgao", "portal");
      });
    });

    it("operador_da_plataforma continua aceito na trilha administrativa", async () => {
      await inserirAto(db, ORG_A, "operador_da_plataforma");
    });
  });

  describe("negativos: o que o domínio recusa", () => {
    it.each(QUATRO)(
      "papel inventado recusado em $tabela / $coluna (23514, pelo domínio)",
      async (q) => {
        const oc = ocA;
        const tentativa =
          q.tabela === "usuarios"
            ? contaDeUsuario(db, ORG_A, "papel_inventado", "neg1")
            : q.tabela === "trilha_eventos"
              ? inserirEvento(db, ORG_A, oc, "papel_inventado", "escritorio")
              : q.tabela === "trilha_administrativa"
                ? inserirAto(db, ORG_A, "papel_inventado")
                : inserirConsulta(db, ORG_A, oc, "papel_inventado");
        const erro = await erroDe(tentativa);
        expect(erro.code).toBe("23514");
        expect(erro.message).toContain(q.dominio);
      },
    );

    it("operador_da_plataforma NÃO é papel de conta: recusado em usuarios, na trilha de eventos e no registro de consulta", async () => {
      expect((await erroDe(contaDeUsuario(db, ORG_A, "operador_da_plataforma", "neg2"))).code).toBe(
        "23514",
      );
      expect(
        (await erroDe(inserirEvento(db, ORG_A, ocA, "operador_da_plataforma", "escritorio"))).code,
      ).toBe("23514");
      expect((await erroDe(inserirConsulta(db, ORG_A, ocA, "operador_da_plataforma"))).code).toBe(
        "23514",
      );
    });

    it("origem inventada recusada na trilha de eventos", async () => {
      const erro = await erroDe(inserirEvento(db, ORG_A, ocA, "coordenador", "satelite"));
      expect(erro.code).toBe("23514");
      expect(erro.constraint).toBe("trilha_eventos_origem_check");
    });

    it("papel nulo continua recusado (NOT NULL)", async () => {
      const erro = await erroDe(
        db.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
           VALUES ($1, 'Sem Papel', 'M-nulo', 'nulo@exemplo.gov.br', NULL, 'x')`,
          [ORG_A],
        ),
      );
      expect(erro.code).toBe("23502");
    });
  });

  describe("o gatilho: usuario_orgao e servidor não se convertem", () => {
    let servidor: string;
    let orgao: string;

    beforeAll(async () => {
      servidor = await contaDeUsuario(db, ORG_A, "operador", "g1");
      orgao = await contaDeUsuario(db, ORG_A, "usuario_orgao", "g2");
    });

    const trocar = (db2: PGlite, id: string, papel: string) =>
      db2.query("UPDATE usuarios SET papel = $2 WHERE id = $1", [id, papel]);

    it("servidor para usuario_orgao: recusado, e o papel não muda", async () => {
      const erro = await erroDe(trocar(db, servidor, "usuario_orgao"));
      expect(erro.code).toBe("23514");
      expect(erro.constraint).toBe("papel_nao_se_converte");
      const r = await db.query<{ papel: string }>("SELECT papel FROM usuarios WHERE id = $1", [
        servidor,
      ]);
      expect(r.rows[0]!.papel).toBe("operador");
    });

    it.each(["coordenador", "operador", "agente_campo", "administrador"])(
      "usuario_orgao para %s: recusado, e o papel não muda",
      async (papel) => {
        const erro = await erroDe(trocar(db, orgao, papel));
        expect(erro.code).toBe("23514");
        expect(erro.constraint).toBe("papel_nao_se_converte");
        const r = await db.query<{ papel: string }>("SELECT papel FROM usuarios WHERE id = $1", [
          orgao,
        ]);
        expect(r.rows[0]!.papel).toBe("usuario_orgao");
      },
    );

    it("a recusa vale também pelo papel de aplicação, com o município no contexto", async () => {
      const e1 = await erroDe(comoApp(db, ORG_A, (tx) => trocar(tx, servidor, "usuario_orgao")));
      expect(e1.constraint).toBe("papel_nao_se_converte");
      const e2 = await erroDe(comoApp(db, ORG_A, (tx) => trocar(tx, orgao, "coordenador")));
      expect(e2.constraint).toBe("papel_nao_se_converte");
    });

    it("troca entre papéis de servidor passa (o gatilho não vira trava geral de papel)", async () => {
      await trocar(db, servidor, "coordenador");
      await trocar(db, servidor, "operador");
    });

    it("regravar o mesmo papel e trocar outra coluna passam, nos dois tipos de conta", async () => {
      await trocar(db, orgao, "usuario_orgao");
      await trocar(db, servidor, "operador");
      await db.query("UPDATE usuarios SET nome = 'Outro Nome' WHERE id = ANY($1)", [
        [orgao, servidor],
      ]);
    });
  });

  describe("o isolamento não se mexeu", () => {
    it("RLS ativada e forçada nas quatro tabelas", async () => {
      const r = await db.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname IN ('usuarios','trilha_eventos','trilha_administrativa','ocorrencia_consultas')
            AND relkind = 'r'`,
      );
      expect(r.rows).toHaveLength(4);
      for (const l of r.rows) {
        expect(l, l.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
      }
    });

    it.each(["trilha_eventos", "trilha_administrativa", "ocorrencia_consultas"])(
      "%s segue append-only para a aplicação: sem UPDATE e sem DELETE",
      async (tabela) => {
        const r = await db.query<{ ups: boolean; del: boolean; trunc: boolean }>(
          `SELECT has_table_privilege('dc360_app', $1, 'UPDATE') AS ups,
                  has_table_privilege('dc360_app', $1, 'DELETE') AS del,
                  has_table_privilege('dc360_app', $1, 'TRUNCATE') AS trunc`,
          [tabela],
        );
        expect(r.rows[0]).toEqual({ ups: false, del: false, trunc: false });
        const pol = await db.query<{ cmd: string }>(
          "SELECT cmd FROM pg_policies WHERE tablename = $1 AND cmd IN ('UPDATE','DELETE','ALL')",
          [tabela],
        );
        expect(pol.rows).toEqual([]);
      },
    );

    it("a aplicação continua podendo trocar usuarios.papel (a ACL de coluna não mudou: a fotografia da volta compara)", async () => {
      const r = await db.query<{ coluna: boolean }>(
        "SELECT has_column_privilege('dc360_app', 'usuarios', 'papel', 'UPDATE') AS coluna",
      );
      expect(r.rows[0]).toEqual({ coluna: true });
    });

    it("nenhuma função SECURITY DEFINER nova: o gatilho é SECURITY INVOKER e não tem EXECUTE para a aplicação", async () => {
      const g = await db.query<{ prosecdef: boolean; app: boolean; publico: boolean }>(
        `SELECT prosecdef,
                has_function_privilege('dc360_app', oid, 'EXECUTE') AS app,
                has_function_privilege('public', oid, 'EXECUTE') AS publico
           FROM pg_proc WHERE proname = 'usuarios_papel_nao_se_converte'`,
      );
      expect(g.rows).toHaveLength(1);
      expect(g.rows[0]!.prosecdef).toBe(false);
    });

    it("o gatilho está habilitado de origem", async () => {
      const r = await db.query<{ tgenabled: string }>(
        "SELECT tgenabled FROM pg_trigger WHERE tgname = 'usuarios_papel_nao_se_converte'",
      );
      expect(r.rows).toEqual([{ tgenabled: "O" }]);
    });

    it("conta de usuario_orgao de A fica invisível ao município B (RLS de usuarios)", async () => {
      const id = await contaDeUsuario(db, ORG_A, "usuario_orgao", "iso1");
      const deB = await comoApp(db, ORG_B, (tx) =>
        tx.query("SELECT id FROM usuarios WHERE id = $1", [id]),
      );
      expect(deB.rows).toEqual([]);
      const deA = await comoApp(db, ORG_A, (tx) =>
        tx.query("SELECT id FROM usuarios WHERE id = $1", [id]),
      );
      expect(deA.rows).toHaveLength(1);
    });
  });
});

describe("a volta da 053", () => {
  it("aplicar, desfazer e reaplicar: colunas, constraints, domínios, gatilhos, ACL de coluna, RLS e funções idênticos", async () => {
    const db = new PGlite();
    await db.waitReady;
    const bd = executorDe(db);
    try {
      const { ateAqui, antes: ateA052 } = ate053();
      await aplicarMigracoes(bd, ateA052);
      const antes = await fotografia(bd);

      await aplicarMigracoes(bd, ateAqui);
      const com = await fotografia(bd);
      expect(com).not.toEqual(antes);
      expect(JSON.stringify(com["dominios"])).toContain("papel_de_conta");
      expect(JSON.stringify(com["gatilhos"])).toContain("usuarios_papel_nao_se_converte");
      // O catálogo do portão não ganha entrada: a 053 não cria função
      // SECURITY DEFINER, não abre exceção ao isolamento e não mexe em ACL de coluna.
      const definer = (f: Record<string, unknown>[]) =>
        f.filter((l) => l["prosecdef"] === true).map((l) => `${l["proname"]}(${l["args"]})`);
      expect(definer(com["funcoes"] as Record<string, unknown>[])).toEqual(
        definer(antes["funcoes"] as Record<string, unknown>[]),
      );
      expect(com["acl_de_coluna"]).toEqual(antes["acl_de_coluna"]);
      expect(com["rls"]).toEqual(antes["rls"]);
      expect(com["politicas"]).toEqual(antes["politicas"]);

      const r = await desfazerUltimaMigracao(bd, ateAqui, carregarDesfazeres(), DEV);
      expect(r.desfeita).toBe(ARQUIVO_053);
      expect((await migracoesAplicadas(bd)).map((m) => m.versao)).toHaveLength(ateA052.length);
      expect(await fotografia(bd)).toEqual(antes);
      // Os CHECKs antigos voltaram, com os mesmos nomes e a mesma lista.
      const checks = await bd.query<{ conname: string; def: string }>(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname IN ('usuarios_papel_check','trilha_eventos_autor_papel_check',
                            'ocorrencia_consultas_usuario_papel_check',
                            'trilha_administrativa_autor_papel_check','trilha_eventos_origem_check')`,
      );
      expect(checks.rows).toHaveLength(5);
      expect(JSON.stringify(checks.rows)).not.toContain("usuario_orgao");
      expect(JSON.stringify(checks.rows)).not.toContain("portal");

      await aplicarMigracoes(bd, ateAqui);
      expect(await fotografia(bd)).toEqual(com);
    } finally {
      await db.close();
    }
  }, 240_000);

  it.each([
    [
      "conta usuario_orgao",
      "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash) VALUES ($1,'Pessoa','M-v1','v1@exemplo.gov.br','usuario_orgao','x')",
    ],
    [
      "ato administrativo de usuario_orgao",
      "INSERT INTO trilha_administrativa (organizacao_id, autor_nome, autor_papel, acao, alvo_tipo, alvo_nome) VALUES ($1,'Q','usuario_orgao','a','usuario','A')",
    ],
  ])(
    "a volta RECUSA, sem apagar nada, quando já existe %s",
    async (_nome, insercao) => {
      const db = new PGlite();
      await db.waitReady;
      const bd = executorDe(db);
      try {
        const { ateAqui } = ate053();
        await aplicarMigracoes(bd, ateAqui);
        await db.exec(carregarSemente());
        await db.query(insercao, [ORG_A]);
        const erro = await erroDe(desfazerUltimaMigracao(bd, ateAqui, carregarDesfazeres(), DEV));
        expect(erro.message).toMatch(/usuario_orgao|portal/);
        // Nada foi desfeito: a 053 segue aplicada e o domínio segue de pé.
        expect((await migracoesAplicadas(bd)).at(-1)?.versao).toBe(ARQUIVO_053);
        const d = await db.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_type WHERE typname = 'papel_de_conta'",
        );
        expect(d.rows[0]!.n).toBe(1);
      } finally {
        await db.close();
      }
    },
    240_000,
  );

  it("a volta RECUSA quando já existe evento com origem `portal`", async () => {
    const db = new PGlite();
    await db.waitReady;
    const bd = executorDe(db);
    try {
      const { ateAqui } = ate053();
      await aplicarMigracoes(bd, ateAqui);
      await db.exec(carregarSemente());
      await inserirEvento(db, ORG_A, await ocorrenciaDe(db, ORG_A), "coordenador", "portal");
      const erro = await erroDe(desfazerUltimaMigracao(bd, ateAqui, carregarDesfazeres(), DEV));
      expect(erro.message).toMatch(/portal/);
      expect((await migracoesAplicadas(bd)).at(-1)?.versao).toBe(ARQUIVO_053);
    } finally {
      await db.close();
    }
  }, 240_000);
});
