import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHAVE_DA_TRAVA_DE_MIGRACAO,
  CODIGO_DE_SAIDA_MIGRACAO_EM_ANDAMENTO,
  MigracaoEmAndamento,
  aplicarMigracoes,
  migracoesAplicadas,
  motivoParaNaoTravar,
  tomarTravaDeMigracao,
  type ExecutorSql,
  type Migracao,
} from "../src/index.js";

/**
 * A trava contra migração concorrente (V2-F01-E18).
 *
 * Dois níveis de prova, e a diferença entre eles é honesta:
 *
 * 1. **A decisão**, em PGlite: o aplicador toma a trava ANTES de qualquer outra
 *    coisa, espera quando ela está ocupada, desiste com a mensagem e o código 3
 *    quando o prazo acaba, e larga a trava no fim, com sucesso ou com erro. Um
 *    executor-casca faz o papel do "outro migrador" respondendo que a trava
 *    está ocupada. O PGlite tem UMA conexão, então não reproduz a disputa.
 * 2. **A disputa de verdade**, em Postgres real, com dois `pg.Client`: só roda
 *    com `DC360_POSTGRES_DE_PROVA` (a URL de um servidor descartável onde se
 *    possa criar banco). Sem a variável o bloco é pulado por ambiente, e o job
 *    `implantavel` do CI o roda e reprova se ele for pulado.
 */

const M1: Migracao = {
  versao: "001_primeira.sql",
  sql: "CREATE TABLE alfa (id integer PRIMARY KEY);",
};
const M2: Migracao = {
  versao: "002_segunda.sql",
  sql: "CREATE TABLE beta (id integer PRIMARY KEY);",
};

let db: PGlite;
let base: ExecutorSql;

