import { AccessibilityInfo, Animated, ScrollView, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { CHAVE_ACIONAR_ORGAO, CHECKLIST_OBRIGATORIO } from "@dc360/shared";
import { faltaParaConcluir } from "@dc360/campo";
import type { Pendencia } from "../dados/api";
import { salvarRascunho } from "../dados/rascunho";
import { DEMORA_MS } from "../ui/componentes";
import { temaEscuro, toque } from "../ui/tokens";
import TelaDeVistoria, {
  requisitosDeConclusao, secaoDaFalta,
} from "../app/(agente)/vistoria/[id]";

/**
 * A vistoria vista como PRODUTO, e não como formulário que funciona.
 *
 * A tela já fazia tudo o que precisa fazer: grava a cada toque, não perde
 * trabalho, não toca na rede e produz o laudo. Aberta no aparelho, em 13/09, ela
 * foi reprovada por outra razão, e a reclamação de origem é visual.
 *
 * Os oito defeitos que este arquivo trava, todos levantados com o telefone na
 * mão e todos confirmados no código:
 *
 * 1. Existia UM indicador de progresso, em legenda cinza de 12 pontos, e ele
 *    cobria só os itens obrigatórios do checklist. Fotografia, órgão, nome de
 *    quem assina e traço da assinatura não tinham contador nenhum.
 * 2. "Falta X, Y e Z" era uma frase corrida de até cinco cláusulas, no FIM de
 *    uma rolagem de dois mil pontos. O agente lia e subia a tela procurando onde.
 * 3. A tarja de erro era o destino de seis falhas diferentes e morava dentro da
 *    rolagem. Um erro de GPS disparado no cartão da localização era desenhado
 *    onde ninguém estava olhando.
 * 4. Tirar foto não dava retorno nenhum: a câmera fechava e a miniatura estava
 *    lá, sem flash, sem som e sem movimento.
 * 5. Apagar foto era imediato e irreversível, enquanto descartar item da fila,
 *    que é menos grave, já perguntava.
 * 6. A conclusão terminava no mesmo diálogo de "Sair da conta?".
 * 7. A falha de abertura era uma tarja vermelha órfã, sem título e sem saída.
 * 8. `Carregando` não recebia `aoDesistir`, o que desliga metade dele.
 *
 * O arquivo mora em `__tests__` e não ao lado da tela porque tudo dentro de
 * `src/app` vira ROTA no Expo: um teste ali seria uma tela navegável dentro do
 * aplicativo publicado.
 */

/* ============================================================
   O aparelho, de mentira
   ============================================================ */

jest.mock("expo-router", () => {
  const navegacao = { setOptions: jest.fn() };
  return {
    router: {
      back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true),
    },
    useLocalSearchParams: () => ({ id: "oc-1" }),
    useNavigation: () => navegacao,
  };
});

/**
 * A câmera precisa devolver uma FOTO, e as outras suítes desta tela não
 * precisavam: elas mockam `CameraView` como `() => null`, o que é suficiente
 * para nunca fotografar. Aqui o obturador é o assunto, então o mock encaminha
 * a referência e responde com um caminho de cache, que é o que o aparelho faz.
 */
const mockTirarFoto = jest.fn(async () => ({ uri: "file:///cache/foto.jpg" }));
jest.mock("expo-camera", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { forwardRef, useImperativeHandle } = require("react") as typeof import("react");
  return {
    CameraView: forwardRef((_props: Record<string, unknown>, ref) => {
      useImperativeHandle(ref, () => ({ takePictureAsync: () => mockTirarFoto() }));
      return null;
    }),
    useCameraPermissions: () => [
      { granted: true }, jest.fn(async () => ({ granted: true })),
    ],
  };
});

const mockPermissaoDeLocal = jest.fn(async () => ({ granted: false }));
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: () => mockPermissaoDeLocal(),
  getCurrentPositionAsync: jest.fn(),
}));

/* Cada foto precisa de chave própria: chave repetida colapsaria as duas em
   uma, e o caso das duas fotos deixaria de provar o que se propõe. */
let mockContadorDeChaves = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `chave-${++mockContadorDeChaves}`,
}));

jest.mock("expo-file-system", () => ({
  File: class { size = 1024; constructor(_uri: string) {} },
}));

/* O disco de verdade grava arquivo; o que esta suíte verifica é a TELA. */
jest.mock("../dados/evidencia-no-disco", () => ({
  guardarFotoNoAparelho: () => ({ uriLocal: "file:///vistorias/foto.jpg", tamanhoBytes: 1024 }),
}));

