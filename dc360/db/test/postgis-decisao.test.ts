import { describe, expect, it } from "vitest";
import { decidirPostgis, exigePostgis } from "./postgis-decisao.js";

/**
 * Prova, sem Postgres nenhum, a regra que o CI usa para não deixar o teste
 * espacial passar em branco (V2-F01-E21). O caso "postgres:17 simples com a
 * exigência ligada reprova" é o `sem-extensao` com `exige = true`.
 */
describe("decisão dos testes espaciais", () => {
  it("com PostGIS no servidor, roda, exija ou não", () => {
    expect(decidirPostgis(true, "ok")).toEqual({ acao: "rodar" });
    expect(decidirPostgis(false, "ok")).toEqual({ acao: "rodar" });
  });

  it.each(["sem-url", "inacessivel", "sem-extensao"] as const)(
    "exigindo PostGIS, %s reprova",
    (estado) => {
      const decisao = decidirPostgis(true, estado);
      expect(decisao.acao).toBe("reprovar");
      if (decisao.acao === "reprovar") expect(decisao.motivo).toContain("DC360_EXIGE_POSTGIS=1");
    },
  );

  it("o Postgres simples (sem a extensão) reprova no CI e pula local, com aviso que ensina a rodar", () => {
    expect(decidirPostgis(true, "sem-extensao").acao).toBe("reprovar");
    const local = decidirPostgis(false, "sem-extensao");
    expect(local.acao).toBe("pular");
    if (local.acao === "pular") {
      expect(local.aviso).toContain("PULADOS");
      expect(local.aviso).toContain("npm run test:espacial");
    }
  });

  it.each(["sem-url", "inacessivel"] as const)("sem exigir, %s pula com aviso", (estado) => {
    expect(decidirPostgis(false, estado).acao).toBe("pular");
  });

  it("só o valor 1 liga a exigência", () => {
    expect(exigePostgis({ DC360_EXIGE_POSTGIS: "1" })).toBe(true);
    expect(exigePostgis({ DC360_EXIGE_POSTGIS: "0" })).toBe(false);
    expect(exigePostgis({ DC360_EXIGE_POSTGIS: "true" })).toBe(false);
    expect(exigePostgis({})).toBe(false);
  });
});
