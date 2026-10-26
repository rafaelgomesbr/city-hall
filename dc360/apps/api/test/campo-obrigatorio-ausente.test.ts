import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * CAMPO OBRIGATÓRIO AUSENTE FALA "Campo obrigatório", NUNCA "undefined"
 * (V2-F00-E19, correção 11, achado 1 da rodada 9, SHA dda7557).
 *
 * Com o Zod 4, um enum obrigatório que chega sem o campo reprova com o código
 * da própria regra (`invalid_value`), e o mapa de mensagens imprimia "Valor
 * não reconhecido: undefined. Os aceitos são: ...". Reproduzido num 422 real
 * de `POST /ocorrencias` sem `tipo` e sem `canalEntrada`. Este teste passa
 * pela API de verdade (a mesma rota, o mesmo tratador de erro), para provar
 * que a frase que chega ao aparelho é a certa.
 */

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
      JWT_SEGREDO: "segredo-do-campo-obrigatorio-com-mais-de-32-bytes",
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

describe("422 de enum obrigatório ausente", () => {
  it("POST /ocorrencias sem tipo e sem canalEntrada diz 'Campo obrigatório' nos dois", async () => {
    const r = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: { authorization: `Bearer ${tokenRita}` },
      payload: {
        solicitanteNome: "Marilda Souza Prado", endereco: "Rua das Acácias, 120",
        descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
      },
    });
    expect(r.statusCode, r.body).toBe(422);
    const campos = r.json().campos as Array<{ campo: string; mensagem: string }>;
    for (const nome of ["tipo", "canalEntrada"]) {
      const c = campos.find((x) => x.campo === nome);
      expect(c, `${nome} em ${r.body}`).toBeDefined();
      expect(c!.mensagem).toBe("Campo obrigatório");
    }
    // Nenhum identificador de JavaScript chega ao aparelho, em campo nenhum.
    expect(r.body).not.toMatch(/undefined|\bnull\b/i);
  });

  it("enum presente e fora da lista continua dizendo o valor e os aceitos", async () => {
    const r = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: { authorization: `Bearer ${tokenRita}` },
      payload: {
        solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone", tipo: "terremoto",
        endereco: "Rua das Acácias, 120",
        descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
      },
    });
    expect(r.statusCode, r.body).toBe(422);
    const c = (r.json().campos as Array<{ campo: string; mensagem: string }>).find((x) => x.campo === "tipo");
    expect(c?.mensagem).toMatch(/^Valor não reconhecido: "terremoto"\. Os aceitos são: /);
  });
});
