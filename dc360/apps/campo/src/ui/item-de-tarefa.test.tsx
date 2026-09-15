/**
 * O ITEM DE TAREFA EM SANFONA, que é uma peça só para as duas telas.
 *
 * Ele nasceu dentro de `app/(agente)/mapa.tsx` (`ItemDaTarefa`, `SetaDoItem`,
 * `DetalheDoItem`) e foi extraído para cá quando quem paga pediu o mesmo
 * desenho na tela de tarefas: "na tela tarefas o item da tarefa deve aparecer
 * fechado na lista paginada, e só ao clicar nele ele expande e mostra os
 * detalhes e os btns abrir vistoria e tudo mais". Duas cópias de uma sanfona
 * divergem na primeira edição, e a que diverge é a que ninguém abre.
 *
 * O que estes casos travam é o contrato da peça, e não o que cada tela põe
 * dentro dela (isso é medido nos arquivos de cada tela):
 *
 * 1. Fechado, o item é só o resumo: nada do detalhe, nenhum botão.
 * 2. Aberto, o detalhe aparece como IRMÃO do tocável, e o leitor de tela sabe
 *    o estado (`expanded` e `selected`).
 * 3. O rótulo composto diz o que o item é antes de dizer o que o toque faz.
 * 4. A seta não anima na montagem, só na mudança, e nunca com redução de
 *    movimento. O detalhe entra em transição de token, e não na primeira
 *    pintura de uma tela.
 * 5. As três funções puras da sanfona (qual item está aberto, o que o toque
 *    faz, quantos a página mostra) são medidas sem montar árvore nenhuma.
 */
import { Animated, View } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

import {
  ItemDeTarefa, RodapeDaPagina, TAMANHO_DA_PAGINA, alternarEscolha, itemAberto,
  quantasMostrar, type Escolha, type TarefaDoItem,
} from "./ItemDeTarefa";
import { ProvedorDeTema } from "./componentes";
import { movimento } from "./tokens";

const HORA = 3_600_000;
const AGORA = new Date("2026-09-15T12:00:00.000Z").getTime();
/** A base da equipe. */
const AQUI = { latitude: -27.595378, longitude: -48.548050 };
const aoNorte = (metros: number) => ({
  latitude: AQUI.latitude + metros / 111_000,
  longitude: AQUI.longitude,
});

function tarefa(parcial: Partial<TarefaDoItem> = {}): TarefaDoItem {
  return {
    id: "uma",
    protocolo: "000471/2026",
    severidade: "alta",
    endereco: "Servidão do Morro, 45, casa azul depois da padaria",
    ponto_referencia: "Portão verde, em frente ao poste",
    prazo_em: new Date(AGORA + 9 * HORA).toISOString(),
    latitude: null,
    longitude: null,
    ...parcial,
  };
}

type Props = Partial<React.ComponentProps<typeof ItemDeTarefa>>;

async function montar(props: Props = {}, filhos?: React.ReactNode) {
  const aoAlternar = props.aoAlternar ?? jest.fn();
  await act(async () => {
    await render(
      <ProvedorDeTema>
        <ItemDeTarefa
          tarefa={tarefa()}
          aberto={false}
          agora={AGORA}
          agente={null}
          metros={null}
          selo={null}
          reduzir={false}
          {...props}
          aoAlternar={aoAlternar}
        >
          {filhos}
        </ItemDeTarefa>
      </ProvedorDeTema>,
    );
  });
  return { aoAlternar };
}

function oResumo(id = "uma") {
  return screen.getByTestId(`escolher-${id}`);
}

function oItem(id = "uma") {
  return within(screen.getByTestId(`tarefa-${id}`));
}

afterEach(() => { jest.restoreAllMocks(); });

/* ============================================================
   Fechado e aberto
   ============================================================ */

describe("fechado, o item é só o resumo", () => {
  it("mostra protocolo, severidade por extenso e endereço, e nada do detalhe", async () => {
    await montar({}, <View testID="acoes-da-tela" />);

    expect(oItem().getByText("000471/2026")).toBeTruthy();
    expect(oItem().getByLabelText("Severidade alta")).toBeTruthy();
    expect(oItem().getByText(/Servidão do Morro, 45/)).toBeTruthy();
    /* O detalhe (prazo, referência, onde fica) e o que a tela põe dentro
       (os botões) não existem enquanto o item está fechado. */
    expect(oItem().queryByText(/Vence em/)).toBeNull();
    expect(oItem().queryByText(/Referência:/)).toBeNull();
    expect(oItem().queryByTestId("acoes-da-tela")).toBeNull();
    expect(oResumo().props.accessibilityState).toMatchObject({ expanded: false, selected: false });
  });

  it("o endereço fica numa linha só, e se solta quando abre", async () => {
    await montar();
    expect(oItem().getByText(/Servidão do Morro/).props.numberOfLines).toBe(1);

    await montar({ aberto: true });
    expect(oItem().getByText(/Servidão do Morro/).props.numberOfLines).toBeUndefined();
  });
});

