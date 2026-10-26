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
import { Animated, StyleSheet } from "react-native";
import { CODIGO_ARQUIVO_SUMIU } from "@dc360/campo";
import type {
  AutorDaColeta, FotoNaFila, ItemDeVistoria, ItemFila, PapelDoArquivo,
} from "@dc360/campo";

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
  A tela da fila passou a abrir a vistoria ("Corrigir a vistoria", 15/09/2026),
  e o roteador é módulo nativo: sem o dublê, importá-la derruba a suíte. A
  correção em si tem teste próprio em `corrigir-na-fila.test.tsx`.
*/
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../dados/correcao-da-coleta", () => ({
  devolverParaCorrecao: jest.fn(async () => ({ retirada: false, motivo: "nao_encontrada" })),
}));

/* A chave de redução de movimento é do teste: o clímax existe para ser visto, e
   quem pede para reduzir movimento precisa receber a mesma tela sem o gesto. */
let mockReduzir = false;
jest.mock("./useReducaoDeMovimento", () => ({ useReducaoDeMovimento: () => mockReduzir }));

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
/** O que o motor devolve quando o agente abre mão dos registros perdidos. */
let mockAbrirMao = jest.fn(async (_id: string) => ({ liberado: true, perdidas: 0 }));
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
  abrirMaoDasEvidenciasPerdidas: (id: string) => mockAbrirMao(id),
};
/* A abertura da fila é trocável pelo teste: o caso da espera precisa de uma
   que nunca responde, que é a situação real de primeira abertura sem sinal. */
let mockObterFila: () => Promise<typeof mockFila> = async () => mockFila;
jest.mock("../dados/fila", () => ({ obterFila: () => mockObterFila() }));

