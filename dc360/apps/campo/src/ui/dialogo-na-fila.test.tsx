/**
 * Descartar uma coleta da fila, e o selo de estado de cada item.
 *
 * Descartar é a única ação deste aplicativo que apaga trabalho já feito sem
 * deixar rastro em lugar nenhum: a vistoria sai do aparelho e nunca chegou à
 * coordenação. Ela existe porque um item bloqueado ficaria para sempre na tela
 * e o agente aprenderia a ignorar a fila inteira, e ela pergunta porque um
 * toque errado com luva apagaria a manhã de trabalho.
 *
 * Dois defeitos travados aqui:
 *
 * 1. **A pergunta era do sistema.** Com `Alert.alert` não havia como provar que
 *    o descarte NÃO acontece enquanto ninguém responde, que é a única coisa que
 *    interessa provar.
 * 2. **"Arquivada" tinha o desenho de "Aguardando".** A palavra vinha de um
 *    `switch` e a cor de uma cadeia de ternários trezentas linhas abaixo, e o
 *    estado "arquivado" entrou só no primeiro. Os dois estados são opostos:
 *    aguardando vai chegar assim que houver sinal, arquivada nunca vai chegar
 *    porque a ocorrência foi encerrada no painel.
 *
 * O arquivo mora em `src/ui` junto das peças que ele exercita, e não em
 * `src/__tests__`: aquela pasta existe por causa do Expo, que transforma tudo
 * dentro de `src/app` em rota, e nada aqui está dentro de `src/app`.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ItemFila } from "@dc360/campo";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

/*
  A sessão precisa ser o MESMO objeto a cada renderização.

  O efeito que abre a fila depende de `obterToken`. Devolver um objeto novo a
  cada chamada faz o efeito rodar de novo a cada renderização, e como ele chama
  `setState` no fim, o teste entra em laço infinito até o Node ficar sem
  memória. Nada disso seria culpa da tela.
*/
const mockSessao = { obterToken: async () => "token-de-mentira" };
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }),
}));

let mockItens: ItemFila[] = [];
const mockDescartar = jest.fn(async () => {});
const mockReenviar = jest.fn(async () => {});
/* Pelo mesmo motivo da sessão: uma fila nova a cada chamada vira estado novo,
   que vira renderização nova, que abre a fila de novo, para sempre. */
const mockFila = {
  itens: async () => mockItens,
  assinar: () => () => undefined,
  drenar: async () => undefined,
  descartar: mockDescartar,
  reenviar: mockReenviar,
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

import TelaDaFila from "../app/(agente)/fila";
import { temaEscuro } from "./tokens";

function item(parcial: Partial<ItemFila> & Pick<ItemFila, "id" | "estado">): ItemFila {
  return {
    ocorrenciaId: `oc-${parcial.id}`,
    protocolo: "2026/000123",
    envelope: {} as ItemFila["envelope"],
    tentativas: 0,
    criadoEm: "2026-09-09T09:00:00.000Z",
    liberadoEm: "2026-09-09T09:00:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
    ...parcial,
  };
}

const BLOQUEADO = item({
  id: "coleta-bloqueada",
  estado: "bloqueado",
  protocolo: "2026/000777",
  ultimaFalha: {
    codigo: "dados_invalidos",
    mensagem: "O servidor recusou: falta a coordenada.",
    campos: [],
    permanente: true,
    em: "2026-09-09T10:00:00.000Z",
  },
});

beforeEach(() => {
  mockItens = [BLOQUEADO];
  mockDescartar.mockClear();
  mockReenviar.mockClear();
});

/** Monta a tela e espera a fila responder com a lista. */
async function abrirATela(): Promise<void> {
  await render(<TelaDaFila />);
  await act(async () => {});
}

async function tocar(texto: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByText(texto)); });
}

