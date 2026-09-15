/**
 * A TELA DO MAPA, que agora é uma tela e não uma lente.
 *
 * O relato de quem paga, na letra dele: "o botão mapa dentro da tela tarefas
 * ficou zuado demais, por quê? Porque surge um bottom-sheet com as tarefas e
 * outro com o mapa por cima". Eram duas folhas empilhadas na mesma tela, e a de
 * cima cobria justamente o que a de baixo existia para mostrar.
 *
 * O que estes casos travam, e cada um responde a um medo que já estava escrito
 * no código antes desta frente:
 *
 * 1. **As duas telas mostram a MESMA lista.** Era o argumento contra a aba
 *    própria ("mapa não é lugar aonde se vai"), e ele continua de pé: a defesa
 *    mudou de forma, não de conteúdo. As duas telas consomem `ordemDoDia` sobre
 *    a mesma leitura de disco, e quem compara as duas item a item é
 *    `hoje-lista-e-mapa.test.tsx`, que é onde essa comparação sempre morou.
 * 2. **O pino leva criticidade, e nunca só em cor.** Cor, forma e legenda
 *    visível na tela, e o toque abre o `SeloSeveridade`, que tem ícone e
 *    palavra. É a regra da casa cumprida por três canais, e não afrouxada.
 * 3. **Sem GPS não há distância nem rumo, e a tela diz isso.** É a mesma
 *    honestidade da lista: o que não foi medido não aparece, e a ausência é
 *    dita em voz alta em vez de virar um campo vazio.
 * 4. **Coordenada 0,0 não é ponto.** A ilha nula fica a seis mil quilômetros de
 *    qualquer município brasileiro, e `pontoQueSeMede` a recusa. Um pino ali
 *    seria o mapa afirmando um lugar que ninguém informou.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";

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

/*
  A LOCALIZAÇÃO, com os dois caminhos separados, como na tela de tarefas.

  `mockPedirPermissao` é o que esta tela NÃO pode chamar: quem pede permissão é
  a vistoria, onde a coordenada é prova e o agente sabe por que está dando.
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

jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  enderecoDaApi: () => "",
}));

/*
  A AUTORIZAÇÃO DO MUNICÍPIO, ligada e desligada por caso.

  Vazia é o padrão, e é o caminho que roda 100% offline: `decidirModoDoMapa`
  escolhe o plano esquemático, que é o mapa do agente SEM SINAL. O bloco do
  Google liga as duas pontas (a chave da API e a do binário) para provar que o
  pino de criticidade também vai para o marcador de verdade, e não só para o
  desenho de reserva.
*/
let mockChaveDoMunicipio = "";
jest.mock("../dados/mapa", () => ({
  ...(jest.requireActual("../dados/mapa") as object),
  buscarAutorizacaoDoMapa: async () => mockChaveDoMunicipio !== "",
  chaveDoMapaDoBuild: () => mockChaveDoMunicipio,
}));

let mockTarefas: Pendencia[] = [];
/*
  A HORA DA BAIXA É UM VALOR FIXO, e isso não é detalhe de escrita.

  A tela de tarefas (que este arquivo monta para comparar com a do mapa) relê o
  disco a cada mudança de identidade do que a sessão devolve, e a sessão dublada
  devolve objeto novo a cada renderização. Enquanto o disco responde os MESMOS
  valores, o estado não muda e a releitura para sozinha. Com `new Date()` aqui,
  cada leitura devolvia uma hora diferente, o estado mudava, a tela renderizava,
  relia o disco, e o caso morria por tempo esgotado (ou, com o arquivo inteiro,
  por falta de memória). É a mesma armadilha que `hoje-o-mapa-nao-mente.test.tsx`
  já documenta para o objeto da sessão.
*/
const mockBaixadasEm = new Date().toISOString();
jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => mockBaixadasEm),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
  esquecerPendencia: jest.fn(async () => {}),
}));

/* Listas vazias ESTÁVEIS: array novo a cada leitura troca o estado, que
   provoca renderização, que relê o disco, para sempre. */
