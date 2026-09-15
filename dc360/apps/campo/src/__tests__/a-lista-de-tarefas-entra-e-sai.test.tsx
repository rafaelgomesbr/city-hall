/**
 * A lista de tarefas ganhando e perdendo item.
 *
 * A fila de envio já tinha saída desenhada desde a frente F6. Esta lista, não:
 * uma tarefa sumia no quadro seguinte, e nos dois jeitos de sumir que ela tem.
 *
 * Um deles é a DEVOLUÇÃO, e ali o corte seco dói mais: o agente abriu o
 * diálogo, escolheu o motivo, confirmou, e a devolução entrou na fila com o
 * nome dele. É um ato institucional, com motivo escrito e assinatura, e a
 * resposta da tela era um cartão a menos. Quem estava olhando para a parte de
 * baixo da lista não via nada acontecer.
 *
 * O outro é a RECONCILIAÇÃO: a coordenação encerrou, trocou a tarefa de equipe
 * ou outro agente concluiu, e a linha é apagada do aparelho. Aí a tarefa some
 * sem nem estar mais no disco, e é o caso que a primeira versão desta correção
 * deixava passar, porque procurava o cartão que sai na lista NOVA.
 *
 * E o lado oposto: trabalho que CHEGA. Um despacho novo entrava na lista já
 * pronto, no lugar dele, como se sempre tivesse estado ali, indistinguível de
 * "eu não tinha visto este". A diferença entre as duas coisas decide se o
 * agente sobe o morro mais uma vez hoje.
 *
 * A régua cobrada aqui é a mesma do resto do movimento deste aplicativo:
 * duração de token, curva de token, `useNativeDriver`, e a chave de redução de
 * movimento tirando a animação sem tirar o fato.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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

let mockNoDisco: Pendencia[] = [];
/** O que a rede devolve no próximo "Baixar tarefas agora". */
let mockNaRede: Pendencia[] = [];

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockNoDisco),
  baixadasEm: jest.fn(async () => "2026-09-09T13:00:00.000Z"),
  atualizarPendencias: jest.fn(async () => {
    mockNoDisco = mockNaRede;
    return mockNaRede;
  }),
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
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "celular" }),
}));
jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    identidade: { nome: "Agente de teste", municipio: "Teste", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";
import { movimento } from "../ui/tokens";

type Cronometrada = {
  duration?: number; useNativeDriver?: boolean; easing?: unknown;
  toValue?: number; delay?: number;
};
let animacoes: Cronometrada[] = [];
const timingDeVerdade = Animated.timing;

function tarefa(sufixo: string, protocolo: string): Pendencia {
  return {
    id: `11111111-1111-4111-8111-11111111111${sufixo}`,
    protocolo,
    tipo: "deslizamento",
    severidade: "alta",
    endereco: `Servidão do Morro, ${sufixo}5`,
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

const PRIMEIRA = tarefa("1", "000471/2026");
const SEGUNDA = tarefa("2", "000472/2026");
const TERCEIRA = tarefa("3", "000473/2026");
const QUARTA = tarefa("4", "000474/2026");

beforeEach(() => {
  mockReduzir = false;
  mockNoDisco = [PRIMEIRA];
  mockNaRede = [PRIMEIRA];
  animacoes = [];
  jest.spyOn(Animated, "timing").mockImplementation(((valor: never, config: Cronometrada) => {
    animacoes.push(config);
    return timingDeVerdade(valor, config as never);
  }) as never);
});

afterEach(() => { jest.restoreAllMocks(); });

/**
 * A CONTAGEM DO CABEÇALHO, lida como um elemento só.
 *
 * Ela deixou de ser uma frase de um tamanho só e virou a peça `Dado` (número
 * grande com rótulo discreto, a H2 da régua de hierarquia). Para quem ouve a
 * tela, o par continua sendo UM elemento com UMA frase, e é justamente esse
 * rótulo que se lê aqui: conferir os dois textos separados passaria verde com
 * o número colado no rótulo errado.
 */
function aContagem(): string {
  return screen.getByTestId("quantas-vistorias").props.accessibilityLabel as string;
}

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
}

/** O botão do rodapé, que é o caminho de "chegou trabalho novo" nesta tela. */
async function baixarDeNovo(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Baixar tarefas agora"));
  });
  await act(async () => {});
}

