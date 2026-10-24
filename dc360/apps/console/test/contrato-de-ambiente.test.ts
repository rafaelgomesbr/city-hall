import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";

/**
 * O contrato de ambiente do console (V2-F01-E09).
 *
 * O console lê o banco de TODOS os municípios. Um console de HML com a
 * credencial do console de PROD mostraria, na tela de homologação, os números
 * de produção, e a equipe de teste passaria a operar em cima da base de verdade
 * sem um sinal de que errou de ambiente. A partida recusa.
 *
 * A organização não aparece aqui: o console não tem município na configuração.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..", "..");

const CHAVE = randomBytes(32).toString("base64");

const URL_DE_PROD =
  "postgres://dc360_console_login.refprodxxxxxxxx:senha-de-prod@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full";
const URL_DE_HML =
  "postgres://dc360_console_login.refhmlxxxxxxxxx:senha-de-hml@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full";

function prod(alteracoes: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    AMBIENTE_DC360: "prod",
    CONSOLE_IDENTIDADE_DO_BANCO: "refprodxxxxxxxx",
    CONSOLE_HOST: "0.0.0.0",
    CONSOLE_JWT_SEGREDO: randomBytes(32).toString("base64url"),
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_DATABASE_URL: URL_DE_PROD,
    ...alteracoes,
  } as NodeJS.ProcessEnv;
}

function hml(alteracoes: Record<string, string> = {}): NodeJS.ProcessEnv {
  return prod({
    AMBIENTE_DC360: "hml",
    CONSOLE_IDENTIDADE_DO_BANCO: "refhmlxxxxxxxxx",
    CONSOLE_DATABASE_URL: URL_DE_HML,
    ...alteracoes,
  });
}

function sem(env: NodeJS.ProcessEnv, chave: string): NodeJS.ProcessEnv {
  const copia = { ...env };
  delete copia[chave];
  return copia;
}

describe("positivos: prod e hml válidos partem", () => {
  it("prod parte e devolve o ambiente", () => {
    expect(carregarConfig(prod()).ambiente).toBe("prod");
  });

  it("hml parte", () => {
    expect(carregarConfig(hml()).ambiente).toBe("hml");
  });

  it("dev parte sem declarar nada, e sem a identidade", () => {
    const c = carregarConfig({
      CONSOLE_JWT_SEGREDO: randomBytes(32).toString("base64url"),
      CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    } as NodeJS.ProcessEnv);
    expect(c.ambiente).toBe("dev");
  });

  it("dev não exige identidade, mesmo com um banco de verdade", () => {
    expect(() =>
      carregarConfig({
        NODE_ENV: "development",
        CONSOLE_JWT_SEGREDO: randomBytes(32).toString("base64url"),
        CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
        CONSOLE_DATABASE_URL: URL_DE_PROD,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});

describe("negativos: a declaração do ambiente", () => {
  it("produção sem AMBIENTE_DC360 recusa", () => {
    expect(() => carregarConfig(sem(prod(), "AMBIENTE_DC360"))).toThrow(
      /AMBIENTE_DC360 é obrigatória com NODE_ENV=production/,
    );
  });

  it("AMBIENTE_DC360 vazia conta como ausente", () => {
    expect(() => carregarConfig(prod({ AMBIENTE_DC360: "" }))).toThrow(/obrigatória/);
  });

  it("valor desconhecido recusa em vez de cair em dev", () => {
    expect(() => carregarConfig(prod({ AMBIENTE_DC360: "producao" }))).toThrow(
      /não é um ambiente conhecido/,
    );
  });

  it("dev com NODE_ENV=production recusa", () => {
    expect(() => carregarConfig(prod({ AMBIENTE_DC360: "dev" }))).toThrow(
      /dev não combina com NODE_ENV=production/,
    );
  });

  it("prod fora de produção recusa", () => {
    expect(() => carregarConfig(prod({ NODE_ENV: "development" }))).toThrow(
      /prod exige NODE_ENV=production/,
    );
  });
});

describe("negativos: a trava de ambiente cruzado do banco", () => {
  it("console de HML com a CONSOLE_DATABASE_URL de PROD recusa a partida", () => {
    expect(() => carregarConfig(hml({ CONSOLE_DATABASE_URL: URL_DE_PROD }))).toThrow(
      /CONSOLE_DATABASE_URL não é do banco de HML/,
    );
  });

  it("console de PROD com a URL de HML recusa (nos dois sentidos)", () => {
    expect(() => carregarConfig(prod({ CONSOLE_DATABASE_URL: URL_DE_HML }))).toThrow(
      /CONSOLE_DATABASE_URL não é do banco de PROD/,
    );
  });

  it("a mensagem não repete a URL, a senha nem a identidade do outro banco", () => {
    let mensagem = "";
    try {
      carregarConfig(hml({ CONSOLE_DATABASE_URL: URL_DE_PROD }));
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).not.toContain("senha-de-prod");
    expect(mensagem).not.toContain("refprodxxxxxxxx");
  });

  it("compara por segmento: um trecho dentro de outro nome NÃO conta", () => {
    expect(() =>
      carregarConfig(
        hml({
          CONSOLE_DATABASE_URL:
            "postgres://dc360_console_login.xrefhmlxxxxxxxxxx:s@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
        }),
      ),
    ).toThrow(/não é do banco de HML/);
  });

  it("sem CONSOLE_IDENTIDADE_DO_BANCO recusa em hml e em prod", () => {
    expect(() => carregarConfig(sem(hml(), "CONSOLE_IDENTIDADE_DO_BANCO"))).toThrow(
      /CONSOLE_IDENTIDADE_DO_BANCO é obrigatória em HML/,
    );
    expect(() => carregarConfig(sem(prod(), "CONSOLE_IDENTIDADE_DO_BANCO"))).toThrow(
      /CONSOLE_IDENTIDADE_DO_BANCO é obrigatória em PROD/,
    );
  });

  it("identidade vazia conta como ausente; com ponto ou curta demais recusa", () => {
    expect(() => carregarConfig(prod({ CONSOLE_IDENTIDADE_DO_BANCO: "" }))).toThrow(
      /obrigatória em PROD/,
    );
    expect(() => carregarConfig(prod({ CONSOLE_IDENTIDADE_DO_BANCO: "a.b" }))).toThrow(
      /CONSOLE_IDENTIDADE_DO_BANCO/,
    );
    expect(() => carregarConfig(prod({ CONSOLE_IDENTIDADE_DO_BANCO: "ab" }))).toThrow(
      /CONSOLE_IDENTIDADE_DO_BANCO/,
    );
  });
});

describe("a organização nunca vem de configuração", () => {
  it("o esquema do console não tem variável de organização, município ou tenant", () => {
    const fonte = readFileSync(join(AQUI, "..", "src", "config.ts"), "utf8");
    const bloco = fonte.slice(fonte.indexOf("const ESQUEMA"), fonte.indexOf("export type Config"));
    const chaves = [...bloco.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]!);
    expect(chaves.length).toBeGreaterThan(5);
    expect(chaves.filter((k) => /ORGANIZACAO|MUNICIPIO|TENANT/.test(k))).toEqual([]);
  });
});

describe("o que o fly.console.toml declara parte, com segredos de mentira", () => {
  function envDoToml(arquivo: string): Record<string, string> {
    const texto = readFileSync(join(RAIZ, arquivo), "utf8");
    const saida: Record<string, string> = {};
    let dentro = false;
    for (const linha of texto.split(/\r?\n/)) {
      const t = linha.trim();
      if (t.startsWith("[")) {
        dentro = t === "[env]";
        continue;
      }
      if (!dentro || t === "" || t.startsWith("#")) continue;
      const m = /^([A-Z][A-Z0-9_]*)\s*=\s*"(.*)"\s*(?:#.*)?$/.exec(t);
      if (m) saida[m[1]!] = m[2]!;
    }
    return saida;
  }

  function segredos(env: Record<string, string>, identidade: string): NodeJS.ProcessEnv {
    return {
      ...env,
      CONSOLE_DATABASE_URL: `postgres://dc360_console_login.${identidade}:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
      CONSOLE_JWT_SEGREDO: randomBytes(32).toString("base64url"),
      CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    } as NodeJS.ProcessEnv;
  }

  it("declara AMBIENTE_DC360=prod e a identidade do banco", () => {
    const env = envDoToml("fly.console.toml");
    expect(env["AMBIENTE_DC360"]).toBe("prod");
    expect(env["CONSOLE_IDENTIDADE_DO_BANCO"]).toMatch(/^[a-z0-9][a-z0-9_-]{2,62}$/i);
  });

  it("com o [env] do fly.console.toml e segredos coerentes, o console sobe", () => {
    const env = envDoToml("fly.console.toml");
    expect(carregarConfig(segredos(env, env["CONSOLE_IDENTIDADE_DO_BANCO"]!)).ambiente).toBe(
      "prod",
    );
  });

  it("com o [env] do fly.console.toml e o banco de OUTRO ambiente, o console NÃO sobe", () => {
    const env = envDoToml("fly.console.toml");
    expect(() => carregarConfig(segredos(env, "outroprojetoxxxxx"))).toThrow(
      /não é do banco de PROD/,
    );
  });

  it("com o [env] do fly.console.toml e sem AMBIENTE_DC360, o console NÃO sobe", () => {
    const env = envDoToml("fly.console.toml");
    delete env["AMBIENTE_DC360"];
    expect(() => carregarConfig(segredos(env, "refprodxxxxxxxx"))).toThrow(
      /AMBIENTE_DC360 é obrigatória/,
    );
  });
});
