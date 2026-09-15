import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { FolhaDeEscolha, type OpcaoDaFolha } from "./FolhaDeEscolha";
import { ProvedorDeTema } from "./componentes";
import { IconeAparelho, IconeTarefas } from "./icones";
import { toque } from "./tokens";

/**
 * A FOLHA DE ESCOLHA, que é o recipiente e não a pergunta.
 *
 * `EscolhaDeMapa` nasceu com as três respostas escritas dentro dela. A tela do
 * mapa precisou de DUAS perguntas diferentes (o que fazer ao tocar num pino, e
 * como chegar até a tarefa), e copiar o invólucro duas vezes seria a segunda
 * gramática de folha na mesma tela, que é o defeito que o cabeçalho de
 * `EscolhaDeMapa` já nomeia. Então o invólucro virou esta peça, e cada tela
 * traz o título, o assunto e as respostas.
 *
 * O que estes casos travam é o CONTRATO do recipiente: as respostas chegam
 * como chegaram, a saída nomeada existe, o fundo fecha sem escolher e não é
 * anunciado, o alvo é o do produto. As perguntas de cada tela têm os casos
 * delas (`escolha-de-mapa.test.tsx`, `mapa-tela-dedicada.test.tsx`).
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

type Chave = "primeira" | "segunda";

const OPCOES: readonly [OpcaoDaFolha<Chave>, OpcaoDaFolha<Chave>] = [
  {
    chave: "primeira",
    testID: "opcao-primeira",
    titulo: "Abrir a primeira",
    detalhe: "O que a primeira faz.",
    desenho: (cor) => <IconeAparelho cor={cor} />,
  },
  {
    chave: "segunda",
    testID: "opcao-segunda",
    titulo: "Ver a segunda",
    detalhe: "O que a segunda faz.",
    desenho: (cor) => <IconeTarefas cor={cor} />,
  },
];

const ESCOLHIDAS: Chave[] = [];
let fechou = 0;
beforeEach(() => { ESCOLHIDAS.length = 0; fechou = 0; });

async function abrir(props?: { aberto?: boolean }) {
  await act(async () => {
    render(
      <ProvedorDeTema>
        <FolhaDeEscolha
          aberto={props?.aberto ?? true}
          testID="folha-de-teste"
          titulo="O que fazer?"
          assunto="Protocolo 000100/2026, Servidão do Morro, 45"
          opcoes={OPCOES}
          saida={{ titulo: "Continuar onde estava", testID: "folha-sair" }}
          aoEscolher={(chave) => { ESCOLHIDAS.push(chave); }}
          aoFechar={() => { fechou += 1; }}
        />
      </ProvedorDeTema>,
    );
  });
}

describe("o título e o assunto", () => {
  it("a folha diz a pergunta e de quem ela fala", async () => {
    await abrir();
    expect(screen.getByText("O que fazer?")).toBeTruthy();
    expect(screen.getByText("Protocolo 000100/2026, Servidão do Morro, 45")).toBeTruthy();
  });
});

describe("as respostas", () => {
  it("cada resposta está na folha, com título e detalhe numa frase só para quem ouve", async () => {
    await abrir();
    expect(screen.getByTestId("opcao-primeira").props.accessibilityLabel)
      .toBe("Abrir a primeira. O que a primeira faz.");
    expect(screen.getByTestId("opcao-segunda").props.accessibilityLabel)
      .toBe("Ver a segunda. O que a segunda faz.");
  });

  it.each([
    ["opcao-primeira", "primeira"],
    ["opcao-segunda", "segunda"],
  ] as const)("%s devolve a chave %s e fecha", async (id, chave) => {
    await abrir();
    await act(async () => { fireEvent.press(screen.getByTestId(id)); });
    expect(ESCOLHIDAS).toEqual([chave]);
    expect(fechou).toBe(1);
  });

  it("a saída nomeada fecha sem escolher", async () => {
    await abrir();
    expect(screen.getByText("Continuar onde estava")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("folha-sair")); });
    expect(ESCOLHIDAS).toEqual([]);
    expect(fechou).toBe(1);
  });

  it("tocar fora fecha sem escolher, e o fundo não é anunciado", async () => {
    await abrir();
    expect(screen.queryByTestId("folha-de-teste-fundo")).toBeNull();
    const fundo = screen.getByTestId("folha-de-teste-fundo", { includeHiddenElements: true });
    await act(async () => { fireEvent.press(fundo); });
    expect(ESCOLHIDAS).toEqual([]);
    expect(fechou).toBe(1);
  });
});

describe("o acabamento", () => {
  it("fechada, não desenha nada", async () => {
    await abrir({ aberto: false });
    expect(screen.queryByTestId("opcao-primeira")).toBeNull();
    expect(screen.queryByText("O que fazer?")).toBeNull();
  });

  it("cada resposta tem o alvo do produto", async () => {
    await abrir();
    for (const id of ["opcao-primeira", "opcao-segunda"]) {
      const estilo = Object.assign({}, ...[screen.getByTestId(id).props.style].flat(9));
      expect(estilo.minHeight).toBeGreaterThanOrEqual(toque);
    }
  });

  it("é modal para quem navega por leitor de tela, com o testID pedido", async () => {
    await abrir();
    expect(screen.getByTestId("folha-de-teste").props.accessibilityViewIsModal).toBe(true);
  });
});
