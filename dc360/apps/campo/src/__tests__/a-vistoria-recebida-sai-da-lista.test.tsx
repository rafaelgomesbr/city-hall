/**
 * A vistoria que a coordenação RECEBEU não é mais tarefa do agente.
 *
 * Os dois defeitos aqui foram vistos num iPhone, na mesma tela, e a pergunta de
 * quem viu era a certa: "se a coordenação já recebeu esta vistoria, por que ela
 * está na lista de minhas tarefas?".
 *
 * ## Defeito 1: a tarefa não saía
 *
 * Quando uma DEVOLUÇÃO é confirmada, a tela chama `esquecerPendencia` e a
 * tarefa some, porque o aparelho passou a saber que aquilo não é mais dele.
 * Quando uma VISTORIA é confirmada, a tela só promovia a lápide e DEIXAVA a
 * tarefa na lista. O servidor tinha a vistoria e o agente continuava vendo
 * trabalho para fazer, com o contador dizendo "2 vistorias para fazer" sobre
 * uma que já chegou. Ela acabava saindo na próxima reconciliação com sinal, e
 * "acaba saindo" não é resposta para quem está no morro com o aparelho na mão.
 *
 * ## Defeito 2: o selo mentia, por uma corrida
 *
 * A promoção de "aguardando envio" para "enviada" só acontecia se a tela
 * pegasse o item AINDA NA FILA, no estado confirmado. Só que `drenar()`, que é
 * o que o botão "Enviar agora" chama, confirma E TIRA o item da fila. Quando a
 * tela ia ler, o item já tinha saído: a promoção nunca rodava, e o cartão
 * continuava dizendo "Coletada, aguardando envio" com o botão de volta, logo
 * abaixo de uma tarja verde dizendo "Enviado". Três estados contraditórios no
 * mesmo cartão, e o agente decidindo qual acreditar.
 *
 * ## Por que o conserto é nos dois lugares
 *
 * A leitura da fila continua promovendo o que encontra: é ela que cobre o envio
 * que acontece sozinho, em segundo plano, sem ninguém tocar em nada. O que
 * faltava era o caminho do dedo, e quem pede o envio e recebe a confirmação já
 * sabe o desfecho: não pode depender de reencontrar na fila um item que a
 * própria confirmação removeu. As duas chamadas são idempotentes.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import type { ColetaLocal } from "@dc360/campo";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "dark",
}));

jest.mock("expo-router", () => {
  const { View } = require("react-native");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (fn: () => void) => { fn(); },
    Stack: { Screen: View },
  };
});

jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "http://127.0.0.1:0",
  baixarPendencias: jest.fn(async () => { throw new Error("sem rede neste teste"); }),
}));

let mockTarefas: Pendencia[] = [];
let mockColetas: ColetaLocal[] = [];
let mockItensDaFila: { tipo: string; ocorrenciaId: string; estado: string }[] = [];
const mockPromovidas: string[] = [];
const mockEsquecidas: string[] = [];
let mockDrenou = 0;
/** O dreno confirma, ou não. Um dublê que sempre confirma provaria metade. */
let mockDrenarConfirma = true;

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => "2026-09-09T13:00:00.000Z"),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
  esquecerPendencia: jest.fn(async (id: string) => {
    mockEsquecidas.push(id);
    mockTarefas = mockTarefas.filter((t) => t.id !== id);
  }),
}));

jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => []) }));

jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
  marcarEnviada: jest.fn(async (id: string) => {
    mockPromovidas.push(id);
    mockColetas = mockColetas.map((c) => (c.ocorrenciaId === id ? { ...c, situacao: "enviada" } : c));
  }),
}));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    itens: async () => mockItensDaFila,
    drenar: async () => {
      mockDrenou++;
      /*
        Confirmado sai da fila; não confirmado FICA, do jeito que estava. É o
        que a fila de verdade faz, e é a diferença que separa os dois casos
        deste arquivo.
      */
      if (mockDrenarConfirma) mockItensDaFila = [];
      /* O contrato de `drenar` é devolver o resultado do dreno; a tela lê
         `paradaPor` dele (V2-F00-E06, correção 3). */
      return {
        fotosEnviadas: 0, enviados: mockDrenarConfirma ? 1 : 0, duplicados: 0,
        adiados: 0, bloqueados: 0, interrompido: false,
      };
    },
    /* A tela assina a fila para saber da pausa; aqui a fila nunca está pausada. */
    assinar: () => () => undefined,
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "wifi" }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    identidade: { nome: "Agente de teste", municipio: "Teste", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";

const ID = "22222222-2222-4222-8222-222222222222";

function tarefa(): Pendencia {
  return {
    id: ID,
    protocolo: "2026/000456",
    tipo: "inundacao",
    severidade: "alta",
    endereco: "Rua da Prova, 10",
    ponto_referencia: null,
    latitude: -27.59,
    longitude: -48.54,
    descricao: "Agua entrou na casa.",
    solicitante_nome: "Quem ligou",
    solicitante_contato: null,
    vulnerabilidade_presente: false,
    vulnerabilidade_descricao: null,
    prazo_em: "2026-09-10T21:52:00.000Z",
    criado_em: "2026-09-09T09:00:00.000Z",
  } as Pendencia;
}

function lapide(situacao: ColetaLocal["situacao"]): ColetaLocal {
  return {
    ocorrenciaId: ID,
    idempotencyKey: "chave-da-coleta",
    protocolo: "2026/000456",
    coletadaEm: "2026-09-09T13:00:00.000Z",
    situacao,
  };
}

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
}

beforeEach(() => {
  mockTarefas = [tarefa()];
  mockColetas = [];
  mockItensDaFila = [];
  mockPromovidas.length = 0;
  mockEsquecidas.length = 0;
  mockDrenou = 0;
  mockDrenarConfirma = true;
});

describe("a vistoria confirmada pelo servidor", () => {
  it("tira a tarefa da lista, como a devolução confirmada já fazia", async () => {
    mockColetas = [lapide("na_fila")];
    mockItensDaFila = [{ tipo: "vistoria", ocorrenciaId: ID, estado: "confirmado" }];

    await abrirALista();

    expect(mockEsquecidas).toContain(ID);
    expect(screen.queryByText("2026/000456")).toBeNull();
  });

  it("a coleta que ainda NÃO foi confirmada mantém a tarefa na lista", async () => {
    /*
      O lado oposto, e ele importa mais que o de cima: sumir antes de o servidor
      confirmar é a forma mais cara de perder informação neste produto, e foi o
      defeito que dois turnos inteiros fecharam.
    */
    mockColetas = [lapide("na_fila")];
    mockItensDaFila = [{ tipo: "vistoria", ocorrenciaId: ID, estado: "enviando" }];

    await abrirALista();

    expect(mockEsquecidas).not.toContain(ID);
    expect(screen.getByText("2026/000456")).toBeTruthy();
  });
});

describe("o botão 'Enviar agora' e a corrida que ele perde", () => {
  it("depois de enviar pelo botão, a tarefa sai e o selo não fica mentindo", async () => {
    mockColetas = [lapide("na_fila")];
    mockItensDaFila = [{ tipo: "vistoria", ocorrenciaId: ID, estado: "pendente" }];

    await abrirALista();
    expect(screen.getByText("2026/000456")).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText("Enviar agora")); });
    await act(async () => {});

    expect(mockDrenou).toBe(1);
    expect(mockPromovidas).toContain(ID);
    expect(mockEsquecidas).toContain(ID);
    expect(screen.queryByText(/Coletada, aguardando envio/)).toBeNull();
  });

  it("envio que NÃO deu certo não promove nada e não esquece nada", async () => {
    /*
      O outro lado, e ele é o que protege a coleta: o item continuou na fila,
      ainda pendente, então o servidor não tem nada. Promover ou esquecer aqui
      seria a tela afirmando o que o servidor não tem, que é o defeito que a
      lápide inteira existe para impedir.
    */
    mockColetas = [lapide("na_fila")];
    mockItensDaFila = [{ tipo: "vistoria", ocorrenciaId: ID, estado: "pendente" }];

    await abrirALista();
    mockDrenarConfirma = false;
    await act(async () => { fireEvent.press(screen.getByText("Enviar agora")); });
    await act(async () => {});

    expect(mockPromovidas).not.toContain(ID);
    expect(mockEsquecidas).not.toContain(ID);
  });
});
