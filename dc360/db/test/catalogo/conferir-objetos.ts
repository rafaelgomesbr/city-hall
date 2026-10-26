/**
 * As conferências da parte 0D (V2-F03-E08) contra o catálogo do banco: as
 * lacunas que a auditoria de cobertura da parte 0B achou fora das funções
 * privilegiadas e das exceções de tabela, mais os três requisitos da correção 2
 * da ADR 0009 (corpo sem DDL, nenhum TRIGGER para papel do produto, a marca
 * "recusada depois da liberação").
 *
 * Mesma forma de `conferir.ts`: cada função devolve a lista de problemas em
 * português, vazia quando tudo bate, e as sondas que a fazem reprovar estão
 * em `db/test/portao-comportamental.test.ts`.
 */
import { MINIMO_DO_MOTIVO, nomeQualificado, type ConsultaSql } from "./conferir.js";
import type { PolicyDoFornecedor } from "./fornecedor.js";
import type {
  FuncaoPrivilegiada,
  LeituraDeExtensao,
  PapelComGrant,
  PolicyRestritiva,
  SequenciaDoProduto,
  TipoProprio,
  VisaoSemInvoker,
} from "./tipos.js";

const FORA_DO_SISTEMA = `n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`;
const DE_EXTENSAO = (classe: string, oid: string) =>
  `EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${classe}'::regclass ` +
  `AND d.objid = ${oid} AND d.deptype = 'e')`;
const PAPEIS_DO_PRODUTO = ["dc360_app", "dc360_console"] as const;
const PAPEIS_COM_GRANT: readonly PapelComGrant[] = ["dc360_app", "dc360_console", "PUBLIC"];

/* ------------------------------------------------------------------ item 2 */

/**
 * O MODO de cada policy (item 2). Toda policy é PERMISSIVE, salvo as que
 * `POLICIES_RESTRITIVAS` nomeia. Policy permissiva SOMA por OR com as outras
 * do mesmo comando; uma restrição de município que vire PERMISSIVE deixa de
 * cortar e passa a autorizar. Nos dois sentidos: restritiva fora da lista
 * reprova; entrada que o banco não tem, ou tem como PERMISSIVE, reprova.
 */
export async function conferirModoDasPolicies(
  db: ConsultaSql,
  restritivas: readonly PolicyRestritiva[],
): Promise<string[]> {
  const problemas: string[] = [];
  const r = await db.query<{ esquema: string; tabela: string; policy: string; modo: string }>(`
    SELECT schemaname::text AS esquema, tablename::text AS tabela, policyname::text AS policy,
           permissive::text AS modo
      FROM pg_policies n
     WHERE n.schemaname NOT LIKE 'pg\\_%' AND n.schemaname <> 'information_schema'
     ORDER BY 1, 2, 3`);
  if (r.rows.length === 0) {
    return ["a consulta não devolveu nenhuma policy: a conferência quebrou, não o banco"];
  }
  const chave = (tabela: string, policy: string) => `${tabela}.${policy}`;
  const naLista = new Map(restritivas.map((p) => [chave(p.tabela, p.policy), p]));
  const noBanco = new Map(
    r.rows.map((p) => [chave(nomeQualificado(p.esquema, p.tabela), p.policy), p]),
  );
  for (const [k, p] of noBanco) {
    if (p.modo !== "PERMISSIVE" && p.modo !== "RESTRICTIVE") {
      problemas.push(`policy ${k}: modo desconhecido ${p.modo}`);
    } else if (p.modo === "RESTRICTIVE" && !naLista.has(k)) {
      problemas.push(
        `policy ${k} é RESTRICTIVE e não consta em POLICIES_RESTRITIVAS: o modo é parte do ` +
          "isolamento e se declara por nome, no catálogo da etapa",
      );
    }
  }
  for (const [k, p] of naLista) {
    const real = noBanco.get(k);
    if (!real)
      problemas.push(`consta em POLICIES_RESTRITIVAS (${p.etapa}) e não existe no banco: ${k}`);
    else if (real.modo !== "RESTRICTIVE") {
      problemas.push(
        `policy ${k} (${p.etapa}) é declarada RESTRICTIVE e o banco a tem como ${real.modo}: a ` +
          "restrição virou autorização somada por OR",
      );
    }
    if (p.motivo.trim().length < MINIMO_DO_MOTIVO)
      problemas.push(`policy ${k}: motivo curto demais`);
  }
  return problemas;
}

/**
 * As COMPOSIÇÕES de policy (item 2): tabela e comando em que mais de uma
 * policy vale para o papel (ou alguma é restritiva). O texto de cada uma pode
 * estar certo e a soma, não. Quem prova a soma é a prova comportamental, que
 * mede o efeito; o portão confere que toda composição está coberta por ela.
 */
