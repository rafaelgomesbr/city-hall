import { AccessibilityInfo, ScrollView } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { CHAVE_ACIONAR_ORGAO, CHECKLIST_OBRIGATORIO, uuidSchema } from "@dc360/shared";
import type { Pendencia } from "../dados/api";
import { salvarRascunho } from "../dados/rascunho";
import TelaDeVistoria, { secaoDoCampoRecusado } from "../app/(agente)/vistoria/[id]";

/**
 * A VISTORIA NÃO SAI DO APARELHO QUEBRADA.
 *
 * 15/09/2026, com as capturas do dono: a vistoria 000009/2026 concluiu no
 * iPhone ("Vistoria guardada", "ela sobe sozinha") com a fotografia em
 * `tamanhoBytes: 0` e a assinatura com chave fora de UUID. O servidor recusou
 * a fotografia três vezes com 422 e a coleta ficou parada na fila, sem botão de
 * editar. Palavras dele: "o ideal é nem deixar ir pra fila de envio, não deixar
 * finalizar a ocorrência caso houver pendências no formulário; além de não
 * informar o que falta preencher fica só ali sem ir pra lugar nenhum".
 *
 * O que fica travado aqui, do ponto de vista de quem está com o aparelho:
 *
 * 1. A coleta de hoje NÃO entra na fila: a conferência com o MESMO esquema do
 *    servidor reprova antes, e a tela lista os campos, com caminho até a seção.
 * 2. A assinatura sai com chave UUID, cunhada uma vez e guardada no rascunho.
 * 3. A coleta que voltou da fila para correção abre com a lista do que o
 *    servidor recusou, e ao concluir de novo leva a MESMA chave, a MESMA data
 *    do ato e as MESMAS chaves de fotografia (achados 1 e 2 do revisor de
 *    integridade da prova).
 * 4. Fotografia já confirmada no servidor não pode ser apagada na correção
 *    (achado 3 do revisor): apagá-la faria o laudo dizer que ela foi anexada
 *    fora do fluxo, sem agente responsável, o que é falso.
 */

/* ============================================================
   O aparelho, de mentira
   ============================================================ */

jest.mock("expo-router", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useEffect } = require("react") as typeof import("react");
  const navegacao = { setOptions: jest.fn() };
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
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

/* UUIDs de verdade, em sequência: o esquema do servidor exige UUID. */
let mockContadorDeChaves = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockContadorDeChaves += 1;
    return `cccccccc-cccc-4ccc-8ccc-${String(mockContadorDeChaves).padStart(12, "0")}`;
  },
}));

jest.mock("expo-file-system", () => ({
  File: class { size = 0; constructor(_uri: string) {} },
}));

/** O tamanho que o disco responde para cada arquivo. Ausente é 1024. */
let mockTamanhos: Record<string, number> = {};
jest.mock("../dados/evidencia-no-disco", () => ({
  guardarFotoNoAparelho: () => ({ uriLocal: "file:///documentos/foto-nova.jpg", tamanhoBytes: 1024 }),
  apagarFotoDoAparelho: jest.fn(() => true),
  medirArquivoNoAparelho: (uri: string) => mockTamanhos[uri] ?? 1024,
}));

jest.mock("../ui/Assinatura", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Pressable, Text } = require("react-native") as typeof import("react-native");
  return {
    Assinatura: ({ aoConfirmar }: { aoConfirmar: (uri: string) => void }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Confirmar assinatura"
        onPress={() => { aoConfirmar("file:///documentos/assinatura.png"); }}
      >
        <Text>Confirmar assinatura</Text>
      </Pressable>
    ),
  };
});

jest.mock("../ui/retornoTatil", () => ({ retornoTatil: jest.fn() }));
jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));
jest.mock("../dados/mapa", () => ({
  ...jest.requireActual("../dados/mapa"),
  abrirNoMapa: jest.fn(async () => true),
}));

const OCORRENCIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAVE = "11111111-1111-4111-8111-000000000009";
const CHAVE_DA_FOTO = "ffffffff-1111-4111-8111-000000000001";
const CHAVE_DA_ASSINATURA = "ffffffff-2222-4222-8222-000000000002";

