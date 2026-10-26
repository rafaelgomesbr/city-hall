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
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useEffect } = require("react") as typeof import("react");
  const navegacao = { setOptions: jest.fn() };
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ id: "oc-recem-despachada" }),
    useNavigation: () => navegacao,
    /* A tela relê o disco a cada foco; aqui o foco é a montagem, e só ela. */
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
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
  randomUUID: () => "11111111-1111-4111-8111-111111111111",
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

/*
  Os DOIS verbos da sessão, espionados. A tela só pode chamar o que NÃO apaga
  (`encerrarSessaoVencida`): `sair` apaga a vistoria começada. Ver a decisão de
  V2-F00-E15, correção 1, em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, e a prova
  com os módulos reais em `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`.
*/
const mockSair = jest.fn(async () => undefined);
const mockEncerrarSessaoVencida = jest.fn(async () => undefined);
jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => mockToken,
    sair: () => mockSair(),
    encerrarSessaoVencida: () => mockEncerrarSessaoVencida(),
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

  expect(screen.getByText(/Sem sinal para atualizar/)).toBeTruthy();
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

  expect(screen.getByText("Sua sessão terminou")).toBeTruthy();
  expect(mockBaixas).not.toHaveBeenCalled();
});

/*
  O 401 DE VERDADE, e ele não é "tente de novo em alguns minutos".

  A sessão revogada pelo servidor chega aqui como resposta com status 401, e
  a tela a tratava como qualquer outra falha: "Não deu para baixar a lista
  agora. Tente de novo em alguns minutos." Tentar de novo dá 401 de novo, para
  sempre. A lista de tarefas já sabe classificar isso (`motivoDaFalha`) e
  oferece o ato que resolve; esta tela precisa dizer a mesma coisa, pela mesma
  régua, porque é o mesmo agente lendo as duas.
*/
it("o 401 nomeia a sessão encerrada e oferece entrar de novo, sem apagar nada", async () => {
  await abrirATela();
  mockAoBaixar = () => { throw { status: 401, codigo: "nao_autenticado" }; };

  await act(async () => {
    fireEvent.press(screen.getByTestId("baixar-para-abrir"));
  });
  await act(async () => {});

  expect(screen.getByText("Sua sessão terminou")).toBeTruthy();
  expect(screen.queryByText(/Tente de novo em alguns minutos/)).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByText("Entrar de novo"));
  });
  await act(async () => {});

  /* O verbo que preserva o disco, e nunca o que apaga (V2-F00-E15). */
  expect(mockEncerrarSessaoVencida).toHaveBeenCalledTimes(1);
  expect(mockSair).not.toHaveBeenCalled();
  const { router } = jest.requireMock("expo-router") as { router: { replace: jest.Mock } };
  expect(router.replace).toHaveBeenCalledWith("/entrar");
});

it("o acesso suspenso pelo fornecedor não manda entrar de novo", async () => {
  await abrirATela();
  mockAoBaixar = () => { throw { status: 403, codigo: "acesso_suspenso" }; };

  await act(async () => {
    fireEvent.press(screen.getByTestId("baixar-para-abrir"));
  });
  await act(async () => {});

  expect(screen.getByText("Acesso suspenso pelo fornecedor")).toBeTruthy();
  /* Entrar de novo dá a mesma recusa, e sair apagaria a identidade que
     carimba a coleta: o botão não existe aqui de propósito. */
  expect(screen.queryByText("Entrar de novo")).toBeNull();
  expect(screen.queryByText("Sair e entrar de novo")).toBeNull();
});

it("a falha sem nome continua pedindo para tentar daqui a pouco", async () => {
  await abrirATela();
  mockAoBaixar = () => { throw new Error("500"); };

  await act(async () => {
    fireEvent.press(screen.getByTestId("baixar-para-abrir"));
  });
  await act(async () => {});

  expect(screen.getByText(/Não deu para atualizar agora/)).toBeTruthy();
  expect(screen.queryByText("Entrar de novo")).toBeNull();
  expect(screen.queryByText("Sair e entrar de novo")).toBeNull();
  expect(screen.getByTestId("baixar-para-abrir")).toBeTruthy();
});

/*
  "VOLTAR PARA AS TAREFAS" precisa levar a algum lugar mesmo sem histórico.

  Quem chega aqui pela notificação chega SEM pilha de navegação atrás: a
  vistoria é a primeira tela. `router.back()` cru não tem para onde voltar e
  o botão não faz nada, que é o pior comportamento possível para o botão que
  existe justamente para provar que dá para sair. `salvarESair` já trata isso
  no formulário; esta tela usava o `back()` cru.
*/
it("'Voltar para as tarefas' sem histórico vai para a lista, em vez de não fazer nada", async () => {
  const { router } = jest.requireMock("expo-router") as {
    router: { back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };
  };
  router.canGoBack.mockReturnValue(false);
  await abrirATela();

  await act(async () => {
    fireEvent.press(screen.getByTestId("voltar-das-tarefas"));
  });

  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith("/(agente)");
});
