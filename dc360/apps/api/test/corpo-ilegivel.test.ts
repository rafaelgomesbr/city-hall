import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O CORPO QUE O SERVIDOR NÃO CONSEGUE LER É ERRO DE QUEM PEDIU, NÃO 500
 * (V2-F00-E07, correção 3, achado 3 da validação de 52952a1).
 *
 * Corpo vazio com `content-type: application/json` em `POST
 * /usuarios/:id/encerrar-sessoes` respondia 500 `erro_interno`: o Fastify
 * marca o erro com status 400 (`FST_ERR_CTP_EMPTY_JSON_BODY`), e o tratador
 * único de erro de `servidor.ts` não o reconhecia. A pessoa lia "informe o
 * código ao suporte" por um pedido mal formado, e o log enchia de "erro não
 * tratado".
 */

const HELENA = "11111111-1111-4111-8111-0000000000d1";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenRita = "";

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-do-corpo-ilegivel-com-mais-de-32-bytes",
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email: EMAIL_RITA, senha: "defesa-civil-2026" },
  });
  tokenRita = r.json().acesso as string;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Corpo que não pode ser lido", () => {
  it("JSON vazio no encerrar sessões de outra pessoa responde 400 corpo_invalido, e não 500", async () => {
    const r = await app.inject({
      method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`,
      headers: { authorization: `Bearer ${tokenRita}`, "content-type": "application/json" },
      payload: "",
    });
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().erro).toBe("corpo_invalido");
    // A mensagem é nossa: nada de parser, de cabeçalho ou de código interno.
    expect(r.json().mensagem).not.toMatch(/FST_|content-type|parser/i);
  });

  it("JSON torto responde 400 corpo_invalido", async () => {
    const r = await app.inject({
      method: "POST", url: "/auth/entrar",
      headers: { "content-type": "application/json" },
      payload: "{\"email\": ",
    });
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().erro).toBe("corpo_invalido");
  });

  it("o corpo vazio legítimo continua aceito: sem content-type, a rota responde o que sempre respondeu", async () => {
    const r = await app.inject({
      method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`,
      headers: { authorization: `Bearer ${tokenRita}` },
    });
    expect(r.statusCode, r.body).toBe(200);
  });
});
