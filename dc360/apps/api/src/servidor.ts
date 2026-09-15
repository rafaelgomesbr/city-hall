import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { PostoInsuficiente, SemPermissao, exigirPermissao, type Acao } from "@dc360/shared";
import type { ZodError } from "zod";
import type { Config } from "./config.js";
import type { Banco } from "./banco/tipos.js";
import { verificarAcesso } from "./auth/tokens.js";
import { servicoDeAutenticacao, FalhaAutenticacao } from "./auth/servico.js";
import { servicoDeSegundoFator } from "./auth/segundo-fator.js";
import { notificadorDeLog, type Notificador } from "./auth/notificador.js";
import { rotasAutenticacao } from "./rotas/autenticacao.js";
import { rotasOcorrencias } from "./rotas/ocorrencias.js";
import { rotasAdministracao } from "./rotas/administracao.js";
import { rotasSincronizacao } from "./rotas/sincronizacao.js";
import { rotasCampo } from "./rotas/campo.js";
import { rotasSaidaACampo } from "./rotas/saida-a-campo.js";
import { rotasAparelhos } from "./rotas/aparelhos.js";
import { rotasAvisos } from "./rotas/avisos.js";
import { rotasOrgaos } from "./rotas/orgaos.js";
import { rotasOficios, rotasOficioPublico } from "./rotas/oficios.js";
import { rotasInteresse } from "./rotas/interesse.js";
import { rotasEvidencias } from "./rotas/evidencias.js";
import { rotasArmazenamento } from "./rotas/armazenamento.js";
import { rotasDocumentos } from "./rotas/documentos.js";
import { rotasPrestacaoDeContas } from "./rotas/prestacao-de-contas.js";
import { rotasSaida } from "./rotas/saida.js";
import { rotasSegundoFator } from "./rotas/segundo-fator.js";
import { rotasArmazenamentoLocal } from "./rotas/armazenamento-local.js";
import { rotasConfiguracao } from "./rotas/configuracao.js";
import type { Armazenamento } from "./armazenamento/tipos.js";
import type { ArmazenamentoEmMemoria } from "./armazenamento/memoria.js";
import type { GeradorDePdf } from "./documentos/pdf.js";
import { chaveDoLimitador, declararProxyDeBorda, enderecoDoCliente } from "./rede.js";

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

export type Dependencias = {
  banco: Banco;
  config: Config;
  armazenamento: Armazenamento;
  /** Por onde sai o link de redefinicao de senha. */
  notificador?: Notificador;
  /** Ausente quando o servidor sobe sem navegador para renderizar PDF. */
  pdf?: GeradorDePdf;
  /**
   * Para onde o log vai. Só o teste passa isto, e passa um coletor em memória
   * para poder AFIRMAR o que saiu: a lista de `redact` é a defesa contra vazar
   * dado pessoal, e defesa que ninguém exercita não é defesa.
   */
  destinoDeLog?: { write: (linha: string) => void };
};

/**
 * O que nunca vai para o log, e é a lista que `test/log.test.ts` confere.
 *
 * Vive fora da função, e exportada, por um motivo prático: a única forma de um
 * teste cobrar um caminho desta lista sem depender de qual serializador está
 * em vigor é lendo a lista. O serializador de `req` logo abaixo NÃO registra o
 * corpo do pedido, então as entradas `req.body.*` não disparam hoje: elas são
 * defesa em profundidade para o dia em que alguém registrar `req.body` num
 * ponto de diagnóstico, e esse dia é justamente o dia em que ninguém vai abrir
 * este arquivo para conferir se a lista está completa.
 */
/**
 * Prefixos de rota cujo PRÓXIMO segmento de caminho é um segredo vivo.
 *
 * Vive fora da função, exportado, pelo mesmo motivo de `CAMINHOS_REDIGIDOS`: é
 * o único jeito de um teste cobrar a lista item a item.
 *
 * O DEFEITO QUE ISTO FECHA foi reproduzido em produção. O serializador de `req`
 * abaixo redige a QUERY STRING, porque foi para isso que ele foi escrito, e o
 * `GET /publico/oficio/<token>` grava `"url":"/publico/oficio/TOKEN-..."` no
 * log de requisição: o segredo de 32 bytes viaja no CAMINHO, e a rota é
 * `/oficio/:token`.
 *
 * O que está em jogo é o produto inteiro daquela rota. Ela é a única leitura
 * sem autenticação que devolve dado de município, e o que a protege não é
 * token de sessão: é um segredo que só existe dentro do email enviado ao órgão
 * destinatário. Com ele no log, quem lê o log abre o dossiê da família (nome,
 * contato, endereço, vulnerabilidade) ANTES do destinatário, e o link de uso
 * único queima: o bombeiro que abrir depois recebe a página de "já foi
 * aberto", e a providência para de andar sem ninguém entender por quê.
 */
