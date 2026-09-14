/**
 * A tarefa vencida que o agente devolve para a coordenação.
 *
 * A situação, na letra: o agente sobe o morro, a tarefa VENCE e ele não
 * consegue vistoriar. Não localizou o endereço, não havia ninguém, o portão
 * estava trancado, o barranco continuava cedendo. Antes disto a tarefa ficava
 * na lista dele para sempre, envelhecendo, e a coordenação só descobria por
 * telefonema, se descobrisse.
 *
 * O verbo é DEVOLVER, e cada caso aqui existe por causa disso: a ocorrência não
 * some, ela volta para quem despacha. Se a tela dissesse "descartar", o agente
 * apertaria achando que está limpando lixo quando está pedindo que outra pessoa
 * assuma.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { ItemFila } from "@dc360/campo";
import type { Pendencia } from "../dados/api";

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

jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  enderecoDaApi: () => "https://api.exemplo",
}));

let mockTarefas: Pendencia[] = [];
const mockEsquecidas: string[] = [];

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => "2026-09-13T13:00:00.000Z"),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
  esquecerPendencia: jest.fn(async (id: string) => { mockEsquecidas.push(id); }),
}));

/*
  Listas vazias ESTÁVEIS, e não `[]` recriado a cada chamada.

  A tela relê o disco a cada foco, e `useFocusEffect` depende da função de
  leitura. Devolver um array novo a cada leitura troca o estado, que provoca
  renderização, que relê o disco: o teste roda até a memória acabar. É defeito
  do dublê e não da tela, mas custa oito minutos para descobrir, então fica
  escrito.
*/
const SEM_RASCUNHOS: never[] = [];
let mockColetas: Array<{ ocorrenciaId: string; situacao: string }> = [];

jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => SEM_RASCUNHOS) }));

jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
  marcarEnviada: jest.fn(async () => {}),
}));

let mockItensDaFila: ItemFila[] = [];
let mockResultado: Awaited<ReturnType<import("@dc360/campo").FilaDeSincronizacao["enfileirarDevolucao"]>>;
const mockEnfileirarDevolucao = jest.fn(async (devolucao: unknown, dados: unknown) => {
  registrados.push({ devolucao, dados });
  return mockResultado;
});
const registrados: Array<{ devolucao: unknown; dados: unknown }> = [];

/* A fila é a MESMA a cada chamada, como no aparelho (ela é memoizada e vive o
   dia inteiro): uma fila nova por chamada viraria estado novo e renderização
   nova, para sempre. */
const mockDrenar = jest.fn(async () => ({
  fotosEnviadas: 0, enviados: 0, duplicados: 0, adiados: 0, bloqueados: 0, interrompido: false,
}));
const mockFila = {
  itens: async () => mockItensDaFila,
  assinar: () => () => undefined,
  enfileirarDevolucao: mockEnfileirarDevolucao,
  drenar: mockDrenar,
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

/* Sem sinal: é a condição em que a decisão de devolver é tomada, no morro. */
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

const ID = "11111111-1111-4111-8111-111111111111";
const PROTOCOLO = "000471/2026";

/** Vencida há três horas, que é o caso do agente que subiu e não conseguiu. */
const VENCIDA = new Date(Date.now() - 3 * 3_600_000).toISOString();
const NO_PRAZO = new Date(Date.now() + 6 * 3_600_000).toISOString();

function tarefa(prazo: string | null): Pendencia {
  return {
    id: ID,
    protocolo: PROTOCOLO,
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
    prazo_em: prazo,
    criado_em: "2026-09-13T09:00:00.000Z",
  } as Pendencia;
}

function itemDaFila(parcial: Partial<ItemFila> & Pick<ItemFila, "tipo" | "estado">): ItemFila {
  return {
    id: "item-1",
    autor: { usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-1" },
    ocorrenciaId: ID,
    protocolo: PROTOCOLO,
    tentativas: 0,
    criadoEm: "2026-09-13T12:00:00.000Z",
    liberadoEm: "2026-09-13T12:00:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
    ...(parcial.tipo === "devolucao"
      ? {
          devolucao: {
            idempotencyKey: "99999999-9999-4999-8999-999999999999",
            ocorrenciaId: ID,
            decididaEm: "2026-09-13T12:00:00.000Z",
            motivo: "morador_ausente" as const,
          },
        }
      : { envelope: {} as never }),
    ...parcial,
  } as ItemFila;
}

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
}

async function tocar(id: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByTestId(id)); });
}

