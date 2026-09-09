import { describe, expect, it } from "vitest";
import {
  concluirColetaEmOrdem, decidirAberturaDaVistoria, seloDaColeta,
  type ColetaLocal, type SituacaoDaColeta,
} from "../src/index.js";

/**
 * A vistoria duplicada, travada aqui.
 *
 * O cenário que estes testes reproduzem é o do dia de trabalho: o agente
 * conclui a coleta, ela vai para a fila, e a lista de tarefas continua a mesma
 * por horas porque não há sinal. Sem lápide, o toque seguinte naquela mesma
 * tarefa abre uma vistoria nova, com chave de idempotência nova, e o servidor
 * aceita as duas: dois laudos para um protocolo só.
 */

function coleta(situacao: SituacaoDaColeta): ColetaLocal {
  return {
    ocorrenciaId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    protocolo: "2026/000123",
    coletadaEm: "2026-09-09T13:00:00.000Z",
    situacao,
  };
}

const RASCUNHO = { idempotencyKey: "33333333-3333-4333-8333-333333333333" };

describe("decidirAberturaDaVistoria", () => {
  it("sem rascunho e sem lápide, abre vistoria nova", () => {
    expect(decidirAberturaDaVistoria({ rascunho: null, coleta: null })).toBe("nova");
  });

  it("com rascunho e sem lápide, continua de onde parou", () => {
    expect(decidirAberturaDaVistoria({ rascunho: RASCUNHO, coleta: null })).toBe("continuar");
  });

  /*
    O defeito inteiro, num teste só: a coleta já foi feita e está esperando
    sinal, e é justamente aí que a tela cunhava chave nova.
  */
  it("coleta na fila e nenhum rascunho NÃO abre vistoria nova", () => {
    expect(decidirAberturaDaVistoria({ rascunho: null, coleta: coleta("na_fila") }))
      .toBe("ja_coletada");
  });

  it("coleta já enviada e nenhum rascunho também barra", () => {
    expect(decidirAberturaDaVistoria({ rascunho: null, coleta: coleta("enviada") }))
      .toBe("ja_coletada");
  });

  /*
    O rascunho preso: o aparelho morreu entre gravar a lápide e apagar o
    rascunho. Retomar esse rascunho seria refazer à mão a vistoria que já está
    na fila, então a lápide vence.
  */
  it("lápide vence o rascunho sobrevivente da conclusão interrompida", () => {
    expect(decidirAberturaDaVistoria({ rascunho: RASCUNHO, coleta: coleta("na_fila") }))
      .toBe("ja_coletada");
  });

  it("arquivada deixa passar: é a saída deliberada para revistoriar", () => {
    expect(decidirAberturaDaVistoria({ rascunho: null, coleta: coleta("arquivada") }))
      .toBe("nova");
  });

  /*
    Arquivar não pode destruir o que o agente digitou. Depois da confirmação, o
    rascunho preso reaparece em vez de sumir.
  */
  it("arquivada com rascunho devolve o rascunho, não uma tela em branco", () => {
    expect(decidirAberturaDaVistoria({ rascunho: RASCUNHO, coleta: coleta("arquivada") }))
      .toBe("continuar");
  });
});

describe("seloDaColeta", () => {
  it("sem lápide, nenhum selo", () => {
    expect(seloDaColeta(null)).toBeNull();
  });

  it("na fila, o selo diz que falta só a rede", () => {
    expect(seloDaColeta(coleta("na_fila"))).toBe("Coletada, aguardando envio");
  });

  it("enviada, o selo diz que o servidor já tem", () => {
    expect(seloDaColeta(coleta("enviada"))).toBe("Coletada e enviada");
  });

  it("arquivada não ganha selo: a tarefa voltou a estar em aberto", () => {
    expect(seloDaColeta(coleta("arquivada"))).toBeNull();
  });
});

describe("concluirColetaEmOrdem", () => {
  it("enfileira, grava a lápide e só então apaga o rascunho", async () => {
    const feitos: string[] = [];
    await concluirColetaEmOrdem({
      enfileirar: async () => { feitos.push("enfileirar"); },
      registrarColeta: async () => { feitos.push("registrarColeta"); },
      descartarRascunho: async () => { feitos.push("descartarRascunho"); },
    });
    expect(feitos).toEqual(["enfileirar", "registrarColeta", "descartarRascunho"]);
  });

  /*
    A inversão que parece inofensiva e não é: com o rascunho apagado antes da
    lápide, uma falha ao gravar a lápide deixa a tarefa parecendo intocada, e o
    próximo toque produz a segunda vistoria.
  */
  it("lápide que falha não deixa o rascunho ser apagado", async () => {
    const feitos: string[] = [];
    await expect(concluirColetaEmOrdem({
      enfileirar: async () => { feitos.push("enfileirar"); },
      registrarColeta: async () => { throw new Error("disco cheio"); },
      descartarRascunho: async () => { feitos.push("descartarRascunho"); },
    })).rejects.toThrow("disco cheio");
    expect(feitos).toEqual(["enfileirar"]);
  });

  it("fila que recusa não apaga nada: a vistoria continua no aparelho", async () => {
    const feitos: string[] = [];
    await expect(concluirColetaEmOrdem({
      enfileirar: async () => { throw new Error("fila recusou"); },
      registrarColeta: async () => { feitos.push("registrarColeta"); },
      descartarRascunho: async () => { feitos.push("descartarRascunho"); },
    })).rejects.toThrow("fila recusou");
    expect(feitos).toEqual([]);
  });
});
