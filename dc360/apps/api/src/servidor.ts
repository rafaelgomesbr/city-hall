import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  PostoInsuficiente,
  SemPermissao,
  exigirPermissao,
  ehCodigoDeErro,
  type Acao,
  type CodigoDeErro,
} from "@dc360/shared";
// Antes das rotas, de propósito: a guarda copia as primitivas que usa na carga do módulo.
import {
  CONTRATO_DE_ACESSO_DA_API, GENERICO_DA_API, instalarGuardaDeAcesso, type ModoDaGuarda,
} from "./guarda-de-codigos-de-erro.js";
import type { ZodError } from "zod";
import type { Config } from "./config.js";
import { versaoDoBuild } from "./versao-do-build.js";
import { PREFIXO_V1, cabecalhosDeDepreciacao } from "./versao-v1.js";
import { lojaDoLimitador } from "./limite-persistente.js";
import type { Banco } from "./banco/tipos.js";
import { servicoDeAutenticacao, FalhaAutenticacao } from "./auth/servico.js";
import {
  NaoAutenticado,
  TrocaDeSenhaObrigatoria,
  criarAutenticacaoDaRequisicao,
  type Identidade,
} from "./auth/autenticacao-da-requisicao.js";
import { AcessoSuspenso } from "./auth/suspensao.js";
import { ContaDesativada } from "./auth/conta-desativada.js";
import { servicoDeSegundoFator } from "./auth/segundo-fator.js";
import { notificadorDeLog, type Notificador } from "./auth/notificador.js";
import { rotasAutenticacao } from "./rotas/autenticacao.js";
import { rotasOcorrencias } from "./rotas/ocorrencias.js";
import { rotasAdministracao } from "./rotas/administracao.js";
import { rotasSincronizacao } from "./rotas/sincronizacao.js";
import { rotasCampo } from "./rotas/campo.js";
import { rotasUsuariosEu } from "./rotas/usuarios-eu.js";
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
import { rotasRota, type OpcoesDaRota } from "./rotas/rota.js";
import { rotasMapa, type OpcoesDoMapa } from "./rotas/mapa.js";
import { rotasBusca } from "./rotas/busca.js";
import { rotasAplicativos } from "./rotas/aplicativos.js";
import { rotasConvites } from "./rotas/convites.js";
import { rotasMunicipioDaSessao } from "./rotas/municipio-da-sessao.js";
import { rotasSigilo } from "./rotas/sigilo.js";
import { hookDeVersaoNoV1, hookDoEspelho } from "./versao-do-aplicativo.js";
import type { Armazenamento } from "./armazenamento/tipos.js";
import type { ArmazenamentoEmMemoria } from "./armazenamento/memoria.js";
import type { GeradorDePdf } from "./documentos/pdf.js";
import type { UltimaRodada } from "./push/varredor.js";
import { chaveDoLimitador, declararProxyDeBorda, enderecoDoCliente } from "./rede.js";
import { criarReportador, type ReportadorDeErros } from "./observabilidade/reportador.js";
import { idDeRequisicaoRecebido } from "./observabilidade/id-de-requisicao.js";

/*
  A autenticação de cada requisição mora em `auth/autenticacao-da-requisicao.ts`
  desde a abertura da API da F03 (parte 1C). Os nomes continuam saindo daqui
  para nenhum importador mudar de caminho.
*/
export {
  NaoAutenticado,
  ROTAS_ABERTAS_COM_SENHA_PROVISORIA,
  TrocaDeSenhaObrigatoria,
  type Identidade,
} from "./auth/autenticacao-da-requisicao.js";

declare module "fastify" {
  interface FastifyContextConfig {
    /**
     * Marca as rotas que a FILA do aparelho de campo chama.
     *
     * Só muda uma coisa: com o município suspenso, a recusa sai como 503 em
     * vez de 403, para a fila tratar como temporário e a coleta feita no
     * morro sobreviver no aparelho até o acesso voltar. Ver
     * `auth/suspensao.ts`. Não afeta permissão, não afeta isolamento.
     */
    filaDoCampo?: boolean;
    /**
     * Marca a rota GET que ESCREVE: muda estado ou grava trilha, exportação
     * ou registro de acesso. A vigência (conta, papel, sessão) vale para ela
     * como vale para um POST. Ver `ROTA_GET_COM_EFEITO`.
     */
    comEfeito?: boolean;
  }
}

/**
 * A configuração de rota que marca "isto é chamado pela fila do aparelho".
 *
 * Exportada para as rotas a usarem pelo nome, e para o teste conferir que as
 * quatro rotas da fila (`/sincronizacao/vistoria`, `/sincronizacao/devolucao`,
 * `/evidencias/autorizar-envio`, `/evidencias/confirmar-envio`) carregam a
 * marca: uma rota nova da fila sem ela bloquearia coleta em município suspenso.
 */
export const ROTA_DA_FILA_DO_CAMPO = { config: { filaDoCampo: true } } as const;

