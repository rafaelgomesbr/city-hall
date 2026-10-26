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
  type ChaveParaTabelaGlobal,
  type ColunaComPrivilegio,
  type ColunaProibida,
  type ContribuicaoDoCatalogo,
  type DestinoNaEliminacao,
  type ExcecaoAoIsolamento,
  type GatilhoDeclarado,
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

/**
 * A relação `c` (tipo composto avulso) pertence a uma extensão. O Postgres não
 * grava a dependência da extensão na linha de `pg_class` de um tipo composto
 * (`heap_create_with_catalog` a pula para `RELKIND_COMPOSITE_TYPE`): ela fica na
 * linha de `pg_type`. Foi o que o PostGIS real mostrou no CI (`geometry_dump` e
 * `valid_detail`), que o PGlite sem PostGIS não mostrava. Índice não entra na conta
 * (mesma lista de espécies da primeira consulta): ele depende da tabela, e a tabela
 * é que é conferida; o índice da chave de `spatial_ref_sys` não é membro da extensão.
 */
const RELACAO_DE_EXTENSAO = (c: string) =>
  `(${DE_EXTENSAO("pg_class", `${c}.oid`)} OR (${c}.relkind = 'c' AND EXISTS ` +
  `(SELECT 1 FROM pg_type ct WHERE ct.typrelid = ${c}.oid AND ${DE_EXTENSAO("pg_type", "ct.oid")})))`;

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
  /** A função retorna `trigger` (parte 0G). */
  gatilho: boolean;
}

async function definidorasDoBanco(db: ConsultaSql): Promise<FuncaoDoBanco[]> {
  const r = await db.query<FuncaoDoBanco>(`
    SELECT n.nspname || '.' || p.proname || '(' ||
             replace(oidvectortypes(p.proargtypes), ', ', ',') || ')' AS assinatura,
           array_to_string(p.proacl, ',') AS acl,
           pg_get_userbyid(p.proowner)::text AS dono,
           coalesce(p.prosrc, '') AS fonte,
           p.prorettype = 'trigger'::regtype AS gatilho
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
    /*
      Parte 0G: função de GATILHO é executada pelo gatilho, não pelo papel.
      Ela não se concede a ninguém (EXECUTE vazio) e declara as tabelas em
      que dispara (`gatilhoEm`); o resto da regra está em
      `conferirGatilhosPrivilegiados`. Só a função comum precisa de quem a
      execute. Quem decide se é de gatilho é o BANCO (o tipo de retorno), e
      não a entrada; sem a função no banco, vale o que a entrada diz.
    */
    const deGatilho = noBanco.get(chave)?.gatilho ?? f.gatilhoEm !== undefined;
    if (deGatilho) {
      if (f.executavelPor.length > 0) {
        problemas.push(
          `${chave}: função de gatilho com EXECUTE declarado (${f.executavelPor.join(", ")}). Quem a ` +
            "executa é o gatilho; com EXECUTE e TEMP, o papel a anexaria a uma tabela temporária de " +
            "mesmo nome e a faria escrever como o dono. executavelPor fica vazio.",
        );
      }
      if (!f.gatilhoEm || f.gatilhoEm.length === 0) {
        problemas.push(
          `${chave}: função de gatilho sem gatilhoEm (as tabelas em que ela dispara e que o corpo confere por TG_RELID)`,
        );
      }
    } else {
      if (f.executavelPor.length === 0) {
        problemas.push(
          `${chave}: sem nenhum papel com EXECUTE; função privilegiada que ninguém chama não deve existir`,
        );
      }
      if (f.gatilhoEm !== undefined) {
        problemas.push(`${chave}: gatilhoEm numa função que não retorna trigger`);
      }
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
  policies_total: number;
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
           (SELECT count(*)::int FROM pg_policies p
             WHERE p.schemaname = n.nspname AND p.tablename = c.relname
           ) AS policies_total,
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
    if (e.semMunicipio) problemas.push(...conferirSemMunicipio(e, real));
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

/*
  ===========================================================================
  Parte 0G: as três formas que a ADR 0009 pedia e o portão não sabia dizer
  (privilégio por coluna de INSERT e SELECT, chave estrangeira para a tabela
  global, tabela protegida sem município), mais o fechamento do caminho da
  tabela temporária de mesmo nome (função de gatilho privilegiada, TEMP).
  ===========================================================================
*/

/** Os invariantes que uma tabela sem município (global ou protegida) mantém, sempre. */
const MANTIDOS_SEM_MUNICIPIO: readonly Invariante[] = [
  "rls_forcada",
  "grants_declarados",
  "sem_delete",
];

/**
 * O regime de tabela SEM MUNICÍPIO (`semMunicipio`, parte 0G), no banco: as
 * duas espécies dispensam a coluna e a policy de contexto, mantêm RLS
 * forçada, os grants (VAZIOS, declarados e no banco) e nenhum DELETE, e não
 * têm policy nenhuma. A eliminação é provada à parte
 * (`conferirEliminacaoSemMunicipio`), porque precisa executar a eliminação.
 */
function conferirSemMunicipio(e: ExcecaoAoIsolamento, real: TabelaDoBanco): string[] {
  const problemas: string[] = [];
  const regime = e.semMunicipio!;
  const nome = `${e.tabela} (${regime.especie})`;
  for (const inv of ["organizacao_id", "policy_de_contexto"] as const) {
    if (!e.dispensa.includes(inv)) {
      problemas.push(`${nome}: tabela sem município que não dispensa ${inv}`);
    }
  }
  for (const inv of MANTIDOS_SEM_MUNICIPIO) {
    if (!e.mantem.includes(inv)) {
      problemas.push(`${nome}: tabela sem município precisa MANTER ${inv}`);
    }
  }
  const declarados = PAPEIS_COM_GRANT.flatMap((p) => (e.grants[p] ?? []).map((g) => `${p}:${g}`));
  if (declarados.length) {
    problemas.push(
      `${nome}: tabela sem município não concede nada a papel do produto nem a PUBLIC, e a entrada declara ${declarados.join(", ")}`,
    );
  }
  if (real.grants.length) {
    problemas.push(
      `${nome}: tabela sem município que o banco deixa alcançar: ${real.grants.join(", ")}. ` +
        "Nem SELECT: só função privilegiada nomeada a toca.",
    );
  }
  if (!(real.rls && real.rls_forcada)) {
    problemas.push(`${nome}: tabela sem município sem RLS ativada E forçada`);
  }
  if (real.policies_total > 0) {
    problemas.push(
      `${nome}: tabela sem município com ${real.policies_total} policy(ies). Sem município não há ` +
        "contexto a que se amarrar, e uma policy aqui só serviria para abrir.",
    );
  }
  if (e.doFornecedor) {
    problemas.push(`${nome}: semMunicipio e doFornecedor são regimes que se excluem`);
  }
  const d = regime.naEliminacao;
  if (d.porque.trim().length < MINIMO_DO_MOTIVO) {
    problemas.push(
      `${nome}: o porquê do destino na eliminação está curto demais (mínimo ${MINIMO_DO_MOTIVO} caracteres)`,
    );
  }
  if (!/:org\b/.test(d.linhasDoMunicipio) || !/:org\b/.test(d.semear)) {
    problemas.push(`${nome}: linhasDoMunicipio e semear precisam usar :org (o município da prova)`);
  }
  return problemas;
}

/** Uma transação: consulta, comando e desfazer. */
type TransacaoDaProva = ConsultaSql & {
  exec(sql: string): Promise<unknown>;
  rollback(): Promise<void>;
};

/**
 * A CÓPIA descartável do banco do portão (correção 1 da 0G): nela a prova da
 * eliminação confirma (COMMIT) de verdade, e no fim ela é fechada.
 */
export interface BancoDescartavel extends ConsultaSql {
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: TransacaoDaProva) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * O banco do portão: consulta, transação e a cópia descartável (o `clone()`
 * do PGlite, que copia o diretório de dados inteiro, com papéis, migrações e
 * o que a sonda acabou de criar).
 */
export interface BancoComTransacao extends ConsultaSql {
  transaction<T>(fn: (tx: TransacaoDaProva) => Promise<T>): Promise<T>;
  clone(): Promise<BancoDescartavel>;
}

/** `[esquema, tabela]` de um nome como o catálogo escreve. */
function partesDoNome(t: string): [string, string] {
  const i = t.indexOf(".");
  return i < 0 ? ["public", t] : [t.slice(0, i), t.slice(i + 1)];
}

const identificador = (s: string) => `"${s.replace(/"/g, '""')}"`;
const relacaoSql = (t: string) => partesDoNome(t).map(identificador).join(".");

