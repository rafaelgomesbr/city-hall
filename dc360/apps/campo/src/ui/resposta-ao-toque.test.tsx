/**
 * O retorno do toque, que estava declarado e morto.
 *
 * `movimento.respostaAoToque` existe em `tokens.ts` desde o primeiro dia, com
 * um parágrafo explicando por que ele é curto, e NUNCA foi usado por ninguém.
 * O que o botão fazia era trocar a opacidade de 1 para 0,85 num quadro só, sem
 * transição: o dedo encosta, a cor pula, o dedo sai, a cor pula de volta.
 *
 * O detalhe que faz isso importar em campo, e não só na mesa de quem desenha:
 * o agente toca com luva, na chuva, olhando para um barranco. Um retorno que
 * some junto com o toque é um retorno que ele não vê, e o que ele faz quando
 * não vê é tocar de novo, no botão de concluir vistoria.
 *
 * As duas regras cobradas aqui:
 *
 * 1. **`useNativeDriver`.** O retorno do dedo não pode esperar o JavaScript,
 *    que neste aplicativo pode estar ocupado drenando a fila de sincronização
 *    de uma manhã inteira de vistorias.
 * 2. **`useReducaoDeMovimento`.** Quem liga a chave no sistema quase nunca liga
 *    por estética: liga porque animação dá enjoo. Mas o estado ainda precisa
 *    MUDAR, senão a acessibilidade de um tira o retorno de toque do outro.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Animated } from "react-native";

let mockReduzir = false;
jest.mock("./useReducaoDeMovimento", () => ({
  useReducaoDeMovimento: () => mockReduzir,
}));

import { Botao, ProvedorDeTema } from "./componentes";
import { CampoDeTexto } from "./Campo";
import { movimento } from "./tokens";

type Cronometrada = { duration?: number; useNativeDriver?: boolean; easing?: unknown };
let animacoes: Cronometrada[] = [];
const timingDeVerdade = Animated.timing;

beforeEach(() => {
  mockReduzir = false;
  animacoes = [];
  jest.spyOn(Animated, "timing").mockImplementation(((valor: never, config: Cronometrada) => {
    animacoes.push(config);
    return timingDeVerdade(valor, config as never);
  }) as never);
});

afterEach(() => { jest.restoreAllMocks(); });

async function montar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

describe("o botão sob o dedo", () => {
  it("anima ao encostar, com a duração do token e não com um número solto", async () => {
    await montar(<Botao titulo="Concluir" testID="concluir" onPress={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("concluir"), "pressIn"); });
    expect(animacoes).toHaveLength(1);
    expect(animacoes[0]?.duration).toBe(movimento.respostaAoToque);
  });

  it("anima de volta ao soltar", async () => {
    await montar(<Botao titulo="Concluir" testID="concluir" onPress={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("concluir"), "pressIn"); });
    await act(async () => { fireEvent(screen.getByTestId("concluir"), "pressOut"); });
    expect(animacoes).toHaveLength(2);
  });

  /*
    Sem isto a animação roda no JavaScript, e o dedo espera a fila de
    sincronização terminar de escrever no SQLite para o botão responder.
  */
  it("roda na thread de interface, e não na do JavaScript", async () => {
    await montar(<Botao titulo="Concluir" testID="concluir" onPress={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("concluir"), "pressIn"); });
    expect(animacoes[0]?.useNativeDriver).toBe(true);
  });

  it("a curva sai do token, e não é escolhida dentro do componente", async () => {
    await montar(<Botao titulo="Concluir" testID="concluir" onPress={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("concluir"), "pressIn"); });
    // `Easing.bezier` devolve função: o que se cobra aqui é que exista curva,
    // e as quatro que estavam escolhidas dentro dos componentes viraram token.
    expect(typeof animacoes[0]?.easing).toBe("function");
  });

  /*
    O toque continua funcionando: animar não pode custar o clique. Este é o
    caso que pega o dia em que alguém trocar `Pressable` por um componente
    animado e esquecer de passar o `onPress` adiante.
  */
  it("o toque continua chegando em quem chamou", async () => {
    const toques: string[] = [];
    await montar(<Botao titulo="Concluir" testID="concluir" onPress={() => toques.push("tocou")} />);
    await act(async () => { fireEvent.press(screen.getByTestId("concluir")); });
    expect(toques).toEqual(["tocou"]);
  });

  it("botão desabilitado não dispara nada", async () => {
    const toques: string[] = [];
    await montar(
      <Botao titulo="Concluir" testID="concluir" desabilitado onPress={() => toques.push("tocou")} />,
    );
    await act(async () => { fireEvent.press(screen.getByTestId("concluir")); });
    expect(toques).toEqual([]);
  });
});

describe("com redução de movimento ligada", () => {
  /*
    O aparelho pediu para não animar, e o aplicativo obedece. O que ele NÃO faz
    é tirar o retorno: o valor vai direto para o destino, o botão muda de
    aparência, e quem pediu menos movimento continua sabendo que o toque pegou.
  */
  it("o botão não anima, e mesmo assim responde ao dedo", async () => {
    mockReduzir = true;
    await montar(<Botao titulo="Concluir" testID="concluir" onPress={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("concluir"), "pressIn"); });
    expect(animacoes).toHaveLength(0);
    expect(screen.getByTestId("concluir")).toBeTruthy();
  });

  it("o anel de foco do campo também para de animar, e continua aparecendo", async () => {
    mockReduzir = true;
    await montar(<CampoDeTexto testID="email" rotulo="Email" valor="" aoMudar={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("email"), "focus"); });
    expect(animacoes).toHaveLength(0);
    expect(screen.getByTestId("email-anel-de-foco")).toBeTruthy();
  });
});

describe("o campo em foco", () => {
  it("o anel aparece com a mesma duração de resposta ao toque", async () => {
    await montar(<CampoDeTexto testID="email" rotulo="Email" valor="" aoMudar={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("email"), "focus"); });
    // Foco e toque são a mesma classe de resposta: o mesmo token, para as duas
    // não terem ritmos diferentes na mesma tela.
    expect(animacoes[0]?.duration).toBe(movimento.respostaAoToque);
    expect(animacoes[0]?.useNativeDriver).toBe(true);
  });
});
