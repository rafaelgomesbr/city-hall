import { AccessibilityInfo } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

/**
 * O CROMO: a barra de abas colada embaixo e as passagens entre telas.
 *
 * Três defeitos que estes casos travam, e o primeiro é o mais barulhento
 * porque veio por reclamação, na primeira tela que o Rafa abriu no iPhone:
 * "esse aplicativo não combina com menu flutuante, deixa um menu padrão
 * inferior". A barra pairava sobre o conteúdo, com margem lateral, raio de
 * pílula e altura própria.
 *
 * 1. **Barra que declara a própria altura.** É a parte que some da vista mais
 *    fácil: `getTabBarHeight` do React Navigation devolve a altura escrita no
 *    estilo QUANDO ela existe, e ignora a conta do sistema (49 mais a área
 *    segura do aparelho). Um número escrito à mão aqui acerta num aparelho e
 *    erra em todos os outros, e o erro é invisível no simulador em que foi
 *    escrito.
 * 2. **Vão morto no fim de toda lista.** O `paddingBottom` do `sceneStyle`
 *    existia para o último item não nascer atrás da barra flutuante. Com a
 *    barra ocupando lugar no leiaute, quem encurta a cena é o navegador, e o
 *    recuo vira um buraco no fim de toda rolagem do aplicativo: o defeito
 *    oposto ao que ele consertava.
 * 3. **Estado comunicado só por cor.** O rótulo da aba é a mesma palavra
 *    aberta ou fechada. Sem a pílula preenchida atrás do ícone, a única
 *    diferença entre a aba ativa e as outras duas seria o violeta, e a regra
 *    da casa proíbe isso desde o primeiro dia.
 *
 * E as transições: até aqui não existia nenhuma, nem na troca de abas, nem na
 * entrada da vistoria, nem entre entrar e o aplicativo. Aqui se trava que elas
 * existem, que a duração sai de token, e que SOMEM para quem pediu redução de
 * movimento, que é gente com enjoo em pé num barranco.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "light",
}));

/*
  As opções são capturadas em vez de a barra ser desenhada, e isso é uma
  escolha com limite declarado: o que este arquivo prova é o que o aplicativo
  PEDE ao React Navigation, não o pixel que sai no aparelho. Desenhar a barra
  de verdade exigiria montar o navegador inteiro dentro do jest, e ainda assim
  a altura final viria de medição de tela, que não existe aqui. A prova visual
  é a do aparelho, e está declarada como tal no relatório do turno.

  O nome começa com `mock` porque é a única forma de o jest deixar a fábrica de
  `jest.mock`, que é içada para o topo do arquivo, enxergar a variável.
*/
type Opcoes = Record<string, unknown>;
const mockNavegador: {
  abas: Opcoes | null;
  telas: { name: string; options?: Opcoes }[];
  pilha: Opcoes | null;
} = { abas: null, telas: [], pilha: null };

jest.mock("expo-router", () => {
  const reagir = require("react") as typeof import("react");

  const Tabs = (props: { screenOptions?: Opcoes; children?: unknown }) => {
    mockNavegador.abas = props.screenOptions ?? null;
    return reagir.createElement(reagir.Fragment, null, props.children as never);
  };
  Tabs.Screen = (props: { name: string; options?: Opcoes }) => {
    mockNavegador.telas.push(props);
    return null;
  };

  const Stack = (props: { screenOptions?: Opcoes; children?: unknown }) => {
    mockNavegador.pilha = props.screenOptions ?? null;
    return reagir.createElement(reagir.Fragment, null, props.children as never);
  };
  Stack.Screen = () => null;

  return {
    Tabs, Stack,
    Redirect: () => null,
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  };
});

