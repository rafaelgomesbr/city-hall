import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TAMANHO_MAXIMO_BYTES } from "@dc360/shared";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "@dc360/db";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { bancoPostgres } from "../src/banco/postgres.js";
import type { Banco } from "../src/banco/tipos.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { FRACAO_DA_MARGEM_POR_PESSOA, tetoDeReservasDaPessoa } from "../src/armazenamento/uso.js";

/**
 * O TETO DE RESERVAS DE ENVIO POR PESSOA (pendência H04, decidida pelo Rafael
 * em 26/10/2026; migração 053 para o índice).
 *
 * O ACHADO, da validação da V2-F00-E06: `POST /evidencias/autorizar-envio`
 * reserva os bytes declarados no teto do município antes de o arquivo subir.
 * Um token de agente fazia cerca de 104 reservas de 15 MB em segundos, sem
 * subir byte nenhum, e ocupava a margem inteira de um município de 1 GiB; a
 * colega passava a levar 507 (e continuava levando depois de ele ser
 * desativado), e a fila do aparelho dela parava por até 30 dias.
 *
 * A REGRA: a soma das reservas AINDA ABERTAS da pessoa (sem arquivo
 * confirmado, não abandonadas) mais a nova não passa de
 * `RESERVA_DE_ENVIO_POR_PESSOA_MB` (padrão 90: seis fotos no teto de 15 MB),
 * nem de um décimo da margem do município, e nunca fica abaixo de uma foto de
 * 15 MB. Quem passa leva 429 `reservas_de_envio_da_pessoa`, que a fila do
 * aparelho trata como temporário.
 *
 * O bloco do Postgres de verdade dispara a rajada EM PARALELO: no PGlite os
 * pedidos se enfileiram sozinhos (uma conexão só), e o que se quer provar lá
 * é que a soma é feita com a linha da pessoa presa, senão a rajada passa
 * inteira por uma folga que só cabia um. Pede `DC360_POSTGRES_DE_PROVA`, como
 * `renovacao-contra-encerramento.test.ts`.
 */

const SENHA = "defesa-civil-2026";
const MB = 1024 * 1024;
const GIB = 1024 * MB;
const ORG_A = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
const CARLA = "11111111-1111-4111-8111-0000000000c7";
const EMAIL_DIEGO = "diego.alves@serraalta.exemplo.gov.br";
const EMAIL_CARLA = "carla.menezes@serraalta.exemplo.gov.br";
const URL_DE_PROVA = process.env.DC360_POSTGRES_DE_PROVA ?? "";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type Bruto = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

function configDeTeste(extra: Record<string, string> = {}) {
  return carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-reserva-de-envio-por-pessoa-32b!",
    LOGIN_POR_IP: "10000",
    ...extra,
  } as NodeJS.ProcessEnv);
}

let sequencia = 0;

function auxiliares(app: () => FastifyInstance, bruto: () => Bruto) {
  const com = (t: string) => ({ authorization: `Bearer ${t}` });

  async function entrar(email: string): Promise<string> {
    const r = await app().inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
    if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
    return r.json().acesso as string;
  }

  /** A colega de equipe do Diego, agente de campo como ele. */
  async function criarCarla(): Promise<void> {
    await bruto()(
      `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
       SELECT $1, $2, 'Carla Menezes Duarte', 'SA-3392', $3, 'agente_campo', $4, senha_hash
         FROM usuarios WHERE id = $5
       ON CONFLICT (id) DO NOTHING`,
      [CARLA, ORG_A, EMAIL_CARLA, EQUIPE_ALFA, DIEGO],
    );
  }

  /** Começa do zero: nenhuma reserva aberta de ninguém, e o teto pedido. */
  async function limpar(teto: number | null): Promise<void> {
    await bruto()(
      `UPDATE evidencias SET abandonada_em = now(), abandono_motivo = 'limpeza do teste'
        WHERE enviada_em IS NULL AND abandonada_em IS NULL`,
    );
    await bruto()("UPDATE organizacoes SET teto_armazenamento_bytes = $2 WHERE id = $1", [ORG_A, teto]);
  }

  function autorizar(token: string, tamanhoBytes: number, chave?: string) {
    sequencia += 1;
    return app().inject({
      method: "POST", url: "/evidencias/autorizar-envio", headers: com(token),
      payload: {
        ocorrenciaId: OC_ALFA_1,
        nomeArquivo: `IMG_${String(sequencia).padStart(4, "0")}.jpg`,
        tipoConteudo: tamanhoBytes === PIXEL_PNG.length ? "image/png" : "image/jpeg",
        tamanhoBytes,
        capturadaEm: new Date().toISOString(),
        ordem: 0,
        idempotencyKey: chave ?? crypto.randomUUID(),
      },
    });
  }

  async function abertasDe(usuarioId: string): Promise<number> {
    const r = await bruto()(
      `SELECT coalesce(sum(tamanho_bytes), 0)::bigint AS b FROM evidencias
        WHERE anexada_por = $1 AND enviada_em IS NULL AND abandonada_em IS NULL`,
      [usuarioId],
    );
    return Number(r.rows[0]!.b);
  }

  return { com, entrar, criarCarla, limpar, autorizar, abertasDe };
}

