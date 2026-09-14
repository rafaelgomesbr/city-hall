/**
 * "HOJE": duas lentes da mesma lista, e a ordem do dia.
 *
 * Três coisas são medidas aqui, e as três são de TELA (o critério da ordem em
 * si é medido em `src/dados/ordem-do-dia.test.ts`, sem montar árvore nenhuma):
 *
 * 1. **Lista e mapa são a mesma lista.** Foi decidido contra a aba própria de
 *    mapa porque duas telas dizendo "minhas tarefas" podem discordar, então o
 *    caso que importa é justamente o que compara as duas lentes item a item.
 * 2. **A lista continua não pulando depois da ida e da volta.** As três
 *    medidas contra o pulo (roda só no dedo, cabeçalho fora da rolagem com
 *    altura reservada, e a âncora da `FlatList`) são estruturais: trocar de
 *    lente desmonta a lista, e o caso prova que ela volta com as três.
 * 3. **A tela não afirma o que não mediu.** Sem GPS não há distância em
 *    lugar nenhum, e a sugestão do dia diz em voz alta que a ordem não
 *    considerou caminho. Este é o caso que a revisão desta onda mais cobra:
 *    o irmão dele, noutra frente, passava verde com a seta apontando para o
 *    norte sem GPS nenhum.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import { toque } from "../ui/tokens";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

const mockEmpurrar = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = require("react") as typeof import("react");
  return {
    router: { push: (...args: unknown[]) => mockEmpurrar(...args) },
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
  };
});

jest.mock("expo-crypto", () => ({
  randomUUID: () => "99999999-9999-4999-8999-999999999999",
}));

/*
  A LOCALIZAÇÃO, com os dois caminhos separados de propósito.

  `mockPedirPermissao` é o que a tela NÃO pode chamar: abrir a lista de tarefas e
  levar um pedido de localização na cara é o jeito mais rápido de o agente
  negar para sempre. `permissaoAtual` é a que ela lê, e `mockUltimaPosicao` é a
  única fonte de coordenada desta tela.
*/
let mockPermissaoConcedida = false;
let mockUltimaPosicao: { coords: { latitude: number; longitude: number } } | null = null;
const mockPedirPermissao = jest.fn(async () => ({ granted: true }));
jest.mock("expo-location", () => ({
  __esModule: true,
  getForegroundPermissionsAsync: async () => ({ granted: mockPermissaoConcedida }),
  getLastKnownPositionAsync: async () => mockUltimaPosicao,
  requestForegroundPermissionsAsync: () => mockPedirPermissao(),
  Accuracy: { High: 4 },
}));

/*
  `enderecoDaApi` vazio é o que mantém este arquivo 100% offline: sem base, a
  busca da autorização do mapa devolve vazio sem tocar na rede, e
  `decidirModoDoMapa` escolhe o plano esquemático, que é o caminho que não
  depende de ladrilho nenhum.
*/
jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  enderecoDaApi: () => "",
}));

let mockTarefas: Pendencia[] = [];
const mockBaixadasEm = { valor: new Date().toISOString() };

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => mockBaixadasEm.valor),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
  esquecerPendencia: jest.fn(async () => {}),
}));

/* Listas vazias ESTÁVEIS: array novo a cada leitura troca o estado, que
   provoca renderização, que relê o disco, para sempre. */
const SEM_RASCUNHOS: never[] = [];
let mockColetas: Array<{ ocorrenciaId: string; situacao: string; coletadaEm?: string }> = [];
jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => SEM_RASCUNHOS) }));
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
  marcarEnviada: jest.fn(async () => {}),
}));

const SEM_ITENS: never[] = [];
const mockFila = {
  itens: async () => SEM_ITENS,
  assinar: () => () => {},
  drenar: jest.fn(async () => ({})),
  enfileirarDevolucao: jest.fn(),
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "wifi" }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: { nome: "Ana Ribeiro", municipio: "Serra Alta", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";
import { FRACAO_DA_POSICAO } from "../ui/FolhaArrastavel";
import { espaco } from "../ui/tokens";

const HORA = 3_600_000;
/** A base da equipe. Tudo o mais é medido a partir daqui. */
const AQUI = { latitude: -27.595378, longitude: -48.548050 };
const daquiAMetros = (metros: number) => ({
  latitude: AQUI.latitude + metros / 111_000,
  longitude: AQUI.longitude,
});

function tarefa(parcial: Partial<Pendencia> & { id: string }): Pendencia {
  return {
    protocolo: `0004${parcial.id}/2026`,
    tipo: "deslizamento",
    severidade: "media",
    endereco: "Servidão do Morro, 45",
    ponto_referencia: null,
    latitude: null,
    longitude: null,
    descricao: "Barranco escorregou sobre os fundos da casa.",
    solicitante_nome: "Maria de exemplo",
    solicitante_contato: null,
    vulnerabilidade_presente: false,
    vulnerabilidade_descricao: null,
    prazo_em: new Date(Date.now() + 9 * HORA).toISOString(),
    criado_em: "2026-09-13T09:00:00.000Z",
    ...parcial,
  } as Pendencia;
}

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
}

