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
import { derivarSenha } from "../src/auth/senha.js";
import { hashDoToken } from "../src/auth/tokens.js";

/**
 * A RENOVAÇÃO NÃO SOBREVIVE A UM ENCERRAMENTO QUE CHEGA NO MEIO DELA
 * (V2-F00-E07, correção 2).
 *
 * O DEFEITO, provado pela validação de 4b96ea7 contra Postgres 18.3: `renovar`
 * revogava a sessão antiga numa transação e abria a nova em OUTRA. Se quem
 * administra encerrava as sessões entre as duas, o UPDATE dele não via sessão
 * viva nenhuma (a antiga já estava rotacionada e a nova ainda não existia),
 * respondia 200, e a renovação abria a sessão nova herdando a família que
 * acabara de ser encerrada. Quem tinha o token saía com um par que renovava
 * por catorze dias, e o token de acesso anterior à renovação voltava a
 * escrever. Sobrou sessão viva em 5 de 60 corridas.
 *
 * O CONSERTO tem duas metades, e este arquivo cobra as duas:
 *
 * 1. UMA TRANSAÇÃO. Revogar a antiga e abrir a nova são confirmadas juntas:
 *    não existe mais o instante em que a família está sem sessão viva. É o
 *    que o primeiro bloco prova, no Postgres em WebAssembly, que serializa as
 *    transações e por isso não precisa de nada além disso para passar.
 * 2. UMA TRAVA POR PESSOA. Só a transação única não basta no Postgres de
 *    verdade: em READ COMMITTED, o UPDATE de quem encerra não enxerga a linha
 *    que uma transação ainda aberta inseriu. A renovação e todo encerramento
 *    em massa (quem administra, a própria pessoa, a troca de senha, o reuso de
 *    token, a desativação, o link de recuperação) tomam a mesma trava
 *    (`travar_sessoes_do_usuario`, migração 049) num comando ANTERIOR ao
 *    UPDATE, e o UPDATE seguinte enxerga a sessão nova. É o que o segundo
 *    bloco prova, com conexões reais disputando.
 *
 * O QUE NÃO PODE MUDAR, e também é cobrado aqui: a rotação não é expulsão. O
 * token de acesso emitido antes da renovação continua escrevendo pelos seus
 * quinze minutos, inclusive DURANTE a renovação (antes, a escrita que caía na
 * janela entre as duas transações levava 401 `sessao_encerrada`).
 *
 * POR QUE O SEGUNDO BLOCO SÓ RODA COM POSTGRES: o PGlite tem uma conexão só e
 * serializa as transações, então ele não reproduz a corrida que a trava
 * resolve. O bloco pede `DC360_POSTGRES_DE_PROVA` com a URL de um servidor
 * descartável onde o teste possa criar banco (`CREATE DATABASE`): cria um
 * `prova_c2_<sorteio>`, aplica as migrações, semeia, roda e apaga no fim. Sem
 * a variável ele é pulado por ambiente (política T42, `skipIf`).
 */

const SENHA = "defesa-civil-2026";
const SENHA_NOVA = "outra-senha-bem-forte-2026";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";
const URL_DE_PROVA = process.env.DC360_POSTGRES_DE_PROVA ?? "";

type Par = { acesso: string; renovacao: string };
type Chamada = { sql: string; params?: readonly unknown[] };

/**
 * O GRAMPO: uma casca sobre o `Banco` que deixa o teste segurar a renovação
 * num ponto exato, sem mexer em uma linha do código de produção.
 *
 * - `antes` roda antes de cada consulta, e pode segurar ali (dentro da
 *   transação, com o que ela já travou).
 * - `depois` roda depois do COMMIT de cada transação, com o que ela executou,
 *   e pode segurar ali (fora de qualquer transação).
 */
type Grampo = {
  antes?: (chamada: Chamada) => Promise<void>;
  depois?: (chamadas: Chamada[]) => Promise<void>;
};

