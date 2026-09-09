import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import type { ServicoAutenticacao } from "../auth/servico.js";
import { enderecoDoCliente } from "../rede.js";

const entradaSchema = z.object({
  email: z.string().email("Informe um email válido").max(320),
  senha: z.string().min(1, "Informe a senha").max(200),
});

const renovacaoSchema = z.object({
  renovacao: z.string().min(1).max(200),
});

/**
 * Sair leva a ficha do aparelho junto, quando existe.
 *
 * Opcional porque o painel web nao tem aparelho, e porque uma versao antiga do
 * aplicativo, ainda instalada em algum telefone, continua saindo sem mandar
 * nada. Obrigar quebraria as duas na mesma linha.
 */
const saidaSchema = renovacaoSchema.extend({
  ficha: z.string().min(1).max(4096).optional(),
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

/*
  A recuperacao desligada precisa RECUSAR, e essa era a metade que faltava.

  `RECUPERACAO_ATIVA` era validada na partida (`config.ts`) e nunca lida por
  rota nenhuma. O resultado, confirmado contra a producao em 08/09/2026 com a
  variavel ja em `nao`: a rota respondia 202 "enviamos um link de redefinicao"
  e nada saia. O comentario do proprio `config.ts` afirmava que "a rota recusa
  e manda procurar quem administra o municipio", e essa rota nunca existiu.

  503, e nao 404, porque o servico existe e esta indisponivel por decisao de
  quem implantou. A mensagem diz o que fazer agora, que e o unico caminho que
  de fato funciona hoje.

  `/redefinir` recusa junto: sem isso, um token aberto antes de a recuperacao
  ser desligada continuaria trocando senha depois do desligamento.
*/
const RESPOSTA_DESLIGADA = {
  erro: "recuperacao_desligada",
  mensagem:
    "A recuperacao de senha por email esta desligada neste municipio. "
    + "Procure quem administra o sistema na sua Defesa Civil para redefinir a sua senha.",
} as const;

export async function rotasAutenticacao(app: FastifyInstance, opcoes: Opcoes): Promise<void> {
  const { autenticacao } = opcoes;
  const recuperacaoDesligada = opcoes.config.RECUPERACAO_ATIVA === "nao";

  /**
   * Limite bem mais apertado que o global, e por endereço.
   *
   * Força bruta distribuída passa por aqui, e é por isso que o bloqueio por
   * conta (na migração 002) existe em paralelo: um trata o atacante que vem de
   * um lugar, o outro trata a conta específica sendo martelada de muitos.
   */
  const limiteLogin = {
    config: {
      rateLimit: {
        max: opcoes.config.LOGIN_POR_IP,
        timeWindow: "5 minutes",
        // Mesma chave do limitador global. Sem isto, este limite, que é o que
        // protege contra varredura de lista de senhas, era contornado trocando
        // o cabeçalho `X-Forwarded-For` a cada tentativa. Ver `rede.ts`.
        keyGenerator: (req: { headers: Record<string, unknown>; ip: string }) =>
          enderecoDoCliente(req as never),
      },
    },
  };

  app.post("/entrar", limiteLogin, async (req, resposta) => {
    const dados = entradaSchema.parse(req.body);
    const resultado = await autenticacao.entrar(dados, {
      userAgent: req.headers["user-agent"],
      ip: enderecoDoCliente(req),
    });
    return resposta.code(200).send(resultado);
  });

  app.post("/renovar", limiteLogin, async (req, resposta) => {
    const { renovacao } = renovacaoSchema.parse(req.body);
    const resultado = await autenticacao.renovar(renovacao, {
      userAgent: req.headers["user-agent"],
      ip: enderecoDoCliente(req),
    });
    return resposta.code(200).send(resultado);
  });

  /**
   * Sair responde 204 mesmo quando o token não existe.
   *
   * Dizer "esse token não estava ativo" transformaria a rota num oráculo para
   * testar tokens, e não ajudaria em nada quem legitimamente quer sair.
   *
   * Quando o aplicativo manda a ficha do aparelho, sair também CALA A
   * NOTIFICAÇÃO daquele telefone. Sem isso, o aparelho de quem saiu continuava
   * recebendo aviso de prazo de uma equipe da qual a pessoa não faz mais parte,
   * com município, ocorrência e endereço no dado da mensagem. Ver
   * `auth/servico.ts` para a ordem das duas revogações e para o caso que
   * continua descoberto.
   */
  app.post("/sair", async (req, resposta) => {
    const { renovacao, ficha } = saidaSchema.parse(req.body);
    await autenticacao.sair(renovacao, ficha);
    return resposta.code(204).send();
  });

  /**
   * Responde 202 sempre, com a mesma mensagem, exista a conta ou nao. E o
   * unico jeito de a rota nao virar um verificador de quais emails estao
   * cadastrados na prefeitura.
   */
  app.post("/recuperar", limiteLogin, async (req, resposta) => {
    const { email } = recuperacaoSchema.parse(req.body);
    if (recuperacaoDesligada) return resposta.code(503).send(RESPOSTA_DESLIGADA);
    await autenticacao.pedirRecuperacao(email, { ip: enderecoDoCliente(req) });
    return resposta.code(202).send({
      mensagem:
        "Se existir conta com esse email, enviamos um link de redefinicao. " +
        "Confira sua caixa de entrada.",
    });
  });

  app.post("/redefinir", limiteLogin, async (req, resposta) => {
    if (recuperacaoDesligada) return resposta.code(503).send(RESPOSTA_DESLIGADA);
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

  /**
   * "Encerrar todas as minhas sessoes", disponivel para qualquer papel.
   *
   * Nao pede senha atual de proposito, e a razao e a diferenca entre os dois
   * atos: trocar a senha CONCEDE acesso novo (por isso exige provar que a
   * pessoa e ela mesma), enquanto encerrar sessao so RETIRA acesso. Exigir
   * senha para retirar acesso e o tipo de atrito que faz o agente desistir de
   * usar o botao no momento em que ele mais importa, que e o minuto seguinte a
   * perder o celular na area de risco. O pior que uma sessao roubada consegue
   * fazer por aqui e expulsar o dono legitimo, e o dono legitimo entra de novo
   * com a senha, que o ladrao continua sem ter.
   *
   * A sessao de onde a pessoa clicou continua aberta. Ver `auth/servico.ts`.
   */
  app.post("/encerrar-sessoes", async (req, resposta) => {
    const identidade = await app.exigirAutenticacao(req);
    const encerradas = await autenticacao.encerrarMinhasSessoes(identidade);
    return resposta.code(200).send({
      sessoesEncerradas: encerradas,
      mensagem: encerradas === 0
        ? "Nenhuma outra sessao estava aberta. Esta continua."
        : `${encerradas} ${encerradas === 1 ? "sessao foi encerrada" : "sessoes foram encerradas"}`
          + " em outros navegadores e aparelhos. Esta continua aberta.",
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