async function tocar(id: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByTestId(id)); });
}

/** Mede as duas áreas que só existem depois do primeiro `onLayout`. */
async function medirAsAreas(altura = 800): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId("area-do-mapa"), "layout", {
      nativeEvent: { layout: { height: altura, width: 400, x: 0, y: 0 } },
    });
    fireEvent(screen.getByTestId("folha-de-hoje-area"), "layout", {
      nativeEvent: { layout: { height: altura, width: 400, x: 0, y: 0 } },
    });
  });
}

/** A ordem dos cartões da lente de lista, por identificador de ocorrência. */
function aOrdemDaLista(): string[] {
  return screen
    .getAllByTestId(/^cartao-/)
    .map((no) => String(no.props.testID).replace("cartao-", ""));
}

/** A ordem das linhas da folha, na lente do mapa. */
function aOrdemDaFolha(): string[] {
  return screen
    .getAllByTestId(/^focar-/)
    .map((no) => String(no.props.testID).replace("focar-", ""));
}

function aRodaDePuxar(): boolean {
  return screen.getByTestId("lista-de-tarefas").props.refreshControl.props.refreshing as boolean;
}

beforeEach(() => {
  mockTarefas = [tarefa({ id: "1" })];
  mockBaixadasEm.valor = new Date().toISOString();
  mockColetas = [];
  mockPermissaoConcedida = false;
  mockUltimaPosicao = null;
  mockEmpurrar.mockClear();
  mockPedirPermissao.mockClear();
});

/* ============================================================
   As duas lentes, e a única lista
   ============================================================ */

describe("lista e mapa são duas lentes da mesma lista", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "folgada", severidade: "media", prazo_em: new Date(Date.now() + 40 * HORA).toISOString() }),
      tarefa({ id: "critica", severidade: "critica", prazo_em: new Date(Date.now() + 30 * HORA).toISOString() }),
      tarefa({ id: "vencida", severidade: "baixa", prazo_em: new Date(Date.now() - 5 * HORA).toISOString() }),
    ];
  });

  it("a tela abre na lente de lista, e o mapa não existe até alguém pedir", async () => {
    await abrirALista();

    expect(screen.getByTestId("lista-de-tarefas")).toBeTruthy();
    expect(screen.queryByTestId("area-do-mapa")).toBeNull();
  });

  /*
    O caso que justifica a decisão de produto. Se as duas lentes pudessem
    divergir, o agente teria duas respostas para "minhas tarefas" e acreditaria
    na que estivesse na tela.
  */
  it("as duas lentes mostram as MESMAS tarefas, na MESMA ordem", async () => {
    await abrirALista();
    const naLista = aOrdemDaLista();

    await tocar("lente-mapa");
    await medirAsAreas();

    expect(aOrdemDaFolha()).toEqual(naLista);
    expect(naLista).toEqual(["critica", "vencida", "folgada"]);
  });

  it("a contagem do cabeçalho é a mesma nas duas lentes, e não conta duas vezes", async () => {
    await abrirALista();
    const naLista = screen.getByTestId("quantas-vistorias").props.accessibilityLabel;

    await tocar("lente-mapa");
    await medirAsAreas();

    expect(screen.getByTestId("quantas-vistorias").props.accessibilityLabel).toBe(naLista);
    expect(naLista).toBe("3, vistorias para fazer");
  });
});

/* ============================================================
   A lista continua não pulando depois da ida e da volta
   ============================================================ */

