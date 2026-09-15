/**
 * A LISTA DE TAREFAS EM SANFONA, paginada.
 *
 * O pedido, na letra de quem paga, depois de aprovar o mesmo desenho na tela
 * do mapa: "na tela tarefas o item da tarefa deve aparecer fechado na lista
 * paginada, e só ao clicar nele ele expande e mostra os detalhes e os btns
 * abrir vistoria e tudo mais".
 *
 * A régua dele veio de uma reclamação de redundância no mapa ("mostra o item
 * expandido com os botões e abaixo o mesmo item resumido"), então a lista É a
 * superfície: nada de cartão separado repetindo o item. O que estes casos
 * travam:
 *
 * 1. O item nasce FECHADO, e fechado não tem botão nenhum.
 * 2. Tocar abre, mostra o detalhe e os botões; um aberto por vez; tocar de
 *    novo fecha.
 * 3. A sugerida do dia é a primeira e abre ABERTA ao entrar, com "Comece por
 *    aqui" dentro dela: é assim que o cartão de antes deixa de existir sem o
 *    convite sumir.
 * 4. Cinco por página, "N de M" e "Mostrar mais N", que acrescenta no FIM.
 * 5. O botão abre a vistoria; o toque no resumo só expande.
 * 6. "Enviar agora" e "Devolver" só dentro do item aberto, e só quando cabem.
 * 7. Com redução de movimento, expandir não anima nada.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, StyleSheet } from "react-native";
import type { ItemFila } from "@dc360/campo";
import type { Pendencia } from "../dados/api";
import { movimento, temaEscuro } from "../ui/tokens";

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

let mockPermissaoConcedida = false;
let mockUltimaPosicao: { coords: { latitude: number; longitude: number } } | null = null;
jest.mock("expo-location", () => ({
  __esModule: true,
  getForegroundPermissionsAsync: async () => ({ granted: mockPermissaoConcedida }),
  getLastKnownPositionAsync: async () => mockUltimaPosicao,
  requestForegroundPermissionsAsync: async () => ({ granted: true }),
  Accuracy: { High: 4 },
}));

jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  enderecoDaApi: () => "",
}));

let mockTarefas: Pendencia[] = [];
const mockBaixadasEm = new Date().toISOString();
jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => mockBaixadasEm),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
  esquecerPendencia: jest.fn(async () => {}),
}));

/* Listas ESTÁVEIS: array novo a cada leitura troca o estado, que provoca
   renderização, que relê o disco, para sempre. */
const SEM_RASCUNHOS: never[] = [];
let mockColetas: Array<{ ocorrenciaId: string; situacao: string }> = [];
jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => SEM_RASCUNHOS) }));
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
  marcarEnviada: jest.fn(async () => {}),
}));

let mockItensDaFila: ItemFila[] = [];
const mockFila = {
  itens: async () => mockItensDaFila,
  assinar: () => () => {},
  drenar: jest.fn(async () => ({
    fotosEnviadas: 0, enviados: 0, duplicados: 0, adiados: 0, bloqueados: 0, interrompido: false,
  })),
  enfileirarDevolucao: jest.fn(),
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

/* Sem sinal: a tela lê o disco e não tenta a rede. O que se mede aqui é a
   sanfona, e uma busca de rede no meio só acrescenta ruído assíncrono. */
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: false, tipo: "nenhum" }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: { nome: "Ana Ribeiro", municipio: "Serra Alta", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";
import { TAMANHO_DA_PAGINA } from "../ui/ItemDeTarefa";

const HORA = 3_600_000;
const AQUI = { latitude: -27.595378, longitude: -48.548050 };
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

function itemDaFila(ocorrenciaId: string, estado: ItemFila["estado"]): ItemFila {
  return {
    id: `item-${ocorrenciaId}`,
    tipo: "vistoria",
    estado,
    autor: { usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-1" },
    ocorrenciaId,
    protocolo: `0004${ocorrenciaId}/2026`,
    tentativas: 0,
    criadoEm: "2026-09-13T12:00:00.000Z",
    liberadoEm: "2026-09-13T12:00:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
    envelope: {} as never,
  } as ItemFila;
}

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
  await screen.findByTestId("lista-de-tarefas");
}

async function tocar(id: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByTestId(id)); });
}

