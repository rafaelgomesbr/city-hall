import { AccessibilityInfo, Animated } from "react-native";
import { act, fireEvent, render, renderHook, within } from "@testing-library/react-native";

/**
 * O MENU DE VIDRO, e a passagem de uma tela para outra.
 *
 * O pedido, na letra de quem paga: "volta pro menu flutuante, vidro e bonito,
 * se baseia em Nubank, BB, Instagram. Bonito, animado, suave e responsivo.
 * Capricha nesse menu, o perfil em destaque pra dar a entender que é pra
 * clicar. Eu imaginei ele arredondado com o avatar de perfil bonito."
 *
 * ## O que este arquivo media antes, e o que mede agora
 *
 * Este arquivo se chamava `menu-colado-e-transicoes` e congelava o desenho
 * COLADO: item de `toque + inset` de altura, `paddingBottom` do item pagando a
 * área segura, destaque de ponta a ponta. Aquele desenho morreu, mas o que
 * cada caso protegia não morreu, e cada um reaparece aqui medido no desenho
 * novo:
 *
 * - "a área segura é recuo do item, e não um vão" virou "a área segura é
 *   recuo da MOLDURA, e a pílula inteira fica acima dela";
 * - "o item ocupa o alvo de toque mais a área segura" virou "o item declara o
 *   alvo de toque como altura mínima, e a área segura não é dele";
 * - "o destaque cobre o item de ponta a ponta" virou "o indicador desliza até
 *   o item aberto, e some quando nenhuma aba está aberta";
 * - "a conta da altura fecha em cima do token" continua, com a conta nova
 *   (o rosto do Perfil é o item mais alto e decide a pílula);
 * - "estado comunicado só por cor" continua igual: o indicador é pista de
 *   FORMA, e `accessibilityState.selected` é a pista falada.
 *
 * E os quatro defeitos da barra flutuante de 28/08 ganharam caso próprio, um
 * a um: (a) a altura é MEDIDA e informada ao navegador; (b) `left`, `right` e
 * `bottom` são nossos; (c) a elevação inteira, sem fio de barra; (d) o recuo
 * da cena sai de `useRecuoDoMenu()`, que lê a altura medida.
 *
 * ## A barra é desenhada de verdade, e o navegador é contado
 *
 * O dublê de `Tabs` guarda as opções, chama o `tabBar` que o layout passou com
 * um estado montado a partir das `Tabs.Screen` declaradas, e CONTA quantas
 * vezes foi desenhado. Essa contagem é a prova da correção da aba escura pelo
 * lado do layout: a fila e o sino avisam, a barra se redesenha, e o navegador
 * não é desenhado de novo. A outra metade da prova, contra o navegador de
 * verdade, está em `a-aba-nao-fica-escura.test.tsx`.
 *
 * O limite continua declarado: altura final em pontos de tela vem de medição
 * de aparelho, que não existe aqui. O que se prova é a conta e o que ela
 * produz no leiaute, não o pixel.
 */

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => mockEsquema,
}));

/** A janela do aparelho: um iPhone de 6,1 polegadas, salvo quando o caso diz. */
let mockJanela = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true, default: () => mockJanela,
}));

type Opcoes = Record<string, unknown>;

/*
  O nome começa com `mock` porque é a única forma de o jest deixar a fábrica de
  `jest.mock`, que é içada para o topo do arquivo, enxergar a variável.
*/
const mockNavegador: {
  abas: Opcoes | null;
  telas: { name: string; options?: Opcoes }[];
  pilha: Opcoes | null;
  barra: ((props: Record<string, unknown>) => React.ReactNode) | null;
  /** Quantas vezes o navegador foi desenhado: é o que a aba escura mede. */
  renderizacoes: number;
} = { abas: null, telas: [], pilha: null, barra: null, renderizacoes: 0 };

/** Qual aba está aberta quando a barra é desenhada. */
let mockRotaAberta = "index";

/** A área segura do aparelho: iPhone com faixa inicial. */
let mockMargens = { top: 47, bottom: 34, left: 0, right: 0 };

const mockNavegacao = {
  emit: jest.fn(() => ({ defaultPrevented: false })),
  navigate: jest.fn(),
};

/** O que a barra informa ao navegador sobre a própria altura. */
const mockAvisarAltura = jest.fn();

/** O identificador da ocorrência que a tela de vistoria está editando. */
const ID_DA_VISTORIA = "3f1c6c4e-0a1b-4c2d-8e3f-000000000001";

