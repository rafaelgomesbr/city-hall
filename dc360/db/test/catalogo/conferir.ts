/**
 * A conferência do catálogo nominal contra o catálogo do BANCO, nos dois
 * sentidos. Fica fora de `isolamento.test.ts` para poder ser exercida com
 * casos sintéticos (`db/test/catalogo-nominal.test.ts`): uma conferência que
 * ninguém viu reprovar é uma conferência que pode estar quebrada, e o portão
 * de isolamento já teve dois testes verdes e vazios na mesma semana.
 *
 * Cada função devolve a LISTA DE PROBLEMAS em português, vazia quando tudo
 * bate. Quem chama decide como reprovar (o portão faz `expect(problemas)
 * .toEqual([])`, e a mensagem de falha já diz o que arrumar).
 *
 * TODOS OS ESQUEMAS, e não só `public` (correção 1 da parte 0B). A primeira
 * versão perguntava ao banco só pelo esquema `public`, e por isso uma função
 * `SECURITY DEFINER` num esquema novo (lendo `organizacoes` inteira para o
 * papel de aplicação) e uma tabela sem RLS noutro esquema passavam pelo
 * portão inteiro. Agora a pergunta é feita a todo esquema que não seja do
 * sistema (`pg_*` e `information_schema`; o Postgres recusa criar esquema com
 * o prefixo `pg_`). Fora de `public`, o que pertence a uma EXTENSÃO
 * (`pg_depend` com `deptype = 'e'`) fica de fora, porque é assim que o PostGIS
 * mora no esquema `extensions` do provedor (`db/provedores/postgis.sql`).
 * Dentro de `public` nada fica de fora, como sempre foi.
 */
import {
  INVARIANTES,
  type ContribuicaoDoCatalogo,
  type ExcecaoAoIsolamento,
  type FuncaoPrivilegiada,
  type GrantsEfetivos,
  type Invariante,
  type PapelComGrant,
} from "./tipos.js";

/** O mínimo de que a conferência precisa: PGlite, uma transação dele ou `pg`. */
export interface ConsultaSql {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = Record<string, unknown>>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}

/** O tamanho mínimo de um texto de motivo ou de conferência: obriga a escrever. */
export const MINIMO_DO_MOTIVO = 40;
export const MINIMO_DA_CONFERENCIA = 30;

/** Os dois papéis do produto. Nenhum deles pode ser dono de nada. */
const PAPEIS_DO_PRODUTO = ["dc360_app", "dc360_console"] as const;
const PAPEIS_COM_GRANT: readonly PapelComGrant[] = ["dc360_app", "dc360_console", "PUBLIC"];

/**
 * O filtro de esquema do sistema, em SQL, sobre um `pg_namespace` chamado `n`.
 * `pg_*` cobre `pg_catalog`, `pg_toast` e os temporários.
 */
const FORA_DO_SISTEMA = `n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`;

/** O objeto pertence a uma extensão (classe do catálogo e oid em SQL). */
const DE_EXTENSAO = (classe: string, oid: string) =>
  `EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${classe}'::regclass ` +
  `AND d.objid = ${oid} AND d.deptype = 'e')`;

/** O nome de uma tabela como o catálogo nominal o escreve: nu em `public`, qualificado fora dele. */
export function nomeQualificado(esquema: string, nome: string): string {
  return esquema === "public" ? nome : `${esquema}.${nome}`;
}

/**
 * A chave de uma função: a assinatura completa, `esquema.nome(tipo,tipo)`.
 * No banco ela é montada de `pg_proc` (`proargtypes`, os argumentos de
 * ENTRADA, os mesmos de `oid::regprocedure`), com o esquema sempre escrito.
 */
export function chaveDaFuncao(f: { assinatura: string }): string {
  return f.assinatura;
}

interface FuncaoDoBanco {
  assinatura: string;
  acl: string | null;
  dono: string;
  fonte: string;
}