const SEM_RASCUNHOS: never[] = [];
let mockColetas: Array<{ ocorrenciaId: string; situacao: string }> = [];
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

let mockTemSinal = true;
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: mockTemSinal, tipo: "wifi" }),
}));

/*
  O CAMINHO POR RUAS, dublado na fronteira da tela.

  O que `verOCaminho` faz por dentro (a chamada à API do produto, a
  decodificação, o guardado por tarefa) tem arquivo próprio,
  `dados/rota.test.ts`. O que se pergunta AQUI é o que a TELA faz com cada
  resposta: desenha a linha e diz a frase, ou explica em uma linha por que não.
*/
let mockVerOCaminho: jest.Mock;
jest.mock("../dados/rota", () => ({
  ...(jest.requireActual("../dados/rota") as object),
  verOCaminho: (...args: unknown[]) => mockVerOCaminho(...args),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: { nome: "Ana Ribeiro", municipio: "Serra Alta", uf: "SC" },
  }),
}));

import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import Mapa from "../app/(agente)/mapa";
import { CaminhoIndisponivel } from "../dados/rota";
import { LADO_MAXIMO_DO_MAPA, ladoDoMapa } from "../ui/mapa/lado";
import { espaco } from "../ui/tokens";
import { limparMapaDublado, mapaDublado } from "../../__mocks__/react-native-maps";

const HORA = 3_600_000;
/** A base da equipe. Tudo o mais é medido a partir daqui. */
const AQUI = { latitude: -27.595378, longitude: -48.548050 };
/** Ao NORTE da base, pela latitude, para o rumo sair previsível. */
const aoNorte = (metros: number) => ({
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

async function abrirOMapa(): Promise<void> {
  await render(<Mapa />);
  await act(async () => {});
  /* Esperar a LISTA, e não um número de quadros: a tela abre do disco, e
     quantos ciclos essa leitura leva não é contrato de tela nenhum. */
  await screen.findByTestId("lista-do-mapa");
}

async function tocar(id: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByTestId(id)); });
}

/** A ordem dos pinos do mapa, por identificador de ocorrência. */
function aOrdemDosPinos(): string[] {
  return screen
    .getAllByTestId(/^pino-/)
    .map((no) => String(no.props.testID).replace("pino-", ""));
}

/** A ordem das linhas da lista da tela do mapa. */
function aOrdemDaLista(): string[] {
  return screen
    .getAllByTestId(/^escolher-/)
    .map((no) => String(no.props.testID).replace("escolher-", ""));
}

beforeEach(() => {
  mockTarefas = [tarefa({ id: "1" })];
  mockColetas = [];
  mockPermissaoConcedida = false;
  mockUltimaPosicao = null;
  mockChaveDoMunicipio = "";
  mockTemSinal = true;
  mockVerOCaminho = jest.fn(async () => ({
    caminho: { duracaoSegundos: 846, distanciaMetros: 4213, pontos: [AQUI, aoNorte(200), aoNorte(400)] },
    guardado: false,
  }));
  mockEmpurrar.mockClear();
  mockPedirPermissao.mockClear();
  limparMapaDublado();
});

/**
 * As rolagens montadas, pelo elemento NATIVO que o dublê do React Native
 * desenha (`RCTScrollView`): o renderizador de teste só expõe elementos de
 * host, então é pelo tipo nativo que se conta quantas rolagens a tela tem.
 */
function rolagens() {
  return screen.container.queryAll((no) => no.type === "RCTScrollView");
}

/** O estilo achatado de um nó, para ler uma propriedade de leiaute. */
function estiloDe(no: { props: { style?: unknown; contentContainerStyle?: unknown } }, qual: "style" | "contentContainerStyle" = "style"): Record<string, unknown> {
  return Object.assign({}, ...[no.props[qual]].flat(Number.POSITIVE_INFINITY).filter(Boolean));
}

/* ============================================================
   A tela inteira rola, e o mapa é um quadrado
   ============================================================ */

