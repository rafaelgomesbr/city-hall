/**
 * A faixa global ligada à fila REAL (V2-F00-E06, correção 2).
 *
 * A rodada 2 da validação achou no emulador Android o que a suíte inteira não
 * via: com a coleta parada pela sessão, a faixa do topo dizia "Tudo
 * sincronizado" (ou "Com sinal, 1 esperando envio"), porque o gancho da faixa
 * assinava uma fila e o laço de fundo do layout drenava e pausava OUTRA (a
 * criação concorrente de `obterFila` fabricava várias). Os testes de tela
 * trocam `obterFila` por um dublê de instância única e injetam o resumo à mão,
 * que é o que esconde essa fiação.
 *
 * Aqui nada disso é dublê: a fila, o transporte, o depósito e `obterFila` são
 * os de produção (o SQLite é o do Node, em memória, e o `fetch` é falso). O
 * "laço de fundo" é o teste chamando `obterFila` no mesmo instante em que a
 * faixa monta, como o layout faz, e drenando por ela.
 */

import { DatabaseSync } from "node:sqlite";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import type { Identidade } from "../dados/api";
import { esquecerConexao } from "../dados/banco-local";
import { esquecerFila, obterFila } from "../dados/fila";
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

describe("a faixa global com a fila real parada pela sessão", () => {
  it("401 sessao_encerrada: a faixa diz 'Sessão encerrada', e não 'Tudo sincronizado'", async () => {
    mockFetch = async () => resposta(401, { erro: "sessao_encerrada", mensagem: "Sua sessão foi encerrada." });
    const { fila } = await montarFaixaEPedirAFila();
    await act(async () => { await fila.enfileirar(envelope("11111111-1111-4111-8111-111111111111"), { protocolo: "000471/2026" }); });

    await act(async () => { await fila.drenar(); });

    await waitFor(() => expect(screen.getByText("Sessão encerrada")).toBeTruthy());
    expect(screen.getByText(/Entre de novo: suas coletas continuam guardadas/)).toBeTruthy();
    expect(screen.queryByText("Tudo sincronizado")).toBeNull();
    expect(screen.queryByText(/esperando envio/)).toBeNull();
  });

  it("403 troca_de_senha_obrigatoria: a faixa diz 'Defina a sua senha'", async () => {
    mockFetch = async () =>
      resposta(403, { erro: "troca_de_senha_obrigatoria", mensagem: "Defina a sua senha." });
    const { fila } = await montarFaixaEPedirAFila();
    await act(async () => { await fila.enfileirar(envelope("22222222-2222-4222-8222-222222222222"), { protocolo: "000472/2026" }); });

    await act(async () => { await fila.drenar(); });

    await waitFor(() => expect(screen.getByText("Defina a sua senha")).toBeTruthy());
    expect(screen.queryByText("Tudo sincronizado")).toBeNull();
  });

  it("a faixa assinou a MESMA fila que o laço de fundo recebeu", async () => {
    mockFetch = async () => resposta(401, { erro: "sessao_encerrada", mensagem: "Sua sessão foi encerrada." });
    const { fila: doLaco, assinaturas } = await montarFaixaEPedirAFila();

    const outra = await obterFila("http://api.exemplo", mockSessao.obterToken, mockSessao.lerIdentidade);

    expect(outra).toBe(doLaco);
    /* O que o nome promete: quem assinou foi ESTA instância, e não uma que a faixa fabricou. */
    expect(assinaturas).not.toBeNull();
    expect(assinaturas).toHaveBeenCalledTimes(1);
  });
});