jest.mock("expo-router", () => {
  const reagir = require("react") as typeof import("react");
  const { BottomTabBarHeightCallbackContext } = require(
    "expo-router/build/react-navigation/bottom-tabs",
  ) as typeof import("expo-router/build/react-navigation/bottom-tabs");

  /**
   * A barra, montada com o estado que as `Tabs.Screen` acabaram de declarar.
   *
   * Ela é irmã dos filhos e vem DEPOIS deles de propósito: o React renderiza
   * irmãos em ordem, então quando esta chega, `mockNavegador.telas` já tem
   * todas as abas.
   */
  const BarraMontada = (): React.ReactNode => {
    const desenhar = mockNavegador.barra;
    if (!desenhar) return null;

    const porNome = new Map<string, Opcoes>();
    for (const t of mockNavegador.telas) porNome.set(t.name, t.options ?? {});

    const nomes = [...porNome.keys()];
    const routes = nomes.map((name) => ({
      key: `chave-${name}`,
      name,
      params: name === "vistoria/[id]" ? { id: ID_DA_VISTORIA } : undefined,
    }));
    /*
      O ATALHO `href` É RESOLVIDO AQUI, como o expo-router resolve: `href: null`
      vira `tabBarItemStyle: { display: "none" }` (ver
      `expo-router/build/layouts/TabsClient.js`). Um dublê que entregasse
      `href: null` cru faria a barra ser medida contra uma entrada que ela
      nunca recebe no aparelho.
    */
    const comHrefResolvido = (o: Opcoes): Opcoes => {
      if (!("href" in o)) return o;
      const { href, ...resto } = o;
      return href === null ? { ...resto, tabBarItemStyle: { display: "none" } } : resto;
    };
    const descriptors = Object.fromEntries(
      routes.map((r) => [r.key, { options: comHrefResolvido(porNome.get(r.name) ?? {}) }]),
    );
    const index = Math.max(0, nomes.indexOf(mockRotaAberta));

    return reagir.createElement(
      BottomTabBarHeightCallbackContext.Provider,
      { value: mockAvisarAltura },
      desenhar({
        state: {
          key: "abas", index, routeNames: nomes, routes,
          type: "tab", stale: false, history: [], preloadedRouteKeys: [],
        },
        descriptors,
        navigation: mockNavegacao,
        insets: mockMargens,
      }),
    );
  };

  const Tabs = (props: {
    screenOptions?: Opcoes;
    tabBar?: (props: Record<string, unknown>) => React.ReactNode;
    children?: unknown;
  }) => {
    mockNavegador.renderizacoes += 1;
    mockNavegador.abas = props.screenOptions ?? null;
    mockNavegador.barra = props.tabBar ?? null;
    return reagir.createElement(
      reagir.Fragment,
      null,
      props.children as never,
      reagir.createElement(BarraMontada),
    );
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
  useSafeAreaInsets: () => mockMargens,
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

/*
  O tema vem do PROVEDOR, e o provedor lê a preferência do disco. Aqui ela é
  sempre "acompanhar o sistema", e o sistema é o `useColorScheme` dublado
  acima: é o que faz `mockEsquema` decidir o tema da pílula inteira.
*/
jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

/*
  A fila, com quem assinou guardado: é assim que o teste a faz AVISAR depois
  de montada, como a fila de verdade faz quando a tela de envio monta.
*/
let mockResumo: Record<string, unknown> | null = null;
const mockOuvintesDaFila = new Set<(r: unknown) => void>();
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    assinar: (ouvinte: (r: unknown) => void) => {
      mockOuvintesDaFila.add(ouvinte);
      if (mockResumo) ouvinte(mockResumo);
      return () => mockOuvintesDaFila.delete(ouvinte);
    },
    drenar: async () => undefined,
  }),
  iniciarSincronizacaoContinua: () => () => undefined,
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }),
}));

/*
  O SINO, pela contagem que a barra lê. O gancho de verdade lê o disco
  (`contagem-de-avisos.test.tsx` o prova com SQLite de verdade); aqui ele é
  um dublê com estado, para o teste poder AVISAR depois de montado, que é o
  que a sincronização faz quando a tela de perfil monta. `textoDoCracha` é o
  de verdade: a barra não pode discordar do cabeçalho sobre o "+".
*/
let mockContagem = { porLer: 0, truncado: false, lida: true };
const mockOuvintesDoSino = new Set<(c: typeof mockContagem) => void>();
jest.mock("../dados/banco-local", () => ({
  bancoLocal: async () => { throw new Error("o menu não abre o banco"); },
}));
jest.mock("../dados/avisos", () => {
  const reagir = require("react") as typeof import("react");
  const real = jest.requireActual("../dados/avisos") as typeof import("../dados/avisos");
  return {
    textoDoCracha: real.textoDoCracha,
    fraseDoSino: real.fraseDoSino,
    useContagemDeAvisos: () => {
      const [contagem, setContagem] = reagir.useState(mockContagem);
      reagir.useEffect(() => {
        mockOuvintesDoSino.add(setContagem);
        return () => { mockOuvintesDoSino.delete(setContagem); };
      }, []);
      return contagem;
    },
  };
});

/*
  O RASCUNHO, que é como a barra descobre que há vistoria começada. Existir
  linha no disco quer dizer que o agente preencheu alguma coisa.
*/
let mockTemRascunho = false;
const mockLerRascunho = jest.fn(async (ocorrenciaId: string) =>
  (mockTemRascunho ? { ocorrenciaId } : null));
jest.mock("../dados/rascunho", () => ({
  lerRascunho: (id: string) => mockLerRascunho(id),
}));

