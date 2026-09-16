import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O bloqueio por tentativas não denuncia quais emails existem.
 *
 * O DEFEITO: cinco senhas erradas num email CADASTRADO respondiam 429
 * `bloqueado`; cinco num email inexistente respondiam 401 `credenciais`,
 * cinco vezes. A diferença de status era um oráculo: bastava martelar uma
 * lista de emails e ler qual deles "bloqueou" para saber quem trabalha na
 * prefeitura, contornando a resposta genérica que a rota se dava ao trabalho
 * de manter.
 *
 * A REGRA: a resposta é 401 `credenciais`, sempre, exista a conta ou não,
 * esteja ela bloqueada ou não. O bloqueio continua existindo e continua
 * valendo (a senha CERTA é recusada durante o bloqueio), só que em silêncio.
 * Email inexistente também conta falhas, em memória com teto, para o tempo de
 * resposta e o comportamento serem os mesmos dos dois lados.
 */

const SENHA = "defesa-civil-2026";
const EXISTE = "jonas.ferreira@serraalta.exemplo.gov.br";
const NAO_EXISTE = "ninguem.com.esse.nome@serraalta.exemplo.gov.br";

let mem: BancoEmMemoria;
let app: FastifyInstance;

function entrar(email: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-enumeracao-pelo-bloqueio-32-bytes",
    LOGIN_POR_IP: "10000",
    MAX_FALHAS_LOGIN: "3",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Email cadastrado e email inexistente respondem igual", () => {
  it("do primeiro erro ao bloqueio, o par (status, erro) é o mesmo dos dois lados", async () => {
    const respostas: Array<[number, string]> = [];
    // Quatro: três erram e bloqueiam (MAX_FALHAS_LOGIN=3), a quarta já cai no bloqueio.
    for (let i = 0; i < 4; i++) {
      const a = await entrar(EXISTE, "senha-errada-de-proposito");
      const b = await entrar(NAO_EXISTE, "senha-errada-de-proposito");
      respostas.push([a.statusCode, a.json().erro], [b.statusCode, b.json().erro]);
      expect([a.statusCode, a.json().erro, a.json().mensagem], `tentativa ${i + 1}`)
        .toEqual([b.statusCode, b.json().erro, b.json().mensagem]);
    }
    // E nunca 429: o bloqueio existe, mas não se anuncia.
    for (const [status, erro] of respostas) {
      expect(status).toBe(401);
      expect(erro).toBe("credenciais");
    }
  }, 300_000);

  it("o bloqueio continua valendo: a senha certa é recusada em silêncio, e volta depois", async () => {
    const bloqueado = await mem.bruto.query<{ bloqueado_ate: string | null }>(
      "SELECT bloqueado_ate FROM usuarios WHERE email = $1", [EXISTE],
    );
    expect(bloqueado.rows[0]!.bloqueado_ate).not.toBeNull();

    const certa = await entrar(EXISTE, SENHA);
    expect(certa.statusCode).toBe(401);
    expect(certa.json().erro).toBe("credenciais");

    await mem.bruto.query(
      "UPDATE usuarios SET bloqueado_ate = NULL, falhas_login = 0 WHERE email = $1", [EXISTE],
    );
    expect((await entrar(EXISTE, SENHA)).statusCode).toBe(200);
  }, 300_000);
});