describe("a primeira pintura", () => {
  /*
    Vinte cartões entrando ao mesmo tempo seria o engasgo em aparelho fraco que
    o `CLAUDE.md` proíbe, e além disso uma mentira: nada chegou, o aparelho é
    que terminou de ler o próprio disco. A guarda que impede isto é a que
    ignora a renderização em que a lista ainda não existe.
  */
  it("não anima nenhum cartão: a lista abrindo não é trabalho chegando", async () => {
    mockNoDisco = [PRIMEIRA, SEGUNDA];
    await abrirALista();
    expect(screen.getByText("000471/2026")).toBeTruthy();
    /*
      O que a primeira pintura NÃO pode fazer é animar cartão. O número grande
      do cabeçalho conta de zero ao valor na primeira pintura, de propósito (ver
      `ui/dado-que-conta.test.tsx`), e ele é a única animação que nasce em
      JavaScript: texto não tem como subir no driver nativo. Cartão entra na
      thread de interface, e é isso que separa um do outro aqui.
    */
    expect(animacoes.filter((a) => a.useNativeDriver)).toHaveLength(0);
    expect(animacoes.filter((a) => !a.useNativeDriver)).toHaveLength(1);
  });
});

describe("a tarefa que chega", () => {
  it("entra animada, com a duração e a curva de token, na thread de interface", async () => {
    await abrirALista();
    animacoes = [];

    mockNaRede = [PRIMEIRA, SEGUNDA];
    await baixarDeNovo();

    expect(screen.getByText("000472/2026")).toBeTruthy();
    const entrada = animacoes.find((a) => a.toValue === 1);
    expect(entrada?.duration).toBe(movimento.mudancaDeEstado);
    expect(entrada?.useNativeDriver).toBe(true);
    expect(typeof entrada?.easing).toBe("function");
  });

  /*
    A que já estava lá não anima de novo. Sem isto, cada baixa de lista
    reanimaria a tela inteira, e a lista que "dá uma rolada sozinha" ganharia
    uma irmã: a lista que pisca sozinha.
  */
  it("a que já estava na tela fica parada", async () => {
    await abrirALista();
    animacoes = [];

    mockNaRede = [PRIMEIRA, SEGUNDA];
    await baixarDeNovo();

    /* Uma entrada, e não duas: só a segunda tarefa chegou. */
    expect(animacoes.filter((a) => a.toValue === 1)).toHaveLength(1);
  });
});

describe("a tarefa que some", () => {
  /*
    Este é o caso da reconciliação: a coordenação encerrou, trocou de equipe ou
    outro agente concluiu, e a linha é APAGADA do aparelho. O cartão que sai
    precisa ser desenhado a partir do que a tela tinha, porque no disco ele não
    está mais.
  */
  it("fica saindo em vez de sumir no quadro seguinte", async () => {
    mockNoDisco = [PRIMEIRA, SEGUNDA];
    mockNaRede = [PRIMEIRA, SEGUNDA];
    await abrirALista();
    animacoes = [];

    mockNaRede = [PRIMEIRA];
    await baixarDeNovo();

    /* Ainda desenhada, saindo. */
    expect(screen.getByText("000472/2026")).toBeTruthy();
    const saida = animacoes.find((a) => a.toValue === 0);
    expect(saida?.duration).toBe(movimento.mudancaDeEstado);
    expect(saida?.useNativeDriver).toBe(true);
    expect(typeof saida?.easing).toBe("function");
  });

  /*
    O NÚMERO não espera a animação. Ele é o que o agente lê para saber quanto
    trabalho sobrou, e mentir por um quarto de segundo ali é mentir em cima da
    única coisa que esta tela existe para dizer.
  */
  it("sai da contagem na hora, mesmo continuando desenhada", async () => {
    mockNoDisco = [PRIMEIRA, SEGUNDA];
    mockNaRede = [PRIMEIRA, SEGUNDA];
    await abrirALista();
    expect(aContagem()).toBe("2, vistorias para fazer");

    mockNaRede = [PRIMEIRA];
    await baixarDeNovo();

    expect(aContagem()).toBe("1, vistoria para fazer");
  });

  /* Quem larga o cartão é o temporizador da tela, e não o fim da animação. */
  it("sai de verdade, e não fica pendurada", async () => {
    mockNoDisco = [PRIMEIRA, SEGUNDA];
    mockNaRede = [PRIMEIRA, SEGUNDA];
    await abrirALista();

    mockNaRede = [PRIMEIRA];
    await baixarDeNovo();

    await waitFor(() => { expect(screen.queryByText("000472/2026")).toBeNull(); });
  });
});

