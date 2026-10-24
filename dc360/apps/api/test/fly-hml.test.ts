import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";

/**
 * O `fly.hml.toml` de verdade contra a partida da API (V2-F01-E11).
 *
 * A matriz de `scripts/ambientes.json` confere o NOME das linhas do `[env]`. Aqui
 * o que se prova é o comportamento: a API, configurada EXATAMENTE como o arquivo
 * versionado manda, parte em HML com os segredos de HML, e NÃO parte com a
 * `DATABASE_URL` de PROD. É o teste negativo da etapa: "API de HML com
 * DATABASE_URL de PROD não parte".
 *
 * O arquivo nasce com dois MARCADORES (`a-definir-no-cp-05` e `.invalid`) porque
 * a identidade do banco e o domínio do painel de HML só existem depois do CP-05.
 * Os casos que precisam de uma identidade real a trocam por uma de teste; o caso
 * do marcador prova que, enquanto ele estiver lá, a partida recusa.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..", "..");

/** O `[env]` de um toml, na mesma leitura de uma seção só do conferidor de ambiente. */
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

const HML = envDoToml("fly.hml.toml");
const PROD = envDoToml("fly.toml");

const URL_DE_HML =
  "postgres://dc360_api.refhmlxxxxxxxxx:senha-de-hml@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full";
const URL_DE_PROD = `postgres://dc360_api.${PROD["IDENTIDADE_DO_BANCO"]}:senha-de-prod@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;

/** Os segredos de HML (valores de mentira) e a identidade e o domínio que o CP-05 trará. */
const SEGREDOS_DE_HML = {
  DATABASE_URL: URL_DE_HML,
  JWT_SEGREDO: "segredo-de-homologacao-com-mais-de-trinta-e-dois-bytes",
  URL_PUBLICA: "https://api-hml.exemplo.com.br",
  URL_PAINEL: "https://painel-hml.exemplo.com.br",
  ORIGENS_PERMITIDAS: "https://painel-hml.exemplo.com.br",
  S3_ENDPOINT: "https://balde-hml.exemplo.com",
  S3_BALDE: "dc360-evidencias-hml",
  S3_CHAVE_ID: "chave-de-homologacao",
  S3_CHAVE_SECRETA: "segredo-de-homologacao",
};
const DEPOIS_DO_CP_05 = {
  IDENTIDADE_DO_BANCO: "refhmlxxxxxxxxx",
  DOMINIO_DO_AMBIENTE: "painel-hml.exemplo.com.br",
};

function ambienteDeHml(sobrescrever: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...HML, ...DEPOIS_DO_CP_05, ...SEGREDOS_DE_HML, ...sobrescrever } as NodeJS.ProcessEnv;
}

describe("o fly.hml.toml configura uma API de HML que parte", () => {
  it("parte como hml, com a marca d'água ligada e o push desligado", () => {
    const c = carregarConfig(ambienteDeHml());
    expect(c.ambiente).toBe("hml");
    expect(HML["MARCA_DAGUA"]).toBe("AMBIENTE DE HOMOLOGAÇÃO");
    expect(HML["MARCA_DAGUA"]!.trim()).not.toBe("");
    expect(HML["PUSH_ATIVO"]).toBe("nao");
    expect(HML["NODE_ENV"]).toBe("production");
  });

  it("a recuperação e o e-mail ficam desligados até existir o domínio de teste", () => {
    expect(HML["RECUPERACAO_ATIVA"]).toBe("nao");
    expect(HML["EMAIL_ATIVO"]).toBe("nao");
    expect(HML["EMAIL_DOMINIOS_DE_TESTE"]).toBeUndefined();
  });

  it("não carrega nenhum segredo nem nada de PROD", () => {
    for (const segredo of [
      "DATABASE_URL",
      "JWT_SEGREDO",
      "S3_CHAVE_SECRETA",
      "APNS_CHAVE",
      "APNS_KEY_ID",
      "APNS_TEAM_ID",
      "FCM_CONTA_SERVICO",
      "ORIGENS_PERMITIDAS",
      "URL_PAINEL",
    ]) {
      expect(HML[segredo], segredo).toBeUndefined();
    }
    expect(HML["IDENTIDADE_DO_BANCO"]).not.toBe(PROD["IDENTIDADE_DO_BANCO"]);
    expect(HML["DOMINIO_DO_AMBIENTE"]).not.toBe(PROD["DOMINIO_DO_AMBIENTE"]);
    expect(HML["APNS_BUNDLE"]).toBeUndefined();
  });

  it("o app do Fly de HML não é o de PROD", () => {
    const app = (arquivo: string) =>
      /^app\s*=\s*"([^"]+)"/m.exec(readFileSync(join(RAIZ, arquivo), "utf8"))![1];
    expect(app("fly.hml.toml")).not.toBe(app("fly.toml"));
    expect(app("fly.console.hml.toml")).not.toBe(app("fly.console.toml"));
    expect(app("fly.hml.toml")).not.toBe(app("fly.console.hml.toml"));
  });
});

describe("negativos: a API de HML não parte com a DATABASE_URL de PROD", () => {
  it("com a identidade de HML declarada, a URL de PROD é recusada", () => {
    const erro = (() => {
      try {
        carregarConfig(ambienteDeHml({ DATABASE_URL: URL_DE_PROD }));
        return "";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    })();
    expect(erro).toMatch(/não é do banco de HML/);
    // A mensagem nunca repete a URL, que traz a senha.
    expect(erro).not.toContain("senha-de-prod");
  });

  it("com o toml COMO ESTÁ (marcador no lugar da identidade), nem a URL de HML parte", () => {
    // Fecha para o lado seguro: enquanto o CP-05 não trocar o marcador, o app
    // de HML não sobe contra banco nenhum, muito menos contra o de PROD.
    const comMarcador = {
      ...HML,
      ...SEGREDOS_DE_HML,
      DOMINIO_DO_AMBIENTE: "painel-hml.exemplo.com.br",
    } as NodeJS.ProcessEnv;
    if (HML["IDENTIDADE_DO_BANCO"] === "a-definir-no-cp-05") {
      expect(() => carregarConfig(comMarcador)).toThrow(/não é do banco de HML/);
      expect(() => carregarConfig({ ...comMarcador, DATABASE_URL: URL_DE_PROD })).toThrow(
        /não é do banco de HML/,
      );
    }
  });

  it("com o domínio marcador (.invalid), o painel de qualquer outro lugar é recusado", () => {
    if (HML["DOMINIO_DO_AMBIENTE"]!.endsWith(".invalid")) {
      expect(() =>
        carregarConfig(ambienteDeHml({ DOMINIO_DO_AMBIENTE: HML["DOMINIO_DO_AMBIENTE"]! })),
      ).toThrow(/não é do domínio de HML/);
    }
  });

  it("com o domínio e a origem de PROD, a API de HML recusa (CORS cruzado)", () => {
    const painelDeProd = `https://${PROD["DOMINIO_DO_AMBIENTE"]}`;
    expect(() => carregarConfig(ambienteDeHml({ URL_PAINEL: painelDeProd }))).toThrow(
      /não é do domínio de HML/,
    );
    expect(() => carregarConfig(ambienteDeHml({ ORIGENS_PERMITIDAS: painelDeProd }))).toThrow(
      /não é do domínio de HML/,
    );
  });

  it("sem marca d'água a API de HML recusa (o carimbo não desliga por descuido)", () => {
    expect(() => carregarConfig(ambienteDeHml({ MARCA_DAGUA: "" }))).toThrow(/MARCA_DAGUA/);
  });
});
