import { baixarPendencias } from "./api";

/**
 * O que o cliente HTTP faz com `teto` e `truncada`.
 *
 * A rota corta a lista de tarefas num teto para o aparelho nao baixar tudo no
 * 3G do morro, e diz que cortou. O cliente lia so `{ itens }` e jogava os dois
 * campos fora, e o resultado e o defeito mais silencioso desta tela: o agente ve
 * uma lista que parece completa, sobe confiando nela, e as tarefas que ficaram
 * de fora simplesmente nao existem para ele. Nada pisca, nada falha, e quem olha
 * o painel ve as tarefas la.
 *
 * Este arquivo cobre a leitura da resposta. A gravacao da marca no disco e o
 * aviso na tela sao de `lista-cortada.test.ts`.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test" } } },
}));

function respondendo(corpo: unknown) {
  globalThis.fetch = jest.fn(async () => ({
    status: 200,
    ok: true,
    json: async () => corpo,
  })) as unknown as typeof fetch;
}

const TAREFA = { id: "1", protocolo: "2026/000001", tipo: "deslizamento", prazo_em: null };

afterEach(() => { jest.restoreAllMocks(); });

describe("a lista de tarefas que veio cortada", () => {
  it("carrega a marca de corte, em vez de descartar", async () => {
    respondendo({ itens: [TAREFA], teto: 200, truncada: true });
    const lista = await baixarPendencias("token");
    expect(lista).toMatchObject({ teto: 200, truncada: true });
    expect(lista.itens).toHaveLength(1);
  });

  it("lista inteira nao vira aviso", async () => {
    respondendo({ itens: [TAREFA], teto: 200, truncada: false });
    expect((await baixarPendencias("token")).truncada).toBe(false);
  });

  it("servidor antigo, sem os campos, nao inventa corte", async () => {
    /*
      Resposta sem `teto` nem `truncada` significa "nao sei", e nao "cortei".
      Inventar corte produziria um aviso falso na tela do agente, que e o mesmo
      erro na direcao contraria: ele passaria a desconfiar de uma lista completa.
    */
    respondendo({ itens: [TAREFA] });
    const lista = await baixarPendencias("token");
    expect(lista.truncada).toBe(false);
    expect(lista.teto).toBe(1);
  });
});
