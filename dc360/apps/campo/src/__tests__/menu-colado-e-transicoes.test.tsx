import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

/**
 * O MENU INFERIOR, que deixou de ser o do React Navigation e passou a ser nosso.
 *
 * O RECLAME, na letra de quem paga: "esse menu tá feio, parece que foi
 * gambiarra, ele não se encaixa ali embaixo, tem um espaço branco embaixo dos 3
 * ícones, um espaço inútil, essa desgraça deve ocupar todo o espaço abaixo sem
 * ficar com as calças curtas".
 *
 * A causa foi medida antes de qualquer linha ser escrita, e ela não estava em
 * nenhuma propriedade nossa: o `BottomTabBar` desenha 49 pontos de conteúdo e
 * ACRESCENTA a área segura do aparelho (uns 34 num iPhone com faixa inicial)
 * como espaço vazio embaixo, pintado com a cor da barra. O retângulo de
 * destaque do item aberto (`tabBarActiveBackgroundColor` mais `tabBarItemStyle`)
 * cobria só os 49 e parava ali. É isso que lê como calça curta: um bloco
 * colorido que termina no meio da barra, com uma tira morta debaixo dele.
 *
 * Nenhuma propriedade da barra padrão preenche aquela tira. Por isso a barra
 * passou a ser escrita aqui, em `ui/BarraDeAbas.tsx`, ligada por
 * `tabBar={(props) => <BarraDeAbas {...props} />}`.
 *
 * ## O que este arquivo mede agora, e o que ele media antes
 *
 * Antes ele media OPÇÕES: o que o aplicativo pedia ao React Navigation
 * (`tabBarStyle` sem `position`, sem `borderRadius`, sem `height`). Aquelas
 * perguntas morreram com a barra padrão, mas o que elas protegiam não morreu, e
 * cada uma reaparece aqui medida no DESENHO em vez de no pedido:
 *
 * - "a barra não flutua e não declara a própria altura" virou "a área segura é
 *   recuo do item, e o item declara altura mínima em cima do token de toque";
 * - "o destaque pega o item inteiro" virou "o destaque cobre o item de ponta a
 *   ponta, área segura incluída";
 * - "o destaque não rouba altura do item, senão o rótulo sai cortado" virou a
 *   conta de altura, refeita aqui contra os tokens;
 * - "estado comunicado só por cor" continua igual, porque a regra da casa não
 *   mudou: a aba aberta ganha um bloco preenchido, que é pista de FORMA.
 *
 * E o que a barra ganhava DE GRAÇA do sistema passou a ser nosso, então passou
 * a ter caso: crachá numérico, rótulo falado composto, estado de selecionado,
 * alvo de toque de 52 pontos.
 *
 * ## A barra é desenhada de verdade, e não só capturada
 *
 * O dublê de `Tabs` continua guardando as opções, porque é lá que moram os
 * números do crachá e as frases faladas. Mas ele agora também CHAMA o
 * `tabBar` que o layout passou, com um estado de navegação montado a partir das
 * `Tabs.Screen` que o próprio layout declarou. Ou seja, o que sai na tela deste
 * arquivo é a barra de verdade, alimentada pelas opções de verdade.
 *
 * O limite continua declarado: altura final em pontos de tela vem de medição de
 * aparelho, que não existe aqui. O que se prova é a conta e o que ela produz no
 * leiaute, não o pixel.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "light",
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
} = { abas: null, telas: [], pilha: null, barra: null };

/** Qual aba está aberta quando a barra é desenhada. */
let mockRotaAberta = "index";

/** A área segura do aparelho, que é o número no centro da reclamação. */
let mockMargens = { top: 47, bottom: 34, left: 0, right: 0 };

const mockNavegacao = {
  emit: jest.fn(() => ({ defaultPrevented: false })),
  navigate: jest.fn(),
};

/** O identificador da ocorrência que a tela de vistoria está editando. */
const ID_DA_VISTORIA = "3f1c6c4e-0a1b-4c2d-8e3f-000000000001";

