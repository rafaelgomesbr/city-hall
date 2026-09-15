/**
 * A lista de tarefas não pula, e o cartão dela tem hierarquia.
 *
 * O relato, na letra de quem abriu o aplicativo no iPhone: "a lista dá uma
 * rolada sozinha" a cada atualização. O levantamento achou TRÊS causas, e a
 * razão de este arquivo existir é que consertar uma conserta um terço:
 *
 * 1. o `RefreshControl` era ligado por atualização AUTOMÁTICA, e com
 *    `refreshing` verdadeiro sem o dedo puxando o iOS desloca o conteúdo para
 *    revelar a roda;
 * 2. sete blocos condicionais nasciam e sumiam ACIMA da lista, dentro da
 *    própria rolagem;
 * 3. a lista era `ScrollView` mais `.map()`, reconstruída a cada evento da
 *    fila, e a leitura da fila ENCURTA a lista (a devolução confirmada apaga a
 *    linha).
 *
 * O que este arquivo prova é a ESTRUTURA que evita o pulo, e não o pulo: o
 * `contentOffset` só existe no aparelho. Está dito assim de propósito, porque
 * teste que se apresenta como prova do que não prova é pior do que teste
 * nenhum.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import { fonte, temaEscuro, toque } from "../ui/tokens";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => {
  const { useEffect } = require("react") as typeof import("react");
  return {
    router: { push: jest.fn() },
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
  };
});

jest.mock("expo-crypto", () => ({
  randomUUID: () => "99999999-9999-4999-8999-999999999999",
}));

class SemSinalFalso extends Error {}
jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  enderecoDaApi: () => "https://api.exemplo",
}));

let mockTarefas: Pendencia[] = [];
let mockBaixadasEm: string | null = new Date().toISOString();
let mockTeto: number | null = null;

/**
 * A leitura do disco, controlada caso a caso.
 *
 * Um dos casos precisa de uma leitura que NUNCA termina (é o estado em que a
 * espera de abertura fica pendurada), e outro precisa contar quantas vezes a
 * tela leu. As duas coisas pedem a mesma costura aqui.
 */
let travarALeituraDoDisco = false;
const mockLerPendencias = jest.fn(async (): Promise<Pendencia[]> => {
  if (travarALeituraDoDisco) await new Promise<never>(() => {});
  return mockTarefas;
});

/** A ida à REDE, que um caso segura de propósito para olhar a roda girando. */
let soltarARede: ((tarefas: Pendencia[]) => void) | null = null;
let quebrarARede = false;
const mockAtualizarPendencias = jest.fn(async (_token: string): Promise<Pendencia[]> => {
  if (quebrarARede) throw new SemSinalFalso("sem sinal");
  if (!soltarARede) return mockTarefas;
  return new Promise<Pendencia[]>((resolve) => { soltarARede = resolve; });
});

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: () => mockLerPendencias(),
  baixadasEm: jest.fn(async () => mockBaixadasEm),
  atualizarPendencias: (token: string) => mockAtualizarPendencias(token),
  tetoAtingido: jest.fn(async () => mockTeto),
  esquecerPendencia: jest.fn(async () => {}),
}));

/* Listas vazias ESTÁVEIS: array novo a cada leitura troca o estado, que
   provoca renderização, que relê o disco, para sempre. */
const SEM_RASCUNHOS: never[] = [];
let mockRascunhos: { ocorrenciaId: string }[] = SEM_RASCUNHOS;
let mockColetas: Array<{ ocorrenciaId: string; situacao: string }> = [];

jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => mockRascunhos) }));
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
  marcarEnviada: jest.fn(async () => {}),
}));

