import type { ChaveValor } from "./deposito.js";

/**
 * Persistência da fila em SQLite.
 *
 * No aparelho isso é `expo-sqlite`. A escolha vem do levantamento técnico, e a
 * razão é concreta: o outbox precisa sobreviver ao sistema operacional matar o
 * aplicativo em segundo plano para liberar memória, que é rotina em celular de
 * uso institucional, quase sempre modelo de entrada. IndexedDB dentro de
 * WebView tem histórico de ser descartado nessa situação, e coleta descartada
 * significa subir o morro de novo.
 *
 * A interface abaixo é o subconjunto de `expo-sqlite` que a fila usa. Ela
 * existe para que a lógica de persistência seja testável sem aparelho: o teste
 * injeta um banco falso e confere o SQL emitido e o comportamento, o que é
 * exatamente a parte que dá para verificar fora do celular.
 */
/*
  Os parâmetros são OBRIGATÓRIOS nas três consultas, mesmo quando vazios.

  Não é preciosismo de tipo: o `expo-sqlite` declara duas sobrecargas, uma que
  recebe um array e outra variádica, e nenhuma das duas aceita `undefined`. Com
  o parâmetro opcional aqui, o `SQLiteDatabase` do aparelho deixava de ser
  atribuível a esta porta, e o aplicativo não compilava. Exigir o array vazio
  custa quatro caracteres na chamada e faz os dois lados se encaixarem.

  Mutável, e não `readonly`, pela mesma razão: o tipo do `expo-sqlite` recebe
  array mutável, e uma porta mais restritiva que a implementação real não
  protege nada, só impede o encaixe.
*/
/**
 * O que o SQLite aceita como parâmetro, e nada além disso.
 *
 * Era `unknown`, o que parecia generoso e não era: `unknown` não se encaixa no
 * tipo do `expo-sqlite`, e além disso descrevia mal a realidade. Objeto não se
 * grava em coluna de SQLite; ou vira texto antes, ou não entra.
 */
export type ValorSqlite = string | number | boolean | null | Uint8Array;

export type BancoSqlite = {
  execAsync(sql: string): Promise<unknown>;
  runAsync(sql: string, params: ValorSqlite[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: ValorSqlite[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: ValorSqlite[]): Promise<T | null>;
};

const TABELA = "fila_sincronizacao";

/**
 * Prepara a tabela. Idempotente: o aplicativo chama a cada abertura, e não
 * existe passo de migração no aparelho para lembrar de rodar.
 */
export async function prepararSqlite(db: BancoSqlite): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS ${TABELA} (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
  `);
}

export function lojaSqlite(db: BancoSqlite): ChaveValor {
  return {
    async ler(chave) {
      const linha = await db.getFirstAsync<{ valor: string }>(
        `SELECT valor FROM ${TABELA} WHERE chave = ?`,
        [chave],
      );
      return linha?.valor ?? null;
    },

    async escrever(chave, valor) {
      /*
        `INSERT ... ON CONFLICT DO UPDATE` e não "apaga e insere".

        A fila grava a cada foto enviada, e um par apagar/inserir deixa uma
        janela em que o item não existe. Se o sistema matar o aplicativo
        exatamente ali, a coleta some. Com upsert, a linha nunca deixa de
        existir.
      */
      await db.runAsync(
        `INSERT INTO ${TABELA} (chave, valor, atualizado_em) VALUES (?, ?, ?)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor,
                                          atualizado_em = excluded.atualizado_em`,
        [chave, valor, new Date().toISOString()],
      );
    },

    async remover(chave) {
      await db.runAsync(`DELETE FROM ${TABELA} WHERE chave = ?`, [chave]);
    },

    async chaves() {
      const linhas = await db.getAllAsync<{ chave: string }>(
        // Ordem estável: sem ela, a fila poderia mudar de ordem entre
        // aberturas do aplicativo, e a ordem de coleta é a ordem do laudo.
        `SELECT chave FROM ${TABELA} ORDER BY atualizado_em, chave`,
        [],
      );
      return linhas.map((l) => l.chave);
    },
  };
}
