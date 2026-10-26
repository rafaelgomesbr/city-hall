import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { conferirManifesto } from "../src/auth/manifesto.js";
import { NaoAutenticado, construirServidor } from "../src/servidor.js";

/*
  O módulo é trocado por um espião que, por padrão, deixa passar, como o de
  verdade: o que se prova é que `criarAutenticacaoDaRequisicao` o chama.
*/
vi.mock("../src/auth/manifesto.js", () => ({
  conferirManifesto: vi.fn(async () => undefined),
}));

/**
 * O ponto de extensão do manifesto (V2-F03, abertura da API, parte 1C).
 *
 * `conferirManifesto(req, identidade)` é chamada em TODA requisição
 * AUTENTICADA, em `/v1` e no espelho, na leitura e na escrita, e só nelas. Hoje
 * ela deixa passar sempre (nenhum caso de comportamento muda); a V2-F03-E12
 * escreve a regra sem tocar na autenticação. Sem este teste, um ponto de
 * extensão que ninguém chama passaria por pronto.
 *
 * O que fica travado:
 *   - chamada em leitura e em escrita, em `/v1` e no espelho, com a identidade
 *     do token verificado;
 *   - não é chamada sem token, com token inválido, nem em rota pública;
 *   - quem a chama respeita o que ela decide: se recusar, a rota não roda.
 */

const SENHA = "defesa-civil-2026";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const HELENA = "11111111-1111-4111-8111-0000000000d1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let token: string;
let organizacaoDaHelena: string;

const espiao = vi.mocked(conferirManifesto);
const com = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-do-manifesto-com-mais-de-32-bytes-de-tamanho",
      LOGIN_POR_IP: "10000",
      ORIGENS_PERMITIDAS: "http://localhost:4691",
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
  const r = await app.inject({
    method: "POST",
    url: "/auth/entrar",
    payload: { email: EMAIL_HELENA, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  token = r.json().acesso as string;
  organizacaoDaHelena = r.json().usuario.organizacaoId as string;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

beforeEach(() => {
  espiao.mockClear();
  espiao.mockImplementation(async () => undefined);
});

describe("Chamada em toda requisição autenticada", () => {
  it("leitura em /v1: chamada uma vez, com a identidade do token", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias?status=ativas",
      headers: com(token),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(espiao).toHaveBeenCalledTimes(1);
    const [req, identidade] = espiao.mock.calls[0]!;
    expect(req.url).toBe("/v1/ocorrencias?status=ativas");
    expect(identidade).toMatchObject({
      usuarioId: HELENA,
      organizacaoId: organizacaoDaHelena,
      papel: "coordenador",
    });
    expect(identidade.sessaoId).toBeTruthy();
  });

  it("leitura no espelho legado: também chamada", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/ocorrencias?status=ativas",
      headers: com(token),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(espiao.mock.calls[0]![1].usuarioId).toBe(HELENA);
  });

  it("escrita em /v1: chamada, e a escrita acontece", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/ocorrencias",
      headers: com(token),
      payload: {
        solicitanteNome: "Marilda Souza Prado",
        canalEntrada: "telefone",
        endereco: "Rua das Acácias, 245",
        tipo: "deslizamento",
        descricao: "Talude cedeu depois da chuva da madrugada.",
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(espiao.mock.calls[0]![0].method).toBe("POST");
  });

  it("a identidade que a rota enxerga é a mesma que o manifesto recebeu", async () => {
    // `req.identidade` só é posto DEPOIS do manifesto: se ele recusar, a rota não roda.
    let identidadeNoManifesto: unknown;
    espiao.mockImplementationOnce(async (req, identidade) => {
      identidadeNoManifesto = identidade;
      expect(req.identidade).toBeUndefined();
    });
    const r = await app.inject({ method: "GET", url: "/v1/auth/eu", headers: com(token) });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().id).toBe((identidadeNoManifesto as { usuarioId: string }).usuarioId);
  });
});

describe("Não é chamada fora de requisição autenticada", () => {
  it("sem token: 401 e o manifesto nem é consultado", async () => {
    const r = await app.inject({ method: "GET", url: "/v1/ocorrencias" });
    expect(r.statusCode).toBe(401);
    expect(espiao).not.toHaveBeenCalled();
  });

  it("token inválido: 401 e o manifesto nem é consultado", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com("nao.e.token"),
    });
    expect(r.statusCode).toBe(401);
    expect(espiao).not.toHaveBeenCalled();
  });

  it("rota pública: o manifesto não é consultado", async () => {
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.statusCode).toBe(200);
    expect(espiao).not.toHaveBeenCalled();
  });
});

describe("Quem chama respeita o que o manifesto decide", () => {
  it("se o manifesto recusar, a rota não roda e a resposta é a da recusa", async () => {
    espiao.mockRejectedValueOnce(new NaoAutenticado("Recusado pelo manifesto."));
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias?status=ativas",
      headers: com(token),
    });
    expect(r.statusCode).toBe(401);
    expect(r.json().mensagem).toBe("Recusado pelo manifesto.");
    expect(espiao).toHaveBeenCalledTimes(1);
  });

  it("o isolamento entre municípios não depende dele: o token de outro município segue 404", async () => {
    // Prova de que ligar o ponto não mexeu no caminho do isolamento: o recurso
    // de A, pedido por quem é de B, continua inexistente (nunca 403).
    const b = await app.inject({
      method: "POST",
      url: "/auth/entrar",
      payload: { email: "aurelio.machado@valefundo.exemplo.gov.br", senha: SENHA },
    });
    expect(b.statusCode, b.body).toBe(200);
    const alheio = await app.inject({
      method: "GET",
      url: `/v1/ocorrencias/${OC_ALFA_1}`,
      headers: com(b.json().acesso as string),
    });
    expect(alheio.statusCode, alheio.body).toBe(404);
  });
});
