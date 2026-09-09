import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Assinatura } from "./Assinatura";
import { MinutaDoLaudo } from "./MinutaDoLaudo";
import { ProvedorDeTema } from "./componentes";
import type { Minuta } from "@dc360/shared";

/**
 * O que estes testes protegem: a assinatura do morador aparecer no laudo.
 *
 * O defeito real, encontrado no teste de campo de 08/09/2026. O quadro de
 * assinatura desenhava o traço com `tema.texto`, que no tema escuro é
 * `#ECF1F4`, quase branco. `toDataURL` rasteriza exatamente o que está
 * desenhado, o PNG saía com traço branco em fundo transparente, e o laudo
 * imprime esse PNG sobre papel `#FFFFFF`. A assinatura, que é a prova de que o
 * morador estava no local quando a casa foi interditada, ficava invisível no
 * documento. Na tela escura do agente o traço aparecia perfeitamente, então
 * nada reclamava.
 *
 * Por isso os testes NÃO conferem se a cor é igual a um token: conferem a
 * RAZÃO DE CONTRASTE, calculada, entre o que o componente realmente renderiza
 * e o papel branco do laudo. Trocar o traço de volta para `tema.texto` reprova
 * aqui, e trocar por qualquer outro tom claro também.
 *
 * E a cor é lida do elemento nativo, DEPOIS de o react-native-svg processar,
 * onde ela já é o inteiro ARGB que vai para o rasterizador. É o mesmo número
 * que decide o pixel do PNG, então a leitura inclui o canal alfa: cor
 * translúcida reprova sem precisar de asserção separada.
 */

/*
  O esquema do aparelho vira variável do teste.

  O nome precisa começar com "mock" porque a fábrica do `jest.mock` é içada
  para antes das declarações do arquivo, e só esse prefixo é liberado.
*/
let mockEsquemaDoAparelho: "light" | "dark" = "dark";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquemaDoAparelho,
}));

/*
  O `Svg` ganha um `toDataURL` de mentira, controlado pelo teste.

  Fora do aparelho não existe rasterizador, e `ref.current.toDataURL` seria
  `undefined`: o caminho do tempo limite nunca seria exercitado. Só o `Svg` é
  substituído; `Path` e `Rect` continuam os de verdade, porque é deles que os
  testes leem as cores que vão para o PNG.
*/
let mockRasterizador: (devolver: (dados: string) => void) => void = () => {};
jest.mock("react-native-svg", () => {
  const real = jest.requireActual("react-native-svg");
  const React = require("react");
  const SvgDeVerdade = real.default ?? real.Svg;
  const SvgComRasterizador = React.forwardRef(
    (props: Record<string, unknown>, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({
        toDataURL: (devolver: (dados: string) => void) => mockRasterizador(devolver),
      }));
      return React.createElement(SvgDeVerdade, props);
    },
  );
  return { ...real, __esModule: true, default: SvgComRasterizador, Svg: SvgComRasterizador };
});

/* ============================================================
   Contraste, calculado e não declarado
   ============================================================ */

type Cor = { r: number; g: number; b: number };

/** Nível AA. Vale para texto e para traço fino, que é o caso da assinatura. */
const AA = 4.5;

/**
 * Cor de folha de estilo do React Native, e nada além de hexadecimal opaco.
 *
 * Recusar `rgba()` e hexadecimal de oito dígitos é o comportamento certo, e
 * não um limite do leitor: transparência num artefato de documento faz o traço
 * depender do que estiver atrás dele no visualizador de quem abrir o laudo.
 */
function corDeEstilo(texto: unknown): Cor {
  if (typeof texto !== "string") throw new Error(`cor ausente: ${String(texto)}`);
  const hex = /^#([0-9a-fA-F]{6})$/.exec(texto.trim());
  if (!hex) throw new Error(`cor translúcida ou ilegível num artefato de documento: ${texto}`);
  const d = hex[1]!;
  return {
    r: parseInt(d.slice(0, 2), 16),
    g: parseInt(d.slice(2, 4), 16),
    b: parseInt(d.slice(4, 6), 16),
  };
}

