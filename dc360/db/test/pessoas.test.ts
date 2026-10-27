/**
 * A MIGRAÇÃO 054: pessoa global e conta no município (V2-F03-E15, parte 1B).
 *
 * A norma é a ADR 0009 (decisões 1, 3 e 7, com as correções 1, 2 e 3), e este
 * arquivo traz os testes que a tabela de "Testes obrigatórios" dela atribui à
 * E15, mais os do plano da F03 (lote 1, parte 1B):
 *
 *  - o BACKFILL: com contas, sessões e segundo fator de antes, a 054 cria uma
 *    pessoa por conta, copia a credencial, grava a marca `backfill` de cada
 *    conta (contagem igual à de contas), e não muda nada do que já existia;
 *  - a CONTA nasce de um jeito só na E15: sem pessoa informada, e o gatilho
 *    criador (`conta_ganha_pessoa`) cria a pessoa NOVA e grava a marca
 *    `criador` da mesma transação (o cadastro de hoje, `provisionar_municipio`
 *    e o INSERT do dono passam no fim da transação);
 *  - os NEGATIVOS da origem: `pessoa_id` informado é recusado no BEFORE
 *    INSERT, inclusive por função do dono e com `set_config` de `dc360.*`; um
 *    BEFORE posterior que troca o valor é pego pelo adiado no fim da
 *    transação; marca de outra transação e conta sem marca, idem;
 *  - `pessoa_id` imutável (`IS DISTINCT FROM`) para o `dc360_app` (privilégio
 *    de coluna) e para o dono (gatilho), e uma conta por pessoa no sistema
 *    (`UNIQUE (pessoa_id)` total, conta desativada inclusive);
 *  - as QUATRO travas de `pessoas` e a tabela protegida `origens_de_conta`:
 *    todo toque do `dc360_app` dá "permissão negada";
 *  - o ESPELHO da credencial e do e-mail (P-04, passo 1), de mão única;
 *  - `vigencia_da_sessao` (org alheio ao contexto: vazio) e
 *    `credenciais_da_pessoa` (lê da pessoa);
 *  - a TRAVA da pessoa (N2), separada da trava das sessões da 049;
 *  - o INVENTÁRIO: toda função do banco que cita a credencial, o e-mail ou a
 *    pessoa está no inventário da etapa;
 *  - a VOLTA (`desfazer/054`): aplicar, desfazer e reaplicar deixa colunas,
 *    índices, RLS, funções, gatilhos e privilégios idênticos;
 *  - em POSTGRES REAL (quando `DC360_POSTGRES_DE_PROVA` existe, como no job
 *    do CI que roda as disputas): a trava da pessoa serializa duas transações
 *    nos dois sentidos, não se confunde com a das sessões, e duas contas novas
 *    com o mesmo e-mail em municípios diferentes terminam sem impasse.
 *
 * O PGlite tem uma conexão só: o que precisa de duas está no último bloco.
 */
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aplicarMigracoes,
  carregarDesfazeres,
  carregarMigracoes,
  desfazerUltimaMigracao,
  migracoesAplicadas,
  type ExecutorSql,
} from "../src/index.js";
import { conferirEliminacaoSemMunicipio } from "./catalogo/conferir.js";
import { conferirCorpoDaLeitora } from "./catalogo/leitora.js";
import { CATALOGO_F03_E15 } from "./catalogo/f03-e15.js";

const ARQUIVO_054 = "054_pessoas_e_conta_no_municipio.sql";
const DEV = { url: undefined, env: { AMBIENTE_DC360: "dev" } } as const;
const aqui = dirname(fileURLToPath(import.meta.url));
const SCRYPT = `scrypt$131072$8$1$${"s".repeat(40)}$${"r".repeat(60)}`;

type Erro = { code?: string; constraint?: string; message: string };

function executorDe(db: PGlite): ExecutorSql {
  return {
    query: async <T>(sql: string, params?: readonly unknown[]) => {
      const r = await db.query<Record<string, unknown>>(sql, params ? [...params] : undefined);
      return { rows: r.rows as T[] };
    },
    exec: (sql: string) => db.exec(sql),
  };
}

/** As migrações até a 054 inclusive (a F03 traz outras depois dela). */
function ateA054() {
  const todas = carregarMigracoes();
  return todas.slice(0, todas.findIndex((m) => m.versao === ARQUIVO_054) + 1);
}

function antesDa054() {
  const todas = carregarMigracoes();
  return todas.slice(
    0,
    todas.findIndex((m) => m.versao === ARQUIVO_054),
  );
}

async function erroDe(p: Promise<unknown>): Promise<Erro> {
  try {
    await p;
  } catch (e) {
    return e as Erro;
  }
  throw new Error("deveria ter sido recusado");
}

/** Uma transação como o papel de aplicação, com (ou sem) município no contexto. */
async function comoApp<T>(
  db: PGlite,
  org: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    if (org) await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [org]);
    return fn(tx);
  });
}

const umValor = async <T>(
  db: PGlite | Transaction,
  sql: string,
  params: unknown[] = [],
): Promise<T> => {
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]!.v;
};

/* ======================================================================= */
/* 1. O backfill, sobre dado de antes.                                      */
/* ======================================================================= */

let db: PGlite;
let orgA = "";
let orgB = "";
const contas: Record<string, string> = {};
let sessaoA1 = "";
let contasDoBackfill = 0;