/*
  A sessão é UM objeto por caso, e não um novo por renderização: o de verdade
  é memoizado (`ProvedorDeSessao`), e quem assina a fila reassina quando a
  identidade muda. Um dublê que devolvesse identidade nova a cada quadro
  faria a barra reassinar a cada redesenho, e a reassinatura reentregaria o
  resumo velho por cima do aviso novo, que é um defeito do dublê e não do
  produto.
*/
let mockNome = "Joana da Silva Prado";
let mockSessao: Record<string, unknown> = {};
function construirSessao(nome: string): Record<string, unknown> {
  return {
    carregando: false,
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: {
      nome,
      papel: "agente_campo",
      matricula: "0001",
      organizacaoId: "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
  };
}
jest.mock("../dados/sessao", () => ({
  ProvedorDeSessao: ({ children }: { children: unknown }) => children,
  useSessao: () => mockSessao,
}));

import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import LayoutDoAgente from "../app/(agente)/_layout";
import Raiz from "../app/_layout";
import { ProvedorDeTema } from "../ui/componentes";
import {
  ALTURA_MINIMA_DA_PILULA, AvatarDoAgente, DIAMETRO_DO_AVATAR, INTENSIDADE_DO_VIDRO,
  LARGURA_MAXIMA_DA_PILULA, RECUO_DO_FUNDO, RECUO_LATERAL, VIDRO_DISPONIVEL,
  alturaDeReservaDoMenu, useRecuoDoMenu,
} from "../ui/BarraDeAbas";
import {
  borda, elevacao, espaco, icone, linha, movimento, opacidade, raio, temaClaro, temaEscuro, toque,
} from "../ui/tokens";

let reducaoLigada = false;

beforeEach(() => {
  mockNavegador.abas = null;
  mockNavegador.telas = [];
  mockNavegador.pilha = null;
  mockNavegador.barra = null;
  mockNavegador.renderizacoes = 0;
  mockEsquema = "light";
  mockJanela = { width: 390, height: 844, scale: 3, fontScale: 1 };
  mockContagem = { porLer: 0, truncado: false, lida: true };
  mockOuvintesDoSino.clear();
  mockResumo = null;
  mockOuvintesDaFila.clear();
  mockRotaAberta = "index";
  mockMargens = { top: 47, bottom: 34, left: 0, right: 0 };
  mockTemRascunho = false;
  mockNome = "Joana da Silva Prado";
  mockSessao = construirSessao(mockNome);
  reducaoLigada = false;
  mockNavegacao.emit.mockClear();
  mockNavegacao.navigate.mockClear();
  mockAvisarAltura.mockClear();
  mockLerRascunho.mockClear();
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(async () => reducaoLigada);
});

afterEach(() => { jest.restoreAllMocks(); });

type Tela = Awaited<ReturnType<typeof render>>;

/*
  `act` assíncrono porque a barra lê promessas antes de saber o que desenhar
  (a fila, a redução de movimento). O resultado do `render` é devolvido, e não
  o `screen`: vários casos montam duas árvores na mesma execução.
*/
async function montarOAplicativo(): Promise<Tela> {
  let tela: Tela | null = null;
  await act(async () => { tela = (await render(<LayoutDoAgente />, { wrapper: ProvedorDeTema })) as Tela; });
  if (!tela) throw new Error("o layout do agente não montou");
  return tela;
}

async function montarAsAbas(): Promise<Opcoes> {
  await montarOAplicativo();
  if (!mockNavegador.abas) throw new Error("o layout do agente não montou as abas");
  return mockNavegador.abas;
}

async function montarARaiz(): Promise<Opcoes> {
  await act(async () => { await render(<Raiz />); });
  if (!mockNavegador.pilha) throw new Error("a raiz não montou a pilha");
  return mockNavegador.pilha;
}

/** As opções da ÚLTIMA renderização de cada aba, pelo nome da rota. */
function ultimasOpcoes(): Map<string, Opcoes> {
  const porNome = new Map<string, Opcoes>();
  for (const t of mockNavegador.telas) porNome.set(t.name, t.options ?? {});
  return porNome;
}

/**
 * O estilo resolvido de um nó, com os arranjos achatados.
 *
 * `Tocavel` entrega ao `Pressable` uma lista (`[estilo, { opacity, transform }]`),
 * e ler `props.style[0]` deixaria o portão preso à ordem interna de outra peça.
 */
function estiloDe(no: { props: { style?: unknown } }): Record<string, unknown> {
  const junto: Record<string, unknown> = {};
  const empilhar = (valor: unknown) => {
    if (Array.isArray(valor)) { valor.forEach(empilhar); return; }
    if (valor && typeof valor === "object") Object.assign(junto, valor);
  };
  empilhar(no.props.style);
  return junto;
}

/**
 * Consulta que ENXERGA o que está escondido do leitor de tela.
 *
 * O crachá e o rosto do Perfil declaram `accessibilityElementsHidden` de
 * propósito: quem anuncia aquele item é o `accessibilityLabel` do tocável
 * inteiro. Sem esta porta, "não há crachá" e "há crachá escondido" seriam a
 * mesma resposta.
 */
function achar(tela: Tela, id: string) {
  return tela.getByTestId(id, { includeHiddenElements: true });
}

function talvez(tela: Tela, id: string) {
  return tela.queryByTestId(id, { includeHiddenElements: true });
}

type No = { children: (No | string)[] };

/** O texto que um nó desenha, juntando os pedaços. */
function textoDe(no: unknown): string {
  const pedacos: string[] = [];
  const andar = (atual: No) => {
    for (const filho of atual.children) {
      if (typeof filho === "string") pedacos.push(filho);
      else andar(filho);
    }
  };
  andar(no as No);
  return pedacos.join("");
}

/** A linha de itens acaba de ser medida: é o que faz o indicador existir. */
async function medirALinha(tela: Tela, largura: number): Promise<void> {
  await act(async () => {
    fireEvent(tela.getByTestId("linha-de-itens"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: largura, height: 60 } },
    });
  });
}

/** Quantos itens a pílula mostra. */
const ITENS = 4;

/**
 * Os props que o `BlurView` entrega à vista nativa (`ExpoBlurView`).
 *
 * O `BlurView` é um `View` com a vista nativa dentro: `intensity` e `tint`
 * moram no filho, e é o filho que o aparelho desenha.
 */
function desfoqueNativo(tela: Tela): { intensity: number; tint: string } {
  const embrulho = tela.getByTestId("vidro-do-menu");
  const filho = embrulho.children[0] as unknown as { props: { intensity: number; tint: string } };
  return filho.props;
}

describe("o topo não cobra a área segura duas vezes", () => {
  /*
    O RECLAME anterior: "o header ali onde fica fila de envio, minhas tarefas
    tá muito testudo". Era uma conta paga duas vezes: o `_layout` aplica
    `paddingTop: margens.top`, e o cabeçalho do React Navigation soma o MESMO
    recuo por conta própria quando não há cabeçalho pai.
  */
  it("o cabeçalho não soma a área segura que o layout já pagou", async () => {
    const opcoes = await montarAsAbas();

    expect(opcoes["headerStatusBarHeight"]).toBe(0);
  });
});

describe("os quatro itens da pílula", () => {
  it("são Tarefas, Mapa, Envio e Perfil, nesta ordem", async () => {
    const tela = await montarOAplicativo();

    const rotulos = tela.getAllByTestId(/^rotulo-da-aba-/).map(textoDe);
    expect(rotulos).toEqual(["Tarefas", "Mapa", "Envio", "Perfil"]);
  });

  /*
    A ordem no JSX não é gosto: o `shift` tira a DIREÇÃO da deslizada da
    posição da aba no estado. Com a vistoria declarada por último, ela sempre
    entra pela direita.
  */
  it("a vistoria continua sendo a última rota declarada, e fora da barra", async () => {
    const tela = await montarOAplicativo();

    const declaradas = [...ultimasOpcoes().keys()];
    expect(declaradas[declaradas.length - 1]).toBe("vistoria/[id]");
    expect(ultimasOpcoes().get("vistoria/[id]")?.["href"]).toBeNull();
    expect(tela.queryByTestId("aba-vistoria/[id]")).toBeNull();
  });

  it("nenhuma tela esconde mais a barra", async () => {
    await montarAsAbas();

    const escondem = [...ultimasOpcoes()]
      .filter(([, o]) => o["tabBarStyle"] !== undefined)
      .map(([nome]) => nome);
    expect(escondem).toEqual([]);
  });

  /*
    Opção que o navegador não lê mais é opção que mente: com `tabBar`
    próprio, quem desenha é `BarraDeAbas`.
  */
  it("não sobrou opção de desenho endereçada à barra padrão", async () => {
    const opcoes = await montarAsAbas();

    for (const morta of [
      "tabBarStyle", "tabBarItemStyle",
      "tabBarActiveBackgroundColor", "tabBarInactiveBackgroundColor",
      "tabBarLabelStyle", "tabBarActiveTintColor", "tabBarInactiveTintColor",
    ]) {
      if (opcoes[morta] !== undefined) {
        throw new Error(
          `${morta} continua declarada em screenOptions, e a barra padrão não `
          + "desenha mais nada. Quem desenha é ui/BarraDeAbas.tsx.",
        );
      }
    }
  });

  /*
    Os crachás deixaram de vir pelas opções das telas: quem os calcula é a
    barra, lendo a fila e o sino. Uma opção `tabBarBadge` sobrando no layout
    seria um segundo número para a mesma pergunta.
  */
  it("nenhuma tela declara crachá nem frase falada: isso é da barra agora", async () => {
    await montarAsAbas();

    for (const [nome, o] of ultimasOpcoes()) {
      expect({ nome, cracha: o["tabBarBadge"], frase: o["tabBarAccessibilityLabel"] })
        .toEqual({ nome, cracha: undefined, frase: undefined });
    }
  });
});

