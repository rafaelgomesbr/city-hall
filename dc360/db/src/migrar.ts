import { createHash } from "node:crypto";

/**
 * Aplicador de migrações.
 *
 * Até aqui as migrações eram executadas lendo a pasta e mandando tudo para o
 * banco. Isso funciona num banco vazio e quebra em qualquer outro: rodar de
 * novo tentaria criar tabela que já existe, e o deploy falharia no meio,
 * deixando o esquema pela metade.
 *
 * O que este arquivo garante:
 *
 * 1. **Cada migração roda uma vez.** O que já foi aplicado fica registrado.
 * 2. **Na ordem, sempre.** Ordem alfabética do nome do arquivo, que é por isso
 *    que eles começam com número.
 * 3. **Cada uma numa transação.** Se a 005 falhar no meio, ela é desfeita
 *    inteira e as anteriores permanecem. Um esquema meio aplicado é pior que
 *    um esquema desatualizado, porque ninguém sabe em que estado ele está.
 * 4. **Histórico não se reescreve.** Se o conteúdo de uma migração já aplicada
 *    mudar, o aplicador PARA. Editar uma migração que já rodou em produção
 *    significa que o banco de lá e o da sua máquina divergiram em silêncio, e
 *    seguir em frente esconderia isso até o dia em que uma consulta falha sem
 *    explicação.
 * 5. **Uma de cada vez por banco.** Quem migra toma uma trava de sessão do
 *    Postgres (`pg_try_advisory_lock`) antes de ler o registro e só a larga
 *    no fim. Duas execuções simultâneas (dois deploys, um deploy e um
 *    `npm run migrar` à mão) disputariam a mesma versão: as duas leriam "falta
 *    a 052", as duas tentariam criar o mesmo objeto, e uma morreria no meio
 *    com um erro que não explica a causa. Com a trava, a segunda espera e,
 *    quando a primeira termina, já encontra tudo aplicado.
 */

export type Migracao = {
  /** Nome do arquivo, que também é a versão. Ex.: `003_evidencias.sql`. */
  versao: string;
  sql: string;
};

export type ExecutorSql = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  /** Executa um script com vários comandos. */
  exec(sql: string): Promise<unknown>;
};

export type ResultadoMigracao = {
  aplicadas: string[];
  jaEstavam: string[];
};

export class HistoricoAlterado extends Error {
  constructor(readonly versao: string) {
    super(
      `A migração ${versao} já foi aplicada neste banco, mas o arquivo mudou desde então. ` +
      `Editar migração aplicada faz o banco daqui divergir do de produção em silêncio. ` +
      `Crie uma migração nova em vez de alterar esta.`,
    );
    this.name = "HistoricoAlterado";
  }
}

/**
 * Código de saída do processo quando outra migração segura o banco. É o 3 do
 * roteiro de deploy: 1 é falha da migração, 2 é uso errado da linha de comando.
 */
export const CODIGO_DE_SAIDA_MIGRACAO_EM_ANDAMENTO = 3;

/** Quanto o migrador espera por outra migração em andamento, antes de desistir. */
export const ESPERA_PELA_TRAVA_MS = 60_000;
const INTERVALO_ENTRE_TENTATIVAS_MS = 1_000;

/**
 * Chave da trava, a mesma para todo migrador deste produto. O número é fixo e
 * arbitrário: só precisa ser igual em todo processo que migra e não colidir
 * com outra trava de sessão do banco (o produto não usa nenhuma outra).
 */
export const CHAVE_DA_TRAVA_DE_MIGRACAO = 36_036_001;

export class MigracaoEmAndamento extends Error {
  readonly codigoDeSaida = CODIGO_DE_SAIDA_MIGRACAO_EM_ANDAMENTO;
  constructor(readonly esperouMs: number) {
    super(
      `Outra migração está em andamento neste banco: esperei ${Math.round(esperouMs / 1000)} s ` +
      "e a trava não foi liberada. Duas migrações ao mesmo tempo disputariam a mesma " +
      "versão, então esta parou sem alterar nada.\n\n" +
      "O que fazer: espere a outra terminar e rode de novo (o que já foi aplicado é " +
      "ignorado). A trava solta sozinha quando a conexão da outra migração fecha, " +
      "mesmo que o processo dela tenha morrido. Se a mensagem se repete e você tem " +
      "certeza de que ninguém está migrando, procure a sessão que a segura em " +
      "`pg_locks` (locktype = 'advisory').\n\n" +
      "A trava só vale na conexão direta (porta 5432), nunca no pooler.",
    );
    this.name = "MigracaoEmAndamento";
  }
}

