/**
 * A tela de vistoria aberta em cima de uma ocorrência que este aparelho JÁ
 * coletou.
 *
 * É a sequência mais comum do produto, e era ela que produzia dois laudos para
 * o mesmo protocolo: o agente conclui a coleta, ela entra na fila, o rascunho é
 * apagado, e a lista de tarefas continua a mesma por horas porque não há sinal.
 * Um toque caía nesta tela, `lerRascunho` devolvia nulo, e ela cunhava uma
 * chave de idempotência NOVA com `Crypto.randomUUID()`. Duas chaves diferentes
 * são, para o servidor, duas coletas legítimas.
 *
 * Aqui o banco é SQLite DE VERDADE, e a lápide, o rascunho e a lista de
 * pendências são os módulos de verdade. Fingido é só o aparelho: câmera, GPS,
 * navegação e a fila de envio. É deliberado: o que este arquivo prova é a
 * conversa entre a tela e o disco, e um disco de mentira provaria só que os
 * dublês combinam entre si.
 *
 * O arquivo mora em `__tests__` e não ao lado da tela porque tudo dentro de
 * `src/app` vira ROTA no Expo: um teste ali seria uma tela navegável dentro do
 * aplicativo publicado.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { DatabaseSync } from "node:sqlite";

/*
  Uma instância de banco só, viva entre as reaberturas.

  `esquecerConexao()` faz a próxima chamada reabrir. Se cada abertura
  devolvesse um banco novo e vazio, estes testes provariam que o dado some
  porque o banco sumiu, que é o contrário do que se quer provar. Um aparelho de
  verdade reabre o MESMO arquivo.

  A abertura passa por uma função de nome começado em "mock" porque o Jest
  proíbe a fábrica de `jest.mock` de tocar em qualquer coisa de fora dela que
  não seja assim nomeada.
*/
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
      async runAsync(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...params);
      },
      async getAllAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).all(...params);
      },
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

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

/**
 * Cada chave de idempotência cunhada fica registrada aqui.
 *
 * É a prova direta do defeito: numa ocorrência já coletada, a contagem tem que
 * ficar em zero. Chave nova é, literalmente, a segunda vistoria nascendo.
 */
const mockChavesCunhadas: string[] = [];
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    const chave = `chave-cunhada-${mockChavesCunhadas.length + 1}`;
    mockChavesCunhadas.push(chave);
    return chave;
  },
}));

/* A navegação precisa ser o MESMO objeto a cada renderização: o efeito que
   carrega a ocorrência depende dela, e um objeto novo a cada quadro o faria
   rodar de novo para sempre. */
jest.mock("expo-router", () => {
  const navegacao = { setOptions: jest.fn() };
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    useNavigation: () => navegacao,
  };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "/documentos" },
  Directory: class { list() { return []; } },
  File: class { size = 0; constructor(_uri: string) {} },
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({ enfileirar: jest.fn(async () => ({})) }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    identidade: {
      nome: "Agente de teste", matricula: "0001",
      organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
    },
  }),
}));

jest.mock("../dados/mapa", () => ({ abrirNoMapa: jest.fn() }));

import TelaDeVistoria from "../app/(agente)/vistoria/[id]";
import { bancoLocal, esquecerConexao } from "../dados/banco-local";
import { arquivarColeta, coletaDe, marcarColetada } from "../dados/coletas";
import { lerRascunho } from "../dados/rascunho";

const ID = "11111111-1111-4111-8111-111111111111";
const PROTOCOLO = "2026/000123";

const TAREFA = {
  id: ID,
  protocolo: PROTOCOLO,
  tipo: "deslizamento",
  severidade: "alta",
  endereco: "Servidão do Morro, 45",
  ponto_referencia: "Portão azul depois da caixa d'água",
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

async function guardarALapide(): Promise<void> {
  await marcarColetada({
    ocorrenciaId: ID,
    idempotencyKey: "chave-da-primeira-coleta",
    protocolo: PROTOCOLO,
    coletadaEm: "2026-09-09T13:00:00.000Z",
  });
}

/**
 * Monta a tela e espera o disco responder.
 *
 * O `await` no `render` nao e enfeite: nesta versao da biblioteca ele devolve
 * promessa, e sem esperar por ela a tela nem chega a existir para as consultas
 * abaixo.
 */
async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await act(async () => {});
}

