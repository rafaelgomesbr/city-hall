import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import TelaDeVistoria from "../app/(agente)/vistoria/[id]";

/**
 * A FOTO DA VISTORIA, com o módulo de disco REAL e um disco fiel (V2-F00-E16,
 * correção 2).
 *
 * Os outros testes da tela substituem `../dados/evidencia-no-disco` inteiro, e o
 * teste do módulo substitui `expo-file-system`: cada camada era verde contra um
 * dublê que concordava com o da outra e discordava da biblioteca. No emulador
 * Android a rodada 2 da validação achou o resultado: toda foto recusada como
 * "o arquivo saiu vazio", porque a cópia (assíncrona) não era esperada. Este
 * arquivo liga `fotografar` ao `guardarFotoNoAparelho` verdadeiro: a câmera
 * devolve um caminho de cache, o disco só materializa a cópia depois de um
 * tick, e a tela precisa mostrar "Fotografias (1)".
 */

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

const mockTirarFoto = jest.fn(async () => {
  mockDisco.set("file:///cache/foto.jpg", 812_345);
  return { uri: "file:///cache/foto.jpg" };
});
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

/*
  O disco, FIEL ao `expo-file-system` 57: `copy` é assíncrona e o destino só
  existe depois de um tick; `size` é 0 para arquivo que ainda não existe. O
  módulo `../dados/evidencia-no-disco` NÃO é substituído aqui: é o real que
  roda, e é isso que nenhum outro teste de tela fazia.
*/
const mockDisco = new Map<string, number>();
jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documentos" },
  File: class {
    uri: string;
    constructor(base: string | { document: string }, nome?: string) {
      const raiz = typeof base === "string" ? base : base.document;
      this.uri = nome ? `${raiz}/${nome}` : raiz;
    }
    get size(): number { return mockDisco.get(this.uri) ?? 0; }
    get exists(): boolean { return mockDisco.has(this.uri); }
    bytesSync(): Uint8Array {
      if (!mockDisco.has(this.uri)) throw new Error("File does not exist");
      return new Uint8Array(mockDisco.get(this.uri) ?? 0);
    }
    async copy(destino: { uri: string }): Promise<void> {
      await new Promise<void>((resolver) => { setTimeout(resolver, 0); });
      mockDisco.set(destino.uri, mockDisco.get(this.uri) ?? 0);
    }
    delete(): void { mockDisco.delete(this.uri); }
  },
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

async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await screen.findByText("Checklist técnico");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContadorDeChaves = 0;
  mockRascunhoGuardado = null;
  mockPermissaoDeCamera = { granted: true };
  mockPermissaoDeLocal = { granted: true };
  mockDisco.clear();
});

afterEach(() => { jest.restoreAllMocks(); });

describe("tirar a foto com o disco de verdade", () => {
  it("a foto é aceita: 'Fotografias (1)', sem a tarja de arquivo vazio", async () => {
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("Tirar a fotografia")); });
    // A cópia assíncrona termina depois de um tick; a tela espera por ela.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(screen.queryByText(/arquivo saiu vazio/)).toBeNull();
    expect(screen.queryByTestId("tarja-de-erro")).toBeNull();
    expect(screen.getByText("Fotografias (1)")).toBeTruthy();

    /* O rascunho guarda o caminho do DOCUMENTO e o tamanho da cópia, nunca o do cache. */
    const { salvarRascunho } = jest.requireMock("../dados/rascunho") as {
      salvarRascunho: jest.Mock;
    };
    const gravado = salvarRascunho.mock.calls.at(-1)?.[0] as {
      fotos: { uriLocal: string; tamanhoBytes: number }[];
    };
    expect(gravado.fotos).toHaveLength(1);
    expect(gravado.fotos[0]?.uriLocal).toMatch(/^file:\/\/\/documentos\/foto-\d+-0\.jpg$/);
    expect(gravado.fotos[0]?.tamanhoBytes).toBe(812_345);
  });
});