/*
  O motor tátil não existe no ambiente de teste, e não é ele que se mede aqui:
  o que se cobra é QUAL momento pede vibração, e quais não pedem. A ponte
  concreta com `expo-haptics` tem teste próprio em `ui/retorno-tatil.test.ts`.
*/
/*
  O quadro de assinatura vira um botão, e só nesta suíte.

  Confirmar de verdade exige o dedo desenhando no SVG e o rasterizador
  devolvendo bytes, que é o assunto de `ui/artefato-de-documento.test.tsx` e
  tem harness própria lá. O que se pergunta AQUI é o que a TELA faz quando o
  traço é aceito, e para essa pergunta o quadro é ruído. O contrato do dublê é
  o mesmo do componente: chamar `aoConfirmar` com o caminho do PNG.
*/
jest.mock("../ui/Assinatura", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Pressable, Text } = require("react-native") as typeof import("react-native");
  return {
    Assinatura: ({ aoConfirmar }: { aoConfirmar: (uri: string) => void }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Confirmar assinatura"
        onPress={() => { aoConfirmar("file:///vistorias/assinatura.png"); }}
      >
        <Text>Confirmar assinatura</Text>
      </Pressable>
    ),
  };
});

const mockRetornoTatil = jest.fn();
jest.mock("../ui/retornoTatil", () => ({
  retornoTatil: (momento: string) => mockRetornoTatil(momento),
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));
jest.mock("../dados/mapa", () => ({ abrirNoMapa: jest.fn(async () => true) }));

const OCORRENCIA: Pendencia = {
  id: "oc-1",
  protocolo: "2026/000123",
  tipo: "deslizamento",
  severidade: "alta",
  endereco: "Servidão do Morro, 45",
  ponto_referencia: null,
  latitude: -27.595378,
  longitude: -48.548050,
  descricao: "Barranco escorregou sobre os fundos da casa.",
  solicitante_nome: "Maria de exemplo",
  solicitante_contato: null,
  vulnerabilidade_presente: false,
  vulnerabilidade_descricao: null,
  prazo_em: null,
  criado_em: "2026-09-09T09:00:00.000Z",
};

/** O que `pendenciaGuardada` responde. Cada caso ajusta o que precisa. */
let mockPendencia: () => Promise<Pendencia | null> = async () => OCORRENCIA;
jest.mock("../dados/pendencias", () => ({
  pendenciaGuardada: () => mockPendencia(),
  orgaosGuardados: async () => [],
  atualizarPendencias: jest.fn(async () => {}),
}));

jest.mock("../dados/coletas", () => ({
  coletaDe: async () => null,
  marcarColetada: jest.fn(async () => {}),
  arquivarColeta: jest.fn(async () => {}),
}));

const mockEnfileirar = jest.fn(async (..._args: unknown[]) => ({}));
/* A fila precisa ser o MESMO objeto a cada chamada: uma fila nova viraria
   estado novo, que viraria renderização nova, que abriria a fila de novo. */
const mockFila = { enfileirar: (...args: unknown[]) => mockEnfileirar(...args) };
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: async () => null,
    identidade: {
      nome: "Agente de teste", matricula: "0001",
      organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
    },
  }),
}));

type RascunhoDeTeste = Record<string, unknown>;
let mockRascunhoGuardado: RascunhoDeTeste | null = null;
jest.mock("../dados/rascunho", () => ({
  lerRascunho: jest.fn(async () => mockRascunhoGuardado),
  salvarRascunho: jest.fn(async () => {}),
  descartarRascunho: jest.fn(async () => {}),
  rascunhoNovo: (ocorrenciaId: string, protocolo: string, idempotencyKey: string) => ({
    ocorrenciaId, protocolo, idempotencyKey,
    checklist: {}, orgaosParaAcionar: [], fotos: [],
    gpsPrecisaoMetros: null, coordenada: null,
    assinanteNome: "", assinaturaUri: null, observacoes: "", pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:00:00.000Z",
  }),
}));

/* ============================================================
   Utilidades
   ============================================================ */

function rascunho(mudanca: RascunhoDeTeste = {}): RascunhoDeTeste {
  return {
    ocorrenciaId: "oc-1",
    protocolo: "2026/000123",
    idempotencyKey: "chave-fixa",
    checklist: {}, orgaosParaAcionar: [], fotos: [],
    gpsPrecisaoMetros: null, coordenada: null,
    assinanteNome: "", assinaturaUri: null, observacoes: "", pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:00:00.000Z",
    ...mudanca,
  };
}