export async function composicoesDePolicies(db: ConsultaSql, papel: string): Promise<string[]> {
  const r = await db.query<{
    tabela: string;
    esquema: string;
    cmd: string;
    n: number;
    restritivas: number;
  }>(
    `WITH p AS (
       SELECT schemaname::text AS esquema, tablename::text AS tabela, permissive,
              unnest(CASE WHEN cmd = 'ALL' THEN ARRAY['SELECT','INSERT','UPDATE','DELETE'] ELSE ARRAY[cmd] END) AS cmd
         FROM pg_policies
        WHERE schemaname NOT LIKE 'pg\\_%' AND schemaname <> 'information_schema'
          AND (roles && ARRAY['public', $1]::name[]))
     SELECT esquema, tabela, cmd, count(*)::int AS n,
            count(*) FILTER (WHERE permissive = 'RESTRICTIVE')::int AS restritivas
       FROM p GROUP BY 1, 2, 3
     HAVING count(*) > 1 OR count(*) FILTER (WHERE permissive = 'RESTRICTIVE') > 0
     ORDER BY 1, 2, 3`,
    [papel],
  );
  return r.rows.map((l) => `${nomeQualificado(l.esquema, l.tabela)}:${l.cmd}`);
}

/* ------------------------------------------------------------------ item 3 */

/**
 * As VISÕES (item 3). Visão sem `security_invoker` lê como o DONO dela, e o
 * dono passa pelo RLS (no PGlite é superusuário; no provedor, o RLS forçado
 * não segura o dono de visão). Toda visão (comum ou materializada) que algum
 * papel do produto, ou PUBLIC, lê, e que alcança tabela (inclusive por outra
 * visão), tem `security_invoker = true` ou consta em `VISOES_SEM_INVOKER`.
 * Visão materializada não tem RLS: só entra pela lista. Nos dois sentidos.
 */
export async function conferirVisoes(
  db: ConsultaSql,
  semInvoker: readonly VisaoSemInvoker[],
): Promise<string[]> {
  const problemas: string[] = [];
  const r = await db.query<{
    esquema: string;
    visao: string;
    tipo: string;
    invoker: boolean;
    lida_por: string[];
    alcanca: string[];
  }>(`
    WITH RECURSIVE alcance AS (
      SELECT v.oid AS visao, d.refobjid AS alvo
        FROM pg_class v
        JOIN pg_rewrite w ON w.ev_class = v.oid
        JOIN pg_depend d ON d.objid = w.oid AND d.classid = 'pg_rewrite'::regclass
                        AND d.refclassid = 'pg_class'::regclass AND d.refobjid <> v.oid
       WHERE v.relkind IN ('v', 'm')
      UNION
      SELECT a.visao, d.refobjid
        FROM alcance a
        JOIN pg_rewrite w ON w.ev_class = a.alvo
        JOIN pg_depend d ON d.objid = w.oid AND d.classid = 'pg_rewrite'::regclass
                        AND d.refclassid = 'pg_class'::regclass AND d.refobjid <> a.alvo
    )
    SELECT n.nspname::text AS esquema, c.relname::text AS visao, c.relkind::text AS tipo,
           coalesce(EXISTS (SELECT 1 FROM unnest(c.reloptions) o
                     WHERE lower(o) IN ('security_invoker=true', 'security_invoker=on',
                                        'security_invoker=1', 'security_invoker=yes')), false) AS invoker,
           ARRAY(SELECT p FROM unnest(ARRAY['dc360_app', 'dc360_console', 'public']) AS p
                  WHERE has_table_privilege(p, c.oid, 'SELECT')
                     OR has_any_column_privilege(p, c.oid, 'SELECT')) AS lida_por,
           ARRAY(SELECT DISTINCT t.relname::text FROM alcance a JOIN pg_class t ON t.oid = a.alvo
                  WHERE a.visao = c.oid AND t.relkind IN ('r', 'p', 'f')) AS alcanca
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('v', 'm') AND ${FORA_DO_SISTEMA}
       AND NOT ${DE_EXTENSAO("pg_class", "c.oid")}
     ORDER BY 1, 2`);
  const naLista = new Map(semInvoker.map((v) => [v.visao, v]));
  const precisa = new Set<string>();
  for (const v of r.rows) {
    const nome = nomeQualificado(v.esquema, v.visao);
    const exposta = v.lida_por.length > 0 && v.alcanca.length > 0;
    const semInvokerReal = v.tipo === "m" || !v.invoker;
    if (exposta && semInvokerReal) {
      precisa.add(nome);
      if (!naLista.has(nome)) {
        problemas.push(
          `visão ${nome} (lida por ${v.lida_por.join(", ")}, alcança ${v.alcanca.join(", ")}) não roda ` +
            "com os privilégios de quem consulta (security_invoker) e não consta em VISOES_SEM_INVOKER: " +
            "ela lê como o dono, e o RLS de quem consulta some",
        );
      }
    }
  }
  for (const [nome, v] of naLista) {
    if (!r.rows.some((l) => nomeQualificado(l.esquema, l.visao) === nome)) {
      problemas.push(`consta em VISOES_SEM_INVOKER (${v.etapa}) e a visão não existe: ${nome}`);
    } else if (!precisa.has(nome)) {
      problemas.push(
        `consta em VISOES_SEM_INVOKER (${v.etapa}) e não precisa (tem security_invoker, ou nenhum ` +
          `papel do produto a lê): ${nome}`,
      );
    }
    if (v.motivo.trim().length < MINIMO_DO_MOTIVO)
      problemas.push(`visão ${nome}: motivo curto demais`);
  }
  return problemas;
}

