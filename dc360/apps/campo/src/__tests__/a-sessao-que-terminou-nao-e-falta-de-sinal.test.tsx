/**
 * A sessão que terminou não é falta de sinal, e o aviso de rede tem como sair.
 *
 * O relato, na letra de quem paga (14/09/2026): "acabei de criar uma ocorrência
 * lá no site, e não chegou no app. e aparece um aviso 'não deu para atualizar
 * agora' e não tem nem um tempo pra sumir nem um x pra fechar".
 *
 * O levantamento no banco de produção achou a causa, e ela NÃO era rede: a
 * sessão daquele iPhone tinha sido revogada pelo servidor às 12h20, nove horas
 * antes de a ocorrência ser despachada, e desde então toda chamada do
 * aplicativo respondia 401. A tela lia qualquer fracasso que não fosse
 * `SemSinal` como "não deu para atualizar agora" e mandava o agente esperar.
 * Esperar não resolvia, e nunca ia resolver: o único ato que resolve é entrar
 * de novo, e a tela não dizia isso em lugar nenhum.
 *
 * O segundo defeito é o da forma, e é o mesmo que já foi corrigido uma vez
 * nesta tela com o `avisoDaDevolucao`: o aviso colava no topo e não tinha
 * saída. Aqui ele ganha a mesma saída (o `ⓘ` com "Dispensar este aviso", que é
 * o alvo de 52 do produto e tem rótulo para quem ouve a tela) e continua
 * sumindo sozinho quando a atualização seguinte dá certo, que é o único
 * gatilho honesto: sumir por tempo esconderia um fato que continua valendo.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { SemSinal, type Pendencia } from "../dados/api";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => {
  const { useEffect } = require("react") as typeof import("react");
  return {
    router: { push: jest.fn() },
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
  };
});

jest.mock("expo-crypto", () => ({
  randomUUID: () => "99999999-9999-4999-8999-999999999999",
}));

/**
 * O dublê de `dados/api`, com as DUAS formas de fracasso que a tela precisa
 * separar: a que é sinal e a que é resposta do servidor.
 *
 * `ErroDaApi` carrega `status` porque é por ele que a classificação pergunta,
 * e não por `instanceof`: ver a razão escrita em `dados/falha-de-atualizacao`.
 */
class ErroDaApiFalso extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}
jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  ErroDaApi: class ErroDaApi extends Error {},
  enderecoDaApi: () => "https://api.exemplo",
}));

let mockTarefas: Pendencia[] = [];
let mockBaixadasEm: string | null = new Date().toISOString();
let mockTeto: number | null = null;

const mockLerPendencias = jest.fn(async (): Promise<Pendencia[]> => mockTarefas);

/** O que a próxima ida à rede faz. Nulo: devolve a lista do disco e pronto. */
let quebrarARedeCom: Error | null = null;
const mockAtualizarPendencias = jest.fn(async (_token: string): Promise<Pendencia[]> => {
  if (quebrarARedeCom) throw quebrarARedeCom;
  return mockTarefas;
});

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: () => mockLerPendencias(),
  baixadasEm: jest.fn(async () => mockBaixadasEm),
  atualizarPendencias: (token: string) => mockAtualizarPendencias(token),
  tetoAtingido: jest.fn(async () => mockTeto),
  esquecerPendencia: jest.fn(async () => {}),
}));

/* Listas vazias ESTÁVEIS: array novo a cada leitura troca o estado, que
   provoca renderização, que relê o disco, para sempre. */
const SEM_RASCUNHOS: never[] = [];
jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => SEM_RASCUNHOS) }));
const SEM_COLETAS: never[] = [];
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => SEM_COLETAS),
  marcarEnviada: jest.fn(async () => {}),
}));

const SEM_ITENS: never[] = [];
const mockFila = {
  itens: async () => SEM_ITENS,
  assinar: () => () => {},
  drenar: jest.fn(async () => ({})),
  enfileirarDevolucao: jest.fn(),
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

let mockTemSinal = true;
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: mockTemSinal, tipo: mockTemSinal ? "wifi" : "nenhum" }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: { nome: "Ana Ribeiro", municipio: "Serra Alta", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";

const ID = "11111111-1111-4111-8111-111111111111";
const NO_PRAZO = new Date(Date.now() + 9 * 3_600_000).toISOString();

function tarefa(): Pendencia {
  return {
    id: ID,
    protocolo: "000471/2026",
    tipo: "deslizamento",
    severidade: "alta",
    endereco: "Servidão do Morro, 45",
    ponto_referencia: null,
    latitude: -27.595378,
    longitude: -48.548050,
    descricao: "Barranco escorregou sobre os fundos da casa.",
    solicitante_nome: "Maria de exemplo",
    solicitante_contato: null,
    vulnerabilidade_presente: false,
    vulnerabilidade_descricao: null,
    prazo_em: NO_PRAZO,
    criado_em: "2026-09-13T09:00:00.000Z",
  } as Pendencia;
}

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
}