const OCORRENCIA: Pendencia = {
  id: OCORRENCIA_ID,
  protocolo: "000009/2026",
  tipo: "deslizamento",
  severidade: "alta",
  endereco: "Servidão do Morro, 45",
  ponto_referencia: null,
  latitude: -27.595378,
  longitude: -48.54805,
  descricao: "Barranco escorregou sobre os fundos da casa.",
  solicitante_nome: "Maria de exemplo",
  solicitante_contato: null,
  vulnerabilidade_presente: false,
  vulnerabilidade_descricao: null,
  prazo_em: null,
  criado_em: "2026-09-15T18:00:00.000Z",
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
    lerIdentidade: () => null,
    identidade: {
      nome: "Klaus Berger", matricula: "0009",
      organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
    },
  }),
}));

type RascunhoDeTeste = Record<string, unknown>;
let mockRascunhoGuardado: RascunhoDeTeste | null = null;
jest.mock("../dados/rascunho", () => ({
  ...jest.requireActual("../dados/rascunho"),
  lerRascunho: jest.fn(async () => mockRascunhoGuardado),
  salvarRascunho: jest.fn(async () => {}),
  descartarRascunho: jest.fn(async () => {}),
}));

/* ============================================================
   Utilidades
   ============================================================ */

const CHECKLIST_COMPLETO = Object.fromEntries(
  CHECKLIST_OBRIGATORIO.map((i) => [i.chave, i.chave !== CHAVE_ACIONAR_ORGAO]),
);

const FOTO = {
  idempotencyKey: CHAVE_DA_FOTO,
  uriLocal: "file:///documentos/foto-1.jpg",
  nomeArquivo: "vistoria-000009-2026-1.jpg",
  tipoConteudo: "image/jpeg",
  tamanhoBytes: 812_345,
  capturadaEm: "2026-09-15T20:41:00.000Z",
  ordem: 0,
};

/** A vistoria 000009/2026 como ela estava no aparelho ao concluir. */
function rascunhoDeHoje(mudanca: RascunhoDeTeste = {}): RascunhoDeTeste {
  return {
    ocorrenciaId: OCORRENCIA_ID,
    protocolo: "000009/2026",
    idempotencyKey: CHAVE,
    checklist: CHECKLIST_COMPLETO,
    orgaosParaAcionar: [],
    fotos: [FOTO],
    gpsPrecisaoMetros: 11,
    coordenada: { lat: -27.595378, lng: -48.54805 },
    assinanteNome: "Klaus",
    assinaturaUri: "file:///documentos/assinatura.png",
    assinaturaIdempotencyKey: null,
    observacoes: "",
    pessoas: {},
    coletadaEm: "2026-09-15T20:40:00.000Z",
    atualizadoEm: "2026-09-15T20:58:00.000Z",
    ...mudanca,
  };
}

async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await screen.findByText("Checklist técnico");
}

async function concluir(): Promise<void> {
  await fireEvent.press(screen.getByText("Revisar e concluir"));
  await act(async () => {});
  await fireEvent.press(screen.getByText("Concluir vistoria"));
  await act(async () => {});
}

type Enfileirado = [
  { idempotencyKey: string; coletadaEm: string; ocorrenciaId: string },
  { fotos: Array<{ idempotencyKey: string }>; assinatura?: { idempotencyKey: string; tamanhoBytes: number } },
];

function enfileirado(): Enfileirado {
  return mockEnfileirar.mock.calls[0] as unknown as Enfileirado;
}

function ultimoGravado(): RascunhoDeTeste {
  return jest.mocked(salvarRascunho).mock.calls.at(-1)?.[0] as unknown as RascunhoDeTeste;
}

let rolar: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-15T21:00:00.000Z"));
  mockContadorDeChaves = 0;
  mockRascunhoGuardado = null;
  mockTamanhos = {};
  rolar = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/* ============================================================
   1. A coleta de hoje não entra na fila
   ============================================================ */