describe("a pergunta antes de descartar", () => {
  it("o toque em 'Descartar' abre a pergunta e NÃO apaga a coleta", async () => {
    await abrirATela();

    await tocar("Descartar");

    expect(screen.getByTestId("dialogo")).toBeTruthy();
    expect(mockDescartar).not.toHaveBeenCalled();
  });

  it("a pergunta diz QUAL coleta, pelo protocolo", async () => {
    /*
      A lista pode ter dezenas de itens e todos os cartões são parecidos. Sem o
      protocolo dentro da pergunta, o agente confirma no escuro, e o que
      distingue uma coleta da outra é exatamente esse número.
    */
    await abrirATela();

    await tocar("Descartar");

    /*
      A busca é feita DENTRO do diálogo, e não na tela inteira: o protocolo
      também está no cartão que ficou por baixo, e um `getByText` solto passaria
      achando o cartão mesmo se a pergunta não dissesse protocolo nenhum.
    */
    expect(
      within(screen.getByTestId("dialogo")).getByText(/2026\/000777/),
    ).toBeTruthy();
  });

  it("'Manter na fila' fecha a pergunta e a coleta continua lá", async () => {
    await abrirATela();
    await tocar("Descartar");

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-recusa")); });

    expect(mockDescartar).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dialogo")).toBeNull();
  });

  it("o botão que repete o verbo apaga a coleta certa", async () => {
    await abrirATela();
    await tocar("Descartar");

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });

    expect(mockDescartar).toHaveBeenCalledTimes(1);
    expect(mockDescartar).toHaveBeenCalledWith("coleta-bloqueada");
  });

  it("o botão que age diz o que faz, e não 'OK'", async () => {
    await abrirATela();
    await tocar("Descartar");

    expect(screen.getByTestId("dialogo-acao").props.accessibilityLabel)
      .toBe("Descartar esta coleta");
  });

  /*
    Tentar de novo é a saída barata e fica ao lado da cara. Ela não pergunta
    porque não perde nada, e é justamente por isso que precisa continuar
    funcionando direto: transformar as duas em perguntas ensinaria o agente a
    confirmar sem ler.
  */
  it("'Tentar de novo' continua sem perguntar, porque não destrói nada", async () => {
    await abrirATela();

    await tocar("Tentar de novo");

    expect(screen.queryByTestId("dialogo")).toBeNull();
    expect(mockReenviar).toHaveBeenCalledWith("coleta-bloqueada");
  });
});

describe("o selo de estado de cada item", () => {
  it("uma coleta ARQUIVADA não se parece com uma coleta AGUARDANDO", async () => {
    /*
      O defeito, inteiro: a palavra mudava e o desenho não. As duas ficavam
      cinzas e iguais, e o agente lia "esta ainda vai sair" numa coleta que
      nunca vai sair, porque a ocorrência foi encerrada no painel enquanto ela
      esperava sinal.
    */
    mockItens = [
      item({ id: "esperando", estado: "pendente", protocolo: "2026/000111" }),
      item({ id: "sem-destino", estado: "arquivado", protocolo: "2026/000222" }),
    ];
    await abrirATela();

    const aguardando = screen.getByText("Aguardando");
    const arquivada = screen.getByText("Arquivada");

    expect(aguardando.props.style.color).not.toBe(arquivada.props.style.color);
    expect(arquivada.props.style.color).toBe(temaEscuro.alertaTexto);
  });

  it("todo estado carrega um símbolo além da cor, porque a tela é lida sob sol", async () => {
    const casos = [
      { id: "esperando", estado: "pendente", protocolo: "2026/000001", rotulo: "Aguardando", simbolo: "…" },
      { id: "subindo", estado: "enviando", protocolo: "2026/000002", rotulo: "Enviando", simbolo: "↑" },
      { id: "chegou", estado: "confirmado", protocolo: "2026/000003", rotulo: "Enviada", simbolo: "✓" },
      { id: "travado", estado: "bloqueado", protocolo: "2026/000004", rotulo: "Precisa de atenção", simbolo: "!" },
      { id: "sem-destino", estado: "arquivado", protocolo: "2026/000005", rotulo: "Arquivada", simbolo: "✕" },
    ] as const;
    mockItens = casos.map((c) =>
      item({ id: c.id, estado: c.estado, protocolo: c.protocolo }));
    await abrirATela();

    /*
      Cada símbolo é procurado DENTRO do seu próprio selo. Procurar na tela
      inteira acharia o "!" do aviso vermelho do topo e daria o teste por
      passado mesmo com o selo sem símbolo nenhum.
    */
    for (const c of casos) {
      const selo = screen.getByLabelText(`Protocolo ${c.protocolo}: ${c.rotulo}`);
      expect(within(selo).getByText(c.simbolo)).toBeTruthy();
    }
  });

  it("o leitor de tela ouve o protocolo junto com o estado", async () => {
    await abrirATela();
    expect(
      screen.getByLabelText("Protocolo 2026/000777: Precisa de atenção"),
    ).toBeTruthy();
  });
});
