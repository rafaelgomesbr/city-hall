import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { SemPermissao, exigirPermissao, type Acao } from "@dc360/shared";
import type { ZodError } from "zod";
import type { Config } from "./config.js";
import type { Banco } from "./banco/tipos.js";
import { verificarAcesso } from "./auth/tokens.js";
import { servicoDeAutenticacao, FalhaAutenticacao } from "./auth/servico.js";
import { rotasAutenticacao } from "./rotas/autenticacao.js";
import { rotasOcorrencias } from "./rotas/ocorrencias.js";
import { rotasAdministracao } from "./rotas/administracao.js";
import { rotasSincronizacao } from "./rotas/sincronizacao.js";

export type Identidade = {
  usuarioId: string;
  organizacaoId: string;
  papel: import("@dc360/shared").Papel;
  nome: string;
  sessaoId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    identidade?: Identidade;
  }
  interface FastifyInstance {
    exigirAutenticacao: (req: FastifyRequest) => Promise<Identidade>;
  }
}

export type Dependencias = { banco: Banco; config: Config };

export async function construirServidor({ banco, config }: Dependencias): Promise<FastifyInstance> {
  const app = Fastify({
    // O id de requisição aparece em todo log e na resposta de erro 500. É o
    // que permite alguém dizer "deu erro às 14h32" e a equipe achar a linha.
    genReqId: () => crypto.randomUUID(),
    logger: config.NODE_ENV === "test"
      ? false
      : {
          level: config.NODE_ENV === "production" ? "info" : "debug",
          redact: {
            // Senha, token e cookie nunca vão para o log. Log é lido por mais
            // gente e guardado por mais tempo do que qualquer um imagina.
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              'req.body.senha',
              'req.body.renovacao',
            ],
            censor: "[removido]",
          },
        },
    trustProxy: config.NODE_ENV === "production",
    bodyLimit: 1_048_576,
  });

  await app.register(helmet, {
    // A API não serve HTML, então a política mais restritiva possível serve.
    contentSecurityPolicy: { directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  await app.register(cors, {
    origin: config.origens,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // Limite global por endereço. O login tem o seu, bem mais apertado, na
    // própria rota: força bruta se combate onde ela acontece.
    keyGenerator: (req) => req.ip,
  });

  const autenticacao = servicoDeAutenticacao(banco, config);

  /**
   * Extrai e verifica o token de acesso. A organização usada no `SET LOCAL`
   * sai daqui, do token assinado, e de nenhum outro lugar: nunca de cabeçalho,
   * nunca de parâmetro de rota, nunca do corpo da requisição.
   */
  app.decorate("exigirAutenticacao", async (req: FastifyRequest): Promise<Identidade> => {
    const cabecalho = req.headers.authorization;
    if (!cabecalho?.startsWith("Bearer ")) {
      throw new NaoAutenticado("Informe o token de acesso.");
    }
    const conteudo = await verificarAcesso(config.jwtSegredo, cabecalho.slice(7));
    if (!conteudo) {
      throw new NaoAutenticado("Token inválido ou expirado.");
    }
    const identidade: Identidade = {
      usuarioId: conteudo.sub,
      organizacaoId: conteudo.org,
      papel: conteudo.papel,
      nome: conteudo.nome,
      sessaoId: conteudo.sid,
    };
    req.identidade = identidade;
    return identidade;
  });

  app.setNotFoundHandler((req, resposta) => {
    void resposta.code(404).send({ erro: "nao_encontrado", mensagem: "Rota não encontrada." });
  });

  /**
   * Um único lugar traduz erro em resposta.
   *
   * A regra que vale para todos: o cliente recebe o que ele precisa para agir,
   * e nada sobre a estrutura interna. Erro inesperado vira 500 com o id da
   * requisição, e o detalhe fica no log do servidor. Mensagem de exceção de
   * banco costuma conter nome de tabela, de coluna e de restrição, que é
   * exatamente o mapa que um atacante quer.
   */
  app.setErrorHandler((erro, req, resposta) => {
    if (erro instanceof NaoAutenticado) {
      return resposta.code(401).send({ erro: "nao_autenticado", mensagem: erro.message });
    }
    if (erro instanceof SemPermissao) {
      return resposta.code(403).send({ erro: "sem_permissao", mensagem: erro.message });
    }
    if (erro instanceof FalhaAutenticacao) {
      const status = erro.codigo === "bloqueado" ? 429 : 401;
      return resposta.code(status).send({ erro: erro.codigo, mensagem: erro.message });
    }
    if (erro instanceof RegraDeNegocio) {
      return resposta.code(erro.status).send({ erro: erro.codigo, mensagem: erro.message });
    }
    // `instanceof` falharia quando o schema vem de outra cópia do zod (o
    // pacote compartilhado tem a sua). A checagem é por forma, que é o que
    // realmente identifica o erro atravessando fronteira de pacote.
    if (ehErroDeValidacao(erro)) {
      return resposta.code(422).send({
        erro: "dados_invalidos",
        mensagem: "Alguns campos precisam ser corrigidos.",
        campos: erro.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
      });
    }
    if ((erro as { statusCode?: number }).statusCode === 429) {
      return resposta.code(429).send({
        erro: "excesso_de_requisicoes",
        mensagem: "Requisições demais. Aguarde um instante.",
      });
    }

    req.log.error({ err: erro }, "erro nao tratado");
    return resposta.code(500).send({
      erro: "erro_interno",
      mensagem: "Erro inesperado. Informe o código abaixo ao suporte.",
      requisicao: req.id,
    });
  });

  app.get("/saude", async () => ({ status: "ok" }));

  await app.register(rotasAutenticacao, { prefix: "/auth", autenticacao, config });
  await app.register(rotasOcorrencias, { prefix: "/ocorrencias", banco });
  await app.register(rotasAdministracao, { prefix: "/", banco });
  await app.register(rotasSincronizacao, { prefix: "/sincronizacao", banco });

  return app;
}

/** Identifica um ZodError mesmo vindo de outra instalação do zod. */
function ehErroDeValidacao(erro: unknown): erro is ZodError {
  return (
    typeof erro === "object" && erro !== null &&
    (erro as { name?: string }).name === "ZodError" &&
    Array.isArray((erro as { issues?: unknown }).issues)
  );
}

export class NaoAutenticado extends Error {}

/** Erro previsto de domínio: o cliente pode entender e corrigir. */
export class RegraDeNegocio extends Error {
  readonly codigo: string;
  readonly status: number;
  constructor(codigo: string, mensagem: string, status = 409) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

/** Açúcar para as rotas: autentica e confere a permissão de uma vez. */
export async function autorizar(
  app: FastifyInstance,
  req: FastifyRequest,
  acao: Acao,
): Promise<Identidade> {
  const identidade = await app.exigirAutenticacao(req);
  exigirPermissao(identidade.papel, acao);
  return identidade;
}