/** Quem a tela inscreveu na fila. É por aqui que a tempestade é provocada. */
let avisarAFila: (() => void) | null = null;
/*
  Lista vazia ESTÁVEL, e ela é obrigatória aqui.

  `async () => []` devolve um array NOVO a cada leitura. Com a tela anterior a
  esta frente, isso bastava para pendurar a suíte: identidade nova vira estado
  novo, estado novo vira renderização, e a renderização recria `obterToken` no
  dublê da sessão, o que recria a leitura do disco, o que faz o efeito de foco
  rodar de novo. Laço infinito, e com temporizador falso ligado nem o teto de
  tempo do jest corre para interrompê-lo. O defeito era do dublê, mas o que ele
  estava exercitando é real: é exatamente a reconstrução à toa que a tela de
  hoje evita ao só trocar o estado quando o conteúdo muda.
*/
const SEM_ITENS: never[] = [];
const mockFila = {
  itens: async () => SEM_ITENS,
  assinar: (ouvinte: () => void) => { avisarAFila = ouvinte; return () => { avisarAFila = null; }; },
  drenar: jest.fn(async () => ({})),
  enfileirarDevolucao: jest.fn(),
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

let mockTemSinal = true;
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: mockTemSinal, tipo: mockTemSinal ? "wifi" : "nenhum" }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: { nome: "Ana Ribeiro", municipio: "Serra Alta", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";

const ID = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

const VENCIDA = new Date(Date.now() - 3 * 3_600_000).toISOString();
const NO_PRAZO = new Date(Date.now() + 9 * 3_600_000).toISOString();

function tarefa(parcial: Partial<Pendencia> = {}): Pendencia {
  return {
    id: ID,
    protocolo: "000471/2026",
    tipo: "deslizamento",
    severidade: "alta",
    endereco: "Servidão do Morro, 45",
    ponto_referencia: null,
    latitude: -27.595378,
    longitude: -48.548050,
    descricao: "Barranco escorregou sobre os fundos da casa.",
    solicitante_nome: "Maria de exemplo",
    solicitante_contato: null,
    vulnerabilidade_presente: false,
    vulnerabilidade_descricao: null,
    prazo_em: NO_PRAZO,
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

/** A rolagem, como o `RefreshControl` a enxerga. */
function aRodaDePuxar(): boolean {
  return screen.getByTestId("lista-de-tarefas").props.refreshControl.props.refreshing as boolean;
}

beforeEach(() => {
  mockTarefas = [tarefa()];
  /* Lista recém baixada: qualquer data fixa envelheceria e a faixa passaria a
     mostrar o aviso de meia hora em todo caso deste arquivo. */
  mockBaixadasEm = new Date().toISOString();
  mockTeto = null;
  mockRascunhos = SEM_RASCUNHOS;
  mockColetas = [];
  mockTemSinal = true;
  travarALeituraDoDisco = false;
  quebrarARede = false;
  soltarARede = null;
  avisarAFila = null;
  mockLerPendencias.mockClear();
  mockAtualizarPendencias.mockClear();
  mockFila.drenar.mockClear();
});

/* ============================================================
   CAUSA 1: a roda de puxar, ligada por atualização automática
   ============================================================ */

describe("a roda de puxar só responde ao dedo", () => {
  /*
    Este é o caso que reproduz o relato. Com `refreshing` verdadeiro sem o dedo
    estar puxando, o iOS empurra o `contentOffset` para revelar a roda, e a
    tela com sinal faz isso na montagem, a cada foco, a cada volta do segundo
    plano, a cada retorno de sinal e a cada 60 segundos.
  */
  it("a busca automática da montagem NÃO liga a roda", async () => {
    /* A rede fica pendurada: é exatamente a janela em que a roda apareceria. */
    soltarARede = () => {};
    await abrirALista();

    expect(mockAtualizarPendencias).toHaveBeenCalled();
    expect(aRodaDePuxar()).toBe(false);
  });

  it("o gesto de puxar liga a roda, e ela desliga quando a busca termina", async () => {
    soltarARede = () => {};
    await abrirALista();
    /* A primeira busca automática ainda está em voo, e a roda continua parada. */
    expect(aRodaDePuxar()).toBe(false);

    await act(async () => {
      screen.getByTestId("lista-de-tarefas").props.refreshControl.props.onRefresh();
    });
    expect(aRodaDePuxar()).toBe(true);

    const soltar = soltarARede;
    await act(async () => { soltar?.(mockTarefas); });
    expect(aRodaDePuxar()).toBe(false);
  });

  /*
    O botão do rodapé é um pedido do agente, mas não é o GESTO: ligar a roda
    aqui deslocaria a lista por causa de um toque dado lá embaixo, no rodapé.
    Quem dá o retorno é o próprio botão, que fica ocupado.
  */
  it("o botão 'Baixar tarefas agora' também não liga a roda", async () => {
    await abrirALista();
    soltarARede = () => {};

    await act(async () => { fireEvent.press(screen.getByText("Baixar tarefas agora")); });

    expect(aRodaDePuxar()).toBe(false);
  });
});

/* ============================================================
   CAUSA 2: os blocos que nasciam e sumiam acima da lista
   ============================================================ */

describe("nada nasce nem some acima da lista", () => {
  it("a faixa de estado tem a mesma altura com e sem aviso", async () => {
    await abrirALista();
    const calma = screen.getByTestId("faixa-de-estado").props.style.height;

    mockTeto = 20;
    await act(async () => { avisarAFila?.(); });
    const comAviso = screen.getByTestId("faixa-de-estado").props.style.height;

    expect(calma).toBe(toque);
    expect(comAviso).toBe(calma);
  });

  /*
    Sem aviso nenhum, a faixa não fica vazia esperando: ela diz o município e a
    idade da lista, que é a linha que já existia ali. É assim que a altura
    reservada não custa espaço em tela pequena.
  */
  it("sem aviso, a faixa mostra o município e a idade da lista", async () => {
    await abrirALista();

    const faixa = within(screen.getByTestId("faixa-de-estado"));
    expect(faixa.getByText(/Serra Alta, atualizada/)).toBeTruthy();
    expect(screen.queryByTestId("detalhe-da-lista")).toBeNull();
  });

  /*
    A prova estrutural: o aviso NÃO mora dentro do conteúdo rolável. Enquanto
    ele estiver lá, nascer e morrer continua empurrando a lista, com ou sem
    âncora.
  */
  it("o aviso mora fora da rolagem, e não dentro dela", async () => {
    mockTeto = 20;
    await abrirALista();

    expect(screen.getByTestId("faixa-de-estado")).toBeTruthy();
    expect(within(screen.getByTestId("lista-de-tarefas")).queryByTestId("faixa-de-estado"))
      .toBeNull();
  });

  it("o aviso mais urgente aparece na faixa, em uma linha", async () => {
    mockTeto = 20;
    await abrirALista();

    const faixa = within(screen.getByTestId("faixa-de-estado"));
    const linha = faixa.getByText(/Mostrando as 20 mais urgentes/);
    expect(linha.props.numberOfLines).toBe(1);
  });

  /*
    Reduzir sete blocos a uma faixa só valeria pouco se o oitavo aviso
    simplesmente sumisse. Ele não some: a faixa mostra o mais urgente e o `ⓘ`
    abre todos, com o texto inteiro de cada um.
  */
  it("com dois avisos ao mesmo tempo, o ⓘ abre os dois por extenso", async () => {
    mockTeto = 20;
    quebrarARede = true;
    await abrirALista();

    const faixa = within(screen.getByTestId("faixa-de-estado"));
    expect(faixa.getByText(/Sem sinal para atualizar|Não deu para atualizar agora/)).toBeTruthy();

    await tocar("detalhe-da-lista");

    const dialogo = within(screen.getByTestId("explicacao"));
    expect(dialogo.getByText(/Mostrando a lista que você já tinha baixado/)).toBeTruthy();
    expect(dialogo.getByText(/tarefas mais urgentes da sua equipe/)).toBeTruthy();
  });

  it("o aviso de nunca ter baixado continua sendo dito, e é o mais grave", async () => {
    mockBaixadasEm = null;
    mockTarefas = [];
    await abrirALista();

    expect(screen.getByText("Nenhuma tarefa baixada neste aparelho")).toBeTruthy();
    await tocar("detalhe-da-lista");
    expect(screen.getByText(/não haverá o que vistoriar lá fora/)).toBeTruthy();
  });
});

/* ============================================================
   CAUSA 3: a lista reconstruída, e encurtando, no meio da rolagem
   ============================================================ */

describe("a lista é ancorada e não se reconstrói à toa", () => {
  /*
    `maintainVisibleContentPosition` existe exatamente para o caso desta tela:
    a lista encurta sozinha quando a devolução é confirmada (a leitura da fila
    chama `esquecerPendencia`, que apaga a linha) e cresce sozinha quando chega
    despacho novo. Sem a âncora, o item que o agente está lendo escorrega.
  */
  it("a lista é uma FlatList ancorada no primeiro item visível", async () => {
    await abrirALista();

    const lista = screen.getByTestId("lista-de-tarefas");
    expect(lista.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  });

  it("cada tarefa tem chave própria e estável", async () => {
    mockTarefas = [tarefa(), tarefa({ id: OUTRO, protocolo: "000472/2026" })];
    await abrirALista();

    const lista = screen.getByTestId("lista-de-tarefas");
    expect(lista.props.data.map((t: Pendencia) => lista.props.keyExtractor(t)))
      .toEqual([ID, OUTRO]);
  });

  /*
    A fila avisa a cada mudança de estado, e uma sincronização muda vários
    itens em sequência. Sem coalescer, cada aviso disparava uma leitura inteira
    do disco e uma reconstrução da lista, todas ao mesmo tempo e terminando
    fora de ordem, com o dedo do agente em cima.
  */
  it("uma rajada de avisos da fila não vira uma leitura por aviso", async () => {
    await abrirALista();
    mockLerPendencias.mockClear();

    await act(async () => {
      avisarAFila?.();
      avisarAFila?.();
      avisarAFila?.();
      avisarAFila?.();
      avisarAFila?.();
    });

    /* Uma leitura em curso mais UMA releitura no fim, e não cinco. */
    expect(mockLerPendencias.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

/* ============================================================
   A espera de abertura, que tinha metade desligada
   ============================================================ */

describe("quem desiste de esperar a abertura tem caminho de volta", () => {
  it("passados os seis segundos, a saída existe e leva a uma tela com verbo", async () => {
    jest.useFakeTimers();
    try {
      /* Sem sinal: senão a tela sairia do estado de abertura pela REDE, e o
         caso deixaria de falar da leitura do aparelho, que é o que trava. */
      mockTemSinal = false;
      travarALeituraDoDisco = true;
      await render(<Tarefas />);
      await act(async () => {});

      await act(async () => { jest.advanceTimersByTime(6_000); });
      expect(screen.getByText("Parar de esperar")).toBeTruthy();

      await act(async () => { fireEvent.press(screen.getByText("Parar de esperar")); });

      /* A folha do componente diz "você parou a espera" e termina ali. A tela
         precisa oferecer o que fazer em seguida, e é isto que faltava. */
      expect(screen.getByTestId("tentar-abrir-de-novo")).toBeTruthy();
      expect(screen.getByText("A lista ainda não abriu")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

/* ============================================================
   O cartão, que era quatro fragmentos de 12 pontos
   ============================================================ */

describe("o cartão da tarefa tem hierarquia", () => {
  /** O RESUMO tocável do item, que é o elemento que o leitor de tela anuncia. */
  function oResumo() {
    return screen.getByTestId(`escolher-${ID}`);
  }

  /*
    A CAIXA e o CONTEÚDO deixaram de ser o mesmo elemento, e estas duas funções
    existem para dizer isso em voz alta.

    Antes o tocável era a caixa, e tudo o que não cabia dentro dele (avisos e
    botões) virava IRMÃO do cartão: aparecia solto embaixo, em largura cheia,
    como se fosse outro bloco da tela. Foi o que apareceu num iPhone, com o
    "Enviar agora" e o `ⓘ` grandes fora do cartão.

    Hoje a caixa é o item em sanfona (`ui/ItemDeTarefa.tsx`): ela desenha o
    cartão (borda, elevação, raio), o tocável cobre só o resumo, e o detalhe
    com os botões mora DENTRO da caixa, como irmão do tocável, sem ser tocável
    dentro de tocável, que disputa o gesto.
  */
  function aCaixa() {
    return screen.getByTestId(`tarefa-${ID}`);
  }

  /*
    Antes, prazo, data, vulnerabilidade e estado da coleta eram quatro
    fragmentos de `legenda` (12) no mesmo `flexWrap`, com o mesmo peso:
    "Vencido há 3h" pesava igual a "10/09, 14:00".
  */
  it("o prazo é maior que a data que o acompanha", async () => {
    mockTarefas = [tarefa({ prazo_em: VENCIDA })];
    await abrirALista();

    const prazo = screen.getByText(/Vencido há/);
    const data = screen.getByText(/^\d{2}\/\d{2}, \d{2}:\d{2}$/);
    expect(prazo.props.style.fontSize).toBe(fonte.corpoP);
    expect(data.props.style.fontSize).toBe(fonte.legenda);
    expect(prazo.props.style.fontSize).toBeGreaterThan(data.props.style.fontSize);
  });

  it("o prazo vencido sai na cor de perigo, e nunca só na cor", async () => {
    mockTarefas = [tarefa({ prazo_em: VENCIDA })];
    await abrirALista();

    /* A palavra "Vencido" está escrita, e o ícone de relógio estourado
       acompanha: quem não distingue a cor continua sabendo. */
    expect(screen.getByText(/^Vencido há/).props.style.color).toBe(temaEscuro.perigoTexto);
  });

  /*
    A BORDA ACESA TEM UM SIGNIFICADO SÓ: o item está ABERTO.

    Ela já acendeu para "começada" E para "coletada", que são estados opostos
    (trabalho pela metade e trabalho pronto), e depois só para "começada".
    Com a lista em sanfona, o contorno que engrossa e acende é o do item
    expandido, e "vistoria começada" fala pelo chip dele: uma borda que
    acendesse para duas coisas não diria nenhuma. Os dois casos abaixo
    fixam isso pelos dois lados.
  */
  it("a borda de destaque acende no item aberto, e a vistoria começada fala pelo chip", async () => {
    mockRascunhos = [{ ocorrenciaId: ID }];
    await abrirALista();

    /* A única tarefa é a sugerida, e a sugerida entra aberta. */
    expect(aCaixa().props.style.borderColor).toBe(temaEscuro.destaque);
    expect(screen.getByText("Vistoria começada")).toBeTruthy();

    /* Recolhida, a borda apaga, e o chip continua dizendo que começou. */
    await act(async () => { fireEvent.press(oResumo()); });
    expect(aCaixa().props.style.borderColor).toBe(temaEscuro.borda);
    expect(screen.getByText("Vistoria começada")).toBeTruthy();
  });

  it("a borda de destaque NÃO acende na tarefa já coletada só por estar coletada", async () => {
    /*
      Duas tarefas, e a coletada vai para o fim da ordem do dia (fechada): se
      a borda dela acender, é por outro motivo que não o item aberto.
    */
    mockTarefas = [tarefa({ prazo_em: VENCIDA }), tarefa({ id: OUTRO, protocolo: "000472/2026" })];
    mockColetas = [{ ocorrenciaId: OUTRO, situacao: "na_fila" }];
    await abrirALista();

    expect(screen.getByTestId(`tarefa-${OUTRO}`).props.style.borderColor).toBe(temaEscuro.borda);
    /* E ela continua dizendo que foi coletada, em chip e não em 12 pontos. */
    expect(screen.getByText("Coletada, aguardando envio")).toBeTruthy();
  });

  it("a vulnerabilidade social chega a quem ouve a tela", async () => {
    mockTarefas = [tarefa({ vulnerabilidade_presente: true })];
    await abrirALista();

    expect(screen.getByText("Vulnerabilidade social")).toBeTruthy();
    expect(oResumo().props.accessibilityLabel).toContain("Vulnerabilidade social");
  });

  /*
    O estado vazio desta lista é a resposta final para "o meu trabalho
    chegou?", e era uma frase cinza sem saída nenhuma.
  */
  it("a lista vazia tem ícone e um verbo", async () => {
    mockTarefas = [];
    await abrirALista();

    expect(screen.getByText("Nenhuma vistoria designada")).toBeTruthy();
    expect(screen.getByTestId("procurar-tarefas")).toBeTruthy();
  });
});
