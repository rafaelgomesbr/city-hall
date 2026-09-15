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

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { AutorDaColeta, ItemDeVistoria, ItemFila } from "@dc360/campo";

/*
  Quem está logado, e de quem são as coletas.

  Não é enfeite do teste: a fila só envia coleta de quem está com a sessão
  aberta, porque o autor da vistoria no laudo é quem apresentou o token. Uma
  coleta sem autor, ou de outro agente, é outro cartão e outra tela.
*/
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

/*
  A sessão precisa ser o MESMO objeto a cada renderização.

  O efeito que abre a fila depende de `obterToken`. Devolver um objeto novo a
  cada chamada faz o efeito rodar de novo a cada renderização, e como ele chama
  `setState` no fim, o teste entra em laço infinito até o Node ficar sem
  memória. Nada disso seria culpa da tela.
*/
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
const mockAssumir = jest.fn(async () => {});
/* Pelo mesmo motivo da sessão: uma fila nova a cada chamada vira estado novo,
   que vira renderização nova, que abre a fila de novo, para sempre. */
const mockFila = {
  itens: async () => mockItens,
  assinar: () => () => undefined,
  drenar: async () => undefined,
  descartar: mockDescartar,
  reenviar: mockReenviar,
  assumir: mockAssumir,
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

import TelaDaFila from "../app/(agente)/fila";
import { temaEscuro } from "./tokens";

function item(
  parcial: Partial<ItemDeVistoria> & Pick<ItemDeVistoria, "id" | "estado">,
): ItemDeVistoria {
  return {
    /* A fila leva dois tipos de item desde a devolução de tarefa vencida.
       Aqui o assunto é a coleta, então o padrão é vistoria. */
    tipo: "vistoria",
    ocorrenciaId: `oc-${parcial.id}`,
    protocolo: "2026/000123",
    autor: AGENTE,
    envelope: {} as never,
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
  mockAssumir.mockClear();
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
    /* A folha DESCE antes de sair (ver `Dialogo`): o que se cobra é que ela
       vá embora, e não que suma no mesmo quadro do toque. */
    await waitFor(() => { expect(screen.queryByTestId("dialogo")).toBeNull(); });
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

describe("a coleta arquivada tem saída pela tela", () => {
  /*
    O defeito, medido: a coordenação encerra a ocorrência por engano às 14:00
    enquanto a coleta espera sinal, às 15:00 o item vira `arquivado`, às 15:10 a
    coordenação reabre. O agente abre a fila e o cartão mostra o selo "Arquivada"
    e MAIS NADA: a linha de botões inteira estava atrás de
    `item.estado === "bloqueado"`. "Tentar enviar agora" também não resolvia,
    porque o dreno só pega pendente e enviando.

    O motor já aceitava os dois verbos para `arquivado`, com um comentário
    dizendo "sem isto, o botão some exatamente nos itens que o estado novo
    criou". Quem fazia o botão sumir era esta tela.
  */
  const ARQUIVADA = item({
    id: "coleta-arquivada",
    estado: "arquivado",
    protocolo: "2026/000888",
  });

  it("oferece 'Tentar de novo', para o caso de a ocorrência ser reaberta", async () => {
    mockItens = [ARQUIVADA];
    await abrirATela();

    await tocar("Tentar de novo");

    expect(mockReenviar).toHaveBeenCalledWith("coleta-arquivada");
  });

  it("oferece 'Descartar', com a mesma pergunta das outras", async () => {
    mockItens = [ARQUIVADA];
    await abrirATela();

    await tocar("Descartar");
    expect(mockDescartar).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });
    expect(mockDescartar).toHaveBeenCalledWith("coleta-arquivada");
  });

  it("não entra no contador de 'coletas na fila', que precisa poder zerar", async () => {
    /*
      Arquivada não vai ser enviada por ninguém. Contá-la ali produzia um número
      que nunca descia para zero, e contador que nunca zera é contador que a
      pessoa aprende a ignorar, inclusive quando ele passa a indicar algo de
      verdade.
    */
    mockItens = [ARQUIVADA];
    await abrirATela();

    expect(screen.queryByLabelText("1, coleta na fila")).toBeNull();
    /* O número saiu de dentro da frase do título e virou contador da seção; o
       que o caso guarda é o mesmo: a arquivada aparece, com seção e número
       próprios, e fora do total que precisa poder zerar. */
    expect(screen.getByLabelText("Arquivadas, 1 item")).toBeTruthy();
  });
});

describe("a coleta do agente do turno anterior", () => {
  const DE_OUTRO = item({
    id: "coleta-da-ana",
    estado: "pendente",
    protocolo: "2026/000999",
    autor: OUTRO_AGENTE,
  });

  it("não diz 'Aguardando': ela não sai enquanto quem coletou não entrar", async () => {
    /*
      No disco ela está em `pendente`, e "Aguardando" prometia que sai assim que
      houver sinal. Não sai: o dreno não toca em coleta de outra pessoa, porque o
      servidor tira o autor da vistoria de quem apresentou o token.
    */
    mockItens = [DE_OUTRO];
    await abrirATela();

    expect(screen.queryByText("Aguardando")).toBeNull();
    expect(screen.getByText("De outro agente")).toBeTruthy();
  });

  it("diz o nome de quem fez a vistoria, para alguém poder ir atrás", async () => {
    mockItens = [DE_OUTRO];
    await abrirATela();

    expect(screen.getByText(/Bruno Lima/)).toBeTruthy();
  });

  it("a pergunta antes de descartar diz de quem é a vistoria", async () => {
    // Sem o nome, o agente da noite apagaria a vistoria da colega achando que
    // estava limpando a própria fila.
    mockItens = [DE_OUTRO];
    await abrirATela();

    await tocar("Descartar");

    expect(within(screen.getByTestId("dialogo")).getByText(/Bruno Lima/)).toBeTruthy();
  });
});

describe("a coleta guardada por uma versão anterior do aplicativo", () => {
  it("pede que alguém assuma a autoria, em vez de subir com quem estiver logado", async () => {
    /*
      Item gravado antes de a fila carimbar o autor. Não dá para saber de quem
      é: subir com quem estiver logado seria o defeito de novo, e deixá-la presa
      para sempre seria perder uma vistoria feita no morro. Então a autoria vira
      um ato da pessoa, com o dedo.
    */
    mockItens = [item({ id: "coleta-antiga", estado: "pendente", autor: null })];
    await abrirATela();

    expect(screen.getByText("Sem autor registrado")).toBeTruthy();

    await tocar("Esta coleta é minha");

    expect(mockAssumir).toHaveBeenCalledWith("coleta-antiga");
  });
});

describe("sinal ruim por muito tempo", () => {
  it("não vira convite para apagar a vistoria", async () => {
    /*
      Antes, cerca de cinco minutos de sinal ruim (Wi-Fi de prefeitura de pé mas
      sem rota, borda de cobertura) bloqueavam a coleta: cartão vermelho,
      "repetir o envio não resolve sozinho", e um botão "Descartar" ao lado, em
      cima de uma vistoria que subiria sozinha na janela de sinal seguinte.
    */
    mockItens = [item({ id: "muitas-tentativas", estado: "pendente", tentativas: 14 })];
    await abrirATela();

    expect(screen.getByText("Aguardando")).toBeTruthy();
    expect(screen.getByText(/vai continuar tentando sozinha/)).toBeTruthy();
    expect(screen.getByText(/sinal melhor/)).toBeTruthy();
    // Não se oferece apagar o que ainda vai subir sozinho.
    expect(screen.queryByText("Descartar")).toBeNull();
    expect(screen.queryByText(/precisa de atenção/i)).toBeNull();
  });
});
