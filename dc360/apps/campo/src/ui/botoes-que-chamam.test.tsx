/**
 * OS BOTÕES QUE CHAMAM, e o reclame que os pediu.
 *
 * Na letra de quem paga, olhando o aparelho: "se puder deixar os botões mais
 * chamativos ao invés de só preto ou branco seria bom: geralmente pessoas que
 * trabalham nessa área não têm afinidade muito grande com tecnologia".
 *
 * O diagnóstico por trás da frase é medido, e não de gosto. O `secundario`
 * era transparente com fio em `tema.borda`, que mede 1,30:1 sobre o cartão
 * (`tokens.ts` diz isso, e o portão de acessibilidade confere): no escuro ele
 * parecia "só branco", no claro "só preto", e não cumpria nem os 3:1 que a
 * WCAG 1.4.11 pede para o que identifica um controle. E entre os 28 usos dele
 * estavam "Tirar foto" e "Capturar localização", os dois atos centrais da
 * vistoria.
 *
 * Duas coisas mudam, e este arquivo prova as duas:
 *
 * 1. Nasce o tipo `realce`: preenchido com o fundo suave de destaque, para o
 *    ato importante que não é A ação principal da tela.
 * 2. O `secundario` passa a usar `bordaControle` (3:1), que já existia para o
 *    campo de formulário e que o botão nunca tinha usado: ele era a única peça
 *    de interação do aplicativo com fio decorativo.
 */

import { StyleSheet, View } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

import { Aviso, Botao, LinhaDeAcoes, ProvedorDeTema } from "./componentes";
import { borda, temaClaro, temaEscuro } from "./tokens";

beforeEach(() => { mockEsquema = "light"; });

async function montar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

/** O estilo desenhado do botão, achatado, pelo rótulo que o leitor de tela anuncia. */
function estiloDoBotao(rotulo: string) {
  return StyleSheet.flatten(screen.getByLabelText(rotulo).props.style) as {
    backgroundColor?: string; borderColor?: string; borderWidth?: number;
  };
}

describe("o tipo `realce`, o preenchido que não é o principal", () => {
  it("no tema claro pinta o fundo suave de destaque, com o texto de destaque em cima", async () => {
    await montar(<Botao titulo="Tirar foto" tipo="realce" onPress={() => {}} />);

    expect(estiloDoBotao("Tirar foto").backgroundColor).toBe(temaClaro.destaqueFundo);
    const texto = StyleSheet.flatten(screen.getByText("Tirar foto").props.style);
    expect(texto.color).toBe(temaClaro.destaqueTexto);
  });

  it("no tema escuro troca o par junto com o tema", async () => {
    mockEsquema = "dark";
    await montar(<Botao titulo="Tirar foto" tipo="realce" onPress={() => {}} />);

    expect(estiloDoBotao("Tirar foto").backgroundColor).toBe(temaEscuro.destaqueFundo);
    const texto = StyleSheet.flatten(screen.getByText("Tirar foto").props.style);
    expect(texto.color).toBe(temaEscuro.destaqueTexto);
  });

  /*
    Ele é PREENCHIDO, e não contornado: a diferença entre o realce e o
    secundário precisa ser vista de relance, com sol na tela. Dois botões com
    fio, um violeta e um cinza, seriam a mesma coisa para quem não distingue
    as duas cores.
  */
  it("não desenha fio nenhum: o que o separa do secundário é o preenchimento", async () => {
    await montar(<Botao titulo="Tirar foto" tipo="realce" onPress={() => {}} />);
    expect(estiloDoBotao("Tirar foto").borderWidth).toBe(0);
  });

  /*
    E ele NÃO é o primário com outra roupa. O fundo do realce é diferente do
    fundo do primário nos dois temas, senão a tela voltaria a ter duas ações
    principais e nenhuma.
  */
  it("é uma cor diferente da do primário, nos dois temas", async () => {
    expect(temaClaro.destaqueFundo).not.toBe(temaClaro.destaque);
    expect(temaEscuro.destaqueFundo).not.toBe(temaEscuro.destaque);
  });

  it("aceita ícone, pintado com a mesma cor do texto", async () => {
    const cores: string[] = [];
    await montar(
      <Botao
        titulo="Capturar localização"
        tipo="realce"
        onPress={() => {}}
        icone={(cor) => { cores.push(cor); return <View testID="icone-do-realce" />; }}
      />,
    );

    expect(screen.getByTestId("icone-do-realce")).toBeTruthy();
    expect(cores).toEqual([temaClaro.destaqueTexto]);
  });

  it("continua sendo um botão: responde ao toque e se apresenta ao leitor de tela", async () => {
    const aoTocar = jest.fn();
    await montar(
      <Botao titulo="Tirar foto" tipo="realce" onPress={aoTocar} descricao="Tirar a primeira fotografia" />,
    );

    const botao = screen.getByLabelText("Tirar a primeira fotografia");
    expect(botao.props.accessibilityRole).toBe("button");
    await act(async () => { fireEvent.press(botao); });
    expect(aoTocar).toHaveBeenCalledTimes(1);
  });

  it("passa pela linha de ações sem perder o tipo", async () => {
    await montar(
      <LinhaDeAcoes
        acoes={[
          { titulo: "Tentar de novo", tipo: "realce", onPress: () => {} },
          { titulo: "Descartar", tipo: "perigo", onPress: () => {} },
        ]}
      />,
    );

    expect(estiloDoBotao("Tentar de novo").backgroundColor).toBe(temaClaro.destaqueFundo);
    expect(estiloDoBotao("Descartar").backgroundColor).toBe(temaClaro.perigoFundo);
  });
});

