/**
 * O logout no aparelho de plantão compartilhado, e o que ele NÃO pode levar
 * junto.
 *
 * O diálogo de saída promete, com todas as letras, que as coletas ainda não
 * enviadas continuam guardadas no aparelho. A limpeza do logout desmentia essa
 * promessa em silêncio: ela apagava toda `assinatura-<carimbo>.png` do diretório
 * de documentos sem olhar a fila.
 *
 * A sequência inteira: o agente coleta no morro, a moradora assina no dedo, ele
 * sai da conta no fim do turno, o PNG some, o item continua na fila apontando
 * para um arquivo que não existe mais, e no próximo login o envio estoura em
 * arquivo inexistente ANTES de mandar o envelope. A vistoria inteira (checklist,
 * GPS, observações, assinatura) morria por causa de uma linha de limpeza, sem
 * nada na tela dizendo isso.
 *
 * O que a limpeza continua tendo que fazer: apagar o arquivo que já não está em
 * coleta nenhuma. Ele é lixo com dado de família dentro, num aparelho que passa
 * de turno em turno.
 */

import { DatabaseSync } from "node:sqlite";

let mockBanco: DatabaseSync | null = null;

function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const db = mockAbrir();
    return {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...params);
      },
      async getAllAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).all(...params);
      },
      async getFirstAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).get(...params) ?? null;
      },
    };
  },
}));

/** O diretório de documentos do aparelho, com o que cada teste põe nele. */
const mockNoDisco = new Set<string>();

jest.mock("expo-file-system", () => {
  class Arquivo {
    name: string;
    constructor(nome: string) { this.name = nome; }
    delete(): void { mockNoDisco.delete(this.name); }
  }
  return {
    Paths: { document: "file:///documentos" },
    File: Arquivo,
    Directory: class {
      list() { return [...mockNoDisco].map((n) => new Arquivo(n)); }
    },
  };
});

import { apagarDadosLocais, bancoLocal, esquecerConexao } from "./banco-local";

const ASSINATURA_NA_FILA = "assinatura-1757000000000.png";
const FOTO_NA_FILA = "foto-1757000000000-0.jpg";
const ASSINATURA_ORFA = "assinatura-1600000000000.png";

/** Põe na fila um item que referencia os arquivos indicados. */
async function comColetaNaFila(arquivos: string[]): Promise<void> {
  const db = await bancoLocal();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS fila_sincronizacao (
      chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado_em TEXT NOT NULL
    );
  `);
  await db.runAsync(
    "INSERT INTO fila_sincronizacao (chave, valor, atualizado_em) VALUES (?, ?, ?)",
    [
      "dc360:fila:coleta-1",
      JSON.stringify({
        id: "coleta-1",
        estado: "pendente",
        fotos: arquivos.map((nome) => ({ uriLocal: `file:///documentos/${nome}` })),
      }),
      "2026-09-09T20:00:00.000Z",
    ],
  );
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
  mockNoDisco.clear();
});

describe("sair da conta com coleta esperando envio", () => {
  it("NÃO apaga a assinatura que a coleta na fila ainda usa", async () => {
    mockNoDisco.add(ASSINATURA_NA_FILA);
    await comColetaNaFila([ASSINATURA_NA_FILA]);

    await apagarDadosLocais();

    expect([...mockNoDisco]).toContain(ASSINATURA_NA_FILA);
  });

  it("NÃO apaga a foto que a coleta na fila ainda usa", async () => {
    mockNoDisco.add(FOTO_NA_FILA);
    await comColetaNaFila([FOTO_NA_FILA]);

    await apagarDadosLocais();

    expect([...mockNoDisco]).toContain(FOTO_NA_FILA);
  });

  it("apaga o arquivo que não está em coleta nenhuma", async () => {
    /*
      A parte da limpeza que continua valendo: arquivo de coleta já confirmada é
      lixo com dado de família dentro, e o aparelho passa de turno em turno.
    */
    mockNoDisco.add(ASSINATURA_NA_FILA);
    mockNoDisco.add(ASSINATURA_ORFA);
    await comColetaNaFila([ASSINATURA_NA_FILA]);

    await apagarDadosLocais();

    expect([...mockNoDisco]).toEqual([ASSINATURA_NA_FILA]);
  });

  it("com a fila ilegível, prefere deixar o arquivo a destruir prova", async () => {
    /*
      A escolha é assimétrica de propósito: um PNG a mais no disco por um turno
      é reversível no próximo logout; a assinatura de uma vistoria que ainda não
      subiu não é, porque a moradora assinou uma vez, no morro.
    */
    mockNoDisco.add(ASSINATURA_ORFA);
    // Sem a tabela da fila: aparelho que nunca chegou a sincronizar.

    await apagarDadosLocais();

    expect([...mockNoDisco]).toEqual([ASSINATURA_ORFA]);
  });
});