describe("ir ao mapa e voltar não desfaz nenhuma das três medidas contra o pulo", () => {
  async function irAoMapaEVoltar(): Promise<void> {
    await tocar("lente-mapa");
    await medirAsAreas();
    expect(screen.queryByTestId("lista-de-tarefas")).toBeNull();
    await tocar("lente-lista");
  }

  it("a roda de puxar volta desligada, e continua respondendo só ao dedo", async () => {
    await abrirALista();
    await irAoMapaEVoltar();

    expect(aRodaDePuxar()).toBe(false);

    /* O botão do rodapé é um pedido, e não o GESTO: ligar a roda aqui
       deslocaria a lista por causa de um toque dado lá embaixo. */
    await act(async () => { fireEvent.press(screen.getByText("Baixar tarefas agora")); });
    expect(aRodaDePuxar()).toBe(false);
  });

  it("a âncora da lista volta com a lista", async () => {
    await abrirALista();
    await irAoMapaEVoltar();

    expect(screen.getByTestId("lista-de-tarefas").props.maintainVisibleContentPosition)
      .toEqual({ minIndexForVisible: 0 });
  });

  it("o cabeçalho continua FORA da rolagem, e a faixa continua com altura reservada", async () => {
    await abrirALista();
    await irAoMapaEVoltar();

    const lista = screen.getByTestId("lista-de-tarefas");
    const faixa = screen.getByTestId("faixa-de-estado");

    expect(faixa.props.style.height).toBe(toque);
    /*
      E ela não está DENTRO da lista, que é a metade estrutural da correção:
      um aviso que rola junto é um aviso que empurra o conteúdo quando nasce.
    */
    expect(within(lista).queryByTestId("faixa-de-estado")).toBeNull();
  });

  /*
    O seletor de lente mora no cabeçalho fixo, e não flutuando sobre o mapa: um
    botão que some quando a folha sobe faria o agente perder o caminho de volta
    para a lista.
  */
  it("o seletor das lentes existe nas DUAS lentes", async () => {
    await abrirALista();
    expect(screen.getByTestId("lente-mapa")).toBeTruthy();

    await tocar("lente-mapa");
    await medirAsAreas();

    expect(screen.getByTestId("lente-lista")).toBeTruthy();
    expect(screen.getByTestId("lente-mapa").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("lente-lista").props.accessibilityState.selected).toBe(false);
  });
});

/* ============================================================
   A ordem do dia, na tela
   ============================================================ */

describe("a ordem do dia aparece como a primeira da lista, e não como um bloco acima dela", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "vencida", severidade: "media", prazo_em: new Date(Date.now() - 5 * HORA).toISOString() }),
      tarefa({ id: "critica", severidade: "critica", prazo_em: new Date(Date.now() + 30 * HORA).toISOString() }),
    ];
  });

  it("a severidade crítica com folga de prazo abre a lista, à frente da vencida", async () => {
    await abrirALista();

    expect(aOrdemDaLista()).toEqual(["critica", "vencida"]);
  });

  it("só a PRIMEIRA carrega o rótulo e o porquê", async () => {
    await abrirALista();

    /*
      A primeira DA LISTA, e não apenas a que a ordem escolheu: sem esta linha o
      caso passaria verde com o rótulo desenhado no meio da tela, sobre um
      cartão que o agente só vê rolando. Foi assim que este caso reprovou contra
      a ordenação antiga.
    */
    expect(aOrdemDaLista()[0]).toBe("critica");
    expect(screen.getAllByTestId("comece-por-aqui")).toHaveLength(1);
    expect(within(screen.getByTestId("cartao-critica")).getByTestId("comece-por-aqui")).toBeTruthy();
    expect(within(screen.getByTestId("cartao-vencida")).queryByTestId("comece-por-aqui")).toBeNull();
  });

  /*
    A frase do porquê é a mesma que a folha do mapa mostra no cabeçalho: uma
    fonte só, e não duas que divergem no dia em que alguém mexer numa delas.
  */
  it("o porquê é o mesmo texto nas duas lentes", async () => {
    await abrirALista();
    const naLista = within(screen.getByTestId("comece-por-aqui")).getAllByText(/./)
      .map((t) => t.props.children).join(" | ");

    await tocar("lente-mapa");
    await medirAsAreas();
    const naFolha = within(screen.getByTestId("folha-de-hoje-cabecalho")).getAllByText(/./)
      .map((t) => t.props.children).join(" | ");

    expect(naFolha).toBe(naLista);
    expect(naLista).toContain("Severidade crítica");
  });

  /*
    A tarefa que este aparelho já vistoriou desce para o fim: o que falta nela
    não é ir lá, é sinal. E ela NÃO sai da lista, porque sair seria perder de
    vista trabalho que o servidor não recebeu.
  */
  it("a tarefa já coletada desce para o fim, e continua na lista", async () => {
    /*
      A entrada vem com a coletada PRIMEIRO, de propósito: se ela já chegasse do
      disco no fim, o caso passaria verde sem a regra mexer em nada, que é
      exatamente o tipo de caso que não sabe falhar.
    */
    mockTarefas = [
      tarefa({ id: "critica", severidade: "critica", prazo_em: new Date(Date.now() + 30 * HORA).toISOString() }),
      tarefa({ id: "vencida", severidade: "media", prazo_em: new Date(Date.now() - 5 * HORA).toISOString() }),
    ];
    mockColetas = [{ ocorrenciaId: "critica", situacao: "aguardando" }];
    await abrirALista();

    expect(aOrdemDaLista()).toEqual(["vencida", "critica"]);
  });
});