export const PREFIXOS_COM_SEGREDO_NA_URL = [
  "/publico/oficio/",
] as const;

/**
 * O caminho como ele pode ir para o log: sem query string e sem segredo.
 *
 * Separada e exportada porque o teste precisa cobrar o CAMINHO, e o teste que
 * existia (`test/log.test.ts`) conferia corpo, cabeçalho e query string, e
 * passava verde sem cobrir a única rota do produto que carrega segredo na URL.
 */
export function caminhoParaLog(url: string): string {
  const caminho = url.split("?")[0] ?? "";
  for (const prefixo of PREFIXOS_COM_SEGREDO_NA_URL) {
    // `startsWith` e não igualdade: o que vem depois do prefixo é o segredo, e
    // é justamente o que não pode sobrar na string.
    if (caminho.startsWith(prefixo)) return `${prefixo}[removido]`;
  }
  return caminho;
}

export const CAMINHOS_REDIGIDOS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.senha",
  "req.body.senhaAtual",
  "req.body.novaSenha",
  "req.body.renovacao",
  "req.body.token",
  /*
    O segundo fator, e as três entradas dele são segredo de classes
    diferentes:

    `codigo` é o número de seis dígitos (ou o código de recuperação, que
    entra pelo mesmo campo e vale uma vez só, mas vale de verdade);
    `desafio` é o token que atesta que a senha já conferiu, e quem o tem
    precisa só do código para virar sessão; `segredo` é a semente do TOTP,
    que não chega em pedido nenhum hoje, e está aqui porque no dia em que
    alguém logar `req.body` num ponto de diagnóstico, esse dia vai ser
    justamente o dia em que ninguém confere esta lista.

    O segredo do TOTP fora do banco é o segundo fator inteiro: quem o tem
    gera os códigos para sempre, sem tocar no telefone de ninguém.
  */
  "req.body.codigo",
  "req.body.desafio",
  "req.body.segredo",
] as const;

