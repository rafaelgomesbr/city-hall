import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import type { HistoricoDaCasa, ResultadoDoHistorico } from "../dados/historico-da-casa";
import { esquecerAutorizacaoDoMapa } from "../dados/mapa";
import TelaDeVistoria, { divergenciaDeCoordenada } from "../app/(agente)/vistoria/[id]";

/**
 * O MAPA DO IMÓVEL, A COORDENADA QUE NÃO VIAJAVA, E O QUE JÁ ACONTECEU AQUI.
 *
 * Três buracos desta tela, os três confirmados no código e nenhum deles
 * visível como defeito, porque em todos os três a tela funcionava:
 *
 * 1. **O cartão de localização era texto puro.** Uma coordenada com seis casas
 *    e uma frase de precisão em metros. Quinze dígitos não respondem a pergunta
 *    que o agente faz em pé no barranco, que é espacial.
 * 2. **A coordenada da vistoria não subia.** Do envelope ia só
 *    `gpsPrecisaoMetros`, ou seja, a QUALIDADE de uma medida cujo VALOR ficava
 *    no aparelho. O agente é a fonte mais confiável de onde o imóvel fica e era
 *    o único que não conseguia reportar.
 * 3. **`GET /ocorrencias/:id` e `GET /evidencias/ocorrencia/:id` nunca foram
 *    chamados.** O agente chega na porta sem saber que outra equipe já esteve
 *    ali, que a tarefa já voltou com motivo escrito, ou que há providência
 *    encaminhada a um órgão.
 *
 * O que estes casos guardam, acima de tudo, é a promessa que não pode cair
 * junto: **nada aqui depende de sinal, e nada se perde.** Rede que falha não
 * pode virar tarja vermelha, não pode segurar a abertura e não pode impedir
 * concluir.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo: um teste ali seria uma tela navegável no aplicativo
 * publicado.
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

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
}));

const mockPosicao = jest.fn(async () => ({
  coords: { latitude: -27.595900, longitude: -48.548900, accuracy: 8 },
}));
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCurrentPositionAsync: () => mockPosicao(),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-1111-1111-111111111111",
}));

jest.mock("expo-file-system", () => ({
  File: class { size = 1024; constructor(_uri: string) {} },
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

/*
  O módulo do mapa vai INTEIRO, com só `abrirNoMapa` dublado: o cartão de
  localização usa `MapaDoImovel` e `useMapaDoMunicipio`, que leem
  `decidirModoDoMapa`, `chaveDoMapaDoBuild` e `PRAZO_DO_MAPA_MS` daqui. Uma
  fábrica com uma chave só apagaria o módulo e a tela morreria com "não é uma
  função", longe da causa.
*/
jest.mock("../dados/mapa", () => ({
  ...jest.requireActual("../dados/mapa"),
  abrirNoMapa: jest.fn(async () => true),
}));