/** O que existia antes da 054, sem a coluna nova. */
async function fotografiaDosDados(): Promise<Record<string, unknown[]>> {
  const c = async (sql: string) => (await db.query(sql)).rows;
  return {
    usuarios:
      await c(`SELECT id, organizacao_id, nome, matricula, email, papel::text, equipe_id, ativo,
                              criado_em, senha_hash, falhas_login, bloqueado_ate, ultimo_acesso,
                              senha_provisoria_ate FROM usuarios ORDER BY id`),
    sessoes: await c(`SELECT id, organizacao_id, usuario_id, token_hash, criada_em, expira_em,
                             revogada_em, motivo_revogacao, familia_id FROM sessoes ORDER BY id`),
    segundo_fator: await c("SELECT * FROM segundo_fator ORDER BY usuario_id"),
  };
}

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await aplicarMigracoes(executorDe(db), antesDa054());
  // O banco do PGlite nasce sem TEMP para PUBLIC; um banco criado com
  // `CREATE DATABASE` (o do provedor, o do CI) nasce com ele. A sonda devolve o
  // padrão do Postgres para a 054 ter o que revogar (correção 1, achado 1).
  await db.exec(
    "DO $$ BEGIN EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO PUBLIC', current_database()); END $$",
  );

  orgA = await umValor<string>(
    db,
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id AS v",
  );
  orgB = await umValor<string>(
    db,
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC Vale Fundo','Vale Fundo','SP') RETURNING id AS v",
  );

  const conta = async (org: string, chave: string, provisoria = false) => {
    contas[chave] = await umValor<string>(
      db,
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash, senha_provisoria_ate)
       VALUES ($1, $2, $3, $4, 'operador', $5,
               CASE WHEN $6::boolean THEN now() + interval '72 hours' END) RETURNING id AS v`,
      [
        org,
        `Servidora ${chave}`,
        `M-${chave}`,
        `${chave.toLowerCase()}@exemplo.gov.br`,
        SCRYPT,
        provisoria,
      ],
    );
  };
  await conta(orgA, "A1");
  await conta(orgA, "A2", true);
  await conta(orgB, "B1");
  await db.query(
    "UPDATE usuarios SET ativo = false, falhas_login = 3, bloqueado_ate = now() + interval '1 hour' WHERE id = $1",
    [contas["A2"]],
  );

  sessaoA1 = await umValor<string>(
    db,
    "SELECT abrir_sessao($1, $2, 'hash-a1', interval '1 day', NULL, NULL) AS v",
    [orgA, contas["A1"]],
  );
  await db.query("SELECT abrir_sessao($1, $2, 'hash-b1', interval '1 day', NULL, NULL)", [
    orgB,
    contas["B1"],
  ]);
  await db.query(
    "INSERT INTO segundo_fator (organizacao_id, usuario_id, segredo_cifrado) VALUES ($1, $2, 'v1.a.b.c')",
    [orgA, contas["A1"]],
  );
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("o backfill da 054, sobre contas, sessões e segundo fator de antes", () => {
  let antes: Record<string, unknown[]> = {};

  it("aplica sem erro e não muda nada do que já existia", async () => {
    antes = await fotografiaDosDados();
    contasDoBackfill = (antes["usuarios"] as unknown[]).length;
    expect(contasDoBackfill).toBe(3);

    const r = await aplicarMigracoes(executorDe(db), ateA054());
    expect(r.aplicadas).toEqual([ARQUIVO_054]);
    expect(await fotografiaDosDados()).toEqual(antes);
  });

  it("N contas viram N pessoas, cada conta com a sua, e a marca `backfill` de cada uma", async () => {
    const n = await db.query<{
      contas: number;
      pessoas: number;
      distintas: number;
      marcas: number;
      nulas: number;
    }>(`
      SELECT (SELECT count(*)::int FROM usuarios) AS contas,
             (SELECT count(*)::int FROM pessoas) AS pessoas,
             (SELECT count(DISTINCT pessoa_id)::int FROM usuarios) AS distintas,
             (SELECT count(*)::int FROM origens_de_conta WHERE origem = 'backfill') AS marcas,
             (SELECT count(*)::int FROM usuarios WHERE pessoa_id IS NULL) AS nulas`);
    expect(n.rows[0]).toEqual({ contas: 3, pessoas: 3, distintas: 3, marcas: 3, nulas: 0 });

    // A marca é da conta e da pessoa certas, e todas da mesma transação (a da migração).
    const marcas = await db.query<{ certa: boolean; transacoes: number }>(`
      SELECT bool_and(o.pessoa_id = u.pessoa_id AND o.convite_id IS NULL) AS certa,
             count(DISTINCT o.transacao)::int AS transacoes
        FROM origens_de_conta o JOIN usuarios u ON u.id = o.usuario_id
       WHERE o.origem = 'backfill'`);
    expect(marcas.rows[0]).toEqual({ certa: true, transacoes: 1 });
  });

  it("a credencial e o e-mail foram copiados sem perda; nada de município foi para a pessoa", async () => {
    const r = await db.query<{ divergentes: number }>(`
      SELECT count(*)::int AS divergentes
        FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id
       WHERE p.email IS DISTINCT FROM u.email OR p.nome IS DISTINCT FROM u.nome
          OR p.senha_hash IS DISTINCT FROM u.senha_hash OR p.falhas_login IS DISTINCT FROM u.falhas_login
          OR p.bloqueado_ate IS DISTINCT FROM u.bloqueado_ate
          OR p.senha_provisoria_ate IS DISTINCT FROM u.senha_provisoria_ate
          OR p.ativo IS DISTINCT FROM u.ativo OR p.email_verificado_em IS NOT NULL`);
    expect(r.rows[0]!.divergentes).toBe(0);
    const colunas = await db.query<{ c: string }>(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'pessoas' ORDER BY ordinal_position",
    );
    expect(colunas.rows.map((x) => x.c)).toEqual([
      "id",
      "nome",
      "email",
      "senha_hash",
      "falhas_login",
      "bloqueado_ate",
      "senha_provisoria_ate",
      "email_verificado_em",
      "ativo",
      "criado_em",
    ]);
  });

  it("toda sessão de antes carrega a pessoa da conta, e o login de antes ainda acha a conta", async () => {
    const r = await db.query<{ certas: number; total: number }>(`
      SELECT count(*) FILTER (WHERE s.pessoa_id = u.pessoa_id)::int AS certas, count(*)::int AS total
        FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id`);
    expect(r.rows[0]).toEqual({ certas: 2, total: 2 });
    expect(
      await umValor<boolean>(
        db,
        "SELECT s.pessoa_id = u.pessoa_id AS v FROM sessoes s JOIN usuarios u ON u.id = $2 WHERE s.id = $1",
        [sessaoA1, contas["A1"]],
      ),
    ).toBe(true);
    const login = await db.query<{ usuario_id: string; senha_hash: string }>(
      "SELECT usuario_id, senha_hash FROM credenciais_para_login('A1@exemplo.gov.br')",
    );
    expect(login.rows).toEqual([{ usuario_id: contas["A1"], senha_hash: SCRYPT }]);
    const viva = await db.query("SELECT * FROM sessao_por_token('hash-a1')");
    expect(viva.rows).toHaveLength(1);
  });
});

/* ======================================================================= */
/* 2. A conta nasce sem pessoa informada, e ganha uma pessoa NOVA.          */
/* ======================================================================= */

describe("positivo da origem: a conta que chega sem pessoa ganha uma pessoa nova e a marca `criador`", () => {
  it("o cadastro de hoje (INSERT do dc360_app no município) passa no fim da transação, com pessoa nova e marca da MESMA transação", async () => {
    const r = await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_app");
      await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgA]);
      const id = await umValor<string>(
        tx,
        `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
         VALUES ($1, 'Cadastro de Hoje', 'M-C1', 'cadastro.hoje@exemplo.gov.br', 'agente_campo', $2)
         RETURNING id AS v`,
        [orgA, SCRYPT],
      );
      await tx.exec("RESET ROLE");
      const marca = await tx.query<{ origem: string; mesma: boolean; pessoa_certa: boolean }>(
        `
        SELECT o.origem, o.transacao = pg_current_xact_id() AS mesma, o.pessoa_id = u.pessoa_id AS pessoa_certa
          FROM origens_de_conta o JOIN usuarios u ON u.id = o.usuario_id WHERE o.usuario_id = $1`,
        [id],
      );
      return { id, marca: marca.rows };
    });
    expect(r.marca).toEqual([{ origem: "criador", mesma: true, pessoa_certa: true }]);
    const p = await db.query<{ email: string; senha_hash: string; ativo: boolean }>(
      "SELECT p.email, p.senha_hash, p.ativo FROM pessoas p JOIN usuarios u ON u.pessoa_id = p.id WHERE u.id = $1",
      [r.id],
    );
    expect(p.rows).toEqual([
      { email: "cadastro.hoje@exemplo.gov.br", senha_hash: SCRYPT, ativo: true },
    ]);
  });

  it("`provisionar_municipio` (console) cria a pessoa nova junto, com a senha provisória, e passa", async () => {
    const r = await db.query<{ organizacao_id: string; usuario_id: string }>(
      "SELECT * FROM provisionar_municipio('DC Pedra Lisa','Pedra Lisa','RJ','Primeira Admin','PL-1','admin@pedralisa.exemplo.gov.br',$1,'operador da plataforma')",
      [SCRYPT],
    );
    const id = r.rows[0]!.usuario_id;
    const p = await db.query<{ provisoria: boolean; origem: string }>(
      `
      SELECT p.senha_provisoria_ate IS NOT NULL AS provisoria, o.origem
        FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id JOIN origens_de_conta o ON o.usuario_id = u.id
       WHERE u.id = $1`,
      [id],
    );
    expect(p.rows).toEqual([{ provisoria: true, origem: "criador" }]);
  });

  it("e-mail repetido em `provisionar_municipio` continua o DC363 de antes (o oráculo da F00 não muda de forma)", async () => {
    const e = await erroDe(
      db.query(
        "SELECT * FROM provisionar_municipio('DC Outra','Outra Cidade','RJ','Outra Admin','OC-1','ADMIN@pedralisa.exemplo.gov.br',$1,'operador da plataforma')",
        [SCRYPT],
      ),
    );
    expect(e.code).toBe("DC363");
  });

  it("o INSERT do dono, sem contexto (sementes, testes), também passa", async () => {
    contas["A3"] = await umValor<string>(
      db,
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1, 'Semente', 'M-A3', 'semente.a3@exemplo.gov.br', 'coordenador') RETURNING id AS v`,
      [orgA],
    );
    const o = await db.query<{ origem: string }>(
      "SELECT origem FROM origens_de_conta WHERE usuario_id = $1",
      [contas["A3"]],
    );
    expect(o.rows).toEqual([{ origem: "criador" }]);
  });

  it("toda conta do backfill tem a marca `backfill`, e as contas criadas depois, `criador`", async () => {
    const r = await db.query<{ origem: string; n: number }>(
      "SELECT origem, count(*)::int AS n FROM origens_de_conta GROUP BY origem ORDER BY origem",
    );
    const contasAgora = await umValor<number>(db, "SELECT count(*)::int AS v FROM usuarios");
    expect(r.rows).toEqual([
      { origem: "backfill", n: contasDoBackfill },
      { origem: "criador", n: contasAgora - contasDoBackfill },
    ]);
    // E não sobra marca sem conta nem conta sem marca.
    const orfas = await db.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM usuarios u FULL JOIN origens_de_conta o ON o.usuario_id = u.id
       WHERE u.id IS NULL OR o.usuario_id IS NULL`);
    expect(orfas.rows[0]!.n).toBe(0);
  });

  it("o e-mail de uma pessoa existente NÃO liga a conta nova a ela: a conta é recusada como sempre foi", async () => {
    const pessoasAntes = await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas");
    const e = await erroDe(
      comoApp(db, orgB, (tx) =>
        tx.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1, 'Mesmo E-mail', 'M-X', 'A1@EXEMPLO.gov.br', 'operador')`,
          [orgB],
        ),
      ),
    );
    expect(e).toMatchObject({ code: "23505", constraint: "usuarios_email_global_idx" });
    expect(await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas")).toBe(pessoasAntes);
    // A pessoa da conta A1 continua com uma conta só.
    expect(
      await umValor<number>(
        db,
        "SELECT count(*)::int AS v FROM usuarios WHERE pessoa_id = (SELECT pessoa_id FROM usuarios WHERE id = $1)",
        [contas["A1"]],
      ),
    ).toBe(1);
  });

  it("segunda PESSOA com o mesmo e-mail (outra caixa), mesmo pelo dono: `pessoas_email_idx` recusa", async () => {
    const e = await erroDe(
      db.query("INSERT INTO pessoas (nome, email) VALUES ('Outra Pessoa', 'B1@Exemplo.Gov.Br')"),
    );
    expect(e).toMatchObject({ code: "23505", constraint: "pessoas_email_idx" });
  });

  it("conta de outro município com contexto: o criador recusa (42501) antes de criar a pessoa", async () => {
    const pessoasAntes = await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas");
    const e = await erroDe(
      comoApp(db, orgA, (tx) =>
        tx.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1, 'Intrusa', 'M-I', 'intrusa@exemplo.gov.br', 'operador')`,
          [orgB],
        ),
      ),
    );
    expect(e.code).toBe("42501");
    expect(await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas")).toBe(pessoasAntes);
  });
});

/* ======================================================================= */
/* 3. Os negativos da origem.                                               */
/* ======================================================================= */

describe("negativo da origem: `pessoa_id` só nasce pelo gatilho criador", () => {
  let orfa = "";

  beforeAll(async () => {
    // Uma pessoa sem conta, criada pelo dono só para a sonda ter um alvo que
    // não esbarre no UNIQUE (pessoa_id).
    orfa = await umValor<string>(
      db,
      "INSERT INTO pessoas (nome, email) VALUES ('Pessoa Sem Conta', 'sem.conta@exemplo.gov.br') RETURNING id AS v",
    );
  });

  it("o dc360_app informando `pessoa_id` no INSERT: permissão negada, antes de qualquer escrita", async () => {
    const e = await erroDe(
      comoApp(db, orgA, (tx) =>
        tx.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, pessoa_id)
       VALUES ($1, 'Com Pessoa', 'M-P1', 'com.pessoa@exemplo.gov.br', 'operador', $2)`,
          [orgA, orfa],
        ),
      ),
    );
    // Junção do lote 1 (decisão 1 da ADR 0009): o INSERT do app é por coluna e
    // não inclui `pessoa_id`, então a recusa é de PRIVILÉGIO, antes de qualquer
    // gatilho. O gatilho criador continua recusando quem tem a coluna (o dono,
    // caso seguinte).
    expect(e.code).toBe("42501");
    expect(e.message).toMatch(/permission denied for table usuarios/);
    expect(
      await umValor<boolean>(
        db,
        "SELECT has_column_privilege('dc360_app', 'usuarios', 'pessoa_id', 'INSERT') AS v",
      ),
    ).toBe(false);
  });

  it("função do DONO que não é o gatilho criador, com `set_config` de `dc360.*`, também é recusada no BEFORE INSERT", async () => {
    await db.exec(`
      CREATE FUNCTION sonda_insere_conta_com_pessoa(p_org uuid, p_pessoa uuid) RETURNS uuid
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      DECLARE v uuid;
      BEGIN
        PERFORM set_config('dc360.origem', 'aceite', true);
        PERFORM set_config('dc360.marca', 'criador', true);
        INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, pessoa_id)
        VALUES (p_org, 'Pela Porta dos Fundos', 'M-PF', 'porta.fundos@exemplo.gov.br', 'operador', p_pessoa)
        RETURNING id INTO v;
        RETURN v;
      END $$;
      GRANT EXECUTE ON FUNCTION sonda_insere_conta_com_pessoa(uuid, uuid) TO dc360_app`);
    try {
      const comoDono = await erroDe(
        db.query("SELECT sonda_insere_conta_com_pessoa($1, $2)", [orgA, orfa]),
      );
      expect(comoDono.code).toBe("42501");
      const peloApp = await erroDe(
        comoApp(db, orgA, (tx) =>
          tx.query("SELECT sonda_insere_conta_com_pessoa($1, $2)", [orgA, orfa]),
        ),
      );
      expect(peloApp.code).toBe("42501");
      // E com a variável definida na própria transação de quem chama.
      const comVariavel = await erroDe(
        db.transaction(async (tx) => {
          await tx.query("SELECT set_config('dc360.origem', 'aceite', true)");
          await tx.query("SELECT sonda_insere_conta_com_pessoa($1, $2)", [orgA, orfa]);
        }),
      );
      expect(comVariavel.code).toBe("42501");
    } finally {
      await db.exec("DROP FUNCTION sonda_insere_conta_com_pessoa(uuid, uuid)");
    }
    expect(
      await umValor<number>(db, "SELECT count(*)::int AS v FROM usuarios WHERE pessoa_id = $1", [
        orfa,
      ]),
    ).toBe(0);
  });

  it("um BEFORE INSERT de teste que roda DEPOIS do criador e troca o `pessoa_id`: o adiado recusa no fim da transação", async () => {
    await db.exec(`
      CREATE FUNCTION sonda_troca_a_pessoa() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.pessoa_id := current_setting('sonda.pessoa')::uuid;
        RETURN NEW;
      END $$;
      CREATE TRIGGER zz_sonda_troca_a_pessoa BEFORE INSERT ON usuarios
        FOR EACH ROW EXECUTE FUNCTION sonda_troca_a_pessoa()`);
    const pessoasAntes = await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas");
    try {
      let inseriu = false;
      const e = await erroDe(
        db.transaction(async (tx) => {
          await tx.query("SELECT set_config('sonda.pessoa', $1, true)", [orfa]);
          await tx.query(
            `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
           VALUES ($1, 'Trocada', 'M-T1', 'trocada@exemplo.gov.br', 'operador')`,
            [orgA],
          );
          // O INSERT passou: o criador gravou a marca da pessoa nova, e a sonda
          // trocou o valor depois dele. Só o fim da transação pega.
          inseriu = true;
        }),
      );
      expect(inseriu).toBe(true);
      expect(e).toMatchObject({ code: "23514", constraint: "usuarios_origem_da_pessoa" });
    } finally {
      await db.exec(
        "DROP TRIGGER zz_sonda_troca_a_pessoa ON usuarios; DROP FUNCTION sonda_troca_a_pessoa()",
      );
    }
    expect(
      await umValor<number>(
        db,
        "SELECT count(*)::int AS v FROM usuarios WHERE email = 'trocada@exemplo.gov.br'",
      ),
    ).toBe(0);
    // A pessoa nova do criador voltou junto com a transação.
    expect(await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas")).toBe(pessoasAntes);
  });

  it("conta sem marca, e conta com a marca de OUTRA transação: o adiado recusa (o criador desligado por DDL, só nesta sonda do dono)", async () => {
    const outra = await umValor<string>(
      db,
      "INSERT INTO pessoas (nome, email) VALUES ('Outra Sem Conta', 'outra.sem.conta@exemplo.gov.br') RETURNING id AS v",
    );
    const idAntigo = crypto.randomUUID();
    // Marca gravada e confirmada numa transação anterior.
    await db.query(
      "INSERT INTO origens_de_conta (usuario_id, pessoa_id, origem, transacao) VALUES ($1, $2, 'criador', pg_current_xact_id())",
      [idAntigo, outra],
    );
    await db.exec("ALTER TABLE usuarios DISABLE TRIGGER usuarios_ganha_pessoa");
    try {
      const semMarca = await erroDe(
        db.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, pessoa_id)
         VALUES ($1, 'Sem Marca', 'M-SM', 'sem.marca@exemplo.gov.br', 'operador', $2)`,
          [orgA, orfa],
        ),
      );
      expect(semMarca).toMatchObject({ code: "23514", constraint: "usuarios_origem_da_pessoa" });
      const marcaVelha = await erroDe(
        db.query(
          `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, pessoa_id)
         VALUES ($1, $2, 'Marca Velha', 'M-MV', 'marca.velha@exemplo.gov.br', 'operador', $3)`,
          [idAntigo, orgA, outra],
        ),
      );
      expect(marcaVelha).toMatchObject({ code: "23514", constraint: "usuarios_origem_da_pessoa" });
    } finally {
      await db.exec("ALTER TABLE usuarios ENABLE TRIGGER usuarios_ganha_pessoa");
    }
  });
});

/* ======================================================================= */
/* 4. pessoa_id não muda, e uma conta por pessoa.                           */
/* ======================================================================= */

describe("`pessoa_id` é imutável e há uma conta por pessoa no sistema", () => {
  it("UPDATE de `pessoa_id` pelo dc360_app: permissão negada (privilégio de coluna)", async () => {
    const e = await erroDe(
      comoApp(db, orgA, (tx) =>
        tx.query("UPDATE usuarios SET pessoa_id = gen_random_uuid() WHERE id = $1", [contas["A1"]]),
      ),
    );
    expect(e.code).toBe("42501");
    expect(e.message).toMatch(/permission denied/);
  });

  it("UPDATE de `pessoa_id` pelo DONO, direto ou por função SECURITY DEFINER: o gatilho recusa (IS DISTINCT FROM)", async () => {
    const direto = await erroDe(
      db.query("UPDATE usuarios SET pessoa_id = gen_random_uuid() WHERE id = $1", [contas["A1"]]),
    );
    expect(direto).toMatchObject({ code: "23514", constraint: "usuarios_pessoa_id_nao_muda" });
    // Para a pessoa de OUTRA conta, o mesmo gatilho, antes do índice único.
    const outra = await umValor<string>(db, "SELECT pessoa_id AS v FROM usuarios WHERE id = $1", [
      contas["B1"],
    ]);
    const paraOutra = await erroDe(
      db.query("UPDATE usuarios SET pessoa_id = $2 WHERE id = $1", [contas["A1"], outra]),
    );
    expect(paraOutra).toMatchObject({ code: "23514", constraint: "usuarios_pessoa_id_nao_muda" });
    await db.exec(`
      CREATE FUNCTION sonda_troca_pessoa(p uuid) RETURNS void LANGUAGE sql SECURITY DEFINER
        SET search_path = public, pg_temp AS $$ UPDATE usuarios SET pessoa_id = gen_random_uuid() WHERE id = p $$`);
    try {
      const definidora = await erroDe(db.query("SELECT sonda_troca_pessoa($1)", [contas["A1"]]));
      expect(definidora).toMatchObject({
        code: "23514",
        constraint: "usuarios_pessoa_id_nao_muda",
      });
    } finally {
      await db.exec("DROP FUNCTION sonda_troca_pessoa(uuid)");
    }
    // Reescrever o MESMO valor não é mudança.
    await db.query("UPDATE usuarios SET pessoa_id = pessoa_id WHERE id = $1", [contas["A1"]]);
  });

  it("um BEFORE UPDATE de teste que roda DEPOIS do de imutabilidade e troca a pessoa: o gatilho do estado final recusa", async () => {
    // Junção do lote 1: com a chave `usuarios_pessoa_id_fkey`, um uuid qualquer
    // seria recusado pela chave (23503) antes do gatilho do estado final. A
    // sonda troca para uma pessoa que EXISTE e não tem conta, e assim é o
    // gatilho que responde.
    const semConta = await umValor<string>(
      db,
      "INSERT INTO pessoas (nome, email) VALUES ('Pessoa da Sonda', 'sonda.estado.final@exemplo.gov.br') RETURNING id AS v",
    );
    await db.exec(`
      CREATE FUNCTION sonda_troca_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.pessoa_id := '${semConta}'::uuid; RETURN NEW; END $$;
      CREATE TRIGGER zz_sonda_troca_no_update BEFORE UPDATE ON usuarios
        FOR EACH ROW EXECUTE FUNCTION sonda_troca_no_update()`);
    try {
      // A3 não tem sessão: nenhuma chave estrangeira responde antes do gatilho.
      const e = await erroDe(
        db.query("UPDATE usuarios SET nome = nome WHERE id = $1", [contas["A3"]]),
      );
      expect(e).toMatchObject({ code: "23514", constraint: "usuarios_pessoa_id_nao_muda" });
      expect(e.message).toMatch(/nunca muda/);
    } finally {
      await db.exec(
        "DROP TRIGGER zz_sonda_troca_no_update ON usuarios; DROP FUNCTION sonda_troca_no_update()",
      );
    }
  });

  it("segunda conta da mesma pessoa, com a primeira ATIVA ou DESATIVADA: o UNIQUE total recusa (gatilhos desligados para chegar no índice)", async () => {
    const pessoaA1 = await umValor<string>(
      db,
      "SELECT pessoa_id AS v FROM usuarios WHERE id = $1",
      [contas["A1"]],
    );
    const pessoaA2 = await umValor<string>(
      db,
      "SELECT pessoa_id AS v FROM usuarios WHERE id = $1",
      [contas["A2"]],
    );
    expect(
      await umValor<boolean>(db, "SELECT ativo AS v FROM usuarios WHERE id = $1", [contas["A2"]]),
    ).toBe(false);
    const tentar = (org: string, pessoa: string, m: string) =>
      db.transaction(async (tx) => {
        // O dono desliga os gatilhos (só ele pode) para provar que o ÍNDICE,
        // sozinho, recusa: sem isso o criador recusaria antes.
        await tx.exec("SET LOCAL session_replication_role = replica");
        await tx.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, pessoa_id)
         VALUES ($1, 'Segunda Conta', $3, $4, 'operador', $2)`,
          [org, pessoa, m, `${m}@exemplo.gov.br`],
        );
      });
    for (const [org, pessoa, m] of [
      [orgB, pessoaA1, "m-b-ativa"],
      [orgB, pessoaA2, "m-b-desativada"],
      [orgA, pessoaA1, "m-a-mesmo"],
    ] as const) {
      const e = await erroDe(tentar(org, pessoa, m));
      expect(e.code, m).toBe("23505");
      expect(["usuarios_uma_conta_por_pessoa", "usuarios_pessoa_unica_no_municipio"], m).toContain(
        e.constraint,
      );
    }
  });

  it("os gatilhos estão habilitados depois de toda a cadeia de migrações, e o adiado é adiado", async () => {
    const r = await db.query<{
      tgname: string;
      tgenabled: string;
      tgdeferrable: boolean;
      tginitdeferred: boolean;
    }>(`
      SELECT tgname, tgenabled, tgdeferrable, tginitdeferred FROM pg_trigger
       WHERE NOT tgisinternal AND tgrelid IN ('usuarios'::regclass, 'sessoes'::regclass,
                                              'pessoas'::regclass, 'origens_de_conta'::regclass)
         AND tgname IN ('usuarios_ganha_pessoa', 'usuarios_origem_da_pessoa', 'usuarios_pessoa_id_nao_muda',
                        'usuarios_pessoa_id_nao_muda_no_estado_final',
                        'pessoa_recebe_a_credencial_da_conta', 'sessao_carrega_a_pessoa',
                        'pessoas_nao_se_apagam', 'pessoas_nao_se_truncam',
                        'origens_de_conta_nao_se_reescrevem', 'origens_de_conta_nao_se_truncam',
                        'conta_nasce_no_municipio_do_contexto', 'usuarios_nenhuma_pessoa_sem_conta',
                        'pessoas_id_nao_muda', 'pessoas_id_nao_muda_no_estado_final')
       ORDER BY tgname`);
    expect(r.rows).toHaveLength(14);
    for (const t of r.rows) expect(t.tgenabled, t.tgname).toBe("O");
    const adiado = r.rows.find((t) => t.tgname === "usuarios_origem_da_pessoa")!;
    expect(adiado).toMatchObject({ tgdeferrable: true, tginitdeferred: true });
    // E a cadeia inteira: toda migração do repositório aplicada a partir de zero.
    const completo = new PGlite();
    try {
      await aplicarMigracoes(executorDe(completo), carregarMigracoes());
      const c = await completo.query<{ n: number }>(`
        SELECT count(*)::int AS n FROM pg_trigger
         WHERE tgrelid = 'usuarios'::regclass AND tgenabled = 'O'
           AND tgname IN ('usuarios_pessoa_id_nao_muda', 'usuarios_pessoa_id_nao_muda_no_estado_final',
                          'usuarios_ganha_pessoa', 'usuarios_origem_da_pessoa',
                          'conta_nasce_no_municipio_do_contexto', 'usuarios_nenhuma_pessoa_sem_conta')`);
      expect(c.rows[0]!.n).toBe(6);
    } finally {
      await completo.close();
    }
  }, 240_000);
});

