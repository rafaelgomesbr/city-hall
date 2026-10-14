/**
 * O cartão da tarefa não manda esperar sinal quando o que falta é outra coisa
 * (V2-F00-E06, correção 2).
 *
 * O achado 2 do QA da rodada 2: com a coleta guardada e a fila PAUSADA pela
 * sessão (ou pela senha provisória), o cartão da tarefa dizia "O que falta é
 * sinal para enviar" enquanto a faixa do topo dizia "Sessão encerrada". Duas
 * mensagens contraditórias sobre o mesmo fato, e a errada mandava o agente
 * esperar uma rede que já estava funcionando.
 *
 * A tela assina a fila e recebe a pausa no resumo que a fila entrega. Aqui a
 * fila é um dublê que entrega o resumo que o teste escolhe, e o que se
 * confere é o texto que o agente lê no cartão.
 *
 * Mora em `__tests__` porque tudo dentro de `src/app` vira ROTA no Expo.
 */

import { act, render, screen } from "@testing-library/react-native";
import type { ColetaLocal } from "@dc360/campo";
import type { Pendencia } from "../dados/api";

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

jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  enderecoDaApi: () => "https://api.exemplo",
}));

let mockTarefas: Pendencia[] = [];
let mockColetas: ColetaLocal[] = [];

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => "2026-09-09T13:00:00.000Z"),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
}));

const SEM_RASCUNHOS: never[] = [];
jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => SEM_RASCUNHOS) }));

jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
  marcarEnviada: jest.fn(async () => {}),
}));

/* O resumo que a fila entrega a quem assina. Nulo na pausa: a fila anda. */
let mockPausadaPor: string | null = null;
const SEM_ITENS: never[] = [];
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    itens: async () => SEM_ITENS,
    assinar: (ouvinte: (r: unknown) => void) => {
      ouvinte({ pendentes: 1, pausadaPor: mockPausadaPor });
      return () => {};
    },
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "wifi" }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: { nome: "Agente de teste", municipio: "Teste", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";

const ID = "11111111-1111-4111-8111-111111111111";

function tarefa(): Pendencia {
  return {
    id: ID,
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
  } as Pendencia;
}

function lapide(): ColetaLocal {
  return {
    ocorrenciaId: ID,
    idempotencyKey: "chave-da-coleta",
    protocolo: "2026/000123",
    coletadaEm: "2026-09-09T13:00:00.000Z",
    situacao: "na_fila",
  };
}

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
}

beforeEach(() => {
  mockTarefas = [tarefa()];
  mockColetas = [lapide()];
  mockPausadaPor = null;
});

describe("a tarefa já vistoriada, com a fila andando", () => {
  it("diz que falta sinal, porque é isso que falta", async () => {
    await abrirALista();

    expect(screen.getByText(/O que falta é sinal para enviar/)).toBeTruthy();
  });
});

describe("a tarefa já vistoriada, com a fila parada", () => {
  it("sessão encerrada: diz que falta entrar de novo, e não sinal", async () => {
    mockPausadaPor = "sessao_encerrada";

    await abrirALista();

    expect(screen.getByText(/O que falta é entrar de novo/)).toBeTruthy();
    expect(screen.queryByText(/falta é sinal/)).toBeNull();
  });

  it("senha provisória: diz que falta definir a senha, e não sinal", async () => {
    mockPausadaPor = "troca_de_senha_obrigatoria";

    await abrirALista();

    expect(screen.getByText(/O que falta é definir a sua senha no painel e entrar de novo/)).toBeTruthy();
    expect(screen.queryByText(/falta é sinal/)).toBeNull();
  });

  it("conta desativada: diz que falta a coordenação reativar a conta", async () => {
    mockPausadaPor = "conta_desativada";

    await abrirALista();

    expect(screen.getByText(/O que falta é a coordenação reativar a sua conta/)).toBeTruthy();
    expect(screen.queryByText(/falta é sinal/)).toBeNull();
  });

  it("o motivo também vai no rótulo de quem ouve a tela", async () => {
    mockPausadaPor = "sessao_encerrada";

    await abrirALista();

    expect(screen.getByLabelText(/Comece por aqui:.*O que falta é entrar de novo/)).toBeTruthy();
  });
});
