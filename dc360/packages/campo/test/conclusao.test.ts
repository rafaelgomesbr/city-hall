import { describe, expect, it } from "vitest";
import { faltaParaConcluir } from "../src/conclusao.js";

const OBRIGATORIOS = [
  { chave: "risco_iminente" },
  { chave: "evacuacao_necessaria" },
  { chave: "interdicao_indicada" },
  { chave: "acionar_outro_orgao" },
];

const completo = {
  checklist: {
    risco_iminente: true, evacuacao_necessaria: false,
    interdicao_indicada: true, acionar_outro_orgao: false,
  },
  quantasFotos: 2,
  assinanteNome: "Joana Ferreira",
  assinaturaUri: "file:///assinatura-000001-2026.png",
};

describe("o que falta para concluir a vistoria", () => {
  it("nada falta quando tudo está feito", () => {
    expect(faltaParaConcluir(completo, OBRIGATORIOS)).toEqual([]);
  });

  /*
    O defeito que custou tres vistorias reais no piloto de Florianopolis.
    O agente desenha o traco, nao toca em "Confirmar assinatura", e o botao de
    concluir estava liberado do mesmo jeito. A coleta ia embora com
    `assinatura_chave` nula e o laudo saia sem a prova de que o morador estava
    no local.
  */
  it("o traço desenhado e não confirmado NÃO conta como assinatura", () => {
    const faltas = faltaParaConcluir({ ...completo, assinaturaUri: null }, OBRIGATORIOS);
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toContain("assinatura");
  });

  it("nome de quem assina não substitui a assinatura", () => {
    // Era exatamente esta a confusao: `temAssinante` olhava o campo de TEXTO.
    const faltas = faltaParaConcluir(
      { ...completo, assinanteNome: "Joana Ferreira", assinaturaUri: null }, OBRIGATORIOS,
    );
    expect(faltas.length, "o nome preenchido não pode liberar o botão").toBe(1);
  });

  it("cobra foto", () => {
    expect(faltaParaConcluir({ ...completo, quantasFotos: 0 }, OBRIGATORIOS))
      .toEqual(["tirar ao menos uma fotografia"]);
  });

  it("cobra o checklist, no singular e no plural", () => {
    const um = faltaParaConcluir(
      { ...completo, checklist: { risco_iminente: true, evacuacao_necessaria: false, interdicao_indicada: true } },
      OBRIGATORIOS,
    );
    expect(um[0]).toContain("o último item");

    const varios = faltaParaConcluir({ ...completo, checklist: {} }, OBRIGATORIOS);
    expect(varios[0]).toContain("4 itens");
  });

  it("lista tudo que falta, na ordem em que o agente resolve", () => {
    const faltas = faltaParaConcluir(
      { checklist: {}, quantasFotos: 0, assinanteNome: "", assinaturaUri: null },
      OBRIGATORIOS,
    );
    expect(faltas).toHaveLength(4);
    expect(faltas[3]).toContain("assinatura");
  });

  it("item do checklist respondido com `false` conta como respondido", () => {
    // "Não" é resposta. Sem isto, quem responde Não em tudo nunca conclui.
    const faltas = faltaParaConcluir(
      {
        ...completo,
        checklist: {
          risco_iminente: false, evacuacao_necessaria: false,
          interdicao_indicada: false, acionar_outro_orgao: false,
        },
      },
      OBRIGATORIOS,
    );
    expect(faltas).toEqual([]);
  });
});
