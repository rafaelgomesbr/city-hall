/**
 * A precisão de GPS que sai do aparelho, e o esquema que a recebe (V2-F00-E15,
 * CMP-33).
 *
 * A prova de que "sem 422" vale é passar o número que o aplicativo grava pelo
 * MESMO esquema que o servidor usa (`vistoriaSchema`, de `@dc360/shared`): o
 * esquema não foi afrouxado, quem mudou foi o número.
 */

import { gpsPrecisaoMetrosSchema } from "@dc360/shared";
import { precisaoDoGpsEmMetros } from "./precisao-do-gps";

/* O campo que `vistoriaSchema` usa, exportado em separado para esta prova. */
const campoDoEsquema = gpsPrecisaoMetrosSchema;

describe("a precisão gravada pelo aparelho", () => {
  it("abaixo de meio metro vira 1, e não zero", () => {
    expect(precisaoDoGpsEmMetros(0.3)).toBe(1);
    expect(precisaoDoGpsEmMetros(0.01)).toBe(1);
    expect(precisaoDoGpsEmMetros(0.49)).toBe(1);
  });

  it("a leitura comum continua arredondada ao metro", () => {
    expect(precisaoDoGpsEmMetros(12.4)).toBe(12);
    expect(precisaoDoGpsEmMetros(7.6)).toBe(8);
    expect(precisaoDoGpsEmMetros(0.5)).toBe(1);
    expect(precisaoDoGpsEmMetros(1.4)).toBe(1);
  });

  it("sem medida, grava nulo, e não um número inventado", () => {
    expect(precisaoDoGpsEmMetros(null)).toBeNull();
    expect(precisaoDoGpsEmMetros(undefined)).toBeNull();
    expect(precisaoDoGpsEmMetros(Number.NaN)).toBeNull();
    expect(precisaoDoGpsEmMetros(0)).toBeNull();
    expect(precisaoDoGpsEmMetros(-3)).toBeNull();
  });

  it("todo valor que o aparelho grava passa no esquema do servidor", () => {
    for (const lida of [0.01, 0.3, 0.49, 0.5, 7.6, 12.4, 80, null]) {
      expect(campoDoEsquema.safeParse(precisaoDoGpsEmMetros(lida)).success).toBe(true);
    }
  });
});

describe("o esquema continua recusando o que recusava", () => {
  it("zero e negativo são recusados, com a frase em português", () => {
    for (const valor of [0, -1]) {
      const r = campoDoEsquema.safeParse(valor);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toBe("Precisa ser maior que 0");
    }
  });
});