async function definidorasDoBanco(db: ConsultaSql): Promise<FuncaoDoBanco[]> {
  const r = await db.query<FuncaoDoBanco>(`
    SELECT n.nspname || '.' || p.proname || '(' ||
             replace(oidvectortypes(p.proargtypes), ', ', ',') || ')' AS assinatura,
           array_to_string(p.proacl, ',') AS acl,
           pg_get_userbyid(p.proowner)::text AS dono,
           coalesce(p.prosrc, '') AS fonte
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef
       AND ${FORA_DO_SISTEMA}
       AND (n.nspname = 'public' OR NOT ${DE_EXTENSAO("pg_proc", "p.oid")})
     ORDER BY 1
  `);
  return r.rows;
}

/**
 * O dono das tabelas do produto: quem roda as migrações. Toda função
 * privilegiada tem de ser dele, porque `SECURITY DEFINER` roda com os
 * privilégios do DONO; uma função trocada de dono vira outra porta.
 */
async function donoDasTabelas(db: ConsultaSql): Promise<string | null> {
  const r = await db.query<{ dono: string }>(
    "SELECT tableowner::text AS dono FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizacoes'",
  );
  return r.rows[0]?.dono ?? null;
}

/**
 * Quem tem EXECUTE, tirando o DONO da função (o nome vem do catálogo, e não
 * do "quem concedeu a si mesmo" da ACL: depois de um `ALTER FUNCTION ... OWNER
 * TO`, a ACL inteira é reescrita no nome do dono novo, e a regra antiga, que
 * pulava a entrada em que concessor e concedido coincidem, pulava justamente
 * o papel que acabara de virar dono). ACL nula é o privilégio padrão do
 * Postgres, que inclui `PUBLIC`: devolve "PUBLIC" para o chamador reprovar.
 *
 * EXECUTE com opção de concessão (`X*`) sai como `papel WITH GRANT OPTION`,
 * e por isso nunca bate com o declarado: com a opção, o papel repassa o
 * EXECUTE a quem quiser (o de aplicação ao do console, por exemplo), e a
 * lista de quem executa deixa de ser a que o catálogo diz.
 */
export function quemExecuta(acl: string | null, dono: string): string[] {
  if (acl === null) return ["PUBLIC"];
  const quem = new Set<string>();
  for (const entrada of acl.split(",")) {
    const m = /^([^=]*)=([^/]*)\/(.*)$/.exec(entrada);
    if (!m) {
      quem.add(`ilegível:${entrada}`);
      continue;
    }
    const [, grantee, privilegios] = m;
    const papel = grantee === "" ? "PUBLIC" : grantee!;
    if (papel === dono) continue;
    quem.add(privilegios!.includes("*") ? `${papel} WITH GRANT OPTION` : papel);
  }
  return [...quem].sort();
}

/**
 * `FUNCOES_PRIVILEGIADAS` contra as funções `SECURITY DEFINER` do banco, em
 * todos os esquemas, pela assinatura completa.
 *
 * Sentido 1: função no banco fora da lista reprova. Sentido 2: entrada na
 * lista sem a função no banco reprova. E o que a entrada diz precisa ser
 * verdade no banco: o EXECUTE concedido é exatamente o declarado (nunca
 * `PUBLIC`, nunca com opção de concessão); o dono da função é o dono das
 * tabelas; quem declara conferir o tenant pelo CONTEXTO tem
 * `app_organizacao_atual` no corpo; a dívida de tenant tem etapa que a paga; e
 * motivo e conferência não são texto de enchimento.
 */
