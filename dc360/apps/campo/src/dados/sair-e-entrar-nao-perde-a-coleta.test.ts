/**
 * Sair da conta e entrar de novo, no banco de verdade (SQLite em memória do
 * Node), e o que NÃO pode se perder em cada caminho (V2-F00-E15).
 *
 * Perder vistoria é o pior defeito deste aplicativo: ela foi coletada no morro,
 * muitas vezes sem sinal, e a moradora assinou uma vez só. Esta etapa não
 * muda a regra de apagar (aparelho compartilhado entre turnos: quem entra
 * depois não vê o dado de quem saiu), ela passa a AVISAR antes. Então o que se
 * prova aqui é a fronteira exata da regra, para nenhuma mudança futura a
 * mover em silêncio:
 *
 * - a MESMA pessoa que volta (sessão vencida e "Entrar de novo") reencontra a
 *   vistoria começada, com o checklist, as fotos e a assinatura;
 * - OUTRA pessoa que entra no aparelho com o rascunho da primeira recebe o
 *   aparelho limpo (`acolherNoAparelho` apaga, regra mantida);
 * - nos dois casos, e também na saída explícita, o item da FILA continua
 *   intacto, byte a byte, e no mesmo estado: `pendente` continua `pendente`,
 *   nunca vira `bloqueado` por causa de sessão (regra de 2026-10-05, E06), e o
 *   arquivo de prova que ele usa continua no disco.
 *
 * O que a saída explícita apaga (o rascunho) é o que o diálogo agora diz que
 * apaga: ver `ui/dialogo-na-conta-com-vistoria-comecada.test.tsx`.
 */

import { DatabaseSync } from "node:sqlite";

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
      async runAsync(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...params);
      },
      async getAllAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).all(...params);
      },
      async getFirstAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).get(...params) ?? null;
      },
    };
  },
}));

/** O diretório de documentos do aparelho, com o que cada teste põe nele. */
const mockNoDisco = new Set<string>();

jest.mock("expo-file-system", () => {
  class Arquivo {
    name: string;
    constructor(nome: string) { this.name = nome; }
    delete(): void { mockNoDisco.delete(this.name); }
  }
  return {
    Paths: { document: "file:///documentos" },
    File: Arquivo,
    Directory: class {
      list() { return [...mockNoDisco].map((n) => new Arquivo(n)); }
    },
  };
});

import {
  acolherNoAparelho,
  apagarDadosLocais,
  bancoLocal,
  esquecerConexao,
  marcarDonoDosDadosLocais,
} from "./banco-local";
import { listarRascunhos, salvarRascunho, type Rascunho } from "./rascunho";

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRUNO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const FOTO_DO_RASCUNHO = "foto-1759000000000-0.jpg";
const ASSINATURA_DO_RASCUNHO = "assinatura-1759000000000.png";
const ASSINATURA_NA_FILA = "assinatura-1758000000000.png";

/** A vistoria COMEÇADA da Ana: checklist marcado, uma foto, assinatura colhida. */
function rascunhoDaAna(): Rascunho {
  return {
    ocorrenciaId: "11111111-1111-4111-8111-111111111111",
    protocolo: "000471/2026",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    checklist: { risco_iminente: true },
    orgaosParaAcionar: [],
    fotos: [{ uriLocal: `file:///documentos/${FOTO_DO_RASCUNHO}` }] as unknown as Rascunho["fotos"],
    gpsPrecisaoMetros: 1,
    coordenada: { lat: -27.5959, lng: -48.5489 },
    assinanteNome: "Moradora de exemplo",
    assinaturaUri: `file:///documentos/${ASSINATURA_DO_RASCUNHO}`,
    assinaturaIdempotencyKey: null,
    observacoes: "Trinca na parede dos fundos.",
    pessoas: {},
    coletadaEm: "2026-10-07T09:00:00.000Z",
    atualizadoEm: "2026-10-07T09:00:00.000Z",
  };
}

/** O item da fila, do jeito que o motor offline guarda, já com o autor carimbado. */
const ITEM_DA_FILA = JSON.stringify({
  id: "coleta-1",
  estado: "pendente",
  autor: { usuarioId: ANA, nome: "Ana de exemplo" },
  fotos: [{ uriLocal: `file:///documentos/${ASSINATURA_NA_FILA}` }],
});

