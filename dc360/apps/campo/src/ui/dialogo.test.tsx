/**
 * O diálogo do aplicativo, no lugar do alerta do sistema.
 *
 * Cada teste aqui trava um dos defeitos que `Alert.alert` trazia embutido e que
 * nenhuma revisão de código pegava, porque no código o alerta nativo parece
 * perfeito: são três linhas, e o que estava errado só aparecia com o aparelho
 * na mão, de noite, na chuva.
 *
 * 1. **O alerta nativo não é deste aplicativo.** Não segue o tema. Aqui a folha
 *    é conferida nos dois modos.
 * 2. **Os botões dele são do tamanho do sistema.** Este aplicativo exige 52
 *    pontos (ver `toque` em `tokens.ts`: dedo, com luva, num barranco).
 * 3. **Ele não sabe o que é redução de movimento do jeito deste produto.** Quem
 *    liga a chave liga porque animação dá enjoo, e é essa pessoa que o
 *    aplicativo coloca em pé num barranco.
 * 4. **Ele deixa a tela de trás alcançável para quem navega por gestos.** Sem
 *    `accessibilityViewIsModal`, dá para acionar "Descartar" da tela de baixo
 *    sem nunca ter respondido a pergunta.
 */

import { AccessibilityInfo, Animated, Easing, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { MOTIVOS_DE_DEVOLUCAO } from "@dc360/shared";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

/*
  A ÁREA SEGURA E A JANELA são do teste, porque o teto da folha é uma conta
  sobre as duas. O aparelho de referência do defeito é um iPhone com recorte no
  topo (47 pontos de relógio e câmera); o de tela baixa é um aparelho de 568
  pontos de altura, que é o menor em que este aplicativo ainda roda.
*/
let mockMargens = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockMargens,
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));
let mockJanela = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockJanela,
}));

import { ProvedorDeTema } from "./componentes";
import { Dialogo, RESPIRO_ACIMA_DA_FOLHA, tetoDaFolha } from "./Dialogo";
import { DialogoDeDevolucao } from "./DialogoDeDevolucao";
import {
  easing, elevacao, espaco, fonteMinimaDeInteracao, movimento, temaClaro, temaEscuro, toque,
} from "./tokens";

/*
  As animações são espionadas em vez de o valor animado ser lido. O que se quer
  provar é "animou" ou "não animou", com que curva e para onde, e
  `Animated.timing` é a única forma de movimento que este componente usa.

  `segurarOFim` existe para o caso da saída: a folha precisa continuar na tela
  ENQUANTO desaparece, e só dá para provar isso se a animação não terminar
  sozinha no mesmo instante em que começa.
*/
type Cronometrada = {
  duracao: number | undefined;
  destino: number | undefined;
  curva: ((t: number) => number) | undefined;
  nativa: boolean | undefined;
};
let animacoes: Cronometrada[];
let redutorLigado: boolean;
let segurarOFim: boolean;
let terminar: ((r: { finished: boolean }) => void) | null;

const agir = jest.fn();

beforeEach(() => {
  animacoes = [];
  redutorLigado = false;
  segurarOFim = false;
  terminar = null;
  mockEsquema = "light";
  mockMargens = { top: 0, bottom: 0, left: 0, right: 0 };
  mockJanela = { width: 390, height: 844, scale: 3, fontScale: 1 };
  agir.mockClear();
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(redutorLigado));
  jest.spyOn(AccessibilityInfo, "addEventListener")
    .mockReturnValue({ remove: () => undefined } as never);
  jest.spyOn(Animated, "timing").mockImplementation((_valor, config) => {
    animacoes.push({
      duracao: config.duration,
      destino: typeof config.toValue === "number" ? config.toValue : undefined,
      curva: config.easing,
      nativa: config.useNativeDriver,
    });
    return {
      start: (fim?: (r: { finished: boolean }) => void) => {
        if (segurarOFim) { terminar = fim ?? null; return; }
        fim?.({ finished: true });
      },
      stop: () => undefined, reset: () => undefined,
      _startNativeLoop: () => undefined, _isUsingNativeDriver: () => true,
    } as never;
  });
});

afterEach(() => { jest.restoreAllMocks(); });

const fechar = jest.fn();

