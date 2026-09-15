import { useEffect, useState, type ReactNode } from "react";
import { Animated, Text, View } from "react-native";
import { act, render } from "@testing-library/react-native";
import { NavigationContainer } from "expo-router/build/react-navigation/native";
import { createBottomTabNavigator } from "expo-router/build/react-navigation/bottom-tabs";

/**
 * A ABA QUE FICAVA ESCURA.
 *
 * O dono: "ao trocar de aba fica tudo escuro, nada acontece, nem spinner, só
 * volta se eu sair e entrar da aba". Envio e Perfil sumiam; o Mapa funcionava.
 *
 * A causa está escrita em `app/(agente)/_layout.tsx`: o layout guardava estado
 * que muda DURANTE a transição de 120 ms (o resumo da fila chega no instante
 * em que a tela de envio monta e assina a fila), e um `setState` no PAI do
 * navegador refaz os `descriptors`, reexecuta o efeito de `BottomTabView` que
 * chama `Animated.parallel(...).start()`, e a cena que estava entrando é
 * recomitada com os props velhos (`opacity: 0`).
 *
 * ## O que este arquivo prova, e o que ele NÃO consegue provar
 *
 * Aqui o navegador é o de VERDADE: o `createBottomTabNavigator` da cópia que
 * o Expo Router carrega, dentro de um `NavigationContainer`, com telas de
 * mentira. O que se mede é quantas vezes o navegador ORDENA a animação de
 * cada cena (uma espiã em `Animated.timing`, filtrada pelas durações que só
 * o navegador usa fora de um toque):
 *
 * 1. Com o pai PARADO, cada rota recebe UMA animação por transição. É a linha
 *    de base.
 * 2. Com um pai que se redesenha no meio da transição, o navegador REINICIA:
 *    cada rota recebe uma segunda animação, e a primeira é parada no meio. É
 *    o mecanismo do defeito, reproduzido fora do aparelho.
 * 3. Com a `BarraDeAbas` DE VERDADE como `tabBar`, acordada pela fila no meio
 *    da transição (como `fila.tsx` faz ao montar), o crachá se redesenha e o
 *    navegador NÃO reinicia nada: continua uma animação por rota, e o pai não
 *    é redesenhado. É a correção, provada contra o navegador real.
 *
 * O que NÃO dá para medir aqui, dito na cara: a opacidade final da cena. A
 * troca de aba roda com `useNativeDriver`, e no jest o dublê nativo não move
 * valor nenhum: o lado JavaScript da cena fica para sempre no valor inicial,
 * exatamente como no aparelho (é essa a razão de o defeito existir). Um teste
 * que lesse `opacity` da cena leria o valor de partida nos dois desenhos e não
 * distinguiria nada. Por isso a prova é sobre o que o navegador ORDENA, e não
 * sobre o que o dublê desenha.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "light",
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

/** Quem assinou a fila, para o teste poder acordá-los como a fila de verdade faz. */
const mockOuvintesDaFila = new Set<(r: unknown) => void>();
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    assinar: (ouvinte: (r: unknown) => void) => {
      mockOuvintesDaFila.add(ouvinte);
      return () => mockOuvintesDaFila.delete(ouvinte);
    },
    drenar: async () => undefined,
  }),
  iniciarSincronizacaoContinua: () => () => undefined,
}));

jest.mock("../dados/avisos", () => ({
  useContagemDeAvisos: () => ({ porLer: 0, truncado: false, lida: true }),
  textoDoCracha: () => null,
}));

jest.mock("../dados/rascunho", () => ({ lerRascunho: async () => null }));

/* Um objeto só, como o provedor de verdade entrega: identidade nova a cada
   quadro faria a barra reassinar a fila a cada redesenho. */
const mockSessao = {
  carregando: false,
  obterToken: async () => "token-de-mentira",
  lerIdentidade: () => null,
  identidade: {
    nome: "Joana da Silva Prado",
    papel: "agente_campo",
    matricula: "0001",
    organizacaoId: "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa",
    organizacaoNome: "Defesa Civil de Teste",
    municipio: "Teste",
    uf: "SC",
  },
};
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));