/**
 * A cor já processada que o react-native-svg entrega ao elemento nativo.
 *
 * Chega como `{ type: 0, payload: <inteiro ARGB> }`. Ler daqui, e não da
 * propriedade que o componente escreveu, é o ponto do teste: este é o número
 * que o rasterizador usa para pintar o pixel do PNG que entra no laudo.
 *
 * `type` diferente de zero é gradiente ou padrão, que não é cor sólida e não
 * tem contraste calculável: num documento oficial isso é erro, não escolha.
 */
function corDoDesenho(valor: unknown): Cor {
  const bruto = valor as { type?: number; payload?: number } | null | undefined;
  if (!bruto || typeof bruto.payload !== "number") {
    throw new Error(`cor de desenho ausente: ${JSON.stringify(valor)}`);
  }
  if (bruto.type !== 0) {
    throw new Error(`o traço do documento precisa ser cor sólida, veio tipo ${bruto.type}`);
  }
  const argb = bruto.payload >>> 0;
  const alfa = (argb >>> 24) & 0xff;
  if (alfa !== 0xff) {
    throw new Error(`cor translúcida no artefato de documento: alfa ${alfa} de 255`);
  }
  return { r: (argb >>> 16) & 0xff, g: (argb >>> 8) & 0xff, b: argb & 0xff };
}

function luminancia(c: Cor): number {
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

function contraste(frente: Cor, fundo: Cor): number {
  const a = luminancia(frente);
  const b = luminancia(fundo);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro! + 0.05) / (escuro! + 0.05);
}

/** O papel do laudo emitido, em `apps/api/src/documentos/folha.ts`. */
const PAPEL_DO_LAUDO: Cor = { r: 255, g: 255, b: 255 };

/* ============================================================
   Ferramentas de cena
   ============================================================ */

const LARGURA_MEDIDA = 320;
const OS_DOIS_TEMAS: Array<"light" | "dark"> = ["light", "dark"];

type Elemento = ReturnType<typeof screen.getByTestId>;

async function montarQuadroDeAssinatura(esquema: "light" | "dark") {
  mockEsquemaDoAparelho = esquema;
  const aoConfirmar = jest.fn();
  await render(
    <ProvedorDeTema>
      <Assinatura aoConfirmar={aoConfirmar} aoLimpar={jest.fn()} jaAssinada={false} />
    </ProvedorDeTema>,
  );
  const quadro = screen.getByTestId("quadro-de-assinatura");
  /*
    `onLayout` não dispara sozinho fora do aparelho, e sem ele a largura fica
    zero. Disparar aqui é o que o aparelho faz na primeira pintura, e é o que
    dá tamanho em pixels ao SVG.
  */
  await fireEvent(quadro, "layout", {
    nativeEvent: { layout: { width: LARGURA_MEDIDA, height: 180, x: 0, y: 0 } },
  });
  return { quadro, aoConfirmar };
}

/**
 * Um toque, do jeito EXATO que o `PanResponder` recebe.
 *
 * O `touchHistory` vem completo de propósito: o `PanResponder` de verdade
 * calcula o centroide do gesto lendo o `touchBank`, e estoura com ele vazio ou
 * com o índice errado. Um evento pela metade exercitaria um caminho que o
 * aparelho nunca executa.
 *
 * Fica num lugar só porque duas cópias divergem, e a segunda cópia deste
 * objeto já custou meia hora antes de existir esta função.
 */
let relogioDoToque = 1000;
function toque(x: number, y: number) {
  relogioDoToque += 16;
  const instante = relogioDoToque;
  const ponto = {
    locationX: x, locationY: y, pageX: x, pageY: y,
    identifier: 1, target: 1, timestamp: instante,
  };
  return {
    nativeEvent: { ...ponto, touches: [ponto], changedTouches: [ponto] },
    touchHistory: {
      touchBank: [{
        touchActive: true,
        startPageX: x, startPageY: y, startTimeStamp: instante,
        currentPageX: x, currentPageY: y, currentTimeStamp: instante,
        previousPageX: x, previousPageY: y, previousTimeStamp: instante,
      }],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: instante,
    },
  };
}