/**
 * O DESTINO NA ELIMINAÇÃO de cada tabela sem município (parte 0G), provado
 * com a eliminação de verdade: num município novo, `semear` cria as linhas,
 * `linhasDoMunicipio` as lista, o livro e a organização são postos como
 * vencidos (como dono, o único jeito de mudar o tempo num teste), e
 * `executar_eliminacoes_vencidas()` e `concluir_eliminacao()` rodam. Depois,
 * `fica` exige todas as linhas listadas presentes e `some` nenhuma.
 *
 * Correção 1 da 0G (itens 3, 4 e 5 da auditoria de cobertura):
 *
 *   - a prova roda numa CÓPIA DESCARTÁVEL do banco do portão (`clone()`), com
 *     COMMIT de verdade em cada passo, como o relógio faz: a semeadura numa
 *     transação, o vencimento noutra, a fase 1 (`executar_eliminacoes_vencidas`)
 *     noutra e a fase 2 (`concluir_eliminacao`) noutra, as duas fases como
 *     `dc360_app`. Antes era UMA transação desfeita no fim, e um gatilho
 *     `DEFERRABLE INITIALLY DEFERRED` que apagasse a linha (ou recusasse) só
 *     na confirmação nunca disparava;
 *   - ÂNCORA anterior: toda chave que `linhasDoMunicipio` devolve existe em
 *     `tabela.coluna` ANTES da eliminação. Sem ela, `some` passava com chaves
 *     que nunca estiveram na coluna verificada (a consulta devolvia
 *     `usuarios.id` e a coluna era outra);
 *   - o OUTRO município (`semearOutroMunicipio`) é semeado e NÃO é eliminado:
 *     as linhas dele precisam existir antes e, como toda linha da tabela fora
 *     do município eliminado, ficar IGUAIS, valor por valor. Um `DELETE` sem
 *     filtro passava como `some`. A linha COMPARTILHADA (`compartilhar`,
 *     quando couber) nunca some com a eliminação de um dos dois.
 *
 * Correção 2 da 0G: `some` exige pelo menos uma linha EXCLUSIVA do município
 * eliminado (além das do outro e das compartilhadas).
 *
 * Prova vazia reprova (sem linha ligada ao município não há o que provar), e
 * eliminação que não chega ao fim (DC366, município fora da saída, gatilho
 * adiado que recusa na confirmação) também. O banco do portão não muda: tudo
 * acontece na cópia, que é fechada no fim.
 */
export async function conferirEliminacaoSemMunicipio(
  db: BancoComTransacao,
  excecoes: readonly ExcecaoAoIsolamento[],
): Promise<string[]> {
  const problemas: string[] = [];
  for (const e of excecoes) {
    if (!e.semMunicipio) continue;
    const d = e.semMunicipio.naEliminacao;
    const nome = `${e.tabela} (${e.semMunicipio.especie}, ${d.destino})`;
    let copia: BancoDescartavel | null = null;
    try {
      copia = await db.clone();
      problemas.push(...(await provarDestinoNaCopia(copia, e.tabela, d, nome)));
    } catch (erro) {
      problemas.push(
        `${nome}: a prova do destino na eliminação não chegou ao fim: ${(erro as Error).message}`,
      );
    } finally {
      await copia?.close();
    }
  }
  return problemas;
}