/*
  O histórico é dublado na FRONTEIRA da tela, e não no `fetch`.

  O comportamento do módulo sob fracasso (nunca estoura, dossiê manda, listas
  ausentes viram vazias) tem arquivo próprio, `dados/historico-da-casa.test.ts`,
  com `fetch` de verdade dublado. O que se pergunta AQUI é outra coisa: o que a
  TELA faz com cada uma das duas respostas possíveis.
*/
let mockHistorico: () => Promise<ResultadoDoHistorico>;
jest.mock("../dados/historico-da-casa", () => ({
  ...jest.requireActual("../dados/historico-da-casa"),
  buscarHistoricoDaCasa: () => mockHistorico(),
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

let mockPendencia: () => Promise<Pendencia | null>;
jest.mock("../dados/pendencias", () => ({
  pendenciaGuardada: () => mockPendencia(),
  orgaosGuardados: async () => [],
  atualizarPendencias: jest.fn(async () => {}),
}));

/** A lápide da coleta que este aparelho já fez. Cada caso ajusta o que precisa. */
let mockLapide: unknown = null;
jest.mock("../dados/coletas", () => ({
  coletaDe: async () => mockLapide,
  marcarColetada: jest.fn(async () => {}),
  arquivarColeta: jest.fn(async () => {}),
}));

const mockEnfileirar = jest.fn(async (..._args: unknown[]) => ({}));
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

jest.mock("../ui/Assinatura", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Text } = require("react-native") as typeof import("react-native");
  return { Assinatura: () => <Text>quadro de assinatura</Text> };
});

jest.mock("../ui/retornoTatil", () => ({ retornoTatil: jest.fn() }));

/**
 * O SINAL, com o teste segurando a chave.
 *
 * Um dublê que devolvesse um valor fixo não serviria ao caso "o sinal volta
 * com a tela aberta": `useSinal` é um gancho, e a tela precisa REDESENHAR
 * quando ele muda. Por isso o dublê é um gancho de verdade, com estado, e
 * `mudarSinal()` avisa todas as telas montadas, como o ouvinte de rede faria.
 */
let mockSinal = { temSinal: true, tipo: "Wi-Fi" as string | null };
const mockOuvintesDeSinal = new Set<(s: typeof mockSinal) => void>();
jest.mock("../dados/conectividade", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useEffect, useState } = require("react") as typeof import("react");
  return {
    useSinal: () => {
      const [sinal, setSinal] = useState(mockSinal);
      useEffect(() => {
        mockOuvintesDeSinal.add(setSinal);
        return () => { mockOuvintesDeSinal.delete(setSinal); };
      }, []);
      return sinal;
    },
  };
});

