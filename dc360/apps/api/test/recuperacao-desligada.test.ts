import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";

/*
  O defeito que este arquivo tranca, confirmado contra a PRODUCAO em 08/09/2026.

  `RECUPERACAO_ATIVA=nao` ja estava definida no servidor de Florianopolis, e
  `POST /auth/recuperar` respondia 202 "enviamos um link de redefinicao".
  Nenhum email saia, porque nao ha provedor configurado. A variavel era
  validada na partida (`config.ts`) e NUNCA lida por rota nenhuma.

  Duas mentiras numa resposta so: promete um email que nao existe, e esconde do
  usuario o unico caminho que de fato funciona hoje, que e procurar quem
  administra o sistema no municipio.

  A rota de redefinir entra junto de proposito: um token aberto antes do
  desligamento continuaria trocando senha depois dele.
*/

async function servidor(recuperacao: "sim" | "nao") {
  const mem = await bancoEmMemoria({ semear: false });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    RECUPERACAO_ATIVA: recuperacao,
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  const app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
  return { app, fechar: async () => { await app.close(); await mem.banco.encerrar(); } };
}

describe("recuperacao de senha desligada", () => {
  it("recusa o pedido em vez de prometer um email que nao sai", async () => {
    const { app, fechar } = await servidor("nao");
    try {
      const r = await app.inject({
        method: "POST", url: "/auth/recuperar",
        payload: { email: "alguem@municipio.exemplo.gov.br" },
      });
      expect(r.statusCode).toBe(503);
      const corpo = r.json();
      expect(corpo.erro).toBe("recuperacao_desligada");
      // A mensagem precisa dizer o que fazer AGORA, e nao so que falhou.
      expect(corpo.mensagem).toMatch(/administra/i);
      // E nao pode, em hipotese nenhuma, afirmar que algo foi enviado.
      expect(corpo.mensagem).not.toMatch(/enviamos|caixa de entrada/i);
    } finally {
      await fechar();
    }
  }, 120_000);

  it("recusa tambem a redefinicao, para token aberto antes do desligamento", async () => {
    const { app, fechar } = await servidor("nao");
    try {
      const r = await app.inject({
        method: "POST", url: "/auth/redefinir",
        payload: { token: "token-que-existia-antes", senha: "uma-senha-bem-longa" },
      });
      expect(r.statusCode).toBe(503);
      expect(r.json().erro).toBe("recuperacao_desligada");
    } finally {
      await fechar();
    }
  }, 120_000);

  it("com a recuperacao ligada, a rota volta a responder 202 sem revelar se a conta existe", async () => {
    const { app, fechar } = await servidor("sim");
    try {
      const r = await app.inject({
        method: "POST", url: "/auth/recuperar",
        payload: { email: "ninguem@municipio.exemplo.gov.br" },
      });
      expect(r.statusCode).toBe(202);
    } finally {
      await fechar();
    }
  }, 120_000);
});