export async function conferirFuncoesPrivilegiadas(
  db: ConsultaSql,
  funcoes: readonly FuncaoPrivilegiada[],
): Promise<string[]> {
  const problemas: string[] = [];
  const doBanco = await definidorasDoBanco(db);
  if (doBanco.length === 0) {
    return [
      "a consulta ao catálogo não devolveu nenhuma função SECURITY DEFINER: a conferência quebrou, não o banco",
    ];
  }
  const dono = await donoDasTabelas(db);
  if (dono === null) {
    return ["a consulta não achou o dono de `organizacoes`: a conferência quebrou, não o banco"];
  }
  if ((PAPEIS_DO_PRODUTO as readonly string[]).includes(dono)) {
    problemas.push(`o dono das tabelas é ${dono}, um papel do produto: o RLS dele é enfeite`);
  }

  const naLista = new Map(funcoes.map((f) => [chaveDaFuncao(f), f]));
  const noBanco = new Map(doBanco.map((f) => [f.assinatura, f]));

  for (const [chave] of noBanco) {
    if (!naLista.has(chave)) {
      problemas.push(
        `função SECURITY DEFINER no banco fora de FUNCOES_PRIVILEGIADAS: ${chave}. ` +
          "Cada função privilegiada é uma porta na parede do RLS: entre na lista da sua etapa " +
          "(db/test/catalogo/f03-eNN.ts) com nome, motivo e como confere o tenant.",
      );
    }
  }

  for (const [chave, f] of naLista) {
    const real = noBanco.get(chave);
    if (!real) {
      problemas.push(
        `consta em FUNCOES_PRIVILEGIADAS (${f.etapa}) mas não existe no banco como SECURITY DEFINER: ${chave}`,
      );
      continue;
    }

    if (real.dono !== dono) {
      problemas.push(
        `${chave}: o dono da função é ${real.dono}, e não ${dono}, o dono das tabelas. ` +
          "SECURITY DEFINER roda com os privilégios do dono: trocar o dono é trocar a porta.",
      );
    }

    const esperado = [...f.executavelPor].sort();
    // O dono que se pula é o das TABELAS: um dono trocado aparece como quem executa.
    const real_ = quemExecuta(real.acl, dono);
    if (JSON.stringify(esperado) !== JSON.stringify(real_)) {
      problemas.push(
        `${chave}: o EXECUTE do banco (${real_.join(", ") || "ninguém"}) não é o declarado ` +
          `(${esperado.join(", ") || "ninguém"})`,
      );
    }

    if (f.tenant === "contexto" && !real.fonte.includes("app_organizacao_atual")) {
      problemas.push(
        `${chave}: declara conferir o tenant pelo contexto, mas o corpo da função não chama ` +
          "app_organizacao_atual(): o catálogo diz uma coisa e o SQL faz outra",
      );
    }
  }

  for (const f of funcoes) {
    const chave = chaveDaFuncao(f);
    if (f.motivo.trim().length < MINIMO_DO_MOTIVO) {
      problemas.push(
        `${chave}: o motivo está curto demais para ser um motivo (mínimo ${MINIMO_DO_MOTIVO} caracteres)`,
      );
    }
    if (f.confere.trim().length < MINIMO_DA_CONFERENCIA) {
      problemas.push(
        `${chave}: "como confere o tenant" está curto demais (mínimo ${MINIMO_DA_CONFERENCIA} caracteres)`,
      );
    }
    if (f.tenant === "ainda_nao_confere" && !f.corrigidaEm) {
      problemas.push(`${chave}: dívida de tenant sem a etapa que a paga (corrigidaEm)`);
    }
    if (f.tenant !== "ainda_nao_confere" && f.corrigidaEm) {
      problemas.push(`${chave}: tem corrigidaEm mas já declara conferir o tenant (${f.tenant})`);
    }
    if (f.executavelPor.length === 0) {
      problemas.push(
        `${chave}: sem nenhum papel com EXECUTE; função privilegiada que ninguém chama não deve existir`,
      );
    }
  }

  return problemas;
}

interface TabelaDoBanco {
  tabela: string;
  tem_organizacao_id: boolean;
  tem_policy_de_tenant: boolean;
  rls: boolean;
  rls_forcada: boolean;
  policies_alem_do_insert_do_app: number;
  policies_fora_do_console: number;
  policies_de_delete: number;
  fks_sem_organizacao: number;
  grants: string[];
}

/** Os privilégios de tabela e de coluna que existem. */
const PRIVILEGIOS_DE_TABELA = [
  "DELETE",
  "INSERT",
  "REFERENCES",
  "SELECT",
  "TRIGGER",
  "TRUNCATE",
  "UPDATE",
];
const PRIVILEGIOS_DE_COLUNA = ["INSERT", "REFERENCES", "SELECT", "UPDATE"];
const emSql = (xs: readonly string[]) => `ARRAY[${xs.map((x) => `'${x}'`).join(", ")}]`;

