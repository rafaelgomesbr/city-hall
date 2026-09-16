import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * A triagem não devolve uma ocorrência que está em campo.
 *
 * A máquina de estados tem UMA aresta para trás, `em_campo -> triagem`, e ela
 * existe para a devolução de tarefa: o agente subiu o morro, não conseguiu
 * vistoriar e devolve a decisão para a coordenação, com motivo de lista
 * fechada, limpando a equipe e gravando `devolucao_de_tarefa` na trilha.
 *
 * O que o revisor provou: a rota de triagem usava a tabela inteira de
 * transições, então `POST /ocorrencias/:id/triagem` numa ocorrência `em_campo`
 * passava. O status voltava para `triagem` SEM limpar `equipe_id` e SEM
 * registrar devolução. Do lado do aparelho, a tarefa sumia da fila e a rota de
 * saídas caía no desfecho de fallback: o agente lia "devolvida", sobre uma
 * tarefa que ninguém devolveu.
 *
 * A triagem só parte de `registrada` (classificar) e de `triagem`
 * (reclassificar). A aresta para trás é exclusiva da devolução.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenCoordenador: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function registrar(endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    },
  });
  if (criar.statusCode !== 201) throw new Error(`registro falhou: ${criar.body}`);
  return criar.json().id;
}

function triar(id: string, severidade: "critica" | "alta" = "critica") {
  return app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: { severidade, vulnerabilidadePresente: false },
  });
}

async function despachar(id: string): Promise<void> {
  const r = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  if (r.statusCode !== 200) throw new Error(`despacho falhou: ${r.body}`);
}

async function detalhe(id: string) {
  const r = await app.inject({
    method: "GET", url: `/ocorrencias/${id}`, headers: com(tokenCoordenador),
  });
  return r.json();
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-triagem-nao-devolve-com-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("De onde a triagem parte", () => {
  it("classifica a registrada", async () => {
    const id = await registrar("Rua da Triagem, 1");
    const r = await triar(id);
    expect(r.statusCode, r.body).toBe(200);
    expect((await detalhe(id)).ocorrencia.status).toBe("triagem");
  });

  it("reclassifica a que já está em triagem", async () => {
    const id = await registrar("Rua da Triagem, 2");
    expect((await triar(id, "alta")).statusCode).toBe(200);
    const r = await triar(id, "critica");
    expect(r.statusCode, r.body).toBe(200);
    expect((await detalhe(id)).ocorrencia.severidade).toBe("critica");
  });

  it("NÃO devolve a que está em campo: a aresta para trás é da devolução", async () => {
    const id = await registrar("Rua da Triagem, 3");
    expect((await triar(id)).statusCode).toBe(200);
    await despachar(id);

    const r = await triar(id, "alta");
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("transicao_invalida");

    // Nada mudou: continua em campo, com a equipe, sem evento de triagem novo.
    const d = await detalhe(id);
    expect(d.ocorrencia.status).toBe("em_campo");
    expect(d.ocorrencia.equipe_id).toBe(EQUIPE_ALFA);
    expect(d.trilha.filter((e: { tipo: string }) => e.tipo === "triagem")).toHaveLength(1);
  });
});
