import { describe, expect, it } from "vitest";
import {
  CHAVE_ACIONAR_ORGAO, CHECKLIST_VISTORIA, montarMinuta, vistoriaSchema,
  type DadosMinuta,
} from "../src/index.js";

/**
 * "Necessário acionar outro órgão: sim" era meia informação.
 *
 * O laudo chegava à coordenação afirmando que alguém precisa ser acionado e não
 * dizia quem. A primeira providência do coordenador virava um telefonema para o
 * agente, feito horas depois, com ele já em outra ocorrência ou fora do turno,
 * para perguntar uma coisa que estava clara no barranco no minuto da vistoria.
 *
 * O que estes casos travam é o caminho inteiro do desdobramento: a chave do item
 * é uma só e vem do catálogo, o envelope aceita a lista, o envelope recusa a
 * contradição, e a minuta lida em voz alta na porta da casa nomeia os órgãos.
 */

const VISTORIA_BASE = {
  checklist: [
    { chave: "risco_iminente", resposta: true },
    { chave: "evacuacao_necessaria", resposta: false },
    { chave: "interdicao_indicada", resposta: true },
    { chave: CHAVE_ACIONAR_ORGAO, resposta: true },
  ],
  fotos: [],
  gpsPrecisaoMetros: 8,
  assinanteNome: "Marilda Souza Prado",
  assinaturaChave: "tenant/1/assinatura.png",
  coletadaEm: "2026-09-09T14:30:00.000Z",
};

const MINUTA_BASE: DadosMinuta = {
  organizacao: { nome: "Defesa Civil", municipio: "Serra Alta", uf: "MG" },
  ocorrencia: {
    protocolo: "000471/2026",
    tipo: "deslizamento",
    severidade: "critica",
    endereco: "Rua das Acácias, 245",
    pontoReferencia: null,
    latitude: -22.4187,
    longitude: -45.4523,
    solicitanteNome: "Marilda Souza Prado",
    criadoEm: "2026-09-09T09:15:00.000Z",
    descricao: "Talude cedeu depois da chuva.",
    vulnerabilidadePresente: false,
    vulnerabilidadeDescricao: null,
  },
  vistoria: {
    checklist: VISTORIA_BASE.checklist,
    observacoes: null,
    assinanteNome: "Marilda Souza Prado",
    gpsPrecisaoMetros: 8,
    coletadaEm: "2026-09-09T14:30:00.000Z",
    agenteNome: "Joana Ribeiro",
    agenteMatricula: "DC-2291",
    pessoas: {},
  },
  quantasFotos: 1,
};

/** A seção da minuta que nomeia os órgãos, se ela existir. */
function secaoDeOrgaos(vistoria: Partial<DadosMinuta["vistoria"]>) {
  const m = montarMinuta({
    ...MINUTA_BASE,
    vistoria: { ...MINUTA_BASE.vistoria, ...vistoria },
  });
  return m.secoes.find((s) => s.titulo === "Órgãos a acionar");
}

describe("a chave do item que se desdobra", () => {
  it("aponta para um item que existe mesmo no catálogo do checklist", () => {
    // Sem isto, renomear a chave no catálogo desligaria o desdobramento em
    // silêncio: a tela deixaria de abrir a seleção e ninguém veria erro nenhum.
    const chaves = CHECKLIST_VISTORIA.map((i) => i.chave);
    expect(chaves).toContain(CHAVE_ACIONAR_ORGAO);
  });

  it("o item que se desdobra é obrigatório", () => {
    /*
      Importa porque é ele que sustenta a regra do catálogo vazio: item
      obrigatório sem resposta possível travaria a vistoria justamente sem sinal,
      e é por isso que o campo livre existe. Se um dia alguém o tornar opcional,
      esta linha obriga a reler aquela decisão.
    */
    const item = CHECKLIST_VISTORIA.find((i) => i.chave === CHAVE_ACIONAR_ORGAO);
    expect(item?.obrigatorio).toBe(true);
  });
});

describe("o envelope de sincronização", () => {
  it("aceita órgão escolhido no catálogo e órgão digitado à mão", () => {
    /*
      Os dois no mesmo envio, de propósito: o aparelho com catálogo baixado ainda
      encontra o órgão que o município não cadastrou, e recusar o segundo faria o
      agente desistir do primeiro para conseguir concluir.
    */
    const r = vistoriaSchema.safeParse({
      ...VISTORIA_BASE,
      orgaosParaAcionar: [
        { orgaoId: "00000000-0000-4000-8000-000000000001", nome: "Corpo de Bombeiros" },
        { orgaoId: null, nome: "Concessionária de energia" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("aceita a coleta do aparelho que ainda não atualizou", () => {
    /*
      O envelope antigo responde "sim" e não manda lista nenhuma. Recusar aqui
      pareceria mais rigoroso e destruiria trabalho: a fila marcaria a coleta como
      falha permanente, não existe tela para corrigir item bloqueado, e o agente
      perderia a manhã no morro por um campo que o aplicativo dele nem conhecia.
    */
    const r = vistoriaSchema.safeParse(VISTORIA_BASE);
    expect(r.success).toBe(true);
  });

  it("recusa a coleta que diz não e lista órgãos assim mesmo", () => {
    /*
      Contradição dentro do mesmo documento: o laudo imprimiria o checklist
      dizendo que não é necessário acionar ninguém e, embaixo, os nomes de quem
      acionar. Nenhum aplicativo publicado produz isto, então a recusa só alcança
      cliente adulterado, que é para quem a validação de servidor existe.
    */
    const r = vistoriaSchema.safeParse({
      ...VISTORIA_BASE,
      checklist: VISTORIA_BASE.checklist.map((i) =>
        i.chave === CHAVE_ACIONAR_ORGAO ? { ...i, resposta: false } : i,
      ),
      orgaosParaAcionar: [{ orgaoId: null, nome: "Corpo de Bombeiros" }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["orgaosParaAcionar"]);
  });

  it("recusa nome vazio, que é órgão nenhum ocupando uma linha do laudo", () => {
    const r = vistoriaSchema.safeParse({
      ...VISTORIA_BASE,
      orgaosParaAcionar: [{ orgaoId: null, nome: " " }],
    });
    expect(r.success).toBe(false);
  });
});

describe("a minuta lida em voz alta na porta da casa", () => {
  it("nomeia cada órgão indicado", () => {
    const secao = secaoDeOrgaos({
      orgaosParaAcionar: [{ nome: "Corpo de Bombeiros" }, { nome: "Companhia de água" }],
    });
    expect(secao?.tipo).toBe("texto");
    const corpo = secao?.tipo === "texto" ? secao.corpo : "";
    expect(corpo).toContain("Corpo de Bombeiros");
    expect(corpo).toContain("Companhia de água");
  });

  it("diz que ninguém foi especificado, em vez de calar", () => {
    /*
      É o laudo vindo de aparelho que não atualizou. Calar devolveria o
      coordenador ao telefonema: ele leria um documento sem menção nenhuma a
      órgão e não teria como saber que a informação faltou.
    */
    const secao = secaoDeOrgaos({});
    expect(secao?.tipo).toBe("texto");
    const corpo = secao?.tipo === "texto" ? secao.corpo : "";
    expect(corpo).toContain("sem especificar");
  });

  it("não inventa a seção quando a resposta foi não", () => {
    const secao = secaoDeOrgaos({
      checklist: VISTORIA_BASE.checklist.map((i) =>
        i.chave === CHAVE_ACIONAR_ORGAO ? { ...i, resposta: false } : i,
      ),
      orgaosParaAcionar: [],
    });
    expect(secao).toBeUndefined();
  });
});