import { BarraDeAbas } from "../ui/BarraDeAbas";
import { movimento } from "../ui/tokens";

const Abas = createBottomTabNavigator();

/** O que a tela de envio faz ao montar: assina a fila, e a fila avisa todo mundo. */
let acordarAoMontar: (() => void) | null = null;
/** Como o teste pede ao navegador para trocar de aba. */
let navegar: ((nome: string) => void) | null = null;

function TelaTarefas({ navigation }: { navigation: { navigate: (nome: string) => void } }) {
  navegar = (nome) => navigation.navigate(nome);
  return <View><Text>Minhas tarefas</Text></View>;
}

function TelaFila() {
  useEffect(() => {
    /*
      Num microtask, e não no próprio efeito: a fila de verdade avisa depois
      de `await resumo()`, ou seja, um tique depois de montar, com a transição
      já em andamento. Os efeitos dos filhos rodam antes dos do pai, então
      avisar de forma síncrona chegaria ANTES de o navegador começar a animar.
    */
    queueMicrotask(() => { acordarAoMontar?.(); });
  }, []);
  return <View><Text>Fila de envio</Text></View>;
}

const OPCOES = {
  headerShown: false,
  animation: "shift" as const,
  transitionSpec: {
    animation: "timing" as const,
    config: { duration: movimento.respostaAoToque },
  },
};

/**
 * O navegador de verdade, embrulhado por um pai que PODE guardar estado.
 *
 * `guardaEstado` liga o desenho antigo: o aviso da fila vira `setState` no
 * pai do navegador. Desligado, o pai fica parado e o aviso não chega a
 * ninguém, que é a linha de base.
 */
function Pai({ guardaEstado, tabBar }: {
  guardaEstado: boolean;
  tabBar?: (props: never) => ReactNode;
}) {
  const [, setResumo] = useState<unknown>(null);
  renderizacoesDoPai += 1;
  if (guardaEstado) acordarAoMontar = () => setResumo({ pendentes: 3 });

  return (
    <NavigationContainer>
      <Abas.Navigator
        screenOptions={OPCOES}
        {...(tabBar ? { tabBar: tabBar as never } : {})}
      >
        <Abas.Screen name="index" component={TelaTarefas} options={{ tabBarLabel: "Tarefas" }} />
        <Abas.Screen name="fila" component={TelaFila} options={{ tabBarLabel: "Envio" }} />
      </Abas.Navigator>
    </NavigationContainer>
  );
}

let renderizacoesDoPai = 0;

/**
 * A espiã: toda animação que alguém pede ao `Animated`, com a configuração.
 *
 * `Animated.timing` e não o dublê nativo, porque a barra de verdade também
 * anima (o indicador desliza) e as duas precisam ser separadas. A separação é
 * a DURAÇÃO: a troca de cena roda em `movimento.respostaAoToque`, e o
 * indicador da barra em `movimento.mudancaDeEstado`.
 */
let espiaDeTiming: jest.SpyInstance;

type Tela = Awaited<ReturnType<typeof render>>;

async function montar(elemento: React.JSX.Element): Promise<Tela> {
  let tela: Tela | null = null;
  await act(async () => { tela = await render(elemento); });
  if (!tela) throw new Error("o navegador não montou");
  /* A primeira montagem também anima (cada rota vai para a posição dela).
     O que interessa é a transição, então o placar zera aqui. */
  await act(async () => { jest.advanceTimersByTime(movimento.respostaAoToque * 2); });
  espiaDeTiming.mockClear();
  renderizacoesDoPai = 0;
  return tela;
}

async function trocarParaAFila(): Promise<void> {
  await act(async () => { navegar?.("fila"); });
  await act(async () => { jest.advanceTimersByTime(movimento.respostaAoToque * 2); });
}