/** A ordem dos itens desenhados na lista, por identificador de ocorrência. */
function aOrdemDaLista(): string[] {
  return screen
    .getAllByTestId(/^escolher-/)
    .map((no) => String(no.props.testID).replace("escolher-", ""));
}

/** O item inteiro (resumo mais detalhe), por tarefa. */
function item(id: string) {
  return within(screen.getByTestId(`tarefa-${id}`));
}

/**
 * Quantos botões de abrir a vistoria há na tela, contados pelo texto e não
 * pelo `testID`: o `Botao` dá ao rótulo um `testID` próprio (`...-rotulo`), e
 * um regex sobre o prefixo contaria dois nós por botão.
 */
function quantosAbrir(): number {
  return screen.queryAllByText("Abrir a vistoria").length;
}

/**
 * O que a lista RECEBE para desenhar, por identificador. Difere do que está
 * desenhado quando a lista passa de dez: a `FlatList` virtualiza a partir do
 * décimo item (`initialNumToRender`) e, sem leiaute medido no ambiente de
 * teste, o resto nunca é pintado. A página é decidida antes disso, no `data`.
 */
function oQueAListaRecebe(): string[] {
  return (screen.getByTestId("lista-de-tarefas").props.data as Array<{ id: string }>)
    .map((t) => t.id);
}

/** O item está expandido? Lido do estado que o leitor de tela anuncia. */
function expandido(id: string): boolean {
  return Boolean(screen.getByTestId(`escolher-${id}`).props.accessibilityState?.expanded);
}

let espiaoDeAnimacao: jest.SpyInstance | null = null;
function espiarAnimacao(): jest.SpyInstance {
  espiaoDeAnimacao = jest.spyOn(Animated, "timing");
  return espiaoDeAnimacao;
}

beforeEach(() => {
  mockTarefas = [tarefa({ id: "1" })];
  mockColetas = [];
  mockItensDaFila = [];
  mockPermissaoConcedida = false;
  mockUltimaPosicao = null;
  mockEmpurrar.mockClear();
  mockFila.drenar.mockClear();
});

afterEach(() => {
  espiaoDeAnimacao?.mockRestore();
  espiaoDeAnimacao = null;
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockImplementation(
    () => Promise.resolve(false),
  );
});

/* ============================================================
   Fechado, aberto, um por vez
   ============================================================ */

