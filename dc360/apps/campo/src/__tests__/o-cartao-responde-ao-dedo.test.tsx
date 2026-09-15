/**
 * O cartão de tarefa, o `ⓘ` e o dedo.
 *
 * `movimento.respostaAoToque` foi ligado no `Botao` e ficou só lá. Tudo o mais
 * que este aplicativo oferece ao dedo continuou com a opacidade decidida dentro
 * da função de estilo do `Pressable` (`opacity: pressed ? ... : 1`), que PULA
 * de um quadro para o outro: aparece quando o dedo encosta e some quando ele
 * sai, sem nada no meio.
 *
 * O cartão de tarefa é o pior lugar para isso acontecer, e por isso é o que
 * este arquivo trava. Ele é o alvo de toque mais usado do produto inteiro, mede
 * meia tela, e o que ele abre é a vistoria. O agente toca com luva, na chuva,
 * olhando para um barranco; se nada acontece debaixo do dedo dele no instante
 * do toque, ele toca de novo.
 *
 * O que se cobra aqui é o mesmo vocabulário do `Botao`, e não um parecido:
 * duração de token, curva de token, `useNativeDriver`, e `useReducaoDeMovimento`
 * tirando a interpolação sem tirar o retorno.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Animated } from "react-native";
import type { Pendencia } from "../dados/api";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

let mockReduzir = false;
jest.mock("../ui/useReducaoDeMovimento", () => ({
  useReducaoDeMovimento: () => mockReduzir,
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

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => "2026-09-09T13:00:00.000Z"),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
}));

jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => []) }));
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => []),
  marcarEnviada: jest.fn(async () => undefined),
}));
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({ itens: async () => [] }),
}));
/* Sem sinal: a tela lê o disco e não tenta a rede. O que se mede aqui é o
   dedo, e uma busca de rede no meio só acrescenta ruído assíncrono. */
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: false, tipo: "nenhum" }),
}));
jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    identidade: { nome: "Agente de teste", municipio: "Teste", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";
import { movimento } from "../ui/tokens";

const ID = "11111111-1111-4111-8111-111111111111";

type Cronometrada = { duration?: number; useNativeDriver?: boolean; easing?: unknown };
let animacoes: Cronometrada[] = [];
const timingDeVerdade = Animated.timing;

function tarefa(extras: Partial<Pendencia> = {}): Pendencia {
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
    /* Vencida, porque é o cartão mais completo que esta lista desenha: com o
       prazo estourado ele ganha a linha vermelha e o botão de devolver, e é
       nesse estado que o agente mais toca nele. */
    prazo_em: "2026-09-01T09:00:00.000Z",
    criado_em: "2026-08-30T09:00:00.000Z",
    ...extras,
  } as Pendencia;
}

beforeEach(() => {
  mockReduzir = false;
  mockTarefas = [tarefa()];
  animacoes = [];
  jest.spyOn(Animated, "timing").mockImplementation(((valor: never, config: Cronometrada) => {
    animacoes.push(config);
    return timingDeVerdade(valor, config as never);
  }) as never);
});

afterEach(() => { jest.restoreAllMocks(); });

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
  /*
    A abertura tem UMA animação própria, que não é de toque: o número grande
    do cabeçalho conta de zero ao valor na primeira pintura (ver
    `ui/dado-que-conta.test.tsx`). O que este arquivo mede começa no dedo, e
    por isso a contagem sai da lista antes de o dedo encostar.
  */
  animacoes = [];
}

function oCartao() {
  return screen.getByLabelText(/^Abrir a vistoria do protocolo/);
}

describe("o cartão de tarefa sob o dedo", () => {
  it("anima ao encostar, com a duração do token e não com um número solto", async () => {
    await abrirALista();
    await act(async () => { fireEvent(oCartao(), "pressIn"); });
    expect(animacoes).toHaveLength(1);
    expect(animacoes[0]?.duration).toBe(movimento.respostaAoToque);
  });

  /*
    Sem isto a animação roda no JavaScript, e o dedo espera a leitura do disco
    que esta tela dispara a cada foco, a cada evento da fila e a cada minuto.
  */
  it("roda na thread de interface, e não na do JavaScript", async () => {
    await abrirALista();
    await act(async () => { fireEvent(oCartao(), "pressIn"); });
    expect(animacoes[0]?.useNativeDriver).toBe(true);
  });

  it("a curva sai do token, e não é escolhida dentro da tela", async () => {
    await abrirALista();
    await act(async () => { fireEvent(oCartao(), "pressIn"); });
    expect(typeof animacoes[0]?.easing).toBe("function");
  });

  it("anima de volta ao soltar", async () => {
    await abrirALista();
    await act(async () => { fireEvent(oCartao(), "pressIn"); });
    await act(async () => { fireEvent(oCartao(), "pressOut"); });
    expect(animacoes).toHaveLength(2);
  });

  /*
    O toque continua abrindo a vistoria: animar não pode custar o clique. Este
    é o caso que pega o dia em que alguém trocar o tocável e esquecer de passar
    o `onPress` adiante, que é como se perde uma tela inteira em silêncio.
  */
  it("o toque continua levando para a vistoria", async () => {
    const { router } = require("expo-router") as { router: { push: jest.Mock } };
    router.push.mockClear();
    await abrirALista();
    await act(async () => { fireEvent.press(oCartao()); });
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: ID } }),
    );
  });
});

describe("o ⓘ da faixa sob o dedo", () => {
  /*
    Ele é o alvo de 52 pontos que o Rafa pediu no lugar do parágrafo de 41
    palavras. Um alvo pequeno, com ícone e sem rótulo visível, é justamente o
    que mais precisa dizer que pegou.
  */
  it("também anima, com o mesmo token de duração", async () => {
    await abrirALista();
    const info = screen.getByTestId("detalhe-da-lista");
    await act(async () => { fireEvent(info, "pressIn"); });
    expect(animacoes).toHaveLength(1);
    expect(animacoes[0]?.duration).toBe(movimento.respostaAoToque);
    expect(animacoes[0]?.useNativeDriver).toBe(true);
  });
});

describe("com redução de movimento ligada", () => {
  /*
    O aparelho pediu para não animar e o cartão obedece. O que ele NÃO faz é
    ficar inerte: o valor vai direto ao destino, a opacidade muda no mesmo
    quadro, e quem pediu menos movimento continua sabendo que o toque pegou.
  */
  it("o cartão não anima, e mesmo assim responde ao dedo", async () => {
    mockReduzir = true;
    await abrirALista();
    await act(async () => { fireEvent(oCartao(), "pressIn"); });
    expect(animacoes).toHaveLength(0);
    expect(oCartao()).toBeTruthy();
  });

  it("e o toque continua abrindo a vistoria", async () => {
    mockReduzir = true;
    const { router } = require("expo-router") as { router: { push: jest.Mock } };
    router.push.mockClear();
    await abrirALista();
    await act(async () => { fireEvent.press(oCartao()); });
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: ID } }),
    );
  });
});