/* ============================================================
   O caso sem GPS, que é o comum
   ============================================================ */

describe("sem GPS a tela não inventa distância, e diz isso", () => {
  beforeEach(() => {
    /* A longe vem PRIMEIRO do disco: assim a ordem só sai certa se a distância
       tiver de fato decidido, e não por o disco já estar do jeito esperado. */
    mockTarefas = [
      tarefa({ id: "longe", severidade: "media", ...daquiAMetros(12_000) }),
      tarefa({ id: "perto", severidade: "media", ...daquiAMetros(400) }),
    ];
  });

  it("sem permissão, nenhuma distância aparece e a ordem diz que não considerou caminho", async () => {
    mockPermissaoConcedida = false;
    await abrirALista();

    /* Nenhuma medida de distância, em nenhuma unidade e em nenhuma frase. O
       padrão é o da medida, e não a palavra "você": a frase honesta do aviso
       também tem "você", e conferir só isso passaria verde por cima dela. */
    expect(screen.queryAllByText(/\d+\s?(m|km)\b/)).toHaveLength(0);
    expect(screen.getByText(/não considerou distância/)).toBeTruthy();
  });

  /*
    A OUTRA METADE, e é ela que impede este arquivo de passar verde por acaso.
    Se a tela inventasse uma origem qualquer, o caso acima continuaria
    reprovando; se ela ignorasse a posição de verdade, é este que reprova.
  */
  it("com a última posição conhecida, a distância aparece e o aviso some", async () => {
    mockPermissaoConcedida = true;
    mockUltimaPosicao = { coords: AQUI };
    await abrirALista();

    expect(screen.queryByText(/não considerou distância/)).toBeNull();
    expect(screen.getByText("a 401 m")).toBeTruthy();
    expect(aOrdemDaLista()).toEqual(["perto", "longe"]);
  });

  it("a lista NÃO pede permissão de localização: quem pede é a vistoria", async () => {
    mockPermissaoConcedida = false;
    await abrirALista();

    expect(mockPedirPermissao).not.toHaveBeenCalled();
  });

  /*
    Permissão concedida e nenhuma posição guardada é o aparelho que acabou de
    ser ligado. A resposta certa é a mesma de não ter permissão: não afirmar
    nada sobre caminho.
  */
  it("permissão sem posição guardada cai no mesmo caminho honesto", async () => {
    mockPermissaoConcedida = true;
    mockUltimaPosicao = null;
    await abrirALista();

    expect(screen.getByText(/não considerou distância/)).toBeTruthy();
    expect(screen.queryAllByText(/\d+\s?(m|km)\b/)).toHaveLength(0);
  });
});

/* ============================================================
   A folha sobre o mapa
   ============================================================ */