describe("o item nasce fechado, e abre no toque", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "primeira", protocolo: "000100/2026", severidade: "critica", ponto_referencia: "Casa azul depois da padaria" }),
      tarefa({ id: "segunda", protocolo: "000200/2026", severidade: "media", endereco: "Rua de Cima, 9", ponto_referencia: "Portão verde" }),
      tarefa({ id: "terceira", protocolo: "000300/2026", severidade: "baixa" }),
    ];
  });

  it("quem não é a sugerida nasce fechado, sem botão nenhum e sem detalhe", async () => {
    await abrirALista();

    expect(expandido("segunda")).toBe(false);
    expect(expandido("terceira")).toBe(false);
    expect(item("segunda").queryByTestId("abrir-a-vistoria-segunda")).toBeNull();
    expect(item("segunda").queryByText(/Vence em/)).toBeNull();
    expect(item("segunda").queryByText(/Referência:/)).toBeNull();
    /* O resumo continua dizendo o que importa para escolher: protocolo,
       severidade por extenso e endereço. */
    expect(item("segunda").getByText("000200/2026")).toBeTruthy();
    expect(item("segunda").getByLabelText("Severidade média")).toBeTruthy();
    expect(item("segunda").getByText("Rua de Cima, 9")).toBeTruthy();
  });

  it("não existe cartão da sugerida separado da lista: cada tarefa aparece UMA vez", async () => {
    await abrirALista();
    expect(screen.getAllByText("000100/2026")).toHaveLength(1);
    expect(screen.queryByTestId("cartao-primeira")).toBeNull();
  });

  it("tocar num item fechado expande ELE, com o detalhe e o botão, e recolhe o outro", async () => {
    await abrirALista();
    await tocar("escolher-segunda");

    expect(expandido("segunda")).toBe(true);
    expect(expandido("primeira")).toBe(false);
    expect(item("segunda").getByTestId("abrir-a-vistoria-segunda")).toBeTruthy();
    expect(item("primeira").queryByTestId("abrir-a-vistoria-primeira")).toBeNull();
    /* Um aberto por vez, na tela inteira. */
    expect(quantosAbrir()).toBe(1);

    /* O detalhe: o tipo, o prazo com data, a referência. */
    expect(item("segunda").getByText("Deslizamento")).toBeTruthy();
    expect(item("segunda").getByText(/Vence em/)).toBeTruthy();
    expect(item("segunda").getByText(/^\d{2}\/\d{2}, \d{2}:\d{2}$/)).toBeTruthy();
    expect(item("segunda").getByText("Referência: Portão verde")).toBeTruthy();
    /* Tocar não navega: quem navega é o botão. */
    expect(mockEmpurrar).not.toHaveBeenCalled();
  });

  it("tocar de novo no item aberto recolhe, e nenhum fica aberto", async () => {
    await abrirALista();
    await tocar("escolher-primeira");

    expect(expandido("primeira")).toBe(false);
    expect(quantosAbrir()).toBe(0);
  });

  it("o resumo diz a quem ouve o que o item é e se está aberto", async () => {
    await abrirALista();
    const rotulo = String(screen.getByTestId("escolher-segunda").props.accessibilityLabel);
    expect(rotulo).toContain("Protocolo 000200/2026");
    expect(rotulo).toContain("severidade média");
    expect(rotulo).toContain("Rua de Cima, 9");
    expect(rotulo).toMatch(/recolhido/i);

    await tocar("escolher-segunda");
    expect(String(screen.getByTestId("escolher-segunda").props.accessibilityLabel)).toMatch(/expandido/i);
  });

  it("com posição do aparelho, o item aberto diz distância e rumo, e o fechado só a distância", async () => {
    mockPermissaoConcedida = true;
    mockUltimaPosicao = { coords: AQUI };
    mockTarefas = [
      tarefa({ id: "perto", severidade: "media", ...aoNorte(400) }),
      tarefa({ id: "longe", severidade: "media", ...aoNorte(3_000) }),
    ];
    await abrirALista();

    expect(item("perto").getByText(/401 m a norte de onde você está/)).toBeTruthy();
    expect(item("longe").getByText("a 3,0 km de você")).toBeTruthy();
    expect(item("longe").queryByText(/de onde você está/)).toBeNull();
  });
});

/* ============================================================
   A sugerida abre aberta, com o convite dentro
   ============================================================ */

describe("a sugerida do dia é a primeira, e entra aberta", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "vencida", severidade: "media", prazo_em: new Date(Date.now() - 5 * HORA).toISOString() }),
      tarefa({ id: "critica", severidade: "critica", prazo_em: new Date(Date.now() + 30 * HORA).toISOString() }),
    ];
  });

  it("abre expandida, com 'Comece por aqui' e o botão roxo dentro dela", async () => {
    await abrirALista();

    expect(aOrdemDaLista()[0]).toBe("critica");
    expect(expandido("critica")).toBe(true);
    expect(item("critica").getByTestId("comece-por-aqui")).toBeTruthy();
    expect(item("critica").getByText("Comece por aqui")).toBeTruthy();
    const convite = item("critica").getByTestId("abrir-a-vistoria-critica");
    expect(StyleSheet.flatten(convite.props.style).backgroundColor).toBe(temaEscuro.destaque);
    /* E só ela carrega o convite: a outra está fechada. */
    expect(screen.getAllByTestId("comece-por-aqui")).toHaveLength(1);
    expect(item("vencida").queryByTestId("abrir-a-vistoria-vencida")).toBeNull();
  });

  it("o 'Comece por aqui' fica no resumo, e continua lá quando o agente abre outra", async () => {
    await abrirALista();
    await tocar("escolher-vencida");

    expect(expandido("critica")).toBe(false);
    expect(item("critica").getByText("Comece por aqui")).toBeTruthy();
    expect(String(screen.getByTestId("escolher-critica").props.accessibilityLabel))
      .toContain("Comece por aqui");
  });
});

/* ============================================================
   O botão navega; o toque no resumo não
   ============================================================ */