async function assinarComODedo(quadro: Elemento): Promise<void> {
  await fireEvent(quadro, "responderGrant", toque(24, 120));
  await fireEvent(quadro, "responderMove", toque(90, 60));
  await fireEvent(quadro, "responderMove", toque(160, 130));
  await fireEvent(quadro, "responderRelease", toque(160, 130));
}

beforeEach(() => {
  mockEsquemaDoAparelho = "dark";
  mockRasterizador = () => {};
});

/* ============================================================
   O traço
   ============================================================ */

describe("o traço da assinatura contra o papel do laudo", () => {
  it.each(OS_DOIS_TEMAS)(
    "no tema %s, tem contraste AA sobre papel branco",
    async (esquema) => {
      const { quadro } = await montarQuadroDeAssinatura(esquema);
      await assinarComODedo(quadro);

      const tracos = screen.getAllByTestId("traco-da-assinatura");
      expect(tracos.length).toBeGreaterThan(0);

      for (const traco of tracos) {
        const cor = corDoDesenho(traco.props.stroke);
        expect(contraste(cor, PAPEL_DO_LAUDO)).toBeGreaterThanOrEqual(AA);
      }
    },
  );

  it("o traço é a mesma cor nos dois temas, porque papel não tem modo escuro", async () => {
    const cores: string[] = [];
    for (const esquema of OS_DOIS_TEMAS) {
      const { quadro } = await montarQuadroDeAssinatura(esquema);
      await assinarComODedo(quadro);
      cores.push(JSON.stringify(corDoDesenho(
        screen.getAllByTestId("traco-da-assinatura")[0]!.props.stroke,
      )));
      await screen.unmount();
    }
    expect(new Set(cores).size).toBe(1);
  });
});

/* ============================================================
   O fundo do quadro
   ============================================================ */

describe("o fundo do quadro de captura", () => {
  it.each(OS_DOIS_TEMAS)(
    "no tema %s, é claro e opaco DENTRO do SVG, que é o que vira PNG",
    async (esquema) => {
      const { quadro } = await montarQuadroDeAssinatura(esquema);
      await assinarComODedo(quadro);

      /*
        O retângulo dentro do SVG, e não o `backgroundColor` do `View`.

        `toDataURL` rasteriza o SVG e mais nada: o fundo do `View` fica de fora
        do arquivo. Sem este retângulo o PNG sai transparente, que é metade do
        defeito original.
      */
      const papeis = screen.getAllByTestId("papel-da-assinatura");
      expect(papeis.length).toBe(1);
      const papelDaTela = papeis[0]!;

      /* `corDoDesenho` estoura se o alfa não for 255: opacidade reprova aqui. */
      const fundo = corDoDesenho(papelDaTela.props.fill);
      expect(luminancia(fundo)).toBeGreaterThan(0.5);
      expect(papelDaTela.props.fillOpacity ?? 1).toBe(1);
      expect(papelDaTela.props.opacity ?? 1).toBe(1);

      /* E o traço precisa ser legível contra ele, não só contra o papel. */
      const traco = corDoDesenho(screen.getAllByTestId("traco-da-assinatura")[0]!.props.stroke);
      expect(contraste(traco, fundo)).toBeGreaterThanOrEqual(AA);

      /* O retângulo cobre o quadro inteiro, senão sobra transparência na borda. */
      expect(papelDaTela.props.width).toBe(LARGURA_MEDIDA);
      expect(papelDaTela.props.x).toBe(0);
      expect(papelDaTela.props.y).toBe(0);

      /* E a moldura na tela acompanha, para o agente ver o papel que vai sair. */
      const moldura = corDeEstilo(quadro.props.style.backgroundColor);
      expect(contraste(moldura, fundo)).toBeLessThan(1.1);
    },
  );

  it("o SVG recebe largura medida em pixels, e não porcentagem", async () => {
    const { quadro } = await montarQuadroDeAssinatura("dark");
    /*
      Em parte dos aparelhos Android o `toDataURL` rasteriza errado quando a
      largura do SVG é percentual: a tela acerta e o PNG sai cortado. O defeito
      só aparece no laudo, quando já não dá para chamar o morador de volta.
    */
    const tela = screen.getByTestId("tela-de-assinatura");
    expect(typeof tela.props.width).toBe("number");
    expect(tela.props.width).toBe(LARGURA_MEDIDA);
    expect(quadro.props.style.overflow).toBe("hidden");
  });
});