/**
 * As tabelas de todos os esquemas fora do sistema (fora de `public`, menos as
 * de extensão), com cada fato que um invariante do portão pergunta. A tabela
 * de controle do aplicador de migrações (`public.schema_migracoes`) não é
 * tabela de negócio e fica fora, como o portão sempre a deixou.
 *
 * `grants` vem como `papel:PRIVILEGIO` (de tabela) ou `papel:PRIVILEGIO
 * (coluna)` (só em alguma coluna), perguntado ao banco com
 * `has_table_privilege` e `has_any_column_privilege`, que enxergam herança de
 * papel e não só o GRANT direto.
 */
async function tabelasDoBanco(db: ConsultaSql): Promise<TabelaDoBanco[]> {
  const papeis = emSql(PAPEIS_COM_GRANT.map((p) => (p === "PUBLIC" ? "public" : p)));
  const r = await db.query<TabelaDoBanco & { esquema: string }>(`
    SELECT n.nspname::text AS esquema,
           c.relname::text AS tabela,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS rls_forcada,
           EXISTS (
             SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attname = 'organizacao_id'
                AND a.attnotnull AND NOT a.attisdropped
           ) AS tem_organizacao_id,
           EXISTS (
             SELECT 1 FROM pg_policies p
              WHERE p.schemaname = n.nspname AND p.tablename = c.relname
                AND array_to_string(p.roles, ',') <> 'dc360_console'
                AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%app_organizacao_atual%'
           ) AS tem_policy_de_tenant,
           (SELECT count(*)::int FROM pg_policies p
             WHERE p.schemaname = n.nspname AND p.tablename = c.relname
               AND NOT (p.cmd = 'INSERT' AND array_to_string(p.roles, ',') = 'dc360_app')
           ) AS policies_alem_do_insert_do_app,
           (SELECT count(*)::int FROM pg_policies p
             WHERE p.schemaname = n.nspname AND p.tablename = c.relname
               AND array_to_string(p.roles, ',') <> 'dc360_console'
           ) AS policies_fora_do_console,
           (SELECT count(*)::int FROM pg_policies p
             WHERE p.schemaname = n.nspname AND p.tablename = c.relname
               AND p.cmd IN ('DELETE', 'ALL')
           ) AS policies_de_delete,
           (SELECT count(*)::int FROM pg_constraint k
             WHERE k.conrelid = c.oid AND k.contype = 'f'
               AND k.confrelid <> 'public.organizacoes'::regclass
               AND NOT EXISTS (
                 SELECT 1 FROM unnest(k.conkey) AS col(n)
                   JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = col.n
                  WHERE a.attname = 'organizacao_id')
           ) AS fks_sem_organizacao,
           ARRAY(
             SELECT CASE WHEN papel = 'public' THEN 'PUBLIC' ELSE papel END || ':' || pr
               FROM unnest(${papeis}) AS papel, unnest(${emSql(PRIVILEGIOS_DE_TABELA)}) AS pr
              WHERE has_table_privilege(papel, c.oid, pr)
             UNION
             SELECT CASE WHEN papel = 'public' THEN 'PUBLIC' ELSE papel END || ':' || pr || ' (coluna)'
               FROM unnest(${papeis}) AS papel, unnest(${emSql(PRIVILEGIOS_DE_COLUNA)}) AS pr
              WHERE has_any_column_privilege(papel, c.oid, pr)
                AND NOT has_table_privilege(papel, c.oid, pr)
             ORDER BY 1
           ) AS grants
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p')
       AND ${FORA_DO_SISTEMA}
       AND (n.nspname = 'public' OR NOT ${DE_EXTENSAO("pg_class", "c.oid")})
       AND NOT (n.nspname = 'public' AND c.relname = 'schema_migracoes')
     ORDER BY n.nspname, c.relname
  `);
  return r.rows.map((t) => ({ ...t, tabela: nomeQualificado(t.esquema, t.tabela) }));
}

/** Os grants efetivos de uma tabela do banco, na forma de `GrantsEfetivos`. */
function grantsDoBanco(t: TabelaDoBanco): Record<PapelComGrant, string[]> {
  const g: Record<PapelComGrant, string[]> = { dc360_app: [], dc360_console: [], PUBLIC: [] };
  for (const item of t.grants) {
    const i = item.indexOf(":");
    g[item.slice(0, i) as PapelComGrant].push(item.slice(i + 1));
  }
  for (const p of PAPEIS_COM_GRANT) g[p].sort();
  return g;
}

