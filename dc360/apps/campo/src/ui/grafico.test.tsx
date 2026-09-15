import { AccessibilityInfo, Animated, processColor } from "react-native";
import { act, render, screen, within } from "@testing-library/react-native";
import { ALTURA_DAS_BARRAS, GraficoDeBarras } from "./Grafico";
import { ProvedorDeTema } from "./componentes";
import { temaEscuro } from "./tokens";

/**
 * O gráfico de barras, desenhado pelo aplicativo e não por biblioteca.
 *
 * O que estes casos travam, e por que cada um vem da régua da casa:
 *
 * 1. **Nunca só cor.** Cada barra leva o valor escrito em cima e o dia embaixo,
 *    então o gráfico se lê com o sol na tela e por quem não separa violeta de
 *    cinza. Barra de zero continua tendo número e dia: um dia sem vistoria é
 *    um fato, não um buraco.
 * 2. **Cada barra fala.** Para quem ouve a tela, uma barra é UM elemento com
 *    a frase inteira ("Terça-feira: 3 vistorias concluídas"), e não um
 *    retângulo mudo seguido de dois números soltos.
 * 3. **A altura é proporcional ao maior valor**, e o maior enche a área. Sem
 *    isso, uma semana de uma vistoria por dia viraria sete tracinhos.
 * 4. **A entrada anima, e respeita a redução de movimento**: com a chave
 *    ligada, as barras nascem inteiras.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

let mockReduzir = false;
jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(async () => mockReduzir);
jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(
  () => ({ remove: () => undefined }) as never,
);

const SEMANA = [
  { rotulo: "qui", valor: 0, descricao: "Quinta-feira: nenhuma vistoria concluída" },
  { rotulo: "sex", valor: 2, descricao: "Sexta-feira: 2 vistorias concluídas" },
  { rotulo: "sáb", valor: 1, descricao: "Sábado: 1 vistoria concluída" },
  { rotulo: "dom", valor: 0, descricao: "Domingo: nenhuma vistoria concluída" },
  { rotulo: "seg", valor: 4, descricao: "Segunda-feira: 4 vistorias concluídas" },
  { rotulo: "ter", valor: 3, descricao: "Terça-feira: 3 vistorias concluídas" },
  { rotulo: "qua", valor: 2, descricao: "Hoje, quarta-feira: 2 vistorias concluídas" },
];

async function montar(barras = SEMANA): Promise<void> {
  await render(
    <ProvedorDeTema>
      <GraficoDeBarras titulo="Últimos 7 dias" barras={barras} testID="grafico" />
    </ProvedorDeTema>,
  );
  await act(async () => {});
}

beforeEach(() => {
  mockReduzir = false;
  jest.spyOn(Animated, "timing").mockRestore();
});

describe("nunca só cor", () => {
  it("cada barra tem o valor em cima e o rótulo embaixo, inclusive a de zero", async () => {
    await montar();
    for (const b of SEMANA) {
      const coluna = within(screen.getByLabelText(b.descricao));
      expect(coluna.getByText(String(b.valor))).toBeTruthy();
      expect(coluna.getByText(b.rotulo)).toBeTruthy();
    }
  });

  it("a barra é da cor de destaque, e não de uma cor de estado", async () => {
    await montar();
    const barra = screen.getByTestId("grafico-barra-seg");
    /* O SVG entrega a cor já processada para o nativo; a comparação é com o
       mesmo processamento em cima do token. */
    expect(barra.props.fill.payload).toBe(processColor(temaEscuro.destaque));
  });
});

describe("cada barra fala", () => {
  it("é um elemento só, com a frase inteira", async () => {
    await montar();
    for (const b of SEMANA) expect(screen.getByLabelText(b.descricao)).toBeTruthy();
  });

  it("o gráfico inteiro tem nome, para quem ouve saber onde entrou", async () => {
    await montar();
    expect(screen.getByLabelText("Últimos 7 dias, gráfico de barras")).toBeTruthy();
  });
});

describe("a altura", () => {
  it("é proporcional ao maior valor, e o maior enche a área", async () => {
    await montar();
    const maior = screen.getByTestId("grafico-barra-seg");
    const metade = screen.getByTestId("grafico-barra-sex");
    expect(Number(maior.props.height)).toBe(ALTURA_DAS_BARRAS);
    expect(Number(metade.props.height)).toBeCloseTo(ALTURA_DAS_BARRAS / 2, 5);
  });

  it("a barra de zero continua visível como um traço, e não some", async () => {
    await montar();
    const zero = screen.getByTestId("grafico-barra-qui");
    expect(Number(zero.props.height)).toBeGreaterThan(0);
    expect(Number(zero.props.height)).toBeLessThan(ALTURA_DAS_BARRAS / 4);
  });

  it("com tudo zero, não divide por zero e desenha sete traços", async () => {
    await montar(SEMANA.map((b) => ({ ...b, valor: 0 })));
    for (const b of SEMANA) {
      expect(Number(screen.getByTestId(`grafico-barra-${b.rotulo}`).props.height)).toBeGreaterThan(0);
    }
  });
});

describe("a entrada", () => {
  it("anima as barras crescendo quando o aparelho permite movimento", async () => {
    const timing = jest.spyOn(Animated, "timing");
    await montar();
    expect(timing).toHaveBeenCalled();
  });

  it("com redução de movimento, as barras nascem inteiras", async () => {
    mockReduzir = true;
    await montar();
    await act(async () => {});
    const coluna = screen.getByTestId("grafico-coluna-seg");
    /* A escala vertical está em 1: nada cresce depois. */
    const transformacao = (coluna.props.style.transform as Array<{ scaleY: unknown }>)[0];
    expect(Number(JSON.stringify(transformacao?.scaleY))).toBe(1);
  });
});
