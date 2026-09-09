import { describe, expect, it } from "vitest";
import {
  ROTULO_TIPO_COBRADE, TIPOS_COBRADE, TIPOS_DE_ENTRADA, TIPO_A_CLASSIFICAR,
  aberturaOcorrenciaSchema, precisaReclassificar, triagemSchema,
} from "../src/index.js";

/**
 * O chamado que não cabe em nenhum dos oito, e o dado falso que ele produzia.
 *
 * A COBRADE é fechada e não se inventa. Só que o plantão recebe queda de árvore
 * sobre a via, rompimento de adutora, muro do vizinho que desabou, e até aqui o
 * operador escolhia o menos errado. Isso não deixa o dado incompleto: deixa o
 * dado FALSO, e ele contamina a única série histórica que o município leva para
 * pedir recurso. "Vendaval: dez", dos quais três eram outra coisa, é um número
 * que ninguém pode usar e que ninguém sabe que não pode.
 *
 * A saída tem duas metades, e uma sem a outra é pior que o problema:
 *
 * 1. "Outro" existe na ABERTURA, com descrição obrigatória.
 * 2. "Outro" não sobrevive ao DESPACHO. O tipo real é decidido na triagem, por
 *    quem tem competência técnica, senão o laudo oficial sai com brasão e a
 *    palavra "Outro" no campo do tipo, e ninguém volta para classificar depois.
 */

const ABERTURA_BASE = {
  solicitanteNome: "Marilda Souza Prado",
  canalEntrada: "telefone" as const,
  endereco: "Rua das Acácias, 245",
  descricao: "Árvore de grande porte caiu sobre a via e isolou quatro casas.",
};

describe("a taxonomia continua fechada", () => {
  it("outro NÃO entra na COBRADE", () => {
    /*
      O caso que impede a saída fácil. Acrescentar "outro" à lista da taxonomia
      resolveria o formulário e quebraria toda contagem por tipo: o gráfico do
      painel, a prestação de contas e a série histórica passariam a ter uma
      categoria que a norma não tem, apresentada como se fosse uma delas.
    */
    expect(TIPOS_COBRADE as readonly string[]).not.toContain(TIPO_A_CLASSIFICAR);
    expect(TIPOS_COBRADE).toHaveLength(8);
  });

  it("a lista da abertura é a taxonomia mais a confissão, e nada além disso", () => {
    expect(TIPOS_DE_ENTRADA).toEqual([...TIPOS_COBRADE, TIPO_A_CLASSIFICAR]);
  });

  it("outro tem rótulo, senão a tela imprime um branco no lugar do tipo", () => {
    /*
      Toda tela do produto imprime o tipo indexando esta tabela. Chave sem rótulo
      não vira erro: vira uma linha da lista do coordenador que parece não ter
      tipo, e ninguém abre chamado para investigar um espaço em branco.
    */
    expect(ROTULO_TIPO_COBRADE[TIPO_A_CLASSIFICAR]).toBeTruthy();
    expect(ROTULO_TIPO_COBRADE[TIPO_A_CLASSIFICAR]).toContain("classificar");
  });
});

describe("a abertura do chamado", () => {
  it("aceita outro quando a descrição diz o que foi relatado", () => {
    const r = aberturaOcorrenciaSchema.safeParse({
      ...ABERTURA_BASE,
      tipo: TIPO_A_CLASSIFICAR,
      tipoDescricao: "Queda de árvore sobre a via",
    });
    expect(r.success).toBe(true);
  });

  it("recusa outro sem descrição", () => {
    /*
      Sem a descrição, a triagem abre um chamado que diz "Outro" e nada mais, e a
      decisão técnica que ela existe para tomar fica sem matéria prima. O erro
      aponta o campo, para a tela poder marcá-lo em vez de dar recado genérico.
    */
    const r = aberturaOcorrenciaSchema.safeParse({
      ...ABERTURA_BASE,
      tipo: TIPO_A_CLASSIFICAR,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["tipoDescricao"]);
  });

  it("recusa descrição de ocasião, do tamanho de um x", () => {
    const r = aberturaOcorrenciaSchema.safeParse({
      ...ABERTURA_BASE,
      tipo: TIPO_A_CLASSIFICAR,
      tipoDescricao: "outro",
    });
    expect(r.success).toBe(false);
  });

  it("não cobra descrição de quem classificou na COBRADE", () => {
    // Pedir descrição em chamado já classificado ensinaria a preencher qualquer
    // coisa, e o campo perderia o sentido justamente onde ele importa.
    const r = aberturaOcorrenciaSchema.safeParse({
      ...ABERTURA_BASE,
      tipo: "deslizamento",
    });
    expect(r.success).toBe(true);
  });
});

describe("a triagem, que é quem decide", () => {
  it("reclassifica para um tipo da COBRADE", () => {
    const r = triagemSchema.safeParse({
      severidade: "alta",
      vulnerabilidadePresente: false,
      tipo: "colapso_edificacao",
    });
    expect(r.success).toBe(true);
  });

  it("não deixa a triagem devolver o chamado para outro", () => {
    /*
      Permitir a volta transformaria o portão do despacho em formalidade: bastaria
      reclassificar para o mesmo lugar de onde se veio e seguir em frente.
    */
    const r = triagemSchema.safeParse({
      severidade: "alta",
      vulnerabilidadePresente: false,
      tipo: TIPO_A_CLASSIFICAR,
    });
    expect(r.success).toBe(false);
  });

  it("segue aceitando triagem sem tocar no tipo", () => {
    // A maioria dos chamados já entra classificada. Reafirmar o tipo em toda
    // triagem seria pedir de novo o que ninguém tem motivo para mudar.
    const r = triagemSchema.safeParse({
      severidade: "media",
      vulnerabilidadePresente: false,
    });
    expect(r.success).toBe(true);
  });
});

describe("o portão do despacho", () => {
  it("barra a ocorrência que ainda está como outro", () => {
    expect(precisaReclassificar(TIPO_A_CLASSIFICAR)).toBe(true);
  });

  it("não barra nada que já esteja na taxonomia", () => {
    for (const tipo of TIPOS_COBRADE) {
      expect(precisaReclassificar(tipo), tipo).toBe(false);
    }
  });
});