/** Cada invariante, perguntado ao banco: `true` quando a tabela o cumpre. */
function cumpre(inv: Invariante, t: TabelaDoBanco, grants: GrantsEfetivos): boolean {
  const real = grantsDoBanco(t);
  switch (inv) {
    case "organizacao_id":
      return t.tem_organizacao_id;
    case "policy_de_contexto":
      return t.tem_policy_de_tenant;
    case "rls_forcada":
      return t.rls && t.rls_forcada;
    case "grants_declarados":
      return PAPEIS_COM_GRANT.every(
        (p) => JSON.stringify([...(grants[p] ?? [])].sort()) === JSON.stringify(real[p]),
      );
    case "fk_com_organizacao":
      return t.fks_sem_organizacao === 0;
    case "sem_delete":
      return t.policies_de_delete === 0 && !t.grants.some((g) => /:(DELETE|TRUNCATE)$/.test(g));
  }
}

/**
 * `EXCECOES_AO_ISOLAMENTO` contra as tabelas do banco, nos dois sentidos, e
 * invariante por invariante.
 *
 * Sentido 1: tabela sem `organizacao_id` obrigatório que não consta como
 * exceção que dispensa a coluna reprova (é o que o portão sempre cobrou, agora
 * por nome e em todo esquema). Sentido 2: entrada na lista que o banco não
 * confirma reprova: a tabela não existe; ou dispensa um invariante que ela
 * cumpre (isenção que sobrou é o lugar onde uma regressão se esconde); ou
 * declara MANTER um invariante que ela não cumpre (é o requisito da ADR 0009:
 * o portão confere o que a exceção mantém, não só o que ela dispensa).
 *
 * A dispensa da POLICY DE CONTEXTO tem duas travas a mais (achado 1 do
 * revisor): tabela com `organizacao_id` obrigatório é dado de município e não
 * dispensa a policy, nunca (era o caminho para o console reescrever o livro
 * de eliminações com o portão verde); e tabela sem policy de contexto só pode
 * ser alcançada, no máximo, pelo INSERT do papel de aplicação (a forma do
 * formulário público), conferido no banco nos grants E nas policies. Assim a
 * dispensa não existe só porque um arquivo de etapa disse.
 */