export type OpcoesDaTrava = {
  /** Quanto esperar pela trava. Padrão: 60 s. */
  esperaMs?: number;
  /** Intervalo entre tentativas. Padrão: 1 s. */
  intervaloMs?: number;
  /** Espera de verdade; os testes trocam por uma que não dorme. */
  dormir?: (ms: number) => Promise<void>;
};

const dormirDeVerdade = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Toma a trava de migração do banco e devolve a função que a larga.
 *
 * `pg_try_advisory_lock` (e não `pg_advisory_lock`) de propósito: a versão
 * que bloqueia esperaria para sempre atrás de uma migração travada, sem
 * mensagem. Aqui o migrador tenta, espera um pouco, tenta de novo, e depois do
 * prazo diz em português quem está no caminho. Sem esperar nada (`esperaMs: 0`)
 * é uma tentativa só.
 *
 * Trava de SESSÃO: vale enquanto a conexão viver, atravessa o `BEGIN` e o
 * `COMMIT` de cada migração, e o Postgres a solta sozinho se a conexão cair.
 * Por isso exige conexão direta: num pooler em modo transação cada comando
 * pode sair por uma conexão diferente, e a trava ficaria presa em uma que
 * ninguém mais usa.
 */
export async function tomarTravaDeMigracao(
  bd: ExecutorSql,
  opcoes: OpcoesDaTrava & { registrar?: (mensagem: string) => void } = {},
): Promise<() => Promise<void>> {
  const esperaMs = opcoes.esperaMs ?? ESPERA_PELA_TRAVA_MS;
  const intervaloMs = Math.max(1, opcoes.intervaloMs ?? INTERVALO_ENTRE_TENTATIVAS_MS);
  const dormir = opcoes.dormir ?? dormirDeVerdade;
  const tentativas = Math.floor(Math.max(0, esperaMs) / intervaloMs) + 1;

  for (let n = 1; n <= tentativas; n++) {
    const r = await bd.query<{ obtida: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS obtida",
      [CHAVE_DA_TRAVA_DE_MIGRACAO],
    );
    if (r.rows[0]?.obtida === true) {
      return async () => {
        // Se a conexão já caiu, o Postgres soltou a trava junto: nada a fazer.
        await bd
          .query("SELECT pg_advisory_unlock($1::bigint)", [CHAVE_DA_TRAVA_DE_MIGRACAO])
          .catch(() => undefined);
      };
    }
    if (n === 1) opcoes.registrar?.("outra migração está em andamento; esperando a trava");
    if (n < tentativas) await dormir(intervaloMs);
  }
  throw new MigracaoEmAndamento(esperaMs);
}

/**
 * Por que a trava não vale nesta URL, ou `null` quando vale. A porta 6543 é a
 * do pooler em modo transação (a que o `docs/AMBIENTES.md` já recusa para a
 * API): migrar por ela deixaria a trava solta ou presa.
 */
export function motivoParaNaoTravar(url: string | undefined): string | null {
  const texto = url?.trim();
  if (!texto) return null;
  try {
    if (new URL(texto).port === "6543") {
      return (
        "A DATABASE_URL aponta para a porta 6543 (pooler em modo transação). A trava que " +
        "impede duas migrações simultâneas é de sessão e não funciona nesse caminho. " +
        "Migre pela conexão direta, porta 5432."
      );
    }
  } catch {
    return null; // URL que não dá para analisar falha ao conectar, com a mensagem do driver.
  }
  return null;
}

const TABELA = "schema_migracoes";

/** O nome da tabela de controle, para quem precisa ler o registro (`desfazer.ts`). */
export const TABELA_DE_MIGRACOES = TABELA;

function impressao(sql: string): string {
  /*
    Espaço em branco é normalizado antes do hash.

    Sem isso, reindentar um comentário ou trocar a quebra de linha de LF para
    CRLF (o que acontece sozinho ao clonar o repositório no Windows) marcaria a
    migração como alterada e travaria todo deploy, por nada.
  */
  return createHash("sha256").update(sql.replace(/\s+/g, " ").trim()).digest("hex");
}

/**
 * Codigo do Postgres para "privilegio insuficiente". Vale para schema, tabela,
 * funcao e sequencia, e e o mesmo desde sempre.
 */
