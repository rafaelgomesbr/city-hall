/**
 * A faixa de sincronização, e o clímax da fila esvaziando.
 *
 * Dois defeitos que estes testes travam, e nenhum dos dois é estético:
 *
 * 1. **Comemorar toda hora.** Se o clímax disparasse sempre que a faixa
 *    aparecesse em "tudo sincronizado", ele rodaria a cada abertura do
 *    aplicativo com a fila já vazia, e a cada renderização. Comemoração que
 *    acontece o tempo todo deixa de significar coisa nenhuma, e a única coisa
 *    que ela ainda comunicaria seria movimento gratuito na tela de quem está
 *    tentando ler a lista de tarefas.
 * 2. **Animar quem pediu para não animar.** Quem liga a redução de movimento no
 *    sistema quase nunca liga por gosto: liga porque animação dá enjoo. Este
 *    aplicativo põe essa pessoa em pé num barranco, na chuva.
 */

import { AccessibilityInfo, Animated } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

import { ProvedorDeTema } from "./componentes";
import { FaixaDeSincronizacao, type EstadoDaFaixa } from "./FaixaDeSincronizacao";

const ESTADOS: Record<EstadoDaFaixa["chave"], EstadoDaFaixa> = {
  sem_sinal: {
    chave: "sem_sinal", fundo: "#FEF3C7", cor: "#92400E", sinalTexto: "!",
    titulo: "Sem sinal", detalhe: "Salvando neste aparelho",
  },
  enviando: {
    chave: "enviando", fundo: "#F1F5F9", cor: "#14191D", sinalTexto: "↑",
    titulo: "Enviando", detalhe: "2 na fila",
  },
  esperando: {
    chave: "esperando", fundo: "#F1F5F9", cor: "#14191D", sinalTexto: "↑",
    titulo: "Com sinal", detalhe: "2 esperando envio",
  },
  sincronizado: {
    chave: "sincronizado", fundo: "#DCFCE7", cor: "#14532D", sinalTexto: "✓",
    titulo: "Tudo sincronizado", detalhe: "Nada pendente no aparelho",
  },
};

/*
  A sequência é espionada em vez de o valor animado ser lido. O que se quer
  provar é "houve clímax" ou "não houve", e `Animated.sequence` é a assinatura
  exata do clímax: o movimento de troca comum usa `timing` sozinho.
*/
let sequencias: number;
let redutorLigado: boolean;

beforeEach(() => {
  sequencias = 0;
  redutorLigado = false;
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(redutorLigado));
  jest.spyOn(AccessibilityInfo, "addEventListener")
    .mockReturnValue({ remove: () => undefined } as never);
  jest.spyOn(Animated, "sequence").mockImplementation((animacoes) => {
    sequencias += 1;
    return { start: (fim?: (r: { finished: boolean }) => void) => fim?.({ finished: true }),
      stop: () => undefined, reset: () => undefined,
      _startNativeLoop: () => undefined, _isUsingNativeDriver: () => true } as never;
  });
});

afterEach(() => { jest.restoreAllMocks(); });

function faixa(chave: EstadoDaFaixa["chave"], bloqueados = 0) {
  return (
    <ProvedorDeTema>
      <FaixaDeSincronizacao
        estado={ESTADOS[chave]} bloqueados={bloqueados} aoTocar={() => undefined} />
    </ProvedorDeTema>
  );
}

/* A leitura da redução de movimento é uma promessa: sem deixá-la chegar, ela
   cairia no meio da primeira asserção e o teste ficaria intermitente. */
async function montar(chave: EstadoDaFaixa["chave"], bloqueados = 0) {
  /*
    O `render` vai DENTRO do `act`, e não antes dele. Fora, o `act` vazio
    seguinte se sobrepõe ao que a própria biblioteca já abriu para a
    renderização, e o React reclama de chamadas sobrepostas: a partir da
    segunda montagem do arquivo, a árvore não é mais encontrada.
  */
  let tela!: Awaited<ReturnType<typeof render>>;
  await act(async () => { tela = await render(faixa(chave, bloqueados)); });
  return tela;
}

async function trocarPara(tela: Awaited<ReturnType<typeof render>>, chave: EstadoDaFaixa["chave"]) {
  await act(async () => { await tela.rerender(faixa(chave)); });
}

describe("o que a faixa diz", () => {
  it("mostra título, detalhe e símbolo, porque cor sozinha não comunica", async () => {
    await montar("sem_sinal");
    expect(screen.getByText("Sem sinal")).toBeTruthy();
    expect(screen.getByText("Salvando neste aparelho")).toBeTruthy();
    expect(screen.getByText("!")).toBeTruthy();
  });

  it("acrescenta os bloqueados ao detalhe, para o agente saber que há o que resolver", async () => {
    await montar("esperando", 3);
    expect(screen.getByText(/3 com problema/)).toBeTruthy();
  });

  it("é um botão, e o rótulo falado diz para onde leva", async () => {
    await montar("sincronizado");
    const barra = screen.getByTestId("faixa-de-sincronizacao");
    expect(barra.props.accessibilityRole).toBe("button");
    expect(barra.props.accessibilityLabel).toMatch(/fila de envio/);
  });
});

describe("o clímax da fila esvaziando", () => {
  it("NÃO comemora ao abrir já sincronizado", async () => {
    // Abrir com a fila vazia não é a fila tendo esvaziado. Sem esta regra, a
    // comemoração viraria ruído de toda abertura do aplicativo.
    await montar("sincronizado");
    expect(sequencias).toBe(0);
  });

  it("NÃO comemora quando o estado é o mesmo entre renderizações", async () => {
    const tela = await montar("sincronizado");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(0);
  });

  it("comemora quando ENVIANDO vira sincronizado", async () => {
    const tela = await montar("enviando");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(1);
  });

  it("comemora quando ESPERANDO vira sincronizado", async () => {
    const tela = await montar("esperando");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(1);
  });

  it("NÃO comemora quando SEM SINAL vira sincronizado", async () => {
    /*
      Sem sinal com a fila vazia virando "tudo sincronizado" é só o sinal
      voltando: nada foi enviado, porque não havia o que enviar. Comemorar aí
      seria comemorar que o telefone pegou rede.
    */
    const tela = await montar("sem_sinal");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(0);
  });

  it("NÃO comemora em troca de estado que não termina em sincronizado", async () => {
    const tela = await montar("sem_sinal");
    await trocarPara(tela, "enviando");
    expect(sequencias).toBe(0);
  });
});

describe("redução de movimento", () => {
  it("com a chave ligada, a fila esvaziando NÃO anima, e a faixa continua dizendo tudo", async () => {
    redutorLigado = true;
    const tela = await montar("enviando");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(0);
    expect(screen.getByText("Tudo sincronizado")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
  });
});