async function tocar(id: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByTestId(id)); });
}

async function tocarNoTexto(texto: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByText(texto)); });
}

function aFaixa() {
  return within(screen.getByTestId("faixa-de-estado"));
}

beforeEach(() => {
  mockTarefas = [tarefa()];
  /* Lista recém baixada: qualquer data fixa envelheceria e a faixa passaria a
     mostrar o aviso de meia hora em todo caso deste arquivo. */
  mockBaixadasEm = new Date().toISOString();
  mockTeto = null;
  mockTemSinal = true;
  quebrarARedeCom = null;
  mockLerPendencias.mockClear();
  mockAtualizarPendencias.mockClear();
});

/* ============================================================
   O defeito que produziu o relato
   ============================================================ */

describe("o servidor que não reconhece mais a sessão", () => {
  /*
    O caso que reprova antes da correção. Com sinal e com 401, a faixa dizia
    "Não deu para atualizar agora", que é uma frase sobre a REDE, e o agente
    ficava esperando uma rede que estava funcionando.
  */
  it("a faixa diz que a sessão terminou, e não que foi a rede", async () => {
    quebrarARedeCom = new ErroDaApiFalso(401, "nao_autenticado", "Token inválido ou expirado.");
    await abrirALista();

    expect(aFaixa().getByText("Sua sessão terminou neste aparelho")).toBeTruthy();
    expect(screen.queryByText(/Não deu para atualizar agora/)).toBeNull();
    expect(screen.queryByText(/Sem sinal para atualizar/)).toBeNull();
  });

  /*
    Dizer que a sessão caiu sem dizer o que fazer seria trocar uma frase inútil
    por outra. O texto por extenso precisa terminar num ATO, e precisa desfazer
    o medo que faz o agente não executá-lo: sair da conta não apaga a vistoria
    que ele fez no morro.
  */
  it("o ⓘ ensina o caminho de volta, e promete a fila de pé", async () => {
    quebrarARedeCom = new ErroDaApiFalso(401, "nao_autenticado", "Token inválido ou expirado.");
    await abrirALista();
    await tocar("detalhe-da-lista");

    const dialogo = within(screen.getByTestId("explicacao"));
    expect(dialogo.getByText(/Sair da conta/)).toBeTruthy();
    expect(dialogo.getByText(/continua guardado no aparelho/)).toBeTruthy();
  });

  /*
    Sem sinal continua sendo sem sinal: a correção separa casos, não troca um
    rótulo errado por outro.

    E o caso é com o indicador de sinal LIGADO, de propósito: é a borda de
    cobertura em que o sistema operacional diz "wi-fi" e a requisição morre no
    tempo limite. A faixa lia o indicador para escolher a frase, e por isso
    dizia "Não deu para atualizar agora" enquanto o texto por extenso, logo
    atrás do `ⓘ`, dizia "sem sinal". Quem escolhe a frase agora é o FRACASSO,
    que é quem sabe o que houve.
  */
  it("sem sinal continua dizendo que é o sinal", async () => {
    quebrarARedeCom = new SemSinal();
    mockTemSinal = true;
    await abrirALista();

    expect(aFaixa().getByText("Sem sinal para atualizar")).toBeTruthy();
    expect(screen.queryByText(/Sua sessão terminou/)).toBeNull();
  });
});

/* ============================================================
   O aviso que não fechava
   ============================================================ */

describe("o aviso de rede tem saída", () => {
  it("dá para dispensar, e dispensar some com ele", async () => {
    quebrarARedeCom = new ErroDaApiFalso(500, "erro", "O servidor não respondeu.");
    await abrirALista();
    expect(aFaixa().getByText("Não deu para atualizar agora")).toBeTruthy();

    await tocar("detalhe-da-lista");
    await tocarNoTexto("Dispensar este aviso");

    expect(screen.queryByText("Não deu para atualizar agora")).toBeNull();
    /* A faixa não some junto: ela volta a contar a idade da lista, que é o que
       ela diz quando não há o que avisar. */
    expect(aFaixa().getByText(/Serra Alta, atualizada/)).toBeTruthy();
  });

  /*
    O gatilho de sumir sozinho é a atualização SEGUINTE dar certo, e não o
    relógio. Um aviso que expira por tempo esconde um fato que continua
    valendo (a lista pode estar velha); um aviso que sobrevive à atualização
    que deu certo é a tela mentindo.
  */
  it("some sozinho quando a atualização seguinte dá certo", async () => {
    quebrarARedeCom = new ErroDaApiFalso(500, "erro", "O servidor não respondeu.");
    await abrirALista();
    expect(aFaixa().getByText("Não deu para atualizar agora")).toBeTruthy();

    quebrarARedeCom = null;
    await tocarNoTexto("Baixar tarefas agora");

    expect(screen.queryByText("Não deu para atualizar agora")).toBeNull();
    expect(aFaixa().getByText(/Serra Alta, atualizada/)).toBeTruthy();
  });
});