describe("aberto, o detalhe aparece embaixo do resumo", () => {
  it("mostra o prazo com data e ícone, a referência, e o que a tela pôs dentro", async () => {
    await montar({ aberto: true }, <View testID="acoes-da-tela" />);

    expect(oItem().getByText("Vence em 9h")).toBeTruthy();
    expect(oItem().getByText(/^\d{2}\/\d{2}, \d{2}:\d{2}$/)).toBeTruthy();
    expect(oItem().getByText("Referência: Portão verde, em frente ao poste")).toBeTruthy();
    expect(oItem().getByTestId("acoes-da-tela")).toBeTruthy();
    expect(oResumo().props.accessibilityState).toMatchObject({ expanded: true, selected: true });
  });

  it("o detalhe é IRMÃO do tocável, e não filho dele", async () => {
    /*
      Um `Pressable` com rótulo é um elemento só para o leitor de tela: botões
      dentro dele ficam inalcançáveis por voz. O que a tela põe no detalhe
      precisa estar FORA do resumo tocável.
    */
    await montar({ aberto: true }, <View testID="acoes-da-tela" />);
    expect(within(oResumo()).queryByTestId("acoes-da-tela")).toBeNull();
    expect(oItem().getByTestId("acoes-da-tela")).toBeTruthy();
  });

  it("o título da tela, quando há, abre o detalhe", async () => {
    await montar({ aberto: true, titulo: "Deslizamento" });
    expect(oItem().getByText("Deslizamento")).toBeTruthy();

    await montar({ aberto: false, titulo: "Deslizamento" });
    expect(oItem().queryByText("Deslizamento")).toBeNull();
  });

  it("com posição e coordenada, diz a distância e o rumo; sem, diz que não sabe", async () => {
    await montar({ aberto: true, agente: AQUI, metros: 3_000, tarefa: tarefa(aoNorte(3_000)) });
    expect(oItem().getByText(/3,0 km a norte de onde você está/)).toBeTruthy();
    expect(oItem().getByText("a 3,0 km de você")).toBeTruthy();

    await montar({ aberto: true, agente: null, tarefa: tarefa(aoNorte(3_000)) });
    expect(oItem().getByText(/Sem GPS: sem distância e sem rumo/)).toBeTruthy();

    await montar({ aberto: true, agente: AQUI, tarefa: tarefa() });
    expect(oItem().getByText(/não informou onde fica este imóvel/)).toBeTruthy();
  });

  it("o toque no resumo chama quem alterna, e só isso", async () => {
    const { aoAlternar } = await montar();
    await act(async () => { fireEvent.press(oResumo()); });
    expect(aoAlternar).toHaveBeenCalledTimes(1);
  });
});

/* ============================================================
   Os estados que o resumo carrega
   ============================================================ */

describe("os estados no resumo, com ícone mais palavra", () => {
  it("o selo da coleta é um chip, e entra no rótulo", async () => {
    await montar({ selo: "Coletada, aguardando envio" });
    expect(oItem().getByText("Coletada, aguardando envio")).toBeTruthy();
    expect(String(oResumo().props.accessibilityLabel)).toContain("Coletada, aguardando envio");
  });

  it("a vistoria começada é dita, e o selo da coleta vence quando os dois existem", async () => {
    await montar({ comecada: true });
    expect(oItem().getByText("Vistoria começada")).toBeTruthy();
    expect(String(oResumo().props.accessibilityLabel)).toContain("Vistoria começada");

    await montar({ comecada: true, selo: "Coletada, aguardando envio" });
    expect(oItem().queryByText("Vistoria começada")).toBeNull();
    expect(oItem().getByText("Coletada, aguardando envio")).toBeTruthy();
  });

  it("a vulnerabilidade social aparece por extenso e chega a quem ouve", async () => {
    await montar({ vulneravel: true });
    expect(oItem().getByText("Vulnerabilidade social")).toBeTruthy();
    expect(String(oResumo().props.accessibilityLabel)).toContain("Vulnerabilidade social");

    await montar({ vulneravel: false });
    expect(oItem().queryByText("Vulnerabilidade social")).toBeNull();
  });

  it("o cabeçalho da tela vai no resumo, e as palavras dele no rótulo", async () => {
    await montar({
      cabecalho: <View testID="comece-por-aqui" />,
      cabecalhoEmPalavras: "Comece por aqui: severidade alta.",
    });
    expect(within(oResumo()).getByTestId("comece-por-aqui")).toBeTruthy();
    expect(String(oResumo().props.accessibilityLabel)).toContain("Comece por aqui: severidade alta.");
  });
});

