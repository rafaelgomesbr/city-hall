import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MIGRACOES_ISENTAS_DE_DESFAZER,
  cabecalhoIrreversivel,
  carregarDesfazeres,
  carregarMigracoes,
  conferirRegrasDeMigracao,
  pastaDeMigracoes,
  type Desfazer,
  type Migracao,
} from "../src/index.js";

/**
 * A regra de migração reversível (V2-F01-E18).
 *
 * Toda migração fora da lista de isentas (as 001 a 051) traz o seu
 * `desfazer/NNN_nome.sql` ou declara `-- IRREVERSIVEL: motivo; aprovado por
 * NOME; AAAA-MM-DD` no topo. Este arquivo é o que mantém a regra ativa no CI:
 * `test:isolamento` roda a suíte inteira do banco, e uma migração nova sem volta
 * reprova aqui antes de chegar à master.
 */

const SELECT_UM = "SELECT 1;";
const nova = (versao: string, sql = "ALTER TABLE x ADD COLUMN y integer;"): Migracao => ({
  versao,
  sql,
});
const volta = (versao: string, sql = "ALTER TABLE x DROP COLUMN y;"): Desfazer => ({
  versao,
  sql,
});

/** O conjunto de verdade, mais o que o teste acrescenta. */
function conjunto(extra: Migracao[] = [], voltas: Desfazer[] = []): string[] {
  return conferirRegrasDeMigracao({
    migracoes: [...carregarMigracoes(), ...extra],
    desfazeres: [...carregarDesfazeres(), ...voltas],
  });
}

