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

import { AccessibilityInfo, Animated, StyleSheet } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

import { ProvedorDeTema } from "./componentes";
import { Dialogo } from "./Dialogo";
import { elevacao, fonteMinimaDeInteracao, movimento, temaClaro, temaEscuro, toque } from "./tokens";

/*
  As animações são espionadas em vez de o valor animado ser lido. O que se quer
  provar é "animou" ou "não animou", e `Animated.timing` é a única forma de
  movimento que este componente usa.
*/
let animacoes: Array<{ duracao: number | undefined }>;
let redutorLigado: boolean;

const agir = jest.fn();

beforeEach(() => {
  animacoes = [];
  redutorLigado = false;
  mockEsquema = "light";
  agir.mockClear();
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(redutorLigado));
  jest.spyOn(AccessibilityInfo, "addEventListener")
    .mockReturnValue({ remove: () => undefined } as never);
  jest.spyOn(Animated, "timing").mockImplementation((_valor, config) => {
    animacoes.push({ duracao: config.duration });
    return {
      start: (fim?: (r: { finished: boolean }) => void) => fim?.({ finished: true }),
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
