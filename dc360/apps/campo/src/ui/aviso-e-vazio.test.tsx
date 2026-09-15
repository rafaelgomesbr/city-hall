/**
 * O aviso com quatro gravidades, e o estado vazio que é uma resposta.
 *
 * **O defeito real do `Aviso`:** alerta e perigo usavam o MESMO caractere
 * `!`, e o que separava um do outro era a cor de fundo. Isso contradiz a regra
 * escrita seis linhas acima, no mesmo arquivo, e a contradição não é teórica:
 * para quem não distingue vermelho de âmbar, e para qualquer um com sol
 * batendo na tela, as duas caixas eram a mesma caixa. São 25 avisos no
 * aplicativo, de quatro gravidades diferentes.
 *
 * **A falta do `Vazio`:** oito linhas, título mais frase cinza, e os quatro
 * estados vazios do aplicativo idênticos. O da fila é a resposta final à
 * pergunta que o agente faz depois de descer o morro ("o meu trabalho
 * chegou?"), e respondia em cinza claro, sem marca nenhuma.
 *
 * As duas mudanças são por propriedade NOVA e OPCIONAL. Quebrar a assinatura
 * agora derrubaria as outras frentes que estão dentro das telas, e a
 * compatibilidade é cobrada aqui em vez de ficar por conta da lembrança.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, View } from "react-native";

import { Aviso, Botao, Cartao, ProvedorDeTema, Txt, Vazio } from "./componentes";
import { SeloSeveridade } from "./Chip";
import { borda, temaClaro, temaEscuro } from "./tokens";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

beforeEach(() => { mockEsquema = "light"; });

async function montar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

/**
 * A CAIXA do aviso, alcançada pelo que ela DECLARA e não por contar camadas.
 *
 * A caixa não tem `testID` próprio, e não vai ganhar um só para o teste:
 * acrescentar identificador para conseguir medir é o começo do componente que
 * existe em duas versões, a real e a testável.
 *
 * Ela era alcançada subindo DUAS camadas a partir do texto, e isso quebrou no
 * dia em que o aviso deixou de ser uma linha e virou uma coluna (a ação saiu de
 * dentro da coluna de texto, onde nascia 32 pontos deslocada de tudo). Contar
 * camadas mede a árvore de hoje; o que não muda é que a caixa é o ancestral que
 * se ANUNCIA ao leitor de tela, porque é ela quem carrega a gravidade do aviso.
 */
function caixaDoAviso(texto: string) {
  let no = screen.getByText(texto).parent;
  while (no && no.props.accessibilityRole === undefined) no = no.parent;
  return no;
}

describe("o sinal do aviso", () => {
  /*
    O caso que reprova antes da correção. Com os dois tons usando `!`, procurar
    o caractere devolve dois elementos e a busca por texto único estoura.
  */
  it("alerta e perigo têm sinais DIFERENTES, e não só cores diferentes", async () => {
    await montar(
      <>
        <Aviso tom="alerta">Prazo vencendo</Aviso>
        <Aviso tom="perigo">Sem sinal há duas horas</Aviso>
      </>,
    );
    expect(screen.getByText("!")).toBeTruthy();
    expect(screen.getByText("×")).toBeTruthy();
  });

  it("os quatro tons usam quatro sinais, sem repetição", async () => {
    await montar(
      <>
        <Aviso tom="info">a</Aviso>
        <Aviso tom="sucesso">b</Aviso>
        <Aviso tom="alerta">c</Aviso>
        <Aviso tom="perigo">d</Aviso>
      </>,
    );
    const sinais = ["i", "✓", "!", "×"];
    for (const sinal of sinais) expect(screen.getByText(sinal)).toBeTruthy();
    expect(new Set(sinais).size).toBe(4);
  });

  /*
    O desenho do caractere não chega a quem usa leitor de tela: sem rótulo, ele
    lê "exclamação" ou nada. A gravidade precisa ser dita em palavra nas duas
    pontas.
  */
  it("o sinal tem nome falado, e o nome é a gravidade", async () => {
    await montar(<Aviso tom="perigo">Sem sinal</Aviso>);
    expect(screen.getByLabelText("Perigo")).toBeTruthy();
  });

  it("o perigo continua sendo anunciado como alerta pelo sistema", async () => {
    await montar(<Aviso tom="perigo">Sem sinal</Aviso>);
    expect(caixaDoAviso("Sem sinal")?.props.accessibilityRole).toBe("alert");
  });
});

