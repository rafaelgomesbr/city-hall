import { afterAll, describe, expect, it } from "vitest";
import { FUSO_PADRAO, anoNoFuso, dataHoraNoFuso, dataNoFuso, fusoDoEstado } from "../src/fuso.js";

/**
 * O fuso do estado do município num lugar só (V2-F02-E09).
 *
 * O DEFEITO QUE ISTO GUARDA: o ano do protocolo e as datas do CSV saíam do
 * relógio do processo, que em contêiner é UTC. Às 22h de 31 de dezembro em
 * Brasília a ocorrência recebia protocolo do ano seguinte, e uma ocorrência
 * das 22h entrava na planilha com a data do dia seguinte.
 *
 * A prova é a VIRADA DO DIA em cada estado coberto: um minuto antes e na hora
 * exata da meia-noite local, com o deslocamento de cada estado escrito aqui à
 * mão (e não calculado pela função sob teste). O arquivo roda com o fuso do
 * processo em UTC e de novo num fuso distante, para provar que o resultado não
 * depende da máquina.
 */

/** Deslocamento em horas em relação a UTC, em dezembro de 2026 (sem horário de verão). */
const DESLOCAMENTO_POR_UF: Record<string, number> = {
  AC: -5,
  AM: -4,
  MT: -4,
  MS: -4,
  RO: -4,
  RR: -4,
  AL: -3,
  AP: -3,
  BA: -3,
  CE: -3,
  DF: -3,
  ES: -3,
  GO: -3,
  MA: -3,
  MG: -3,
  PA: -3,
  PB: -3,
  PE: -3,
  PI: -3,
  PR: -3,
  RJ: -3,
  RN: -3,
  RS: -3,
  SC: -3,
  SE: -3,
  SP: -3,
  TO: -3,
};

const UFS = Object.keys(DESLOCAMENTO_POR_UF);
const UM_MINUTO = 60_000;
const TZ_ORIGINAL = process.env["TZ"];

/** O instante da meia-noite de 01/01/2027 no fuso de deslocamento dado. */
function meiaNoiteDaVirada(deslocamentoHoras: number): Date {
  return new Date(Date.UTC(2027, 0, 1, -deslocamentoHoras, 0, 0));
}

afterAll(() => {
  if (TZ_ORIGINAL === undefined) delete process.env["TZ"];
  else process.env["TZ"] = TZ_ORIGINAL;
});

it("a tabela de teste cobre as 27 unidades da federação", () => {
  expect(UFS).toHaveLength(27);
});

describe.each(["UTC", "Pacific/Auckland"])("com o processo em %s", (tzDoProcesso) => {
  it("o processo está mesmo no fuso que o teste declara", () => {
    process.env["TZ"] = tzDoProcesso;
    const referencia = new Date(Date.UTC(2026, 11, 31, 12, 0, 0));
    expect(referencia.getTimezoneOffset()).toBe(tzDoProcesso === "UTC" ? 0 : -13 * 60);
  });

  describe.each(UFS)("%s", (uf) => {
    const fuso = () => fusoDoEstado(uf);
    const meiaNoite = () => meiaNoiteDaVirada(DESLOCAMENTO_POR_UF[uf]!);

    it("um minuto antes da meia-noite local ainda é 31/12/2026", () => {
      process.env["TZ"] = tzDoProcesso;
      const antes = new Date(meiaNoite().getTime() - UM_MINUTO);
      expect(anoNoFuso(antes, fuso())).toBe(2026);
      expect(dataNoFuso(antes, fuso())).toBe("2026-12-31");
      expect(dataHoraNoFuso(antes, fuso())).toBe("31/12/2026 23:59");
    });

    it("na meia-noite local já é 01/01/2027, e a hora é 00:00 (nunca 24:00)", () => {
      process.env["TZ"] = tzDoProcesso;
      expect(anoNoFuso(meiaNoite(), fuso())).toBe(2027);
      expect(dataNoFuso(meiaNoite(), fuso())).toBe("2027-01-01");
      expect(dataHoraNoFuso(meiaNoite(), fuso())).toBe("01/01/2027 00:00");
    });
  });
});

describe("A janela em que o relógio do processo erra o dia", () => {
  // 03:30Z de 01/01/2027: já é 2027 em UTC, mas ainda é réveillon no Acre.
  const instante = new Date("2027-01-01T03:30:00Z");

  it("em São Paulo já é 2027 (00:30), no Acre ainda é 2026 (22:30)", () => {
    expect(anoNoFuso(instante, fusoDoEstado("SP"))).toBe(2027);
    expect(dataHoraNoFuso(instante, fusoDoEstado("SP"))).toBe("01/01/2027 00:30");
    expect(anoNoFuso(instante, fusoDoEstado("AC"))).toBe(2026);
    expect(dataHoraNoFuso(instante, fusoDoEstado("AC"))).toBe("31/12/2026 22:30");
  });

  it("02:30Z de 01/01/2027 ainda é 2026 em São Paulo (23:30)", () => {
    const antes = new Date("2027-01-01T02:30:00Z");
    expect(anoNoFuso(antes, fusoDoEstado("SP"))).toBe(2026);
    expect(dataNoFuso(antes, fusoDoEstado("SP"))).toBe("2026-12-31");
  });
});

describe("O mapa de UF para fuso", () => {
  it("cada estado tem o seu identificador IANA, em qualquer caixa e com espaços", () => {
    expect(fusoDoEstado("MG")).toBe("America/Sao_Paulo");
    expect(fusoDoEstado(" ac ")).toBe("America/Rio_Branco");
    expect(fusoDoEstado("mt")).toBe("America/Cuiaba");
    expect(fusoDoEstado("AM")).toBe("America/Manaus");
  });

  it("UF desconhecida, vazia ou ausente cai no fuso padrão, sem erro e sem usar o do processo", () => {
    process.env["TZ"] = "Pacific/Auckland";
    for (const uf of ["ZZ", "", "  ", null, undefined]) {
      expect(fusoDoEstado(uf)).toBe(FUSO_PADRAO);
    }
    expect(FUSO_PADRAO).toBe("America/Sao_Paulo");
    expect(anoNoFuso(new Date("2027-01-01T02:30:00Z"), fusoDoEstado("ZZ"))).toBe(2026);
  });
});
