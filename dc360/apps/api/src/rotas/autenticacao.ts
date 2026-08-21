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

/**
 * Minimo de 12 caracteres, maximo alto o bastante para nao atrapalhar
 * gerenciador de senha, e nenhuma exigencia de composicao: regra de simbolo e
 * numero so produz "Senha@123", que e pior e mais dificil de lembrar. Segue o
 * ASVS 4.0, secao 2.1.
 */
const senhaSchema = z.string()
  .min(12, "A senha precisa de pelo menos 12 caracteres")
  .max(200);

const recuperacaoSchema = z.object({
  email: z.string().email("Informe um email valido").max(320),
});

const redefinicaoSchema = z.object({
  token: z.string().min(1).max(200),
  senha: senhaSchema,
});

const trocaSchema = z.object({
  senhaAtual: z.string().min(1).max(200),
  senha: senhaSchema,
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

  /**
   * Responde 202 sempre, com a mesma mensagem, exista a conta ou nao. E o
   * unico jeito de a rota nao virar um verificador de quais emails estao
   * cadastrados na prefeitura.
   */
  app.post("/recuperar", limiteLogin, async (req, resposta) => {
    const { email } = recuperacaoSchema.parse(req.body);
    await autenticacao.pedirRecuperacao(email, { ip: req.ip });
    return resposta.code(202).send({
      mensagem:
        "Se existir conta com esse email, enviamos um link de redefinicao. " +
        "Confira sua caixa de entrada.",
    });
  });

  app.post("/redefinir", limiteLogin, async (req, resposta) => {
    const dados = redefinicaoSchema.parse(req.body);
    await autenticacao.redefinirSenha(dados.token, dados.senha);
    // Nenhum token de sessao volta daqui: quem redefiniu entra de novo, e
    // isso confirma que a senha nova funciona.
    return resposta.code(200).send({
      mensagem: "Senha redefinida. Entre com a nova senha.",
    });
  });

  app.post("/trocar-senha", async (req, resposta) => {
    const identidade = await app.exigirAutenticacao(req);
    const dados = trocaSchema.parse(req.body);
    await autenticacao.trocarSenha(identidade, dados.senhaAtual, dados.senha);
    return resposta.code(200).send({
      mensagem: "Senha trocada. As outras sessoes foram encerradas.",
    });
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
