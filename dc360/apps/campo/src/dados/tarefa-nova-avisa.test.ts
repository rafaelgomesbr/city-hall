/**
 * A tarefa nova avisa com o aplicativo ABERTO.
 *
 * O pedido, na letra de quem paga: o celular do agente de campo deve
 * obrigatoriamente ser notificado de que recebeu uma nova ocorrência. O push
 * cobre o aplicativo fechado. Com o aplicativo aberto, quem descobre a tarefa
 * nova é a atualização periódica da lista (`atualizarPendencias`), e é ELA que
 * precisa avisar: comparar a lista que chegou com a que estava no disco, por
 * id, e dizer a quem estiver ouvindo quais entraram.
 *
 * Fica na camada de dados, e não na tela, por duas razões: a tela de tarefas
 * não é o único lugar que chama a atualização (a vistoria também baixa a lista
 * para abrir uma tarefa que ainda não estava no aparelho), e regra que mora na
 * tela não tem teste sem montar a tela.
 *
 * ## As três regras, e o que cada uma evita
 *
 * 1. **A primeira carga não avisa.** Aparelho recém-entrado, lista vazia, o
 *    servidor devolve o dia inteiro: doze avisos e doze toques de uma vez não
 *    são novidade, são o turno chegando, e ensinariam o agente a calar o
 *    aplicativo no primeiro dia.
 * 2. **Id já visto não avisa de novo**, nem depois de fechar e abrir o
 *    aplicativo: a memória do que já foi visto fica em DISCO (`marcas`), e
 *    memória só de processo avisaria o mesmo despacho a cada abertura.
 * 3. **O que o push já contou não conta de novo.** Quando um aviso de tarefa
 *    nova chega pela Apple ou pelo Google, o provedor marca a ocorrência como
 *    vista; a atualização seguinte a encontra na lista e não toca outra vez.
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

jest.mock("./api", () => ({
  __esModule: true,
  TETO_DE_RECONCILIACAO: 200,
  baixarPendencias: (...a: unknown[]) => mockBaixar(...a),
  reconciliarPendencias: jest.fn(async () => []),
  baixarMeuTrabalho: jest.fn(),
}));

import { apagarDadosLocais, esquecerConexao } from "./banco-local";
import {
  TETO_DE_IDS_VISTOS, aoChegarTarefaNova, atualizarPendencias, marcarTarefasVistas,
  type TarefaNova,
} from "./pendencias";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const TOKEN = "token-de-teste";

function tarefa(id: string, severidade: string | null = "media") {
  return {
    id, protocolo: "2026/000123", tipo: "deslizamento", severidade,
    endereco: "Servidão Boa Esperança, 148", prazo_em: null,
  };
}

function servidorDevolve(ids: string[]) {
  mockBaixar.mockResolvedValue({ itens: ids.map((id) => tarefa(id)), teto: 200, truncada: false });
}

/** Coleta o que os ouvintes receberam, chamada a chamada. */
function ouvir() {
  const chamadas: TarefaNova[][] = [];
  const parar = aoChegarTarefaNova((novas) => { chamadas.push([...novas]); });
  return { chamadas, parar };
}

let desligar: (() => void) | null = null;

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
  mockBaixar.mockReset();
});

afterEach(() => {
  desligar?.();
  desligar = null;
});

describe("quando avisa", () => {
  it("NÃO avisa na primeira carga: é o dia inteiro chegando, não novidade", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([A, B]);

    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([]);
  });

  it("avisa quando a atualização traz um id que não estava na lista anterior", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);

    servidorDevolve([A, B, C]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([[{ id: C, severidade: "media" }]]);
  });

  it("leva a severidade da tarefa, e só ela: nem endereço nem protocolo saem daqui", async () => {
    /*
      O ouvinte vai montar uma notificação. Entregar a pendência inteira a ele
      seria convidar o endereço para a tela bloqueada; o que sai é o mínimo
      que o aviso local precisa, e existe teste do lado de lá que confere.
    */
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([]);
    await atualizarPendencias(TOKEN);

    mockBaixar.mockResolvedValue({ itens: [tarefa(A, "critica")], teto: 200, truncada: false });
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([[{ id: A, severidade: "critica" }]]);
    expect(Object.keys(chamadas[0]![0]!).sort()).toEqual(["id", "severidade"]);
  });

  it("avisa uma vez por atualização, com todas as que entraram juntas", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([]);
    await atualizarPendencias(TOKEN);

    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.map((t) => t.id)).toEqual([A, B]);
  });

  it("uma lista que ficou vazia e depois recebe uma tarefa avisa: vazia não é primeira carga", async () => {
    // Agente sem tarefa nenhuma na manhã, e a coordenação despacha às dez. É
    // exatamente o caso em que o aviso mais importa.
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([]);
    await atualizarPendencias(TOKEN);

    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([[{ id: A, severidade: "media" }]]);
  });
});

