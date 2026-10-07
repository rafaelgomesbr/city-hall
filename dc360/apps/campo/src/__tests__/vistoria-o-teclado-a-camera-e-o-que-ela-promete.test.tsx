import { Linking, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import { salvarRascunho } from "../dados/rascunho";
import { espaco } from "../ui/tokens";
import TelaDeVistoria from "../app/(agente)/vistoria/[id]";

/**
 * AS PONTAS SOLTAS DA VISTORIA, provadas com o aparelho na mão em 15/09/2026.
 *
 * Seis achados de um revisor cético, nenhum deles "a tela não funciona":
 *
 * 1. A tela de "vistoria guardada" prometia que a coleta "sobe assim que houver
 *    rede, mesmo com o aplicativo fechado". Não há sincronização em segundo
 *    plano neste aplicativo (nenhum `expo-task-manager`, nenhum
 *    `BackgroundFetch`, nenhum `UIBackgroundModes`): a fila drena enquanto o
 *    aplicativo está aberto. A frase era falsa, no momento mais alto do produto.
 * 2. O formulário não tratava teclado: "digitei o nome e toquei em Tirar foto:
 *    o teclado fechou e nada aconteceu". O primeiro toque com o teclado aberto
 *    só fechava o teclado. E no iOS o teclado cobria o campo que estava sendo
 *    digitado, porque a rolagem não sabia da altura dele.
 * 3. A câmera é tela cheia, esconde o menu e não reservava a área segura de
 *    baixo: o obturador e "Voltar sem fotografar" ficavam em cima da barra do
 *    sistema no aparelho sem botão físico.
 * 4. Permissão negada de câmera ou de localização era uma frase ("libere nas
 *    configurações") sem botão, enquanto o Perfil já tem "Abrir os ajustes do
 *    aparelho" para as notificações.
 * 5. Precisão de GPS abaixo de meio metro arredondava para ZERO, e o esquema
 *    do servidor exige positivo: o agente com o melhor GPS do plantão era o
 *    único que não conseguia concluir, e a frase de recusa vinha em inglês.
 * 6. `guardarFotoNoAparelho` lança a frase certa quando o arquivo sai vazio
 *    ("Tire a foto de novo"), e `fotografar` a engolia e escrevia a genérica.
 *
 * O arquivo mora em `__tests__` e não ao lado da tela porque tudo dentro de
 * `src/app` vira ROTA no Expo.
 */

/* ============================================================
   O aparelho, de mentira
   ============================================================ */

jest.mock("expo-router", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useEffect } = require("react") as typeof import("react");
  const navegacao = { setOptions: jest.fn() };
  return {
    router: {
      back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true),
    },
    useLocalSearchParams: () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" }),
    useNavigation: () => navegacao,
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
  };
});

const mockTirarFoto = jest.fn(async () => ({ uri: "file:///cache/foto.jpg" }));
let mockPermissaoDeCamera = { granted: true };
const mockPedirCamera = jest.fn(async () => mockPermissaoDeCamera);
jest.mock("expo-camera", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { forwardRef, useImperativeHandle } = require("react") as typeof import("react");
  return {
    CameraView: forwardRef((_props: Record<string, unknown>, ref) => {
      useImperativeHandle(ref, () => ({ takePictureAsync: () => mockTirarFoto() }));
      return null;
    }),
    useCameraPermissions: () => [mockPermissaoDeCamera, mockPedirCamera],
  };
});

let mockPermissaoDeLocal = { granted: true };
let mockPosicao = { coords: { latitude: -27.595900, longitude: -48.548900, accuracy: 8 } };
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: async () => mockPermissaoDeLocal,
  getCurrentPositionAsync: async () => mockPosicao,
}));

let mockContadorDeChaves = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockContadorDeChaves += 1;
    return `cccccccc-cccc-4ccc-8ccc-${String(mockContadorDeChaves).padStart(12, "0")}`;
  },
}));

jest.mock("expo-file-system", () => ({
  File: class { size = 1024; constructor(_uri: string) {} },
}));

/** O que a cópia da foto para o disco faz. Cada caso ajusta. */
let mockGuardarFoto: () => { uriLocal: string; tamanhoBytes: number } = () => ({
  uriLocal: "file:///vistorias/foto.jpg", tamanhoBytes: 1024,
});
jest.mock("../dados/evidencia-no-disco", () => ({
  guardarFotoNoAparelho: () => mockGuardarFoto(),
  apagarFotoDoAparelho: () => true,
  medirArquivoNoAparelho: () => 1024,
}));