const PRIVILEGIO_INSUFICIENTE = "42501";

/**
 * Migrar com o papel errado, e por que a mensagem crua manda procurar longe.
 *
 * O `.env` da API guarda a credencial do papel de APLICACAO, que tem `USAGE` no
 * schema e NAO tem `CREATE`, de proposito: se a API pudesse alterar esquema,
 * uma falha nela viraria alteracao de banco. Migracao e ato do papel de SETUP,
 * e essa credencial nao mora no repositorio.
 *
 * Quem tem a credencial da API a mao usa ela, e recebe do Postgres:
 *
 *     error: permission denied for schema public
 *
 * A frase esta certa e e inutil aqui: a pessoa vai conferir policy, RLS e dono
 * de tabela, que e onde o problema NAO esta. O diagnostico e conhecido e a
 * saida tambem, entao os dois passam a sair junto, sem perder o texto do banco,
 * que e o que serve para depurar qualquer caso que nao seja este.
 */
async function garantirTabela(bd: ExecutorSql): Promise<void> {
  try {
    await bd.exec(`
      CREATE TABLE IF NOT EXISTS ${TABELA} (
        versao      text PRIMARY KEY,
        impressao   text NOT NULL,
        aplicada_em timestamptz NOT NULL DEFAULT now(),
        duracao_ms  integer
      );
    `);
  } catch (erro) {
    const codigo = (erro as { code?: string } | null)?.code;
    if (codigo !== PRIVILEGIO_INSUFICIENTE) throw erro;

    /*
      O nome do papel e perguntado ao banco, e nao deduzido da URL.

      A URL pode trazer o formato do pooler (`papel.referencia-do-projeto`), ou
      um papel que assume outro na conexao, e nos dois casos o nome escrito na
      string nao e o papel que o Postgres usou para recusar. Quem le a mensagem
      precisa do nome que o banco viu, senao troca a credencial errada.
    */
    let papel = "(não foi possível perguntar ao banco)";
    try {
      const r = await bd.query<{ papel: string }>("SELECT current_user AS papel");
      if (r.rows[0]?.papel) papel = r.rows[0].papel;
    } catch { /* se nem isto responde, a mensagem abaixo ainda serve */ }

    const original = erro instanceof Error ? erro.message : String(erro);
    throw new Error(
      `O papel "${papel}" não pode criar tabela no schema public, então não dá ` +
      "para nem registrar quais migrações já rodaram.\n\n" +
      "Quase sempre é a credencial errada: a que está no .env da API é a do " +
      "papel de APLICAÇÃO, que tem USAGE no schema e não tem CREATE, de " +
      "propósito. Se ela pudesse alterar esquema, uma falha na API viraria " +
      "alteração de banco.\n\n" +
      "Migração é ato do papel de SETUP (no Supabase, o usuário postgres da " +
      "conexão direta). Ver docs/COLOCAR-DE-PE.md, seção 2.\n\n" +
      `Erro do banco: ${original}`,
      { cause: erro },
    );
  }
}

export async function aplicarMigracoes(
  bd: ExecutorSql,
  migracoes: readonly Migracao[],
  opcoes: { registrar?: (mensagem: string) => void; trava?: OpcoesDaTrava } = {},
): Promise<ResultadoMigracao> {
  const registrar = opcoes.registrar ?? (() => undefined);

  /*
    A trava vem ANTES de tudo, inclusive de criar a tabela de controle: dois
    migradores num banco novo disputariam o próprio CREATE TABLE. E vale
    para qualquer papel (advisory lock não pede privilégio), então o papel
    errado ainda chega à mensagem de `garantirTabela`.
  */
  const soltar = await tomarTravaDeMigracao(bd, { ...opcoes.trava, registrar });
  try {
    return await aplicarComTrava(bd, migracoes, registrar);
  } finally {
    await soltar();
  }
}