describe("o rótulo composto, na ordem em que se decide", () => {
  it("diz qual, quão grave, onde, a que distância, quando vence, e se está aberto", async () => {
    await montar({ metros: 401 });
    const rotulo = String(oResumo().props.accessibilityLabel);
    const posicao = (trecho: string) => rotulo.indexOf(trecho);

    expect(posicao("Protocolo 000471/2026")).toBe(0);
    expect(posicao("severidade alta")).toBeGreaterThan(posicao("Protocolo"));
    expect(posicao("Servidão do Morro")).toBeGreaterThan(posicao("severidade alta"));
    expect(posicao("a 401 m de você")).toBeGreaterThan(posicao("Servidão do Morro"));
    expect(posicao("Vence em 9h")).toBeGreaterThan(posicao("a 401 m de você"));
    expect(rotulo).toMatch(/Recolhido, toque para ver as ações$/);

    await montar({ aberto: true });
    expect(String(oResumo().props.accessibilityLabel)).toMatch(/Expandido, mostrando as ações$/);
  });

  it("sem classificação, o rótulo diz isso em vez de calar", async () => {
    await montar({ tarefa: tarefa({ severidade: null }) });
    expect(String(oResumo().props.accessibilityLabel)).toContain("severidade ainda não classificada");
  });
});

/* ============================================================
   O movimento
   ============================================================ */

describe("a seta e o detalhe, e o que anima quando", () => {
  it("montar fechado não anima nada: a seta só vira na MUDANÇA", async () => {
    /*
      Cada item de uma lista de doze montava uma animação de zero para zero na
      chegada. Não se via, e custava: numa `FlatList` o item monta e desmonta
      conforme rola, e cada montagem era um `Animated.timing` à toa.
    */
    const espiao = jest.spyOn(Animated, "timing");
    await montar();
    expect(espiao).not.toHaveBeenCalled();
  });

  it("abrir gira a seta e pinta o detalhe, com duração de token e driver nativo", async () => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar();
    expect(espiao).not.toHaveBeenCalled();

    /* Remontar com `aberto` trocado não serve: seria uma segunda montagem.
       A peça precisa ver a MESMA instância mudar de estado. */
    await act(async () => {
      screen.rerender(
        <ProvedorDeTema>
          <ItemDeTarefa
            tarefa={tarefa()} aberto agora={AGORA} agente={null} metros={null}
            selo={null} reduzir={false} aoAlternar={() => {}}
          />
        </ProvedorDeTema>,
      );
    });

    expect(espiao).toHaveBeenCalled();
    for (const chamada of espiao.mock.calls) {
      const config = chamada[1] as { duration?: number; useNativeDriver?: boolean };
      expect(config.duration).toBe(movimento.mudancaDeEstado);
      expect(config.useNativeDriver).toBe(true);
    }
  });

  it("com redução de movimento, abrir não anima: o detalhe aparece direto", async () => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar({ reduzir: true });
    await act(async () => {
      screen.rerender(
        <ProvedorDeTema>
          <ItemDeTarefa
            tarefa={tarefa()} aberto agora={AGORA} agente={null} metros={null}
            selo={null} reduzir aoAlternar={() => {}}
          >
            <View testID="acoes-da-tela" />
          </ItemDeTarefa>
        </ProvedorDeTema>,
      );
    });
    expect(oItem().getByTestId("acoes-da-tela")).toBeTruthy();
    expect(espiao).not.toHaveBeenCalled();
  });

  it("na primeira pintura da tela, o item que já nasce aberto não anima o detalhe", async () => {
    /*
      A lista de tarefas abre com a sugerida do dia aberta, e a primeira
      pintura daquela tela não anima nada: vinte itens entrando ao mesmo tempo
      é o engasgo que o `CLAUDE.md` proíbe, e a lista abrindo não é nada
      chegando. O detalhe da sugerida obedece à mesma regra.
    */
    const espiao = jest.spyOn(Animated, "timing");
    await montar({ aberto: true, primeiraPintura: true }, <View testID="acoes-da-tela" />);
    expect(oItem().getByTestId("acoes-da-tela")).toBeTruthy();
    expect(espiao).not.toHaveBeenCalled();
  });

  it("fora da primeira pintura, nascer aberto pinta o detalhe em transição", async () => {
    const espiao = jest.spyOn(Animated, "timing");
    await montar({ aberto: true });
    expect(espiao).toHaveBeenCalled();
  });
});