/* ======================================================================= */
/* 5. As travas de `pessoas` e de `origens_de_conta`.                       */
/* ======================================================================= */

describe("`pessoas` e `origens_de_conta`: o papel de aplicação não toca, de jeito nenhum", () => {
  const TOQUES: ReadonlyArray<readonly [string, string]> = [
    ["SELECT pessoas", "SELECT * FROM pessoas"],
    ["SELECT count pessoas", "SELECT count(*) FROM pessoas"],
    ["INSERT pessoas", "INSERT INTO pessoas (nome, email) VALUES ('X', 'x.toque@exemplo.gov.br')"],
    ["UPDATE pessoas", "UPDATE pessoas SET nome = nome"],
    ["DELETE pessoas", "DELETE FROM pessoas"],
    ["SELECT origens", "SELECT * FROM origens_de_conta"],
    [
      "INSERT origens",
      "INSERT INTO origens_de_conta (usuario_id, pessoa_id, origem, transacao) VALUES (gen_random_uuid(), gen_random_uuid(), 'criador', pg_current_xact_id())",
    ],
    ["UPDATE origens", "UPDATE origens_de_conta SET origem = origem"],
    ["DELETE origens", "DELETE FROM origens_de_conta"],
    ["TRUNCATE pessoas", "TRUNCATE pessoas"],
    ["TRUNCATE origens", "TRUNCATE origens_de_conta"],
  ];

  for (const comContexto of [true, false]) {
    for (const [rotulo, sql] of TOQUES) {
      it(`${rotulo} ${comContexto ? "no contexto de A" : "sem contexto"}: permissão negada`, async () => {
        const e = await erroDe(comoApp(db, comContexto ? orgA : null, (tx) => tx.query(sql)));
        expect(e.code).toBe("42501");
        expect(e.message).toMatch(/permission denied/);
      });
    }
  }

  it("nenhum privilégio, de tabela ou de coluna, a dc360_app, dc360_console ou PUBLIC; RLS forçada e nenhuma policy", async () => {
    const r = await db.query<{
      tabela: string;
      algum: boolean;
      forcada: boolean;
      policies: number;
    }>(`
      SELECT c.relname AS tabela,
             EXISTS (SELECT 1 FROM unnest(ARRAY['dc360_app','dc360_console','public']) papel,
                            unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pr
                      WHERE has_table_privilege(papel, c.oid, pr)
                         OR (pr IN ('SELECT','INSERT','UPDATE','REFERENCES') AND has_any_column_privilege(papel, c.oid, pr))) AS algum,
             c.relrowsecurity AND c.relforcerowsecurity AS forcada,
             (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policies
        FROM pg_class c WHERE c.relname IN ('pessoas', 'origens_de_conta') ORDER BY 1`);
    expect(r.rows).toEqual([
      { tabela: "origens_de_conta", algum: false, forcada: true, policies: 0 },
      { tabela: "pessoas", algum: false, forcada: true, policies: 0 },
    ]);
  });

  it("nem o dono apaga a pessoa nem reescreve a marca (no lugar da chave estrangeira que o portão não deixa declarar)", async () => {
    const pessoa = await umValor<string>(db, "SELECT pessoa_id AS v FROM usuarios WHERE id = $1", [
      contas["A1"],
    ]);
    expect((await erroDe(db.query("DELETE FROM pessoas WHERE id = $1", [pessoa]))).code).toBe(
      "42501",
    );
    expect((await erroDe(db.query("TRUNCATE pessoas CASCADE"))).code).toBe("42501");
    expect(
      (
        await erroDe(
          db.query(
            "UPDATE origens_de_conta SET origem = 'aceite', convite_id = gen_random_uuid() WHERE usuario_id = $1",
            [contas["A1"]],
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (await erroDe(db.query("DELETE FROM origens_de_conta WHERE usuario_id = $1", [contas["A1"]])))
        .code,
    ).toBe("42501");
  });

  it("as funções dos gatilhos: o app não as executa (sem EXECUTE), e nem o dono as chama fora de gatilho", async () => {
    for (const f of ["conta_ganha_pessoa", "pessoa_espelha_a_conta", "conta_nasce_no_contexto"]) {
      const e = await erroDe(comoApp(db, orgA, (tx) => tx.query(`SELECT ${f}()`)));
      expect(e.code, f).toBe("42501");
      expect(e.message, f).toMatch(/permission denied for function/);
      const dono = await erroDe(db.query(`SELECT ${f}()`));
      expect(dono.code, f).toBe("0A000");
      expect(dono.message, f).toMatch(/trigger functions can only be called as triggers/);
    }
  });
});

/* ======================================================================= */
/* 6. O espelho da credencial (passo 1).                                    */
/* ======================================================================= */

describe("o espelho: toda escrita de credencial e de e-mail na conta chega à pessoa, de mão única", () => {
  const pessoaDe = async (conta: string) =>
    (
      await db.query<Record<string, unknown>>(
        `SELECT p.email, p.senha_hash, p.falhas_login, p.bloqueado_ate, p.senha_provisoria_ate, p.nome, p.ativo
       FROM pessoas p JOIN usuarios u ON u.pessoa_id = p.id WHERE u.id = $1`,
        [conta],
      )
    ).rows[0]!;
  const contaDe = async (conta: string) =>
    (
      await db.query<Record<string, unknown>>(
        `SELECT email, senha_hash, falhas_login, bloqueado_ate, senha_provisoria_ate FROM usuarios WHERE id = $1`,
        [conta],
      )
    ).rows[0]!;

  it("a redefinição de senha por quem administra (UPDATE do dc360_app no município), como a rota faz", async () => {
    await comoApp(db, orgA, (tx) =>
      tx.query(
        `UPDATE usuarios SET senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL,
              senha_provisoria_ate = now() + interval '72 hours' WHERE id = $1`,
        [contas["A2"], `${SCRYPT}x`],
      ),
    );
    expect(await pessoaDe(contas["A2"]!)).toMatchObject(await contaDe(contas["A2"]!));
    expect((await pessoaDe(contas["A2"]!))["senha_hash"]).toBe(`${SCRYPT}x`);
  });

  it("`registrar_tentativa_login` (falha e acerto), `trocar_senha` e o gatilho da 046 chegam à pessoa", async () => {
    await db.query("SELECT registrar_tentativa_login($1, false, 5, interval '15 minutes')", [
      contas["A1"],
    ]);
    expect((await pessoaDe(contas["A1"]!))["falhas_login"]).toBe(1);
    await db.query("SELECT registrar_tentativa_login($1, true, 5, interval '15 minutes')", [
      contas["A1"],
    ]);
    expect((await pessoaDe(contas["A1"]!))["falhas_login"]).toBe(0);
    await db.query("SELECT trocar_senha($1, $2, NULL)", [contas["A2"], `${SCRYPT}y`]);
    const p = await pessoaDe(contas["A2"]!);
    // A 046 zera o prazo da provisória quando a senha muda sem carimbo novo.
    expect(p).toMatchObject({ senha_hash: `${SCRYPT}y`, senha_provisoria_ate: null });
    expect(p).toMatchObject(await contaDe(contas["A2"]!));
  });

  it("o link de recuperação (`abrir_recuperacao` e `consumir_recuperacao`) chega à pessoa", async () => {
    await db.query(
      "SELECT * FROM abrir_recuperacao('A1@exemplo.gov.br', 'link-a1', interval '30 minutes', NULL)",
    );
    const r = await db.query("SELECT * FROM consumir_recuperacao('link-a1', $1)", [`${SCRYPT}z`]);
    expect(r.rows).toHaveLength(1);
    expect((await pessoaDe(contas["A1"]!))["senha_hash"]).toBe(`${SCRYPT}z`);
  });

  it("a troca de e-mail da conta chega à pessoa; o nome e o ativo da conta NÃO (são do município e da E09)", async () => {
    await comoApp(db, orgA, (tx) =>
      tx.query(
        "UPDATE usuarios SET email = 'a3.novo@exemplo.gov.br', nome = 'Nome do Município' WHERE id = $1",
        [contas["A3"]],
      ),
    );
    const p = await pessoaDe(contas["A3"]!);
    expect(p).toMatchObject({ email: "a3.novo@exemplo.gov.br", nome: "Semente", ativo: true });
    await comoApp(db, orgA, (tx) =>
      tx.query("UPDATE usuarios SET ativo = false WHERE id = $1", [contas["A3"]]),
    );
    expect((await pessoaDe(contas["A3"]!))["ativo"]).toBe(true);
    await comoApp(db, orgA, (tx) =>
      tx.query("UPDATE usuarios SET ativo = true WHERE id = $1", [contas["A3"]]),
    );
  });

  it("de mão única: escrever na pessoa (só o dono pode) não volta para a conta", async () => {
    const pessoa = await umValor<string>(db, "SELECT pessoa_id AS v FROM usuarios WHERE id = $1", [
      contas["B1"],
    ]);
    await db.query("UPDATE pessoas SET falhas_login = 9 WHERE id = $1", [pessoa]);
    expect((await contaDe(contas["B1"]!))["falhas_login"]).toBe(0);
    await db.query("UPDATE pessoas SET falhas_login = 0 WHERE id = $1", [pessoa]);
  });

  it("com o município de outro no contexto, o espelho recusa (o dono atualizando a conta de A sob o contexto de B)", async () => {
    const e = await erroDe(
      db.transaction(async (tx) => {
        await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgB]);
        await tx.query("UPDATE usuarios SET falhas_login = 2 WHERE id = $1", [contas["A1"]]);
      }),
    );
    expect(e.code).toBe("42501");
  });

  it("o UPDATE do dc360_app em `usuarios` é por coluna: as que a API grava passam, `id`, `organizacao_id` e `ultimo_acesso` não", async () => {
    const r = await db.query<{ coluna: string; pode: boolean }>(`
      SELECT a.attname::text AS coluna, has_column_privilege('dc360_app', 'usuarios'::regclass, a.attnum, 'UPDATE') AS pode
        FROM pg_attribute a WHERE a.attrelid = 'usuarios'::regclass AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attname`);
    const podem = r.rows
      .filter((x) => x.pode)
      .map((x) => x.coluna)
      .sort();
    expect(podem).toEqual([
      "ativo",
      "bloqueado_ate",
      "email",
      "equipe_id",
      "falhas_login",
      "foto_bytes",
      "foto_chave",
      "matricula",
      "nome",
      "papel",
      "senha_hash",
      "senha_provisoria_ate",
    ]);
    expect(
      await umValor<boolean>(
        db,
        "SELECT has_table_privilege('dc360_app', 'usuarios', 'UPDATE') AS v",
      ),
    ).toBe(false);
    // Junção do lote 1 (cabeçalho da 054, item a): o INSERT também é por coluna,
    // sem `pessoa_id` (e sem `criado_em`, `ultimo_acesso` e `busca`).
    expect(
      await umValor<boolean>(
        db,
        "SELECT has_table_privilege('dc360_app', 'usuarios', 'INSERT') AS v",
      ),
    ).toBe(false);
    const inserem = await db.query<{ coluna: string }>(`
      SELECT a.attname::text AS coluna
        FROM pg_attribute a WHERE a.attrelid = 'usuarios'::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND has_column_privilege('dc360_app', 'usuarios'::regclass, a.attnum, 'INSERT')
       ORDER BY a.attname`);
    expect(inserem.rows.map((x) => x.coluna)).toEqual([
      "ativo",
      "bloqueado_ate",
      "email",
      "equipe_id",
      "falhas_login",
      "foto_bytes",
      "foto_chave",
      "id",
      "matricula",
      "nome",
      "organizacao_id",
      "papel",
      "senha_hash",
      "senha_provisoria_ate",
    ]);
  });
});

/* ======================================================================= */
/* 7. vigencia_da_sessao e credenciais_da_pessoa.                           */
/* ======================================================================= */

describe("`vigencia_da_sessao`: uma consulta, e só no município do contexto", () => {
  const pessoaDe = (conta: string) =>
    umValor<string>(db, "SELECT pessoa_id AS v FROM usuarios WHERE id = $1", [conta]);
  const vigencia = (ctx: string | null, pessoa: string, org: string, sid: string) =>
    comoApp(
      db,
      ctx,
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>("SELECT * FROM vigencia_da_sessao($1, $2, $3)", [
            pessoa,
            org,
            sid,
          ])
        ).rows,
    );

  let sessaoNova = "";
  beforeAll(async () => {
    sessaoNova = await umValor<string>(
      db,
      "SELECT abrir_sessao($1, $2, 'hash-a1-nova', interval '1 day', NULL, NULL) AS v",
      [orgA, contas["A1"]],
    );
  });

  it("pessoa, município do contexto e sessão viva: a conta, o papel, o nome e a sessão viva", async () => {
    const r = await vigencia(orgA, await pessoaDe(contas["A1"]!), orgA, sessaoNova);
    expect(r).toEqual([
      {
        usuario_id: contas["A1"],
        suspenso: false,
        conta_ativa: true,
        papel: "operador",
        nome: "Servidora A1",
        pessoa_ativa: true,
        senha_provisoria_ate: null,
        sessao_viva: true,
      },
    ]);
  });

  it("org alheio ao contexto: vazio (nem a linha do município); sem contexto: vazio", async () => {
    const pessoaB = await pessoaDe(contas["B1"]!);
    const sessaoB = await umValor<string>(
      db,
      "SELECT id AS v FROM sessoes WHERE usuario_id = $1 LIMIT 1",
      [contas["B1"]],
    );
    expect(await vigencia(orgA, pessoaB, orgB, sessaoB)).toEqual([]);
    expect(await vigencia(null, pessoaB, orgB, sessaoB)).toEqual([]);
    // A mesma pergunta no contexto certo responde.
    expect((await vigencia(orgB, pessoaB, orgB, sessaoB))[0]).toMatchObject({
      usuario_id: contas["B1"],
      sessao_viva: true,
    });
  });

  it("pessoa sem conta no município do contexto, ou sessão de outra conta: sem conta e sem sessão viva", async () => {
    const pessoaB = await pessoaDe(contas["B1"]!);
    expect(await vigencia(orgA, pessoaB, orgA, sessaoNova)).toEqual([
      expect.objectContaining({
        usuario_id: null,
        conta_ativa: null,
        sessao_viva: false,
        suspenso: false,
      }),
    ]);
    const pessoaA3 = await pessoaDe(contas["A3"]!);
    expect((await vigencia(orgA, pessoaA3, orgA, sessaoNova))[0]).toMatchObject({
      usuario_id: contas["A3"],
      sessao_viva: false,
    });
  });

  it("a sessão rotacionada vale enquanto a família tem sessão de pé; encerrada, não; município suspenso aparece", async () => {
    const pessoa = await pessoaDe(contas["A1"]!);
    const familia = await umValor<string>(db, "SELECT familia_id AS v FROM sessoes WHERE id = $1", [
      sessaoNova,
    ]);
    await db.query(
      "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'rotacionada na renovacao' WHERE id = $1",
      [sessaoNova],
    );
    const filha = await umValor<string>(
      db,
      "SELECT abrir_sessao($1, $2, 'hash-a1-filha', interval '1 day', NULL, NULL, $3) AS v",
      [orgA, contas["A1"], familia],
    );
    expect((await vigencia(orgA, pessoa, orgA, sessaoNova))[0]).toMatchObject({
      sessao_viva: true,
    });
    await db.query(
      "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'encerrada' WHERE id = $1",
      [filha],
    );
    expect((await vigencia(orgA, pessoa, orgA, sessaoNova))[0]).toMatchObject({
      sessao_viva: false,
    });
    await db.query(
      "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'prova' WHERE id = $1",
      [orgA],
    );
    try {
      expect((await vigencia(orgA, pessoa, orgA, sessaoNova))[0]).toMatchObject({ suspenso: true });
    } finally {
      await db.query(
        "UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1",
        [orgA],
      );
    }
  });
});