describe("a pílula paira, e cada defeito de 28/08 tem o seu caso", () => {
  /*
    (b) `left` e `right` eram ignorados porque eram opções da barra padrão.
    Agora a moldura é nossa: absoluta, colada nas três bordas, e a pílula
    dentro dela recua dos lados pelo token.
  */
  it("(b) a moldura é absoluta nas três bordas, e a pílula recua dos lados", async () => {
    const tela = await montarOAplicativo();

    const moldura = estiloDe(tela.getByTestId("barra-de-abas"));
    expect(moldura["position"]).toBe("absolute");
    expect(moldura["left"]).toBe(0);
    expect(moldura["right"]).toBe(0);
    expect(moldura["bottom"]).toBe(0);
    expect(moldura["paddingHorizontal"]).toBe(RECUO_LATERAL);

    const pilula = estiloDe(tela.getByTestId("pilula-do-menu"));
    expect(pilula["width"]).toBe(mockJanela.width - 2 * RECUO_LATERAL);
    expect(pilula["borderRadius"]).toBe(raio.pilula);
  });

  /*
    (a) A altura era escrita à mão e atropelava a conta do sistema. Agora a
    moldura MEDE a própria altura e a informa ao navegador, e ninguém declara
    `height` em lugar nenhum.
  */
  it("(a) a moldura mede a própria altura e a informa ao navegador", async () => {
    const tela = await montarOAplicativo();

    await act(async () => {
      fireEvent(tela.getByTestId("barra-de-abas"), "layout", {
        nativeEvent: { layout: { x: 0, y: 700, width: 390, height: 108 } },
      });
    });

    expect(mockAvisarAltura).toHaveBeenCalledWith(108);
  });

  it("(a) nada tem altura fixa: pílula e itens declaram só o mínimo", async () => {
    const tela = await montarOAplicativo();

    expect(estiloDe(tela.getByTestId("pilula-do-menu"))["height"]).toBeUndefined();
    for (const nome of ["index", "mapa", "fila", "perfil"]) {
      const item = estiloDe(tela.getByTestId(`aba-${nome}`));
      expect(item["height"]).toBeUndefined();
      expect(item["minHeight"]).toBe(toque);
    }
  });

  /*
    A área segura é recuo da MOLDURA, e não do item: a pílula inteira fica
    acima dela, mais o recuo do fundo. O item não paga nada.
  */
  it("a área segura é recuo da moldura, e a pílula inteira fica acima dela", async () => {
    const tela = await montarOAplicativo();

    const moldura = estiloDe(tela.getByTestId("barra-de-abas"));
    expect(moldura["paddingBottom"]).toBe(mockMargens.bottom + RECUO_DO_FUNDO);

    const item = estiloDe(tela.getByTestId("aba-index"));
    expect(item["paddingBottom"]).toBeUndefined();
    expect(item["paddingVertical"]).toBe(espaco.e1);
  });

  /*
    Aparelho sem barra de gestos: a área segura de baixo é zero, e a pílula
    recua só o token. É o caso que prova que o número sai da CONTA.
  */
  it("sem área segura, a pílula recua só o recuo do fundo", async () => {
    mockMargens = { top: 24, bottom: 0, left: 0, right: 0 };
    const tela = await montarOAplicativo();

    expect(estiloDe(tela.getByTestId("barra-de-abas"))["paddingBottom"]).toBe(RECUO_DO_FUNDO);
  });

  /*
    (c) O fio estava desligado: flutuante não precisa de fio, precisa de
    ELEVAÇÃO. A pílula veste `elevacao(tema).flutuante` inteira (sombra,
    contorno e, onde não há vidro, o fundo), e não existe fio de barra.
  */
  it("(c) a pílula veste a elevação flutuante inteira, e não um fio de barra", async () => {
    const tela = await montarOAplicativo();

    const pilula = estiloDe(tela.getByTestId("pilula-do-menu"));
    const flutuante = elevacao(temaClaro).flutuante;
    expect(pilula["shadowColor"]).toBe(flutuante.shadowColor);
    expect(pilula["shadowOpacity"]).toBe(flutuante.shadowOpacity);
    expect(pilula["shadowRadius"]).toBe(flutuante.shadowRadius);
    expect(pilula["shadowOffset"]).toEqual(flutuante.shadowOffset);
    expect(pilula["elevation"]).toBe(flutuante.elevation);
    expect(pilula["borderWidth"]).toBe(flutuante.borderWidth);
    expect(pilula["borderColor"]).toBe(flutuante.borderColor);
    expect(pilula["borderTopWidth"]).toBeUndefined();
  });

  /*
    (d) O `paddingBottom` da cena era medido por ninguém. Agora a cena não
    recebe recuo nenhum: quem reserva é cada tela, com `useRecuoDoMenu()`,
    que lê a altura MEDIDA pelo navegador.
  */
  it("(d) a cena não recebe recuo nenhum do layout", async () => {
    const opcoes = await montarAsAbas();

    const cena = opcoes["sceneStyle"] as Record<string, unknown>;
    expect(cena["paddingBottom"]).toBeUndefined();
    expect(Object.keys(cena)).toEqual(["backgroundColor"]);
  });

  it("(d) useRecuoDoMenu lê a altura medida pelo navegador, mais um respiro", async () => {
    const { result } = await renderHook(() => useRecuoDoMenu(), {
      wrapper: ({ children }) => (
        <BottomTabBarHeightContext.Provider value={108}>{children}</BottomTabBarHeightContext.Provider>
      ),
    });

    expect(result.current).toBe(108 + espaco.e3);
  });

  /*
    Fora de uma cena do navegador o contexto não existe, e o gancho não pode
    estourar: cai na conta do cabeçalho com a área segura do aparelho.
  */
  it("(d) sem o contexto do navegador, useRecuoDoMenu cai na conta da reserva", async () => {
    const { result } = await renderHook(() => useRecuoDoMenu());

    expect(result.current).toBe(alturaDeReservaDoMenu(mockMargens.bottom) + espaco.e3);
    expect(alturaDeReservaDoMenu(34)).toBe(ALTURA_MINIMA_DA_PILULA + RECUO_DO_FUNDO + 34);
  });

  /*
    A CONTA, refeita aqui contra os tokens em vez de confiar no comentário.

    O rosto do Perfil é o item mais alto (32 contra 24 do pictograma) e é ele
    que decide a pílula. Nenhum item fica abaixo do alvo de toque, e a pílula
    inteira cabe na conta: rosto, folga, rótulo, respiro e contorno.
  */
  it("a conta da altura fecha em cima dos tokens, com o rosto do Perfil mandando", () => {
    expect(DIAMETRO_DO_AVATAR).toBe(icone.acao + 2 * (borda.enfase + 2));
    expect(DIAMETRO_DO_AVATAR).toBeGreaterThan(icone.acao);

    const conteudoDoPerfil = DIAMETRO_DO_AVATAR + espaco.e1 + linha.legenda;
    expect(ALTURA_MINIMA_DA_PILULA).toBe(conteudoDoPerfil + 2 * espaco.e1 + 2 * borda.fio);
    /* O item, sem o contorno da pílula, nunca fica abaixo do alvo de toque. */
    expect(ALTURA_MINIMA_DA_PILULA - 2 * borda.fio).toBeGreaterThanOrEqual(toque);
  });

  /*
    RESPONSIVO: no tablet a pílula para de crescer e centraliza, em vez de
    virar uma régua de 700 pontos com quatro palavras perdidas nas pontas.
  */
  it("no tablet a pílula para na largura máxima e centraliza", async () => {
    mockJanela = { width: 1024, height: 768, scale: 2, fontScale: 1 };
    const tela = await montarOAplicativo();

    expect(estiloDe(tela.getByTestId("pilula-do-menu"))["width"]).toBe(LARGURA_MAXIMA_DA_PILULA);
    expect(estiloDe(tela.getByTestId("barra-de-abas"))["alignItems"]).toBe("center");
    expect(LARGURA_MAXIMA_DA_PILULA).toBe(toque * 8);
  });
});