describe("A conta do teto por pessoa", () => {
  it("é o menor entre o configurado e um décimo da margem, e nunca menos que uma foto no máximo", () => {
    const configurado = 90 * MB;
    // Sem teto contratado: só o configurado.
    expect(tetoDeReservasDaPessoa(configurado, null, TAMANHO_MAXIMO_BYTES)).toBe(90 * MB);
    // Município de 1 GiB: margem de 1,5 GiB, um décimo é 153,6 MB, vale o configurado.
    expect(tetoDeReservasDaPessoa(configurado, (GIB * 3) / 2, TAMANHO_MAXIMO_BYTES)).toBe(90 * MB);
    // Configurado acima do décimo: 1024 MB num município de 1 GiB ficam em 153,6 MB.
    expect(tetoDeReservasDaPessoa(1024 * MB, (GIB * 3) / 2, TAMANHO_MAXIMO_BYTES))
      .toBe(Math.floor((GIB * 3) / 2 / 10));
    // Margem pequena (só a função; o banco não aceita teto abaixo de 1 GiB): nunca abaixo de uma foto.
    expect(tetoDeReservasDaPessoa(configurado, 15 * MB, TAMANHO_MAXIMO_BYTES)).toBe(TAMANHO_MAXIMO_BYTES);
    expect(FRACAO_DA_MARGEM_POR_PESSOA).toBe(10);
  });

  it("o padrão é 90 MB (seis fotos no teto por arquivo), configurável, e não aceita menos que uma foto", () => {
    expect(configDeTeste().RESERVA_DE_ENVIO_POR_PESSOA_MB).toBe(90);
    expect(90 * MB).toBe(6 * TAMANHO_MAXIMO_BYTES);
    expect(configDeTeste({ RESERVA_DE_ENVIO_POR_PESSOA_MB: "15" }).RESERVA_DE_ENVIO_POR_PESSOA_MB).toBe(15);
    expect(() => configDeTeste({ RESERVA_DE_ENVIO_POR_PESSOA_MB: "14" })).toThrow();
    expect(() => configDeTeste({ RESERVA_DE_ENVIO_POR_PESSOA_MB: "noventa" })).toThrow();
  });
});

