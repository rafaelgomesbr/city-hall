import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import type { Mensagem, Notificador } from "../src/auth/notificador.js";
import { derivarSenha } from "../src/auth/senha.js";
import { gerarTokenRenovacao, hashDoToken } from "../src/auth/tokens.js";

/**
 * O LINK DE RECUPERAÇÃO MORRE COM A CREDENCIAL (V2-F00-E10, correção 3,
 * migração 051).
 *
 * O DEFEITO (rodada 4 da validação, sobre bb0f654): só um pedido novo e o
 * próprio uso marcavam o link como gasto. A redefinição por quem administra,
 * a troca de senha pela própria pessoa e a desativação deixavam vivo o link
 * já enviado, e quem o tinha desfazia o remédio: trocava a senha por cima da
 * temporária, da senha nova da pessoa, ou da conta desativada (que passava a
 * valer na reativação). E `consumir_recuperacao` não conferia a conta ativa.
 *
 * Os links aqui saem pela rota de verdade (`POST /auth/recuperar`, com um
 * notificador que guarda a mensagem), salvo onde o caso precisa de um link
 * que o pedido não daria (dois ao mesmo tempo, ou numa conta já desativada):
 * esse é gravado direto no banco, como o pedido gravaria.
 */

const SENHA = "defesa-civil-2026";
const SENHA_DO_LINK = "senha-definida-pelo-link-do-email-2026";
const SENHA_DA_PESSOA = "senha-nova-da-propria-pessoa-2026";
const RITA_EMAIL = "rita.lopes@serraalta.exemplo.gov.br";

const PESSOAS = {
  helena: { id: "11111111-1111-4111-8111-0000000000d1", email: "helena.coutinho@serraalta.exemplo.gov.br" },
  jonas: { id: "11111111-1111-4111-8111-0000000000d2", email: "jonas.ferreira@serraalta.exemplo.gov.br" },
  diego: { id: "11111111-1111-4111-8111-0000000000d3", email: "diego.alves@serraalta.exemplo.gov.br" },
} as const;
type Apelido = keyof typeof PESSOAS;

let mem: BancoEmMemoria;
let app: FastifyInstance;
let enviadas: Mensagem[] = [];
let hashDaSemente = "";

const notificador: Notificador = {
  async enviar(m) {
    enviadas.push(m);
    return { idNoProvedor: null };
  },
};

const com = (t: string) => ({ authorization: `Bearer ${t}` });

function entrar(email: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

async function acessoDe(email: string, senha = SENHA): Promise<string> {
  const r = await entrar(email, senha);
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

function usarLink(token: string, senha = SENHA_DO_LINK) {
  return app.inject({ method: "POST", url: "/auth/redefinir", payload: { token, senha } });
}

/** Pede o link pela rota de verdade e devolve o token da mensagem enviada. */
async function pedirLink(quem: Apelido): Promise<string> {
  const antes = enviadas.length;
  const r = await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email: PESSOAS[quem].email } });
  expect(r.statusCode, r.body).toBe(202);
  const ate = Date.now() + 10_000;
  while (enviadas.length === antes && Date.now() < ate) await new Promise((ok) => setTimeout(ok, 20));
  const corpo = enviadas.at(-1)!.corpo;
  const link = corpo.match(/https?:\/\/\S+/)![0];
  return decodeURIComponent(new URL(link).searchParams.get("token")!);
}

/** Um link gravado direto, como `abrir_recuperacao` gravaria (sem invalidar os outros). */
async function linkDireto(quem: Apelido): Promise<string> {
  const token = gerarTokenRenovacao();
  await mem.bruto.query(
    `INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
     SELECT organizacao_id, id, $2, now() + interval '30 minutes' FROM usuarios WHERE id = $1`,
    [PESSOAS[quem].id, hashDoToken(token)],
  );
  return token;
}

