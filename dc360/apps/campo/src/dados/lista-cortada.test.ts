/**
 * A lista de tarefas cortada pelo servidor, e o aviso que impede a mentira.
 *
 * A rota corta a lista num teto para o aparelho não baixar tudo no 3G do morro,
 * e devolve `teto` e `truncada` junto. O cliente jogava os dois fora: lia só
 * `{ itens }`.
 *
 * O efeito é o defeito mais perigoso desta tela. O agente vê uma lista que
 * parece completa, sobe o morro confiando nela, e as tarefas que ficaram de fora
 * simplesmente não existem para ele. Não há sintoma: nada pisca, nada falha, e
 * quem olha o painel vê as tarefas lá. Cortar é aceitável; cortar calado não é.
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
      async withTransactionAsync(corpo: () => Promise<void>) {
        db.exec("BEGIN");
        try { await corpo(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    };
  },
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "/documentos" },
  Directory: class { list() { return []; } },
  File: class {},
}));

const mockBaixar = jest.fn();
const mockReconciliar = jest.fn();

jest.mock("./api", () => ({
  __esModule: true,
  TETO_DE_RECONCILIACAO: 200,
  baixarPendencias: (...a: unknown[]) => mockBaixar(...a),
  reconciliarPendencias: (...a: unknown[]) => mockReconciliar(...a),
  baixarMeuTrabalho: jest.fn(),
}));

import { esquecerConexao } from "./banco-local";
import { atualizarPendencias, tetoAtingido } from "./pendencias";

const CONTINUA = "22222222-2222-4222-8222-222222222222";
const TOKEN = "token-de-teste";

/*
  A rota devolve ENVELOPE, e não a lista crua: `{ itens, teto, truncada }`. O
  aparelho precisa dos três porque cortar a lista calado faria o agente subir o
  morro achando que viu todas as tarefas dele.
*/
function devolveLista(itens: unknown[]) {
  mockBaixar.mockResolvedValue({ itens, teto: 200, truncada: false });
}

function tarefa(id: string) {
  return { id, protocolo: "2026/000123", tipo: "deslizamento", prazo_em: null };
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
  mockBaixar.mockReset();
  mockReconciliar.mockReset();
  mockReconciliar.mockResolvedValue([]);
});

describe("a marca de lista cortada", () => {
  it("guarda o teto quando o servidor diz que cortou", async () => {
    mockBaixar.mockResolvedValue({ itens: [tarefa(CONTINUA)], teto: 200, truncada: true });
    await atualizarPendencias(TOKEN);
    expect(await tetoAtingido()).toBe(200);
  });

  it("não guarda nada quando a lista veio inteira", async () => {
    devolveLista([tarefa(CONTINUA)]);
    await atualizarPendencias(TOKEN);
    expect(await tetoAtingido()).toBeNull();
  });

  it("a marca é APAGADA quando a baixa seguinte vem inteira", async () => {
    /*
      Sem isto o aviso ficaria pendurado para sempre depois de uma única baixa
      cortada, e aviso que nunca sai deixa de ser lido. A marca descreve a lista
      que está no disco AGORA, não o histórico do aparelho.
    */
    mockBaixar.mockResolvedValue({ itens: [tarefa(CONTINUA)], teto: 200, truncada: true });
    await atualizarPendencias(TOKEN);
    expect(await tetoAtingido()).toBe(200);

    devolveLista([tarefa(CONTINUA)]);
    await atualizarPendencias(TOKEN);
    expect(await tetoAtingido()).toBeNull();
  });

  it("servidor antigo, sem os campos novos, não faz a tela mentir para o outro lado", async () => {
    // Resposta sem `teto` nem `truncada` significa "não sei", e não "cortei".
    // Inventar corte produziria um aviso falso, que é o mesmo tipo de erro na
    // direção contrária.
    mockBaixar.mockResolvedValue({ itens: [tarefa(CONTINUA)] });
    await atualizarPendencias(TOKEN);
    expect(await tetoAtingido()).toBeNull();
  });
});
