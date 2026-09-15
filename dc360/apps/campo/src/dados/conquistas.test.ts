import { MARCOS, conquistas } from "./conquistas";

/**
 * Os selos por marco, calculados no aparelho a partir do total do servidor.
 *
 * Sem tabela nova, de propósito: o total de vistorias concluídas já desce em
 * `GET /campo/meu-trabalho` e é o registro do trabalho do agente. Um selo é
 * só uma leitura desse número, e leitura não precisa de linha no banco.
 *
 * O que estes casos travam: os marcos são os cinco combinados (1, 10, 50, 100,
 * 500), o próximo diz quanto falta em número e em fração, e o último marco
 * não tem "próximo" em vez de inventar um sexto.
 */

describe("os marcos", () => {
  it("são os cinco combinados, em ordem", () => {
    expect(MARCOS.map((m) => m.total)).toEqual([1, 10, 50, 100, 500]);
  });

  it("cada um tem palavra própria, e nenhuma se repete", () => {
    const palavras = MARCOS.map((m) => m.titulo);
    expect(new Set(palavras).size).toBe(palavras.length);
    for (const p of palavras) expect(p.length).toBeGreaterThan(0);
  });
});

describe("quem ainda não concluiu nenhuma", () => {
  it("não tem selo, e o próximo é a primeira, faltando uma", () => {
    const c = conquistas(0);
    expect(c.conquistadas).toEqual([]);
    expect(c.proxima?.marco.total).toBe(1);
    expect(c.proxima?.faltam).toBe(1);
    expect(c.proxima?.progresso).toBe(0);
  });
});

describe("no meio do caminho", () => {
  it("com 7 concluídas, tem o selo da primeira e faltam 3 para dez", () => {
    const c = conquistas(7);
    expect(c.conquistadas.map((m) => m.total)).toEqual([1]);
    expect(c.proxima?.marco.total).toBe(10);
    expect(c.proxima?.faltam).toBe(3);
    /* O progresso é medido do marco ANTERIOR ao próximo, e não do zero: com
       7 de 10 a barra mostra 6 de 9 (de 1 a 10), que é o que resta percorrer.
       Medido do zero, a barra da centena começaria em 50% no dia em que o
       agente ganhou o selo dos cinquenta, e um marco que nasce meio cheio não
       parece um marco. */
    expect(c.proxima?.progresso).toBeCloseTo(6 / 9, 5);
  });

  it("com 62 concluídas, tem três selos e faltam 38 para cem", () => {
    const c = conquistas(62);
    expect(c.conquistadas.map((m) => m.total)).toEqual([1, 10, 50]);
    expect(c.proxima?.marco.total).toBe(100);
    expect(c.proxima?.faltam).toBe(38);
    expect(c.proxima?.progresso).toBeCloseTo(12 / 50, 5);
  });

  it("exatamente no marco, o selo já é dele e o próximo começa do zero", () => {
    const c = conquistas(50);
    expect(c.conquistadas.map((m) => m.total)).toEqual([1, 10, 50]);
    expect(c.proxima?.marco.total).toBe(100);
    expect(c.proxima?.progresso).toBe(0);
  });
});

describe("no topo", () => {
  it("com 500 ou mais, tem os cinco selos e nenhum próximo", () => {
    expect(conquistas(500).conquistadas).toHaveLength(5);
    expect(conquistas(500).proxima).toBeNull();
    expect(conquistas(1234).proxima).toBeNull();
  });
});

describe("entrada torta", () => {
  it("total negativo ou não numérico conta como zero, e não estoura a tela", () => {
    expect(conquistas(-3).conquistadas).toEqual([]);
    expect(conquistas(Number.NaN).proxima?.marco.total).toBe(1);
  });
});
