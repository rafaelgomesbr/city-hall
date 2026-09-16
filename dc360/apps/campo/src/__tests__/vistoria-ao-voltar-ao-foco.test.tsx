/**
 * A TELA DE VISTORIA QUE VOLTA AO FOCO, e o que ela mostra.
 *
 * `vistoria/[id]` é UMA rota do navegador de abas, e o navegador NÃO desmonta
 * a tela quando o agente sai dela: `navigate(A) → lista → navigate(A)` é uma
 * montagem só, com uma leitura de disco só. A `key` pelo id (que existe, e é
 * correta) cobre a troca de ocorrência, e não cobre a VOLTA à mesma.
 *
 * O que isso produzia, provado pelo revisor com o navegador de verdade:
 *
 * 1. Concluir a vistoria, voltar à lista, tocar na mesma tarefa: a tela
 *    reaparecia na MINUTA, com "Concluir vistoria" liberado, em cima de uma
 *    coleta que já estava na fila. A lápide estava no disco e ninguém a leu.
 * 2. Pior, o caminho novo da fila: "Corrigir a vistoria" grava o rascunho
 *    corrigido (com a lista do 422) e faz `router.push` para cá. A tela
 *    voltava na minuta velha; "Concluir" reenfileirava a coleta IGUAL (o item
 *    já tinha saído da fila, então `chave_em_uso` não protegia), o
 *    `descartarRascunho` da conclusão apagava o rascunho corrigido, e o 422
 *    voltava. Um laço sem saída, sem nunca mostrar "corrija N itens".
 *
 * A correção é `useFocusEffect`: a cada foco a tela relê o disco e fecha as
 * sobreposições (minuta, câmera, "vistoria guardada"). O que está na tela
 * volta a ser o que está no disco, que é a única promessa desta tela.
 *
 * Aqui o banco é SQLite DE VERDADE, com os módulos de rascunho, lápide e
 * pendências de verdade, pela mesma razão de `vistoria-ja-coletada.test.tsx`:
 * o que se prova é a conversa entre a tela e o disco depois de uma conclusão,
 * e um disco de mentira provaria só que os dublês combinam entre si. Fingido é
 * o aparelho (câmera, GPS, arquivos, navegação) e a fila de envio.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { DatabaseSync } from "node:sqlite";
import { CHAVE_ACIONAR_ORGAO, CHECKLIST_OBRIGATORIO } from "@dc360/shared";

let mockBanco: DatabaseSync | null = null;

function mockAbrirBanco(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const db = mockAbrirBanco();
    return {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, params: unknown[] = []) { db.prepare(sql).run(...params); },
      async getAllAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).all(...params); },
      async getFirstAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).get(...params) ?? null;
      },
      async withTransactionAsync(corpo: () => Promise<void>) {
        db.exec("BEGIN");
        try { await corpo(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    };
  },
}));

let mockContadorDeChaves = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockContadorDeChaves += 1;
    return `cccccccc-cccc-4ccc-8ccc-${String(mockContadorDeChaves).padStart(12, "0")}`;
  },
}));

/**
 * O navegador, com o FOCO nas mãos do teste.
 *
 * O dublê comum das outras suítes (`useEffect(retorno, [retorno])`) roda o
 * efeito uma vez, na montagem, e é o bastante para elas. Aqui a pergunta é o
 * que acontece na SEGUNDA vez, então cada efeito de foco fica registrado e
 * `voltarAoFoco()` chama todos de novo, que é o que o navegador de abas faz
 * quando a mesma tela volta a ser a da frente sem ter sido desmontada.
 */
const mockEfeitosDeFoco: Array<() => void | (() => void)> = [];
jest.mock("expo-router", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useEffect } = require("react") as typeof import("react");
  const navegacao = { setOptions: jest.fn() };
  return {
    router: {
      push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true),
    },
    useLocalSearchParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    useNavigation: () => navegacao,
    useFocusEffect: (retorno: () => void | (() => void)) => {
      useEffect(() => {
        mockEfeitosDeFoco.push(retorno);
        const limpar = retorno();
        return () => {
          mockEfeitosDeFoco.splice(mockEfeitosDeFoco.indexOf(retorno), 1);
          if (typeof limpar === "function") limpar();
        };
      }, [retorno]);
    },
  };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
}));

jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "/documentos" },
  Directory: class { list() { return []; } },
  File: class { size = 1024; constructor(_uri: string) {} },
}));

jest.mock("../dados/evidencia-no-disco", () => ({
  guardarFotoNoAparelho: () => ({ uriLocal: "file:///vistorias/foto.jpg", tamanhoBytes: 1024 }),
  apagarFotoDoAparelho: () => true,
  medirArquivoNoAparelho: () => 1024,
}));

jest.mock("../ui/Assinatura", () => ({ Assinatura: () => null }));
jest.mock("../ui/retornoTatil", () => ({ retornoTatil: jest.fn() }));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

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

jest.mock("../dados/mapa", () => ({
  ...jest.requireActual("../dados/mapa"),
  abrirNoMapa: jest.fn(),
}));

/* O histórico não é o assunto: responde "chegou, vazio" na hora. */
jest.mock("../dados/historico-da-casa", () => ({
  ...jest.requireActual("../dados/historico-da-casa"),
  buscarHistoricoDaCasa: async () => ({
    estado: "chegou",
    historico: {
      vistoriaAnterior: null, providencias: [], vinculadas: [], devolucao: null, fotosDeAntes: [],
    },
  }),
}));

import TelaDeVistoria from "../app/(agente)/vistoria/[id]";
import { bancoLocal, esquecerConexao } from "../dados/banco-local";
import { coletaDe, esquecerColeta } from "../dados/coletas";
import { lerRascunho, salvarRascunho, type Rascunho } from "../dados/rascunho";

const ID = "11111111-1111-4111-8111-111111111111";
const PROTOCOLO = "2026/000123";

const TAREFA = {
  id: ID,
  protocolo: PROTOCOLO,
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

async function guardarATarefa(): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync(
    "INSERT INTO pendencias (id, conteudo, prazo_em) VALUES (?, ?, NULL)",
    [TAREFA.id, JSON.stringify(TAREFA)],
  );
}

/** O rascunho em que nada mais é exigido para concluir, gravado no disco. */
function rascunhoPronto(): Rascunho {
  return {
    ocorrenciaId: ID,
    protocolo: PROTOCOLO,
    idempotencyKey: "11111111-1111-4111-8111-000000000123",
    checklist: Object.fromEntries(
      CHECKLIST_OBRIGATORIO.map((i) => [i.chave, i.chave !== CHAVE_ACIONAR_ORGAO]),
    ),
    orgaosParaAcionar: [],
    fotos: [{
      idempotencyKey: "ffffffff-1111-4111-8111-000000000001",
      uriLocal: "file:///vistorias/foto.jpg",
      nomeArquivo: "vistoria-1.jpg",
      tipoConteudo: "image/jpeg",
      tamanhoBytes: 1024,
      capturadaEm: "2026-09-09T12:00:00.000Z",
      ordem: 0,
    }],
    gpsPrecisaoMetros: null,
    coordenada: null,
    assinanteNome: "Maria de exemplo",
    assinaturaUri: "file:///vistorias/assinatura.png",
    assinaturaIdempotencyKey: "aaaaaaaa-2222-4222-8222-000000000002",
    observacoes: "",
    pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:00:00.000Z",
  };
}

async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await act(async () => {});
  await screen.findByText("Checklist técnico");
}

async function concluirAVistoria(): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByText("Revisar e concluir")); });
  await act(async () => { fireEvent.press(screen.getByText("Concluir vistoria")); });
  await act(async () => {});
  await screen.findByTestId("vistoria-guardada");
}

/** O navegador de abas trouxe a MESMA montagem de volta para a frente. */
async function voltarAoFoco(): Promise<void> {
  await act(async () => { for (const efeito of [...mockEfeitosDeFoco]) efeito(); });
  await act(async () => {});
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  mockContadorDeChaves = 0;
  mockEfeitosDeFoco.length = 0;
  esquecerConexao();
  jest.clearAllMocks();
});

afterAll(() => {
  mockBanco?.close();
  mockBanco = null;
});

