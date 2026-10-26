/**
 * Uma fila só por aparelho, mesmo quando várias telas a pedem ao mesmo tempo
 * (V2-F00-E06, correção 2).
 *
 * O defeito que a rodada 2 da validação achou no emulador Android: `obterFila`
 * conferia `if (fila) return fila;` e só DEPOIS esperava o banco abrir. Na
 * abertura do aplicativo a faixa de sincronização, a barra de abas, o laço de
 * fundo do layout e a tela da fila a chamam no mesmo instante; todas passavam
 * pela conferência com a variável ainda nula, cada uma criava a sua fila, e
 * cada fila tem a sua pausa, a sua marca de cancelamento e o seu `drenando`.
 * A pausa da sessão nascia numa instância que ninguém mais escutava: a faixa
 * global mostrava "Tudo sincronizado" sobre uma coleta parada, e o
 * `cancelar()` da troca de conta só alcançava a instância do layout.
 *
 * Os outros testes trocam `obterFila` por um dublê de instância única, que é
 * exatamente o que esconde isto. Este chama a de produção, em paralelo.
 */

import { DatabaseSync } from "node:sqlite";

let mockBanco: DatabaseSync | null = null;
let mockAberturas = 0;
let mockFalharAoAbrir = false;

function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    mockAberturas += 1;
    // O banco real demora para abrir: é aqui que a corrida acontece.
    await new Promise((r) => setTimeout(r, 5));
    if (mockFalharAoAbrir) throw new Error("banco travado");
    const db = mockAbrir();
    return {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, params: unknown[] = []) { db.prepare(sql).run(...params); },
      async getAllAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).all(...params); },
      async getFirstAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).get(...params) ?? null; },
    };
  },
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documentos" },
  File: class {},
  Directory: class { list() { return []; } },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test/" } } },
}));

import type { Identidade } from "./api";

const quem = { atual: null as Identidade | null };

beforeEach(() => {
  mockBanco = null;
  mockAberturas = 0;
  mockFalharAoAbrir = false;
  // Cada caso começa com o módulo, a fila e o banco do zero.
  jest.resetModules();
});

/** O módulo recém-carregado, depois do `resetModules` do `beforeEach`. */
function carregar(): Promise<typeof import("./fila")> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return Promise.resolve(require("./fila") as typeof import("./fila"));
}

describe("obterFila sob chamadas simultâneas", () => {
  it("a base do aplicativo chega ao transporte da fila com /v1 e sem //v1", async () => {
    const buscarOriginal = globalThis.fetch;
    const identidadeAnterior = quem.atual;
    try {
      quem.atual = {
        usuarioId: "agente-ana", nome: "Ana Ribeiro", organizacaoId: "serra-alta",
        matricula: "123", papel: "agente_campo", organizacaoNome: "Defesa Civil",
        municipio: "Serra Alta", uf: "SC",
      };
      const buscar = jest.fn(async () => ({
        ok: false, status: 401, json: async () => ({ erro: "sessao_encerrada" }),
      }));
      globalThis.fetch = buscar as unknown as typeof fetch;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { enderecoDaApi } = require("./api") as typeof import("./api");
      const { obterFila } = await carregar();
      const fila = await obterFila(enderecoDaApi(), async () => "token", () => quem.atual);
      const instante = new Date().toISOString();
      await fila.enfileirar({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", coletadaEm: instante,
        vistoria: {
          checklist: [], fotos: [], gpsPrecisaoMetros: null,
          assinanteNome: "Moradora", assinaturaChave: "assinatura.png", coletadaEm: instante,
        },
      }, { protocolo: "000001/2026" });
      const antes = await fila.itens();
      expect(await fila.drenar()).toMatchObject({ paradaPor: "sessao_encerrada" });
      expect(buscar).toHaveBeenCalledWith(
        "https://api.exemplo.test/v1/sincronizacao/vistoria", expect.anything(),
      );
      expect(await fila.itens()).toEqual(antes);
    } finally {
      globalThis.fetch = buscarOriginal;
      quem.atual = identidadeAnterior;
    }
  });

  it("quatro chamadas ao mesmo tempo devolvem a MESMA instância", async () => {
    const { obterFila } = await carregar();

    // Sem `await` entre elas: é a abertura do aplicativo, quatro telas de uma vez.
    const filas = await Promise.all([
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
    ]);

    expect(filas[1]).toBe(filas[0]);
    expect(filas[2]).toBe(filas[0]);
    expect(filas[3]).toBe(filas[0]);
  });

  it("o banco local é aberto uma vez só", async () => {
    const { obterFila } = await carregar();

    await Promise.all([
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
    ]);

    expect(mockAberturas).toBe(1);
  });

  it("a chamada seguinte, depois de a fila existir, também devolve a mesma", async () => {
    const { obterFila } = await carregar();

    const [primeira] = await Promise.all([
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
    ]);
    const depois = await obterFila("http://api.exemplo", async () => "outro", () => quem.atual);

    expect(depois).toBe(primeira);
  });

  it("se abrir o banco falhar, a falha não fica gravada: a chamada seguinte tenta de novo", async () => {
    /*
      Memorizar a PROMESSA tem um preço: uma promessa rejeitada memorizada
      envenenaria o aplicativo até ele ser fechado. A falha é de quem pediu
      naquela hora (disco cheio, banco travado); a próxima tentativa recomeça.
    */
    const { obterFila } = await carregar();
    mockFalharAoAbrir = true;
    await expect(
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
    ).rejects.toThrow(/banco travado/);

    mockFalharAoAbrir = false;
    /*
      `bancoLocal()` guarda a própria promessa, rejeitada inclusive (limite
      anotado no relatório da correção 2): o teste a esquece para provar só o
      que é de `obterFila`, que não pode guardar a falha por conta própria.
    */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("./banco-local") as typeof import("./banco-local")).esquecerConexao();
    const [a, b] = await Promise.all([
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
      obterFila("http://api.exemplo", async () => "token", () => quem.atual),
    ]);

    expect(a).toBeDefined();
    expect(b).toBe(a);
  });
});
