/**
 * A ENTRADA DE UMA ABA, provada peça a peça.
 *
 * O invólucro existe porque o navegador não pode mais animar a cena (a razão
 * está no cabeçalho de `CenaDaAba.tsx`). O que se prova aqui é a régua que
 * o substitui: driver JavaScript e não nativo, duração e curva de token, a
 * entrada repetida a cada foco e não só na montagem, o conteúdo nascendo
 * pronto com redução de movimento, e o ouvinte de foco solto ao desmontar.
 */
import { Animated, StyleSheet, Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

let mockReduzir = false;
jest.mock("./useReducaoDeMovimento", () => ({ useReducaoDeMovimento: () => mockReduzir }));

import { CenaDaAba, desenharCena, type NavegacaoDaCena } from "./CenaDaAba";
import { easing, movimento } from "./tokens";

/** Um navegador de rota de mentira, com o foco sob controle do teste. */
function navegacaoDeMentira(focada: boolean) {
  const ouvintes = new Set<() => void>();
  const nav: NavegacaoDaCena & { focar: () => void; ouvintes: Set<() => void> } = {
    isFocused: () => focada,
    addListener: (_evento, ouvinte) => {
      ouvintes.add(ouvinte);
      return () => { ouvintes.delete(ouvinte); };
    },
    focar: () => { focada = true; for (const o of ouvintes) o(); },
    ouvintes,
  };
  return nav;
}

type ConfiguracaoDeTiming = { toValue: number; duration: number; useNativeDriver: boolean; easing?: (t: number) => number };

let timings: ConfiguracaoDeTiming[] = [];
let timingReal: typeof Animated.timing;

beforeEach(() => {
  mockReduzir = false;
  timings = [];
  timingReal = Animated.timing;
  jest.spyOn(Animated, "timing").mockImplementation((valor, config) => {
    timings.push(config as ConfiguracaoDeTiming);
    return timingReal(valor, config);
  });
});

afterEach(() => { jest.restoreAllMocks(); });

describe("a entrada de uma aba", () => {
  it("ao montar focada, o conteúdo entra com driver JavaScript, duração e curva de token", async () => {
    await render(<CenaDaAba navigation={navegacaoDeMentira(true)}><Text>conteúdo</Text></CenaDaAba>);

    expect(timings).toHaveLength(1);
    const [config] = timings;
    expect(config!.useNativeDriver).toBe(false);
    expect(config!.toValue).toBe(1);
    expect(config!.duration).toBe(movimento.respostaAoToque);
    /*
      A curva é comparada pela FORMA: `Easing.bezier(...)` devolve uma função
      nova a cada chamada, então a identidade não serve; o ponto médio da
      curva de entrada, sim.
    */
    const curva = config!.easing!;
    const { Easing } = require("react-native") as typeof import("react-native");
    expect(curva(0.5)).toBeCloseTo(Easing.bezier(...easing.entrada)(0.5), 6);
    expect(screen.getByText("conteúdo")).toBeTruthy();
  });

  it("ao montar SEM foco, não anima nada e espera o foco chegar", async () => {
    const nav = navegacaoDeMentira(false);
    await render(<CenaDaAba navigation={nav}><Text>conteúdo</Text></CenaDaAba>);

    expect(timings).toHaveLength(0);
    expect(nav.ouvintes.size).toBe(1);

    await act(async () => { nav.focar(); });

    expect(timings).toHaveLength(1);
    expect(timings[0]!.useNativeDriver).toBe(false);
  });

  it("entra de novo a CADA foco, e não só na montagem", async () => {
    const nav = navegacaoDeMentira(true);
    await render(<CenaDaAba navigation={nav}><Text>conteúdo</Text></CenaDaAba>);
    expect(timings).toHaveLength(1);

    await act(async () => { nav.focar(); });
    await act(async () => { nav.focar(); });

    expect(timings).toHaveLength(3);
  });

  it("com redução de movimento, o conteúdo nasce pronto e nenhuma animação é pedida", async () => {
    mockReduzir = true;
    const nav = navegacaoDeMentira(true);
    await render(<CenaDaAba navigation={nav}><Text>conteúdo</Text></CenaDaAba>);

    await act(async () => { nav.focar(); });

    expect(timings).toHaveLength(0);
    const cena = screen.getByTestId("cena-da-aba");
    const estilo = StyleSheet.flatten(cena.props.style) as { opacity: number };
    expect(estilo.opacity).toBe(1);
  });

  it("solta o ouvinte de foco ao desmontar", async () => {
    const nav = navegacaoDeMentira(true);
    const tela = await render(<CenaDaAba navigation={nav}><Text>conteúdo</Text></CenaDaAba>);
    expect(nav.ouvintes.size).toBe(1);

    await tela.unmount();

    expect(nav.ouvintes.size).toBe(0);
  });

  it("`desenharCena` é uma função de módulo, estável entre desenhos, e embrulha o filho", async () => {
    const nav = navegacaoDeMentira(true);
    const primeira = desenharCena({ navigation: nav, children: <Text>filho</Text> });
    const segunda = desenharCena({ navigation: nav, children: <Text>filho</Text> });
    /*
      O tipo do elemento é o que o React usa para decidir entre atualizar e
      remontar. Se cada desenho devolvesse um tipo novo, a aba inteira seria
      remontada a cada desenho do navegador.
    */
    expect((primeira as { type: unknown }).type).toBe((segunda as { type: unknown }).type);
    await render(<>{primeira}</>);
    expect(screen.getByText("filho")).toBeTruthy();
  });
});
