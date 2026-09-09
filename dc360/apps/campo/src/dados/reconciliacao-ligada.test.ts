/**
 * A reconciliação ligada na atualização da lista.
 *
 * A rota `POST /sincronizacao/pendencias/reconciliar` foi escrita, testada no
 * servidor e marcada como entregue, e NINGUÉM no aplicativo a chamava: o único
 * vestígio dela aqui era um comentário. Duas consequências, e as duas doem no
 * campo:
 *
 * 1. O agente continuava vendo tarefa sumir da lista sem uma palavra. Ele abre
 *    o protocolo pelo caminho antigo e recebe "não está guardada neste
 *    aparelho", que sugere falha de download quando o que houve foi
 *    cancelamento.
 * 2. As lápides de coleta nunca eram apagadas, porque quem as apaga é a
 *    confirmação do servidor. A tabela cresceria por todo o tempo de vida do
 *    aparelho, e a ocorrência confirmada continuaria bloqueada para sempre.
 *
 * O teste que mais importa aqui é o da ORDEM: os ids precisam ser lidos ANTES
 * da substituição da lista. Depois dela, a tarefa que sumiu já sumiu do disco,
 * e o aparelho perguntaria sobre um conjunto do qual justamente as sumidas
 * foram removidas, ou seja, nunca descobriria nada.
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

import { bancoLocal, esquecerConexao } from "./banco-local";
import { coletaDe, marcarColetada } from "./coletas";
import { atualizarPendencias } from "./pendencias";

const SUMIDA = "11111111-1111-4111-8111-111111111111";
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

async function gravarTarefas(ids: string[]) {
  const db = await bancoLocal();
  for (const id of ids) {
    await db.runAsync(
      "INSERT INTO pendencias (id, conteudo, prazo_em) VALUES (?, ?, ?)",
      [id, JSON.stringify(tarefa(id)), null],
    );
  }
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
  mockBaixar.mockReset();
  mockReconciliar.mockReset();
  mockReconciliar.mockResolvedValue([]);
});

describe("a atualização da lista pergunta por que as tarefas sumiram", () => {
  it("pergunta sobre a tarefa que o servidor NÃO devolveu mais", async () => {
    /*
      O coração do item. A tarefa SUMIDA está no disco antes e não vem na
      resposta do servidor. Se os ids fossem lidos depois da substituição, ela
      não estaria na pergunta, e o agente nunca saberia o que houve com ela.
    */
    await gravarTarefas([SUMIDA, CONTINUA]);
    devolveLista([tarefa(CONTINUA)]);

    await atualizarPendencias(TOKEN);

    expect(mockReconciliar).toHaveBeenCalledTimes(1);
    const [token, conhecidas] = mockReconciliar.mock.calls[0];
    expect(token).toBe(TOKEN);
    expect(conhecidas).toContain(SUMIDA);
  });

  it("pergunta também sobre a ocorrência que só tem lápide, e não tarefa", async () => {
    // A lápide é o caso que mais precisa de resposta: é ela que bloqueia a
    // segunda vistoria, e só a confirmação do servidor a solta.
    await marcarColetada({
      ocorrenciaId: SUMIDA,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      protocolo: "2026/000123",
      coletadaEm: "2026-09-09T13:00:00.000Z",
    });
    devolveLista([]);

    await atualizarPendencias(TOKEN);

    expect(mockReconciliar.mock.calls[0][1]).toContain(SUMIDA);
  });

  it("a lápide vem ANTES da tarefa na pergunta, por causa do teto de 200", async () => {
    await gravarTarefas([CONTINUA]);
    await marcarColetada({
      ocorrenciaId: SUMIDA,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      protocolo: "2026/000123",
      coletadaEm: "2026-09-09T13:00:00.000Z",
    });
    devolveLista([]);

    await atualizarPendencias(TOKEN);

    const conhecidas: string[] = mockReconciliar.mock.calls[0][1];
    expect(conhecidas.indexOf(SUMIDA)).toBeLessThan(conhecidas.indexOf(CONTINUA));
  });

  it("não pergunta duas vezes pela ocorrência que é tarefa E lápide", async () => {
    await gravarTarefas([SUMIDA]);
    await marcarColetada({
      ocorrenciaId: SUMIDA,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      protocolo: "2026/000123",
      coletadaEm: "2026-09-09T13:00:00.000Z",
    });
    devolveLista([]);

    await atualizarPendencias(TOKEN);

    const conhecidas: string[] = mockReconciliar.mock.calls[0][1];
    expect(conhecidas.filter((id) => id === SUMIDA)).toHaveLength(1);
  });

  it("não chama a rota quando o aparelho não conhece id nenhum", async () => {
    // Aparelho recém instalado. Perguntar sobre lista vazia é gastar rede do
    // agente para receber uma resposta vazia.
    devolveLista([tarefa(CONTINUA)]);

    await atualizarPendencias(TOKEN);

    expect(mockReconciliar.mock.calls[0][1]).toEqual([]);
  });
});

describe("o que a reconciliação responde é aplicado", () => {
  async function comLapideE(saidas: unknown[]) {
    await marcarColetada({
      ocorrenciaId: SUMIDA,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      protocolo: "2026/000123",
      coletadaEm: "2026-09-09T13:00:00.000Z",
    });
    devolveLista([]);
    mockReconciliar.mockResolvedValue(saidas);
    await atualizarPendencias(TOKEN);
  }

  it("vistoria concluída apaga a lápide: a partir daí a defesa é do servidor", async () => {
    await comLapideE([{ id: SUMIDA, status: "vistoria_concluida", desfecho: "concluida" }]);
    expect(await coletaDe(SUMIDA)).toBeNull();
  });

  it("encerrada MANTÉM a lápide, porque a vistoria não chegou lá", async () => {
    // A coleta deste aparelho continua sendo a única prova de que o agente
    // esteve no local, e a lápide continua impedindo coletar de novo por cima.
    await comLapideE([{ id: SUMIDA, status: "encerrada", desfecho: "encerrada" }]);
    expect(await coletaDe(SUMIDA)).not.toBeNull();
  });

  it("trocou de equipe também mantém", async () => {
    await comLapideE([{ id: SUMIDA, status: "em_campo", desfecho: "outra_equipe" }]);
    expect(await coletaDe(SUMIDA)).not.toBeNull();
  });
});

describe("a reconciliação não pode derrubar a atualização", () => {
  it("rede caindo na reconciliação preserva a lista nova, já gravada", async () => {
    /*
      A lista nova entrou em disco numa transação que já terminou. Propagar o
      erro da reconciliação faria a tela mostrar falha de rede tendo a lista
      certa no aparelho, e o agente atualizaria de novo sem necessidade,
      justamente onde o sinal é ruim.
    */
    await gravarTarefas([SUMIDA]);
    devolveLista([tarefa(CONTINUA)]);
    mockReconciliar.mockRejectedValue(new Error("sem sinal"));

    const lista = await atualizarPendencias(TOKEN);

    expect(lista.map((p) => p.id)).toEqual([CONTINUA]);
  });
});