describe("o vidro", () => {
  /*
    No iOS o `BlurView` desfoca de verdade. Por cima dele, o VÉU: o fundo de
    `elevacao(tema).flutuante` em opacidade parcial, para o texto ter contraste
    sobre qualquer conteúdo que passe por baixo. A pílula fica transparente
    para o desfoque enxergar a lista, e não a própria pílula.
  */
  it("no iOS a pílula é vidro: desfoque com a tinta do tema e véu com o fundo da elevação", async () => {
    expect(VIDRO_DISPONIVEL).toBe(true);
    const tela = await montarOAplicativo();

    const vidro = desfoqueNativo(tela);
    expect(vidro.intensity).toBe(INTENSIDADE_DO_VIDRO);
    expect(vidro.tint).toBe("light");

    const veu = estiloDe(tela.getByTestId("veu-do-vidro"));
    expect(veu["backgroundColor"]).toBe(elevacao(temaClaro).flutuante.backgroundColor);
    expect(veu["opacity"]).toBe(opacidade.veu);

    expect(estiloDe(tela.getByTestId("pilula-do-menu"))["backgroundColor"]).toBe("transparent");
  });

  it("no tema escuro, a tinta do vidro e o véu escurecem juntos", async () => {
    mockEsquema = "dark";
    const tela = await montarOAplicativo();

    expect(desfoqueNativo(tela).tint).toBe("dark");
    expect(estiloDe(tela.getByTestId("veu-do-vidro"))["backgroundColor"])
      .toBe(elevacao(temaEscuro).flutuante.backgroundColor);
  });

  /*
    Quem recorta é a camada de dentro, e não a pílula: recortar a pílula
    recortaria a sombra dela junto, e a elevação sumiria no claro.
  */
  it("o recorte arredondado fica na camada do vidro, e a sombra fica de fora", async () => {
    const tela = await montarOAplicativo();

    const recorte = estiloDe(tela.getByTestId("recorte-do-vidro"));
    expect(recorte["overflow"]).toBe("hidden");
    expect(recorte["borderRadius"]).toBe(raio.pilula);
    expect(estiloDe(tela.getByTestId("pilula-do-menu"))["overflow"]).toBeUndefined();
  });

  /*
    Onde não há vidro (Android, por hoje), a reserva é a elevação inteira,
    opaca: mesma forma, mesma sombra, e o fundo do token no lugar do véu.
  */
  it("sem vidro, a pílula é a reserva opaca da elevação", () => {
    /*
      Num registro de módulos isolado, para o `Platform` trocado não vazar
      para os outros casos: a decisão é tomada quando o módulo carrega.
    */
    let vidroNoAndroid: boolean | null = null;
    jest.isolateModules(() => {
      const { Platform: PlataformaIsolada } = require("react-native") as typeof import("react-native");
      PlataformaIsolada.OS = "android";
      vidroNoAndroid = (require("../ui/BarraDeAbas") as typeof import("../ui/BarraDeAbas")).VIDRO_DISPONIVEL;
    });

    expect(vidroNoAndroid).toBe(false);
  });
});

