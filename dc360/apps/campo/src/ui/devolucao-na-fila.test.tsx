/**
 * A devolução de tarefa vencida vista da fila de envio.
 *
 * A fila é a tela da confiança: uma coisa guardada e ainda não enviada é
 * indistinguível, para quem olha de fora, de uma coisa perdida. A devolução
 * passou a viver aqui junto com as coletas, e é justamente por isso que ela
 * precisa de palavras próprias: "Aguardando" num cartão de devolução seria
 * lido como vistoria esperando envio, quando o agente está declarando o
 * contrário, que NÃO vistoriou.
 *
 * Três coisas o agente precisa saber olhando este cartão, e cada uma tem caso
 * aqui: que a devolução ainda não chegou, que ela chegou, e que ela foi
 * recusada (e então a tarefa voltou para a lista dele).
 *
 * Mora em `src/ui` junto das peças que exercita: `src/__tests__` existe por
 * causa do Expo, que transforma tudo dentro de `src/app` em rota.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { AutorDaColeta, ItemDeDevolucao, ItemDeVistoria, ItemFila } from "@dc360/campo";

const AGENTE: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};
const OUTRO_AGENTE: AutorDaColeta = {
  usuarioId: "u-bruno", nome: "Bruno Lima", organizacaoId: "org-serra-alta",
};

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

/* O MESMO objeto a cada renderização: um objeto novo faria o efeito que abre a
   fila rodar de novo a cada render, e ele chama `setState`. */
const mockSessao = {
  obterToken: async () => "token-de-mentira",
  lerIdentidade: () => AGENTE,
  identidade: AGENTE,
};
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }),
}));

