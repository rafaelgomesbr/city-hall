/**
 * O selo de estado, e a regra de que nada se comunica só por cor.
 *
 * O agente lê estes selos em pé, na rua, com sol batendo na tela do aparelho.
 * Sob sol forte, verde e âmbar viram a mesma mancha clara, e para quem não
 * separa as duas cores eles nunca foram diferentes. Por isso o símbolo é campo
 * obrigatório do `Chip` e não um extra com padrão silencioso: um padrão seria o
 * jeito curto de furar a regra sem ninguém perceber na revisão.
 *
 * O segundo defeito travado aqui é de leitor de tela, e é o oposto: o símbolo
 * que salva quem enxerga sob sol é ruído para quem ouve a tela. "✓ Enviada"
 * sairia como "sinal de visto, Enviada". O chip é UM elemento com uma frase em
 * português.
 */

import { StyleSheet } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

import { Chip, type TomDoChip } from "./Chip";
import { ProvedorDeTema } from "./componentes";
import { fonteMinima, temaClaro, temaEscuro } from "./tokens";

beforeEach(() => { mockEsquema = "light"; });

async function montar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

describe("o segundo canal, além da cor", () => {
  it("desenha o símbolo junto com a palavra", async () => {
    await montar(<Chip texto="Enviada" simbolo="✓" tom="ok" />);
    expect(screen.getByText("✓")).toBeTruthy();
    expect(screen.getByText("Enviada")).toBeTruthy();
  });

  /*
    Dois estados opostos com cores diferentes não bastam: em preto e branco, ou
    sob sol, o que resta é o símbolo e a palavra. Esta é a prova de que os dois
    canais sobrevivem sem a cor.
  */
  it("estados diferentes têm símbolos diferentes, e não só cores diferentes", async () => {
    await montar(
      <>
        <Chip texto="Aguardando" simbolo="…" tom="neutro" />
        <Chip texto="Precisa de atenção" simbolo="!" tom="perigo" />
      </>,
    );
    expect(screen.getByText("…")).toBeTruthy();
    expect(screen.getByText("!")).toBeTruthy();
  });
});

describe("o que o leitor de tela ouve", () => {
  it("é uma frase em português, e não o nome do símbolo", async () => {
    await montar(
      <Chip
        texto="Enviada"
        simbolo="✓"
        tom="ok"
        descricao="Protocolo 2026/000123: Enviada"
        testID="selo"
      />,
    );
    const selo = screen.getByTestId("selo");
    expect(selo.props.accessibilityLabel).toBe("Protocolo 2026/000123: Enviada");
    expect(selo.props.accessible).toBe(true);
  });

  it("sem descrição, fala a palavra do próprio selo", async () => {
    await montar(<Chip texto="Arquivada" simbolo="✕" tom="alerta" testID="selo" />);
    expect(screen.getByTestId("selo").props.accessibilityLabel).toBe("Arquivada");
  });
});

describe("o tamanho do texto", () => {
  /*
    O selo antigo usava `legenda`, que é 12. Doze pontos é o tamanho que se lê
    sentado numa mesa, e não em pé com o aparelho molhado a meio metro do rosto.
    `fonteMinima` é a régua do produto, e o chip é o primeiro a obedecê-la.
  */
  it("nem a palavra nem o símbolo descem abaixo da fonte mínima do produto", async () => {
    await montar(<Chip texto="Enviada" simbolo="✓" tom="ok" />);
    for (const alvo of ["Enviada", "✓"]) {
      const tamanho = StyleSheet.flatten(screen.getByText(alvo).props.style).fontSize;
      expect(tamanho).toBeGreaterThanOrEqual(fonteMinima);
    }
  });
});

describe("o tema, nos dois modos", () => {
  const casos: Array<{ tom: TomDoChip; claro: string; escuro: string }> = [
    { tom: "neutro", claro: temaClaro.textoDiscreto, escuro: temaEscuro.textoDiscreto },
    { tom: "ok", claro: temaClaro.okTexto, escuro: temaEscuro.okTexto },
    { tom: "alerta", claro: temaClaro.alertaTexto, escuro: temaEscuro.alertaTexto },
    { tom: "perigo", claro: temaClaro.perigoTexto, escuro: temaEscuro.perigoTexto },
  ];

  it.each(casos)("o tom $tom segue o tema claro", async ({ tom, claro }) => {
    mockEsquema = "light";
    await montar(<Chip texto="Estado" simbolo="•" tom={tom} />);
    expect(StyleSheet.flatten(screen.getByText("Estado").props.style).color).toBe(claro);
  });

  it.each(casos)("o tom $tom segue o tema escuro", async ({ tom, escuro }) => {
    mockEsquema = "dark";
    await montar(<Chip texto="Estado" simbolo="•" tom={tom} />);
    expect(StyleSheet.flatten(screen.getByText("Estado").props.style).color).toBe(escuro);
  });
});