describe("a tela inteira rola, numa rolagem só", () => {
  /*
    O RECLAME, na letra de quem paga: "não tem scroll na tela, tá travada". A
    tela era quatro faixas fixas e só a lista rolava: arrastar em cima do mapa,
    do cartão ou do cabeçalho não movia nada. Agora existe UMA rolagem, e tudo
    está dentro dela.
  */
  beforeEach(() => {
    mockPermissaoConcedida = true;
    mockUltimaPosicao = { coords: AQUI };
    mockTarefas = [
      tarefa({ id: "a", severidade: "critica", ...aoNorte(400) }),
      tarefa({ id: "b", severidade: "baixa", ...aoNorte(900) }),
    ];
  });

  it("há uma ScrollView só, e cabeçalho, mapa, cartão e lista estão dentro dela", async () => {
    await abrirOMapa();
    const todas = rolagens();
    /* Duas rolagens seria a lista rolando sozinha de novo. */
    expect(todas).toHaveLength(1);
    expect(todas[0]?.props["testID"]).toBe("tela-do-mapa");

    const tela = screen.getByTestId("tela-do-mapa");
    for (const id of ["quantas-no-mapa", "area-do-mapa", "cartao-da-escolhida", "lista-do-mapa"]) {
      expect(within(tela).getByTestId(id)).toBeTruthy();
    }
  });

  it("o fim da rolagem reserva a altura do menu flutuante", async () => {
    /*
      Outra frente está tornando o menu flutuante: ele passa a pairar sobre a
      tela em vez de ser irmão dela no leiaute. Sem a folga, a última linha da
      lista fica escondida atrás do menu para sempre, e é justamente a tarefa
      mais longe, que é a que o agente menos lembra.
    */
    await render(
      <BottomTabBarHeightContext.Provider value={84}>
        <Mapa />
      </BottomTabBarHeightContext.Provider>,
    );
    await act(async () => {});
    await screen.findByTestId("lista-do-mapa");
    const rolagem = rolagens()[0]!;
    const folga = Number(estiloDe(rolagem, "contentContainerStyle").paddingBottom);
    expect(folga).toBeGreaterThanOrEqual(84 + espaco.e4);
  });

  it("sem o contexto do menu, a tela abre do mesmo jeito, com a folga mínima", async () => {
    await abrirOMapa();
    const rolagem = rolagens()[0]!;
    const folga = Number(estiloDe(rolagem, "contentContainerStyle").paddingBottom);
    expect(folga).toBeGreaterThanOrEqual(espaco.e4);
  });

  it("o mapa é um quadrado: a largura útil da tela por altura igual", async () => {
    /*
      "A área que o mapa ocupa na tela também é pequena, eu imaginava pelo menos
      um quadrado perfeito." Era 38% da altura da tela, com a legenda de
      criticidade e a de modo DENTRO dessa altura. Agora o lado é a largura da
      tela menos o recuo, e as legendas ficam embaixo, fora do quadrado.
    */
    await abrirOMapa();
    const moldura = screen.getByTestId("moldura-do-mapa");
    const estilo = estiloDe(moldura);
    const { width } = require("react-native").Dimensions.get("window") as { width: number };
    const lado = ladoDoMapa(width);
    expect(estilo.height).toBe(lado);
    expect(lado).toBe(Math.min(LADO_MAXIMO_DO_MAPA, width - 2 * espaco.e4));
    expect(lado).toBeGreaterThan(0);
  });

  it("num tablet o quadrado tem teto, e continua quadrado", () => {
    expect(ladoDoMapa(1024)).toBe(LADO_MAXIMO_DO_MAPA);
    expect(ladoDoMapa(360)).toBe(360 - 2 * espaco.e4);
  });

  it("as legendas ficam FORA do quadrado, embaixo dele", async () => {
    await abrirOMapa();
    const moldura = screen.getByTestId("moldura-do-mapa");
    expect(within(moldura).queryByTestId("legenda-de-criticidade")).toBeNull();
    expect(screen.getByTestId("legenda-de-criticidade")).toBeTruthy();
    /* A legenda de MODO também: é ela que diz para onde a coordenada vai. */
    expect(within(moldura).queryByText("Plano esquemático")).toBeNull();
    expect(screen.getByText("Plano esquemático")).toBeTruthy();
  });
});