beforeEach(() => {
  /* Fecha antes de soltar a referência: o banco aberto e esquecido segura o
     processo do Jest de pé depois do último teste. */
  mockBanco?.close();
  mockBanco = null;
  mockChavesCunhadas.length = 0;
  esquecerConexao();
  jest.restoreAllMocks();
});

describe("a ocorrência que este aparelho já coletou", () => {
  /*
    O defeito inteiro, numa tela: sem lápide, isto abria o formulário em branco
    com chave de idempotência nova, e o servidor gravava a segunda vistoria do
    mesmo protocolo sem nada que a distinguisse de uma coleta legítima.
  */
  it("não abre o formulário e não cunha chave de idempotência nova", async () => {
    await guardarATarefa();
    await guardarALapide();

    await abrirATela();

    expect(screen.getByText(/já foi coletada neste aparelho/)).toBeTruthy();
    expect(screen.queryByText("Checklist técnico")).toBeNull();
    expect(mockChavesCunhadas).toEqual([]);
    expect(await lerRascunho(ID)).toBeNull();
  });

  it("aponta para a fila de envio, que é onde a coleta está", async () => {
    await guardarATarefa();
    await guardarALapide();

    await abrirATela();

    expect(screen.getByText("Ver na fila de envio")).toBeTruthy();
  });

  /*
    Revistoria é legítima: a mesma ocorrência pode precisar de segunda vistoria
    depois de chuva nova. O que não pode é ela acontecer por acidente de um
    toque numa lista velha, e por isso a saída passa por confirmação.
  */
  it("a saída deliberada pergunta antes, e nada muda no disco enquanto ninguém confirma", async () => {
    await guardarATarefa();
    await guardarALapide();

    await abrirATela();
    await act(async () => {
      fireEvent.press(screen.getByText("Fazer nova vistoria desta ocorrência"));
    });

    /*
      A pergunta é do aplicativo (`Dialogo`) e não mais do sistema
      (`Alert.alert`), e por isso ela é procurada na tela em vez de num espião.
      Ver `ui/Dialogo.tsx` para o motivo da troca: tema, tamanho de fonte e alvo
      de 52 pontos, que o alerta nativo não obedecia.
    */
    expect(screen.getByTestId("dialogo")).toBeTruthy();
    expect((await coletaDe(ID))?.situacao).toBe("na_fila");
    expect(screen.queryByText("Checklist técnico")).toBeNull();
    expect(mockChavesCunhadas).toEqual([]);
  });

  it("confirmada, a nova vistoria abre e a coleta anterior fica arquivada", async () => {
    await guardarATarefa();
    await guardarALapide();

    await abrirATela();
    await act(async () => {
      fireEvent.press(screen.getByText("Fazer nova vistoria desta ocorrência"));
    });
    /* Aperta o botão destrutivo do diálogo, que é o que o agente faz. */
    await act(async () => {
      fireEvent.press(screen.getByTestId("dialogo-acao"));
    });

    expect(screen.getByText("Checklist técnico")).toBeTruthy();
    expect((await coletaDe(ID))?.situacao).toBe("arquivada");
    expect(mockChavesCunhadas).toHaveLength(1);
  });
});

describe("a ocorrência ainda não coletada", () => {
  it("abre o formulário como sempre abriu", async () => {
    await guardarATarefa();

    await abrirATela();

    expect(screen.getByText("Checklist técnico")).toBeTruthy();
    expect(screen.queryByText(/já foi coletada neste aparelho/)).toBeNull();
    expect(mockChavesCunhadas).toHaveLength(1);
  });

  /*
    A lápide arquivada é a autorização que o agente já deu. Ela não pode voltar
    a barrar na abertura seguinte, senão a revistoria autorizada ficaria presa
    num laço sem nada na tela explicando por quê.
  */
  it("lápide arquivada não barra a abertura", async () => {
    await guardarATarefa();
    await guardarALapide();
    await arquivarColeta(ID);

    await abrirATela();

    expect(screen.getByText("Checklist técnico")).toBeTruthy();
  });
});

afterAll(() => {
  mockBanco?.close();
  mockBanco = null;
});
