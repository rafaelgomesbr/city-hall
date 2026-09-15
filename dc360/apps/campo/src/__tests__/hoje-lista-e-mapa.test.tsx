/**
 * "HOJE": a lista, a tela do mapa, e a única verdade que as duas contam.
 *
 * Até 15/09/2026 o mapa era uma LENTE dentro desta tela, e este arquivo
 * comparava as duas lentes item a item. A lente virou tela própria (o pedido
 * está na letra de quem paga, em `mapa-tela-dedicada.test.tsx`), e o que este
 * arquivo mede continua sendo a mesma coisa, agora entre DUAS TELAS: elas não
 * podem discordar sobre quais são as tarefas do agente.
 *
 * Três coisas são medidas aqui, e as três são de TELA (o critério da ordem em
 * si é medido em `src/dados/ordem-do-dia.test.ts`, sem montar árvore nenhuma):
 *
 * 1. **A lista e o mapa são a mesma lista.** O argumento que segurou a lente
 *    ("duas telas dizendo minhas tarefas podem discordar, e o agente vai
 *    acreditar na errada") não caiu: o que impedia a discordância nunca foi
 *    estarem na mesma tela, era consumirem a mesma regra (`tarefasDoDia`,
 *    `coletadasNoAparelho` e `ordemDoDia`, em `src/dados/ordem-do-dia.ts`).
 *    Este é o caso que prova isso, e ele monta as duas telas.
 * 2. **A lista não pula.** As três medidas contra o pulo (roda só no dedo,
 *    cabeçalho fora da rolagem com altura reservada, e a âncora da `FlatList`)
 *    são estruturais, e continuam sendo cobradas aqui.
 * 3. **A tela não afirma o que não mediu.** Sem GPS não há distância em
 *    lugar nenhum, e a sugestão do dia diz em voz alta que a ordem não
 *    considerou caminho. Este é o caso que a revisão desta onda mais cobra:
 *    o irmão dele, noutra frente, passava verde com a seta apontando para o
 *    norte sem GPS nenhum.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { StyleSheet } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import { temaEscuro, toque } from "../ui/tokens";

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
import Mapa from "../app/(agente)/mapa";

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

/** A ordem dos cartões da tela de tarefas, por identificador de ocorrência. */
function aOrdemDaLista(): string[] {
  return screen
    .getAllByTestId(/^cartao-/)
    .map((no) => String(no.props.testID).replace("cartao-", ""));
}

/** A ordem das linhas da lista da TELA DO MAPA. */
function aOrdemDoMapa(): string[] {
  return screen
    .getAllByTestId(/^escolher-/)
    .map((no) => String(no.props.testID).replace("escolher-", ""));
}

/** A ordem dos pinos desenhados na tela do mapa. */
function aOrdemDosPinos(): string[] {
  return screen
    .getAllByTestId(/^pino-/)
    .map((no) => String(no.props.testID).replace("pino-", ""));
}

/**
 * Fecha a tela de tarefas e abre a tela do MAPA no lugar dela.
 *
 * As duas nunca aparecem juntas (são abas), e montá-las ao mesmo tempo faria as
 * consultas de `screen` enxergarem duas árvores: a comparação sairia de um
 * estado que o agente nunca vê.
 */
