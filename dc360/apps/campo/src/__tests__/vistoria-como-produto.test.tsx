import { AccessibilityInfo, Animated, ScrollView, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import {
  CHAVE_ACIONAR_ORGAO, CHECKLIST_OBRIGATORIO, CHECKLIST_VISTORIA,
} from "@dc360/shared";
import { faltaParaConcluir } from "@dc360/campo";
import type { Pendencia } from "../dados/api";
import { lerRascunho, salvarRascunho } from "../dados/rascunho";
import { DEMORA_MS } from "../ui/componentes";
import { contarPreenchidos } from "../ui/regua";
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

/*
  UUIDs de verdade nas chaves e na ocorrência, desde 15/09/2026: a tela passou
  a conferir a coleta com o MESMO esquema do servidor antes de enfileirar, e o
  esquema exige UUID. "oc-1" e "chave-fixa" eram de mentira e passavam porque
  ninguém conferia, que é exatamente o defeito que a conferência fecha.
*/
jest.mock("expo-router", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useEffect } = require("react") as typeof import("react");
  const navegacao = { setOptions: jest.fn() };
  return {
    router: {
      back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true),
    },
    useLocalSearchParams: () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" }),
    useNavigation: () => navegacao,
    /* A tela relê o disco a cada foco; aqui o foco é a montagem, e só ela. */
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
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
  randomUUID: () => {
    mockContadorDeChaves += 1;
    return `cccccccc-cccc-4ccc-8ccc-${String(mockContadorDeChaves).padStart(12, "0")}`;
  },
}));

jest.mock("expo-file-system", () => ({
  File: class { size = 1024; constructor(_uri: string) {} },
}));

