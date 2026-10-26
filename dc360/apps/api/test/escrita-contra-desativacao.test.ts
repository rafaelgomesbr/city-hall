import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "@dc360/db";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { bancoPostgres } from "../src/banco/postgres.js";
import type { Banco, Consulta } from "../src/banco/tipos.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * A ESCRITA EM VOO NÃO CONFIRMA DEPOIS DA DESATIVAÇÃO (H29, migração 052).
 *
 * O DEFEITO, provado pelo red-team na rodada 4 da V2-F00-E04 (Postgres 17, 8
 * de 8 rodadas): `exigirAutenticacao` conferia a vigência numa transação e a
 * rota gravava em OUTRA, sem reconferir. A administradora A disparava
 * `POST /usuarios`; a Rita desativava A, e a desativação confirmava e
 * respondia; o pedido de A terminava 201 e criava uma conta ADMINISTRADORA
 * ativa, até 223 ms depois. A janela é o scrypt de `derivarSenha`, entre a
 * conferência e o INSERT.
 *
 * O CONSERTO: toda transação de um pedido de escrita começa por
 * `vigencia_de_quem_escreve` (linha da pessoa, trava da pessoa, releitura),
 * chamada pelo `Banco` que as rotas recebem (`bancoQueReconfereAEscrita`).
 *
 * O QUE ESTE ARQUIVO PROVA, nas duas ordens da disputa:
 *
 * 1. A REAÇÃO CONFIRMA ANTES DA TRANSAÇÃO DA ESCRITA. O pedido é segurado logo
 *    depois do COMMIT da conferência de `exigirAutenticacao` (é a janela do
 *    scrypt, aqui aberta à força e sem relógio), a reação roda INTEIRA e
 *    responde, e só então o pedido segue. Sem a reconferência ele grava (é a
 *    reprodução do red-team, em 100% das vezes em vez de 8 em 8 por sorte);
 *    com ela, recusa com o mesmo erro que o pedido seguinte receberia, e nada
 *    é gravado. Roda no PGlite e no Postgres de verdade.
 * 2. A ESCRITA JÁ ESTÁ DENTRO DA TRANSAÇÃO QUANDO A REAÇÃO CHEGA. O pedido é
 *    segurado no INSERT, depois da reconferência, e a reação é disparada. Ela
 *    tem de ficar PARADA esperando trava (o teste olha `pg_locks`, não o
 *    relógio), e só confirma depois da escrita. Sem a reconferência ela não
 *    espera nada, e o caso reprova por isso. Só no Postgres de verdade: o
 *    PGlite tem uma conexão só e serializa tudo, não há disputa a observar.
 *
 * As reações são as quatro que tiram de alguém o direito de escrever: a
 * desativação da conta, o encerramento das sessões por quem administra, o
 * rebaixamento de papel (sem o conserto, uma administradora rebaixada a
 * coordenadora criava uma conta ADMINISTRADORA) e a suspensão do município.
 *
 * O bloco do Postgres pede `DC360_POSTGRES_DE_PROVA`, como
 * `renovacao-contra-encerramento.test.ts`: cria um banco `prova_h29_<sorteio>`,
 * aplica as migrações, semeia, roda e apaga no fim. Sem a variável ele é
 * pulado por ambiente (política T42, `skipIf`).
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001";
const BRUNA = "11111111-1111-4111-8111-0000000000b7";
const EMAIL_BRUNA = "bruna.teles@serraalta.exemplo.gov.br";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";
const URL_DE_PROVA = process.env.DC360_POSTGRES_DE_PROVA ?? "";

type Chamada = { sql: string; params?: readonly unknown[]; em: number };
type Grampo = {
  /** `daTransacao`: as consultas desta transação até aqui, esta inclusive. */
  antes?: (chamada: Chamada, daTransacao: readonly Chamada[]) => Promise<void>;
  depois?: (chamadas: Chamada[]) => Promise<void>;
};

/**
 * O GRAMPO de `renovacao-contra-encerramento.test.ts`: uma casca sobre o
 * `Banco` que deixa o teste segurar um pedido num ponto exato, sem mexer em
 * uma linha do código de produção. `antes` roda antes de cada consulta (dentro
 * da transação); `depois`, depois do COMMIT (fora de qualquer transação).
 */
