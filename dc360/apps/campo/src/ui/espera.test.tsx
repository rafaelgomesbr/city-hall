import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { Carregando, ProvedorDeTema } from "./componentes";

/**
 * O que estes testes protegem: a espera ter fim declarado e ter porta de saída.
 *
 * O defeito real, relatado no uso em aparelho: "ao sair da aba envio e ir para
 * a aba tarefas fica um spinner roxo estático, sem animação nenhuma, pendurado
 * no topo da tela para sempre". A causa não era o desenho: era a espera não ter
 * segunda linha nem saída. Primeira abertura, sem cópia gravada, com sinal
 * fraco, e a tela ficava naquele estado até o agente matar o aplicativo, que é
 * o único jeito de perder coleta neste produto.
 *
 * Os três travamentos, e o que cada um deixa acontecer se sair:
 *
 * 1. A segunda linha aparece aos seis segundos e NÃO antes. Sem o "não antes",
 *    passaria um componente que já nasce dizendo que está demorando, o que
 *    ensina o agente a ignorar o aviso.
 * 2. Existe saída, e ela tira a espera da tela.
 * 3. O temporizador morre no desmonte. Sair da aba antes dos seis segundos não
 *    pode deixar um `setTimeout` vivo escrevendo em componente desmontado.
 */

/*
  O esquema do aparelho vira variável do teste, com o nome começando em "mock"
  porque a fábrica do `jest.mock` é içada para antes das declarações do arquivo.
*/
let mockEsquemaDoAparelho: "light" | "dark" = "dark";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquemaDoAparelho,
}));

/** O que o sistema responde sobre redução de movimento, controlado pelo teste. */
let mockReducaoDeMovimento = false;
/** O ouvinte que o componente registrou, para o teste virar a chave no meio. */
let ouvinteDeReducao: ((ligado: boolean) => void) | null = null;
let inscricoesRemovidas = 0;

