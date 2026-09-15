/**
 * O NÚMERO GRANDE QUE SOBE, na primeira pintura.
 *
 * O `Dado` é o protagonista de quatro telas (tarefas, mapa, fila, conta), e
 * nascia parado: "12" já estava lá quando a tela abria. A contagem que sobe
 * é o acabamento que `CLAUDE.md` chama de "micro-interação com propósito": o
 * olho é levado ao número, que é justamente onde a hierarquia quer que ele
 * comece.
 *
 * O que este arquivo cobra, e por que cada linha existe:
 *
 * - **Sobe do zero ao valor em `movimento.mudancaDeEstado`**, com a curva de
 *   entrada. Duração escrita à mão reprova no portão de design, e uma quarta
 *   duração inventada aqui seria um ritmo que nenhuma outra peça tem.
 * - **Só na primeira pintura.** Um valor que muda depois (a lista recarregou
 *   de 3 para 5) aparece direto: um número que rola a cada atualização da
 *   lista vira ruído, e o agente para de confiar no que está lendo.
 * - **Só conta o que é CONTAGEM.** "000123" é protocolo e "5 de 7" é fração:
 *   um protocolo subindo de zero é, por 260 ms, um protocolo ERRADO na tela,
 *   e dígito neste produto é ditado por rádio.
 * - **Quem ouve a tela recebe o valor final desde o primeiro quadro.** O
 *   leitor de tela lê o rótulo do par, e o rótulo nunca passa pelo zero.
 * - **Redução de movimento tira a contagem, e não atrasa nada.** A chave do
 *   sistema chega sempre depois do primeiro quadro (é uma promessa), então a
 *   peça precisa saber parar no meio, como `ItemDeLista` já faz.
 */

import { AccessibilityInfo, Animated } from "react-native";
import { act, render, screen, within } from "@testing-library/react-native";

/*
  O dublê LIGA por cima do hook de verdade, e nunca no lugar dele, pelo mesmo
  motivo escrito em `item-de-lista.test.tsx`: o hook real começa em `false` e
  só sabe a resposta do sistema depois da montagem. Substituí-lo por uma
  constante testaria um aparelho que não existe.
*/
let mockReduzir = false;
jest.mock("./useReducaoDeMovimento", () => {
  const real = jest.requireActual("./useReducaoDeMovimento") as
    typeof import("./useReducaoDeMovimento");
  return { useReducaoDeMovimento: () => real.useReducaoDeMovimento() || mockReduzir };
});

import { Dado, ProvedorDeTema } from "./componentes";
import { easing, movimento } from "./tokens";

beforeEach(() => { mockReduzir = false; jest.useFakeTimers(); });
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  /*
    `isReduceMotionEnabled` já nasce como `jest.fn` no dublê do React Native, e
    `spyOn` sobre um `jest.fn` não cria espião nenhum: `restoreAllMocks` não o
    devolve ao que era. Sem esta linha, o caso da chave chegando atrasada
    deixaria a redução de movimento ligada para todos os casos seguintes, e
    eles passariam a testar um aparelho que não anima nada.
  */
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockImplementation(
    () => Promise.resolve(false),
  );
});