/** A prova de uma tabela, na cópia descartável, passo a passo e com COMMIT. */
async function provarDestinoNaCopia(
  copia: BancoDescartavel,
  tabela: string,
  d: DestinoNaEliminacao,
  nome: string,
): Promise<string[]> {
  const comOrgs = (sql: string, org: string, outra: string | null) =>
    sql
      .replace(/:org\b/g, `'${org}'::uuid`)
      .replace(/:outra\b/g, outra === null ? "NULL::uuid" : `'${outra}'::uuid`);
  const coluna = identificador(d.coluna);
  const relacao = relacaoSql(tabela);
  const chavesDe = async (org: string) => [
    ...new Set(
      (await copia.query<{ chave: unknown }>(comOrgs(d.linhasDoMunicipio, org, null))).rows.map(
        (l) => String(l.chave),
      ),
    ),
  ];
  /** As linhas da tabela fora do município eliminado, mais as compartilhadas, valor por valor. */
  const intactas = async (soDoEliminado: readonly string[]) =>
    (
      await copia.query<{ linha: string }>(
        `SELECT row_to_json(t)::text AS linha FROM ${relacao} t
          WHERE NOT coalesce(t.${coluna}::text = ANY($1::text[]), false) ORDER BY 1`,
        [soDoEliminado],
      )
    ).rows.map((l) => l.linha);

  // Passo 1: a semeadura dos dois municípios, como dono, confirmada.
  const { org, outra } = await copia.transaction(async (tx) => {
    const criar = async (municipio: string) =>
      (
        await tx.query<{ id: string }>(
          `INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1, $2, 'MG') RETURNING id`,
          [`Defesa Civil de ${municipio}`, municipio],
        )
      ).rows[0]!.id;
    const org = await criar("Prova da Eliminacao");
    await tx.exec(comOrgs(d.semear, org, null));
    let outra: string | null = null;
    if (d.semearOutroMunicipio !== undefined) {
      outra = await criar("Outro Municipio da Prova");
      await tx.exec(comOrgs(d.semearOutroMunicipio, outra, null));
      if (d.compartilhar !== undefined) await tx.exec(comOrgs(d.compartilhar, org, outra));
    }
    return { org, outra };
  });

  // Passo 2: as chaves dos dois, a âncora e o retrato do que não pode mudar.
  const unicas = await chavesDe(org);
  if (unicas.length === 0) {
    return [
      `${nome}: linhasDoMunicipio não achou nenhuma linha depois de semear: a prova da eliminação seria vazia`,
    ];
  }
  const doOutro = outra === null ? [] : await chavesDe(outra);
  if (outra !== null && doOutro.length === 0) {
    return [
      `${nome}: linhasDoMunicipio não achou nenhuma linha do OUTRO município depois de semearOutroMunicipio: ` +
        "sem elas não há como provar que a eliminação deixa o outro município intacto",
    ];
  }
  const todas = [...new Set([...unicas, ...doOutro])];
  const ancoradas = (
    await copia.query<{ n: number }>(
      `SELECT count(DISTINCT ${coluna}::text)::int AS n FROM ${relacao} WHERE ${coluna}::text = ANY($1::text[])`,
      [todas],
    )
  ).rows[0]!.n;
  if (ancoradas !== todas.length) {
    return [
      `${nome}: ${todas.length - ancoradas} de ${todas.length} chave(s) que linhasDoMunicipio devolve não ` +
        `existem em ${tabela}.${d.coluna} ANTES da eliminação: a prova contaria linhas que nunca estiveram ` +
        "na coluna verificada (a consulta e a coluna precisam falar da mesma linha)",
    ];
  }
  /** Só do município eliminado: as compartilhadas com o outro ficam no retrato do que não muda. */
  const exclusivas = unicas.filter((k) => !doOutro.includes(k));
  /*
    Correção 2 da 0G: `some` precisa de pelo menos uma linha EXCLUSIVA do
    município eliminado. Se `linhasDoMunicipio` devolvesse as mesmas chaves
    para os dois municípios (por exemplo, uma consulta que ignora `:org`), tudo
    virava compartilhado, a contagem do que some era sobre um conjunto vazio, e
    uma tabela declarada `some` cuja limpeza nunca acontece passava.
  */
  if (d.destino === "some" && exclusivas.length === 0) {
    return [
      `${nome}: nenhuma das ${unicas.length} chave(s) que linhasDoMunicipio devolve para o município ` +
        "eliminado é EXCLUSIVA dele (todas aparecem também no outro município): sem linha exclusiva " +
        "não há como provar que as linhas do município SOMEM na eliminação",
    ];
  }
  const retratoAntes = await intactas(exclusivas);

  // Passo 3: o livro e a organização vencidos, como dono, confirmado.
  await copia.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO eliminacoes_de_municipio
         (organizacao_id, municipio_nome, uf, solicitada_em, executar_em, solicitada_por_email, motivo)
       VALUES ($1, 'Prova da Eliminacao', 'MG', now() - interval '8 days', now() - interval '1 day',
               'prova@exemplo.gov.br', 'prova do destino na eliminacao (portao, parte 0G)')`,
      [org],
    );
    await tx.query(
      `UPDATE organizacoes
          SET acesso_suspenso_em = now() - interval '2 days',
              suspensao_motivo = 'prova do destino na eliminacao (portao, parte 0G)',
              eliminacao_agendada_para = now() - interval '1 day'
        WHERE id = $1`,
      [org],
    );
  });

  // Passo 4: a fase 1, como o relógio (sem município no contexto), confirmada.
  const eliminados = await copia.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    return (
      await tx.query<{ organizacao_id: string }>(
        "SELECT organizacao_id::text AS organizacao_id FROM executar_eliminacoes_vencidas()",
      )
    ).rows.map((l) => l.organizacao_id);
  });
  if (!eliminados.includes(org)) {
    return [`${nome}: executar_eliminacoes_vencidas() não eliminou o município da prova`];
  }

  // Passo 5: a fase 2, noutra transação, confirmada.
  await copia.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    await tx.query("SELECT concluir_eliminacao($1)", [org]);
  });

  // Passo 6: o que ficou, depois das confirmações (e dos gatilhos adiados).
  const contar = async (chaves: readonly string[]) =>
    (
      await copia.query<{ n: number }>(
        `SELECT count(DISTINCT ${coluna}::text)::int AS n FROM ${relacao} WHERE ${coluna}::text = ANY($1::text[])`,
        [chaves],
      )
    ).rows[0]!.n;
  const existe = async (id: string) =>
    (
      await copia.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM organizacoes WHERE id = $1",
        [id],
      )
    ).rows[0]!.n;

  const problemas: string[] = [];
  if ((await existe(org)) !== 0) {
    return [`${nome}: a eliminação da prova não apagou a organização`];
  }
  if (d.destino === "fica") {
    const restam = await contar(unicas);
    if (restam !== unicas.length) {
      problemas.push(
        `${nome}: o catálogo diz que as linhas do município FICAM na eliminação, e ` +
          `${unicas.length - restam} de ${unicas.length} sumiram`,
      );
    }
  } else {
    const restam = await contar(exclusivas);
    if (restam !== 0) {
      problemas.push(
        `${nome}: o catálogo diz que as linhas do município SOMEM na eliminação, e ` +
          `${restam} de ${exclusivas.length} ficaram`,
      );
    }
  }
  const retratoDepois = await intactas(exclusivas);
  const antes = new Set(retratoAntes);
  const depois = new Set(retratoDepois);
  const mudaram = retratoAntes.filter((l) => !depois.has(l)).length;
  const novas = retratoDepois.filter((l) => !antes.has(l)).length;
  if (mudaram || novas) {
    problemas.push(
      `${nome}: a eliminação de UM município mexeu em ${tabela} fora dele (o outro município da ` +
        `prova, linha compartilhada ou de ninguém): ${mudaram} linha(s) sumiram ou mudaram e ` +
        `${novas} apareceram. A eliminação alcança só o município eliminado.`,
    );
  }
  if (outra !== null && (await existe(outra)) !== 1) {
    problemas.push(`${nome}: a eliminação da prova apagou também o OUTRO município`);
  }
  return problemas;
}

/**
 * PRIVILÉGIO DE COLUNA, generalizado (parte 0G): INSERT, SELECT e UPDATE por
 * coluna, de `dc360_app` e `dc360_console`, contra o banco nos dois sentidos.
 *
 * Duas fontes, e as duas precisam bater: `information_schema.column_privileges`
 * (o que se vê por coluna, menos o que vem de privilégio de TABELA do mesmo
 * papel), e a ACL de cada coluna (`pg_attribute.attacl`, o GRANT feito em
 * coluna, que aparece mesmo quando um GRANT de tabela o esconde da primeira).
 * Reprova: privilégio de coluna de papel do produto ou de PUBLIC que a lista
 * não nomeia (inclusive coluna a mais num grupo declarado, e REFERENCES por
 * coluna, que não se declara); entrada que o banco não concede por coluna;
 * opção de concessão; e grupo declarado cuja tabela também dá ao papel o
 * MESMO privilégio de tabela.
 */
export async function conferirPrivilegiosDeColuna(
  db: ConsultaSql,
  declarados: readonly ColunaComPrivilegio[],
): Promise<string[]> {
  const problemas: string[] = [];
  const chave = (p: { papel: string; tabela: string; coluna: string; privilegio: string }) =>
    `${p.papel}:${p.tabela}.${p.coluna}:${p.privilegio}`;
  const naLista = new Set(declarados.map(chave));

  const papeisSql = "('dc360_app', 'dc360_console', 'PUBLIC')";
  const acl = await db.query<{
    esquema: string;
    tabela: string;
    coluna: string;
    papel: string;
    privilegio: string;
    concede: boolean;
  }>(`
    SELECT n.nspname::text AS esquema, c.relname::text AS tabela, a.attname::text AS coluna,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee)::text END AS papel,
           x.privilege_type::text AS privilegio, x.is_grantable AS concede
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) x
     WHERE a.attacl IS NOT NULL AND a.attnum > 0 AND NOT a.attisdropped
       AND ${FORA_DO_SISTEMA}
       AND (n.nspname = 'public' OR NOT ${DE_EXTENSAO("pg_class", "c.oid")})
  `);
  const concedidos = acl.rows
    .filter((l) => ["dc360_app", "dc360_console", "PUBLIC"].includes(l.papel))
    .map((l) => ({ ...l, tabela: nomeQualificado(l.esquema, l.tabela) }));

  const vistas = await db.query<{
    esquema: string;
    tabela: string;
    coluna: string;
    papel: string;
    privilegio: string;
  }>(`
    SELECT c.table_schema::text AS esquema, c.table_name::text AS tabela, c.column_name::text AS coluna,
           c.grantee::text AS papel, c.privilege_type::text AS privilegio
      FROM information_schema.column_privileges c
     WHERE c.grantee IN ${papeisSql}
       AND c.table_schema NOT LIKE 'pg\\_%' AND c.table_schema <> 'information_schema'
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.table_privileges g
          WHERE g.table_schema = c.table_schema AND g.table_name = c.table_name
            AND g.grantee = c.grantee AND g.privilege_type = c.privilege_type)
  `);
  const visiveis = vistas.rows.map((l) => ({ ...l, tabela: nomeQualificado(l.esquema, l.tabela) }));

  const concedidosPorChave = new Set(concedidos.map(chave));
  const aMais = new Set<string>();
  for (const l of [...concedidos, ...visiveis]) {
    const k = chave(l);
    if (!naLista.has(k)) aMais.add(k);
  }
  for (const k of [...aMais].sort()) {
    problemas.push(
      `privilégio de coluna no banco que o catálogo não declara: ${k}. Cada privilégio por coluna ` +
        "entra em privilegiosDeColuna (ou colunasComUpdate) da etapa, com o motivo.",
    );
  }
  for (const l of concedidos) {
    if (l.concede) problemas.push(`privilégio de coluna com opção de concessão: ${chave(l)}`);
  }
  for (const k of [...naLista].sort()) {
    if (!concedidosPorChave.has(k)) {
      problemas.push(`consta no catálogo e o banco não concede por coluna: ${k}`);
    }
  }

  /* A regra do grupo: privilégio por coluna e o mesmo privilégio de tabela não andam juntos. */
  const grupos = new Map<string, ColunaComPrivilegio>();
  for (const d of declarados) grupos.set(`${d.papel}:${d.tabela}:${d.privilegio}`, d);
  for (const [k, d] of grupos) {
    const r = await db.query<{ existe: boolean; tem: boolean | null }>(
      `SELECT to_regclass($1::text) IS NOT NULL AS existe,
              CASE WHEN to_regclass($1::text) IS NULL THEN NULL
                   ELSE has_table_privilege($2::name, to_regclass($1::text), $3::text) END AS tem`,
      [relacaoSql(d.tabela), d.papel, d.privilegio],
    );
    if (!r.rows[0]!.existe) {
      problemas.push(`${k}: a tabela do privilégio por coluna não existe no banco`);
    } else if (r.rows[0]!.tem) {
      problemas.push(
        `${k}: ${d.papel} tem ${d.privilegio} por coluna em ${d.tabela} e TAMBÉM o ${d.privilegio} de ` +
          "tabela, que cobre toda coluna: a lista por coluna vira enfeite. Tire o de tabela (REVOKE).",
      );
    }
  }
  return problemas;
}

/**
 * TODA chave estrangeira, em todo esquema fora do sistema (parte 0G; antes
 * era só `public`, e o resto está barrado por `conferirEsquemas`): ou inclui
 * `organizacao_id`, ou aponta para `organizacoes` (a âncora do tenant), ou é
 * uma das referências do fornecedor isentas pelo portão (`isentas`, pares
 * `[tabela, alvo]`), ou é uma chave DECLARADA em `chavesParaGlobais` para uma
 * tabela `global` do catálogo. Qualquer outra reprova, como sempre reprovou.
 *
 * A chave declarada é conferida nos dois sentidos e por inteiro: existe com
 * as colunas e o alvo declarados; o alvo é exceção `global`; não inclui
 * `organizacao_id`; não apaga nem altera em cascata; e as colunas dela não
 * são graváveis por papel do produto nem PUBLIC.
 */
export async function conferirChavesEstrangeiras(
  db: ConsultaSql,
  excecoes: readonly ExcecaoAoIsolamento[],
  chaves: readonly ChaveParaTabelaGlobal[],
  isentas: ReadonlyArray<readonly [string, string]>,
): Promise<string[]> {
  const problemas: string[] = [];
  const r = await db.query<{
    esquema: string;
    tabela: string;
    esquema_alvo: string;
    alvo: string;
    nome: string;
    colunas: string[];
    referenciadas: string[];
    chave_do_alvo: string[];
    validada: boolean;
    ao_apagar: string;
    ao_alterar: string;
  }>(`
    SELECT nr.nspname::text AS esquema, r.relname::text AS tabela,
           nf.nspname::text AS esquema_alvo, f.relname::text AS alvo,
           k.conname::text AS nome,
           ARRAY(SELECT a.attname::text
                   FROM unnest(k.conkey) WITH ORDINALITY AS u(n, i)
                   JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.n
                  ORDER BY u.i) AS colunas,
           ARRAY(SELECT a.attname::text
                   FROM unnest(k.confkey) WITH ORDINALITY AS u(n, i)
                   JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = u.n
                  ORDER BY u.i) AS referenciadas,
           ARRAY(SELECT a.attname::text
                   FROM pg_constraint p
                   CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY AS u(n, i)
                   JOIN pg_attribute a ON a.attrelid = p.conrelid AND a.attnum = u.n
                  WHERE p.conrelid = k.confrelid AND p.contype = 'p'
                  ORDER BY u.i) AS chave_do_alvo,
           k.convalidated AS validada,
           k.confdeltype::text AS ao_apagar, k.confupdtype::text AS ao_alterar
      FROM pg_constraint k
      JOIN pg_class r ON r.oid = k.conrelid
      JOIN pg_namespace nr ON nr.oid = r.relnamespace
      JOIN pg_class f ON f.oid = k.confrelid
      JOIN pg_namespace nf ON nf.oid = f.relnamespace
     WHERE k.contype = 'f'
       AND nr.nspname NOT LIKE 'pg\\_%' AND nr.nspname <> 'information_schema'
       AND (nr.nspname = 'public' OR NOT ${DE_EXTENSAO("pg_class", "r.oid")})
     ORDER BY 1, 2, 5
  `);
  if (r.rows.length === 0) {
    return [
      "a consulta não devolveu nenhuma chave estrangeira: a conferência quebrou, não o banco",
    ];
  }
  const globais = new Set(
    excecoes.filter((e) => e.semMunicipio?.especie === "global").map((e) => e.tabela),
  );
  const declaradas = new Map(chaves.map((c) => [`${c.tabela}.${c.restricao}`, c]));
  const vistas = new Set<string>();

  for (const fk of r.rows) {
    const tabela = nomeQualificado(fk.esquema, fk.tabela);
    const alvo = nomeQualificado(fk.esquema_alvo, fk.alvo);
    const k = `${tabela}.${fk.nome}`;
    const declarada = declaradas.get(k);
    if (declarada) vistas.add(k);
    const comOrganizacao = fk.colunas.includes("organizacao_id");
    if (declarada) {
      if (comOrganizacao) {
        problemas.push(
          `${k}: declarada em chavesParaGlobais, mas inclui organizacao_id e não precisa da declaração`,
        );
      }
      if (
        declarada.alvo !== alvo ||
        JSON.stringify(declarada.colunas) !== JSON.stringify(fk.colunas)
      ) {
        problemas.push(
          `${k}: o banco diz (${fk.colunas.join(",")}) -> ${alvo}, e o catálogo declara ` +
            `(${declarada.colunas.join(",")}) -> ${declarada.alvo}`,
        );
      }
      if (!globais.has(alvo)) {
        problemas.push(
          `${k}: aponta para ${alvo}, que não é tabela global do catálogo (semMunicipio.especie = "global")`,
        );
      }
      /*
        Correção 1 da 0G (item 8): as colunas REFERENCIADAS no alvo
        (`confkey`) são as declaradas (sem declaração, só nas sondas, a chave
        primária do alvo), e a restrição está VALIDADA. Uma chave para outra
        coluna única da mesma tabela, ou `NOT VALID`, passava.
      */
      const esperadas = declarada.colunasReferenciadas ?? fk.chave_do_alvo;
      if (JSON.stringify([...esperadas]) !== JSON.stringify(fk.referenciadas)) {
        problemas.push(
          `${k}: referencia ${alvo}(${fk.referenciadas.join(",")}), e o catálogo declara ` +
            `${alvo}(${esperadas.join(",") || "nada"})` +
            (declarada.colunasReferenciadas ? "" : " (sem declaração, a chave primária do alvo)"),
        );
      }
      if (!fk.validada) {
        problemas.push(
          `${k}: chave para tabela global NOT VALID: as linhas que já existiam não foram conferidas ` +
            "e podem apontar para pessoa nenhuma. VALIDATE CONSTRAINT antes de declarar.",
        );
      }
      if (!["a", "r"].includes(fk.ao_apagar) || !["a", "r"].includes(fk.ao_alterar)) {
        problemas.push(
          `${k}: chave para tabela global com ação em cascata (ON DELETE ${fk.ao_apagar}, ON UPDATE ` +
            `${fk.ao_alterar}); só NO ACTION ou RESTRICT: a linha global não leva consigo linha de município`,
        );
      }
      for (const coluna of fk.colunas) {
        const g = await db.query<{ papel: string; privilegio: string }>(
          `SELECT papel, pr AS privilegio
             FROM unnest(ARRAY['dc360_app', 'dc360_console', 'public']) AS papel,
                  unnest(ARRAY['INSERT', 'UPDATE']) AS pr
            WHERE has_column_privilege(papel::name, to_regclass($1::text), $2::text, pr)`,
          [relacaoSql(tabela), coluna],
        );
        for (const l of g.rows) {
          problemas.push(
            `${k}: ${l.papel === "public" ? "PUBLIC" : l.papel} tem ${l.privilegio} em ${tabela}.${coluna}: ` +
              "quem grava a coluna escolhe a linha global a que a linha do município se liga",
          );
        }
      }
      continue;
    }
    if (alvo === "organizacoes" || comOrganizacao) continue;
    if (isentas.some(([t, a]) => t === tabela && a === alvo)) continue;
    problemas.push(
      `${tabela} -> ${alvo} (${fk.nome}) não inclui organizacao_id: essa referência alcança linha de ` +
        "outro município" +
        (globais.has(alvo)
          ? `. ${alvo} é tabela global, e a chave para ela entra por nome em chavesParaGlobais`
          : ""),
    );
  }
  for (const [k, c] of declaradas) {
    if (!vistas.has(k)) {
      problemas.push(
        `consta em chavesParaGlobais (${c.etapa}) mas a restrição não existe no banco: ${k}`,
      );
    }
  }
  return problemas;
}

/**
 * Função de GATILHO privilegiada (parte 0G), e o caminho que ela abria: com
 * EXECUTE na função e o privilégio TEMP no banco, o `dc360_app` criava
 * `pg_temp.usuarios`, anexava a ela o gatilho e o fazia escrever em tabela
 * protegida como o dono.
 *
 *   - nenhum papel do produto, nem PUBLIC, tem EXECUTE em função `SECURITY
 *     DEFINER` que retorna `trigger`, venha de onde vier (concessão direta,
 *     PUBLIC, herança: `has_function_privilege`);
 *   - os gatilhos do banco que chamam cada função de gatilho do catálogo estão
 *     EXATAMENTE nas tabelas de `gatilhoEm`;
 *   - o corpo confere a tabela que disparou: `TG_RELID` (ou `TG_TABLE_SCHEMA`
 *     e `TG_TABLE_NAME` juntos) e o nome QUALIFICADO (`esquema.tabela`) de
 *     cada tabela de `gatilhoEm`. Qualificado porque, sem `pg_temp` no fim do
 *     `search_path`, o nome nu resolve primeiro para a temporária.
 */
export async function conferirGatilhosPrivilegiados(
  db: ConsultaSql,
  funcoes: readonly FuncaoPrivilegiada[],
): Promise<string[]> {
  const problemas: string[] = [];
  const executam = await db.query<{ assinatura: string; papel: string }>(`
    SELECT n.nspname || '.' || p.proname || '(' ||
             replace(oidvectortypes(p.proargtypes), ', ', ',') || ')' AS assinatura,
           papel
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN unnest(ARRAY['dc360_app', 'dc360_console', 'public']) AS papel
     WHERE p.prosecdef AND p.prorettype = 'trigger'::regtype
       AND ${FORA_DO_SISTEMA}
       AND (n.nspname = 'public' OR NOT ${DE_EXTENSAO("pg_proc", "p.oid")})
       AND has_function_privilege(papel, p.oid, 'EXECUTE')
     ORDER BY 1, 2
  `);
  for (const l of executam.rows) {
    problemas.push(
      `${l.papel === "public" ? "PUBLIC" : l.papel} tem EXECUTE na função de gatilho privilegiada ` +
        `${l.assinatura}: com TEMP, ele a anexaria a uma tabela temporária de mesmo nome e a faria ` +
        "escrever como o dono. REVOKE EXECUTE de PUBLIC e dos papéis do produto.",
    );
  }

  for (const f of funcoes) {
    if (!f.gatilhoEm) continue;
    const r = await db.query<{ esquema: string; tabela: string; fonte: string }>(
      `SELECT n.nspname::text AS esquema, c.relname::text AS tabela, coalesce(p.prosrc, '') AS fonte
         FROM pg_proc p
         LEFT JOIN pg_trigger t ON t.tgfoid = p.oid AND NOT t.tgisinternal
         LEFT JOIN pg_class c ON c.oid = t.tgrelid
         LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE p.oid = to_regprocedure($1::text)`,
      [f.assinatura],
    );
    if (r.rows.length === 0) continue; // função ausente: conferirFuncoesPrivilegiadas já reprova
    const noBanco = [
      ...new Set(
        r.rows.filter((l) => l.tabela !== null).map((l) => nomeQualificado(l.esquema, l.tabela)),
      ),
    ].sort();
    const declaradas = [...f.gatilhoEm].sort();
    if (JSON.stringify(noBanco) !== JSON.stringify(declaradas)) {
      problemas.push(
        `${f.assinatura}: os gatilhos do banco que a chamam estão em (${noBanco.join(", ") || "nenhuma tabela"}), ` +
          `e o catálogo declara (${declaradas.join(", ")})`,
      );
    }
    const corpo = semComentarios(r.rows[0]!.fonte);
    const porRelid = /\bTG_RELID\b/i.test(corpo);
    const porNome = /\bTG_TABLE_SCHEMA\b/i.test(corpo) && /\bTG_TABLE_NAME\b/i.test(corpo);
    if (!porRelid && !porNome) {
      problemas.push(
        `${f.assinatura}: função de gatilho privilegiada que não confere a tabela que a disparou ` +
          "(TG_RELID, ou TG_TABLE_SCHEMA e TG_TABLE_NAME)",
      );
    }
    for (const t of declaradas) {
      const [esquema, tabela] = partesDoNome(t);
      // Com TG_RELID, o nome qualificado ('public.usuarios'::regclass); pelo nome, os dois literais.
      const qualificado = new RegExp(`\\b${esquema}\\.${tabela}\\b`, "i").test(corpo);
      const literais = corpo.includes(`'${esquema}'`) && corpo.includes(`'${tabela}'`);
      if (!((porRelid && qualificado) || (porNome && literais))) {
        problemas.push(
          `${f.assinatura}: o corpo não cita ${esquema}.${tabela} qualificado (com TG_RELID), nem ` +
            `'${esquema}' e '${tabela}' (com TG_TABLE_SCHEMA e TG_TABLE_NAME): o nome nu pode ` +
            "resolver para uma tabela temporária de mesmo nome, e só o nome da tabela é o dela",
        );
      }
    }
  }
  return problemas;
}

/**
 * Nenhum papel do produto, nem PUBLIC, cria objeto (parte 0G): sem TEMP e sem
 * CREATE no banco, e sem CREATE em esquema nenhum fora do sistema. TEMP é o
 * que deixava o `dc360_app` criar `pg_temp.<tabela real>` e anexar a ela um
 * gatilho privilegiado; o Postgres o dá a PUBLIC por padrão em todo banco
 * criado do `template0` ou do `postgres`, e por isso a conferência pergunta ao
 * banco, papel a papel, em vez de supor.
 */
export async function conferirCriacaoDeObjetos(db: ConsultaSql): Promise<string[]> {
  const r = await db.query<{ papel: string; onde: string; privilegio: string }>(`
    SELECT papel, 'banco ' || current_database() AS onde, pr AS privilegio
      FROM unnest(ARRAY['dc360_app', 'dc360_console', 'public']) AS papel,
           unnest(ARRAY['TEMPORARY', 'CREATE']) AS pr
     WHERE has_database_privilege(papel, current_database(), pr)
    UNION ALL
    SELECT papel, 'esquema ' || n.nspname, 'CREATE'
      FROM pg_namespace n
      CROSS JOIN unnest(ARRAY['dc360_app', 'dc360_console', 'public']) AS papel
     WHERE ${FORA_DO_SISTEMA}
       AND has_schema_privilege(papel, n.oid, 'CREATE')
     ORDER BY 1, 2, 3
  `);
  return r.rows.map(
    (l) =>
      `${l.papel === "public" ? "PUBLIC" : l.papel} tem ${l.privilegio} no ${l.onde}: papel do produto não ` +
      "cria objeto (com TEMP, uma tabela temporária de mesmo nome que uma real recebe o gatilho privilegiado)",
  );
}

/*
  ===========================================================================
  Correção 1 da parte 0G: o que a auditoria de cobertura independente achou
  aberto (colunas proibidas, a declaração completa, o disparo dos gatilhos
  privilegiados e a recusa comportamental fora da tabela).
  ===========================================================================
*/

const PAPEIS_DO_PRODUTO_E_PUBLIC = ["dc360_app", "dc360_console", "public"] as const;

/**
 * COLUNAS PROIBIDAS (item 1): a partir da migração `desdeMigracao` (quando o
 * arquivo dela existe no repositório), o catálogo não declara o privilégio na
 * coluna (em grupo nenhum, de papel nenhum, nem em `colunasComUpdate`), e o
 * banco não o dá a `dc360_app`, `dc360_console` nem PUBLIC, de tabela ou de
 * coluna (`has_column_privilege`, que vê o de tabela e a herança). Coluna que
 * não existe não tem o que conceder; tabela que não existe reprova
 * (proibição sobre o nada é nome errado).
 */
export async function conferirColunasProibidas(
  db: ConsultaSql,
  proibidas: readonly ColunaProibida[],
  declarados: readonly ColunaComPrivilegio[],
  migracoes: Iterable<string>,
): Promise<string[]> {
  const problemas: string[] = [];
  const existentes = new Set(migracoes);
  for (const p of proibidas) {
    if (!existentes.has(p.desdeMigracao)) continue;
    const r = await db.query<{ existe: boolean }>(
      "SELECT to_regclass($1::text) IS NOT NULL AS existe",
      [relacaoSql(p.tabela)],
    );
    if (!r.rows[0]!.existe) {
      problemas.push(`COLUNAS_PROIBIDAS: ${p.tabela} não existe no banco (proibição sobre o nada)`);
      continue;
    }
    for (const coluna of p.colunas) {
      for (const privilegio of p.privilegios) {
        for (const d of declarados) {
          if (d.tabela === p.tabela && d.coluna === coluna && d.privilegio === privilegio) {
            problemas.push(
              `${p.tabela}.${coluna}: ${privilegio} proibido desde a migração ${p.desdeMigracao} ` +
                `(${p.etapa}), e o catálogo o declara para ${d.papel} (${d.etapa}): coluna proibida ` +
                "nunca volta a uma lista de privilégio",
            );
          }
        }
      }
      const g = await db.query<{ papel: string; privilegio: string }>(
        `SELECT papel, pr AS privilegio
           FROM unnest(${emSql(PAPEIS_DO_PRODUTO_E_PUBLIC)}) AS papel, unnest($3::text[]) AS pr
          WHERE EXISTS (SELECT 1 FROM pg_attribute a
                         WHERE a.attrelid = to_regclass($1::text) AND a.attname = $2::name
                           AND a.attnum > 0 AND NOT a.attisdropped)
            AND has_column_privilege(papel::name, to_regclass($1::text), $2::text, pr)
          ORDER BY 1, 2`,
        [relacaoSql(p.tabela), coluna, [...p.privilegios]],
      );
      for (const l of g.rows) {
        problemas.push(
          `${p.tabela}.${coluna}: ${l.papel === "public" ? "PUBLIC" : l.papel} tem ${l.privilegio}, ` +
            `proibido desde a migração ${p.desdeMigracao} (${p.etapa}): ${p.motivo}`,
        );
      }
    }
  }
  return problemas;
}

/**
 * O que a correção 1 da 0G passou a exigir de toda declaração do catálogo
 * JUNTADO (as sondas montam entradas mínimas e não passam por aqui): toda
 * tabela sem município semeia o OUTRO município da prova da eliminação
 * (`semearOutroMunicipio`, com `:org`), e toda chave para tabela global
 * declara as colunas referenciadas no alvo (`colunasReferenciadas`).
 * Correção 2 da 0G: toda função de gatilho privilegiada (com `gatilhoEm`)
 * declara `semearParaProva` (com `:org`), a linha real da prova da recusa
 * fora da tabela.
 */
export function conferirDeclaracoesCompletas(
  excecoes: readonly ExcecaoAoIsolamento[],
  chaves: readonly ChaveParaTabelaGlobal[],
  funcoes: readonly FuncaoPrivilegiada[] = [],
): string[] {
  const problemas: string[] = [];
  for (const f of funcoes) {
    if (f.gatilhoEm === undefined) continue;
    if (!(f.semearParaProva !== undefined && /:org\b/.test(f.semearParaProva))) {
      problemas.push(
        `${f.assinatura}: função de gatilho privilegiada sem semearParaProva (com :org): com a ` +
          "tabela vazia, a prova da recusa fora da tabela só teria a linha nula, que esconde a " +
          "escrita chaveada por NEW feita antes da recusa",
      );
    }
  }
  for (const e of excecoes) {
    const d = e.semMunicipio?.naEliminacao;
    if (d && !(d.semearOutroMunicipio !== undefined && /:org\b/.test(d.semearOutroMunicipio))) {
      problemas.push(
        `${e.tabela} (${e.semMunicipio!.especie}): sem semearOutroMunicipio (com :org), a prova da ` +
          "eliminação não vê se a eliminação de UM município alcança as linhas de outro",
      );
    }
    if (
      d?.compartilhar !== undefined &&
      !(/:org\b/.test(d.compartilhar) && /:outra\b/.test(d.compartilhar))
    ) {
      problemas.push(
        `${e.tabela}: compartilhar precisa usar :org e :outra (os dois municípios da prova)`,
      );
    }
  }
  for (const c of chaves) {
    if (!c.colunasReferenciadas || c.colunasReferenciadas.length === 0) {
      problemas.push(
        `${c.tabela}.${c.restricao}: chave para tabela global sem colunasReferenciadas (as colunas do ` +
          `alvo ${c.alvo} que ela referencia)`,
      );
    }
  }
  return problemas;
}

/** Os bits de `pg_trigger.tgtype`. */
const TG_ROW = 1;
const TG_BEFORE = 2;
const TG_INSERT = 4;
const TG_DELETE = 8;
const TG_UPDATE = 16;
const TG_TRUNCATE = 32;
const TG_INSTEAD = 64;

/** Um gatilho como o banco o tem, na forma de `GatilhoDeclarado`. */
interface GatilhoDoBanco extends GatilhoDeclarado {
  readonly habilitado: string;
  readonly definicao: string;
}

function eventosDoTipo(tipo: number): GatilhoDeclarado["eventos"][number][] {
  const eventos: GatilhoDeclarado["eventos"][number][] = [];
  if (tipo & TG_INSERT) eventos.push("INSERT");
  if (tipo & TG_UPDATE) eventos.push("UPDATE");
  if (tipo & TG_DELETE) eventos.push("DELETE");
  if (tipo & TG_TRUNCATE) eventos.push("TRUNCATE");
  return eventos;
}

/** A condição `WHEN` de `pg_get_triggerdef`, sem o `WHEN (` e o `)` de fora. */
function condicaoDoGatilho(definicao: string): string | undefined {
  const m = / WHEN \(([\s\S]*)\) EXECUTE (FUNCTION|PROCEDURE) /.exec(definicao);
  return m ? m[1] : undefined;
}

/** Os gatilhos do banco (não internos) que chamam a função. */
async function gatilhosDaFuncao(db: ConsultaSql, assinatura: string): Promise<GatilhoDoBanco[]> {
  const r = await db.query<{
    esquema: string;
    tabela: string;
    nome: string;
    tipo: number;
    habilitado: string;
    adiavel: boolean;
    adiado: boolean;
    colunas: string[];
    definicao: string;
  }>(
    `SELECT n.nspname::text AS esquema, c.relname::text AS tabela, t.tgname::text AS nome,
            t.tgtype::int AS tipo, t.tgenabled::text AS habilitado,
            t.tgdeferrable AS adiavel, t.tginitdeferred AS adiado,
            ARRAY(SELECT a.attname::text
                    FROM unnest(t.tgattr::int2[]) WITH ORDINALITY AS u(n, i)
                    JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = u.n
                   ORDER BY u.i) AS colunas,
            pg_get_triggerdef(t.oid) AS definicao
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.tgfoid = to_regprocedure($1::text) AND NOT t.tgisinternal
      ORDER BY 1, 2, 3`,
    [assinatura],
  );
  return r.rows.map((l) => {
    const quando = condicaoDoGatilho(l.definicao);
    return {
      tabela: nomeQualificado(l.esquema, l.tabela),
      nome: l.nome,
      momento: l.tipo & TG_BEFORE ? "BEFORE" : l.tipo & TG_INSTEAD ? "INSTEAD OF" : "AFTER",
      nivel: l.tipo & TG_ROW ? "ROW" : "STATEMENT",
      eventos: eventosDoTipo(l.tipo),
      ...(l.colunas.length ? { colunasDoUpdate: l.colunas } : {}),
      ...(quando !== undefined ? { quando } : {}),
      ...(l.adiavel ? { adiado: l.adiado ? "INITIALLY DEFERRED" : "INITIALLY IMMEDIATE" } : {}),
      habilitado: l.habilitado,
      definicao: l.definicao,
    } as GatilhoDoBanco;
  });
}

/** O gatilho na forma comparável: o que o catálogo declara e o banco tem. */
function formaDoGatilho(g: GatilhoDeclarado): string {
  return JSON.stringify({
    momento: g.momento,
    nivel: g.nivel,
    eventos: [...g.eventos].sort(),
    colunasDoUpdate: g.colunasDoUpdate ?? [],
    quando: g.quando ?? null,
    adiado: g.adiado ?? null,
  });
}

/**
 * O DISPARO de cada função de gatilho privilegiada (item 7): `gatilhos`
 * declarado (obrigatório junto de `gatilhoEm`, nas mesmas tabelas), e o
 * conjunto de gatilhos do banco que a chamam é EXATAMENTE o declarado, por
 * tabela e nome, com o mesmo momento, nível, eventos, colunas do `UPDATE OF`,
 * condição `WHEN` e adiamento; e cada um HABILITADO (`tgenabled` `O`, o
 * normal, ou `A`, sempre): desabilitado (`D`) ou só para réplica (`R`) é a
 * proteção desligada com `gatilhoEm` ainda batendo.
 */
export async function conferirDisparoDosGatilhos(
  db: ConsultaSql,
  funcoes: readonly FuncaoPrivilegiada[],
): Promise<string[]> {
  const problemas: string[] = [];
  for (const f of funcoes) {
    if (f.gatilhoEm === undefined && f.gatilhos === undefined) continue;
    if (f.gatilhoEm === undefined) {
      problemas.push(`${f.assinatura}: gatilhos declarados sem gatilhoEm`);
      continue;
    }
    const declarados = f.gatilhos ?? [];
    if (declarados.length === 0) {
      problemas.push(
        `${f.assinatura}: função de gatilho privilegiada sem gatilhos declarados (tabela, nome, ` +
          "momento, nível, eventos, UPDATE OF, WHEN e adiamento de cada gatilho que a chama)",
      );
    }
    const tabelas = [...new Set(declarados.map((g) => g.tabela))].sort();
    if (declarados.length && JSON.stringify(tabelas) !== JSON.stringify([...f.gatilhoEm].sort())) {
      problemas.push(
        `${f.assinatura}: os gatilhos declarados estão em (${tabelas.join(", ")}), e gatilhoEm diz ` +
          `(${[...f.gatilhoEm].sort().join(", ")})`,
      );
    }
    const doBanco = await gatilhosDaFuncao(db, f.assinatura);
    for (const g of doBanco) {
      if (g.habilitado === "D" || g.habilitado === "R") {
        problemas.push(
          `${f.assinatura}: o gatilho ${g.nome} de ${g.tabela} está ` +
            `${g.habilitado === "D" ? "DESABILITADO" : "habilitado SÓ PARA RÉPLICA"} (tgenabled ` +
            `${g.habilitado}): gatilho privilegiado dispara sempre (O ou A)`,
        );
      } else if (g.habilitado !== "O" && g.habilitado !== "A") {
        problemas.push(
          `${f.assinatura}: o gatilho ${g.nome} tem tgenabled ${g.habilitado}, que o portão não conhece`,
        );
      }
    }
    if (declarados.length === 0) continue;
    const chave = (g: { tabela: string; nome: string }) => `${g.tabela}.${g.nome}`;
    const noBanco = new Map(doBanco.map((g) => [chave(g), g]));
    const naLista = new Map(declarados.map((g) => [chave(g), g]));
    for (const [k] of noBanco) {
      if (!naLista.has(k)) {
        problemas.push(
          `${f.assinatura}: o gatilho ${k} a chama no banco e não está declarado em gatilhos`,
        );
      }
    }
    for (const [k, g] of naLista) {
      const real = noBanco.get(k);
      if (!real) {
        problemas.push(`${f.assinatura}: o gatilho ${k} está declarado e não existe no banco`);
      } else if (formaDoGatilho(real) !== formaDoGatilho(g)) {
        problemas.push(
          `${f.assinatura}: o gatilho ${k} no banco é ${formaDoGatilho(real)}, e o catálogo declara ` +
            formaDoGatilho(g),
        );
      }
    }
  }
  return problemas;
}

/** Os contadores de escrita da transação em toda tabela que não é temporária, e as sequências. */
async function efeitosDaTransacao(tx: ConsultaSql): Promise<Map<string, string>> {
  const r = await tx.query<{ objeto: string; valor: string }>(`
    SELECT s.schemaname || '.' || s.relname AS objeto,
           (s.n_tup_ins + s.n_tup_upd + s.n_tup_del)::text AS valor
      FROM pg_stat_xact_user_tables s
     WHERE s.relid NOT IN (SELECT c.oid FROM pg_class c WHERE c.relnamespace = pg_my_temp_schema())
    UNION ALL
    SELECT 'sequência ' || q.schemaname || '.' || q.sequencename, coalesce(q.last_value::text, '')
      FROM pg_sequences q
     WHERE q.schemaname NOT LIKE 'pg\\_%' AND q.schemaname <> 'information_schema'
  `);
  return new Map(r.rows.map((l) => [l.objeto, l.valor]));
}

/**
 * A RECUSA FORA DA TABELA, comportamental (item 6): toda função `SECURITY
 * DEFINER` que retorna `trigger` (perguntado ao BANCO, e não ao catálogo) é
 * disparada de uma tabela INDEVIDA, a forma do ataque: uma tabela temporária
 * com o MESMO NOME da tabela real (`pg_temp.usuarios`), com a cópia de cada
 * gatilho real da função (mesmo nome, momento, nível, eventos e adiamento;
 * sem a condição `WHEN`, que quem ataca não poria), e cada evento é
 * executado (o adiado, forçado com `SET CONSTRAINTS ALL IMMEDIATE`), com
 * duas linhas de ataque: a nula e, quando a tabela real tem linha, a cópia de
 * uma linha real. Função sem gatilho no banco é disparada de uma tabela de
 * prova.
 *
 * Exige: ERRO, com SQLSTATE 42501 (`insufficient_privilege`, a recusa pela
 * tabela que disparou), e NENHUM efeito antes dele: nenhum contador de
 * escrita da transação (`pg_stat_xact_user_tables`, que conta até a linha
 * desfeita pelo erro) de tabela que não seja a temporária mudou, e nenhuma
 * sequência andou. A conferência textual de `conferirGatilhosPrivilegiados`
 * aceitava `PERFORM TG_RELID = 'public.usuarios'::regclass;`, que não recusa
 * nada, e a conferência posta DEPOIS da escrita. Tudo como dono, numa
 * transação desfeita no fim.
 *
 * Correção 2 da 0G (a dívida do item 6): com `funcoes` (o catálogo), a
 * função que declara `semearParaProva` tem a linha real semeada dentro da
 * transação da prova, mesmo com a tabela vazia; e o UPDATE da prova muda de
 * verdade toda coluna (da linha nula para a real e da real para a nula), em
 * vez de `SET coluna = coluna`.
 */
export async function provarRecusaForaDaTabela(
  db: BancoComTransacao,
  funcoes: readonly FuncaoPrivilegiada[] = [],
): Promise<string[]> {
  const problemas: string[] = [];
  const sementes = new Map(
    funcoes
      .filter((f) => f.semearParaProva !== undefined)
      .map((f) => [f.assinatura, f.semearParaProva!]),
  );
  const funcoesDoBanco = await db.query<{ assinatura: string }>(`
    SELECT n.nspname || '.' || p.proname || '(' ||
             replace(oidvectortypes(p.proargtypes), ', ', ',') || ')' AS assinatura
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef AND p.prorettype = 'trigger'::regtype
       AND ${FORA_DO_SISTEMA}
       AND (n.nspname = 'public' OR NOT ${DE_EXTENSAO("pg_proc", "p.oid")})
     ORDER BY 1
  `);
  for (const { assinatura } of funcoesDoBanco.rows) {
    const reais = await gatilhosDaFuncao(db, assinatura);
    const copias: Array<{ tabela: string; definicao: string; gatilho: string }> = reais.map((g) => {
      const [, tabela] = partesDoNome(g.tabela);
      const semQuando = g.definicao.replace(
        / WHEN \([\s\S]*\) EXECUTE (FUNCTION|PROCEDURE) /,
        " EXECUTE $1 ",
      );
      const definicao = semQuando.replace(
        new RegExp(` ON (?:"?[A-Za-z_][A-Za-z0-9_]*"?\\.)?"?${tabela}"? `),
        ` ON pg_temp.${identificador(tabela)} `,
      );
      return { tabela, definicao, gatilho: `${g.nome} (de ${g.tabela})` };
    });
    if (copias.length === 0) {
      copias.push({
        tabela: "prova_do_gatilho_fora_da_tabela",
        definicao:
          "CREATE TRIGGER prova_do_gatilho_fora_da_tabela BEFORE INSERT ON pg_temp.prova_do_gatilho_fora_da_tabela " +
          `FOR EACH ROW EXECUTE FUNCTION ${assinatura}`,
        gatilho: "de prova (a função não tem gatilho no banco)",
      });
    }
    for (const copia of copias) {
      if (!copia.definicao.includes(" ON pg_temp.")) {
        problemas.push(
          `${assinatura}: a prova não soube copiar o gatilho ${copia.gatilho} para uma tabela temporária ` +
            `(${copia.definicao}): sem a prova, a recusa fora da tabela não está demonstrada`,
        );
        continue;
      }
      problemas.push(
        ...(await dispararForaDaTabela(db, assinatura, copia, sementes.get(assinatura))),
      );
    }
  }
  return problemas;
}

/** Uma variante da prova: a linha que a tabela temporária recebe, e se ela é a nula. */
interface VarianteDaProva {
  readonly semente: string;
  readonly rotulo: string;
  readonly nula: boolean;
}

async function dispararForaDaTabela(
  db: BancoComTransacao,
  assinatura: string,
  copia: { tabela: string; definicao: string; gatilho: string },
  semear: string | undefined,
): Promise<string[]> {
  const problemas: string[] = [];
  const temp = `pg_temp.${identificador(copia.tabela)}`;
  const publica = `public.${identificador(copia.tabela)}`;
  const r = await db.query<{ existe: boolean }>(
    "SELECT to_regclass($1::text) IS NOT NULL AS existe",
    [publica],
  );
  const existe = r.rows[0]!.existe;
  const comLinha =
    existe &&
    (await db.query<{ tem: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${publica}) AS tem`)).rows[0]!
      .tem;
  /*
    Duas linhas de ataque: a nula (toda coluna NULL) e uma CÓPIA de uma linha
    real (chaves de verdade: a escrita feita antes da recusa com a chave nula
    não muda linha nenhuma, e com a real muda). A linha real é a que a tabela
    já tem ou, com `semearParaProva` declarada (correção 2 da 0G), a que a
    semeadura põe nela dentro da transação da prova, de modo que a tabela
    vazia não esconde mais a escrita chaveada por `NEW`.
  */
  const comReal = existe && (comLinha || semear !== undefined);
  const variantes: VarianteDaProva[] = [
    { semente: "DEFAULT VALUES", rotulo: "", nula: true },
    ...(comReal
      ? [
          {
            semente: `SELECT * FROM ${publica} LIMIT 1`,
            rotulo: `, com uma linha real de ${publica}`,
            nula: false,
          },
        ]
      : []),
  ];
  for (const variante of variantes) {
    problemas.push(
      ...(await dispararUmaVariante(db, assinatura, copia, temp, existe, variante, semear)),
    );
  }
  return problemas;
}

