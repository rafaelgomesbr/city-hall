/**
 * A PROVA COMPORTAMENTAL do isolamento entre municípios (V2-F03-E08, parte 0D,
 * item 1 da auditoria de cobertura da parte 0B).
 *
 * O portão conferia o TEXTO das policies (`toContain("app_organizacao_atual")`)
 * e provava o comportamento só em `ocorrencias` e em algumas tabelas escolhidas
 * à mão. Uma policy `USING (organizacao_id = app_organizacao_atual() OR true)`
 * numa tabela nova passava pelo texto e não tinha prova nenhuma. Esta prova não
 * lê o texto: ela pergunta ao banco quais tabelas existem, semeia uma linha de
 * cada município em CADA uma, e tenta, como o papel de aplicação, cruzar a
 * fronteira por todos os caminhos de SQL comum:
 *
 *   - no contexto de A, ler a linha de B (pela contagem visível com e sem a
 *     linha de B, o que dispensa saber quais colunas o papel pode ler);
 *   - sem contexto, ler qualquer linha;
 *   - alterar (`UPDATE ... SET c = c`, sem WHERE) e apagar (`DELETE`, sem
 *     WHERE) e conferir, como dono, que a linha de B continua lá, intacta;
 *   - inserir uma cópia EXATA da linha de B (mesma chave primária) no contexto
 *     de A e sem contexto: o único resultado aceito é a recusa por privilégio
 *     ou por policy (SQLSTATE 42501). Se a policy deixar passar, o banco para
 *     depois, na unicidade (23505), e isso REPROVA: é a prova de que a policy
 *     aceitou a linha;
 *   - mover a própria linha para B (`UPDATE ... SET organizacao_id = B`).
 *
 * A semeadura e as escritas rodam com `session_replication_role = replica`
 * (só o dono pode ligar): gatilho e chave estrangeira ficam desligados, e o
 * que resta entre o papel de aplicação e a linha de B é o RLS e o privilégio,
 * que é exatamente o que esta prova mede. Gatilho de negócio que recusasse a
 * escrita por outro motivo esconderia uma policy quebrada (a escrita falharia
 * "por sorte"); sem ele, a resposta é a da policy. Leitura não depende de
 * gatilho e roda no modo normal. Tudo que a prova escreve é desfeito
 * (ROLLBACK) no fim de cada tentativa.
 *
 * A FÁBRICA de linhas é genérica: preenche só o obrigatório, pelo tipo da
 * coluna e pelo que os CHECKs da tabela dizem (valor de `= ANY (ARRAY[...])`,
 * prefixo `tenant/<município>/`, e-mail). O que ela não sabe satisfazer entra
 * por nome em `PREPAROS` (catálogo), e o que nem com preparo dá entra em
 * `SEM_PROVA_COMPORTAMENTAL`, com motivo. As duas listas são conferidas nos
 * dois sentidos.
 */
import type { ConsultaSql } from "./conferir.js";
import type { PreparoDeTabela, TabelaSemProvaComportamental } from "./tipos.js";

/** Uma transação do PGlite (ou equivalente): consulta, comando e desfazer. */
export interface TransacaoSql extends ConsultaSql {
  exec(sql: string): Promise<unknown>;
  rollback(): Promise<void>;
}

/** O banco da prova: consulta, comando e transação. */
export interface BancoDaProva extends ConsultaSql {
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: TransacaoSql) => Promise<T>): Promise<T>;
}

/** Aspas de identificador SQL. */
export const ident = (s: string): string => `"${s.replace(/"/g, '""')}"`;

/** Literal de texto SQL. */
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** Como a prova enxerga uma tabela. */
export interface TabelaDaProva {
  readonly esquema: string;
  readonly nome: string;
  /** O nome como o catálogo nominal o escreve (nu em `public`). */
  readonly qualificado: string;
  /** `"esquema"."nome"`, pronto para SQL. */
  readonly sql: string;
  /**
   * A coluna que diz de qual município a linha é: `organizacao_id`, ou `id` na
   * raiz (`organizacoes`). `null` numa tabela sem município (exceção nominal).
   */
  readonly chave: string | null;
}

const RAIZ = "public.organizacoes";

