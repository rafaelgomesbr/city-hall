import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDENTIDADES_DE_PROD } from "@dc360/db";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import {
  ORGANIZACOES_SINTETICAS,
  recusaDoAmbiente,
  semearHomologacao,
  sortearSenha,
  type ExecutorSql,
} from "../src/semear-homologacao.js";

/**
 * A semente de HOMOLOGAÇÃO (V2-F01-E11).
 *
 * O defeito de origem: a única semente era a de desenvolvimento, que dá a toda
 * conta a senha pública `defesa-civil-2026`. HML fica na internet. Aqui as
 * contas nascem trancadas e recebem uma senha sorteada na mesma transação.
 *
 * Os casos rodam contra o Postgres em WebAssembly com as migrações de verdade,
 * a mesma RLS e o servidor de verdade para o login e o isolamento.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SENHA_PUBLICA_DE_DESENVOLVIMENTO = "defesa-civil-2026";

const URL_DE_HML = "postgres://dc360_setup.refhmlxxxxxxxxx:senha-de-hml@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full";
const ENV_DE_HML = {
  AMBIENTE_DC360: "hml",
  IDENTIDADE_DO_BANCO: "refhmlxxxxxxxxx",
  DATABASE_URL: URL_DE_HML,
};

/** A derivação real leva ~1 s por conta (scrypt de 128 MB); os casos de recusa não precisam dela. */
const derivarRapido = async (senha: string) => `hash-de-teste$${senha.length}`;

function comoDono(mem: BancoEmMemoria): ExecutorSql {
  return {
    query: async <T,>(sql: string, params?: readonly unknown[]) => {
      const r = await mem.bruto.query<Record<string, unknown>>(sql, params ? [...params] : undefined);
      return { rows: r.rows as T[] };
    },
    exec: (sql: string) => mem.bruto.exec(sql),
  };
}

