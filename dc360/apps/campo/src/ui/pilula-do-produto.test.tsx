/**
 * UMA pílula, e não três, no produto inteiro.
 *
 * Este arquivo nasceu de uma revisão adversarial da onda que reescreveu o
 * aplicativo, e o que ele trava é o resultado de cinco frentes desenharem a
 * mesma peça ao mesmo tempo sem se ver. No fim daquela onda existiam três
 * pílulas de estado, com o mesmo raio, o mesmo recuo e a mesma forma:
 *
 * 1. `Chip`, a peça oficial, com símbolo obrigatório e texto em `corpoP` (14);
 * 2. `Etiqueta`, uma cópia local dentro de `app/(agente)/equipe.tsx`, criada
 *    porque o `Chip` só aceitava caractere e a tela precisava de DESENHO. O
 *    comentário dela dizia, com todas as letras, "ensinar o `Chip` a aceitar um
 *    nó é o conserto de verdade, e está anotado como pendência". O `Chip`
 *    APRENDEU a aceitar um nó no mesmo turno, por outra frente, e a cópia ficou
 *    lá, com o comentário afirmando o contrário do que o código já fazia, e com
 *    o texto em `peso.forte` enquanto a peça oficial usa `peso.negrito`;
 * 3. `Selo`, a peça velha, com texto em `legenda` (12), abaixo do `fonteMinimaDeInteracao`
 *    de 14 declarado no mesmo arquivo. Duas frentes pararam de usá-la por causa
 *    disso e nenhuma a aposentou, então ela sobreviveu no lugar em que mais
 *    dói: `SeloSeveridade`, que é a única marca de gravidade do produto.
 *
 * Os três casos abaixo travam as três coisas que aquilo produziu, e cada um
 * reprovava antes do conserto.
 */

import { View, StyleSheet } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

import { Chip, SeloSeveridade } from "./Chip";
import * as primitivas from "./componentes";
import { ProvedorDeTema } from "./componentes";
import { fonteMinimaDeInteracao, peso, temaClaro, temaEscuro } from "./tokens";

beforeEach(() => { mockEsquema = "light"; });

async function montar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

type No = { type: string; props: Record<string, unknown>; children: unknown };

/** Todo nó nativo da árvore desenhada, para achar o SVG de um ícone. */
function todosOsNos(no: unknown): No[] {
  if (!no || typeof no !== "object") return [];
  if (Array.isArray(no)) return no.flatMap(todosOsNos);
  const atual = no as No;
  if (typeof atual.type !== "string") return [];
  return [atual, ...todosOsNos(atual.children)];
}

describe("o desenho do símbolo recebe a cor de quem o contém", () => {
  /*
    A cópia em `equipe.tsx` existia por uma razão real (o `Chip` não aceitava
    desenho) e resolvia um problema que o `Chip` tinha: quem passa um ícone
    precisa saber com que cor pintá-lo, e essa cor é do TOM, ou seja, do próprio
    chip. Enquanto o símbolo só podia ser um nó pronto, a tela era obrigada a
    repetir o mapa de cores por fora.

    E ela repetia: `vistoria/[id].tsx` escrevia `<IconeSucesso cor={tema.okTexto}
    />` ao lado de `tom="ok"`. Duas listas para um fato só, que é a forma exata
    do defeito que o cabeçalho do próprio `Chip` diz existir para impedir. No dia
    em que o tom `ok` mudasse de cor, o ícone ficaria com a antiga.
  */
  it("o símbolo em forma de função é pintado com a cor do tom, e a tela não a repete", async () => {
    await montar(
      <Chip
        texto="Enviada"
        tom="ok"
        simbolo={(cor) => <View testID="desenho" style={{ borderColor: cor }} />}
      />,
    );
    const desenho = screen.getByTestId("desenho");
    expect(StyleSheet.flatten(desenho.props.style).borderColor).toBe(temaClaro.okTexto);
  });

  it("no tema escuro ele recebe a cor do tema escuro, sem a tela saber qual é", async () => {
    mockEsquema = "dark";
    await montar(
      <Chip
        texto="Enviada"
        tom="ok"
        simbolo={(cor) => <View testID="desenho" style={{ borderColor: cor }} />}
      />,
    );
    expect(StyleSheet.flatten(screen.getByTestId("desenho").props.style).borderColor)
      .toBe(temaEscuro.okTexto);
  });
});