jest.mock("../ui/Assinatura", () => ({ Assinatura: () => null }));
jest.mock("../ui/retornoTatil", () => ({ retornoTatil: jest.fn() }));
jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));
jest.mock("../dados/mapa", () => ({
  ...jest.requireActual("../dados/mapa"),
  abrirNoMapa: jest.fn(async () => true),
}));
jest.mock("../dados/historico-da-casa", () => ({
  ...jest.requireActual("../dados/historico-da-casa"),
  buscarHistoricoDaCasa: async () => ({
    estado: "chegou",
    historico: {
      vistoriaAnterior: null, providencias: [], vinculadas: [], devolucao: null, fotosDeAntes: [],
    },
  }),
}));

const OCORRENCIA: Pendencia = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
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

jest.mock("../dados/pendencias", () => ({
  pendenciaGuardada: async () => OCORRENCIA,
  orgaosGuardados: async () => [],
  atualizarPendencias: jest.fn(async () => {}),
}));

jest.mock("../dados/coletas", () => ({
  coletaDe: async () => null,
  marcarColetada: jest.fn(async () => {}),
  arquivarColeta: jest.fn(async () => {}),
}));

const mockEnfileirar = jest.fn(async (..._args: unknown[]) => ({}));
const mockFila = { enfileirar: (...args: unknown[]) => mockEnfileirar(...args) };
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: async () => null,
    identidade: {
      nome: "Agente de teste", matricula: "0001",
      organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
    },
  }),
}));

type RascunhoDeTeste = Record<string, unknown>;
let mockRascunhoGuardado: RascunhoDeTeste | null = null;
jest.mock("../dados/rascunho", () => ({
  lerRascunho: jest.fn(async () => mockRascunhoGuardado),
  salvarRascunho: jest.fn(async () => {}),
  descartarRascunho: jest.fn(async () => {}),
  rascunhoNovo: (ocorrenciaId: string, protocolo: string, idempotencyKey: string) => ({
    ocorrenciaId, protocolo, idempotencyKey,
    checklist: {}, orgaosParaAcionar: [], fotos: [],
    gpsPrecisaoMetros: null, coordenada: null,
    assinanteNome: "", assinaturaUri: null, observacoes: "", pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:00:00.000Z",
  }),
}));

/* ============================================================
   Utilidades
   ============================================================ */

function rascunhoPronto(): RascunhoDeTeste {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { CHAVE_ACIONAR_ORGAO, CHECKLIST_OBRIGATORIO } =
    require("@dc360/shared") as typeof import("@dc360/shared");
  return {
    ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    protocolo: "2026/000123",
    idempotencyKey: "11111111-1111-4111-8111-000000000123",
    checklist: Object.fromEntries(
      CHECKLIST_OBRIGATORIO.map((i) => [i.chave, i.chave !== CHAVE_ACIONAR_ORGAO]),
    ),
    orgaosParaAcionar: [],
    fotos: [{
      idempotencyKey: "ffffffff-1111-4111-8111-000000000001",
      uriLocal: "file:///vistorias/foto.jpg",
      nomeArquivo: "vistoria-1.jpg",
      tipoConteudo: "image/jpeg",
      tamanhoBytes: 1024,
      capturadaEm: "2026-09-09T12:00:00.000Z",
      ordem: 0,
    }],
    gpsPrecisaoMetros: null, coordenada: null,
    assinanteNome: "Maria de exemplo",
    assinaturaUri: "file:///vistorias/assinatura.png",
    observacoes: "", pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:00:00.000Z",
  };
}

async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await screen.findByText("Checklist técnico");
}

function ultimoGravado(): RascunhoDeTeste {
  return jest.mocked(salvarRascunho).mock.calls.at(-1)?.[0] as unknown as RascunhoDeTeste;
}

function recuoDeBaixo(estilo: unknown): number {
  return Number((StyleSheet.flatten(estilo as never) as { paddingBottom?: number }).paddingBottom ?? 0);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContadorDeChaves = 0;
  mockRascunhoGuardado = null;
  mockPermissaoDeCamera = { granted: true };
  mockPermissaoDeLocal = { granted: true };
  mockPosicao = { coords: { latitude: -27.595900, longitude: -48.548900, accuracy: 8 } };
  mockGuardarFoto = () => ({ uriLocal: "file:///vistorias/foto.jpg", tamanhoBytes: 1024 });
});

afterEach(() => { jest.restoreAllMocks(); });

/* ============================================================
   1. O que a tela de conclusão promete
   ============================================================ */

