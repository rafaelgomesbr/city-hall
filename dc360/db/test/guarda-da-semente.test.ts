import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IDENTIDADES_DE_PROD, motivoParaNaoSemear } from "../src/guarda-da-semente.js";

/**
 * A guarda do `--semear` (V2-F01-E11).
 *
 * O defeito: `--semear` só recusava com `NODE_ENV=production` NO PROCESSO. Com a
 * `DATABASE_URL` de produção copiada para o terminal e essa variável ausente,
 * o comando semearia contas com a senha pública `defesa-civil-2026` na base dos
 * municípios. A guarda agora olha para onde a conexão vai.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_DB = join(AQUI, "..");
const RAIZ = join(RAIZ_DB, "..");

const PROD = IDENTIDADES_DE_PROD[0]!;
const URL_DE_PROD = `postgres://dc360_setup.${PROD}:senha-secreta@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
const URL_DE_PROD_NO_HOST = `postgres://postgres:senha-secreta@db.${PROD}.supabase.co:5432/postgres`;
const URL_DE_HML = "postgres://dc360_setup.refhmlxxxxxxxxx:senha-secreta@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
const URL_LOCAL = "postgres://dc360_setup:senha-local@127.0.0.1:5432/dc360";

describe("positivos: banco descartável semeia", () => {
  it("sem DATABASE_URL (o banco em WebAssembly que morre com o processo)", () => {
    expect(motivoParaNaoSemear({ url: undefined, env: {} })).toBeNull();
    expect(motivoParaNaoSemear({ url: "", env: {} })).toBeNull();
    expect(motivoParaNaoSemear({ url: "   ", env: { NODE_ENV: "development" } })).toBeNull();
  });

  it("o Postgres local (loopback) e o serviço do compose (um rótulo, sem ponto)", () => {
    expect(motivoParaNaoSemear({ url: URL_LOCAL, env: {} })).toBeNull();
    expect(motivoParaNaoSemear({ url: "postgres://u:p@localhost:5432/dc360", env: { AMBIENTE_DC360: "dev" } })).toBeNull();
    expect(motivoParaNaoSemear({ url: "postgres://u:p@[::1]:5432/dc360", env: {} })).toBeNull();
    expect(motivoParaNaoSemear({ url: "postgres://u:p@banco:5432/dc360", env: {} })).toBeNull();
  });
});

describe("negativos: o que a guarda recusa", () => {
  it("a URL de PRODUÇÃO sem NODE_ENV (o caso do defeito): pela identidade no usuário", () => {
    const motivo = motivoParaNaoSemear({ url: URL_DE_PROD, env: {} });
    expect(motivo).toMatch(/PRODUÇÃO/);
  });

  it("a URL de PRODUÇÃO pela identidade no host (conexão direta)", () => {
    expect(motivoParaNaoSemear({ url: URL_DE_PROD_NO_HOST, env: {} })).toMatch(/PRODUÇÃO/);
  });

  it("a identidade de PROD em maiúsculas não escapa", () => {
    const url = URL_DE_PROD.replace(PROD, PROD.toUpperCase());
    expect(motivoParaNaoSemear({ url, env: {} })).toMatch(/PRODUÇÃO/);
  });

  it("NODE_ENV=production recusa, com qualquer URL ou nenhuma", () => {
    expect(motivoParaNaoSemear({ url: undefined, env: { NODE_ENV: "production" } })).toMatch(/NODE_ENV=production/);
    expect(motivoParaNaoSemear({ url: URL_LOCAL, env: { NODE_ENV: "production" } })).toMatch(/NODE_ENV=production/);
  });

  it("AMBIENTE_DC360=prod recusa mesmo apontando para a própria máquina", () => {
    expect(motivoParaNaoSemear({ url: URL_LOCAL, env: { AMBIENTE_DC360: "prod" } })).toMatch(/AMBIENTE_DC360=prod/);
  });

  it("AMBIENTE_DC360=hml recusa e manda usar a semente própria", () => {
    const motivo = motivoParaNaoSemear({ url: URL_LOCAL, env: { AMBIENTE_DC360: "hml" } });
    expect(motivo).toMatch(/AMBIENTE_DC360=hml/);
    expect(motivo).toMatch(/semear-homologacao/);
  });

  it("um banco de HML hospedado recusa: a semente de desenvolvimento tem senha pública", () => {
    const motivo = motivoParaNaoSemear({ url: URL_DE_HML, env: {} });
    expect(motivo).toMatch(/descartável/);
    expect(motivo).toMatch(/semear-homologacao/);
  });

  it("a identidade DECLARADA em IDENTIDADE_DO_BANCO também protege (outro projeto de PROD)", () => {
    const url = "postgres://dc360_setup.refoutroprodxxx:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
    expect(motivoParaNaoSemear({ url, env: { IDENTIDADE_DO_BANCO: "refoutroprodxxx" } })).toMatch(/PRODUÇÃO|identidade/);
    // Também no loopback: o túnel para o banco de PROD aparece como 127.0.0.1.
    const tunel = "postgres://dc360_setup.refoutroprodxxx:senha@127.0.0.1:5432/postgres";
    expect(motivoParaNaoSemear({ url: tunel, env: { IDENTIDADE_DO_BANCO: "refoutroprodxxx" } })).toMatch(/PRODUÇÃO|identidade/);
  });

  it("o túnel local para a PRODUÇÃO (127.0.0.1 com o usuário do projeto) recusa", () => {
    const tunel = `postgres://dc360_setup.${PROD}:senha@127.0.0.1:6543/postgres`;
    expect(motivoParaNaoSemear({ url: tunel, env: {} })).toMatch(/PRODUÇÃO/);
  });

  it("URL que não dá para analisar recusa (fail-closed), sem repetir o texto", () => {
    const motivo = motivoParaNaoSemear({ url: "postgres://u:senha-secreta@[invalido/db", env: {} });
    expect(motivo).toMatch(/analisar/);
    expect(motivo).not.toContain("senha-secreta");
    // O que tem forma de URL mas não tem host também não passa por descartável.
    expect(motivoParaNaoSemear({ url: "isto-nao-e-uma-url:senha-secreta", env: {} })).not.toBeNull();
  });

  it("host público que não é da máquina recusa", () => {
    expect(motivoParaNaoSemear({ url: "postgres://u:p@banco.exemplo.com.br:5432/x", env: {} })).toMatch(/descartável/);
  });

  it("nenhum motivo repete a senha da URL", () => {
    for (const url of [URL_DE_PROD, URL_DE_PROD_NO_HOST, URL_DE_HML]) {
      expect(motivoParaNaoSemear({ url, env: {} }) ?? "").not.toContain("senha-secreta");
    }
  });
});

describe("a identidade de PROD da guarda é a mesma da matriz de ambientes", () => {
  it("scripts/ambientes.json declara a identidade que a guarda protege", () => {
    const matriz = JSON.parse(readFileSync(join(RAIZ, "scripts", "ambientes.json"), "utf8")) as {
      ambientes: { prod: { identidadeDoBanco: string } };
    };
    expect(IDENTIDADES_DE_PROD).toContain(matriz.ambientes.prod.identidadeDoBanco);
  });
});

describe("o comando de verdade: `--semear` recusa ANTES de conectar", () => {
  /*
    Roda o cli.ts, e não só a função: a prova é que o comando sai com código 1
    e a mensagem da guarda, sem passar por conexão (o host seria resolvido pela
    rede, e o teste não depende dela) e sem aplicar migração.
  */
  function rodar(env: Record<string, string>) {
    const tsx = join(RAIZ, "node_modules", ".bin", "tsx");
    return spawnSync(tsx, [join(RAIZ_DB, "src", "cli.ts"), "--semear"], {
      cwd: RAIZ_DB,
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", ...env },
      timeout: 60_000,
    });
  }

  /*
    Os endereços dos casos abaixo são inalcançáveis de propósito (porta 1 da
    própria máquina e o TLD reservado `.invalid`): se um dia a guarda regredir, o
    comando falha ao conectar, e o teste reprova sem nunca ter tentado entrar num
    banco de verdade com uma credencial de mentira.
  */
  it("com a identidade de PRODUÇÃO e sem NODE_ENV: código 1, sem migrar, sem repetir a senha", () => {
    const r = rodar({ DATABASE_URL: `postgres://dc360_setup.${PROD}:senha-secreta@127.0.0.1:1/postgres` });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/PRODUÇÃO/);
    expect(r.stdout).not.toMatch(/Aplicadas|Nada a fazer|Semeado/);
    expect(`${r.stdout}${r.stderr}`).not.toContain("senha-secreta");
  });

  it("com a URL de um banco hospedado de HML: código 1", () => {
    const r = rodar({ DATABASE_URL: "postgres://dc360_setup.refhmlxxxxxxxxx:senha-secreta@db.invalid:5432/postgres" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/descartável/);
  });

  it("sem DATABASE_URL, o banco efêmero ainda semeia (a guarda não atrapalha o desenvolvimento)", () => {
    const r = rodar({});
    expect(r.status ?? 0).toBe(0);
    expect(r.stdout).toMatch(/Semeado/);
  });
});
