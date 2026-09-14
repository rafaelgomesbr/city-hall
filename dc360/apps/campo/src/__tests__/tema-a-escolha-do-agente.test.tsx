import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

/**
 * CLARO E ESCURO, À ESCOLHA DO AGENTE.
 *
 * O aplicativo seguia o sistema e pronto, com uma decisão escrita contra o
 * alternador. O dono do produto decidiu o contrário, e o argumento a favor é o
 * que está travado aqui: a tela é lida sob sol forte no morro e no escuro do
 * plantão noturno, e nenhuma dessas duas condições é o horário pelo qual o
 * sistema decide.
 *
 * São TRÊS estados, e não dois: "acompanhar o sistema" continua sendo o padrão.
 * Um alternador de dois estados obrigaria quem está satisfeito com o automático
 * a escolher um lado para sempre, sem volta.
 *
 * Todos os casos abaixo REPROVAM na versão anterior: os da tela porque o
 * alternador não existia, e os do tema porque o provedor lia `useColorScheme` e
 * mais nada.
 *
 * O arquivo mora em `__tests__` e não ao lado da tela porque tudo dentro de
 * `src/app` vira ROTA no Expo.
 */

/** O que o SISTEMA diz. Cada caso ajusta antes de montar. */
let mockEsquemaDoSistema: "light" | "dark" = "dark";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => mockEsquemaDoSistema,
}));

/**
 * O depósito do aparelho, em memória.
 *
 * O caminho de verdade até o SQLite (e a garantia de que o logout não o apaga)
 * é provado em `dados/preferencia-de-tema.test.ts`, contra um banco real. Aqui
 * o que está em jogo é a tela: que ela LÊ o que estava guardado, que ESCREVE o
 * que o agente tocou, e que a troca aparece no mesmo quadro.
 */
let mockGuardado: string = "sistema";
/** Quando ligado, a leitura do aparelho não responde: é a abertura esperando. */
let mockLeituraPendurada = false;
const mockGravacoes: string[] = [];

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => (mockLeituraPendurada
    ? new Promise(() => {})
    : mockGuardado),
  guardarPreferenciaDeTema: async (valor: string) => {
    mockGravacoes.push(valor);
    mockGuardado = valor;
  },
}));

/* A pilha de navegação da raiz é capturada, não desenhada: o que este arquivo
   prova da abertura é se ela chegou a montar, e não o pixel dela. */
type Opcoes = Record<string, unknown>;
const mockNavegador: { pilha: Opcoes | null } = { pilha: null };

jest.mock("expo-router", () => {
  const reagir = require("react") as typeof import("react");
  const Stack = (props: { screenOptions?: Opcoes; children?: unknown }) => {
    mockNavegador.pilha = props.screenOptions ?? null;
    return reagir.createElement(reagir.Fragment, null, props.children as never);
  };
  Stack.Screen = () => null;
  return {
    Stack,
    Redirect: () => null,
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  };
});

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hideAsync: jest.fn(async () => undefined),
}));

/** A barra do sistema guarda o estilo que recebeu, que é o que se confere. */
let mockEstiloDaBarra: string | null = null;
jest.mock("expo-status-bar", () => ({
  StatusBar: (props: { style?: string }) => {
    mockEstiloDaBarra = props.style ?? null;
    return null;
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock("../ui/fontes", () => ({
  ProvedorDeFontes: ({ children }: { children: unknown }) => children,
  useFontes: () => ({ liberado: true, prontas: true, naReserva: false }),
}));

jest.mock("../push/ProvedorDePush", () => ({
  ProvedorDePush: ({ children }: { children: unknown }) => children,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0" } },
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: async () => ({ pendentes: 0, enviando: 0, bloqueados: 0, confirmados: 0 }),
    assinar: () => () => undefined,
    drenar: async () => undefined,
  }),
  iniciarSincronizacaoContinua: () => () => undefined,
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }),
}));

const IDENTIDADE = {
  nome: "Agente de teste",
  papel: "agente_campo",
  matricula: "0001",
  organizacaoNome: "Defesa Civil de Teste",
  municipio: "Teste",
  uf: "SC",
};

jest.mock("../dados/sessao", () => ({
  ProvedorDeSessao: ({ children }: { children: unknown }) => children,
  useSessao: () => ({
    carregando: false,
    identidade: IDENTIDADE,
    lerIdentidade: () => IDENTIDADE,
    obterToken: async () => "token-de-mentira",
    sair: jest.fn(async () => undefined),
  }),
}));

import Conta from "../app/(agente)/conta";
import Raiz from "../app/_layout";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";
import { ProvedorDeTema } from "../ui/componentes";
import { temaClaro, temaEscuro } from "../ui/tokens";