import TelaDaFila from "../app/(agente)/fila";
import { atrasoEmCascata } from "./hierarquia";
import { contarPreenchidos } from "./regua";
import { movimento, temaEscuro } from "./tokens";
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
  mockReduzir = false;
  mockAbrirMao = jest.fn(async (_id: string) => ({ liberado: true, perdidas: 0 }));
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

  it("o verbo que estoura no aparelho deixa marca, em vez de sumir sem nada", async () => {
    /*
      O disco do telefone enche. O agente abre a fila, vê a coleta travada,
      toca em "Tentar de novo", e a gravação no SQLite estoura antes de o
      envio sequer começar.

      A tela não tinha como saber: o `try` do verbo só tinha `finally`, então a
      roda do botão parava, nenhuma frase aparecia, e o cartão continuava
      exatamente igual. É a definição do que esta tela existe para não fazer,
      escrita no próprio arquivo: "um reenvio que falha de novo é
      indistinguível de um toque que não pegou". O aviso de "Nada mudou" já
      existe, para o caso de o motor RECUSAR o ato; o que faltava era ele valer
      também quando o ato estoura.
    */
    mockItens = [TRAVADA];
    await abrirATela();
    mockReenviar.mockRejectedValueOnce(new Error("disco cheio"));

    await tocar("Tentar de novo");

    expect(screen.getByText("Nada mudou")).toBeTruthy();
    expect(screen.getByText(/nada foi enviado/i)).toBeTruthy();
    /* E o botão volta: quem tocou precisa poder tocar de novo. */
    expect(screen.getByText("Tentar de novo")).toBeTruthy();
  });

  it("a confirmação não promete chegada, porque o reenvio não garante nenhuma", async () => {
    mockItens = [TRAVADA];
    await abrirATela();

    await tocar("Tentar de novo");

    /*
      V2-F00-E16, correção 2: "continua tentando" sem condição sugeria
      tentativa com o aplicativo fechado, que não existe. A frase diz a
      condição, e continua sem prometer chegada.
    */
    expect(screen.getByText(/continua tentando enquanto o aplicativo estiver aberto\.$/)).toBeTruthy();
  });

  /*
    A régua dos tipos, aplicada ao cartão travado: "Tentar de novo" é o ato que
    faz a fila ANDAR e sobe para `realce`. "Esta coleta é minha" fica
    secundário porque é uma declaração sobre o laudo (o nome que vai assinar),
    e o aplicativo não empurra ninguém a assumir uma coleta que talvez não
    seja dele. "Descartar" continua perigo. E "Enviar sem os registros
    perdidos" fica secundário pela razão já escrita na tela: o aplicativo não
    empurra a perda de prova.
  */
  it("'Tentar de novo' é realce, e os vizinhos dele não", async () => {
    mockItens = [
      item({ id: "sem-autor-travada", estado: "bloqueado", protocolo: "2026/000778", autor: null }),
    ];
    await abrirATela();

    const fundo = (rotulo: string) =>
      StyleSheet.flatten(screen.getByText(rotulo).parent?.parent?.props.style).backgroundColor;
    expect(fundo("Tentar de novo")).toBe(temaEscuro.destaqueFundo);
    expect(fundo("Esta coleta é minha")).toBe("transparent");
    expect(fundo("Descartar")).toBe(temaEscuro.perigoFundo);
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

      As DUAS coletas deste caso estão pendentes, e antes uma delas era
      confirmada. A troca não é de arrumação: com a confirmada aqui, o caso
      exigia que o número dissesse "2" sobre uma coleta que a coordenação já
      tinha recebido, ou seja, a asserção guardava o defeito em vez do
      comportamento. O que o caso existe para provar (o número cai no instante,
      sem esperar o cartão terminar de sair) continua igual, e agora prova isso
      sobre duas coletas que de fato ainda não chegaram.
    */
    jest.useFakeTimers();
    mockItens = [
      item({ id: "chegou", estado: "pendente", protocolo: "2026/000111" }),
      item({ id: "esperando", estado: "pendente", protocolo: "2026/000222" }),
    ];
    await abrirATela();
    /* O total virou `Dado`: número grande em fonte tabular com rótulo discreto,
       e a frase inteira no rótulo de acessibilidade. O que o caso guarda não
       mudou: o número cai no instante em que o disco larga o item. */
    expect(screen.getByLabelText("2, coletas na fila")).toBeTruthy();

    mockItens = [item({ id: "esperando", estado: "pendente", protocolo: "2026/000222" })];
    await act(async () => { avisarQueMudou?.(); });

    expect(screen.getByLabelText("1, coleta na fila")).toBeTruthy();
    /* O cartão do que saiu continua desaparecendo: dois itens desenhados, um
       contado. É a distinção que o comentário de `contar` declara. */
    expect(screen.getByLabelText("Minhas coletas, 1 item")).toBeTruthy();
  });

  it("a coleta que JÁ CHEGOU sai do número, e continua no cartão", async () => {
    /*
      O número grande é a resposta à única pergunta que traz o agente aqui:
      quanto do que eu fiz ainda NÃO chegou. Uma coleta confirmada chegou: o
      cartão dela diz "Enviada. A coordenação recebeu", e ela fica na lista
      mais meio minuto como lápide, de propósito.

      Enquanto ela entrou na conta, a tela dizia "2 coletas na fila" com uma
      delas já na coordenação, e o crachá da aba Envio (que soma pendentes,
      enviando, bloqueados e as de outro autor, e nunca as confirmadas) dizia
      "1" na mesma tela. Dois números para o mesmo fato, a um toque um do
      outro, na tela que este produto inteiro existe para tornar confiável.
    */
    mockItens = [
      item({ id: "chegou", estado: "confirmado", protocolo: "2026/000111" }),
      item({ id: "esperando", estado: "pendente", protocolo: "2026/000222" }),
    ];
    await abrirATela();

    expect(screen.getByLabelText("1, coleta na fila")).toBeTruthy();
    /* E a lápide continua: ela some por desaparecimento, não por corte seco. */
    expect(screen.getByText("2026/000111")).toBeTruthy();
    expect(screen.getByLabelText("Minhas coletas, 2 itens")).toBeTruthy();
  });

  it("a fila só com o que já chegou não anuncia número nenhum", async () => {
    mockItens = [item({ id: "chegou", estado: "confirmado", protocolo: "2026/000111" })];
    await abrirATela();

    /* Zero esperando. Um número grande aqui seria a tela inventando trabalho
       pendente em cima de uma coleta que a coordenação já recebeu. */
    expect(screen.queryByLabelText("1, coleta na fila")).toBeNull();
    expect(screen.getByText("Enviada")).toBeTruthy();
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

    expect(screen.getByText(/continua no aparelho e sai quando o aplicativo estiver aberto/)).toBeTruthy();
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

/* ========================================================================
   8. A densidade visual da lista
   ======================================================================== */

/**
 * A régua do peso visual, medida no que a fila desenhou.
 *
 * Esta é a lista em que quase tudo dá certo: coleta sai, coordenação recebe, o
 * cartão some. Enquanto o selo `ok` pintava fundo, a coluna inteira acendia em
 * verde para contar o caso normal, e a única coleta que precisava do dedo do
 * agente (a bloqueada, em vermelho) ficava com exatamente o mesmo peso das
 * outras. Pior: ao tocar em "Tentar de novo", o cartão bloqueado ganhava um
 * segundo bloco, verde e cheio, a três linhas do primeiro, os dois dizendo
 * coisas opostas.
 *
 * A régua está em `ui/regua.ts`, e os dois primeiros casos REPROVAM na versão
 * anterior.
 */
describe("a régua do peso visual, na fila", () => {
  const preenchidos = () =>
    contarPreenchidos(screen.toJSON(), temaEscuro, (e) => StyleSheet.flatten(e as never))
      .sort();

  it("uma fila inteira de coletas enviadas não acende um bloco sequer", async () => {
    mockItens = [
      item({ id: "a", estado: "confirmado", confirmadoEm: "2026-09-09T10:00:00.000Z" }),
      item({ id: "b", estado: "confirmado", confirmadoEm: "2026-09-09T10:01:00.000Z" }),
      item({ id: "c", estado: "confirmado", confirmadoEm: "2026-09-09T10:02:00.000Z" }),
    ];
    await abrirATela();

    // A palavra continua em cada cartão: o que saiu foi o retângulo atrás dela.
    expect(screen.getAllByText("Enviada")).toHaveLength(3);
    expect(preenchidos()).toEqual([]);
  });

  it("a coleta bloqueada continua sendo a única que pinta, mesmo depois do toque", async () => {
    mockItens = [
      item({ id: "a", estado: "confirmado", confirmadoEm: "2026-09-09T10:00:00.000Z" }),
      item({
        id: "b",
        estado: "bloqueado",
        ultimaFalha: {
          codigo: "conflito", mensagem: "O servidor recusou.", campos: [],
          permanente: true, em: "2026-09-09T10:00:00.000Z",
        },
      }),
    ];
    await abrirATela();

    /*
      Dois preenchidos, e eles não se empilham: um é a pílula vermelha dentro do
      cartão bloqueado, o outro é o aviso da seção, que diz quantas coletas
      precisam de atenção. Peças diferentes, um bloco cada, que é a R1.
    */
    expect(preenchidos()).toEqual([temaEscuro.perigoFundo, temaEscuro.perigoFundo]);

    await tocar("Tentar de novo");
    await act(async () => {});

    /*
      E a confirmação do toque NÃO acrescenta um terceiro. Ela aparece com
      sinal, título e filete, dentro do mesmo cartão que já tem a pílula
      vermelha, sem disputar com ela.
    */
    expect(screen.getByText("Pronto")).toBeTruthy();
    expect(preenchidos()).toEqual([temaEscuro.perigoFundo, temaEscuro.perigoFundo]);
  });
});

/* ========================================================================
   9. O clímax: a fila zerando
   ======================================================================== */

/**
 * O momento assinatura do produto, e a guarda que faltava nele.
 *
 * O `CLAUDE.md` nomeia este momento com todas as letras: "o elemento assinatura
 * é o simulador de offline, a fila enchendo item a item, o retorno do sinal e a
 * sincronização concluindo (...) concentre o melhor do capricho visual nesse
 * momento; ele é o clímax". Esta tela é onde ele acontece.
 *
 * E ele estava disparando à toa. Havia DOIS canais comemorando o mesmo fato, e
 * só um tinha guarda de origem: a vibração exigia a transição (a mesma regra
 * que a `FaixaDeSincronizacao` escreveu e provou), e o movimento rodava na
 * montagem do estado vazio. As duas consequências são medidas aqui:
 *
 * - **abrir a aba com a fila já vazia** produzia a comemoração visual inteira,
 *   com o aparelho calado no bolso, ou seja, a tela dizia "conseguimos" sobre
 *   nada ter acontecido;
 * - **descartar o último item** (jogar fora trabalho feito no morro) produzia
 *   exatamente a mesma comemoração, enquanto o tátil ficava em silêncio de
 *   propósito, porque a fila zerar por descarte é o oposto de a fila zerar por
 *   entrega.
 *
 * Comemoração que acontece o tempo todo deixa de significar qualquer coisa, e
 * leva junto a única vez em que ela significaria.
 */
describe("o clímax da fila zerando só acontece quando a fila zera de verdade", () => {
  type Cronometrada = { duration?: number; useNativeDriver?: boolean };
  let animacoes: Cronometrada[] = [];
  const timingDeVerdade = Animated.timing;

  beforeEach(() => {
    animacoes = [];
    /*
      A medida é do que foi PEDIDO à camada de animação, e não de um pixel. É a
      mesma técnica de `resposta-ao-toque.test.tsx`, e ela é a única que
      consegue cobrar as três coisas que importam aqui: que o gesto exista, que
      a duração venha do token (e não de um número solto, que escaparia do
      desligamento por redução de movimento) e que ele rode na camada nativa.
    */
    jest.spyOn(Animated, "timing").mockImplementation(((valor: never, config: Cronometrada) => {
      animacoes.push(config);
      return timingDeVerdade(valor, config as never);
    }) as never);
  });

  afterEach(() => { jest.restoreAllMocks(); });

  /** O gesto de chegada do bloco, que é o que gasta um clímax inteiro. */
  const doClimax = () => animacoes.filter((a) => a.duration === movimento.climax);

  /**
   * Tudo que dura mais que uma troca de estado comum.
   *
   * É assim que os casos negativos cobram, e não só pela chegada: uma
   * comemoração meia-boca (o emblema saltando sem o bloco chegar) continuaria
   * sendo uma comemoração, e um caso que olhasse apenas a chegada daria verde
   * para ela. Fora do clímax, nada nesta tela tem licença para durar mais que
   * `movimento.mudancaDeEstado`.
   */
  const gestosLongos = () => animacoes.filter((a) => (a.duration ?? 0) > movimento.mudancaDeEstado);

  /**
   * Leva a tela até o estado vazio, esvaziando a fila item a item.
   *
   * A espera pela saída do último cartão não é detalhe do teste: o vazio só
   * monta depois que o cartão termina de desaparecer, e é exatamente nessa
   * janela que uma releitura da fila poderia apagar a marca da comemoração.
   */
  async function esvaziarAFila(): Promise<void> {
    mockItens = [];
    await act(async () => { avisarQueMudou?.(); });
    /* A partir daqui só o clímax anima: a saída do cartão já foi pedida. */
    animacoes = [];
    await act(async () => { jest.advanceTimersByTime(movimento.mudancaDeEstado); });
  }

  it("abrir a aba com a fila já vazia não comemora nada, nem na tela", async () => {
    mockItens = [];
    await abrirATela();

    expect(screen.getByText("Tudo o que você fez já chegou")).toBeTruthy();
    /* Nem o gesto inteiro, nem um pedaço dele: numa abertura fria não há nada
       para animar, e a tela chega pronta. */
    expect(animacoes).toEqual([]);
  });

  it("a fila zerando por entrega roda o clímax", async () => {
    jest.useFakeTimers();
    mockItens = [item({ id: "chegou", estado: "confirmado", protocolo: "2026/000111" })];
    await abrirATela();

    await esvaziarAFila();

    expect(screen.getByText("Tudo o que você fez já chegou")).toBeTruthy();
    expect(doClimax()).toHaveLength(1);
  });

  it("o gesto inteiro cabe no orçamento do token, e roda na camada nativa", async () => {
    /*
      São dois movimentos: o bloco que chega e o emblema que assenta com
      excesso. O que este caso trava é que a soma dos dois tempos do emblema é
      exatamente um clímax, e não um clímax e meio: `CLAUDE.md` autoriza "até
      por volta de 500 ms" fora da resposta ao toque, e `movimento.climax` é o
      número que essa autorização virou. Um gesto que passasse disso seria a
      tela segurando o agente para se exibir.

      E tudo em `useNativeDriver`: a linha de JavaScript pode estar drenando a
      fila neste exato instante, e comemoração travada é pior que nenhuma.
    */
    jest.useFakeTimers();
    mockItens = [item({ id: "chegou", estado: "confirmado", protocolo: "2026/000111" })];
    await abrirATela();

    await esvaziarAFila();

    expect(animacoes).toHaveLength(3);
    expect(animacoes.every((a) => a.useNativeDriver === true)).toBe(true);
    const doEmblema = animacoes.filter((a) => a.duration !== movimento.climax);
    expect(doEmblema).toHaveLength(2);
    expect(doEmblema.reduce((soma, a) => soma + (a.duration ?? 0), 0)).toBe(movimento.climax);
  });

  it("descartar o último item esvazia a fila e NÃO comemora, nem na tela", async () => {
    /*
      O caso irmão do tátil, que já existia e passava sozinho. A fila zerar
      porque o agente jogou fora a última coleta é o oposto de a fila zerar
      porque a coordenação recebeu tudo, e a tela estava dizendo "conseguimos"
      nos dois.
    */
    jest.useFakeTimers();
    mockItens = [item({ id: "1", estado: "bloqueado" })];
    await abrirATela();

    await tocar("Descartar");
    mockDescartar.mockImplementation(async () => { mockItens = []; });
    animacoes = [];
    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });
    await act(async () => { jest.advanceTimersByTime(movimento.mudancaDeEstado); });

    expect(screen.getByText("Tudo o que você fez já chegou")).toBeTruthy();
    expect(gestosLongos()).toEqual([]);
    expect(mockRetornoTatil).not.toHaveBeenCalled();
  });

  it("quem pede para reduzir movimento recebe a mesma tela, sem o gesto", async () => {
    jest.useFakeTimers();
    mockReduzir = true;
    mockItens = [item({ id: "chegou", estado: "confirmado", protocolo: "2026/000111" })];
    await abrirATela();

    await esvaziarAFila();

    expect(screen.getByText("Tudo o que você fez já chegou")).toBeTruthy();
    expect(animacoes).toEqual([]);
  });
});