type Feitio = "destrutiva" | "sem_recusa";

function dialogo(aberto: boolean, feitio: Feitio) {
  return (
    <ProvedorDeTema>
      {feitio === "destrutiva" ? (
        <Dialogo
          aberto={aberto}
          titulo="Descartar esta coleta?"
          texto="A vistoria será apagada deste aparelho. Não dá para desfazer."
          acao={{ rotulo: "Descartar esta coleta", destrutiva: true, aoTocar: agir }}
          recusa={{ rotulo: "Manter na fila" }}
          aoFechar={fechar}
        />
      ) : (
        <Dialogo
          aberto={aberto}
          titulo="Descartar esta coleta?"
          texto="A vistoria será apagada deste aparelho. Não dá para desfazer."
          acao={{ rotulo: "Descartar esta coleta", aoTocar: agir }}
          aoFechar={fechar}
        />
      )}
    </ProvedorDeTema>
  );
}

/**
 * Monta FECHADO e depois abre, que é a sequência do aparelho de verdade.
 *
 * Montar já aberto seria um atalho que esconde defeito: a leitura da redução de
 * movimento é uma promessa, e num diálogo que nasce aberto ela chega DEPOIS de
 * a folha já ter começado a subir. Na tela real o diálogo nasce fechado junto
 * com o resto do aplicativo e só abre quando o agente toca, muito depois de o
 * aparelho já ter respondido se a chave está ligada.
 */
async function montarEAbrir(feitio: Feitio = "destrutiva") {
  fechar.mockClear();
  let tela!: Awaited<ReturnType<typeof render>>;
  await act(async () => { tela = await render(dialogo(false, feitio)); });
  animacoes = [];
  await act(async () => { await tela.rerender(dialogo(true, feitio)); });
  return tela;
}

async function montarFechado(feitio: Feitio = "destrutiva") {
  fechar.mockClear();
  let tela!: Awaited<ReturnType<typeof render>>;
  await act(async () => { tela = await render(dialogo(false, feitio)); });
  return tela;
}

