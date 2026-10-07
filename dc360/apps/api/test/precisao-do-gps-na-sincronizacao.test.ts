import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * A resposta do servidor à precisão de GPS corrigida no aparelho (V2-F00-E15,
 * CMP-33).
 *
 * O aplicativo arredondava 0,3 m para 0, o esquema exige positivo, e o melhor
 * GPS do plantão era o único que recebia 422. O conserto é do aparelho (piso
 * de 1 metro); o servidor NÃO afrouxou. Aqui se prova, pela rota de verdade,
 * as duas metades: o 1 que o aparelho passou a mandar é aceito, e o 0 de um
 * aplicativo antigo continua recusado, com a frase em português e o campo
 * nomeado, que é o que o cartão da fila lê para oferecer "corrigir".
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const INGLES = /\b(must|required|expected|received|invalid|number|greater)\b/i;

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAgente: string;
let tokenCoordenador: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function ocorrenciaDespachada(endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Moradora de exemplo", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Barranco cedeu nos fundos da casa depois da chuva.",
    },
  });
  const { id } = criar.json();
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  return id;
}

function enviar(ocorrenciaId: string, gpsPrecisaoMetros: number | null) {
  const coletadaEm = new Date().toISOString();
  return app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: false },
          { chave: "interdicao_indicada", resposta: false },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [], gpsPrecisaoMetros,
        assinanteNome: "Moradora de exemplo", assinaturaChave: null,
        coletadaEm,
      },
    },
  });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-precisao-do-gps-com-32-bytes",
    LOGIN_POR_IP: "10000",
    MARCA_DAGUA: "",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("a precisão de GPS que chega do aparelho", () => {
  it("o piso de 1 metro (leitura de 0,3 m) é aceito: 201, sem 422", async () => {
    const id = await ocorrenciaDespachada("Rua da Precisão, 1");
    const r = await enviar(id, 1);
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().vistoriaId).toBeTruthy();
  });

  it("precisão não informada (nulo) continua aceita", async () => {
    const id = await ocorrenciaDespachada("Rua da Precisão, 2");
    const r = await enviar(id, null);
    expect(r.statusCode, r.body).toBe(201);
  });

  it("o 0 de aplicativo antigo continua recusado, com o campo nomeado e a frase em português", async () => {
    const id = await ocorrenciaDespachada("Rua da Precisão, 3");
    const r = await enviar(id, 0);
    expect(r.statusCode, r.body).toBe(422);
    const corpo = r.json() as { erro: string; campos: { campo: string; mensagem: string }[] };
    expect(corpo.erro).toBe("dados_invalidos");
    expect(corpo.campos).toEqual([
      { campo: "vistoria.gpsPrecisaoMetros", mensagem: "Precisa ser maior que 0" },
    ]);
    expect(JSON.stringify(corpo)).not.toMatch(INGLES);
  });
});
