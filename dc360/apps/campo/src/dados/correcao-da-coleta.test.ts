/**
 * "CORRIGIR A VISTORIA", do toque na fila até a tela de coleta abrir.
 *
 * Três coisas acontecem, nesta ordem, e a ordem é o que estes casos travam:
 *
 *   1. O motor devolve a coleta e GUARDA o rascunho antes de largar o item
 *      (a ordem mora em `retirarParaCorrecao`, no pacote, com teste lá).
 *   2. A lápide de coleta da ocorrência sai, porque a coleta voltou a ser
 *      rascunho e a lápide diria "coletada, aguardando envio" sobre algo que
 *      não está mais na fila, e barraria a abertura da tela.
 *   3. Quem chamou abre `vistoria/[id]`, que acha o rascunho e continua.
 *
 * O lugar deste arquivo: `dados/`, e não a tela da fila, porque ele junta o
 * motor, o rascunho e a lápide, e a tela da fila não deve saber de banco.
 */

const mockSalvarRascunho = jest.fn(async (_r: unknown) => undefined);
const mockEsquecerColeta = jest.fn(async (_id: string) => undefined);
jest.mock("./rascunho", () => ({
  ...jest.requireActual("./rascunho"),
  salvarRascunho: (r: unknown) => mockSalvarRascunho(r),
}));
jest.mock("./coletas", () => ({ esquecerColeta: (id: string) => mockEsquecerColeta(id) }));
jest.mock("./banco-local", () => ({ bancoLocal: jest.fn() }));

import type { ColetaParaCorrecao, FilaDeSincronizacao, ResultadoDaRetirada } from "@dc360/campo";
import { devolverParaCorrecao } from "./correcao-da-coleta";

const CHAVE = "11111111-1111-4111-8111-000000000009";
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const COLETA: ColetaParaCorrecao = {
  ocorrenciaId: OCORRENCIA,
  protocolo: "000009/2026",
  envelope: {
    idempotencyKey: CHAVE,
    ocorrenciaId: OCORRENCIA,
    coletadaEm: "2026-09-15T20:40:00.000Z",
    vistoria: {
      checklist: [{ chave: "risco_iminente", resposta: true }],
      fotos: [],
      gpsPrecisaoMetros: 11,
      assinanteNome: "Klaus",
      assinaturaChave: null,
      coletadaEm: "2026-09-15T20:40:00.000Z",
    },
  },
  fotos: [],
  ultimaFalha: null,
};

/** Uma fila de mentira que faz o que o motor promete: guarda, depois larga. */
function filaQueDevolve(resultado: ResultadoDaRetirada): FilaDeSincronizacao & { ordem: string[] } {
  const ordem: string[] = [];
  return {
    ordem,
    retirarParaCorrecao: async (
      _id: string,
      guardar: (c: ColetaParaCorrecao) => Promise<void>,
    ) => {
      if (!resultado.retirada) return resultado;
      await guardar(resultado.coleta);
      ordem.push("largou-o-item");
      return resultado;
    },
  } as unknown as FilaDeSincronizacao & { ordem: string[] };
}

beforeEach(() => {
  mockSalvarRascunho.mockClear();
  mockEsquecerColeta.mockClear();
  mockSalvarRascunho.mockImplementation(async () => undefined);
});

describe("devolverParaCorrecao", () => {
  it("guarda o rascunho, tira o item da fila e apaga a lápide, nesta ordem", async () => {
    const fila = filaQueDevolve({ retirada: true, coleta: COLETA });
    mockSalvarRascunho.mockImplementation(async () => { fila.ordem.push("guardou-o-rascunho"); });
    mockEsquecerColeta.mockImplementation(async () => { fila.ordem.push("apagou-a-lapide"); });

    const r = await devolverParaCorrecao(fila, CHAVE);

    expect(r.retirada).toBe(true);
    expect(fila.ordem).toEqual(["guardou-o-rascunho", "largou-o-item", "apagou-a-lapide"]);
    // O rascunho gravado é o da coleta, com a mesma chave.
    const gravado = mockSalvarRascunho.mock.calls[0]?.[0] as { idempotencyKey: string; ocorrenciaId: string };
    expect(gravado.idempotencyKey).toBe(CHAVE);
    expect(gravado.ocorrenciaId).toBe(OCORRENCIA);
    expect(mockEsquecerColeta).toHaveBeenCalledWith(OCORRENCIA);
  });

  it("quando o motor recusa, nada é gravado nem apagado", async () => {
    const fila = filaQueDevolve({ retirada: false, motivo: "de_outro_autor" });

    const r = await devolverParaCorrecao(fila, CHAVE);

    expect(r).toEqual({ retirada: false, motivo: "de_outro_autor" });
    expect(mockSalvarRascunho).not.toHaveBeenCalled();
    expect(mockEsquecerColeta).not.toHaveBeenCalled();
  });

  it("se o rascunho não grava, a lápide fica e o erro sobe: a coleta continua na fila", async () => {
    const fila = filaQueDevolve({ retirada: true, coleta: COLETA });
    mockSalvarRascunho.mockImplementation(async () => { throw new Error("disco cheio"); });

    await expect(devolverParaCorrecao(fila, CHAVE)).rejects.toThrow("disco cheio");

    expect(fila.ordem).toEqual([]);
    expect(mockEsquecerColeta).not.toHaveBeenCalled();
  });
});
