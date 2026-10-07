import { describe, expect, it } from "vitest";
import { gpsPrecisaoMetrosSchema, vistoriaSchema } from "../src/index.js";

/**
 * A precisão de GPS no esquema compartilhado (V2-F00-E15, CMP-33).
 *
 * O conserto do 422 é do aparelho (piso de 1 metro); o esquema NÃO afrouxa.
 * Este arquivo guarda as duas metades: o que continua recusado, e com que
 * frase, e o que o aparelho passou a mandar.
 */

const VISTORIA = {
  checklist: [
    { chave: "risco_iminente", resposta: true },
    { chave: "evacuacao_necessaria", resposta: false },
    { chave: "interdicao_indicada", resposta: false },
    { chave: "acionar_outro_orgao", resposta: false },
  ],
  fotos: [],
  assinanteNome: "Moradora de exemplo",
  assinaturaChave: null,
  coletadaEm: "2026-10-07T12:00:00.000Z",
};

describe("gpsPrecisaoMetros", () => {
  it("zero e negativo continuam recusados, e a frase é em português", () => {
    for (const valor of [0, -1, -0.3]) {
      const r = gpsPrecisaoMetrosSchema.safeParse(valor);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.map((i) => i.message)).toEqual(["Precisa ser maior que 0"]);
    }
  });

  it("nulo é 'não informada' e passa; o piso do aparelho (1) passa", () => {
    expect(gpsPrecisaoMetrosSchema.safeParse(null).success).toBe(true);
    expect(gpsPrecisaoMetrosSchema.safeParse(1).success).toBe(true);
    expect(gpsPrecisaoMetrosSchema.safeParse(12).success).toBe(true);
  });

  it("é o mesmo campo da vistoria: 0 reprova no caminho certo, 1 aprova", () => {
    const zero = vistoriaSchema.safeParse({ ...VISTORIA, gpsPrecisaoMetros: 0 });
    expect(zero.success).toBe(false);
    if (!zero.success) {
      expect(zero.error.issues).toHaveLength(1);
      expect(zero.error.issues[0]?.path).toEqual(["gpsPrecisaoMetros"]);
      expect(zero.error.issues[0]?.message).toBe("Precisa ser maior que 0");
    }
    expect(vistoriaSchema.safeParse({ ...VISTORIA, gpsPrecisaoMetros: 1 }).success).toBe(true);
    expect(vistoriaSchema.safeParse({ ...VISTORIA, gpsPrecisaoMetros: null }).success).toBe(true);
  });
});