jest.mock("expo-router", () => {
  const reagir = require("react") as typeof import("react");

  /**
   * A barra, montada com o estado que as `Tabs.Screen` acabaram de declarar.
   *
   * Ela é irmã dos filhos e vem DEPOIS deles de propósito: o React renderiza
   * irmãos em ordem, então quando esta chega, `mockNavegador.telas` já tem
   * todas as abas. Montar antes devolveria uma barra vazia, e os casos abaixo
   * mediriam o nada com verde.
   */
  const BarraMontada = (): React.ReactNode => {
    const desenhar = mockNavegador.barra;
    if (!desenhar) return null;

    /* A última renderização de cada aba: o crachá do sino chega no segundo
       quadro, porque o número é lido do disco. */
    const porNome = new Map<string, Opcoes>();
    for (const t of mockNavegador.telas) porNome.set(t.name, t.options ?? {});

    const nomes = [...porNome.keys()];
    const routes = nomes.map((name) => ({
      key: `chave-${name}`,
      name,
      params: name === "vistoria/[id]" ? { id: ID_DA_VISTORIA } : undefined,
    }));
    /*
      O ATALHO `href` É RESOLVIDO AQUI, como o expo-router resolve.

      Ele não é uma bandeira que chega ao `tabBar`: `expo-router/build/layouts/
      TabsClient.js` tira `href` das opções e, quando ele é nulo, põe no lugar
      `tabBarItemStyle: { display: "none" }` mais um `tabBarButton` que devolve
      nulo. Um dublê que entregasse `href: null` cru faria a barra ser medida
      contra uma entrada que ela nunca recebe no aparelho, e a rota da vistoria
      apareceria no menu de verdade sem nenhum caso reprovar.
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

    return desenhar({
      state: {
        key: "abas", index, routeNames: nomes, routes,
        type: "tab", stale: false, history: [], preloadedRouteKeys: [],
      },
      descriptors,
      navigation: mockNavegacao,
      insets: mockMargens,
    });
  };

  const Tabs = (props: {
    screenOptions?: Opcoes;
    tabBar?: (props: Record<string, unknown>) => React.ReactNode;
    children?: unknown;
  }) => {
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
  // Números de iPhone com faixa inicial: é o aparelho da reclamação, e o inset
  // de baixo é justamente a tira que sobrava embaixo dos ícones.
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
  O resumo da fila, que é de onde sai o crachá da aba Envio.
*/
let mockResumo: Record<string, unknown> | null = null;
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    assinar: (ouvinte: (r: unknown) => void) => {
      if (mockResumo) ouvinte(mockResumo);
      return () => undefined;
    },
    drenar: async () => undefined,
  }),
  iniciarSincronizacaoContinua: () => () => undefined,
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }),
}));

/*
  O sino, lido do disco pela barra para desenhar o crachá da aba Perfil.

  Dublado aqui porque abrir SQLite de verdade traria uma dependência de
  aparelho para dentro de uma pergunta sobre o menu. Quantos avisos o crachá
  mostra é assunto de `perfil-o-sino.test.tsx`.
*/
let mockNaoLidos = 0;
let mockNaoLidosTruncado = false;
jest.mock("../dados/avisos", () => ({
  avisosGuardados: async () => ({
    itens: [], cursor: null,
    naoLidos: mockNaoLidos, naoLidosTruncado: mockNaoLidosTruncado,
    lidosPendentes: [], baixadoEm: null,
  }),
  assinarAvisos: () => () => undefined,
}));

/*
  O RASCUNHO, que é como a barra descobre que há vistoria começada.

  Dublado pelo mesmo motivo do sino, e com o mesmo critério que
  `app/(agente)/index.tsx` já usa para marcar uma tarefa como "em andamento":
  existir linha no disco. O rascunho só é gravado no PRIMEIRO toque da tela de
  vistoria, então existir quer dizer que o agente preencheu alguma coisa.
*/
let mockTemRascunho = false;
const mockLerRascunho = jest.fn(async (ocorrenciaId: string) =>
  (mockTemRascunho ? { ocorrenciaId } : null));
jest.mock("../dados/rascunho", () => ({
  lerRascunho: (id: string) => mockLerRascunho(id),
}));