describe("quando NÃO avisa de novo", () => {
  it("não avisa o id que já estava na lista", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);
    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);

    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);
    servidorDevolve([B, A]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([[{ id: B, severidade: "media" }]]);
  });

  it("não avisa de novo depois de fechar e abrir o aplicativo: a memória está no disco", async () => {
    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);
    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);

    /*
      "Fechar e abrir": a conexão é esquecida, o banco em memória continua,
      que é o disco do aparelho. Se os ids vistos morassem numa variável do
      módulo, este caso reprovaria, porque `jest.isolateModules` abaixo
      recarrega o módulo do zero.
    */
    esquecerConexao();
    let recarregado: typeof import("./pendencias") | null = null;
    jest.isolateModules(() => {
      recarregado = require("./pendencias") as typeof import("./pendencias");
    });
    if (!recarregado) throw new Error("o módulo não recarregou");
    const modulo: typeof import("./pendencias") = recarregado;

    const chamadas: TarefaNova[][] = [];
    const parar = modulo.aoChegarTarefaNova((novas) => { chamadas.push([...novas]); });
    servidorDevolve([A, B]);
    await modulo.atualizarPendencias(TOKEN);
    parar();

    expect(chamadas).toEqual([]);
  });

  it("não avisa a tarefa que o push já contou", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);

    // O provedor de push marca a ocorrência como vista quando o aviso da Apple
    // ou do Google chega. A atualização seguinte a encontra e fica quieta.
    await marcarTarefasVistas([B]);
    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([]);
  });

  it("marcar como vista ANTES da primeira carga não cria memória: a primeira carga continua calada", async () => {
    /*
      Push que chega antes de a lista ser baixada pela primeira vez (aparelho
      acabou de entrar). Se a marca nascesse aqui com um id só, a primeira
      carga acharia "memória existente" e avisaria todas as OUTRAS tarefas do
      dia, que é o que a regra 1 proíbe.
    */
    const { chamadas, parar } = ouvir();
    desligar = parar;
    await marcarTarefasVistas([A]);
    servidorDevolve([A, B, C]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([]);
  });

  it("depois do logout a memória some, e a primeira carga do próximo agente é calada", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);

    await apagarDadosLocais();

    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([]);
  });
});

describe("o que sai e volta", () => {
  /*
    A REGRA É A DO SERVIDOR, e está escrita na migração 042: um aparelho
    recebe o aviso de tarefa nova de uma ocorrência UMA vez. A tarefa que vai
    da equipe Alfa para a Bravo e VOLTA para a Alfa, ou que a Alfa devolveu e
    a coordenação redespachou para a Alfa, não gera push de novo, porque a
    unicidade em `notificacoes_enviadas` é por aparelho e ocorrência.

    Até 15/09/2026 o aplicativo decidia o contrário (a memória guardava só a
    ÚLTIMA lista, e a tarefa que voltava era novidade): com o aplicativo
    aberto tocava, fechado não tocava. Dois comportamentos para o mesmo fato,
    decididos por onde o telefone estava, é pior do que qualquer um dos dois.
    Alinhar o aplicativo é barato (a memória passa a acumular, com teto);
    alinhar o servidor exigiria trocar a chave de unicidade por uma que conte
    despachos, com coluna nova. Fica a barata, e a limitação declarada nos
    dois lugares: a tarefa que sai e volta para a MESMA equipe não avisa de
    novo em canal nenhum. Ela continua na lista, e o agente a vê ao abrir.
  */
  it("a tarefa que saiu e voltou NÃO avisa outra vez: a memória acumula, como a do servidor", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);
    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);
    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([]);
  });

  it("e uma tarefa que nunca passou por aqui continua avisando", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);
    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);
    servidorDevolve([A, B, C]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([[{ id: C, severidade: "media" }]]);
  });

  /*
    A memória acumula, então precisa de teto, e o teto NUNCA pode cortar a
    lista atual: uma tarefa que está na tela e sai da memória voltaria como
    "novidade" na atualização seguinte, sem despacho nenhum. O que cai é o
    mais antigo do que já saiu da lista.
  */
  it("o teto da memória corta o que já saiu da lista, nunca o que está nela", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    const muitas = Array.from({ length: TETO_DE_IDS_VISTOS + 5 }, (_, i) =>
      `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`);

    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);
    // A passa por muitas listas diferentes e some; a memória enche.
    for (let i = 0; i < muitas.length; i += 100) {
      servidorDevolve(muitas.slice(i, i + 100));
      await atualizarPendencias(TOKEN);
    }
    const antes = chamadas.length;

    // A lista atual, repetida: nada é novidade, mesmo com a memória cheia.
    servidorDevolve(muitas.slice(-100));
    await atualizarPendencias(TOKEN);
    expect(chamadas.length).toBe(antes);

    // A, que saiu há muito e caiu do teto, volta: avisa, e é o custo do teto.
    servidorDevolve([...muitas.slice(-100), A]);
    await atualizarPendencias(TOKEN);
    expect(chamadas.at(-1)).toEqual([{ id: A, severidade: "media" }]);
  });
});

describe("o gancho não derruba a atualização", () => {
  it("um ouvinte que estoura não impede a lista de chegar nem os outros ouvintes de ouvir", async () => {
    servidorDevolve([]);
    await atualizarPendencias(TOKEN);

    const pararQuebrado = aoChegarTarefaNova(() => { throw new Error("motor tátil ausente"); });
    const { chamadas, parar } = ouvir();
    desligar = () => { pararQuebrado(); parar(); };

    servidorDevolve([A]);
    const lista = await atualizarPendencias(TOKEN);

    expect(lista.map((p) => p.id)).toEqual([A]);
    expect(chamadas).toEqual([[{ id: A, severidade: "media" }]]);
  });

  it("quem parou de ouvir não ouve mais", async () => {
    const { chamadas, parar } = ouvir();
    servidorDevolve([]);
    await atualizarPendencias(TOKEN);
    parar();

    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);

    expect(chamadas).toEqual([]);
  });

  it("a falha da rede não avisa nada e não avança a memória", async () => {
    const { chamadas, parar } = ouvir();
    desligar = parar;
    servidorDevolve([A]);
    await atualizarPendencias(TOKEN);

    mockBaixar.mockRejectedValue(new Error("sem sinal"));
    await expect(atualizarPendencias(TOKEN)).rejects.toThrow("sem sinal");

    // A lista de antes continua sendo a última vista: B ainda é novidade.
    servidorDevolve([A, B]);
    await atualizarPendencias(TOKEN);
    expect(chamadas).toEqual([[{ id: B, severidade: "media" }]]);
  });
});