/** Todos os itens obrigatórios respondidos, sem acionar órgão nenhum. */
const CHECKLIST_COMPLETO = Object.fromEntries(
  CHECKLIST_OBRIGATORIO.map((i) => [i.chave, i.chave !== CHAVE_ACIONAR_ORGAO]),
);

const FOTO = {
  idempotencyKey: "foto-1",
  uriLocal: "file:///vistorias/foto.jpg",
  nomeArquivo: "vistoria-1.jpg",
  tipoConteudo: "image/jpeg",
  tamanhoBytes: 1024,
  capturadaEm: "2026-09-09T12:00:00.000Z",
  ordem: 0,
};

/** O rascunho em que nada mais é exigido para concluir. */
function rascunhoPronto(): RascunhoDeTeste {
  return rascunho({
    checklist: CHECKLIST_COMPLETO,
    fotos: [FOTO],
    assinanteNome: "Maria de exemplo",
    assinaturaUri: "file:///vistorias/assinatura.png",
  });
}

async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await screen.findByText("Checklist técnico");
}

function ultimoGravado(): RascunhoDeTeste {
  return jest.mocked(salvarRascunho).mock.calls.at(-1)?.[0] as unknown as RascunhoDeTeste;
}

let rolar: jest.SpyInstance;
let sequencia: jest.SpyInstance;
/**
 * Os ouvintes de `reduceMotionChanged`, um por componente montado.
 *
 * A chave de redução de movimento é do SISTEMA e muda no meio do plantão: quem
 * a liga quase sempre liga porque começou a passar mal, e este aplicativo fica
 * aberto o dia inteiro. Guardar os ouvintes é o único jeito de reproduzir isso
 * num teste, e é o que o caso da guarda do clímax precisa.
 */
let ouvintesDeReducao: Array<(ligado: boolean) => void> = [];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
  mockContadorDeChaves = 0;
  mockPendencia = async () => OCORRENCIA;
  mockRascunhoGuardado = null;
  mockPermissaoDeLocal.mockResolvedValue({ granted: false });

  /*
    A rolagem é chamada num `ref` que o teste não alcança de fora. Espionar o
    método no protótipo é o único jeito de afirmar PARA ONDE a tela rolou, e
    sem essa afirmação o caminho de cada pendência seria só um toque que não
    lança exceção.
  */
  rolar = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => {});
  sequencia = jest.spyOn(Animated, "sequence");

  ouvintesDeReducao = [];
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(
    ((evento: string, retorno: (ligado: boolean) => void) => {
      if (evento === "reduceMotionChanged") ouvintesDeReducao.push(retorno);
      return { remove: () => {} };
    }) as unknown as typeof AccessibilityInfo.addEventListener,
  );
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/* ============================================================
   1. O progresso, que cobria menos da metade dos requisitos
   ============================================================ */