/* ============================================================
   Ver o caminho: rota e tempo só quando o agente pedir
   ============================================================ */

describe("ver o caminho, no toque e só no toque", () => {
  const A_FRASE = "cerca de 14 min de carro, 4,2 km";

  beforeEach(() => {
    mockPermissaoConcedida = true;
    mockUltimaPosicao = { coords: AQUI };
    mockChaveDoMunicipio = "a-chave-do-municipio";
    mockTarefas = [
      tarefa({ id: "perto", protocolo: "000100/2026", severidade: "critica", ...aoNorte(400) }),
      tarefa({ id: "longe", protocolo: "000200/2026", severidade: "media", ...aoNorte(3_000) }),
    ];
  });

  it("abrir a tela NÃO pede caminho nenhum: sem toque, nada sai do aparelho", async () => {
    await abrirOMapa();
    expect(mockVerOCaminho).not.toHaveBeenCalled();
    expect(mapaDublado.polilinhas).toHaveLength(0);
    expect(screen.queryByText(/de carro/)).toBeNull();
  });

  it("o toque pede o caminho da ESCOLHIDA, da posição do agente, e diz a frase", async () => {
    await abrirOMapa();
    await tocar("escolher-longe");
    await tocar("ver-o-caminho");

    expect(mockVerOCaminho).toHaveBeenCalledTimes(1);
    expect(mockVerOCaminho).toHaveBeenCalledWith(expect.objectContaining({
      ocorrenciaId: "longe",
      token: "token-de-mentira",
      origem: AQUI,
      destino: aoNorte(3_000),
    }));
    expect(within(screen.getByTestId("cartao-da-escolhida")).getByText(A_FRASE)).toBeTruthy();
  });

  it("o caminho vira uma linha no mapa do Google, com os pontos que vieram", async () => {
    await abrirOMapa();
    await tocar("ver-o-caminho");
    expect(mapaDublado.polilinhas).toHaveLength(1);
    expect(mapaDublado.polilinhas[0]?.["coordinates"]).toEqual([AQUI, aoNorte(200), aoNorte(400)]);
  });

  it("a linha reta continua dita junto com o caminho, e não é apagada por ele", async () => {
    /*
      A frase de `rotaEsquematica` é o que funciona sem sinal e sem Google. O
      caminho é um acréscimo, não um substituto: se o Google errar, a reta é a
      segunda opinião que o agente tem na tela.
    */
    await abrirOMapa();
    await tocar("ver-o-caminho");
    const cartao = screen.getByTestId("cartao-da-escolhida");
    expect(within(cartao).getByText(/a norte de onde você está/)).toBeTruthy();
    expect(within(cartao).getByText(A_FRASE)).toBeTruthy();
  });

  it("trocar de escolhida tira o caminho da tela: ele é daquela tarefa, não da tela", async () => {
    await abrirOMapa();
    await tocar("ver-o-caminho");
    expect(screen.getByText(A_FRASE)).toBeTruthy();

    await tocar("escolher-longe");
    expect(screen.queryByText(A_FRASE)).toBeNull();
    expect(mapaDublado.polilinhas).toHaveLength(0);
    /* E o botão volta, para a nova escolhida. */
    expect(screen.getByTestId("ver-o-caminho")).toBeTruthy();
  });

  it("sem posição do agente não há botão: não há de onde traçar", async () => {
    mockUltimaPosicao = null;
    await abrirOMapa();
    expect(screen.queryByTestId("ver-o-caminho")).toBeNull();
  });

  it("sem coordenada do imóvel não há botão: não há para onde traçar", async () => {
    mockTarefas = [
      tarefa({ id: "com", severidade: "alta", ...aoNorte(400) }),
      tarefa({ id: "sem", severidade: "alta", latitude: null, longitude: null }),
    ];
    await abrirOMapa();
    await tocar("escolher-sem");
    expect(screen.queryByTestId("ver-o-caminho")).toBeNull();
  });

  it("sem sinal o botão explica em uma frase, sem tentar", async () => {
    mockTemSinal = false;
    await abrirOMapa();
    await tocar("ver-o-caminho");
    expect(mockVerOCaminho).not.toHaveBeenCalled();
    expect(screen.getByText(/Sem sinal para pedir o caminho/)).toBeTruthy();
    expect(screen.getByText(/linha reta continuam valendo/)).toBeTruthy();
  });

  it("município que não ligou: a frase diz isso, e a reta continua", async () => {
    mockVerOCaminho = jest.fn(async () => { throw new CaminhoIndisponivel("municipio-nao-ligou"); });
    await abrirOMapa();
    await tocar("ver-o-caminho");
    expect(screen.getByText(/O seu município não ligou o caminho por ruas/)).toBeTruthy();
    expect(within(screen.getByTestId("cartao-da-escolhida")).getByText(/a norte de onde você está/))
      .toBeTruthy();
    expect(mapaDublado.polilinhas).toHaveLength(0);
  });

  it("servidor que caiu: a frase diz que não deu agora", async () => {
    mockVerOCaminho = jest.fn(async () => { throw new CaminhoIndisponivel("falhou"); });
    await abrirOMapa();
    await tocar("ver-o-caminho");
    expect(screen.getByText(/Não deu para traçar o caminho agora/)).toBeTruthy();
  });

  it("no plano esquemático a frase aparece, e a linha não é desenhada", async () => {
    /*
      O município pode ter ligado o caminho (ROUTES_KEY no servidor) e não o
      mapa do Google (sem MAPS_KEY), ou o Google pode não ter desenhado. A
      frase de tempo e distância continua útil; a linha não tem onde ser
      desenhada, e o plano esquemático não a inventa.
    */
    mockChaveDoMunicipio = "";
    await abrirOMapa();
    await tocar("ver-o-caminho");
    expect(screen.getByText(A_FRASE)).toBeTruthy();
    expect(mapaDublado.polilinhas).toHaveLength(0);
  });
});