export async function conferirExcecoes(
  db: ConsultaSql,
  excecoes: readonly ExcecaoAoIsolamento[],
): Promise<string[]> {
  const problemas: string[] = [];
  const tabelas = await tabelasDoBanco(db);
  if (tabelas.length === 0) {
    return [
      "a consulta ao catálogo não devolveu nenhuma tabela: a conferência quebrou, não o banco",
    ];
  }
  const doBanco = new Map(tabelas.map((t) => [t.tabela, t]));
  const naLista = new Map(excecoes.map((e) => [e.tabela, e]));

  for (const t of tabelas) {
    if (!t.tem_organizacao_id && !naLista.get(t.tabela)?.dispensa.includes("organizacao_id")) {
      problemas.push(
        `${t.tabela} não tem organizacao_id obrigatório e não consta em EXCECOES_AO_ISOLAMENTO. ` +
          "Ou a tabela ganha a coluna, ou entra na lista da sua etapa (db/test/catalogo/f03-eNN.ts) " +
          "com o motivo, o que dispensa, o que mantém e a trava que a prende no lugar.",
      );
    }
  }

  for (const e of excecoes) {
    const real = doBanco.get(e.tabela);
    if (!real) {
      problemas.push(
        `consta em EXCECOES_AO_ISOLAMENTO (${e.etapa}) mas a tabela não existe no banco: ${e.tabela}`,
      );
      continue;
    }
    if (!e.dispensa.includes("organizacao_id") && !e.dispensa.includes("policy_de_contexto")) {
      problemas.push(
        `${e.tabela}: entrada em EXCECOES_AO_ISOLAMENTO que não dispensa nem a coluna nem a policy de contexto`,
      );
    }
    const faltando = INVARIANTES.filter((i) => !e.dispensa.includes(i) && !e.mantem.includes(i));
    if (faltando.length) {
      problemas.push(`${e.tabela}: não diz se dispensa ou mantém ${faltando.join(", ")}`);
    }
    for (const inv of e.dispensa) {
      if (inv === "grants_declarados" || inv === "rls_forcada") {
        problemas.push(`${e.tabela}: ${inv} não se dispensa`);
      } else if (cumpre(inv, real, e.grants)) {
        problemas.push(
          `${e.tabela}: dispensa ${inv}, mas a tabela o cumpre: exceção desnecessária`,
        );
      }
    }
    for (const inv of e.mantem) {
      if (e.dispensa.includes(inv)) {
        problemas.push(`${e.tabela}: ${inv} está em dispensa e em mantem ao mesmo tempo`);
      } else if (!cumpre(inv, real, e.grants)) {
        const detalhe =
          inv === "grants_declarados"
            ? ` (no banco: ${JSON.stringify(grantsDoBanco(real))}; declarado: ${JSON.stringify(e.grants)})`
            : "";
        problemas.push(`${e.tabela}: declara manter ${inv}, e o banco diz que não${detalhe}`);
      }
    }
    if (e.dispensa.includes("policy_de_contexto")) {
      if (real.tem_organizacao_id) {
        problemas.push(
          `${e.tabela}: dispensa a policy de contexto numa tabela que TEM organizacao_id obrigatório. ` +
            "Linha com município é dado de município e se amarra ao contexto; se a tabela é do " +
            "fornecedor, a regra dela é a do bloco DO_FORNECEDOR do portão, que não se dispensa.",
        );
      }
      const g = grantsDoBanco(real);
      if (e.doFornecedor) {
        /*
          Tabela do fornecedor (só a base declara, ver `index.ts`): o produto
          não a alcança de jeito nenhum, e a regra comando a comando das
          policies do console é cobrada no bloco DO_FORNECEDOR do portão, que
          roda ANTES de qualquer pulo.
        */
        const doProduto = [
          ...g.dc360_app.map((p) => `dc360_app:${p}`),
          ...g.PUBLIC.map((p) => `PUBLIC:${p}`),
        ];
        if (doProduto.length) {
          problemas.push(
            `${e.tabela}: tabela do fornecedor que o papel de aplicação ou PUBLIC alcançam: ${doProduto.join(", ")}`,
          );
        }
        if (real.policies_fora_do_console > 0) {
          problemas.push(
            `${e.tabela}: tabela do fornecedor com ${real.policies_fora_do_console} policy(ies) de outro papel além do console`,
          );
        }
      } else {
        const alcance = [
          ...g.dc360_app.filter((p) => p !== "INSERT").map((p) => `dc360_app:${p}`),
          ...g.dc360_console.map((p) => `dc360_console:${p}`),
          ...g.PUBLIC.map((p) => `PUBLIC:${p}`),
        ];
        if (alcance.length) {
          problemas.push(
            `${e.tabela}: sem policy de contexto, a tabela só pode receber o INSERT do papel de ` +
              `aplicação, e o banco dá mais: ${alcance.join(", ")}`,
          );
        }
        if (real.policies_alem_do_insert_do_app > 0) {
          problemas.push(
            `${e.tabela}: sem policy de contexto, só cabe policy FOR INSERT TO dc360_app, e há ` +
              `${real.policies_alem_do_insert_do_app} outra(s)`,
          );
        }
      }
    }
    if (e.doFornecedor && !e.dispensa.includes("policy_de_contexto")) {
      problemas.push(
        `${e.tabela}: doFornecedor sem dispensar a policy de contexto não faz sentido`,
      );
    }
    if (e.motivo.trim().length < MINIMO_DO_MOTIVO) {
      problemas.push(
        `${e.tabela}: o motivo está curto demais para ser um motivo (mínimo ${MINIMO_DO_MOTIVO} caracteres)`,
      );
    }
    if (e.trava.trim().length < MINIMO_DA_CONFERENCIA) {
      problemas.push(
        `${e.tabela}: a trava que a prende no lugar está curta demais (mínimo ${MINIMO_DA_CONFERENCIA} caracteres)`,
      );
    }
  }

  return problemas;
}

