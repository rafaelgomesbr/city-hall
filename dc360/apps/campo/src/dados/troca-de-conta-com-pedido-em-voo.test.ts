/**
 * A troca de conta com um pedido da fila na rua, pela fila REAL do aplicativo
 * (V2-F00-E06, correção 1).
 *
 * A fila do aparelho atravessa a troca de turno: é criada uma vez e lê quem está
 * logado a cada decisão (`obterFila`). A rodada 1 da validação provou duas
 * coisas sobre o instante em que a conta muda com um envio em voo:
 *
 * 1. a resposta tardia (403 `conta_desativada`) era atribuída a QUEM ESTAVA
 *    LOGADO QUANDO ELA CHEGOU, e o agente que acabou de entrar lia "Conta
 *    desativada" por causa da conta de quem saiu;
 * 2. o item do agente que saiu não pode sair mais com a conta que entrou: o
 *    layout cancela o dreno quando a identidade muda (`LacoDaFila`), e o motor
 *    refaz a pergunta de autoria antes de cada chamada.
 *
 * O SQLite é o do Node em memória e o `fetch` é falso, mas a fila, o transporte
 * e o depósito são os de produção.
 */

import { DatabaseSync } from "node:sqlite";
import type { EnvelopeSincronizacao } from "@dc360/shared";

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

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documentos" },
  File: class {},
  Directory: class { list() { return []; } },
}));

import type { Identidade } from "./api";

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRUNO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function identidade(usuarioId: string, nome: string): Identidade {
  return { usuarioId, nome, organizacaoId: ORG } as unknown as Identidade;
}

const quem = { atual: identidade(ANA, "Ana Ribeiro") as Identidade | null };

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

function resposta(status: number, corpo: Record<string, unknown>): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

/*
  A fila do aplicativo é memoizada e o transporte captura o `fetch` na criação:
  o que muda de um teste para outro é o delegado, e não o `fetch` global.

  CADA CASO COMEÇA DO ZERO (V2-F00-E06, correção 2). Antes, o módulo `./fila`
  (a fila é um singleton) e o banco em memória viviam o arquivo inteiro, e o
  segundo caso só passava porque encontrava o item que o primeiro tinha
  enfileirado: rodado sozinho, ou numa ordem aleatória (`jest --randomize`), ele
  reprovava. O CI só roda a ordem declarada e nunca viu. Agora o módulo é
  recarregado e o banco é novo a cada caso, e o caso enfileira o que usa.
*/
let mockFetch: (url: string, init: RequestInit) => Promise<Response> = async () => {
  throw new Error("fetch nao configurado");
};
(globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: RequestInit) => mockFetch(url, init);

type ObterFila = typeof import("./fila").obterFila;

/** `obterFila` do módulo recém-carregado: fila nova, banco novo. */
function obterFilaDoZero(): ObterFila {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("./fila") as typeof import("./fila")).obterFila;
}

beforeEach(() => {
  mockBanco = null;
  quem.atual = identidade(ANA, "Ana Ribeiro");
  mockFetch = async () => { throw new Error("fetch nao configurado"); };
  jest.resetModules();
});

describe("a fila real do aplicativo com a conta trocando no meio do pedido", () => {
  it("o 403 tardio é da Ana, e o Bruno que entrou depois não lê a pausa dela", async () => {
    // O pedido fica pendurado até o teste decidir a resposta.
    let responder!: (r: Response) => void;
    const pedidos: string[] = [];
    mockFetch = async (_url, init) => {
      pedidos.push((init.headers as Record<string, string>)["authorization"]!);
      return new Promise<Response>((r) => { responder = r; });
    };
    const obterFila = obterFilaDoZero();
    const fila = await obterFila(
      "http://api.exemplo",
      async () => (quem.atual?.usuarioId === ANA ? "token-da-ana" : "token-do-bruno"),
      () => quem.atual,
    );
    await fila.enfileirar(envelope("11111111-1111-4111-8111-111111111111"), { protocolo: "000471/2026" });

    const dreno = fila.drenar();
    await new Promise((r) => setTimeout(r, 0));
    expect(pedidos).toEqual(["Bearer token-da-ana"]);

    // A Ana sai, o Bruno entra, e o layout cancela o dreno (a identidade mudou).
    quem.atual = identidade(BRUNO, "Bruno Lima");
    fila.cancelar();
    responder(resposta(403, { erro: "conta_desativada", mensagem: "Sua conta foi desativada." }));
    const r = await dreno;

    expect(r.bloqueados).toBe(0);
    // O Bruno não lê a pausa da Ana, e a coleta dela espera por ela.
    const doBruno = await fila.resumo();
    expect(doBruno.pausadaPor).toBeNull();
    expect(doBruno.deOutroAutor).toBe(1);
    // A Ana volta e a pausa dela está lá, com o item guardado e sem tentativa gasta.
    quem.atual = identidade(ANA, "Ana Ribeiro");
    expect((await fila.resumo()).pausadaPor).toBe("conta_desativada");
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);
    // E o dreno do Bruno não manda a coleta da Ana com o token dele.
    quem.atual = identidade(BRUNO, "Bruno Lima");
    await fila.drenar();
    expect(pedidos).toEqual(["Bearer token-da-ana"]);
  });

  it("403 troca_de_senha_obrigatoria pelo fio do aplicativo: pausa, e a coleta fica guardada", async () => {
    mockFetch = async () =>
      resposta(403, { erro: "troca_de_senha_obrigatoria", mensagem: "Defina a sua senha." });
    const fila = await obterFilaDoZero()("http://api.exemplo", async () => "token", () => quem.atual);
    await fila.enfileirar(envelope("22222222-2222-4222-8222-222222222222"), { protocolo: "000472/2026" });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("troca_de_senha_obrigatoria");
    expect(r.bloqueados).toBe(0);
    const resumo = await fila.resumo();
    expect(resumo.bloqueados).toBe(0);
    expect(resumo.pausadaPor).toBe("troca_de_senha_obrigatoria");
    expect((await fila.itens())[0]!.estado).toBe("pendente");
  });
});