/* ============================================================
   O pino, a criticidade e a legenda
   ============================================================ */

describe("o pino leva criticidade, e nunca só em cor", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "critica", severidade: "critica", ...aoNorte(400) }),
      tarefa({ id: "baixa", severidade: "baixa", ...aoNorte(900) }),
    ];
  });

  /*
    QUEM OUVE A TELA NÃO VÊ NEM COR NEM FORMA.

    O pino comunica gravidade por cor e por forma, e as duas somem para quem
    navega por leitor de tela. O rótulo precisa dizer a palavra, com as MESMAS
    palavras do `SeloSeveridade` ("Severidade crítica"), senão o agente cego
    tem um mapa de botões sem gravidade nenhuma.

    Que cada criticidade tem uma FORMA própria é medido em
    `src/ui/mapa/criticidade.test.ts`, sobre o vocabulário, e não aqui: a forma
    desenhada não tem texto para um caso de tela consultar, e um caso que
    olhasse só a cor passaria verde justamente com o defeito que a regra proíbe.
  */
  it("o rótulo de cada pino diz a gravidade por extenso", async () => {
    await abrirOMapa();

    expect(screen.getByTestId("pino-critica").props.accessibilityLabel)
      .toContain("Severidade crítica");
    expect(screen.getByTestId("pino-baixa").props.accessibilityLabel)
      .toContain("Severidade baixa");
  });

  /*
    A LEGENDA NA TELA é o que transforma "pino colorido" em informação. Sem
    ela, a cor do pino é um enigma que o agente resolve por tentativa.
  */
  it("a legenda mostra, em palavra, cada criticidade que está no mapa", async () => {
    await abrirOMapa();

    const legenda = screen.getByTestId("legenda-de-criticidade");
    expect(within(legenda).getByText("Crítica")).toBeTruthy();
    expect(within(legenda).getByText("Baixa")).toBeTruthy();
    /* E não inventa chave para criticidade que não está no mapa: uma legenda
       maior que o mapa é decoração. */
    expect(within(legenda).queryByText("Alta")).toBeNull();
  });
});

/* ============================================================
   O toque no pino abre os detalhes, e o detalhe leva à vistoria
   ============================================================ */

