/**
 * As duas perguntas da tela de vistoria, agora feitas pelo aplicativo.
 *
 * São as duas mais caras do produto, e cada uma erra para um lado:
 *
 * 1. **"Fazer nova vistoria?"** Confirmar arquiva a lápide da coleta que este
 *    aparelho já fez e libera uma SEGUNDA vistoria do mesmo protocolo. A
 *    revistoria é legítima (chuva nova pede vistoria nova), o que não pode é ela
 *    acontecer por acidente de um toque numa lista velha, porque o coordenador
 *    só descobre os dois laudos quando já assinou um deles.
 * 2. **"Vistoria guardada"** Não destrói nada, e por isso não tem recusa: a
 *    coleta já está na fila. O que ela não pode é levar o agente de volta para a
 *    lista ANTES de ele ler onde a vistoria foi parar, que é a dúvida que faz
 *    gente refazer vistoria por precaução.
 *
 * Com `Alert.alert` nenhuma das duas era testável de dentro da tela: dava para
 * espionar o módulo e provar "o alerta foi chamado", e não dava para provar o
 * que importa, que é o disco e a navegação ficarem parados enquanto ninguém
 * respondeu.
 *
 * O arquivo mora em `src/ui` junto do `Dialogo` que ele exercita, e não em
 * `src/__tests__`: aquela pasta existe por causa do Expo, que transforma tudo
 * dentro de `src/app` em rota, e nada aqui está dentro de `src/app`.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { CHECKLIST_OBRIGATORIO } from "@dc360/shared";
import type { ColetaLocal } from "@dc360/campo";
import type { Pendencia } from "../dados/api";
import type { Rascunho } from "../dados/rascunho";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

/* A navegação precisa ser o MESMO objeto a cada renderização: o efeito que
   carrega a ocorrência depende dela, e um objeto novo a cada quadro o faria
   rodar de novo para sempre, até o Node ficar sem memória. */
jest.mock("expo-router", () => {
  const navegacao = { setOptions: jest.fn() };
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ id: "oc-1" }),
    useNavigation: () => navegacao,
  };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({ randomUUID: () => "chave-de-mentira" }));

jest.mock("expo-file-system", () => ({
  File: class { size = 1024; constructor(_uri: string) {} },
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));
jest.mock("../dados/mapa", () => ({ abrirNoMapa: jest.fn() }));

let mockOcorrencia: Pendencia;
jest.mock("../dados/pendencias", () => ({
  pendenciaGuardada: async () => mockOcorrencia,
  /* Aparelho que nunca sincronizou: catálogo vazio. A tela precisa abrir e
     concluir assim mesmo, e é o campo livre que garante isso. */
  orgaosGuardados: async () => [],
}));

/*
  Todo valor entregue por uma fábrica de `jest.mock` é envolvido numa função,
  e isso não é estilo.

  As fábricas de `jest.mock` são içadas para ANTES dos `import`, e os `import`
  são içados para antes das declarações deste arquivo. Entregar
  `arquivarColeta: mockArquivarColeta` direto congela o valor que a constante
  tinha naquele instante, que é `undefined`. A tela então chama `undefined(id)`,
  o erro cai no `try/catch` de `refazerVistoria`, a tela mostra uma mensagem
  discreta, e o teste passa a provar o oposto do que ele diz: "não arquivou"
  fica verde porque a função nem existe. Foi exatamente o que aconteceu ao
  escrever este arquivo.
*/
let mockLapide: ColetaLocal | null = null;
const mockArquivarColeta = jest.fn(async (_id: string) => {});
const mockMarcarColetada = jest.fn(async (_dados: unknown) => {});
jest.mock("../dados/coletas", () => ({
  coletaDe: async () => mockLapide,
  arquivarColeta: (id: string) => mockArquivarColeta(id),
  marcarColetada: (dados: unknown) => mockMarcarColetada(dados),
}));

let mockRascunho: Rascunho | null = null;
const mockDescartarRascunho = jest.fn(async (_id: string) => {});
jest.mock("../dados/rascunho", () => ({
  lerRascunho: async () => mockRascunho,
  salvarRascunho: jest.fn(async () => {}),
  descartarRascunho: (id: string) => mockDescartarRascunho(id),
  rascunhoNovo: (ocorrenciaId: string, protocolo: string, idempotencyKey: string) => ({
    ocorrenciaId, protocolo, idempotencyKey,
    checklist: {}, orgaosParaAcionar: [], fotos: [], gpsPrecisaoMetros: null, coordenada: null,
    assinanteNome: "", assinaturaUri: null, observacoes: "", pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:00:00.000Z",
  }),
}));

const mockEnfileirar = jest.fn(async (..._args: unknown[]) => ({}));
/* A fila precisa ser o MESMO objeto a cada chamada: uma fila nova viraria
   estado novo, que viraria renderização nova, que abriria a fila de novo. */
const mockFila = { enfileirar: (...args: unknown[]) => mockEnfileirar(...args) };
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

const mockSessao = {
  obterToken: async () => "token-de-mentira",
  identidade: {
    nome: "Agente de teste", matricula: "0001",
    organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
  },
};
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));