/**
 * Para qual valor o navegador mandou cada CENA, na ordem em que mandou.
 *
 * Duas durações são do navegador: `respostaAoToque` para as duas cenas que
 * trocam de lugar, e ZERO para a cena que não participa da transição (ao
 * reiniciar, o navegador já considera a cena que saiu como "fora da troca" e a
 * manda para o lugar dela sem duração). A barra nunca anima com nenhuma das
 * duas fora de um toque, e aqui ninguém toca em nada.
 */
function alvosDasCenas(): number[] {
  return espiaDeTiming.mock.calls
    .map((chamada) => chamada[1] as { duration?: number; toValue: number })
    .filter((config) => config.duration === movimento.respostaAoToque || config.duration === 0)
    .map((config) => config.toValue);
}

beforeEach(() => {
  jest.useFakeTimers();
  espiaDeTiming = jest.spyOn(Animated, "timing");
  mockOuvintesDaFila.clear();
  acordarAoMontar = null;
  navegar = null;
});

afterEach(() => {
  espiaDeTiming.mockRestore();
  jest.useRealTimers();
});

describe("o mecanismo do defeito, no navegador de verdade", () => {
  it("com o pai parado, cada rota recebe uma animação por transição", async () => {
    await montar(<Pai guardaEstado={false} />);

    await trocarParaAFila();

    /* Duas rotas, duas animações: a que sai vai para -1 e a que entra vai
       para 0. Nenhuma segunda batelada. */
    expect(alvosDasCenas()).toEqual([-1, 0]);
    expect(renderizacoesDoPai).toBe(0);
  });

  it("um redesenho do pai no meio da transição reinicia a animação da cena", async () => {
    await montar(<Pai guardaEstado />);

    await trocarParaAFila();

    /*
      O aviso da fila virou `setState` no pai. O navegador recebeu descritores
      novos (`useDescriptors` não os memoiza), o efeito de `BottomTabView`
      rodou de novo, e cada rota recebeu uma SEGUNDA animação: a primeira foi
      parada no meio (`stopTogether`), os nós de interpolação da cena foram
      recriados, e o React recomitou os props da cena com o valor que o
      JavaScript conhecia, que com `useNativeDriver` é o de partida:
      `opacity: 0`. É exatamente a sequência que deixava a cena escura no
      aparelho.
    */
    expect(renderizacoesDoPai).toBe(1);
    expect(alvosDasCenas()).toEqual([-1, 0, -1, 0]);
  });
});

describe("a correção: a barra assina a fila, e o navegador não fica sabendo", () => {
  function desenharBarra(props: never) {
    return <BarraDeAbas {...(props as object as Parameters<typeof BarraDeAbas>[0])} />;
  }

  it("a barra de verdade, acordada pela fila no meio da transição, redesenha o crachá sem reiniciar a animação", async () => {
    const tela = await montar(<Pai guardaEstado={false} tabBar={desenharBarra} />);
    /* A barra assinou a fila ao montar, como o layout fazia antes. */
    expect(mockOuvintesDaFila.size).toBe(1);
    expect(tela.queryByTestId("cracha-fila", { includeHiddenElements: true })).toBeNull();

    /* O que `fila.tsx` provoca ao montar: a fila avisa quem assinou. */
    acordarAoMontar = () => {
      for (const ouvinte of mockOuvintesDaFila) {
        ouvinte({
          pendentes: 3, enviando: 0, confirmados: 0, bloqueados: 0,
          deOutroAutor: 0, arquivados: 0, sincronizando: false,
        });
      }
    };

    await trocarParaAFila();

    /* O crachá acordou... */
    const cracha = tela.getByTestId("cracha-fila", { includeHiddenElements: true });
    expect(JSON.stringify(cracha.children)).toContain("3");
    /* ...e o navegador não: uma animação por rota, e o pai parado. */
    expect(alvosDasCenas()).toEqual([-1, 0]);
    expect(renderizacoesDoPai).toBe(0);
  });
});