beforeEach(async () => {
  db = new PGlite();
  await db.waitReady;
  base = {
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

/** Quantas travas de aviso (advisory) estão seguradas agora, neste banco. */
async function travasSeguradas(bd: ExecutorSql = base): Promise<number> {
  const r = await bd.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM pg_locks
      WHERE locktype = 'advisory'
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
  );
  return Number(r.rows[0]?.n);
}

/**
 * Um executor que faz de conta que OUTRO migrador segura a trava: responde
 * "ocupada" às primeiras `ocupadaPor` tentativas (`Infinity` = sempre) e
 * registra tudo o que passa, na ordem.
 */
function comOutroMigradorSegurando(ocupadaPor: number) {
  const chamadas: string[] = [];
  let tentativas = 0;
  const bd: ExecutorSql = {
    query: async <T>(sql: string, params?: readonly unknown[]) => {
      chamadas.push(sql);
      if (sql.includes("pg_try_advisory_lock")) {
        tentativas += 1;
        if (tentativas <= ocupadaPor) return { rows: [{ obtida: false }] as T[] };
      }
      return base.query<T>(sql, params);
    },
    exec: (sql: string) => {
      chamadas.push(sql);
      return base.exec(sql);
    },
  };
  return { bd, chamadas, tentativas: () => tentativas };
}

const semEspera = { dormir: async () => undefined };

describe("a decisão, em PGlite", () => {
  it("aplica, e a trava é largada no fim", async () => {
    const r = await aplicarMigracoes(base, [M1, M2]);
    expect(r.aplicadas).toEqual(["001_primeira.sql", "002_segunda.sql"]);
    expect(await travasSeguradas()).toBe(0);
  });

  it("a trava é a PRIMEIRA coisa que o aplicador faz, antes até de criar a tabela de controle", async () => {
    const { bd, chamadas } = comOutroMigradorSegurando(0);
    await aplicarMigracoes(bd, [M1]);
    expect(chamadas[0]).toMatch(/pg_try_advisory_lock/);
    const criouTabela = chamadas.findIndex((c) =>
      /CREATE TABLE IF NOT EXISTS schema_migracoes/.test(c),
    );
    expect(criouTabela).toBeGreaterThan(0);
    // E larga no fim, depois da última migração.
    expect(chamadas[chamadas.length - 1]).toMatch(/pg_advisory_unlock/);
  });

  it("usa a chave fixa do produto", async () => {
    const { bd, chamadas } = comOutroMigradorSegurando(0);
    const soltar = await tomarTravaDeMigracao(bd);
    expect(await travasSeguradas()).toBe(1);
    const r = await base.query<{ objid: number; classid: number }>(
      `SELECT objid, classid FROM pg_locks
        WHERE locktype = 'advisory'
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    );
    // A chave de 64 bits do Postgres se divide em classid (alta) e objid (baixa).
    expect(r.rows[0]?.classid).toBe(0);
    expect(r.rows[0]?.objid).toBe(CHAVE_DA_TRAVA_DE_MIGRACAO);
    await soltar();
    expect(await travasSeguradas()).toBe(0);
    expect(chamadas.filter((c) => /pg_try_advisory_lock/.test(c))).toHaveLength(1);
  });

  it("trava ocupada: espera, tenta de novo e aplica quando a outra termina", async () => {
    const { bd, tentativas } = comOutroMigradorSegurando(3);
    const dormidas: number[] = [];
    const r = await aplicarMigracoes(bd, [M1, M2], {
      trava: { dormir: async (ms) => void dormidas.push(ms) },
    });
    expect(tentativas()).toBe(4);
    expect(dormidas).toEqual([1000, 1000, 1000]);
    expect(r.aplicadas).toEqual(["001_primeira.sql", "002_segunda.sql"]);
    expect(await travasSeguradas()).toBe(0);
  });

  it("trava ocupada o prazo todo: código 3, mensagem em português e NADA foi alterado", async () => {
    const { bd, chamadas, tentativas } = comOutroMigradorSegurando(Infinity);
    const dormidas: number[] = [];
    const erro = await aplicarMigracoes(bd, [M1, M2], {
      trava: { dormir: async (ms) => void dormidas.push(ms) },
    }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(MigracaoEmAndamento);
    const falha = erro as MigracaoEmAndamento;
    expect(falha.codigoDeSaida).toBe(3);
    expect(CODIGO_DE_SAIDA_MIGRACAO_EM_ANDAMENTO).toBe(3);
    expect(falha.message).toMatch(/Outra migração está em andamento/);
    expect(falha.message).toMatch(/esperei 60 s/);
    expect(falha.message).toMatch(/porta 5432/);

    // 60 s em passos de 1 s: 61 tentativas e 60 esperas.
    expect(tentativas()).toBe(61);
    expect(dormidas).toHaveLength(60);

    // Não tocou em tabela, não criou controle, não aplicou migração, e como
    // nunca obteve a trava não tem o que soltar.
    expect(chamadas.some((c) => /CREATE TABLE/.test(c))).toBe(false);
    expect(chamadas.some((c) => /pg_advisory_unlock/.test(c))).toBe(false);
    const existe = await base.query<{ reg: string | null }>("SELECT to_regclass('alfa') AS reg");
    expect(existe.rows[0]?.reg).toBeNull();
    expect(await migracoesAplicadas(base)).toEqual([]);
  });

  it("com esperaMs 0 é uma tentativa só", async () => {
    const { bd, tentativas } = comOutroMigradorSegurando(Infinity);
    await expect(
      aplicarMigracoes(bd, [M1], { trava: { esperaMs: 0, ...semEspera } }),
    ).rejects.toBeInstanceOf(MigracaoEmAndamento);
    expect(tentativas()).toBe(1);
  });

  it("avisa uma vez, no registro, que está esperando", async () => {
    const { bd } = comOutroMigradorSegurando(2);
    const avisos: string[] = [];
    await aplicarMigracoes(bd, [M1], { registrar: (m) => avisos.push(m), trava: semEspera });
    expect(avisos.filter((a) => /esperando a trava/.test(a))).toHaveLength(1);
  });

  it("a trava é larga mesmo quando a migração falha", async () => {
    const quebrada: Migracao = {
      versao: "002_quebrada.sql",
      sql: "SELECT coluna_que_nao_existe FROM alfa;",
    };
    await expect(aplicarMigracoes(base, [M1, quebrada])).rejects.toThrow(
      /Falha ao aplicar 002_quebrada/,
    );
    expect(await travasSeguradas()).toBe(0);
    // E a primeira ficou aplicada, como sempre.
    expect((await migracoesAplicadas(base)).map((m) => m.versao)).toEqual(["001_primeira.sql"]);
  });

  it("a trava é larga quando o histórico foi alterado", async () => {
    await aplicarMigracoes(base, [M1]);
    await expect(
      aplicarMigracoes(base, [{ ...M1, sql: "CREATE TABLE outra (id integer);" }]),
    ).rejects.toThrow(/já foi aplicada/);
    expect(await travasSeguradas()).toBe(0);
  });

  it("migrar com o papel errado continua dando a mensagem do papel, e larga a trava", async () => {
    await db.exec("CREATE ROLE papel_sem_create NOLOGIN");
    await db.exec("GRANT USAGE ON SCHEMA public TO papel_sem_create");
    // O papel errado do mundo real: consegue tomar a trava (advisory lock não
    // pede privilégio), mas não consegue criar a tabela de controle.
    const comoPapelErrado: ExecutorSql = {
      query: async <T>(sql: string, params?: readonly unknown[]) => {
        await db.exec("SET ROLE papel_sem_create");
        return base.query<T>(sql, params);
      },
      exec: async (sql: string) => {
        await db.exec("SET ROLE papel_sem_create");
        return base.exec(sql);
      },
    };
    const erro = await aplicarMigracoes(comoPapelErrado, [M1]).then(
      () => null,
      (e: unknown) => e as Error,
    );
    await db.exec("RESET ROLE");
    expect(erro).not.toBeNull();
    expect(erro).not.toBeInstanceOf(MigracaoEmAndamento);
    expect(erro!.message).toContain("papel_sem_create");
    expect(erro!.message).toMatch(/papel de SETUP/);
    expect(await travasSeguradas()).toBe(0);
  });
});

describe("o pooler não serve", () => {
  it("a porta 6543 (pooler em modo transação) é recusada com a explicação", () => {
    const motivo = motivoParaNaoTravar(
      "postgres://u:senha-secreta@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
    );
    expect(motivo).toMatch(/6543/);
    expect(motivo).toMatch(/porta 5432/);
    expect(motivo).not.toContain("senha-secreta");
  });

  it("conexão direta, sem URL e URL ilegível não recusam aqui", () => {
    expect(motivoParaNaoTravar("postgres://u:p@db.exemplo.invalid:5432/postgres")).toBeNull();
    expect(motivoParaNaoTravar(undefined)).toBeNull();
    expect(motivoParaNaoTravar("")).toBeNull();
    expect(motivoParaNaoTravar("isto não é uma URL")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

const URL_DE_PROVA = process.env["DC360_POSTGRES_DE_PROVA"] ?? "";

/**
 * A disputa de verdade. Dois clientes `pg` em duas conexões, contra um Postgres
 * real, tentando migrar ao mesmo tempo.
 *
 * A migração "lenta" segura o banco por 3 s (`pg_sleep`) DENTRO da transação,
 * então a janela em que o segundo migrador chega e a trava está ocupada é
 * larga o bastante para não depender de sorte.
 */
describe.skipIf(!URL_DE_PROVA)("a disputa de verdade, em Postgres real (dois pg.Client)", () => {
  const nomeDoBanco = `prova_e18_${randomBytes(4).toString("hex")}`;
  const lenta: Migracao = {
    versao: "001_lenta.sql",
    sql: "CREATE TABLE lenta (id integer PRIMARY KEY); SELECT pg_sleep(3);",
  };
  const seguinte: Migracao = {
    versao: "002_seguinte.sql",
    sql: "CREATE TABLE seguinte (id integer PRIMARY KEY);",
  };

  type Cliente = import("pg").Client;
  let admin: Cliente;
  let urlDoBanco: string;
  const abertos: Cliente[] = [];

  async function abrir(): Promise<{ cliente: Cliente; bd: ExecutorSql }> {
    const { default: pg } = await import("pg");
    const cliente = new pg.Client({ connectionString: urlDoBanco });
    await cliente.connect();
    abertos.push(cliente);
    return {
      cliente,
      bd: {
        query: async <T>(sql: string, params?: readonly unknown[]) => {
          const r = await cliente.query(sql, params ? [...params] : undefined);
          return { rows: r.rows as T[] };
        },
        exec: (sql: string) => cliente.query(sql),
      },
    };
  }

  beforeEach(async () => {
    const { default: pg } = await import("pg");
    admin = new pg.Client({ connectionString: URL_DE_PROVA });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nomeDoBanco}`);
    const url = new URL(URL_DE_PROVA);
    url.pathname = `/${nomeDoBanco}`;
    urlDoBanco = url.toString();
  });

  afterEach(async () => {
    await Promise.all(abertos.splice(0).map((c) => c.end().catch(() => undefined)));
    await admin.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`);
    await admin.end();
  });

  it("um espera e aplica sem duplicar: o segundo encontra tudo aplicado", async () => {
    const a = await abrir();
    const b = await abrir();

    const primeiro = aplicarMigracoes(a.bd, [lenta, seguinte]);
    // Dá tempo de A tomar a trava e entrar na migração lenta.
    await new Promise((r) => setTimeout(r, 700));
    const segundo = aplicarMigracoes(b.bd, [lenta, seguinte], {
      trava: { esperaMs: 30_000, intervaloMs: 200 },
    });

    const [ra, rb] = await Promise.all([primeiro, segundo]);
    expect(ra.aplicadas).toEqual(["001_lenta.sql", "002_seguinte.sql"]);
    // O segundo ESPEROU e, quando entrou, não havia mais nada a aplicar.
    expect(rb.aplicadas).toEqual([]);
    expect(rb.jaEstavam).toEqual(["001_lenta.sql", "002_seguinte.sql"]);
    expect((await migracoesAplicadas(a.bd)).map((m) => m.versao)).toEqual([
      "001_lenta.sql",
      "002_seguinte.sql",
    ]);
    expect(await travasSeguradas(a.bd)).toBe(0);
  });

  it("o outro, sem esperar o bastante, sai com código 3 e a primeira termina intacta", async () => {
    const a = await abrir();
    const b = await abrir();

    const primeiro = aplicarMigracoes(a.bd, [lenta, seguinte]);
    await new Promise((r) => setTimeout(r, 700));
    const erro = await aplicarMigracoes(b.bd, [lenta, seguinte], {
      trava: { esperaMs: 600, intervaloMs: 200 },
    }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(MigracaoEmAndamento);
    expect((erro as MigracaoEmAndamento).codigoDeSaida).toBe(3);
    expect((erro as MigracaoEmAndamento).message).toMatch(/Outra migração está em andamento/);

    const ra = await primeiro;
    expect(ra.aplicadas).toEqual(["001_lenta.sql", "002_seguinte.sql"]);
  });

  it("se o migrador que segura a trava morre, a trava solta com a conexão", async () => {
    const a = await abrir();
    const b = await abrir();
    const soltar = await tomarTravaDeMigracao(a.bd);
    void soltar;
    await expect(tomarTravaDeMigracao(b.bd, { esperaMs: 0 })).rejects.toBeInstanceOf(
      MigracaoEmAndamento,
    );

    // O processo de A morre sem largar nada: o Postgres larga a trava ao perder a conexão.
    await a.cliente.end();
    const depois = await tomarTravaDeMigracao(b.bd, { esperaMs: 5_000, intervaloMs: 100 });
    await depois();
  });
});