async function comItemNaFila(): Promise<void> {
  const db = await bancoLocal();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS fila_sincronizacao (
      chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado_em TEXT NOT NULL
    );
  `);
  await db.runAsync(
    "INSERT INTO fila_sincronizacao (chave, valor, atualizado_em) VALUES (?, ?, ?)",
    ["dc360:fila:coleta-1", ITEM_DA_FILA, "2026-10-07T08:00:00.000Z"],
  );
}

async function filaNoDisco(): Promise<{ chave: string; valor: string }[]> {
  const db = await bancoLocal();
  return db.getAllAsync<{ chave: string; valor: string }>(
    "SELECT chave, valor FROM fila_sincronizacao", [],
  );
}

/** O plantão da Ana: dono marcado, vistoria começada, uma coleta na fila. */
async function plantaoDaAna(): Promise<void> {
  await marcarDonoDosDadosLocais(ANA);
  await salvarRascunho(rascunhoDaAna());
  await comItemNaFila();
  mockNoDisco.add(FOTO_DO_RASCUNHO);
  mockNoDisco.add(ASSINATURA_DO_RASCUNHO);
  mockNoDisco.add(ASSINATURA_NA_FILA);
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
  mockNoDisco.clear();
});

describe("a mesma pessoa que volta reencontra o que deixou", () => {
  it("a Ana entra de novo: a vistoria começada continua, com foto e assinatura", async () => {
    await plantaoDaAna();

    const { apagou } = await acolherNoAparelho(ANA);

    expect(apagou).toBe(false);
    const rascunhos = await listarRascunhos();
    expect(rascunhos).toHaveLength(1);
    expect(rascunhos[0]?.checklist).toEqual({ risco_iminente: true });
    expect(rascunhos[0]?.assinaturaUri).toBe(`file:///documentos/${ASSINATURA_DO_RASCUNHO}`);
    expect([...mockNoDisco].sort()).toEqual(
      [ASSINATURA_NA_FILA, ASSINATURA_DO_RASCUNHO, FOTO_DO_RASCUNHO].sort(),
    );
  });

  it("e a fila dela fica exatamente como estava, ainda pendente", async () => {
    await plantaoDaAna();

    await acolherNoAparelho(ANA);

    expect(await filaNoDisco()).toEqual([{ chave: "dc360:fila:coleta-1", valor: ITEM_DA_FILA }]);
  });
});

describe("outra pessoa que entra no aparelho com o rascunho da primeira", () => {
  it("o Bruno entra: o rascunho da Ana é limpo, porque dado de turno não atravessa pessoas", async () => {
    await plantaoDaAna();

    const { apagou } = await acolherNoAparelho(BRUNO);

    expect(apagou).toBe(true);
    expect(await listarRascunhos()).toEqual([]);
    /* As provas do rascunho, que nada na fila referencia, vão junto. */
    expect(mockNoDisco.has(FOTO_DO_RASCUNHO)).toBe(false);
    expect(mockNoDisco.has(ASSINATURA_DO_RASCUNHO)).toBe(false);
  });

  it("mas a coleta da Ana na fila continua, intacta e pendente, com a assinatura no disco", async () => {
    /*
      Quem impede a coleta de subir com o token do Bruno é o carimbo de autor
      no item (`packages/campo/src/fila.ts`), e não apagar a fila. Apagar a
      fila mandaria a Ana subir o morro de novo.
    */
    await plantaoDaAna();

    await acolherNoAparelho(BRUNO);

    const fila = await filaNoDisco();
    expect(fila).toEqual([{ chave: "dc360:fila:coleta-1", valor: ITEM_DA_FILA }]);
    expect((JSON.parse(fila[0]!.valor) as { estado: string }).estado).toBe("pendente");
    expect(mockNoDisco.has(ASSINATURA_NA_FILA)).toBe(true);
  });
});

describe("a saída explícita, depois do aviso", () => {
  it("apaga o rascunho, que é o que o diálogo agora diz que apaga, e só isso da coleta", async () => {
    await plantaoDaAna();

    await apagarDadosLocais();

    expect(await listarRascunhos()).toEqual([]);
    expect(await filaNoDisco()).toEqual([{ chave: "dc360:fila:coleta-1", valor: ITEM_DA_FILA }]);
    expect(mockNoDisco.has(ASSINATURA_NA_FILA)).toBe(true);
  });
});
