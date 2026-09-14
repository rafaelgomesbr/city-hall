import { describe, expect, it } from "vitest";
import { dataDoPrazo, quantoFalta } from "../src/prazo.js";

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

describe("dataDoPrazo", () => {
  /*
    "Vence em 9h" nao diz se o prazo cai dentro do turno do agente ou ja na
    madrugada, e e essa distincao que decide se ele sobe hoje. O painel ganhou
    as duas colunas; o aplicativo mostrava so o relativo, e o agente e quem esta
    mais longe de um calendario.
  */
  it("mostra dia, mes e hora, sem ano e sem segundos", () => {
    const texto = dataDoPrazo("2026-09-10T15:30:00.000Z");
    expect(texto).toMatch(/^\d{2}\/\d{2}, \d{2}:\d{2}$/);
  });

  it("sem prazo, devolve vazio em vez de repetir a ausencia", () => {
    // Quem chama ja mostra "Sem prazo definido" pelo `quantoFalta`. Dizer a
    // mesma ausencia duas vezes na mesma linha e ruido.
    expect(dataDoPrazo(null)).toBe("");
  });

  it("data ilegivel nao quebra a tela da lista de tarefas", () => {
    // Rascunho gravado por versao antiga, ou dado corrompido no disco: a lista
    // inteira do agente nao pode sumir por causa de um campo.
    expect(dataDoPrazo("nao e uma data")).toBe("");
  });
});

describe("o prazo que o servidor mandou e ninguém consegue ler", () => {
  /*
    `ordemDoDia` já trata prazo ilegível, e a tela não tratava: o texto saía
    como "Vence em NaNh", que é pior do que não saber, porque parece um prazo.

    O caminho não é hipotético. `prazo_em` desce como texto do servidor e é
    guardado como texto no aparelho; uma linha gravada por versão anterior, um
    campo truncado no disco ou uma data que o Postgres devolveu em formato que
    o `Date` do JavaScript não entende produzem exatamente isto. E o número que
    sai daqui não é só texto: `atrasado` pinta o cartão de vermelho e
    `vencido` libera a devolução da tarefa para a coordenação.
  */
  it("não vira um prazo que ninguém consegue cumprir", () => {
    const ilegivel = quantoFalta("não é data", AGORA);
    expect(ilegivel.texto).not.toMatch(/NaN/);
    expect(ilegivel.texto).toBe("Sem prazo definido");
  });

  /*
    E não pode ser lido como vencido: um prazo ilegível tratado como vencido
    ofereceria ao agente devolver para a coordenação uma tarefa cujo prazo
    ninguém sabe qual é.
  */
  it("prazo ilegível não é prazo vencido", () => {
    const ilegivel = quantoFalta("2026-13-45T99:99:99Z", AGORA);
    expect(ilegivel.vencido).toBe(false);
    expect(ilegivel.atrasado).toBe(false);
  });
});
