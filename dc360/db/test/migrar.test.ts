import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HistoricoAlterado, aplicarMigracoes, carregarMigracoes,
  migracoesAplicadas, migracoesPendentes,
  type ExecutorSql, type Migracao,
} from "../src/index.js";

/**
 * Aplicador de migrações.
 *
 * O que estes testes protegem é o deploy. Aplicar de novo o que já rodou
 * quebraria a subida; parar no meio deixaria o esquema num estado que ninguém
 * sabe descrever; e seguir em frente depois de alguém editar uma migração já
 * aplicada faria o banco de produção divergir em silêncio do que está no
 * repositório.
 */

let db: PGlite;
let bd: ExecutorSql;

beforeEach(async () => {
  db = new PGlite();
  await db.waitReady;
  bd = {
    query: async <T>(sql: string, params?: readonly unknown[]) => {
      const r = await db.query<Record<string, unknown>>(sql, params ? [...params] : undefined);
      return { rows: r.rows as T[] };
    },
    exec: (sql: string) => db.exec(sql),
  };
});

afterEach(async () => {
  await db?.close();
});

const M1: Migracao = {
  versao: "001_primeira.sql",
  sql: "CREATE TABLE alfa (id integer PRIMARY KEY);",
};
const M2: Migracao = {
  versao: "002_segunda.sql",
  sql: "CREATE TABLE beta (id integer PRIMARY KEY);",
};
const M3: Migracao = {
  versao: "003_terceira.sql",
  sql: "ALTER TABLE beta ADD COLUMN nome text;",
};

async function existe(tabela: string): Promise<boolean> {
  const r = await bd.query<{ existe: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1) AS existe",
    [tabela],
  );
  return r.rows[0]!.existe;
}

describe("Aplicação", () => {
  it("aplica na ordem, mesmo recebendo fora de ordem", async () => {
    // A 003 altera a tabela que a 002 cria: fora de ordem, ela falharia.
    const r = await aplicarMigracoes(bd, [M3, M1, M2]);

    expect(r.aplicadas).toEqual([
      "001_primeira.sql", "002_segunda.sql", "003_terceira.sql",
    ]);
    expect(await existe("alfa")).toBe(true);
    expect(await existe("beta")).toBe(true);
  });

  it("rodar de novo não faz nada", async () => {
    await aplicarMigracoes(bd, [M1, M2]);
    const segunda = await aplicarMigracoes(bd, [M1, M2]);

    // Sem isto, o segundo deploy tentaria criar tabela que já existe e
    // falharia na subida.
    expect(segunda.aplicadas).toEqual([]);
    expect(segunda.jaEstavam).toEqual(["001_primeira.sql", "002_segunda.sql"]);
  });

  it("aplica só o que falta quando uma migração nova aparece", async () => {
    await aplicarMigracoes(bd, [M1]);
    const r = await aplicarMigracoes(bd, [M1, M2]);

    expect(r.jaEstavam).toEqual(["001_primeira.sql"]);
    expect(r.aplicadas).toEqual(["002_segunda.sql"]);
  });

  it("registra quando cada uma foi aplicada", async () => {
    await aplicarMigracoes(bd, [M1, M2]);
    const registro = await migracoesAplicadas(bd);

    expect(registro.map((m) => m.versao)).toEqual(["001_primeira.sql", "002_segunda.sql"]);
    for (const m of registro) expect(m.aplicada_em).toBeTruthy();
  });
});