describe("o indicador que desliza", () => {
  /*
    A regra da casa não mudou com o vidro: nada se comunica só por cor. A
    palavra é a mesma aberta ou fechada, então sem o bloco a única diferença
    seria o violeta. O bloco é pista de FORMA, e é um só: ele desliza até o
    item aberto em vez de nascer e morrer em cada item.
  */
  it("existe um indicador só, e ele fica atrás do item aberto", async () => {
    mockRotaAberta = "fila";
    const tela = await montarOAplicativo();
    expect(tela.queryByTestId("indicador-da-aba")).toBeNull();

    await medirALinha(tela, 358);

    const indicadores = tela.getAllByTestId("indicador-da-aba");
    expect(indicadores).toHaveLength(1);
    const indicador = estiloDe(indicadores[0]!);
    const larguraDoItem = 358 / ITENS;
    expect(indicador["width"]).toBe(larguraDoItem - 2 * espaco.e1);
    expect(indicador["borderRadius"]).toBe(raio.pilula);
    expect(indicador["backgroundColor"]).toBe(temaClaro.superficie2);
    /* Envio é o terceiro item: o bloco nasce deslocado de dois itens. */
    const transformacao = indicador["transform"] as { translateX: number }[];
    expect(transformacao[0]?.translateX).toBe(2 * larguraDoItem);
    expect(indicador["opacity"]).toBe(1);
  });

  /*
    No escuro a pílula já veste `superficie2` (o que sobe clareia), então o
    bloco precisa ser o OUTRO degrau neutro, senão some. Os dois pares
    (destaque sobre superficie2, destaque sobre superficie) são medidos pelo
    portão de acessibilidade.
  */
  it("no escuro o indicador é o degrau neutro vizinho da pílula", async () => {
    mockEsquema = "dark";
    const tela = await montarOAplicativo();
    await medirALinha(tela, 358);

    expect(estiloDe(tela.getByTestId("indicador-da-aba"))["backgroundColor"])
      .toBe(temaEscuro.superficie);
  });

  it("dentro da vistoria, nenhuma aba está aberta e o indicador some", async () => {
    mockRotaAberta = "vistoria/[id]";
    const tela = await montarOAplicativo();
    await medirALinha(tela, 358);

    expect(estiloDe(tela.getByTestId("indicador-da-aba"))["opacity"]).toBe(0);
  });

  /*
    A troca de aba anima o bloco com duração e curva de token, no motor
    nativo: o dedo não pode esperar o JavaScript, que pode estar drenando a
    fila.
  */
  it("trocar de aba desliza o indicador com duração de token, no motor nativo", async () => {
    const tela = await montarOAplicativo();
    await medirALinha(tela, 358);
    const espia = jest.spyOn(Animated, "timing");

    mockRotaAberta = "perfil";
    await act(async () => { tela.rerender(<LayoutDoAgente />); });

    const deslizadas = espia.mock.calls
      .map((chamada) => chamada[1] as { duration?: number; useNativeDriver?: boolean; toValue?: number })
      .filter((config) => config.duration === movimento.mudancaDeEstado);
    expect(deslizadas.length).toBeGreaterThanOrEqual(2);
    expect(deslizadas.every((c) => c.useNativeDriver === true)).toBe(true);
    /* Perfil é o quarto item: o bloco vai para a posição 3. */
    expect(deslizadas.some((c) => c.toValue === 3)).toBe(true);
  });

  it("com redução de movimento, o indicador pula sem animar", async () => {
    reducaoLigada = true;
    const tela = await montarOAplicativo();
    await medirALinha(tela, 358);
    const espia = jest.spyOn(Animated, "timing");

    mockRotaAberta = "perfil";
    await act(async () => { tela.rerender(<LayoutDoAgente />); });
    /*
      A segunda passagem existe para LER: `setValue` num valor nativo não
      redesenha a vista pelo JavaScript (quem move é a camada nativa), então o
      estilo que o teste enxerga é o da renderização seguinte, calculado do
      valor que o `setValue` acabou de escrever.
    */
    await act(async () => { tela.rerender(<LayoutDoAgente />); });

    expect(espia).not.toHaveBeenCalled();
    const larguraDoItem = 358 / ITENS;
    const transformacao = estiloDe(tela.getByTestId("indicador-da-aba"))["transform"] as
      { translateX: number }[];
    expect(transformacao[0]?.translateX).toBe(3 * larguraDoItem);
  });

  it("o leitor de tela recebe a mesma informação, como estado de selecionado", async () => {
    mockRotaAberta = "perfil";
    const tela = await montarOAplicativo();

    expect(tela.getByTestId("aba-perfil").props.accessibilityState.selected).toBe(true);
    expect(tela.getByTestId("aba-index").props.accessibilityState.selected).toBe(false);
  });
});

