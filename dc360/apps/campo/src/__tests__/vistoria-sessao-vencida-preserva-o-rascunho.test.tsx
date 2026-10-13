/**
 * Na tela da vistoria, "Entrar de novo" depois da sessão vencida NÃO apaga a
 * vistoria começada (V2-F00-E15, correção 1).
 *
 * O achado da validação de 13/10/2026: a lista de tarefas e a fila ofereciam o
 * ato que preserva o disco (`encerrarSessaoVencida`), mas a tela da vistoria,
 * quando a tarefa ainda não tinha descido e o servidor respondia 401, oferecia
 * "Sair e entrar de novo" e chamava `sair()`, que apaga rascunho, fotos e
 * assinatura sem avisar. Contradizia o objetivo da etapa.
 *
 * Aqui NADA do que importa é dublê: o provedor de sessão, o banco local (SQLite
 * do Node), o rascunho e a tela são os de verdade. Só ficam simulados o cofre
 * do aparelho, a rede (um 401), o disco de arquivos (um conjunto de nomes) e as
 * bibliotecas nativas que o Jest não tem. Um dublê de `useSessao` esconderia
 * exatamente a diferença entre `sair` e `encerrarSessaoVencida`, que é o defeito.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { DatabaseSync } from "node:sqlite";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

let mockBanco: DatabaseSync | null = null;
function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const db = mockAbrir();
    return {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, params: unknown[] = []) { db.prepare(sql).run(...params); },
      async getAllAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).all(...params); },
      async getFirstAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).get(...params) ?? null; },
    };
  },
}));

/** O diretório de documentos do aparelho, com o que cada teste põe nele. */
const mockNoDisco = new Set<string>();
jest.mock("expo-file-system", () => {
  class Arquivo {
    name: string;
    size = 0;
    constructor(nomeOuUri: string) { this.name = nomeOuUri.split("/").pop() ?? nomeOuUri; }
    delete(): void { mockNoDisco.delete(this.name); }
  }
  return {
    Paths: { document: "file:///documentos" },
    File: Arquivo,
    Directory: class { list() { return [...mockNoDisco].map((n) => new Arquivo(n)); } },
  };
});

/** O cofre do aparelho. */
const mockCofre = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "quando-desbloqueado",
  getItemAsync: jest.fn(async (chave: string) => mockCofre.get(chave) ?? null),
  setItemAsync: jest.fn(async (chave: string, valor: string) => { mockCofre.set(chave, valor); }),
  deleteItemAsync: jest.fn(async (chave: string) => { mockCofre.delete(chave); }),
}));

jest.mock("expo-router", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useEffect } = require("react") as typeof import("react");
  const navegacao = { setOptions: jest.fn() };
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ id: "oc-recem-despachada" }),
    useNavigation: () => navegacao,
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
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

jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-1111-1111-111111111111",
}));

const mockIdentidade = (usuarioId: string, nome: string) => ({
  usuarioId, nome, papel: "agente_campo", matricula: "0001",
  organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
});
const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/* A rede: o login responde, a renovação e a saída não importam aqui. */
jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {},
  entrar: jest.fn(async () => ({
    credenciais: { acesso: "acesso-de-mentira", renovacao: "renovacao-de-mentira" },
    identidade: mockIdentidade("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Ana de exemplo"),
  })),
  renovar: jest.fn(async () => ({ acesso: "acesso-de-mentira", renovacao: "renovacao-de-mentira" })),
  sair: jest.fn(async () => undefined),
}));

/* A tarefa B ainda não desceu, e baixar dá 401: a sessão foi revogada. */
jest.mock("../dados/pendencias", () => ({
  pendenciaGuardada: jest.fn(async () => null),
  orgaosGuardados: jest.fn(async () => []),
  atualizarPendencias: jest.fn(async () => { throw { status: 401, codigo: "nao_autenticado" }; }),
}));
jest.mock("../dados/coletas", () => ({
  coletaDe: jest.fn(async () => null),
  marcarColetada: jest.fn(async () => {}),
  arquivarColeta: jest.fn(async () => {}),
}));
jest.mock("../dados/fila", () => ({
  obterFila: jest.fn(async () => ({ enfileirar: jest.fn(async () => {}) })),
}));

import { router } from "expo-router";
import TelaDeVistoria from "../app/(agente)/vistoria/[id]";
import { ProvedorDeSessao, useSessao } from "../dados/sessao";
import { bancoLocal, esquecerConexao, marcarDonoDosDadosLocais } from "../dados/banco-local";
import { listarRascunhos, salvarRascunho, type Rascunho } from "../dados/rascunho";

const FOTO = "foto-1759000000000-0.jpg";
const ASSINATURA = "assinatura-1759000000000.png";