/** As tabelas de todos os esquemas fora do sistema, menos as de extensão e a de controle de migração. */
export async function tabelasDaProva(db: ConsultaSql): Promise<TabelaDaProva[]> {
  const r = await db.query<{ esquema: string; nome: string; tem_org: boolean }>(`
    SELECT n.nspname::text AS esquema, c.relname::text AS nome,
           EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                     AND a.attname = 'organizacao_id' AND NOT a.attisdropped) AS tem_org
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p')
       AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'
       AND (n.nspname = 'public' OR NOT EXISTS (
             SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                AND d.objid = c.oid AND d.deptype = 'e'))
       AND NOT (n.nspname = 'public' AND c.relname = 'schema_migracoes')
     ORDER BY 1, 2`);
  return r.rows.map((t) => {
    const qualificado = t.esquema === "public" ? t.nome : `${t.esquema}.${t.nome}`;
    const chave = t.tem_org ? "organizacao_id" : `${t.esquema}.${t.nome}` === RAIZ ? "id" : null;
    return {
      esquema: t.esquema,
      nome: t.nome,
      qualificado,
      sql: `${ident(t.esquema)}.${ident(t.nome)}`,
      chave,
    };
  });
}

interface Coluna {
  nome: string;
  tipo: string;
  typname: string;
  categoria: string;
  obrigatoria: boolean;
  tem_default: boolean;
  gerada: boolean;
  identidade: string;
  typmod: number;
  vetor: boolean;
}

async function colunasDe(db: ConsultaSql, t: TabelaDaProva): Promise<Coluna[]> {
  const r = await db.query<Coluna>(
    `SELECT a.attname::text AS nome, format_type(a.atttypid, a.atttypmod) AS tipo,
            ty.typname::text AS typname, ty.typcategory::text AS categoria,
            a.attnotnull AS obrigatoria, (d.adbin IS NOT NULL) AS tem_default,
            (a.attgenerated <> '') AS gerada, a.attidentity::text AS identidade,
            a.atttypmod AS typmod, (ty.typcategory = 'A') AS vetor
       FROM pg_attribute a
       JOIN pg_type ty ON ty.oid = a.atttypid
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    [t.sql],
  );
  return r.rows;
}

async function checksDe(db: ConsultaSql, t: TabelaDaProva): Promise<string[]> {
  const r = await db.query<{ def: string }>(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'c'",
    [t.sql],
  );
  return r.rows.map((l) => l.def);
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * O valor genérico de uma coluna obrigatória, em SQL, ou `null` quando a
 * fábrica não sabe gerar. A ordem: o que os CHECKs da tabela dizem sobre a
 * coluna, depois o tipo.
 */
function valorGenerico(
  c: Coluna,
  checks: readonly string[],
  org: string | null,
  n: number,
): string | null {
  const col = `(?:${escapar(c.nome)}|"${escapar(c.nome)}")`;
  for (const def of checks) {
    const lista = new RegExp(`\\b${col}\\s*=\\s*ANY\\s*\\(ARRAY\\['((?:[^']|'')*)'`).exec(def);
    if (lista) return lit(lista[1]!.replace(/''/g, "'"));
    if (org && new RegExp(`\\b${col}\\s*~~\\s*\\(+'tenant/'`).test(def)) {
      return lit(`tenant/${org}/semente-${n}`);
    }
    if (new RegExp(`\\b${col}\\s*~\\s*'\\^\\[\\^@`).test(def))
      return lit(`semente-${n}@exemplo.gov.br`);
  }
  if (c.vetor) return "'{}'";
  switch (c.typname) {
    case "text":
    case "varchar":
    case "citext":
      return lit(`semente ${n}`);
    case "bpchar":
      return lit("A".repeat(Math.max(1, c.typmod - 4)));
    case "uuid":
      return "gen_random_uuid()";
    case "int2":
    case "int4":
    case "int8":
    case "numeric":
      return "1";
    case "float4":
    case "float8":
      return "0";
    case "bool":
      return "false";
    case "timestamptz":
    case "timestamp":
      return "now()";
    case "date":
      return "current_date";
    case "interval":
      return "'1 hour'";
    case "json":
    case "jsonb":
      return "'{}'";
    case "inet":
      return "'127.0.0.1'";
    case "bytea":
      return "'\\x00'";
    default:
      return null;
  }
}