describe("o repositório de hoje obedece à regra", () => {
  it("nenhuma violação nas migrações e voltas que existem", () => {
    const problemas = conferirRegrasDeMigracao({
      migracoes: carregarMigracoes(),
      desfazeres: carregarDesfazeres(),
    });
    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  it("a lista de isentas tem as 51 que existiam quando a regra nasceu, e ainda existem", () => {
    expect(MIGRACOES_ISENTAS_DE_DESFAZER).toHaveLength(51);
    expect(new Set(MIGRACOES_ISENTAS_DE_DESFAZER).size).toBe(51);
    const emDisco = new Set(readdirSync(pastaDeMigracoes()).filter((n) => n.endsWith(".sql")));
    for (const nome of MIGRACOES_ISENTAS_DE_DESFAZER) {
      expect(emDisco.has(nome), `${nome} sumiu: migração não se apaga`).toBe(true);
    }
  });

  it("carregarMigracoes não lê a subpasta desfazer (uma volta nunca é aplicada como migração)", () => {
    const nomes = carregarMigracoes().map((m) => m.versao);
    expect(nomes).toHaveLength(
      readdirSync(pastaDeMigracoes()).filter((n) => n.endsWith(".sql")).length,
    );
    expect(nomes.every((n) => /^\d{3}_/.test(n))).toBe(true);
  });
});

describe("positivos: o que a regra aceita", () => {
  it("migração nova com o desfazer de mesmo nome", () => {
    expect(conjunto([nova("053_coluna_nova.sql")], [volta("053_coluna_nova.sql")])).toEqual([]);
  });

  it("migração nova que declara a irreversibilidade no topo, com motivo, aprovador e data", () => {
    const sql =
      "-- IRREVERSIVEL: apaga a coluna legada com dado; aprovado por Rafael; 2026-10-24\n" +
      "ALTER TABLE x DROP COLUMN legado;";
    expect(conjunto([nova("053_apaga_legado.sql", sql)])).toEqual([]);
  });

  it("o cabeçalho pode vir depois de outros comentários, mas antes do primeiro comando", () => {
    const sql =
      "-- 053: tira a coluna legada.\n--\n" +
      "-- IRREVERSIVEL: o dado some; aprovado por Rafael; 2026-10-24\n" +
      "ALTER TABLE x DROP COLUMN legado;";
    expect(conjunto([nova("053_apaga_legado.sql", sql)])).toEqual([]);
  });
});

describe("negativos: o que a regra reprova", () => {
  it("migração nova sem desfazer e sem cabeçalho", () => {
    const p = conjunto([nova("053_sem_volta.sql")]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/053_sem_volta\.sql: migração nova sem desfazer/);
  });

  it("número repetido, mesmo com o nome diferente", () => {
    const p = conjunto(
      [nova("053_primeira.sql"), nova("053_segunda.sql")],
      [volta("053_primeira.sql"), volta("053_segunda.sql")],
    );
    expect(p.some((x) => /número 053 repetido: 053_primeira\.sql, 053_segunda\.sql/.test(x))).toBe(
      true,
    );
  });

  it("número repetido com uma das isentas (arquivo novo com número velho)", () => {
    const p = conjunto([nova("010_intrusa.sql")], [volta("010_intrusa.sql")]);
    expect(p.some((x) => /número 010 repetido/.test(x))).toBe(true);
    expect(p.some((x) => /010_intrusa\.sql: migração nova com número 010/.test(x))).toBe(true);
  });

  it("migração nova numerada abaixo da última isenta: rodaria fora de ordem", () => {
    const p = conjunto([nova("049a_x.sql")]);
    expect(p.some((x) => /049a_x\.sql: nome fora do padrão/.test(x))).toBe(true);
    const q = conjunto([nova("030_atrasada.sql")], [volta("030_atrasada.sql")]);
    expect(q.some((x) => /não passa da última isenta \(051\)/.test(x))).toBe(true);
  });

  it("cabeçalho incompleto vale como ausente: sem aprovador, sem data, data impossível", () => {
    for (const cab of [
      "-- IRREVERSIVEL: perde o dado",
      "-- IRREVERSIVEL: perde o dado; aprovado por Rafael",
      "-- IRREVERSIVEL: perde o dado; aprovado por Rafael; 24/10/2026",
      "-- IRREVERSIVEL: perde o dado; aprovado por Rafael; 2026-02-31",
      "-- IRREVERSIVEL: ; aprovado por Rafael; 2026-10-24",
    ]) {
      const p = conjunto([nova("053_x.sql", `${cab}\nSELECT 1;`)]);
      expect(
        p.some((x) => /cabeçalho IRREVERSIVEL incompleto/.test(x)),
        cab,
      ).toBe(true);
    }
  });

  it("o cabeçalho só vale no topo: depois do primeiro comando é comentário comum", () => {
    const sql = `${SELECT_UM}\n-- IRREVERSIVEL: perde o dado; aprovado por Rafael; 2026-10-24\n`;
    const p = conjunto([nova("053_x.sql", sql)]);
    expect(p.some((x) => /migração nova sem desfazer/.test(x))).toBe(true);
  });

  it("declarar IRREVERSIVEL e ainda entregar desfazer é ambíguo", () => {
    const sql = "-- IRREVERSIVEL: perde o dado; aprovado por Rafael; 2026-10-24\nSELECT 1;";
    const p = conjunto([nova("053_x.sql", sql)], [volta("053_x.sql")]);
    expect(p.some((x) => /fique com um só/.test(x))).toBe(true);
  });

  it("desfazer órfão (sem a migração) e desfazer vazio", () => {
    const orfao = conjunto([], [volta("060_fantasma.sql")]);
    expect(orfao.some((x) => /desfazer\/060_fantasma\.sql: não há migração/.test(x))).toBe(true);

    const vazio = conjunto([nova("053_x.sql")], [volta("053_x.sql", "-- depois eu escrevo\n")]);
    expect(vazio.some((x) => /desfazer\/053_x\.sql: está vazio/.test(x))).toBe(true);
  });

  it("apagar uma migração isenta reprova (registro não se apaga)", () => {
    const sem = carregarMigracoes().filter(
      (m) => m.versao !== "020_orgaos_indicados_na_vistoria.sql",
    );
    const p = conferirRegrasDeMigracao({ migracoes: sem, desfazeres: [] });
    expect(
      p.some((x) => /020_orgaos_indicados_na_vistoria\.sql: está na lista de isentas/.test(x)),
    ).toBe(true);
  });

  it("nome fora do padrão", () => {
    for (const nome of [
      "52_curto.sql",
      "053-traco.sql",
      "053_Maiuscula.sql",
      "053_sem espaco.sql",
    ]) {
      const p = conjunto([nova(nome)]);
      expect(
        p.some((x) => x.startsWith(`${nome}: nome fora do padrão`)),
        nome,
      ).toBe(true);
    }
  });
});

describe("cabecalhoIrreversivel", () => {
  it("lê motivo, aprovador e data", () => {
    expect(
      cabecalhoIrreversivel(
        "-- IRREVERSIVEL: apaga dado; aprovado por Rafael Gomes; 2026-10-24\nSELECT 1;",
      ),
    ).toEqual({ motivo: "apaga dado", aprovadoPor: "Rafael Gomes", data: "2026-10-24" });
  });

  it("aceita fim de linha do Windows e linhas em branco antes do cabeçalho", () => {
    expect(
      cabecalhoIrreversivel(
        "\r\n-- IRREVERSIVEL: apaga dado; aprovado por R; 2026-10-24\r\nSELECT 1;",
      ),
    ).not.toBeNull();
  });

  it("sem cabeçalho devolve null", () => {
    expect(cabecalhoIrreversivel("-- 053: só um comentário\nSELECT 1;")).toBeNull();
    expect(cabecalhoIrreversivel("")).toBeNull();
  });
});