describe("o progresso da vistoria", () => {
  it("conta TODOS os requisitos, e não só os do checklist", async () => {
    await abrirATela();

    /*
      Sete: os quatro itens obrigatórios do checklist mais fotografia, nome de
      quem assina e traço da assinatura. Antes desta entrega o único indicador
      da tela dizia "0 de 4", e os três últimos não apareciam em lugar nenhum
      até o botão travar no fim da rolagem.
    */
    expect(
      screen.getByTestId("barra-de-progresso").props.accessibilityLabel,
    ).toBe("0 de 7 requisitos concluídos");
  });

  it("chega ao total quando nada mais é exigido", async () => {
    mockRascunhoGuardado = rascunhoPronto();
    await abrirATela();

    expect(
      screen.getByTestId("barra-de-progresso").props.accessibilityLabel,
    ).toBe("7 de 7 requisitos concluídos");
    expect(screen.getByText("Tudo pronto")).toBeTruthy();
  });

  it("o órgão a acionar entra na conta só depois do 'sim'", async () => {
    /*
      Contá-lo sempre faria a barra nascer em "0 de 8" e nunca chegar a oito na
      vistoria em que ninguém precisa ser acionado, que é a maioria delas.
    */
    mockRascunhoGuardado = rascunho({
      checklist: { ...CHECKLIST_COMPLETO, [CHAVE_ACIONAR_ORGAO]: true },
    });
    await abrirATela();

    expect(
      screen.getByTestId("barra-de-progresso").props.accessibilityLabel,
    ).toBe("4 de 8 requisitos concluídos");
  });

  it("a barra nunca fica cheia com o botão travado", () => {
    /*
      A amarração entre as duas listas, e ela é a razão de o progresso poder
      existir sem virar uma segunda fonte da verdade.

      `faltaParaConcluir` mora no pacote compartilhado e diz o que impede a
      conclusão; `requisitosDeConclusao` mora na tela e diz o que já está
      feito, que a outra não tem como responder. Este caso exige a
      equivalência: nenhum requisito pendente se e somente se não falta nada.
      Sem ele, a barra diria "7 de 7" com o botão desabilitado no dia em que
      alguém acrescentasse uma exigência num dos dois lados.
    */
    const estados = [
      { checklist: {}, orgaosParaAcionar: [], quantasFotos: 0, assinanteNome: "", assinaturaUri: null },
      { checklist: CHECKLIST_COMPLETO, orgaosParaAcionar: [], quantasFotos: 0, assinanteNome: "", assinaturaUri: null },
      { checklist: CHECKLIST_COMPLETO, orgaosParaAcionar: [], quantasFotos: 1, assinanteNome: "", assinaturaUri: null },
      { checklist: CHECKLIST_COMPLETO, orgaosParaAcionar: [], quantasFotos: 1, assinanteNome: "Maria", assinaturaUri: null },
      { checklist: CHECKLIST_COMPLETO, orgaosParaAcionar: [], quantasFotos: 1, assinanteNome: "Maria", assinaturaUri: "file:///t.png" },
      { checklist: CHECKLIST_COMPLETO, orgaosParaAcionar: [], quantasFotos: 1, assinanteNome: "   ", assinaturaUri: "file:///t.png" },
      { checklist: { ...CHECKLIST_COMPLETO, [CHAVE_ACIONAR_ORGAO]: true }, orgaosParaAcionar: [], quantasFotos: 1, assinanteNome: "Maria", assinaturaUri: "file:///t.png" },
      { checklist: { ...CHECKLIST_COMPLETO, [CHAVE_ACIONAR_ORGAO]: true }, orgaosParaAcionar: [{ nome: "CBM" }], quantasFotos: 1, assinanteNome: "Maria", assinaturaUri: "file:///t.png" },
    ];

    for (const estado of estados) {
      const pendentes = requisitosDeConclusao(estado).filter((r) => !r.feito).length;
      const faltas = faltaParaConcluir(estado, CHECKLIST_OBRIGATORIO);
      expect([JSON.stringify(estado), pendentes === 0])
        .toEqual([JSON.stringify(estado), faltas.length === 0]);
    }
  });
});

/* ============================================================
   2. "Falta X, Y e Z" deixa de ser frase corrida
   ============================================================ */

