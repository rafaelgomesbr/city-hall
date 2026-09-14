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

/*
  O resumo da fila, que é de onde sai o crachá da aba Envio.

  Ele era um `assinar` que nunca avisava ninguém, ou seja, o crachá da fila
  nunca chegou a existir neste arquivo: todo caso media a barra com a fila
  vazia. É o que deixou o rótulo falado daquela aba sem um único caso.
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

  Dublado aqui porque este arquivo prova o que o aplicativo PEDE ao React
  Navigation, e abrir SQLite de verdade traria uma dependência de aparelho para
  dentro de uma pergunta sobre opções de navegação. Quantos avisos o crachá
  mostra é assunto de `perfil-o-sino.test.tsx`.
*/
let mockNaoLidos = 0;
jest.mock("../dados/avisos", () => ({
  avisosGuardados: async () => ({
    itens: [], cursor: null, naoLidos: mockNaoLidos, naoLidosTruncado: false,
    lidosPendentes: [], baixadoEm: null,
  }),
  assinarAvisos: () => () => undefined,
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
  mockNaoLidos = 0;
  mockResumo = null;
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

describe("o topo não cobra a área segura duas vezes", () => {
  /*
    O RECLAME, na letra: "o header ali onde fica fila de envio, minhas tarefas
    tá muito testudo, por que aquela distância toda?".

    A distância era uma conta paga duas vezes. O `_layout` do agente aplica
    `paddingTop: margens.top` no `View` de fora, e precisa aplicar: a faixa de
    sincronização mora ACIMA do cabeçalho das abas, e sem esse recuo ela nasce
    embaixo do entalhe do aparelho.

    Só que o cabeçalho do React Navigation soma o MESMO recuo por conta
    própria. A fonte dele não deixa dúvida
    (`@react-navigation/elements/.../Header.js`):

      headerStatusBarHeight = isParentHeaderShown ? 0 : insets.top

    Não há cabeçalho pai (a pilha da raiz desliga o dela com `headerShown:
    false` para `(agente)`), então o cabeçalho das abas acrescenta a área
    segura inteira de novo. Num iPhone com entalhe isso são cerca de 59 pontos
    de nada, entre a faixa e a palavra "Minhas tarefas", e quem olha não tem
    como saber que aquilo é um espaço reservado para um relógio que já foi
    desviado lá em cima.

    Zerar aqui não deixa nada por baixo do entalhe: quem paga a área segura é o
    `View` de fora, uma vez só, e é ele que tem de pagar, porque é ele que
    desenha primeiro.
  */
  it("o cabeçalho não soma a área segura que o layout já pagou", async () => {
    const opcoes = await montarAsAbas();

    expect(opcoes["headerStatusBarHeight"]).toBe(0);
  });
});

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

/**
 * O CRACHÁ DO SINO NA ABA PERFIL.
 *
 * `GET /avisos` existe no servidor desde o T8, escrita sem `exigirPermissao`
 * expressamente para o agente de campo poder usá-la, e o aplicativo nunca a
 * chamou. Quando ela foi ligada, a pergunta foi onde o sino mora, e a resposta
 * está escrita no cabeçalho de `perfil.tsx`: o conteúdo dentro do Perfil, e o
 * NÚMERO aqui, na barra.
 *
 * É o que compra a visibilidade de qualquer tela sem inventar uma quarta aba
 * (que este mesmo arquivo já recusou por argumento) e sem pôr no topo um
 * indicador que fica velho sem sinal, ao lado da `FaixaDeSincronizacao`, que
 * nunca mente.
 *
 * Os casos abaixo REPROVAM antes da ligação: não existia aba `perfil`, e o sino
 * não tinha número em lugar nenhum.
 */
describe("o crachá do sino na aba Perfil", () => {
  /**
   * As abas declaradas, pelo nome da rota, da ÚLTIMA renderização.
   *
   * O dublê de `Tabs.Screen` acumula uma entrada por renderização, e a barra
   * renderiza duas vezes: o número do sino é lido do disco, que é assíncrono.
   * Pegar a primeira ocorrência devolveria as opções do quadro em que o
   * aplicativo ainda não sabia quantos avisos existem, e o caso passaria a
   * medir o estado inicial em vez do estado final.
   */
  function ultimasOpcoes(): Map<string, Opcoes> {
    const porNome = new Map<string, Opcoes>();
    for (const t of mockNavegador.telas) porNome.set(t.name, t.options ?? {});
    return porNome;
  }

  async function opcoesDaAba(nome: string): Promise<Opcoes> {
    await montarAsAbas();
    const achada = ultimasOpcoes().get(nome);
    if (!achada) throw new Error(`a aba "${nome}" não foi declarada`);
    return achada;
  }

  it("as três abas são Tarefas, Envio e Perfil: a conta deixou de ser uma tela escondida", async () => {
    await montarAsAbas();
    const rotulos = [...ultimasOpcoes().values()]
      .filter((o) => o["href"] !== null)
      .map((o) => o["tabBarLabel"]);

    expect(rotulos).toEqual(["Tarefas", "Envio", "Perfil"]);
    /* A rota `conta` saiu inteira: ela estava atrás de um botão no FIM do
       rolamento da equipe, e quem procurava a versão do aplicativo ou o tema
       precisava passar por dez vistorias concluídas para achá-la. */
    expect(mockNavegador.telas.some((t) => t.name === "conta")).toBe(false);
  });

  it("sem aviso por ler, não há crachá nenhum: número zero é ruído", async () => {
    const perfil = await opcoesDaAba("perfil");

    expect(perfil["tabBarBadge"]).toBeUndefined();
    expect(perfil["tabBarAccessibilityLabel"]).toBe("Perfil");
  });

  it("com aviso por ler, o número aparece e é falado", async () => {
    mockNaoLidos = 3;
    const perfil = await opcoesDaAba("perfil");

    /* Número, e não pontinho colorido: o agente precisa saber QUANTOS avisos
       esperam, e é o número que decide se vale abrir agora. */
    expect(perfil["tabBarBadge"]).toBe("3");
    expect(perfil["tabBarAccessibilityLabel"]).toBe("Perfil, 3 avisos por ler");
  });

  it("o crachá da fila não promete envio para o que não sai por esta conta", async () => {
    /*
      APARELHO DE PLANTÃO, TROCA DE TURNO. O agente da noite entra e encontra
      no crachá da aba Envio o número da coleta que a colega da manhã fez. Ela
      está no crachá de propósito (é vistoria feita no morro que ainda não
      chegou à coordenação), mas ela NÃO sai: o dreno não toca em coleta de
      outro autor, porque o servidor tira o autor de quem apresenta o token, e
      o laudo sairia com o nome errado.

      O rótulo falado dizia "1 coleta esperando", que é a mesma promessa que a
      `FaixaDeSincronizacao` já teve de corrigir ("'Tudo sincronizado' com uma
      coleta parada no aparelho é a pior frase que este produto pode exibir").
      Quem ouve a tela recebia a promessa inteira, sem a ressalva, e ia embora.
    */
    mockResumo = {
      pendentes: 0, enviando: 0, confirmados: 0, bloqueados: 0,
      deOutroAutor: 1, arquivados: 0, sincronizando: false,
    };
    const envio = await opcoesDaAba("fila");

    expect(envio["tabBarBadge"]).toBe(1);
    expect(envio["tabBarAccessibilityLabel"]).toBe(
      "Envio, 1 na fila, 1 de outro agente",
    );
  });

  it("o crachá da fila separa o que espera sinal do que precisa de atenção", async () => {
    mockResumo = {
      pendentes: 2, enviando: 1, confirmados: 4, bloqueados: 1,
      deOutroAutor: 0, arquivados: 0, sincronizando: false,
    };
    const envio = await opcoesDaAba("fila");

    /* As quatro confirmadas não entram: elas já chegaram à coordenação. */
    expect(envio["tabBarBadge"]).toBe(4);
    expect(envio["tabBarAccessibilityLabel"]).toBe(
      "Envio, 4 na fila, 3 esperando envio, 1 com problema",
    );
  });

  it("não usa a mesma cor do crachá da fila, que conta outra coisa", async () => {
    mockNaoLidos = 1;
    await montarAsAbas();
    const abas = ultimasOpcoes();
    const perfil = abas.get("perfil") as Opcoes;
    const envio = abas.get("fila") as Opcoes;

    const corDe = (o: Opcoes) =>
      (o["tabBarBadgeStyle"] as Record<string, unknown>)["backgroundColor"];

    /*
      Dois crachás com a mesma cara, na mesma barra, para duas coisas opostas:
      um é trabalho do agente que ainda não subiu, o outro é notícia do
      município. Iguais, o agente aprende que o número não quer dizer nada.
    */
    expect(corDe(perfil)).not.toBe(corDe(envio));
  });
});
