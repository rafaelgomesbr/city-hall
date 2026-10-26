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
 */
import type { ExcecaoAoIsolamento, FuncaoPrivilegiada } from "./tipos.js";

/** O mínimo de que a conferência precisa: PGlite, uma transação dele ou `pg`. */
export interface ConsultaSql {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = Record<string, unknown>>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}

/** O tamanho mínimo de um texto de motivo ou de conferência: obriga a escrever. */
const MINIMO_DO_MOTIVO = 40;
const MINIMO_DA_CONFERENCIA = 30;

/** A chave de uma função: nome e argumentos, como o catálogo do banco os escreve. */
export function chaveDaFuncao(f: { nome: string; argumentos: string }): string {
  return `${f.nome}(${f.argumentos})`;
}

interface FuncaoDoBanco {
  nome: string;
  argumentos: string;
  acl: string | null;
}

async function definidorasDoBanco(db: ConsultaSql): Promise<FuncaoDoBanco[]> {
  const r = await db.query<FuncaoDoBanco>(`
    SELECT p.proname::text AS nome,
           pg_get_function_identity_arguments(p.oid)::text AS argumentos,
           array_to_string(p.proacl, ',') AS acl
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
     ORDER BY p.proname, 2
  `);
  return r.rows;
}

/**
 * Quem tem EXECUTE, tirando o dono. ACL nula é o privilégio padrão do Postgres,
 * que inclui `PUBLIC`: devolve "PUBLIC" para o chamador reprovar.
 */
export function quemExecuta(acl: string | null): string[] {
  if (acl === null) return ["PUBLIC"];
  const quem = new Set<string>();
  for (const entrada of acl.split(",")) {
    const m = /^([^=]*)=([^/]*)\/(.*)$/.exec(entrada);
    if (!m) {
      quem.add(`ilegível:${entrada}`);
      continue;
    }
    const [, grantee, , grantor] = m;
    if (grantee === grantor) continue; // o dono
    quem.add(grantee === "" ? "PUBLIC" : grantee!);
  }
  return [...quem].sort();
}

/**
 * `FUNCOES_PRIVILEGIADAS` contra as funções `SECURITY DEFINER` do banco.
 *
 * Sentido 1: função no banco fora da lista reprova. Sentido 2: entrada na
 * lista sem a função no banco reprova. Mais três cobranças sobre o que a
 * entrada diz: o EXECUTE concedido é exatamente o declarado (e nunca `PUBLIC`),
 * a dívida de tenant tem etapa que a paga, e motivo e conferência não são
 * texto de enchimento.
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

  const naLista = new Map(funcoes.map((f) => [chaveDaFuncao(f), f]));
  const noBanco = new Map(doBanco.map((f) => [chaveDaFuncao(f), f]));

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

    const esperado = [...f.executavelPor].sort();
    const real_ = quemExecuta(real.acl);
    if (JSON.stringify(esperado) !== JSON.stringify(real_)) {
      problemas.push(
        `${chave}: o EXECUTE do banco (${real_.join(", ") || "ninguém"}) não é o declarado ` +
          `(${esperado.join(", ") || "ninguém"})`,
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
}

/**
 * As tabelas do esquema `public` com os dois fatos que as exceções negam: a
 * coluna `organizacao_id` obrigatória e uma policy do produto (qualquer papel
 * que não seja o console) amarrada a `app_organizacao_atual()`. A tabela de
 * controle do aplicador de migrações (`schema_migracoes`) não é tabela de
 * negócio e fica fora, como o portão sempre a deixou.
 */
async function tabelasDoBanco(db: ConsultaSql): Promise<TabelaDoBanco[]> {
  const r = await db.query<TabelaDoBanco>(`
    SELECT t.tablename::text AS tabela,
           EXISTS (
             SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = t.tablename
                AND c.column_name = 'organizacao_id' AND c.is_nullable = 'NO'
           ) AS tem_organizacao_id,
           EXISTS (
             SELECT 1 FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = t.tablename
                AND array_to_string(p.roles, ',') <> 'dc360_console'
                AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%app_organizacao_atual%'
           ) AS tem_policy_de_tenant
      FROM pg_tables t
     WHERE t.schemaname = 'public' AND t.tablename <> 'schema_migracoes'
     ORDER BY t.tablename
  `);
  return r.rows;
}

/**
 * `EXCECOES_AO_ISOLAMENTO` contra as tabelas do banco, nos dois sentidos.
 *
 * Sentido 1: tabela sem `organizacao_id` obrigatório que não consta como
 * exceção reprova (é o que o portão sempre cobrou, agora por nome). Sentido 2:
 * entrada na lista que o banco não confirma reprova, em duas formas: a tabela
 * não existe, ou existe mas NÃO precisa da exceção (já tem a coluna, ou já tem
 * a policy). Exceção que a tabela não precisa é isenção que sobrou, e isenção
 * que sobrou é o lugar onde uma regressão se esconde.
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
    if (!t.tem_organizacao_id && !naLista.get(t.tabela)?.semOrganizacaoId) {
      problemas.push(
        `${t.tabela} não tem organizacao_id obrigatório e não consta em EXCECOES_AO_ISOLAMENTO. ` +
          "Ou a tabela ganha a coluna, ou entra na lista da sua etapa (db/test/catalogo/f03-eNN.ts) " +
          "com o motivo e a trava que a prende no lugar.",
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
    if (!e.semOrganizacaoId && !e.semPolicyDeTenant) {
      problemas.push(
        `${e.tabela}: entrada em EXCECOES_AO_ISOLAMENTO que não declara exceção nenhuma`,
      );
    }
    if (e.semOrganizacaoId && real.tem_organizacao_id) {
      problemas.push(
        `${e.tabela}: declarada sem organizacao_id, mas a tabela TEM a coluna obrigatória: exceção desnecessária`,
      );
    }
    if (e.semPolicyDeTenant && real.tem_policy_de_tenant) {
      problemas.push(
        `${e.tabela}: declarada sem policy de tenant, mas a tabela TEM policy amarrada a ` +
          "app_organizacao_atual(): exceção desnecessária",
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