/**
 * A configuração de rota que marca "este GET escreve".
 *
 * O método HTTP não diz se um pedido escreve: abrir o termo de interdição É
 * interditar o imóvel (e grava `documento_emitido`), baixar o CSV grava
 * `exportacoes`, abrir o laudo ou um termo grava a emissão e o acesso, e
 * consultar o sino de avisos materializa e expurga avisos. Decidir por
 * `req.method !== "GET"` deixava conta desativada, papel rebaixado e sessão
 * encerrada escreverem por esses GET (e por HEAD, que o Fastify serve com o
 * mesmo handler), e a trilha não se corrige (V2-F00-E04, correção 1).
 *
 * O CRITÉRIO da marca: o GET pratica um ATO (emite documento, interdita,
 * exporta) ou muda dado do município (materializa e expurga avisos). O GET
 * cuja única escrita é o registro de que ELE foi lido (`registrarConsulta`:
 * o dossiê `GET /ocorrencias/:id` e a busca) NÃO leva a marca: é leitura, o
 * registro é a auditoria dela. Desde a V2-F03-E03 a vigência vale em TODA
 * requisição autenticada (leitura inclusive), então este critério deixou de
 * decidir se a rota confere; só decide quais GET entram na lista.
 *
 * O HEAD automático do Fastify herda a configuração do GET. Rota GET nova que
 * escreve e não leva a marca reprova em `test/get-com-efeito.test.ts`, que
 * varre o fonte das rotas. A marca já não é lida pela autenticação: a vigência
 * de LEITURA e de escrita é a mesma desde a V2-F03-E03
 * (`auth/autenticacao-da-requisicao.ts`).
 */
export const ROTA_GET_COM_EFEITO = { config: { comEfeito: true } } as const;

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
  /**
   * Por onde o caminho por ruas sai para o Google, e o relógio da cache dele.
   * Só o teste passa: em produção a rota usa o `fetch` global e `Date.now`.
   * Ver `rotas/rota.ts`.
   */
  rota?: Pick<OpcoesDaRota, "buscar" | "agora">;
  /** A rede e o DNS de `POST /mapa/resolver-link`. Só o teste passa. Ver `rotas/mapa.ts`. */
  mapa?: OpcoesDoMapa;
  /**
   * A varredura de push, quando ela existe (`PUSH_ATIVO=sim`).
   *
   * Duas coisas passam por aqui, e as duas fecham um silêncio:
   *
   *   `despertar()`  a rota de despacho chama DEPOIS do commit, e o aviso de
   *                  tarefa nova sai em segundos em vez de esperar o relógio
   *                  de cinco minutos.
   *   `ultimaRodada` o que `/saude` mostra: os contadores da última rodada
   *                  desta máquina, que é a única janela do operador sem
   *                  abrir o banco.
   *
   * Ausente com o push desligado, e `/saude` responde `push: null`, que é
   * a diferença entre "não está mandando" e "não existe".
   *
   * Em `index.ts` a varredura é criada DEPOIS do servidor (ela escreve no log
   * dele), então o que chega aqui é um par de fechamentos que só resolvem a
   * varredura quando chamados.
   */
  push?: {
    despertar(): void;
    ultimaRodada(): UltimaRodada | null;
  };
  /**
   * O que a guarda das respostas de acesso faz com um desvio do catálogo (ver
   * `guarda-de-codigos-de-erro.ts`). Sem isto: "falhar" em teste, "corrigir"
   * fora dele. Só o teste da guarda passa, para provar o modo de produção.
   */
  modoDaGuarda?: ModoDaGuarda;
  /**
   * Se o tratador de erros LANÇA quando um erro de domínio traz um código fora
   * do catálogo (`packages/shared/src/erros.ts`, V2-F02-E03). A conferência
   * SÓ EXISTE com `NODE_ENV=test`, qualquer que seja esta opção: fora de teste o
   * cliente recebe o código como veio (o tipo de `RegraDeNegocio` já recusou a
   * maioria em compilação) e nada do caminho interno vaza. Em teste, `false`
   * desliga: só o teste da guarda de acesso o faz, porque planta de propósito
   * códigos fora do catálogo para provar que a guarda os pega.
   */
  conferirCatalogoDeErros?: boolean;
  /**
   * Para onde vai o erro inesperado (500). Sem isto: o log em nível `error`, que
   * é o único destino até o CP-06 decidir a ferramenta de erro. O teste passa um
   * coletor para afirmar o que sairia para um terceiro.
   */
  reportador?: ReportadorDeErros;
  /**
   * O teto do limitador GLOBAL, por balde e por minuto. Só o teste passa.
   *
   * Existe porque a prova dinâmica dos códigos de erro dispara cada rota com
   * cada perfil, e com as rotas dobradas em `/v1` e no espelho (V2-F02-E01) o
   * balde de cada pessoa, que é um só nos dois prefixos, passa de 300 antes de
   * a prova terminar. Em produção vale sempre o padrão.
   */
  limitePorMinuto?: number;
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
    // O mesmo segredo colado sob `/v1` (engano de quem monta o endereço): a
    // rota não existe lá, mas o pedido 404 também é registrado no log.
    if (caminho.startsWith(`${PREFIXO_V1}${prefixo}`)) return `${PREFIXO_V1}${prefixo}[removido]`;
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
  /*
    A posição do agente e o destino, de `POST /rota`. Não chegam ao log hoje
    (o serializador de `req` não registra corpo), e estão aqui pela mesma
    razão dos campos acima: no dia em que alguém registrar `req.body` num
    ponto de diagnóstico, a posição de um servidor público identificável não
    pode ir junto. `docs/DECLARACAO-NAS-LOJAS.md` promete que não há histórico
    de deslocamento do agente, e log é histórico.
  */
  "req.body.origem",
  "req.body.destino",
  /*
    A ficha de push, de `POST /aparelhos` e `POST /aparelhos/revogar`. Não é
    credencial de acesso, e mesmo assim quem a tem escreve na tela bloqueada
    de um agente de Defesa Civil; a rota já a mantém fora da resposta e do
    `detalhe` de notificação, e esta linha a mantém fora do log no dia do
    ponto de diagnóstico.
  */
  "req.body.ficha",
] as const;