describe("a mesma vistoria, de volta ao foco depois de concluída", () => {
  it("mostra a lápide da coleta, e nunca a minuta com 'Concluir' liberado", async () => {
    await guardarATarefa();
    await salvarRascunho(rascunhoPronto());
    await abrirATela();
    await concluirAVistoria();
    expect(mockEnfileirar).toHaveBeenCalledTimes(1);

    /* O agente volta para a lista... */
    await act(async () => { fireEvent.press(screen.getByTestId("voltar-depois-de-guardar")); });
    /* ...e toca na mesma tarefa, que continua lá enquanto não há sinal. */
    await voltarAoFoco();

    /* O disco diz: coletada, na fila, sem rascunho. A tela precisa dizer o mesmo. */
    expect((await coletaDe(ID))?.situacao).toBe("na_fila");
    expect(await lerRascunho(ID)).toBeNull();
    expect(await screen.findByText(/já foi coletada neste aparelho/)).toBeTruthy();
    expect(screen.queryByText("Concluir vistoria")).toBeNull();
    expect(screen.queryByTestId("vistoria-guardada")).toBeNull();
    expect(screen.queryByText("Checklist técnico")).toBeNull();
  });

  it("vinda da fila para correção, abre o formulário com a lista do que corrigir", async () => {
    await guardarATarefa();
    await salvarRascunho(rascunhoPronto());
    await abrirATela();
    await concluirAVistoria();

    /* "Ver na fila de envio", que é o caminho até "Corrigir a vistoria". */
    await act(async () => { fireEvent.press(screen.getByTestId("ver-na-fila-depois-de-guardar")); });

    /*
      O que `devolverParaCorrecao` grava no disco, nesta ordem: o rascunho de
      volta, com a lista do 422, e a lápide esquecida. Depois disso a fila faz
      `router.push` para cá, e o navegador traz esta MESMA montagem de volta.
    */
    await salvarRascunho({
      ...rascunhoPronto(),
      camposRecusados: [{ campo: "fotos.0.tamanhoBytes", mensagem: "Precisa ser maior que 0" }],
    });
    await esquecerColeta(ID);
    await voltarAoFoco();

    expect(await screen.findByTestId("lista-do-que-corrigir")).toBeTruthy();
    expect(screen.getByText("Corrija 1 item antes de concluir:")).toBeTruthy();
    expect(screen.getByText("Checklist técnico")).toBeTruthy();
    /* A minuta velha ficou para trás: "Concluir" não está na tela. */
    expect(screen.queryByText("Concluir vistoria")).toBeNull();
    expect(screen.queryByTestId("vistoria-guardada")).toBeNull();
    /* E nada foi reenfileirado só por voltar. */
    expect(mockEnfileirar).toHaveBeenCalledTimes(1);
    expect(await lerRascunho(ID)).not.toBeNull();
  });
});

describe("as sobreposições fecham ao voltar ao foco", () => {
  it("a câmera aberta dá lugar ao formulário, e o menu volta", async () => {
    const { useNavigation } = require("expo-router") as { useNavigation: () => { setOptions: jest.Mock } };
    await guardarATarefa();
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByText("Tirar foto")); });
    expect(screen.getByTestId("fechar-a-camera")).toBeTruthy();
    expect(useNavigation().setOptions).toHaveBeenCalledWith({ tabBarStyle: { display: "none" } });
    useNavigation().setOptions.mockClear();

    await voltarAoFoco();

    expect(await screen.findByText("Checklist técnico")).toBeTruthy();
    expect(screen.queryByTestId("fechar-a-camera")).toBeNull();
    /* O menu voltou: a releitura tambem escreve o titulo, por isso "entre as
       chamadas" e nao "a ultima". */
    expect(useNavigation().setOptions).toHaveBeenCalledWith({ tabBarStyle: undefined });
  });

  it("a vistoria começada continua exatamente onde estava", async () => {
    /* A âncora: voltar ao foco não pode apagar nem recunhar o que já foi gravado. */
    await guardarATarefa();
    await salvarRascunho({ ...rascunhoPronto(), assinaturaUri: null });
    await abrirATela();
    const cunhadasAntes = mockContadorDeChaves;

    await voltarAoFoco();

    expect(screen.getByText("Checklist técnico")).toBeTruthy();
    expect(screen.getByTestId("barra-de-progresso").props.accessibilityLabel)
      .toBe("6 de 7 requisitos concluídos");
    expect(mockContadorDeChaves).toBe(cunhadasAntes);
    expect((await lerRascunho(ID))?.idempotencyKey).toBe("11111111-1111-4111-8111-000000000123");
  });
});
