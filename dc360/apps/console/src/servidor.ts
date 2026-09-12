import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { Config } from "./config.js";
import type { LeituraDoConsole } from "./banco.js";
import { serieDoMunicipio, situacaoDosMunicipios } from "./consultas.js";
import {
  abrirCofre, conferirCodigo, conferirEntrada, lerRegistro, tetoEmMemoria,
  type Registro, type TetoDeTentativas,
} from "./operadores.js";
import { emitirDesafio, emitirSessao, verificarDesafio, verificarSessao } from "./tokens.js";
import { CSS_DO_CONSOLE, JS_DO_CONSOLE, PAGINA_DO_CONSOLE } from "./pagina.js";

/**
 * O console do fornecedor: processo próprio, sessão própria, plateia própria.
 *
 * O QUE ELE RESPONDE, e a lista é curta de propósito (decisão 2 da ADR 0008):
 * "entraram 41 chamados, 8 estão atrasados". O que ele NUNCA responde é "o que
 * houve na ocorrência 000123". Para essa pergunta existe telefone com o
 * administrador do município, e é assim que deve ser.
 *
 * O QUE O TORNA INCAPAZ DE RESPONDER A SEGUNDA não é este arquivo: é o papel de
 * banco com que ele se conecta, que não tem concessão em tabela de negócio
 * nenhuma. Se alguém escrever aqui uma consulta a `ocorrencias`, o banco
 * responde "permissão negada", e é essa a ordem certa das defesas. Este arquivo
 * é a interface; a parede é a migração 023 e o portão é
 * `db/test/isolamento.test.ts`.
 *
 * O QUE ELE NÃO TEM, e cada ausência é uma decisão:
 *
 *   - CORS. A página é servida por este mesmo processo, então não existe
 *     origem legítima diferente da própria. Sem plugin de CORS, chamada de
 *     outra origem não passa, e não há lista para alguém alargar por engano.
 *   - Rota de escrita. Nenhuma, em lugar nenhum. O console lê.
 *   - Renovação de sessão. Ver `tokens.ts`: não há onde guardar o hash de um
 *     token de renovação, porque o console não escreve no banco.
 */

export type DependenciasDoConsole = {
  config: Config;
  leitura: LeituraDoConsole;
  /** Injeção de relógio, para o teste conferir a janela do TOTP sem esperar. */
  agora?: () => Date;
  /**
   * Quantas tentativas de entrar o mesmo endereço faz em cinco minutos.
   *
   * Existe como parâmetro por uma razão de teste que vale a pena escrever: o
   * limite por endereço e o teto por conta são defesas DIFERENTES (um trata o
   * atacante que vem de um lugar, o outro trata a conta martelada de muitos), e
   * exercitar o segundo exige errar o código várias vezes seguidas. Com o
   * limite por endereço fixo, o teste do teto por conta esbarraria no limite por
   * endereço e passaria verde sem nunca ter chegado ao teto que ele diz medir.
   *
   * O padrão é o valor de produção, e é ele que roda quando ninguém passa nada.
   */
  limitePorEndereco?: number;
  /** Coletor de log, para o teste poder afirmar o que saiu. */
  destinoDeLog?: { write: (linha: string) => void };
};

declare module "fastify" {
  interface FastifyRequest {
    operador?: string;
  }
}

const ENTRADA = z.object({
  email: z.string().min(1).max(320),
  senha: z.string().min(1).max(1024),
});

const CODIGO = z.object({
  desafio: z.string().min(1).max(4096),
  /** Seis dígitos. O console não tem código de recuperação: ver `operadores.ts`. */
  codigo: z.string().min(1).max(32),
});

/**
 * A mesma resposta para email desconhecido e para senha errada.
 *
 * Sem isso a rota de entrar vira uma lista de quem trabalha no fornecedor, e
 * uma lista curta de emails de operador é o começo de qualquer tentativa
 * dirigida. O tempo também é equivalente: ver `conferirEntrada`.
 */
const RECUSA = { erro: "credenciais_invalidas", mensagem: "Email ou senha incorretos." };

/** Falta sessão, ou ela já não vale. Vira 401 no tratador de erro. */
class SemSessao extends Error {}

