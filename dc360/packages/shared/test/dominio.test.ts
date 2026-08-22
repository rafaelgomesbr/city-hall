import { describe, expect, it } from "vitest";
import {
  STATUS_INICIAL, STATUS_OCORRENCIA, STATUS_RESERVADOS, TRANSICOES_PERMITIDAS,
  ocorrenciaAtiva, transicaoPermitida, type StatusOcorrencia,
} from "../src/index.js";

/**
 * A máquina de estados, verificada como grafo.
 *
 * O defeito que originou este arquivo: `rascunho` estava declarado com rótulo,
 * ícone, cor de selo e até um índice parcial no banco que o excluía, e nenhum
 * caminho de código jamais criava uma ocorrência nesse estado. Duas transições
 * da máquina eram permanentemente inalcançáveis, e ninguém percebeu porque
 * nada olhava o grafo inteiro: cada teste olhava uma transição por vez.
 *
 * Aqui o grafo é percorrido de verdade, a partir do estado inicial.
 */

/** Todos os estados alcançáveis a partir do inicial, andando pelas transições. */
function alcancaveis(): Set<StatusOcorrencia> {
  const vistos = new Set<StatusOcorrencia>([STATUS_INICIAL]);
  const fila: StatusOcorrencia[] = [STATUS_INICIAL];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const proximo of TRANSICOES_PERMITIDAS[atual]) {
      if (!vistos.has(proximo)) {
        vistos.add(proximo);
        fila.push(proximo);
      }
    }
  }
  return vistos;
}

describe("Máquina de estados da ocorrência", () => {
  it("todo estado é alcançável, ou está declarado como reservado com a razão", () => {
    const chegam = alcancaveis();
    const mortos = STATUS_OCORRENCIA.filter(
      (s) => !chegam.has(s) && !STATUS_RESERVADOS[s],
    );
    expect(
      mortos,
      "estado que ninguém alcança e ninguém declarou. Ou existe um caminho " +
      "até ele, ou ele entra em STATUS_RESERVADOS com o motivo escrito.",
    ).toEqual([]);
  });

  it("toda reserva tem razão escrita, e não uma frase de ocasião", () => {
    for (const [estado, razao] of Object.entries(STATUS_RESERVADOS)) {
      expect(razao, estado).toBeTruthy();
      expect(razao!.length, `razão curta demais para ${estado}`).toBeGreaterThan(40);
    }
  });

  it("nenhuma reserva sobra depois de o estado passar a ser alcançável", () => {
    // Reserva que sobra vira desculpa pendurada: o dia em que o aplicativo de
    // campo produzir `rascunho`, a linha precisa sair daqui.
    const chegam = alcancaveis();
    for (const estado of Object.keys(STATUS_RESERVADOS) as StatusOcorrencia[]) {
      expect(
        chegam.has(estado),
        `${estado} já é alcançável: tire a reserva de STATUS_RESERVADOS`,
      ).toBe(false);
    }
  });

  it("encerrada é terminal, e alcançável de todo estado ativo", () => {
    expect(TRANSICOES_PERMITIDAS["encerrada"]).toEqual([]);
    for (const estado of STATUS_OCORRENCIA) {
      if (estado === "encerrada") continue;
      expect(
        transicaoPermitida(estado, "encerrada"),
        `${estado} precisa poder ser encerrada: a realidade da rua impõe isso`,
      ).toBe(true);
    }
  });

  it("nenhuma transição aponta para estado que não existe", () => {
    const declarados = new Set<string>(STATUS_OCORRENCIA);
    for (const [de, paras] of Object.entries(TRANSICOES_PERMITIDAS)) {
      for (const para of paras) {
        expect(declarados.has(para), `${de} aponta para ${para}, que não existe`).toBe(true);
      }
    }
  });

  it("todo estado tem lista de transições declarada", () => {
    // Estado sem entrada aqui faria `TRANSICOES_PERMITIDAS[x]` ser undefined, e
    // `transicaoPermitida` estouraria em vez de recusar.
    for (const estado of STATUS_OCORRENCIA) {
      expect(Array.isArray(TRANSICOES_PERMITIDAS[estado]), estado).toBe(true);
    }
  });

  it("estado reservado não conta como ativo", () => {
    // Se contasse, o indicador "Na fila" somaria rascunho de aparelho que nem
    // chegou ao servidor.
    for (const estado of Object.keys(STATUS_RESERVADOS) as StatusOcorrencia[]) {
      expect(ocorrenciaAtiva(estado), estado).toBe(false);
    }
    expect(ocorrenciaAtiva("encerrada")).toBe(false);
    expect(ocorrenciaAtiva("em_campo")).toBe(true);
  });

  it("o grafo é percorrido de verdade", () => {
    // Âncora: se a busca quebrasse e devolvesse só o inicial, o primeiro caso
    // reprovaria tudo em vez de passar vazio, mas melhor não depender disso.
    const chegam = alcancaveis();
    expect(chegam.has("em_campo")).toBe(true);
    expect(chegam.has("providencia_pendente")).toBe(true);
    expect(chegam.size).toBeGreaterThan(4);
  });
});