describe("tocar no pino mostra a tarefa, e dali se vai para a vistoria", () => {
  beforeEach(() => {
    mockPermissaoConcedida = true;
    mockUltimaPosicao = { coords: AQUI };
    mockTarefas = [
      tarefa({ id: "primeira", protocolo: "000100/2026", severidade: "critica", ...aoNorte(400) }),
      tarefa({ id: "segunda", protocolo: "000200/2026", severidade: "media", endereco: "Rua de Cima, 9", ...aoNorte(3_000) }),
    ];
  });

  it("a tela abre já mostrando a sugerida do dia, sem ninguém tocar em nada", async () => {
    await abrirOMapa();

    const cartao = screen.getByTestId("cartao-da-escolhida");
    expect(within(cartao).getByText("000100/2026")).toBeTruthy();
  });

  it("tocar no pino troca a escolhida, com protocolo, endereço, prazo, distância e rumo", async () => {
    await abrirOMapa();
    await tocar("pino-segunda");

    const cartao = screen.getByTestId("cartao-da-escolhida");
    expect(within(cartao).getByText("000200/2026")).toBeTruthy();
    expect(within(cartao).getByText("Rua de Cima, 9")).toBeTruthy();
    expect(within(cartao).getByText(/Vence em/)).toBeTruthy();
    /* A distância e o rumo saem de `rotaEsquematica`, com a frase pronta: dois
       cálculos para o mesmo fato divergem na primeira edição. */
    expect(within(cartao).getByText(/3,0 km a norte de onde você está/)).toBeTruthy();
    /* E o selo, que é ícone mais palavra: é ele que cumpre a regra de nunca
       comunicar severidade só por cor. */
    expect(within(cartao).getByLabelText("Severidade média")).toBeTruthy();
  });

  it("o botão do cartão abre a vistoria da ESCOLHIDA", async () => {
    await abrirOMapa();
    await tocar("pino-segunda");
    await tocar("abrir-a-vistoria");

    expect(mockEmpurrar).toHaveBeenCalledWith({
      pathname: "/(agente)/vistoria/[id]",
      params: { id: "segunda" },
    });
  });

  it("tocar numa linha da lista escolhe a mesma tarefa, e não navega", async () => {
    await abrirOMapa();
    await tocar("escolher-segunda");

    expect(mockEmpurrar).not.toHaveBeenCalled();
    expect(screen.getByTestId("escolher-segunda").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("escolher-primeira").props.accessibilityState.selected).toBe(false);
    expect(within(screen.getByTestId("cartao-da-escolhida")).getByText("000200/2026")).toBeTruthy();
  });
});

/* ============================================================
   Sem GPS, e a coordenada que não é coordenada
   ============================================================ */

