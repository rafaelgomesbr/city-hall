/**
 * A FOLHA SOBRE O MAPA, provada.
 *
 * O que cada bloco aqui defende não é "o componente renderiza": é um defeito
 * concreto que uma folha arrastável tem quando é escrita sem cuidado, e que só
 * aparece com o dedo na tela, num aparelho fraco, em pé no morro.
 *
 * 1. **Arrastar não pode re-renderizar.** É a interação mais sensível do
 *    aplicativo: sessenta quadros por segundo com uma lista de tarefas dentro.
 * 2. **O gesto horizontal é proibido**, e recusá-lo é o que devolve o arraste
 *    ao mapa.
 * 3. **A rolagem de dentro e o arraste da folha não podem brigar.**
 * 4. **A folha convive com o mapa**, ao contrário do `Dialogo`, que bloqueia.
 * 5. **Quem usa leitor de tela precisa conseguir mover a folha**, e não pode
 *    ouvir uma lista que quem enxerga não está vendo.
 */

import { Animated, StyleSheet, View } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

/*
  O RELÓGIO DE RENDERIZAÇÃO DA FOLHA, e por que ele é este e não outro.

  A primeira versão deste arquivo contava as renderizações de um componente
  passado como `children`, e o contador NÃO SABIA FALHAR: `children` chega como
  o MESMO elemento a cada renderização da folha, e o React desvia da subárvore
  inteira quando a referência do elemento não muda. Ou seja, aquele contador
  teria ficado parado mesmo com o arraste inteiro dentro de `useState`, que é
  exatamente o defeito que ele existia para pegar.

  `useReducaoDeMovimento` é chamado UMA vez por renderização da
  `FolhaArrastavel`, e nada mais nesta árvore o chama. Trocado por este dublê,
  ele passa a ser um contador exato de renderizações da peça, e de mais nada.
  O gancho de verdade tem teste próprio e não é o que está sendo medido aqui.
*/
var mockFolha = { renderizacoes: 0, reduzir: false };
jest.mock("./useReducaoDeMovimento", () => ({
  useReducaoDeMovimento: () => {
    mockFolha.renderizacoes += 1;
    return mockFolha.reduzir;
  },
}));

import { ProvedorDeTema, Txt } from "./componentes";
import {
  FolhaArrastavel, FRACAO_DA_POSICAO, LIMIAR_DE_ARRASTE, NOME_DA_POSICAO,
  deveOArrasteComecar, posicaoAoSoltar, posicoesOrdenadas,
  type PosicaoDaFolha,
} from "./FolhaArrastavel";
import { elevacao, movimento, temaClaro, temaEscuro, toque } from "./tokens";

/* ============================================================
   Instrumentos
   ============================================================ */

/*
  As animações são espionadas, e não lidas do valor animado, pelo mesmo motivo
  escrito em `dialogo.test.tsx`: o que se quer provar é "animou", "com qual
  duração" e "pela camada nativa". `Animated.timing` é a única forma de
  movimento que esta peça usa.
*/
let animacoes: Array<{ duracao: number | undefined; nativo: boolean | undefined }>;

function Conteudo({ quantos }: { quantos: number }) {
  return (
    <View>
      {Array.from({ length: quantos }, (_, i) => (
        <Txt key={i}>Tarefa {i + 1}</Txt>
      ))}
    </View>
  );
}