describe("Um agente não esgota o teto de envio dos colegas (PGlite)", () => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  let tokenDiego = "";
  let tokenCarla = "";
  const a = auxiliares(() => app, () => async (sql, params) => {
    const r = await mem.bruto.query<Record<string, unknown>>(sql, params);
    return { rows: r.rows };
  });

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: true });
    app = await construirServidor({
      banco: mem.banco, config: configDeTeste(),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    await a.criarCarla();
    tokenDiego = await a.entrar(EMAIL_DIEGO);
    tokenCarla = await a.entrar(EMAIL_CARLA);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  it("1. a rajada do achado: num município de 1 GiB, o Diego reserva seis fotos de 15 MB e a sétima leva 429; a Carla continua enviando", async () => {
    await a.limpar(GIB);
    let aceitas = 0;
    let recusa: Awaited<ReturnType<typeof a.autorizar>> | null = null;
    // O achado precisou de 104 pedidos para ocupar a margem; 120 dariam folga.
    for (let i = 0; i < 120; i += 1) {
      const r = await a.autorizar(tokenDiego, 15 * MB);
      if (r.statusCode === 201) { aceitas += 1; continue; }
      recusa = r;
      break;
    }
    expect(aceitas, "reservas aceitas do mesmo agente, sem subir byte nenhum").toBe(6);
    expect(recusa?.statusCode, recusa?.body).toBe(429);
    expect(recusa?.json().erro).toBe("reservas_de_envio_da_pessoa");
    expect(recusa?.json().mensagem).toMatch(/continua guardada no aparelho/);
    expect(await a.abertasDe(DIEGO)).toBe(90 * MB);

    const colega = await a.autorizar(tokenCarla, 15 * MB);
    expect(colega.statusCode, `a colega ficou sem enviar: ${colega.body}`).toBe(201);
    expect(colega.json().armazenamento?.situacao).toBe("normal");
  }, 120_000);

  it("2. no teto, repetir o pedido da MESMA foto (mesma chave) continua respondendo a mesma reserva", async () => {
    await a.limpar(GIB);
    const chaves = Array.from({ length: 6 }, () => crypto.randomUUID());
    const ids: string[] = [];
    for (const chave of chaves) {
      const r = await a.autorizar(tokenDiego, 15 * MB, chave);
      expect(r.statusCode, r.body).toBe(201);
      ids.push(r.json().evidenciaId);
    }
    const repetida = await a.autorizar(tokenDiego, 15 * MB, chaves[2]);
    expect(repetida.statusCode, repetida.body).toBe(201);
    expect(repetida.json().evidenciaId).toBe(ids[2]);
    expect((await a.autorizar(tokenDiego, 15 * MB)).statusCode).toBe(429);
  }, 120_000);

  it("3. reserva abandonada pela varredura de órfão deixa de contar", async () => {
    await a.limpar(GIB);
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) ids.push((await a.autorizar(tokenDiego, 15 * MB)).json().evidenciaId);
    expect((await a.autorizar(tokenDiego, 15 * MB)).statusCode).toBe(429);
    await mem.bruto.query(
      "UPDATE evidencias SET abandonada_em = now(), abandono_motivo = 'sem arquivo' WHERE id = $1", [ids[0]],
    );
    expect((await a.autorizar(tokenDiego, 15 * MB)).statusCode).toBe(201);
  }, 120_000);

  it("4. município sem teto contratado (o estado de hoje): vale o configurado, 90 MB", async () => {
    await a.limpar(null);
    for (let i = 0; i < 6; i += 1) expect((await a.autorizar(tokenDiego, 15 * MB)).statusCode).toBe(201);
    const recusa = await a.autorizar(tokenDiego, 15 * MB);
    expect(recusa.statusCode, recusa.body).toBe(429);
  }, 120_000);
});

describe("Foto concluída libera a reserva da pessoa (PGlite, teto configurado no mínimo)", () => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  let tokenDiego = "";
  const a = auxiliares(() => app, () => async (sql, params) => {
    const r = await mem.bruto.query<Record<string, unknown>>(sql, params);
    return { rows: r.rows };
  });

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: true });
    app = await construirServidor({
      banco: mem.banco,
      // O valor vem da configuração, e não de uma constante da rota: 15 é o piso.
      config: configDeTeste({ RESERVA_DE_ENVIO_POR_PESSOA_MB: "15" }),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    tokenDiego = await a.entrar(EMAIL_DIEGO);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  it("5. com 15 MB configurados, a foto pequena aberta impede a de 15 MB; subida e confirmada, a de 15 MB passa", async () => {
    await a.limpar(null);
    const pequena = await a.autorizar(tokenDiego, PIXEL_PNG.length);
    expect(pequena.statusCode, pequena.body).toBe(201);
    expect((await a.autorizar(tokenDiego, 15 * MB)).statusCode).toBe(429);

    const alvo = new URL(pequena.json().url);
    const put = await app.inject({
      method: "PUT", url: alvo.pathname + alvo.search,
      headers: { ...pequena.json().cabecalhos, "content-length": String(PIXEL_PNG.length) },
      payload: PIXEL_PNG,
    });
    expect(put.statusCode, put.body).toBeLessThan(300);
    const confirmada = await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: a.com(tokenDiego),
      payload: { evidenciaId: pequena.json().evidenciaId },
    });
    expect(confirmada.statusCode, confirmada.body).toBe(200);
    expect(await a.abertasDe(DIEGO)).toBe(0);

    const grande = await a.autorizar(tokenDiego, 15 * MB);
    expect(grande.statusCode, grande.body).toBe(201);
  }, 120_000);
});