/** A vistoria COMEÇADA da Ana na tarefa A: checklist, uma foto e a assinatura. */
function rascunhoDaAna(): Rascunho {
  return {
    ocorrenciaId: "11111111-1111-4111-8111-111111111111",
    protocolo: "000471/2026",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    checklist: { risco_iminente: true },
    orgaosParaAcionar: [],
    fotos: [{ uriLocal: `file:///documentos/${FOTO}` }] as unknown as Rascunho["fotos"],
    gpsPrecisaoMetros: 1,
    coordenada: { lat: -27.5959, lng: -48.5489 },
    assinanteNome: "Moradora de exemplo",
    assinaturaUri: `file:///documentos/${ASSINATURA}`,
    assinaturaIdempotencyKey: null,
    observacoes: "Trinca na parede dos fundos.",
    pessoas: {},
    coletadaEm: "2026-10-07T09:00:00.000Z",
    atualizadoEm: "2026-10-07T09:00:00.000Z",
  };
}

type Sessao = ReturnType<typeof useSessao>;
let sessaoAtual: Sessao | null = null;
function Sonda() {
  sessaoAtual = useSessao();
  return null;
}

/** O plantão da Ana: dono marcado, vistoria começada com foto e assinatura. */
async function plantaoDaAna(): Promise<void> {
  const db = await bancoLocal();
  /* A tabela da fila existe de verdade, para a limpeza de arquivos agir. */
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS fila_sincronizacao (
      chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado_em TEXT NOT NULL
    );
  `);
  await marcarDonoDosDadosLocais(ANA);
  await salvarRascunho(rascunhoDaAna());
  mockNoDisco.add(FOTO);
  mockNoDisco.add(ASSINATURA);
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
  mockNoDisco.clear();
  mockCofre.clear();
  sessaoAtual = null;
  (router.replace as jest.Mock).mockClear();
});

/** Abre a tela da tarefa B, com a Ana logada, e deixa a leitura do disco terminar. */
async function abrirATelaLogada(): Promise<void> {
  await act(async () => {
    render(
      <ProvedorDeSessao>
        <Sonda />
        <TelaDeVistoria />
      </ProvedorDeSessao>,
    );
  });
  await act(async () => { await sessaoAtual?.entrar("ana@teste.gov.br", "senha"); });
  await act(async () => {});
}

/**
 * O botão da faixa pelo texto EXATO do rótulo, com ou sem o "Sair e": o teste
 * acha o botão que a tela oferece qualquer que seja o verbo, e é o dado que
 * sobrevive (ou não) ao toque que decide. Procurar só pelo texto novo faria o
 * teste falhar por "botão não encontrado" no código antigo, e não por perda.
 */
function botaoDeEntrarDeNovo() {
  return screen.getAllByText(/^(Sair e entrar|Entrar) de novo$/i)[0]!;
}

async function terminarASessao(): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByTestId("baixar-para-abrir")); });
  await act(async () => {});
  expect(screen.getByText("Sua sessão terminou")).toBeTruthy();
}

describe("a tela da vistoria com a sessão encerrada, sessão e banco de verdade", () => {
  it("'Entrar de novo' leva à entrada e o rascunho, a foto e a assinatura continuam no disco", async () => {
    await plantaoDaAna();
    await abrirATelaLogada();
    await terminarASessao();

    await act(async () => { fireEvent.press(botaoDeEntrarDeNovo()); });
    await act(async () => {});

    expect(router.replace).toHaveBeenCalledWith("/entrar");
    expect(sessaoAtual?.identidade).toBeNull();
    const rascunhos = await listarRascunhos();
    expect(rascunhos).toHaveLength(1);
    expect(rascunhos[0]?.fotos).toHaveLength(1);
    expect([...mockNoDisco].sort()).toEqual([ASSINATURA, FOTO]);
  });

  it("a Ana entra de novo e reencontra a vistoria como deixou", async () => {
    await plantaoDaAna();
    await abrirATelaLogada();
    await terminarASessao();
    await act(async () => { fireEvent.press(botaoDeEntrarDeNovo()); });
    await act(async () => {});

    await act(async () => { await sessaoAtual?.entrar("ana@teste.gov.br", "senha"); });

    expect(sessaoAtual?.identidade?.usuarioId).toBe(ANA);
    const rascunhos = await listarRascunhos();
    expect(rascunhos).toHaveLength(1);
    expect(rascunhos[0]?.checklist).toEqual({ risco_iminente: true });
    expect(rascunhos[0]?.observacoes).toBe("Trinca na parede dos fundos.");
    expect(rascunhos[0]?.assinaturaUri).toBe(`file:///documentos/${ASSINATURA}`);
    expect(rascunhos[0]?.fotos[0]?.uriLocal).toBe(`file:///documentos/${FOTO}`);
    expect([...mockNoDisco].sort()).toEqual([ASSINATURA, FOTO]);
  });

  it("contraste: a saída explícita (a do Perfil, que pergunta antes) continua apagando", async () => {
    /* A regra de apagar não mudou: o que mudou é qual botão a tela oferece. */
    await plantaoDaAna();
    await abrirATelaLogada();

    await act(async () => { await sessaoAtual?.sair(); });

    expect(await listarRascunhos()).toEqual([]);
    expect([...mockNoDisco]).toEqual([]);
  });

  it("a tela não oferece mais 'Sair e entrar de novo' em lugar nenhum", async () => {
    await plantaoDaAna();
    await abrirATelaLogada();
    await terminarASessao();

    expect(screen.queryByText("Sair e entrar de novo")).toBeNull();
    expect(screen.queryByTestId("sair-e-entrar-de-novo")).toBeNull();
  });
});