jest.mock("../dados/evidencia-no-disco", () => ({
  guardarFotoNoAparelho: () => ({ uriLocal: "file:///vistorias/foto.jpg", tamanhoBytes: 1024 }),
  medirArquivoNoAparelho: () => 1024,
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

/** O rascunho em que nada mais é exigido para concluir. */
function rascunhoPronto(mudanca: RascunhoDeTeste = {}): RascunhoDeTeste {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { CHAVE_ACIONAR_ORGAO, CHECKLIST_OBRIGATORIO } =
    require("@dc360/shared") as typeof import("@dc360/shared");
  return rascunho({
    checklist: Object.fromEntries(
      CHECKLIST_OBRIGATORIO.map((i) => [i.chave, i.chave !== CHAVE_ACIONAR_ORGAO]),
    ),
    fotos: [{
      idempotencyKey: "ffffffff-1111-4111-8111-000000000001",
      uriLocal: "file:///vistorias/foto.jpg",
      nomeArquivo: "vistoria-1.jpg",
      tipoConteudo: "image/jpeg",
      tamanhoBytes: 1024,
      capturadaEm: "2026-09-09T12:00:00.000Z",
      ordem: 0,
    }],
    assinanteNome: "Maria de exemplo",
    assinaturaUri: "file:///vistorias/assinatura.png",
    ...mudanca,
  });
}

const HISTORICO_CHEIO: ResultadoDoHistorico = {
  estado: "chegou",
  historico: {
    vistoriaAnterior: {
      coletada_em: "2026-09-03T14:00:00.000Z",
      sincronizada_em: "2026-09-03T18:00:00.000Z",
      agente_nome: "Carlos de exemplo",
      assinante_nome: "João de exemplo",
      observacoes: "Trinca no muro dos fundos, sem movimento aparente.",
    },
    providencias: [{
      id: "p-1",
      orgao_destino: "Concessionária de energia",
      descricao: "Desligar o ramal do poste inclinado",
      encaminhada_em: "2026-09-03T19:00:00.000Z",
      respondida_em: null,
    }],
    vinculadas: [{
      id: "oc-9", protocolo: "2026/000090", status: "encerrada",
      endereco: "Servidão do Morro, 45", criado_em: "2026-08-28T10:00:00.000Z",
    }],
    devolucao: {
      decidida_em: "2026-09-05T12:00:00.000Z",
      motivo: "risco_para_a_equipe",
      observacao: "Barranco solto na entrada, subimos e voltamos.",
      observacao_removida_em: null,
      devolvida_por_nome: "Ana de exemplo",
    },
    fotosDeAntes: [{
      id: "ev-1", legenda: "Muro dos fundos",
      capturadaEm: "2026-09-03T14:10:00.000Z", ordem: 0,
      url: "https://armazenamento.exemplo/ev-1",
    }],
  },
};

const NADA: HistoricoDaCasa = {
  vistoriaAnterior: null, providencias: [], vinculadas: [],
  devolucao: null, fotosDeAntes: [],
};

const HISTORICO_VAZIO: ResultadoDoHistorico = { estado: "chegou", historico: NADA };

/** Um histórico que chegou, partindo do vazio, com só o que o caso precisa. */
function chegou(mudanca: Partial<HistoricoDaCasa>): ResultadoDoHistorico {
  return { estado: "chegou", historico: { ...NADA, ...mudanca } };
}

async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await screen.findByText("Checklist técnico");
}

beforeEach(() => {
  jest.clearAllMocks();
  /*
    Relógio falso, como nas outras suítes desta tela. Ela tem um `setInterval`
    de trinta segundos para o prazo não congelar durante uma vistoria de
    quarenta minutos, e um relógio de verdade o deixaria batendo depois do
    último caso, dentro de um ambiente já desmontado.
  */
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
  mockPendencia = async () => OCORRENCIA;
  mockRascunhoGuardado = null;
  mockHistorico = async () => HISTORICO_VAZIO;
  mockLapide = null;
  mockSinal = { temSinal: true, tipo: "Wi-Fi" };
  /*
    A autorização do mapa é memorizada no módulo, de propósito (a lista de
    tarefas remonta a cada foco, e sem memória cada remontagem gastaria uma
    requisição pelo 3G do morro). Sem este esquecimento, um caso herdaria a
    decisão do caso anterior e passaria a medir a execução passada.
  */
  esquecerAutorizacaoDoMapa();
  /*
    Sem chave autorizada, que é o estado da produção hoje: `decidirModoDoMapa`
    responde plano esquemático, sem nenhum contato com o Google. É também o que
    o agente vê no morro sem sinal.
  */
  (globalThis as { fetch: unknown }).fetch = (jest.fn(async () => {
    throw new Error("Network request failed");
  }) as unknown) as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

/* ============================================================
   1. A coordenada da vistoria, que não viajava
   ============================================================ */

describe("a coordenada da vistoria entra no envelope", () => {
  /**
   * Concluir de verdade, e a armadilha que isto custou para descobrir.
   *
   * `act` explícito entre os dois toques, e NUNCA `waitFor` depois de um
   * `fireEvent` que conclui. Com relógio falso, o `waitFor` da biblioteca
   * adianta o tempo em laço até a condição valer, e o que ele adianta aqui é o
   * clímax da conclusão no meio do próprio ato: o caso passa, e os DEZOITO
   * casos seguintes deste arquivo montam a tela num React que não desenha mais
   * nada, com a árvore vazia e sem uma linha de erro para explicar.
   *
   * Vale escrever porque o sintoma não aponta para a causa em momento nenhum:
   * rodando sozinho, cada um dos dezoito passa.
   */
  async function concluirAVistoria(): Promise<Record<string, unknown>> {
    await abrirATela();
    await fireEvent.press(screen.getByText("Revisar e concluir"));
    await act(async () => {});
    await fireEvent.press(screen.getByText("Concluir vistoria"));
    await act(async () => {});
    expect(mockEnfileirar).toHaveBeenCalledTimes(1);
    return mockEnfileirar.mock.calls[0]?.[0] as Record<string, unknown>;
  }

  it("o ponto que o aparelho mediu sobe junto com a coleta", async () => {
    mockRascunhoGuardado = rascunhoPronto({
      coordenada: { lat: -27.595900, lng: -48.548900 },
      gpsPrecisaoMetros: 8,
    });

    const envelope = await concluirAVistoria();

    /*
      Antes desta entrega, daqui subia SÓ `gpsPrecisaoMetros`: a qualidade de
      uma medida cujo valor ficava no celular. O ponto ia junto de cada
      fotografia, como metadado de imagem, então uma vistoria sem foto subia
      sem coordenada nenhuma e o laudo imprimia o alfinete que o operador colou
      pelo telefone.
    */
    expect((envelope["vistoria"] as Record<string, unknown>)["coordenada"])
      .toEqual({ lat: -27.595900, lng: -48.548900 });
  });

  it("sem leitura de GPS, a chave não existe no envelope", async () => {
    mockRascunhoGuardado = rascunhoPronto({ coordenada: null });

    const envelope = await concluirAVistoria();
    const vistoria = envelope["vistoria"] as Record<string, unknown>;

    /*
      AUSENTE, e não `null` nem `undefined` escrito.

      O esquema compartilhado declara `coordenada` como opcional, e o caminho
      óbvio de "consertar" isto seria `coordenada: rascunho.coordenada`, que
      mandaria `null` e seria RECUSADO na sincronização: a coleta ficaria presa
      na fila do aparelho, com a vistoria inteira dentro, no morro, sem
      ninguém entendendo por quê. Vistoria em vão de morro com o céu tapado
      fica sem leitura, e é o caso mais difícil de refazer que existe.
    */
    expect("coordenada" in vistoria).toBe(false);
    // E a precisão continua indo, que é o campo que sempre foi.
    expect(vistoria["gpsPrecisaoMetros"]).toBeNull();
  });
});

/* ============================================================
   2. O mapa do imóvel
   ============================================================ */

describe("o mapa do imóvel", () => {
  it("desenha o local, com o ponto informado e o do aparelho lado a lado", async () => {
    mockRascunhoGuardado = rascunho({
      coordenada: { lat: -27.598000, lng: -48.551000 },
      gpsPrecisaoMetros: 8,
    });

    await abrirATela();

    // O cartão deixou de ser texto puro: há um desenho, e ele diz a distância.
    expect(await screen.findByTestId("plano-imovel")).toBeTruthy();
    expect(screen.getByText(/O imóvel fica a \d+ m a /)).toBeTruthy();

    // E os DOIS pontos aparecem nomeados, que é o que o agente não tinha.
    expect(screen.getByText("-27.595378, -48.548050")).toBeTruthy();
    expect(screen.getByText("-27.598000, -48.551000")).toBeTruthy();
  });

  it("sem sinal continua desenhando, e diz em que modo está", async () => {
    mockRascunhoGuardado = rascunho({ coordenada: { lat: -27.598000, lng: -48.551000 } });

    await abrirATela();

    /*
      A rede recusa (ver o `fetch` do `beforeEach`), e a tela NÃO fica branca
      nem cinza: cai no plano esquemático, que desenha os dois pontos, a
      distância e o rumo sem nenhum contato com o Google. A legenda de modo é a
      promessa da seção 2.2 do `SUBPROCESSADORES.md` virada tela.
    */
    expect(await screen.findByTestId("plano-imovel")).toBeTruthy();
    expect(screen.getByText("Plano esquemático")).toBeTruthy();
    expect(screen.getByText(/nenhuma informação sai daqui/)).toBeTruthy();
    // E nada disso virou erro da coleta.
    expect(screen.queryByTestId("tarja-de-erro")).toBeNull();
  });

  it("ocorrência que chegou sem coordenada ainda desenha a leitura do agente", async () => {
    mockPendencia = async () => ({ ...OCORRENCIA, latitude: null, longitude: null });
    mockRascunhoGuardado = rascunho({ coordenada: { lat: -27.598000, lng: -48.551000 } });

    await abrirATela();

    /*
      Este é o caso em que o mapa vale MAIS, e não menos: ninguém no mundo sabe
      onde esta casa fica, exceto o aparelho que está nela. Desistir do desenho
      aqui deixaria a única fonte confiável sem representação.
    */
    expect(await screen.findByTestId("plano-imovel")).toBeTruthy();
    expect(screen.getByText("Não veio na abertura")).toBeTruthy();
    expect(screen.getByText("-27.598000, -48.551000")).toBeTruthy();
  });

  it("não diz o modo antes de saber qual é", async () => {
    /*
      O `/configuracao` que nunca responde, que é o morro com uma barra de
      sinal. Enquanto a resposta não chega, a tela NÃO pode desenhar o plano
      esquemático: a legenda dele afirma, em voz alta, que nenhuma coordenada
      sai do aparelho, e trocá-la pelo mapa do Google um segundo depois é ter
      dito uma coisa falsa.

      Esta é a armadilha que o painel pagou para aprender em 13/09, e aqui ela
      tinha um caminho a mais para entrar: a leitura do token é assíncrona, e o
      gancho do mapa trata `null` como DECISÃO ("não há a quem perguntar") e
      não como espera. Chamado antes de o token existir, ele fixava
      "esquemático" sem ter perguntado a ninguém.
    */
    (globalThis as { fetch: unknown }).fetch = jest.fn(() => new Promise(() => {}));
    mockRascunhoGuardado = rascunho({ coordenada: { lat: -27.598000, lng: -48.551000 } });

    await abrirATela();

    expect(screen.queryByTestId("plano-imovel")).toBeNull();
    expect(screen.queryByText("Plano esquemático")).toBeNull();
    // No lugar do mapa, a espera, e ela tem porta de saída.
    expect(screen.getByText(/Vendo como o seu município configurou o mapa/)).toBeTruthy();
  });

  it("sem ponto nenhum não desenha mapa, porque não há lugar a afirmar", async () => {
    mockPendencia = async () => ({ ...OCORRENCIA, latitude: null, longitude: null });
    mockRascunhoGuardado = rascunho({ coordenada: null });

    await abrirATela();

    // Mapa vazio não é menos mapa: é uma afirmação falsa sobre onde a casa fica.
    expect(screen.queryByTestId("plano-imovel")).toBeNull();
    expect(screen.getByText("Ainda não capturada")).toBeTruthy();
  });

  it("capturar o GPS acende o mapa com a leitura nova", async () => {
    mockRascunhoGuardado = rascunho({ coordenada: null });
    await abrirATela();

    expect(screen.queryByText(/Precisão de 8 metros/)).toBeNull();

    await act(async () => { fireEvent.press(screen.getByText("Capturar localização")); });

    await waitFor(() => {
      expect(screen.getByText("-27.595900, -48.548900")).toBeTruthy();
    });
    expect(screen.getByText("Precisão de 8 metros")).toBeTruthy();
  });
});

/* ============================================================
   3. A divergência entre os dois pontos
   ============================================================ */

describe("o pino da coordenação contra o GPS do agente", () => {
  it("avisa a distância e diz de quem é a decisão de corrigir", async () => {
    // Cerca de 400 m do ponto informado: muito além de qualquer erro de GPS.
    mockRascunhoGuardado = rascunho({
      coordenada: { lat: -27.599000, lng: -48.548050 },
      gpsPrecisaoMetros: 8,
    });

    await abrirATela();

    expect(await screen.findByText(/O ponto informado está a \d+ m de você/)).toBeTruthy();
    /*
      A frase que impede o recurso de virar outra coisa: a leitura do agente é
      dado DA VISTORIA e não corrige a coordenada da ocorrência. Corrigir exige
      motivo escrito e decisão de pessoa, e uma correção silenciosa disparada
      por uma revistoria seria a trilha registrando uma decisão que ninguém
      tomou.
    */
    expect(screen.getByText(/não corrige a coordenada da ocorrência/)).toBeTruthy();
  });

  it("não avisa quando a diferença cabe dentro do erro do próprio aparelho", async () => {
    /*
      Uns 30 m de diferença, com o aparelho declarando 80 m de erro. Anunciar
      divergência aqui é o produto afirmando uma precisão que ele não tem, e é
      assim que se ensina o agente a ignorar o aviso no dia em que a casa for
      outra mesmo.
    */
    mockRascunhoGuardado = rascunho({
      coordenada: { lat: -27.595100, lng: -48.548050 },
      gpsPrecisaoMetros: 80,
    });

    await abrirATela();

    expect(screen.queryByText(/O ponto informado está a/)).toBeNull();
  });

  it("a conta pura: o piso é o maior entre a precisão declarada e a mínima", () => {
    const daCoordenacao = { latitude: -27.595378, longitude: -48.548050 };
    // Uns 30 m ao sul.
    const doAgente = { latitude: -27.595648, longitude: -48.548050 };

    const comGpsBom = divergenciaDeCoordenada({
      daCoordenacao, doAgente, precisaoMetros: 5,
    });
    const comGpsRuim = divergenciaDeCoordenada({
      daCoordenacao, doAgente, precisaoMetros: 80,
    });

    expect(comGpsBom?.relevante).toBe(true);
    expect(comGpsRuim?.relevante).toBe(false);
    // A distância é a mesma nos dois: o que muda é o direito de dizê-la.
    expect(Math.round(comGpsBom?.metros ?? 0)).toBe(Math.round(comGpsRuim?.metros ?? 0));
  });

  it("precisão ausente cai no piso fixo, e não em zero", () => {
    const daCoordenacao = { latitude: -27.595378, longitude: -48.548050 };
    // Uns 5 m: abaixo do que qualquer GPS de celular acerta.
    const doAgente = { latitude: -27.595423, longitude: -48.548050 };

    /*
      Não saber o erro não é ter erro nenhum. Com piso zero, esta tela
      anunciaria "a 5 m do ponto informado" em toda vistoria do produto.
    */
    expect(divergenciaDeCoordenada({
      daCoordenacao, doAgente, precisaoMetros: null,
    })?.relevante).toBe(false);
  });

  it("um ponto só não produz divergência nenhuma", () => {
    const ponto = { latitude: -27.595378, longitude: -48.548050 };
    expect(divergenciaDeCoordenada({
      daCoordenacao: ponto, doAgente: null, precisaoMetros: 8,
    })).toBeNull();
    expect(divergenciaDeCoordenada({
      daCoordenacao: null, doAgente: ponto, precisaoMetros: 8,
    })).toBeNull();
  });
});

/* ============================================================
   4. O que já aconteceu nesta casa
   ============================================================ */

describe("o que já aconteceu nesta casa", () => {
  it("conta quem esteve aqui, com nome, e o que ficou encaminhado", async () => {
    mockHistorico = async () => HISTORICO_CHEIO;

    await abrirATela();

    const cartao = await screen.findByText("O que já aconteceu nesta casa");
    expect(cartao).toBeTruthy();

    /*
      O NOME é o que muda a conversa na porta: "a Defesa Civil já esteve aqui"
      é uma frase, "o Carlos esteve aqui dia 3" é outra.
    */
    expect(within(screen.getByTestId("vistoria-anterior"))
      .getByText(/por Carlos de exemplo/)).toBeTruthy();
    expect(screen.getByText(/Trinca no muro dos fundos/)).toBeTruthy();
    expect(screen.getByText("1 fotografia de antes")).toBeTruthy();
    expect(screen.getByText(/Concessionária de energia/)).toBeTruthy();
    expect(screen.getByText("2026/000090")).toBeTruthy();
    /*
      A devolução anterior é o item mais acionável do cartão: "risco para a
      equipe no local" muda o que o agente faz nos próximos cinco minutos, e
      hoje ele chega sem saber disso.
    */
    expect(screen.getByText(/Risco para a equipe no local/)).toBeTruthy();
    expect(screen.getByText(/Barranco solto na entrada/)).toBeTruthy();
  });

  it("casa sem passado não ganha cartão dizendo que não tem passado", async () => {
    mockHistorico = async () => HISTORICO_VAZIO;

    await abrirATela();

    // A tela passa de dois mil pontos: um cartão que diz "nada" ocupa o lugar
    // mais caro dela.
    expect(screen.queryByText("O que já aconteceu nesta casa")).toBeNull();
    expect(screen.queryByTestId("historico-nao-chegou")).toBeNull();
  });

  it("com sinal e o servidor fora do ar, a falta é dita e a coleta não é atrapalhada", async () => {
    mockHistorico = async () => ({ estado: "nao-chegou" });

    await abrirATela();

    /*
      Três afirmações, e a terceira é a que importa.

      A falta é DITA, e numa linha discreta: o agente precisa saber que a
      ausência de histórico é falta de sinal e não ausência de passado, senão
      ele conclui que ninguém esteve aqui.
    */
    expect(await screen.findByTestId("historico-nao-chegou")).toBeTruthy();
    // Nada foi para a tarja vermelha, que é o destino das falhas da COLETA.
    expect(screen.queryByTestId("tarja-de-erro")).toBeNull();
    // E o formulário inteiro continua de pé e utilizável.
    expect(screen.getByText("Checklist técnico")).toBeTruthy();
    expect(screen.getByTestId("nome-de-quem-assina")).toBeTruthy();
    expect(screen.getByText("Localização")).toBeTruthy();
  });

  /*
    SEM SINAL NÃO SE PERGUNTA, e não se desenha nada.

    O efeito perguntava assim que a ocorrência e o token existiam, sem olhar o
    sinal. No morro, onde não há sinal, TODA vistoria abria com a linha "Não
    deu para consultar o histórico deste endereço agora" no alto do
    formulário, dita como se fosse uma falha, numa tela cuja promessa é "nada
    aqui depende de sinal". A ausência de sinal não é falha de consulta: é o
    estado normal de trabalho, e a linha ensinava o agente a ler "não deu"
    como ruído.
  */
  it("sem sinal, não pergunta e não desenha linha nenhuma", async () => {
    const consultas = jest.fn(async (): Promise<ResultadoDoHistorico> => HISTORICO_CHEIO);
    mockHistorico = consultas;
    mockSinal = { temSinal: false, tipo: null };

    await abrirATela();
    await act(async () => {});

    expect(consultas).not.toHaveBeenCalled();
    expect(screen.queryByTestId("historico-nao-chegou")).toBeNull();
    expect(screen.queryByText("O que já aconteceu nesta casa")).toBeNull();
    /* E o formulário está inteiro, como sempre esteve. */
    expect(screen.getByText("Checklist técnico")).toBeTruthy();
  });

  it("o sinal que volta com a tela aberta traz o histórico, uma vez só", async () => {
    const consultas = jest.fn(async (): Promise<ResultadoDoHistorico> => HISTORICO_CHEIO);
    mockHistorico = consultas;
    mockSinal = { temSinal: false, tipo: null };
    await abrirATela();
    expect(consultas).not.toHaveBeenCalled();

    mockSinal = { temSinal: true, tipo: "dados móveis" };
    await act(async () => { mockOuvintesDeSinal.forEach((avisar) => { avisar(mockSinal); }); });
    await act(async () => {});

    expect(await screen.findByText("O que já aconteceu nesta casa")).toBeTruthy();
    expect(consultas).toHaveBeenCalledTimes(1);

    /* O sinal piscando não repete a consulta: o passado não muda na porta. */
    mockSinal = { temSinal: false, tipo: null };
    await act(async () => { mockOuvintesDeSinal.forEach((avisar) => { avisar(mockSinal); }); });
    mockSinal = { temSinal: true, tipo: "dados móveis" };
    await act(async () => { mockOuvintesDeSinal.forEach((avisar) => { avisar(mockSinal); }); });
    await act(async () => {});
    expect(consultas).toHaveBeenCalledTimes(1);
  });

  it("a coleta conclui do mesmo jeito com o histórico fora do ar", async () => {
    mockHistorico = async () => ({ estado: "nao-chegou" });
    mockRascunhoGuardado = rascunhoPronto();

    await abrirATela();
    await fireEvent.press(screen.getByText("Revisar e concluir"));
    await act(async () => {});
    await fireEvent.press(screen.getByText("Concluir vistoria"));
    await act(async () => {});

    // A promessa da tela inteira: nada aqui depende de sinal, e nada se perde.
    expect(mockEnfileirar).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("vistoria-guardada")).toBeTruthy();
  });

  it("o formulário não espera a rede para abrir", async () => {
    /*
      Uma consulta que NUNCA responde, que é o morro com uma barra de sinal: o
      pedido sai, fica pendurado, e ninguém volta. Se a abertura dependesse
      dela, este caso penduraria; se ela bloqueasse algum campo, o campo não
      estaria aqui.
    */
    mockHistorico = () => new Promise<ResultadoDoHistorico>(() => {});
    mockRascunhoGuardado = rascunhoPronto();

    await abrirATela();

    expect(screen.getByText("Checklist técnico")).toBeTruthy();
    expect(screen.getByText("Progresso da vistoria")).toBeTruthy();
    // Nem cartão de histórico, nem linha de "consultando": simplesmente nada.
    expect(screen.queryByText("O que já aconteceu nesta casa")).toBeNull();
    expect(screen.queryByTestId("historico-nao-chegou")).toBeNull();
    // E concluir continua liberado, porque nada disto é requisito de coleta.
    expect(screen.getByText("Revisar e concluir")).toBeTruthy();
  });

  it("não é consultado na tela em que ele não aparece", async () => {
    /*
      A ocorrência que este aparelho JÁ coletou não desenha formulário nenhum, e
      não desenha o cartão de histórico: ela mostra a lápide e as duas saídas. O
      efeito, porém, disparava do mesmo jeito, porque só perguntava se a
      ocorrência existe.

      Duas coisas erradas, e a segunda é a que pesa. A primeira é gastar a
      janela de sinal da rua para trazer um dossiê que ninguém vai ver, numa
      tela que o agente abre por engano tocando numa lista velha. A segunda é
      que `GET /ocorrencias/:id` GRAVA registro de consulta no banco (ver
      `registrarConsulta`, na rota): cada toque acidental escrevia, na trilha de
      acesso a dado de cidadão que a LGPD exige, que este agente leu o dossiê
      desta família. Leitura que não aconteceu não pode virar linha de registro
      de acesso.
    */
    const consultas = jest.fn(async (): Promise<ResultadoDoHistorico> => HISTORICO_VAZIO);
    mockHistorico = consultas;
    mockLapide = {
      ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", idempotencyKey: "chave-da-primeira-coleta",
      protocolo: "2026/000123", coletadaEm: "2026-09-09T11:00:00.000Z",
      situacao: "na_fila",
    };

    await render(<TelaDeVistoria />);
    await act(async () => {});

    expect(screen.getByText(/já foi coletada neste aparelho/)).toBeTruthy();
    expect(consultas).not.toHaveBeenCalled();
  });

  it("observação descartada pelo prazo não vira 'a equipe não escreveu nada'", async () => {
    mockHistorico = async () => chegou({
      devolucao: {
        decidida_em: "2026-09-05T12:00:00.000Z",
        motivo: "morador_ausente",
        observacao: null,
        observacao_removida_em: "2026-09-10T00:00:00.000Z",
        devolvida_por_nome: null,
      },
    });

    await abrirATela();

    /*
      `observacao_removida_em` preenchido significa que o texto foi descartado
      pelo prazo de guarda que o município fixa como controlador, e NÃO que
      nunca existiu. Dizer "sem observação" sobre uma frase descartada de
      propósito é afirmar um fato falso numa tela que vira prova.
    */
    expect(await screen.findByText(/descartada pelo prazo de guarda/)).toBeTruthy();
    expect(screen.queryByText(/não escreveu observação/)).toBeNull();
  });
});

/* ============================================================
   5. A hierarquia do progresso
   ============================================================ */

describe("o progresso ganha um protagonista", () => {
  it("a contagem sai no degrau de número, com rótulo discreto e lida como uma frase", async () => {
    mockRascunhoGuardado = rascunho();

    await abrirATela();

    /*
      A contagem saía em `corpoP` mono ao lado do título, do mesmo tamanho do
      título e de tudo o mais no cartão. Onde nada é maior que nada, o olho não
      tem por onde começar: é a H3 da régua de hierarquia, e era a causa da
      reclamação de origem ("tá com cara de projeto").

      Para quem ouve a tela o par é UMA frase, e não um número solto seguido de
      uma palavra sem sujeito.
    */
    const dado = await screen.findByTestId("contagem-de-requisitos");
    expect(dado.props.accessibilityLabel).toBe("0 de 7, requisitos concluídos");
  });
});