/* O disco de verdade grava arquivo; o que esta suíte verifica é a TELA. */
const mockApagarDoDisco = jest.fn((_uri: string) => true);
jest.mock("../dados/evidencia-no-disco", () => ({
  guardarFotoNoAparelho: () => ({ uriLocal: "file:///vistorias/foto.jpg", tamanhoBytes: 1024 }),
  apagarFotoDoAparelho: (uri: string) => mockApagarDoDisco(uri),
  medirArquivoNoAparelho: () => 1024,
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
/*
  O REAL, com só `abrirNoMapa` dublado.

  A fábrica devolvia um objeto com uma chave só, e isso APAGAVA o módulo
  inteiro: `MapaDoImovel` e `useMapaDoMunicipio`, que a tela de vistoria passou
  a usar no cartão de localização, leem `chaveDoMapaDoBuild`,
  `decidirModoDoMapa` e `PRAZO_DO_MAPA_MS` do mesmo arquivo, e a tela morria
  com "não é uma função" longe da causa.

  Dublado continua só o que abre o aplicativo de mapas do SISTEMA, que é o
  único ponto deste módulo que sai do processo.
*/
jest.mock("../dados/mapa", () => ({
  ...jest.requireActual("../dados/mapa"),
  abrirNoMapa: jest.fn(async () => true),
}));

const OCORRENCIA: Pendencia = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
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
    ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    protocolo: "2026/000123",
    idempotencyKey: "11111111-1111-4111-8111-000000000123",
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
  idempotencyKey: "ffffffff-1111-4111-8111-000000000001",
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
  /*
    `isReduceMotionEnabled` já nasce como `jest.fn` no dublê do React Native, e
    `spyOn` sobre um `jest.fn` não cria espião nenhum: `restoreAllMocks` não o
    devolve ao que era. Sem esta linha, o caso "com redução de movimento" deixava
    a redução ligada para os vinte casos seguintes (uma sonda no fim do arquivo
    lia `true`), e eles passavam a testar um aparelho que não anima nada.
  */
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockImplementation(
    () => Promise.resolve(false),
  );
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
   Os botões que fazem a vistoria ANDAR
   ============================================================ */

describe("os botões que fazem a vistoria andar", () => {
  /*
    Na letra de quem paga: "se puder deixar os botões mais chamativos ao invés
    de só preto ou branco seria bom". "Tirar foto" e "Capturar localização" são
    os dois atos centrais desta tela, e saíam como secundário: um fio de
    1,30:1 sobre o cartão. Agora são `realce`, preenchidos com o fundo suave
    de destaque, e com o desenho do ato ao lado da palavra.

    O que continua secundário, e por quê: "Salvar e sair", "Corrigir",
    "Voltar sem fotografar" e os dois "Voltar para as tarefas" são atos de
    SAIR de onde se está, e a régua do `Botao` é uma pergunta só: tocar aqui
    faz o trabalho avançar, ou faz o agente sair?
  */
  it("'Tirar foto' e 'Capturar localização' são realce, e não um fio que mal existe", async () => {
    await abrirATela();

    for (const rotulo of ["Tirar foto", "Capturar localização"]) {
      const estilo = StyleSheet.flatten(screen.getByLabelText(rotulo).props.style);
      expect(estilo.backgroundColor).toBe(temaEscuro.destaqueFundo);
      expect(estilo.borderWidth).toBe(0);
    }
  });

  it("'Abrir no mapa' também: chegar lá é o primeiro ato da vistoria", async () => {
    await abrirATela();

    const estilo = StyleSheet.flatten(screen.getByTestId("abrir-no-mapa").props.style);
    expect(estilo.backgroundColor).toBe(temaEscuro.destaqueFundo);
  });

  it("'Salvar e sair' continua contornado, com a borda de controle", async () => {
    await abrirATela();

    const estilo = StyleSheet.flatten(screen.getByTestId("salvar-e-sair").props.style);
    expect(estilo.backgroundColor).toBe("transparent");
    expect(estilo.borderColor).toBe(temaEscuro.bordaControle);
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
      fotos: [FOTO, { ...FOTO, idempotencyKey: "ffffffff-2222-4222-8222-000000000002", ordem: 1 }],
    });
    await abrirATela();

    await fireEvent.press(screen.getByTestId("apagar-foto-1"));
    await fireEvent.press(screen.getByText("Apagar a fotografia"));
    await act(async () => {});

    const fotos = ultimoGravado().fotos as Array<{ idempotencyKey: string; ordem: number }>;
    expect(fotos).toHaveLength(1);
    expect(fotos[0]).toEqual(expect.objectContaining({ idempotencyKey: "ffffffff-2222-4222-8222-000000000002", ordem: 0 }));
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

  /*
    A régua vale nos DOIS eixos, e só a altura estava cobrada.

    O alvo tinha 52 de altura e a largura da palavra "Apagar", que dá uns 50: o
    portão de acessibilidade mede altura, passava, e o dedo com luva errava na
    horizontal, no único botão desta tela que apaga prova de uma interdição.
    Agora ele tem pelo menos a largura da miniatura que ele apaga, o que também
    acaba com o texto mais estreito que a imagem logo acima dele.
  */
  it("e o alvo de apagar tem largura, e não só altura", async () => {
    mockRascunhoGuardado = rascunho({ fotos: [FOTO] });
    await abrirATela();

    const estilo = StyleSheet.flatten(screen.getByTestId("apagar-foto-1").props.style);
    expect(estilo.minWidth).toBeGreaterThanOrEqual(toque);
  });

  /*
    "Cancelar" é o rótulo que este produto recusa em toda outra tela, e ele
    tinha sobrevivido aqui: num aplicativo de campo ele é ambíguo do jeito caro
    (cancelar a foto, ou cancelar a vistoria?).
  */
  it("a saída da câmera diz o que faz, e não 'Cancelar'", async () => {
    mockRascunhoGuardado = rascunho();
    await abrirATela();
    await fireEvent.press(screen.getByText("Tirar foto"));

    expect(await screen.findByTestId("fechar-a-camera")).toBeTruthy();
    expect(screen.getByText("Voltar sem fotografar")).toBeTruthy();
    expect(screen.queryByText("Cancelar")).toBeNull();
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
    await act(async () => {});

    // A prova de que a tela ficou EM BRANCO: árvore nenhuma desenhada.
    expect(screen.toJSON()).not.toBeNull();
    expect(screen.getByText("Não deu para abrir esta vistoria")).toBeTruthy();
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

/**
 * A DENSIDADE VISUAL do cabeçalho, medida no que foi desenhado.
 *
 * O cartão de cabeçalho desta tela juntava TRÊS blocos de cor em quatro linhas:
 * a pílula de severidade, a pílula de prazo (vermelha quando vencido, âmbar
 * quando apertado) e a tarja âmbar de vulnerabilidade social. São três fatos
 * diferentes gritando no mesmo volume, e quem lê isso está em pé no morro
 * decidindo o que fazer primeiro.
 *
 * A régua está em `ui/regua.ts`. Pela R2, o fundo cheio fica com a SEVERIDADE:
 * ela é a gravidade do fato, é a mesma marca em todas as telas do produto e é a
 * única das três cujo par de cores é medido, um a um, no portão de contraste. O
 * prazo virou ícone mais palavra, que é como a lista de tarefas já o desenha, e
 * a vulnerabilidade virou aviso de peso leve, com filete.
 *
 * Os dois primeiros casos REPROVAM na versão anterior desta tela.
 */
describe("a régua do peso visual, no cabeçalho da vistoria", () => {
  const OCORRENCIA_DO_PIOR_CASO: Pendencia = {
    ...OCORRENCIA,
    prazo_em: "2026-09-08T12:00:00.000Z",
    vulnerabilidade_presente: true,
    vulnerabilidade_descricao: "Idosa acamada no andar de baixo.",
  };

  const preenchidos = () =>
    contarPreenchidos(screen.toJSON(), temaEscuro, (e) => StyleSheet.flatten(e as never))
      .sort();

  it("severidade, prazo vencido e vulnerabilidade não pintam três blocos", async () => {
    mockPendencia = async () => OCORRENCIA_DO_PIOR_CASO;
    await abrirATela();

    /*
      Sobram dois no aplicativo inteiro, e os dois estão longe um do outro: a
      pílula de severidade, no alto do cartão, e a tarja do fim da rolagem que
      diz por quantos itens o botão de concluir está travado. Nenhum cartão
      empilha mais de um, que é a R1.
    */
    expect(preenchidos()).toEqual([temaEscuro.alertaFundo, temaEscuro.sevAltaFundo].sort());
  });

  it("e os três fatos continuam na tela, cada um com o segundo canal dele", async () => {
    /*
      Tirar o peso não pode virar tirar a informação. O prazo mantém a palavra
      "vencido" e o relógio; a vulnerabilidade mantém o sinal, o título e o
      filete; a severidade mantém a pílula.
    */
    mockPendencia = async () => OCORRENCIA_DO_PIOR_CASO;
    await abrirATela();

    expect(screen.getByText(/vencid/i)).toBeTruthy();
    expect(screen.getByText("Vulnerabilidade social registrada")).toBeTruthy();
    expect(screen.getByText("Idosa acamada no andar de baixo.")).toBeTruthy();
    expect(screen.getByLabelText("Severidade alta")).toBeTruthy();
  });

  it("o prazo vencido continua saindo na cor de perigo, só que sem retângulo", async () => {
    /*
      A cor não foi embora: ela saiu do fundo e ficou no texto, que é o peso
      leve da régua. Sem este caso, apagar a cor do prazo junto com o fundo
      passaria despercebido, e a tela perderia a distinção entre vencido e no
      prazo.
    */
    mockPendencia = async () => OCORRENCIA_DO_PIOR_CASO;
    await abrirATela();

    const prazo = screen.getByText(/^Prazo vencid/);
    expect(StyleSheet.flatten(prazo.props.style).color).toBe(temaEscuro.perigoTexto);
  });
});

/* ============================================================
   9. O DISCO QUE RECUSA, E O RASCUNHO DE ONTEM
   ============================================================

   Três caminhos em que o trabalho do morro some sem ninguém saber, e os três
   estavam abertos numa tela cuja promessa inteira é "nada se perde".
*/

describe("o rascunho gravado por uma versão anterior", () => {
  it("abre, em vez de derrubar a tela", async () => {
    /*
      O cenário, e ele já aconteceu uma vez neste repositório: a contagem de
      pessoas entrou depois (commit "O produto passa a contar pessoas"), e o
      aparelho de um agente pode ter, neste minuto, uma vistoria começada antes
      dela, com fotos, GPS, assinatura e meia hora de barranco dentro.

      `JSON.parse` não reclama de formato antigo: devolve um objeto sem a
      propriedade. A tela lia `rascunho.pessoas[chave]` e morria com "cannot
      read properties of undefined (reading 'desalojados')" na primeira
      renderização, e o rascunho ficava inacessível para sempre, no morro.

      `rascunho.ts` migra `orgaosParaAcionar` à mão, e é justamente essa a
      fragilidade que este caso trava: migração campo a campo cobre o campo de
      que alguém lembrou.
    */
    const deOntem = rascunho({ observacoes: "Trinca no muro dos fundos." });
    delete deOntem["pessoas"];
    mockRascunhoGuardado = deOntem;

    await render(<TelaDeVistoria />);

    expect(await screen.findByText("Checklist técnico")).toBeTruthy();
    /* E o que o agente tinha digitado continua ali: o rascunho novo é só a
       BASE, e o que estava no disco vem por cima. */
    expect(screen.getByTestId("observacoes-do-agente").props.value)
      .toBe("Trinca no muro dos fundos.");
  });

  it("não cunha chave de idempotência nova ao completar o formato", async () => {
    /*
      A conversão não pode custar uma chave nova: chave diferente é, para o
      servidor, a definição de uma SEGUNDA coleta do mesmo protocolo. A base
      reaproveita a chave que está no disco.
    */
    const deOntem = rascunho({ idempotencyKey: "11111111-1111-4111-8111-00000000ffff" });
    delete deOntem["pessoas"];
    mockRascunhoGuardado = deOntem;
    mockRascunhoGuardado = { ...deOntem, ...rascunhoPronto(), pessoas: undefined };
    delete (mockRascunhoGuardado as Record<string, unknown>)["pessoas"];
    mockRascunhoGuardado["idempotencyKey"] = "11111111-1111-4111-8111-00000000ffff";

    await abrirATela();
    await fireEvent.press(screen.getByText("Revisar e concluir"));
    await act(async () => {});
    await fireEvent.press(screen.getByText("Concluir vistoria"));
    await act(async () => {});

    const envelope = mockEnfileirar.mock.calls[0]?.[0] as { idempotencyKey: string };
    expect(envelope.idempotencyKey).toBe("11111111-1111-4111-8111-00000000ffff");
  });
});

describe("a leitura do disco que falha no meio", () => {
  it("não deixa a tela em branco quando a ocorrência já foi lida", async () => {
    /*
      O buraco, e ele é de UMA condição escrita pelo lado errado.

      `carregarDoDisco` grava a ocorrência ANTES de ler o rascunho, a lápide e o
      catálogo, e essas três vão juntas num `Promise.all`. Com o SQLite ocupado
      (a fila escreve na mesma base, em aparelho de entrada), o `catch` acendia
      o erro com a ocorrência já no estado e o rascunho ainda nulo. A tela de
      falha só desenhava com `erro && !ocorrencia`, então nenhum dos estados
      desenhados casava e o último guarda devolvia `null`: TELA BRANCA, sem uma
      palavra e sem saída, no toque em que o agente chega na porta da casa.

      A prova de que era branca é a primeira linha: árvore nenhuma desenhada.
    */
    jest.mocked(lerRascunho).mockRejectedValueOnce(new Error("database is locked"));

    await render(<TelaDeVistoria />);
    await act(async () => {});

    expect(screen.toJSON()).not.toBeNull();
    expect(screen.getByText("Não deu para abrir esta vistoria")).toBeTruthy();
    /* As duas saídas da tela de falha, que é o que salva quem está preso aqui. */
    expect(screen.getByTestId("tentar-abrir-de-novo")).toBeTruthy();
    expect(screen.getByText("Voltar para as tarefas")).toBeTruthy();
  });

  it("e a falha da coleta continua indo para a tarja, com o formulário de pé", async () => {
    /*
      O outro lado da mesma condição: as seis falhas que acontecem DENTRO da
      coleta (GPS, câmera, mapa, conclusão) têm rascunho de pé, e trocar o
      formulário inteiro por uma tela de erro por causa de um GPS que não pegou
      seria jogar fora a vistoria em andamento.
    */
    await abrirATela();

    await fireEvent.press(screen.getByText("Capturar localização"));
    await waitFor(() => { expect(screen.getByTestId("tarja-de-erro")).toBeTruthy(); });

    expect(screen.getByText("Checklist técnico")).toBeTruthy();
    expect(screen.queryByText("Não deu para abrir esta vistoria")).toBeNull();
  });
});

describe("a gravação do rascunho que o disco recusa", () => {
  it("é dita ao agente, em vez de sumir em silêncio", async () => {
    /*
      A forma mais cara de perder trabalho neste produto, porque ela é
      INVISÍVEL. Era `void salvarRascunho(novo)`, sem `catch`: a tela mostrava a
      resposta e o disco podia ter recusado tudo (armazenamento cheio, base
      ocupada pela fila) sem uma palavra. O agente desce o morro certo de que
      está guardado, o Android mata o aplicativo para liberar memória, e a
      vistoria volta ao estado da última gravação que deu certo.

      Precisa ser dito ENQUANTO ele ainda está no local, que é o único instante
      em que refazer custa um toque.
    */
    /* `Once`, e não para sempre: `clearAllMocks` limpa chamadas e não
       implementações, e uma rejeição permanente vazaria para o caso seguinte. */
    jest.mocked(salvarRascunho).mockRejectedValueOnce(new Error("disk I/O error"));
    await abrirATela();

    await fireEvent.changeText(
      screen.getByTestId("observacoes-do-agente"), "Trinca nova na parede.",
    );
    await act(async () => {});

    const tarja = await screen.findByTestId("tarja-de-erro");
    expect(within(tarja).getByText(/não conseguiu guardar/)).toBeTruthy();
    /* E a frase não pode assustar mais do que o fato: o que já estava no disco
       continua lá, e a tela diz isso. */
    expect(within(tarja).getByText(/nada foi apagado/)).toBeTruthy();
  });

  it("gravação que dá certo não acende tarja nenhuma", async () => {
    /* A âncora do caso acima: sem ela, uma tarja acesa o tempo todo passaria. */
    await abrirATela();

    await fireEvent.changeText(
      screen.getByTestId("observacoes-do-agente"), "Trinca nova na parede.",
    );
    await act(async () => {});

    expect(screen.queryByTestId("tarja-de-erro")).toBeNull();
  });
});

/* ============================================================
   10. O LAUDO NÃO PODE AFIRMAR O QUE NINGUÉM RESPONDEU
   ============================================================ */

describe("o checklist que viaja no envelope", () => {
  it("item opcional não respondido não vira 'não'", async () => {
    /*
      O defeito sai no papel com brasão. A tela mandava
      `CHECKLIST_VISTORIA.map(... Boolean(rascunho.checklist[chave]))`, e item
      NÃO RESPONDIDO virava `false`. `blocoVistoria`, em `documentos/laudo.ts`,
      imprime `false` como "NÃO". Os dois itens opcionais do catálogo são "Danos
      estruturais visíveis" e "Acesso ao imóvel comprometido": o agente que não
      olhou para eles produzia um laudo oficial declarando que não há dano
      estrutural e que o acesso está livre.

      É o mesmo fato que `contagensDoRascunho` já tratava ao lado, com a mesma
      frase: em branco não é zero, e não respondido não é "não". E é o motivo de
      esta tela usar Sim e Não explícitos em vez de um interruptor.
    */
    mockRascunhoGuardado = rascunhoPronto();
    await abrirATela();
    await fireEvent.press(screen.getByText("Revisar e concluir"));
    await act(async () => {});
    await fireEvent.press(screen.getByText("Concluir vistoria"));
    await act(async () => {});

    const envelope = mockEnfileirar.mock.calls[0]?.[0] as {
      vistoria: { checklist: Array<{ chave: string; resposta: boolean }> };
    };
    const chaves = envelope.vistoria.checklist.map((i) => i.chave);

    for (const opcional of CHECKLIST_VISTORIA.filter((i) => !i.obrigatorio)) {
      expect([opcional.chave, chaves.includes(opcional.chave)])
        .toEqual([opcional.chave, false]);
    }
    /* E os obrigatórios continuam TODOS lá: é o que o `checklistSchema` do
       pacote compartilhado cobra, e o que a conclusão já exigia. */
    for (const o of CHECKLIST_OBRIGATORIO) expect(chaves).toContain(o.chave);
  });

  it("item opcional RESPONDIDO 'não' viaja como não, que é um fato", async () => {
    /*
      A outra metade, e sem ela o conserto acima seria "nunca mande opcional",
      que perderia informação de verdade: "olhei e não há dano estrutural" é uma
      afirmação técnica que o laudo precisa carregar.
    */
    const opcional = CHECKLIST_VISTORIA.find((i) => !i.obrigatorio)!;
    mockRascunhoGuardado = rascunho({
      ...rascunhoPronto(),
      checklist: { ...CHECKLIST_COMPLETO, [opcional.chave]: false },
    });
    await abrirATela();
    await fireEvent.press(screen.getByText("Revisar e concluir"));
    await act(async () => {});
    await fireEvent.press(screen.getByText("Concluir vistoria"));
    await act(async () => {});

    const envelope = mockEnfileirar.mock.calls[0]?.[0] as {
      vistoria: { checklist: Array<{ chave: string; resposta: boolean }> };
    };
    expect(envelope.vistoria.checklist)
      .toContainEqual({ chave: opcional.chave, resposta: false });
  });

  it("a minuta lida na porta mostra o mesmo checklist do envelope", async () => {
    /*
      A minuta é o texto que o agente lê em voz alta para quem está no local, e
      ela montava a mesma linha `Boolean(...)` copiada. Duas cópias do mesmo
      fato divergem na primeira pressa, e este arquivo já pagou esse preço.
    */
    mockRascunhoGuardado = rascunhoPronto();
    await abrirATela();
    await fireEvent.press(screen.getByText("Revisar e concluir"));
    await act(async () => {});

    for (const opcional of CHECKLIST_VISTORIA.filter((i) => !i.obrigatorio)) {
      expect([opcional.rotulo, screen.queryByText(opcional.rotulo) !== null])
        .toEqual([opcional.rotulo, false]);
    }
  });
});

/* ============================================================
   11. A FOTOGRAFIA APAGADA SAI TAMBÉM DO APARELHO
   ============================================================ */

describe("apagar a fotografia", () => {
  it("descarta o arquivo, que é o que o diálogo promete", async () => {
    /*
      O texto do diálogo diz, com todas as letras, "o arquivo é descartado deste
      aparelho". A tela tirava a foto da lista do rascunho e o JPEG ficava em
      `Paths.document`. O único lugar que varria esses arquivos era o logout, e
      o agente de campo não sai da conta: ele fecha o aplicativo e volta no dia
      seguinte, no mesmo aparelho, compartilhado entre turnos.
    */
    mockRascunhoGuardado = rascunho({ fotos: [FOTO] });
    await abrirATela();

    await fireEvent.press(screen.getByTestId("apagar-foto-1"));
    await fireEvent.press(screen.getByText("Apagar a fotografia"));
    await act(async () => {});

    expect(mockApagarDoDisco).toHaveBeenCalledWith(FOTO.uriLocal);
  });

  it("recusar a pergunta não toca no arquivo", async () => {
    mockRascunhoGuardado = rascunho({ fotos: [FOTO] });
    await abrirATela();

    await fireEvent.press(screen.getByTestId("apagar-foto-1"));
    await fireEvent.press(screen.getByText("Manter a fotografia"));
    await act(async () => {});

    expect(mockApagarDoDisco).not.toHaveBeenCalled();
  });

  it("a miniatura é alcançável pelo leitor de tela", async () => {
    /*
      `Image` nasce com `accessible` falso no React Native: o rótulo estava
      escrito e nunca foi falado para ninguém. Numa tela em que a fotografia é
      prova de interdição, a lista de fotos era silêncio para quem usa TalkBack.
    */
    mockRascunhoGuardado = rascunho({ fotos: [FOTO] });
    await abrirATela();

    expect(screen.getByLabelText("Fotografia 1 da vistoria").props.accessible)
      .toBe(true);
  });
});

/* ============================================================
   O menu flutuante e as cinco telas da vistoria
   ============================================================ */

/*
  O dono, com o aparelho na mão: "Concluir vistoria" e "Ver na fila de envio"
  escondidos atrás do menu de vidro. A pílula paira sobre a cena e não empurra
  nada, então cada tela reserva o vão que a barra mede (`useRecuoDoMenu`), e
  as barras FIXAS de botões sobem acima da pílula. A câmera é a exceção: tela
  cheia esconde o menu pela opção padrão do navegador.
*/
describe("o menu flutuante e as telas da vistoria", () => {
  const { alturaDeReservaDoMenu } = require("../ui/BarraDeAbas") as typeof import("../ui/BarraDeAbas");
  const { espaco } = require("../ui/tokens") as typeof import("../ui/tokens");
  /* Sem navegador em volta, o gancho cai na conta do cabeçalho mais a área segura do dublê. */
  const RECUO_MINIMO = alturaDeReservaDoMenu(0) + espaco.e3;

  function recuoDe(estilo: unknown): number {
    return Number((StyleSheet.flatten(estilo as never) as { paddingBottom?: number }).paddingBottom ?? 0);
  }

  it("o formulário reserva o vão do menu no fim da rolagem", async () => {
    await abrirATela();
    const folha = screen.getByTestId("formulario-da-vistoria");
    expect(recuoDe(folha.props.contentContainerStyle)).toBeGreaterThanOrEqual(RECUO_MINIMO);
  });

  it("a barra da minuta sobe acima da pílula: reserva o vão medido, e não só a área segura", async () => {
    mockRascunhoGuardado = rascunhoPronto();
    await abrirATela();
    await fireEvent.press(screen.getByText("Revisar e concluir"));
    await act(async () => {});

    const barra = await screen.findByTestId("barra-da-minuta");
    expect(recuoDe(barra.props.style)).toBeGreaterThanOrEqual(RECUO_MINIMO);
    expect(screen.getByText("Concluir vistoria")).toBeTruthy();
  });

  it("a tela de vistoria guardada reserva o vão, para 'Ver na fila de envio' não morrer atrás do vidro", async () => {
    await concluirAVistoria();
    const guardada = await screen.findByTestId("vistoria-guardada");
    expect(recuoDe(guardada.props.contentContainerStyle)).toBeGreaterThanOrEqual(RECUO_MINIMO);
  });

  it("a câmera pede tela cheia ao navegador, e devolve o menu ao fechar", async () => {
    const { useNavigation } = require("expo-router") as { useNavigation: () => { setOptions: jest.Mock } };
    const navegacao = useNavigation();
    navegacao.setOptions.mockClear();
    mockRascunhoGuardado = rascunho();
    await abrirATela();

    await fireEvent.press(screen.getByText("Tirar foto"));
    await act(async () => {});
    expect(navegacao.setOptions).toHaveBeenCalledWith({ tabBarStyle: { display: "none" } });

    await fireEvent.press(screen.getByTestId("fechar-a-camera"));
    await act(async () => {});
    const ultima = navegacao.setOptions.mock.calls.at(-1)?.[0] as { tabBarStyle?: unknown };
    expect(ultima).toEqual({ tabBarStyle: undefined });
  });
});