let mockItens: ItemFila[] = [];
const mockDescartar = jest.fn(async () => {});
const mockReenviar = jest.fn(async () => {});
const mockFila = {
  itens: async () => mockItens,
  assinar: () => () => undefined,
  drenar: async () => undefined,
  descartar: mockDescartar,
  reenviar: mockReenviar,
  assumir: jest.fn(async () => {}),
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

import TelaDaFila from "../app/(agente)/fila";

function devolucao(
  parcial: Partial<ItemDeDevolucao> & Pick<ItemDeDevolucao, "estado">,
): ItemDeDevolucao {
  return {
    tipo: "devolucao",
    id: "devolucao-1",
    autor: AGENTE,
    ocorrenciaId: "oc-1",
    protocolo: "2026/000471",
    devolucao: {
      idempotencyKey: "99999999-9999-4999-8999-999999999999",
      ocorrenciaId: "oc-1",
      decididaEm: "2026-09-13T12:00:00.000Z",
      motivo: "morador_ausente",
    },
    tentativas: 0,
    criadoEm: "2026-09-13T12:00:00.000Z",
    liberadoEm: "2026-09-13T12:00:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
    ...parcial,
  };
}

function coleta(
  parcial: Partial<ItemDeVistoria> & Pick<ItemDeVistoria, "estado">,
): ItemDeVistoria {
  return {
    tipo: "vistoria",
    id: "coleta-1",
    autor: AGENTE,
    ocorrenciaId: "oc-2",
    protocolo: "2026/000999",
    envelope: {} as never,
    tentativas: 0,
    criadoEm: "2026-09-13T11:00:00.000Z",
    liberadoEm: "2026-09-13T11:00:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
    ...parcial,
  };
}

async function abrirATela(): Promise<void> {
  await render(<TelaDaFila />);
  await act(async () => {});
}

beforeEach(() => {
  mockItens = [devolucao({ estado: "pendente" })];
  mockDescartar.mockClear();
  mockReenviar.mockClear();
});

describe("o cartão da devolução tem as palavras dela", () => {
  it("esperando envio, diz que é devolução e diz o motivo", async () => {
    await abrirATela();

    expect(screen.getByText("Devolução aguardando")).toBeTruthy();
    expect(screen.getByText(/Motivo: Não havia ninguém no local/)).toBeTruthy();
    /* "Aguardando" seco é o rótulo da coleta, e prometeria uma vistoria que
       ninguém fez. */
    expect(screen.queryByText("Aguardando")).toBeNull();
  });

  it("a devolução tem seção própria, e não entra na contagem de coletas", async () => {
    mockItens = [devolucao({ estado: "pendente" }), coleta({ estado: "pendente" })];

    await abrirATela();

    expect(screen.getByText("1 tarefa devolvida")).toBeTruthy();
    expect(screen.getByText("1 coleta na fila")).toBeTruthy();
  });

  it("confirmada, diz que a coordenação recebeu e a ocorrência voltou", async () => {
    mockItens = [devolucao({ estado: "confirmado", confirmadoEm: "2026-09-13T12:30:00.000Z" })];

    await abrirATela();

    expect(screen.getByText("Devolvida")).toBeTruthy();
    expect(screen.getByText(/voltou para quem despacha/)).toBeTruthy();
  });

  /*
    A data do cartão é a da DECISÃO, e não a de uma coleta que não houve.
  */
  it("a linha de data não chama a devolução de coleta", async () => {
    await abrirATela();

    expect(screen.getByText(/Devolvida em/)).toBeTruthy();
    expect(screen.queryByText(/Coletada em/)).toBeNull();
  });
});

describe("quando o servidor recusa a devolução", () => {
  const RECUSADA = devolucao({
    estado: "bloqueado",
    ultimaFalha: {
      codigo: "ainda_no_prazo",
      mensagem: "Esta tarefa ainda não venceu pelo relógio do servidor.",
      campos: [],
      permanente: true,
      em: "2026-09-13T12:05:00.000Z",
    },
  });

  it("o cartão diz a frase do servidor e diz onde a tarefa está agora", async () => {
    mockItens = [RECUSADA];

    await abrirATela();

    expect(screen.getByText("Devolução recusada")).toBeTruthy();
    expect(screen.getByText(/ainda não venceu pelo relógio do servidor/)).toBeTruthy();
    expect(screen.getByText(/A tarefa voltou para a sua lista/)).toBeTruthy();
  });

  /*
    Item recusado não pode ficar preso: os dois verbos continuam valendo, e o
    reenvio é o caminho de quem devolveu cedo demais e espera o prazo virar.
  */
  it("dá para tentar de novo", async () => {
    mockItens = [RECUSADA];

    await abrirATela();
    await act(async () => { fireEvent.press(screen.getByText("Tentar de novo")); });

    expect(mockReenviar).toHaveBeenCalledWith("devolucao-1");
  });

  /*
    Descartar uma devolução não apaga trabalho: ela é um pedido que não chegou.
    Repetir aqui a frase da coleta ("a vistoria será apagada") assustaria com
    uma perda que não existe e esconderia a consequência que existe.
  */
  it("descartar pergunta com a consequência certa, e não com a da coleta", async () => {
    mockItens = [RECUSADA];

    await abrirATela();
    await act(async () => { fireEvent.press(screen.getByText("Descartar")); });

    const dialogo = within(screen.getByTestId("dialogo"));
    expect(dialogo.getByText(/A tarefa continua na sua lista/)).toBeTruthy();
    expect(screen.queryByText(/A vistoria do protocolo/)).toBeNull();
    /* E nada foi descartado enquanto ninguém respondeu. */
    expect(mockDescartar).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });
    expect(mockDescartar).toHaveBeenCalledWith("devolucao-1");
  });
});

describe("o aparelho de plantão que trocou de turno", () => {
  /*
    A devolução é uma declaração assinada, como a vistoria: enviá-la com a
    credencial de quem está no aparelho agora atribuiria a decisão à pessoa
    errada, e a trilha é append-only.
  */
  it("devolução de outro agente fica visível, e a frase fala de devolver", async () => {
    mockItens = [devolucao({ estado: "pendente", autor: OUTRO_AGENTE })];

    await abrirATela();

    expect(screen.getByText("De outro agente")).toBeTruthy();
    expect(screen.getByText(/Devolvida por Bruno Lima/)).toBeTruthy();
    expect(screen.queryByText(/Coletada por/)).toBeNull();
  });
});

describe("o botão de sincronizar agora", () => {
  /*
    Era `emEspera`, que só contava coleta: com uma devolução sozinha na fila, o
    botão ficava apagado e o agente não tinha como ver o envio acontecer.
  */
  it("fica ativo quando o que espera é uma devolução", async () => {
    await abrirATela();

    expect(screen.getByText("Tentar enviar agora")).toBeTruthy();
    const botao = screen.getByLabelText("Tentar enviar agora");
    expect(botao.props.accessibilityState.disabled).toBe(false);
  });
});