describe("o Perfil é a pessoa, em destaque", () => {
  /*
    O rosto é maior que os pictogramas e tem ANEL: aberto, o anel é de
    destaque e o círculo se preenche; fechado, o anel é discreto. É o item que
    mais parece um botão, de propósito.
  */
  it("o rosto é maior que os ícones, com anel de ênfase na cor de destaque quando aberto", async () => {
    mockRotaAberta = "perfil";
    const tela = await montarOAplicativo();

    const rosto = estiloDe(achar(tela, "avatar-do-agente"));
    expect(rosto["width"]).toBe(DIAMETRO_DO_AVATAR);
    expect(rosto["height"]).toBe(DIAMETRO_DO_AVATAR);
    expect(rosto["borderWidth"]).toBe(borda.enfase);
    expect(rosto["borderColor"]).toBe(temaClaro.destaque);
    expect(estiloDe(achar(tela, "circulo-do-agente"))["backgroundColor"]).toBe(temaClaro.destaque);
  });

  it("fechado, o anel é discreto e o círculo é a superfície de apoio", async () => {
    const tela = await montarOAplicativo();

    expect(estiloDe(achar(tela, "avatar-do-agente"))["borderColor"]).toBe(temaClaro.borda);
    expect(estiloDe(achar(tela, "circulo-do-agente"))["backgroundColor"]).toBe(temaClaro.superficie2);
  });

  it("o círculo traz a primeira e a última inicial do nome", async () => {
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "iniciais-do-agente"))).toBe("JP");
  });

  it("nome de uma palavra só vira uma letra, e não um círculo vazio", async () => {
    mockNome = "Joana";
    mockSessao = construirSessao(mockNome);
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "iniciais-do-agente"))).toBe("J");
  });

  it("cadastro sem nome vira interrogação, e não um círculo em branco", async () => {
    mockNome = "   ";
    mockSessao = construirSessao(mockNome);
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "iniciais-do-agente"))).toBe("?");
  });

  /*
    A peça já aceita foto. O que não existe ainda é a foto: `identidade` não
    traz nenhuma. Este caso garante que a porta continua aberta.
  */
  it("quando houver foto, ela entra no lugar das iniciais", async () => {
    let tela: Tela | null = null;
    await act(async () => {
      tela = (await render(
        <AvatarDoAgente nome="Joana da Silva Prado" foto="file:///rosto.jpg" ativo={false} />,
      )) as Tela;
    });
    if (!tela) throw new Error("o avatar não montou");

    expect(achar(tela as Tela, "foto-do-agente").props.source)
      .toEqual({ uri: "file:///rosto.jpg" });
    expect(talvez(tela as Tela, "iniciais-do-agente")).toBeNull();
  });

  it("o crachá do sino fica sobre o rosto, dentro do item do Perfil", async () => {
    mockContagem = { porLer: 2, truncado: false, lida: true };
    const tela = await montarOAplicativo();

    const item = tela.getByTestId("aba-perfil");
    const cracha = within(item).getByTestId("cracha-perfil", { includeHiddenElements: true });
    expect(textoDe(cracha)).toBe("2");
    /* E o rosto está no mesmo item, ao lado do número. */
    expect(within(item).getByTestId("avatar-do-agente", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("os números e as frases, que agora a barra lê sozinha", () => {
  it("o crachá da fila conta o que ainda não chegou à coordenação", async () => {
    mockResumo = {
      pendentes: 2, enviando: 1, confirmados: 4, bloqueados: 1,
      deOutroAutor: 0, arquivados: 0, sincronizando: false,
    };
    const tela = await montarOAplicativo();

    /* As quatro confirmadas não entram: elas já chegaram lá. */
    expect(textoDe(achar(tela, "cracha-fila"))).toBe("4");
  });

  it("o rótulo falado da fila separa o que espera sinal do que precisa de atenção", async () => {
    mockResumo = {
      pendentes: 2, enviando: 1, confirmados: 4, bloqueados: 1,
      deOutroAutor: 0, arquivados: 0, sincronizando: false,
    };
    const tela = await montarOAplicativo();

    expect(tela.getByTestId("aba-fila").props.accessibilityLabel).toBe(
      "Envio, 4 na fila, 3 esperando envio, 1 com problema",
    );
  });

  it("a coleta de outro agente entra no número sem entrar na promessa", async () => {
    mockResumo = {
      pendentes: 0, enviando: 0, confirmados: 0, bloqueados: 0,
      deOutroAutor: 1, arquivados: 0, sincronizando: false,
    };
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "cracha-fila"))).toBe("1");
    expect(tela.getByTestId("aba-fila").props.accessibilityLabel).toBe(
      "Envio, 1 na fila, 1 de outro agente",
    );
  });

  it("sem nada esperando, não há crachá nenhum: número zero é ruído", async () => {
    const tela = await montarOAplicativo();

    expect(talvez(tela, "cracha-fila")).toBeNull();
    expect(talvez(tela, "cracha-perfil")).toBeNull();
    expect(tela.getByTestId("aba-fila").props.accessibilityLabel).toBe("Envio, nada esperando");
    expect(tela.getByTestId("aba-perfil").props.accessibilityLabel).toBe("Perfil");
  });

  it("o crachá do sino aparece no Perfil e é falado", async () => {
    mockContagem = { porLer: 3, truncado: false, lida: true };
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "cracha-perfil"))).toBe("3");
    expect(tela.getByTestId("aba-perfil").props.accessibilityLabel)
      .toBe("Perfil, 3 avisos por ler");
  });

  it("o sino trunca em 3+ quando a contagem bateu no teto do servidor", async () => {
    mockContagem = { porLer: 3, truncado: true, lida: true };
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "cracha-perfil"))).toBe("3+");
    expect(tela.getByTestId("aba-perfil").props.accessibilityLabel)
      .toBe("Perfil, mais de 3 avisos por ler");
  });

  it("o crachá do sino não usa a cor do crachá da fila, que conta outra coisa", async () => {
    mockContagem = { porLer: 1, truncado: false, lida: true };
    mockResumo = {
      pendentes: 1, enviando: 0, confirmados: 0, bloqueados: 0,
      deOutroAutor: 0, arquivados: 0, sincronizando: false,
    };
    const tela = await montarOAplicativo();

    const corDe = (id: string) => estiloDe(achar(tela, id))["backgroundColor"];
    expect(corDe("cracha-perfil")).not.toBe(corDe("cracha-fila"));
  });

  it("o crachá da fila muda de cor quando há item com problema", async () => {
    mockResumo = {
      pendentes: 1, enviando: 0, confirmados: 0, bloqueados: 0,
      deOutroAutor: 0, arquivados: 0, sincronizando: false,
    };
    const tela = await montarOAplicativo();
    const calmo = estiloDe(achar(tela, "cracha-fila"))["backgroundColor"];

    /* A fila AVISA, como avisa no aparelho quando um item é recusado. */
    await act(async () => {
      for (const ouvinte of mockOuvintesDaFila) {
        ouvinte({
          pendentes: 1, enviando: 0, confirmados: 0, bloqueados: 1,
          deOutroAutor: 0, arquivados: 0, sincronizando: false,
        });
      }
    });

    expect(estiloDe(achar(tela, "cracha-fila"))["backgroundColor"]).not.toBe(calmo);
  });

  it("todo item se apresenta ao leitor de tela com papel e rótulo", async () => {
    const tela = await montarOAplicativo();

    for (const nome of ["index", "mapa", "fila", "perfil"]) {
      const item = tela.getByTestId(`aba-${nome}`);
      expect(item.props.accessibilityRole).toBe("button");
      expect(typeof item.props.accessibilityLabel).toBe("string");
      expect(item.props.accessibilityLabel.length).toBeGreaterThan(0);
    }
  });

  it("tocar numa aba fechada avisa o navegador e navega para ela", async () => {
    const tela = await montarOAplicativo();

    await act(async () => { fireEvent.press(tela.getByTestId("aba-fila")); });

    expect(mockNavegacao.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tabPress", target: "chave-fila" }),
    );
    expect(mockNavegacao.navigate).toHaveBeenCalledWith("fila", undefined);
  });

  it("tocar na aba já aberta não navega de novo", async () => {
    const tela = await montarOAplicativo();

    await act(async () => { fireEvent.press(tela.getByTestId("aba-index")); });

    expect(mockNavegacao.navigate).not.toHaveBeenCalled();
  });
});