const PUSH: EstadoDoPush = {
  permissao: "concedida",
  registro: null,
  pedirPermissao: jest.fn(async () => undefined),
  abrirAjustes: jest.fn(async () => undefined),
};

/**
 * A conta DENTRO do provedor de tema de verdade.
 *
 * Sem o provedor real não sobraria nada para provar: é ele que resolve a
 * preferência em tema, e é a troca do valor dele que a tela precisa refletir
 * sem ser remontada.
 */
function Cenario() {
  return (
    <ProvedorDeTema>
      <ContextoDePush.Provider value={PUSH}>
        <Conta />
      </ContextoDePush.Provider>
    </ProvedorDeTema>
  );
}

async function abrirAConta(): Promise<void> {
  await render(<Cenario />);
  await act(async () => {});
}

async function tocar(elemento: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await fireEvent.press(elemento);
  await act(async () => {});
}

/**
 * A cor do texto de um elemento desenhado pelo `Txt`.
 *
 * É por aqui que se prova qual tema está valendo NA TELA, e não num estado
 * interno: `Txt` pinta com `tema.texto`, e os dois temas têm cores diferentes.
 * Conferir o estado do provedor em vez disto deixaria passar uma tela que
 * escolhe certo e desenha errado.
 */
function corDoTexto(elemento: { props: { style?: unknown } }): unknown {
  const estilo = elemento.props.style;
  const plano = Array.isArray(estilo) ? Object.assign({}, ...estilo) : estilo;
  return (plano as { color?: unknown } | undefined)?.color;
}

beforeEach(() => {
  mockEsquemaDoSistema = "dark";
  mockGuardado = "sistema";
  mockLeituraPendurada = false;
  mockGravacoes.length = 0;
  mockEstiloDaBarra = null;
  mockNavegador.pilha = null;
});

describe("as três opções, e o padrão que continua sendo o de antes", () => {
  it("oferece acompanhar o sistema, sempre claro e sempre escuro", async () => {
    await abrirAConta();

    expect(screen.getByText("Acompanhar o sistema")).toBeTruthy();
    expect(screen.getByText("Sempre claro")).toBeTruthy();
    expect(screen.getByText("Sempre escuro")).toBeTruthy();
  });

  it("sem escolha nenhuma guardada, quem está marcado é o sistema", async () => {
    await abrirAConta();

    /*
      As três, e não só a marcada: um alternador que marca duas opções ao mesmo
      tempo (ou nenhuma) é exatamente o que "o estado atual tem que ser óbvio
      sem tocar em nada" proíbe, e conferir só a verdadeira não pegaria isso.
    */
    expect(screen.getByTestId("tema-sistema").props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId("tema-claro").props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId("tema-escuro").props.accessibilityState.checked).toBe(false);
  });

  it("acompanhar o sistema diz no que ele dá agora, sem obrigar a sair daqui", async () => {
    mockEsquemaDoSistema = "light";
    await abrirAConta();

    expect(screen.getByText("O sistema está no modo claro agora")).toBeTruthy();
  });

  it("o estado marcado chega a quem ouve a tela, e não só a quem a vê", async () => {
    mockGuardado = "claro";
    await abrirAConta();

    const escolhida = screen.getByTestId("tema-claro");
    expect(escolhida.props.accessibilityRole).toBe("radio");
    expect(escolhida.props.accessibilityState.checked).toBe(true);

    /*
      O sinal de conferido é o canal que não é cor: sem ele, quem enxerga a tela
      lavada de sol não distingue a opção escolhida das outras duas.

      A busca é DENTRO da opção, e a versão anterior desta linha procurava o
      sinal na tela inteira. Ela passava com o sinal arrancado do alternador,
      porque o chip de "avisos ligados" desenha um ✓ trinta linhas abaixo: o
      caso dizia no título que provava o segundo canal e não provava nada. A
      opção NÃO escolhida é conferida junto, senão um ✓ em todas as três
      satisfaria a linha de cima.
    */
    expect(within(escolhida).getByText("✓")).toBeTruthy();
    expect(within(screen.getByTestId("tema-escuro")).queryByText("✓")).toBeNull();
    expect(within(screen.getByTestId("tema-sistema")).queryByText("✓")).toBeNull();
  });
});

