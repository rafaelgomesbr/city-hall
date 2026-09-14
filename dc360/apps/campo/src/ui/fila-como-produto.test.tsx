/**
 * A fila de envio deixa de ser uma coluna de parágrafos.
 *
 * O texto desta tela é o melhor do repositório e estava no formato errado:
 * dezesseis variantes de prosa, cada uma entregue inteira a um único `Txt`
 * cinza dentro do cartão. O pior deles tinha quarenta e cinco palavras, e as
 * últimas vinte eram instrução operacional ("peça para fulano entrar neste
 * aparelho com sinal", "avise a coordenação e informe o protocolo") enterrada
 * no fim de um parágrafo em cor discreta, lido em pé, na chuva.
 *
 * Sete defeitos travados aqui, um caso por defeito:
 *
 * 1. o parágrafo vira estrutura: quem, por quê, o que fazer;
 * 2. as quatro seções deixam de ser um `h2` solto no fluxo;
 * 3. a fila vazia deixa de ser uma frase cinza seguida de um botão apagado;
 * 4. "Tentar de novo" e "Esta coleta é minha" passam a ter retorno de toque;
 * 5. o botão apagado passa a dizer POR QUÊ, na tela e não num comentário;
 * 6. o item confirmado sai desaparecendo, e não num corte seco;
 * 7. a espera de abertura ganha a saída que `Carregando` já sabia oferecer.
 *
 * O arquivo mora em `src/ui` pela mesma razão dos vizinhos: `src/app` é rota
 * para o Expo, e nada que está aqui é tela.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { AutorDaColeta, ItemDeVistoria, ItemFila } from "@dc360/campo";

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

/* O motor tátil não existe aqui, e não é ele que se mede: o que se cobra é
   QUANDO a tela pede vibração. A ponte com `expo-haptics` tem teste próprio em
   `ui/retorno-tatil.test.ts`. */
const mockRetornoTatil = jest.fn();
jest.mock("./retornoTatil", () => ({
  retornoTatil: (momento: string) => mockRetornoTatil(momento),
}));

/* A sessão precisa ser o MESMO objeto a cada renderização: um objeto novo faz o
   efeito de abertura rodar de novo a cada render, e o teste entra em laço. */
const mockSessao = {
  obterToken: async () => "token-de-mentira",
  lerIdentidade: () => AGENTE,
  identidade: AGENTE,
};
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));

/** O sinal é do teste, porque o botão apagado depende dele. */
let mockSinal = { temSinal: true, tipo: "Wi-Fi" };
jest.mock("../dados/conectividade", () => ({ useSinal: () => mockSinal }));

let mockItens: ItemFila[] = [];
const mockDescartar = jest.fn(async () => {});
const mockReenviar = jest.fn(async () => {});
const mockAssumir = jest.fn(async () => {});
/** O que a fila chama quando algo muda de estado, guardado para o teste
 *  disparar a releitura da lista sem mexer no relógio do aplicativo. */
let avisarQueMudou: (() => void) | null = null;
const mockFila = {
  itens: async () => mockItens,
  assinar: (aviso: () => void) => {
    avisarQueMudou = aviso;
    return () => { avisarQueMudou = null; };
  },
  drenar: async () => undefined,
  descartar: mockDescartar,
  reenviar: mockReenviar,
  assumir: mockAssumir,
};
/* A abertura da fila é trocável pelo teste: o caso da espera precisa de uma
   que nunca responde, que é a situação real de primeira abertura sem sinal. */
let mockObterFila: () => Promise<typeof mockFila> = async () => mockFila;
jest.mock("../dados/fila", () => ({ obterFila: () => mockObterFila() }));

import TelaDaFila from "../app/(agente)/fila";
import { movimento } from "./tokens";
import { DEMORA_MS } from "./componentes";

function item(
  parcial: Partial<ItemDeVistoria> & Pick<ItemDeVistoria, "id" | "estado">,
): ItemDeVistoria {
  return {
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

beforeEach(() => {
  mockItens = [];
  mockSinal = { temSinal: true, tipo: "Wi-Fi" };
  mockObterFila = async () => mockFila;
  avisarQueMudou = null;
  mockRetornoTatil.mockClear();
  mockDescartar.mockClear();
  mockReenviar.mockClear();
  mockAssumir.mockClear();
});

afterEach(() => { jest.useRealTimers(); });

async function abrirATela(): Promise<void> {
  await render(<TelaDaFila />);
  await act(async () => {});
}

async function tocar(texto: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByText(texto)); });
}

