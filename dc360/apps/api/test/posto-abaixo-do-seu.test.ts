import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O coordenador administra quem está ABAIXO dele, e o email de terceiro é
 * coisa do administrador.
 *
 * A ADR 0006 diz "administra equipes e usuários abaixo dele" e que o
 * administrador "é o único que administra outro administrador". O código dizia
 * `>=`: um coordenador criava outro coordenador, rebaixava o colega, o
 * desativava, redefinia a senha dele e derrubava as sessões dele. Cada uma
 * dessas é a rota de tomada de conta entre pares, e a regra que a ADR escreveu
 * para impedir isso entre administradores não valia um degrau abaixo.
 *
 * E o EMAIL: ele é a identidade de login, e trocar o email de outra conta é o
 * primeiro passo do sequestro (trocar, pedir recuperação, entrar, devolver).
 * Passa a ser ato do administrador, mesmo sobre conta de posto inferior.
 *
 * Tudo conferido pelo servidor, com 403 `posto_insuficiente` (é conta do
 * próprio município, só não é alcançável por esse posto; 404 é para outro
 * município).
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001";
const JONAS_OPERADOR = "11111111-1111-4111-8111-0000000000d2";
const DIEGO_AGENTE = "11111111-1111-4111-8111-0000000000d3";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenHelena: string;
let tokenRita: string;
let carmemId: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function cadastro(id: string): Promise<{ nome: string; matricula: string; email: string; papel: string; equipe_id: string | null }> {
  const r = await mem.bruto.query<{ nome: string; matricula: string; email: string; papel: string; equipe_id: string | null }>(
    "SELECT nome, matricula, email, papel, equipe_id FROM usuarios WHERE id = $1", [id],
  );
  return r.rows[0]!;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-posto-abaixo-do-seu-32-bytes!!!",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  // Uma segunda coordenadora, para o par de coordenadores existir.
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1, 'Carmem Boaventura', 'SA-7001', 'carmem@serraalta.exemplo.gov.br', 'coordenador',
             (SELECT senha_hash FROM usuarios WHERE id = $2))
     RETURNING id`,
    [ORG_A, JONAS_OPERADOR],
  );
  carmemId = r.rows[0]!.id;

  tokenHelena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenRita = await entrar("rita.lopes@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Coordenador sobre coordenador: 403 em toda porta", () => {
  it("não cria outro coordenador", async () => {
    const r = await app.inject({
      method: "POST", url: "/usuarios", headers: com(tokenHelena),
      payload: {
        nome: "Novo Coordenador", matricula: "SA-7002", email: "novo.coord@serraalta.exemplo.gov.br",
        papel: "coordenador", senha: "senha-bem-comprida-2026",
      },
    });
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("posto_insuficiente");
    const existe = await mem.bruto.query("SELECT 1 FROM usuarios WHERE email = 'novo.coord@serraalta.exemplo.gov.br'");
    expect(existe.rows).toHaveLength(0);
  });

  it("não desativa, não edita, não redefine a senha nem derruba as sessões de outro coordenador", async () => {
    const antes = await cadastro(carmemId);

    const situacao = await app.inject({
      method: "PATCH", url: `/usuarios/${carmemId}/situacao`, headers: com(tokenHelena),
      payload: { ativo: false },
    });
    expect(situacao.statusCode, situacao.body).toBe(403);
    expect(situacao.json().erro).toBe("posto_insuficiente");

    const edicao = await app.inject({
      method: "PATCH", url: `/usuarios/${carmemId}`, headers: com(tokenHelena),
      payload: { nome: antes.nome, matricula: antes.matricula, email: antes.email, papel: "operador" },
    });
    expect(edicao.statusCode, edicao.body).toBe(403);
    expect(edicao.json().erro).toBe("posto_insuficiente");

    const senha = await app.inject({
      method: "POST", url: `/usuarios/${carmemId}/redefinir-senha`, headers: com(tokenHelena),
    });
    expect(senha.statusCode, senha.body).toBe(403);
    expect(senha.body).not.toContain("senhaTemporaria");

    const sessoes = await app.inject({
      method: "POST", url: `/usuarios/${carmemId}/encerrar-sessoes`, headers: com(tokenHelena),
    });
    expect(sessoes.statusCode, sessoes.body).toBe(403);

    // Nada mudou, e Carmem continua entrando.
    expect(await cadastro(carmemId)).toEqual(antes);
    const ativo = await mem.bruto.query<{ ativo: boolean }>("SELECT ativo FROM usuarios WHERE id = $1", [carmemId]);
    expect(ativo.rows[0]!.ativo).toBe(true);
    await entrar("carmem@serraalta.exemplo.gov.br");
  });

  it("continua administrando operador e agente, que estão abaixo dele", async () => {
    const jonas = await cadastro(JONAS_OPERADOR);
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${JONAS_OPERADOR}`, headers: com(tokenHelena),
      payload: { nome: "Jonas Ferreira Filho", matricula: jonas.matricula, email: jonas.email, papel: "operador" },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect((await cadastro(JONAS_OPERADOR)).nome).toBe("Jonas Ferreira Filho");

    const desativa = await app.inject({
      method: "PATCH", url: `/usuarios/${DIEGO_AGENTE}/situacao`, headers: com(tokenHelena),
      payload: { ativo: false },
    });
    expect(desativa.statusCode, desativa.body).toBe(200);
    await app.inject({
      method: "PATCH", url: `/usuarios/${DIEGO_AGENTE}/situacao`, headers: com(tokenHelena),
      payload: { ativo: true },
    });
  });

  it("o administrador administra outro administrador, e o próprio posto", async () => {
    const r = await app.inject({
      method: "POST", url: "/usuarios", headers: com(tokenRita),
      payload: {
        nome: "Segunda Administradora", matricula: "SA-7003", email: "segunda.adm@serraalta.exemplo.gov.br",
        papel: "administrador", senha: "senha-bem-comprida-2026",
      },
    });
    expect(r.statusCode, r.body).toBe(201);
  });
});