beforeEach(() => {
  mockTarefas = [tarefa(VENCIDA)];
  mockItensDaFila = [];
  mockColetas = [];
  mockEsquecidas.length = 0;
  registrados.length = 0;
  /*
    `mockReset` e não `mockClear`: um caso abaixo troca a implementação para
    representar a fila gravando o item, e `mockClear` deixaria essa
    implementação de pé para os casos seguintes. Foi assim que o último caso
    deste arquivo reprovou com a lista vazia de um teste anterior.
  */
  mockDrenar.mockClear();
  mockEnfileirarDevolucao.mockReset();
  mockEnfileirarDevolucao.mockImplementation(async (devolucao, dados) => {
    registrados.push({ devolucao, dados });
    return mockResultado;
  });
  mockResultado = {
    enfileirada: true,
    item: itemDaFila({ tipo: "devolucao", estado: "pendente" }),
    jaExistia: false,
  };
});

describe("quando a opção aparece", () => {
  /*
    Sem a trava do prazo, um dia ruim vira uma lista limpa: o agente devolve
    tudo às oito da manhã e a coordenação descobre ao meio-dia.
  */
  it("tarefa no prazo não oferece devolução", async () => {
    mockTarefas = [tarefa(NO_PRAZO)];

    await abrirALista();

    expect(screen.queryByTestId(`devolver-${ID}`)).toBeNull();
    /* E não fica uma frase sobre devolução sobrando: tarefa no prazo não tem
       por que falar disso, e uma linha a mais por item numa lista de vinte é
       ruído que ensina a não ler. */
    expect(screen.queryByText(/Devolver/)).toBeNull();
  });

  it("tarefa sem prazo definido também não oferece", async () => {
    mockTarefas = [tarefa(null)];

    await abrirALista();

    expect(screen.queryByTestId(`devolver-${ID}`)).toBeNull();
  });

  it("tarefa vencida oferece devolver para a coordenação", async () => {
    await abrirALista();

    expect(screen.getByTestId(`devolver-${ID}`)).toBeTruthy();
    expect(screen.getByText("Devolver para a coordenação")).toBeTruthy();
  });

  /*
    O verbo decide o uso. "Descartar" faria o agente acreditar que a ocorrência
    some, e ele tocaria achando que está limpando lixo.
  */
  it("a palavra é devolver, e nunca descartar", async () => {
    await abrirALista();

    expect(screen.queryByText(/Descartar/)).toBeNull();
    expect(screen.getByTestId(`devolver-${ID}`).props.accessibilityLabel)
      .toContain("Devolver para a coordenação a tarefa vencida");
  });
});

describe("o diálogo do motivo", () => {
  it("diz o que vai acontecer antes de qualquer escolha", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);

    const dialogo = within(screen.getByTestId("dialogo-devolucao"));
    expect(dialogo.getByText(/sai da sua lista/)).toBeTruthy();
    expect(dialogo.getByText(/volta para a coordenação/)).toBeTruthy();
    expect(dialogo.getByText(/o seu nome/)).toBeTruthy();
    expect(dialogo.getByText(/não é encerrada e nada é/)).toBeTruthy();
  });

  /*
    Botão que aceita o toque e recusa depois é pior em campo: o agente lê
    "devolver", toca, e a tela diz que não.
  */
  it("sem motivo escolhido, a ação fica travada e a tela diz o que falta", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);

    expect(screen.getByTestId("dialogo-acao").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/Escolha um motivo/)).toBeTruthy();

    await tocar("dialogo-acao");
    expect(mockEnfileirarDevolucao).not.toHaveBeenCalled();
  });

  it("com o motivo escolhido, a ação libera", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);
    await tocar("motivo-morador_ausente");

    expect(screen.getByTestId("dialogo-acao").props.accessibilityState.disabled).toBe(false);
  });

  /*
    "Outro" sozinho não responde nada para quem vai decidir o que fazer com a
    ocorrência, e é justamente o motivo mais fácil de escolher com pressa.
  */
  it("o motivo 'outro' exige texto, e texto curto não vale", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);
    await tocar("motivo-outro");

    expect(screen.getByTestId("dialogo-acao").props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("devolucao-observacao"), "nao deu");
    });
    expect(screen.getByTestId("dialogo-acao").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/escreva em uma linha o que aconteceu/)).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("devolucao-observacao"),
        "O acesso está interditado pela concessionária desde ontem.",
      );
    });
    expect(screen.getByTestId("dialogo-acao").props.accessibilityState.disabled).toBe(false);
  });

  it("o campo de texto só existe no motivo 'outro'", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);

    expect(screen.queryByTestId("devolucao-observacao")).toBeNull();
    await tocar("motivo-acesso_impedido");
    expect(screen.queryByTestId("devolucao-observacao")).toBeNull();
  });

  /* Alvo de dedo com luva, na chuva: a régua deste aplicativo é 52, e não a do
     sistema, que é o que `Alert.alert` traria. */
  it("cada motivo tem o alvo de toque do aplicativo", async () => {
    const { toque } = require("../ui/tokens") as { toque: number };
    await abrirALista();
    await tocar(`devolver-${ID}`);

    for (const opcao of ["motivo-morador_ausente", "motivo-outro"]) {
      const estilo = screen.getByTestId(opcao).props.style;
      expect(estilo.minHeight).toBeGreaterThanOrEqual(toque);
    }
  });

  it("a recusa diz o que acontece com quem não devolve", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);

    expect(screen.getByTestId("dialogo-recusa").props.accessibilityLabel)
      .toBe("Manter comigo");
  });
});