describe("`credenciais_da_pessoa`: a credencial sai da PESSOA, a conta e o município, da conta", () => {
  it("pelo e-mail, sem diferença de caixa, uma linha por conta da pessoa (hoje, uma), antes do tenant", async () => {
    const r = await comoApp(
      db,
      null,
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM credenciais_da_pessoa('B1@EXEMPLO.GOV.BR')",
          )
        ).rows,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      usuario_id: contas["B1"],
      organizacao_id: orgB,
      papel: "operador",
      ativo: true,
      pessoa_ativa: true,
      municipio: "Vale Fundo",
      uf: "SP",
    });
    expect(
      await comoApp(
        db,
        null,
        async (tx) =>
          (await tx.query("SELECT * FROM credenciais_da_pessoa('ninguem@exemplo.gov.br')")).rows,
      ),
    ).toEqual([]);
  });

  it("lê de `pessoas`, e não de `usuarios` (o hash da pessoa, mudado só nela pelo dono, é o que sai)", async () => {
    const pessoa = await umValor<string>(db, "SELECT pessoa_id AS v FROM usuarios WHERE id = $1", [
      contas["B1"],
    ]);
    const original = await umValor<string>(
      db,
      "SELECT senha_hash AS v FROM pessoas WHERE id = $1",
      [pessoa],
    );
    await db.query("UPDATE pessoas SET senha_hash = 'so-na-pessoa' WHERE id = $1", [pessoa]);
    try {
      expect(
        await umValor<string>(
          db,
          "SELECT senha_hash AS v FROM credenciais_da_pessoa('b1@exemplo.gov.br')",
        ),
      ).toBe("so-na-pessoa");
      expect(
        await umValor<string>(
          db,
          "SELECT senha_hash AS v FROM credenciais_para_login('b1@exemplo.gov.br')",
        ),
      ).toBe(original);
    } finally {
      await db.query("UPDATE pessoas SET senha_hash = $2 WHERE id = $1", [pessoa, original]);
    }
  });
});

/* ======================================================================= */
/* 8. A trava da pessoa (N2), no que dá para provar com uma conexão.        */
/* ======================================================================= */

describe("`travar_pessoa` e `travar_pessoa_da_conta` (N2)", () => {
  const travasConsultivas = async (tx: Transaction) =>
    (
      await tx.query<{ classid: string; objid: string }>(
        `SELECT classid::text, objid::text FROM pg_locks
      WHERE locktype = 'advisory' AND pid = pg_backend_pid() ORDER BY 1, 2`,
      )
    ).rows;

  it("toma uma trava consultiva de transação com chave própria, separada da trava das sessões (049), mesmo com o mesmo uuid", async () => {
    const x = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.query("SELECT travar_pessoa($1)", [x]);
      const so = await travasConsultivas(tx);
      expect(so).toHaveLength(1);
      await tx.query("SELECT travar_sessoes_do_usuario($1)", [x]);
      const duas = await travasConsultivas(tx);
      expect(duas).toHaveLength(2);
      expect(duas[0]!.classid).not.toBe(duas[1]!.classid);
    });
  });

  it("pela conta, no município do contexto, trava a pessoa da conta; conta de outro município, nada; e não devolve o pessoa_id", async () => {
    const pessoaA1 = await umValor<string>(
      db,
      "SELECT pessoa_id AS v FROM usuarios WHERE id = $1",
      [contas["A1"]],
    );
    const esperada = await db.transaction(async (tx) => {
      await tx.query("SELECT travar_pessoa($1)", [pessoaA1]);
      return travasConsultivas(tx);
    });
    const r = await comoApp(db, orgA, async (tx) => {
      const ret = await tx.query<Record<string, unknown>>(
        "SELECT travar_pessoa_da_conta($1) AS r",
        [contas["A1"]],
      );
      return { ret: ret.rows[0]!["r"], travas: await travasConsultivas(tx) };
    });
    expect(r.travas).toEqual(esperada);
    expect(r.ret === null || r.ret === "").toBe(true);
    const deOutro = await comoApp(db, orgB, async (tx) => {
      await tx.query("SELECT travar_pessoa_da_conta($1)", [contas["A1"]]);
      return travasConsultivas(tx);
    });
    expect(deOutro).toEqual([]);
  });
});

/* ======================================================================= */
/* 9. sessoes.pessoa_id.                                                    */
/* ======================================================================= */

describe("`sessoes.pessoa_id`: a sessão carrega a pessoa da conta, presa pela chave composta", () => {
  it("abrir_sessao preenche a pessoa; pessoa de outra conta na sessão é recusada pela chave", async () => {
    const sid = await umValor<string>(
      db,
      "SELECT abrir_sessao($1, $2, 'hash-b1-2', interval '1 day', NULL, NULL) AS v",
      [orgB, contas["B1"]],
    );
    expect(
      await umValor<boolean>(
        db,
        "SELECT s.pessoa_id = u.pessoa_id AS v FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = $1",
        [sid],
      ),
    ).toBe(true);
    const pessoaA1 = await umValor<string>(
      db,
      "SELECT pessoa_id AS v FROM usuarios WHERE id = $1",
      [contas["A1"]],
    );
    const e = await erroDe(
      db.query(
        `INSERT INTO sessoes (organizacao_id, usuario_id, pessoa_id, token_hash, expira_em)
       VALUES ($1, $2, $3, 'hash-trocado', now() + interval '1 day')`,
        [orgB, contas["B1"], pessoaA1],
      ),
    );
    expect(e).toMatchObject({
      code: "23503",
      constraint: "sessoes_conta_e_pessoa_do_mesmo_municipio",
    });
  });
});

/* ======================================================================= */
/* 10. O inventário, conferido contra o banco.                              */
/* ======================================================================= */

/**
 * Toda função do banco cujo corpo cita a credencial (`senha_hash`, falhas,
 * bloqueio, `senha_provisoria_ate`), o e-mail, a pessoa ou a origem da conta.
 * O inventário completo, com o que cada uma faz e a etapa dona, está em
 * `docs/evidencias-v2/G03/V2-F03-E15/inventario-da-credencial.md`. Função nova
 * que cite um desses termos e não esteja aqui reprova, salvo se nascer numa
 * migração DEPOIS da 054 (a etapa dela escreve o caminho no próprio cabeçalho).
 */
