/**
 * A IDENTIDADE 2.0, desenhada.
 *
 * `hierarquia.test.ts` mede a régua como dado. Este arquivo mede o que ela
 * produz na tela, que é a única metade que a régua não consegue provar sozinha:
 * uma tabela de degraus pode estar perfeita e o componente ler a coluna errada.
 *
 * Todos os casos daqui reprovam na árvore anterior a 14/09/2026, porque nenhuma
 * das peças existia: não havia `Dado`, o `Txt` não sabia o que é papel, o
 * `Cartao` tinha um nível só, e o aplicativo inteiro não tinha um gradiente.
 */

import { StyleSheet } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

import { Botao, Cartao, Dado, ProvedorDeTema, Txt } from "./componentes";
import { degrau } from "./hierarquia";
import {
  elevacao, espaco, gradienteDeDestaque, temaClaro, temaEscuro,
} from "./tokens";

beforeEach(() => { mockEsquema = "light"; });

async function montar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

type No = { type: string; props: Record<string, unknown>; children: unknown };

/** Todo nó nativo da árvore desenhada, inclusive os do desenho vetorial. */
function todosOsNos(no: unknown): No[] {
  if (!no || typeof no !== "object") return [];
  if (Array.isArray(no)) return no.flatMap(todosOsNos);
  const atual = no as No;
  if (typeof atual.type !== "string") return [];
  return [atual, ...todosOsNos(atual.children)];
}

/* ============================================================
   O número grande com rótulo discreto
   ============================================================ */

describe("o número com rótulo, que é a H2 virada peça", () => {
  it("o número sai no degrau do protagonista, com o rastreio dele", async () => {
    await montar(<Dado valor="12" rotulo="tarefas para hoje" />);
    const estilo = StyleSheet.flatten(screen.getByText("12").props.style);
    expect(estilo.fontSize).toBe(degrau("numero").fonte);
    expect(estilo.lineHeight).toBe(degrau("numero").linha);
    expect(estilo.letterSpacing).toBe(degrau("numero").rastreio);
    expect(estilo.color).toBe(temaClaro.texto);
  });

  /*
    O rótulo é desenhado em caixa alta e ESCRITO em caixa normal. Quem escreve
    "TAREFAS PARA HOJE" no código entrega ao leitor de tela uma palavra que vira
    sigla soletrada, e a acessibilidade paga pela estética.
  */
  it("o rótulo é discreto, aberto e em caixa alta por desenho, não por escrita", async () => {
    await montar(<Dado valor="12" rotulo="tarefas para hoje" />);
    const estilo = StyleSheet.flatten(screen.getByText("tarefas para hoje").props.style);
    expect(estilo.fontSize).toBe(degrau("rotulo").fonte);
    expect(estilo.letterSpacing).toBe(degrau("rotulo").rastreio);
    expect(estilo.textTransform).toBe("uppercase");
    expect(estilo.color).toBe(temaClaro.textoDiscreto);
  });

  /*
    A menor distância da peça fica entre o número e o rótulo dele. Proximidade é
    o que diz o que pertence a quê, e é justamente a decisão que, deixada no
    ponto de uso, produz cinco indicadores com cinco distâncias.
  */
  it("o rótulo cola no número, com a menor distância que o produto tem", async () => {
    await montar(<Dado valor="12" rotulo="tarefas" testID="indicador" />);
    const estilo = StyleSheet.flatten(screen.getByTestId("indicador").props.style);
    expect(estilo.gap).toBe(espaco.e1);
    const menores = Object.values(espaco).filter((v) => v < espaco.e1);
    expect(menores).toEqual([]);
  });

  it("para o leitor de tela é um elemento só, com uma frase", async () => {
    await montar(<Dado valor="12" rotulo="tarefas para hoje" testID="indicador" />);
    const no = screen.getByTestId("indicador");
    expect(no.props.accessible).toBe(true);
    expect(no.props.accessibilityLabel).toBe("12, tarefas para hoje");
  });

  /*
    Fonte tabular por padrão. Os números deste produto são protocolo, contagem e
    prazo, e são ditados por rádio: em tipo proporcional o zero se parece com a
    letra o. O aplicativo já pagou por isso uma vez, quando o protocolo saía
    dentro de uma frase na fonte do corpo.
  */
  it("o número sai em fonte tabular, e o rótulo não", async () => {
    await montar(<Dado valor="000123" rotulo="protocolo" />);
    const doNumero = StyleSheet.flatten(screen.getByText("000123").props.style).fontFamily;
    const doRotulo = StyleSheet.flatten(screen.getByText("protocolo").props.style).fontFamily;
    expect(doNumero).not.toBe(doRotulo);
  });
});

/* ============================================================
   O papel no `Txt`
   ============================================================ */

describe("o papel do texto", () => {
  it("o papel ganha da variante, porque é a decisão mais específica", async () => {
    await montar(<Txt variante="display" nivel="apoio">medido em campo</Txt>);
    const estilo = StyleSheet.flatten(screen.getByText("medido em campo").props.style);
    expect(estilo.fontSize).toBe(degrau("apoio").fonte);
  });

  it("sem papel, nada muda: o texto corrido continua sem rastreio e sem caixa", async () => {
    await montar(<Txt variante="corpo">a trinca segue da soleira ao teto</Txt>);
    const estilo = StyleSheet.flatten(
      screen.getByText("a trinca segue da soleira ao teto").props.style,
    );
    expect(estilo.letterSpacing).toBeUndefined();
    expect(estilo.textTransform).toBeUndefined();
  });

  it("a cor continua saindo do tema, e o papel só escolhe entre texto e discreto", async () => {
    mockEsquema = "dark";
    await montar(<Txt nivel="rotulo">situação</Txt>);
    expect(StyleSheet.flatten(screen.getByText("situação").props.style).color)
      .toBe(temaEscuro.textoDiscreto);
  });
});