let mockNome = "Joana da Silva Prado";
jest.mock("../dados/sessao", () => ({
  ProvedorDeSessao: ({ children }: { children: unknown }) => children,
  useSessao: () => ({
    carregando: false,
    obterToken: async () => "token-de-mentira",
    lerIdentidade: async () => null,
    identidade: {
      nome: mockNome,
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
import { AvatarDoAgente } from "../ui/BarraDeAbas";
import { espaco, fonte, icone, linha, movimento, raio, toque } from "../ui/tokens";

let reducaoLigada = false;

beforeEach(() => {
  mockNavegador.abas = null;
  mockNavegador.telas = [];
  mockNavegador.pilha = null;
  mockNavegador.barra = null;
  mockNaoLidos = 0;
  mockNaoLidosTruncado = false;
  mockResumo = null;
  mockRotaAberta = "index";
  mockMargens = { top: 47, bottom: 34, left: 0, right: 0 };
  mockTemRascunho = false;
  mockNome = "Joana da Silva Prado";
  reducaoLigada = false;
  mockNavegacao.emit.mockClear();
  mockNavegacao.navigate.mockClear();
  mockLerRascunho.mockClear();
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(async () => reducaoLigada);
});

afterEach(() => { jest.restoreAllMocks(); });

type Tela = ReturnType<typeof render> extends Promise<infer T> ? T : ReturnType<typeof render>;

/*
  `act` assíncrono porque a barra lê duas coisas de promessa antes de saber o
  que desenhar: a redução de movimento e o número do sino. Sem esperar, o que
  fica na tela é o primeiro quadro.

  O resultado do `render` é devolvido, e não o `screen`: vários casos montam
  duas árvores na mesma execução (o layout e, depois, só o avatar), e `screen`
  continua apontando para a primeira.
*/
async function montarOAplicativo(): Promise<Tela> {
  let tela: Tela | null = null;
  await act(async () => { tela = (await render(<LayoutDoAgente />)) as Tela; });
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
 * O crachá e o círculo do Perfil declaram `accessibilityElementsHidden` de
 * propósito: quem anuncia aquele item é o `accessibilityLabel` do tocável
 * inteiro ("Envio, 4 na fila, 3 esperando envio, 1 com problema"), e deixar o
 * número falar sozinho poria "4" solto entre o rótulo e o resto.
 *
 * A biblioteca de teste ignora subárvore escondida por padrão, então sem esta
 * porta os casos do crachá reprovariam por não ACHAR o que existe, e os casos de
 * "não há crachá" passariam por motivo errado: ausência e invisibilidade seriam
 * a mesma resposta. Este aplicativo já pagou por essa confusão uma vez, e a
 * cicatriz está escrita em `app/(agente)/perfil.tsx`.
 */
function achar(tela: Tela, id: string) {
  return tela.getByTestId(id, { includeHiddenElements: true });
}

function talvez(tela: Tela, id: string) {
  return tela.queryByTestId(id, { includeHiddenElements: true });
}

type No = { children: (No | string)[] };

/**
 * O texto que um nó desenha, juntando os pedaços.
 *
 * `props.children` não serve: `Txt` não aceita identificador, então o que leva
 * o `testID` é um `View` em volta, e ali `children` é um ELEMENTO React. Ler
 * `props.children` devolvia a árvore inteira, e quando o caso reprovava o jest
 * tentava desenhar essa árvore na mensagem e estourava a pilha do processo.
 */
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

describe("o topo não cobra a área segura duas vezes", () => {
  /*
    O RECLAME anterior, na letra: "o header ali onde fica fila de envio, minhas
    tarefas tá muito testudo, por que aquela distância toda?".

    A distância era uma conta paga duas vezes. O `_layout` do agente aplica
    `paddingTop: margens.top` no `View` de fora, e precisa aplicar: a faixa de
    sincronização mora ACIMA do cabeçalho das abas, e sem esse recuo ela nasce
    embaixo do entalhe do aparelho. Só que o cabeçalho do React Navigation soma
    o MESMO recuo por conta própria (`headerStatusBarHeight = isParentHeaderShown
    ? 0 : insets.top`), e a pilha da raiz desliga o cabeçalho dela para
    `(agente)`, então não há pai nenhum.

    O irmão de baixo desta conta é a reclamação que criou esta frente. As duas
    são a mesma doença em pontas opostas da tela: área segura paga por quem não
    devia.
  */
  it("o cabeçalho não soma a área segura que o layout já pagou", async () => {
    const opcoes = await montarAsAbas();

    expect(opcoes["headerStatusBarHeight"]).toBe(0);
  });
});

describe("os quatro itens da barra", () => {
  it("são Tarefas, Mapa, Envio e Perfil, nesta ordem", async () => {
    const tela = await montarOAplicativo();

    const rotulos = tela.getAllByTestId(/^rotulo-da-aba-/).map(textoDe);
    expect(rotulos).toEqual(["Tarefas", "Mapa", "Envio", "Perfil"]);
  });

  /*
    A ordem no JSX não é gosto: o `shift` do React Navigation tira a DIREÇÃO da
    deslizada da posição da aba no estado, e o estado vem da ordem de declaração.
    Com a vistoria declarada por último, ela sempre entra pela direita, que é
    como o olho lê "avancei para dentro do trabalho".
  */
  it("a vistoria continua sendo a última rota declarada, e fora da barra", async () => {
    const tela = await montarOAplicativo();

    const declaradas = [...ultimasOpcoes().keys()];
    expect(declaradas[declaradas.length - 1]).toBe("vistoria/[id]");
    expect(ultimasOpcoes().get("vistoria/[id]")?.["href"]).toBeNull();
    expect(tela.queryByTestId("aba-vistoria/[id]")).toBeNull();
  });

  /*
    A BARRA PASSOU A APARECER DENTRO DA VISTORIA, e isto é a reversão de uma
    decisão que este aplicativo defendeu em três lugares: "uma escotilha de fuga
    permanente embaixo do polegar, ao lado de um rolamento longo, é como se
    produz vistoria pela metade".

    O dono desfez COM compensação, e a compensação é o diálogo mais abaixo:
    tocar em outra aba com vistoria começada pergunta antes. O rascunho é
    gravado a cada toque, então a pergunta é sobre ATENÇÃO, e não sobre perda.
  */
  it("nenhuma tela esconde mais a barra", async () => {
    await montarAsAbas();

    const escondem = [...ultimasOpcoes()]
      .filter(([, o]) => o["tabBarStyle"] !== undefined)
      .map(([nome]) => nome);
    expect(escondem).toEqual([]);
  });

  /*
    Opção que o navegador não lê mais é opção que mente. `tabBarStyle`,
    `tabBarItemStyle`, `tabBarActiveBackgroundColor` e `tabBarLabelStyle` são
    lidos pelo `BottomTabBar` padrão, e só por ele: com `tabBar` próprio, quem
    desenha é `BarraDeAbas`, e deixar as quatro declaradas faria a próxima
    pessoa ajustar o menu no arquivo errado.
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
});

describe("a altura, que a barra passou a ocupar inteira", () => {
  /*
    O CORAÇÃO DA RECLAMAÇÃO. A barra padrão punha a área segura DEPOIS do bloco
    de conteúdo, como tira morta. Aqui ela vira recuo de baixo do próprio item,
    então o item (e o destaque dele) cobre da borda de cima da barra até a borda
    de baixo da tela.
  */
  it("a área segura é recuo do item, e não um vão embaixo dele", async () => {
    const tela = await montarOAplicativo();

    const item = estiloDe(tela.getByTestId("aba-index"));
    expect(item["paddingBottom"]).toBe(espaco.e1 + mockMargens.bottom);

    /* E o container NÃO paga de novo, senão a tira morta volta, dobrada. */
    const barra = estiloDe(tela.getByTestId("barra-de-abas"));
    expect(barra["paddingBottom"]).toBeUndefined();
  });

  it("o item ocupa o alvo de toque MAIS a área segura", async () => {
    const tela = await montarOAplicativo();

    expect(estiloDe(tela.getByTestId("aba-index"))["minHeight"])
      .toBe(toque + mockMargens.bottom);
  });

  /*
    Aparelho sem barra de gestos (Android com botões, iPhone com botão): a área
    segura de baixo é zero, e a barra não pode ficar alta à toa. É o caso que
    prova que o número sai da CONTA e não de um valor escrito à mão para o
    aparelho de quem escreveu.
  */
  it("sem área segura, a barra encolhe para o alvo de toque e para aí", async () => {
    mockMargens = { top: 24, bottom: 0, left: 0, right: 0 };
    const tela = await montarOAplicativo();

    const item = estiloDe(tela.getByTestId("aba-index"));
    expect(item["minHeight"]).toBe(toque);
    expect(item["paddingBottom"]).toBe(espaco.e1);
  });

  /*
    A CALÇA CURTA, medida. O destaque do item aberto não pode ter altura
    própria: ele preenche o item, e o item já vai até a borda da tela.
  */
  it("o destaque do item aberto cobre o item de ponta a ponta", async () => {
    const tela = await montarOAplicativo();

    const destaque = estiloDe(tela.getByTestId("destaque-da-aba"));
    expect(destaque["height"]).toBeUndefined();
    expect(destaque["bottom"]).toBe(0);
    expect(destaque["top"]).toBe(0);
  });

  /*
    A CONTA, refeita aqui contra os tokens em vez de confiar no comentário.

    Ícone (`icone.acao`) mais a folga (`espaco.e1`) mais o rótulo (`fonte.legenda`
    desenhado em `linha.legenda`) precisam caber no alvo de toque menos o
    respiro de cima e de baixo. Se alguém aumentar o ícone ou o rótulo sem mexer
    na altura, o rótulo sai cortado ao meio, que foi exatamente o defeito da
    versão anterior desta barra ("os ícones do menu ficaram achatados").
  */
  it("ícone, folga e rótulo cabem no alvo de toque", () => {
    const conteudo = icone.acao + espaco.e1 + linha.legenda;

    expect(conteudo).toBeLessThanOrEqual(toque - espaco.e1 * 2);
    /* E o rótulo é o degrau pequeno, que é o que faz a conta fechar. */
    expect(fonte.legenda).toBeLessThan(linha.legenda);
  });
});

describe("a segunda pista do item aberto", () => {
  /*
    A regra da casa não mudou com a barra: nada se comunica só por cor. A
    palavra embaixo do ícone é a mesma aberta ou fechada, então sem o bloco
    preenchido a única diferença entre a aba aberta e as outras três seria o
    violeta, e quem não distingue violeta de cinza (ou está com sol na tela)
    ficaria sem saber onde está. Um bloco preenchido é pista de FORMA.
  */
  it("só a aba aberta ganha bloco preenchido", async () => {
    mockRotaAberta = "fila";
    const tela = await montarOAplicativo();

    const destaques = tela.getAllByTestId("destaque-da-aba");
    expect(destaques).toHaveLength(1);
    expect(estiloDe(destaques[0]!)["backgroundColor"]).toBeTruthy();
  });

  /*
    O canto arredondado é só EM CIMA, e é decisão de desenho com razão: embaixo
    o bloco encosta na borda da tela, e um canto redondo ali deixaria duas
    fatias da cor da barra aparecendo nos cantos inferiores, que é a mesma
    aparência de remendo que a calça curta produzia.
  */
  it("o bloco arredonda em cima e encosta embaixo", async () => {
    const tela = await montarOAplicativo();

    const destaque = estiloDe(tela.getByTestId("destaque-da-aba"));
    expect(destaque["borderTopLeftRadius"]).toBe(raio.cartao);
    expect(destaque["borderTopRightRadius"]).toBe(raio.cartao);
    expect(destaque["borderBottomLeftRadius"]).toBeUndefined();
  });

  it("o leitor de tela recebe a mesma informação, como estado de selecionado", async () => {
    mockRotaAberta = "perfil";
    const tela = await montarOAplicativo();

    expect(tela.getByTestId("aba-perfil").props.accessibilityState.selected).toBe(true);
    expect(tela.getByTestId("aba-index").props.accessibilityState.selected).toBe(false);
  });
});

describe("o que vinha de graça do sistema e passou a ser nosso", () => {
  it("o crachá da fila conta o que ainda não chegou à coordenação", async () => {
    mockResumo = {
      pendentes: 2, enviando: 1, confirmados: 4, bloqueados: 1,
      deOutroAutor: 0, arquivados: 0, sincronizando: false,
    };
    const tela = await montarOAplicativo();

    /* As quatro confirmadas não entram: elas já chegaram lá. */
    expect(textoDe(achar(tela, "cracha-fila"))).toBe("4");
  });

  /*
    O RÓTULO FALADO NÃO PROMETE ENVIO, e essa ressalva é cicatriz.

    Ele dizia "N coletas esperando" sobre um número que soma três coisas com
    destinos diferentes: o que sai sozinho quando houver sinal, o que o servidor
    recusou, e o que NÃO sai por esta conta (a coleta do turno anterior, no
    aparelho de plantão, que só sobe quando o autor dela entrar aqui, senão o
    laudo sairia com o nome errado).
  */
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
    expect(tela.getByTestId("aba-perfil").props.accessibilityLabel).toBe("Perfil");
  });

  it("o crachá do sino aparece no Perfil e é falado", async () => {
    mockNaoLidos = 3;
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "cracha-perfil"))).toBe("3");
    expect(tela.getByTestId("aba-perfil").props.accessibilityLabel)
      .toBe("Perfil, 3 avisos por ler");
  });

  /*
    A contagem do servidor bate num teto: o número é um PISO, e não o total. O
    "+" existe para o crachá não afirmar um total que ninguém contou.
  */
  it("o sino trunca em 3+ quando a contagem bateu no teto do servidor", async () => {
    mockNaoLidos = 3;
    mockNaoLidosTruncado = true;
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "cracha-perfil"))).toBe("3+");
    expect(tela.getByTestId("aba-perfil").props.accessibilityLabel)
      .toBe("Perfil, mais de 3 avisos por ler");
  });

  /*
    Dois crachás com a mesma cara, na mesma barra, para duas coisas opostas: um
    é trabalho do agente que ainda não subiu, o outro é notícia do município.
    Iguais, o agente aprende que o número não quer dizer nada.
  */
  it("o crachá do sino não usa a cor do crachá da fila, que conta outra coisa", async () => {
    mockNaoLidos = 1;
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

    /* O dublê ACUMULA uma entrada por renderização, e a segunda montagem leria
       as opções da primeira junto. Zerar aqui é o que faz a segunda medida ser
       da segunda fila, e não da soma das duas. */
    mockNavegador.telas = [];
    mockResumo = {
      pendentes: 1, enviando: 0, confirmados: 0, bloqueados: 1,
      deOutroAutor: 0, arquivados: 0, sincronizando: false,
    };
    const comProblema = await montarOAplicativo();

    expect(estiloDe(achar(comProblema, "cracha-fila"))["backgroundColor"])
      .not.toBe(calmo);
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

describe("o Perfil é a pessoa, e não um pictograma de equipe", () => {
  /*
    O ícone de duas pessoas dizia "equipe", e a aba não é a equipe: é VOCÊ. O
    critério das iniciais é o mesmo que `app/(agente)/perfil.tsx` já usa na
    lista de colegas, copiado com a razão escrita em `BarraDeAbas.tsx`.
  */
  it("o círculo traz a primeira e a última inicial do nome", async () => {
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "iniciais-do-agente"))).toBe("JP");
  });

  it("nome de uma palavra só vira uma letra, e não um círculo vazio", async () => {
    mockNome = "Joana";
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "iniciais-do-agente"))).toBe("J");
  });

  /*
    Cadastro sem nome existe, porque o cadastro do município é de quem cadastrou
    e não nosso. Um círculo em branco pareceria defeito; a interrogação diz o
    que houve.
  */
  it("cadastro sem nome vira interrogação, e não um círculo em branco", async () => {
    mockNome = "   ";
    const tela = await montarOAplicativo();

    expect(textoDe(achar(tela, "iniciais-do-agente"))).toBe("?");
  });

  /*
    A peça já aceita foto. O que não existe ainda é a foto: `identidade` não traz
    nenhuma, e trazer depende de a API publicar o campo. Está declarado como
    pendência nomeada no próprio componente, e este caso é o que garante que a
    porta continua aberta em vez de virar código morto.
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
});

describe("sair da vistoria começada pergunta antes", () => {
  /*
    A COMPENSAÇÃO da barra ter passado a aparecer dentro da vistoria.

    O argumento contra a barra ali estava escrito em três lugares: escotilha de
    fuga embaixo do polegar, ao lado do formulário mais longo do produto,
    produz vistoria pela metade. O dono desfez a decisão e pediu a compensação:
    a pergunta. Ela não é sobre PERDA (o rascunho está no disco desde o primeiro
    toque), é sobre ATENÇÃO: o agente está na porta da casa, com o morador
    esperando, e sair da tela é sair do trabalho.
  */
  it("tocar em outra aba abre a pergunta em vez de navegar", async () => {
    mockRotaAberta = "vistoria/[id]";
    mockTemRascunho = true;
    const tela = await montarOAplicativo();

    await act(async () => { fireEvent.press(tela.getByTestId("aba-index")); });

    expect(tela.getByTestId("dialogo-de-sair-da-vistoria")).toBeTruthy();
    expect(mockNavegacao.navigate).not.toHaveBeenCalled();
    /* A pergunta é feita sobre a ocorrência que está aberta, e não sobre
       qualquer rascunho no aparelho. */
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

  /*
    Vistoria ABERTA e vistoria COMEÇADA são coisas diferentes. A tela grava o
    rascunho no PRIMEIRO toque, não na abertura: quem só abriu e desistiu não
    preencheu nada, e perguntar ali seria um obstáculo sem fato por trás.
  */
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