/* ------------------------------------------------------------------ item 6 */

/**
 * SEQUÊNCIAS e TIPOS (item 6), e o DONO de todo objeto e o privilégio padrão.
 *
 *   - sequência fora do sistema: os privilégios efetivos (USAGE, SELECT,
 *     UPDATE) de `dc360_app`, `dc360_console` e PUBLIC são exatamente os de
 *     `SEQUENCIAS_DO_PRODUTO` (nenhum, se não declarada), e nenhum outro papel
 *     além do dono tem privilégio nela;
 *   - tipo próprio (enum, domínio, composto avulso, intervalo, multirange):
 *     consta em `TIPOS_PROPRIOS` com a finalidade, nos dois sentidos;
 *   - nenhum objeto (tabela, visão, sequência, função, tipo, esquema) é de um
 *     papel do produto: dono passa pelo RLS que não é forçado e reescreve o
 *     objeto (`ALTER TYPE ... ADD VALUE`, `ALTER SEQUENCE`, `CREATE OR REPLACE`);
 *   - nenhum privilégio PADRÃO (`ALTER DEFAULT PRIVILEGES`) concede a papel
 *     do produto, nem a PUBLIC em tabela ou sequência: é o caminho pelo qual o
 *     objeto FUTURO nasce concedido sem migração nenhuma dizer.
 */
