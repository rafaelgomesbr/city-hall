import { describe, expect, it } from "vitest";
import {
  compararVersoes,
  ehAplicativoComVersaoMinima,
  estaAbaixoDoMinimo,
  lerCabecalhoDeVersao,
  lerVersao,
} from "../src/index";

/**
 * A comparação de versões e a leitura do cabeçalho `X-App-Version`
 * (V2-F02-E06). Tudo tolerante: o cabeçalho é declarado pelo cliente, então o
 * que não se lê vira `null`, nunca exceção.
 */

describe("lerVersao", () => {
  it("lê maior.menor.correção", () => {
    expect(lerVersao("1.4.0")).toEqual([1, 4, 0]);
    expect(lerVersao(" 10.20.30 ")).toEqual([10, 20, 30]);
  });

  it("ignora o pré-lançamento e a build", () => {
    expect(lerVersao("1.4.0-beta.2")).toEqual([1, 4, 0]);
    expect(lerVersao("1.4.0+abc123")).toEqual([1, 4, 0]);
    expect(lerVersao("2.0.0-rc.1+build.7")).toEqual([2, 0, 0]);
  });

  it("devolve null para o que não tem a forma", () => {
    for (const ruim of ["", "1.4", "1", "a.b.c", "1.4.0.1", "1.4.x", "v1.4.0", "-1.4.0", "1..0"]) {
      expect(lerVersao(ruim), ruim).toBeNull();
    }
    expect(lerVersao(undefined)).toBeNull();
    expect(lerVersao(14)).toBeNull();
    expect(lerVersao(null)).toBeNull();
    expect(lerVersao({})).toBeNull();
  });

  it("recusa número grande demais (a comparação nunca perde precisão)", () => {
    expect(lerVersao("1234567890.0.0")).toBeNull();
    expect(lerVersao("999999999.999999999.999999999")).toEqual([999999999, 999999999, 999999999]);
  });
});

describe("compararVersoes", () => {
  it("compara maior, depois menor, depois correção", () => {
    expect(compararVersoes("1.2.0", "1.3.0")).toBe(-1);
    expect(compararVersoes("1.4.0", "1.3.0")).toBe(1);
    expect(compararVersoes("1.3.0", "1.3.0")).toBe(0);
    expect(compararVersoes("2.0.0", "1.99.99")).toBe(1);
    expect(compararVersoes("1.3.9", "1.3.10")).toBe(-1);
    expect(compararVersoes("1.10.0", "1.9.0")).toBe(1);
  });

  it("compara números, não texto (1.10 é maior que 1.9)", () => {
    expect(compararVersoes("1.9.0", "1.10.0")).toBe(-1);
  });

  it("o pré-lançamento não conta: 1.4.0-beta e 1.4.0 são a mesma versão", () => {
    expect(compararVersoes("1.4.0-beta.1", "1.4.0")).toBe(0);
    expect(compararVersoes("1.4.0-rc.9", "1.3.9")).toBe(1);
  });

  it("devolve null se alguma das duas não se lê", () => {
    expect(compararVersoes("abc", "1.0.0")).toBeNull();
    expect(compararVersoes("1.0.0", "")).toBeNull();
    expect(compararVersoes(undefined, "1.0.0")).toBeNull();
  });
});

describe("lerCabecalhoDeVersao", () => {
  it("lê aplicativo e versão", () => {
    expect(lerCabecalhoDeVersao("campo/1.4.0")).toEqual({
      aplicativo: "campo",
      versao: "1.4.0",
      numerica: [1, 4, 0],
    });
    expect(lerCabecalhoDeVersao("cidadao/2.0.1-beta.3")?.numerica).toEqual([2, 0, 1]);
  });

  it("o painel manda a build, que não é versão numérica", () => {
    expect(lerCabecalhoDeVersao("painel/a1b2c3d")).toEqual({
      aplicativo: "painel",
      versao: "a1b2c3d",
      numerica: null,
    });
  });

  it("aceita maiúsculas e espaços nas pontas", () => {
    expect(lerCabecalhoDeVersao("  CAMPO/1.4.0 ")?.aplicativo).toBe("campo");
  });

  it("devolve null para ausente, vazio, malformado e aplicativo desconhecido", () => {
    for (const ruim of [
      undefined,
      null,
      5,
      "",
      "   ",
      "campo",
      "campo/",
      "/1.4.0",
      "campo/1.4.0/extra",
      "robo/1.0.0",
      "campo 1.4.0",
      "campo/1.4.0, campo/1.5.0",
      "campo/1.4.0\r\nX-Falso: 1",
      "campo/" + "9".repeat(60),
      "camp0/1.0.0",
    ]) {
      expect(lerCabecalhoDeVersao(ruim), String(ruim)).toBeNull();
    }
  });
});

describe("estaAbaixoDoMinimo", () => {
  const campo = (v: string) => lerCabecalhoDeVersao(`campo/${v}`);

  it("recusa só o que está claramente abaixo", () => {
    expect(estaAbaixoDoMinimo(campo("1.2.0"), "1.3.0")).toBe(true);
    expect(estaAbaixoDoMinimo(campo("1.3.0"), "1.3.0")).toBe(false);
    expect(estaAbaixoDoMinimo(campo("1.4.0"), "1.3.0")).toBe(false);
  });

  it("mínimo vazio ou ilegível não recusa ninguém", () => {
    expect(estaAbaixoDoMinimo(campo("0.0.1"), undefined)).toBe(false);
    expect(estaAbaixoDoMinimo(campo("0.0.1"), "")).toBe(false);
    expect(estaAbaixoDoMinimo(campo("0.0.1"), "texto")).toBe(false);
  });

  it("sem declaração legível passa (build do painel, cabeçalho ilegível)", () => {
    expect(estaAbaixoDoMinimo(null, "9.9.9")).toBe(false);
    expect(estaAbaixoDoMinimo(lerCabecalhoDeVersao("painel/abc"), "9.9.9")).toBe(false);
  });
});

describe("ehAplicativoComVersaoMinima", () => {
  it("campo e cidadão têm mínimo; o painel e o resto, não", () => {
    expect(ehAplicativoComVersaoMinima("campo")).toBe(true);
    expect(ehAplicativoComVersaoMinima("cidadao")).toBe(true);
    expect(ehAplicativoComVersaoMinima("painel")).toBe(false);
    expect(ehAplicativoComVersaoMinima("constructor")).toBe(false);
    expect(ehAplicativoComVersaoMinima(undefined)).toBe(false);
  });
});