describe("título e ação do aviso, que são novos e opcionais", () => {
  it("sem título e sem ação, a chamada antiga desenha igual", async () => {
    // As 25 chamadas existentes passam só `tom` e o texto. Nenhuma pode
    // quebrar, e nenhuma pode ganhar caixa vazia de título.
    await montar(<Aviso tom="info">Esta lista tem mais de meia hora</Aviso>);
    expect(screen.getByText("Esta lista tem mais de meia hora")).toBeTruthy();
  });

  it("com título, ele aparece acima do texto", async () => {
    await montar(<Aviso tom="alerta" titulo="Prazo vencido">Devolva ou envie agora</Aviso>);
    expect(screen.getByText("Prazo vencido")).toBeTruthy();
    expect(screen.getByText("Devolva ou envie agora")).toBeTruthy();
  });

  /*
    A ação mora DENTRO do aviso. Separar "o que houve" de "o que fazer a
    respeito" foi o que produziu, em mais de uma tela deste aplicativo, um
    parágrafo de explicação no lugar onde deveria estar um botão.
  */
  it("com ação, o toque chega em quem chamou", async () => {
    const toques: string[] = [];
    await montar(
      <Aviso
        tom="perigo"
        titulo="A coleta não subiu"
        acao={{ titulo: "Enviar agora", onPress: () => toques.push("enviou"), testID: "acao" }}
      >
        O sinal caiu no meio do envio.
      </Aviso>,
    );
    await act(async () => { fireEvent.press(screen.getByTestId("acao")); });
    expect(toques).toEqual(["enviou"]);
  });
});

describe("o estado vazio", () => {
  it("sem ícone e sem ação, a chamada antiga desenha igual", async () => {
    await montar(<Vazio titulo="Nada por aqui" descricao="Tente outro filtro" />);
    expect(screen.getByText("Nada por aqui")).toBeTruthy();
    expect(screen.getByText("Tente outro filtro")).toBeTruthy();
  });

  it("o ícone entra como nó, e o conjunto de ícones é de outra frente", async () => {
    // A peça precisa aceitar o que vier, e aceitar nada: amarrá-la a um
    // catálogo de nomes acoplaria duas frentes que não precisam se conhecer.
    await montar(
      <Vazio titulo="Fila vazia" icone={<View testID="desenho" />} />,
    );
    // `includeHiddenElements` porque o círculo do ícone é escondido do leitor
    // de tela de propósito, e a biblioteca de teste, com razão, não enxerga o
    // que o leitor de tela não enxerga.
    expect(screen.getByTestId("desenho", { includeHiddenElements: true })).toBeTruthy();
  });

  it("o ícone não é anunciado de novo pelo leitor de tela", async () => {
    // O bloco já tem título e descrição em texto. Anunciar o desenho faria a
    // tela repetir a mesma informação duas vezes.
    await montar(<Vazio titulo="Fila vazia" icone={<View testID="desenho" />} />);
    const pai = screen.getByTestId("desenho", { includeHiddenElements: true }).parent;
    expect(pai?.props.accessibilityElementsHidden).toBe(true);
  });

  /*
    Vazio sem saída é beco. O da fila responde "o meu trabalho chegou?", e a
    resposta merece um caminho adiante.
  */
  it("com ação, o vazio deixa de ser beco", async () => {
    const toques: string[] = [];
    await montar(
      <Vazio
        titulo="Nenhuma tarefa"
        acao={{ titulo: "Atualizar", onPress: () => toques.push("atualizou"), testID: "atualizar" }}
      />,
    );
    await act(async () => { fireEvent.press(screen.getByTestId("atualizar")); });
    expect(toques).toEqual(["atualizou"]);
  });
});

describe("nenhuma chamada existente quebra", () => {
  /*
    Três frentes mexem no aplicativo ao mesmo tempo, e duas delas estão dentro
    das telas. Uma assinatura quebrada aqui derruba as duas, então a
    compatibilidade é cobrada e não lembrada.
  */
  /*
    `Selo` saiu desta lista porque foi APOSENTADO, e não porque quebrou.

    Ele era a pílula anterior ao `Chip` e tinha três defeitos que a onda tratou
    como reprovação em toda peça vizinha: texto de 12 (abaixo do `fonteMinimaDeInteracao`
    do produto), `<Text>` cru (fora da família de fonte do produto) e cor
    escolhida no ponto de uso. O `SeloSeveridade` era o último a chamá-lo, foi
    reescrito em cima do `Chip` e mudou de módulo junto. A razão inteira está em
    `ui/Chip.tsx` e o que trava o desfecho é `ui/pilula-do-produto.test.tsx`.

    O que este caso continua guardando é o que ele existia para guardar: a
    chamada que as telas escrevem hoje não pode quebrar.
  */
  it("Txt, Botao, Cartao e SeloSeveridade continuam com a mesma chamada", async () => {
    await montar(
      <Cartao titulo="Ocorrência">
        <Txt variante="h3">Título</Txt>
        <Txt variante="legenda" discreto mono>000123/2026</Txt>
        <SeloSeveridade severidade="alta" />
        <Botao titulo="Concluir" onPress={() => undefined} />
      </Cartao>,
    );
    expect(screen.getByText("Ocorrência")).toBeTruthy();
    expect(screen.getByText("000123/2026")).toBeTruthy();
    expect(screen.getByText("Alta")).toBeTruthy();
    expect(screen.getByText("Concluir")).toBeTruthy();
  });

  it("SeloSeveridade sem classificação continua dizendo isso por escrito", async () => {
    await montar(<SeloSeveridade severidade={null} />);
    expect(screen.getByText("Sem classificação")).toBeTruthy();
  });
});