describe("o que entra na fila", () => {
  it("a devolução é enfileirada com o motivo, a ocorrência e o protocolo", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);
    await tocar("motivo-risco_para_a_equipe");
    await tocar("dialogo-acao");

    expect(mockEnfileirarDevolucao).toHaveBeenCalledTimes(1);
    expect(registrados[0]!.devolucao).toMatchObject({
      ocorrenciaId: ID,
      motivo: "risco_para_a_equipe",
      idempotencyKey: "99999999-9999-4999-8999-999999999999",
    });
    expect(registrados[0]!.dados).toEqual({ protocolo: PROTOCOLO });
  });

  /*
    A autoria NÃO é montada aqui: ela sai do carimbo que a fila põe no item, e
    vira `devolvidaPor` na hora do envio. Se a tela mandasse um autor, o aparelho
    de plantão que trocou de turno assinaria a decisão com a pessoa errada.
  */
  it("a tela não inventa autoria: quem devolveu sai do carimbo da fila", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);
    await tocar("motivo-morador_ausente");
    await tocar("dialogo-acao");

    expect(registrados[0]!.devolucao).not.toHaveProperty("devolvidaPor");
  });

  it("a observação só viaja quando foi escrita", async () => {
    await abrirALista();
    await tocar(`devolver-${ID}`);
    await tocar("motivo-outro");
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("devolucao-observacao"),
        "Portão trancado e ninguém atende desde a semana passada.",
      );
    });
    await tocar("dialogo-acao");

    expect(registrados[0]!.devolucao).toMatchObject({
      motivo: "outro",
      observacao: "Portão trancado e ninguém atende desde a semana passada.",
    });
  });

  /*
    O alívio que o agente quer: a tarefa sai da lista NA HORA. A garantia do
    produto: ela continua no aparelho, na fila, até o servidor confirmar.

    "Na hora" é o NÚMERO, e não o desenho, e a distinção é da frente de
    movimento: o cabeçalho cai para zero no mesmo quadro em que a devolução
    entra na fila, porque é ele que decide o dia do agente, e o cartão fica
    saindo por `movimento.mudancaDeEstado`. Sumir no quadro seguinte era um
    corte seco no fim de um ato institucional: escolher o motivo, confirmar, e
    a tela responder com um cartão a menos. Quem estava olhando para a parte de
    baixo da lista não via nada acontecer.
  */
  it("a tarefa sai da lista assim que a devolução entra na fila", async () => {
    await abrirALista();
    expect(screen.getByText("1 vistoria para fazer")).toBeTruthy();

    mockEnfileirarDevolucao.mockImplementation(async (devolucao, dados) => {
      registrados.push({ devolucao, dados });
      mockItensDaFila = [itemDaFila({ tipo: "devolucao", estado: "pendente" })];
      return mockResultado;
    });

    await tocar(`devolver-${ID}`);
    await tocar("motivo-morador_ausente");
    await tocar("dialogo-acao");

    /* A CONTAGEM não espera a animação: ela é o que o agente lê para saber
       quanto trabalho sobrou, e um número que mente por um quarto de segundo
       mente em cima da única coisa que essa tela existe para dizer. */
    expect(screen.getByText("0 vistorias para fazer")).toBeTruthy();
    /* E ela NÃO sumiu do aparelho: o item continua na fila de envio. */
    expect(mockItensDaFila).toHaveLength(1);

    /* O cartão sai de verdade, e não fica pendurado: quem o larga é o
       temporizador da tela, e não o fim da animação. */
    await waitFor(() => { expect(screen.queryByText(PROTOCOLO)).toBeNull(); });
  });

  it("enquanto a devolução está a caminho, a tarefa não volta sozinha", async () => {
    mockItensDaFila = [itemDaFila({ tipo: "devolucao", estado: "enviando" })];

    await abrirALista();

    expect(screen.queryByText(PROTOCOLO)).toBeNull();
  });

  /*
    Confirmada, o aparelho pode esquecer a tarefa. Sem isto, ela voltaria para a
    lista quando o item confirmado saísse da fila, sem explicação nenhuma, até a
    próxima baixa com sinal.
  */
  it("confirmada pelo servidor, a tarefa é apagada da cópia local", async () => {
    mockItensDaFila = [itemDaFila({ tipo: "devolucao", estado: "confirmado" })];

    await abrirALista();

    expect([...new Set(mockEsquecidas)]).toEqual([ID]);
  });
});

