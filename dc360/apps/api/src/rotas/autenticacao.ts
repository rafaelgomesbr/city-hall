import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import type { ServicoAutenticacao } from "../auth/servico.js";

const entradaSchema = z.object({
  email: z.string().email("Informe um email válido").max(320),
  senha: z.string().min(1, "Informe a senha").max(200),
});

const renovacaoSchema = z.object({
  renovacao: z.string().min(1).max(200),
});

type Opcoes = { autenticacao: ServicoAutenticacao; config: Config };

export async function rotasAutenticacao(app: FastifyInstance, opcoes: Opcoes): Promise<void> {
  const { autenticacao } = opcoes;

  /**
   * Limite bem mais apertado que o global, e por endereço.
   *
   * Força bruta distribuída passa por aqui, e é por isso que o bloqueio por
   * conta (na migração 002) existe em paralelo: um trata o atacante que vem de
   * um lugar, o outro trata a conta específica sendo martelada de muitos.
   */
  const limiteLogin = {
    config: {
      rateLimit: { max: opcoes.config.LOGIN_POR_IP, timeWindow: "5 minutes" },
    },
  };

  app.post("/entrar", limiteLogin, async (req, resposta) => {
    const dados = entradaSchema.parse(req.body);
    const resultado = await autenticacao.entrar(dados, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    return resposta.code(200).send(resultado);
  });

  app.post("/renovar", limiteLogin, async (req, resposta) => {
    const { renovacao } = renovacaoSchema.parse(req.body);
    const resultado = await autenticacao.renovar(renovacao, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    return resposta.code(200).send(resultado);
  });

  /**
   * Sair responde 204 mesmo quando o token não existe.
   *
   * Dizer "esse token não estava ativo" transformaria a rota num oráculo para
   * testar tokens, e não ajudaria em nada quem legitimamente quer sair.
   */
  app.post("/sair", async (req, resposta) => {
    const { renovacao } = renovacaoSchema.parse(req.body);
    await autenticacao.sair(renovacao);
    return resposta.code(204).send();
  });

  app.get("/eu", async (req) => {
    const identidade = await app.exigirAutenticacao(req);
    return {
      id: identidade.usuarioId,
      nome: identidade.nome,
      papel: identidade.papel,
      organizacaoId: identidade.organizacaoId,
    };
  });
}