/**
 * Todo pedaço de texto que a tela desenhou, em ordem.
 *
 * A leitura é da árvore renderizada e não do arquivo de origem: o que interessa
 * é o que chega ao olho de quem está na rua. Um parágrafo montado por
 * concatenação chega aqui como UMA string, que é exatamente a unidade que o
 * caso do tamanho precisa medir.
 */
function textosNaTela(): string[] {
  const achados: string[] = [];
  const visitar = (no: unknown): void => {
    if (no === null || no === undefined) return;
    if (Array.isArray(no)) { for (const filho of no) visitar(filho); return; }
    if (typeof no === "string") { achados.push(no); return; }
    if (typeof no === "object" && "children" in (no as Record<string, unknown>)) {
      visitar((no as { children?: unknown }).children);
    }
  };
  visitar(screen.toJSON());
  return achados;
}

/* ========================================================================
   1. O parágrafo vira estrutura
   ======================================================================== */

describe("o cartão responde três perguntas, em vez de contar uma história", () => {
  const DE_OUTRO = item({
    id: "coleta-da-bruna",
    estado: "pendente",
    protocolo: "2026/000999",
    autor: OUTRO_AGENTE,
  });

  /**
   * O teto de palavras de um pedaço de texto dentro do cartão.
   *
   * Trinta, e não quinze: as frases desta tela dizem coisas caras (quem assina
   * o laudo, o que acontece se o item for descartado) e encurtar por encurtar
   * produziria a lacônica "erro ao enviar" que este produto existe para não
   * ter. O que o número proíbe é o PARÁGRAFO: o caso de "outro agente" tinha
   * quarenta e cinco palavras num nó só, com a instrução operacional no fim.
   */
  const TETO_DE_PALAVRAS = 30;

  it("nenhum pedaço de texto do cartão é um parágrafo", async () => {
    mockItens = [DE_OUTRO];
    await abrirATela();

    const compridos = textosNaTela()
      .map((t) => ({ texto: t, palavras: t.trim().split(/\s+/).length }))
      .filter((t) => t.palavras > TETO_DE_PALAVRAS);

    expect(compridos).toEqual([]);
  });

  it("diz QUEM primeiro, e o nome não fica na quinta linha", async () => {
    mockItens = [DE_OUTRO];
    await abrirATela();

    /* O nome inteiro num nó só, e não no meio de uma frase: é a primeira coisa
       que o agente precisa ler para saber que aquilo não é dele. */
    expect(screen.getByText("Coletada por Bruno Lima")).toBeTruthy();
  });

  it("diz POR QUÊ, sem a instrução grudada na explicação", async () => {
    mockItens = [DE_OUTRO];
    await abrirATela();

    const porque = screen.getByText(/só pode ser enviada pela conta de quem fez a vistoria/);
    expect(porque).toBeTruthy();
    /* A instrução saiu daqui: ela virou passo, com lugar próprio. */
    expect(porque.props.children).not.toMatch(/Peça para/);
  });

  it("diz O QUE FAZER, em passos, com título próprio", async () => {
    mockItens = [DE_OUTRO];
    await abrirATela();

    expect(screen.getByText("O que fazer")).toBeTruthy();
    expect(screen.getByText("Peça para Bruno entrar neste aparelho com sinal.")).toBeTruthy();
    expect(
      screen.getByText("Se isso não for possível, avise a coordenação e informe o protocolo acima."),
    ).toBeTruthy();
    /* Dois passos, e por isso numerados. Um "1." sozinho seria ruído. */
    expect(screen.getByText("1.")).toBeTruthy();
    expect(screen.getByText("2.")).toBeTruthy();
  });

  it("a coleta sem autor também vira passos, e não um parágrafo", async () => {
    mockItens = [item({ id: "coleta-antiga", estado: "pendente", autor: null })];
    await abrirATela();

    expect(screen.getByText("O que fazer")).toBeTruthy();
    expect(screen.getByText(/Se não for sua, avise a coordenação antes de descartar\./))
      .toBeTruthy();
  });

  it("quando não há nada a fazer, não existe bloco de passos", async () => {
    /*
      Bloco vazio com título é pior que bloco nenhum: ensina o agente a procurar
      instrução onde não tem, e da terceira vez ele para de procurar sempre.
    */
    mockItens = [item({ id: "esperando", estado: "pendente" })];
    await abrirATela();

    expect(screen.queryByText("O que fazer")).toBeNull();
  });
});