/** Uma linha semeada: onde ela está e o que ela é. */
export interface LinhaSemeada {
  readonly ctid: string;
  readonly linha: Record<string, unknown>;
}

export interface Semeadura {
  /** Por tabela qualificada: a linha de A e a de B (tabela com município), ou `unica` (sem município). */
  readonly linhas: ReadonlyMap<
    string,
    { a?: LinhaSemeada; b?: LinhaSemeada; unica?: LinhaSemeada }
  >;
  readonly problemas: readonly string[];
}

let contador = 0;

/** Monta e executa o INSERT de uma linha. Lança o erro do banco se não der. */
async function inserirLinha(
  db: ConsultaSql,
  t: TabelaDaProva,
  org: string | null,
  preparo: PreparoDeTabela | undefined,
): Promise<LinhaSemeada> {
  const colunas = await colunasDe(db, t);
  const checks = await checksDe(db, t);
  const n = ++contador;
  const nomes: string[] = [];
  const valores: string[] = [];
  for (const c of colunas) {
    if (c.gerada || c.identidade === "a") continue;
    let v: string | null = null;
    const doPreparo = preparo?.colunas[c.nome];
    if (doPreparo !== undefined) {
      v = doPreparo.replace(/:org\b/g, org ?? "").replace(/:n\b/g, String(n));
    } else if (c.nome === t.chave && org) {
      v = `${lit(org)}::uuid`;
    } else if (c.obrigatoria && !c.tem_default && c.identidade === "") {
      v = valorGenerico(c, checks, org, n);
      if (v === null) {
        throw new Error(`coluna ${c.nome} (${c.tipo}) sem gerador genérico`);
      }
    }
    if (v !== null) {
      nomes.push(ident(c.nome));
      valores.push(v);
    }
  }
  const r = await db.query<{ ctid: string; linha: Record<string, unknown> }>(
    `INSERT INTO ${t.sql} AS x (${nomes.join(", ")}) VALUES (${valores.join(", ")})
     RETURNING x.ctid::text AS ctid, to_jsonb(x) AS linha`,
  );
  return r.rows[0]!;
}

/** Tenta inserir dentro de uma transação que é sempre desfeita. `null` quando deu, a mensagem quando não. */
async function tentarSemear(
  db: BancoDaProva,
  t: TabelaDaProva,
  org: string | null,
  preparo: PreparoDeTabela | undefined,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL session_replication_role = replica");
    let erro: string | null = null;
    try {
      await inserirLinha(tx, t, org, preparo);
    } catch (e) {
      erro = (e as Error).message;
    }
    await tx.rollback();
    return erro;
  });
}

/**
 * Semeia uma linha de A e uma de B em cada tabela com município, e uma linha
 * em cada tabela sem município (a raiz já tem as duas: são os próprios
 * municípios). Confere `PREPAROS` e `SEM_PROVA_COMPORTAMENTAL` nos dois
 * sentidos.
 */