describe("a escolha do agente vence o sistema", () => {
  it("com o sistema no escuro e 'sempre claro' guardado, a tela abre clara", async () => {
    mockEsquemaDoSistema = "dark";
    mockGuardado = "claro";

    await abrirAConta();

    expect(corDoTexto(screen.getByText("Sempre claro"))).toBe(temaClaro.texto);
  });

  it("com o sistema no claro e 'sempre escuro' guardado, a tela abre escura", async () => {
    mockEsquemaDoSistema = "light";
    mockGuardado = "escuro";

    await abrirAConta();

    expect(corDoTexto(screen.getByText("Sempre escuro"))).toBe(temaEscuro.texto);
  });

  it("voltar para 'acompanhar o sistema' devolve a decisão ao aparelho", async () => {
    mockEsquemaDoSistema = "light";
    mockGuardado = "escuro";
    await abrirAConta();

    await tocar(screen.getByTestId("tema-sistema"));

    expect(corDoTexto(screen.getByText("Sempre claro"))).toBe(temaClaro.texto);
    expect(screen.getByTestId("tema-sistema").props.accessibilityState.checked).toBe(true);
  });
});

describe("a troca é imediata, e fica guardada", () => {
  it("tocar em 'sempre escuro' troca a tela no mesmo quadro, sem reabrir nada", async () => {
    mockEsquemaDoSistema = "light";
    await abrirAConta();
    expect(corDoTexto(screen.getByText("Sempre escuro"))).toBe(temaClaro.texto);

    await tocar(screen.getByTestId("tema-escuro"));

    expect(corDoTexto(screen.getByText("Sempre escuro"))).toBe(temaEscuro.texto);
    expect(screen.getByTestId("tema-escuro").props.accessibilityState.checked).toBe(true);
  });

  it("o toque grava a escolha no aparelho, e não só no estado da tela", async () => {
    await abrirAConta();

    await tocar(screen.getByTestId("tema-claro"));

    expect(mockGravacoes).toEqual(["claro"]);
  });

  /**
   * A persistência entre aberturas, provada em duas metades e não em uma.
   *
   * A metade de baixo é este caso: o toque deixa a escolha GUARDADA no
   * aparelho, e não só no estado da tela. A metade de cima é
   * "com o sistema no escuro e 'sempre claro' guardado, a tela abre clara", que
   * monta uma árvore nova lendo exatamente esse depósito. Juntas, elas dizem o
   * que uma abertura seguinte encontra.
   *
   * **Por que não um caso só, desmontando e montando de novo.** Esta versão da
   * biblioteca não suporta duas árvores no mesmo caso: a segunda `render` não
   * substitui a primeira, as consultas continuam respondendo pela árvore velha,
   * e o estrago não fica no caso, vaza para os SEGUINTES. Foi assim que três
   * casos deste arquivo passaram verdes sem montar tela nenhuma, um deles
   * afirmando no título que a abertura esperava a leitura do tema. A limitação
   * fica declarada aqui em vez de virar um verde que não prova nada.
   *
   * O caminho de verdade até o disco, esse, é provado sem React em
   * `dados/preferencia-de-tema.test.ts`, contra um SQLite de verdade.
   */
  it("o que fica guardado é o que a próxima abertura vai encontrar", async () => {
    mockEsquemaDoSistema = "dark";
    await abrirAConta();

    await tocar(screen.getByTestId("tema-claro"));

    expect(mockGuardado).toBe("claro");
  });
});

describe("a casca do aplicativo", () => {
  async function montarARaiz(): Promise<void> {
    await render(<Raiz />);
    await act(async () => {});
  }

  it("a barra de status segue o tema escolhido, e não o do sistema", async () => {
    /*
      O defeito que isto impede é texto escuro sobre barra escura: o telefone no
      modo claro, o aplicativo no escuro por escolha do agente, e a hora e a
      bateria desenhadas em preto por cima da faixa escura do aplicativo.
    */
    mockEsquemaDoSistema = "light";
    mockGuardado = "escuro";

    await montarARaiz();

    expect(mockEstiloDaBarra).toBe("light");
  });

  it("e acompanha a volta para o tema claro", async () => {
    mockEsquemaDoSistema = "dark";
    mockGuardado = "claro";

    await montarARaiz();

    expect(mockEstiloDaBarra).toBe("dark");
  });

  it("a abertura espera a leitura do tema antes de mostrar a primeira tela", async () => {
    /*
      Sem esta espera, quem escolheu claro abre o aplicativo no escuro (que é o
      padrão do provedor enquanto a leitura não voltou) e vê a tela inteira
      trocar de cor sozinha um instante depois. Trocar de cor sozinho é o que
      todo aplicativo faz quando está com defeito.
    */
    mockLeituraPendurada = true;

    await montarARaiz();

    expect(mockNavegador.pilha).toBeNull();
  });

  it("e mostra a primeira tela assim que a leitura volta", async () => {
    mockLeituraPendurada = false;

    await montarARaiz();

    expect(mockNavegador.pilha).not.toBeNull();
  });
});