/* ========================================================================
   9b. Os cartões que chegam entram em cascata
   ======================================================================== */

/**
 * A ENTRADA, que esta lista não tinha.
 *
 * A fila ganhava item do mesmo jeito que perdia antes da despedida existir: um
 * cartão a mais no quadro seguinte. A lista de tarefas já entra com
 * `ItemDeLista` e `atrasoEmCascata()`, e o `tokens.ts` é explícito sobre o
 * porquê de o atraso ser token: "a lista de tarefas, a fila, a equipe e os
 * avisos precisam entrar com o MESMO ritmo". Duas listas vizinhas com entradas
 * diferentes (ou uma com entrada e a outra com corte seco) é o defeito que
 * ninguém relata e todo mundo sente.
 *
 * A mecânica é a mesma da lista de tarefas, de propósito: quem chega DEPOIS
 * de a lista estar na tela entra animado, em cascata entre os que chegaram
 * juntos; a primeira pintura chega pronta, porque nada chegou, o aparelho é
 * que terminou de ler.
 */
describe("os cartões que chegam à fila entram em cascata", () => {
  type Cronometrada = {
    duration?: number; useNativeDriver?: boolean; toValue?: number; delay?: number;
  };
  let animacoes: Cronometrada[] = [];
  const timingDeVerdade = Animated.timing;

  beforeEach(() => {
    animacoes = [];
    jest.spyOn(Animated, "timing").mockImplementation(((valor: never, config: Cronometrada) => {
      animacoes.push(config);
      return timingDeVerdade(valor, config as never);
    }) as never);
  });

  afterEach(() => { jest.restoreAllMocks(); });

  const PRIMEIRA = item({ id: "primeira", estado: "pendente", protocolo: "2026/000111" });
  const SEGUNDA = item({ id: "segunda", estado: "pendente", protocolo: "2026/000222" });
  const TERCEIRA = item({ id: "terceira", estado: "pendente", protocolo: "2026/000333" });
  const QUARTA = item({ id: "quarta", estado: "pendente", protocolo: "2026/000444" });

  /**
   * As entradas de cartão: o que vai a um, NA CAMADA NATIVA.
   *
   * A saída vai a zero e o toque nunca chega a um por aqui. E a contagem que
   * sobe no `Dado` ("3 coletas na fila") também vai a um, mas em JavaScript
   * de propósito (texto não interpola na thread de interface, ver
   * `useContagemQueSobe`): ela é do número, não do cartão, e fica fora.
   */
  const entradas = () => animacoes.filter((a) => a.toValue === 1 && a.useNativeDriver === true);

  async function chegar(novos: ItemFila[]): Promise<void> {
    mockItens = novos;
    await act(async () => { avisarQueMudou?.(); });
  }

  it("abrir a aba com a fila cheia não anima nada: a primeira pintura chega pronta", async () => {
    mockItens = [PRIMEIRA, SEGUNDA, TERCEIRA];
    await abrirATela();

    expect(screen.getByText("2026/000333")).toBeTruthy();
    expect(entradas()).toEqual([]);
  });

  it("a coleta que chega depois entra animada, com duração de token e na camada nativa", async () => {
    mockItens = [PRIMEIRA];
    await abrirATela();
    animacoes = [];

    await chegar([PRIMEIRA, SEGUNDA]);

    expect(screen.getByText("2026/000222")).toBeTruthy();
    expect(entradas()).toHaveLength(1);
    expect(entradas()[0]?.duration).toBe(movimento.mudancaDeEstado);
    expect(entradas()[0]?.useNativeDriver).toBe(true);
    /* Sozinha, entra na hora: a cascata é entre as que chegam JUNTAS. */
    expect(entradas()[0]?.delay ?? 0).toBe(0);
  });

  it("várias chegando juntas entram uma depois da outra, no passo do token", async () => {
    mockItens = [PRIMEIRA];
    await abrirATela();
    animacoes = [];

    await chegar([PRIMEIRA, SEGUNDA, TERCEIRA, QUARTA]);

    const atrasos = entradas().map((a) => a.delay ?? 0);
    expect(atrasos).toEqual([0, 1, 2].map(atrasoEmCascata));
  });

  it("quem já estava na tela não entra de novo quando outra chega", async () => {
    mockItens = [PRIMEIRA, SEGUNDA];
    await abrirATela();
    animacoes = [];

    await chegar([PRIMEIRA, SEGUNDA, TERCEIRA]);

    expect(entradas()).toHaveLength(1);
  });

  it("com redução de movimento, a coleta que chega aparece inteira, sem cascata", async () => {
    mockReduzir = true;
    mockItens = [PRIMEIRA];
    await abrirATela();
    animacoes = [];

    await chegar([PRIMEIRA, SEGUNDA, TERCEIRA]);

    expect(screen.getByText("2026/000333")).toBeTruthy();
    expect(entradas()).toEqual([]);
  });
});

