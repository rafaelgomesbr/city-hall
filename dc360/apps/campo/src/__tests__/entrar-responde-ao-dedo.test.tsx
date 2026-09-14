import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * A tela de entrar, e os três defeitos dela eram todos de RETORNO.
 *
 * A tela fazia as coisas certas e não contava nenhuma delas para o dedo que a
 * tocou. Os três casos abaixo REPROVAM na versão anterior da tela:
 *
 * 1. O "Ver/Ocultar" senha era um `Pressable` com estilo constante. Sem
 *    `pressed`, sem borda que muda, sem fundo que muda. Com o dedo molhado e o
 *    teclado ocupando meia tela, não saber se o toque pegou faz a pessoa tocar
 *    de novo, e o segundo toque esconde a senha que o primeiro mostrou.
 * 2. Os campos não tinham foco desenhado: a borda em repouso e a borda com o
 *    cursor dentro eram a mesma borda. A primitiva `Campo` desenha o anel, e a
 *    migração para ela mata de quebra uma das duas cópias verbatim de estilo
 *    do aplicativo.
 * 3. O `finally` zerava o estado nos DOIS desfechos, então o botão voltava a
 *    dizer "Entrar", habilitado, para quem acabou de entrar, enquanto a
 *    navegação ainda não tinha acontecido. O segundo toque manda uma segunda
 *    autenticação.
 *
 * O arquivo mora em `__tests__` e não ao lado da tela porque tudo dentro de
 * `src/app` vira ROTA no Expo: um teste ali seria uma tela navegável dentro do
 * aplicativo publicado.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-router", () => ({
  Redirect: () => null,
  router: { replace: jest.fn(), push: jest.fn() },
}));

/*
  As duas classes de erro entram no dublê porque a tela decide o texto com
  `instanceof`: sem elas, `e instanceof SemSinal` explodiria com "Right-hand
  side of 'instanceof' is not callable", e o teste reprovaria pelo motivo
  errado.
*/
jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {},
  ErroDaApi: class ErroDaApi extends Error {
    mensagemAmigavel() { return "Email ou senha não conferem."; }
  },
}));

/** O que a sessão faz quando a tela chama `entrar`. Cada caso ajusta. */
let mockEntrar = jest.fn(async () => {});
jest.mock("../dados/sessao", () => ({
  useSessao: () => ({ identidade: null, entrar: mockEntrar }),
}));

import Entrar from "../app/entrar";

beforeEach(() => {
  mockEntrar = jest.fn(async () => {});
});

async function abrirATela(): Promise<void> {
  await render(<Entrar />);
  await act(async () => {});
}

/** Email e senha preenchidos, que é o pré-requisito de todo caso de envio. */
async function preencher(): Promise<void> {
  /*
    Pelo RÓTULO, e não pelo `testID`. Os dois campos se apresentam com o mesmo
    nome antes e depois desta frente, então a reversão reprova por causa do que
    a tela faz, e não por falta de um identificador que só a versão nova tem.
    Teste que reprova por `testID` ausente prova a existência do `testID`.
  */
  await fireEvent.changeText(screen.getByLabelText("Email funcional"), "agente@municipio.gov.br");
  await fireEvent.changeText(screen.getByLabelText("Senha"), "senha-de-teste");
}

/** Um toque, esperando o que ele disparar. */
async function tocar(elemento: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await act(async () => { fireEvent.press(elemento); });
}

/** O estilo aplicado, achatado: o React Native aceita objeto ou lista. */
function estiloDe(elemento: { props: { style?: unknown } }): Record<string, unknown> {
  const bruto = elemento.props.style;
  const lista = Array.isArray(bruto) ? bruto : [bruto];
  return Object.assign({}, ...lista.filter(Boolean)) as Record<string, unknown>;
}