export async function construirServidor(
  { banco, config, armazenamento, notificador = notificadorDeLog(), pdf, destinoDeLog }: Dependencias,
): Promise<FastifyInstance> {
  /*
    O logger fica LIGADO em teste, com destino silencioso por padrão.

    Antes ele era `false` quando `NODE_ENV === "test"`, e a consequência é
    que a configuração de `redact` abaixo, que é a defesa do produto contra
    vazar dado pessoal em log, nunca era executada por teste nenhum. Uma
    lista de proteção que ninguém exercita é uma lista que mente.

    `destinoDeLog` permite ao teste passar um coletor em memória e afirmar o
    que saiu; sem ele, o log de teste vai para lugar nenhum e não polui a
    saída da suíte.
  */
  const opcoesDeLog: FastifyServerOptions["logger"] = {
    level: config.NODE_ENV === "test"
      ? "debug"
      : config.NODE_ENV === "production" ? "info" : "debug",
    ...(config.NODE_ENV === "test" && !destinoDeLog
      ? { stream: { write: () => {} } }
      : {}),
    ...(destinoDeLog ? { stream: destinoDeLog } : {}),
    redact: {
      // A lista mora fora desta função, em `CAMINHOS_REDIGIDOS`, para o teste
      // conseguir cobrá-la item a item. A barra de endereço NÃO se resolve
      // aqui: ver o serializador de `req` logo abaixo.
      paths: [...CAMINHOS_REDIGIDOS],
      censor: "[removido]",
    },
    serializers: {
      /*
        O erro do `pg` carrega, em `detail`, o VALOR que violou a restrição.
        Uma violação de unicidade de email registra o email do servidor
        municipal; uma de outra tabela pode registrar o contato do
        solicitante. `where` e `internalQuery` carregam trecho de SQL com
        parâmetro embutido.

        Nada disso ajuda a diagnosticar: o nome da restrição e o código já
        dizem o que quebrou. O que eles fazem é transformar todo erro de
        banco num registro permanente de dado pessoal, num produto vendido
        como auditável.
      */
      /*
        A barra de endereço é a parte do pedido que mais vaza sozinha: entra em
        log de proxy, em histórico de navegador e no cabeçalho `referer` de
        qualquer link que a página abrir depois. E ela carrega dado pessoal
        aqui: `GET /duplicidades/consulta?endereco=` leva o ENDEREÇO do imóvel
        de uma família em situação de risco.

        Redigir `req.query` não resolvia, e isso só apareceu porque a correção
        foi quebrada de propósito para ver o teste reprovar, e ele não
        reprovou: o serializador padrão do Fastify não registra `query`,
        registra `url`, que já vem com a query string colada nela.
      */
      req: (req) => ({
        method: req.method,
        // `caminhoParaLog` e não `split("?")`: a query string não era o único
        // lugar do produto onde um segredo vivo viaja na URL. Ver
        // `PREFIXOS_COM_SEGREDO_NA_URL`.
        url: caminhoParaLog(req.url),
        ...(req.url.includes("?") ? { query: "[removido]" } : {}),
        host: req.host,
        remoteAddress: enderecoDoCliente(req),
      }),
      err: (erro) => {
        const bruto = erro as unknown as Record<string, unknown>;
        const manter = (chave: string) =>
          typeof bruto[chave] === "string" || typeof bruto[chave] === "number"
            ? { [chave]: bruto[chave] }
            : {};
        return {
          type: erro.name,
          message: erro.message,
          stack: erro.stack ?? "",
          ...manter("code"),
          ...manter("constraint"),
          ...manter("table"),
          ...manter("statusCode"),
        };
      },
    },
  };

  const app = Fastify({
    // O id de requisição aparece em todo log e na resposta de erro 500. É o
    // que permite alguém dizer "deu erro às 14h32" e a equipe achar a linha.
    genReqId: () => crypto.randomUUID(),
    logger: opcoesDeLog,
    // `1` salto, e não a cadeia inteira: confiar em tudo faz o Fastify aceitar como
    // origem a primeira entrada de `X-Forwarded-For`, que é escrita pelo
    // cliente. `0` fora de produção é o mesmo que não confiar em nenhum.
    // Ver `rede.ts` para o defeito que isso causava.
    trustProxy: config.NODE_ENV === "production"
      // `hop === 0` confia SÓ em quem abriu a conexão, que em produção é o
      // proxy do Fly. Assim `req.ip` passa a ser a última entrada de
      // `X-Forwarded-For` (a que o edge acrescenta) em vez da primeira (a
      // que o cliente escreve). O tipo do Fastify instalado não aceita o
      // atalho numérico, então a contagem de saltos vai como função.
      ? (_endereco: string, hop: number) => hop === 0
      : false,
    // Um megabyte cobre qualquer payload de negócio. O upload de foto NÃO
    // passa por aqui: ele vai direto para o armazenamento, com URL assinada.
    // A exceção é a rota do armazenamento local, que ajusta o próprio limite.
    bodyLimit: 1_048_576,
  });

  /*
    De quem este processo aceita cabeçalho de endereço de origem, declarado
    ANTES de qualquer rota subir: é este valor que decide se `Fly-Client-IP`
    vale alguma coisa. Ver `rede.ts` para o defeito que a leitura incondicional
    daquele cabeçalho reabria.
  */
  declararProxyDeBorda(app, config.PROXY_DE_BORDA);

  await app.register(helmet, {
    // A API não serve HTML, então a política mais restritiva possível serve.
    contentSecurityPolicy: { directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  /*
    `no-store` em TODA resposta, por hook global.

    A API não serve nada cacheável de propósito: fora `/saude`, toda resposta
    carrega dado de município (nome, endereço, contato e vulnerabilidade de
    família em risco, o laudo inteiro em HTML). O caso concreto é o computador
    compartilhado da recepção: sem isto, o botão "voltar" do navegador reabre a
    ocorrência da família anterior a partir do cache de disco.

    Global, e não rota a rota, de propósito: foi marcando caso a caso que as
    colunas novas escaparam da validação de saída. Assim, rota nova nasce
    protegida. A foto de vistoria em produção vem do armazenamento externo e
    não passa por aqui; no caminho local de desenvolvimento, deixar de cachear
    a foto por 60s é o lado seguro da troca.
  */
  app.addHook("onSend", async (_req, resposta) => {
    resposta.header("cache-control", "no-store");
  });

  await app.register(cors, {
    origin: config.origens,
    credentials: true,
    // PUT entra por causa do envio de evidência: o navegador manda os bytes
    // direto para o armazenamento, e sem PUT liberado o preflight falha e o
    // upload nem sai. Em produção o armazenamento é externo e tem o próprio
    // CORS, mas no caminho local quem serve é esta API.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    // O envio assinado repete os cabeçalhos que entraram na assinatura.
    allowedHeaders: ["content-type", "authorization", "accept"],
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    /*
      Balde por usuário quando há token verificado, por endereço quando não há.

      Era só por endereço, e por endereço a Defesa Civil inteira, que sai por um
      NAT só, dividia um balde: numa noite de chuva o quinto agente a sincronizar
      levava 429 por causa do tráfego dos colegas. Ver `chaveDoLimitador` em
      `rede.ts` para por que a chave sai do token JÁ VERIFICADO e por que o teto
      por endereço continua existindo.

      O login tem o seu próprio limite, bem mais apertado e sempre por endereço,
      na rota dele: força bruta se combate onde ela acontece, e lá não existe
      token para chavear.
    */
    keyGenerator: (req) => chaveDoLimitador(req, config.jwtSegredos),
  });

  /*
    O segundo fator sobe antes da autenticação porque ela depende dele: a rota
    de entrar passou a ter dois desfechos, e quem decide qual é este serviço.

    Com `SEGUNDO_FATOR_ATIVO=nao`, que é o padrão, ele existe e RECUSA, em vez
    de sumir: rota ausente responde 404, e o painel leria isso como "versão
    velha do servidor" em vez de "o município ainda não ligou". É a mesma
    escolha do push e do envio de email.
  */
  const segundoFator = servicoDeSegundoFator(banco, config);
  const autenticacao = servicoDeAutenticacao(banco, config, notificador, segundoFator);

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
    const conteudo = await verificarAcesso(config.jwtSegredos, cabecalho.slice(7));
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
    /*
      403 e não 404: aqui a pessoa administra usuários, ela só não administra
      AQUELE usuário. O 404 existe para não revelar que um recurso de outro
      município existe, e esse não é o caso: a conta é do município dela.
    */
    if (erro instanceof PostoInsuficiente) {
      return resposta.code(403).send({ erro: "posto_insuficiente", mensagem: erro.message });
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

  /**
   * Saúde e prontidão numa rota só.
   *
   * `esquemaEmDia: false` é a informação que importa num rolling deploy: um
   * processo novo servindo requisição contra banco sem a coluna que o código
   * espera falha de um jeito difícil de diagnosticar. Melhor o balanceador
   * saber que este processo ainda não está pronto.
   */
  app.get("/saude", async (_req, resposta) => {
    try {
      const pendentes = await banco.semTenant(async (c) => {
        const r = await c.query<{ versao: string }>(
          "SELECT versao FROM schema_migracoes ORDER BY versao DESC LIMIT 1",
        );
        return r.rows[0]?.versao ?? null;
      });
      return { status: "ok", banco: "ok", ultimaMigracao: pendentes };
    } catch {
      // Sem detalhe do erro: esta rota é pública por natureza, e mensagem de
      // banco costuma trazer nome de host e de tabela.
      return resposta.code(503).send({ status: "indisponivel", banco: "indisponivel" });
    }
  });

  await app.register(rotasAutenticacao, { prefix: "/auth", autenticacao, config });
  /*
    A verificação em duas etapas da PRÓPRIA conta. Não tem prefixo `/auth`
    porque não é o login: o login usa `POST /auth/segundo-fator`, que é a
    segunda etapa da entrada, e estas aqui são a gestão feita por quem já está
    dentro (ou por quem o município obriga a ligar antes de entrar).
  */
  await app.register(rotasSegundoFator, {
    prefix: "/segundo-fator", banco, config, autenticacao, segundoFator,
  });
  await app.register(rotasOcorrencias, { prefix: "/ocorrencias", banco });
  await app.register(rotasAdministracao, { prefix: "/", banco });
  await app.register(rotasSincronizacao, { prefix: "/sincronizacao", banco });
  await app.register(rotasCampo, { prefix: "/campo", banco });
  /*
    Prefixo proprio, e nao dentro de `/campo`, porque metade destas rotas e da
    COORDENACAO e nao do agente: `GET /saida-a-campo` e a tela de quem fica na
    mesa. Pendurar isso em `/campo` faria o nome do prefixo mentir sobre quem
    chama, que e a primeira coisa que alguem le ao procurar uma rota.
  */
  await app.register(rotasSaidaACampo, { prefix: "/saida-a-campo", banco });
  // Registro do aparelho que recebe notificação. Com `PUSH_ATIVO=nao`, que é o
  // padrão, as rotas existem e recusam, em vez de sumirem: uma rota ausente
  // responde 404, que o aplicativo leria como "versão velha do servidor".
  await app.register(rotasAparelhos, { prefix: "/aparelhos", banco, config });
  // O sino do painel. Não depende de `PUSH_ATIVO`: ele é o canal de quem está
  // na frente do computador, e existe mesmo num município que nunca ligou
  // notificação em telefone nenhum.
  await app.register(rotasAvisos, { prefix: "/avisos", banco });
  /*
    O que o painel precisa saber do ambiente onde ele está rodando, hoje só a
    chave do mapa. Ela vem daqui, e não do build do painel, porque o painel é
    um build só servindo todos os municípios: assada lá, seria a chave do
    fornecedor pagando o mapa de todas as prefeituras. Não lê o banco e
    responde igual para todo município. Ver `rotas/configuracao.ts`.
  */
  await app.register(rotasConfiguracao, { prefix: "/configuracao", config });
  // O catálogo de destinos de providência. A leitura é aberta a qualquer conta
  // autenticada porque o formulário de providência precisa da lista; escrever
  // exige `gerenciar_equipes`. Ver `rotas/orgaos.ts`.
  await app.register(rotasOrgaos, { prefix: "/orgaos", banco });
  /*
    O ofício numerado e o envio por email. O envio recusa com `EMAIL_ATIVO=nao`,
    que é o padrão, em vez de a rota sumir: rota ausente responde 404, e o
    painel leria isso como "versão velha do servidor" em vez de "o município
    ainda não ligou o envio".
  */
  await app.register(rotasOficios, {
    prefix: "/oficios", banco, config, notificador,
    ...(config.MARCA_DAGUA ? { marcaDagua: config.MARCA_DAGUA } : {}),
  });
  // Única rota de escrita sem autenticação do produto. Ela grava pedido de
  // contato e NÃO cria município: provisionar continua por linha de comando.
  await app.register(rotasInteresse, { prefix: "/publico", banco });
  /*
    A ÚNICA rota de leitura sem autenticação que devolve dado de município, e
    ela é assim de propósito: quem abre o ofício é uma pessoa do órgão
    destinatário, sem conta no sistema. O que a protege não é token, é um
    segredo de 32 bytes que só existe dentro do email enviado, que expira, que
    abre uma vez só e cuja abertura fica registrada. Ver `rotas/oficios.ts`.
  */
  await app.register(rotasOficioPublico, {
    prefix: "/publico", banco,
    ...(config.MARCA_DAGUA ? { marcaDagua: config.MARCA_DAGUA } : {}),
  });
  await app.register(rotasPrestacaoDeContas, { prefix: "/", banco });
  /*
    A saída de município: o pacote com tudo que é do município, em formato
    aberto. Exige administrador e deixa trilha, e não apaga nada: a eliminação
    é ato contratual, depois de o município conferir. Ver `rotas/saida.ts`.
  */
  await app.register(rotasSaida, {
    prefix: "/saida", banco, armazenamento,
    ...(config.MARCA_DAGUA ? { marcaDagua: config.MARCA_DAGUA } : {}),
  });
  await app.register(rotasEvidencias, { prefix: "/evidencias", banco, armazenamento });
  /*
    Quanto o município ocupa de armazenamento. Prefixo separado e não `/evidencias`
    porque a pergunta e o público são outros: a evidência é do agente e da
    ocorrência, e isto é do contrato e do administrador.
  */
  await app.register(rotasArmazenamento, { prefix: "/armazenamento", banco });
  await app.register(rotasDocumentos, {
    prefix: "/documentos", banco, armazenamento, pdf,
    // Enquanto o produto não estiver em uso oficial, todo documento sai
    // marcado. Quem decide é `MARCA_DAGUA`, e não o ambiente: o piloto roda
    // com NODE_ENV=production, então amarrar o carimbo ao ambiente o desligava
    // justamente onde ele mais importa. Vazio desmarca, e é ato deliberado.
    ...(config.MARCA_DAGUA ? { marcaDagua: config.MARCA_DAGUA } : {}),
  });

  // Só existe quando a própria API guarda os bytes, o que a configuração
  // proíbe em produção.
  if ("guardar" in armazenamento) {
    await app.register(rotasArmazenamentoLocal, {
      prefix: "/armazenamento",
      armazenamento: armazenamento as ArmazenamentoEmMemoria,
    });
  }

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
