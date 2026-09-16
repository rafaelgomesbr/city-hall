import { act, render } from "@testing-library/react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo" } } },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("./PortaExpo", () => ({ portaExpo: null }));

jest.mock("./convite", () => ({
  jaConvidou: jest.fn(async () => true),
  marcarConvidado: jest.fn(async () => undefined),
}));

jest.mock("./ficha-do-aparelho", () => ({
  guardarFicha: jest.fn(async () => undefined),
  fichaGuardada: jest.fn(async () => null),
  esquecerFicha: jest.fn(async () => undefined),
}));

/** O que o servidor responde a cada tentativa, na ordem. Vazio é "aceita". */
let mockRespostas: Array<() => Promise<void>> = [];
let mockTentativas = 0;

jest.mock("../dados/api", () => ({
  ...jest.requireActual("../dados/api"),
  registrarAparelho: jest.fn(async () => {
    mockTentativas += 1;
    const resposta = mockRespostas.shift();
    if (resposta) await resposta();
  }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    carregando: false,
    identidade: {
      usuarioId: "u1",
      nome: "Agente de teste",
      matricula: "0001",
      papel: "agente_campo",
      organizacaoId: "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
    obterToken: async () => "token-de-mentira",
    entrar: async () => undefined,
    sair: async () => undefined,
  }),
}));

import { AppState, type AppStateStatus } from "react-native";

import { ErroDaApi, SemSinal } from "../dados/api";
import { criarDuploDePorta } from "./duplo-de-porta";
import { ProvedorDePush } from "./ProvedorDePush";

/**
 * O REGISTRO DA FICHA TENTA DE NOVO QUANDO A FALHA FOI DO MOMENTO.
 *
 * O provedor lembra "já registrei para este município" para não repetir a
 * requisição a cada volta do segundo plano, e isso é certo (ver
 * `volta-do-segundo-plano.test.tsx`). O defeito era a ORDEM: a memória era
 * gravada ANTES da tentativa e nunca desfeita. O agente entrava na base com
 * sinal ruim, o registro falhava com `sem_sinal`, e a partir daí o aplicativo
 * tratava aquele município como registrado até ser morto e reaberto. Um
 * plantão inteiro sem ficha no servidor, que é indistinguível de "nunca
 * instalou", e o despacho não chegava.
 *
 * O mesmo vale para `push_desligado`, com uma diferença de ritmo: é o que
 * TODO aplicativo aberto recebe no instante em que o servidor está com
 * `PUSH_ATIVO=nao`, e o servidor vai virar `sim` num deploy. Tentar a cada
 * volta seria martelar um servidor que disse "não"; nunca mais tentar deixa
 * todo mundo que estava aberto na hora do deploy sem ficha até reabrir. O
 * meio termo: reavaliar depois de alguns minutos.
 */

let ouvinteDeEstado: ((estado: AppStateStatus) => void) | null = null;
let agora = Date.parse("2026-09-15T12:00:00.000Z");

beforeEach(() => {
  mockRespostas = [];
  mockTentativas = 0;
  ouvinteDeEstado = null;
  agora = Date.parse("2026-09-15T12:00:00.000Z");
  jest.spyOn(Date, "now").mockImplementation(() => agora);
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    tipo: string,
    ouvinte: (estado: AppStateStatus) => void,
  ) => {
    if (tipo === "change") ouvinteDeEstado = ouvinte;
    return { remove: () => undefined };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => { jest.restoreAllMocks(); });

async function montar(): Promise<void> {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await act(async () => {
    render(<ProvedorDePush porta={duplo.porta}>{null}</ProvedorDePush>);
  });
  await act(async () => {});
}

async function voltarDoSegundoPlano(): Promise<void> {
  if (!ouvinteDeEstado) throw new Error("o provedor não escuta a volta do segundo plano");
  const ouvinte = ouvinteDeEstado;
  await act(async () => { ouvinte("background"); });
  await act(async () => { ouvinte("active"); });
  await act(async () => {});
}

const semSinal = async () => { throw new SemSinal(); };
const servidorFora = async () => { throw new ErroDaApi(502, "gateway", "Bad gateway"); };
const recusou = async () => { throw new ErroDaApi(422, "dados_invalidos", "Plataforma inválida"); };
const desligado = async () => {
  throw new ErroDaApi(503, "push_desligado", "A notificação está desligada.");
};

describe("falha do momento: tenta de novo na volta do segundo plano", () => {
  it("sem sinal na entrada, registra na próxima volta", async () => {
    mockRespostas = [semSinal];
    await montar();
    expect(mockTentativas).toBe(1);

    await voltarDoSegundoPlano();
    // 1 aqui é "desistiu depois de uma falha de sinal".
    expect(mockTentativas).toBe(2);
  });

  it("servidor fora do ar (5xx) é o mesmo caso", async () => {
    mockRespostas = [servidorFora];
    await montar();
    await voltarDoSegundoPlano();
    expect(mockTentativas).toBe(2);
  });

  it("recusa de verdade (falhou) também volta a tentar: pode ter sido corrigida do outro lado", async () => {
    mockRespostas = [recusou];
    await montar();
    await voltarDoSegundoPlano();
    expect(mockTentativas).toBe(2);
  });

  it("e, uma vez registrado, para de tentar", async () => {
    mockRespostas = [semSinal];
    await montar();
    await voltarDoSegundoPlano();
    expect(mockTentativas).toBe(2);

    await voltarDoSegundoPlano();
    await voltarDoSegundoPlano();
    expect(mockTentativas).toBe(2);
  });
});

describe("push desligado no servidor: reavalia depois de alguns minutos, não a cada volta", () => {
  it("volta imediata não martela o servidor que disse não", async () => {
    mockRespostas = [desligado];
    await montar();
    expect(mockTentativas).toBe(1);

    agora += 30_000;
    await voltarDoSegundoPlano();
    expect(mockTentativas).toBe(1);
  });

  it("passados os minutos, tenta de novo: é como o aplicativo aberto descobre que PUSH_ATIVO virou sim", async () => {
    mockRespostas = [desligado];
    await montar();

    agora += 6 * 60_000;
    await voltarDoSegundoPlano();
    // 1 aqui é "nunca mais tentou depois do push desligado".
    expect(mockTentativas).toBe(2);
  });
});