describe("Falha no meio", () => {
  it("desfaz a migração que falhou e mantém as anteriores", async () => {
    const quebrada: Migracao = {
      versao: "002_quebrada.sql",
      sql: `
        CREATE TABLE gama (id integer PRIMARY KEY);
        ISTO NAO E SQL VALIDO;
      `,
    };

    await expect(aplicarMigracoes(bd, [M1, quebrada])).rejects.toThrow(/002_quebrada/);

    // A primeira continua aplicada: um erro de digitação numa migração não
    // pode custar a reaplicação de todas as outras num banco grande.
    expect(await existe("alfa")).toBe(true);
    // E a que falhou não deixou meia tabela para trás.
    expect(await existe("gama")).toBe(false);
    expect((await migracoesAplicadas(bd)).map((m) => m.versao)).toEqual(["001_primeira.sql"]);
  });

  it("retoma da que falhou depois que ela é corrigida", async () => {
    const quebrada: Migracao = { versao: "002_segunda.sql", sql: "NAO E SQL;" };
    await expect(aplicarMigracoes(bd, [M1, quebrada])).rejects.toThrow();

    const r = await aplicarMigracoes(bd, [M1, M2]);
    expect(r.aplicadas).toEqual(["002_segunda.sql"]);
    expect(await existe("beta")).toBe(true);
  });

  it("a mensagem diz qual migração falhou", async () => {
    const quebrada: Migracao = { versao: "009_culpada.sql", sql: "SELECT coluna_inexistente;" };
    // Sem o nome, quem está no meio de um deploy às duas da manhã fica
    // caçando qual arquivo quebrou.
    await expect(aplicarMigracoes(bd, [M1, quebrada])).rejects.toThrow(/009_culpada\.sql/);
  });
});

describe("Histórico não se reescreve", () => {
  it("para quando uma migração já aplicada muda de conteúdo", async () => {
    await aplicarMigracoes(bd, [M1]);

    const editada: Migracao = {
      versao: "001_primeira.sql",
      sql: "CREATE TABLE alfa (id integer PRIMARY KEY, extra text);",
    };

    // Editar migração que já rodou em produção faz o banco de lá divergir do
    // daqui em silêncio. Seguir em frente esconderia isso até uma consulta
    // falhar sem explicação.
    await expect(aplicarMigracoes(bd, [editada])).rejects.toBeInstanceOf(HistoricoAlterado);
  });

  it("a mensagem explica o que fazer, não só que deu erro", async () => {
    await aplicarMigracoes(bd, [M1]);
    const editada: Migracao = { versao: "001_primeira.sql", sql: "SELECT 2;" };

    await expect(aplicarMigracoes(bd, [editada]))
      .rejects.toThrow(/Crie uma migração nova/);
  });

  it("reindentar não conta como alterar", async () => {
    await aplicarMigracoes(bd, [M1]);

    const reindentada: Migracao = {
      versao: "001_primeira.sql",
      sql: "\n  CREATE TABLE alfa (id integer PRIMARY KEY);\n\n",
    };

    // Espaço em branco muda sozinho: clonar o repositório no Windows troca LF
    // por CRLF. Travar o deploy por isso seria alarme falso diário.
    const r = await aplicarMigracoes(bd, [reindentada]);
    expect(r.jaEstavam).toEqual(["001_primeira.sql"]);
  });
});

describe("Conferência sem aplicar", () => {
  it("diz o que falta e não muda nada", async () => {
    await aplicarMigracoes(bd, [M1]);

    const pendentes = await migracoesPendentes(bd, [M1, M2, M3]);
    expect(pendentes).toEqual(["002_segunda.sql", "003_terceira.sql"]);

    // Conferir não aplica: é o que permite o contêiner recusar subir com
    // esquema atrasado em vez de servir requisição contra banco incompleto.
    expect(await existe("beta")).toBe(false);
  });

  it("esquema em dia devolve lista vazia", async () => {
    await aplicarMigracoes(bd, [M1, M2]);
    expect(await migracoesPendentes(bd, [M1, M2])).toEqual([]);
  });
});

describe("As migrações reais do produto", () => {
  it("aplicam do zero, na ordem, sem erro", async () => {
    const migracoes = carregarMigracoes();
    expect(migracoes.length).toBeGreaterThanOrEqual(7);

    const r = await aplicarMigracoes(bd, migracoes);
    expect(r.aplicadas).toEqual(migracoes.map((m) => m.versao));

    // Todas as tabelas de negócio existem depois.
    for (const tabela of [
      "organizacoes", "equipes", "usuarios", "ocorrencias", "vistorias",
      "evidencias", "providencias", "trilha_eventos", "sessoes",
      "recuperacoes_senha", "exportacoes",
    ]) {
      expect(await existe(tabela), `falta a tabela ${tabela}`).toBe(true);
    }
  }, 120_000);

  it("aplicar duas vezes é seguro, que é o caso de todo redeploy", async () => {
    const migracoes = carregarMigracoes();
    await aplicarMigracoes(bd, migracoes);
    const segunda = await aplicarMigracoes(bd, migracoes);

    expect(segunda.aplicadas).toEqual([]);
    expect(segunda.jaEstavam).toHaveLength(migracoes.length);
  }, 120_000);

  it("os nomes começam com número, senão a ordem alfabética não serve", async () => {
    for (const m of carregarMigracoes()) {
      expect(m.versao, `${m.versao} não começa com número`).toMatch(/^\d{3}_/);
    }
  });
});

