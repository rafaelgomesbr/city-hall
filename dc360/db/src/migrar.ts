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

const TABELA = "schema_migracoes";

function impressao(sql: string): string {
  /*
    Espaço em branco é normalizado antes do hash.

    Sem isso, reindentar um comentário ou trocar a quebra de linha de LF para
    CRLF (o que acontece sozinho ao clonar o repositório no Windows) marcaria a
    migração como alterada e travaria todo deploy, por nada.
  */
  return createHash("sha256").update(sql.replace(/\s+/g, " ").trim()).digest("hex");
}

async function garantirTabela(bd: ExecutorSql): Promise<void> {
  await bd.exec(`
    CREATE TABLE IF NOT EXISTS ${TABELA} (
      versao      text PRIMARY KEY,
      impressao   text NOT NULL,
      aplicada_em timestamptz NOT NULL DEFAULT now(),
      duracao_ms  integer
    );
  `);
}

export async function aplicarMigracoes(
  bd: ExecutorSql,
  migracoes: readonly Migracao[],
  opcoes: { registrar?: (mensagem: string) => void } = {},
): Promise<ResultadoMigracao> {
  const registrar = opcoes.registrar ?? (() => undefined);

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