/**
 * O comando de UPDATE da prova, com MUDANÇA EFETIVA em toda coluna (correção
 * 2 da 0G): da linha nula para a real, e da real para a nula. Antes era
 * `SET coluna = coluna`, e uma função que só escreve quando `NEW` difere de
 * `OLD`, com a recusa depois dessa escrita, passava. Sem linha real
 * disponível, fica o UPDATE sem mudança de antes.
 */
function updateDaProva(
  temp: string,
  publica: string,
  colunas: readonly string[],
  alvo: string,
  variante: VarianteDaProva,
  temReal: boolean,
): string {
  if (!temReal) return `UPDATE ${temp} SET ${alvo} = ${alvo}`;
  const ids = colunas.map(identificador);
  if (variante.nula) {
    return (
      `UPDATE ${temp} SET ${ids.map((c) => `${c} = prova_real.${c}`).join(", ")} ` +
      `FROM (SELECT * FROM ${publica} LIMIT 1) AS prova_real`
    );
  }
  return `UPDATE ${temp} SET ${ids.map((c) => `${c} = NULL`).join(", ")}`;
}

async function dispararUmaVariante(
  db: BancoComTransacao,
  assinatura: string,
  copia: { tabela: string; definicao: string; gatilho: string },
  temp: string,
  existe: boolean,
  variante: VarianteDaProva,
  semear: string | undefined,
): Promise<string[]> {
  const problemas: string[] = [];
  const publica = `public.${identificador(copia.tabela)}`;
  await db.transaction(async (tx) => {
    try {
      if (existe && semear !== undefined) {
        const org = (
          await tx.query<{ id: string }>(
            `INSERT INTO organizacoes (nome, municipio, uf)
             VALUES ('Defesa Civil da Prova do Gatilho', 'Prova do Gatilho', 'MG') RETURNING id`,
          )
        ).rows[0]!.id;
        await tx.exec(semear.replace(/:org\b/g, `'${org}'::uuid`));
      }
      const temReal =
        existe &&
        (await tx.query<{ tem: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${publica}) AS tem`))
          .rows[0]!.tem;
      if (!variante.nula && !temReal) {
        problemas.push(
          `${assinatura}: semearParaProva não pôs nenhuma linha em ${publica}: sem linha real, a ` +
            "prova da recusa fora da tabela só tem a linha nula",
        );
        await tx.rollback();
        return;
      }
      await tx.exec(
        existe
          ? `CREATE TEMP TABLE ${identificador(copia.tabela)} AS SELECT * FROM ${publica} WITH NO DATA`
          : `CREATE TEMP TABLE ${identificador(copia.tabela)} (prova integer)`,
      );
      await tx.exec(`INSERT INTO ${temp} ${variante.semente}`);
      const colunas = (
        await tx.query<{ coluna: string }>(
          `SELECT a.attname::text AS coluna FROM pg_attribute a
            WHERE a.attrelid = to_regclass($1::text) AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY a.attnum`,
          [temp],
        )
      ).rows.map((l) => l.coluna);
      const primeira = colunas[0]!;
      await tx.exec(copia.definicao);
      const t = (
        await tx.query<{ tipo: number; adiavel: boolean; colunas: string[] }>(
          `SELECT t.tgtype::int AS tipo, t.tgdeferrable AS adiavel,
                  ARRAY(SELECT a.attname::text FROM unnest(t.tgattr::int2[]) AS u(n)
                          JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = u.n) AS colunas
             FROM pg_trigger t WHERE t.tgrelid = to_regclass($1::text) AND NOT t.tgisinternal`,
          [temp],
        )
      ).rows[0]!;
      const alvo = identificador(t.colunas[0] ?? primeira);
      const comandos: Array<[string, string]> = [];
      if (t.tipo & TG_INSERT) comandos.push(["INSERT", `INSERT INTO ${temp} ${variante.semente}`]);
      if (t.tipo & TG_UPDATE) {
        comandos.push(["UPDATE", updateDaProva(temp, publica, colunas, alvo, variante, temReal)]);
      }
      if (t.tipo & TG_DELETE) comandos.push(["DELETE", `DELETE FROM ${temp}`]);
      if (t.tipo & TG_TRUNCATE) comandos.push(["TRUNCATE", `TRUNCATE ${temp}`]);
      for (const [evento, comando] of comandos) {
        const antes = await efeitosDaTransacao(tx);
        await tx.exec("SAVEPOINT prova_fora_da_tabela");
        let erro: { code?: string; message?: string } | null = null;
        try {
          await tx.exec(comando);
          if (t.adiavel) await tx.exec("SET CONSTRAINTS ALL IMMEDIATE");
        } catch (e) {
          erro = e as { code?: string; message?: string };
        }
        await tx.exec("ROLLBACK TO SAVEPOINT prova_fora_da_tabela");
        const depois = await efeitosDaTransacao(tx);
        const onde = `disparada pelo gatilho ${copia.gatilho} copiado para ${temp} (${evento}${variante.rotulo})`;
        if (erro === null) {
          problemas.push(
            `${assinatura}: ${onde}, a função NÃO recusou: a conferência da tabela que disparou ` +
              "(TG_RELID) não está em vigor",
          );
        } else if (erro.code !== "42501") {
          problemas.push(
            `${assinatura}: ${onde}, a função falhou com ${erro.code ?? "?"} (${erro.message ?? ""}), e ` +
              "não com a recusa 42501 (insufficient_privilege) pela tabela que disparou: o erro veio de " +
              "outra coisa, e com outra linha ela seguiria",
          );
        }
        const escreveu = [...depois].filter(([k, v]) => antes.get(k) !== v).map(([k]) => k);
        if (escreveu.length) {
          problemas.push(
            `${assinatura}: ${onde}, a função ESCREVEU antes de recusar (${escreveu.join(", ")}): a ` +
              "recusa pela tabela que disparou vem antes de qualquer efeito",
          );
        }
      }
    } catch (erro) {
      problemas.push(
        `${assinatura}: a prova da recusa fora da tabela (gatilho ${copia.gatilho}) não chegou ao fim: ` +
          (erro as Error).message,
      );
    }
    await tx.rollback();
  });
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
 *   - objeto (tabela, visão, sequência, tabela estrangeira, tipo, função) num
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

  /*
    Os TIPOS próprios também (parte 0D, item 7 da auditoria): enum, domínio,
    tipo composto avulso e intervalo. Ficam de fora o tipo de linha de uma
    relação (a relação já está na lista) e o tipo vetor de outro tipo (o tipo
    do elemento já está).
  */
  const TIPO_PROPRIO = (t: string) =>
    `${t}.typrelid = 0 AND NOT EXISTS (SELECT 1 FROM pg_type e WHERE e.typarray = ${t}.oid)`;
  const objetos = await db.query<{ objeto: string; tipo: string }>(`
    SELECT n.nspname || '.' || c.relname AS objeto, c.relkind::text AS tipo
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S', 'c')
       AND ${FORA_DO_SISTEMA} AND n.nspname <> 'public'
       AND NOT ${RELACAO_DE_EXTENSAO("c")}
    UNION ALL
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           'função'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE ${FORA_DO_SISTEMA} AND n.nspname <> 'public'
       AND NOT ${DE_EXTENSAO("pg_proc", "p.oid")}
    UNION ALL
    SELECT n.nspname || '.' || t.typname, 'tipo'
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE ${FORA_DO_SISTEMA} AND n.nspname <> 'public'
       AND ${TIPO_PROPRIO("t")}
       AND NOT ${DE_EXTENSAO("pg_type", "t.oid")}
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
           (EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid
                      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S', 'c'))
              OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = n.oid)
              OR EXISTS (SELECT 1 FROM pg_type t WHERE t.typnamespace = n.oid))
           AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid
                             AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S', 'c')
                             AND NOT ${RELACAO_DE_EXTENSAO("c")})
           AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = n.oid
                             AND NOT ${DE_EXTENSAO("pg_proc", "p.oid")})
           AND NOT EXISTS (SELECT 1 FROM pg_type t WHERE t.typnamespace = n.oid
                             AND ${TIPO_PROPRIO("t")}
                             AND NOT ${DE_EXTENSAO("pg_type", "t.oid")}) AS so_de_extensao
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

/**
 * A migração CRIA a função (`CREATE [OR REPLACE] FUNCTION nome(`) ou a ALTERA
 * na forma (`ALTER FUNCTION nome(...) SET ...`, `SECURITY ...`, volatilidade).
 *
 * A segunda forma entrou na parte 0D: a conferência pela definição instalada
 * (item 5) mostrou que `varrer_prazos` ganhou `SET row_security = off` na 045
 * por `ALTER FUNCTION`, e a regra só por `CREATE` dizia que a forma atual
 * vinha da 016. Mudar dono, nome, esquema ou dependência não muda a forma
 * (`pg_get_functiondef`) e não conta.
 */
function criaFuncao(sql: string, nome: string, soReplace = false): boolean {
  const limpo = semComentarios(sql);
  const cria = new RegExp(
    `CREATE\\s+${soReplace ? "OR\\s+REPLACE\\s+" : "(OR\\s+REPLACE\\s+)?"}FUNCTION\\s+(public\\.)?"?${nome}"?\\s*\\(`,
    "i",
  );
  const altera = new RegExp(
    `ALTER\\s+FUNCTION\\s+(public\\.)?"?${nome}"?\\s*\\([^)]*\\)\\s+(?!OWNER\\b|RENAME\\b|SET\\s+SCHEMA\\b|(NO\\s+)?DEPENDS\\b)`,
    "i",
  );
  return cria.test(limpo) || altera.test(limpo);
}

/**
 * O catálogo contra os ARQUIVOS do repositório (achado 3 do revisor), porque
 * o que a entrada diz sobre a origem da função também precisa ser verdade:
 *
 *   - `migracao` é a ÚLTIMA migração que cria a função (`CREATE [OR REPLACE]
 *     FUNCTION nome(`) ou a altera na forma (`ALTER FUNCTION nome(...) SET`,
 *     parte 0D). Uma migração nova que reescreve o corpo de uma função
 *     catalogada sem a etapa declarar a entrada nova (`redefine`) reprova;
 *   - toda entrada com `redefine: true` tem `migracao` MAIOR que a da entrada
 *     que substitui, e essa migração contém `CREATE OR REPLACE FUNCTION` (ou
 *     o `ALTER FUNCTION` de forma) da função. Redefinir só no catálogo (apagar uma dívida de tenant sem
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