const INVENTARIO_DO_BANCO: Readonly<Record<string, string>> = {
  "abrir_recuperacao(text,text,interval,text)":
    "lê o e-mail da conta e abre o link (E08 passa à pessoa)",
  "console_agendar_eliminacao(uuid,text)": "e-mail do operador do console, não de pessoa",
  "console_cancelar_eliminacao(uuid)": "e-mail do operador do console, não de pessoa",
  "console_consumir_recuperacao(uuid,text,text)":
    "credencial do operador do console (console_operadores)",
  "console_reativar_municipio(uuid)": "e-mail do operador do console, não de pessoa",
  "console_recuperacao_por_email(text)":
    "e-mail do operador do console (emissor de prova do console)",
  "console_suspender_municipio(uuid,text)":
    "e-mail do operador; revoga sessões do município (escopo local)",
  "consumir_recuperacao(text,text)":
    "grava a senha da conta do link (espelhada; E08 passa à pessoa)",
  "chave_da_pessoa_nao_muda()": "054 (correção 1): recusa a mudança de pessoas.id",
  "conta_ganha_pessoa()":
    "054: cria a pessoa nova e a marca criador; tira a marca da conta apagada (correção 4)",
  "conferir_origem_da_conta()":
    "054: a leitora (correção 6) confere que a pessoa da conta existe, sem ler coluna nenhuma além do id",
  "credenciais_da_pessoa(text)": "054: lê a credencial da pessoa (E02 passa a chamar)",
  "credenciais_para_login(text)": "lê a credencial da conta (E02 troca; caminho antigo)",
  "envio_so_para_dominio_do_catalogo()": "e-mail de órgão do ofício, não de pessoa",
  "interesse_recente(text)": "e-mail do formulário público, não de pessoa",
  "pessoa_da_conta_nao_muda()": "054: recusa a mudança de pessoa_id",
  "pessoa_espelha_a_conta()": "054: espelho da credencial e do e-mail (passo 1)",
  "provisionar_municipio(text,text,text,text,text,text,text,text)":
    "cria o primeiro administrador com senha (pessoa pelo criador)",
  "registrar_tentativa_login(uuid,boolean,integer,interval)":
    "grava falhas e bloqueio da conta (espelhados)",
  "senha_trocada_deixa_de_ser_provisoria()": "gatilho da 046 em usuarios (E08 move para pessoas)",
  "sessao_carrega_a_pessoa()": "054: a sessão carrega a pessoa da conta",
  "sessao_por_token(text)":
    "lê senha_provisoria_ate da conta na renovação (fora do inventário da ADR)",
  "travar_pessoa(uuid)": "054: trava N2",
  "travar_pessoa_da_conta(uuid)": "054: trava N2 pela conta",
  "trocar_senha(uuid,text,uuid)": "grava a senha da conta (espelhada; E08 passa à pessoa)",
  "vigencia_da_sessao(uuid,uuid,uuid)": "054: vigência de (pessoa, org, sid)",
};

function funcoesDeMigracoesPosteriores(): Set<string> {
  const pasta = join(aqui, "..", "migrations");
  const nomes = new Set<string>();
  for (const f of readdirSync(pasta).filter((x) => x.endsWith(".sql") && x > ARQUIVO_054)) {
    for (const m of readFileSync(join(pasta, f), "utf8").matchAll(
      /FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi,
    )) {
      nomes.add(m[1]!.toLowerCase());
    }
  }
  return nomes;
}

describe("o inventário da credencial bate com o banco", () => {
  it("toda função que cita a credencial, o e-mail ou a pessoa está no inventário, e todo item do inventário existe", async () => {
    const r = await db.query<{ f: string }>(`
      SELECT p.proname || '(' || replace(oidvectortypes(p.proargtypes), ', ', ',') || ')' AS f
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ~* '(senha_hash|falhas_login|bloqueado_ate|senha_provisoria_ate|pessoa_id|\\mpessoas\\M|origens_de_conta|\\memail)'
       ORDER BY 1`);
    const posteriores = funcoesDeMigracoesPosteriores();
    const doBanco = r.rows.map((x) => x.f).filter((f) => !posteriores.has(f.split("(")[0]!));
    expect(
      doBanco.filter((f) => !(f in INVENTARIO_DO_BANCO)),
      "função fora do inventário",
    ).toEqual([]);
    const ausentes = Object.keys(INVENTARIO_DO_BANCO)
      .filter((f) => !posteriores.has(f.split("(")[0]!))
      .filter((f) => !r.rows.some((x) => x.f === f));
    expect(ausentes, "item do inventário que o banco não tem").toEqual([]);
  });
});

/* ======================================================================= */
/* 11. A volta da 054.                                                      */
/* ======================================================================= */

async function fotografiaDoEsquema(bd: ExecutorSql): Promise<Record<string, unknown[]>> {
  const c = async (sql: string) => (await bd.query(sql)).rows;
  return {
    colunas: await c(`SELECT table_name, column_name, data_type, is_nullable, column_default
                        FROM information_schema.columns WHERE table_schema = 'public'
                       ORDER BY table_name, ordinal_position`),
    indices: await c(`SELECT tablename, indexname, indexdef FROM pg_indexes
                       WHERE schemaname = 'public' ORDER BY tablename, indexname`),
    restricoes:
      await c(`SELECT conrelid::regclass::text AS tabela, conname, pg_get_constraintdef(oid) AS def
                           FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`),
    rls: await c(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
                    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`),
    funcoes:
      await c(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef,
                             array_to_string(p.proacl, ',') AS acl
                        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       WHERE n.nspname = 'public' ORDER BY p.proname, args`),
    gatilhos: await c(`SELECT tgrelid::regclass::text AS tabela, tgname, tgenabled
                         FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2`),
    privilegios: await c(`SELECT c.relname, pr,
                                 has_table_privilege('dc360_app', c.oid, pr) AS tabela,
                                 CASE WHEN pr <> 'DELETE'
                                      THEN has_any_column_privilege('dc360_app', c.oid, pr) END AS alguma_coluna
                            FROM pg_class c
                            CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) pr
                           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
                           ORDER BY 1, 2`),
  };
}

describe("a volta da 054", () => {
  it("aplicar, desfazer e reaplicar: colunas, índices, restrições, RLS, funções, gatilhos e privilégios idênticos", async () => {
    const outro = new PGlite();
    await outro.waitReady;
    const bd = executorDe(outro);
    try {
      const ate = ateA054();
      await aplicarMigracoes(bd, ate.slice(0, -1));
      await outro.query(
        `INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC V','Volta','MG')`,
      );
      await outro.query(`INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
                         SELECT id, 'Conta da Volta', 'V-1', 'volta@exemplo.gov.br', 'operador', 'h' FROM organizacoes`);
      const antes = await fotografiaDoEsquema(bd);
      const contaAntes = (await outro.query("SELECT id, email, senha_hash FROM usuarios")).rows;

      await aplicarMigracoes(bd, ate);
      const com = await fotografiaDoEsquema(bd);
      expect(com).not.toEqual(antes);

      const r = await desfazerUltimaMigracao(bd, ate, carregarDesfazeres(), DEV);
      expect(r.desfeita).toBe(ARQUIVO_054);
      expect((await migracoesAplicadas(bd)).map((m) => m.versao)).not.toContain(ARQUIVO_054);
      expect(await fotografiaDoEsquema(bd)).toEqual(antes);
      // Sem perda: a conta de antes continua com o e-mail e a senha.
      expect((await outro.query("SELECT id, email, senha_hash FROM usuarios")).rows).toEqual(
        contaAntes,
      );

      await aplicarMigracoes(bd, ate);
      expect(await fotografiaDoEsquema(bd)).toEqual(com);
      expect((await outro.query("SELECT count(*)::int AS n FROM pessoas")).rows[0]).toEqual({
        n: 1,
      });
    } finally {
      await outro.close();
    }
  }, 240_000);

  it("falha fechada: se um papel do produto continua com TEMP depois do REVOKE (herdado de outro papel), a 054 não aplica", async () => {
    const outro = new PGlite();
    await outro.waitReady;
    const bd = executorDe(outro);
    try {
      const ate = ateA054();
      await aplicarMigracoes(bd, ate.slice(0, -1));
      await outro.exec(`
        CREATE ROLE sonda_herda_temp NOLOGIN;
        DO $$ BEGIN EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO sonda_herda_temp', current_database()); END $$;
        GRANT sonda_herda_temp TO dc360_app;`);
      const e = await erroDe(aplicarMigracoes(bd, ate));
      expect(e.message).toMatch(/TEMP/);
      expect((await migracoesAplicadas(bd)).map((m) => m.versao)).not.toContain(ARQUIVO_054);
    } finally {
      await outro.close();
    }
  }, 240_000);
});

/* ======================================================================= */
/* 12. Correção 1 da E15 (revisão independente do Codex, achados 1 a 5 e 7) */
/* ======================================================================= */

/** Os campos do erro que alguém do lado de fora consegue comparar. */
const formaDoErro = (e: Erro & Record<string, unknown>) => ({
  code: e.code,
  message: e.message,
  detail: e["detail"],
  hint: e["hint"],
  schema: e["schema"],
  table: e["table"],
  column: e["column"],
  constraint: e.constraint,
});

/** Roda `fn` numa transação que SEMPRE volta (a sonda nunca deixa rastro). */
async function semRastro(fn: (tx: Transaction) => Promise<void>): Promise<Erro> {
  return erroDe(
    db.transaction(async (tx) => {
      await fn(tx);
      throw Object.assign(new Error("a sonda passou inteira, sem recusa"), { code: "SONDA" });
    }),
  );
}

describe("correção 1, achado 1: as funções de gatilho não servem a outra tabela, e o app não cria tabela temporária", () => {
  const TABELA_FALSA = `CREATE TEMP TABLE usuarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organizacao_id uuid, nome text, email text,
      pessoa_id uuid, senha_hash text, falhas_login int DEFAULT 0, bloqueado_ate timestamptz,
      senha_provisoria_ate timestamptz, ativo boolean DEFAULT true) ON COMMIT DROP`;

  it("o ataque relatado: o dc360_app cria TEMP `usuarios`, anexa o espelho e escreve a credencial de outra pessoa. Recusado, e a pessoa não muda", async () => {
    const pessoaB1 = await umValor<string>(
      db,
      "SELECT pessoa_id AS v FROM usuarios WHERE id = $1",
      [contas["B1"]],
    );
    const antes = await umValor<string>(db, "SELECT senha_hash AS v FROM pessoas WHERE id = $1", [
      pessoaB1,
    ]);
    const e = await semRastro(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_app");
      await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgA]);
      await tx.exec(TABELA_FALSA);
      await tx.exec(`CREATE TRIGGER espelho_na_falsa AFTER UPDATE ON pg_temp.usuarios
                       FOR EACH ROW EXECUTE FUNCTION public.pessoa_espelha_a_conta()`);
      await tx.query(
        "INSERT INTO pg_temp.usuarios (organizacao_id, pessoa_id, email, senha_hash) VALUES ($1, $2, 'x@x', 'velha')",
        [orgA, pessoaB1],
      );
      await tx.exec("UPDATE pg_temp.usuarios SET senha_hash = 'senha-do-atacante'");
    });
    expect(e.code).toBe("42501");
    expect(e.message).toMatch(/permission denied/);
    expect(
      await umValor<string>(db, "SELECT senha_hash AS v FROM pessoas WHERE id = $1", [pessoaB1]),
    ).toBe(antes);
  });

  it("o dc360_app, o dc360_console e PUBLIC não têm TEMP no banco", async () => {
    const r = await db.query<{ papel: string; temp: boolean }>(`
      SELECT p AS papel, has_database_privilege(p, current_database(), 'TEMPORARY') AS temp
        FROM unnest(ARRAY['dc360_app', 'dc360_console', 'public']) AS p ORDER BY 1`);
    expect(r.rows).toEqual([
      { papel: "dc360_app", temp: false },
      { papel: "dc360_console", temp: false },
      { papel: "public", temp: false },
    ]);
  });

  it("nenhum papel do produto executa função de gatilho da 054; e mesmo com TEMP devolvido, o app não anexa o espelho nem o criador", async () => {
    const r = await db.query<{ f: string; quem: string[] }>(`
      SELECT p.proname::text AS f,
             ARRAY(SELECT x FROM unnest(ARRAY['dc360_app', 'dc360_console', 'public']) x
                    WHERE has_function_privilege(x, p.oid, 'EXECUTE')) AS quem
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
         AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid
                        AND t.tgrelid IN ('usuarios'::regclass, 'pessoas'::regclass,
                                          'origens_de_conta'::regclass, 'sessoes'::regclass))
         AND p.proname NOT IN ('foto_cabe_no_teto', 'senha_trocada_deixa_de_ser_provisoria',
                               'invalidar_recuperacoes_pendentes',
                               -- da 053 (E04, junção do lote 1): SECURITY INVOKER, de antes da 054
                               'usuarios_papel_nao_se_converte')
       ORDER BY 1`);
    expect(r.rows.map((l) => l.f)).toEqual(
      expect.arrayContaining(["conta_ganha_pessoa", "pessoa_espelha_a_conta"]),
    );
    for (const l of r.rows) expect(l.quem, l.f).toEqual([]);
    for (const [f, quando] of [
      ["pessoa_espelha_a_conta", "AFTER UPDATE"],
      ["conta_ganha_pessoa", "BEFORE INSERT"],
    ] as const) {
      const e = await semRastro(async (tx) => {
        await tx.exec(
          "DO $$ BEGIN EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO dc360_app', current_database()); END $$",
        );
        await tx.exec("SET LOCAL ROLE dc360_app");
        await tx.exec(TABELA_FALSA);
        await tx.exec(
          `CREATE TRIGGER sonda ${quando} ON pg_temp.usuarios FOR EACH ROW EXECUTE FUNCTION public.${f}()`,
        );
      });
      expect(e.code, f).toBe("42501");
      expect(e.message, f).toMatch(/permission denied for function/);
    }
  });

  it("anexadas pelo DONO a uma tabela que não é `public.usuarios`, as duas funções privilegiadas recusam, sem escrever nada", async () => {
    const pessoaB1 = await umValor<string>(
      db,
      "SELECT pessoa_id AS v FROM usuarios WHERE id = $1",
      [contas["B1"]],
    );
    const pessoasAntes = await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas");
    const marcasAntes = await umValor<number>(
      db,
      "SELECT count(*)::int AS v FROM origens_de_conta",
    );
    const espelho = await semRastro(async (tx) => {
      await tx.exec(TABELA_FALSA);
      await tx.exec(`CREATE TRIGGER sonda AFTER UPDATE ON pg_temp.usuarios
                       FOR EACH ROW EXECUTE FUNCTION public.pessoa_espelha_a_conta()`);
      await tx.query(
        "INSERT INTO pg_temp.usuarios (organizacao_id, pessoa_id, email) VALUES ($1, $2, 'x@x')",
        [orgB, pessoaB1],
      );
      await tx.exec("UPDATE pg_temp.usuarios SET senha_hash = 'pelo-dono-na-falsa'");
    });
    expect(espelho.code).toBe("42501");
    expect(espelho.message).toMatch(/so serve/);
    const criador = await semRastro(async (tx) => {
      await tx.exec(TABELA_FALSA);
      await tx.exec(`CREATE TRIGGER sonda BEFORE INSERT ON pg_temp.usuarios
                       FOR EACH ROW EXECUTE FUNCTION public.conta_ganha_pessoa()`);
      await tx.query(
        "INSERT INTO pg_temp.usuarios (organizacao_id, nome, email) VALUES ($1, 'Falsa', 'falsa.criador@exemplo.gov.br')",
        [orgB],
      );
    });
    expect(criador.code).toBe("42501");
    expect(criador.message).toMatch(/so serve/);
    expect(await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas")).toBe(pessoasAntes);
    expect(await umValor<number>(db, "SELECT count(*)::int AS v FROM origens_de_conta")).toBe(
      marcasAntes,
    );
  });
});