beforeEach(() => {
  animacoes = [];
  mockEsquema = "light";
  mockFolha.renderizacoes = 0;
  mockFolha.reduzir = false;
  relogioDoToque = 10_000;

  jest.spyOn(Animated, "timing").mockImplementation((_valor, config) => {
    animacoes.push({ duracao: config.duration, nativo: config.useNativeDriver });
    return {
      start: (fim?: (r: { finished: boolean }) => void) => fim?.({ finished: true }),
      stop: () => undefined, reset: () => undefined,
      _startNativeLoop: () => undefined, _isUsingNativeDriver: () => true,
    } as never;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Um dedo, do jeito EXATO que o `PanResponder` de verdade recebe.
 *
 * O `touchHistory` vem completo porque o `PanResponder` não lê a posição do
 * `nativeEvent`: ele calcula `dx`, `dy` e `vy` a partir do `touchBank`,
 * acumulando `atual menos anterior` e dividindo pelo intervalo de tempo. Um
 * evento pela metade exercitaria um caminho que o aparelho nunca executa, e
 * `dy` sairia sempre zero, o que faria TODO teste de arraste daqui passar sem
 * provar nada.
 *
 * O relógio avança de verdade porque é dele que sai a velocidade: o mesmo
 * deslocamento em 16 ms é um arremesso e em 400 ms é um arraste, e a folha
 * precisa responder diferente aos dois.
 */
let relogioDoToque = 10_000;

function criarDedo(x0: number, y0: number) {
  const t0 = (relogioDoToque += 1_000);
  let x = x0;
  let y = y0;
  let t = t0;
  let px = x0;
  let py = y0;
  let pt = t0;

  const evento = () => {
    const ponto = {
      locationX: x, locationY: y, pageX: x, pageY: y,
      identifier: 1, target: 1, timestamp: t,
    };
    return {
      nativeEvent: { ...ponto, touches: [ponto], changedTouches: [ponto] },
      touchHistory: {
        touchBank: [{
          touchActive: true,
          startPageX: x0, startPageY: y0, startTimeStamp: t0,
          currentPageX: x, currentPageY: y, currentTimeStamp: t,
          previousPageX: px, previousPageY: py, previousTimeStamp: pt,
        }],
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: t,
      },
    };
  };

  return {
    evento,
    mover(dx: number, dy: number, ms: number) {
      px = x; py = y; pt = t;
      x += dx; y += dy; t += ms;
      return evento();
    },
  };
}

const ALTURA_DA_TELA = 800;

type Montagem = {
  posicao?: PosicaoDaFolha;
  posicoes?: readonly PosicaoDaFolha[];
  comRodape?: boolean;
  tarefas?: number;
};

const aoMudarPosicao = jest.fn();

async function montar({
  posicao = "meia", posicoes, comRodape = true, tarefas = 3,
}: Montagem = {}) {
  aoMudarPosicao.mockClear();
  /*
    A montagem vai dentro de `act`, como em `dialogo.test.tsx`: é o que deixa a
    leitura da chave de redução de movimento (uma promessa) chegar ANTES da
    primeira medida. Medir com a chave ainda indefinida faria a folha entrar
    animada mesmo para quem pediu para não animar.
  */
  await act(async () => {
    render(
      <ProvedorDeTema>
        <FolhaArrastavel
          posicao={posicao}
          posicoes={posicoes}
          aoMudarPosicao={aoMudarPosicao}
          rotulo="Tarefas de hoje"
          cabecalho={<Txt variante="h2">Tarefas de hoje</Txt>}
          rodape={comRodape ? <Txt>Abrir a vistoria</Txt> : undefined}
        >
          <Conteudo quantos={tarefas} />
        </FolhaArrastavel>
      </ProvedorDeTema>,
    );
  });
  await entregar("folha-area", "Layout", {
    nativeEvent: { layout: { width: 390, height: ALTURA_DA_TELA, x: 0, y: 0 } },
  });
}

/**
 * Entrega um evento do sistema de responder DIRETO ao tratador da peça.
 *
 * `fireEvent` não serve para isto, e o motivo é instrutivo: antes de entregar
 * um evento de responder, ele PERGUNTA ao elemento, chamando
 * `onStartShouldSetResponder()` e `onMoveShouldSetResponder()` sem argumento
 * nenhum, e desiste quando os dois respondem "não". Esta folha responde "não"
 * de propósito, sempre, até o dedo passar do limiar: é assim que ela não
 * engole os toques dos cartões que moram dentro dela. O resultado é que o
 * caminho mais cômodo de teste é justamente o que o comportamento correto
 * fecha.
 *
 * O que este atalho NÃO pula: os tratadores chamados aqui são os do
 * `PanResponder` de verdade, criados por `PanResponder.create`, com o
 * `touchHistory` completo. Quem calcula `dx`, `dy` e `vy` continua sendo o
 * React Native, e não o teste.
 */
async function entregar(id: string, nome: string, evento: unknown): Promise<unknown> {
  const alvo = screen.getByTestId(id);
  const tratador = alvo.props[`on${nome}`] as ((e: unknown) => unknown) | undefined;
  if (!tratador) throw new Error(`o elemento "${id}" não tem on${nome}`);
  let retorno: unknown;
  await act(async () => { retorno = tratador(evento); });
  return retorno;
}

/** Faz o gesto inteiro, na ordem em que o sistema de responder o entrega. */
async function arrastar({ dx = 0, dy, ms = 300, passos = 1 }: {
  dx?: number; dy: number; ms?: number; passos?: number;
}): Promise<{ assumiu: boolean }> {
  const dedo = criarDedo(200, 400);

  await entregar("folha", "StartShouldSetResponderCapture", dedo.evento());
  const assumiu = await entregar(
    "folha",
    "MoveShouldSetResponderCapture",
    dedo.mover(dx / passos, dy / passos, ms / passos),
  ) === true;
  if (!assumiu) return { assumiu };

  await entregar("folha", "ResponderGrant", dedo.evento());
  for (let i = 0; i < passos; i++) {
    await entregar("folha", "ResponderMove", dedo.mover(dx / passos, dy / passos, ms / passos));
  }
  await entregar("folha", "ResponderRelease", dedo.evento());
  return { assumiu };
}

async function rolarInternamente(y: number): Promise<void> {
  await entregar("folha-rolagem", "Scroll", {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 390, height: 4000 },
      layoutMeasurement: { width: 390, height: 400 },
    },
  });
}

function estiloDe(id: string): Record<string, unknown> {
  return (StyleSheet.flatten(screen.getByTestId(id).props.style) ?? {}) as Record<string, unknown>;
}

/** Resolve um `translateY` que pode ter chegado como número ou como nó animado. */
function deslocamentoDe(id: string): number {
  const transform = estiloDe(id).transform as Array<{ translateY: unknown }> | undefined;
  const bruto = transform?.[0]?.translateY;
  if (typeof bruto === "number") return bruto;
  return (bruto as { __getValue: () => number }).__getValue();
}

/* ============================================================
   A aritmética das posições, sozinha
   ============================================================ */

describe("onde a folha para quando o dedo solta", () => {
  const tres = ["recolhida", "meia", "cheia"] as const;

  it("ordena pela FRAÇÃO, e não pela ordem em que a lista foi escrita", () => {
    expect(posicoesOrdenadas(["cheia", "recolhida", "meia"]))
      .toEqual(["recolhida", "meia", "cheia"]);
    /* E a repetida não vira duas posições. */
    expect(posicoesOrdenadas(["meia", "meia", "cheia"])).toEqual(["meia", "cheia"]);
  });

  it("vai para a posição mais perto de onde o dedo soltou", () => {
    /* De meia (440 pontos), descendo 150: para em 290, e 224 está mais perto. */
    expect(posicaoAoSoltar({
      posicao: "meia", deslocamento: 150, velocidade: 0, posicoes: tres, altura: ALTURA_DA_TELA,
    })).toBe("recolhida");
  });

  it("não muda de posição quando o dedo andou menos de metade do caminho", () => {
    /* Mesmo gesto, 80 pontos: 360 ainda está mais perto de 440 do que de 224. */
    expect(posicaoAoSoltar({
      posicao: "meia", deslocamento: 80, velocidade: 0, posicoes: tres, altura: ALTURA_DA_TELA,
    })).toBe("meia");
  });

  it("o arremesso anda uma posição mesmo com o dedo tendo andado pouco", () => {
    /*
      Vinte pontos para baixo NÃO mudariam nada pela distância (a asserção
      acima prova isso com oitenta). Com velocidade de arremesso, mudam. É esta
      diferença que separa o gesto de quem anda com o aparelho na mão do gesto
      de quem posiciona a folha com calma.
    */
    expect(posicaoAoSoltar({
      posicao: "meia", deslocamento: 20, velocidade: 0, posicoes: tres, altura: ALTURA_DA_TELA,
    })).toBe("meia");
    expect(posicaoAoSoltar({
      posicao: "meia", deslocamento: 20, velocidade: 1.25, posicoes: tres, altura: ALTURA_DA_TELA,
    })).toBe("recolhida");
    expect(posicaoAoSoltar({
      posicao: "meia", deslocamento: -20, velocidade: -1.25, posicoes: tres, altura: ALTURA_DA_TELA,
    })).toBe("cheia");
  });

  it("o arremesso nunca pula duas posições, nem sai da faixa", () => {
    expect(posicaoAoSoltar({
      posicao: "recolhida", deslocamento: 0, velocidade: 9, posicoes: tres, altura: ALTURA_DA_TELA,
    })).toBe("recolhida");
    expect(posicaoAoSoltar({
      posicao: "recolhida", deslocamento: 0, velocidade: -9, posicoes: tres, altura: ALTURA_DA_TELA,
    })).toBe("meia");
  });

  it("sem altura medida não inventa posição", () => {
    expect(posicaoAoSoltar({
      posicao: "meia", deslocamento: 400, velocidade: 3, posicoes: tres, altura: 0,
    })).toBe("meia");
  });

  it("respeita a lista de posições que a tela ofereceu", () => {
    /* Uma folha de duas posições não tem "recolhida" para onde descer. */
    expect(posicaoAoSoltar({
      posicao: "meia", deslocamento: 300, velocidade: 2,
      posicoes: ["meia", "cheia"], altura: ALTURA_DA_TELA,
    })).toBe("meia");
  });
});

describe("quando a folha tem direito de tomar o gesto", () => {
  const tres = ["recolhida", "meia", "cheia"] as const;
  const base = { posicao: "meia" as PosicaoDaFolha, listaNoTopo: true, posicoes: tres };

  it("recusa o que ainda pode virar um toque", () => {
    expect(deveOArrasteComecar({ ...base, dx: 0, dy: LIMIAR_DE_ARRASTE - 1 })).toBe(false);
    expect(deveOArrasteComecar({ ...base, dx: 0, dy: LIMIAR_DE_ARRASTE })).toBe(true);
  });

  it("recusa o gesto horizontal, que é proibido nesta peça", () => {
    /*
      A distância vertical é a mesma dos casos aceitos: o que reprova é o
      horizontal DOMINAR. Sem esta recusa, o dedo molhado que escorrega de lado
      arrastaria a folha em vez de arrastar o mapa.
    */
    expect(deveOArrasteComecar({ ...base, dx: 60, dy: 30 })).toBe(false);
    expect(deveOArrasteComecar({ ...base, dx: -60, dy: -30 })).toBe(false);
    expect(deveOArrasteComecar({ ...base, dx: 20, dy: 30 })).toBe(true);
  });

  it("descendo, só toma o gesto com a lista no topo", () => {
    expect(deveOArrasteComecar({ ...base, dx: 0, dy: 40, listaNoTopo: false })).toBe(false);
    expect(deveOArrasteComecar({ ...base, dx: 0, dy: 40, listaNoTopo: true })).toBe(true);
  });

  it("subindo, toma o gesto mesmo com a lista rolada, até chegar na maior", () => {
    expect(deveOArrasteComecar({ ...base, dx: 0, dy: -40, listaNoTopo: false })).toBe(true);
    expect(deveOArrasteComecar({
      ...base, posicao: "cheia", dx: 0, dy: -40, listaNoTopo: false,
    })).toBe(false);
  });

  it("na menor posição, puxar para baixo não faz nada: a folha não se fecha", () => {
    expect(deveOArrasteComecar({ ...base, posicao: "recolhida", dx: 0, dy: 60 })).toBe(false);
  });
});

/* ============================================================
   O gesto, através do componente montado
   ============================================================ */

describe("o arraste, com o dedo na folha de verdade", () => {
  it("descer o bastante recolhe a folha, e avisa a tela", async () => {
    await montar({ posicao: "meia" });
    const { assumiu } = await arrastar({ dy: 200, ms: 400 });

    expect(assumiu).toBe(true);
    expect(aoMudarPosicao).toHaveBeenCalledWith("recolhida");
  });

  it("descer pouco devolve a folha para onde estava, sem avisar ninguém", async () => {
    await montar({ posicao: "meia" });
    await arrastar({ dy: 60, ms: 400 });

    /*
      O aviso é o que a tela usa para recentralizar o mapa. Mandar um aviso de
      "mudou" para uma folha que voltou ao mesmo lugar faria o mapa saltar a
      cada arraste desistido.
    */
    expect(aoMudarPosicao).not.toHaveBeenCalled();
  });

  it("o arremesso curto muda de posição, e o arraste curto não", async () => {
    await montar({ posicao: "meia" });
    /* 20 pontos em 16 ms: 1,25 ponto por milissegundo. */
    await arrastar({ dy: 20, ms: 16 });
    expect(aoMudarPosicao).toHaveBeenCalledWith("recolhida");

    await montar({ posicao: "meia" });
    /* Os mesmos 20 pontos, em 400 ms. */
    await arrastar({ dy: 20, ms: 400 });
    expect(aoMudarPosicao).not.toHaveBeenCalled();
  });

  it("com a lista rolada, puxar para baixo não tira o gesto da lista", async () => {
    await montar({ posicao: "cheia", tarefas: 60 });
    await rolarInternamente(320);

    expect((await arrastar({ dy: 150, ms: 400 })).assumiu).toBe(false);
    expect(aoMudarPosicao).not.toHaveBeenCalled();

    /* De volta ao topo, o mesmo gesto passa a ser da folha. */
    await rolarInternamente(0);
    expect((await arrastar({ dy: 150, ms: 400 })).assumiu).toBe(true);
    expect(aoMudarPosicao).toHaveBeenCalledWith("meia");
  });

  it("o gesto horizontal atravessa para o mapa em vez de mexer na folha", async () => {
    await montar({ posicao: "meia" });
    expect((await arrastar({ dx: 120, dy: 20, ms: 300 })).assumiu).toBe(false);
    expect(aoMudarPosicao).not.toHaveBeenCalled();
  });

  it("uma folha de duas posições não desce para a terceira", async () => {
    await montar({ posicao: "meia", posicoes: ["meia", "cheia"] });
    expect((await arrastar({ dy: 250, ms: 400 })).assumiu).toBe(false);
    expect(aoMudarPosicao).not.toHaveBeenCalled();
  });
});

describe("a folha segue o dedo, e para onde o dedo mandou", () => {
  /**
   * O QUE NENHUM CASO OLHAVA: onde a folha ESTÁ.
   *
   * Os casos de arraste acima provam que a folha toma o gesto certo e avisa a
   * tela a posição certa. Nenhum deles olha o valor animado, que é a única
   * coisa que o agente vê. Uma folha que decide "recolhida" e desenha "cheia"
   * passa nos dois, e é exatamente isso que o dedo encontra no aparelho.
   *
   * A chave de redução de movimento fica LIGADA nestes casos, e não é por
   * acessibilidade: com ela `irPara` usa `setValue` em vez de `Animated.timing`,
   * e `Animated.timing` está dublado neste arquivo por um dublê que nunca
   * aplica valor nenhum. Sem a chave, o valor lido seria o do dublê, e não o da
   * peça.
   */
  const ALTURA_CHEIA = ALTURA_DA_TELA * FRACAO_DA_POSICAO.cheia;
  const ondeFica = (p: PosicaoDaFolha) => ALTURA_CHEIA - ALTURA_DA_TELA * FRACAO_DA_POSICAO[p];

  /**
   * Pega a folha e arrasta `dy` DEPOIS de pegá-la, sem soltar.
   *
   * O deslocamento do primeiro movimento (o que faz a folha assumir o gesto)
   * não conta, e não é detalhe de teste: `onPanResponderGrant` zera `dx` e `dy`
   * no aparelho também, então o dedo só começa a mover a folha depois de a
   * folha ser dele.
   */
  async function pegarEArrastar(dy: number, ms = 300): Promise<void> {
    const dedo = criarDedo(200, 400);
    await entregar("folha", "StartShouldSetResponderCapture", dedo.evento());
    const assumiu = await entregar(
      "folha", "MoveShouldSetResponderCapture", dedo.mover(0, dy > 0 ? 12 : -12, 16),
    );
    if (assumiu !== true) throw new Error("a folha não assumiu o gesto");
    await entregar("folha", "ResponderGrant", dedo.evento());
    await entregar("folha", "ResponderMove", dedo.mover(0, dy, ms));
  }

  beforeEach(() => { mockFolha.reduzir = true; });

  it("cada quadro de arraste põe a folha onde o dedo está", async () => {
    await montar({ posicao: "meia" });
    expect(deslocamentoDe("folha")).toBeCloseTo(ondeFica("meia"));

    await pegarEArrastar(60);
    /*
      Sessenta pontos para baixo com o dedo na tela são sessenta pontos de folha
      descendo. Qualquer outra coisa é a folha saltando debaixo do dedo, que é o
      defeito que quem está de luva na chuva sente primeiro e não sabe nomear.
    */
    expect(deslocamentoDe("folha")).toBeCloseTo(ondeFica("meia") + 60);
  });

  it("o arraste não passa do fim: nem acima da maior, nem abaixo da menor", async () => {
    await montar({ posicao: "meia" });
    await pegarEArrastar(-600);
    expect(deslocamentoDe("folha")).toBeCloseTo(ondeFica("cheia"));

    await montar({ posicao: "meia" });
    await pegarEArrastar(600);
    expect(deslocamentoDe("folha")).toBeCloseTo(ondeFica("recolhida"));
  });

  it("ao soltar, a folha para na posição que ela mesma anunciou", async () => {
    /*
      A metade que faltava. `aoMudarPosicao` receber "recolhida" não quer dizer
      nada se a folha desenhada ficar em "cheia": a tela recentraliza o pino do
      mapa pela posição anunciada, e o mapa passa a mirar uma faixa que a folha
      está cobrindo. O agente arrasta a folha para baixo justamente para ver
      onde a casa fica.
    */
    await montar({ posicao: "meia" });
    await arrastar({ dy: 200, ms: 400 });
    expect(aoMudarPosicao).toHaveBeenLastCalledWith("recolhida");
    expect(deslocamentoDe("folha")).toBeCloseTo(ondeFica("recolhida"));

    await montar({ posicao: "meia" });
    await arrastar({ dy: -200, ms: 400 });
    expect(aoMudarPosicao).toHaveBeenLastCalledWith("cheia");
    expect(deslocamentoDe("folha")).toBeCloseTo(ondeFica("cheia"));
  });

  it("o arraste que desiste devolve a folha exatamente para onde ela estava", async () => {
    await montar({ posicao: "meia" });
    await arrastar({ dy: 60, ms: 400 });
    expect(aoMudarPosicao).not.toHaveBeenCalled();
    expect(deslocamentoDe("folha")).toBeCloseTo(ondeFica("meia"));
  });
});

describe("arrastar não pode engasgar", () => {
  it("nenhum quadro de arraste re-renderiza o conteúdo da folha", async () => {
    await montar({ posicao: "meia", tarefas: 40 });

    const dedo = criarDedo(200, 600);
    await entregar("folha", "StartShouldSetResponderCapture", dedo.evento());
    await entregar("folha", "MoveShouldSetResponderCapture", dedo.mover(0, 12, 16));
    await entregar("folha", "ResponderGrant", dedo.evento());

    const antes = mockFolha.renderizacoes;
    /*
      Quarenta quadros, que é cerca de dois terços de segundo de dedo na tela.
      Se a posição do dedo morasse em `useState`, seriam quarenta renderizações
      de uma lista de quarenta tarefas, e é exatamente esse o engasgo que se
      sente no aparelho de entrada.
    */
    for (let i = 0; i < 40; i++) {
      await entregar("folha", "ResponderMove", dedo.mover(0, -6, 16));
    }
    expect(mockFolha.renderizacoes).toBe(antes);

    /* E ao soltar, aí sim, porque a posição visível mudou e é dita em voz alta. */
    await entregar("folha", "ResponderRelease", dedo.evento());
    expect(mockFolha.renderizacoes).toBeGreaterThan(antes);
  });

  it("nenhum quadro de rolagem re-renderiza o conteúdo da folha", async () => {
    await montar({ posicao: "cheia", tarefas: 40 });
    const antes = mockFolha.renderizacoes;
    for (let i = 1; i <= 30; i++) await rolarInternamente(i * 20);
    expect(mockFolha.renderizacoes).toBe(antes);
  });

  it("o acomodamento depois da soltura roda na camada nativa, com duração de token", async () => {
    await montar({ posicao: "meia" });
    animacoes = [];
    await arrastar({ dy: 200, ms: 400 });

    expect(animacoes).toHaveLength(1);
    expect(animacoes[0]?.duracao).toBe(movimento.mudancaDeEstado);
    /*
      Sem o driver nativo, cada quadro do acomodamento atravessa a ponte e a
      folha chega aos solavancos no aparelho que a prefeitura comprou.
    */
    expect(animacoes[0]?.nativo).toBe(true);
  });
});

describe("a chave de redução de movimento", () => {
  it("desliga o deslize, e a folha chega inteira no lugar", async () => {
    mockFolha.reduzir = true;
    await montar({ posicao: "meia" });
    expect(animacoes).toHaveLength(0);

    await arrastar({ dy: 200, ms: 400 });
    expect(aoMudarPosicao).toHaveBeenCalledWith("recolhida");
    expect(animacoes).toHaveLength(0);
  });

  it("com a chave desligada, a folha ENTRA animada uma vez só", async () => {
    await montar({ posicao: "meia" });
    expect(animacoes).toHaveLength(1);
    expect(animacoes[0]?.duracao).toBe(movimento.mudancaDeEstado);
    expect(animacoes[0]?.nativo).toBe(true);
  });
});

/* ============================================================
   A geometria: o mapa atrás, a ação primária na frente
   ============================================================ */

describe("a tela mudou de tamanho debaixo da folha", () => {
  /**
   * A folha se posiciona pela altura MEDIDA, e a medida muda mais de uma vez.
   *
   * `onLayout` não é um evento de montagem: ele dispara de novo a cada vez que
   * a área muda de tamanho. No aparelho isso acontece quando o Android entra em
   * tela dividida, quando a barra de navegação por gesto aparece ou some, no
   * tablet que a prefeitura comprou (onde `orientation: "portrait"` do
   * `app.config.ts` não segura nada) e no desdobrável.
   *
   * A folha desenha a POSIÇÃO como um deslocamento em pontos, calculado sobre a
   * altura antiga. Sem reposicionar, o deslocamento sobrevive à medida nova, e
   * na medida menor ele é MAIOR que a folha inteira: a folha some inteira para
   * baixo da borda da tela, o rodapé com "Abrir a vistoria" vai parar no meio do
   * mapa, e o leitor de tela continua anunciando "recolhida" para uma folha que
   * não está em lugar nenhum.
   */
  async function medirDeNovo(altura: number): Promise<void> {
    await entregar("folha-area", "Layout", {
      nativeEvent: { layout: { width: 390, height: altura, x: 0, y: 0 } },
    });
  }

  it("a folha volta para a sua posição na altura NOVA, e não fica fora da tela", async () => {
    await montar({ posicao: "recolhida" });
    const MENOR = 480;
    await medirDeNovo(MENOR);

    const alturaDaFolha = MENOR * FRACAO_DA_POSICAO.cheia;
    expect(estiloDe("folha").height).toBeCloseTo(alturaDaFolha);
    /*
      A prova que dói: um deslocamento maior que a própria folha põe a folha
      inteira abaixo da borda de baixo da tela.
    */
    expect(deslocamentoDe("folha")).toBeLessThan(alturaDaFolha);
    expect(deslocamentoDe("folha"))
      .toBeCloseTo(alturaDaFolha - MENOR * FRACAO_DA_POSICAO.recolhida);
  });

  it("e o rodapé continua colado no rodapé da TELA depois da medida nova", async () => {
    await montar({ posicao: "meia" });
    await medirDeNovo(480);
    expect(deslocamentoDe("folha-rodape")).toBeCloseTo(-deslocamentoDe("folha"));
  });

  it("a medida nova não desliza: a folha JÁ está no lugar no primeiro quadro", async () => {
    /*
      Animar aqui seria a folha andando sozinha na tela por causa de uma
      mudança que não foi gesto de ninguém. E sem o movimento a folha não fica
      parada num lugar errado por 260 ms, que num aparelho que acabou de girar é
      onde o dedo já está indo.
    */
    await montar({ posicao: "recolhida" });
    animacoes = [];
    await medirDeNovo(480);
    expect(animacoes).toHaveLength(0);
  });
});

describe("a folha convive com o mapa, e não o bloqueia", () => {
  it("a área que mede a tela deixa o toque passar", async () => {
    await montar();
    /*
      Sem `box-none`, um retângulo invisível do tamanho da tela fica entre o
      dedo e o mapa: arrastar o mapa para ver a rua ao lado deixa de funcionar,
      e nada na tela explica por quê.
    */
    expect(screen.getByTestId("folha-area").props.pointerEvents).toBe("box-none");
  });

  it("não declara modalidade, que é o contrário do `Dialogo`", async () => {
    await montar();
    /*
      `accessibilityViewIsModal` tira da árvore de acessibilidade tudo o que
      está fora do elemento. Numa folha que existe permanentemente sobre o
      mapa, isso apagaria o mapa e a barra de abas do leitor de tela, ou seja,
      o aplicativo inteiro.
    */
    expect(screen.getByTestId("folha").props.accessibilityViewIsModal).toBeUndefined();
  });

  it("a folha tem a altura da MAIOR posição, e desliza para mostrar menos", async () => {
    await montar({ posicao: "recolhida" });
    const alturaCheia = ALTURA_DA_TELA * FRACAO_DA_POSICAO.cheia;
    expect(estiloDe("folha").height).toBeCloseTo(alturaCheia);
    expect(estiloDe("folha").bottom).toBe(0);
  });

  it("a maior posição nunca cobre a tela inteira", async () => {
    /*
      A faixa de mapa que sobra em cima é o que diz que aquilo continua sendo
      uma folha sobre um mapa, e não uma tela nova para a qual o aplicativo
      navegou. Com a folha em 1, o agente procura um botão de voltar que não
      existe.
    */
    expect(FRACAO_DA_POSICAO.cheia).toBeLessThan(1);
    await montar({ posicao: "cheia" });
    expect(estiloDe("folha").height as number).toBeLessThan(ALTURA_DA_TELA);
  });
});

describe("a ação primária fica na zona do polegar em qualquer posição", () => {
  it("o rodapé é contra-deslocado pelo mesmo valor que move a folha", async () => {
    await montar({ posicao: "recolhida" });
    /*
      A folha desce para mostrar menos; o rodapé sobe pelo NEGATIVO exato do
      mesmo deslocamento, e o efeito é que ele fica parado no rodapé da TELA.
      Sem isto, a folha recolhida esconderia a própria ação primária: ela tem a
      altura da posição cheia, e tudo que está no fim do conteúdo fica fora da
      tela justamente quando o agente mais precisa de um toque só.
    */
    const daFolha = deslocamentoDe("folha");
    expect(daFolha).toBeGreaterThan(0);
    expect(deslocamentoDe("folha-rodape")).toBeCloseTo(-daFolha);
  });

  it("o rodapé NÃO rola junto com a lista", async () => {
    await montar({ tarefas: 40 });
    const rolagem = screen.getByTestId("folha-rolagem");
    expect(within(rolagem).queryByTestId("folha-rodape")).toBeNull();
    expect(screen.getByTestId("folha-rodape")).toBeTruthy();
  });

  it("a folga de baixo é maior que a de cima, por causa da barra de gestos", async () => {
    await montar();
    const rodape = estiloDe("folha-rodape");
    expect(rodape.paddingBottom as number).toBeGreaterThan(rodape.paddingTop as number);
  });
});

/* ============================================================
   Quem não enxerga a folha
   ============================================================ */

describe("a folha para quem usa leitor de tela", () => {
  it("a alça é um controle ajustável, com alvo de 52 e o estado DITO", async () => {
    await montar({ posicao: "meia" });
    const alca = screen.getByTestId("folha-alca");

    expect(alca.props.accessibilityRole).toBe("adjustable");
    expect(alca.props.accessibilityLabel).toBe("Tarefas de hoje");
    /*
      A posição da folha na tela é a única pista de quem enxerga, e ela não
      existe para quem ouve. Por isso o estado sai em PALAVRA.
    */
    expect(alca.props.accessibilityValue).toEqual({ text: NOME_DA_POSICAO.meia });
    expect(estiloDe("folha-alca").minHeight).toBe(toque);
  });

  it("deslizar na alça sobe e desce a folha, sem arrastar nada", async () => {
    await montar({ posicao: "meia" });
    const alca = screen.getByTestId("folha-alca");

    await fireEvent(alca, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(aoMudarPosicao).toHaveBeenLastCalledWith("cheia");
    expect(screen.getByTestId("folha-alca").props.accessibilityValue)
      .toEqual({ text: NOME_DA_POSICAO.cheia });

    await fireEvent(alca, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(aoMudarPosicao).toHaveBeenLastCalledWith("meia");
  });

  it("a folha recolhida não lê uma lista que ninguém está vendo", async () => {
    await montar({ posicao: "recolhida", tarefas: 12 });
    /*
      A consulta precisa dizer que quer o que está ESCONDIDO, e isso é a
      primeira metade da prova: a biblioteca de teste modela a árvore de
      acessibilidade, e um elemento com `accessibilityElementsHidden` some das
      consultas normais exatamente como some do leitor de tela.
    */
    const corpo = screen.getByTestId("folha-corpo", { includeHiddenElements: true });
    /*
      Recolhida, o agente vê a alça, o cabeçalho e mais nada. Se o leitor
      continuasse lendo as doze tarefas que estão na árvore e fora da tela,
      quem navega por voz ouviria uma lista que quem enxerga não tem, e
      perderia o mapa de vista sem saber que ele continua ali.
    */
    expect(corpo.props.accessibilityElementsHidden).toBe(true);
    expect(corpo.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("expandida, a lista volta a existir para o leitor", async () => {
    await montar({ posicao: "meia", tarefas: 12 });
    const corpo = screen.getByTestId("folha-corpo");
    expect(corpo.props.accessibilityElementsHidden).toBe(false);
    expect(corpo.props.importantForAccessibility).toBe("auto");
  });

  it("o cabeçalho continua anunciado mesmo com a folha recolhida", async () => {
    await montar({ posicao: "recolhida" });
    const cabecalho = screen.getByTestId("folha-cabecalho");
    expect(cabecalho.props.accessibilityElementsHidden).toBeFalsy();
    expect(within(cabecalho).getByText("Tarefas de hoje")).toBeTruthy();
  });
});

describe("o toque na alça, que é o atalho de quem está com uma mão só", () => {
  it("expande um degrau, e na maior posição volta para a menor", async () => {
    await montar({ posicao: "meia" });
    await fireEvent.press(screen.getByTestId("folha-alca"));
    expect(aoMudarPosicao).toHaveBeenLastCalledWith("cheia");

    await fireEvent.press(screen.getByTestId("folha-alca"));
    expect(aoMudarPosicao).toHaveBeenLastCalledWith("recolhida");
  });
});

describe("a folha nos dois temas", () => {
  it.each([
    ["light", temaClaro],
    ["dark", temaEscuro],
  ] as const)("no tema %s, a folha usa a elevação INTEIRA do tema", async (esquema, tema) => {
    mockEsquema = esquema;
    await montar();
    const folha = estiloDe("folha");
    /*
      A elevação é espalhada INTEIRA (fundo, contorno e sombra juntos) porque no
      tema escuro quem carrega a elevação é a SUPERFÍCIE, e não a sombra preta
      sobre fundo quase preto. Uma folha pintada com `tema.superficie` passaria
      neste teste no claro e reprovaria no escuro, que é exatamente o defeito
      que `tokens.ts` descreve e que a dívida de `elevacao.folha` registra.
    */
    /*
      `folha`, e não `flutuante`. A asserção aqui afirmava o nível antigo, e foi
      reescrita junto com a peça.

      Esta folha nasceu em `flutuante` porque, naquele momento, o nível `folha`
      tinha a sombra DESCENDO 12 pontos: fora desenhado para folha que paira, e
      esta é colada no rodapé, onde aquela sombra cai para fora da tela.

      A fundação da 2.0 corrigiu o nível no mesmo turno, depois de concluir que
      nenhuma folha deste aplicativo paira nem vai pairar. A sombra sobe, e este
      é o nível para o qual a peça existe.
    */
    const esperado = elevacao(tema).folha;
    expect(folha.backgroundColor).toBe(esperado.backgroundColor);
    expect(folha.borderColor).toBe(esperado.borderColor);
    expect(folha.borderWidth).toBe(esperado.borderWidth);
    expect(folha.elevation).toBe(esperado.elevation);
    expect(folha.shadowOpacity).toBe(esperado.shadowOpacity);
  });

  it("e as duas superfícies não são a mesma cor", () => {
    /*
      A metade que fecha a prova acima: sem isto, uma escala de elevação que
      devolvesse a mesma superfície nos dois temas passaria nos dois casos e a
      folha seria indistinguível de um cartão comum no escuro.
    */
    expect(elevacao(temaClaro).folha.backgroundColor)
      .not.toBe(elevacao(temaEscuro).folha.backgroundColor);
  });

  it("o rodapé usa a MESMA superfície da folha, e não uma inventada", async () => {
    await montar();
    /*
      Se a barra da ação primária tivesse fundo próprio, ela seria um retângulo
      de outra cor colado no rodapé da folha. Ela existe para tapar o conteúdo
      que rola por baixo, e para isso precisa ser a mesma superfície.
    */
    expect(estiloDe("folha-rodape").backgroundColor).toBe(estiloDe("folha").backgroundColor);
  });
});
