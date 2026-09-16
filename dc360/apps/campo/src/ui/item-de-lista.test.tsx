/**
 * A entrada em cascata, e por que ela precisou de uma propriedade nova.
 *
 * `atrasoEmCascata()` nasceu na fundação da 2.0 e terminou a onda com ZERO
 * uso: a tela que precisava dela não conseguia ligá-la sem duplicar esta peça,
 * porque a entrada acontece aqui dentro e não havia por onde dizer "espere um
 * pouco antes de começar".
 *
 * Token sem dono é o que o portão de design reprova, e vocabulário de movimento
 * sem dono é a mesma doença com outro nome.
 *
 * ## Por que o atraso é da peça, e não de quem chama
 *
 * Quem chama poderia montar o item depois, com um temporizador. Isso é pior por
 * dois motivos: a lista passaria a nascer incompleta (e a `FlatList` mede o que
 * existe, então a barra de rolagem saltaria enquanto os itens aparecem), e o
 * leitor de tela anunciaria os itens chegando um a um, como se estivessem sendo
 * criados naquele instante.
 *
 * Aqui o item nasce inteiro, na árvore e para quem ouve. O que atrasa é só a
 * pintura.
 */
import { AccessibilityInfo, Animated, View } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

/**
 * O dublê LIGA por cima do hook de verdade, e nunca no lugar dele.
 *
 * A versão anterior substituía o hook inteiro por uma constante, e era isso que
 * deixava o caso da redução de movimento passar verde sobre um estado que o
 * aplicativo NUNCA tem: `useReducaoDeMovimento` começa em `false` e só sabe a
 * resposta do sistema depois que a promessa de `AccessibilityInfo` resolve, o
 * que é sempre DEPOIS da montagem. Um dublê que devolve `true` no primeiro
 * quadro testa um aparelho que não existe.
 *
 * Aqui o hook real roda sempre (então a ordem dos hooks nunca muda), e
 * `mockReduzir` só serve para o caso que quer a chave ligada desde antes, sem
 * depender do sistema.
 */
let mockReduzir = false;
jest.mock("./useReducaoDeMovimento", () => {
  const real = jest.requireActual("./useReducaoDeMovimento") as
    typeof import("./useReducaoDeMovimento");
  return { useReducaoDeMovimento: () => real.useReducaoDeMovimento() || mockReduzir };
});

import { ESCALA_NA_BORDA, ItemDeLista } from "./ItemDeLista";

function Marca({ testID }: { testID?: string }) {
  return <View testID={testID} style={{ width: 10, height: 10 }} />;
}

async function montar(no: React.ReactElement): Promise<void> {
  await act(async () => { await render(no); });
}

/** O que está DESENHADO no invólucro do item, que é o que o agente enxerga. */
function visibilidade(testID: string): { opacidade: unknown; escala: unknown } {
  const estilo = screen.getByTestId(testID).parent?.props?.style as {
    opacity?: unknown;
    transform?: Array<{ scale?: unknown }>;
  };
  return { opacidade: estilo?.opacity, escala: estilo?.transform?.[0]?.scale };
}

beforeEach(() => { mockReduzir = false; });
afterEach(() => {
  jest.restoreAllMocks();
  /*
    `isReduceMotionEnabled` já nasce como `jest.fn` no dublê do React Native, e
    `spyOn` sobre um `jest.fn` não cria espião nenhum: `restoreAllMocks` não o
    devolve ao que era. Sem esta linha, o caso da chave chegando atrasada
    deixava a redução ligada para todo caso seguinte deste arquivo (uma sonda
    no fim lia `true`), e eles passavam a testar um aparelho que não anima.
  */
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockImplementation(
    () => Promise.resolve(false),
  );
});

