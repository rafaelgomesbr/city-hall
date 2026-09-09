/**
 * O catálogo de órgãos no disco do aparelho, e por que ele não é otimização.
 *
 * O checklist da vistoria tem um item OBRIGATÓRIO que agora se desdobra: "é
 * necessário acionar outro órgão" passou a pedir QUAIS. Se a lista de órgãos
 * viesse da rede no momento da pergunta, esse item ficaria sem resposta possível
 * exatamente sem sinal, que é a condição normal de trabalho deste aplicativo e o
 * princípio que governa o produto inteiro. Uma vistoria não pode ficar
 * impossível porque o morro não tem 3G.
 *
 * Por isso o catálogo desce JUNTO com a lista de tarefas, na mesma transação, e
 * a tela lê do disco. Estes casos travam as três coisas que fazem isso valer:
 * gravar junto, não apagar o que já existe quando o servidor não diz nada, e
 * devolver lista vazia sem quebrar para o aparelho que nunca sincronizou.
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
import { atualizarPendencias, orgaosGuardados, pendenciasGuardadas } from "./pendencias";

const TOKEN = "token-de-teste";
const BOMBEIROS = { id: "org-1", nome: "Corpo de Bombeiros", sigla: "CBM" };
const ENERGIA = { id: "org-2", nome: "Concessionária de energia", sigla: null };

function tarefa(id: string) {
  return { id, protocolo: "2026/000123", tipo: "deslizamento", prazo_em: null };
}

/** A resposta da rota, com o catálogo dentro. Cada caso ajusta o que precisa. */
function respondeCom(orgaos: unknown, itens: unknown[] = [tarefa("oc-1")]) {
  mockBaixar.mockResolvedValue({ itens, teto: 200, truncada: false, orgaos });
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
  mockBaixar.mockReset();
  mockReconciliar.mockReset();
  mockReconciliar.mockResolvedValue([]);
});

describe("o catálogo desce junto com as tarefas", () => {
  it("guarda o que o servidor mandou, para a tela ler do disco", async () => {
    respondeCom([BOMBEIROS, ENERGIA]);
    await atualizarPendencias(TOKEN);

    expect(await orgaosGuardados()).toEqual([BOMBEIROS, ENERGIA]);
  });

  it("entra na MESMA transação da lista de tarefas", async () => {
    /*
      A prova é pelo desfecho de uma falha no meio: a gravação da lista estoura,
      e o catálogo que estava na mesma transação não pode ter ficado. Se as duas
      escritas fossem separadas, o aparelho terminaria com o catálogo novo e a
      lista velha, que é o par que ninguém conferiu e que a tela apresenta como
      se fosse coerente.
    */
    respondeCom([BOMBEIROS]);
    await atualizarPendencias(TOKEN);
    expect(await orgaosGuardados()).toEqual([BOMBEIROS]);

    // Tarefa sem `id`: a inserção da lista falha dentro da transação.
    respondeCom([ENERGIA], [{ protocolo: "2026/000999", prazo_em: null }]);
    await expect(atualizarPendencias(TOKEN)).rejects.toBeTruthy();

    // Catálogo novo com lista velha significaria escritas em transações
    // separadas, e é esse par incoerente que a tela apresentaria como se fosse
    // o retrato de um instante só.
    expect(await orgaosGuardados()).toEqual([BOMBEIROS]);
    expect((await pendenciasGuardadas()).map((p) => p.id)).toEqual(["oc-1"]);
  });

  it("substitui por completo, e não acumula órgão que saiu do cadastro", async () => {
    // Órgão desativado no município precisa sumir do aparelho. Acumular deixaria
    // o agente encaminhando para quem não recebe mais.
    respondeCom([BOMBEIROS, ENERGIA]);
    await atualizarPendencias(TOKEN);

    respondeCom([BOMBEIROS]);
    await atualizarPendencias(TOKEN);

    expect(await orgaosGuardados()).toEqual([BOMBEIROS]);
  });

  it("município sem órgão cadastrado esvazia o catálogo, e isso é resposta", async () => {
    // Lista vazia é o município dizendo que não cadastrou nada. Diferente de
    // não dizer: aqui o disco passa a refletir a verdade do cadastro.
    respondeCom([BOMBEIROS]);
    await atualizarPendencias(TOKEN);

    respondeCom([]);
    await atualizarPendencias(TOKEN);

    expect(await orgaosGuardados()).toEqual([]);
  });
});

describe("o servidor que não fala de catálogo", () => {
  it("não apaga o catálogo que o aparelho já tem", async () => {
    /*
      O defeito que isto trava: com o campo ausente tratado como lista vazia,
      toda sincronização contra um servidor que ainda não manda o catálogo
      apagaria a lista do aparelho. O agente perderia os órgãos JUSTAMENTE por
      ter sincronizado, que é o oposto do que sincronizar significa, e descobriria
      isso no morro, na hora de responder o item obrigatório.
    */
    respondeCom([BOMBEIROS, ENERGIA]);
    await atualizarPendencias(TOKEN);

    mockBaixar.mockResolvedValue({ itens: [tarefa("oc-1")], teto: 200, truncada: false });
    await atualizarPendencias(TOKEN);

    expect(await orgaosGuardados()).toEqual([BOMBEIROS, ENERGIA]);
  });

  it("não derruba a atualização da lista de tarefas", async () => {
    // A lista precisa entrar do mesmo jeito: ela é o que o agente sobe o morro
    // para usar, e um catálogo ausente não pode custar o dia de trabalho.
    mockBaixar.mockResolvedValue({ itens: [tarefa("oc-9")], teto: 200, truncada: false });
    await atualizarPendencias(TOKEN);

    expect((await pendenciasGuardadas()).map((p) => p.id)).toEqual(["oc-9"]);
  });
});

describe("o aparelho que nunca sincronizou", () => {
  it("devolve lista vazia em vez de quebrar a tela de vistoria", async () => {
    // É o caso mais comum de catálogo vazio, e é exatamente onde o campo livre
    // da seleção precisa bastar sozinho para concluir a vistoria.
    expect(await orgaosGuardados()).toEqual([]);
  });
});