describe("Configurado acima de um décimo da margem, vale o décimo (PGlite, 1024 MB configurados)", () => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  let tokenDiego = "";
  const a = auxiliares(() => app, () => async (sql, params) => {
    const r = await mem.bruto.query<Record<string, unknown>>(sql, params);
    return { rows: r.rows };
  });

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: true });
    app = await construirServidor({
      banco: mem.banco,
      config: configDeTeste({ RESERVA_DE_ENVIO_POR_PESSOA_MB: "1024" }),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    tokenDiego = await a.entrar(EMAIL_DIEGO);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  /*
    O menor teto que o banco aceita é 1 GiB (`teto_de_armazenamento_plausivel`,
    migração 035), e um décimo da margem dele (153,6 MB) fica acima do padrão
    de 90 MB: o décimo só decide quando alguém configura mais que isso. É o
    caso aqui, com 1024 MB configurados: dez fotos de 15 MB (150 MB) passam, a
    décima primeira (165 MB) passaria do décimo e leva 429.
  */
  it("6. com 1 GiB de teto e 1024 MB configurados, ninguém segura mais que um décimo da margem (153,6 MB)", async () => {
    await a.limpar(GIB);
    for (let i = 0; i < 10; i += 1) {
      const r = await a.autorizar(tokenDiego, 15 * MB);
      expect(r.statusCode, r.body).toBe(201);
    }
    const recusa = await a.autorizar(tokenDiego, 15 * MB);
    expect(recusa.statusCode, recusa.body).toBe(429);
    expect(recusa.json().erro).toBe("reservas_de_envio_da_pessoa");
    // Sem teto contratado não há margem a dividir: vale o configurado.
    await a.limpar(null);
    for (let i = 0; i < 11; i += 1) expect((await a.autorizar(tokenDiego, 15 * MB)).statusCode).toBe(201);
  }, 120_000);
});

describe.skipIf(!URL_DE_PROVA)("Um agente não esgota o teto de envio dos colegas (Postgres real, rajada em paralelo)", () => {
  let app: FastifyInstance;
  let banco: Banco;
  let cliente: pg.Client;
  let nomeDoBanco = "";
  let tokenDiego = "";
  let tokenCarla = "";
  const a = auxiliares(() => app, () => async (sql, params) => {
    const r = await cliente.query(sql, params);
    return { rows: r.rows };
  });

  function urlDoBanco(nome: string): string {
    const u = new URL(URL_DE_PROVA);
    u.pathname = `/${nome}`;
    return u.toString();
  }

  beforeAll(async () => {
    nomeDoBanco = `prova_h04_${Math.random().toString(36).slice(2, 10)}`;
    const admin = new pg.Client({ connectionString: URL_DE_PROVA });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nomeDoBanco}`);
    await admin.end();

    cliente = new pg.Client({ connectionString: urlDoBanco(nomeDoBanco) });
    await cliente.connect();
    await aplicarMigracoes(
      {
        query: async <T>(sql: string, params?: readonly unknown[]) => {
          const r = await cliente.query(sql, params ? [...params] : undefined);
          return { rows: r.rows as T[] };
        },
        exec: (sql: string) => cliente.query(sql),
      },
      carregarMigracoes(),
    );
    await cliente.query(carregarSemente());

    banco = bancoPostgres(urlDoBanco(nomeDoBanco), { maximoConexoes: 10 });
    app = await construirServidor({
      banco, config: configDeTeste(),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    await a.criarCarla();
    tokenDiego = await a.entrar(EMAIL_DIEGO);
    tokenCarla = await a.entrar(EMAIL_CARLA);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await banco?.encerrar();
    await cliente?.end();
    if (nomeDoBanco) {
      const admin = new pg.Client({ connectionString: URL_DE_PROVA });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`);
      await admin.end();
    }
  });

  it("7. vinte pedidos de 15 MB do mesmo agente AO MESMO TEMPO: exatamente seis passam, e a colega continua enviando", async () => {
    await a.limpar(GIB);
    const respostas = await Promise.all(
      Array.from({ length: 20 }, () => a.autorizar(tokenDiego, 15 * MB)),
    );
    const aceitas = respostas.filter((r) => r.statusCode === 201).length;
    const recusadas = respostas.filter((r) => r.statusCode === 429);
    const outras = respostas.filter((r) => r.statusCode !== 201 && r.statusCode !== 429);
    expect(outras.map((r) => `${r.statusCode} ${r.body}`)).toEqual([]);
    expect(aceitas, "a rajada em paralelo passou por uma folga que só cabia seis").toBe(6);
    expect(recusadas.length).toBe(14);
    expect(recusadas.every((r) => r.json().erro === "reservas_de_envio_da_pessoa")).toBe(true);
    expect(await a.abertasDe(DIEGO)).toBe(90 * MB);

    const colega = await a.autorizar(tokenCarla, 15 * MB);
    expect(colega.statusCode, colega.body).toBe(201);
  }, 120_000);

  it("8. o índice parcial da migração 053 existe e cobre só as reservas abertas", async () => {
    const r = await cliente.query<{ def: string }>(
      "SELECT pg_get_indexdef('evidencias_reservas_abertas_por_pessoa'::regclass) AS def",
    );
    expect(r.rows[0]!.def).toMatch(/\(organizacao_id, anexada_por\)/);
    expect(r.rows[0]!.def).toMatch(/enviada_em IS NULL/);
    expect(r.rows[0]!.def).toMatch(/abandonada_em IS NULL/);
  });
});