describe("abrir a vistoria é o botão, e o toque no resumo só expande", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "primeira", severidade: "critica" }),
      tarefa({ id: "segunda", severidade: "media" }),
    ];
  });

  it("o botão do item aberto abre a vistoria DELE", async () => {
    await abrirALista();
    await tocar("escolher-segunda");
    await tocar("abrir-a-vistoria-segunda");

    expect(mockEmpurrar).toHaveBeenCalledTimes(1);
    expect(mockEmpurrar).toHaveBeenCalledWith({
      pathname: "/(agente)/vistoria/[id]",
      params: { id: "segunda" },
    });
  });

  it("o toque no resumo não navega nunca: nem para abrir, nem para recolher", async () => {
    await abrirALista();
    await tocar("escolher-segunda");
    await tocar("escolher-segunda");
    await tocar("escolher-primeira");

    expect(mockEmpurrar).not.toHaveBeenCalled();
  });
});

/* ============================================================
   Cinco por página, e "Mostrar mais" no fim
   ============================================================ */

describe("a lista mostra cinco, e cresce a pedido, no fim", () => {
  beforeEach(() => {
    /* Doze tarefas com prazos crescentes, para a ordem ser t1..t12. */
    mockTarefas = Array.from({ length: 12 }, (_, i) => tarefa({
      id: `t${i + 1}`,
      protocolo: `${String(i + 1).padStart(6, "0")}/2026`,
      severidade: "media",
      prazo_em: new Date(Date.now() + (9 + 5 * i) * HORA).toISOString(),
    }));
  });

  it("abre com cinco itens, diz '5 de 12' e oferece mostrar mais 5", async () => {
    await abrirALista();
    expect(aOrdemDaLista()).toHaveLength(TAMANHO_DA_PAGINA);
    expect(aOrdemDaLista()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(screen.getByText(/5 de 12/)).toBeTruthy();
    expect(within(screen.getByTestId("mostrar-mais")).getByText("Mostrar mais 5")).toBeTruthy();
    /* O cabeçalho continua contando a lista INTEIRA: a página é do desenho,
       não do trabalho. */
    expect(screen.getByTestId("quantas-vistorias").props.accessibilityLabel)
      .toBe("12, vistorias para fazer");
  });

  it("mostrar mais acrescenta cinco NO FIM, sem mexer nos que já estavam", async () => {
    /*
      No fim, e não em qualquer lugar: a lista tem `maintainVisibleContentPosition`
      para o item debaixo do dedo não escorregar, e o que a âncora segura é o
      primeiro visível. Acrescentar no fim não move nada acima dele.
    */
    await abrirALista();
    const antes = aOrdemDaLista();
    await tocar("mostrar-mais");

    const depois = aOrdemDaLista();
    expect(depois).toHaveLength(10);
    expect(depois.slice(0, 5)).toEqual(antes);
    expect(screen.getByText(/10 de 12/)).toBeTruthy();
    expect(within(screen.getByTestId("mostrar-mais")).getByText("Mostrar mais 2")).toBeTruthy();

    await tocar("mostrar-mais");
    expect(oQueAListaRecebe()).toEqual(depois.concat(["t11", "t12"]));
    expect(screen.queryByTestId("mostrar-mais")).toBeNull();
    expect(screen.queryByTestId("quantas-na-pagina")).toBeNull();
  });

  it("a âncora da lista continua de pé com a página", async () => {
    await abrirALista();
    expect(screen.getByTestId("lista-de-tarefas").props.maintainVisibleContentPosition)
      .toEqual({ minIndexForVisible: 0 });
  });

  it("os itens da segunda página também nascem fechados", async () => {
    await abrirALista();
    await tocar("mostrar-mais");
    for (const id of ["t6", "t7", "t8", "t9", "t10"]) {
      expect(expandido(id)).toBe(false);
    }
    expect(quantosAbrir()).toBe(1);
  });

  it("com menos que uma página, não há rodapé de página nenhum", async () => {
    mockTarefas = [tarefa({ id: "a" }), tarefa({ id: "b" })];
    await abrirALista();
    expect(screen.queryByTestId("mostrar-mais")).toBeNull();
    expect(screen.queryByTestId("quantas-na-pagina")).toBeNull();
  });
});

/* ============================================================
   Enviar agora e devolver, só no item aberto e só quando cabem
   ============================================================ */

describe("'Enviar agora' e 'Devolver' moram no item aberto, e só quando cabem", () => {
  const VENCIDA = new Date(Date.now() - 3 * HORA).toISOString();

  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "sem-coleta", protocolo: "000100/2026", severidade: "media", prazo_em: VENCIDA }),
      tarefa({ id: "com-coleta", protocolo: "000200/2026", severidade: "media", prazo_em: VENCIDA }),
      tarefa({ id: "no-prazo", protocolo: "000300/2026", severidade: "media" }),
    ];
    /* A segunda tem a vistoria guardada e presa por falta de sinal. */
    mockItensDaFila = [itemDaFila("com-coleta", "pendente")];
  });

  it("a vencida sem coleta, aberta, oferece devolver; as fechadas não oferecem nada", async () => {
    await abrirALista();

    expect(expandido("sem-coleta")).toBe(true);
    expect(item("sem-coleta").getByTestId("devolver-sem-coleta")).toBeTruthy();
    expect(item("sem-coleta").queryByTestId("enviar-sem-coleta")).toBeNull();
    /* Fechada, a vencida com coleta não mostra nem enviar nem o ⓘ. */
    expect(screen.queryByTestId("enviar-com-coleta")).toBeNull();
    expect(screen.queryByTestId("por-que-com-coleta")).toBeNull();
    expect(screen.queryByTestId("devolver-com-coleta")).toBeNull();
  });

  it("abrir a vencida com coleta troca o verbo: enviar agora e o ⓘ, sem devolver", async () => {
    await abrirALista();
    await tocar("escolher-com-coleta");

    expect(item("com-coleta").getByTestId("enviar-com-coleta")).toBeTruthy();
    expect(item("com-coleta").getByTestId("por-que-com-coleta")).toBeTruthy();
    expect(item("com-coleta").queryByTestId("devolver-com-coleta")).toBeNull();
    /* E o botão de abrir a vistoria continua ali, junto. */
    expect(item("com-coleta").getByTestId("abrir-a-vistoria-com-coleta")).toBeTruthy();
    /* A que recolheu levou o devolver dela junto. */
    expect(screen.queryByTestId("devolver-sem-coleta")).toBeNull();
    expect(screen.queryAllByText("Devolver para a coordenação")).toHaveLength(0);
  });

  it("a tarefa no prazo, aberta, não fala de devolução nem de envio", async () => {
    await abrirALista();
    await tocar("escolher-no-prazo");

    expect(item("no-prazo").getByTestId("abrir-a-vistoria-no-prazo")).toBeTruthy();
    expect(item("no-prazo").queryByTestId("devolver-no-prazo")).toBeNull();
    expect(item("no-prazo").queryByTestId("enviar-no-prazo")).toBeNull();
    expect(screen.queryByText(/Devolver/)).toBeNull();
  });

  it("o ⓘ do item aberto explica por que não dá para devolver", async () => {
    await abrirALista();
    await tocar("escolher-com-coleta");
    await tocar("por-que-com-coleta");

    expect(screen.getByText("Esta tarefa não pode ser devolvida")).toBeTruthy();
    expect(screen.getByText(/Devolver jogaria esse trabalho fora/)).toBeTruthy();
  });

  it("'Enviar agora' do item aberto chama o dreno da fila", async () => {
    await abrirALista();
    await tocar("escolher-com-coleta");
    await tocar("enviar-com-coleta");

    expect(mockFila.drenar).toHaveBeenCalledTimes(1);
  });
});