async function hashDe(quem: Apelido): Promise<string> {
  const r = await mem.bruto.query<{ senha_hash: string }>("SELECT senha_hash FROM usuarios WHERE id = $1", [PESSOAS[quem].id]);
  return r.rows[0]!.senha_hash;
}

/** O link recusado como "não vale mais", e nada mudou por causa dele. */
async function exigirLinkMorto(token: string, quem: Apelido, hashEsperado: string): Promise<void> {
  const r = await usarLink(token);
  expect(r.statusCode, `o link pendente ainda redefiniu a senha: ${r.body}`).toBe(401);
  expect(r.json().erro).toBe("sessao_encerrada");
  expect(await hashDe(quem), "o link recusado mudou a senha").toBe(hashEsperado);
}

describe("O link de recuperação pendente morre com a credencial", () => {
  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: true });
    app = await construirServidor({
      banco: mem.banco,
      config: carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-do-link-que-morre-com-a-credencial-32b",
        LOGIN_POR_IP: "10000",
        URL_PAINEL: "https://painel.exemplo.gov.br",
        RECUPERACAO_MINUTOS: "30",
        RECUPERACAO_POR_EMAIL_HORA: "60",
      } as NodeJS.ProcessEnv),
      notificador,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    hashDaSemente = await derivarSenha(SENHA);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  beforeEach(async () => {
    enviadas = [];
    await mem.bruto.query(
      `UPDATE usuarios SET ativo = true, senha_provisoria_ate = NULL, senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL
        WHERE id = ANY($1::uuid[])`,
      [Object.values(PESSOAS).map((p) => p.id), hashDaSemente],
    );
    await mem.bruto.query("UPDATE recuperacoes_senha SET usada_em = now() WHERE usada_em IS NULL");
  });

  it("controle: sem nada no meio, o link redefine; a senha nova entra e a antiga não", async () => {
    const token = await pedirLink("helena");
    const r = await usarLink(token);
    expect(r.statusCode, r.body).toBe(200);
    expect((await entrar(PESSOAS.helena.email, SENHA_DO_LINK)).statusCode).toBe(200);
    expect((await entrar(PESSOAS.helena.email, SENHA)).statusCode).toBe(401);
  }, 120_000);

  it("quem administra redefine a senha: o link pendente não vale mais, e a temporária entra", async () => {
    const token = await pedirLink("helena");
    const red = await app.inject({
      method: "POST", url: `/usuarios/${PESSOAS.helena.id}/redefinir-senha`, headers: com(await acessoDe(RITA_EMAIL)),
    });
    expect(red.statusCode, red.body).toBe(200);
    const depoisDaRedefinicao = await hashDe("helena");
    await exigirLinkMorto(token, "helena", depoisDaRedefinicao);
    expect((await entrar(PESSOAS.helena.email, String(red.json().senhaTemporaria))).statusCode).toBe(200);
    expect((await entrar(PESSOAS.helena.email, SENHA_DO_LINK)).statusCode).toBe(401);
  }, 120_000);

  it("a própria pessoa troca a senha: o link pendente não vale mais, e a senha nova dela entra", async () => {
    const token = await pedirLink("diego");
    const troca = await app.inject({
      method: "POST", url: "/auth/trocar-senha", headers: com(await acessoDe(PESSOAS.diego.email)),
      payload: { senhaAtual: SENHA, senha: SENHA_DA_PESSOA },
    });
    expect(troca.statusCode, troca.body).toBe(200);
    await exigirLinkMorto(token, "diego", await hashDe("diego"));
    expect((await entrar(PESSOAS.diego.email, SENHA_DA_PESSOA)).statusCode).toBe(200);
  }, 120_000);

  it("quem administra desativa a conta: o link não vale mais, nem depois da reativação", async () => {
    const token = await pedirLink("jonas");
    const rita = await acessoDe(RITA_EMAIL);
    const desativa = await app.inject({
      method: "PATCH", url: `/usuarios/${PESSOAS.jonas.id}/situacao`, headers: com(rita), payload: { ativo: false },
    });
    expect(desativa.statusCode, desativa.body).toBe(200);
    await exigirLinkMorto(token, "jonas", hashDaSemente);
    const reativa = await app.inject({
      method: "PATCH", url: `/usuarios/${PESSOAS.jonas.id}/situacao`, headers: com(rita), payload: { ativo: true },
    });
    expect(reativa.statusCode, reativa.body).toBe(200);
    await exigirLinkMorto(token, "jonas", hashDaSemente);
    expect((await entrar(PESSOAS.jonas.email, SENHA)).statusCode, "a senha de antes não entra depois da reativação").toBe(200);
    expect((await entrar(PESSOAS.jonas.email, SENHA_DO_LINK)).statusCode).toBe(401);
  }, 120_000);

  it("link vivo numa conta desativada: recusado, gasto, e a senha não muda (consumir_recuperacao confere a conta)", async () => {
    await mem.bruto.query("UPDATE usuarios SET ativo = false WHERE id = $1", [PESSOAS.jonas.id]);
    // Um link que escapou da invalidação (gravado depois da desativação).
    const token = await linkDireto("jonas");
    await mem.bruto.query("UPDATE usuarios SET falhas_login = 3 WHERE id = $1", [PESSOAS.jonas.id]);
    await exigirLinkMorto(token, "jonas", hashDaSemente);
    const linha = await mem.bruto.query<{ falhas_login: number; usada_em: string | null }>(
      `SELECT u.falhas_login, r.usada_em FROM usuarios u JOIN recuperacoes_senha r ON r.usuario_id = u.id
        WHERE u.id = $1 AND r.token_hash = $2`,
      [PESSOAS.jonas.id, hashDoToken(token)],
    );
    expect(linha.rows[0]!.falhas_login, "o link recusado zerou o contador de falhas").toBe(3);
    expect(linha.rows[0]!.usada_em, "o link recusado ficou vivo para a reativação").not.toBeNull();
    await mem.bruto.query("UPDATE usuarios SET ativo = true WHERE id = $1", [PESSOAS.jonas.id]);
    await exigirLinkMorto(token, "jonas", hashDaSemente);
  }, 120_000);

  it("dois links pendentes: usar um mata o outro", async () => {
    const primeiro = await linkDireto("helena");
    const segundo = await linkDireto("helena");
    const r = await usarLink(primeiro);
    expect(r.statusCode, r.body).toBe(200);
    await exigirLinkMorto(segundo, "helena", await hashDe("helena"));
  }, 120_000);

  it("o que não é senha nem desativação não mata o link: falha de login, edição do cadastro e reativação", async () => {
    const token = await pedirLink("diego");
    expect((await entrar(PESSOAS.diego.email, "senha-errada-de-proposito")).statusCode).toBe(401);
    const rita = await acessoDe(RITA_EMAIL);
    const edita = await app.inject({
      method: "PATCH", url: `/usuarios/${PESSOAS.diego.id}`, headers: com(rita),
      payload: {
        nome: "Diego Nakamura Alves", matricula: "SA-3390", email: PESSOAS.diego.email,
        papel: "agente_campo", equipeId: "11111111-1111-4111-8111-0000000000e1",
      },
    });
    expect(edita.statusCode, edita.body).toBe(200);
    const reativa = await app.inject({
      method: "PATCH", url: `/usuarios/${PESSOAS.diego.id}/situacao`, headers: com(rita), payload: { ativo: true },
    });
    expect(reativa.statusCode, reativa.body).toBe(200);
    const r = await usarLink(token);
    expect(r.statusCode, `o link morreu por uma mudança que não é de senha: ${r.body}`).toBe(200);
    expect((await entrar(PESSOAS.diego.email, SENHA_DO_LINK)).statusCode).toBe(200);
  }, 120_000);
});