describe("quando o servidor recusa", () => {
  /*
    Quem decide se a tarefa venceu é o relógio do SERVIDOR: relógio de aparelho
    é ajustável, erra sozinho e atravessa fuso. A tarefa precisa VOLTAR, com a
    frase de lá, em vez de sumir sem ninguém ter recebido nada.
  */
  it("a tarefa volta para a lista com a frase que veio do servidor", async () => {
    mockItensDaFila = [itemDaFila({
      tipo: "devolucao",
      estado: "bloqueado",
      ultimaFalha: {
        codigo: "ainda_no_prazo",
        mensagem: "Esta tarefa ainda não venceu pelo relógio do servidor.",
        campos: [],
        permanente: true,
        em: "2026-09-13T12:05:00.000Z",
      },
    })];

    await abrirALista();

    expect(screen.getByText(PROTOCOLO)).toBeTruthy();
    expect(screen.getByText(/A coordenação não recebeu esta devolução/)).toBeTruthy();
    expect(screen.getByText(/ainda não venceu pelo relógio do servidor/)).toBeTruthy();
    /* O caminho de saída fica na fila, onde o pedido recusado continua. */
    expect(screen.getByText(/fila de envio/)).toBeTruthy();
  });

  it("com a devolução recusada, a tela não oferece devolver de novo por aqui", async () => {
    mockItensDaFila = [itemDaFila({
      tipo: "devolucao",
      estado: "bloqueado",
      ultimaFalha: {
        codigo: "equipe_divergente",
        mensagem: "Esta tarefa não está com a sua equipe.",
        campos: [],
        permanente: true,
        em: "2026-09-13T12:05:00.000Z",
      },
    })];

    await abrirALista();

    expect(screen.queryByTestId(`devolver-${ID}`)).toBeNull();
  });
});

