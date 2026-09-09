import { describe, expect, it } from "vitest";
import { quantoFalta } from "../src/prazo.js";

const AGORA = new Date("2026-09-09T12:00:00.000Z").getTime();
const daqui = (ms: number) => new Date(AGORA + ms).toISOString();
const HORA = 3_600_000;
const MINUTO = 60_000;

describe("contagem regressiva do prazo", () => {
  /*
    A correcao: era `Math.round`, entao 22h31 virava "Vence em 23h" e o
    aplicativo dava ao agente meia hora que ele nao tinha. Contagem regressiva
    arredonda para baixo, senao ela mente a favor de quem esta atrasado.
  */
  it("arredonda para baixo, nunca para cima", () => {
    expect(quantoFalta(daqui(22 * HORA + 31 * MINUTO), AGORA).texto).toBe("Vence em 22h");
    expect(quantoFalta(daqui(22 * HORA + 59 * MINUTO), AGORA).texto).toBe("Vence em 22h");
  });

  it("abaixo de quatro horas, mostra minutos, porque a decisão muda ali", () => {
    expect(quantoFalta(daqui(3 * HORA + 20 * MINUTO), AGORA).texto).toBe("Vence em 3h20");
    expect(quantoFalta(daqui(40 * MINUTO), AGORA).texto).toBe("Vence em 40min");
  });

  it("abaixo de quatro horas já conta como atrasado, para subir na lista", () => {
    expect(quantoFalta(daqui(3 * HORA), AGORA).atrasado).toBe(true);
    expect(quantoFalta(daqui(5 * HORA), AGORA).atrasado).toBe(false);
  });

  it("vencido diz há quanto tempo, também para baixo", () => {
    expect(quantoFalta(daqui(-2 * HORA - 50 * MINUTO), AGORA).texto).toBe("Vencido há 2h");
    expect(quantoFalta(daqui(-2 * HORA - 50 * MINUTO), AGORA).vencido).toBe(true);
  });

  it("vencido há menos de uma hora conta em minutos", () => {
    expect(quantoFalta(daqui(-25 * MINUTO), AGORA).texto).toBe("Vencido há 25min");
  });

  it("acabou de vencer não vira 'há 0min'", () => {
    // Zero minutos de atraso lê como se não tivesse vencido.
    expect(quantoFalta(daqui(-10), AGORA).texto).toBe("Vencido há 1min");
  });

  it("sem prazo não inventa urgência", () => {
    const p = quantoFalta(null, AGORA);
    expect(p.texto).toBe("Sem prazo definido");
    expect(p.atrasado).toBe(false);
    expect(p.vencido).toBe(false);
  });
});