describe("o que o diálogo mostra", () => {
  it("fechado, não existe: nem a pergunta nem o botão que apaga", async () => {
    await montarFechado();
    expect(screen.queryByTestId("dialogo")).toBeNull();
    expect(screen.queryByText("Descartar esta coleta")).toBeNull();
  });

  it("aberto, mostra a pergunta, a consequência e as duas saídas", async () => {
    await montarEAbrir();
    expect(screen.getByText("Descartar esta coleta?")).toBeTruthy();
    expect(screen.getByText(/Não dá para desfazer/)).toBeTruthy();
    expect(screen.getByTestId("dialogo-acao")).toBeTruthy();
    expect(screen.getByTestId("dialogo-recusa")).toBeTruthy();
  });

  /*
    O texto do diálogo é o que explica o que vai ser perdido. No alerta nativo
    ele saía no corpo do sistema, menor que o corpo deste aplicativo, e é lido
    a meio metro do rosto com o aparelho molhado.
  */
  it("nenhum texto do diálogo desce abaixo da fonte mínima do produto", async () => {
    await montarEAbrir();
    for (const alvo of ["Descartar esta coleta?", /Não dá para desfazer/] as const) {
      const tamanho = StyleSheet.flatten(screen.getByText(alvo).props.style).fontSize;
      expect(tamanho).toBeGreaterThanOrEqual(fonteMinimaDeInteracao);
    }
  });

  it("sem recusa, o diálogo ainda tem saída de toque, e ela é o fundo", async () => {
    // A confirmação de "vistoria guardada" não tem o que recusar: a coleta já
    // está na fila. O que ela não pode é prender o agente numa tela sem saída.
    await montarEAbrir("sem_recusa");
    expect(screen.queryByTestId("dialogo-recusa")).toBeNull();
    expect(screen.getByTestId("dialogo-fundo", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("o fundo é saída de dedo, e não saída de leitor de tela", () => {
  /*
    Esta é a regra que obriga a recusa a existir sempre que a ação destrói
    alguma coisa, e ela foi descoberta escrevendo este arquivo.

    Um diálogo modal tira da árvore de acessibilidade tudo o que está fora dele,
    e o fundo escuro está fora dele. Para quem enxerga, tocar fora é a saída
    mais barata que existe. Para quem navega por voz, esse toque não é
    alcançável: o fundo simplesmente não está lá. Um diálogo destrutivo sem
    botão de recusa seria, para essa pessoa, uma pergunta com uma resposta só, e
    a resposta única seria "apague a minha vistoria".

    O portão de verdade contra isso é o TIPO das propriedades de `Dialogo`, que
    exige `recusa` quando `destrutiva` é verdadeiro. Este teste guarda a razão
    do portão, para ninguém afrouxar o tipo achando que o fundo resolve.
  */
  it("o fundo não é anunciado ao leitor de tela, ainda que exista para o dedo", async () => {
    await montarEAbrir();
    expect(screen.queryByTestId("dialogo-fundo")).toBeNull();
    expect(screen.getByTestId("dialogo-fundo", { includeHiddenElements: true })).toBeTruthy();
  });

  it("com ação destrutiva, existe sempre um botão de recusa alcançável", async () => {
    await montarEAbrir();
    expect(screen.getByTestId("dialogo-recusa")).toBeTruthy();
  });
});

describe("o alvo de toque, que é a régua deste aplicativo e não a do sistema", () => {
  it("os dois botões têm pelo menos 52 pontos de altura", async () => {
    await montarEAbrir();
    for (const id of ["dialogo-acao", "dialogo-recusa"]) {
      const altura = StyleSheet.flatten(screen.getByTestId(id).props.style).minHeight;
      expect(altura).toBeGreaterThanOrEqual(toque);
    }
  });
});

describe("a ação destrutiva se distingue da recusa", () => {
  it("tem fundo e cor próprios, e não o mesmo desenho de quem não faz nada", async () => {
    await montarEAbrir();
    const acao = StyleSheet.flatten(screen.getByTestId("dialogo-acao").props.style);
    const recusa = StyleSheet.flatten(screen.getByTestId("dialogo-recusa").props.style);

    expect(acao.backgroundColor).toBe(temaClaro.perigoFundo);
    expect(acao.backgroundColor).not.toBe(recusa.backgroundColor);
    expect(
      StyleSheet.flatten(screen.getByText("Descartar esta coleta").props.style).color,
    ).toBe(temaClaro.perigoTexto);
  });

  /*
    Cor sozinha nunca comunica neste aplicativo, e num diálogo isso importa
    duas vezes: o rótulo REPETE o verbo, então mesmo sem enxergar a cor do
    botão a pessoa lê o que vai acontecer. "OK" quebraria essa garantia.
  */
  it("o rótulo repete o verbo em vez de dizer OK", async () => {
    await montarEAbrir();
    const rotulo = screen.getByTestId("dialogo-acao").props.accessibilityLabel;
    expect(rotulo).toBe("Descartar esta coleta");
    expect(["OK", "Ok", "Sim", "Confirmar", "Entendi"]).not.toContain(rotulo);
  });

  it("ação que não é destrutiva não usa o desenho de perigo", async () => {
    await montarEAbrir("sem_recusa");
    const acao = StyleSheet.flatten(screen.getByTestId("dialogo-acao").props.style);
    expect(acao.backgroundColor).toBe(temaClaro.destaque);
  });
});

describe("o tema, que o alerta do sistema não seguia", () => {
  it("no modo claro a folha usa a superfície clara", async () => {
    mockEsquema = "light";
    await montarEAbrir();
    expect(
      StyleSheet.flatten(screen.getByTestId("dialogo").props.style).backgroundColor,
    ).toBe(temaClaro.superficie);
  });

  it("no modo escuro a folha usa a superfície escura, e não abre um retângulo branco", async () => {
    /*
      Este é o defeito com nome: plantão noturno, aparelho em modo escuro, e o
      alerta do sistema abrindo claro no meio da tela. A vista adaptada ao
      escuro leva segundos para voltar, e o botão que apaga a vistoria já está
      debaixo do dedo.
    */
    mockEsquema = "dark";
    await montarEAbrir();
    expect(
      StyleSheet.flatten(screen.getByTestId("dialogo").props.style).backgroundColor,
    ).toBe(elevacao(temaEscuro).folha.backgroundColor);
  });

  /*
    A dívida 9.1, virada caso.

    Enquanto a folha desenhava a superfície à mão, ela terminava, no escuro, em
    `superficie`, que é EXATAMENTE a superfície de um cartão comum. A peça que
    está por cima de tudo tinha a camada de uma peça que está no fundo, e o que
    separava as duas era só o véu. Este caso reprova no código anterior, porque
    lá os dois valores eram o mesmo.

    A afirmação é contra `elevacao(...).cartao` e não contra a constante
    `#171E24`: o que precisa valer é que a folha está ACIMA do cartão, e não que
    ela tem um hexadecimal específico. Travar a cor faria o caso reprovar no dia
    em que a paleta mudasse, dizendo que a elevação quebrou.
  */
  it("no escuro a folha fica ACIMA do cartão, e não na mesma camada dele", async () => {
    mockEsquema = "dark";
    await montarEAbrir();
    const daFolha = StyleSheet.flatten(screen.getByTestId("dialogo").props.style).backgroundColor;
    expect(daFolha).not.toBe(elevacao(temaEscuro).cartao.backgroundColor);
    expect(daFolha).toBe(temaEscuro.superficie2);
  });

  /*
    E ela carrega a sombra do nível, inteira. Enquanto a superfície foi escrita
    à mão aqui, a folha não tinha sombra NENHUMA: `elevacao(tema).folha` era o
    topo da escala de elevação sem um único uso no produto inteiro.
  */
  it("a folha carrega a sombra do topo da escala, e ela sobe", async () => {
    mockEsquema = "light";
    await montarEAbrir();
    const estilo = StyleSheet.flatten(screen.getByTestId("dialogo").props.style);
    expect(estilo.shadowRadius).toBe(elevacao(temaClaro).folha.shadowRadius);
    expect(estilo.elevation).toBe(elevacao(temaClaro).folha.elevation);
    /*
      Para cima, porque a única borda visível de uma folha colada no rodapé é a
      de cima. Descendo, a sombra cai para fora da tela e o nível inteiro vira
      decoração invisível, que foi o motivo pelo qual ele nunca foi ligado.
    */
    expect(estilo.shadowOffset?.height).toBeLessThan(0);
  });
});

describe("o leitor de tela para dentro do diálogo", () => {
  it("a folha é modal para a acessibilidade", async () => {
    await montarEAbrir();
    expect(screen.getByTestId("dialogo").props.accessibilityViewIsModal).toBe(true);
  });
});

describe("quem responde e quem não responde", () => {
  it("apenas ABERTO, a ação não acontece", async () => {
    await montarEAbrir();
    expect(agir).not.toHaveBeenCalled();
  });

  it("a recusa fecha e não faz nada", async () => {
    await montarEAbrir();
    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-recusa")); });
    expect(agir).not.toHaveBeenCalled();
    expect(fechar).toHaveBeenCalled();
  });

  it("tocar fora fecha e não faz nada: fechar é sempre recusar", async () => {
    await montarEAbrir();
    await act(async () => {
      fireEvent.press(screen.getByTestId("dialogo-fundo", { includeHiddenElements: true }));
    });
    expect(agir).not.toHaveBeenCalled();
    expect(fechar).toHaveBeenCalled();
  });

  it("o botão que age faz a ação uma vez, e fecha o diálogo junto", async () => {
    // Fechar junto evita a pergunta ficar de pé por trás da navegação que a
    // própria ação dispara, que foi defeito visto.
    await montarEAbrir();
    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });
    expect(agir).toHaveBeenCalledTimes(1);
    expect(fechar).toHaveBeenCalled();
  });
});

describe("redução de movimento", () => {
  it("com a chave desligada, a folha sobe na duração de mudança de estado", async () => {
    await montarEAbrir();
    expect(animacoes).toHaveLength(1);
    expect(animacoes[0]?.duracao).toBe(movimento.mudancaDeEstado);
  });

  it("com a chave ligada, NADA anima, e a pergunta continua inteira", async () => {
    redutorLigado = true;
    await montarEAbrir();
    expect(animacoes).toHaveLength(0);
    expect(screen.getByText("Descartar esta coleta?")).toBeTruthy();
    expect(screen.getByTestId("dialogo-acao")).toBeTruthy();
  });
});

/**
 * Duas curvas são a mesma curva se devolvem o mesmo valor ao longo do caminho.
 *
 * `Easing.bezier` devolve uma função nova a cada chamada, então comparar por
 * identidade não prova nada. Amostrar o meio do caminho prova: a curva de
 * entrada (0,2, 0, 0, 1) e a de saída (0, 0, 0,2, 1) divergem em qualquer
 * ponto entre zero e um, e as duas divergem do `Easing.out(Easing.quad)` que
 * morava escrito dentro desta peça.
 */
function mesmaCurva(curva: ((t: number) => number) | undefined, pontos: readonly number[]): boolean {
  if (typeof curva !== "function") return false;
  const [x1, y1, x2, y2] = pontos as [number, number, number, number];
  const esperada = Easing.bezier(x1, y1, x2, y2);
  return [0.2, 0.5, 0.8].every((t) => Math.abs(curva(t) - esperada(t)) < 0.001);
}

describe("a folha respeita o relógio do aparelho", () => {
  /*
    O defeito, visto numa captura de quem paga: a pergunta "Devolver esta
    tarefa?" com seis motivos e dois botões subia POR CIMA do relógio do
    iPhone. A folha crescia com o conteúdo e nada a prendia à área segura.

    O teto é uma conta, e a conta mora numa função pura para poder ser
    conferida como aritmética: a altura da tela, menos a área segura de cima,
    menos um respiro. O respiro não é folga por folga: é a faixa de véu que
    sobra acima da folha e que diz que aquilo continua sendo uma folha sobre a
    tela, e não uma tela nova.
  */
  it("o teto é a altura da tela menos a área segura de cima menos o respiro", () => {
    expect(tetoDaFolha({ alturaDaTela: 844, margemDeCima: 47 }))
      .toBe(844 - 47 - RESPIRO_ACIMA_DA_FOLHA);
    expect(tetoDaFolha({ alturaDaTela: 568, margemDeCima: 20 }))
      .toBe(568 - 20 - RESPIRO_ACIMA_DA_FOLHA);
  });

  it("o respiro vem da escala de espaço, e não de um número solto", () => {
    expect(Object.values(espaco)).toContain(RESPIRO_ACIMA_DA_FOLHA);
  });

  it("a folha nasce com o teto amarrado à área segura do aparelho", async () => {
    mockJanela = { width: 390, height: 844, scale: 3, fontScale: 1 };
    mockMargens = { top: 47, bottom: 34, left: 0, right: 0 };
    await montarEAbrir();

    const estilo = StyleSheet.flatten(screen.getByTestId("dialogo").props.style);
    expect(estilo.maxHeight).toBe(844 - 47 - RESPIRO_ACIMA_DA_FOLHA);
  });

  it("seis motivos numa tela baixa: o conteúdo rola por dentro e os botões ficam no rodapé", async () => {
    /*
      O aparelho de 568 pontos com 20 de barra de estado. O piso do que a folha
      desenha, contando SÓ o que vem de token (recuos da folha, os vãos entre
      as quatro partes, seis motivos de 52 pontos com os vãos entre eles, e os
      dois botões de 52), já passa do teto antes de contar uma linha de texto:
      este é um caso de transbordamento de verdade, e não um que caberia de
      qualquer jeito.
    */
    mockJanela = { width: 320, height: 568, scale: 2, fontScale: 1 };
    mockMargens = { top: 20, bottom: 0, left: 0, right: 0 };
    const teto = tetoDaFolha({ alturaDaTela: 568, margemDeCima: 20 });
    const motivos = MOTIVOS_DE_DEVOLUCAO.length;
    const pisoDaFolha = espaco.e5 + espaco.e7 + 3 * espaco.e4
      + motivos * toque + (motivos - 1) * espaco.e2
      + 2 * toque + espaco.e3;
    expect(pisoDaFolha).toBeGreaterThan(teto);

    const devolucao = (aberto: boolean) => (
      <ProvedorDeTema>
        <DialogoDeDevolucao
          aberto={aberto}
          protocolo="000471/2026"
          endereco="Servidão do Morro, 15"
          aoConfirmar={agir}
          aoFechar={fechar}
        />
      </ProvedorDeTema>
    );
    let tela!: Awaited<ReturnType<typeof render>>;
    await act(async () => { tela = await render(devolucao(false)); });
    await act(async () => { await tela.rerender(devolucao(true)); });

    const folha = screen.getByTestId("dialogo-devolucao");
    expect(StyleSheet.flatten(folha.props.style).maxHeight).toBe(teto);

    /* O que transborda mora dentro da área que rola, e ela é a que cede. */
    const conteudo = screen.getByTestId("dialogo-conteudo");
    expect(StyleSheet.flatten(conteudo.props.style).flexShrink).toBe(1);
    expect(within(conteudo).getAllByRole("radio")).toHaveLength(MOTIVOS_DE_DEVOLUCAO.length);

    /* Os botões ficam FORA da área que rola, como último filho da folha: é o
       que os mantém no rodapé, ao alcance do polegar, com a lista rolando
       acima deles. */
    expect(within(conteudo).queryByTestId("dialogo-acao")).toBeNull();
    expect(within(conteudo).queryByTestId("dialogo-recusa")).toBeNull();
    const ultimoFilho = folha.children[folha.children.length - 1];
    expect(typeof ultimoFilho).not.toBe("string");
    expect(within(ultimoFilho as ReturnType<typeof screen.getByTestId>).getByTestId("dialogo-acao"))
      .toBeTruthy();
  });
});

describe("cada motivo da devolução responde ao dedo", () => {
  /*
    Os seis motivos eram `Pressable` cru com estilo parado: o dedo encostava e
    nada acontecia até o motivo ficar marcado. O `Botao` logo abaixo respondia
    com transição, e a opção logo acima, não. É a diferença que ninguém relata
    e todo mundo sente, e o vocabulário para ela já existe: `useRespostaAoToque`,
    pelo `Tocavel`.
  */
  it("encostar num motivo pede a resposta ao toque, curta e na camada nativa", async () => {
    const devolucao = (aberto: boolean) => (
      <ProvedorDeTema>
        <DialogoDeDevolucao
          aberto={aberto}
          protocolo="000471/2026"
          endereco="Servidão do Morro, 15"
          aoConfirmar={agir}
          aoFechar={fechar}
        />
      </ProvedorDeTema>
    );
    let tela!: Awaited<ReturnType<typeof render>>;
    await act(async () => { tela = await render(devolucao(false)); });
    await act(async () => { await tela.rerender(devolucao(true)); });
    animacoes = [];

    const primeiro = MOTIVOS_DE_DEVOLUCAO[0];
    await act(async () => { fireEvent(screen.getByTestId(`motivo-${primeiro}`), "pressIn"); });

    const resposta = animacoes.find((a) => a.duracao === movimento.respostaAoToque);
    expect(resposta).toBeDefined();
    expect(resposta?.nativa).toBe(true);
  });
});

describe("o que a devolução lembra enquanto a folha desce", () => {
  const devolucao = (aberto: boolean) => (
    <ProvedorDeTema>
      <DialogoDeDevolucao
        aberto={aberto}
        protocolo="000471/2026"
        endereco="Servidão do Morro, 15"
        aoConfirmar={agir}
        aoFechar={fechar}
      />
    </ProvedorDeTema>
  );
  const primeiro = MOTIVOS_DE_DEVOLUCAO[0];
  const marcado = () => screen.getByTestId(`motivo-${primeiro}`).props.accessibilityState?.checked;

  /*
    A folha continua na tela por um instante depois de fechada (ver a saída em
    `Dialogo`). Se o diálogo esquecesse o motivo no instante em que `aberto`
    vira falso, o agente veria, enquanto ela desce, o motivo que acabou de
    confirmar se DESMARCAR, o aviso "escolha um motivo" voltar e o botão
    apagar: a folha diria "não respondido" sobre uma resposta que já foi.
  */
  it("o motivo confirmado continua marcado enquanto a folha desce", async () => {
    let tela!: Awaited<ReturnType<typeof render>>;
    await act(async () => { tela = await render(devolucao(false)); });
    await act(async () => { await tela.rerender(devolucao(true)); });
    await act(async () => { fireEvent.press(screen.getByTestId(`motivo-${primeiro}`)); });
    expect(marcado()).toBe(true);

    segurarOFim = true;
    await act(async () => { await tela.rerender(devolucao(false)); });

    expect(marcado()).toBe(true);
    expect(screen.queryByText(/Escolha um motivo/)).toBeNull();
  });

  it("a abertura seguinte nasce em branco, sem o motivo da tarefa anterior", async () => {
    let tela!: Awaited<ReturnType<typeof render>>;
    await act(async () => { tela = await render(devolucao(false)); });
    await act(async () => { await tela.rerender(devolucao(true)); });
    await act(async () => { fireEvent.press(screen.getByTestId(`motivo-${primeiro}`)); });

    await act(async () => { await tela.rerender(devolucao(false)); });
    await act(async () => { await tela.rerender(devolucao(true)); });

    expect(marcado()).toBe(false);
    expect(screen.getByText(/Escolha um motivo/)).toBeTruthy();
  });
});

describe("a folha entra e sai com as curvas do produto", () => {
  it("entra com a curva de entrada, na camada nativa", async () => {
    await montarEAbrir();
    expect(animacoes).toHaveLength(1);
    expect(animacoes[0]?.destino).toBe(1);
    expect(animacoes[0]?.nativa).toBe(true);
    expect(mesmaCurva(animacoes[0]?.curva, easing.entrada)).toBe(true);
    expect(mesmaCurva(animacoes[0]?.curva, easing.saida)).toBe(false);
  });

  it("ao fechar, sai com a curva de saída, e só deixa a tela quando terminou", async () => {
    /*
      A folha que some no quadro seguinte é o corte seco que faz um aplicativo
      parecer sem vida. Ela desce e apaga, e enquanto desce continua na tela.
    */
    const tela = await montarEAbrir();
    animacoes = [];
    segurarOFim = true;

    await act(async () => { await tela.rerender(dialogo(false, "destrutiva")); });

    expect(animacoes).toHaveLength(1);
    expect(animacoes[0]?.destino).toBe(0);
    expect(animacoes[0]?.duracao).toBe(movimento.mudancaDeEstado);
    expect(animacoes[0]?.nativa).toBe(true);
    expect(mesmaCurva(animacoes[0]?.curva, easing.saida)).toBe(true);
    expect(mesmaCurva(animacoes[0]?.curva, easing.entrada)).toBe(false);
    expect(screen.getByTestId("dialogo")).toBeTruthy();

    await act(async () => { terminar?.({ finished: true }); });
    expect(screen.queryByTestId("dialogo")).toBeNull();
  });

  it("enquanto sai, a folha não responde ao dedo: o toque atrasado não age", async () => {
    /*
      O agente tocou em "Manter na fila" e o dedo desceu de novo, na folha que
      ainda está desaparecendo. Se ela continuasse respondendo, o segundo
      toque cairia em "Descartar esta coleta", que estava logo acima.
    */
    const tela = await montarEAbrir();
    segurarOFim = true;
    await act(async () => { await tela.rerender(dialogo(false, "destrutiva")); });

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });
    expect(agir).not.toHaveBeenCalled();
  });

  it("com redução de movimento, fechar tira a folha na hora, sem animar", async () => {
    redutorLigado = true;
    const tela = await montarEAbrir();
    animacoes = [];

    await act(async () => { await tela.rerender(dialogo(false, "destrutiva")); });

    expect(animacoes).toHaveLength(0);
    expect(screen.queryByTestId("dialogo")).toBeNull();
  });

  it("aberta de novo no meio da saída, a folha volta a subir em vez de sumir", async () => {
    const tela = await montarEAbrir();
    segurarOFim = true;
    await act(async () => { await tela.rerender(dialogo(false, "destrutiva")); });
    const fimDaSaida = terminar;
    segurarOFim = false;
    animacoes = [];

    await act(async () => { await tela.rerender(dialogo(true, "destrutiva")); });
    /* A saída interrompida avisa que NÃO terminou, e isso não pode fechar a
       folha que acabou de ser pedida de volta. */
    await act(async () => { fimDaSaida?.({ finished: false }); });

    expect(animacoes.at(-1)?.destino).toBe(1);
    expect(screen.getByTestId("dialogo")).toBeTruthy();
  });
});