async function eNoMapa(): Promise<void> {
  /*
    O `await` no desmonte não é zelo: `unmount` devolve promessa nesta versão da
    biblioteca, e sem esperar por ela o `render` seguinte abre um `act` dentro do
    anterior. O React responde a isso com "overlapping act() calls" e desliga o
    ambiente de `act` para o arquivo INTEIRO: os casos seguintes passam a montar
    árvore sem ninguém esperar os efeitos, e falham todos, longe da causa.
  */
  await screen.unmount();
  await render(<Mapa />);
  await act(async () => {});
  /*
    A espera é pela LISTA, e não por um número de quadros.

    A tela do mapa abre do disco, como a de tarefas, e enquanto a leitura não
    termina ela mostra "Abrindo o mapa das suas tarefas". Quantos ciclos de
    microtarefa essa leitura leva depende do que ficou pendente da tela anterior,
    então contar `act` aqui produz um caso que passa hoje e falha no dia em que
    alguém acrescentar uma leitura. Esperar o que se vai medir é a forma que não
    envelhece.
  */
  await screen.findByTestId("lista-do-mapa");
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
   As duas telas, e a única lista
   ============================================================ */

describe("a lista e o mapa são a mesma lista", () => {
  beforeEach(() => {
    mockTarefas = [
      tarefa({ id: "folgada", severidade: "media", prazo_em: new Date(Date.now() + 40 * HORA).toISOString(), ...daquiAMetros(900) }),
      tarefa({ id: "critica", severidade: "critica", prazo_em: new Date(Date.now() + 30 * HORA).toISOString(), ...daquiAMetros(400) }),
      tarefa({ id: "vencida", severidade: "baixa", prazo_em: new Date(Date.now() - 5 * HORA).toISOString(), ...daquiAMetros(200) }),
    ];
  });

  /*
    O CASO QUE JUSTIFICA A DECISÃO DE PRODUTO, e ele sobreviveu à mudança dela.

    Enquanto o mapa era uma lente, este caso comparava as duas lentes. O mapa
    virou tela, e o medo continua o mesmo: se as duas pudessem divergir, o
    agente teria duas respostas para "minhas tarefas" e acreditaria na que
    estivesse na frente dele. O que garante que não divergem é a regra
    compartilhada, e é ela que este caso mede, item a item.
  */
  it("as duas telas mostram as MESMAS tarefas, na MESMA ordem", async () => {
    await abrirALista();
    const naLista = aOrdemDaLista();

    await eNoMapa();

    expect(aOrdemDoMapa()).toEqual(naLista);
    /* E os PINOS também: uma lista certa com o mapa desenhando outra coisa
       seria a mesma discordância, escondida no desenho. */
    expect(aOrdemDosPinos()).toEqual(naLista);
    expect(naLista).toEqual(["critica", "vencida", "folgada"]);
  });

  /*
    E AS DUAS TELAS PRECISAM DIZER O MESMO PARA QUEM OUVE.

    O cartão da lista é UM elemento só para o leitor de tela: o `Tocavel` tem
    rótulo próprio, e rótulo próprio faz o leitor ler o rótulo e ignorar os
    textos de dentro. O rótulo trazia protocolo e endereço, e mais nada, então o
    PRAZO (que a tela desenha em vermelho, com ícone, na linha mais forte do
    cartão) simplesmente não existia para quem não enxerga. Na tela do mapa a
    linha sempre disse o prazo: a mesma tarefa, duas telas, duas verdades
    diferentes sobre quando ela vence.

    Não é detalhe de conformidade: o prazo é o que decide se o agente sobe hoje
    ou passa a tarefa adiante, e é a única coisa que o cartão comunica por cor.
  */
  it("quem ouve a tela ouve o prazo nas DUAS telas", async () => {
    mockTarefas = [
      tarefa({ id: "vencida", severidade: "baixa", prazo_em: new Date(Date.now() - 5 * HORA).toISOString(), ...daquiAMetros(200) }),
    ];
    await abrirALista();

    /* Ancorado no CARTÃO: a sugerida carrega também o convite, que se anuncia
       como "Abrir a vistoria sugerida", e é o cartão que precisa dizer o prazo. */
    const naLista = within(screen.getByTestId("cartao-vencida"))
      .getByLabelText(/^Abrir a vistoria do protocolo/).props.accessibilityLabel as string;
    expect(naLista).toContain("Vencido há 5h");

    await eNoMapa();

    expect(screen.getByTestId("escolher-vencida").props.accessibilityLabel)
      .toContain("Vencido há 5h");
  });

  /*
    E o mesmo vale para a sugestão do dia. "Comece por aqui" e a frase do porquê
    ficam DENTRO do `Tocavel` do cartão, então na lista elas não eram ditas. O
    agente que usa leitor de tela ouvia a ordem do dia numa tela e não na outra,
    inclusive o aviso de que a ordem NÃO considerou distância, que é justamente
    a frase que o impede de confiar demais na lista.
  */
  it("quem ouve a tela ouve o porquê da sugestão também na lista", async () => {
    mockTarefas = [
      tarefa({ id: "critica", severidade: "critica", prazo_em: new Date(Date.now() + 30 * HORA).toISOString() }),
    ];
    mockPermissaoConcedida = false;
    await abrirALista();

    const naLista = within(screen.getByTestId("cartao-critica"))
      .getByLabelText(/^Abrir a vistoria do protocolo/).props.accessibilityLabel as string;

    expect(naLista).toContain("Comece por aqui");
    expect(naLista).toContain("Severidade crítica");
    expect(naLista).toContain("não considerou distância");
  });

  /*
    O NÚMERO DO CABEÇALHO É O MESMO NAS DUAS, e ele conta a lista inteira.

    A tela do mapa poderia ter sido tentada a contar os PINOS, que é o que ela
    desenha. Contaria menos, porque tarefa sem coordenada não vira pino, e as
    duas telas passariam a discordar sobre a única pergunta que decide o turno:
    quantas vistorias eu tenho hoje.
  */
  it("a contagem do cabeçalho é a mesma nas duas telas", async () => {
    await abrirALista();
    const naLista = screen.getByTestId("quantas-vistorias").props.accessibilityLabel;

    await eNoMapa();

    expect(screen.getByTestId("quantas-no-mapa").props.accessibilityLabel).toBe(naLista);
    expect(naLista).toBe("3, vistorias para fazer");
  });
});

/* ============================================================
   As três medidas contra o pulo da lista
   ============================================================ */

/**
 * O relato veio do aparelho: "a lista dá uma rolada sozinha". Eram três causas
 * somadas, e consertar uma conserta um terço. As três medidas são ESTRUTURAIS
 * (vêm junto com a lista, não com o tempo que ela ficou de pé), e por isso são
 * medidas na estrutura e não no movimento: aqui os casos provam que ela existe,
 * e o `contentOffset` que pula só existe no aparelho.
 *
 * Elas eram verificadas depois de ir ao mapa e voltar, porque a lente desmontava
 * a `FlatList`. A lente virou tela própria, e a lista deixou de ser desmontada
 * por troca de lente; o que precisa continuar sendo cobrado é a existência das
 * três, que é o que estes casos fazem.
 */
describe("a lista não pula, e as três medidas continuam de pé", () => {
  it("a roda de puxar responde só ao dedo", async () => {
    await abrirALista();

    expect(aRodaDePuxar()).toBe(false);

    /* O botão do rodapé é um pedido, e não o GESTO: ligar a roda aqui
       deslocaria a lista por causa de um toque dado lá embaixo. */
    await act(async () => { fireEvent.press(screen.getByText("Baixar tarefas agora")); });
    expect(aRodaDePuxar()).toBe(false);
  });

  it("a lista tem a âncora que segura o item debaixo do dedo", async () => {
    await abrirALista();

    expect(screen.getByTestId("lista-de-tarefas").props.maintainVisibleContentPosition)
      .toEqual({ minIndexForVisible: 0 });
  });

  it("o cabeçalho fica FORA da rolagem, e a faixa tem altura reservada", async () => {
    await abrirALista();

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
    E NÃO HÁ MAIS SELETOR DE LENTE NESTA TELA.

    Ele existia no cabeçalho fixo e trocava a lista pelo mapa no lugar dela.
    Quem leva ao mapa agora é a barra de abas, e um controle a menos no
    cabeçalho é altura que volta para a lista. O caso existe para o seletor não
    voltar por engano junto com alguma correção da lista.
  */
  it("o cabeçalho não tem mais seletor de lente", async () => {
    await abrirALista();

    expect(screen.queryByTestId("lente-mapa")).toBeNull();
    expect(screen.queryByTestId("lente-lista")).toBeNull();
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
    O ROXO DE VOLTA, na letra de quem paga: "você apagou o botão roxo que eu
    disse que tava bonito da aba de tarefas".

    O botão era "Abrir a vistoria", no rodapé da folha do mapa dentro desta
    aba, e migrou para a aba Mapa quando o mapa virou tela própria. Com a lista
    cheia, Tarefas ficou sem nenhum botão primário. Ele volta no cartão da
    sugerida, como CONVITE: o cartão continua abrindo por toque, e o botão faz
    exatamente a mesma navegação, para quem não sabe que cartão se toca.
  */
  it("a sugerida carrega o convite em roxo: 'Abrir a vistoria', e só ela", async () => {
    await abrirALista();

    const convite = within(screen.getByTestId("cartao-critica")).getByTestId("abrir-a-vistoria-critica");
    expect(StyleSheet.flatten(convite.props.style).backgroundColor).toBe(temaEscuro.destaque);
    expect(within(screen.getByTestId("cartao-vencida")).queryByTestId("abrir-a-vistoria-vencida")).toBeNull();
  });

  it("o convite abre o mesmo lugar que o toque no cartão", async () => {
    await abrirALista();
    const cartao = screen.getByTestId("cartao-critica");

    await act(async () => { fireEvent.press(within(cartao).getByTestId("abrir-a-vistoria-critica")); });
    const peloConvite = mockEmpurrar.mock.calls.at(-1);
    expect(peloConvite).toEqual([{ pathname: "/(agente)/vistoria/[id]", params: { id: "critica" } }]);

    mockEmpurrar.mockClear();
    await act(async () => {
      fireEvent.press(within(cartao).getByLabelText(/^Abrir a vistoria do protocolo/));
    });
    expect(mockEmpurrar.mock.calls.at(-1)).toEqual(peloConvite);
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
    /*
      `na_fila` e não uma palavra qualquer: `SituacaoDaColeta` tem três valores
      (`na_fila`, `enviada`, `arquivada`) e mais nenhum. Este caso passava com
      "aguardando", que não existe no produto, e passava por acidente: quem
      manda na descida é `situacao !== "arquivada"`, então qualquer texto servia.
      Um caso escrito sobre um estado impossível não sabe dizer se a regra está
      certa para os estados que existem.
    */
    mockColetas = [{ ocorrenciaId: "critica", situacao: "na_fila" }];
    await abrirALista();

    expect(aOrdemDaLista()).toEqual(["vencida", "critica"]);
  });

  /*
    E AS DUAS TELAS PRECISAM DIZER ISSO, não só a lista.

    Na lista, a tarefa já vistoriada carrega o selo "Coletada, aguardando
    envio", que é a frase que responde "eu já subi nessa?". Na tela do mapa ela
    apareceria como qualquer outra: mesmo protocolo, mesmo selo de severidade,
    mesmo endereço, nada. O agente que usa o mapa para montar o roteiro escolhe
    aquela linha, o cartão centra nela, e o único verbo dali é "Abrir a
    vistoria" de uma vistoria que ele já fez.
  */
  it("a tarefa já coletada diz que já foi vistoriada também na tela do mapa", async () => {
    mockTarefas = [
      tarefa({ id: "critica", severidade: "critica", prazo_em: new Date(Date.now() + 30 * HORA).toISOString(), ...daquiAMetros(400) }),
      tarefa({ id: "vencida", severidade: "media", prazo_em: new Date(Date.now() - 5 * HORA).toISOString(), ...daquiAMetros(900) }),
    ];
    mockColetas = [{ ocorrenciaId: "critica", situacao: "na_fila" }];
    await abrirALista();
    /* A lista diz, e é contra ela que a tela do mapa é comparada. */
    expect(screen.getByText("Coletada, aguardando envio")).toBeTruthy();

    await eNoMapa();

    expect(within(screen.getByTestId("escolher-critica")).getByText(/Coletada, aguardando envio/))
      .toBeTruthy();
    /* E para quem ouve a tela, que não vê selo nenhum. */
    expect(screen.getByTestId("escolher-critica").props.accessibilityLabel)
      .toContain("Coletada, aguardando envio");
    /* A que ninguém tocou continua sem selo: o caso reprovaria com um selo fixo. */
    expect(within(screen.getByTestId("escolher-vencida")).queryByText(/Coletada/)).toBeNull();
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

  /*
    A POSIÇÃO 0,0, que é o que o aparelho responde quando ainda não fixou.

    `getLastKnownPositionAsync` devolve a ilha nula, no golfo da Guiné, em
    aparelho recém-ligado, em emulador e em aparelho barato. Ela não é uma
    posição ruim, é a ausência de posição com cara de posição: dali as duas
    tarefas ficam a seis mil quilômetros, a ordem passa a ser por latitude (quem
    está mais ao norte está mais perto do equador), e a tela escreve o número
    como se tivesse medido e apaga o aviso de que não mediu.

    Os protocolos são explícitos para o caso saber reprovar: sem posição, o
    desempate final é o protocolo e a ordem é "perto" antes de "longe"; da ilha
    nula, "longe" (mais ao norte) passa na frente. As duas metades da prova, a
    ordem e a frase, precisam das duas.
  */
  it("a posição 0,0 de quem ainda não fixou o GPS não vira distância nenhuma", async () => {
    mockTarefas = [
      tarefa({ id: "longe", protocolo: "000900/2026", severidade: "media", ...daquiAMetros(12_000) }),
      tarefa({ id: "perto", protocolo: "000100/2026", severidade: "media", ...daquiAMetros(400) }),
    ];
    mockPermissaoConcedida = true;
    mockUltimaPosicao = { coords: { latitude: 0, longitude: 0 } };
    await abrirALista();

    expect(screen.getByText(/não considerou distância/)).toBeTruthy();
    expect(screen.queryAllByText(/\d+\s?(m|km)\b/)).toHaveLength(0);
    expect(aOrdemDaLista()).toEqual(["perto", "longe"]);
  });
});
