import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor, type Dependencias } from "../src/servidor.js";
import type { UltimaRodada } from "../src/push/varredor.js";

/**
 * O SERVIDOR CONTA O QUE O PUSH FEZ, E O DESPACHO ACORDA O VARREDOR.
 *
 * `/saude` é a única janela que o operador tem sem abrir o banco. Até aqui
 * ela dizia `ok` com o push em cem por cento de recusa, porque o varredor não
 * contava nada a ninguém. Agora ela carrega os contadores da última rodada
 * desta máquina, ou `null` quando o push está desligado, que é a diferença
 * entre "não está mandando" e "não existe".
 *
 * E o despacho, que enfileira o aviso na mesma transação (migração 042),
 * passa a chamar `despertar()` DEPOIS do commit: chamar antes acordaria uma
 * rodada que não enxerga a linha ainda, e ela voltaria a esperar o relógio.
 */

let mem: BancoEmMemoria;
let orgId = "";
let token = "";
let contador = 0;

const SENHA = "senha-de-teste-bem-longa";

const PUSH_DE_MENTIRA = {
  rodadaEm: "2026-09-15T12:00:00.000Z",
  reivindicadas: 3, entregues: 2, falhas: 1, revogados: 0,
} satisfies UltimaRodada;

async function subir(push?: Dependencias["push"]): Promise<FastifyInstance> {
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  const app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    ...(push ? { push } : {}),
  });
  await app.ready();
  return app;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const { derivarSenha } = await import("../src/auth/senha.js");
  const hash = await derivarSenha(SENHA);
  const org = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  orgId = org.rows[0]!.id;
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
    [orgId, hash],
  );
  await mem.bruto.query(
    "INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo) VALUES ($1,$2,1)",
    [orgId, new Date().getFullYear()],
  );
}, 180_000);

afterAll(async () => {
  await mem?.banco.encerrar();
});

const cabecalho = () => ({ authorization: `Bearer ${token}` });

async function entrar(app: FastifyInstance): Promise<void> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar",
    payload: { email: "helena@serraalta.exemplo.gov.br", senha: SENHA },
  });
  expect(r.statusCode).toBe(200);
  token = r.json().acesso;
}

async function abrirETriar(app: FastifyInstance): Promise<string> {
  contador += 1;
  const aberta = await app.inject({
    method: "POST", url: "/ocorrencias", headers: cabecalho(),
    payload: {
      solicitanteNome: "Marilda Nogueira", canalEntrada: "telefone",
      endereco: `Servidão Boa Esperança, ${100 + contador}`, tipo: "deslizamento",
      descricao: "Talude cedeu atrás da casa depois da chuva.",
    },
  });
  expect(aberta.statusCode).toBe(201);
  const id = aberta.json().id as string;
  const triagem = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: cabecalho(),
    payload: { severidade: "media", vulnerabilidadePresente: false },
  });
  expect(triagem.statusCode).toBe(200);
  return id;
}

async function criarEquipe(app: FastifyInstance): Promise<string> {
  contador += 1;
  const r = await app.inject({
    method: "POST", url: "/equipes", headers: cabecalho(),
    payload: { nome: `Equipe ${contador}` },
  });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}

/** Um agente da equipe com aparelho registrado: é para ele que o aviso sai. */
async function equipeComAparelho(app: FastifyInstance): Promise<string> {
  const equipe = await criarEquipe(app);
  contador += 1;
  const u = await mem.bruto.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
     VALUES ($1, $2, $3, $4, 'agente_campo', $5) RETURNING id`,
    [orgId, `Agente ${contador}`, `SA-${contador}`,
     `agente${contador}@serraalta.exemplo.gov.br`, equipe],
  );
  await mem.bruto.query(
    `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
     VALUES ($1, $2, 'ios', $3)`,
    [orgId, u.rows[0]!.id, `ficha-${contador}`],
  );
  return equipe;
}

describe("GET /saude e o push", () => {
  it("com o push desligado, `push` é nulo", async () => {
    const app = await subir();
    try {
      const r = await app.inject({ method: "GET", url: "/saude" });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toHaveProperty("push", null);
    } finally {
      await app.close();
    }
  });

  it("com o push ligado, `push` traz os contadores da última rodada desta máquina", async () => {
    const app = await subir({ despertar: () => {}, ultimaRodada: () => PUSH_DE_MENTIRA });
    try {
      const r = await app.inject({ method: "GET", url: "/saude" });
      expect(r.statusCode).toBe(200);
      expect(r.json().push).toEqual(PUSH_DE_MENTIRA);
    } finally {
      await app.close();
    }
  });

  it("ligado e ainda sem rodada concluída, `push` diz isso em vez de mentir com zeros", async () => {
    const app = await subir({ despertar: () => {}, ultimaRodada: () => null });
    try {
      const r = await app.inject({ method: "GET", url: "/saude" });
      expect(r.json().push).toEqual({
        rodadaEm: null, reivindicadas: 0, entregues: 0, falhas: 0, revogados: 0,
      });
    } finally {
      await app.close();
    }
  });
});

describe("o despacho acorda o varredor", () => {
  let despertares = 0;
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await subir({ despertar: () => { despertares += 1; }, ultimaRodada: () => null });
    await entrar(app);
  }, 60_000);

  afterAll(async () => { await app?.close(); });

  beforeEach(() => { despertares = 0; });

  it("despacho gravado chama despertar() uma vez, depois de responder", async () => {
    const ocorrencia = await abrirETriar(app);
    const equipe = await equipeComAparelho(app);

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrencia}/despacho`, headers: cabecalho(),
      payload: { equipeId: equipe, prazoHoras: 6 },
    });
    expect(r.statusCode).toBe(200);
    expect(despertares, "o despacho não acordou o varredor: o push espera o relógio").toBe(1);
  });

  it("equipe sem aparelho registrado não acorda ninguém: não há linha enfileirada para enviar", async () => {
    const ocorrencia = await abrirETriar(app);
    const equipe = await criarEquipe(app);
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrencia}/despacho`, headers: cabecalho(),
      payload: { equipeId: equipe, prazoHoras: 6 },
    });
    expect(r.statusCode).toBe(200);
    expect(despertares).toBe(0);
  });

  it("despacho recusado (equipe inexistente) não acorda ninguém", async () => {
    const ocorrencia = await abrirETriar(app);
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrencia}/despacho`, headers: cabecalho(),
      payload: { equipeId: "00000000-0000-4000-8000-000000000000", prazoHoras: 6 },
    });
    expect(r.statusCode).toBe(404);
    expect(despertares).toBe(0);
  });

  it("sem push ligado, o despacho segue igual e não estoura", async () => {
    const semPush = await subir();
    try {
      await entrar(semPush);
      const ocorrencia = await abrirETriar(semPush);
      const equipe = await equipeComAparelho(semPush);
      const r = await semPush.inject({
        method: "POST", url: `/ocorrencias/${ocorrencia}/despacho`, headers: cabecalho(),
        payload: { equipeId: equipe, prazoHoras: 6 },
      });
      expect(r.statusCode).toBe(200);
    } finally {
      await semPush.close();
      await entrar(app);
    }
  });
});