async function contar(mem: BancoEmMemoria, tabela: string): Promise<number> {
  const r = await mem.bruto.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${tabela}`);
  return Number(r.rows[0]!.n);
}

describe("o sorteio", () => {
  it("tem três grupos de quatro, sem os símbolos que se confundem, e não repete", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = sortearSenha();
      expect(s).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/);
      vistas.add(s);
    }
    expect(vistas.size).toBe(200);
  });
});

describe("a semente sintética do arquivo SQL", () => {
  const sql = readFileSync(join(AQUI, "..", "..", "..", "db", "seeds", "homologacao.sql"), "utf8");

  it("não tem hash de senha nenhum, nem o da semente de desenvolvimento", () => {
    expect(sql).not.toMatch(/scrypt\$/);
    const dev = readFileSync(join(AQUI, "..", "..", "..", "db", "seeds", "desenvolvimento.sql"), "utf8");
    const hashDeDev = /scrypt\$[^']+/.exec(dev)![0];
    expect(sql).not.toContain(hashDeDev);
  });

  it("só tem e-mail em example.org (RFC 2606) e telefone do bloco 90000", () => {
    const emails = [...sql.matchAll(/'([^'\s]+@[^'\s]+)'/g)].map((m) => m[1]!);
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) expect(e, e).toMatch(/@[a-z]+\.example\.org$/);
    const telefones = [...sql.matchAll(/'(\(\d\d\) [\d-]+)'/g)].map((m) => m[1]!);
    expect(telefones.length).toBeGreaterThan(0);
    for (const t of telefones) expect(t, t).toMatch(/^\(35\) 90000-\d{4}$/);
  });

  it("os identificadores das organizações são os que a recusa de município real conhece", () => {
    for (const id of ORGANIZACOES_SINTETICAS) expect(sql).toContain(id);
    const ids = [...sql.matchAll(/INSERT INTO organizacoes[\s\S]*?;/g)][0]![0];
    expect([...ids.matchAll(/'([0-9a-f]{8}-[0-9a-f-]{27})'/g)].map((m) => m[1])).toEqual([...ORGANIZACOES_SINTETICAS]);
  });
});

describe("as recusas do ambiente (antes de qualquer escrita)", () => {
  it("fora de AMBIENTE_DC360=hml recusa: ausente, dev e prod", () => {
    for (const ambiente of [undefined, "", "dev", "prod", "HML "]) {
      const motivo = recusaDoAmbiente({ ...ENV_DE_HML, AMBIENTE_DC360: ambiente });
      // "HML " com espaço passa pelo trim, mas "HML" em maiúsculas não é "hml".
      expect(motivo, String(ambiente)).toMatch(/AMBIENTE_DC360=hml/);
    }
  });

  it("sem DATABASE_URL ou sem IDENTIDADE_DO_BANCO recusa", () => {
    expect(recusaDoAmbiente({ ...ENV_DE_HML, DATABASE_URL: undefined })).toMatch(/DATABASE_URL/);
    expect(recusaDoAmbiente({ ...ENV_DE_HML, IDENTIDADE_DO_BANCO: undefined })).toMatch(/IDENTIDADE_DO_BANCO/);
  });

  it("a identidade de PRODUÇÃO recusa, declarada ou colada na URL", () => {
    const prod = IDENTIDADES_DE_PROD[0]!;
    expect(recusaDoAmbiente({ ...ENV_DE_HML, IDENTIDADE_DO_BANCO: prod })).toMatch(/PRODUÇÃO/);
    expect(recusaDoAmbiente({
      ...ENV_DE_HML,
      DATABASE_URL: `postgres://dc360_setup.${prod}:senha-de-prod@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
    })).toMatch(/PRODUÇÃO/);
    // O caso pior: HML "declara" uma identidade de HML mas a URL é de PROD.
    expect(recusaDoAmbiente({
      ...ENV_DE_HML,
      DATABASE_URL: `postgres://dc360_setup.${prod}:senha-de-prod@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
    })).not.toBeNull();
  });

  it("a URL de outro banco (identidade ausente) recusa, e nenhum motivo repete a senha", () => {
    const outra = "postgres://dc360_setup.refoutrobancoxx:senha-de-hml@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
    const motivo = recusaDoAmbiente({ ...ENV_DE_HML, DATABASE_URL: outra });
    expect(motivo).toMatch(/não é do banco de HML/);
    expect(motivo).not.toContain("senha-de-hml");
  });

  it("o marcador de identidade que o fly.hml.toml traz hoje nunca consta numa URL, então recusa", () => {
    const toml = readFileSync(join(AQUI, "..", "..", "..", "fly.hml.toml"), "utf8");
    const marcador = /IDENTIDADE_DO_BANCO\s*=\s*"([^"]+)"/.exec(toml)![1]!;
    if (marcador === "a-definir-no-cp-05") {
      expect(recusaDoAmbiente({ ...ENV_DE_HML, IDENTIDADE_DO_BANCO: marcador })).toMatch(/não é do banco de HML/);
    }
  });

  it("o ambiente certo e a URL de HML passam", () => {
    expect(recusaDoAmbiente(ENV_DE_HML)).toBeNull();
  });
});

describe("semear de verdade, contra o Postgres e o servidor reais", () => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  let contas: Awaited<ReturnType<typeof semearHomologacao>>;

  beforeAll(async () => {
    mem = await bancoEmMemoria(); // com migrações, SEM semente
    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-de-homologacao-com-mais-de-32-bytes",
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv);
    app = await construirServidor({
      banco: mem.banco, config,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    });
    await app.ready();
    // A derivação REAL de propósito: a prova de login abaixo usa o hash gravado.
    contas = await semearHomologacao(comoDono(mem), { env: ENV_DE_HML });
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  async function entrar(email: string, senha: string) {
    return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
  }

  it("semeou os dois municípios e todas as contas, e cada uma tem hash e senha própria", async () => {
    expect(contas.length).toBe(await contar(mem, "usuarios"));
    expect(new Set(contas.map((c) => c.municipio))).toEqual(new Set(["Serra Alta", "Vale Fundo"]));
    expect(new Set(contas.map((c) => c.senha)).size).toBe(contas.length);
    const sem = await mem.bruto.query<{ n: string }>("SELECT count(*)::text AS n FROM usuarios WHERE senha_hash IS NULL");
    expect(sem.rows[0]!.n).toBe("0");
    // Nenhuma senha em texto claro no banco, e nenhuma é a pública.
    const hashes = await mem.bruto.query<{ senha_hash: string }>("SELECT senha_hash FROM usuarios");
    for (const { senha_hash } of hashes.rows) {
      expect(senha_hash).toMatch(/^scrypt\$/);
      for (const c of contas) expect(senha_hash).not.toContain(c.senha);
    }
  });

  it("login com a senha sorteada funciona (positivo)", async () => {
    const coord = contas.find((c) => c.municipio === "Serra Alta" && c.papel === "coordenador")!;
    const email = (await mem.bruto.query<{ email: string }>("SELECT email FROM usuarios WHERE matricula = $1", [coord.matricula])).rows[0]!.email;
    const r = await entrar(email, coord.senha);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().usuario.municipio).toBe("Serra Alta");
  }, 120_000);

  it("`defesa-civil-2026` NÃO loga em HML, em nenhuma conta (negativo)", async () => {
    const emails = (await mem.bruto.query<{ email: string }>("SELECT email FROM usuarios")).rows.map((r) => r.email);
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) {
      const r = await entrar(email, SENHA_PUBLICA_DE_DESENVOLVIMENTO);
      expect(r.statusCode, `${email}: ${r.body}`).toBe(401);
    }
  }, 240_000);

  it("a conta de Serra Alta recebe 404 ao ler um recurso de Vale Fundo (RLS com o papel restrito)", async () => {
    const coord = contas.find((c) => c.municipio === "Serra Alta" && c.papel === "coordenador")!;
    const email = (await mem.bruto.query<{ email: string }>("SELECT email FROM usuarios WHERE matricula = $1", [coord.matricula])).rows[0]!.email;
    const token = (await entrar(email, coord.senha)).json().acesso as string;
    const dela = await app.inject({
      method: "GET", url: "/ocorrencias/11111111-1111-4111-8111-0000000000c1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dela.statusCode, dela.body).toBe(200);
    const alheia = await app.inject({
      method: "GET", url: "/ocorrencias/22222222-2222-4222-8222-0000000000c1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(alheia.statusCode, alheia.body).toBe(404);
  }, 120_000);

  it("semear de novo recusa e não troca nenhuma senha", async () => {
    const antes = (await mem.bruto.query<{ senha_hash: string }>("SELECT senha_hash FROM usuarios ORDER BY id")).rows;
    await expect(semearHomologacao(comoDono(mem), { env: ENV_DE_HML, derivar: derivarRapido }))
      .rejects.toThrow(/já foi semeado/);
    const depois = (await mem.bruto.query<{ senha_hash: string }>("SELECT senha_hash FROM usuarios ORDER BY id")).rows;
    expect(depois).toEqual(antes);
  });

  it("a trilha da semente existe e as ocorrências são só dos dois municípios sintéticos", async () => {
    const r = await mem.bruto.query<{ organizacao_id: string }>("SELECT DISTINCT organizacao_id FROM ocorrencias");
    expect(r.rows.map((x) => x.organizacao_id).sort()).toEqual([...ORGANIZACOES_SINTETICAS].sort());
    expect(await contar(mem, "trilha_eventos")).toBeGreaterThan(0);
  });
});

describe("as recusas que dependem do banco", () => {
  it("banco com município REAL recusa e não escreve nada", async () => {
    const mem = await bancoEmMemoria();
    try {
      await mem.bruto.query(
        "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1,$2,$3)",
        ["Coordenadoria Municipal de Proteção e Defesa Civil de Cidade Verdadeira", "Cidade Verdadeira", "MG"],
      );
      await expect(semearHomologacao(comoDono(mem), { env: ENV_DE_HML, derivar: derivarRapido }))
        .rejects.toThrow(/município REAL|REAL/);
      expect(await contar(mem, "organizacoes")).toBe(1);
      expect(await contar(mem, "usuarios")).toBe(0);
    } finally {
      await mem.banco.encerrar();
    }
  }, 120_000);

  it("banco com município real E sintético também recusa como real", async () => {
    const mem = await bancoEmMemoria();
    try {
      await mem.bruto.query(
        "INSERT INTO organizacoes (id, nome, municipio, uf) VALUES ($1,$2,$3,$4)",
        [ORGANIZACOES_SINTETICAS[0], "Coordenadoria de Serra Alta", "Serra Alta", "MG"],
      );
      await mem.bruto.query(
        "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1,$2,$3)",
        ["Coordenadoria de Cidade Verdadeira", "Cidade Verdadeira", "MG"],
      );
      await expect(semearHomologacao(comoDono(mem), { env: ENV_DE_HML, derivar: derivarRapido }))
        .rejects.toThrow(/REAL/);
    } finally {
      await mem.banco.encerrar();
    }
  }, 120_000);

  it("falha no meio desfaz TUDO: nenhuma conta sem senha, nenhum município", async () => {
    const mem = await bancoEmMemoria();
    try {
      let n = 0;
      const derivarQueFalha = async (senha: string) => {
        n += 1;
        if (n === 3) throw new Error("falha simulada na terceira conta");
        return derivarRapido(senha);
      };
      await expect(semearHomologacao(comoDono(mem), { env: ENV_DE_HML, derivar: derivarQueFalha }))
        .rejects.toThrow(/falha simulada/);
      expect(await contar(mem, "organizacoes")).toBe(0);
      expect(await contar(mem, "usuarios")).toBe(0);
      // E o banco continua semeável depois da falha.
      const contas = await semearHomologacao(comoDono(mem), { env: ENV_DE_HML, derivar: derivarRapido });
      expect(contas.length).toBeGreaterThan(0);
    } finally {
      await mem.banco.encerrar();
    }
  }, 120_000);

  it("fora de HML recusa sem tocar no banco, mesmo vazio", async () => {
    const mem = await bancoEmMemoria();
    try {
      for (const ambiente of ["prod", "dev", undefined]) {
        await expect(semearHomologacao(comoDono(mem), {
          env: { ...ENV_DE_HML, AMBIENTE_DC360: ambiente }, derivar: derivarRapido,
        })).rejects.toThrow(/AMBIENTE_DC360=hml/);
      }
      expect(await contar(mem, "organizacoes")).toBe(0);
    } finally {
      await mem.banco.encerrar();
    }
  }, 120_000);
});

describe("o comando de verdade recusa antes de conectar", () => {
  function rodar(env: Record<string, string>) {
    const tsx = join(AQUI, "..", "..", "..", "node_modules", ".bin", "tsx");
    return spawnSync(tsx, [join(AQUI, "..", "src", "semear-homologacao.ts")], {
      cwd: join(AQUI, ".."),
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", ...env },
      timeout: 60_000,
    });
  }

  it("sem AMBIENTE_DC360=hml: código 1 e a frase da recusa", () => {
    const r = rodar({ DATABASE_URL: URL_DE_HML, IDENTIDADE_DO_BANCO: "refhmlxxxxxxxxx" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/AMBIENTE_DC360=hml/);
    expect(`${r.stdout}${r.stderr}`).not.toContain("senha-de-hml");
  });

  it("com a URL de PRODUÇÃO mesmo declarando hml: código 1, sem tocar na rede", () => {
    const prod = IDENTIDADES_DE_PROD[0]!;
    const r = rodar({
      AMBIENTE_DC360: "hml",
      IDENTIDADE_DO_BANCO: "refhmlxxxxxxxxx",
      DATABASE_URL: `postgres://dc360_setup.${prod}:senha-de-prod@db.invalid:5432/postgres`,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/PRODUÇÃO/);
    expect(`${r.stdout}${r.stderr}`).not.toContain("senha-de-prod");
  });
});