function grampear(banco: Banco, grampo: { atual: Grampo | null }): Banco {
  function embrulhar<T>(
    abrir: (execucao: (c: Consulta) => Promise<T>) => Promise<T>,
    execucao: (c: Consulta) => Promise<T>,
  ): Promise<T> {
    const chamadas: Chamada[] = [];
    const resultado = abrir((c) => execucao({
      query: async <R>(sql: string, params?: readonly unknown[]) => {
        chamadas.push({ sql, params });
        await grampo.atual?.antes?.({ sql, params });
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

/** A transação revogou um token por rotação (é a renovação). */
const rotacionou = (chamadas: Chamada[]) =>
  chamadas.some((c) => c.sql.includes("revogar_sessao(") && c.params?.[1] === "rotacionada na renovacao");

/** A consulta abre a sessão nova HERDANDO uma família (só a renovação faz isso). */
const abreHerdando = (c: Chamada) => c.sql.includes("abrir_sessao(") && c.params?.[6] != null;

/** A consulta é o encerramento concorrente chegando ao banco (ou à trava dele). */
const ehEncerramento = (c: Chamada) =>
  /travar_sessoes_do_usuario\(|trocar_senha\(|revogar_sessoes_do_usuario\(|UPDATE sessoes/.test(c.sql);

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sinal() {
  let disparar!: () => void;
  const disparado = new Promise<void>((r) => { disparar = r; });
  return { disparado, disparar };
}

/** O cenário montado, igual para os dois bancos: muda só de onde vêm as conexões. */
type Cenario = {
  app: FastifyInstance;
  grampo: { atual: Grampo | null };
  bruto: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  tokenRita: string;
};

function auxiliares(cenario: () => Cenario) {
  const com = (t: string) => ({ authorization: `Bearer ${t}` });

  async function entrar(email = EMAIL_HELENA, senha = SENHA): Promise<Par> {
    const r = await cenario().app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
    if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
    return { acesso: r.json().acesso, renovacao: r.json().renovacao };
  }

  function pedirRenovacao(renovacao: string) {
    return cenario().app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
  }

  function escrever(token: string) {
    return cenario().app.inject({
      method: "POST", url: `/ocorrencias/${OC_ALFA_1}/coordenada`, headers: com(token),
      payload: { coordenada: { lat: -22.41, lng: -45.45 }, motivo: "Ponto conferido no local pela equipe." },
    });
  }

  /**
   * Sessões de pé na CADEIA de quem renovou (a família do login `h`). Conta
   * a cadeia, e não a pessoa, porque dois dos encerramentos preservam de
   * propósito a sessão de quem clicou (encerrar as outras e trocar a senha).
   */
  async function sessoesVivasDaCadeia(h: Par): Promise<number> {
    const r = await cenario().bruto(
      `SELECT count(*)::int AS n FROM sessoes
        WHERE revogada_em IS NULL
          AND familia_id = (SELECT familia_id FROM sessoes WHERE token_hash = $1)`,
      [hashDoToken(h.renovacao)],
    );
    return Number(r.rows[0]!.n);
  }

  async function restaurarHelena(): Promise<void> {
    await cenario().bruto(
      "UPDATE usuarios SET ativo = true, senha_provisoria_ate = NULL, senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL WHERE id = $1",
      [HELENA, await derivarSenha(SENHA)],
    );
  }

  /**
   * Os quatro encerramentos em massa que a renovação disputa. `preparar` roda
   * antes da disputa (e devolve o que o encerramento precisa); `disparar` é o
   * pedido concorrente; `esperado` é o status dele.
   */
  type Encerramento = {
    nome: string;
    preparar: (h: Par) => Promise<{ disparar: () => ReturnType<FastifyInstance["inject"]>; renovar: string }>;
    esperado: number;
    depois?: () => Promise<void>;
  };

  const encerramentos: Encerramento[] = [
    {
      nome: "quem administra encerra as sessões da pessoa",
      preparar: async (h) => ({
        renovar: h.renovacao,
        disparar: () => cenario().app.inject({
          method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(cenario().tokenRita),
        }),
      }),
      esperado: 200,
    },
    {
      nome: "a própria pessoa encerra as outras sessões, de outro aparelho",
      preparar: async (h) => {
        const painel = await entrar();
        return {
          renovar: h.renovacao,
          disparar: () => cenario().app.inject({
            method: "POST", url: "/auth/encerrar-sessoes", headers: com(painel.acesso),
          }),
        };
      },
      esperado: 200,
    },
    {
      nome: "a pessoa troca a senha em outro aparelho",
      preparar: async (h) => {
        const quemTroca = await entrar();
        return {
          renovar: h.renovacao,
          disparar: () => cenario().app.inject({
            method: "POST", url: "/auth/trocar-senha", headers: com(quemTroca.acesso),
            payload: { senhaAtual: SENHA, senha: SENHA_NOVA },
          }),
        };
      },
      esperado: 200,
      depois: restaurarHelena,
    },
    {
      nome: "um token de renovação já gasto reaparece (reuso)",
      preparar: async (h) => {
        // A cadeia já rotacionou uma vez: `h.renovacao` é o token gasto.
        const legitimo = await pedirRenovacao(h.renovacao);
        if (legitimo.statusCode !== 200) throw new Error(`renovação de preparo falhou: ${legitimo.body}`);
        return {
          renovar: legitimo.json().renovacao,
          disparar: () => pedirRenovacao(h.renovacao),
        };
      },
      esperado: 401,
    },
  ];

  /**
   * O que tem de valer depois da disputa, qualquer que tenha sido a ordem: o
   * encerramento respondeu o que promete, nenhuma sessão da pessoa ficou de
   * pé, o par que a renovação eventualmente entregou não renova nem escreve,
   * e o token de acesso de antes da renovação também não escreve.
   */
  async function exigirCadeiaMorta(
    encerramento: { statusCode: number; body: string },
    esperado: number,
    renovacao: { statusCode: number; json: () => { acesso: string; renovacao: string } },
    h: Par,
  ): Promise<void> {
    expect(encerramento.statusCode, encerramento.body).toBe(esperado);
    expect(await sessoesVivasDaCadeia(h), "sobrou sessão viva numa cadeia encerrada").toBe(0);
    if (renovacao.statusCode === 200) {
      const par = renovacao.json();
      const outra = await pedirRenovacao(par.renovacao);
      expect(outra.statusCode, "o par entregue no meio do encerramento ainda renova").toBe(401);
      const escrita = await escrever(par.acesso);
      expect(escrita.statusCode, "o token entregue no meio do encerramento ainda escreve").toBe(401);
    }
    const antiga = await escrever(h.acesso);
    expect(antiga.statusCode, "o token de antes da renovação voltou a escrever").toBe(401);
  }

  return { entrar, pedirRenovacao, escrever, sessoesVivasDaCadeia, restaurarHelena, encerramentos, exigirCadeiaMorta };
}

function configDeTeste() {
  return carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-renovacao-contra-encerramento-32b!",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
}

// ---------------------------------------------------------------------------
// 1. Postgres em WebAssembly: a transação única.
// ---------------------------------------------------------------------------

describe("Renovação e encerramento no mesmo instante: a renovação é UMA transação", () => {
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
    cen.tokenRita = (await a.entrar(EMAIL_RITA)).acesso;
  }, 180_000);

  afterAll(async () => {
    await cen?.app.close();
    await mem?.banco.encerrar();
  });

  /*
    A DISPUTA, em ordem fixa: a renovação confirma a transação em que
    rotacionou e é SEGURADA logo depois do COMMIT; o encerramento roda inteiro
    nesse instante; só então a renovação segue. Com revogar e abrir em
    transações separadas, esse instante é exatamente o buraco (a família sem
    sessão viva) e o encerramento não acha o que encerrar. Com a transação
    única, quando a renovação confirma a sessão nova já existe, e o
    encerramento a derruba.
  */
  for (const [i, enc] of a.encerramentos.entries()) {
    it(`${i + 1}. ${enc.nome}: nenhuma sessão da cadeia sobrevive`, async () => {
      const h = await a.entrar();
      const disputa = await enc.preparar(h);
      const janela = sinal();
      const solta = sinal();
      grampo.atual = {
        depois: async (chamadas) => {
          if (!rotacionou(chamadas)) return;
          janela.disparar();
          await solta.disparado;
        },
      };
      try {
        const renovacao = a.pedirRenovacao(disputa.renovar);
        await janela.disparado;
        const encerramento = await disputa.disparar();
        solta.disparar();
        grampo.atual = null;
        await a.exigirCadeiaMorta(encerramento, enc.esperado, await renovacao, h);
      } finally {
        solta.disparar();
        grampo.atual = null;
        await enc.depois?.();
      }
    }, 120_000);
  }

  it("5. a rotação não é expulsão: o token de antes da renovação escreve logo depois de ela confirmar", async () => {
    const h = await a.entrar();
    const janela = sinal();
    const solta = sinal();
    grampo.atual = {
      depois: async (chamadas) => {
        if (!rotacionou(chamadas)) return;
        janela.disparar();
        await solta.disparado;
      },
    };
    try {
      const renovacao = a.pedirRenovacao(h.renovacao);
      await janela.disparado;
      // Antes: a antiga já revogada, a nova ainda não aberta, e a escrita
      // legítima levava 401 `sessao_encerrada` (a "janela na renovação").
      const escrita = await a.escrever(h.acesso);
      solta.disparar();
      grampo.atual = null;
      expect(escrita.statusCode, escrita.body).toBe(200);
      const r = await renovacao;
      expect(r.statusCode, r.body).toBe(200);
      expect((await a.escrever(r.json().acesso)).statusCode).toBe(200);
    } finally {
      solta.disparar();
      grampo.atual = null;
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Postgres de verdade: a trava comum.
// ---------------------------------------------------------------------------

describe.skipIf(!URL_DE_PROVA)("Renovação e encerramento em Postgres real: a trava comum por pessoa", () => {
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
    nomeDoBanco = `prova_c2_${Math.random().toString(36).slice(2, 10)}`;
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
    cen.tokenRita = (await a.entrar(EMAIL_RITA)).acesso;
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

  /*
    A DISPUTA, segurando a renovação DENTRO da transação, entre revogar a
    antiga e abrir a nova (com tudo o que ela já travou). O encerramento é
    disparado nesse instante, e a renovação só segue quando ele chegou ao
    banco (o comando dele foi enviado) e teve 300 ms para terminar ou ficar
    preso na trava. Sem a trava, ele termina sem ver a sessão que ainda vai
    nascer; com ela, ele espera a renovação confirmar e a encerra.
  */
  for (const [i, enc] of a.encerramentos.entries()) {
    it(`${i + 1}. ${enc.nome}: nenhuma sessão da cadeia sobrevive`, async () => {
      const h = await a.entrar();
      const disputa = await enc.preparar(h);
      const janela = sinal();
      const chegou = sinal();
      let segurando = false;
      grampo.atual = {
        antes: async (chamada) => {
          if (segurando && ehEncerramento(chamada)) chegou.disparar();
          if (!abreHerdando(chamada) || segurando) return;
          segurando = true;
          janela.disparar();
          await Promise.race([chegou.disparado.then(() => esperar(300)), esperar(10_000)]);
        },
      };
      try {
        const renovacao = a.pedirRenovacao(disputa.renovar);
        await janela.disparado;
        const encerramento = await disputa.disparar();
        const r = await renovacao;
        grampo.atual = null;
        await a.exigirCadeiaMorta(encerramento, enc.esperado, r, h);
      } finally {
        grampo.atual = null;
        await enc.depois?.();
      }
    }, 120_000);
  }

  it("5. a rotação não é expulsão: no meio da renovação, o token de antes dela escreve", async () => {
    const h = await a.entrar();
    const janela = sinal();
    const solta = sinal();
    let segurando = false;
    grampo.atual = {
      antes: async (chamada) => {
        if (!abreHerdando(chamada) || segurando) return;
        segurando = true;
        janela.disparar();
        await solta.disparado;
      },
    };
    try {
      const renovacao = a.pedirRenovacao(h.renovacao);
      await janela.disparado;
      const escrita = await a.escrever(h.acesso);
      solta.disparar();
      expect(escrita.statusCode, escrita.body).toBe(200);
      const r = await renovacao;
      expect(r.statusCode, r.body).toBe(200);
      expect((await a.escrever(r.json().acesso)).statusCode).toBe(200);
    } finally {
      solta.disparar();
      grampo.atual = null;
    }
  });

  /*
    Sem grampo nenhum: a disputa do validador (renovar e encerrar ao mesmo
    tempo, com atraso sorteado de 0 a 3,5 ms), repetida 60 vezes. Em 4b96ea7
    sobrou sessão viva em 5 de 60.
  */
  it("6. sessenta disputas sem grampo, com atraso sorteado: zero sessão viva em todas", async () => {
    const sobreviventes: number[] = [];
    for (let rodada = 0; rodada < 60; rodada += 1) {
      const h = await a.entrar();
      const atraso = Math.random() * 3.5;
      const [, enc] = await Promise.all([
        a.pedirRenovacao(h.renovacao),
        esperar(atraso).then(() => cen.app.inject({
          method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`,
          headers: { authorization: `Bearer ${cen.tokenRita}` },
        })),
      ]);
      expect(enc.statusCode, enc.body).toBe(200);
      if (await a.sessoesVivasDaCadeia(h) > 0) {
        sobreviventes.push(rodada);
        // Limpa para a rodada seguinte medir só ela.
        await cen.bruto(
          "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'limpeza do teste' WHERE usuario_id = $1 AND revogada_em IS NULL",
          [HELENA],
        );
      }
    }
    expect(sobreviventes, `rodadas com sessão viva depois do encerrar: ${sobreviventes.join(", ")}`).toEqual([]);
  }, 300_000);
});