describe("a entrada em cascata", () => {
  it("espera o atraso pedido antes de começar a aparecer", async () => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<ItemDeLista entrando atraso={120}><Marca /></ItemDeLista>);

    const entrada = espiao.mock.calls.at(-1)?.[1] as { delay?: number } | undefined;
    expect(entrada?.delay).toBe(120);
  });

  it("sem atraso pedido, começa na hora, como sempre começou", async () => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<ItemDeLista entrando><Marca /></ItemDeLista>);

    const entrada = espiao.mock.calls.at(-1)?.[1] as { delay?: number } | undefined;
    expect(entrada?.delay ?? 0).toBe(0);
  });

  it("com redução de movimento, o atraso não segura nada", async () => {
    /*
      Quem liga a chave de redução não quer esperar por uma animação que não vai
      acontecer. Segurar a pintura ali transformaria uma preferência de
      acessibilidade em lentidão, que é o contrário do que ela pede.
    */
    mockReduzir = true;
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<ItemDeLista entrando atraso={300}><Marca testID="na-hora" /></ItemDeLista>);

    expect(screen.getByTestId("na-hora")).toBeTruthy();
    expect(espiao).not.toHaveBeenCalled();
  });

  /*
    O CASO DE VERDADE, e é ele que o aparelho vive.

    O caso acima liga a chave ANTES do primeiro quadro, e o aplicativo nunca
    está nesse estado: `AccessibilityInfo.isReduceMotionEnabled()` é uma
    promessa, então o primeiro quadro de toda tela sai com "não reduzir" e a
    resposta do sistema chega logo depois. Se a peça decidir de uma vez por
    todas na montagem, quem ligou a redução de movimento continua recebendo a
    animação inteira, com o atraso da cascata em cima: a chave de acessibilidade
    vira, literalmente, uma espera a mais.

    O agente que liga essa chave liga porque animação em tela dá enjoo, e é a
    mesma pessoa que este aplicativo coloca em pé num barranco, na chuva,
    esperando meio segundo para ver se o despacho novo chegou.
  */
  it("a chave do sistema chegando DEPOIS do primeiro quadro também tira a animação", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

    await montar(<ItemDeLista entrando atraso={240}><Marca testID="na-hora" /></ItemDeLista>);
    /*
      A resposta do sistema já chegou. Daqui em diante o item precisa estar
      PINTADO, e não esperando 240 ms de cascata mais 260 ms de animação que
      quem usa o aparelho pediu para não existir. A prova é a opacidade
      desenhada, e não a chamada que a deixou de fazer: é ela que o agente vê.
    */
    await act(async () => {});

    expect(visibilidade("na-hora")).toEqual({ opacidade: 1, escala: 1 });
  });

  it("o item existe na árvore desde o primeiro quadro, mesmo esperando", async () => {
    /*
      O ponto inteiro da decisão de o atraso morar na peça: quem ouve a tela
      encontra o item agora, e não daqui a trezentos milissegundos.
    */
    await montar(<ItemDeLista entrando atraso={300}><Marca testID="ja-existe" /></ItemDeLista>);
    expect(screen.getByTestId("ja-existe")).toBeTruthy();
  });
});

describe("a saída que é desfeita", () => {
  /*
    A DESPEDIDA TEM VOLTA, e a peça não tinha caminho de volta.

    Quem usa esta peça começa a despedida assim que o item some do disco e larga
    o cartão depois de `mudancaDeEstado`. Nesse intervalo o item pode VOLTAR: na
    lista de tarefas é a devolução que o servidor recusa (a tarefa sai da lista
    quando o pedido entra na fila e volta quando a recusa chega), e a própria
    tela já trata esse caso, tirando o item da despedida para ele não aparecer
    duas vezes com a mesma chave.

    Só que o item nunca foi desmontado: ele continua com a mesma chave na lista,
    e a peça o tinha deixado em opacidade zero. O que o agente vê no lugar do
    cartão é um buraco, e o cartão que sumiu é justamente o que carrega "A
    coordenação não recebeu esta devolução", que é a única coisa na tela que
    diz que a tarefa continua sendo dele.

    LIMITE DESTE CASO, e ele é honesto: a chave de redução de movimento é o
    único caminho em que a opacidade é observável aqui, porque `jest-expo` não
    faz o valor da animação na thread nativa andar, nem com temporizador falso.
    O caminho animado tem exatamente a mesma forma e o mesmo defeito, e é
    consertado pela mesma linha; o que este caso prova é a regra da peça (voltar
    da saída volta a desenhar), e não o desenho de cada quadro.
  */
  it("o item que volta antes de a saída terminar volta a ser desenhado", async () => {
    mockReduzir = true;
    await montar(<ItemDeLista><Marca testID="volta" /></ItemDeLista>);

    await act(async () => {
      screen.rerender(<ItemDeLista saindo><Marca testID="volta" /></ItemDeLista>);
    });
    expect(visibilidade("volta")).toEqual({ opacidade: 0, escala: ESCALA_NA_BORDA });

    await act(async () => {
      screen.rerender(<ItemDeLista><Marca testID="volta" /></ItemDeLista>);
    });

    expect(visibilidade("volta")).toEqual({ opacidade: 1, escala: 1 });
  });

  /*
    E o item que NUNCA saiu não ganha animação de volta por causa desta regra:
    seria a lista inteira piscando a cada renderização em que nada aconteceu.
  */
  it("quem nunca saiu não é reanimado", async () => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar(<ItemDeLista><Marca testID="parada" /></ItemDeLista>);

    await act(async () => {
      screen.rerender(<ItemDeLista><Marca testID="parada" /></ItemDeLista>);
    });

    expect(espiao).not.toHaveBeenCalled();
    expect(visibilidade("parada")).toEqual({ opacidade: 1, escala: 1 });
  });
});