/* ============================================================
   O tempo limite da gravação
   ============================================================ */

describe("a gravação do PNG", () => {
  it("desiste depois de 8 segundos, explica em português e destrava o botão", async () => {
    jest.useFakeTimers();
    try {
      /* O rasterizador que recebe o callback e nunca chama de volta. */
      mockRasterizador = () => {};
      const { quadro, aoConfirmar } = await montarQuadroDeAssinatura("dark");
      await assinarComODedo(quadro);

      const botao = screen.getByLabelText("Confirmar assinatura");
      await fireEvent.press(botao);
      /*
        Antes do teto, o estado ficava exatamente assim para sempre: o botão
        ocupado, o morador parado esperando para assinar e nenhuma explicação.
      */
      expect(botao.props.accessibilityState.busy).toBe(true);

      await act(async () => { jest.advanceTimersByTime(8000); });

      expect(screen.getByText(/não respondeu ao gerar a imagem da assinatura/i)).toBeTruthy();
      expect(screen.getByLabelText("Confirmar assinatura").props.accessibilityState.busy)
        .toBe(false);
      expect(aoConfirmar).not.toHaveBeenCalled();
      /* O traço continua na tela: o defeito é do aparelho, não do morador. */
      expect(screen.getAllByTestId("traco-da-assinatura").length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("não desiste quando o aparelho responde dentro do tempo", async () => {
    jest.useFakeTimers();
    try {
      mockRasterizador = (devolver) => devolver("data:image/png;base64,QUJD");
      const { quadro, aoConfirmar } = await montarQuadroDeAssinatura("dark");
      await assinarComODedo(quadro);

      await fireEvent.press(screen.getByLabelText("Confirmar assinatura"));
      await act(async () => { jest.advanceTimersByTime(8000); });

      expect(aoConfirmar).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/não respondeu/i)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

/* ============================================================
   A minuta que o agente vira para o morador ler
   ============================================================ */

const MINUTA: Minuta = {
  titulo: "Laudo de vistoria",
  protocolo: "2026-000123",
  aviso: "MINUTA. Este documento ainda não foi emitido.",
  cabecalho: {
    orgao: "Coordenadoria Municipal de Proteção e Defesa Civil",
    municipio: "Serra Alta",
    uf: "SP",
  },
  secoes: [
    {
      tipo: "campos",
      titulo: "Identificação",
      linhas: [{ rotulo: "Endereço", valor: "Rua das Palmeiras, 120", mono: false }],
    },
    { tipo: "texto", titulo: "Relato", corpo: "Trinca em talude a montante da edificação." },
    {
      tipo: "checklist",
      titulo: "Verificações",
      itens: [{ rotulo: "Há risco iminente de colapso", resposta: true }],
    },
  ],
};

async function montarMinutaNaTela(esquema: "light" | "dark"): Promise<void> {
  mockEsquemaDoAparelho = esquema;
  await render(
    <ProvedorDeTema>
      <MinutaDoLaudo minuta={MINUTA} />
    </ProvedorDeTema>,
  );
}

describe("a minuta que o agente vira para o morador ler", () => {
  it.each(OS_DOIS_TEMAS)("no tema %s, a folha é papel claro e opaco", async (esquema) => {
    await montarMinutaNaTela(esquema);
    /*
      No tema escuro esta folha era um cartão escuro com texto claro: o morador
      olhava e não via documento nenhum, que é o efeito para o qual a tela
      existe.
    */
    const folha = screen.getByTestId("folha-da-minuta");
    const fundo = corDeEstilo(folha.props.style.backgroundColor);
    expect(luminancia(fundo)).toBeGreaterThan(0.5);

    const titulo = screen.getByText("Laudo de vistoria");
    expect(contraste(corDeEstilo(titulo.props.style.color), fundo)).toBeGreaterThanOrEqual(AA);

    const rotulo = screen.getByText("Endereço");
    expect(contraste(corDeEstilo(rotulo.props.style.color), fundo)).toBeGreaterThanOrEqual(AA);
  });

  it("a folha é a mesma cor nos dois temas", async () => {
    const cores: string[] = [];
    for (const esquema of OS_DOIS_TEMAS) {
      await montarMinutaNaTela(esquema);
      cores.push(screen.getByTestId("folha-da-minuta").props.style.backgroundColor as string);
      await screen.unmount();
    }
    expect(new Set(cores).size).toBe(1);
  });
});

/* ============================================================
   O gesto: a tela rolava e o agente não conseguia assinar
   ============================================================

   Defeito relatado no primeiro uso em aparelho real, em 08/09/2026: "onde pede
   a assinatura está rolando a tela, e o usuário não consegue assinar".

   Causa: o PanResponder do quadro não usava a fase de CAPTURA, então o
   ScrollView que embrulha a tela de vistoria avaliava o movimento primeiro e
   reivindicava o gesto assim que o dedo passava do limiar de rolagem. Num
   traço de assinatura isso acontece em milímetros.

   A disputa em si é do sistema operacional, e só o aparelho responde. O que dá
   para provar aqui é o contrato que desliga o ScrollView, e que ele avisa uma
   vez no início e uma no fim.
*/
describe("o quadro de assinatura contra a rolagem da tela", () => {
  async function montarComAvisos() {
    mockEsquemaDoAparelho = "dark";
    const aoComecar = jest.fn();
    const aoTerminar = jest.fn();
    await render(
      <ProvedorDeTema>
        <Assinatura
          jaAssinada={false}
          aoConfirmar={jest.fn()}
          aoLimpar={jest.fn()}
          aoComecarDesenho={aoComecar}
          aoTerminarDesenho={aoTerminar}
        />
      </ProvedorDeTema>,
    );
    return { aoComecar, aoTerminar, quadro: screen.getByTestId("quadro-de-assinatura") };
  }

  it("reivindica o gesto na fase de captura, antes de o ScrollView opinar", async () => {
    const { quadro } = await montarComAvisos();
    const props = quadro.props as Record<string, (e: unknown) => boolean>;
    expect(props["onStartShouldSetResponderCapture"]!(toque(10, 10))).toBe(true);
    expect(props["onMoveShouldSetResponderCapture"]!(toque(12, 14))).toBe(true);
    await screen.unmount();
  });

  it("recusa entregar o gesto ao pai no meio do traço", async () => {
    const { quadro } = await montarComAvisos();
    const props = quadro.props as Record<string, (e: unknown) => boolean>;
    // Entregar o gesto ao pai corta a assinatura ao meio.
    expect(props["onResponderTerminationRequest"]!(toque(10, 10))).toBe(false);
    await screen.unmount();
  });

  it("avisa uma vez ao encostar e uma vez ao soltar", async () => {
    const { aoComecar, aoTerminar, quadro } = await montarComAvisos();
    await fireEvent(quadro, "responderGrant", toque(10, 10));
    expect(aoComecar).toHaveBeenCalledTimes(1);
    expect(aoTerminar).not.toHaveBeenCalled(); // ainda desenhando

    await fireEvent(quadro, "responderRelease", toque(40, 30));
    expect(aoTerminar).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("o movimento NÃO avisa de novo: o ScrollView não pode remontar por quadro", async () => {
    const { aoComecar, quadro } = await montarComAvisos();
    await fireEvent(quadro, "responderGrant", toque(10, 10));
    for (let i = 0; i < 20; i += 1) {
      await fireEvent(quadro, "responderMove", toque(10 + i, 20));
    }
    expect(aoComecar).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("interrupção do sistema encerra o traço igual a soltar o dedo", async () => {
    // Ligação entrando, ou central de notificações puxada. Sem tratar, o traço
    // em curso some e o quadro fica num estado em que não está vazio e não tem
    // traço nenhum na lista.
    const { aoTerminar, quadro } = await montarComAvisos();
    await fireEvent(quadro, "responderGrant", toque(10, 10));
    await fireEvent(quadro, "responderTerminate", toque(10, 10));
    expect(aoTerminar).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });
});
