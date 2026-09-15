import { processColor } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { SEVERIDADES, glifoDeSeveridade, type Severidade } from "@dc360/shared";

import { ProvedorDeTema } from "../componentes";
import { temaClaro } from "../tokens";
import { aparenciaDaCriticidade } from "./criticidade";
import { DesenhoDaCriticidade } from "./DesenhoDaCriticidade";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

/**
 * O PINO desenha o mesmo glifo que a pílula, e o mesmo que o painel.
 *
 * Até 15/09/2026 este desenho tinha a própria geometria (triângulo, losango,
 * quadrado, círculo e anel escritos aqui dentro), e a pílula tinha outra (um
 * medidor), e o painel uma terceira. O que se cobra aqui é que o pino seja o
 * glifo de `@dc360/shared` CHEIO: contorno preenchido com o fundo da
 * severidade, contornado na tinta de texto (que é a que contrasta com qualquer
 * ladrilho), e a marca de dentro por cima na tinta da severidade, que é o par
 * de contraste já medido no portão.
 */

type No = { type: string; props: Record<string, unknown>; children: unknown };

function todosOsNos(no: unknown): No[] {
  if (!no || typeof no !== "object") return [];
  if (Array.isArray(no)) return no.flatMap(todosOsNos);
  const atual = no as No;
  if (typeof atual.type !== "string") return [];
  return [atual, ...todosOsNos(atual.children)];
}

async function desenhar(severidade: Severidade | null) {
  await act(async () => {
    await render(
      <ProvedorDeTema>
        <DesenhoDaCriticidade severidade={severidade} />
      </ProvedorDeTema>,
    );
  });
  return todosOsNos(screen.toJSON()).filter((n) => n.type === "RNSVGPath");
}

const cor = (no: No, prop: string) => (no.props[prop] as { payload: number } | undefined)?.payload;

const niveis: Array<[string, Severidade | null]> = [
  ["baixa", "baixa"],
  ["media", "media"],
  ["alta", "alta"],
  ["critica", "critica"],
  ["sem classificação", null],
];

describe("o pino é o glifo compartilhado, cheio", () => {
  it.each(niveis)("%s: contorno e marca são os caminhos do pacote, na ordem", async (_nome, severidade) => {
    const caminhos = await desenhar(severidade);
    const glifo = glifoDeSeveridade(severidade);
    expect(caminhos.map((n) => n.props.d)).toEqual([glifo.contorno, ...glifo.marca]);
  });

  it("nos quatro níveis o contorno é preenchido com o fundo da severidade e a marca vai na tinta dela", async () => {
    for (const severidade of SEVERIDADES) {
      const [contorno, ...marca] = await desenhar(severidade);
      const aparencia = aparenciaDaCriticidade(temaClaro, severidade);
      expect(cor(contorno!, "fill")).toBe(processColor(aparencia.fundo));
      expect(cor(contorno!, "stroke")).toBe(processColor(temaClaro.texto));
      expect(marca.length).toBeGreaterThan(0);
      for (const traco of marca) expect(cor(traco, "stroke")).toBe(processColor(aparencia.tinta));
    }
  });

  /*
    Sem classificação fica VAZADO: um círculo cinza cheio pareceria mais um
    degrau da escala, e a ocorrência que ninguém classificou não é um degrau,
    é a triagem que ainda não aconteceu.
  */
  it("sem classificação fica vazado, em traço na tinta de texto", async () => {
    const [contorno, ...marca] = await desenhar(null);
    expect(marca).toEqual([]);
    expect(contorno!.props.propList).not.toContain("fill");
    expect(cor(contorno!, "stroke")).toBe(processColor(temaClaro.texto));
  });

  it("obedece ao tamanho pedido", async () => {
    await act(async () => {
      await render(
        <ProvedorDeTema>
          <DesenhoDaCriticidade severidade="alta" tamanho={16} />
        </ProvedorDeTema>,
      );
    });
    const raiz = todosOsNos(screen.toJSON()).find((n) => n.type === "RNSVGSvgView")!;
    expect(raiz.props.width).toBe(16);
    expect(raiz.props.height).toBe(16);
    expect(raiz.props.vbWidth).toBe(24);
  });
});