async function montar(no: React.ReactElement): Promise<void> {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

/** O que está DESENHADO no número, que é o que o agente lê. */
function numeroDesenhado(testID: string): string {
  /* O primeiro texto do par é o número; o segundo é o rótulo. */
  const [numero] = within(screen.getByTestId(testID)).getAllByText(/./);
  return String(numero?.props.children ?? "");
}

async function passar(ms: number): Promise<void> {
  await act(async () => { jest.advanceTimersByTime(ms); });
}

describe("a contagem que sobe", () => {
  it("nasce em zero e chega ao valor no fim de `mudancaDeEstado`", async () => {
    await montar(<Dado valor="12" rotulo="vistorias para fazer" testID="indicador" />);

    expect(numeroDesenhado("indicador")).toBe("0");

    await passar(movimento.mudancaDeEstado / 2);
    const noMeio = Number(numeroDesenhado("indicador"));
    expect(noMeio).toBeGreaterThan(0);
    expect(noMeio).toBeLessThan(12);

    await passar(movimento.mudancaDeEstado);
    expect(numeroDesenhado("indicador")).toBe("12");
  });

  it("dura `mudancaDeEstado`, com a curva de entrada, e não no driver nativo", async () => {
    /*
      Texto não anima no driver nativo: o que muda é o CONTEÚDO do `Text`, e
      não uma propriedade de estilo. O valor roda em JavaScript e é espelhado
      no estado a cada quadro. A duração e a curva são as do produto, e não um
      número escolhido aqui.
    */
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<Dado valor="12" rotulo="vistorias" testID="indicador" />);

    const chamada = espiao.mock.calls.at(-1)?.[1] as {
      duration?: number; useNativeDriver?: boolean; easing?: (t: number) => number;
    } | undefined;
    expect(chamada?.duration).toBe(movimento.mudancaDeEstado);
    expect(chamada?.useNativeDriver).toBe(false);
    /*
      A curva é comparada pelo que ela FAZ, e não por identidade de função:
      `Easing.bezier` devolve uma função nova a cada chamada. A curva de
      entrada desacelera no fim, então na metade do tempo ela já passou da
      metade do caminho; a linear não.
    */
    const { Easing } = jest.requireActual("react-native") as typeof import("react-native");
    expect(chamada?.easing?.(0.5)).toBeCloseTo(Easing.bezier(...easing.entrada)(0.5), 5);
  });

  it("para quem ouve a tela, o valor é o final desde o primeiro quadro", async () => {
    await montar(<Dado valor="12" rotulo="vistorias para fazer" testID="indicador" />);

    expect(screen.getByTestId("indicador").props.accessibilityLabel).toBe("12, vistorias para fazer");
    expect(numeroDesenhado("indicador")).toBe("0");
  });

  it("com a redução de movimento ligada desde antes, nasce pronto e não anima", async () => {
    mockReduzir = true;
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<Dado valor="12" rotulo="vistorias" testID="indicador" />);

    expect(numeroDesenhado("indicador")).toBe("12");
    expect(espiao).not.toHaveBeenCalled();
  });

  it("a chave do sistema chegando DEPOIS do primeiro quadro também para a contagem", async () => {
    /*
      O caso que o aparelho vive: `isReduceMotionEnabled()` é uma promessa, o
      primeiro quadro sai com "não reduzir" e a resposta chega logo depois. Se a
      peça decidir de uma vez por todas na montagem, quem pediu menos movimento
      recebe a contagem inteira mesmo assim.
    */
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<Dado valor="12" rotulo="vistorias" testID="indicador" />);
    await act(async () => {});

    /*
      A contagem COMEÇOU (o primeiro quadro não tinha como saber) e foi parada
      no alvo sem que o relógio andasse: sem a segunda linha este caso passaria
      verde numa peça que simplesmente nunca anima.
    */
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(numeroDesenhado("indicador")).toBe("12");
  });

  it("o valor que muda DEPOIS aparece direto, sem contar de novo", async () => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<Dado valor="3" rotulo="vistorias" testID="indicador" />);
    await passar(movimento.mudancaDeEstado * 2);
    expect(numeroDesenhado("indicador")).toBe("3");
    expect(espiao).toHaveBeenCalledTimes(1);

    await act(async () => {
      screen.rerender(
        <ProvedorDeTema><Dado valor="5" rotulo="vistorias" testID="indicador" /></ProvedorDeTema>,
      );
    });

    expect(numeroDesenhado("indicador")).toBe("5");
    expect(espiao).toHaveBeenCalledTimes(1);
  });

  it("o valor que muda NO MEIO da contagem interrompe a contagem e aparece direto", async () => {
    await montar(<Dado valor="12" rotulo="vistorias" testID="indicador" />);
    await passar(movimento.mudancaDeEstado / 4);
    const noMeio = Number(numeroDesenhado("indicador"));
    expect(noMeio).toBeGreaterThan(0);
    expect(noMeio).toBeLessThan(12);

    await act(async () => {
      screen.rerender(
        <ProvedorDeTema><Dado valor="7" rotulo="vistorias" testID="indicador" /></ProvedorDeTema>,
      );
    });

    expect(numeroDesenhado("indicador")).toBe("7");
    await passar(movimento.mudancaDeEstado);
    expect(numeroDesenhado("indicador")).toBe("7");
  });
});

describe("o que NÃO conta", () => {
  it.each([
    ["um protocolo com zeros à esquerda", "000123"],
    ["uma fração", "5 de 7"],
    ["uma palavra", "Ana"],
  ])("%s nasce pronto: só contagem sobe", async (_, valor) => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<Dado valor={valor} rotulo="qualquer" mono={false} testID="indicador" />);

    expect(numeroDesenhado("indicador")).toBe(valor);
    expect(espiao).not.toHaveBeenCalled();
  });

  it("zero nasce zero: não há de onde subir", async () => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<Dado valor="0" rotulo="coletas na fila" testID="indicador" />);

    expect(numeroDesenhado("indicador")).toBe("0");
    expect(espiao).not.toHaveBeenCalled();
  });
});