/**
 * Nada do produto mora fora de `public`, e nenhum papel do produto entra
 * noutro esquema (achado 2 do revisor).
 *
 * Todo o resto do portão pergunta ao banco pelo esquema `public`: a varredura
 * de privilégio, a de DELETE, a de chave estrangeira. Em vez de reescrever
 * cada uma, esta conferência garante que fora de `public` não há o que varrer:
 *
 *   - objeto (tabela, visão, sequência, tabela estrangeira, função) num
 *     esquema que não é do sistema nem `public`, e que não pertence a uma
 *     extensão, reprova;
 *   - CREATE do papel de aplicação ou do console em qualquer esquema que não
 *     seja do sistema reprova (inclusive em `public`: quem cria objeto vira
 *     dono dele, e o dono passa pelo RLS que não for forçado);
 *   - USAGE de um desses papéis num esquema que não é do sistema nem
 *     `public` reprova, salvo num esquema que só contém objeto de extensão
 *     (o `extensions` do PostGIS no provedor, onde o `supabase-endurecer.sql`
 *     dá USAGE ao papel de aplicação de propósito).
 */
export async function conferirEsquemas(db: ConsultaSql): Promise<string[]> {
  const problemas: string[] = [];

  const objetos = await db.query<{ objeto: string; tipo: string }>(`
    SELECT n.nspname || '.' || c.relname AS objeto, c.relkind::text AS tipo
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND ${FORA_DO_SISTEMA} AND n.nspname <> 'public'
       AND NOT ${DE_EXTENSAO("pg_class", "c.oid")}
    UNION ALL
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           'função'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE ${FORA_DO_SISTEMA} AND n.nspname <> 'public'
       AND NOT ${DE_EXTENSAO("pg_proc", "p.oid")}
     ORDER BY 1
  `);
  for (const o of objetos.rows) {
    problemas.push(
      `objeto fora do esquema public: ${o.objeto} (${o.tipo}). O portão inteiro confere ` +
        "public; um objeto noutro esquema passa por fora de toda varredura.",
    );
  }

  const esquemas = await db.query<{
    esquema: string;
    papel: string;
    usage: boolean;
    criar: boolean;
    so_de_extensao: boolean;
  }>(`
    SELECT n.nspname::text AS esquema, r.rolname::text AS papel,
           has_schema_privilege(r.oid, n.oid, 'USAGE') AS usage,
           has_schema_privilege(r.oid, n.oid, 'CREATE') AS criar,
           (EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid)
              OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = n.oid))
           AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid
                             AND NOT ${DE_EXTENSAO("pg_class", "c.oid")})
           AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = n.oid
                             AND NOT ${DE_EXTENSAO("pg_proc", "p.oid")}) AS so_de_extensao
      FROM pg_namespace n
      CROSS JOIN pg_roles r
     WHERE ${FORA_DO_SISTEMA}
       AND r.rolname IN (${PAPEIS_DO_PRODUTO.map((p) => `'${p}'`).join(", ")})
     ORDER BY 1, 2
  `);
  for (const e of esquemas.rows) {
    if (e.criar) {
      problemas.push(
        `${e.papel} tem CREATE no esquema ${e.esquema}: quem cria objeto vira dono dele`,
      );
    }
    if (e.esquema !== "public" && e.usage && !e.so_de_extensao) {
      problemas.push(
        `${e.papel} tem USAGE no esquema ${e.esquema}, que não é public nem esquema só de extensão`,
      );
    }
  }
  return problemas;
}

/** O que `conferirFontes` lê do disco (ou de um dublê, nas sondas). */
export interface FontesDoCatalogo {
  /** As migrações por número de três dígitos, com o texto. */
  readonly migracoes: ReadonlyMap<string, string>;
  /** O texto de um arquivo pelo caminho a partir de `dc360/`, ou `null` se não existe. */
  ler(caminho: string): string | null;
}