describe("o que falta para concluir", () => {
  it("é lista, uma linha por pendência, e não uma frase com vírgulas", async () => {
    await abrirATela();

    const lista = screen.getByTestId("lista-do-que-falta");
    /*
      Quatro pendências num rascunho vazio: checklist, fotografia, nome e
      traço. A frase antiga colava as quatro com vírgula numa única tarja
      âmbar, no fim de uma rolagem de dois mil pontos.
    */
    expect(within(lista).getByText(/itens obrigatórios do checklist/)).toBeTruthy();
    expect(within(lista).getByText(/fotografia/)).toBeTruthy();
    expect(within(lista).getByText(/^informar quem estava no local$/)).toBeTruthy();
    expect(within(lista).getByText(/confirmar a assinatura/)).toBeTruthy();

    /* E em lugar nenhum da tela sobrou a frase corrida, com as quatro
       cláusulas coladas por vírgula e terminadas em ponto. */
    expect(screen.queryByText(/^Falta .*, .*\.$/)).toBeNull();
  });

  it("cada linha leva ao cartão que resolve a pendência", async () => {
    await abrirATela();

    /*
      `onLayout` não dispara sozinho em árvore de teste, e é ele que alimenta a
      âncora. Disparar à mão é o equivalente a o aparelho ter medido a tela.
    */
    await act(async () => {
      fireEvent(screen.getByTestId("ancora-fotos"), "layout", {
        nativeEvent: { layout: { x: 0, y: 1200, width: 360, height: 300 } },
      });
    });

    await fireEvent.press(screen.getByTestId("falta-fotos"));

    expect(rolar).toHaveBeenCalledTimes(1);
    expect(rolar.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ y: expect.any(Number) as number }),
    );
    expect((rolar.mock.calls[0]?.[0] as { y: number }).y).toBeGreaterThan(1000);
  });

  it("o destino acende, para o agente saber onde caiu", async () => {
    await abrirATela();

    expect(
      StyleSheet.flatten(screen.getByTestId("ancora-assinatura").props.style).borderColor,
    ).toBe("transparent");

    /*
      Duas pendências levam ao mesmo cartão (o nome de quem assina e o traço),
      então o identificador do destino aparece duas vezes de propósito: ele
      nomeia a SEÇÃO, e não a linha. Qualquer uma das duas serve para o caso.
    */
    await fireEvent.press(screen.getAllByTestId("falta-assinatura")[0]!);

    /*
      Contorno MAIS cor, nunca só cor: a espessura já está lá (`borda.enfase`) e
      o que muda é a tinta. Rolagem que acontece sozinha sem marcar o destino é
      a mesma reclamação que a lista de tarefas recebeu.
    */
    expect(
      StyleSheet.flatten(screen.getByTestId("ancora-assinatura").props.style).borderColor,
    ).toBe(temaEscuro.anelDeFoco);
  });

  it("toda pendência que o pacote sabe produzir tem caminho nesta tela", () => {
    /*
      O mapeamento casa por trecho de texto, e texto reescrito no pacote
      quebraria o caminho EM SILÊNCIO. Aqui as saídas possíveis são geradas de
      verdade, e cada uma precisa encontrar uma seção: sem este caso, a tabela
      daria verde para sempre.
    */
    const combinacoes = [
      { checklist: {}, orgaosParaAcionar: [], quantasFotos: 0, assinanteNome: "", assinaturaUri: null },
      { checklist: Object.fromEntries(CHECKLIST_OBRIGATORIO.slice(0, 3).map((i) => [i.chave, true])), orgaosParaAcionar: [], quantasFotos: 0, assinanteNome: "", assinaturaUri: null },
      { checklist: { ...CHECKLIST_COMPLETO, [CHAVE_ACIONAR_ORGAO]: true }, orgaosParaAcionar: [], quantasFotos: 0, assinanteNome: "", assinaturaUri: null },
    ];

    const todas = new Set<string>();
    for (const estado of combinacoes) {
      for (const falta of faltaParaConcluir(estado, CHECKLIST_OBRIGATORIO)) todas.add(falta);
    }
    /* Âncora: uma varredura que gerasse zero frases passaria cega. */
    expect(todas.size).toBeGreaterThanOrEqual(5);

    for (const falta of todas) {
      expect([falta, secaoDaFalta(falta)]).not.toEqual([falta, null]);
    }
  });

  it("a tarja do fim da rolagem aponta para a lista em vez de repeti-la", async () => {
    await abrirATela();

    expect(screen.getByText("Faltam 4 itens para concluir")).toBeTruthy();
    /* A frase antiga colava as quatro pendências aqui embaixo; agora o texto
       diz onde elas estão e o botão leva até lá. */
    expect(screen.getByText("A lista, com o caminho para cada item, está no alto desta tela.")).toBeTruthy();

    await act(async () => {
      fireEvent(screen.getByTestId("ancora-progresso"), "layout", {
        nativeEvent: { layout: { x: 0, y: 320, width: 360, height: 400 } },
      });
    });
    await fireEvent.press(screen.getByTestId("ver-o-que-falta"));

    expect(rolar).toHaveBeenCalledTimes(1);
  });
});

/* ============================================================
   3. O erro que aparecia fora da tela
   ============================================================ */

describe("a tarja de erro", () => {
  it("mora FORA da rolagem, e por isso aparece onde o dedo está", async () => {
    await abrirATela();

    await fireEvent.press(screen.getByText("Capturar localização"));
    await waitFor(() => { expect(screen.getByTestId("tarja-de-erro")).toBeTruthy(); });

    /*
      A afirmação que importa é esta, e não a existência da tarja: ela existia
      antes, dentro do conteúdo rolável, no topo de um formulário que pode
      estar dois mil pontos acima. Um erro de GPS disparado no cartão da
      localização era desenhado onde ninguém estava olhando, e para o agente o
      toque simplesmente não fazia nada.
    */
    const formulario = screen.getByTestId("formulario-da-vistoria");
    expect(within(formulario).queryByTestId("tarja-de-erro")).toBeNull();
  });

  it("fecha, porque tarja que não sai é tarja que se aprende a ignorar", async () => {
    await abrirATela();

    await fireEvent.press(screen.getByText("Capturar localização"));
    await waitFor(() => { expect(screen.getByTestId("tarja-de-erro")).toBeTruthy(); });

    await fireEvent.press(screen.getByTestId("fechar-erro"));

    expect(screen.queryByTestId("tarja-de-erro")).toBeNull();
  });
});