/* ============================================================
   O movimento
   ============================================================ */

describe("o movimento da sanfona", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "primeira", severidade: "critica" }),
      tarefa({ id: "segunda", severidade: "media" }),
    ];
  });

  it("com redução de movimento, expandir não anima nada: o detalhe aparece direto", async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockImplementation(
      () => Promise.resolve(true),
    );
    await abrirALista();
    /* A chave chega DEPOIS do primeiro quadro; deixar a promessa resolver. */
    await act(async () => {});
    const espiao = espiarAnimacao();

    await tocar("escolher-segunda");

    expect(expandido("segunda")).toBe(true);
    expect(item("segunda").getByTestId("abrir-a-vistoria-segunda")).toBeTruthy();
    expect(espiao).not.toHaveBeenCalled();
  });

  it("sem redução de movimento, o detalhe entra em transição de token, na thread de interface", async () => {
    await abrirALista();
    await act(async () => {});
    const espiao = espiarAnimacao();

    await tocar("escolher-segunda");

    expect(espiao).toHaveBeenCalled();
    for (const chamada of espiao.mock.calls) {
      const config = chamada[1] as { duration?: number; useNativeDriver?: boolean };
      expect([movimento.respostaAoToque, movimento.mudancaDeEstado]).toContain(config.duration);
      expect(config.useNativeDriver).toBe(true);
    }
  });
});
