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
import { Animated, View } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

let mockReduzir = false;
jest.mock("./useReducaoDeMovimento", () => ({
  useReducaoDeMovimento: () => mockReduzir,
}));

import { ItemDeLista } from "./ItemDeLista";

function Marca({ testID }: { testID?: string }) {
  return <View testID={testID} style={{ width: 10, height: 10 }} />;
}

async function montar(no: React.ReactElement): Promise<void> {
  await act(async () => { await render(no); });
}

beforeEach(() => { mockReduzir = false; });
afterEach(() => { jest.restoreAllMocks(); });

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

  it("o item existe na árvore desde o primeiro quadro, mesmo esperando", async () => {
    /*
      O ponto inteiro da decisão de o atraso morar na peça: quem ouve a tela
      encontra o item agora, e não daqui a trezentos milissegundos.
    */
    await montar(<ItemDeLista entrando atraso={300}><Marca testID="ja-existe" /></ItemDeLista>);
    expect(screen.getByTestId("ja-existe")).toBeTruthy();
  });
});