/* ============================================================
   4 e 5. A fotografia: retorno ao tirar, pergunta ao apagar
   ============================================================ */

describe("as fotografias", () => {
  it("tirar foto dá retorno em palavra, e não só uma miniatura nova", async () => {
    await abrirATela();

    await fireEvent.press(screen.getByText("Tirar foto"));
    await act(async () => {});

    await fireEvent.press(screen.getByLabelText("Tirar a fotografia"));
    await act(async () => {});

    /*
      Antes daqui a câmera fechava e a miniatura aparecia, sem flash, sem som e
      sem movimento. Quem está de luva, na chuva, com o morador esperando, não
      confere miniatura de 96 pontos: tira a foto de novo.
    */
    expect(await screen.findByTestId("foto-guardada")).toBeTruthy();
    expect(screen.getByText("Fotografia 1 guardada neste aparelho")).toBeTruthy();
  });

  it("a confirmação some sozinha, para não virar linha permanente", async () => {
    await abrirATela();
    await fireEvent.press(screen.getByText("Tirar foto"));
    await act(async () => {});
    await fireEvent.press(screen.getByLabelText("Tirar a fotografia"));
    await act(async () => {});
    expect(screen.getByTestId("foto-guardada")).toBeTruthy();

    await act(async () => { jest.advanceTimersByTime(30_000); });

    expect(screen.queryByTestId("foto-guardada")).toBeNull();
  });

  it("apagar PERGUNTA antes, e a foto continua lá enquanto não se responde", async () => {
    mockRascunhoGuardado = rascunho({ fotos: [FOTO] });
    await abrirATela();

    await fireEvent.press(screen.getByTestId("apagar-foto-1"));

    expect(screen.getByText("Apagar esta fotografia?")).toBeTruthy();
    /*
      Nada foi gravado ainda: a pergunta é ESTADO, e não efeito colateral do
      toque. Apagar era imediato e irreversível, enquanto descartar item da
      fila de envio, que é menos grave, já perguntava.
    */
    expect(salvarRascunho).not.toHaveBeenCalled();
  });

  it("recusar a pergunta mantém a fotografia", async () => {
    mockRascunhoGuardado = rascunho({ fotos: [FOTO] });
    await abrirATela();

    await fireEvent.press(screen.getByTestId("apagar-foto-1"));
    await fireEvent.press(screen.getByText("Manter a fotografia"));
    await act(async () => {});

    expect(salvarRascunho).not.toHaveBeenCalled();
    expect(screen.getByTestId("apagar-foto-1")).toBeTruthy();
  });

  it("confirmar apaga, e renumera as que sobraram", async () => {
    mockRascunhoGuardado = rascunho({
      fotos: [FOTO, { ...FOTO, idempotencyKey: "foto-2", ordem: 1 }],
    });
    await abrirATela();

    await fireEvent.press(screen.getByTestId("apagar-foto-1"));
    await fireEvent.press(screen.getByText("Apagar a fotografia"));
    await act(async () => {});

    const fotos = ultimoGravado().fotos as Array<{ idempotencyKey: string; ordem: number }>;
    expect(fotos).toHaveLength(1);
    expect(fotos[0]).toEqual(expect.objectContaining({ idempotencyKey: "foto-2", ordem: 0 }));
  });

  it("o alvo de apagar continua na régua de 52 do produto", async () => {
    mockRascunhoGuardado = rascunho({ fotos: [FOTO] });
    await abrirATela();

    /* Já foi 32, vinte abaixo da régua, e nada reclamava porque o aplicativo
       não tinha portão nenhum. Errar este botão apaga prova de interdição. */
    expect(
      StyleSheet.flatten(screen.getByTestId("apagar-foto-1").props.style).minHeight,
    ).toBe(toque);
  });
});

/* ============================================================
   6. A conclusão ganha clímax, e ele não dispara à toa
   ============================================================ */