describe("correção 1, achado 2: `credenciais_da_pessoa` é só do login, antes do município", () => {
  it("com município no contexto, recusa (42501), seja o e-mail de outro município ou do próprio", async () => {
    for (const [ctx, email] of [
      [orgA, "B1@EXEMPLO.GOV.BR"],
      [orgA, "a1@exemplo.gov.br"],
      [orgB, "b1@exemplo.gov.br"],
    ] as const) {
      const e = await erroDe(
        comoApp(db, ctx, (tx) => tx.query("SELECT * FROM credenciais_da_pessoa($1)", [email])),
      );
      expect(e.code, email).toBe("42501");
      expect(e.message, email).toMatch(/antes do municipio/);
    }
  });

  it("sem contexto, continua respondendo (o outro lado, o do login)", async () => {
    const r = await comoApp(
      db,
      null,
      async (tx) =>
        (
          await tx.query<{ usuario_id: string }>(
            "SELECT usuario_id FROM credenciais_da_pessoa('b1@exemplo.gov.br')",
          )
        ).rows,
    );
    expect(r).toEqual([{ usuario_id: contas["B1"] }]);
  });
});

describe("correção 1, achado 3: sem contexto válido, o cadastro recusa igual, com e-mail existente ou livre", () => {
  const inserir = (ctx: string | null, org: string, email: string) =>
    erroDe(
      comoApp(db, ctx, (tx) =>
        tx.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
           VALUES ($1, 'Sonda do Oráculo', $2, $3, 'operador')`,
          [org, `M-OR-${Math.random().toString(36).slice(2, 8)}`, email],
        ),
      ),
    );

  it("sem contexto: o mesmo erro (código, mensagem, detalhe, restrição, tabela) para e-mail existente e livre, e nenhuma pessoa nova", async () => {
    const pessoasAntes = await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas");
    const existente = await inserir(null, orgA, "a1@exemplo.gov.br");
    const livre = await inserir(null, orgA, "ninguem.oraculo@exemplo.gov.br");
    expect(existente.code).toBe("42501");
    expect(formaDoErro(existente as Erro & Record<string, unknown>)).toEqual(
      formaDoErro(livre as Erro & Record<string, unknown>),
    );
    expect(await umValor<number>(db, "SELECT count(*)::int AS v FROM pessoas")).toBe(pessoasAntes);
  });

  it("com o contexto de outro município: o mesmo erro para e-mail existente e livre", async () => {
    const existente = await inserir(orgA, orgB, "b1@exemplo.gov.br");
    const livre = await inserir(orgA, orgB, "ninguem.oraculo.2@exemplo.gov.br");
    expect(existente.code).toBe("42501");
    expect(formaDoErro(existente as Erro & Record<string, unknown>)).toEqual(
      formaDoErro(livre as Erro & Record<string, unknown>),
    );
  });
});

describe("correção 1, achado 4: `ON CONFLICT DO NOTHING` não deixa pessoa nem marca sem conta", () => {
  const contagens = async () =>
    (
      await db.query<{ pessoas: number; marcas: number; com_email: number }>(`
        SELECT (SELECT count(*)::int FROM pessoas) AS pessoas,
               (SELECT count(*)::int FROM origens_de_conta) AS marcas,
               (SELECT count(*)::int FROM pessoas WHERE email LIKE 'conflito.%') AS com_email`)
    ).rows[0]!;

  it("matrícula já existente, id novo e e-mail livre, pelo dc360_app no município e pelo dono: a transação volta inteira", async () => {
    const antes = await contagens();
    const sql = `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
                 VALUES ($1, 'Conflito', 'M-A1', $2, 'operador')
                 ON CONFLICT (organizacao_id, matricula) DO NOTHING`;
    const peloApp = await erroDe(
      comoApp(db, orgA, (tx) => tx.query(sql, [orgA, "conflito.app@exemplo.gov.br"])),
    );
    expect(peloApp).toMatchObject({ code: "23514", constraint: "usuarios_origem_da_pessoa" });
    const peloDono = await erroDe(db.query(sql, [orgA, "conflito.dono@exemplo.gov.br"]));
    expect(peloDono).toMatchObject({ code: "23514", constraint: "usuarios_origem_da_pessoa" });
    expect(await contagens()).toEqual(antes);
    expect(antes.com_email).toBe(0);
  });

  it("o mesmo comando sem conflito continua passando (a conta, a pessoa e a marca nascem juntas)", async () => {
    await comoApp(db, orgA, (tx) =>
      tx.query(
        `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
         VALUES ($1, 'Sem Conflito', 'M-SEM-CONFLITO', 'sem.conflito@exemplo.gov.br', 'operador')
         ON CONFLICT (organizacao_id, matricula) DO NOTHING`,
        [orgA],
      ),
    );
    expect(
      await umValor<number>(
        db,
        `SELECT count(*)::int AS v FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id
           JOIN origens_de_conta o ON o.usuario_id = u.id AND o.pessoa_id = p.id
          WHERE u.email = 'sem.conflito@exemplo.gov.br'`,
      ),
    ).toBe(1);
  });
});

describe("correção 1, achado 5: o espelho dispara antes do gatilho dos links (N4 antes de N7)", () => {
  it("entre os gatilhos AFTER UPDATE de `usuarios`, o do espelho vem antes do da 051 (ordem alfabética do Postgres)", async () => {
    const r = await db.query<{ funcao: string }>(`
      SELECT tgfoid::regproc::text AS funcao FROM pg_trigger
       WHERE tgrelid = 'usuarios'::regclass AND NOT tgisinternal
         AND (tgtype & 1) = 1 AND (tgtype & 2) = 0 AND (tgtype & 16) = 16
       ORDER BY tgname`);
    const ordem = r.rows.map((x) => x.funcao);
    expect(ordem).toContain("pessoa_espelha_a_conta");
    expect(ordem.indexOf("pessoa_espelha_a_conta")).toBeLessThan(
      ordem.indexOf("invalidar_recuperacoes_pendentes"),
    );
  });
});

describe("correção 1, achado 7: `pessoas.id` não muda", () => {
  it("UPDATE de `pessoas.id` pelo dono, direto: recusado; reescrever o mesmo valor passa", async () => {
    const pessoa = await umValor<string>(db, "SELECT pessoa_id AS v FROM usuarios WHERE id = $1", [
      contas["A1"],
    ]);
    const e = await semRastro(async (tx) => {
      await tx.query("UPDATE pessoas SET id = gen_random_uuid() WHERE id = $1", [pessoa]);
    });
    expect(e).toMatchObject({ code: "23514", constraint: "pessoas_id_nao_muda" });
    await db.query("UPDATE pessoas SET id = id WHERE id = $1", [pessoa]);
    expect(
      await umValor<number>(db, "SELECT count(*)::int AS v FROM usuarios WHERE pessoa_id = $1", [
        pessoa,
      ]),
    ).toBe(1);
  });
});

/* ======================================================================= */
/* 12b. Correção 4 da ADR 0009 (junção do lote 1): a marca sai com a     */
/*      conta (o verificador adiado, leitora separada, no bloco 12c).    */
/* ======================================================================= */

describe("correção 4 da ADR 0009: a marca sai com a conta que descreve, e só com ela", () => {
  const retratoDasMarcas = async (excluir: string) =>
    (
      await db.query<{ l: string }>(
        "SELECT row_to_json(o)::text AS l FROM origens_de_conta o WHERE o.usuario_id <> $1 ORDER BY 1",
        [excluir],
      )
    ).rows.map((x) => x.l);

  it("a conta apagada pelo dono leva a marca dela, e só ela: as outras marcas ficam iguais, valor por valor, e nenhuma fica sem conta", async () => {
    const id = await umValor<string>(
      db,
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1, 'Conta que Sai', 'M-SAI', 'conta.sai@exemplo.gov.br', 'operador') RETURNING id AS v`,
      [orgB],
    );
    expect(
      await umValor<number>(
        db,
        "SELECT count(*)::int AS v FROM origens_de_conta WHERE usuario_id = $1",
        [id],
      ),
    ).toBe(1);
    const antes = await retratoDasMarcas(id);
    await db.query("DELETE FROM usuarios WHERE id = $1", [id]);
    expect(
      await umValor<number>(
        db,
        "SELECT count(*)::int AS v FROM origens_de_conta WHERE usuario_id = $1",
        [id],
      ),
    ).toBe(0);
    expect(await retratoDasMarcas(id)).toEqual(antes);
    // A pessoa da conta apagada fica (global).
    expect(
      await umValor<number>(
        db,
        "SELECT count(*)::int AS v FROM pessoas WHERE email = 'conta.sai@exemplo.gov.br'",
      ),
    ).toBe(1);
  });

  it("a marca de conta VIVA não se apaga, nem pelo dono; a de conta que já não existe, sim (pelo dono)", async () => {
    const viva = await erroDe(
      db.query("DELETE FROM origens_de_conta WHERE usuario_id = $1", [contas["B1"]]),
    );
    expect(viva.code).toBe("42501");
    expect(viva.message).toMatch(/nao se apaga enquanto a conta que ela descreve existe/);
    // UPDATE e TRUNCATE continuam recusados sempre.
    expect(
      (
        await erroDe(
          db.query("UPDATE origens_de_conta SET origem = origem WHERE usuario_id = $1", [
            contas["B1"],
          ]),
        )
      ).code,
    ).toBe("42501");
    expect((await erroDe(db.query("TRUNCATE origens_de_conta"))).code).toBe("42501");
  });

  it("falha fechada: quem apaga sem enxergar todas as contas (o RLS de usuarios vale para ele) é recusado mesmo para marca sem conta", async () => {
    const orfa = crypto.randomUUID();
    const pessoa = await umValor<string>(
      db,
      "INSERT INTO pessoas (nome, email) VALUES ('Marca Orfa', 'marca.orfa@exemplo.gov.br') RETURNING id AS v",
    );
    await db.query(
      "INSERT INTO origens_de_conta (usuario_id, pessoa_id, origem, transacao) VALUES ($1, $2, 'criador', pg_current_xact_id())",
      [orfa, pessoa],
    );
    const e = await semRastro(async (tx) => {
      await tx.exec("CREATE ROLE sonda_sem_bypass NOLOGIN");
      await tx.exec("GRANT SELECT ON usuarios TO sonda_sem_bypass");
      await tx.exec("GRANT SELECT, DELETE ON origens_de_conta TO sonda_sem_bypass");
      await tx.exec(
        "CREATE POLICY sonda_todas ON origens_de_conta FOR ALL TO sonda_sem_bypass USING (true)",
      );
      await tx.exec("SET LOCAL ROLE sonda_sem_bypass");
      await tx.query("DELETE FROM origens_de_conta WHERE usuario_id = $1", [orfa]);
    });
    expect(e.code).toBe("42501");
    expect(e.message).toMatch(/quem apaga nao enxerga todas as contas/);
    // O dono, que enxerga todas, apaga a marca sem conta.
    await db.query("DELETE FROM origens_de_conta WHERE usuario_id = $1", [orfa]);
  });

  it("conta inserida e apagada na mesma transação: a marca sai com ela, e o verificador recusa no fim (falha fechada)", async () => {
    const e = await erroDe(
      db.transaction(async (tx) => {
        const id = await umValor<string>(
          tx,
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
           VALUES ($1, 'Conta de Passagem', 'M-PAS', 'passagem@exemplo.gov.br', 'operador') RETURNING id AS v`,
          [orgA],
        );
        await tx.query("DELETE FROM usuarios WHERE id = $1", [id]);
      }),
    );
    expect(e).toMatchObject({ code: "23514", constraint: "usuarios_origem_da_pessoa" });
  });

  it("a eliminação de verdade (numa cópia, com COMMIT): as marcas do município eliminado somem, as do outro ficam iguais, e a pessoa fica", async () => {
    const tabelas = CATALOGO_F03_E15.excecoes.filter((x) => x.semMunicipio);
    expect(tabelas.map((x) => [x.tabela, x.semMunicipio!.naEliminacao.destino])).toEqual([
      ["pessoas", "fica"],
      ["origens_de_conta", "some"],
    ]);
    expect(await conferirEliminacaoSemMunicipio(db, tabelas)).toEqual([]);
  });
});

/* ======================================================================= */
/* 12c. Correção 6 da ADR 0009 (junção do lote 1): a leitora separada.      */
/* ======================================================================= */

/**
 * Os contadores de escrita da transação de toda tabela e o estado de toda
 * sequência (`last_value` e `is_called`, lidos da própria sequência: o
 * `pg_sequences` não tem `is_called`). Lidos como dono.
 */
async function contadoresDaTransacao(tx: Transaction) {
  const tabelas = (
    await tx.query<{ relname: string; ins: string; upd: string; del: string }>(
      `SELECT relname::text AS relname, n_tup_ins::text AS ins, n_tup_upd::text AS upd,
              n_tup_del::text AS del
         FROM pg_stat_xact_user_tables ORDER BY relname`,
    )
  ).rows;
  const nomes = (
    await tx.query<{ seq: string }>(
      `SELECT quote_ident(schemaname) || '.' || quote_ident(sequencename) AS seq
         FROM pg_sequences ORDER BY 1`,
    )
  ).rows;
  const sequencias: Array<{ seq: string; estado: unknown }> = [];
  for (const { seq } of nomes) {
    const r = await tx.query(`SELECT last_value::text AS v, is_called AS c FROM ${seq}`);
    sequencias.push({ seq, estado: r.rows[0] });
  }
  return { tabelas, sequencias };
}

const CABECALHO_DA_LEITORA = `CREATE OR REPLACE FUNCTION public.conferir_origem_da_conta() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $leitora$`;

describe("correção 6 da ADR 0009: o verificador adiado é a leitora separada, que só lê", () => {
  let semConta = "";
  let corpoReal = "";

  beforeAll(async () => {
    semConta = await umValor<string>(
      db,
      "INSERT INTO pessoas (nome, email) VALUES ('Pessoa da Prova da Leitora', 'prova.leitora@exemplo.gov.br') RETURNING id AS v",
    );
    corpoReal = await umValor<string>(
      db,
      "SELECT prosrc AS v FROM pg_proc WHERE oid = 'public.conferir_origem_da_conta()'::regprocedure",
    );
  });

  /** O corpo real com um trecho antes do último `RETURN NULL` (o ramo de linha). */
  const sabotado = (trecho: string) => {
    const i = corpoReal.lastIndexOf("RETURN NULL;");
    return `${corpoReal.slice(0, i)}${trecho}\n  ${corpoReal.slice(i)}`;
  };

  /**
   * Numa transação desfeita no fim: (a leitora trocada pelo corpo dado, se
   * houver), o cadastro do dc360_app no município, o ponto de salvamento, a
   * leitura, o disparo do adiado com SET CONSTRAINTS ... IMMEDIATE e a leitura
   * de novo (depois de voltar ao ponto de salvamento, se o adiado recusou).
   */
  const dispararNaTransacao = async (
    opcoes: {
      preparo?: string;
      corpo?: string;
      antesDoInsert?: (tx: Transaction) => Promise<void>;
    } = {},
  ) => {
    const r: {
      antes?: Awaited<ReturnType<typeof contadoresDaTransacao>>;
      depois?: Awaited<ReturnType<typeof contadoresDaTransacao>>;
      erro: Erro | null;
    } = { erro: null };
    await db.transaction(async (tx) => {
      if (opcoes.preparo) await tx.exec(opcoes.preparo);
      if (opcoes.corpo) await tx.exec(`${CABECALHO_DA_LEITORA}${opcoes.corpo}$leitora$`);
      if (opcoes.antesDoInsert) {
        await opcoes.antesDoInsert(tx);
      } else {
        await tx.exec("SET LOCAL ROLE dc360_app");
        await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgA]);
        await tx.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
         VALUES ($1, 'Prova da Leitora', 'M-LEI', 'conta.leitora@exemplo.gov.br', 'operador')`,
          [orgA],
        );
        await tx.exec("RESET ROLE");
      }
      await tx.exec("SAVEPOINT antes_do_adiado");
      r.antes = await contadoresDaTransacao(tx);
      try {
        await tx.exec("SET CONSTRAINTS usuarios_origem_da_pessoa IMMEDIATE");
      } catch (e) {
        r.erro = e as Erro;
        await tx.exec("ROLLBACK TO SAVEPOINT antes_do_adiado");
      }
      r.depois = await contadoresDaTransacao(tx);
      await tx.rollback();
    });
    return r;
  };

  it("no catálogo do banco: os dois gatilhos de conferência executam conferir_origem_da_conta, e nenhum AFTER INSERT de usuarios executa conta_ganha_pessoa", async () => {
    const r = await db.query<{ gatilho: string; funcao: string; depois_do_insert: boolean }>(`
      SELECT t.tgname::text AS gatilho, t.tgfoid::regproc::text AS funcao,
             (t.tgtype::int & 2) = 0 AND (t.tgtype::int & 4) <> 0 AS depois_do_insert
        FROM pg_trigger t
       WHERE t.tgrelid = 'public.usuarios'::regclass AND NOT t.tgisinternal
         AND t.tgfoid IN ('public.conferir_origem_da_conta()'::regprocedure,
                          'public.conta_ganha_pessoa()'::regprocedure)
       ORDER BY 1`);
    expect(r.rows).toEqual([
      { gatilho: "usuarios_ganha_pessoa", funcao: "conta_ganha_pessoa", depois_do_insert: false },
      {
        gatilho: "usuarios_marca_sai_com_a_conta",
        funcao: "conta_ganha_pessoa",
        depois_do_insert: false,
      },
      {
        gatilho: "usuarios_nenhuma_pessoa_sem_conta",
        funcao: "conferir_origem_da_conta",
        depois_do_insert: true,
      },
      {
        gatilho: "usuarios_origem_da_pessoa",
        funcao: "conferir_origem_da_conta",
        depois_do_insert: true,
      },
    ]);
  });

  it("a leitora real passa na lista permitida, com o search_path fixo, e nenhum papel do produto a executa", async () => {
    expect(conferirCorpoDaLeitora(corpoReal)).toEqual([]);
    const p = (
      await db.query<{ config: string[]; quem: string[] }>(`
        SELECT p.proconfig AS config,
               ARRAY(SELECT x FROM unnest(ARRAY['dc360_app', 'dc360_console', 'public']) x
                      WHERE has_function_privilege(x, p.oid, 'EXECUTE')) AS quem
          FROM pg_proc p WHERE p.oid = 'public.conferir_origem_da_conta()'::regprocedure`)
    ).rows[0]!;
    expect(p).toEqual({ config: ["search_path=pg_catalog, public, pg_temp"], quem: [] });
  });

  it("prova adicional por contadores: o adiado disparado com IMMEDIATE não muda contador nem sequência, no caminho que passa e nos que recusam", async () => {
    const passa = await dispararNaTransacao();
    expect(passa.erro).toBeNull();
    // A leitura enxerga a escrita da transação (a conta, a pessoa e a marca).
    const linha = (n: string) => passa.antes!.tabelas.find((l) => l.relname === n);
    expect(Number(linha("origens_de_conta")?.ins)).toBeGreaterThan(0);
    expect(passa.depois).toEqual(passa.antes);

    // Recusa 1: um BEFORE INSERT de teste depois do criador troca o pessoa_id.
    const troca = await dispararNaTransacao({
      preparo: `
        CREATE FUNCTION sonda_troca_a_pessoa_leitora() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.pessoa_id := '${semConta}'::uuid; RETURN NEW; END $$;
        CREATE TRIGGER zz_sonda_troca_a_pessoa_leitora BEFORE INSERT ON usuarios
          FOR EACH ROW EXECUTE FUNCTION sonda_troca_a_pessoa_leitora();`,
    });
    expect(troca.erro).toMatchObject({ code: "23514", constraint: "usuarios_origem_da_pessoa" });
    expect(troca.depois).toEqual(troca.antes);

    // Recusa 2: conta sem marca (o criador desligado por DDL, só nesta transação).
    const semMarca = await dispararNaTransacao({
      preparo: "ALTER TABLE usuarios DISABLE TRIGGER usuarios_ganha_pessoa",
      antesDoInsert: async (tx) => {
        await tx.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, pessoa_id)
           VALUES ($1, 'Sem Marca da Leitora', 'M-LSM', 'sem.marca.leitora@exemplo.gov.br', 'operador', $2)`,
          [orgA, semConta],
        );
      },
    });
    expect(semMarca.erro).toMatchObject({ code: "23514", constraint: "usuarios_origem_da_pessoa" });
    expect(semMarca.depois).toEqual(semMarca.antes);
  });

  it("as sete sabotagens da correção 6: todas reprovam na lista permitida; as que escrevem (tabela ou sequência) também nos contadores", async () => {
    const PREPARO = `
      CREATE TABLE public.sonda_aux_leitora (x int);
      CREATE SEQUENCE public.sonda_seq_leitora;
      CREATE FUNCTION public.sonda_auxiliar_que_escreve() RETURNS void LANGUAGE sql
        AS 'INSERT INTO public.sonda_aux_leitora VALUES (1)';`;
    const MARCA =
      "INSERT INTO public.origens_de_conta (usuario_id, pessoa_id, origem, transacao) " +
      "VALUES (gen_random_uuid(), gen_random_uuid(), 'criador', pg_current_xact_id()); " +
      "DELETE FROM public.origens_de_conta WHERE transacao = pg_current_xact_id() AND origem = 'criador' AND usuario_id NOT IN (SELECT id FROM public.usuarios);";
    const casos: Array<[string, string, boolean]> = [
      ["pg_notify", "PERFORM pg_notify('x', NEW.id::text);", false],
      ["pg_advisory_lock", "PERFORM pg_advisory_lock(1);", false],
      ["set_config", "PERFORM set_config('dc360.x', 'y', false);", false],
      ["nextval", "PERFORM nextval('public.sonda_seq_leitora');", true],
      ["função auxiliar que escreve", "PERFORM public.sonda_auxiliar_que_escreve();", true],
      ["marca temporária inserida e apagada", MARCA, true],
      [
        "a mesma escrita num bloco EXCEPTION",
        `BEGIN ${MARCA} RAISE EXCEPTION 'sonda'; EXCEPTION WHEN OTHERS THEN NULL; END;`,
        true,
      ],
    ];
    for (const [nome, trecho, contadoresVeem] of casos) {
      const corpo = sabotado(trecho);
      expect(
        conferirCorpoDaLeitora(corpo).length,
        `${nome}: a lista permitida reprova`,
      ).toBeGreaterThan(0);
      const r = await dispararNaTransacao({ preparo: PREPARO, corpo });
      expect(r.erro, `${nome}: a leitora sabotada ainda passa no caminho de aceite`).toBeNull();
      if (contadoresVeem) {
        expect(r.depois, `${nome}: os contadores veem a escrita`).not.toEqual(r.antes);
      } else {
        // O que nenhum contador vê: é o que a lista permitida tira do alcance.
        expect(r.depois, `${nome}: os contadores não veem`).toEqual(r.antes);
      }
    }
    // A trava consultiva de SESSÃO da sabotagem não sai com o ROLLBACK.
    await db.query("SELECT pg_advisory_unlock_all()");
  });
});

/* ======================================================================= */
/* 13. Em Postgres real: duas conexões.                                     */
/* ======================================================================= */

const URL_DE_PROVA = process.env["DC360_POSTGRES_DE_PROVA"] ?? "";

// O bloco abaixo PULA sem a variável. Pular em silêncio parece verde: o aviso diz
// o que não foi provado e como rodar (junção do lote 1 da F03).
if (!URL_DE_PROVA) {
  console.warn(
    "Testes de Postgres real de pessoas.test.ts PULADOS: DC360_POSTGRES_DE_PROVA não está definida. " +
      "Aponte-a para um Postgres descartável (ex.: postgres://postgres:postgres@localhost:5432/postgres) " +
      "para provar a trava da pessoa e a corrida do cadastro com duas conexões; o job `implantavel` do CI a define.",
  );
}

describe.skipIf(!URL_DE_PROVA)(
  "Em Postgres real: a trava da pessoa e a corrida do cadastro",
  () => {
    let nomeDoBanco = "";
    let dono: pg.Client;
    let org1 = "";
    let org2 = "";
    let conta1 = "";
    let pessoa1 = "";

    const urlDoBanco = (nome: string) => {
      const u = new URL(URL_DE_PROVA);
      u.pathname = `/${nome}`;
      return u.toString();
    };
    const conectar = async () => {
      const c = new pg.Client({ connectionString: urlDoBanco(nomeDoBanco) });
      await c.connect();
      return c;
    };

    beforeAll(async () => {
      nomeDoBanco = `prova_e15_${Math.random().toString(36).slice(2, 10)}`;
      const admin = new pg.Client({ connectionString: URL_DE_PROVA });
      await admin.connect();
      await admin.query(`CREATE DATABASE ${nomeDoBanco}`);
      await admin.end();
      dono = await conectar();
      await aplicarMigracoes(
        {
          query: async <T>(sql: string, params?: readonly unknown[]) => {
            const r = await dono.query(sql, params ? [...params] : undefined);
            return { rows: r.rows as T[] };
          },
          exec: (sql: string) => dono.query(sql),
        },
        ateA054(),
      );
      org1 = (
        await dono.query(
          "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC Um','Um','MG') RETURNING id",
        )
      ).rows[0].id;
      org2 = (
        await dono.query(
          "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC Dois','Dois','MG') RETURNING id",
        )
      ).rows[0].id;
      const c = await dono.query(
        "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel) VALUES ($1,'Conta Um','U-1','um@exemplo.gov.br','operador') RETURNING id, pessoa_id",
        [org1],
      );
      conta1 = c.rows[0].id;
      pessoa1 = c.rows[0].pessoa_id;
    }, 180_000);

    afterAll(async () => {
      await dono?.end();
      if (nomeDoBanco) {
        const admin = new pg.Client({ connectionString: URL_DE_PROVA });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`);
        await admin.end();
      }
    });

    /** Espera até `pid` ficar parado numa trava (granted = false), ou desiste. */
    async function parado(pid: number, tipo: string): Promise<boolean> {
      for (let i = 0; i < 100; i++) {
        const r = await dono.query(
          "SELECT count(*)::int AS n FROM pg_locks WHERE pid = $1 AND NOT granted AND locktype = $2",
          [pid, tipo],
        );
        if (r.rows[0].n > 0) return true;
        await new Promise((ok) => setTimeout(ok, 50));
      }
      return false;
    }

    /**
     * Prova adicional na CONFIRMAÇÃO (correção 6 da ADR 0009, item 4): a
     * conexão que escreve confirma, pede a descarga e faz um comando seguinte;
     * a que lê limpa a fotografia antes de cada leitura.
     */
    const acumulados = async () => {
      await dono.query("SELECT pg_stat_clear_snapshot()");
      const r = await dono.query<{ relname: string; ins: number; upd: number; del: number }>(
        `SELECT relname::text AS relname, n_tup_ins::int AS ins, n_tup_upd::int AS upd,
                n_tup_del::int AS del
           FROM pg_stat_user_tables ORDER BY relname`,
      );
      return new Map(r.rows.map((l) => [l.relname, l]));
    };
    const diferenca = (
      antes: Map<string, { ins: number; upd: number; del: number }>,
      depois: Map<string, { ins: number; upd: number; del: number }>,
    ) => {
      const d: Record<string, { ins: number; upd: number; del: number }> = {};
      for (const [nome, x] of depois) {
        const a = antes.get(nome) ?? { ins: 0, upd: 0, del: 0 };
        const y = { ins: x.ins - a.ins, upd: x.upd - a.upd, del: x.del - a.del };
        if (y.ins || y.upd || y.del) d[nome] = y;
      }
      return d;
    };
    const descarregar = async (c: pg.Client) => {
      await c.query("SELECT pg_stat_force_next_flush()");
      await c.query("SELECT 1");
    };

    it("na confirmação: a diferença acumulada é exatamente usuarios, pessoas e origens_de_conta +1 inserção; e a sabotagem da marca temporária aparece", async () => {
      await descarregar(dono);
      const a = await conectar();
      try {
        await descarregar(a);
        const inserir = async (email: string, sabotagem?: string) => {
          await a.query("BEGIN");
          if (sabotagem) await a.query(sabotagem);
          await a.query("SET LOCAL ROLE dc360_app");
          await a.query("SELECT set_config('app.organizacao_atual', $1, true)", [org2]);
          await a.query(
            "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel) VALUES ($1, 'Confirma', $2, $3, 'operador')",
            [org2, `CF-${email}`, email],
          );
          await a.query("COMMIT");
          await descarregar(a);
        };

        const antes = await acumulados();
        await inserir("confirma.leitora@exemplo.gov.br");
        expect(diferenca(antes, await acumulados())).toEqual({
          origens_de_conta: { ins: 1, upd: 0, del: 0 },
          pessoas: { ins: 1, upd: 0, del: 0 },
          usuarios: { ins: 1, upd: 0, del: 0 },
        });

        // A sabotagem: a leitora que insere e apaga uma marca temporária.
        const corpo = (
          await dono.query<{ v: string }>(
            "SELECT prosrc AS v FROM pg_proc WHERE oid = 'public.conferir_origem_da_conta()'::regprocedure",
          )
        ).rows[0]!.v;
        const i = corpo.lastIndexOf("RETURN NULL;");
        const MARCA =
          "INSERT INTO public.origens_de_conta (usuario_id, pessoa_id, origem, transacao) " +
          "VALUES (gen_random_uuid(), gen_random_uuid(), 'criador', pg_current_xact_id()); " +
          "DELETE FROM public.origens_de_conta WHERE transacao = pg_current_xact_id() AND origem = 'criador' " +
          "AND usuario_id NOT IN (SELECT id FROM public.usuarios);";
        const recriar = (c: string) =>
          "CREATE OR REPLACE FUNCTION public.conferir_origem_da_conta() RETURNS trigger LANGUAGE plpgsql " +
          `SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $leitora$${c}$leitora$`;
        const antes2 = await acumulados();
        try {
          await inserir(
            "sabotagem.leitora@exemplo.gov.br",
            recriar(`${corpo.slice(0, i)}${MARCA}\n  ${corpo.slice(i)}`),
          );
        } finally {
          await dono.query(recriar(corpo));
        }
        expect(diferenca(antes2, await acumulados())).toEqual({
          origens_de_conta: { ins: 2, upd: 0, del: 1 },
          pessoas: { ins: 1, upd: 0, del: 0 },
          usuarios: { ins: 1, upd: 0, del: 0 },
        });
      } finally {
        await a.end();
      }
    }, 60_000);

    for (const primeiro of ["pela pessoa", "pela conta"] as const) {
      it(`duas transações na mesma pessoa se enfileiram em N2 (primeiro ${primeiro}), sem 40P01`, async () => {
        const a = await conectar();
        const b = await conectar();
        try {
          const pidB = (await b.query("SELECT pg_backend_pid() AS p")).rows[0].p as number;
          await a.query("BEGIN");
          if (primeiro === "pela pessoa") {
            await a.query("SELECT travar_pessoa($1)", [pessoa1]);
          } else {
            await a.query("SET LOCAL ROLE dc360_app");
            await a.query("SELECT set_config('app.organizacao_atual', $1, true)", [org1]);
            await a.query("SELECT travar_pessoa_da_conta($1)", [conta1]);
          }
          await b.query("BEGIN");
          let terminou = false;
          const espera = (
            primeiro === "pela pessoa"
              ? b
                  .query("SELECT set_config('app.organizacao_atual', $1, true)", [org1])
                  .then(() => b.query("SET LOCAL ROLE dc360_app"))
                  .then(() => b.query("SELECT travar_pessoa_da_conta($1)", [conta1]))
              : b.query("SELECT travar_pessoa($1)", [pessoa1])
          ).then(() => {
            terminou = true;
          });
          expect(await parado(pidB, "advisory")).toBe(true);
          expect(terminou).toBe(false);
          await a.query("COMMIT");
          await espera;
          expect(terminou).toBe(true);
          await b.query("COMMIT");
        } finally {
          await a.end();
          await b.end();
        }
      }, 60_000);
    }

    it("a trava da pessoa e a das sessões (049) não se esperam, mesmo com o mesmo uuid", async () => {
      const a = await conectar();
      const b = await conectar();
      try {
        await a.query("BEGIN");
        await a.query("SELECT travar_pessoa($1)", [pessoa1]);
        await b.query("BEGIN");
        await b.query("SET LOCAL lock_timeout = '2s'");
        await b.query("SELECT travar_sessoes_do_usuario($1)", [pessoa1]);
        await b.query("COMMIT");
        await a.query("COMMIT");
      } finally {
        await a.end();
        await b.end();
      }
    }, 60_000);

    it("conta de outro município pelo contexto: `travar_pessoa_da_conta` não trava ninguém", async () => {
      const a = await conectar();
      const b = await conectar();
      try {
        await a.query("BEGIN");
        await a.query("SELECT travar_pessoa($1)", [pessoa1]);
        await b.query("BEGIN");
        await b.query("SET LOCAL lock_timeout = '2s'");
        await b.query("SELECT set_config('app.organizacao_atual', $1, true)", [org2]);
        await b.query("SET LOCAL ROLE dc360_app");
        await b.query("SELECT travar_pessoa_da_conta($1)", [conta1]);
        await b.query("COMMIT");
        await a.query("COMMIT");
      } finally {
        await a.end();
        await b.end();
      }
    }, 60_000);

    it("correção 1, achado 1, num banco criado com CREATE DATABASE: o dc360_app não cria TEMP `usuarios` para anexar o espelho, e a pessoa não muda", async () => {
      const outra = (
        await dono.query(
          "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash) VALUES ($1,'Alvo','U-ALVO','alvo@exemplo.gov.br','operador','hash-do-alvo') RETURNING pessoa_id",
          [org2],
        )
      ).rows[0].pessoa_id as string;
      const a = await conectar();
      try {
        await a.query("BEGIN");
        await a.query("SET LOCAL ROLE dc360_app");
        await a.query("SELECT set_config('app.organizacao_atual', $1, true)", [org1]);
        const e = await erroDe(
          (async () => {
            await a.query(`CREATE TEMP TABLE usuarios (id uuid DEFAULT gen_random_uuid(), organizacao_id uuid,
                             pessoa_id uuid, email text, senha_hash text, falhas_login int DEFAULT 0,
                             bloqueado_ate timestamptz, senha_provisoria_ate timestamptz) ON COMMIT DROP`);
            await a.query(`CREATE TRIGGER espelho_na_falsa AFTER UPDATE ON pg_temp.usuarios
                             FOR EACH ROW EXECUTE FUNCTION public.pessoa_espelha_a_conta()`);
            await a.query(
              "INSERT INTO pg_temp.usuarios (organizacao_id, pessoa_id, email, senha_hash) VALUES ($1, $2, 'x@x', 'velha')",
              [org1, outra],
            );
            await a.query("UPDATE pg_temp.usuarios SET senha_hash = 'senha-do-atacante'");
            await a.query("COMMIT");
          })(),
        );
        // A mensagem segue o idioma do servidor; o código e o ponto da recusa, não.
        expect(e.code).toBe("42501");
        expect(e.message).toMatch(/temporary tables|tabelas tempor/);
      } finally {
        await a.end();
      }
      expect(
        (await dono.query("SELECT senha_hash FROM pessoas WHERE id = $1", [outra])).rows[0]
          .senha_hash,
      ).toBe("hash-do-alvo");
    }, 60_000);

    /** Espera até `pid` ficar parado em qualquer trava, ou desiste. */
    async function paradoEmAlgo(pid: number): Promise<boolean> {
      for (let i = 0; i < 100; i++) {
        const r = await dono.query(
          "SELECT count(*)::int AS n FROM pg_locks WHERE pid = $1 AND NOT granted",
          [pid],
        );
        if (r.rows[0].n > 0) return true;
        await new Promise((ok) => setTimeout(ok, 50));
      }
      return false;
    }

    /*
      Correção 1, achado 5 (a ordem das travas da decisão 7). A transação A
      segue a ordem da ADR: segura a linha da pessoa (N4) e DEPOIS marca o link
      (N7), como o caminho global da E08 fará. B é o caminho de hoje que chega
      à pessoa só pelo espelho. Na ordem certa, B espera em N4 sem segurar o
      link: C consegue o link com NOWAIT, A termina, B segue, e ninguém recebe
      40P01. Com o espelho depois do gatilho da 051 (ou `consumir_recuperacao`
      travando o link antes da pessoa), B segura o link enquanto espera a
      pessoa: o NOWAIT de C falha e A fecharia ciclo com B.

      `consumir_recuperacao` (051) ainda toma o link antes da pessoa: é
      divergência REGISTRADA no cabeçalho da 054 (C5, dono E08), que não fecha
      ciclo enquanto nenhum caminho tomar N4 por comando próprio (a E08 é o
      primeiro). O caso dela fica em `it.fails`: mede a divergência hoje e
      reprova no dia em que a E08 a corrigir, para virar `it`.
    */
    for (const caminho of ["consumir_recuperacao", "redefinição por quem administra"] as const) {
      const caso = caminho === "consumir_recuperacao" ? it.fails : it;
      caso(
        `${caminho} contra um caminho na ordem (N4 e depois N7): espera na pessoa sem segurar o link, e sem 40P01`,
        async () => {
          const token = `link-${Math.random().toString(36).slice(2, 10)}`;
          await dono.query(
            "SELECT * FROM abrir_recuperacao('um@exemplo.gov.br', $1, interval '30 minutes', NULL)",
            [token],
          );
          const link = (
            await dono.query("SELECT id FROM recuperacoes_senha WHERE token_hash = $1", [token])
          ).rows[0].id as string;
          const a = await conectar();
          const b = await conectar();
          const c = await conectar();
          try {
            const pidB = (await b.query("SELECT pg_backend_pid() AS p")).rows[0].p as number;
            await a.query("BEGIN");
            await a.query("SELECT 1 FROM pessoas WHERE id = $1 FOR NO KEY UPDATE", [pessoa1]);
            await b.query("BEGIN");
            const erroB: { e: Erro | null } = { e: null };
            const segunda = (
              caminho === "consumir_recuperacao"
                ? b.query("SELECT * FROM consumir_recuperacao($1, 'hash-pelo-link')", [token])
                : b
                    .query("SELECT set_config('app.organizacao_atual', $1, true)", [org1])
                    .then(() => b.query("SET LOCAL ROLE dc360_app"))
                    .then(() =>
                      b.query("UPDATE usuarios SET senha_hash = 'hash-redefinido' WHERE id = $1", [
                        conta1,
                      ]),
                    )
            ).catch((e: Erro) => {
              erroB.e = e;
            });
            expect(await paradoEmAlgo(pidB)).toBe(true);
            await c.query("BEGIN");
            const linkLivre = await c
              .query("SELECT id FROM recuperacoes_senha WHERE id = $1 FOR UPDATE NOWAIT", [link])
              .then(
                () => "livre",
                (e: Erro) => e.code,
              );
            await c.query("ROLLBACK");
            expect(linkLivre).toBe("livre");
            await a.query(
              "UPDATE recuperacoes_senha SET usada_em = now() WHERE id = $1 AND usada_em IS NULL",
              [link],
            );
            await a.query("COMMIT");
            await segunda;
            expect(erroB.e?.code).toBeUndefined();
            await b.query("COMMIT");
          } finally {
            await a.end();
            await b.end();
            await c.end();
          }
        },
        60_000,
      );
    }

    for (const vence of ["município 1", "município 2"] as const) {
      it(`duas contas novas com o mesmo e-mail, em municípios diferentes, ao mesmo tempo (${vence} primeiro): uma fica, a outra recebe 23505, sem 40P01`, async () => {
        const email = `corrida.${vence.replace(/\D/g, "")}.${Math.random().toString(36).slice(2, 8)}@exemplo.gov.br`;
        const [orgPrimeiro, orgSegundo] = vence === "município 1" ? [org1, org2] : [org2, org1];
        const a = await conectar();
        const b = await conectar();
        try {
          const pidB = (await b.query("SELECT pg_backend_pid() AS p")).rows[0].p as number;
          const inserir = (c: pg.Client, org: string, m: string) =>
            c.query(
              `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel) VALUES ($1, 'Corrida', $2, $3, 'operador')`,
              [org, m, email],
            );
          await a.query("BEGIN");
          await inserir(a, orgPrimeiro, `C1-${vence}`);
          await b.query("BEGIN");
          const erroB: { e: Erro | null } = { e: null };
          const segunda = inserir(b, orgSegundo, `C2-${vence}`).catch((e: Erro) => {
            erroB.e = e;
          });
          expect(await parado(pidB, "transactionid")).toBe(true);
          await a.query("COMMIT");
          await segunda;
          await b.query("ROLLBACK");
          expect(erroB.e?.code).toBe("23505");
          const r = await dono.query(
            `SELECT (SELECT count(*)::int FROM usuarios WHERE lower(email) = lower($1)) AS contas,
                  (SELECT count(*)::int FROM pessoas WHERE lower(email) = lower($1)) AS pessoas`,
            [email],
          );
          expect(r.rows[0]).toEqual({ contas: 1, pessoas: 1 });
        } finally {
          await a.end();
          await b.end();
        }
      }, 60_000);
    }
  },
);