export async function semear(
  db: BancoDaProva,
  a: string,
  b: string,
  preparos: readonly PreparoDeTabela[],
  semProva: readonly TabelaSemProvaComportamental[],
): Promise<Semeadura> {
  const problemas: string[] = [];
  const tabelas = await tabelasDaProva(db);
  const porNome = new Map(tabelas.map((t) => [t.qualificado, t]));
  const linhas = new Map<string, { a?: LinhaSemeada; b?: LinhaSemeada; unica?: LinhaSemeada }>();
  const listaSemProva = new Set(semProva.map((s) => s.tabela));

  for (const p of preparos) {
    const t = porNome.get(p.tabela);
    if (!t) {
      problemas.push(`PREPAROS (${p.etapa}): a tabela ${p.tabela} não existe no banco`);
      continue;
    }
    const nomes = new Set((await colunasDe(db, t)).map((c) => c.nome));
    for (const c of Object.keys(p.colunas)) {
      if (!nomes.has(c)) problemas.push(`PREPAROS (${p.etapa}): ${p.tabela} não tem a coluna ${c}`);
    }
    const org = t.chave === "organizacao_id" ? a : null;
    if ((await tentarSemear(db, t, org, undefined)) === null) {
      problemas.push(
        `PREPAROS (${p.etapa}): ${p.tabela} tem preparo, mas a fábrica genérica já semeia a tabela ` +
          "sem ele: preparo desnecessário",
      );
    }
  }
  for (const s of semProva) {
    const t = porNome.get(s.tabela);
    if (!t) {
      problemas.push(
        `SEM_PROVA_COMPORTAMENTAL (${s.etapa}): a tabela ${s.tabela} não existe no banco`,
      );
      continue;
    }
    const org = t.chave === "organizacao_id" ? a : null;
    const preparo = preparos.find((p) => p.tabela === s.tabela);
    if ((await tentarSemear(db, t, org, preparo)) === null) {
      problemas.push(
        `SEM_PROVA_COMPORTAMENTAL (${s.etapa}): ${s.tabela} se declara sem prova, mas a fábrica ` +
          "semeia a tabela: a isenção sobrou",
      );
    }
  }

  await db.exec("SET session_replication_role = replica");
  try {
    for (const t of tabelas) {
      if (listaSemProva.has(t.qualificado) || t.chave === "id") continue;
      const preparo = preparos.find((p) => p.tabela === t.qualificado);
      try {
        if (t.chave) {
          linhas.set(t.qualificado, {
            a: await inserirLinha(db, t, a, preparo),
            b: await inserirLinha(db, t, b, preparo),
          });
        } else {
          linhas.set(t.qualificado, { unica: await inserirLinha(db, t, null, preparo) });
        }
      } catch (e) {
        problemas.push(
          `a prova comportamental não conseguiu semear ${t.qualificado}: ${(e as Error).message}. ` +
            "Declare como montar a linha em PREPAROS, no catálogo da sua etapa, ou, se nem assim " +
            "der, a tabela em SEM_PROVA_COMPORTAMENTAL com o motivo.",
        );
      }
    }
  } finally {
    await db.exec("RESET session_replication_role");
  }

  // A raiz: as linhas de A e de B são os próprios municípios.
  const raiz = tabelas.find((t) => t.chave === "id");
  if (raiz) {
    const r = await db.query<{ id: string; ctid: string; linha: Record<string, unknown> }>(
      `SELECT x.id::text AS id, x.ctid::text AS ctid, to_jsonb(x) AS linha FROM ${raiz.sql} x WHERE x.id = ANY($1::uuid[])`,
      [[a, b]],
    );
    const de = (id: string) => r.rows.find((l) => l.id === id);
    linhas.set(raiz.qualificado, { a: de(a), b: de(b) });
  }
  return { linhas, problemas };
}

/** O resultado de uma tentativa como papel do produto. */
type Tentativa =
  | { ok: true; linhas: Array<Record<string, unknown>>; afetadas: number }
  | { ok: false; codigo: string; mensagem: string };

async function tentar(tx: TransacaoSql, sql: string, params: unknown[] = []): Promise<Tentativa> {
  await tx.exec("SAVEPOINT tentativa_da_prova");
  try {
    const r = (await tx.query(sql, params)) as {
      rows: Array<Record<string, unknown>>;
      affectedRows?: number;
    };
    await tx.exec("RELEASE SAVEPOINT tentativa_da_prova");
    return { ok: true, linhas: r.rows, afetadas: r.affectedRows ?? 0 };
  } catch (e) {
    await tx.exec("ROLLBACK TO SAVEPOINT tentativa_da_prova");
    const erro = e as { code?: string; message?: string };
    return { ok: false, codigo: erro.code ?? "?", mensagem: erro.message ?? String(e) };
  }
}

/** Quem tenta e com qual contexto. */
export interface Ator {
  readonly papel: string;
  /** O nome da variável de contexto (`app.organizacao_atual`, `app.console_operador`). */
  readonly variavel: string;
  /** O valor dela, ou `null` (sem contexto). */
  readonly valor: string | null;
}

/**
 * Uma tentativa completa: abre a transação, liga o modo réplica se pedido,
 * mede como dono, vira o ator, tenta, volta a ser dono, mede de novo e desfaz.
 */