/** O SQL sem comentários: nome de função citado em comentário não cria função. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** O TypeScript sem comentários: citar a função num comentário não é chamá-la. */
function semComentariosDeTs(ts: string): string {
  return ts.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

function criaFuncao(sql: string, nome: string, soReplace = false): boolean {
  const re = new RegExp(
    `CREATE\\s+${soReplace ? "OR\\s+REPLACE\\s+" : "(OR\\s+REPLACE\\s+)?"}FUNCTION\\s+(public\\.)?"?${nome}"?\\s*\\(`,
    "i",
  );
  return re.test(semComentarios(sql));
}

/**
 * O catálogo contra os ARQUIVOS do repositório (achado 3 do revisor), porque
 * o que a entrada diz sobre a origem da função também precisa ser verdade:
 *
 *   - `migracao` é a ÚLTIMA migração que cria a função (`CREATE [OR REPLACE]
 *     FUNCTION nome(`). Uma migração nova que reescreve o corpo de uma função
 *     catalogada sem a etapa declarar a entrada nova (`redefine`) reprova;
 *   - toda entrada com `redefine: true` tem `migracao` MAIOR que a da entrada
 *     que substitui, e essa migração contém `CREATE OR REPLACE FUNCTION` da
 *     função. Redefinir só no catálogo (apagar uma dívida de tenant sem
 *     mudar o SQL, a sabotagem S5a) reprova;
 *   - `provas` aponta para teste que existe e chama a função pelo nome, ou
 *     `semProva` diz por quê; nunca os dois, nunca nenhum.
 */
export function conferirFontes(
  contribuicoes: ReadonlyArray<readonly [string, ContribuicaoDoCatalogo]>,
  fontes: FontesDoCatalogo,
): string[] {
  const problemas: string[] = [];
  const numeros = [...fontes.migracoes.keys()].sort();
  const anterior = new Map<string, FuncaoPrivilegiada>();

  for (const [de, c] of contribuicoes) {
    for (const f of c.funcoes) {
      const chave = chaveDaFuncao(f);
      const texto = fontes.migracoes.get(f.migracao);
      if (texto === undefined) {
        problemas.push(`${chave} (${de}): a migração ${f.migracao} não existe em db/migrations`);
      }
      const velha = anterior.get(chave);
      if (f.redefine && velha) {
        if (!(Number(f.migracao) > Number(velha.migracao))) {
          problemas.push(
            `${chave} (${de}): redefine com a migração ${f.migracao}, que não é maior que a ` +
              `${velha.migracao} da entrada que substitui`,
          );
        }
        if (texto !== undefined && !criaFuncao(texto, f.nome, true)) {
          problemas.push(
            `${chave} (${de}): redefine, mas a migração ${f.migracao} não tem ` +
              `CREATE OR REPLACE FUNCTION ${f.nome}: redefinir só no catálogo não muda o banco`,
          );
        }
      }
      anterior.set(chave, f);

      const temProva = (f.provas?.length ?? 0) > 0;
      if (temProva === (f.semProva !== undefined)) {
        problemas.push(
          `${chave} (${de}): declare provas (o teste que a chama) OU semProva, um dos dois`,
        );
      }
      for (const caminho of f.provas ?? []) {
        const t = fontes.ler(caminho);
        if (t === null) problemas.push(`${chave} (${de}): a prova ${caminho} não existe`);
        else if (!new RegExp(`\\b${f.nome}\\s*\\(`).test(semComentariosDeTs(t))) {
          problemas.push(`${chave} (${de}): a prova ${caminho} não chama ${f.nome}`);
        }
      }
      if (f.semProva !== undefined && f.semProva.trim().length < MINIMO_DO_MOTIVO) {
        problemas.push(
          `${chave} (${de}): semProva curto demais (mínimo ${MINIMO_DO_MOTIVO} caracteres)`,
        );
      }
    }
  }

  for (const [chave, f] of anterior) {
    const criadoras = numeros.filter((n) => criaFuncao(fontes.migracoes.get(n)!, f.nome));
    const ultima = criadoras.at(-1);
    if (ultima !== f.migracao) {
      problemas.push(
        `${chave}: o catálogo diz que a forma atual vem da migração ${f.migracao}, mas a última ` +
          `que cria a função é a ${ultima ?? "nenhuma"}. A etapa que a recriou declara a entrada ` +
          "nova no arquivo dela, com redefine: true.",
      );
    }
  }
  return problemas;
}