describe("a coleta que ainda não subiu", () => {
  /*
    O agente vistoriou, o envio não saiu por falta de sinal, e a tarefa venceu.
    Devolver aqui jogaria fora a manhã dele, em silêncio, e faria a coordenação
    receber "não deu para vistoriar" sobre uma vistoria que existe.
  */
  it("tarefa vencida com coleta na fila não oferece devolver, e o ⓘ diz por quê", async () => {
    mockItensDaFila = [itemDaFila({ tipo: "vistoria", estado: "pendente" })];

    await abrirALista();

    expect(screen.queryByTestId(`devolver-${ID}`)).toBeNull();
    /*
      O PARÁGRAFO SAIU DO FLUXO, e foi o pedido literal do Rafa olhando o
      aparelho: 41 palavras ocupavam o lugar do botão em toda tarefa impedida,
      e com duas tarefas assim na tela aquilo pareceu o mesmo texto duas vezes.
      A explicação não sumiu, ela ficou a um toque.
    */
    expect(screen.queryByText(/Devolver jogaria esse trabalho fora/)).toBeNull();

    await tocar(`por-que-${ID}`);

    expect(screen.getByText(/Devolver jogaria esse trabalho fora/)).toBeTruthy();
    expect(screen.getByText(/veja a fila de envio/)).toBeTruthy();
  });

  it("a mesma trava vale para coleta bloqueada, que é trabalho a recuperar", async () => {
    mockItensDaFila = [itemDaFila({ tipo: "vistoria", estado: "bloqueado" })];

    await abrirALista();

    expect(screen.queryByTestId(`devolver-${ID}`)).toBeNull();
  });

  /*
    A JANELA QUE SÓ A FILA NÃO FECHAVA: a coleta confirmada sai da fila em
    trinta segundos, e a tarefa vencida da lista antiga voltaria a oferecer
    devolução sobre uma vistoria que já está no servidor. Quem fecha é a lápide,
    que sobrevive à limpeza da fila.
  */
  it("coleta já enviada, sem nada na fila, também não oferece devolver", async () => {
    mockColetas = [{ ocorrenciaId: ID, situacao: "enviada" }];

    await abrirALista();

    expect(screen.queryByTestId(`devolver-${ID}`)).toBeNull();
    await tocar(`por-que-${ID}`);
    expect(screen.getByText(/vistoria que existe/)).toBeTruthy();
  });

  /*
    Lápide arquivada é o agente tendo pedido, com confirmação, para vistoriar de
    novo: não há coleta guardada, e a tarefa vencida volta a poder ser devolvida.
  */
  it("lápide arquivada não impede: ali o agente decidiu vistoriar de novo", async () => {
    mockColetas = [{ ocorrenciaId: ID, situacao: "arquivada" }];

    await abrirALista();

    expect(screen.getByTestId(`devolver-${ID}`)).toBeTruthy();
  });

  /*
    Segunda barreira, no motor: a tela é a primeira e não a única. Se a fila
    recusar, a tela diz a mesma frase em vez de calar.
  */
  it("se a fila recusar por coleta guardada, a tela explica em vez de calar", async () => {
    mockResultado = { enfileirada: false, motivo: "coleta_na_fila" };

    await abrirALista();
    await tocar(`devolver-${ID}`);
    await tocar("motivo-morador_ausente");
    await tocar("dialogo-acao");

    expect(screen.getByText(/Devolver jogaria esse trabalho fora/)).toBeTruthy();
    /* A tarefa continua onde estava: nada foi devolvido. */
    expect(screen.getByText(PROTOCOLO)).toBeTruthy();
  });
});

/*
  O QUE FALTA ALI NÃO É DEVOLVER, É SINAL. Decidido com o Rafa.

  A tarefa venceu e a coleta está guardada no aparelho: a vistoria EXISTE, e o
  que a segura é a falta de sinal. Antes, o cartão respondia a essa situação com
  um parágrafo explicando por que o botão de devolver não estava lá, que é a
  resposta para uma pergunta que quase ninguém faz. A resposta para a pergunta
  de todo mundo ("e agora?") não existia em lugar nenhum da tela.
*/
describe("a tarefa vencida que já tem coleta guardada", () => {
  beforeEach(() => {
    mockItensDaFila = [itemDaFila({ tipo: "vistoria", estado: "pendente" })];
  });

  it("oferece 'Enviar agora' em destaque, no lugar do parágrafo", async () => {
    await abrirALista();

    expect(screen.getByTestId(`enviar-${ID}`)).toBeTruthy();
    expect(screen.getByText("Enviar agora")).toBeTruthy();
  });

  it("o toque chama o dreno da fila deste aparelho", async () => {
    await abrirALista();

    await tocar(`enviar-${ID}`);

    expect(mockDrenar).toHaveBeenCalledTimes(1);
  });

  /*
    Sem sinal o dreno não manda nada, e a tela precisa dizer isso sem assustar:
    o trabalho continua guardado e sai sozinho. Prometer envio aqui seria a
    tela afirmando o que o servidor não tem.
  */
  it("sem sinal, a tela diz que a coleta continua guardada", async () => {
    await abrirALista();

    await tocar(`enviar-${ID}`);

    expect(screen.getByText("Ainda não deu para enviar")).toBeTruthy();
    expect(screen.getByText(/continua guardada no aparelho/)).toBeTruthy();
  });

  it("com a confirmação do servidor, a tela diz que a coordenação recebeu", async () => {
    await abrirALista();

    /* O dreno subiu a coleta, e o item voltou confirmado. */
    mockDrenar.mockImplementation(async () => {
      mockItensDaFila = [itemDaFila({ tipo: "vistoria", estado: "confirmado" })];
      return {
        fotosEnviadas: 0, enviados: 1, duplicados: 0, adiados: 0, bloqueados: 0,
        interrompido: false,
      };
    });

    await tocar(`enviar-${ID}`);

    expect(screen.getByText("Enviado")).toBeTruthy();
    expect(screen.getByText(/já recebeu esta vistoria/)).toBeTruthy();
  });

  /*
    A frase de resultado sai do ITEM desta ocorrência, e não do total do dreno:
    o dreno manda tudo o que está pronto, e "enviado" por causa da coleta de
    OUTRA tarefa seria a mentira mais fácil de escrever aqui.
  */
  it("o servidor que recusa não vira 'enviado'", async () => {
    await abrirALista();

    mockDrenar.mockImplementation(async () => {
      mockItensDaFila = [itemDaFila({ tipo: "vistoria", estado: "bloqueado" })];
      return {
        fotosEnviadas: 0, enviados: 3, duplicados: 0, adiados: 0, bloqueados: 1,
        interrompido: false,
      };
    });

    await tocar(`enviar-${ID}`);

    expect(screen.getByText("O servidor não aceitou este envio")).toBeTruthy();
    expect(screen.queryByText("Enviado")).toBeNull();
  });

  /*
    Devolver continua bloqueado, e não é teimosia: jogaria fora, em silêncio, a
    vistoria feita no morro.
  */
  it("devolver continua bloqueado ali, e o ⓘ explica", async () => {
    await abrirALista();

    expect(screen.queryByTestId(`devolver-${ID}`)).toBeNull();

    await tocar(`por-que-${ID}`);
    expect(screen.getByText("Esta tarefa não pode ser devolvida")).toBeTruthy();
    expect(screen.getByText(/Devolver jogaria esse trabalho fora/)).toBeTruthy();
  });
});