/* ========================================================================
   10. A coleta travada porque um arquivo sumiu do aparelho
   ======================================================================== */

/**
 * O MAIOR RISCO JURÍDICO DO PRODUTO, com a saída que o motor passou a ter e a
 * tela ainda não oferecia.
 *
 * As fotos sobem antes do envelope, de propósito, para o laudo nunca apontar
 * para arquivo que não existe. A consequência é que um arquivo que o sistema
 * operacional apagou do cache destrói o envelope INTEIRO: checklist, GPS,
 * assinatura, observações e os órgãos a acionar. Uma manhã de trabalho no
 * morro, perdida por causa de um arquivo de imagem.
 *
 * O motor ganhou `abrirMaoDasEvidenciasPerdidas`. Quem decide, porém, é o
 * agente, e nunca o aplicativo: a perda vira uma frase num documento com brasão
 * e um evento numa trilha que não se reescreve, assinados por quem esteve no
 * local. E existe um caso pior, que é o que este bloco protege com mais
 * cuidado: quando o arquivo perdido é a ASSINATURA, o laudo imprime a linha de
 * assinatura em branco, indistinguível de uma vistoria em que ninguém assinou.
 */
describe("a coleta que não sobe porque um arquivo se perdeu", () => {
  function foto(parcial: Partial<FotoNaFila> & { idempotencyKey: string }): FotoNaFila {
    return {
      uriLocal: `file:///${parcial.idempotencyKey}.jpg`,
      nomeArquivo: `${parcial.idempotencyKey}.jpg`,
      tipoConteudo: "image/jpeg",
      tamanhoBytes: 1024,
      capturadaEm: "2026-09-09T09:10:00.000Z",
      ordem: 1,
      papel: "foto" as PapelDoArquivo,
      chave: null,
      evidenciaId: null,
      enviada: false,
      ...parcial,
    };
  }

  /** A coleta travada, com quantos arquivos perdidos o caso pedir. */
  function travadaPorPerda(
    { fotosPerdidas = 1, assinaturaPerdida = false, autor = AGENTE }: {
      fotosPerdidas?: number; assinaturaPerdida?: boolean; autor?: AutorDaColeta | null;
    } = {},
  ): ItemDeVistoria {
    const fotos: FotoNaFila[] = [];
    for (let i = 0; i < fotosPerdidas; i += 1) {
      fotos.push(foto({ idempotencyKey: `perdida-${i}`, perdida: true }));
    }
    if (assinaturaPerdida) {
      fotos.push(foto({ idempotencyKey: "assinatura", papel: "assinatura", perdida: true }));
    }
    /* Uma foto inteira, que já subiu: ela é o que separa "sumiu tudo" de
       "sumiu isto", e é o que impede a contagem de olhar a lista inteira. */
    fotos.push(foto({ idempotencyKey: "essa-subiu", enviada: true }));
    return item({
      id: "coleta-com-perda",
      estado: "bloqueado",
      protocolo: "2026/000321",
      autor,
      fotos,
      ultimaFalha: {
        codigo: CODIGO_ARQUIVO_SUMIU,
        mensagem: "2 registros desta vistoria não estão mais neste aparelho, então ela "
          + "não pode ser enviada inteira. Você pode enviar a vistoria sem eles: o laudo "
          + "vai declarar que houve registro capturado em campo que não pôde ser recuperado.",
        campos: [],
        permanente: true,
        em: "2026-09-09T10:00:00.000Z",
      },
    });
  }

  it("o cartão não repete o parágrafo de quarenta palavras que o motor escreve", async () => {
    /*
      A frase do motor diz as coisas certas e diz TODAS de uma vez: o número, o
      que sumiu e a saída, num nó só de quarenta palavras. Ela existe para o
      caso de escapar por outro caminho e nunca virar texto em inglês na rua, e
      não para ser o cartão.

      O teto é o mesmo do caso 1 deste arquivo, e a razão também: o que se
      proíbe é o PARÁGRAFO. Aqui a mesma informação se distribui, quem, por quê
      e o que fazer, cada um no seu lugar.
    */
    mockItens = [travadaPorPerda({ fotosPerdidas: 2 })];
    await abrirATela();

    const compridos = textosNaTela()
      .map((t) => ({ texto: t, palavras: t.trim().split(/\s+/).length }))
      .filter((t) => t.palavras > 30);

    expect(compridos).toEqual([]);
  });

  it("o selo diz que falta uma DECISÃO, e não que falta atenção", async () => {
    /*
      "Precisa de atenção" é o selo de quem espera alguém tentar de novo. Aqui
      tentar de novo nunca vai resolver, porque arquivo apagado não volta, e a
      única pessoa que pode desatar isto é a que está segurando o aparelho.
    */
    mockItens = [travadaPorPerda()];
    await abrirATela();

    const selo = screen.getByLabelText("Protocolo 2026/000321: Precisa de decisão");
    expect(within(selo).getByText("Precisa de decisão")).toBeTruthy();
    expect(screen.queryByText("Precisa de atenção")).toBeNull();
  });

  it("diz quantas fotografias sumiram, e que não há como recuperá-las", async () => {
    mockItens = [travadaPorPerda({ fotosPerdidas: 2 })];
    await abrirATela();

    expect(
      screen.getByText("2 fotografias desta vistoria não estão mais neste aparelho, "
        + "e não há como recuperá-las."),
    ).toBeTruthy();
  });

  it("quando é a assinatura que sumiu, ela é dita com todas as letras", async () => {
    /*
      Contá-la como "mais um registro" seria esconder a única perda que muda o
      documento. O laudo diz o nome dela, e a tela precisa dizer antes.
    */
    mockItens = [travadaPorPerda({ fotosPerdidas: 0, assinaturaPerdida: true })];
    await abrirATela();

    expect(
      screen.getByText("A assinatura de quem estava no local não está mais neste "
        + "aparelho, e não há como recuperá-la."),
    ).toBeTruthy();
  });

  it("a saída é oferecida sem imperativo: quem decide é o agente", async () => {
    mockItens = [travadaPorPerda()];
    await abrirATela();

    expect(screen.getByText("O que fazer")).toBeTruthy();
    expect(
      screen.getByText("Você pode enviar a vistoria assim mesmo: o resto da coleta "
        + "sobe inteiro, e o laudo declara a perda."),
    ).toBeTruthy();
    expect(screen.getByText("Enviar sem os registros perdidos")).toBeTruthy();
  });

  it("NUNCA com um toque só: o botão pergunta antes de autorizar", async () => {
    /*
      A regra desta tela para o descarte vale aqui pelo mesmo motivo, e com mais
      peso: o descarte apaga uma coleta neste aparelho, e isto escreve numa
      trilha append-only, em nome de quem assinou o laudo.
    */
    mockItens = [travadaPorPerda()];
    await abrirATela();

    await act(async () => {
      fireEvent.press(screen.getByTestId("abrir-mao-coleta-com-perda"));
    });

    expect(mockAbrirMao).not.toHaveBeenCalled();
    expect(screen.getByText("Enviar sem os registros perdidos?")).toBeTruthy();
  });

  it("a pergunta diz o protocolo, o número e o que o laudo vai declarar", async () => {
    mockItens = [travadaPorPerda({ fotosPerdidas: 2 })];
    await abrirATela();
    await act(async () => {
      fireEvent.press(screen.getByTestId("abrir-mao-coleta-com-perda"));
    });

    expect(
      screen.getByText("O protocolo 2026/000321 sobe sem 2 registros desta vistoria: "
        + "os arquivos não estão mais no aparelho."),
    ).toBeTruthy();
    expect(screen.getByText(/O laudo vai declarar que houve registro capturado em campo/))
      .toBeTruthy();
    expect(screen.getByText(/a trilha de auditoria não se reescreve/)).toBeTruthy();
  });

  it("com a assinatura entre as perdas, a pergunta diz o que acontece com a linha do laudo", async () => {
    /*
      O caso pior, e ele tem bloco próprio dentro da pergunta em vez de uma
      oração no fim do parágrafo. Sem o traço, a linha de assinatura sai vazia,
      e vazia ela é indistinguível de "ninguém assinou": a lacuna mais grave que
      aquele documento pode ter. O laudo escreve a causa ao lado da linha, e
      quem autoriza precisa saber disso antes de autorizar.
    */
    mockItens = [travadaPorPerda({ fotosPerdidas: 1, assinaturaPerdida: true })];
    await abrirATela();
    await act(async () => {
      fireEvent.press(screen.getByTestId("abrir-mao-coleta-com-perda"));
    });

    expect(screen.getByText("A assinatura está entre eles")).toBeTruthy();
    expect(screen.getByText(/sai sem o traço, e o documento diz que a causa foi esta perda/))
      .toBeTruthy();
  });

  it("sem a assinatura entre as perdas, a pergunta não inventa esse aviso", async () => {
    mockItens = [travadaPorPerda({ fotosPerdidas: 2 })];
    await abrirATela();
    await act(async () => {
      fireEvent.press(screen.getByTestId("abrir-mao-coleta-com-perda"));
    });

    expect(screen.queryByText("A assinatura está entre eles")).toBeNull();
  });

  it("confirmada, chama o motor e confirma com o número QUE O MOTOR devolveu", async () => {
    /*
      O número da confirmação não é o da pergunta. Entre uma coisa e outra há
      uma releitura do disco, e quem responde pelo que subiu é quem gravou: uma
      confirmação que repetisse o número da tela estaria afirmando, com cara de
      recibo, algo que ela não conferiu. Aqui o motor devolve TRÊS para uma
      pergunta que falava de duas, e é o três que aparece.
    */
    mockAbrirMao = jest.fn(async (_id: string) => ({ liberado: true, perdidas: 3 }));
    mockItens = [travadaPorPerda({ fotosPerdidas: 2 })];
    await abrirATela();
    await act(async () => {
      fireEvent.press(screen.getByTestId("abrir-mao-coleta-com-perda"));
    });

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });

    expect(mockAbrirMao).toHaveBeenCalledWith("coleta-com-perda");
    expect(screen.getByText("Pronto")).toBeTruthy();
    expect(
      screen.getByText("A vistoria voltou para a fila sem 3 registros. O laudo vai "
        + "declarar a perda."),
    ).toBeTruthy();
  });

  it("recusada pelo motor, a tela NÃO diz 'Pronto'", async () => {
    /*
      O portão do motor recusa o que já não está esperando esta decisão. Uma
      confirmação verde em cima de uma recusa seria a tela mentindo na única
      tela do produto que existe para não mentir.
    */
    mockAbrirMao = jest.fn(async (_id: string) => ({ liberado: false, perdidas: 0 }));
    mockItens = [travadaPorPerda()];
    await abrirATela();
    await act(async () => {
      fireEvent.press(screen.getByTestId("abrir-mao-coleta-com-perda"));
    });

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });

    expect(screen.queryByText("Pronto")).toBeNull();
    expect(screen.getByText("Nada mudou")).toBeTruthy();
    expect(screen.getByText(/Nada foi autorizado/)).toBeTruthy();
  });

  it("coleta de outro agente não oferece a saída, porque a perda é assinada", async () => {
    /*
      Abrir mão da prova é ato do autor da vistoria: é o nome dele que vai no
      laudo onde a perda fica declarada para sempre. Oferecer isso a quem pegou
      o aparelho de plantão seria a assinatura trocada que o carimbo de autoria
      existe para impedir, agora numa declaração de perda de prova.
    */
    mockItens = [travadaPorPerda({ autor: OUTRO_AGENTE })];
    await abrirATela();

    expect(screen.queryByTestId("abrir-mao-coleta-com-perda")).toBeNull();
    expect(screen.queryByText("Enviar sem os registros perdidos")).toBeNull();
  });

  it("bloqueio que não é perda de arquivo continua sem a saída", async () => {
    /*
      A prova do portão: o botão nasce do código da última falha, e não do
      estado. Um 409 de conflito não pode oferecer ao agente jogar fora uma
      fotografia que está inteira no aparelho.
    */
    mockItens = [item({
      id: "outro-bloqueio",
      estado: "bloqueado",
      protocolo: "2026/000999",
      ultimaFalha: {
        codigo: "conflito", mensagem: "O servidor recusou.", campos: [],
        permanente: true, em: "2026-09-09T10:00:00.000Z",
      },
    })];
    await abrirATela();

    expect(screen.queryByText("Enviar sem os registros perdidos")).toBeNull();
    expect(screen.getByText("Precisa de atenção")).toBeTruthy();
  });

  it("a régua do peso visual continua valendo neste cartão", async () => {
    /*
      A confirmação do toque e a pergunta não podem acender um segundo bloco em
      cima da pílula vermelha do estado. Quem pinta continua sendo o estado, no
      cartão, e o alerta da assinatura, dentro da pergunta, que é outra peça.
    */
    mockItens = [travadaPorPerda({ fotosPerdidas: 2 })];
    await abrirATela();

    const preenchidos = () =>
      contarPreenchidos(screen.toJSON(), temaEscuro, (e) => StyleSheet.flatten(e as never))
        .sort();

    expect(preenchidos()).toEqual([temaEscuro.perigoFundo, temaEscuro.perigoFundo]);

    await act(async () => {
      fireEvent.press(screen.getByTestId("abrir-mao-coleta-com-perda"));
    });
    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });

    expect(screen.getByText("Pronto")).toBeTruthy();
    expect(preenchidos()).toEqual([temaEscuro.perigoFundo, temaEscuro.perigoFundo]);
  });
});