describe("Trocar o email de terceiro é ato do administrador", () => {
  it("o coordenador não troca o email de um operador, mesmo estando acima dele", async () => {
    const jonas = await cadastro(JONAS_OPERADOR);
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${JONAS_OPERADOR}`, headers: com(tokenHelena),
      payload: {
        nome: jonas.nome, matricula: jonas.matricula,
        email: "jonas.outro@serraalta.exemplo.gov.br", papel: "operador",
      },
    });
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("email_so_por_administrador");
    expect((await cadastro(JONAS_OPERADOR)).email).toBe(jonas.email);
  });

  it("o mesmo email, com outra caixa, não conta como troca", async () => {
    const jonas = await cadastro(JONAS_OPERADOR);
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${JONAS_OPERADOR}`, headers: com(tokenHelena),
      payload: {
        nome: jonas.nome, matricula: jonas.matricula,
        email: jonas.email.toUpperCase(), papel: "operador",
      },
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("o administrador troca, e a trilha guarda de qual email para qual", async () => {
    const jonas = await cadastro(JONAS_OPERADOR);
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${JONAS_OPERADOR}`, headers: com(tokenRita),
      payload: {
        nome: jonas.nome, matricula: jonas.matricula,
        email: "jonas.novo@serraalta.exemplo.gov.br", papel: "operador",
      },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect((await cadastro(JONAS_OPERADOR)).email).toBe("jonas.novo@serraalta.exemplo.gov.br");
    const trilha = await mem.bruto.query<{ antes: { email: string }; depois: { email: string } }>(
      `SELECT antes, depois FROM trilha_administrativa
        WHERE alvo_id = $1 AND acao = 'usuario_editado' ORDER BY registrado_em DESC LIMIT 1`,
      [JONAS_OPERADOR],
    );
    expect(trilha.rows[0]!.antes.email).toBe(jonas.email);
    expect(trilha.rows[0]!.depois.email).toBe("jonas.novo@serraalta.exemplo.gov.br");
  });
});