import { router } from "expo-router";
import TelaDeVistoria from "../app/(agente)/vistoria/[id]";

const OCORRENCIA: Pendencia = {
  id: "oc-1",
  protocolo: "2026/000123",
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
  prazo_em: null,
  criado_em: "2026-09-09T09:00:00.000Z",
};

/** Um rascunho COMPLETO: checklist obrigatório, foto, nome e traço da assinatura. */
function rascunhoPronto(): Rascunho {
  const checklist: Record<string, boolean> = {};
  for (const item of CHECKLIST_OBRIGATORIO) checklist[item.chave] = true;
  return {
    ocorrenciaId: "oc-1",
    protocolo: "2026/000123",
    idempotencyKey: "chave-da-coleta",
    checklist,
    /*
      O checklist acima responde SIM a tudo, inclusive a "necessário acionar
      outro órgão", e desde 09/09/2026 esse sim pede o nome de quem acionar. Sem
      esta linha o rascunho não é mais "pronto": a conclusão fica barrada, e
      estes casos passariam a provar outra coisa.
    */
    orgaosParaAcionar: [{ orgaoId: null, nome: "Concessionária de energia" }],
    fotos: [{
      idempotencyKey: "foto-1",
      uriLocal: "file:///foto-1.jpg",
      nomeArquivo: "vistoria-2026-000123-1.jpg",
      tipoConteudo: "image/jpeg",
      tamanhoBytes: 1024,
      capturadaEm: "2026-09-09T12:10:00.000Z",
      ordem: 0,
    }],
    gpsPrecisaoMetros: 8,
    coordenada: { lat: -27.595378, lng: -48.548050 },
    assinanteNome: "Maria de exemplo",
    assinaturaUri: "file:///assinatura.png",
    observacoes: "",
    pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:20:00.000Z",
  };
}

const LAPIDE: ColetaLocal = {
  ocorrenciaId: "oc-1",
  idempotencyKey: "chave-da-primeira-coleta",
  protocolo: "2026/000123",
  coletadaEm: "2026-09-09T13:00:00.000Z",
  situacao: "na_fila",
};

beforeEach(() => {
  mockOcorrencia = OCORRENCIA;
  mockLapide = null;
  mockRascunho = null;
  mockArquivarColeta.mockClear();
  mockMarcarColetada.mockClear();
  mockDescartarRascunho.mockClear();
  mockEnfileirar.mockClear();
  (router.back as jest.Mock).mockClear();
});

async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await act(async () => {});
}

async function tocar(texto: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByText(texto)); });
}