describe("a tela de 'vistoria guardada'", () => {
  it("não promete envio com o aplicativo fechado, porque isso não existe", async () => {
    mockRascunhoGuardado = rascunhoPronto();
    await abrirATela();
    await act(async () => { fireEvent.press(screen.getByText("Revisar e concluir")); });
    await act(async () => { fireEvent.press(screen.getByText("Concluir vistoria")); });
    await act(async () => {});
    expect(await screen.findByTestId("vistoria-guardada")).toBeTruthy();

    /*
      A fila drena enquanto o aplicativo está aberto (`iniciarSincronizacaoContinua`
      vive dentro do layout das abas). Não há tarefa de segundo plano
      registrada em lugar nenhum, e a frase precisa dizer a verdade que o
      agente vai comprovar: abriu com sinal, subiu.
    */
    expect(screen.queryByText(/mesmo com o aplicativo fechado/)).toBeNull();
    expect(screen.getByText(/quando você abrir o aplicativo com sinal/)).toBeTruthy();
    expect(screen.getByText(/a fila de envio mostra o andamento/i)).toBeTruthy();
    /* V2-F00-E16: nem a frase nem o título prometem coisa alguma em segundo
       plano ("sozinha" era o título antigo). */
    expect(screen.queryByText(/fechado|segundo plano|sozinha/i)).toBeNull();
    expect(screen.getByText(/sobe quando o aplicativo estiver aberto e houver rede/)).toBeTruthy();
  });
});

/* ============================================================
   2. O teclado
   ============================================================ */

describe("o formulário e o teclado", () => {
  it("o primeiro toque fora do campo AGE, em vez de só fechar o teclado", async () => {
    await abrirATela();
    const folha = screen.getByTestId("formulario-da-vistoria");

    /*
      Sem `keyboardShouldPersistTaps="handled"`, um toque em "Tirar foto" com
      o teclado aberto é engolido pela rolagem para fechar o teclado, e o
      agente toca de novo. Com `handled`, o filho que trata o toque o recebe
      na hora; o toque em área vazia continua fechando o teclado.
    */
    expect(folha.props.keyboardShouldPersistTaps).toBe("handled");
  });

  it("a rolagem sabe a altura do teclado, para o campo digitado não ficar embaixo dele", async () => {
    await abrirATela();
    const folha = screen.getByTestId("formulario-da-vistoria");

    /* iOS: o `ScrollView` acrescenta a altura do teclado ao próprio recuo. */
    expect(folha.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });
});

/* ============================================================
   3. A câmera e a área segura
   ============================================================ */

describe("a câmera em tela cheia", () => {
  it("reserva a área segura de baixo, onde o menu escondido não está mais para reservar", async () => {
    const ALTURA_DA_BARRA_DO_SISTEMA = 34;
    await render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 47, bottom: ALTURA_DA_BARRA_DO_SISTEMA, left: 0, right: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <TelaDeVistoria />
      </SafeAreaProvider>,
    );
    await screen.findByText("Checklist técnico");

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    const barra = await screen.findByTestId("barra-da-camera");

    /*
      A tela cheia esconde o menu, e com ele o vão que as outras telas
      reservam. O que sobra embaixo é a barra do sistema do aparelho sem
      botão físico, e o obturador não pode ficar em cima dela.
    */
    expect(recuoDeBaixo(barra.props.style)).toBe(espaco.e5 + ALTURA_DA_BARRA_DO_SISTEMA);
  });
});

/* ============================================================
   4. Permissão negada, com o botão que resolve
   ============================================================ */

describe("a permissão negada", () => {
  it("de câmera: a tarja traz 'Abrir os ajustes do aparelho', e o botão abre os ajustes", async () => {
    mockPermissaoDeCamera = { granted: false };
    const abrirAjustes = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    await act(async () => {});

    expect(mockPedirCamera).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("tarja-de-erro")).toBeTruthy();
    expect(screen.getByText(/Sem permissão de câmera/)).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText("Abrir os ajustes do aparelho")); });
    expect(abrirAjustes).toHaveBeenCalledTimes(1);
    /* E "Fechar" continua existindo: tarja que não sai é tarja que se ignora. */
    expect(screen.getByTestId("fechar-erro")).toBeTruthy();
  });

  it("de localização: a mesma tarja, o mesmo botão", async () => {
    mockPermissaoDeLocal = { granted: false };
    const abrirAjustes = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByTestId("capturar-localizacao")); });
    await act(async () => {});

    expect(screen.getByText(/Sem permissão de localização/)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Abrir os ajustes do aparelho")); });
    expect(abrirAjustes).toHaveBeenCalledTimes(1);
  });

  it("uma falha que não é de permissão não ganha o botão dos ajustes", async () => {
    /* A âncora: o botão só existe onde os ajustes são a saída. */
    mockGuardarFoto = () => { throw new Error("disco cheio"); };
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("Tirar a fotografia")); });
    await act(async () => {});

    expect(screen.getByTestId("tarja-de-erro")).toBeTruthy();
    expect(screen.queryByText("Abrir os ajustes do aparelho")).toBeNull();
  });

  it("o botão não sobrevive à falha seguinte, que não é de permissão (V2-F00-E16)", async () => {
    /*
      A localização negada acende o botão; depois a foto falha no disco. A
      tarja nova é de outra natureza, e os ajustes não resolvem disco cheio.
    */
    mockPermissaoDeLocal = { granted: false };
    mockGuardarFoto = () => { throw new Error("disco cheio"); };
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByTestId("capturar-localizacao")); });
    await act(async () => {});
    expect(screen.getByText("Abrir os ajustes do aparelho")).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("Tirar a fotografia")); });
    await act(async () => {});

    expect(screen.getByText(/disco cheio/)).toBeTruthy();
    expect(screen.queryByText("Abrir os ajustes do aparelho")).toBeNull();
  });

  it("o botão dos ajustes tem nome para o leitor de tela e área de toque de 44", async () => {
    mockPermissaoDeCamera = { granted: false };
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    await act(async () => {});

    /* A tarja é região viva: o leitor de tela lê a falha sem o agente procurar. */
    expect(screen.getByTestId("tarja-de-erro").props.accessibilityLiveRegion).toBe("assertive");
    const botao = screen.getByTestId("abrir-ajustes");
    expect(botao.props.accessibilityRole).toBe("button");
    expect(botao.props.accessibilityLabel).toMatch(/ajustes/);
    const estilo = StyleSheet.flatten(botao.props.style as never) as { minHeight?: number };
    expect(estilo.minHeight ?? 0).toBeGreaterThanOrEqual(44);
  });
});