describe("o selo de severidade é a mesma pílula do resto do produto", () => {
  /*
    Ele aparece em três lugares, e num deles (`vistoria/[id].tsx`) fica na mesma
    linha de uma pílula de prazo desenhada à mão, com texto de 14. A frente da
    vistoria escreveu o porquê no comentário daquela linha: "`Selo` recebe texto
    e não aceita desenho, e ele usa `legenda` de 12 pontos, dois abaixo do
    `fonteMinimaDeInteracao` que o próprio `tokens.ts` declara". Ela contornou; a marca de
    gravidade continuou em 12, ao lado.
  */
  it("a palavra da gravidade não desce abaixo da fonte mínima do produto", async () => {
    await montar(<SeloSeveridade severidade="alta" />);
    const tamanho = StyleSheet.flatten(screen.getByText("Alta").props.style).fontSize;
    expect(tamanho).toBeGreaterThanOrEqual(fonteMinimaDeInteracao);
  });

  it("e tem o mesmo peso das outras pílulas, e não um peso próprio", async () => {
    await montar(
      <>
        <SeloSeveridade severidade="alta" />
        <Chip texto="Enviada" simbolo="✓" tom="ok" />
      </>,
    );
    const daGravidade = StyleSheet.flatten(screen.getByText("Alta").props.style);
    const daOutra = StyleSheet.flatten(screen.getByText("Enviada").props.style);
    expect(daGravidade.fontSize).toBe(daOutra.fontSize);
    expect(daGravidade.fontFamily).toBe(daOutra.fontFamily);
  });

  /*
    A regra da casa, escrita no topo de `componentes.tsx`: nada comunica estado
    só por cor. O selo de gravidade era a exceção que ninguém tinha visto, e ela
    é a pior possível, porque severidade é justamente o que separa a casa que
    pode esperar da casa que não pode. Quatro pílulas coloridas com quatro
    palavras, e sob sol forte âmbar e vermelho são a mesma mancha clara.

    O ícone para isto já existia: `IconeSeveridade` foi desenhado nesta mesma
    onda, com o comentário dizendo "acompanha o `SeloSeveridade`", e terminou a
    onda sem um único uso no produto inteiro.
  */
  it("a gravidade tem segundo canal além da cor: o desenho entra junto com a palavra", async () => {
    await montar(<SeloSeveridade severidade="critica" />);
    const desenhados = todosOsNos(screen.toJSON()).filter((n) => n.type.startsWith("RNSVG"));
    expect(desenhados.length).toBeGreaterThan(0);
    expect(screen.getByText("Crítica")).toBeTruthy();
  });

  /*
    Sem classificação é um estado e não um buraco: a ocorrência chegou e ninguém
    decidiu ainda. Ele também precisa do segundo canal, senão é a única pílula
    do produto que se distingue só pelo cinza.
  */
  it("sem classificação também é um estado, com palavra e desenho", async () => {
    await montar(<SeloSeveridade severidade={null} />);
    expect(screen.getByText("Sem classificação")).toBeTruthy();
    expect(todosOsNos(screen.toJSON()).filter((n) => n.type.startsWith("RNSVG")).length)
      .toBeGreaterThan(0);
  });

  it("o leitor de tela ouve a gravidade em palavras, e não o nome de um desenho", async () => {
    await montar(<SeloSeveridade severidade="media" testID="gravidade" />);
    expect(screen.getByTestId("gravidade").props.accessibilityLabel)
      .toBe("Severidade média");
  });
});

describe("a peça velha foi aposentada, e não deixada por perto", () => {
  /*
    Uma peça que ninguém deveria usar e que continua exportada é uma peça que a
    próxima tela vai usar: quem escreve procura por "selo" no autocompletar e
    acha. `Selo` só some de verdade quando some do módulo.
  */
  it("`componentes.tsx` não exporta mais `Selo`", () => {
    expect(Object.keys(primitivas)).not.toContain("Selo");
    expect(Object.keys(primitivas)).not.toContain("SeloSeveridade");
  });

  it("e o peso das pílulas é o negrito do token, num lugar só", async () => {
    await montar(<Chip texto="Enviada" simbolo="✓" tom="ok" />);
    const estilo = StyleSheet.flatten(screen.getByText("Enviada").props.style);
    expect(estilo.fontWeight).toBe(peso.negrito);
  });
});