describe("o Ver/Ocultar da senha", () => {
  it("muda de desenho sob o dedo, e não só de cor", async () => {
    await abrirATela();

    /* Pelo rótulo, que as duas versões da tela têm. Ver `preencher`. */
    const alternar = screen.getByLabelText("Mostrar a senha");
    const repouso = estiloDe(alternar);

    await act(async () => { fireEvent(alternar, "pressIn"); });
    const sobODedo = estiloDe(screen.getByLabelText("Mostrar a senha"));

    /*
      Duas propriedades, e as duas obrigatórias. A cor sozinha é a regra da
      casa furada justamente no controle em que o agente mais precisa de
      certeza, porque o efeito do toque some junto com o dedo se ele errar o
      alvo.
    */
    expect(sobODedo.backgroundColor).not.toBe(repouso.backgroundColor);
    expect(sobODedo.borderWidth).not.toBe(repouso.borderWidth);

    await act(async () => { fireEvent(alternar, "pressOut"); });
    expect(estiloDe(screen.getByLabelText("Mostrar a senha")).borderWidth)
      .toBe(repouso.borderWidth);
  });

  it("continua sendo o alvo de 52 do produto, e se anuncia", async () => {
    await abrirATela();

    const alternar = screen.getByLabelText("Mostrar a senha");
    expect(estiloDe(alternar).minHeight).toBe(52);

    await tocar(alternar);
    expect(screen.getByLabelText("Esconder a senha")).toBeTruthy();
  });
});

describe("os campos", () => {
  /*
    O anel é o estado de foco DESENHADO, e ele só existe porque os dois campos
    passaram a sair da primitiva. Procurar o anel é a forma de cobrar a
    migração sem cobrar o nome do componente.
  */
  it("desenham o foco, os dois", async () => {
    await abrirATela();

    expect(screen.getByTestId("campo-email-anel-de-foco")).toBeTruthy();
    expect(screen.getByTestId("campo-senha-anel-de-foco")).toBeTruthy();
  });
});

describe("entrar direito", () => {
  it("não devolve o botão para 'Entrar' enquanto a tela não trocou", async () => {
    await abrirATela();

    await preencher();
    await tocar(screen.getByLabelText("Entrar"));

    /*
      A sessão já existe e o roteador ainda não trocou a tela. Um botão
      habilitado dizendo "Entrar" nesse instante convida ao segundo toque, que
      manda uma segunda autenticação.
    */
    const botao = screen.getByLabelText("Abrindo as suas tarefas");
    expect(botao.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByLabelText("Entrar")).toBeNull();
  });

  it("o segundo toque não chega a chamar a sessão de novo", async () => {
    await abrirATela();
    await preencher();

    await tocar(screen.getByLabelText("Entrar"));
    await tocar(screen.getByLabelText("Abrindo as suas tarefas"));

    expect(mockEntrar).toHaveBeenCalledTimes(1);
  });
});

describe("as duas gravidades da tela", () => {
  it("o erro ganha título, e a instrução permanente deixa de ser caixa de aviso", async () => {
    mockEntrar = jest.fn(async () => { throw new Error("servidor fora do ar"); });
    await abrirATela();

    await preencher();
    await tocar(screen.getByLabelText("Entrar"));

    /* O que impede de entrar tem título e o sinal de perigo. */
    expect(screen.getByText("Não deu para entrar")).toBeTruthy();
    expect(screen.getByLabelText("Perigo")).toBeTruthy();

    /*
      E a frase que ninguém relê na segunda vez não é mais uma caixa com o
      mesmo peso visual: o sinal de informação do `Aviso` não existe nesta tela.
    */
    expect(screen.queryByLabelText("Informação")).toBeNull();
    expect(screen.getByText(/Entre ainda na base, com sinal/)).toBeTruthy();
  });

  it("a falha devolve a tela ao agente, com o botão de novo em 'Entrar'", async () => {
    mockEntrar = jest.fn(async () => { throw new Error("servidor fora do ar"); });
    await abrirATela();

    await preencher();
    await tocar(screen.getByLabelText("Entrar"));

    const botao = screen.getByLabelText("Entrar");
    expect(botao.props.accessibilityState.disabled).toBe(false);
  });
});
