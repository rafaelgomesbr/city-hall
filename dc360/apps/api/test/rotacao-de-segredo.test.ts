import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * Rotação do segredo de sessão sem derrubar o plantão.
 *
 * O defeito que este arquivo tranca: com um segredo só, trocar `JWT_SEGREDO`
 * invalida TODA sessão aberta no instante em que o processo reinicia. Numa
 * Defesa Civil isso significa derrubar todo agente em campo no meio de um
 * temporal, então na prática ninguém troca, e um segredo que nunca gira é um
 * segredo que só precisa vazar uma vez.
 *
 * O comportamento correto tem duas metades OPOSTAS, e as duas estão aqui:
 *
 *   1. Rotação programada: o segredo novo entra na frente, o antigo fica atrás
 *      por uma janela, e ninguém é derrubado.
 *   2. Revogação por vazamento: o segredo sai da lista na hora, e aí derrubar
 *      todo mundo é o comportamento certo, não um efeito colateral.
 *
 * Um teste que só cobrisse a primeira metade autorizaria alguém a "deixar o
 * antigo por segurança", que é exatamente o contrário de rotacionar.
 */

const SENHA = "defesa-civil-2026";
const COORDENADORA = "helena.coutinho@serraalta.exemplo.gov.br";

const SEGREDO_VELHO = "segredo-velho-de-rotacao-com-mais-de-32-bytes";
const SEGREDO_NOVO = "segredo-novo-de-rotacao-com-mais-de-32-bytes-x";

let mem: BancoEmMemoria;

/** Um servidor com a lista de segredos que o teste quiser, sobre o mesmo banco. */
async function servidorCom(jwtSegredo: string): Promise<FastifyInstance> {
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: jwtSegredo,
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  const app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
  return app;
}

async function entrar(app: FastifyInstance): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email: COORDENADORA, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

const com = (t: string) => ({ authorization: `Bearer ${t}` });

/** Uma rota qualquer que exige token verificado. Serve de tornassol. */
async function abrirComToken(app: FastifyInstance, token: string): Promise<number> {
  const r = await app.inject({ method: "GET", url: "/ocorrencias", headers: com(token) });
  return r.statusCode;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
}, 180_000);

afterAll(async () => {
  await mem?.banco.encerrar();
});

describe("Rotação programada: o segredo gira e ninguém cai", () => {
  it("o token emitido antes da troca continua valendo com o antigo na lista", async () => {
    const antes = await servidorCom(SEGREDO_VELHO);
    const tokenDoPlantao = await entrar(antes);
    expect(await abrirComToken(antes, tokenDoPlantao)).toBe(200);
    await antes.close();

    // O ato de rotacionar: o novo entra NA FRENTE, o velho fica atrás.
    const depois = await servidorCom(`${SEGREDO_NOVO},${SEGREDO_VELHO}`);
    try {
      // Esta é a linha que reprova sem a lista de segredos: o agente que estava
      // no barranco com o aplicativo aberto continua dentro.
      expect(await abrirComToken(depois, tokenDoPlantao)).toBe(200);
    } finally {
      await depois.close();
    }
  }, 60_000);

  it("assina sempre com o PRIMEIRO, e não com um qualquer da lista", async () => {
    const depois = await servidorCom(`${SEGREDO_NOVO},${SEGREDO_VELHO}`);
    const tokenNovo = await entrar(depois);
    await depois.close();

    /*
      Fim da rotação: o velho sai da lista. Se a assinatura tivesse saído do
      segredo errado, o token emitido durante a convivência morreria aqui, e o
      efeito seria perverso: quem entrou DEPOIS de rotacionar seria derrubado
      pelo passo que existe justamente para não derrubar ninguém.
    */
    const soONovo = await servidorCom(SEGREDO_NOVO);
    try {
      expect(await abrirComToken(soONovo, tokenNovo)).toBe(200);
    } finally {
      await soONovo.close();
    }
  }, 60_000);
});

describe("Revogação por vazamento: o segredo sai e todo mundo cai", () => {
  it("tirar o segredo da lista invalida na hora o token assinado com ele", async () => {
    const antes = await servidorCom(SEGREDO_VELHO);
    const tokenAssinadoComOVazado = await entrar(antes);
    await antes.close();

    /*
      O caso oposto do de cima, e o motivo de os dois estarem no mesmo arquivo:
      enquanto o segredo vazado estiver na lista, quem o tem fabrica token de
      administrador de qualquer município, com a organização que quiser dentro.
      Esperar a janela de conveniência aqui é dar essa hora ao invasor.
    */
    const depoisDoVazamento = await servidorCom(SEGREDO_NOVO);
    try {
      expect(await abrirComToken(depoisDoVazamento, tokenAssinadoComOVazado)).toBe(401);
    } finally {
      await depoisDoVazamento.close();
    }
  }, 60_000);
});

describe("O algoritmo é escolha do servidor, nunca do token", () => {
  it("recusa token com algoritmo trocado, mesmo assinado com um segredo da lista", async () => {
    const app = await servidorCom(`${SEGREDO_NOVO},${SEGREDO_VELHO}`);
    try {
      /*
        A falha clássica de JWT é aceitar o `alg` que o token pede. Com a lista
        de segredos o risco aumenta, porque agora há mais de uma chave em jogo,
        e a tentação de "tentar de todo jeito com todas" é maior.
      */
      const forjado = await new SignJWT({
        org: "11111111-1111-4111-8111-000000000001",
        papel: "administrador",
        nome: "Invasor",
        sid: "11111111-1111-4111-8111-0000000000f1",
      })
        .setProtectedHeader({ alg: "HS512", typ: "JWT" })
        .setSubject("11111111-1111-4111-8111-0000000000d1")
        .setIssuer("dc360-api")
        .setAudience("dc360")
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(new TextEncoder().encode(SEGREDO_NOVO));

      expect(await abrirComToken(app, forjado)).toBe(401);
    } finally {
      await app.close();
    }
  }, 60_000);
});

describe("A lista é conferida na partida, e não quando o token chega", () => {
  const base = { NODE_ENV: "test" } as NodeJS.ProcessEnv;

  it("recusa item curto, mesmo que a linha inteira passe dos 32 bytes", () => {
    /*
      Este é o erro que passava silencioso: `JWT_SEGREDO` conferia o tamanho da
      LINHA. Com lista, uma linha de 60 bytes pode ter um item de 4, e o item
      curto continua abrindo sessão, então é ele que o ataque escolhe.
    */
    expect(() => carregarConfig({
      ...base, JWT_SEGREDO: `${SEGREDO_NOVO},curto`,
    })).toThrow(/menos de 32 caracteres/);
  });

  it("recusa segredo repetido, que é rotação de mentira", () => {
    expect(() => carregarConfig({
      ...base, JWT_SEGREDO: `${SEGREDO_NOVO},${SEGREDO_NOVO}`,
    })).toThrow(/repetido/);
  });

  it("recusa lista que só cresce", () => {
    const quatro = [1, 2, 3, 4].map((n) => `segredo-de-rotacao-numero-${n}-com-mais-de-32-bytes`);
    expect(() => carregarConfig({ ...base, JWT_SEGREDO: quatro.join(",") }))
      .toThrow(/teto é 3/);
  });

  it("um segredo só continua sendo uma lista de um, e nada muda para quem não rotaciona", () => {
    const c = carregarConfig({ ...base, JWT_SEGREDO: SEGREDO_NOVO });
    expect(c.jwtSegredos).toHaveLength(1);
    expect(new TextDecoder().decode(c.jwtSegredos[0])).toBe(SEGREDO_NOVO);
  });
});