export async function construirServidor(
  {
    banco, config, armazenamento, notificador = notificadorDeLog(), pdf, destinoDeLog, rota, mapa,
    push, modoDaGuarda, conferirCatalogoDeErros, reportador: reportadorInjetado, limitePorMinuto = 300,
  }: Dependencias,
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
    // O id de requisição aparece em todo log, no cabeçalho `X-Request-Id` de
    // toda resposta e no corpo do 500. É o que permite alguém dizer "deu erro às
    // 14h32" e a equipe achar a linha. Um `X-Request-Id` de entrada só vale se
    // for UUID (ver `idDeRequisicaoRecebido`): texto livre viraria injeção de
    // linha no log e no cabeçalho de volta.
    genReqId: (req) => idDeRequisicaoRecebido(req.headers["x-request-id"]) ?? crypto.randomUUID(),
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
    /*
      OS ERROS QUE O PRÓPRIO FASTIFY ESCREVE ANTES DE QUALQUER ROTA (DV-36,
      V2-F02-E03): endereço malformado (`FST_ERR_BAD_URL`, 400), parâmetro de
      rota acima de 100 caracteres (`FST_ERR_MAX_PARAM_LENGTH`, 414) e erro de
      restrição assíncrona. Sem isto saíam em inglês, sem os cabeçalhos de
      segurança, no formato do Fastify, e ecoando o caminho pedido. Aqui saem
      na forma do catálogo, sem eco do caminho. Os hooks de rota não rodam
      nesta fase, então os cabeçalhos que importam são postos à mão.
    */
    frameworkErrors: (erro, req, enviada) => {
      // O tipo do Fastify aqui trava `send` num corpo `never`; o objeto é a resposta de sempre.
      const resposta = enviada as unknown as FastifyReply;
      const origem = req.headers.origin;
      const comum: Record<string, string> = {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-request-id": req.id,
        // A resposta muda conforme a origem; sem isto um cache serviria a de uma origem a outra.
        vary: "Origin",
      };
      /*
        A MESMA regra de CORS das demais respostas (`@fastify/cors`, registrado
        abaixo com `origin: config.origens`): o plugin não roda nesta fase, e sem
        o cabeçalho o painel, numa origem permitida, não lê o corpo e mostra
        "sem conexão" em vez da mensagem do catálogo. Só a origem escrita na lista
        recebe; qualquer outra fica sem cabeçalho de CORS, como antes.
      */
      if (typeof origem === "string" && config.origens.includes(origem)) {
        comum["access-control-allow-origin"] = origem;
        comum["access-control-allow-credentials"] = "true";
        comum["access-control-expose-headers"] = "x-request-id";
      }
      // 400 é o endereço malformado, 414 o parâmetro longo demais, e o resto a restrição assíncrona (500).
      if (erro.statusCode === 400) {
        void resposta.code(400).headers(comum).send({
          erro: "url_invalida",
          mensagem: "O endereço do pedido não é válido. Confira o endereço e tente de novo.",
        });
      } else if (erro.statusCode === 414) {
        void resposta.code(414).headers(comum).send({
          erro: "parametro_longo_demais",
          mensagem: "Um dos valores do endereço é longo demais. Confira o endereço e tente de novo.",
        });
      } else {
        void resposta.code(500).headers(comum).send({
          erro: "erro_interno",
          mensagem: "Erro inesperado. Se precisar de ajuda, informe o código de suporte.",
          requisicao: req.id,
        });
      }
    },
  });

  /*
    A guarda das respostas de acesso, ANTES de qualquer rota: toda resposta 401
    ou 403 tem de sair com um código do catálogo e o status dele. É a garantia
    em tempo de execução; a varredura do fonte é a primeira linha, e não fecha a
    classe sozinha. Ver `guarda-de-codigos-de-erro.ts`.
  */
  instalarGuardaDeAcesso(app, {
    modo: modoDaGuarda ?? (config.NODE_ENV === "test" ? "falhar" : "corrigir"),
    contrato: CONTRATO_DE_ACESSO_DA_API,
    generico: GENERICO_DA_API,
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
  app.addHook("onSend", async (req, resposta) => {
    resposta.header("cache-control", "no-store");
    // Toda resposta devolve o id da requisição, 2xx inclusive: o painel mostra
    // como código de suporte no 5xx, e quem depura uma rota lenta o lê no
    // sucesso. Sempre o `req.id` já validado, nunca eco do cabeçalho cru.
    resposta.header("x-request-id", req.id);
  });

  await app.register(cors, {
    origin: config.origens,
    credentials: true,
    // PUT entra por causa do envio de evidência: o navegador manda os bytes
    // direto para o armazenamento, e sem PUT liberado o preflight falha e o
    // upload nem sai. Em produção o armazenamento é externo e tem o próprio
    // CORS, mas no caminho local quem serve é esta API.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    /*
      O envio assinado repete os cabeçalhos que entraram na assinatura, e
      `if-none-match` é um deles: é o `if-none-match: *` da escrita única
      (`armazenamento/memoria.ts` e `armazenamento/s3.ts`). Sem ele aqui o
      preflight do navegador reprova e o PUT da foto nem sai ("Failed to
      fetch", seção 13 do e2e contra a API, V2-F00-E18). Nome a nome, e nunca
      curinga: a lista de origens continua sendo `ORIGENS_PERMITIDAS`, e
      `test/cors-do-envio-de-evidencia.test.ts` trava que nada além disto
      passa.
    */
    allowedHeaders: ["content-type", "authorization", "accept", "if-none-match", "x-app-version"],
    // Sem isto o navegador esconde `X-Request-Id` do JavaScript do painel, e o
    // código de suporte só chegaria pelo corpo do 500, que o proxy pode trocar.
    exposedHeaders: ["x-request-id"],
  });

  await app.register(rateLimit, {
    // O armazém dá o MESMO balde à rota em `/v1` e ao espelho dela (o limite do
    // login não dobra pela escolha do prefixo). Ver `limite-por-rota.ts`.
    // Qual loja conta é de `limite-persistente.ts` (memória, hoje).
    store: lojaDoLimitador(config),
    max: limitePorMinuto,
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
  // O link de recuperação sai depois da resposta (não revela, pelo relógio,
  // quem tem conta). Quem encerra o servidor espera esses envios terminarem,
  // para a mensagem já aceita não morrer no meio do caminho até o provedor.
  app.addHook("onClose", async () => { await autenticacao.esperarEnvios(); });

  /*
    A autenticação de cada requisição (token, suspensão, vigência na escrita,
    senha provisória, manifesto) mora em `auth/autenticacao-da-requisicao.ts`.
    A organização do `SET LOCAL` sai do token verificado lá, e de mais lugar nenhum.
  */
  app.decorate("exigirAutenticacao", criarAutenticacaoDaRequisicao(banco, config));

  app.setNotFoundHandler((req, resposta) => {
    void resposta.code(404).send({ erro: "nao_encontrado", mensagem: "Rota não encontrada." });
  });

  const reportador = reportadorInjetado ?? criarReportador({ log: app.log });

  /**
   * Um único lugar traduz erro em resposta.
   *
   * A regra que vale para todos: o cliente recebe o que ele precisa para agir,
   * e nada sobre a estrutura interna. Erro inesperado vira 500 com o id da
   * requisição, e o detalhe fica no log do servidor. Mensagem de exceção de
   * banco costuma conter nome de tabela, de coluna e de restrição, que é
   * exatamente o mapa que um atacante quer.
   */
  const lancarSeForaDoCatalogo = config.NODE_ENV === "test" && (conferirCatalogoDeErros ?? true);
  /*
    Em teste, um código que não é do catálogo derruba o pedido com a causa
    escrita, em qualquer status. O tipo de `RegraDeNegocio` recusa o literal em
    compilação; isto pega o que chegou por variável, por `as` ou por JavaScript.
  */
  function conferirCodigoDoCatalogo(codigo: unknown): void {
    if (lancarSeForaDoCatalogo && !ehCodigoDeErro(codigo)) {
      throw new TypeError(
        `Código de erro fora do catálogo: ${JSON.stringify(codigo)}. `
        + "Inclua em `CODIGOS_DE_ERRO` (packages/shared/src/erros.ts) ou use um código existente.",
      );
    }
  }

  app.setErrorHandler((erro, req, resposta) => {
    if (erro instanceof NaoAutenticado) {
      return resposta.code(401).send({ erro: "nao_autenticado", mensagem: erro.message });
    }
    /*
      403 para o painel e 503 para a fila do aparelho, com o MESMO código e a
      MESMA mensagem: quem lê o corpo sabe o que houve, quem lê só o status
      sabe se pode esperar. Nunca 401, porque a credencial está certa.
    */
    if (erro instanceof AcessoSuspenso) {
      return resposta.code(erro.status).send({ erro: erro.codigo, mensagem: erro.message });
    }
    /*
      A segunda barreira, que é do banco: `abrir_sessao` (migração 038) recusa
      abrir sessão de município suspenso com o código `DC367`. A API confere
      antes e o caminho comum nem chega lá; se chegar (suspensão entrando
      entre a conferência e a abertura), a resposta precisa ser a mesma, e
      não um 500 com "informe o código ao suporte".
    */
    if ((erro as { code?: unknown }).code === "DC367") {
      const suspenso = new AcessoSuspenso(403);
      return resposta.code(suspenso.status).send({ erro: suspenso.codigo, mensagem: suspenso.message });
    }
    /*
      403 e não 401: a credencial está certa, é a CONTA que foi desativada, e
      entrar de novo não resolve. É a conta do próprio usuário autenticado, não
      um recurso alheio, então não confirma a existência de nada de outro
      município (esse continua 404). Ver `auth/conta-desativada.ts`.
    */
    if (erro instanceof ContaDesativada) {
      return resposta.code(erro.status).send({ erro: erro.codigo, mensagem: erro.message });
    }
    if (erro instanceof SemPermissao) {
      return resposta.code(403).send({ erro: "sem_permissao", mensagem: erro.message });
    }
    /*
      403 nomeado, e não 401: a credencial está certa e a sessão existe. O que
      falta é um ato da própria pessoa, e a mensagem diz qual. O painel lê o
      código e abre a troca de senha (`apps/web/src/paginas/Entrar.tsx`).
    */
    if (erro instanceof TrocaDeSenhaObrigatoria) {
      return resposta.code(403).send({ erro: erro.codigo, mensagem: erro.message });
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
      conferirCodigoDoCatalogo(erro.codigo);
      const status = erro.codigo === "bloqueado" ? 429 : 401;
      return resposta.code(status).send({ erro: erro.codigo, mensagem: erro.message });
    }
    if (erro instanceof RegraDeNegocio) {
      conferirCodigoDoCatalogo(erro.codigo);
      return resposta.code(erro.status).send({
        erro: erro.codigo,
        mensagem: erro.message,
        /*
          `campos` sai quando a regra apontou campos, e só então: e a MESMA
          forma do 422 do Zod logo abaixo, e é a lista que o cartão da fila do
          aparelho lê para oferecer "corrigir a vistoria" em vez de "tentar de
          novo". Sem ela, uma recusa nomeada com status 422 chegaria ao agente
          sem dizer qual campo está errado.
        */
        ...(erro.campos ? { campos: erro.campos } : {}),
      });
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
    /*
      O CORPO QUE O FASTIFY NÃO CONSEGUIU LER (V2-F00-E07, correção 3, achado
      3 da validação de 52952a1): JSON vazio com `content-type:
      application/json`, JSON torto, corpo grande demais, tipo que nenhuma
      rota aceita. O Fastify já diz que é erro de quem pediu (status 4xx, código
      `FST_ERR_CTP_*`), e até aqui isso caía no 500 lá embaixo, que manda
      "informar o código ao suporte" por um pedido mal formado e enche o log
      de "erro não tratado". O status do Fastify é mantido; a mensagem não
      repete a dele, que fala de parser e de cabeçalho.
    */
    const doLeitorDeCorpo = erro as { code?: unknown; statusCode?: unknown };
    if (
      typeof doLeitorDeCorpo.code === "string" && doLeitorDeCorpo.code.startsWith("FST_ERR_CTP_")
      && typeof doLeitorDeCorpo.statusCode === "number"
      && doLeitorDeCorpo.statusCode >= 400 && doLeitorDeCorpo.statusCode < 500
    ) {
      const status = doLeitorDeCorpo.statusCode;
      return resposta.code(status).send({
        erro: "corpo_invalido",
        mensagem: status === 413
          ? "O pedido é grande demais."
          : status === 415
            ? "Este tipo de conteúdo não é aceito aqui."
            : "O corpo do pedido não pôde ser lido. Confira o formato e envie de novo.",
      });
    }
    if ((erro as { statusCode?: number }).statusCode === 429) {
      return resposta.code(429).send({
        erro: "excesso_de_requisicoes",
        mensagem: "Requisições demais. Aguarde um instante.",
      });
    }

    reportador.reportar(erro, {
      origem: "http",
      requisicao: req.id,
      metodo: req.method,
      // O molde (`/ocorrencias/:id`), e não a barra de endereço, que leva
      // identificador de ocorrência e query string.
      ...(req.routeOptions?.url ? { rota: req.routeOptions.url } : {}),
      status: 500,
    });
    return resposta.code(500).send({
      erro: "erro_interno",
      mensagem: "Erro inesperado. Se precisar de ajuda, informe o código de suporte.",
      requisicao: req.id,
    });
  });

  /**
   * Saúde e prontidão numa rota só.
   *
   * A resposta traz `ultimaMigracao` (a última versão aplicada no banco), que
   * quem opera um rolling deploy pode comparar com a que o código novo espera.
   * Não existe campo `esquemaEmDia`: processo com esquema atrasado nem chega a
   * subir (o boot confere e sai com erro, ver `index.ts`), então um processo
   * que responde aqui já nasceu com o esquema em dia. O 503 sai só quando a
   * consulta ao banco falha. Junto vão `eliminacoes` e `push`, sem nome de município nem de pessoa (contagens, e
   * o instante da última rodada do push).
   *
   * `versao` e `commit` dizem qual imagem está de pé (carimbo do build, ver
   * `versao-do-build.ts`): é com eles que o rollback confere, de fora, que a
   * versão certa voltou. Não são sensíveis, e valem `desconhecida` fora de imagem.
   */
  const build = versaoDoBuild();
  app.get("/saude", async (req, resposta) => {
    let ultimaMigracao: string | null;
    try {
      ultimaMigracao = await banco.semTenant(async (c) => {
        const r = await c.query<{ versao: string }>(
          "SELECT versao FROM schema_migracoes ORDER BY versao DESC LIMIT 1",
        );
        return r.rows[0]?.versao ?? null;
      });
    } catch {
      // Sem detalhe do erro: esta rota é pública por natureza, e mensagem de
      // banco costuma trazer nome de host e de tabela.
      return resposta.code(503).send({ status: "indisponivel", banco: "indisponivel" });
    }

    /*
      Se o relógio de eliminação tem trabalho, e quanto. SÓ NÚMEROS: nome de
      município não sai daqui, porque esta rota responde a qualquer um.

      É o único lugar fora do console em que alguém vê que há eliminação
      agendada, e o único em que dá para conferir, de fora, que uma eliminação
      vencida NÃO está acontecendo (`vencidas` que não zera de uma rodada para
      a outra). `eliminacoes_pendentes()` é função privilegiada que devolve
      duas contagens e nada mais (ver o relatório da migração 038).

      Se a função não existir, a resposta diz `null` e o log avisa, e a sonda
      continua respondendo `ok`: uma migração atrasada nesta função não pode
      derrubar a API inteira do balanceador, e o aviso a cada sonda é alto o
      bastante para alguém ver.
    */
    let eliminacoes: { agendadas: number; vencidas: number } | null = null;
    try {
      eliminacoes = await banco.semTenant(async (c) => {
        const r = await c.query<{ agendadas: string | number; vencidas: string | number }>(
          "SELECT agendadas, vencidas FROM eliminacoes_pendentes()",
        );
        const linha = r.rows[0];
        return linha
          ? { agendadas: Number(linha.agendadas), vencidas: Number(linha.vencidas) }
          : { agendadas: 0, vencidas: 0 };
      });
    } catch (erro) {
      req.log.warn(
        { erro: erro instanceof Error ? erro.message : String(erro) },
        "a rota de saude nao conseguiu contar as eliminacoes agendadas",
      );
    }

    /*
      O que o push fez, nesta máquina, na última rodada. SÓ NÚMEROS, pela
      mesma razão das eliminações: esta rota responde a qualquer um.

      `null` é push desligado. Ligado e sem rodada concluída ainda (a partida
      acabou de acontecer, ou esta máquina nunca ganhou a trava) sai com
      `rodadaEm: null` e zeros, que é diferente de mentir com uma rodada que
      não houve. `falhas` que não zera de uma sonda para a outra, com
      `entregues` parado, é a Apple ou o Google recusando: o motivo está no
      log do varredor, agregado, sem ficha.
    */
    const push_ = push
      ? (push.ultimaRodada() ?? {
          rodadaEm: null, reivindicadas: 0, entregues: 0, falhas: 0, revogados: 0,
        })
      : null;

    return {
      status: "ok", banco: "ok", ultimaMigracao, eliminacoes, push: push_,
      versao: build.versao, commit: build.commit,
    };
  });

  /*
    AS ROTAS DE NEGÓCIO, DUAS VEZES (V2-F02-E01).

    A mesma função registra tudo sob `/v1` (o contrato novo) e no escopo
    legado, sem prefixo, que é o que os aplicativos já instalados chamam. Uma
    função só, e não duas listas: rota nova nasce nos dois lados ou em lado
    nenhum, e `test/versao-v1.test.ts` confere a paridade pelas rotas que o
    Fastify de fato registrou. O que existe só em `/v1` é declarado em
    `ROTAS_SO_NO_V1` (ver `versao-v1.ts`).

    O espelho é um plugin ENCAPSULADO (sem `fastify-plugin`) de propósito: o
    `onSend` de depreciação vale só para as rotas dele, e as de infraestrutura
    abaixo, que ficam na raiz, não ganham cabeçalho de depreciação. O limitador
    de taxa, a guarda de acesso e a vigência são do `app` e valem nos dois.
  */
  const dependenciasDasRotas: DependenciasDasRotas = {
    banco, config, armazenamento, notificador, pdf, push, autenticacao, segundoFator, rota, mapa,
  };
  await app.register(
    async (v1) => {
      /*
        A versão do aplicativo (V2-F02-E06): só aqui, no escopo `/v1`. O hook
        roda no `onRequest`, ANTES de autenticar e de validar o corpo, e recusa
        com 426 o aplicativo abaixo do mínimo configurado (mínimo vazio, que é o
        padrão, não recusa nada). O cabeçalho é declaração do cliente: nada
        aqui decide acesso. As rotas de infraestrutura sem prefixo e o espelho
        ficam de fora por estarem em outros escopos.
      */
      const versaoNoV1 = hookDeVersaoNoV1(v1, config);
      /*
        O gancho é inline e só DELEGA: quem escreve o 426 é `versao-do-aplicativo.ts`,
        com `erro` literal do catálogo (a varredura de `.code(N).send` o lê lá). A
        varredura de ganchos reprova gancho com `send` dentro do callback porque ele
        esconderia um 401 ou 403 fora do catálogo; este só responde 426.
      */
      v1.addHook("onRequest", async (req, resposta) => versaoNoV1(req, resposta));
      await registrarRotasDeNegocio(v1, dependenciasDasRotas, { espelho: false });
    },
    { prefix: PREFIXO_V1 },
  );
  await app.register(async (espelho) => {
    /*
      Uso e encerramento do espelho (V2-F02-E08): conta cada pedido em log
      `info` (rota e versão, sem usuário nem município) e, com
      `ESPELHO_LEGADO_ENCERRADO=sim` depois do fim do dia de
      `ESPELHO_LEGADO_ATE`, responde 426 antes de autenticar. O `onSend` logo
      abaixo acrescenta os cabeçalhos de depreciação (e o `Link` para `/v1`) a
      toda resposta do escopo, a recusa inclusive.
    */
    const usoDoEspelho = hookDoEspelho(espelho, config);
    espelho.addHook("onRequest", async (req, resposta) => usoDoEspelho(req, resposta));
    espelho.addHook("onSend", async (req, resposta) => {
      for (const [nome, valor] of Object.entries(
        cabecalhosDeDepreciacao(config.ESPELHO_LEGADO_ATE, req.url),
      )) {
        resposta.header(nome, valor);
      }
    });
    await registrarRotasDeNegocio(espelho, dependenciasDasRotas, { espelho: true });
  });

  /*
    FORA DO `/v1` E DO ESPELHO, e por isso registrados uma vez, na raiz
    (`ROTAS_FORA_DO_PREFIXO`, com a razão de cada um).

    A ÚNICA rota de leitura sem autenticação que devolve dado de município, e
    ela é assim de propósito: quem abre o ofício é uma pessoa do órgão
    destinatário, sem conta no sistema. O que a protege não é token, é um
    segredo de 32 bytes que só existe dentro do email enviado, que expira, que
    abre uma vez só e cuja abertura fica registrada. O endereço vive em email
    já enviado, então não ganha prefixo nem cabeçalho de depreciação. Ver
    `rotas/oficios.ts`.
  */
  await app.register(rotasOficioPublico, {
    prefix: "/publico", banco,
    ...(config.MARCA_DAGUA ? { marcaDagua: config.MARCA_DAGUA } : {}),
  });

  // Só existe quando a própria API guarda os bytes, o que a configuração
  // proíbe em produção. As URLs assinadas que a API devolve apontam para cá, e
  // a assinatura cobre o caminho: por isso também não ganha prefixo.
  if ("guardar" in armazenamento) {
    await app.register(rotasArmazenamentoLocal, {
      prefix: "/armazenamento",
      armazenamento: armazenamento as ArmazenamentoEmMemoria,
    });
  }

  return app;
}

/** O que as rotas de negócio precisam para ser registradas, nos dois prefixos. */
export type DependenciasDasRotas = Pick<
  Dependencias, "banco" | "config" | "armazenamento" | "pdf" | "push" | "rota" | "mapa"
> & {
  notificador: Notificador;
  autenticacao: ReturnType<typeof servicoDeAutenticacao>;
  segundoFator: ReturnType<typeof servicoDeSegundoFator>;
};

/**
 * Registra TODA rota de negócio da API (V2-F02-E01).
 *
 * Chamada duas vezes por `construirServidor`: dentro de `/v1` e no escopo do
 * espelho legado. É o único lugar onde rota de negócio se registra, e por isso
 * não há como uma existir só de um lado sem ser declarada:
 *
 *   `espelho: true`   o caminho sem prefixo, para o aplicativo já instalado.
 *   `espelho: false`  `/v1`. O bloco `if (!espelho)` no fim é onde entra rota
 *                     que só existe em `/v1`; ela TAMBÉM entra em `ROTAS_SO_NO_V1`
 *                     (`versao-v1.ts`), ou a paridade reprova.
 */
async function registrarRotasDeNegocio(
  app: FastifyInstance,
  d: DependenciasDasRotas,
  { espelho }: { espelho: boolean },
): Promise<void> {
  const { banco, config, armazenamento, notificador, pdf, push, autenticacao, segundoFator, rota, mapa } = d;
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
  await app.register(rotasOcorrencias, {
    prefix: "/ocorrencias", banco,
    // O despacho acorda o varredor depois do commit. Sem push, não há quem acordar.
    ...(push ? { despertarPush: push.despertar } : {}),
  });
  await app.register(rotasAdministracao, { prefix: "/", banco });
  await app.register(rotasSincronizacao, { prefix: "/sincronizacao", banco });
  await app.register(rotasCampo, { prefix: "/campo", banco, armazenamento });
  /*
    Quem sou eu, lido do cadastro, e a foto que eu mesmo escolhi. Fora de
    `/auth` porque não é login, e fora de `/usuarios/:id` porque não é gestão
    de terceiro: é a pessoa sobre a própria conta, para qualquer papel. O
    argumento de por que não passa por `exigirPermissao` está na rota.
  */
  await app.register(rotasUsuariosEu, { prefix: "/usuarios/eu", banco, armazenamento });
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
  /*
    O caminho por ruas que o agente pede no aplicativo, traçado pelo Google a
    partir DAQUI, porque a chave que serve para HTTP é segredo de servidor e
    nunca sai deste processo. Sem `ROUTES_KEY` a rota existe e responde 503,
    em vez de sumir: rota ausente o aplicativo leria como "servidor velho". Não
    lê o banco e não registra coordenada nenhuma. Ver `rotas/rota.ts`.
  */
  await app.register(rotasRota, { prefix: "/rota", config, ...rota });
  // O link curto do Google Maps, aberto pelo servidor a pedido do coordenador. Ver `rotas/mapa.ts`.
  await app.register(rotasMapa, { prefix: "/mapa", ...mapa });
  // O catálogo de destinos de providência. A leitura é aberta a qualquer conta
  // autenticada porque o formulário de providência precisa da lista; escrever
  // exige `gerenciar_equipes`. Ver `rotas/orgaos.ts`.
  await app.register(rotasOrgaos, { prefix: "/orgaos", banco });
  // A caixa de busca do painel: registros dos quatro tipos, com tolerância a erro. Ver `rotas/busca.ts`.
  await app.register(rotasBusca, { prefix: "/busca", banco });
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

  if (!espelho) {
    // Rotas que só existem em `/v1` (as dos aplicativos novos) entram AQUI, e
    // em `ROTAS_SO_NO_V1`.
    // A versão mínima de cada aplicativo (V2-F02-E06), pública e sem dado de município.
    await app.register(rotasAplicativos, { prefix: "/aplicativos", config });
    /*
      Os três módulos da F03 que nascem VAZIOS na abertura da API (parte 1C), para
      as etapas dos donos não precisarem mexer neste arquivo: o convite (E10), o
      município da sessão (E16) e o sigilo da ocorrência (E21). Prefixo `/`: cada
      dono escreve o caminho inteiro da rota. Só em `/v1`, sem par no espelho.
    */
    await app.register(rotasConvites, { prefix: "/", ...d });
    await app.register(rotasMunicipioDaSessao, { prefix: "/", ...d });
    await app.register(rotasSigilo, { prefix: "/", ...d });
  }
}

/** Identifica um ZodError mesmo vindo de outra instalação do zod. */
function ehErroDeValidacao(erro: unknown): erro is ZodError {
  return (
    typeof erro === "object" && erro !== null &&
    (erro as { name?: string }).name === "ZodError" &&
    Array.isArray((erro as { issues?: unknown }).issues)
  );
}


/** Erro previsto de domínio: o cliente pode entender e corrigir. */
export class RegraDeNegocio extends Error {
  /**
   * Um código do catálogo (`packages/shared/src/erros.ts`, V2-F02-E03). O tipo
   * recusa em compilação qualquer texto fora dele; em `NODE_ENV=test` o
   * `setErrorHandler` confere também em execução, para o código que chegou por
   * variável ou por `as`. Nenhum código muda de nome ao entrar no catálogo.
   */
  readonly codigo: CodigoDeErro;
  readonly status: number;
  /**
   * Os campos recusados, no formato do 422 de validação (`campo` pontuado como
   * o Zod o devolve, `mensagem` em português). Opcional: a maioria das regras
   * recusa o ato inteiro, não um campo. Existe para a recusa que a rota só
   * consegue fazer depois de ler o banco (ex.: data anterior à abertura da
   * ocorrência) sair com a mesma forma que a recusa do esquema, porque o
   * aparelho decide pelo `campos` se oferece corrigir ou repetir.
   */
  readonly campos?: ReadonlyArray<{ campo: string; mensagem: string }>;
  constructor(
    codigo: CodigoDeErro,
    mensagem: string,
    status = 409,
    campos?: ReadonlyArray<{ campo: string; mensagem: string }>,
  ) {
    super(mensagem);
    /*
      Status de erro é número INTEIRO de 400 a 599 (V2-F00-E05, correção 4). O
      Node escreve `403.5` como 403 (`statusCode |= 0`), e uma regra com status
      fracionário ou em texto sairia como resposta de acesso com um código que
      nenhum cliente conhece. Recusar aqui faz o engano virar 500 com o detalhe no
      log, no primeiro pedido que passar por ele; a guarda da resposta pega o
      mesmo status por outro caminho.
    */
    if (typeof status !== "number" || !Number.isInteger(status) || status < 400 || status > 599) {
      throw new TypeError(`RegraDeNegocio("${codigo}") com status ${String(status)}: tem de ser inteiro de 400 a 599`);
    }
    this.codigo = codigo;
    this.status = status;
    if (campos && campos.length > 0) this.campos = campos;
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