describe("a câmera que não disparou (V2-F00-E16)", () => {
  it("continua com a frase genérica, porque o erro nativo não diz ao agente o que fazer", async () => {
    mockTirarFoto.mockImplementationOnce(async () => { throw new Error("Camera is not running"); });
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("Tirar a fotografia")); });
    await act(async () => {});

    expect(screen.getByText("O aparelho não conseguiu tirar a foto. Tente de novo.")).toBeTruthy();
    expect(screen.queryByText(/Camera is not running/)).toBeNull();
    expect(screen.queryByText("Abrir os ajustes do aparelho")).toBeNull();
  });
});

/* ============================================================
   5. A precisão do GPS nunca é zero
   ============================================================ */

describe("a precisão da leitura de GPS", () => {
  it("abaixo de meio metro vira 1, e não zero", async () => {
    /*
      `Math.round(0.3)` é 0, `gpsPrecisaoMetros` exige positivo no esquema do
      servidor, e a conclusão reprovava com uma frase em inglês ao lado de
      "Precisão da leitura de GPS". O melhor GPS do plantão era o único que
      não conseguia concluir.
    */
    mockPosicao = { coords: { latitude: -27.595900, longitude: -48.548900, accuracy: 0.3 } };
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByTestId("capturar-localizacao")); });
    await act(async () => {});

    expect(ultimoGravado()["gpsPrecisaoMetros"]).toBe(1);
    /* No singular (V2-F00-E15): o texto exato continua cobrado, e "1 metros"
       era erro de escrita justamente na leitura do melhor GPS. */
    expect(screen.getByText("Precisão de 1 metro")).toBeTruthy();
  });

  it("a leitura comum continua arredondada ao metro", async () => {
    mockPosicao = { coords: { latitude: -27.595900, longitude: -48.548900, accuracy: 7.6 } };
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByTestId("capturar-localizacao")); });
    await act(async () => {});

    expect(ultimoGravado()["gpsPrecisaoMetros"]).toBe(8);
  });

  it("aparelho que não informa a precisão grava nulo, que é 'não informada'", async () => {
    mockPosicao = {
      coords: { latitude: -27.595900, longitude: -48.548900, accuracy: null as unknown as number },
    };
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByTestId("capturar-localizacao")); });
    await act(async () => {});

    expect(ultimoGravado()["gpsPrecisaoMetros"]).toBeNull();
  });
});

/* ============================================================
   6. A frase da foto vazia chega à tela
   ============================================================ */

describe("a foto que saiu vazia do disco", () => {
  it("a tarja diz a frase certa, com o que fazer, e não a genérica", async () => {
    mockGuardarFoto = () => {
      throw new Error(
        "A foto não ficou guardada neste aparelho (o arquivo saiu vazio). Tire a foto de novo.",
      );
    };
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("Tirar a fotografia")); });
    await act(async () => {});

    expect(screen.getByText(/o arquivo saiu vazio/)).toBeTruthy();
    expect(screen.getByText(/Tire a foto de novo/)).toBeTruthy();
    expect(screen.queryByText(/não conseguiu tirar a foto/)).toBeNull();
    /* A câmera fechou e a foto não entrou na coleta. */
    expect(screen.getByText("Checklist técnico")).toBeTruthy();
    expect(screen.getByText("Fotografias (0)")).toBeTruthy();
  });
});