describe("sem GPS a tela não inventa distância nem rumo, e diz isso", () => {
  beforeEach(() => {
    mockTarefas = [tarefa({ id: "uma", severidade: "alta", ...aoNorte(400) })];
  });

  it("sem posição, nenhuma medida aparece e a tela avisa", async () => {
    mockPermissaoConcedida = false;
    await abrirOMapa();

    expect(screen.queryAllByText(/\d+\s?(m|km)\b/)).toHaveLength(0);
    expect(screen.getByText(/não considerou distância/)).toBeTruthy();
    expect(within(screen.getByTestId("cartao-da-escolhida")).getByText(/sem rumo/i)).toBeTruthy();
  });

  it("a tela do mapa NÃO pede permissão de localização: quem pede é a vistoria", async () => {
    mockPermissaoConcedida = false;
    await abrirOMapa();

    expect(mockPedirPermissao).not.toHaveBeenCalled();
  });

  /*
    A POSIÇÃO 0,0 de quem ainda não fixou o GPS. Dela, o agente apareceria no
    golfo da Guiné e o enquadramento abriria num mapa do oceano Atlântico com
    dois pinos a seis mil quilômetros um do outro.
  */
  it("a ilha nula não vira posição do agente", async () => {
    mockPermissaoConcedida = true;
    mockUltimaPosicao = { coords: { latitude: 0, longitude: 0 } };
    await abrirOMapa();

    expect(screen.getByText(/não considerou distância/)).toBeTruthy();
    expect(screen.queryAllByText(/\d+\s?(m|km)\b/)).toHaveLength(0);
  });

  /*
    E a mesma ilha do lado da TAREFA: uma ocorrência gravada com 0,0 não tem
    ponto, e um pino ali seria o mapa afirmando um lugar que ninguém informou.
  */
  it("a tarefa com coordenada 0,0 fica na lista e fora do mapa, e a tela explica", async () => {
    /*
      Três tarefas, e duas com ponto de propósito: com uma só, o desenho seria o
      da rosa dos ventos (que não tem pino para escolher) e o caso passaria
      verde sem nunca ter havido pino nenhum para a ilha nula perder.
    */
    mockTarefas = [
      tarefa({ id: "com-ponto", severidade: "alta", ...aoNorte(400) }),
      tarefa({ id: "outra", severidade: "alta", ...aoNorte(800) }),
      tarefa({ id: "ilha-nula", severidade: "media", latitude: 0, longitude: 0 }),
    ];
    await abrirOMapa();

    expect(aOrdemDaLista()).toContain("ilha-nula");
    expect(screen.getByTestId("pino-com-ponto")).toBeTruthy();
    expect(screen.queryByTestId("pino-ilha-nula")).toBeNull();
    expect(screen.getByText(/1 de 3 sem coordenada/)).toBeTruthy();
  });

  it("nenhuma tarefa com coordenada: o mapa diz isso, e a lista continua inteira", async () => {
    mockTarefas = [tarefa({ id: "sem-ponto", latitude: null, longitude: null })];
    await abrirOMapa();

    expect(screen.getByText("Nenhuma tarefa sua tem coordenada")).toBeTruthy();
    expect(aOrdemDaLista()).toEqual(["sem-ponto"]);
  });

  it("sem tarefa nenhuma, a tela diz o mesmo que a lista vazia diz", async () => {
    mockTarefas = [];
    await abrirOMapa();

    expect(screen.getByText("Nenhuma vistoria designada")).toBeTruthy();
  });
});

/* ============================================================
   O mapa do Google, quando o município autoriza
   ============================================================ */

describe("com autorização do município, os pinos vão para o mapa de ruas", () => {
  beforeEach(() => {
    mockChaveDoMunicipio = "a-chave-do-municipio";
    mockTarefas = [
      tarefa({ id: "critica", severidade: "critica", ...aoNorte(400) }),
      tarefa({ id: "baixa", severidade: "baixa", ...aoNorte(900) }),
    ];
  });

  it("um marcador por tarefa com ponto, na ordem do dia", async () => {
    await abrirOMapa();

    expect(mapaDublado.marcadores.map((m) => m["identifier"])).toEqual(["critica", "baixa"]);
  });

  it("o enquadramento cabe todas as tarefas, e não só a primeira", async () => {
    await abrirOMapa();

    const janela = mapaDublado.props?.["initialRegion"] as {
      latitude: number; latitudeDelta: number;
    };
    const norte = AQUI.latitude + 900 / 111_000;
    const sul = AQUI.latitude + 400 / 111_000;
    expect(janela.latitude).toBeCloseTo((norte + sul) / 2, 6);
    expect(janela.latitudeDelta).toBeGreaterThan(norte - sul);
  });

  it("tocar no marcador do Google escolhe a mesma tarefa que o pino do plano", async () => {
    await abrirOMapa();

    const marcador = mapaDublado.marcadores.find((m) => m["identifier"] === "baixa");
    await act(async () => { (marcador?.["onPress"] as () => void)(); });

    expect(within(screen.getByTestId("cartao-da-escolhida")).getByText("0004baixa/2026"))
      .toBeTruthy();
  });

  /* A legenda de criticidade não é do desenho de reserva: ela vale nos DOIS
     modos, porque o pino é colorido nos dois. */
  it("a legenda continua na tela com o mapa do Google", async () => {
    await abrirOMapa();

    expect(screen.getByText("Mapa do Google")).toBeTruthy();
    expect(within(screen.getByTestId("legenda-de-criticidade")).getByText("Crítica"))
      .toBeTruthy();
  });
});