describe("a vistoria de 15/09/2026, concluída de novo com a conferência na frente", () => {
  it("NÃO entra na fila: a foto de tamanho zero e a assinatura são apontadas, com caminho", async () => {
    mockRascunhoGuardado = rascunhoDeHoje({ fotos: [{ ...FOTO, tamanhoBytes: 0 }] });
    // O disco também responde zero para ela: o arquivo não está lá.
    mockTamanhos["file:///documentos/foto-1.jpg"] = 0;
    await abrirATela();

    await concluir();

    expect(mockEnfileirar).not.toHaveBeenCalled();
    expect(screen.queryByText("Vistoria guardada")).toBeNull();

    const lista = screen.getByTestId("lista-do-que-corrigir");
    expect(within(lista).getByText("Tamanho do arquivo (item 1)")).toBeTruthy();
    expect(within(lista).getByText(
      "O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele.",
    )).toBeTruthy();
    // A linha leva à seção das fotografias. `onLayout` não dispara sozinho em
    // árvore de teste; disparar à mão é o aparelho ter medido a tela.
    await act(async () => {
      fireEvent(screen.getByTestId("ancora-fotos"), "layout", {
        nativeEvent: { layout: { x: 0, y: 1200, width: 360, height: 300 } },
      });
    });
    await act(async () => { fireEvent.press(screen.getByTestId("corrigir-fotos")); });
    expect(rolar).toHaveBeenCalled();
    expect((rolar.mock.calls.at(-1)?.[0] as { y: number }).y).toBeGreaterThan(1000);
    // E a lista fica gravada no rascunho: o Android pode matar o aplicativo.
    expect(ultimoGravado()["camposRecusados"]).toEqual([
      expect.objectContaining({ campo: "fotos.0.tamanhoBytes" }),
    ]);
  });

  it("a assinatura que está no disco com zero bytes é apontada na seção dela", async () => {
    mockRascunhoGuardado = rascunhoDeHoje();
    mockTamanhos["file:///documentos/assinatura.png"] = 0;
    await abrirATela();

    await concluir();

    expect(mockEnfileirar).not.toHaveBeenCalled();
    const lista = screen.getByTestId("lista-do-que-corrigir");
    expect(within(lista).getByText("Arquivo da assinatura")).toBeTruthy();
    expect(screen.getByTestId("corrigir-assinatura")).toBeTruthy();
  });

  it("com tudo certo, entra na fila com a assinatura em UUID e os tamanhos medidos", async () => {
    mockRascunhoGuardado = rascunhoDeHoje({ fotos: [{ ...FOTO, tamanhoBytes: 0 }] });
    mockTamanhos["file:///documentos/foto-1.jpg"] = 812_345;
    mockTamanhos["file:///documentos/assinatura.png"] = 4_096;
    await abrirATela();

    await concluir();

    expect(mockEnfileirar).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Vistoria guardada")).toBeTruthy();
    const [envelope, dados] = enfileirado();
    expect(envelope.idempotencyKey).toBe(CHAVE);
    // O tamanho que vai é o medido agora, não o zero gravado na captura.
    expect(dados.fotos[0]).toEqual(expect.objectContaining({ tamanhoBytes: 812_345 }));
    // A assinatura sai com UUID, e não com `<chave>-assinatura`.
    expect(uuidSchema.safeParse(dados.assinatura?.idempotencyKey).success).toBe(true);
    expect(dados.assinatura?.idempotencyKey).not.toContain("assinatura");
    expect(dados.assinatura?.tamanhoBytes).toBe(4_096);
  });
});

/* ============================================================
   2. A chave da assinatura é cunhada uma vez e guardada
   ============================================================ */

describe("a chave da assinatura", () => {
  it("é cunhada na conclusão e guardada no rascunho quando não existia", async () => {
    mockRascunhoGuardado = rascunhoDeHoje();
    await abrirATela();

    await concluir();

    const chave = enfileirado()[1].assinatura?.idempotencyKey;
    expect(uuidSchema.safeParse(chave).success).toBe(true);
    const gravados = jest.mocked(salvarRascunho).mock.calls.map(
      (c) => (c[0] as unknown as RascunhoDeTeste)["assinaturaIdempotencyKey"],
    );
    expect(gravados).toContain(chave);
  });

  it("é REUSADA quando o rascunho já a tem: a mesma assinatura não vira duas no servidor", async () => {
    mockRascunhoGuardado = rascunhoDeHoje({ assinaturaIdempotencyKey: CHAVE_DA_ASSINATURA });
    await abrirATela();

    await concluir();

    expect(enfileirado()[1].assinatura?.idempotencyKey).toBe(CHAVE_DA_ASSINATURA);
  });
});

/* ============================================================
   3. A coleta que voltou da fila para correção
   ============================================================ */