export async function comoAtor<M>(
  db: BancoDaProva,
  ator: Ator,
  opcoes: { replica: boolean },
  medir: (tx: TransacaoSql) => Promise<M>,
  sql: string,
  params: unknown[] = [],
): Promise<{ antes: M; tentativa: Tentativa; depois: M }> {
  return db.transaction(async (tx) => {
    if (opcoes.replica) await tx.exec("SET LOCAL session_replication_role = replica");
    const antes = await medir(tx);
    await tx.exec(`SET LOCAL ROLE ${ident(ator.papel)}`);
    if (ator.valor !== null) {
      await tx.query("SELECT set_config($1, $2, true)", [ator.variavel, ator.valor]);
    }
    const tentativa = await tentar(tx, sql, params);
    await tx.exec("RESET ROLE");
    const depois = await medir(tx);
    await tx.rollback();
    return { antes, tentativa, depois };
  });
}

/** A linha continua no mesmo lugar, sem versão nova (não foi alterada nem apagada). */
async function presentes(
  tx: TransacaoSql,
  t: TabelaDaProva,
  ctids: readonly string[],
): Promise<boolean[]> {
  const r = await tx.query<{ ctid: string }>(
    `SELECT ctid::text AS ctid FROM ${t.sql} WHERE ctid = ANY($1::tid[])`,
    [ctids],
  );
  const achados = new Set(r.rows.map((l) => l.ctid));
  return ctids.map((c) => achados.has(c));
}