describe("a aba que ficava escura: o navegador não é redesenhado pelo uso", () => {
  /*
    A METADE DA PROVA que cabe a este arquivo. A outra, contra o navegador de
    verdade, está em `a-aba-nao-fica-escura.test.tsx`.

    O layout guardava o resumo da fila e a contagem do sino em estado, e cada
    aviso era um redesenho do PAI do navegador: descritores novos, animação da
    cena reiniciada, cena com opacidade zero. Aqui a fila avisa, o sino avisa,
    a barra se redesenha (o crachá muda), e o navegador é desenhado UMA vez.
  */
  it("quando a fila avisa, o crachá muda e o navegador continua desenhado uma vez só", async () => {
    const tela = await montarOAplicativo();
    expect(mockNavegador.renderizacoes).toBe(1);
    const opcoesAntes = mockNavegador.abas;

    await act(async () => {
      for (const ouvinte of mockOuvintesDaFila) {
        ouvinte({
          pendentes: 3, enviando: 0, confirmados: 0, bloqueados: 0,
          deOutroAutor: 0, arquivados: 0, sincronizando: false,
        });
      }
    });

    expect(textoDe(achar(tela, "cracha-fila"))).toBe("3");
    expect(mockNavegador.renderizacoes).toBe(1);
    expect(mockNavegador.abas).toBe(opcoesAntes);
  });

  it("quando o sino avisa, o crachá muda e o navegador continua desenhado uma vez só", async () => {
    const tela = await montarOAplicativo();
    expect(mockNavegador.renderizacoes).toBe(1);

    await act(async () => {
      for (const ouvinte of mockOuvintesDoSino) ouvinte({ porLer: 5, truncado: false, lida: true });
    });

    expect(textoDe(achar(tela, "cracha-perfil"))).toBe("5");
    expect(mockNavegador.renderizacoes).toBe(1);
  });

  /*
    Mesmo quando o layout se redesenha (troca de tema, rotação), o navegador
    recebe o MESMO objeto de opções e a MESMA função de barra: `useMemo` e
    função de módulo. Um objeto novo por redesenho seria um descritor novo.
  */
  it("um redesenho do layout entrega ao navegador as mesmas opções e a mesma barra", async () => {
    const tela = await montarOAplicativo();
    const opcoesAntes = mockNavegador.abas;
    const barraAntes = mockNavegador.barra;

    await act(async () => { tela.rerender(<LayoutDoAgente />); });

    expect(mockNavegador.abas).toBe(opcoesAntes);
    expect(mockNavegador.barra).toBe(barraAntes);
  });
});

describe("sair da vistoria começada pergunta antes", () => {
  /*
    A COMPENSAÇÃO da barra aparecer dentro da vistoria: tocar em outra aba com
    vistoria começada pergunta antes. Não é sobre PERDA (o rascunho está no
    disco desde o primeiro toque), é sobre ATENÇÃO.
  */
  it("tocar em outra aba abre a pergunta em vez de navegar", async () => {
    mockRotaAberta = "vistoria/[id]";
    mockTemRascunho = true;
    const tela = await montarOAplicativo();

    await act(async () => { fireEvent.press(tela.getByTestId("aba-index")); });

    expect(tela.getByTestId("dialogo-de-sair-da-vistoria")).toBeTruthy();
    expect(mockNavegacao.navigate).not.toHaveBeenCalled();
    expect(mockLerRascunho).toHaveBeenCalledWith(ID_DA_VISTORIA);
  });

  it("confirmar leva para a aba tocada", async () => {
    mockRotaAberta = "vistoria/[id]";
    mockTemRascunho = true;
    const tela = await montarOAplicativo();

    await act(async () => { fireEvent.press(tela.getByTestId("aba-mapa")); });
    await act(async () => { fireEvent.press(tela.getByTestId("dialogo-acao")); });

    expect(mockNavegacao.navigate).toHaveBeenCalledWith("mapa", undefined);
  });

  it("recusar mantém o agente na vistoria", async () => {
    mockRotaAberta = "vistoria/[id]";
    mockTemRascunho = true;
    const tela = await montarOAplicativo();

    await act(async () => { fireEvent.press(tela.getByTestId("aba-index")); });
    await act(async () => { fireEvent.press(tela.getByTestId("dialogo-recusa")); });

    expect(mockNavegacao.navigate).not.toHaveBeenCalled();
    expect(tela.queryByTestId("dialogo-de-sair-da-vistoria")).toBeNull();
  });

  it("vistoria aberta e não preenchida não pergunta nada", async () => {
    mockRotaAberta = "vistoria/[id]";
    mockTemRascunho = false;
    const tela = await montarOAplicativo();

    await act(async () => { fireEvent.press(tela.getByTestId("aba-index")); });

    expect(tela.queryByTestId("dialogo-de-sair-da-vistoria")).toBeNull();
    expect(mockNavegacao.navigate).toHaveBeenCalledWith("index", undefined);
  });

  it("fora da vistoria, o disco nem é consultado", async () => {
    const tela = await montarOAplicativo();

    await act(async () => { fireEvent.press(tela.getByTestId("aba-perfil")); });

    expect(mockLerRascunho).not.toHaveBeenCalled();
    expect(mockNavegacao.navigate).toHaveBeenCalledWith("perfil", undefined);
  });
});

describe("a passagem de uma tela para outra", () => {
  it("a troca de aba desliza na direção da aba, com duração de token", async () => {
    const abas = await montarAsAbas();

    expect(abas["animation"]).toBe("shift");
    const spec = abas["transitionSpec"] as { animation: string; config: { duration: number } };
    expect(spec.animation).toBe("timing");
    expect(spec.config.duration).toBe(movimento.respostaAoToque);
  });

  it("entrar e sair da conta atravessam por opacidade, e não deslizando", async () => {
    const pilha = await montarARaiz();

    expect(pilha["animation"]).toBe("fade");
    expect(pilha["animationDuration"]).toBe(movimento.mudancaDeEstado);
  });

  it("com redução de movimento ligada, nenhuma das duas anima", async () => {
    reducaoLigada = true;

    const abas = await montarAsAbas();
    expect(abas["animation"]).toBe("none");
    expect(abas["transitionSpec"]).toBeUndefined();

    const pilha = await montarARaiz();
    expect(pilha["animation"]).toBe("none");
  });
});