export async function conferirSequenciasETipos(
  db: ConsultaSql,
  sequencias: readonly SequenciaDoProduto[],
  tipos: readonly TipoProprio[],
): Promise<string[]> {
  const problemas: string[] = [];

  const seqs = await db.query<{ esquema: string; nome: string; grants: string[] }>(`
    SELECT n.nspname::text AS esquema, c.relname::text AS nome,
           ARRAY(
             SELECT CASE WHEN r.rolname = 'public' THEN 'PUBLIC' ELSE r.rolname END || ':' || pr
               FROM (SELECT rolname::text AS rolname, oid FROM pg_roles
                      WHERE rolname NOT LIKE 'pg\\_%' AND oid <> c.relowner AND NOT rolsuper
                     UNION ALL SELECT 'public', 0::oid) r,
                    unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) AS pr
              WHERE CASE WHEN r.oid = 0 THEN has_sequence_privilege('public', c.oid, pr)
                         ELSE has_sequence_privilege(r.oid, c.oid, pr) END
              ORDER BY 1) AS grants
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'S' AND ${FORA_DO_SISTEMA} AND NOT ${DE_EXTENSAO("pg_class", "c.oid")}
     ORDER BY 1, 2`);
  const declaradas = new Map(sequencias.map((s) => [s.sequencia, s]));
  for (const s of seqs.rows) {
    const nome = nomeQualificado(s.esquema, s.nome);
    const d = declaradas.get(nome);
    const esperado = new Set<string>();
    for (const p of PAPEIS_COM_GRANT)
      for (const pr of d?.grants[p] ?? []) esperado.add(`${p}:${pr}`);
    const real = new Set(s.grants);
    const sobra = [...real].filter((g) => !esperado.has(g));
    const falta = [...esperado].filter((g) => !real.has(g));
    if (sobra.length || falta.length) {
      problemas.push(
        `sequência ${nome}: privilégio efetivo diferente do declarado em SEQUENCIAS_DO_PRODUTO ` +
          `(a mais: ${sobra.join(", ") || "nada"}; faltando: ${falta.join(", ") || "nada"})`,
      );
    }
  }
  for (const [nome, d] of declaradas) {
    if (!seqs.rows.some((s) => nomeQualificado(s.esquema, s.nome) === nome)) {
      problemas.push(
        `consta em SEQUENCIAS_DO_PRODUTO (${d.etapa}) e a sequência não existe: ${nome}`,
      );
    }
    if (d.motivo.trim().length < MINIMO_DO_MOTIVO)
      problemas.push(`sequência ${nome}: motivo curto demais`);
  }

  const tps = await db.query<{ esquema: string; nome: string; tipo: string }>(`
    SELECT n.nspname::text AS esquema, t.typname::text AS nome, t.typtype::text AS tipo
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE ${FORA_DO_SISTEMA}
       AND NOT ${DE_EXTENSAO("pg_type", "t.oid")}
       AND NOT EXISTS (SELECT 1 FROM pg_type e WHERE e.typarray = t.oid)
       AND (t.typrelid = 0 OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
     ORDER BY 1, 2`);
  const tiposDeclarados = new Map(tipos.map((t) => [t.tipo, t]));
  for (const t of tps.rows) {
    const nome = nomeQualificado(t.esquema, t.nome);
    if (!tiposDeclarados.has(nome)) {
      problemas.push(
        `tipo próprio ${nome} (typtype ${t.tipo}) não consta em TIPOS_PROPRIOS: todo tipo ` +
          "compartilhado entre municípios entra com a finalidade, para um enum com dado de " +
          "município não passar por tipo genérico",
      );
    }
  }
  for (const [nome, d] of tiposDeclarados) {
    if (!tps.rows.some((t) => nomeQualificado(t.esquema, t.nome) === nome)) {
      problemas.push(`consta em TIPOS_PROPRIOS (${d.etapa}) e o tipo não existe: ${nome}`);
    }
    if (d.motivo.trim().length < MINIMO_DO_MOTIVO)
      problemas.push(`tipo ${nome}: motivo curto demais`);
  }

  const papeis = PAPEIS_DO_PRODUTO.map((p) => `'${p}'`).join(", ");
  const donos = await db.query<{ objeto: string; dono: string }>(`
    SELECT 'relação ' || c.oid::regclass::text AS objeto, pg_get_userbyid(c.relowner)::text AS dono
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE ${FORA_DO_SISTEMA} AND pg_get_userbyid(c.relowner) IN (${papeis})
    UNION ALL
    SELECT 'função ' || p.oid::regprocedure::text, pg_get_userbyid(p.proowner)::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE ${FORA_DO_SISTEMA} AND pg_get_userbyid(p.proowner) IN (${papeis})
    UNION ALL
    SELECT 'tipo ' || t.oid::regtype::text, pg_get_userbyid(t.typowner)::text
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE ${FORA_DO_SISTEMA} AND pg_get_userbyid(t.typowner) IN (${papeis})
    UNION ALL
    SELECT 'esquema ' || n.nspname::text, pg_get_userbyid(n.nspowner)::text
      FROM pg_namespace n
     WHERE ${FORA_DO_SISTEMA} AND pg_get_userbyid(n.nspowner) IN (${papeis})
     ORDER BY 1`);
  for (const d of donos.rows) {
    problemas.push(
      `${d.objeto} é de ${d.dono}, um papel do produto: quem é dono reescreve o objeto`,
    );
  }

  const padrao = await db.query<{ tipo: string; papel: string; privilegio: string }>(`
    SELECT d.defaclobjtype::text AS tipo,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee)::text END AS papel,
           x.privilege_type::text AS privilegio
      FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) x
     WHERE (x.grantee <> 0 AND pg_get_userbyid(x.grantee) IN (${papeis}))
        OR (x.grantee = 0 AND d.defaclobjtype IN ('r', 'S'))
     ORDER BY 1, 2, 3`);
  for (const p of padrao.rows) {
    problemas.push(
      `privilégio padrão concede ${p.privilegio} a ${p.papel} em todo objeto novo do tipo ${p.tipo}: ` +
        "o objeto futuro nasceria concedido sem a migração dele dizer",
    );
  }
  return problemas;
}

/* ------------------------------------------------- correção 2 da ADR 0009 (b) */

/**
 * O ALCANCE DO GATILHO (decisão 1 da ADR 0009, correção 2): nenhum papel do
 * produto, nem PUBLIC, tem o privilégio TRIGGER em relação nenhuma (com ele se
 * cria gatilho na tabela alheia), e nenhum papel do produto pode mudar
 * `session_replication_role` (com ele os gatilhos e as chaves estrangeiras
 * param de valer na sessão).
 */
export async function conferirGatilhoForaDoAlcance(db: ConsultaSql): Promise<string[]> {
  const problemas: string[] = [];
  const r = await db.query<{ papel: string; relacao: string }>(`
    SELECT p AS papel, c.oid::regclass::text AS relacao
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['dc360_app', 'dc360_console', 'public']) AS p
     WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND ${FORA_DO_SISTEMA}
       AND has_table_privilege(p, c.oid, 'TRIGGER')
     ORDER BY 1, 2`);
  for (const l of r.rows) {
    problemas.push(
      `${l.papel === "public" ? "PUBLIC" : l.papel} tem TRIGGER em ${l.relacao}: cria gatilho na tabela`,
    );
  }
  const s = await db.query<{ papel: string; pode: boolean }>(`
    SELECT p AS papel, has_parameter_privilege(p, 'session_replication_role', 'SET') AS pode
      FROM unnest(ARRAY['dc360_app', 'dc360_console']) AS p`);
  for (const l of s.rows) {
    if (l.pode)
      problemas.push(
        `${l.papel} pode mudar session_replication_role: desliga gatilho e chave estrangeira`,
      );
  }
  return problemas;
}