async function contarDoMunicipio(tx: TransacaoSql, t: TabelaDaProva, org: string): Promise<number> {
  const r = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${t.sql} WHERE ${ident(t.chave!)}::text = $1`,
    [org],
  );
  return r.rows[0]!.n;
}

async function privilegioDeColuna(
  db: ConsultaSql,
  papel: string,
  t: TabelaDaProva,
  privilegio: "INSERT" | "UPDATE" | "SELECT",
): Promise<string[]> {
  const r = await db.query<{ nome: string }>(
    `SELECT a.attname::text AS nome FROM pg_attribute a
      WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attgenerated = '' AND a.attidentity <> 'a'
        AND has_column_privilege($2, a.attrelid, a.attnum, $3)
      ORDER BY a.attnum`,
    [t.sql, papel, privilegio],
  );
  return r.rows.map((l) => l.nome);
}

const RECUSA = "42501";

function descreverErro(t: Tentativa): string {
  return t.ok ? "aceitou" : `${t.codigo}: ${t.mensagem}`;
}

/** O que a prova de UMA tabela observou. */
export interface ResultadoDaTabela {
  readonly tabela: string;
  readonly chave: string | null;
  /** Na leitura no contexto de A, a linha de A apareceu (âncora: a prova enxerga o que deve). */
  readonly leuOProprio: boolean;
  readonly problemas: readonly string[];
}

export interface OpcoesDaProva {
  readonly a: string;
  readonly b: string;
  readonly papel?: string;
}

/**
 * A prova de uma tabela, como o papel de aplicação, no contexto de A e sem
 * contexto. Devolve os problemas (vazio quando a fronteira segurou).
 */
export async function provarTabela(
  db: BancoDaProva,
  t: TabelaDaProva,
  semeadas: { a?: LinhaSemeada; b?: LinhaSemeada; unica?: LinhaSemeada },
  opcoes: OpcoesDaProva,
): Promise<ResultadoDaTabela> {
  const papel = opcoes.papel ?? "dc360_app";
  const problemas: string[] = [];
  const nome = t.qualificado;
  let leuOProprio = false;
  const contextos: Array<{ rotulo: string; valor: string | null; vitimas: LinhaSemeada[] }> =
    t.chave
      ? [
          { rotulo: "no contexto de A", valor: opcoes.a, vitimas: [semeadas.b!] },
          { rotulo: "sem contexto", valor: null, vitimas: [semeadas.a!, semeadas.b!] },
        ]
      : [
          { rotulo: "no contexto de A", valor: opcoes.a, vitimas: [semeadas.unica!] },
          { rotulo: "sem contexto", valor: null, vitimas: [semeadas.unica!] },
        ];
  if (contextos.some((c) => c.vitimas.some((v) => !v))) {
    return {
      tabela: nome,
      chave: t.chave,
      leuOProprio,
      problemas: [`${nome}: sem as linhas semeadas`],
    };
  }

  const colunasUpdate = await privilegioDeColuna(db, papel, t, "UPDATE");
  const colunasInsert = await privilegioDeColuna(db, papel, t, "INSERT");
  const colunasSelect = await privilegioDeColuna(db, papel, t, "SELECT");
  const todas = (await colunasDe(db, t))
    .filter((c) => !c.gerada && c.identidade !== "a")
    .map((c) => c.nome);
  const alvoDoUpdate = colunasUpdate.find((c) => c !== t.chave) ?? colunasUpdate[0] ?? todas[0]!;

  for (const ctx of contextos) {
    const ator: Ator = { papel, variavel: "app.organizacao_atual", valor: ctx.valor };
    const ctids = ctx.vitimas.map((v) => v.ctid);

    // 1. LEITURA, pela contagem: o que o ator vê não pode mudar quando as vítimas somem.
    const visivel = await db.transaction(async (tx) => {
      const ler = async () => {
        await tx.exec(`SET LOCAL ROLE ${ident(papel)}`);
        if (ctx.valor !== null) {
          await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [ctx.valor]);
        } else {
          await tx.query("SELECT set_config('app.organizacao_atual', '', true)");
        }
        const n = await tentar(tx, `SELECT count(*)::int AS n FROM ${t.sql}`);
        const proprio =
          t.chave && colunasSelect.includes(t.chave) && ctx.valor !== null
            ? await tentar(tx, `SELECT ${ident(t.chave)}::text AS k FROM ${t.sql}`)
            : null;
        await tx.exec("RESET ROLE");
        return { n, proprio };
      };
      const com = await ler();
      await tx.exec("SET LOCAL session_replication_role = replica");
      await tx.query(`DELETE FROM ${t.sql} WHERE ctid = ANY($1::tid[])`, [ctids]);
      await tx.exec("SET LOCAL session_replication_role = origin");
      const sem = await ler();
      await tx.rollback();
      return { com, sem };
    });
    const { com, sem } = visivel;
    if (!com.n.ok) {
      if (com.n.codigo !== RECUSA) {
        problemas.push(
          `${nome}, ${ctx.rotulo}: a leitura falhou por outro motivo (${descreverErro(com.n)}), e a prova não conclui`,
        );
      }
    } else {
      const nCom = com.n.linhas[0]!.n as number;
      const nSem = sem.n.ok ? (sem.n.linhas[0]!.n as number) : -1;
      if (!t.chave) {
        if (nCom > 0) {
          problemas.push(
            `${nome}, ${ctx.rotulo}: tabela sem município, e o papel de aplicação lê ${nCom} linha(s) dela`,
          );
        }
      } else if (nCom !== nSem) {
        problemas.push(
          `${nome}, ${ctx.rotulo}: o papel de aplicação ENXERGA a linha de outro município ` +
            `(vê ${nCom} linha(s) com ela e ${nSem} sem ela)`,
        );
      }
      if (t.chave && ctx.valor === null && nCom > 0) {
        problemas.push(`${nome}, sem contexto: o papel de aplicação lê ${nCom} linha(s)`);
      }
    }
    if (com.proprio?.ok && t.chave) {
      const proprias = com.proprio.linhas.map((l) => l.k);
      if (proprias.includes(opcoes.a)) leuOProprio = true;
      if (proprias.includes(opcoes.b)) {
        problemas.push(`${nome}, ${ctx.rotulo}: a leitura devolve a chave do município B`);
      }
    }

    /*
      2. UPDATE às cegas: sem WHERE e sem ler coluna nenhuma. Um `SET c = c`
      leria a coluna, e o Postgres aplicaria a policy de SELECT ao UPDATE, o
      que esconderia uma policy de UPDATE quebrada (o atacante não precisa
      ler para escrever). Por isso o valor vem de fora da tabela (o da
      própria vítima, montado de JSON), e, antes, o dono tira da tabela tudo
      que não é a vítima, para o UPDATE às cegas não esbarrar em linha
      legítima (unicidade, CHECK). Tudo desfeito no fim.
    */
    const vitima = ctx.vitimas[ctx.vitimas.length - 1]!;
    const upd = await comoAtor(
      db,
      ator,
      { replica: true },
      async (tx) => {
        await tx.query(`DELETE FROM ${t.sql} WHERE ctid <> $1::tid`, [vitima.ctid]);
        return presentes(tx, t, [vitima.ctid]);
      },
      `UPDATE ${t.sql} SET ${ident(alvoDoUpdate)} = ` +
        `(jsonb_populate_record(NULL::${t.sql}, $1::jsonb)).${ident(alvoDoUpdate)}`,
      [JSON.stringify(vitima.linha)],
    );
    if (upd.depois.some((p) => !p)) {
      problemas.push(
        `${nome}, ${ctx.rotulo}: o papel de aplicação ALTERA linha de outro município (UPDATE)`,
      );
    } else if (!upd.tentativa.ok && upd.tentativa.codigo !== RECUSA) {
      problemas.push(
        `${nome}, ${ctx.rotulo}: o UPDATE falhou por outro motivo (${descreverErro(upd.tentativa)}), e a prova não conclui`,
      );
    }

    // 3. DELETE sem WHERE: as vítimas continuam lá.
    const del = await comoAtor(
      db,
      ator,
      { replica: true },
      (tx) => presentes(tx, t, ctids),
      `DELETE FROM ${t.sql}`,
    );
    if (del.depois.some((p) => !p)) {
      problemas.push(
        `${nome}, ${ctx.rotulo}: o papel de aplicação APAGA linha de outro município (DELETE)`,
      );
    } else if (!del.tentativa.ok && del.tentativa.codigo !== RECUSA) {
      problemas.push(
        `${nome}, ${ctx.rotulo}: o DELETE falhou por outro motivo (${descreverErro(del.tentativa)}), e a prova não conclui`,
      );
    }

    if (!t.chave) continue;

    // 4. INSERT da cópia exata da linha de B (mesma chave primária).
    if (colunasInsert.includes(t.chave)) {
      const linhaDeB = semeadas.b!.linha;
      const cols = colunasInsert.map(ident).join(", ");
      const ins = await comoAtor(
        db,
        ator,
        { replica: true },
        (tx) => contarDoMunicipio(tx, t, opcoes.b),
        `INSERT INTO ${t.sql} (${cols}) SELECT ${cols} FROM jsonb_populate_record(NULL::${t.sql}, $1::jsonb)`,
        [JSON.stringify(linhaDeB)],
      );
      if (ins.depois > ins.antes) {
        problemas.push(
          `${nome}, ${ctx.rotulo}: o papel de aplicação INSERE linha carimbada com o município B`,
        );
      } else if (ins.tentativa.ok || ins.tentativa.codigo !== RECUSA) {
        problemas.push(
          `${nome}, ${ctx.rotulo}: a cópia da linha de B não foi recusada pela policy nem pelo privilégio ` +
            `(${descreverErro(ins.tentativa)}): ela passou pelo RLS e só parou depois`,
        );
      }
    }

    // 5. Mover a própria linha para B.
    if (
      ctx.valor !== null &&
      t.chave === "organizacao_id" &&
      colunasUpdate.includes("organizacao_id")
    ) {
      const mov = await comoAtor(
        db,
        ator,
        { replica: true },
        (tx) => contarDoMunicipio(tx, t, opcoes.b),
        `UPDATE ${t.sql} SET organizacao_id = $1::uuid`,
        [opcoes.b],
      );
      if (mov.depois > mov.antes) {
        problemas.push(
          `${nome}, ${ctx.rotulo}: o papel de aplicação MOVE a própria linha para o município B`,
        );
      } else if (!mov.tentativa.ok && mov.tentativa.codigo !== RECUSA) {
        problemas.push(
          `${nome}, ${ctx.rotulo}: mover a linha falhou por outro motivo (${descreverErro(mov.tentativa)}), e a prova não conclui`,
        );
      }
    }
  }
  return { tabela: nome, chave: t.chave, leuOProprio, problemas };
}

export interface RelatorioDaProva {
  readonly problemas: readonly string[];
  readonly tabelas: readonly ResultadoDaTabela[];
  readonly visoes: readonly string[];
}

/** As visões (comuns e materializadas) que o papel lê, fora do sistema e fora de extensão. */
export async function visoesLegiveis(
  db: ConsultaSql,
  papel: string,
): Promise<Array<{ qualificado: string; sql: string }>> {
  const r = await db.query<{ esquema: string; nome: string }>(
    `SELECT n.nspname::text AS esquema, c.relname::text AS nome
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('v', 'm')
        AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                          AND d.objid = c.oid AND d.deptype = 'e')
        AND (has_table_privilege($1, c.oid, 'SELECT') OR has_any_column_privilege($1, c.oid, 'SELECT'))
      ORDER BY 1, 2`,
    [papel],
  );
  return r.rows.map((v) => ({
    qualificado: v.esquema === "public" ? v.nome : `${v.esquema}.${v.nome}`,
    sql: `${ident(v.esquema)}.${ident(v.nome)}`,
  }));
}

/**
 * A leitura cruzada pelas VISÕES (item 3): o que o papel vê por cada visão,
 * no contexto de A, não muda quando todas as linhas semeadas de B somem; e,
 * sem contexto, não muda quando as de A e as de B somem.
 */
export async function provarVisoes(
  db: BancoDaProva,
  semeadura: Semeadura,
  opcoes: OpcoesDaProva,
): Promise<{ problemas: string[]; visoes: string[] }> {
  const papel = opcoes.papel ?? "dc360_app";
  const problemas: string[] = [];
  const visoes = await visoesLegiveis(db, papel);
  const tabelas = new Map((await tabelasDaProva(db)).map((t) => [t.qualificado, t]));
  for (const v of visoes) {
    for (const ctx of [
      { rotulo: "no contexto de A", valor: opcoes.a as string | null, somem: ["b"] as const },
      { rotulo: "sem contexto", valor: null as string | null, somem: ["a", "b"] as const },
    ]) {
      const leituras = await db.transaction(async (tx) => {
        const ler = async () => {
          await tx.exec(`SET LOCAL ROLE ${ident(papel)}`);
          await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [ctx.valor ?? ""]);
          const r = await tentar(tx, `SELECT to_jsonb(x)::text AS j FROM ${v.sql} x ORDER BY 1`);
          await tx.exec("RESET ROLE");
          return r;
        };
        const com = await ler();
        await tx.exec("SET LOCAL session_replication_role = replica");
        for (const [nome, l] of semeadura.linhas) {
          // A raiz entra também: com gatilho e chave estrangeira desligados, o município some junto.
          const t = tabelas.get(nome);
          if (!t) continue;
          const ctids = ctx.somem.map((k) => l[k]?.ctid).filter((c): c is string => Boolean(c));
          if (ctids.length)
            await tx.query(`DELETE FROM ${t.sql} WHERE ctid = ANY($1::tid[])`, [ctids]);
        }
        await tx.exec("SET LOCAL session_replication_role = origin");
        const sem = await ler();
        await tx.rollback();
        return { com, sem };
      });
      if (!leituras.com.ok) {
        if (leituras.com.codigo !== RECUSA) {
          problemas.push(
            `visão ${v.qualificado}, ${ctx.rotulo}: a leitura falhou (${descreverErro(leituras.com)})`,
          );
        }
        continue;
      }
      const com = JSON.stringify(leituras.com.linhas);
      const sem = leituras.sem.ok ? JSON.stringify(leituras.sem.linhas) : "";
      if (com !== sem) {
        problemas.push(
          `visão ${v.qualificado}, ${ctx.rotulo}: o que o papel de aplicação lê pela visão muda quando ` +
            "as linhas de outro município somem: a visão atravessa a fronteira",
        );
      }
      if (com.includes(opcoes.b) || (ctx.valor === null && com.includes(opcoes.a))) {
        problemas.push(
          `visão ${v.qualificado}, ${ctx.rotulo}: a leitura traz o identificador de outro município`,
        );
      }
    }
  }
  return { problemas, visoes: visoes.map((v) => v.qualificado) };
}

/** A prova inteira, tabela por tabela, mais as visões. */
export async function provarIsolamento(
  db: BancoDaProva,
  semeadura: Semeadura,
  opcoes: OpcoesDaProva,
): Promise<RelatorioDaProva> {
  const problemas: string[] = [...semeadura.problemas];
  const resultados: ResultadoDaTabela[] = [];
  for (const t of await tabelasDaProva(db)) {
    const semeadas = semeadura.linhas.get(t.qualificado);
    if (!semeadas) continue;
    const r = await provarTabela(db, t, semeadas, opcoes);
    resultados.push(r);
    problemas.push(...r.problemas);
  }
  const v = await provarVisoes(db, semeadura, opcoes);
  problemas.push(...v.problemas);
  return { problemas, tabelas: resultados, visoes: v.visoes };
}