jest.mock("react-native-safe-area-context", () => ({
  // Números de iPhone com faixa inicial: é o aparelho em que a barra flutuante
  // foi reprovada, e o inset de baixo é justamente o que a altura escrita à
  // mão atropelava.
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hideAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

jest.mock("../push/ProvedorDePush", () => ({
  ProvedorDePush: ({ children }: { children: unknown }) => children,
}));

jest.mock("../ui/fontes", () => ({
  ProvedorDeFontes: ({ children }: { children: unknown }) => children,
  useFontes: () => ({ liberado: true, prontas: true, naReserva: false }),
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    assinar: () => () => undefined,
    drenar: async () => undefined,
  }),
  iniciarSincronizacaoContinua: () => () => undefined,
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }),
}));

jest.mock("../dados/sessao", () => ({
  ProvedorDeSessao: ({ children }: { children: unknown }) => children,
  useSessao: () => ({
    carregando: false,
    obterToken: async () => "token-de-mentira",
    lerIdentidade: async () => null,
    identidade: {
      nome: "Agente de teste",
      papel: "agente_campo",
      matricula: "0001",
      organizacaoId: "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
  }),
}));

import LayoutDoAgente from "../app/(agente)/_layout";
import Raiz from "../app/_layout";
import { icone, movimento, raio } from "../ui/tokens";

let reducaoLigada = false;

beforeEach(() => {
  mockNavegador.abas = null;
  mockNavegador.telas = [];
  mockNavegador.pilha = null;
  reducaoLigada = false;
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(async () => reducaoLigada);
});

afterEach(() => { jest.restoreAllMocks(); });

/*
  `act` assíncrono porque a leitura da redução de movimento é uma promessa: sem
  esperar por ela, o que fica capturado é o primeiro quadro, quando o
  aplicativo ainda não sabe que foi pedido para não animar.
*/
async function montarAsAbas(): Promise<Opcoes> {
  await act(async () => { render(<LayoutDoAgente />); });
  if (!mockNavegador.abas) throw new Error("o layout do agente não montou as abas");
  return mockNavegador.abas;
}

async function montarARaiz(): Promise<Opcoes> {
  await act(async () => { render(<Raiz />); });
  if (!mockNavegador.pilha) throw new Error("a raiz não montou a pilha");
  return mockNavegador.pilha;
}

function estiloDaBarra(opcoes: Opcoes): Record<string, unknown> {
  return (opcoes["tabBarStyle"] ?? {}) as Record<string, unknown>;
}

describe("a barra de abas colada na borda de baixo", () => {
  it("não flutua: sem posição absoluta, sem margem lateral e sem folga inferior", async () => {
    const barra = estiloDaBarra(await montarAsAbas());

    expect(barra["position"]).toBeUndefined();
    expect(barra["marginHorizontal"]).toBeUndefined();
    expect(barra["bottom"]).toBeUndefined();
  });

  it("não tem raio de pílula: barra colada com canto arredondado é pílula mal colada", async () => {
    const barra = estiloDaBarra(await montarAsAbas());

    expect(barra["borderRadius"]).toBeUndefined();
  });

  it("deixa a altura com o sistema, em vez de declarar a própria", async () => {
    const barra = estiloDaBarra(await montarAsAbas());

    /*
      Não é preciosismo: `getTabBarHeight` devolve o valor escrito no estilo
      quando ele existe, e só cai em "49 mais a área segura" quando ele não
      existe. Altura declarada aqui vence o inset do aparelho.
    */
    expect(barra["height"]).toBeUndefined();
  });

  it("desenha o fio que separa a barra do conteúdo", async () => {
    const barra = estiloDaBarra(await montarAsAbas());

    /* A versão flutuante zerava o fio para ele não cortar a pílula ao meio.
       Colada, a barra precisa dele: é o que diz onde o conteúdo termina. */
    expect(barra["borderTopWidth"]).toBeGreaterThan(0);
    expect(barra["borderTopColor"]).toBeTruthy();
  });

  it("não reserva mais espaço no fim da rolagem para um menu que não flutua", async () => {
    const cena = (await montarAsAbas())["sceneStyle"] as Record<string, unknown>;

    expect(cena["paddingBottom"]).toBeUndefined();
  });
});

describe("a segunda pista do item ativo", () => {
  /*
    Desenha o ícone da aba de tarefas no estado pedido e devolve o estilo da
    peça de fundo.

    O resultado do `render` é usado direto, e não o `screen`: são duas árvores
    na mesma execução (o layout inteiro, para chegar às opções das abas, e
    depois só o ícone), e `screen` continua apontando para a primeira. O
    `await` não é enfeite: nesta versão da biblioteca `render` devolve promessa,
    e sem ele o que volta é a promessa, sem consulta nenhuma dentro.
  */
  async function estiloDaPilula(focado: boolean): Promise<Record<string, number | string>> {
    const abas = await montarAsAbas();
    const tarefas = mockNavegador.telas.find((t) => t.name === "index");
    if (!tarefas?.options) throw new Error("a aba de tarefas sumiu do menu");
    const desenhar = tarefas.options["tabBarIcon"] as (p: {
      color: string; focused: boolean; size: number;
    }) => React.JSX.Element;
    const cor = String(abas["tabBarActiveTintColor"]);
    const tela = await render(desenhar({ color: cor, focused: focado, size: icone.rotulo }));
    const peca = tela.getByTestId(focado ? "pilula-da-aba-ativa" : "pilula-da-aba");
    return peca.props.style as Record<string, number | string>;
  }

  it("a aba aberta tem uma pílula preenchida atrás do ícone, e não só cor", async () => {
    const estilo = await estiloDaPilula(true);

    expect(estilo["backgroundColor"]).not.toBe("transparent");
    expect(estilo["borderRadius"]).toBe(raio.pilula);
  });

  it("a aba fechada não tem pílula nenhuma, senão a pista não distingue nada", async () => {
    const estilo = await estiloDaPilula(false);

    expect(estilo["backgroundColor"]).toBe("transparent");
  });

  it("a pílula cabe na barra do sistema, com o rótulo junto", async () => {
    const estilo = await estiloDaPilula(true);

    /*
      A conta: o sistema dá 49 pontos mais a área segura, o item gasta 5 de
      recuo em cima e embaixo, e o rótulo de 12 ocupa uns 15 com a entrelinha.
      Sobram 24 para a pílula. Maior que isso, ela não some: empurra o rótulo
      para fora da barra, e o rótulo é obrigatório neste aplicativo.
    */
    expect(estilo["height"]).toBeLessThanOrEqual(icone.acao);
  });
});

describe("a passagem de uma tela para outra", () => {
  it("a troca de aba desliza na direção da aba, com duração de token", async () => {
    const abas = await montarAsAbas();

    expect(abas["animation"]).toBe("shift");
    const spec = abas["transitionSpec"] as { animation: string; config: { duration: number } };
    expect(spec.animation).toBe("timing");
    /* Token, e não número: é o que faz o menu ter o mesmo ritmo do resto. */
    expect(spec.config.duration).toBe(movimento.respostaAoToque);
  });

  it("entrar e sair da conta atravessam por opacidade, e não deslizando", async () => {
    const pilha = await montarARaiz();

    /* Deslizar sugere que a tela de entrar continua ali do lado, a um gesto de
       voltar. Ela não continua: é troca de mundo, não navegação lateral. */
    expect(pilha["animation"]).toBe("fade");
    /* O padrão do iOS para `fade` é 500 ms, e meio segundo entre tocar
       "Entrar" e ver a lista parece toque que não pegou. */
    expect(pilha["animationDuration"]).toBe(movimento.mudancaDeEstado);
  });

  it("com redução de movimento ligada, nenhuma das duas anima", async () => {
    reducaoLigada = true;

    const abas = await montarAsAbas();
    expect(abas["animation"]).toBe("none");
    /* Sem especificação junto: mandar duração com a animação desligada
       sugeriria que ainda existe animação, só que instantânea. */
    expect(abas["transitionSpec"]).toBeUndefined();

    const pilha = await montarARaiz();
    expect(pilha["animation"]).toBe("none");
  });
});