/* ========================================================================
   8. A fila só promete o que o aplicativo faz (V2-F00-E16, correção 1)
   ======================================================================== */

/*
  A fila drena enquanto o aplicativo está ABERTO (`iniciarSincronizacaoContinua`
  vive no layout das abas), e não existe tarefa de segundo plano. A E16 tirou a
  promessa falsa da vistoria guardada, e a arbitragem da validação achou a mesma
  promessa duas vezes nesta tela: "o envio ... acontece sozinho, em segundo
  plano". O portão `scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo`
  varre a fonte; estes casos leem o que a tela DESENHA em cada estado.
*/
describe("a fila não promete envio em segundo plano nem com o aplicativo fechado", () => {
  const PROMESSA_FALSA = /segundo plano|fechado|em background|assim que houver sinal|(sai|sobe|acontece) sozinh/i;

  function nenhumTextoPromete(): void {
    const promessas = textosNaTela().filter((t) => PROMESSA_FALSA.test(t));
    expect(promessas).toEqual([]);
  }

  it("a fila zerada diz que o que vier depois sobe com o aplicativo aberto e rede", async () => {
    await abrirATela();

    expect(screen.getByText("Tudo o que você fez já chegou")).toBeTruthy();
    expect(screen.getByText(/sobe quando o aplicativo estiver aberto e houver rede/)).toBeTruthy();
    nenhumTextoPromete();
  });

  it("com coleta na fila e com sinal, a legenda do botão diz a condição", async () => {
    mockItens = [item({ id: "esperando", estado: "pendente" })];
    await abrirATela();

    expect(screen.getByText(/Com o aplicativo aberto e com sinal, o envio acontece sem você tocar/))
      .toBeTruthy();
    nenhumTextoPromete();
  });

  it("sem sinal, o aviso e o cartão não prometem envio fora do aplicativo", async () => {
    mockSinal = { temSinal: false, tipo: "nenhuma" };
    mockItens = [item({ id: "esperando", estado: "pendente" })];
    await abrirATela();

    expect(screen.getByText(/sai quando a conexão voltar, com o aplicativo aberto/)).toBeTruthy();
    expect(screen.getByText(/Vai sair quando o aplicativo estiver aberto e houver sinal/)).toBeTruthy();
    nenhumTextoPromete();
  });

  it("depois de várias tentativas, o cartão continua sem prometer o que o aparelho não faz", async () => {
    mockItens = [item({ id: "teimosa", estado: "pendente", tentativas: 8 })];
    await abrirATela();

    expect(screen.getByText(/vai continuar tentando enquanto o aplicativo estiver aberto/)).toBeTruthy();
    expect(screen.queryByText(/sozinha/)).toBeNull();
    nenhumTextoPromete();
  });

  it("a fila que não abriu também diz a condição", async () => {
    jest.useFakeTimers();
    mockObterFila = () => new Promise(() => {});
    await abrirATela();
    await act(async () => { jest.advanceTimersByTime(DEMORA_MS); });
    await act(async () => { fireEvent.press(screen.getByText("Parar de esperar")); });

    expect(screen.getByText(/sai quando o aplicativo estiver aberto e a conexão voltar/)).toBeTruthy();
    nenhumTextoPromete();
  });
});