/* ------------------------------------------------- correção 2 da ADR 0009 (a) */

/** O corpo sem comentários. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const DDL: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/gi, "DDL"],
  [/\bCOMMENT\s+ON\b/gi, "DDL"],
  [/\bSECURITY\s+LABEL\b/gi, "DDL"],
  [/\bDISABLE\s+TRIGGER\b/gi, "desliga gatilho"],
  [/session_replication_role/gi, "mexe em session_replication_role"],
  [/\bSET\s+(LOCAL\s+|SESSION\s+)?(ROLE|SESSION\s+AUTHORIZATION)\b/gi, "troca de papel"],
];

/**
 * O que o corpo de uma função faz fora do MODELO: DDL, `DISABLE TRIGGER`,
 * `session_replication_role` (no corpo ou no `SET` da função), troca de
 * papel, e `EXECUTE` de texto montado que não seja `EXECUTE format('<DML
 * constante>', ...)` com só `%I`, `%L` ou `%%` no modelo. Vazio quando nada.
 */
export function foraDoModelo(corpo: string, config: readonly string[] = []): string[] {
  const achados: string[] = [];
  const limpo = semComentarios(corpo);
  for (const [re, oQue] of DDL) {
    for (const m of limpo.matchAll(re)) achados.push(`${oQue}: "${m[0]}"`);
  }
  for (const c of config) {
    if (/^session_replication_role=/i.test(c)) achados.push(`SET ${c} na própria função`);
  }
  for (const m of limpo.matchAll(/\bEXECUTE\b/gi)) {
    const resto = limpo.slice(m.index);
    const f = /^EXECUTE\s+format\s*\(\s*'((?:[^']|'')*)'/i.exec(resto);
    if (!f) {
      achados.push(
        `EXECUTE de texto que não é format('<DML constante>', ...): "${resto.slice(0, 60).replace(/\s+/g, " ")}"`,
      );
      continue;
    }
    const modelo = f[1]!.replace(/''/g, "'");
    if (!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(modelo)) {
      achados.push(`EXECUTE format com modelo que não é DML: "${modelo.slice(0, 60)}"`);
    }
    if (modelo.includes(";"))
      achados.push(`EXECUTE format com mais de um comando no modelo: "${modelo.slice(0, 60)}"`);
    for (const e of modelo.matchAll(/%(?:\d+\$)?(?:-?\d*|\*)?(.)/g)) {
      if (!["I", "L", "%"].includes(e[1]!)) {
        achados.push(
          `EXECUTE format com ${e[0]} no modelo (só %I, %L e %% montam SQL sem injetar texto)`,
        );
      }
    }
  }
  return achados;
}

/**
 * O CORPO de cada função privilegiada (correção 2 da ADR 0009, e o item 5 da
 * auditoria): nada fora do modelo, salvo a entrada declarar
 * `corpoForaDoModelo` com o porquê; e a declaração sem nada que a justifique
 * reprova. Uma migração que recriasse uma função por `EXECUTE format('CREATE
 * FUNCTION ...')` reprova aqui na função que o faz.
 */
export async function conferirCorpoDasFuncoes(
  db: ConsultaSql,
  funcoes: readonly FuncaoPrivilegiada[],
): Promise<string[]> {
  const problemas: string[] = [];
  const r = await db.query<{ assinatura: string; corpo: string; config: string[] | null }>(`
    SELECT n.nspname || '.' || p.proname || '(' ||
             replace(oidvectortypes(p.proargtypes), ', ', ',') || ')' AS assinatura,
           coalesce(p.prosrc, '') AS corpo, p.proconfig AS config
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef AND ${FORA_DO_SISTEMA}
       AND (n.nspname = 'public' OR NOT ${DE_EXTENSAO("pg_proc", "p.oid")})
     ORDER BY 1`);
  if (r.rows.length === 0)
    return ["nenhuma função SECURITY DEFINER: a conferência quebrou, não o banco"];
  const porChave = new Map(funcoes.map((f) => [f.assinatura, f]));
  for (const f of r.rows) {
    const achados = foraDoModelo(f.corpo, f.config ?? []);
    const entrada = porChave.get(f.assinatura);
    if (achados.length && !entrada?.corpoForaDoModelo) {
      problemas.push(
        `${f.assinatura}: o corpo sai do modelo (${achados.join("; ")}). Função privilegiada não faz ` +
          "DDL nem mexe em session_replication_role, e só executa texto montado na forma " +
          "EXECUTE format('<DML constante>', ...); fora disso, a entrada declara corpoForaDoModelo",
      );
    }
    if (!achados.length && entrada?.corpoForaDoModelo) {
      problemas.push(
        `${f.assinatura}: declara corpoForaDoModelo, e o corpo não sai do modelo (isenção que sobrou)`,
      );
    }
  }
  for (const f of funcoes) {
    if (f.corpoForaDoModelo !== undefined && f.corpoForaDoModelo.trim().length < MINIMO_DO_MOTIVO) {
      problemas.push(`${f.assinatura}: corpoForaDoModelo curto demais para ser um motivo`);
    }
  }
  return problemas;
}

