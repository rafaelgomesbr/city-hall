import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";

/**
 * O `fly.console.hml.toml` de verdade contra a partida do console (V2-F01-E11).
 *
 * O console lê o banco de TODOS os municípios. Um console de HML com a
 * credencial do console de PROD mostraria os números de produção na tela de
 * homologação. Aqui o console é configurado EXATAMENTE como o arquivo versionado
 * manda, e a partida recusa a `CONSOLE_DATABASE_URL` de PROD.
 *
 * O arquivo nasce com um MARCADOR no lugar da identidade (a referência do banco
 * de HML só existe depois do CP-05). Os casos que precisam de uma identidade real
 * a trocam por uma de teste; o caso do marcador prova que, com ele, não parte.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..", "..");

function envDoToml(arquivo: string): Record<string, string> {
  const env: Record<string, string> = {};
  let dentro = false;
  for (const linha of readFileSync(join(RAIZ, arquivo), "utf8").split(/\r?\n/)) {
    const t = linha.trim();
    if (t.startsWith("[")) {
      dentro = t === "[env]";
      continue;
    }
    if (!dentro || t === "" || t.startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(t);
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

const HML = envDoToml("fly.console.hml.toml");
const PROD = envDoToml("fly.console.toml");

const URL_DE_HML =
  "postgres://dc360_console_login.refhmlxxxxxxxxx:senha-de-hml@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full";
const URL_DE_PROD = `postgres://dc360_console_login.${PROD["CONSOLE_IDENTIDADE_DO_BANCO"]}:senha-de-prod@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;

const SEGREDOS_DE_HML = {
  CONSOLE_DATABASE_URL: URL_DE_HML,
  CONSOLE_JWT_SEGREDO: randomBytes(32).toString("base64url"),
  CONSOLE_SEGUNDO_FATOR_CHAVE: randomBytes(32).toString("base64"),
};

function ambienteDeHml(sobrescrever: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...HML,
    CONSOLE_IDENTIDADE_DO_BANCO: "refhmlxxxxxxxxx",
    ...SEGREDOS_DE_HML,
    ...sobrescrever,
  } as NodeJS.ProcessEnv;
}

describe("o fly.console.hml.toml configura um console de HML que parte", () => {
  it("parte como hml, em 0.0.0.0", () => {
    expect(carregarConfig(ambienteDeHml()).ambiente).toBe("hml");
    expect(HML["CONSOLE_HOST"]).toBe("0.0.0.0");
    expect(HML["NODE_ENV"]).toBe("production");
  });

  it("não carrega segredo nenhum nem a identidade de PROD", () => {
    for (const segredo of [
      "CONSOLE_DATABASE_URL",
      "CONSOLE_JWT_SEGREDO",
      "CONSOLE_SEGUNDO_FATOR_CHAVE",
      "CONSOLE_OPERADORES",
    ]) {
      expect(HML[segredo], segredo).toBeUndefined();
    }
    expect(HML["CONSOLE_IDENTIDADE_DO_BANCO"]).not.toBe(PROD["CONSOLE_IDENTIDADE_DO_BANCO"]);
    expect(HML["CONSOLE_BANCO_LOCAL"]).toBeUndefined();
  });
});

describe("negativos: o console de HML não parte com a credencial de PROD", () => {
  it("com a identidade de HML declarada, a CONSOLE_DATABASE_URL de PROD é recusada", () => {
    let erro = "";
    try {
      carregarConfig(ambienteDeHml({ CONSOLE_DATABASE_URL: URL_DE_PROD }));
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
    expect(erro).not.toBe("");
    expect(erro).not.toContain("senha-de-prod");
  });

  it("com o toml COMO ESTÁ (marcador), nem a URL de HML nem a de PROD partem", () => {
    if (HML["CONSOLE_IDENTIDADE_DO_BANCO"] === "a-definir-no-cp-05") {
      const comMarcador = { ...HML, ...SEGREDOS_DE_HML } as NodeJS.ProcessEnv;
      expect(() => carregarConfig(comMarcador)).toThrow();
      expect(() => carregarConfig({ ...comMarcador, CONSOLE_DATABASE_URL: URL_DE_PROD })).toThrow();
    }
  });
});
