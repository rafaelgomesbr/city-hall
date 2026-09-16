import { act, render } from "@testing-library/react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo" } } },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("./PortaExpo", () => ({ portaExpo: null }));

jest.mock("./convite", () => ({
  jaConvidou: jest.fn(async () => true),
  marcarConvidado: jest.fn(async () => undefined),
}));

jest.mock("./ficha-do-aparelho", () => ({
  guardarFicha: jest.fn(async () => undefined),
  fichaGuardada: jest.fn(async () => null),
  esquecerFicha: jest.fn(async () => undefined),
}));

jest.mock("../dados/api", () => ({
  ...jest.requireActual("../dados/api"),
  registrarAparelho: jest.fn(async () => undefined),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    carregando: false,
    identidade: {
      usuarioId: "u1",
      nome: "Agente de teste",
      matricula: "0001",
      papel: "agente_campo",
      organizacaoId: MUNICIPIO_A,
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
    obterToken: async () => "token-de-mentira",
    entrar: async () => undefined,
    sair: async () => undefined,
  }),
}));

type TarefaNova = { id: string; severidade: string | null };
let mockOuvinte: ((novas: readonly TarefaNova[]) => void) | null = null;
const mockMarcarVistas = jest.fn(async (_ids: readonly string[]) => undefined);

jest.mock("../dados/pendencias", () => ({
  aoChegarTarefaNova: (ouvinte: (novas: readonly TarefaNova[]) => void) => {
    mockOuvinte = ouvinte;
    return () => { if (mockOuvinte === ouvinte) mockOuvinte = null; };
  },
  marcarTarefasVistas: (ids: readonly string[]) => mockMarcarVistas(ids),
}));

const mockTatil = jest.fn((_momento: string) => undefined);
jest.mock("../ui/retornoTatil", () => ({
  retornoTatil: (momento: string) => mockTatil(momento),
}));

const MUNICIPIO_A = "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa";
const OCORRENCIA = "11111111-2222-3333-4444-555555555555";
const OUTRA = "22222222-2222-4222-8222-222222222222";

import { criarDuploDePorta } from "./duplo-de-porta";
import { ProvedorDePush } from "./ProvedorDePush";

/**
 * O MESMO DESPACHO TOCA UMA VEZ, VENHA POR ONDE VIER.
 *
 * Com o aplicativo aberto, o mesmo fato chega por dois caminhos: a atualização
 * da lista descobre a tarefa e mostra um aviso LOCAL (com som), e a Apple ou
 * o Google entregam o push do mesmo despacho, segundos ou minutos depois. O
 * caminho inverso (push primeiro, lista depois) já era coberto por
 * `marcarTarefasVistas`. Este (lista primeiro, push depois) não era: o
 * tratador de apresentação não consultava nada e dizia "mostra e toca" para o
 * push de uma ocorrência que o aplicativo tinha acabado de anunciar. Dois
 * toques pelo mesmo fato é o que ensina alguém a calar o canal de despacho, e
 * a partir daí o despacho crítico das três da manhã também não toca.
 *
 * A memória é o conjunto de ocorrências já ANUNCIADAS neste processo, e o
 * aviso local carrega a própria origem no dado (`origem: "aplicativo"`) para o
 * tratador saber que ele é o primeiro anúncio, e não o segundo.
 */

beforeEach(() => {
  mockOuvinte = null;
  mockMarcarVistas.mockClear();
  mockTatil.mockClear();
});

async function montar(duplo: ReturnType<typeof criarDuploDePorta>): Promise<void> {
  await act(async () => {
    render(<ProvedorDePush porta={duplo.porta}>{null}</ProvedorDePush>);
  });
  await act(async () => {});
}

/** A camada de dados descobriu tarefa nova na atualização da lista. */
async function chegarPelaLista(novas: TarefaNova[]): Promise<void> {
  if (!mockOuvinte) throw new Error("o provedor não está ouvindo a camada de dados");
  const ouvinte = mockOuvinte;
  await act(async () => { ouvinte(novas); });
  await act(async () => {});
}

/** O push como a Apple ou o Google o entregam com o aplicativo aberto. */
function pushRemoto(ocorrenciaId: string, tipo = "tarefa_nova") {
  return {
    data: { tipo, organizacaoId: MUNICIPIO_A, ocorrenciaId, severidade: "baixa" },
    body: null,
  };
}

describe("lista primeiro, push depois", () => {
  it("o aviso local toca, e o push do mesmo despacho que chega depois fica calado e escondido", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    await chegarPelaLista([{ id: OCORRENCIA, severidade: "baixa" }]);
    expect(duplo.registro.avisosLocais).toHaveLength(1);
    const local = duplo.registro.avisosLocais[0]!;

    // O sistema consulta o tratador para o aviso local que o aplicativo pediu.
    expect(duplo.chegarComOAplicativoAberto({ data: local.dados, body: null }))
      .toEqual({ mostrar: true, som: true });

    // E minutos depois chega o push do mesmo despacho.
    // Se isto tocar, o push do despacho já anunciado tocou de novo.
    expect(duplo.chegarComOAplicativoAberto(pushRemoto(OCORRENCIA)))
      .toEqual({ mostrar: false, som: false });
  });

  it("outra ocorrência continua tocando", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    await chegarPelaLista([{ id: OCORRENCIA, severidade: "baixa" }]);
    expect(duplo.chegarComOAplicativoAberto(pushRemoto(OUTRA)))
      .toEqual({ mostrar: true, som: true });
  });
});

describe("push primeiro, lista depois", () => {
  it("o push toca, e a lista que descobre a mesma tarefa em seguida não mostra aviso local nem vibra", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    expect(duplo.chegarComOAplicativoAberto(pushRemoto(OCORRENCIA)))
      .toEqual({ mostrar: true, som: true });

    /*
      No aparelho, `marcarTarefasVistas` já impede a lista de anunciar. Aqui
      ela está dublada, então a lista anuncia mesmo assim: é o que prova que
      o provedor tem memória própria, e não depende só do disco.
    */
    await chegarPelaLista([{ id: OCORRENCIA, severidade: "baixa" }]);
    expect(duplo.registro.avisosLocais).toEqual([]);
    expect(mockTatil).not.toHaveBeenCalled();
  });

  it("numa atualização com uma tarefa já anunciada e outra nova, só a nova toca, e vibra uma vez", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);
    duplo.chegarComOAplicativoAberto(pushRemoto(OCORRENCIA));

    await chegarPelaLista([
      { id: OCORRENCIA, severidade: "baixa" },
      { id: OUTRA, severidade: "alta" },
    ]);
    expect(duplo.registro.avisosLocais.map((a) => a.dados["ocorrenciaId"])).toEqual([OUTRA]);
    expect(mockTatil).toHaveBeenCalledTimes(1);
  });
});

describe("o que a memória NÃO alcança, de propósito", () => {
  it("o prazo vencendo não passa pela memória: ele não é despacho", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);
    await chegarPelaLista([{ id: OCORRENCIA, severidade: "alta" }]);

    // O prazo da mesma ocorrência, horas depois, é outro fato.
    expect(duplo.chegarComOAplicativoAberto(pushRemoto(OCORRENCIA, "prazo_vencendo")).mostrar)
      .toBe(true);
  });
});