/* ------------------------------------------------------ correção 3 da ADR 0009 */

/**
 * QUEM CITA `origens_de_conta` (decisão 1 da ADR 0009, correção 3). A tabela
 * guarda de onde veio o `pessoa_id` de cada conta (`backfill`, `criador`,
 * `aceite`), e só quem produz o valor a grava: a função do gatilho criador e
 * `aceitar_convite` (o `backfill` é a própria migração da E15, fora de função).
 * A tabela nasce na E15; a conferência vale desde já, e hoje passa porque
 * nenhuma função a cita.
 *
 * Olha TODA função fora do sistema, e não só as `SECURITY DEFINER`: uma função
 * comum chamada de dentro de uma privilegiada roda com os privilégios do dono
 * dela, e seria o atalho para gravar a marca sem aparecer no catálogo. Função
 * que cita a tabela (fora de comentário) e não está em `FUNCOES_PRIVILEGIADAS`
 * com `gravaOrigemDeConta` reprova; `aceite` só em `aceitar_convite`; cada
 * marca numa função só; a marca numa função que não cita a tabela reprova.
 */
export async function conferirQuemCitaOrigensDeConta(
  db: ConsultaSql,
  funcoes: readonly FuncaoPrivilegiada[],
): Promise<string[]> {
  const problemas: string[] = [];
  const r = await db.query<{ assinatura: string; corpo: string }>(`
    SELECT n.nspname || '.' || p.proname || '(' ||
             replace(oidvectortypes(p.proargtypes), ', ', ',') || ')' AS assinatura,
           coalesce(p.prosrc, '') AS corpo
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE ${FORA_DO_SISTEMA} AND NOT ${DE_EXTENSAO("pg_proc", "p.oid")}
       AND p.prosrc ILIKE '%origens_de_conta%'
     ORDER BY 1`);
  const citam = new Set(
    r.rows
      .filter((f) => /\borigens_de_conta\b/i.test(semComentarios(f.corpo)))
      .map((f) => f.assinatura),
  );
  const marcadas = funcoes.filter((f) => f.gravaOrigemDeConta);
  const porChave = new Map(marcadas.map((f) => [f.assinatura, f]));
  for (const assinatura of citam) {
    if (!porChave.has(assinatura)) {
      problemas.push(
        `${assinatura} cita origens_de_conta no corpo e não é o gatilho criador nem aceitar_convite ` +
          "(gravaOrigemDeConta em FUNCOES_PRIVILEGIADAS): a origem do pessoa_id só é gravada por quem o produz",
      );
    }
  }
  for (const marca of ["criador", "aceite"] as const) {
    const com = marcadas.filter((f) => f.gravaOrigemDeConta === marca);
    if (com.length > 1) {
      problemas.push(
        `a marca ${marca} de origens_de_conta está em mais de uma função: ${com.map((f) => f.assinatura).join(", ")}`,
      );
    }
  }
  for (const f of marcadas) {
    if (f.gravaOrigemDeConta === "aceite" && f.nome !== "aceitar_convite") {
      problemas.push(`${f.assinatura}: a marca aceite de origens_de_conta é só de aceitar_convite`);
    }
    if (!citam.has(f.assinatura)) {
      problemas.push(
        `${f.assinatura}: declara gravaOrigemDeConta e o corpo não cita origens_de_conta (marca que sobrou)`,
      );
    }
  }
  return problemas;
}

/* ------------------------------------------------- correção 2 da ADR 0009 (c) */

/**
 * A FORMA da marca "recusada depois da liberação". A liberação da segunda
 * conta (064, E16) ainda não existe; até ela, a função marcada é do caminho
 * antigo e o papel de aplicação continua a executá-la (a API anterior a
 * chama). Depois dela, nenhuma marcada tem EXECUTE do papel de aplicação.
 * `liberada` vem do banco quando a marca de liberação existir; até lá, o
 * portão passa `false`. A recusa pela marca é teste da E16.
 */
export function conferirMarcaDeLiberacao(
  funcoes: readonly FuncaoPrivilegiada[],
  liberada: boolean,
): string[] {
  const problemas: string[] = [];
  for (const f of funcoes) {
    if (!f.recusadaDepoisDaLiberacao) continue;
    const doApp = f.executavelPor.includes("dc360_app");
    if (!liberada && !doApp) {
      problemas.push(
        `${f.assinatura}: marcada como recusada depois da liberação, mas o papel de aplicação não a ` +
          "executa: o caminho antigo é do papel de aplicação",
      );
    }
    if (liberada && doApp) {
      problemas.push(
        `${f.assinatura}: depois da liberação, função do caminho antigo com EXECUTE do papel de aplicação`,
      );
    }
  }
  return problemas;
}