describe("com redução de movimento ligada", () => {
  /*
    Quem liga a chave no sistema liga porque animação dá enjoo, e é a mesma
    pessoa que este aplicativo coloca em pé num barranco. O que ela pediu foi
    menos movimento, não menos informação: a tarefa sai da lista, e sai na hora.
  */
  it("a tarefa some na hora, sem animação nenhuma", async () => {
    mockReduzir = true;
    mockNoDisco = [PRIMEIRA, SEGUNDA];
    mockNaRede = [PRIMEIRA, SEGUNDA];
    await abrirALista();
    animacoes = [];

    mockNaRede = [PRIMEIRA];
    await baixarDeNovo();

    expect(screen.queryByText("000472/2026")).toBeNull();
    expect(animacoes).toHaveLength(0);
  });

  it("e a que chega aparece na hora, também sem animação", async () => {
    mockReduzir = true;
    await abrirALista();
    animacoes = [];

    mockNaRede = [PRIMEIRA, SEGUNDA];
    await baixarDeNovo();

    expect(screen.getByText("000472/2026")).toBeTruthy();
    expect(animacoes).toHaveLength(0);
  });
});

describe("o despacho que chega com várias de uma vez", () => {
  /*
    Quando a coordenação despacha uma rua inteira, o aparelho recebe quatro,
    seis, dez tarefas na mesma resposta. Entrando todas no mesmo instante, o
    que o agente vê é a lista trocando de tamanho num quadro, que é o mesmo
    nada que ele via antes de existir animação.

    Em cascata ele vê CHEGAR, uma depois da outra, e o número de cartões novos
    fica legível sem ninguém contar. `atrasoEmCascata()` nasceu para isto na
    fundação da 2.0 e terminou a onda sem um único uso.
  */
  it("elas entram uma depois da outra, e não todas juntas", async () => {
    await abrirALista();
    animacoes = [];

    mockNaRede = [PRIMEIRA, SEGUNDA, TERCEIRA, QUARTA];
    await baixarDeNovo();

    const atrasos = animacoes.filter((a) => a.toValue === 1).map((a) => a.delay ?? 0);
    expect(atrasos).toHaveLength(3);
    /* Crescentes e distintos: é isso que faz a cascata ser cascata. */
    expect(new Set(atrasos).size).toBe(3);
    expect([...atrasos].sort((a, b) => a - b)).toEqual(atrasos);
  });

  /*
    A cascata conta entre as NOVAS, e não pela posição na lista inteira. Uma
    tarefa só, chegando no fim de uma lista de vinte, esperaria o teto inteiro
    antes de aparecer: o agente veria a lista parada e concluiria que não
    chegou nada.
  */
  it("uma tarefa sozinha entra na hora, mesmo chegando no fim da lista", async () => {
    mockNoDisco = [PRIMEIRA, SEGUNDA, TERCEIRA];
    mockNaRede = [PRIMEIRA, SEGUNDA, TERCEIRA];
    await abrirALista();
    animacoes = [];

    mockNaRede = [PRIMEIRA, SEGUNDA, TERCEIRA, QUARTA];
    await baixarDeNovo();

    const entrada = animacoes.find((a) => a.toValue === 1);
    expect(entrada?.delay ?? 0).toBe(0);
  });
});
