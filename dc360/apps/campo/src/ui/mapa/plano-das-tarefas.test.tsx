import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ProvedorDeTema } from "../componentes";
import { PlanoDasTarefas } from "./PlanoDasTarefas";
import type { PinoNoMapa } from "./pinos";

/**
 * O DESENHO DAS TAREFAS SEM LADRILHO, e as três coisas que ele não pode fazer.
 *
 * Este é o mapa de quem está sem sinal, ou de quem trabalha num município que
 * optou por não mandar coordenada ao Google. Ele não é caminho de segunda: é
 * onde este aplicativo mais é usado.
 *
 * 1. **Não pode prometer escala.** A frase que desmente o desenho é caso de
 *    teste, e não detalhe de texto: apagá-la transforma um diagrama honesto num
 *    mapa que mente de graça.
 * 2. **Não pode esconder tarefa.** Um pino por tarefa, e todos tocáveis: a
 *    lista está logo abaixo, mas quem olha o desenho precisa poder escolher
 *    nele.
 * 3. **Não pode desenhar o agente que ele não conhece.** Sem GPS, o ponto do
 *    agente não existe, e a tela diz isso.
 */

const AQUI = { latitude: -27.595378, longitude: -48.548050 };
const aoNorte = (metros: number) => ({
  latitude: AQUI.latitude + metros / 111_000,
  longitude: AQUI.longitude,
});

const tocouNoSegundo = jest.fn();

const DUAS: PinoNoMapa[] = [
  { id: "primeira", ponto: aoNorte(300), rotulo: "Ver a primeira", severidade: "critica" },
  {
    id: "segunda",
    ponto: aoNorte(900),
    rotulo: "Ver a segunda",
    severidade: "baixa",
    aoTocar: () => { tocouNoSegundo(); },
  },
];

async function desenhar(
  pinos: PinoNoMapa[],
  agente: typeof AQUI | null,
): Promise<void> {
  await act(async () => {
    await render(
      <ProvedorDeTema>
        <PlanoDasTarefas pinos={pinos} agente={agente} />
      </ProvedorDeTema>,
    );
  });
}

beforeEach(() => { tocouNoSegundo.mockClear(); });

describe("com mais de uma tarefa, o desenho mostra a posição relativa", () => {
  it("um pino por tarefa, e cada um traz a identidade da ocorrência", async () => {
    await desenhar(DUAS, AQUI);

    expect(screen.getByTestId("pino-primeira")).toBeTruthy();
    expect(screen.getByTestId("pino-segunda")).toBeTruthy();
  });

  it("o pino é tocável, e o toque avisa quem o montou", async () => {
    await desenhar(DUAS, AQUI);

    await act(async () => { fireEvent.press(screen.getByTestId("pino-segunda")); });

    expect(tocouNoSegundo).toHaveBeenCalledTimes(1);
  });

  it("o escolhido se apresenta como escolhido a quem ouve a tela", async () => {
    await desenhar(
      DUAS.map((p) => (p.id === "segunda" ? { ...p, escolhido: true } : p)),
      AQUI,
    );

    expect(screen.getByTestId("pino-segunda").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("pino-primeira").props.accessibilityState.selected).toBe(false);
  });

  /*
    A frase é o desmentido do próprio desenho. O olho acredita no desenho antes
    de ler o número, e sem ela duas tarefas a oitenta metros uma da outra, nos
    cantos opostos do quadro, pareceriam estar do outro lado da cidade.
  */
  it("a tela diz que o desenho não é distância", async () => {
    await desenhar(DUAS, AQUI);

    expect(screen.getByText(/não a que distância/)).toBeTruthy();
    expect(screen.getByText(/O topo é o norte/)).toBeTruthy();
  });

  it("com GPS, o ponto do agente é desenhado", async () => {
    await desenhar(DUAS, AQUI);
    expect(screen.getByTestId("plano-agente")).toBeTruthy();
  });

  /*
    O par do caso acima, e é ele que impede o arquivo de passar verde por acaso:
    um componente que sempre desenhasse o agente passaria no de cima e reprovaria
    aqui.
  */
  it("sem GPS, o agente não é desenhado, e a tela explica a ausência", async () => {
    await desenhar(DUAS, null);

    expect(screen.queryByTestId("plano-agente")).toBeNull();
    expect(screen.getByText(/ainda não sabe onde você está/)).toBeTruthy();
  });
});

describe("com UMA tarefa só, ele delega para o desenho de rumo", () => {
  /*
    Um ponto sozinho não tem posição relativa a nada: a projeção degeneraria, e
    o próprio `PlanoEsquematico` já escreve o porquê. Com uma tarefa a pergunta
    volta a ser "para que lado eu ando", e a resposta é a rosa dos ventos com o
    rumo verdadeiro.
  */
  it("desenha a rosa dos ventos, com a seta do rumo, e não a projeção", async () => {
    await desenhar([DUAS[0]!], AQUI);

    expect(screen.queryByTestId("plano-das-tarefas")).toBeNull();
    expect(screen.getByTestId("plano-seta")).toBeTruthy();
    expect(screen.getByText(/de onde você está/)).toBeTruthy();
  });

  /*
    E o pino dali TAMBÉM leva criticidade, porque a tela que mostra este desenho
    é a mesma que desenha a legenda. O `plano-imovel` continua existindo, e é
    ele que os casos da vistoria já conferem.
  */
  it("o pino da única tarefa continua marcado", async () => {
    await desenhar([DUAS[0]!], AQUI);
    expect(screen.getByTestId("plano-imovel")).toBeTruthy();
  });
});