/*
  O AVISO QUE NUNCA ERA LIMPO.

  `avisoDaDevolucao` só era zerado no caminho do sucesso. Uma recusa colava a
  frase no topo da tela PARA SEMPRE, enquanto o cartão mostrava a própria cópia
  embaixo: duas fontes independentes do mesmo texto na mesma tela, e foi isso
  que o Rafa viu como "aparece duas vezes".
*/
describe("a recusa não cola nada na tela para sempre", () => {
  it("a recusa por sessão perdida é dita, e pode ser dispensada", async () => {
    mockResultado = { enfileirada: false, motivo: "sem_sessao" };

    await abrirALista();
    await tocar(`devolver-${ID}`);
    await tocar("motivo-morador_ausente");
    await tocar("dialogo-acao");

    expect(screen.getByText("A devolução não foi registrada")).toBeTruthy();

    await tocar("detalhe-da-lista");
    expect(screen.getByText(/sessão aberta neste aparelho/)).toBeTruthy();

    await tocar("dialogo-acao");

    /* O aviso saiu. O `ⓘ` continua ali porque a lista desta suíte é velha, e a
       faixa passou a mostrar o aviso seguinte: é a faixa fazendo o que ela
       existe para fazer, uma coisa de cada vez e nenhuma perdida. */
    expect(screen.queryByText("A devolução não foi registrada")).toBeNull();
  });

  /*
    Quando a fila recusa por coleta guardada, a resposta certa é CORRIGIR O
    CARTÃO, e não escrever um aviso no topo: a tela descobriu, naquele instante,
    que existe vistoria daquela ocorrência no aparelho. Escrever a frase em cima
    e deixar o cartão errado embaixo é como as duas fontes nasceram.
  */
  it("a recusa por coleta guardada corrige o cartão em vez de escrever no topo", async () => {
    mockEnfileirarDevolucao.mockImplementation(async (devolucao, dados) => {
      registrados.push({ devolucao, dados });
      mockItensDaFila = [itemDaFila({ tipo: "vistoria", estado: "pendente" })];
      return { enfileirada: false, motivo: "coleta_na_fila" } as const;
    });

    await abrirALista();
    await tocar(`devolver-${ID}`);
    await tocar("motivo-morador_ausente");
    await tocar("dialogo-acao");

    /* O cartão passou a oferecer o que resolve o caso. */
    expect(screen.getByTestId(`enviar-${ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`devolver-${ID}`)).toBeNull();
    /* E a frase aparece UMA vez, no diálogo que respondeu o toque. */
    expect(screen.queryAllByText(/Devolver jogaria esse trabalho fora/)).toHaveLength(1);
    expect(screen.queryByText("A devolução não foi registrada")).toBeNull();
  });
});
