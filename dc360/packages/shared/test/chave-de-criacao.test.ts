import { describe, expect, it } from "vitest";
import { CODIGOS_DE_ERRO, CODIGOS_RESERVADOS, aberturaOcorrenciaSchema } from "../src/index";

/**
 * `chaveDeCriacao` na abertura do chamado (V2-F02-E07).
 *
 * O campo é OPCIONAL e aditivo: o painel e o aparelho de antes da etapa mandam
 * o corpo sem ele e continuam válidos. Quando vem, é um uuid.
 */

const BASE = {
  solicitanteNome: "Marilda Souza Prado",
  canalEntrada: "telefone",
  endereco: "Rua do Temporal, 21",
  tipo: "deslizamento",
  descricao: "Talude cedeu durante a chuva da noite.",
} as const;

describe("chaveDeCriacao na abertura", () => {
  it("é opcional: o corpo de antes continua válido, sem a chave", () => {
    const r = aberturaOcorrenciaSchema.safeParse(BASE);
    expect(r.success).toBe(true);
    expect(r.success && r.data.chaveDeCriacao).toBeUndefined();
  });

  it("aceita um uuid e o devolve intacto", () => {
    const chaveDeCriacao = crypto.randomUUID();
    const r = aberturaOcorrenciaSchema.safeParse({ ...BASE, chaveDeCriacao });
    expect(r.success && r.data.chaveDeCriacao).toBe(chaveDeCriacao);
  });

  it("recusa o que não é uuid, com o caminho do campo", () => {
    for (const ruim of ["", "abc", "1234", "dddddddd-0000-4000-8000-000000000001-x", 42, null]) {
      const r = aberturaOcorrenciaSchema.safeParse({ ...BASE, chaveDeCriacao: ruim });
      expect(r.success, String(ruim)).toBe(false);
      expect(!r.success && r.error.issues[0]?.path).toEqual(["chaveDeCriacao"]);
    }
  });
});

describe("chave_ja_usada_em_outro_registro no catálogo", () => {
  it("saiu da lista reservada e está no catálogo emitido (409, permanente)", () => {
    expect(CODIGOS_DE_ERRO.chave_ja_usada_em_outro_registro).toMatchObject({
      status: 409,
      categoria: "permanente",
    });
    expect(Object.keys(CODIGOS_RESERVADOS)).not.toContain("chave_ja_usada_em_outro_registro");
  });
});