/**
 * A mensagem quando quem migra é o papel ERRADO.
 *
 * Isto custou tempo de verdade em 13/09/2026. O `apps/api/.env` guarda a
 * credencial do papel de APLICAÇÃO, que tem `USAGE` no schema e não tem
 * `CREATE`, de propósito: se a API pudesse alterar esquema, uma falha nela
 * viraria alteração de banco. Migração é ato do papel de SETUP, e essa
 * credencial não mora no repositório.
 *
 * Quem tentou migrar com a credencial que estava à mão recebeu isto, cru:
 *
 *     error: permission denied for schema public
 *         at garantirTabela (db/src/migrar.ts:71:3)
 *
 * A frase é do Postgres e está correta, e manda a pessoa procurar no lugar
 * errado: ela vai conferir policy, RLS, dono de tabela. O diagnóstico é
 * conhecido (papel sem CREATE no schema), a saída é conhecida (usar o papel de
 * setup), e nada disso aparecia.
 *
 * O caso abaixo cria um papel sem CREATE de verdade e migra com ele, em vez de
 * simular o erro com um dublê que devolve a string: um dublê provaria que a
 * função sabe reconhecer um texto que ela mesma inventou.
 */
describe("Migrar com o papel errado", () => {
  /** Um executor que roda tudo como um papel sem CREATE no schema public. */
  function comoPapelSemCreate(): ExecutorSql {
    const comPapel = async (fn: () => Promise<unknown>) => {
      await db.exec("SET ROLE papel_sem_create");
      try { return await fn(); } finally { await db.exec("RESET ROLE"); }
    };
    return {
      query: async <T>(sql: string, params?: readonly unknown[]) =>
        comPapel(async () => {
          const r = await db.query<Record<string, unknown>>(
            sql, params ? [...params] : undefined,
          );
          return { rows: r.rows as T[] };
        }) as Promise<{ rows: T[] }>,
      exec: (sql: string) => comPapel(() => db.exec(sql)) as Promise<unknown>,
    } as ExecutorSql;
  }

  beforeEach(async () => {
    await db.exec("CREATE ROLE papel_sem_create NOLOGIN");
    await db.exec("GRANT USAGE ON SCHEMA public TO papel_sem_create");
    // E nada de CREATE: é exatamente o que dc360_app tem em produção.
  });

  it("explica que o papel não pode criar tabela, em vez de repetir o erro do Postgres", async () => {
    const erro = await aplicarMigracoes(comoPapelSemCreate(), [M1])
      .then(() => null, (e: unknown) => e as Error);

    expect(erro, "migrou com um papel que não pode criar tabela").not.toBeNull();
    const texto = erro!.message;

    // Diz o que aconteceu, em português e sem jargão de catálogo.
    expect(texto, texto).toMatch(/não pode criar|sem permissão de criar/i);
    // Diz QUAL papel estava sendo usado, senão a pessoa não sabe o que trocar.
    expect(texto, texto).toContain("papel_sem_create");
    // Diz a saída, que é a única coisa que resolve.
    expect(texto, texto).toMatch(/setup/i);
    // E preserva o erro original: quem depura não pode perder o texto do banco.
    expect(texto, texto).toMatch(/permission denied for schema public/i);
  });

  it("o papel certo continua migrando sem nenhum aviso novo", async () => {
    // O portão não pode transformar o caminho normal em caminho com ressalva.
    const r = await aplicarMigracoes(bd, [M1, M2]);
    expect(r.aplicadas).toEqual(["001_primeira.sql", "002_segunda.sql"]);
  });
});
