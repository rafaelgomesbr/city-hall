import { describe, expect, it } from "vitest";
import {
  conferirEscolha,
  orgaosCompetentes,
  type CompetenciaDoOrgao,
  type ResultadoDaConferencia,
} from "../src/index.js";

const COMPETENCIAS: readonly CompetenciaDoOrgao[] = [
  { orgaoId: "obras", tiposCobrade: ["deslizamento", "alagamento"], ativa: true },
  { orgaoId: "saude", tiposCobrade: ["inundacao"], ativa: true },
  { orgaoId: "habitacao", tiposCobrade: ["deslizamento"], ativa: false },
];

describe("orgaosCompetentes", () => {
  it("devolve lista vazia para tipo sem competência cadastrada", () => {
    expect(orgaosCompetentes("vendaval", COMPETENCIAS)).toEqual([]);
  });

  it("devolve lista vazia quando o município não cadastrou competências", () => {
    expect(orgaosCompetentes("deslizamento", [])).toEqual([]);
  });

  it("sugere apenas órgãos ativos que atendem ao tipo COBRADE", () => {
    expect(orgaosCompetentes("deslizamento", COMPETENCIAS)).toEqual(["obras"]);
    expect(orgaosCompetentes("alagamento", COMPETENCIAS)).toEqual(["obras"]);
    expect(orgaosCompetentes("inundacao", COMPETENCIAS)).toEqual(["saude"]);
  });

  it("nunca sugere órgão com competência inativa", () => {
    expect(orgaosCompetentes("deslizamento", [COMPETENCIAS[2]!])).toEqual([]);
  });

  it("remove repetições e preserva a ordem da primeira competência ativa correspondente", () => {
    const competencias: readonly CompetenciaDoOrgao[] = [
      { orgaoId: "obras", tiposCobrade: ["deslizamento"], ativa: false },
      { orgaoId: "habitacao", tiposCobrade: ["deslizamento"], ativa: true },
      { orgaoId: "saude", tiposCobrade: ["inundacao"], ativa: true },
      { orgaoId: "obras", tiposCobrade: ["deslizamento", "deslizamento"], ativa: true },
      { orgaoId: "habitacao", tiposCobrade: ["deslizamento"], ativa: true },
      { orgaoId: "saude", tiposCobrade: ["deslizamento"], ativa: true },
    ];

    expect(orgaosCompetentes("deslizamento", competencias)).toEqual([
      "habitacao",
      "obras",
      "saude",
    ]);
  });

  it("não altera as competências nem compartilha a lista de sugestões entre chamadas", () => {
    const competencias: readonly CompetenciaDoOrgao[] = Object.freeze([
      Object.freeze({
        orgaoId: "obras",
        tiposCobrade: Object.freeze(["deslizamento"] as const),
        ativa: true,
      }),
    ]);
    const sugeridos = orgaosCompetentes("deslizamento", competencias);
    sugeridos.push("saude");
    conferirEscolha("deslizamento", "saude", competencias);

    expect(orgaosCompetentes("deslizamento", competencias)).toEqual(["obras"]);
    expect(competencias).toEqual([
      { orgaoId: "obras", tiposCobrade: ["deslizamento"], ativa: true },
    ]);
  });
});

describe("conferirEscolha", () => {
  it("reconhece a escolha sugerida sem exigir justificativa", () => {
    const resultado: ResultadoDaConferencia = conferirEscolha(
      "deslizamento",
      "obras",
      COMPETENCIAS,
    );

    expect(resultado).toEqual({ entreSugeridos: true, precisaJustificativa: false });
  });

  it("pede justificativa para escolha fora da sugestão sem justificativa", () => {
    expect(conferirEscolha("deslizamento", "saude", COMPETENCIAS)).toEqual({
      entreSugeridos: false,
      precisaJustificativa: true,
    });
  });

  it("pede justificativa para escolha fora da sugestão com justificativa curta", () => {
    expect(conferirEscolha("deslizamento", "saude", COMPETENCIAS, "Apoio local")).toEqual({
      entreSugeridos: false,
      precisaJustificativa: true,
    });
  });

  it("dispensa a pendência fora da sugestão com justificativa longa", () => {
    expect(
      conferirEscolha(
        "deslizamento",
        "saude",
        COMPETENCIAS,
        "A equipe de saúde apoiará as famílias atingidas no local.",
      ),
    ).toEqual({ entreSugeridos: false, precisaJustificativa: false });
  });

  it("exige 20 caracteres e desconsidera espaços nas pontas da justificativa", () => {
    const justificativa = "Atendimento especial";
    expect(justificativa).toHaveLength(20);
    expect(
      conferirEscolha("deslizamento", "saude", COMPETENCIAS, `  ${justificativa.slice(0, -1)}  `)
        .precisaJustificativa,
    ).toBe(true);
    expect(
      conferirEscolha("deslizamento", "saude", COMPETENCIAS, `  ${justificativa}  `)
        .precisaJustificativa,
    ).toBe(false);
    expect(
      conferirEscolha("deslizamento", "saude", COMPETENCIAS, " ".repeat(20)).precisaJustificativa,
    ).toBe(true);
  });

  it("trata órgão inativo como escolha fora da sugestão", () => {
    expect(conferirEscolha("deslizamento", "habitacao", COMPETENCIAS)).toEqual({
      entreSugeridos: false,
      precisaJustificativa: true,
    });
  });

  it("pede justificativa quando não há sugestões para o tipo", () => {
    expect(conferirEscolha("vendaval", "obras", COMPETENCIAS)).toEqual({
      entreSugeridos: false,
      precisaJustificativa: true,
    });
    expect(conferirEscolha("deslizamento", "obras", [])).toEqual({
      entreSugeridos: false,
      precisaJustificativa: true,
    });
  });

  it("nunca lança por escolha fora da sugestão ou por justificativa insuficiente", () => {
    const justificativas: readonly (string | undefined)[] = [
      undefined,
      "",
      " ".repeat(20),
      "Apoio local",
      "Atendimento especial",
    ];
    for (const competencias of [COMPETENCIAS, []]) {
      for (const justificativa of justificativas) {
        expect(() =>
          conferirEscolha("deslizamento", "orgao-nao-cadastrado", competencias, justificativa),
        ).not.toThrow();
      }
    }
  });
});