export async function construirConsole(
  dep: DependenciasDoConsole,
): Promise<FastifyInstance> {
  const { config, leitura } = dep;
  const agora = dep.agora ?? (() => new Date());

  const cofre = abrirCofre(config.CONSOLE_SEGUNDO_FATOR_CHAVE);
  const registro: Registro = lerRegistro(config.CONSOLE_OPERADORES, cofre);
  const teto: TetoDeTentativas = tetoEmMemoria();
  const segredo = new TextEncoder().encode(config.CONSOLE_JWT_SEGREDO);

  const app = Fastify({
    ...(dep.destinoDeLog
      ? { logger: { level: "info", stream: dep.destinoDeLog } }
      : { logger: { level: config.NODE_ENV === "production" ? "info" : "warn" } }),
    /*
      O corpo é minúsculo em toda rota deste servidor: email, senha e seis
      dígitos. Um teto baixo aqui evita que alguém ocupe a memória do processo
      mandando megabytes para uma rota que espera trinta bytes.
    */
    bodyLimit: 16 * 1024,
  });

  await app.register(helmet, {
    /*
      A página do console não executa nada de fora e não carrega nada de fora: o
      CSS e o JS saem deste mesmo processo, em rotas próprias, e é por isso que
      `script-src` e `style-src` são `'self'` e não `'unsafe-inline'`. Escrever o
      script dentro do HTML custaria abrir `unsafe-inline`, que é justamente a
      diretiva que faz a política de segurança de conteúdo deixar de valer.
    */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  /*
    Limite por endereço, e ele vale SÓ nas duas rotas que conferem credencial.

    O teto por conta vive em `operadores.ts` e trata a conta martelada de muitos
    lugares; este trata o atacante que vem de um lugar só. São problemas
    diferentes, e um não cobre o outro.

    `global: false` não é economia de zelo, é correção de um defeito que a
    primeira versão tinha e que só apareceu abrindo a página de verdade: com o
    limite global, abrir o console gasta três requisições (a casca, o estilo e o
    script), entrar gasta mais duas e ler os números gasta uma. Seis por visita,
    contra um teto de vinte em cinco minutos, e o operador que recarregasse a
    tela três vezes seguidas seria barrado do próprio console no meio de um
    plantão.

    O que sobra sem limite são rotas estáticas e rotas que já exigem sessão. O
    caminho que precisa de teto é justamente o que fica de fora dele: cada
    tentativa de entrar gasta uma derivação `scrypt` de cerca de 128 MB, então
    marteladas nessa rota derrubam o processo antes de descobrirem senha nenhuma.
  */
  await app.register(rateLimit, {
    global: false,
    allowList: () => false,
  });

  const LIMITE_DA_PORTA = {
    config: {
      rateLimit: { max: dep.limitePorEndereco ?? 20, timeWindow: "5 minutes" },
    },
  };

  /**
   * Um tratador só, e ele nunca devolve a mensagem crua do erro.
   *
   * Mensagem de erro de banco conta o nome da tabela e a coluna que faltou, e
   * num processo que fala com o banco de todos os municípios isso é desenho de
   * planta entregue de graça. O log recebe o detalhe; quem chamou recebe que
   * falhou.
   */
  app.setErrorHandler((erro, _req, resposta) => {
    if (erro instanceof SemSessao) {
      return resposta.code(401).send({ erro: "sem_sessao", mensagem: "Entre de novo." });
    }
    if ((erro as { statusCode?: number }).statusCode === 429) {
      return resposta.code(429).send({
        erro: "muitas_tentativas",
        mensagem: "Tentativas demais. Espere alguns minutos.",
      });
    }
    app.log.error(
      { erro: erro instanceof Error ? erro.message : String(erro) },
      "falha no console",
    );
    return resposta.code(500).send({ erro: "falha_interna" });
  });

  /* ======================================================================
     A porta, em duas etapas, e a primeira NUNCA entrega sessão
     ====================================================================== */

  /**
   * Confere a senha e devolve o DESAFIO, nunca a sessão.
   *
   * Não existe ramo neste arquivo em que a senha sozinha produza um token de
   * plateia `dc360-console`, e é isso que faz a decisão 4 da ADR 0008 valer.
   * Um console que emitisse a sessão e apenas "não deixasse a tela avançar"
   * teria uma etapa a mais e nenhuma proteção a mais: quem tem o token não
   * precisa da tela para nada.
   */
  app.post("/entrar", LIMITE_DA_PORTA, async (req, resposta) => {
    const corpo = ENTRADA.safeParse(req.body);
    if (!corpo.success) return resposta.code(400).send(RECUSA);

    const operador = await conferirEntrada(registro, corpo.data.email, corpo.data.senha);
    if (!operador) return resposta.code(401).send(RECUSA);

    return resposta.send({
      desafio: await emitirDesafio(segredo, operador.email),
      // A tela precisa saber o que pedir a seguir, e a resposta é sempre a
      // mesma: o console não tem operador sem segundo fator.
      falta: "codigo",
    });
  });

  /** A segunda etapa: os seis dígitos do aplicativo de autenticação. */
  app.post("/entrar/codigo", LIMITE_DA_PORTA, async (req, resposta) => {
    const corpo = CODIGO.safeParse(req.body);
    if (!corpo.success) return resposta.code(400).send(RECUSA);

    const desafio = await verificarDesafio(segredo, corpo.data.desafio);
    if (!desafio) {
      return resposta.code(401).send({
        erro: "desafio_invalido",
        mensagem: "A tentativa de entrada expirou. Comece de novo.",
      });
    }

    const operador = registro.buscar(desafio.email);
    if (!operador) return resposta.code(401).send(RECUSA);

    const desfecho = conferirCodigo(operador, corpo.data.codigo, cofre, teto, agora());
    if (desfecho === "bloqueado") {
      return resposta.code(429).send({
        erro: "bloqueado",
        mensagem: "Códigos errados demais. Espere quinze minutos.",
      });
    }
    if (desfecho !== "ok") {
      return resposta.code(401).send({
        erro: "codigo_invalido",
        mensagem: "Código incorreto ou já usado.",
      });
    }

    app.log.info({ operador: operador.email }, "operador entrou no console");
    return resposta.send({
      token: await emitirSessao(segredo, operador.email),
      operador: operador.email,
    });
  });

  /* ======================================================================
     O portão das rotas de leitura
     ====================================================================== */

  /**
   * Toda rota de número passa por aqui, e a lista de isenções é o próprio
   * `onRequest` das quatro rotas abertas (entrar, código, saúde e a casca da
   * página). Isso é deliberado: o padrão é fechado, e abrir exige escrever a
   * rota sem o gancho, o que aparece na revisão.
   */
  async function exigirOperador(req: FastifyRequest): Promise<string> {
    const cabecalho = req.headers.authorization ?? "";
    const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
    const sessao = token ? await verificarSessao(segredo, token) : null;
    if (!sessao) throw new SemSessao();
    /*
      A conta pode ter saído da configuração desde que o token foi emitido (o
      operador deixou o fornecedor, e alguém já reimplantou sem ele). O token
      continua com assinatura boa até expirar, e sem esta conferência ele
      continuaria valendo por até trinta minutos.
    */
    if (!registro.buscar(sessao.email)) throw new SemSessao();
    req.operador = sessao.email;
    return sessao.email;
  }

  /* ======================================================================
     Os números
     ====================================================================== */

  app.get("/municipios", async (req) => {
    await exigirOperador(req);
    return { municipios: await situacaoDosMunicipios(leitura) };
  });

  const SERIE = z.object({
    dias: z.coerce.number().int().min(1).max(180).default(30),
  });

  app.get<{ Params: { id: string }; Querystring: { dias?: string } }>(
    "/municipios/:id/serie",
    async (req, resposta) => {
      await exigirOperador(req);

      /*
        O identificador é conferido como UUID ANTES de chegar ao banco. Não é
        proteção contra injeção (o parâmetro do driver já é), é para o console
        não gastar uma ida ao banco por causa de um endereço digitado errado, e
        para a resposta de "isso não é um município" não depender de mensagem de
        erro do Postgres.
      */
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return resposta.code(404).send({ erro: "nao_encontrado" });

      const consulta = SERIE.safeParse(req.query);
      const dias = consulta.success ? consulta.data.dias : 30;

      return resposta.send({ serie: await serieDoMunicipio(leitura, id.data, dias) });
    },
  );

  /* ======================================================================
     A casca: saúde e a página
     ====================================================================== */

  /**
   * Sem autenticação, como o `/saude` da API, e pelo mesmo motivo: quem
   * pergunta é o balanceador, que não tem sessão. Ele responde apenas que o
   * processo está de pé, e nenhum número de município nenhum.
   */
  app.get("/saude", async () => ({ ok: true }));

  app.get("/", async (_req, resposta) =>
    resposta.type("text/html; charset=utf-8").send(PAGINA_DO_CONSOLE));

  app.get("/console.css", async (_req, resposta) =>
    resposta.type("text/css; charset=utf-8").send(CSS_DO_CONSOLE));

  app.get("/console.js", async (_req, resposta) =>
    resposta.type("text/javascript; charset=utf-8").send(JS_DO_CONSOLE));

  app.log.info({ operadores: registro.quantos() }, "console do fornecedor pronto");
  return app;
}