describe("a coleta que voltou da fila para correção", () => {
  const RECUSA = [
    { campo: "tamanhoBytes", mensagem: "O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele." },
  ];

  it("abre com a lista do que o servidor recusou", async () => {
    mockRascunhoGuardado = rascunhoDeHoje({ camposRecusados: RECUSA });
    await abrirATela();

    const lista = screen.getByTestId("lista-do-que-corrigir");
    expect(within(lista).getByText("Tamanho do arquivo")).toBeTruthy();
    expect(within(lista).getByText(RECUSA[0]!.mensagem)).toBeTruthy();
  });

  it("ao concluir de novo, leva a MESMA chave, a MESMA data do ato e as MESMAS chaves de fotografia", async () => {
    /*
      Achados 1 e 2 do revisor de integridade da prova. A data do ato é a da
      vistoria no local, não a da correção; e a chave de cada fotografia é o que
      faz o servidor reconhecer a que já subiu em vez de gravá-la de novo.
    */
    mockRascunhoGuardado = rascunhoDeHoje({
      camposRecusados: RECUSA,
      assinaturaIdempotencyKey: CHAVE_DA_ASSINATURA,
      coletadaEm: "2026-09-15T20:40:00.000Z",
    });
    await abrirATela();
    // A tela foi aberta às 21:00; a correção acontece agora.
    await concluir();

    expect(mockEnfileirar).toHaveBeenCalledTimes(1);
    const [envelope, dados] = enfileirado();
    expect(envelope.idempotencyKey).toBe(CHAVE);
    expect(envelope.coletadaEm).toBe("2026-09-15T20:40:00.000Z");
    expect(dados.fotos.map((f) => f.idempotencyKey)).toEqual([CHAVE_DA_FOTO]);
    expect(dados.assinatura?.idempotencyKey).toBe(CHAVE_DA_ASSINATURA);
  });

  it("fotografia já confirmada no servidor não pode ser apagada: mostra que já subiu", async () => {
    /*
      Achado 3 do revisor: apagar aqui uma foto que o servidor já confirmou
      faria o laudo declará-la "anexada fora do fluxo de vistoria, sem agente
      responsável", que é falso. A rota de sincronização não tem como receber
      uma lista de removidas, então a correção não deixa remover.
    */
    mockRascunhoGuardado = rascunhoDeHoje({
      camposRecusados: RECUSA,
      fotosJaEnviadas: [CHAVE_DA_FOTO],
    });
    await abrirATela();

    expect(screen.queryByTestId("apagar-foto-1")).toBeNull();
    expect(screen.getByText("Já enviada")).toBeTruthy();
  });

  it("fotografia que ainda não subiu continua podendo ser apagada", async () => {
    mockRascunhoGuardado = rascunhoDeHoje({ camposRecusados: RECUSA, fotosJaEnviadas: [] });
    await abrirATela();

    expect(screen.getByTestId("apagar-foto-1")).toBeTruthy();
    expect(screen.queryByText("Já enviada")).toBeNull();
  });
});

/* ============================================================
   4. O caminho de cada campo recusado
   ============================================================ */

describe("secaoDoCampoRecusado", () => {
  it("leva cada caminho do esquema à seção da tela, e diz quando não há para onde ir", () => {
    expect(secaoDoCampoRecusado("fotos.0.tamanhoBytes")).toBe("fotos");
    expect(secaoDoCampoRecusado("vistoria.fotos.2.capturadaEm")).toBe("fotos");
    expect(secaoDoCampoRecusado("assinatura.idempotencyKey")).toBe("assinatura");
    expect(secaoDoCampoRecusado("vistoria.assinanteNome")).toBe("assinatura");
    expect(secaoDoCampoRecusado("vistoria.assinaturaChave")).toBe("assinatura");
    expect(secaoDoCampoRecusado("vistoria.checklist")).toBe("checklist");
    expect(secaoDoCampoRecusado("vistoria.orgaosParaAcionar")).toBe("checklist");
    expect(secaoDoCampoRecusado("vistoria.coordenada.lat")).toBe("localizacao");
    expect(secaoDoCampoRecusado("vistoria.gpsPrecisaoMetros")).toBe("localizacao");
    expect(secaoDoCampoRecusado("idempotencyKey")).toBeNull();
  });
});