describe("a segunda vistoria do mesmo protocolo", () => {
  beforeEach(() => { mockLapide = LAPIDE; });

  it("o toque na saída abre a pergunta e NÃO arquiva a coleta anterior", async () => {
    /*
      O disco parado é a prova inteira: enquanto ninguém respondeu, a lápide
      continua barrando a abertura de um formulário novo. Se o botão chamasse
      `refazerVistoria` direto, a tela viraria formulário no primeiro toque e a
      segunda vistoria já teria começado antes de qualquer confirmação.
    */
    await abrirATela();

    await tocar("Fazer nova vistoria desta ocorrência");

    expect(screen.getByTestId("dialogo")).toBeTruthy();
    expect(mockArquivarColeta).not.toHaveBeenCalled();
    expect(screen.queryByText("Checklist técnico")).toBeNull();
  });

  it("a recusa fecha a pergunta e a coleta anterior continua intacta", async () => {
    await abrirATela();
    await tocar("Fazer nova vistoria desta ocorrência");

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-recusa")); });

    expect(mockArquivarColeta).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dialogo")).toBeNull();
    expect(screen.queryByText("Checklist técnico")).toBeNull();
  });

  it("confirmada, a coleta anterior é arquivada e o formulário abre", async () => {
    await abrirATela();
    await tocar("Fazer nova vistoria desta ocorrência");

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });

    expect(mockArquivarColeta).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Checklist técnico")).toBeTruthy();
  });

  /*
    "Cancelar" era o rótulo antigo da recusa, e num diálogo lido com pressa ele
    é ambíguo do jeito mais caro possível: cancelar a nova vistoria, ou cancelar
    a que já foi feita?
  */
  it("os dois botões dizem o que fazem, sem 'OK' e sem 'Cancelar'", async () => {
    await abrirATela();
    await tocar("Fazer nova vistoria desta ocorrência");

    expect(screen.getByTestId("dialogo-acao").props.accessibilityLabel)
      .toBe("Fazer nova vistoria");
    expect(screen.getByTestId("dialogo-recusa").props.accessibilityLabel)
      .toBe("Manter só a vistoria que já fiz");
  });

  it("o estado da coleta anterior aparece num selo com símbolo, e não só na frase", async () => {
    // Quem abriu esta tela por engano, de relance, no meio da rua, precisa
    // distinguir "já subiu" de "ainda está no aparelho" sem ler o parágrafo.
    await abrirATela();
    expect(screen.getByLabelText("A vistoria está na fila de envio deste aparelho"))
      .toBeTruthy();
    expect(screen.getByText("Na fila de envio")).toBeTruthy();
  });
});

describe("a confirmação de que a vistoria foi guardada", () => {
  beforeEach(() => { mockRascunho = rascunhoPronto(); });

  /** Vai até o fim: abre a minuta e conclui a coleta. */
  async function concluirAVistoria(): Promise<void> {
    await abrirATela();
    await tocar("Revisar e concluir");
    await tocar("Concluir vistoria");
  }

  it("a coleta entra na fila e a confirmação aparece", async () => {
    await concluirAVistoria();

    expect(mockEnfileirar).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Vistoria guardada")).toBeTruthy();
  });

  it("com a confirmação apenas ABERTA, a tela NÃO volta para a lista", async () => {
    /*
      Este é o par do defeito das outras três: aqui o que não pode acontecer
      sozinho não é destruição, é navegação. Voltar antes de o agente ler onde a
      vistoria foi parar deixa exatamente a dúvida ("cadê a minha vistoria?")
      que faz gente refazer a coleta por precaução, e refazer é o custo que este
      produto inteiro existe para evitar.
    */
    await concluirAVistoria();

    expect(router.back).not.toHaveBeenCalled();
  });

  it("o botão diz para onde leva, e é ele que volta para a lista", async () => {
    await concluirAVistoria();

    expect(screen.getByTestId("dialogo-acao").props.accessibilityLabel)
      .toBe("Voltar para a lista de tarefas");

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("não oferece recusa, porque não existe desfazer: a coleta já está na fila", async () => {
    await concluirAVistoria();
    expect(screen.queryByTestId("dialogo-recusa")).toBeNull();
  });
});