describe("o `secundario`, que deixa de ser a única peça de interação com fio decorativo", () => {
  /*
    `tema.borda` desenha cartão e separador, que são decoração, e o campo de
    formulário já tinha deixado de usá-la (`bordaControle`, 3:1). O botão
    secundário era o último controle do aplicativo desenhado com o fio de
    decoração, e por isso parecia "só preto ou branco": o contorno dele mal
    existia.
  */
  it("o fio sai de `bordaControle`, nos dois temas", async () => {
    await montar(<Botao titulo="Voltar" tipo="secundario" onPress={() => {}} />);
    expect(estiloDoBotao("Voltar")).toMatchObject({
      borderColor: temaClaro.bordaControle,
      borderWidth: borda.fio,
      backgroundColor: "transparent",
    });

    mockEsquema = "dark";
    await montar(<Botao titulo="Fechar" tipo="secundario" onPress={() => {}} />);
    expect(estiloDoBotao("Fechar").borderColor).toBe(temaEscuro.bordaControle);
  });

  it("a borda de controle é de fato mais forte que a decorativa, senão a troca não muda nada", () => {
    expect(temaClaro.bordaControle).not.toBe(temaClaro.borda);
    expect(temaEscuro.bordaControle).not.toBe(temaEscuro.borda);
  });
});

describe("a ação dentro do aviso", () => {
  /*
    O aviso decide o tipo do botão dele por dentro, e o padrão continua
    secundário: o aviso já carrega a cor do tom, e um bloco violeta dentro de
    um bloco âmbar seriam duas cores disputando a mesma caixa. Quem tem um ato
    que faz o trabalho ANDAR (a minuta do laudo, quando tudo está pronto) pede
    realce de fora, uma chamada de cada vez.
  */
  it("por padrão continua secundária", async () => {
    await montar(
      <Aviso tom="alerta" titulo="Falta 1 item" acao={{ titulo: "Ver o que falta", onPress: () => {} }}>
        A lista está no alto.
      </Aviso>,
    );
    expect(estiloDoBotao("Ver o que falta")).toMatchObject({
      backgroundColor: "transparent",
      borderColor: temaClaro.bordaControle,
    });
  });

  it("sobe para realce quando quem chama pede", async () => {
    await montar(
      <Aviso
        tom="sucesso"
        titulo="Tudo pronto"
        acao={{ titulo: "Revisar o laudo agora", tipo: "realce", onPress: () => {} }}
      >
        O próximo passo é a minuta.
      </Aviso>,
    );
    expect(estiloDoBotao("Revisar o laudo agora").backgroundColor).toBe(temaClaro.destaqueFundo);
  });
});
