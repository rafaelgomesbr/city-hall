import * as SQLite from "expo-sqlite";

/**
 * A conexão única com o banco local do aparelho.
 *
 * Existe porque três módulos escrevem no mesmo arquivo, e antes cada um abria
 * a própria conexão: `rascunho.ts` grava a vistoria a cada toque, `fila.ts`
 * cuida do envio, e `pendencias.ts` troca a lista inteira de tarefas dentro de
 * uma transação. Com conexões separadas, o SQLite trata cada uma como um
 * processo concorrente disputando o mesmo arquivo.
 *
 * O defeito que isso causava foi visto em aparelho, e só em aparelho:
 *
 *   Error: Call to function 'NativeStatement.runAsync' has been rejected.
 *
 * O momento exato é o pior possível. O sinal volta, `pendencias.ts` abre uma
 * transação para trocar a lista de tarefas, e o agente, que está no meio da
 * vistoria, toca em qualquer coisa que grave o rascunho. A segunda escrita
 * bate no bloqueio da primeira e é recusada NA HORA, porque o SQLite não
 * espera por padrão. A promessa não era tratada em lugar nenhum, então em
 * desenvolvimento aparece uma tarja vermelha e, num binário de produção, o
 * toque simplesmente não grava e ninguém fica sabendo.
 *
 * Nada disso aparecia na suíte: os testes injetam um banco falso, que não tem
 * bloqueio nenhum. É bug de concorrência real, e concorrência real exige
 * aparelho real.
 *
 * As duas defesas, e as duas importam:
 *
 * 1. Uma conexão só. Dentro da mesma conexão o SQLite serializa as escritas em
 *    vez de recusá-las.
 * 2. `busy_timeout`. Ainda existe concorrência de fora (o processo de
 *    sincronização em segundo plano), e sem isto qualquer disputa vira erro
 *    imediato. Cinco segundos é muito mais do que qualquer escrita daqui leva,
 *    e é muito menos do que o agente levaria para desistir e refazer a
 *    vistoria.
 */

let conexao: Promise<SQLite.SQLiteDatabase> | null = null;

async function abrirUmaVez(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("dc360-campo.db");

  /*
    WAL: leitura não bloqueia escrita. A tela lê o rascunho enquanto a fila
    escreve na mesma base, e sem isto uma das duas trava esperando a outra,
    em aparelho de entrada, no meio da coleta.
  */
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA busy_timeout = 5000;");

  /*
    Todo o esquema local, num lugar só.

    Antes cada módulo criava a própria tabela na própria conexão, o que
    funcionava mas espalhava o esquema por três arquivos e tornava impossível
    responder "o que existe neste banco" sem abrir os três.
  */
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS rascunhos (
      ocorrencia_id TEXT PRIMARY KEY,
      conteudo      TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pendencias (
      id       TEXT PRIMARY KEY,
      conteudo TEXT NOT NULL,
      prazo_em TEXT
    );
    CREATE TABLE IF NOT EXISTS marcas (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);

  return db;
}

/**
 * A conexão, criada na primeira chamada e reusada em todas as outras.
 *
 * Guarda a PROMESSA, e não o banco já resolvido. A diferença importa: duas
 * chamadas simultâneas na montagem da tela receberiam `null` do cache e
 * abririam duas conexões, que é exatamente o problema que este arquivo existe
 * para resolver.
 */
export function bancoLocal(): Promise<SQLite.SQLiteDatabase> {
  conexao ??= abrirUmaVez();
  return conexao;
}

/** Só para teste e para o logout, que apaga a base inteira. */
export function esquecerConexao(): void {
  conexao = null;
}