/* ========================================================================
   2. As quatro seções
   ======================================================================== */

describe("as quatro seções param de ser um texto de 21 pontos", () => {
  beforeEach(() => {
    mockItens = [
      item({ id: "esperando", estado: "pendente", protocolo: "2026/000111" }),
      item({ id: "travada", estado: "bloqueado", protocolo: "2026/000222" }),
      item({
        id: "devolucao-1",
        tipo: "devolucao",
        estado: "pendente",
        protocolo: "2026/000333",
        devolucao: { motivo: "sem_acesso_ao_local", observacao: null },
      } as never),
      item({
        id: "da-bruna", estado: "pendente", protocolo: "2026/000444", autor: OUTRO_AGENTE,
      }),
      item({ id: "sem-destino", estado: "arquivado", protocolo: "2026/000555" }),
    ];
  });

  it("cada seção se apresenta como cabeçalho ao leitor de tela", async () => {
    await abrirATela();

    /*
      `h2` solto no fluxo não é cabeçalho para quem ouve a tela: é texto maior.
      Sem papel, o leitor não oferece o salto de seção em seção, que é como
      alguém com baixa visão percorre uma lista de dezenas de cartões.
    */
    const cabecalhos = screen.getAllByRole("header");
    expect(cabecalhos.length).toBe(4);
  });

  it("o contador sai de dentro da frase e vira número próprio", async () => {
    await abrirATela();

    /*
      O número é lido junto com o título numa frase só. Dois elementos separados
      fariam o leitor anunciar "Arquivadas" e, depois, um "1" solto sem dono.
    */
    expect(screen.getByLabelText("Minhas coletas, 2 itens")).toBeTruthy();
    expect(screen.getByLabelText("Minhas devoluções, 1 item")).toBeTruthy();
    expect(screen.getByLabelText("Envios de outro agente, 1 item")).toBeTruthy();
    expect(screen.getByLabelText("Arquivadas, 1 item")).toBeTruthy();
  });

  it("o título da seção não repete o selo do cartão que está dentro dela", async () => {
    await abrirATela();

    /*
      "De outro agente" é o selo do item. Se a seção usasse a mesma palavra, o
      agente leria a mesma coisa duas vezes a dois centímetros de distância, e
      um teste que procurasse o texto acharia dois. O título fala de ENVIOS
      porque a seção mistura coleta e devolução, e chamar de coleta um pedido
      que declara que a vistoria NÃO foi feita seria a tela mentindo.
    */
    expect(screen.getByText("De outro agente")).toBeTruthy();
    expect(screen.getByText("Envios de outro agente")).toBeTruthy();
  });
});

/* ========================================================================
   3. A fila vazia
   ======================================================================== */

describe("a fila vazia, que é a resposta a 'o meu trabalho chegou?'", () => {
  it("não tem botão apagado embaixo dela", async () => {
    /*
      O defeito, inteiro: a tela mais importante do produto era um título, uma
      frase cinza, um botão desabilitado e um parágrafo de rodapé. Botão travado
      embaixo de "está tudo enviado" produz exatamente a dúvida que a frase
      acabou de resolver.
    */
    mockItens = [];
    await abrirATela();

    expect(screen.queryByText("Tentar enviar agora")).toBeNull();
  });

  it("afirma que chegou, em vez de informar que não há nada", async () => {
    mockItens = [];
    await abrirATela();

    expect(screen.getByText("Tudo o que você fez já chegou")).toBeTruthy();
    expect(screen.getByText(/já está com a coordenação/)).toBeTruthy();
  });
});

/* ========================================================================
   4. Toque com retorno
   ======================================================================== */

