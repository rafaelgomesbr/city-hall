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
  orgaosParaAcionar: [],
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
      {
        checklist: {}, orgaosParaAcionar: [],
        quantasFotos: 0, assinanteNome: "", assinaturaUri: null,
      },
      OBRIGATORIOS,
    );
    expect(faltas).toHaveLength(4);
    expect(faltas[3]).toContain("assinatura");
  });

  /* ============================================================
     O desdobramento de "necessário acionar outro órgão"
     ============================================================ */

  /*
    O que estes casos travam: o agente respondia "sim, precisa acionar outro
    órgão", concluía a vistoria e ia embora. O laudo chegava à coordenação
    afirmando isso e sem dizer QUEM, e a primeira providência do coordenador
    virava um telefonema para o agente, horas depois, para perguntar uma coisa
    que estava clara no barranco no minuto da vistoria.
  */
  it("responder sim sem dizer quem NÃO libera a conclusão", () => {
    const faltas = faltaParaConcluir(
      { ...completo, checklist: { ...completo.checklist, acionar_outro_orgao: true } },
      OBRIGATORIOS,
    );
    expect(faltas).toEqual(["dizer qual órgão precisa ser acionado"]);
  });

  it("um órgão digitado à mão basta, e isso é a regra do aparelho sem catálogo", () => {
    /*
      Aparelho novo, que nunca sincronizou, tem catálogo vazio. Se o
      desdobramento dependesse do catálogo, um item OBRIGATÓRIO travaria a
      vistoria justamente sem sinal, que é a condição normal de trabalho deste
      aplicativo. Nenhuma vistoria pode ficar impossível por falta de cadastro.
    */
    const faltas = faltaParaConcluir(
      {
        ...completo,
        checklist: { ...completo.checklist, acionar_outro_orgao: true },
        orgaosParaAcionar: [{ nome: "Concessionária de energia" }],
      },
      OBRIGATORIOS,
    );
    expect(faltas).toEqual([]);
  });

  it("responder não não cobra órgão nenhum", () => {
    // Cobrar aqui obrigaria o agente a nomear alguém para poder dizer que não
    // precisa de ninguém, e a saída dele seria escrever qualquer coisa.
    expect(faltaParaConcluir(completo, OBRIGATORIOS)).toEqual([]);
  });

  it("item ainda não respondido cobra o checklist, e não o órgão", () => {
    /*
      A ordem das duas frases importa: dizer "falta dizer qual órgão" para quem
      ainda não respondeu a pergunta manda o agente procurar um campo que a tela
      nem mostrou, porque a seleção só aparece depois do sim.
    */
    const faltas = faltaParaConcluir(
      {
        ...completo,
        checklist: {
          risco_iminente: true, evacuacao_necessaria: false, interdicao_indicada: true,
        },
      },
      OBRIGATORIOS,
    );
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toContain("checklist");
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