/* ============================================================
   A página
   ============================================================ */

describe("o rodapé da página", () => {
  it("diz quantas estão na lista e oferece mostrar mais, no número certo", async () => {
    const aoMostrarMais = jest.fn();
    await act(async () => {
      await render(
        <ProvedorDeTema>
          <RodapeDaPagina visiveis={5} total={12} aoMostrarMais={aoMostrarMais} />
        </ProvedorDeTema>,
      );
    });
    expect(screen.getByText(/5 de 12/)).toBeTruthy();
    expect(within(screen.getByTestId("mostrar-mais")).getByText("Mostrar mais 5")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("mostrar-mais")); });
    expect(aoMostrarMais).toHaveBeenCalledTimes(1);
  });

  it("quando faltam menos que uma página, o botão diz o que falta; no fim, some", async () => {
    await act(async () => {
      await render(
        <ProvedorDeTema>
          <RodapeDaPagina visiveis={10} total={12} aoMostrarMais={() => {}} />
        </ProvedorDeTema>,
      );
    });
    expect(within(screen.getByTestId("mostrar-mais")).getByText("Mostrar mais 2")).toBeTruthy();

    await act(async () => {
      await render(
        <ProvedorDeTema>
          <RodapeDaPagina visiveis={12} total={12} aoMostrarMais={() => {}} />
        </ProvedorDeTema>,
      );
    });
    expect(screen.queryByTestId("mostrar-mais")).toBeNull();
    expect(screen.queryByText(/12 de 12/)).toBeNull();
  });
});

/* ============================================================
   As funções puras da sanfona
   ============================================================ */

describe("qual item está aberto", () => {
  const lista = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const sugerida = lista[0]!;

  it("'sugerida' resolve para a sugerida do dia, e 'nenhuma' para ninguém", () => {
    expect(itemAberto("sugerida", lista, sugerida)).toBe(sugerida);
    expect(itemAberto("sugerida", [], null)).toBeNull();
    expect(itemAberto("nenhuma", lista, sugerida)).toBeNull();
  });

  it("um id que está na lista resolve para ele; um que saiu volta para a sugerida", () => {
    expect(itemAberto({ id: "b" }, lista, sugerida)?.id).toBe("b");
    /* A coordenação encerrou, outra equipe pegou: a tela não fala de uma
       casa que não é mais da conta dele. */
    expect(itemAberto({ id: "sumiu" }, lista, sugerida)).toBe(sugerida);
  });
});

describe("o que o toque faz com a escolha", () => {
  const lista = [{ id: "a" }, { id: "b" }];
  const sugerida = lista[0]!;

  it("tocar num item fechado abre ele; tocar no aberto recolhe", () => {
    expect(alternarEscolha("sugerida", "b", lista, sugerida)).toEqual({ id: "b" });
    expect(alternarEscolha("sugerida", "a", lista, sugerida)).toBe("nenhuma");
    expect(alternarEscolha({ id: "b" }, "b", lista, sugerida)).toBe("nenhuma");
    expect(alternarEscolha("nenhuma", "a", lista, sugerida)).toEqual({ id: "a" });
  });

  it("com a escolhida fora da lista, o que está aberto é a sugerida, e é ela que o toque recolhe", () => {
    const antes: Escolha = { id: "sumiu" };
    expect(alternarEscolha(antes, "a", lista, sugerida)).toBe("nenhuma");
  });
});

describe("quantos itens a página mostra", () => {
  it("uma página, ou até o item aberto, e nunca mais que a lista", () => {
    expect(quantasMostrar(12, TAMANHO_DA_PAGINA, 0)).toBe(TAMANHO_DA_PAGINA);
    expect(quantasMostrar(12, TAMANHO_DA_PAGINA, 8)).toBe(9);
    expect(quantasMostrar(3, TAMANHO_DA_PAGINA, -1)).toBe(3);
    expect(quantasMostrar(12, 10, -1)).toBe(10);
  });
});
