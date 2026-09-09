import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import TelaDeVistoria from "../app/(agente)/vistoria/[id]";

/**
 * O agente tocou na notificação, e a tarefa ainda não desceu para o aparelho.
 *
 * Este caminho ficou comum no dia em que o toque na notificação passou a abrir
 * a vistoria: o aviso de push chega no segundo em que a coordenação despacha, e
 * a lista de tarefas deste aparelho só é reescrita na próxima atualização.
 * Entre um instante e outro a ocorrência existe no servidor e não existe no
 * disco. Isso é ORDEM DE CHEGADA, e não defeito.
 *
 * A tela dizia "Esta ocorrência não está guardada neste aparelho" numa tarja
 * vermelha, sem saída. Duas coisas erradas de uma vez: soa a defeito do
 * aplicativo, e não oferece a ação que resolve. O agente que lê isso liga para
 * a coordenação; o que lê a tela nova toca em um botão.
 *
 * E o botão importa mais do que parece: quem chegou aqui veio de uma
 * notificação, então tem sinal NESTE INSTANTE. É a única circunstância do
 * produto em que "vá procurar sinal" seria um conselho pior do que inútil.
 */

jest.mock("expo-router", () => {
  const navegacao = { setOptions: jest.fn() };
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ id: "oc-recem-despachada" }),
    useNavigation: () => navegacao,
  };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
}));

jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-1111-1111-111111111111",
}));

jest.mock("expo-file-system", () => ({
  File: class { size = 0; constructor(_uri: string) {} },
}));

/*
  `SemSinal` é a classe de verdade, e não um duplo: a tela distingue "sem sinal"
  de "qualquer outra coisa" por `instanceof`, e um duplo faria os dois caminhos
  virarem um só sem ninguém perceber.
*/
jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {
    constructor() { super("Sem sinal agora."); this.name = "SemSinal"; }
  },
}));

/** O que o disco tem agora. A baixa preenche isto, como a de verdade faria. */
let mockNoDisco: Pendencia | null = null;
/** O que a ida à rede vai fazer. Cada teste ajusta. */
let mockAoBaixar: () => void = () => undefined;
const mockBaixas = jest.fn();

jest.mock("../dados/pendencias", () => ({
  pendenciaGuardada: jest.fn(async () => mockNoDisco),
  /* Sem catálogo: o que este arquivo prova é a ordem de chegada da tarefa. */
  orgaosGuardados: jest.fn(async () => []),
  atualizarPendencias: jest.fn(async (token: string) => {
    mockBaixas(token);
    mockAoBaixar();
    return [];
  }),
}));

jest.mock("../dados/coletas", () => ({
  coletaDe: jest.fn(async () => null),
  marcarColetada: jest.fn(async () => {}),
  arquivarColeta: jest.fn(async () => {}),
}));

jest.mock("../dados/fila", () => ({
  obterFila: jest.fn(async () => ({ enfileirar: jest.fn(async () => {}) })),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => mockToken,
    identidade: {
      nome: "Agente de teste", matricula: "0001",
      organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
    },
  }),
}));

jest.mock("../dados/rascunho", () => ({
  lerRascunho: jest.fn(async () => null),
  salvarRascunho: jest.fn(async () => {}),
  descartarRascunho: jest.fn(async () => {}),
  rascunhoNovo: (ocorrenciaId: string, protocolo: string, idempotencyKey: string) => ({
    ocorrenciaId, protocolo, idempotencyKey,
    checklist: {}, orgaosParaAcionar: [], fotos: [], gpsPrecisaoMetros: null, coordenada: null,
    assinanteNome: "", assinaturaUri: null, observacoes: "", pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z", atualizadoEm: "2026-09-09T12:00:00.000Z",
  }),
}));

let mockToken: string | null = "token-de-mentira";

function ocorrenciaDespachadaAgora(): Pendencia {
  return {
    id: "oc-recem-despachada",
    protocolo: "2026/000456",
    tipo: "deslizamento",
    severidade: "critica",
    endereco: "Servidão do Morro, 45 (fundos)",
    ponto_referencia: null,
    latitude: null,
    longitude: null,
    descricao: "Barranco escorregou sobre os fundos da casa.",
    solicitante_nome: "Maria de exemplo",
    solicitante_contato: null,
    vulnerabilidade_presente: false,
    vulnerabilidade_descricao: null,
    prazo_em: null,
    criado_em: "2026-09-09T09:00:00.000Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNoDisco = null;
  mockToken = "token-de-mentira";
  mockAoBaixar = () => undefined;
});

/** Abre a tela e deixa a leitura do disco terminar. */
async function abrirATela(): Promise<void> {
  await act(async () => { render(<TelaDeVistoria />); });
  await act(async () => {});
}

it("explica que a tarefa ainda não chegou, em vez de parecer defeito", async () => {
  await abrirATela();

  expect(screen.getByText("Esta tarefa ainda não está neste aparelho")).toBeTruthy();
  // A frase antiga sugeria defeito do aplicativo e não oferecia saída nenhuma.
  expect(screen.queryByText(/não está guardada neste aparelho/)).toBeNull();
});

it("oferece baixar a lista ali mesmo, sem mandar o agente voltar", async () => {
  await abrirATela();

  expect(screen.getByTestId("baixar-para-abrir")).toBeTruthy();
});

it("baixa a lista e abre a vistoria em seguida", async () => {
  await abrirATela();
  mockAoBaixar = () => { mockNoDisco = ocorrenciaDespachadaAgora(); };

  await act(async () => {
    fireEvent.press(screen.getByTestId("baixar-para-abrir"));
  });
  await act(async () => {});

  expect(mockBaixas).toHaveBeenCalledWith("token-de-mentira");
  expect(screen.getByText("Checklist técnico")).toBeTruthy();
});

/*
  Falhar em baixar não pode substituir esta tela pela tarja vermelha antiga: o
  agente continua precisando do botão para tentar de novo, e a frase precisa
  dizer o que fazer agora.
*/
it("mantém o botão de tentar de novo quando a rede falha", async () => {
  await abrirATela();
  mockAoBaixar = () => { throw new (jest.requireMock("../dados/api").SemSinal)(); };

  await act(async () => {
    fireEvent.press(screen.getByTestId("baixar-para-abrir"));
  });
  await act(async () => {});

  expect(screen.getByText(/Sem sinal para baixar a lista agora/)).toBeTruthy();
  expect(screen.getByTestId("baixar-para-abrir")).toBeTruthy();
});

/*
  Sessão vencida é a única causa desta tela com ação diferente: baixar não
  adianta, entrar de novo adianta. Dizer "sem sinal" aqui mandaria o agente
  procurar antena no alto do morro por causa de um token vencido.
*/
it("nomeia a sessão vencida em vez de culpar o sinal", async () => {
  await abrirATela();
  mockToken = null;

  await act(async () => {
    fireEvent.press(screen.getByTestId("baixar-para-abrir"));
  });
  await act(async () => {});

  expect(screen.getByText(/sessão expirou/)).toBeTruthy();
  expect(mockBaixas).not.toHaveBeenCalled();
});
