import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { EscolhaDeMapa, type RespostaDoMapa } from "./EscolhaDeMapa";
import { ProvedorDeTema } from "./componentes";
import { toque } from "./tokens";

/**
 * A ESCOLHA QUE O BOTÃO DO MAPA NÃO OFERECIA.
 *
 * "Abrir no mapa" tinha uma resposta só, e ela levava o agente para FORA do
 * aplicativo, no meio de uma coleta de quarenta minutos, sem perguntar. Quem
 * paga pediu as três: abrir o mapa do aparelho, ver o mapa aqui dentro, e
 * copiar a coordenada.
 *
 * ## Por que é uma folha e não um `Dialogo`
 *
 * O `Dialogo` do produto tem duas saídas por construção: uma AÇÃO e uma RECUSA,
 * e o tipo dele cobra isso. Aqui não há ação principal: as três respostas são
 * igualmente legítimas, e qual delas é a certa depende de o agente estar no
 * carro, na porta da casa, ou falando por rádio com a base. Um diálogo com uma
 * das três promovida a primária estaria decidindo por ele.
 *
 * ## A regra de conteúdo, herdada e não reinventada
 *
 * `Dialogo.tsx` escreve, com estas palavras, que **o botão que age REPETE o
 * verbo da ação, nunca "OK" nem "Sim"**, porque quem lê em pé, na chuva, lê o
 * botão e não o título. A mesma regra vale aqui, e vale com mais força: três
 * opções chamadas "Mapa", "Aqui" e "Copiar" obrigariam a ler o texto de apoio
 * de cada uma para saber o que acontece.
 */

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

beforeEach(() => { mockEsquema = "light"; });

const ESCOLHIDAS: RespostaDoMapa[] = [];
let fechou = 0;

beforeEach(() => { ESCOLHIDAS.length = 0; fechou = 0; });

async function abrir(props?: { aberto?: boolean }) {
  await act(async () => {
    render(
      <ProvedorDeTema>
        <EscolhaDeMapa
          aberto={props?.aberto ?? true}
          endereco="Servidão do Morro, 45"
          coordenada="-27.595378, -48.548050"
          aoEscolher={(r) => { ESCOLHIDAS.push(r); }}
          aoFechar={() => { fechou += 1; }}
        />
      </ProvedorDeTema>,
    );
  });
}

/* ============================================================
   1. As três respostas existem, e dizem o que fazem
   ============================================================ */

describe("as três respostas", () => {
  it("estão todas na folha", async () => {
    await abrir();
    expect(screen.getByTestId("mapa-no-aparelho")).toBeTruthy();
    expect(screen.getByTestId("mapa-aqui-dentro")).toBeTruthy();
    expect(screen.getByTestId("mapa-copiar")).toBeTruthy();
  });

  /*
    O verbo no rótulo é a regra escrita em `Dialogo.tsx`. "OK" e "Mapa" não
    dizem o que vai acontecer, e é com pressa que se lê isto em campo.
  */
  it("cada rótulo começa por um verbo, e nenhum é 'OK'", async () => {
    await abrir();
    for (const id of ["mapa-no-aparelho", "mapa-aqui-dentro", "mapa-copiar"]) {
      const rotulo = String(screen.getByTestId(id).props.accessibilityLabel);
      expect(rotulo).toMatch(/^(Abrir|Ver|Copiar) /);
    }
  });

  /*
    A diferença entre as três não é de gosto: uma delas tira o agente do
    aplicativo no meio da coleta. O texto de apoio precisa DIZER isso, porque
    descobrir depois de sair é descobrir tarde.
  */
  it("a que sai do aplicativo avisa que sai", async () => {
    await abrir();
    expect(screen.getByText(/sai do DC360/i)).toBeTruthy();
  });

  it("a que fica aqui dentro diz que não sai, e aponta a legenda de modo", async () => {
    await abrir();
    expect(screen.getByText(/sem sair do aplicativo/i)).toBeTruthy();
    expect(screen.getByText(/legenda/i)).toBeTruthy();
  });

  it("a de copiar mostra a coordenada que vai ser copiada", async () => {
    await abrir();
    expect(screen.getByText(/-27\.595378, -48\.548050/)).toBeTruthy();
  });

  it("o endereço de destino aparece, para a folha não ser uma pergunta sem sujeito", async () => {
    await abrir();
    expect(screen.getByText(/Servidão do Morro, 45/)).toBeTruthy();
  });
});

/* ============================================================
   2. O que cada toque produz
   ============================================================ */

describe("o toque em cada resposta", () => {
  it.each([
    ["mapa-no-aparelho", "aplicativo"],
    ["mapa-aqui-dentro", "aqui-dentro"],
    ["mapa-copiar", "copiar"],
  ] as const)("%s escolhe %s e fecha a folha", async (id, resposta) => {
    await abrir();
    await act(async () => { fireEvent.press(screen.getByTestId(id)); });
    expect(ESCOLHIDAS).toEqual([resposta]);
    expect(fechou).toBe(1);
  });

  /*
    Fechar sem escolher é uma saída, e ela nomeia o que faz. "Cancelar" num
    aplicativo de campo é ambíguo do jeito mais caro possível: cancelar a
    escolha, ou cancelar a vistoria?
  */
  it("dá para sair sem escolher nenhuma das três", async () => {
    await abrir();
    await act(async () => { fireEvent.press(screen.getByTestId("mapa-continuar")); });
    expect(ESCOLHIDAS).toEqual([]);
    expect(fechou).toBe(1);
  });

  /*
    O fundo existe para o dedo e NÃO para o leitor de tela, como no `Dialogo`:
    num modal ele não está na árvore de acessibilidade, e anunciá-lo seria
    prometer uma saída que quem navega por voz nunca encontra. Por isso a busca
    precisa dizer que quer o escondido.
  */
  it("tocar fora da folha fecha sem escolher", async () => {
    await abrir();
    const fundo = screen.getByTestId("escolha-de-mapa-fundo", { includeHiddenElements: true });
    await act(async () => { fireEvent.press(fundo); });
    expect(ESCOLHIDAS).toEqual([]);
    expect(fechou).toBe(1);
  });

  it("o fundo não é anunciado ao leitor de tela", async () => {
    await abrir();
    expect(screen.queryByTestId("escolha-de-mapa-fundo")).toBeNull();
  });
});

/* ============================================================
   3. O acabamento que o produto exige
   ============================================================ */

describe("o acabamento", () => {
  it("fechada, não desenha nada", async () => {
    await abrir({ aberto: false });
    expect(screen.queryByTestId("mapa-no-aparelho")).toBeNull();
  });

  it("as três respostas têm o alvo do produto", async () => {
    await abrir();
    for (const id of ["mapa-no-aparelho", "mapa-aqui-dentro", "mapa-copiar"]) {
      const estilo = Object.assign({}, ...[screen.getByTestId(id).props.style].flat(9));
      expect(estilo.minHeight).toBeGreaterThanOrEqual(toque);
    }
  });

  /*
    A folha é modal: ela existe para tirar o resto da tela do alcance até a
    pergunta ser respondida. Sem isto, o dedo deslizando continua encontrando os
    campos do formulário atrás dela.
  */
  it("é modal para quem navega por leitor de tela", async () => {
    await abrir();
    expect(screen.getByTestId("escolha-de-mapa").props.accessibilityViewIsModal).toBe(true);
  });
});