describe("o toque que muda alguma coisa deixa marca", () => {
  const TRAVADA = item({
    id: "coleta-travada", estado: "bloqueado", protocolo: "2026/000777",
  });

  it("'Tentar de novo' confirma na tela que o envio foi pedido", async () => {
    /*
      O reenvio devolve o item para a espera, e na maioria das vezes a espera
      continua: o que falta é sinal. Sem marca nenhuma, um toque que funcionou
      e um toque que não pegou são a mesma tela, e o agente toca de novo.
    */
    mockItens = [TRAVADA];
    await abrirATela();

    await tocar("Tentar de novo");

    expect(mockReenviar).toHaveBeenCalledWith("coleta-travada");
    expect(screen.getByText(/O envio foi pedido de novo/)).toBeTruthy();
  });

  it("a confirmação não promete chegada, porque o reenvio não garante nenhuma", async () => {
    mockItens = [TRAVADA];
    await abrirATela();

    await tocar("Tentar de novo");

    expect(screen.getByText(/continua tentando\.$/)).toBeTruthy();
  });

  it("'Esta coleta é minha' confirma que o nome no laudo vai ser o seu", async () => {
    mockItens = [item({ id: "coleta-antiga", estado: "pendente", autor: null })];
    await abrirATela();

    await tocar("Esta coleta é minha");

    expect(mockAssumir).toHaveBeenCalledWith("coleta-antiga");
    expect(screen.getByText(/vai subir com o seu nome no laudo/)).toBeTruthy();
  });

  it("a confirmação some sozinha, para não virar ruído em cima do estado novo", async () => {
    jest.useFakeTimers();
    mockItens = [TRAVADA];
    await abrirATela();
    await tocar("Tentar de novo");

    await act(async () => { jest.advanceTimersByTime(9_000); });

    expect(screen.queryByText(/O envio foi pedido de novo/)).toBeNull();
  });
});

/* ========================================================================
   5. O botão apagado diz por quê
   ======================================================================== */

describe("o botão apagado diz por que está apagado", () => {
  it("sem sinal, a frase fala do botão e não repete o aviso do topo", async () => {
    /*
      A razão das duas travas morava num comentário do código, para quem lê o
      arquivo, e em lugar nenhum para quem está em pé na chuva tocando num botão
      que não responde. E a frase não pode repetir o aviso do topo: texto igual
      em dois lugares da mesma tela foi defeito relatado neste aplicativo.
    */
    mockSinal = { temSinal: false, tipo: "nenhuma" };
    mockItens = [item({ id: "esperando", estado: "pendente" })];
    await abrirATela();

    expect(screen.getByText("Este botão volta assim que a conexão voltar.")).toBeTruthy();
    const botao = screen.getByLabelText(/^Tentar enviar agora\./);
    expect(botao.props.accessibilityState.disabled).toBe(true);
  });

  it("com sinal e nada que saia por ali, diz que nada sai por ali", async () => {
    /*
      Fila só com coleta de outro agente: o dreno não pega nenhuma, porque a
      credencial é de outra pessoa. O botão fica apagado e, antes daqui, sem
      uma palavra sobre o motivo.
    */
    mockItens = [item({
      id: "da-bruna", estado: "pendente", protocolo: "2026/000444", autor: OUTRO_AGENTE,
    })];
    await abrirATela();

    expect(screen.getByText(/Nada aqui sai por este botão/)).toBeTruthy();
  });

  it("quem ouve a tela ouve a razão junto com o nome do botão", async () => {
    /*
      A frase ao lado do botão é desenho, e desenho não chega a quem não vê. Sem
      a razão no rótulo, o leitor de tela anuncia "Tentar enviar agora,
      desabilitado" e ponto.
    */
    mockSinal = { temSinal: false, tipo: "nenhuma" };
    mockItens = [item({ id: "esperando", estado: "pendente" })];
    await abrirATela();

    expect(
      screen.getByLabelText("Tentar enviar agora. Este botão volta assim que a conexão voltar."),
    ).toBeTruthy();
  });

  it("com sinal e coleta pronta, o botão não se explica: ele funciona", async () => {
    mockItens = [item({ id: "esperando", estado: "pendente" })];
    await abrirATela();

    const botao = screen.getByLabelText("Tentar enviar agora");
    expect(botao.props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText(/Nada aqui sai por este botão/)).toBeNull();
  });
});