/**
 * A RÉGUA DO PESO VISUAL, no aviso.
 *
 * O `Aviso` aparece 25 vezes no aplicativo, e é ele que produz a maior mancha
 * de cor de todas: um retângulo inteiro com fundo, título e CORPO na cor do
 * tom. Um parágrafo de quarenta palavras em âmbar dentro de um cartão que já
 * tem uma pílula colorida é literalmente a frase da reclamação de origem,
 * "textos coloridos pra todo lado".
 *
 * Todos estes casos REPROVAM na versão anterior, em que o fundo era `cores.fundo`
 * sem condição nenhuma e o corpo saía sempre em `cores.texto`.
 */
describe("a régua do peso visual, no aviso", () => {
  /* Ver `caixaDoAviso`, no alto: a caixa é achada pelo que ela declara. */
  const caixaDe = (texto: string) =>
    StyleSheet.flatten(caixaDoAviso(texto)?.props.style);

  it("o tom `sucesso` não pinta fundo, mesmo pedindo peso forte", async () => {
    await montar(<Aviso tom="sucesso" titulo="Pronto" peso="forte">O pedido saiu.</Aviso>);
    expect(caixaDe("O pedido saiu.").backgroundColor).toBe("transparent");
  });

  it("em peso leve, o CORPO sai na cor normal do texto, e não na do tom", async () => {
    /*
      Esta é a metade da correção que resolve a reclamação pela raiz. A cor do
      tom fica no sinal, no título e no filete; o parágrafo volta a ser
      parágrafo, o que também devolve contraste, porque toda cor de tom é mais
      fraca que a cor de texto do tema.
    */
    await montar(<Aviso tom="sucesso" titulo="Pronto">O pedido saiu.</Aviso>);
    expect(StyleSheet.flatten(screen.getByText("O pedido saiu.").props.style).color)
      .toBe(temaClaro.texto);
    expect(StyleSheet.flatten(screen.getByText("Pronto").props.style).color)
      .toBe(temaClaro.okTexto);
  });

  it("o filete lateral entra no lugar do fundo, na cor do tom", async () => {
    /*
      Sem nada no lugar do fundo, um aviso leve seria indistinguível de um
      parágrafo solto e a peça deixaria de existir como peça. O filete dá o
      começo da leitura sem acender a área inteira.
    */
    await montar(<Aviso tom="perigo" peso="leve">O servidor recusou.</Aviso>);
    const estiloDaCaixa = caixaDe("O servidor recusou.");
    expect(estiloDaCaixa.backgroundColor).toBe("transparent");
    expect(estiloDaCaixa.borderLeftWidth).toBe(borda.marca);
    expect(estiloDaCaixa.borderLeftColor).toBe(temaClaro.perigoTexto);
  });

  it("e o peso forte continua pintando, sem filete", async () => {
    /*
      O outro lado da régua. Se apagar o fundo de todo aviso passasse, a tela
      perderia a hierarquia em vez de ganhar uma, e a coisa mais grave da peça
      ficaria com o mesmo desenho do resto.
    */
    await montar(<Aviso tom="perigo">O servidor recusou.</Aviso>);
    const estiloDaCaixa = caixaDe("O servidor recusou.");
    expect(estiloDaCaixa.backgroundColor).toBe(temaClaro.perigoFundo);
    expect(estiloDaCaixa.borderLeftWidth).toBe(0);
  });

  it("o aviso leve continua se anunciando como alerta para quem ouve a tela", async () => {
    /*
      Peso é desenho, e desenho não chega a quem usa leitor de tela. Trocar o
      fundo por um filete não pode rebaixar um perigo a texto comum.
    */
    await montar(<Aviso tom="perigo" peso="leve">O servidor recusou.</Aviso>);
    expect(caixaDoAviso("O servidor recusou.")?.props.accessibilityRole).toBe("alert");
    expect(screen.getByLabelText("Perigo")).toBeTruthy();
  });

  it("no tema escuro vale o mesmo, porque a regra é da régua e não da paleta", async () => {
    mockEsquema = "dark";
    await montar(<Aviso tom="sucesso" titulo="Pronto">O pedido saiu.</Aviso>);
    expect(caixaDe("O pedido saiu.").backgroundColor).toBe("transparent");
    expect(StyleSheet.flatten(screen.getByText("Pronto").props.style).color)
      .toBe(temaEscuro.okTexto);
  });
});