function grampear(banco: Banco, grampo: { atual: Grampo | null }): Banco {
  function embrulhar<T>(
    abrir: (execucao: (c: Consulta) => Promise<T>) => Promise<T>,
    execucao: (c: Consulta) => Promise<T>,
  ): Promise<T> {
    const chamadas: Chamada[] = [];
    const resultado = abrir((c) => execucao({
      query: async <R>(sql: string, params?: readonly unknown[]) => {
        const chamada = { sql, params, em: performance.now() };
        chamadas.push(chamada);
        await grampo.atual?.antes?.(chamada, chamadas);
        return c.query<R>(sql, params);
      },
    }));
    return resultado.then(async (r) => {
      await grampo.atual?.depois?.(chamadas);
      return r;
    });
  }
  return {
    comTenant: (org, execucao) => embrulhar((e) => banco.comTenant(org, e), execucao),
    semTenant: (execucao) => embrulhar((e) => banco.semTenant(e), execucao),
    encerrar: () => banco.encerrar(),
  };
}

function sinal() {
  let disparar!: () => void;
  const disparado = new Promise<void>((r) => { disparar = r; });
  return { disparado, disparar };
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function configDeTeste() {
  return carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-escrita-contra-desativacao-32b!",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
}

type Bruto = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

type Cenario = {
  app: FastifyInstance;
  grampo: { atual: Grampo | null };
  bruto: Bruto;
  tokenRita: string;
};

type Resposta = Awaited<ReturnType<FastifyInstance["inject"]>>;

/** Uma reação que tira da Bruna o direito de escrever, e o que a escrita dela tem de ouvir. */
type Reacao = {
  nome: string;
  disparar: () => Promise<Resposta | null>;
  /** O status e o código da escrita que chegou à transação DEPOIS da reação. */
  status: number;
  erro: string;
  /** O tipo de trava que a reação espera quando a escrita já está dentro da transação. */
  trava: "advisory" | null;
};

function auxiliares(cenario: () => Cenario) {
  const com = (t: string) => ({ authorization: `Bearer ${t}` });
  let sequencia = 0;

  async function entrar(email: string): Promise<string> {
    const r = await cenario().app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
    if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
    return r.json().acesso as string;
  }

  /** A Bruna existe, ativa, administradora, sem sessão sobrando de caso anterior. */
  async function prepararBruna(): Promise<string> {
    const c = cenario();
    await c.bruto(
      `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, senha_hash)
       SELECT $1, $2, 'Bruna Teles Andrade', 'SA-4410', $3, 'administrador', senha_hash
         FROM usuarios WHERE email = $4
       ON CONFLICT (id) DO UPDATE SET ativo = true, papel = 'administrador'`,
      [BRUNA, ORG_A, EMAIL_BRUNA, EMAIL_RITA],
    );
    await c.bruto("UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [ORG_A]);
    return entrar(EMAIL_BRUNA);
  }

  /** A escrita do red-team: a Bruna cria uma conta ADMINISTRADORA (com o scrypt no meio). */
  function criarConta(token: string) {
    sequencia += 1;
    const email = `conta.nova.${Date.now().toString(36)}.${sequencia}@serraalta.exemplo.gov.br`;
    const pedido = cenario().app.inject({
      method: "POST", url: "/usuarios", headers: com(token),
      payload: {
        nome: `Conta Nova ${sequencia}`, matricula: `SA-9${String(sequencia).padStart(3, "0")}`,
        email, papel: "administrador", senha: "uma-senha-bem-forte-2026",
      },
    });
    return { email, pedido };
  }

  async function contasCriadas(email: string): Promise<number> {
    const r = await cenario().bruto("SELECT count(*)::int AS n FROM usuarios WHERE email = $1", [email]);
    return Number(r.rows[0]!.n);
  }

  async function atosDaBruna(email: string): Promise<number> {
    const r = await cenario().bruto(
      `SELECT count(*)::int AS n FROM trilha_administrativa t
        WHERE t.autor_id = $1 AND t.acao = 'usuario_criado'
          AND t.alvo_id IN (SELECT id FROM usuarios WHERE email = $2)`,
      [BRUNA, email],
    );
    return Number(r.rows[0]!.n);
  }

  const reacoes: Reacao[] = [
    {
      nome: "a Rita desativa a conta da Bruna",
      disparar: () => cenario().app.inject({
        method: "PATCH", url: `/usuarios/${BRUNA}/situacao`, headers: com(cenario().tokenRita),
        payload: { ativo: false },
      }),
      status: 403, erro: "conta_desativada", trava: null,
    },
    {
      nome: "a Rita encerra as sessões da Bruna",
      disparar: () => cenario().app.inject({
        method: "POST", url: `/usuarios/${BRUNA}/encerrar-sessoes`, headers: com(cenario().tokenRita),
      }),
      status: 401, erro: "sessao_encerrada", trava: "advisory",
    },
    {
      nome: "a Rita rebaixa a Bruna a coordenadora",
      disparar: () => cenario().app.inject({
        method: "PATCH", url: `/usuarios/${BRUNA}`, headers: com(cenario().tokenRita),
        payload: {
          nome: "Bruna Teles Andrade", matricula: "SA-4410", email: EMAIL_BRUNA, papel: "coordenador",
        },
      }),
      status: 401, erro: "nao_autenticado", trava: null,
    },
  ];

  /** A suspensão entra direto no banco: pela API ela é do console, que tem outro processo. */
  const suspensao: Reacao = {
    nome: "o município é suspenso",
    disparar: async () => {
      await cenario().bruto(
        "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'prova da H29' WHERE id = $1",
        [ORG_A],
      );
      return null;
    },
    status: 403, erro: "acesso_suspenso", trava: null,
  };

  return { entrar, prepararBruna, criarConta, contasCriadas, atosDaBruna, reacoes, suspensao, com };
}

/** A transação era só a conferência de `exigirAutenticacao` da Bruna. */
const soAConferenciaDaBruna = (todas: Chamada[]) => {
  // O `SET LOCAL lock_timeout` que abre a conferência não conta como consulta.
  const chamadas = todas.filter((c) => !c.sql.startsWith("SET LOCAL"));
  return chamadas.length === 1
    && chamadas[0]!.sql.includes("vigencia_de_quem_escreve(")
    && chamadas[0]!.params?.[0] === BRUNA;
};

/**
 * Ordem 1: a reação confirma inteira entre a conferência e a transação da
 * escrita. Mesmo caso nos dois bancos.
 */
async function reacaoAntesDaTransacao(
  cen: Cenario, a: ReturnType<typeof auxiliares>, reacao: Reacao,
): Promise<void> {
  const token = await a.prepararBruna();
  const janela = sinal();
  const solta = sinal();
  let segurou = false;
  cen.grampo.atual = {
    depois: async (chamadas) => {
      if (segurou || !soAConferenciaDaBruna(chamadas)) return;
      segurou = true;
      janela.disparar();
      await solta.disparado;
    },
  };
  const { email, pedido } = a.criarConta(token);
  try {
    await janela.disparado;
    const r = await reacao.disparar();
    if (r) expect(r.statusCode, `${reacao.nome}: ${r.body}`).toBe(200);
    solta.disparar();
    const escrita = await pedido;
    cen.grampo.atual = null;
    expect(escrita.statusCode, `a escrita em voo confirmou depois de "${reacao.nome}": ${escrita.body}`)
      .toBe(reacao.status);
    expect(escrita.json().erro).toBe(reacao.erro);
    expect(await a.contasCriadas(email), "a conta foi criada mesmo assim").toBe(0);
    expect(await a.atosDaBruna(email), "a trilha registrou um ato que não aconteceu").toBe(0);
  } finally {
    solta.disparar();
    cen.grampo.atual = null;
    await pedido.catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// 1. Postgres em WebAssembly: a reação confirma antes da transação da escrita.
// ---------------------------------------------------------------------------

describe("Escrita em voo contra a perda do direito de escrever (PGlite)", () => {
  let mem: BancoEmMemoria;
  let cen: Cenario;
  const grampo: { atual: Grampo | null } = { atual: null };
  const a = auxiliares(() => cen);

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: true });
    const app = await construirServidor({
      banco: grampear(mem.banco, grampo), config: configDeTeste(),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    cen = {
      app, grampo, tokenRita: "",
      bruto: async (sql, params) => {
        const r = await mem.bruto.query<Record<string, unknown>>(sql, params);
        return { rows: r.rows };
      },
    };
    cen.tokenRita = await a.entrar(EMAIL_RITA);
  }, 180_000);

  afterAll(async () => {
    await cen?.app.close();
    await mem?.banco.encerrar();
  });

  for (const [i, reacao] of [...a.reacoes, a.suspensao].entries()) {
    it(`${i + 1}. ${reacao.nome} entre a conferência e a gravação: a escrita é recusada (${reacao.status} ${reacao.erro}) e nada é gravado`, async () => {
      await reacaoAntesDaTransacao(cen, a, reacao);
    }, 60_000);
  }

  it("5. sem reação nenhuma, a mesma escrita grava (o caso não reprova por outro motivo)", async () => {
    const token = await a.prepararBruna();
    const { email, pedido } = a.criarConta(token);
    const r = await pedido;
    expect(r.statusCode, r.body).toBe(201);
    expect(await a.contasCriadas(email)).toBe(1);
    expect(await a.atosDaBruna(email)).toBe(1);
  }, 60_000);

  it("6. leitura pura não reconfere: nenhuma transação de GET chama a função", async () => {
    const token = await a.prepararBruna();
    const vistas: string[] = [];
    grampo.atual = { antes: async (c) => { vistas.push(c.sql); } };
    try {
      const r = await cen.app.inject({ method: "GET", url: "/usuarios", headers: a.com(token) });
      expect(r.statusCode, r.body).toBe(200);
    } finally {
      grampo.atual = null;
    }
    expect(vistas.length).toBeGreaterThan(0);
    expect(vistas.some((s) => s.includes("vigencia_de_quem_escreve("))).toBe(false);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 2. Postgres de verdade: as duas ordens, com conexões disputando.
// ---------------------------------------------------------------------------

describe.skipIf(!URL_DE_PROVA)("Escrita em voo contra a perda do direito de escrever (Postgres real)", () => {
  let cen: Cenario;
  let banco: Banco;
  let cliente: pg.Client;
  let nomeDoBanco = "";
  const grampo: { atual: Grampo | null } = { atual: null };
  const a = auxiliares(() => cen);

  function urlDoBanco(nome: string): string {
    const u = new URL(URL_DE_PROVA);
    u.pathname = `/${nome}`;
    return u.toString();
  }

  beforeAll(async () => {
    nomeDoBanco = `prova_h29_${Math.random().toString(36).slice(2, 10)}`;
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

    banco = bancoPostgres(urlDoBanco(nomeDoBanco), { maximoConexoes: 8 });
    const app = await construirServidor({
      banco: grampear(banco, grampo), config: configDeTeste(),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    cen = {
      app, grampo, tokenRita: "",
      bruto: async (sql, params) => {
        const r = await cliente.query(sql, params);
        return { rows: r.rows };
      },
    };
    cen.tokenRita = await a.entrar(EMAIL_RITA);
  }, 180_000);

  afterAll(async () => {
    await cen?.app.close();
    await banco?.encerrar();
    await cliente?.end();
    if (nomeDoBanco) {
      const admin = new pg.Client({ connectionString: URL_DE_PROVA });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`);
      await admin.end();
    }
  });

  /** Quantas conexões DESTE banco estão paradas esperando trava agora. */
  async function esperandoTrava(tipo: "advisory" | null): Promise<number> {
    const r = await cen.bruto(
      `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE NOT l.granted AND a.datname = current_database()
          AND ($1::text IS NULL OR l.locktype = $1::text)`,
      [tipo],
    );
    return Number(r.rows[0]!.n);
  }

  /** A reação ficou PARADA numa trava, ou TERMINOU sem esperar ninguém. */
  async function travouOuTerminou(
    pedido: Promise<unknown>, tipo: "advisory" | null, prazoMs = 15_000,
  ): Promise<"travou" | "terminou" | "nenhum"> {
    let terminou = false;
    void pedido.then(() => { terminou = true; }, () => { terminou = true; });
    const ate = Date.now() + prazoMs;
    while (Date.now() < ate) {
      if (await esperandoTrava(tipo) > 0) return "travou";
      if (terminou) return "terminou";
      await esperar(20);
    }
    return "nenhum";
  }

  for (const [i, reacao] of [...a.reacoes, a.suspensao].entries()) {
    it(`${i + 1}. ${reacao.nome} entre a conferência e a gravação: a escrita é recusada (${reacao.status} ${reacao.erro}) e nada é gravado`, async () => {
      await reacaoAntesDaTransacao(cen, a, reacao);
    }, 60_000);
  }

  /*
    A OUTRA ORDEM: a escrita já reconferiu e está no INSERT, segurada com o
    que travou; a reação chega agora. Ela tem de PARAR (linha da pessoa, ou a
    trava consultiva no encerramento) até a escrita confirmar, e só então
    confirmar ela mesma. Depois disso a escrita seguinte já é recusada.
  */
  for (const [i, reacao] of a.reacoes.entries()) {
    it(`${i + 5}. ${reacao.nome} com a escrita já dentro da transação: a reação espera a escrita confirmar`, async () => {
      const token = await a.prepararBruna();
      const janela = sinal();
      const solta = sinal();
      let segurou = false;
      grampo.atual = {
        antes: async (chamada) => {
          if (segurou || !chamada.sql.includes("INSERT INTO usuarios")) return;
          segurou = true;
          janela.disparar();
          await solta.disparado;
        },
      };
      const { email, pedido } = a.criarConta(token);
      const pendentes: Promise<unknown>[] = [pedido];
      try {
        await janela.disparado;
        const disparo = reacao.disparar();
        pendentes.push(disparo);
        const desfecho = await travouOuTerminou(disparo, reacao.trava);
        expect(desfecho, `a disputa não aconteceu: "${reacao.nome}" não esperou a escrita que já estava na transação`)
          .toBe("travou");
        solta.disparar();
        const [r, escrita] = await Promise.all([disparo, pedido]);
        grampo.atual = null;
        expect(escrita.statusCode, escrita.body).toBe(201);
        expect(r!.statusCode, r!.body).toBe(200);
        expect(await a.contasCriadas(email)).toBe(1);
        expect(await a.atosDaBruna(email)).toBe(1);

        // E a escrita seguinte, com o mesmo token, já ouve a reação.
        const depois = a.criarConta(token);
        const seguinte = await depois.pedido;
        expect(seguinte.statusCode, seguinte.body).toBe(reacao.status);
        expect(seguinte.json().erro).toBe(reacao.erro);
        expect(await a.contasCriadas(depois.email)).toBe(0);
      } finally {
        solta.disparar();
        grampo.atual = null;
        await Promise.allSettled(pendentes);
      }
    }, 60_000);
  }

  /*
    A RAJADA DO RED-TEAM, sem segurar nada: oito rodadas da Bruna criando
    conta enquanto a Rita a desativa, com o disparo da desativação de 0 a
    105 ms depois do pedido (o scrypt da criação fica no meio). A medida é a
    do validador: a transação que criou a conta COMEÇOU depois de a
    desativação já ter sido confirmada e respondida a quem desativou? Sem a
    reconferência isso acontece sempre que o scrypt dura mais que a
    desativação; com ela, a transação que começa depois lê a conta desativada
    e recusa (403), e a escrita que grava é só a que pegou a linha da Bruna
    antes da desativação, que por isso espera por ela.
  */
  it("8. rajada de oito rodadas: nenhuma conta é criada por transação que começou depois da desativação respondida", async () => {
    const violacoes: string[] = [];
    let gravadas = 0;
    for (let rodada = 0; rodada < 8; rodada += 1) {
      const token = await a.prepararBruna();
      let inicioDaGravacao: number | null = null;
      grampo.atual = {
        antes: async (chamada, daTransacao) => {
          if (chamada.sql.includes("INSERT INTO usuarios")) inicioDaGravacao = daTransacao[0]!.em;
        },
      };
      const { email, pedido } = a.criarConta(token);
      await esperar(rodada * 15);
      let respondidaEm = 0;
      const desativacao = a.reacoes[0]!.disparar().then((r) => { respondidaEm = performance.now(); return r; });
      const [escrita, d] = await Promise.all([pedido, desativacao]);
      grampo.atual = null;
      expect(d!.statusCode, d!.body).toBe(200);
      if (escrita.statusCode === 201) {
        gravadas += 1;
        expect(inicioDaGravacao).not.toBeNull();
        if (inicioDaGravacao! > respondidaEm) {
          violacoes.push(
            `rodada ${rodada}: a transação que criou a conta começou ${(inicioDaGravacao! - respondidaEm).toFixed(0)} ms `
            + "depois de a desativação ter sido respondida",
          );
        }
      } else {
        expect(escrita.statusCode, escrita.body).toBe(403);
        expect(escrita.json().erro).toBe("conta_desativada");
        expect(await a.contasCriadas(email)).toBe(0);
      }
    }
    console.info(`rajada da H29: ${gravadas} de 8 escritas gravaram, ${violacoes.length} depois da desativação`);
    expect(violacoes, violacoes.join("; ")).toEqual([]);
  }, 120_000);

  /*
    O TETO DE ESPERA POR TRAVA (achado da revisão de 26/10/2026). Uma transação
    de fora segura a linha da Bruna e não solta (é o processo travado, ou a
    conexão esquecida aberta). Sem teto, o pedido dela esperaria para sempre,
    segurando uma conexão do pool; com `lock_timeout`, o Postgres desiste em
    cinco segundos e a resposta é 503 `servidor_ocupado`, que a fila do aparelho
    trata como temporário. Nada é gravado. Dois pontos de espera: a
    reconferência dentro da transação da escrita (9) e a conferência de
    `exigirAutenticacao` (10).
  */
  async function segurarLinhaDaBruna(): Promise<pg.Client> {
    const outro = new pg.Client({ connectionString: urlDoBanco(nomeDoBanco) });
    await outro.connect();
    await outro.query("BEGIN");
    await outro.query("SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE", [BRUNA]);
    return outro;
  }

  it("9. a linha da pessoa presa por outra transação depois da conferência: a escrita desiste em 5 s com 503 e nada é gravado", async () => {
    const token = await a.prepararBruna();
    let outro: pg.Client | null = null;
    grampo.atual = {
      depois: async (chamadas) => {
        if (outro || !soAConferenciaDaBruna(chamadas)) return;
        outro = await segurarLinhaDaBruna();
      },
    };
    const { email, pedido } = a.criarConta(token);
    try {
      const inicio = performance.now();
      const r = await pedido;
      const esperou = performance.now() - inicio;
      expect(outro, "a linha não chegou a ser presa").not.toBeNull();
      expect(r.statusCode, r.body).toBe(503);
      expect(r.json().erro).toBe("servidor_ocupado");
      expect(r.headers["retry-after"]).toBe("2");
      expect(esperou).toBeGreaterThanOrEqual(4_500);
      expect(await a.contasCriadas(email)).toBe(0);
    } finally {
      grampo.atual = null;
      const preso = outro as pg.Client | null;
      if (preso) {
        await preso.query("ROLLBACK");
        await preso.end();
      }
    }
  }, 60_000);

  it("10. a linha da pessoa presa antes do pedido: a conferência de fora também desiste em 5 s com 503", async () => {
    const token = await a.prepararBruna();
    const outro = await segurarLinhaDaBruna();
    try {
      const { email, pedido } = a.criarConta(token);
      const r = await pedido;
      expect(r.statusCode, r.body).toBe(503);
      expect(r.json().erro).toBe("servidor_ocupado");
      expect(await a.contasCriadas(email)).toBe(0);
    } finally {
      await outro.query("ROLLBACK");
      await outro.end();
    }
    // Solta a linha, a mesma escrita passa.
    const depois = a.criarConta(token);
    expect((await depois.pedido).statusCode).toBe(201);
  }, 60_000);
});
