/**
 * As telas da vistoria que dizem "isto sobe quando houver sinal" não dizem isso
 * com a fila PAUSADA (V2-F00-E06, correção 3).
 *
 * São duas: a de depois de concluir ("Ela sobe com o aplicativo aberto") e a
 * de uma ocorrência que o aparelho já coletou ("A vistoria está na fila de
 * envio e sobe quando ... houver sinal"). Com a sessão encerrada, a conta
 * desativada ou a senha provisória, o servidor já respondeu "não" e sinal não
 * muda isso. As duas telas passaram a ler a pausa que a fila já entrega a quem
 * assina e a dizer a frase da pausa (`frasesDaPausa`, a mesma da faixa do topo
 * e do aviso da fila), sem texto próprio que pudesse divergir.
 *
 * Mora em `__tests__` porque tudo dentro de `src/app` vira ROTA no Expo.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { MotivoDeSessao } from "@dc360/campo";
import type { Pendencia } from "../dados/api";
import { frasesDaPausa } from "../dados/pausa-da-fila";
import TelaDeVistoria from "../app/(agente)/vistoria/[id]";

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

let mockColeta: unknown = null;
jest.mock("../dados/coletas", () => ({
  coletaDe: async () => mockColeta,
  marcarColetada: jest.fn(async () => {}),
  arquivarColeta: jest.fn(async () => {}),
}));

const mockEnfileirar = jest.fn(async (..._args: unknown[]) => ({}));
/* O resumo que a fila entrega a quem assina: é por ele que a tela sabe da pausa. */
let mockPausadaPor: string | null = null;
const mockFila = {
  enfileirar: (...args: unknown[]) => mockEnfileirar(...args),
  assinar: (ouvinte: (r: unknown) => void) => {
    ouvinte({ pendentes: 1, pausadaPor: mockPausadaPor });
    return () => undefined;
  },
};
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

const MOTIVOS: MotivoDeSessao[] = [
  "sessao_encerrada", "conta_desativada", "troca_de_senha_obrigatoria",
];

const COLETA_NA_FILA = {
  ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  idempotencyKey: "chave-da-coleta",
  protocolo: "2026/000123",
  coletadaEm: "2026-09-09T13:00:00.000Z",
  situacao: "na_fila",
};

async function concluirAVistoria(): Promise<void> {
  mockRascunhoGuardado = rascunhoPronto();
  await render(<TelaDeVistoria />);
  await screen.findByText("Checklist técnico");
  await act(async () => { fireEvent.press(screen.getByText("Revisar e concluir")); });
  await act(async () => { fireEvent.press(screen.getByText("Concluir vistoria")); });
  await act(async () => {});
  await screen.findByTestId("vistoria-guardada");
}

async function abrirAColetada(): Promise<void> {
  mockColeta = COLETA_NA_FILA;
  await render(<TelaDeVistoria />);
  await act(async () => {});
  await screen.findByText(/Esta ocorrência já foi coletada/);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContadorDeChaves = 0;
  mockRascunhoGuardado = null;
  mockColeta = null;
  mockPausadaPor = null;
  mockPermissaoDeCamera = { granted: true };
  mockPermissaoDeLocal = { granted: true };
});

describe("depois de concluir a vistoria", () => {
  it("com a fila andando, a promessa de sempre continua valendo", async () => {
    await concluirAVistoria();

    expect(screen.getByText("Ela sobe com o aplicativo aberto")).toBeTruthy();
    expect(screen.getByText(/sobe quando o aplicativo estiver aberto e houver rede/)).toBeTruthy();
  });

  it.each(MOTIVOS)("com a fila pausada por %s, diz a frase da pausa e não manda esperar sinal nem rede", async (motivo) => {
    mockPausadaPor = motivo;

    await concluirAVistoria();

    const frases = frasesDaPausa(motivo);
    expect(screen.getByText(frases.titulo)).toBeTruthy();
    expect(screen.getByText(frases.detalhe)).toBeTruthy();
    expect(screen.queryByText("Ela sobe com o aplicativo aberto")).toBeNull();
    expect(screen.queryByText(/houver rede|houver sinal|com sinal/)).toBeNull();
  });
});

describe("a ocorrência que o aparelho já coletou, ainda na fila", () => {
  it("com a fila andando, diz que sobe quando houver sinal", async () => {
    await abrirAColetada();

    expect(screen.getByText(/sobe quando o aplicativo estiver aberto e houver sinal/)).toBeTruthy();
    expect(screen.getByText(/Isso pode demorar\s+horas sem sinal/)).toBeTruthy();
  });

  it.each(MOTIVOS)("com a fila pausada por %s, diz a frase da pausa e não promete sinal", async (motivo) => {
    mockPausadaPor = motivo;

    await abrirAColetada();

    expect(screen.getByText(new RegExp(
      frasesDaPausa(motivo).detalhe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ))).toBeTruthy();
    expect(screen.queryByText(/houver sinal|horas sem sinal/)).toBeNull();
    /* Não repete "neste aparelho" na mesma frase: o `detalhe` já o diz. */
    expect(screen.queryByText(/já foi coletada neste aparelho/)).toBeNull();
  });
});