describe("na lente do mapa, a folha é o roteiro e o rodapé é quem abre", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "primeira", severidade: "critica", ...daquiAMetros(200) }),
      tarefa({ id: "segunda", severidade: "media", ...daquiAMetros(3_000) }),
    ];
  });

  /*
    Tocar numa linha da folha NÃO abre a vistoria. Se abrisse, a lente do mapa
    seria uma lista com um mapa atrás, e o agente não teria como olhar onde fica
    a segunda tarefa sem sair da tela.
  */
  it("tocar numa linha escolhe a tarefa do mapa, e não navega", async () => {
    await abrirALista();
    await tocar("lente-mapa");
    await medirAsAreas();

    await tocar("focar-segunda");

    expect(mockEmpurrar).not.toHaveBeenCalled();
    expect(screen.getByTestId("focar-segunda").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("focar-primeira").props.accessibilityState.selected).toBe(false);
  });

  /*
    E a folha desce ao escolher: escolher um pino e continuar olhando para a
    folha que o cobre não é escolher nada. É esta linha que justifica a folha
    ser controlada pela tela, e não dona da própria posição.
  */
  it("escolher uma tarefa desce a folha para meia altura, descobrindo o mapa", async () => {
    await abrirALista();
    await tocar("lente-mapa");
    await medirAsAreas();

    await act(async () => {
      fireEvent(screen.getByTestId("folha-de-hoje-alca"), "press");
    });
    expect(screen.getByTestId("folha-de-hoje-alca").props.accessibilityValue.text)
      .toBe("expandida");

    await tocar("focar-segunda");

    expect(screen.getByTestId("folha-de-hoje-alca").props.accessibilityValue.text)
      .toBe("meia altura");
  });

  it("quem abre a vistoria é a ação primária do rodapé, e ela abre a ESCOLHIDA", async () => {
    await abrirALista();
    await tocar("lente-mapa");
    await medirAsAreas();

    await tocar("focar-segunda");
    await act(async () => { fireEvent.press(screen.getByTestId("abrir-a-focada")); });

    expect(mockEmpurrar).toHaveBeenCalledWith({
      pathname: "/(agente)/vistoria/[id]",
      params: { id: "segunda" },
    });
  });

  /*
    Sem coordenada não há mapa, e não há mapa DE VERDADE: inventar um centro no
    meio do município mostraria um pino numa casa que não é a da ocorrência.
  */
  it("a tarefa sem coordenada não vira um pino inventado", async () => {
    mockTarefas = [tarefa({ id: "sem-ponto", latitude: null, longitude: null })];
    await abrirALista();
    await tocar("lente-mapa");
    await medirAsAreas();

    expect(screen.getByText("Esta tarefa não tem coordenada")).toBeTruthy();
  });

  it("sem tarefa nenhuma, a lente do mapa diz o mesmo que a lista vazia diz", async () => {
    mockTarefas = [];
    await abrirALista();
    await tocar("lente-mapa");
    await medirAsAreas();

    expect(screen.getByText("Nenhuma vistoria designada")).toBeTruthy();
  });
});

/** Quanto o desenho do mapa está reservando embaixo, em pontos. */
function recuoDoPlano(): number {
  const area = screen.getByTestId("area-do-plano");
  return Object.assign(
    {}, ...[area.props.style].flat().filter(Boolean),
  ).paddingBottom as number;
}

describe("O mapa sabe o que a folha está cobrindo", () => {
  beforeEach(() => {
    mockTarefas = [tarefa({ id: "primeira", severidade: "critica", ...daquiAMetros(200) })];
  });

  /*
    A folha fica POR CIMA do mapa, e o mapa ocupa a área inteira: sem dizer a
    ele quanto está coberto, o pino é centralizado na moldura toda, ou seja,
    atrás da folha. O agente arrasta a folha para baixo justamente para ver
    onde a casa fica, e o que encontra é o mapa olhando para outro lugar.

    A conta é a altura da área vezes a fração da posição, que é a MESMA fração
    com que a folha se desenha: dois números para a mesma coisa é como as duas
    peças passam a discordar na primeira vez que alguém mexer numa delas.
  */
  it("em meia altura, o mapa reserva a faixa que a folha ocupa", async () => {
    await abrirALista();
    await tocar("lente-mapa");
    await medirAsAreas(800);

    /*
      Este arquivo roda inteiro no PLANO ESQUEMÁTICO, porque `enderecoDaApi` é
      vazio aqui e `decidirModoDoMapa` recusa o Google sem autorização. Não é
      um caminho de segunda: é o mapa do agente SEM SINAL, que é quando o mapa
      mais faz falta, e é o desenho que centra os dois pontos na área que sobra.
    */
    expect(recuoDoPlano()).toBe(800 * FRACAO_DA_POSICAO.meia + espaco.e3);
  });

  it("a folha subindo aumenta o que o mapa reserva", async () => {
    await abrirALista();
    await tocar("lente-mapa");
    await medirAsAreas(800);

    const emMeia = recuoDoPlano();

    await act(async () => {
      fireEvent(screen.getByTestId("folha-de-hoje-alca"), "press");
    });

    const emCheia = recuoDoPlano();
    expect(emCheia).toBeGreaterThan(emMeia);
  });
});