/* ------------------------------------------------------------------ item 5 */

/** A definição instalada de cada função SECURITY DEFINER, pela assinatura. */
export async function definicoesInstaladas(db: ConsultaSql): Promise<Map<string, string>> {
  const r = await db.query<{ assinatura: string; definicao: string }>(`
    SELECT n.nspname || '.' || p.proname || '(' ||
             replace(oidvectortypes(p.proargtypes), ', ', ',') || ')' AS assinatura,
           pg_get_functiondef(p.oid) AS definicao
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef AND p.prokind = 'f' AND ${FORA_DO_SISTEMA}
       AND (n.nspname = 'public' OR NOT ${DE_EXTENSAO("pg_proc", "p.oid")})`);
  return new Map(r.rows.map((l) => [l.assinatura, l.definicao]));
}

/**
 * Registra, depois de cada migração aplicada, em qual migração a definição
 * INSTALADA de cada função privilegiada mudou por último. É o que o banco
 * diz, e não o que o texto da migração parece dizer: uma função recriada por
 * `EXECUTE format(...)` com o nome montado aparece aqui na migração que a
 * recriou.
 */
export class HistoricoDasDefinicoes {
  private readonly ultima = new Map<string, { migracao: string; definicao: string }>();

  async registrar(db: ConsultaSql, migracao: string): Promise<void> {
    for (const [assinatura, definicao] of await definicoesInstaladas(db)) {
      const antes = this.ultima.get(assinatura);
      if (!antes || antes.definicao !== definicao)
        this.ultima.set(assinatura, { migracao, definicao });
    }
  }

  ultimaMudanca(assinatura: string): string | undefined {
    return this.ultima.get(assinatura)?.migracao;
  }

  get tamanho(): number {
    return this.ultima.size;
  }
}

/**
 * Item 5: a migração declarada de cada função é aquela em que a definição
 * instalada mudou por último. Uma migração que reescreve o corpo de uma função
 * catalogada (por texto ou por SQL dinâmico) sem a etapa declarar a entrada
 * nova (`redefine`) reprova.
 */
export function conferirDefinicaoInstalada(
  historico: HistoricoDasDefinicoes,
  funcoes: readonly FuncaoPrivilegiada[],
): string[] {
  const problemas: string[] = [];
  if (historico.tamanho === 0)
    return ["o histórico das definições está vazio: a conferência quebrou"];
  for (const f of funcoes) {
    const ultima = historico.ultimaMudanca(f.assinatura);
    if (ultima !== f.migracao) {
      problemas.push(
        `${f.assinatura}: o catálogo diz que a forma atual vem da migração ${f.migracao}, e a ` +
          `definição instalada mudou por último na ${ultima ?? "nenhuma"}. Quem mudou a função ` +
          "declara a entrada nova no arquivo da etapa dela, com redefine: true.",
      );
    }
  }
  return problemas;
}

/* ------------------------------------------------------------------ item 4 */

const normalizar = (s: string | null) => (s === null ? null : s.replace(/\s+/g, " ").trim());

/**
 * Item 4: cada policy das tabelas do fornecedor bate, cláusula a cláusula, com
 * a declarada em `POLICIES_DO_FORNECEDOR` (USING e WITH CHECK separados,
 * comando, papel e modo), nos dois sentidos.
 */
export async function conferirPoliciesDoFornecedor(
  db: ConsultaSql,
  esperadas: readonly PolicyDoFornecedor[],
  tabelas: readonly string[],
): Promise<string[]> {
  const problemas: string[] = [];
  const r = await db.query<{
    tabela: string;
    policy: string;
    cmd: string;
    papeis: string;
    modo: string;
    qual: string | null;
    with_check: string | null;
  }>(
    `SELECT tablename::text AS tabela, policyname::text AS policy, cmd::text AS cmd,
            array_to_string(roles, ',') AS papeis, permissive::text AS modo, qual, with_check
       FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[])
      ORDER BY 1, 2`,
    [tabelas],
  );
  const chave = (t: string, p: string) => `${t}.${p}`;
  const declaradas = new Map(esperadas.map((p) => [chave(p.tabela, p.policy), p]));
  for (const p of r.rows) {
    const k = chave(p.tabela, p.policy);
    const d = declaradas.get(k);
    if (!d) {
      problemas.push(`policy ${k} numa tabela do fornecedor e fora de POLICIES_DO_FORNECEDOR`);
      continue;
    }
    if (p.cmd !== d.comando)
      problemas.push(`policy ${k}: comando ${p.cmd}, declarado ${d.comando}`);
    if (p.papeis !== d.papel)
      problemas.push(`policy ${k}: papéis ${p.papeis}, declarado ${d.papel}`);
    if (p.modo !== d.modo) problemas.push(`policy ${k}: modo ${p.modo}, declarado ${d.modo}`);
    if (normalizar(p.qual) !== normalizar(d.using)) {
      problemas.push(
        `policy ${k}: o USING é ${p.qual ?? "nenhum"}, e o declarado é ${d.using ?? "nenhum"}`,
      );
    }
    if (normalizar(p.with_check) !== normalizar(d.withCheck)) {
      problemas.push(
        `policy ${k}: o WITH CHECK é ${p.with_check ?? "nenhum"}, e o declarado é ${d.withCheck ?? "nenhum"}`,
      );
    }
  }
  for (const [k] of declaradas) {
    if (!r.rows.some((p) => chave(p.tabela, p.policy) === k)) {
      problemas.push(`consta em POLICIES_DO_FORNECEDOR e não existe no banco: ${k}`);
    }
  }
  return problemas;
}