/* ============================================================
   O cartão como objeto
   ============================================================ */

describe("o cartão, que é objeto e não retângulo com borda", () => {
  it("por padrão ele continua no nível de sempre", async () => {
    await montar(<Cartao titulo="Vistoria"><Txt>conteúdo</Txt></Cartao>);
    const estilo = StyleSheet.flatten(screen.getByText("Vistoria").parent!.props.style);
    expect(estilo.elevation).toBe(elevacao(temaClaro).cartao.elevation);
  });

  /*
    O destaque é a folga que `CLAUDE.md` autoriza desde 2026-08-20 e que este
    aplicativo nunca usou. Ela é escassa pela mesma aritmética da régua de
    densidade: três cartões flutuando na mesma tela são três cartões que não
    flutuam.
  */
  it("o cartão de destaque sobe de camada inteira, e não só de sombra", async () => {
    mockEsquema = "dark";
    await montar(<Cartao titulo="Enviado" nivel="flutuante"><Txt>ok</Txt></Cartao>);
    const estilo = StyleSheet.flatten(screen.getByText("Enviado").parent!.props.style);
    const esperado = elevacao(temaEscuro).flutuante;
    expect(estilo.elevation).toBe(esperado.elevation);
    // No escuro quem carrega a elevação é a SUPERFÍCIE, e não a sombra preta
    // sobre fundo quase preto. Subir só a sombra entregaria um cartão idêntico.
    expect(estilo.backgroundColor).toBe(esperado.backgroundColor);
    expect(estilo.backgroundColor).not.toBe(elevacao(temaEscuro).cartao.backgroundColor);
  });

  it("o título do cartão usa o degrau de título, e não um tamanho escolhido ali", async () => {
    await montar(<Cartao titulo="Vistoria"><Txt>conteúdo</Txt></Cartao>);
    expect(StyleSheet.flatten(screen.getByText("Vistoria").props.style).fontSize)
      .toBe(degrau("titulo").fonte);
  });
});

/* ============================================================
   O gradiente do botão primário
   ============================================================ */

/**
 * Os pontos de parada do gradiente, lidos do que o NATIVO recebeu.
 *
 * O `react-native-svg` não entrega os `<Stop>` como nós: ele achata a rampa
 * inteira num vetor de `[posição, cor, posição, cor]`, com a cor já processada
 * em inteiro ARGB com sinal. Ler o elemento React em vez disto provaria que o
 * componente ESCREVEU a cor certa; ler daqui prova que ela chegou ao desenho,
 * que é a metade que interessa quando a pergunta é "o gradiente saiu do token".
 */
function paradasDesenhadas(): string[] {
  const emHexadecimal = (inteiro: number) =>
    `#${(((inteiro >>> 0) & 0xffffff).toString(16).padStart(6, "0")).toUpperCase()}`;

  return todosOsNos(screen.toJSON())
    .filter((no) => no.type === "RNSVGLinearGradient")
    .flatMap((no) => {
      const rampa = no.props.gradient;
      if (!Array.isArray(rampa)) return [];
      /* Índices ímpares são cor; os pares são a posição da parada. */
      return rampa.filter((_, i) => i % 2 === 1).map((valor) => emHexadecimal(valor as number));
    });
}

describe("o gradiente, que é o único do aplicativo", () => {
  it("o botão primário desenha as duas paradas, e as duas são tokens do tema", async () => {
    await montar(<Botao titulo="Concluir vistoria" onPress={() => {}} />);
    expect(paradasDesenhadas()).toEqual([...gradienteDeDestaque(temaClaro)]);
  });

  it("no tema escuro ele troca de par junto com o tema", async () => {
    mockEsquema = "dark";
    await montar(<Botao titulo="Concluir vistoria" onPress={() => {}} />);
    expect(paradasDesenhadas()).toEqual([...gradienteDeDestaque(temaEscuro)]);
  });

  /*
    Uso PONTUAL, que é a condição escrita na emenda de 2026-08-20. Se todo botão
    da tela gradiente, ele deixa de ser destaque e vira papel de parede, e a
    ação que a tela quer que aconteça perde o que a separava das outras.
  */
  it("só o primário. Secundário, discreto e perigo continuam chapados", async () => {
    for (const tipo of ["secundario", "discreto", "perigo"] as const) {
      await montar(<Botao titulo="Cancelar" tipo={tipo} onPress={() => {}} />);
      expect(paradasDesenhadas()).toEqual([]);
    }
  });

  /*
    E ele é REFORÇO, não o fundo. O chapado continua embaixo com a mesma cor de
    sempre: um gradiente que fosse o único fundo transformaria qualquer falha de
    desenho vetorial num botão transparente com texto branco em cima.
  */
  it("o fundo chapado continua embaixo, com a cor de sempre", async () => {
    await montar(<Botao titulo="Concluir vistoria" onPress={() => {}} testID="acao" />);
    const estilo = StyleSheet.flatten(screen.getByTestId("acao").props.style);
    expect(estilo.backgroundColor).toBe(temaClaro.destaque);
  });

  /*
    Prova da própria leitura. Sem ela, um erro em `paradasDesenhadas` daria
    verde no caso do secundário para sempre, e o caso mais importante deste
    bloco (o que limita o gradiente a um lugar) seria um caso que não sabe
    reprovar.
  */
  it("a leitura das paradas enxerga o que deveria", async () => {
    await montar(<Botao titulo="Concluir vistoria" onPress={() => {}} />);
    expect(paradasDesenhadas().length).toBe(2);
    expect(new Set(paradasDesenhadas()).size).toBe(2);
  });
});
