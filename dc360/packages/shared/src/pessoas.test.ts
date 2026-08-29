import { describe, expect, it } from "vitest";
import { CAMPOS_PESSOAS, pessoasAtingidasSchema } from "./schemas.js";
import { montarMinuta, type DadosMinuta } from "./minuta.js";

/**
 * Desalojado não é desabrigado, e não contar não é contar zero.
 *
 * As duas confusões que este arquivo existe para impedir custam coisas
 * diferentes, e as duas custam caro:
 *
 * A PRIMEIRA é somar desalojado com desabrigado. Desalojado saiu de casa e
 * tem para onde ir; desabrigado depende de abrigo público. O segundo número é
 * o que decide se o município precisa abrir uma escola às dez da noite, e um
 * campo só chamado "afetados" apaga exatamente essa decisão.
 *
 * A SEGUNDA é tratar ausência como zero. "Não contei" é vistoria incompleta;
 * "contei e deu zero" é casa em que ninguém precisou sair. Um laudo que
 * imprime "0 desabrigados" porque ninguém contou está afirmando uma coisa
 * falsa num documento que vai para processo, e ninguém que o ler vai
 * desconfiar de um número.
 */

const BASE: DadosMinuta = {
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
    criadoEm: "2026-08-20T09:15:00.000Z",
    descricao: "Talude cedeu depois da chuva.",
    vulnerabilidadePresente: false,
    vulnerabilidadeDescricao: null,
  },
  vistoria: {
    checklist: [{ chave: "risco_iminente", resposta: true }],
    observacoes: null,
    assinanteNome: "Marilda Souza Prado",
    gpsPrecisaoMetros: 6,
    coletadaEm: "2026-08-20T14:30:00.000Z",
    agenteNome: "Joana Ribeiro",
    agenteMatricula: "DC-2291",
    pessoas: {},
  },
  quantasFotos: 1,
};

function secaoDePessoas(pessoas: DadosMinuta["vistoria"]["pessoas"]) {
  const m = montarMinuta({ ...BASE, vistoria: { ...BASE.vistoria, pessoas } });
  const s = m.secoes.find((x) => x.titulo === "Pessoas atingidas");
  if (!s) throw new Error("a minuta não tem seção de pessoas atingidas");
  return s;
}

describe("As duas contagens são coisas diferentes", () => {
  it("desalojado e desabrigado são campos separados, com explicação própria", () => {
    const chaves = CAMPOS_PESSOAS.map((c) => c.chave);
    expect(chaves).toContain("desalojados");
    expect(chaves).toContain("desabrigados");

    const desalojado = CAMPOS_PESSOAS.find((c) => c.chave === "desalojados")!;
    const desabrigado = CAMPOS_PESSOAS.find((c) => c.chave === "desabrigados")!;

    // A ajuda não pode ser a mesma frase nos dois: se for, alguém colou, e a
    // tela deixa de ensinar a diferença justamente para quem não a conhece.
    expect(desalojado.ajuda).not.toBe(desabrigado.ajuda);
    expect(desalojado.ajuda).toMatch(/têm para onde ir/i);
    expect(desabrigado.ajuda).toMatch(/abrigo público/i);
  });

  it("não existe campo único somando os dois", () => {
    /*
      Portão contra a simplificação que vai ser proposta um dia: "por que não
      um campo só de afetados?". Porque o número que decide abrir abrigo some.
    */
    const chaves = CAMPOS_PESSOAS.map((c) => String(c.chave));
    for (const proibido of ["afetados", "atingidos", "total"]) {
      expect(chaves, `campo agregado ${proibido} apaga a distinção`).not.toContain(proibido);
    }
  });
});

describe("Não contar não é contar zero", () => {
  it("nada contado produz uma frase, e não cinco zeros", () => {
    const s = secaoDePessoas({});
    expect(s.tipo).toBe("texto");
    if (s.tipo !== "texto") throw new Error("esperava texto");
    expect(s.corpo).toMatch(/não contadas/i);
    // A frase precisa dizer o que a ausência NÃO significa, senão quem lê
    // conclui que não houve atingido.
    expect(s.corpo).toMatch(/não significa ausência/i);
    expect(s.corpo).not.toMatch(/\b0\b/);
  });

  it("contar zero produz o número zero, escrito", () => {
    const s = secaoDePessoas({ desabrigados: 0 });
    if (s.tipo !== "campos") throw new Error("esperava campos");
    const linha = s.linhas.find((l) => l.rotulo === "Desabrigados")!;
    expect(linha.valor).toBe("0");
  });

  it("contado em parte: o que faltou sai como não informado, nunca como zero", () => {
    const s = secaoDePessoas({ desalojados: 4 });
    if (s.tipo !== "campos") throw new Error("esperava campos");

    expect(s.linhas.find((l) => l.rotulo === "Desalojados")!.valor).toBe("4");
    for (const rotulo of ["Desabrigados", "Feridos", "Desaparecidos", "Óbitos"]) {
      expect(
        s.linhas.find((l) => l.rotulo === rotulo)!.valor,
        `${rotulo} não contado saiu como número`,
      ).toBe("não informado");
    }
  });
});

describe("O que o esquema recusa", () => {
  it("recusa contagem negativa", () => {
    expect(pessoasAtingidasSchema.safeParse({ desabrigados: -1 }).success).toBe(false);
  });

  it("recusa número que só pode ser dedo escorregando", () => {
    // Teclado numérico de celular, no escuro, com luva. Um laudo dizendo
    // "42000000 desabrigados" num município de vinte mil sai impresso e
    // ninguém revisa.
    expect(pessoasAtingidasSchema.safeParse({ desabrigados: 42_000_000 }).success).toBe(false);
  });

  it("recusa fração de pessoa", () => {
    expect(pessoasAtingidasSchema.safeParse({ feridos: 2.5 }).success).toBe(false);
  });

  it("aceita o objeto vazio, que é o caso de quem não contou", () => {
    const r = pessoasAtingidasSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.desabrigados).toBeUndefined();
  });

  it("aceita zero, que é diferente de não mandar", () => {
    const r = pessoasAtingidasSchema.safeParse({ desabrigados: 0 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.desabrigados).toBe(0);
  });
});