/** Percorre a minuta e conclui de verdade, como o agente faz na porta. */
async function concluirAVistoria(): Promise<void> {
  mockRascunhoGuardado = rascunhoPronto();
  await abrirATela();
  await fireEvent.press(screen.getByText("Revisar e concluir"));
  await act(async () => {});
  await fireEvent.press(screen.getByText("Concluir vistoria"));
  await act(async () => {});
}

describe("a conclusão", () => {
  it("é uma tela de chegada, e não o diálogo de 'Sair da conta?'", async () => {
    await concluirAVistoria();

    expect(mockEnfileirar).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("vistoria-guardada")).toBeTruthy();
    expect(screen.getByText("Vistoria guardada")).toBeTruthy();
    /*
      O resumo responde a pergunta de quem desce o morro, que não é "deu
      certo?" e sim "foi tudo?". O diálogo antigo tinha duas frases e um botão.
    */
    expect(screen.getByText("1 fotografia guardada")).toBeTruthy();
    expect(screen.getByText("Assinada por Maria de exemplo")).toBeTruthy();
    expect(screen.getByTestId("emblema-da-conclusao", { includeHiddenElements: true })).toBeTruthy();
  });

  it("o clímax acontece uma vez, na transição, e não a cada redesenho", async () => {
    await concluirAVistoria();

    expect(sequencia).toHaveBeenCalledTimes(1);

    /*
      Primeiro o caso barato: o relógio de 30 segundos que redesenha o prazo
      não traz a comemoração de volta. Quem garante isso é o arranjo de
      dependências do efeito, e vale ter o caso, porque uma dependência
      acrescentada sem cuidado quebraria justamente aqui.
    */
    await act(async () => { jest.advanceTimersByTime(120_000); });
    expect(sequencia).toHaveBeenCalledTimes(1);

    /*
      E agora a GUARDA DE ORIGEM de verdade, que é o que a `ref` do arquivo
      protege e o arranjo de dependências não protege.

      O efeito depende também de `reduzirMovimento`, que vem de um evento do
      SISTEMA. O agente liga a redução de movimento no meio do plantão e
      desliga depois; sem a `ref`, cada volta dessa chave roda o efeito de novo
      e o emblema pula sozinho, sem nada ter sido concluído. É o mesmo cuidado
      da `FaixaDeSincronizacao`, onde abrir o aplicativo já sincronizado não
      comemora: comemoração que acontece sem o feito para trás dela ensina o
      agente a não acreditar na que é verdadeira.
    */
    await act(async () => { ouvintesDeReducao.forEach((avisar) => { avisar(true); }); });
    await act(async () => { ouvintesDeReducao.forEach((avisar) => { avisar(false); }); });

    expect(sequencia).toHaveBeenCalledTimes(1);
  });

  it("com redução de movimento, o fato continua e a animação não", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

    await concluirAVistoria();
    await act(async () => {});

    /* Quem pediu menos movimento continua vendo o emblema, o título e o
       resumo. O que some é a interpolação, nunca o fato. */
    expect(sequencia).not.toHaveBeenCalled();
    expect(screen.getByTestId("emblema-da-conclusao", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Vistoria guardada")).toBeTruthy();
  });

  it("as duas saídas nomeiam o destino", async () => {
    await concluirAVistoria();

    await fireEvent.press(screen.getByTestId("voltar-depois-de-guardar"));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

/* ============================================================
   7. A falha de abertura vira estado desenhado
   ============================================================ */

describe("quando a vistoria não abre", () => {
  it("a tela tem título, causa e duas saídas, e não uma tarja órfã", async () => {
    /*
      Antes desta entrega a leitura do disco não tinha caminho de falha
      nenhum: a promessa era rejeitada, `setCarregando(false)` nunca rodava, e
      a tela ficava com a roda girando PARA SEMPRE, sem uma palavra. O agente
      em pé no barranco não distingue isso de sinal ruim, e o que ele faz é
      matar o aplicativo, que é o único jeito de perder coleta neste produto.
    */
    mockPendencia = async () => { throw new Error("banco local ocupado"); };
    await render(<TelaDeVistoria />);

    expect(await screen.findByText("Não deu para abrir esta vistoria")).toBeTruthy();
    expect(screen.getByTestId("tentar-abrir-de-novo")).toBeTruthy();
    expect(screen.getByText("Voltar para as tarefas")).toBeTruthy();
    /* E a roda não ficou pendurada por trás. */
    expect(screen.queryByTestId("espera")).toBeNull();
  });

  it("tentar de novo relê o disco, e a vistoria abre", async () => {
    let tentativas = 0;
    mockPendencia = async () => {
      tentativas += 1;
      if (tentativas === 1) throw new Error("banco local ocupado");
      return OCORRENCIA;
    };
    await render(<TelaDeVistoria />);
    await screen.findByText("Não deu para abrir esta vistoria");

    await fireEvent.press(screen.getByTestId("tentar-abrir-de-novo"));

    expect(await screen.findByText("Checklist técnico")).toBeTruthy();
  });
});

/* ============================================================
   8. A espera com saída
   ============================================================ */

describe("a espera da abertura", () => {
  it("passados os seis segundos, oferece a saída que estava desligada", async () => {
    /* Abertura que nunca responde: banco local travado, que é o caso em que a
       espera sem porta de saída faz o agente matar o aplicativo. */
    mockPendencia = () => new Promise<Pendencia>(() => {});
    await render(<TelaDeVistoria />);

    expect(screen.getByTestId("espera")).toBeTruthy();
    expect(screen.queryByText("Voltar para as tarefas")).toBeNull();

    await act(async () => { jest.advanceTimersByTime(DEMORA_MS + 1); });

    /*
      `aoDesistir` não era passado, e sem ele metade do componente fica
      desligada: a saída aparecia, fechava a espera, e deixava o agente numa
      tela que só diz "você parou de esperar", sem levar a lugar nenhum.
    */
    await fireEvent.press(screen.getByText("Voltar para as tarefas"));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

/* ============================================================
   7. O retorno tátil: o que vibra, e sobretudo o que não vibra
   ============================================================ */

describe("o retorno tátil da vistoria", () => {
  /*
    Os três momentos desta tela têm a mesma forma: algo que o agente fez
    terminou de dar certo, e ele pode não estar olhando para o aparelho. O
    visor da câmera é preto e ele está olhando o barranco; o morador é quem
    olha a tela enquanto assina; e a conclusão pode acontecer com o telefone
    voltando para o bolso.
  */
  it("a fotografia capturada vibra, discreta", async () => {
    await abrirATela();
    await fireEvent.press(screen.getByText("Tirar foto"));
    await act(async () => {});
    mockRetornoTatil.mockClear();

    await fireEvent.press(screen.getByLabelText("Tirar a fotografia"));
    await act(async () => {});

    expect(mockRetornoTatil).toHaveBeenCalledWith("confirmado");
  });

  it("a assinatura confirmada vibra", async () => {
    await abrirATela();
    mockRetornoTatil.mockClear();

    await fireEvent.press(screen.getByLabelText("Confirmar assinatura"));
    await act(async () => {});

    expect(mockRetornoTatil).toHaveBeenCalledWith("confirmado");
  });

  it("a vistoria concluída vibra com a forma de 'terminou', e não com a de 'pegou'", async () => {
    mockRetornoTatil.mockClear();
    await concluirAVistoria();

    expect(mockRetornoTatil).toHaveBeenCalledWith("concluido");
  });

  /*
    ERRO NÃO VIBRA, SEM EXCEÇÃO.

    Vibrar quando algo dá errado é punição e não informação: o aparelho pune a
    mão de quem já está com um problema, e o que a pessoa aprende é a desligar
    o retorno tátil inteiro, levando junto os momentos em que ele ajuda. A
    falha do GPS é o erro mais comum desta tela, porque é a que depende do céu.
  */
  it("o erro de GPS não vibra", async () => {
    await abrirATela();
    mockRetornoTatil.mockClear();

    await fireEvent.press(screen.getByText("Capturar localização"));
    await waitFor(() => { expect(screen.getByTestId("tarja-de-erro")).toBeTruthy(); });

    expect(mockRetornoTatil).not.toHaveBeenCalled();
  });

  /*
    E nem o toque comum. Retorno tátil em tudo é retorno tátil em nada: o
    aparelho vira um brinquedo que zumbe, o agente desliga, e os quatro
    momentos que informam alguma coisa somem junto.
  */
  it("responder o checklist não vibra", async () => {
    await abrirATela();
    mockRetornoTatil.mockClear();

    await fireEvent.press(screen.getAllByLabelText(/: Sim$/)[0]!);
    await act(async () => {});

    expect(mockRetornoTatil).not.toHaveBeenCalled();
  });
});
