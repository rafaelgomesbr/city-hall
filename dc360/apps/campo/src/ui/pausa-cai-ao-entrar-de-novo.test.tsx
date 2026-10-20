/**
 * A pausa da fila cai quando a pessoa ENTRA DE NOVO, no aplicativo de verdade
 * (V2-F00-E06, correção 3).
 *
 * Fila, transporte, depósito, `obterFila` e a geração da credencial são os
 * REAIS; só o `fetch` é falso. É o que prova a ligação do aplicativo com o
 * motor: o motor tem o seu teste (`packages/campo/test/pausa-velha.test.ts`),
 * mas se `dados/fila.ts` não passasse `geracaoDaSessao`, aquele teste ficaria
 * verde e o aparelho continuaria mandando "entre de novo" a quem acabou de
 * entrar. O login que sobe a geração tem o seu teste em
 * `__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx`.
 */

import { DatabaseSync } from "node:sqlite";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import type { Identidade } from "../dados/api";
import { esquecerConexao } from "../dados/banco-local";
import { esquecerFila, obterFila } from "../dados/fila";
import { novaGeracaoDaSessao } from "../dados/geracao-da-sessao";
import { ProvedorDeTema } from "./componentes";
import { FaixaDeSincronizacaoLigada } from "./FaixaDeSincronizacao";

const AGENTE = {
  usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  nome: "Ana Ribeiro",
  organizacaoId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
} as unknown as Identidade;

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "light",
}));

let mockBanco: DatabaseSync | null = null;
function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    // O banco real demora para abrir: é aqui que as chamadas se atropelam.
    await new Promise((r) => setTimeout(r, 5));
    const db = mockAbrir();
    return {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, params: unknown[] = []) { db.prepare(sql).run(...params); },
      async getAllAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).all(...params); },
      async getFirstAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).get(...params) ?? null; },
    };
  },
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documentos" },
  File: class {},
  Directory: class { list() { return []; } },
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "http://api.exemplo" }));
jest.mock("../dados/conectividade", () => ({ useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }) }));

/* O MESMO objeto a cada renderização: um novo refaz o efeito de abertura em laço. */
const mockSessao = {
  obterToken: async () => "token-da-ana",
  lerIdentidade: () => AGENTE,
  identidade: AGENTE,
};
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));

let mockFetch: (url: string, init: RequestInit) => Promise<Response> = async () => {
  throw new Error("fetch nao configurado");
};
(globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: RequestInit) => mockFetch(url, init);

function resposta(status: number, corpo: Record<string, unknown>): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

function envelope(chave: string): EnvelopeSincronizacao {
  const momento = new Date(Date.now() - 3_600_000).toISOString();
  return {
    idempotencyKey: chave,
    ocorrenciaId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    coletadaEm: momento,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6,
      assinanteNome: "Moradora",
      assinaturaChave: null,
      coletadaEm: momento,
    },
  };
}

beforeEach(() => {
  // Fila e banco do zero a cada caso (a fila do aplicativo é um singleton).
  mockBanco = null;
  esquecerConexao();
  esquecerFila();
});

/**
 * Monta a faixa e, NO MESMO INSTANTE, pede a fila como o laço de fundo do
 * layout faz. Devolve a fila do "laço" e o espião das assinaturas dela.
 *
 * O espião é posto na instância do laço assim que ela nasce, ANTES de a faixa
 * assinar (o `.then` abaixo é registrado antes do efeito da faixa na mesma
 * promessa, e as reações rodam na ordem em que foram registradas). Se a faixa
 * assinasse uma fila própria, o espião da fila do laço nunca seria chamado.
 */
async function montarFaixaEPedirAFila() {
  // Sem `await`: a faixa monta enquanto a criação da fila ainda está em curso.
  const doLaco = obterFila("http://api.exemplo", mockSessao.obterToken, mockSessao.lerIdentidade);
  let assinaturas: jest.SpyInstance | null = null;
  void doLaco.then((f) => { assinaturas = jest.spyOn(f, "assinar"); });
  await act(async () => {
    await render(
      <ProvedorDeTema><FaixaDeSincronizacaoLigada aoTocar={() => {}} /></ProvedorDeTema>,
    );
  });
  // Deixa a assinatura da faixa terminar dentro do `act`, antes de o caso mexer na fila.
  await act(async () => { await doLaco; await new Promise((r) => setTimeout(r, 20)); });
  return { fila: await doLaco, assinaturas: assinaturas as jest.SpyInstance | null };
}


describe("a pausa velha da fila real", () => {
  async function pausarPelaSessao() {
    mockFetch = async () => resposta(401, { erro: "sessao_encerrada", mensagem: "Sua sessão foi encerrada." });
    const { fila } = await montarFaixaEPedirAFila();
    await act(async () => { await fila.enfileirar(envelope("11111111-1111-4111-8111-111111111111"), { protocolo: "000471/2026" }); });
    await act(async () => { await fila.drenar(); });
    await waitFor(() => expect(screen.getByText("Sessão encerrada")).toBeTruthy());
    expect((await fila.resumo()).pausadaPor).toBe("sessao_encerrada");
    return fila;
  }

  /*
    O caso do defeito: a pessoa entra de novo, o primeiro envio falha por rede
    ruim (nem chega ao servidor), e a faixa continuava dizendo "Sessão
    encerrada" sobre a credencial que ela acabou de criar.
  */
  it("entrar de novo derruba a pausa: a falha de rede seguinte não traz 'Sessão encerrada' de volta", async () => {
    const fila = await pausarPelaSessao();

    novaGeracaoDaSessao(); // a pessoa entrou de novo
    mockFetch = async () => { throw new TypeError("Network request failed"); };
    await act(async () => { await fila.drenar(); });

    expect((await fila.resumo()).pausadaPor).toBeNull();
    await waitFor(() => expect(screen.queryByText("Sessão encerrada")).toBeNull());
    expect(screen.queryByText(/Entre de novo/)).toBeNull();
  });

  it("controle: sem entrar de novo, a falha de rede seguinte não derruba a pausa", async () => {
    const fila = await pausarPelaSessao();

    mockFetch = async () => { throw new TypeError("Network request failed"); };
    await act(async () => { await fila.drenar(); });

    expect((await fila.resumo()).pausadaPor).toBe("sessao_encerrada");
    expect(screen.getByText("Sessão encerrada")).toBeTruthy();
  });
});