/* ========================================================================
   6. A saída do item
   ======================================================================== */

describe("o item que sai da fila não some num corte seco", () => {
  it("continua na tela enquanto desaparece, e sai depois", async () => {
    /*
      O cartão diz "Some desta lista em instantes" e, no instante, a tela
      simplesmente tinha um cartão a menos. Quem estava olhando para outro ponto
      da tela não via nada acontecer, e uma lista que encolhe sozinha é a forma
      de uma coleta parecer perdida, que é o que esta tela existe para evitar.
    */
    jest.useFakeTimers();
    mockItens = [
      item({ id: "chegou", estado: "confirmado", protocolo: "2026/000111" }),
      item({ id: "esperando", estado: "pendente", protocolo: "2026/000222" }),
    ];
    await abrirATela();

    mockItens = [item({ id: "esperando", estado: "pendente", protocolo: "2026/000222" })];
    await act(async () => { avisarQueMudou?.(); });

    expect(screen.getByText("2026/000111")).toBeTruthy();

    await act(async () => { jest.advanceTimersByTime(movimento.mudancaDeEstado); });

    expect(screen.queryByText("2026/000111")).toBeNull();
  });

  it("o contador não espera a animação: ele cai no instante em que o disco larga o item", async () => {
    /*
      O desenho pode demorar; o número não pode. Contador que mente por um
      quarto de segundo mente na única tela que existe para não mentir.
    */
    jest.useFakeTimers();
    mockItens = [
      item({ id: "chegou", estado: "confirmado", protocolo: "2026/000111" }),
      item({ id: "esperando", estado: "pendente", protocolo: "2026/000222" }),
    ];
    await abrirATela();
    expect(screen.getByText("2 coletas na fila")).toBeTruthy();

    mockItens = [item({ id: "esperando", estado: "pendente", protocolo: "2026/000222" })];
    await act(async () => { avisarQueMudou?.(); });

    expect(screen.getByText("1 coleta na fila")).toBeTruthy();
    expect(screen.getByLabelText("Minhas coletas, 1 item")).toBeTruthy();
  });

  it("o vazio só chega depois que o último cartão terminou de sair", async () => {
    jest.useFakeTimers();
    mockItens = [item({ id: "chegou", estado: "confirmado", protocolo: "2026/000111" })];
    await abrirATela();

    mockItens = [];
    await act(async () => { avisarQueMudou?.(); });
    expect(screen.queryByText("Tudo o que você fez já chegou")).toBeNull();

    await act(async () => { jest.advanceTimersByTime(movimento.mudancaDeEstado); });
    expect(screen.getByText("Tudo o que você fez já chegou")).toBeTruthy();
  });
});

/* ========================================================================
   7. A espera de abertura
   ======================================================================== */

describe("a espera de abertura tem saída", () => {
  /** Uma abertura que nunca responde, que é a primeira abertura sem sinal. */
  function filaQueNuncaAbre(): void {
    mockObterFila = () => new Promise(() => {});
  }

  it("aos seis segundos a espera oferece a saída, e a saída leva a algum lugar", async () => {
    /*
      `Carregando` sabe fazer isso desde que existe, e esta tela nunca passou
      `aoDesistir`: metade do componente estava desligada. Sem isso, quem
      desistia ficava com a espera pendurada e sem porta, e a saída do agente
      era matar o aplicativo, que é o único jeito de perder coleta neste
      produto.
    */
    jest.useFakeTimers();
    filaQueNuncaAbre();
    await abrirATela();

    expect(screen.getByTestId("espera")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(DEMORA_MS); });

    await act(async () => { fireEvent.press(screen.getByText("Parar de esperar")); });

    expect(screen.getByText("A fila não abriu")).toBeTruthy();
    expect(screen.getByTestId("abrir-a-fila-de-novo")).toBeTruthy();
  });

  it("o estado de desistência diz que nada se perdeu, porque nada se perdeu", async () => {
    jest.useFakeTimers();
    filaQueNuncaAbre();
    await abrirATela();
    await act(async () => { jest.advanceTimersByTime(DEMORA_MS); });
    await act(async () => { fireEvent.press(screen.getByText("Parar de esperar")); });

    expect(screen.getByText(/continua no aparelho e sai sozinho/)).toBeTruthy();
  });

  it("'Tentar abrir de novo' abre a fila de verdade", async () => {
    jest.useFakeTimers();
    filaQueNuncaAbre();
    await abrirATela();
    await act(async () => { jest.advanceTimersByTime(DEMORA_MS); });
    await act(async () => { fireEvent.press(screen.getByText("Parar de esperar")); });

    mockObterFila = async () => mockFila;
    mockItens = [item({ id: "esperando", estado: "pendente", protocolo: "2026/000111" })];
    await act(async () => {
      fireEvent.press(screen.getByTestId("abrir-a-fila-de-novo"));
    });

    expect(screen.getByText("2026/000111")).toBeTruthy();
  });
});