beforeEach(() => {
  mockEsquemaDoAparelho = "dark";
  mockReducaoDeMovimento = false;
  ouvinteDeReducao = null;
  inscricoesRemovidas = 0;

  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(async () => mockReducaoDeMovimento);
  jest.spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation(((evento: string, ouvinte: (ligado: boolean) => void) => {
      if (evento === "reduceMotionChanged") ouvinteDeReducao = ouvinte;
      return { remove: () => { inscricoesRemovidas += 1; } };
    }) as unknown as typeof AccessibilityInfo.addEventListener);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function montarEspera(aoDesistir?: () => void) {
  await render(
    <ProvedorDeTema>
      <Carregando mensagem="Abrindo a sua equipe" aoDesistir={aoDesistir} />
    </ProvedorDeTema>,
  );
  /* A leitura da redução de movimento é uma promessa: sem isto, ela chegaria
     no meio da primeira asserção e o teste ficaria intermitente. */
  await act(async () => {});
}

const SEGUNDA_LINHA = /demorando mais que o normal/i;

describe("a espera que passa dos seis segundos", () => {
  it("não diz que está demorando antes da hora, e diz aos seis segundos", async () => {
    jest.useFakeTimers();
    await montarEspera();

    /* Um quinto de segundo antes do prazo: ainda é espera normal. */
    await act(async () => { jest.advanceTimersByTime(5_800); });
    expect(screen.queryByText(SEGUNDA_LINHA)).toBeNull();
    expect(screen.queryByLabelText("Parar de esperar")).toBeNull();

    await act(async () => { jest.advanceTimersByTime(200); });
    expect(screen.getByText(SEGUNDA_LINHA)).toBeTruthy();
    expect(screen.getByLabelText("Parar de esperar")).toBeTruthy();
  });

  it("o rótulo lido em voz alta também muda, para quem não vê a segunda linha", async () => {
    jest.useFakeTimers();
    await montarEspera();

    const espera = screen.getByTestId("espera");
    expect(espera.props.accessibilityRole).toBe("progressbar");
    expect(espera.props.accessibilityLabel).toBe("Abrindo a sua equipe");
    expect(espera.props.accessibilityState.busy).toBe(true);

    await act(async () => { jest.advanceTimersByTime(6_000); });
    expect(screen.getByTestId("espera").props.accessibilityLabel).toMatch(SEGUNDA_LINHA);
  });

  it("a saída avisa a tela que chamou e tira a espera de cima do agente", async () => {
    jest.useFakeTimers();
    const aoDesistir = jest.fn();
    await montarEspera(aoDesistir);

    await act(async () => { jest.advanceTimersByTime(6_000); });
    await fireEvent.press(screen.getByLabelText("Parar de esperar"));

    expect(aoDesistir).toHaveBeenCalledTimes(1);
    /* E, mesmo que a tela que chamou não faça nada, a roda some daqui. */
    expect(screen.queryByTestId("espera")).toBeNull();
    expect(screen.getByText(/parou a espera/i)).toBeTruthy();
  });

  it("o temporizador morre junto com a tela", async () => {
    jest.useFakeTimers();

    /*
      O teste segue o temporizador PELO NÚMERO, e não pela contagem de
      temporizadores pendentes: o React e a biblioteca de teste agendam os
      deles, e uma contagem global responderia "sobrou coisa" mesmo com a
      limpeza correta. Aqui só interessa um: o dos seis segundos.
    */
    const agendarDeVerdade = globalThis.setTimeout;
    const limparDeVerdade = globalThis.clearTimeout;
    const idsDaDemora: unknown[] = [];
    const idsLimpos: unknown[] = [];
    jest.spyOn(globalThis, "setTimeout").mockImplementation(((
      tarefa: () => void, ms?: number, ...resto: unknown[]
    ) => {
      const id = (agendarDeVerdade as unknown as (...a: unknown[]) => unknown)(
        tarefa, ms, ...resto,
      );
      if (ms === 6_000) idsDaDemora.push(id);
      return id;
    }) as unknown as typeof globalThis.setTimeout);
    jest.spyOn(globalThis, "clearTimeout").mockImplementation(((id: unknown) => {
      idsLimpos.push(id);
      return (limparDeVerdade as unknown as (...a: unknown[]) => unknown)(id);
    }) as unknown as typeof globalThis.clearTimeout);

    await montarEspera();
    expect(idsDaDemora).toHaveLength(1);

    await screen.unmount();

    /*
      Sair da aba antes dos seis segundos precisa desarmar este temporizador.
      Sem isto ele dispara `setDemorou` num componente que já saiu da tela: não
      quebra nada visível, vira aviso repetido no console, e aviso repetido é
      onde defeito de verdade se esconde.
    */
    expect(idsLimpos).toContain(idsDaDemora[0]);
  });
});

describe("a espera contra a redução de movimento do aparelho", () => {
  it("com a chave desligada, a roda gira", async () => {
    await montarEspera();
    expect(screen.getByTestId("espera-girando")).toBeTruthy();
    expect(screen.queryByTestId("espera-sem-movimento")).toBeNull();
  });

  it("com a chave ligada no sistema, nada gira", async () => {
    mockReducaoDeMovimento = true;
    await montarEspera();
    expect(screen.getByTestId("espera-sem-movimento")).toBeTruthy();
    expect(screen.queryByTestId("espera-girando")).toBeNull();
    /* A tela continua dizendo em palavras o que está acontecendo. */
    expect(screen.getByText("Abrindo a sua equipe")).toBeTruthy();
  });

  it("a chave virada no meio do plantão vale na hora, sem reabrir o aplicativo", async () => {
    await montarEspera();
    expect(screen.getByTestId("espera-girando")).toBeTruthy();

    await act(async () => { ouvinteDeReducao?.(true); });
    expect(screen.getByTestId("espera-sem-movimento")).toBeTruthy();
    expect(screen.queryByTestId("espera-girando")).toBeNull();
  });

  it("a inscrição no evento é desfeita no desmonte", async () => {
    await montarEspera();
    expect(inscricoesRemovidas).toBe(0);
    await screen.unmount();
    /* Sem isto, cada tela aberta no plantão deixa um ouvinte vivo no emissor. */
    expect(inscricoesRemovidas).toBe(1);
  });
});