async function aplicarComTrava(
  bd: ExecutorSql,
  migracoes: readonly Migracao[],
  registrar: (mensagem: string) => void,
): Promise<ResultadoMigracao> {
  await garantirTabela(bd);

  const jaAplicadas = new Map<string, string>();
  const anteriores = await bd.query<{ versao: string; impressao: string }>(
    `SELECT versao, impressao FROM ${TABELA}`,
  );
  for (const linha of anteriores.rows) jaAplicadas.set(linha.versao, linha.impressao);

  // Ordem alfabética: é por isso que os arquivos começam com número.
  const emOrdem = [...migracoes].sort((a, b) => a.versao.localeCompare(b.versao));

  const resultado: ResultadoMigracao = { aplicadas: [], jaEstavam: [] };

  for (const migracao of emOrdem) {
    const atual = impressao(migracao.sql);
    const registrada = jaAplicadas.get(migracao.versao);

    if (registrada !== undefined) {
      if (registrada !== atual) throw new HistoricoAlterado(migracao.versao);
      resultado.jaEstavam.push(migracao.versao);
      continue;
    }

    const comecou = Date.now();
    registrar(`aplicando ${migracao.versao}`);

    /*
      Transação por migração, e não uma só para todas.

      Se a 006 falhar, as cinco anteriores continuam aplicadas e registradas, e
      a próxima execução retoma da 006. Uma transação única desfaria tudo e
      transformaria um erro de digitação numa migração em várias horas de
      reaplicação num banco grande.
    */
    await bd.exec("BEGIN");
    try {
      await bd.exec(migracao.sql);
      await bd.query(
        `INSERT INTO ${TABELA} (versao, impressao, duracao_ms) VALUES ($1,$2,$3)`,
        [migracao.versao, atual, Date.now() - comecou],
      );
      await bd.exec("COMMIT");
    } catch (erro) {
      await bd.exec("ROLLBACK").catch(() => undefined);
      throw new Error(
        `Falha ao aplicar ${migracao.versao}: ${erro instanceof Error ? erro.message : String(erro)}`,
        { cause: erro },
      );
    }

    resultado.aplicadas.push(migracao.versao);
  }

  await permitirLeituraDoRegistro(bd);
  return resultado;
}

/**
 * O papel de aplicação precisa LER o registro de migrações.
 *
 * É como a rota de saúde responde "este processo está pronto?" sem privilégio
 * de dono. Só leitura: quem aplica migração é o processo de deploy, não a API.
 *
 * O `GRANT` fica depois das migrações porque o papel `dc360_app` é criado pela
 * primeira delas, e no banco vazio ele ainda não existe quando a tabela de
 * controle é criada.
 */
async function permitirLeituraDoRegistro(bd: ExecutorSql): Promise<void> {
  await bd.exec(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dc360_app') THEN
        GRANT SELECT ON ${TABELA} TO dc360_app;
      END IF;
    END
    $$;
  `);
}

/**
 * O que já está aplicado, para diagnóstico e para a rota de saúde.
 *
 * NÃO cria a tabela. É este o caminho que a API roda na partida, como o papel
 * de aplicação (`dc360_app`), que tem USAGE no schema e não tem CREATE. Um
 * `CREATE TABLE IF NOT EXISTS` aqui falhava com "permission denied for schema
 * public": o Postgres confere o privilégio de CREATE ANTES de resolver o
 * IF NOT EXISTS, então a tabela já existir não salvava. A API morria na
 * partida e `/saude` respondia 503 para sempre.
 *
 * `to_regclass` devolve o OID da tabela, ou NULL se ela não existe, sem exigir
 * privilégio nenhum além de poder enxergar o schema. Tabela ausente significa
 * "nada aplicado ainda", que é a resposta certa num banco recém-criado. Criar
 * a tabela é responsabilidade de `aplicarMigracoes`, rodado pelo dono no
 * deploy, e de mais ninguém.
 */
export async function migracoesAplicadas(bd: ExecutorSql): Promise<
  Array<{ versao: string; aplicada_em: string }>
> {
  const existe = await bd.query<{ reg: string | null }>(
    "SELECT to_regclass($1) AS reg",
    [TABELA],
  );
  if (!existe.rows[0]?.reg) return [];

  const r = await bd.query<{ versao: string; aplicada_em: string }>(
    `SELECT versao, aplicada_em FROM ${TABELA} ORDER BY versao`,
  );
  return r.rows;
}

/**
 * Quais migrações faltam, sem aplicar nada.
 *
 * Serve para o contêiner recusar subir com esquema atrasado em vez de servir
 * requisição contra um banco que não tem a coluna que o código espera.
 */
export async function migracoesPendentes(
  bd: ExecutorSql,
  migracoes: readonly Migracao[],
): Promise<string[]> {
  const aplicadas = new Set((await migracoesAplicadas(bd)).map((m) => m.versao));
  return [...migracoes]
    .map((m) => m.versao)
    .filter((v) => !aplicadas.has(v))
    .sort();
}