/* ========================================================================
   O que continua valendo
   ======================================================================== */

describe("a hierarquia nova não apagou o que já estava certo", () => {
  it("o selo continua trazendo símbolo além da cor, e o desenho é o terceiro canal", async () => {
    /*
      O ícone entrou AO LADO do símbolo, e não no lugar dele. Trocar um pelo
      outro seria perder o canal que funciona para quem ouve a tela e para quem
      lê sob sol forte, em troca de um pictograma que o agente vê duas vezes por
      semana e não decora.
    */
    mockItens = [item({ id: "sem-destino", estado: "arquivado", protocolo: "2026/000555" })];
    await abrirATela();

    const selo = screen.getByLabelText("Protocolo 2026/000555: Arquivada");
    expect(within(selo).getByText("✕")).toBeTruthy();
    expect(within(selo).getByText("Arquivada")).toBeTruthy();
  });
});

describe("a fila zerando, que é o momento que este aplicativo existe para produzir", () => {
  /*
    O agente subiu o morro, coletou sem sinal e desceu sem saber se o trabalho
    dele chegou. A fila zerar é a resposta a essa dúvida, e é o único lugar do
    produto onde ela aparece inteira. Ele pode estar com o aparelho no bolso,
    voltando a pé: é para isso que serve o retorno tátil aqui.
  */
  it("vibra quando o último item sai", async () => {
    mockItens = [item({ id: "1", estado: "pendente" })];
    await abrirATela();
    mockRetornoTatil.mockClear();

    mockItens = [];
    await act(async () => { avisarQueMudou?.(); });

    expect(mockRetornoTatil).toHaveBeenCalledWith("concluido");
  });

  /*
    A GUARDA DE ORIGEM, e ela é a mesma da `FaixaDeSincronizacao`: só a
    TRANSIÇÃO comemora. Abrir a aba com a fila já vazia não é a fila tendo
    esvaziado, e um aparelho que vibra toda vez que o agente entra aqui ensina
    depressa a ignorar a vibração, levando junto os outros três momentos em que
    ela informa alguma coisa.
  */
  it("abrir a aba com a fila já vazia não comemora nada", async () => {
    mockItens = [];
    await abrirATela();

    expect(mockRetornoTatil).not.toHaveBeenCalled();
  });

  /*
    E DESCARTAR O ÚLTIMO ITEM TAMBÉM NÃO. A fila zerar porque o servidor
    recebeu tudo é o oposto de a fila zerar porque o agente jogou fora a última
    coleta; um retorno igual nos dois casos comemoraria trabalho apagado.
  */
  it("descartar o último item esvazia a fila e não comemora", async () => {
    mockItens = [item({ id: "1", estado: "bloqueado" })];
    await abrirATela();
    mockRetornoTatil.mockClear();

    await tocar("Descartar");
    mockDescartar.mockImplementation(async () => { mockItens = []; });
    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });
    await act(async () => {});

    expect(mockRetornoTatil).not.toHaveBeenCalled();
  });

  /* E a fila que encolhe sem zerar não é fim de nada. */
  it("um item a menos, com outros na fila, não comemora", async () => {
    mockItens = [item({ id: "1", estado: "pendente" }), item({ id: "2", estado: "pendente" })];
    await abrirATela();
    mockRetornoTatil.mockClear();

    mockItens = [item({ id: "2", estado: "pendente" })];
    await act(async () => { avisarQueMudou?.(); });

    expect(mockRetornoTatil).not.toHaveBeenCalled();
  });
});