/* ------------------------------------------------------------------ item 7 */

/**
 * Item 7: o ACL dos objetos de EXTENSÃO, quando a extensão existe. Papel do
 * produto não é dono de objeto de extensão (conferido em
 * `conferirSequenciasETipos`), e em objeto de extensão:
 *
 *   - relação: nenhum privilégio de papel do produto nem de PUBLIC, salvo o
 *     SELECT nomeado em `LEITURAS_DE_EXTENSAO`;
 *   - função: só EXECUTE, nunca com opção de concessão.
 *
 * Devolve também as extensões de entradas declaradas que não estão
 * instaladas (no PGlite, o PostGIS), para quem chama dizer o que não conferiu.
 */
export async function conferirAclDeExtensoes(
  db: ConsultaSql,
  leituras: readonly LeituraDeExtensao[],
): Promise<{ problemas: string[]; naoInstaladas: string[] }> {
  const problemas: string[] = [];
  const instaladas = new Set(
    (await db.query<{ e: string }>("SELECT extname::text AS e FROM pg_extension")).rows.map(
      (l) => l.e,
    ),
  );
  const rel = await db.query<{
    extensao: string;
    relacao: string;
    papel: string;
    privilegio: string;
  }>(`
    SELECT e.extname::text AS extensao, n.nspname || '.' || c.relname AS relacao,
           CASE WHEN p = 'public' THEN 'PUBLIC' ELSE p END AS papel, pr AS privilegio
      FROM pg_depend d
      JOIN pg_extension e ON e.oid = d.refobjid
      JOIN pg_class c ON c.oid = d.objid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['dc360_app', 'dc360_console', 'public']) AS p
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS pr
     WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
       AND d.classid = 'pg_class'::regclass AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND has_table_privilege(p, c.oid, pr)
     ORDER BY 1, 2, 3, 4`);
  const lidas = new Set(leituras.map((l) => `${l.relacao}:${l.papel}`));
  for (const l of rel.rows) {
    if (l.privilegio === "SELECT" && lidas.has(`${l.relacao}:${l.papel}`)) continue;
    problemas.push(
      `${l.papel} tem ${l.privilegio} em ${l.relacao}, da extensão ${l.extensao}: fora de ` +
        "LEITURAS_DE_EXTENSAO, objeto de extensão não concede nada além de EXECUTE e USAGE",
    );
  }
  const fun = await db.query<{
    extensao: string;
    funcao: string;
    papel: string;
    privilegio: string;
    grantable: boolean;
  }>(`
    SELECT e.extname::text AS extensao, p.oid::regprocedure::text AS funcao,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee)::text END AS papel,
           x.privilege_type::text AS privilegio, x.is_grantable AS grantable
      FROM pg_depend d
      JOIN pg_extension e ON e.oid = d.refobjid
      JOIN pg_proc p ON p.oid = d.objid
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
     WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
       AND d.classid = 'pg_proc'::regclass
       AND (x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('dc360_app', 'dc360_console'))
       AND (x.is_grantable OR x.privilege_type <> 'EXECUTE')
     ORDER BY 1, 2, 3`);
  for (const f of fun.rows) {
    problemas.push(
      `${f.papel} tem ${f.privilegio}${f.grantable ? " WITH GRANT OPTION" : ""} em ${f.funcao}, ` +
        `da extensão ${f.extensao}: em função de extensão, só EXECUTE, sem opção de concessão`,
    );
  }
  const naoInstaladas = new Set<string>();
  for (const l of leituras) {
    if (!instaladas.has(l.extensao)) {
      naoInstaladas.add(l.extensao);
      continue;
    }
    const tem = rel.rows.some(
      (r) => r.relacao === l.relacao && r.papel === l.papel && r.privilegio === "SELECT",
    );
    if (!tem) {
      problemas.push(
        `consta em LEITURAS_DE_EXTENSAO (${l.etapa}): ${l.papel} lê ${l.relacao}, e o banco não confirma`,
      );
    }
  }
  return { problemas, naoInstaladas: [...naoInstaladas].sort() };
}
