import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CABECALHO_DE_VERSAO_DO_APLICATIVO,
  estaAbaixoDoMinimo,
  lerCabecalhoDeVersao,
  type AplicativoComVersaoMinima,
  type VersaoDeclarada,
} from "@dc360/shared";
import type { Config } from "./config.js";
import { PREFIXO_V1 } from "./versao-v1.js";

/**
 * A versão do aplicativo, a versão mínima e o encerramento do espelho
 * (V2-F02-E06 e V2-F02-E08).
 *
 * O cabeçalho `X-App-Version` (`campo/1.4.0`) é DECLARADO pelo cliente: serve à
 * compatibilidade e à medição, nunca decide acesso. Por isso nada aqui lê token,
 * usuário ou município, e a recusa 426 vem ANTES da autenticação e é igual para
 * qualquer cliente velho. Tudo o que o cabeçalho trouxer de ilegível é
 * IGNORADO: nunca vira 500.
 *
 * O que este arquivo guarda:
 *
 *   - `hookDeVersaoNoV1`: o `onRequest` do escopo `/v1` (E06).
 *   - `hookDoEspelho`: o `onRequest` do escopo legado (E08): conta o uso e, com
 *     o encerramento ligado e a data vencida, recusa com 426.
 *   - `espelhoEncerrado`: a regra do encerramento, isolada para o teste.
 */

/** O padrão da rota pública que informa o mínimo. Fica de fora do 426 (ver o hook). */
export const ROTA_DA_VERSAO_MINIMA = `${PREFIXO_V1}/aplicativos/:aplicativo/versao-minima`;

/** A versão mínima configurada para o aplicativo, ou `undefined` se não há mínimo. */
export function versaoMinimaDe(
  config: Pick<Config, "VERSAO_MINIMA_CAMPO" | "VERSAO_MINIMA_CIDADAO">,
  aplicativo: AplicativoComVersaoMinima | string,
): string | undefined {
  if (aplicativo === "campo") return config.VERSAO_MINIMA_CAMPO;
  if (aplicativo === "cidadao") return config.VERSAO_MINIMA_CIDADAO;
  return undefined;
}

function cabecalhoDeVersao(req: FastifyRequest): string | undefined {
  const v = req.headers[CABECALHO_DE_VERSAO_DO_APLICATIVO];
  // Cabeçalho repetido chega como lista em alguns casos; o valor deixa de ser
  // legível e cai em "ilegível" mais abaixo.
  return Array.isArray(v) ? v.join(", ") : v;
}

/** O que o log conta quando não há versão legível: ausente ou ilegível. */
function situacaoDoCabecalho(
  bruto: string | undefined,
  lida: VersaoDeclarada | null,
): "ok" | "ausente" | "ilegivel" {
  if (lida) return "ok";
  return bruto === undefined || bruto.trim() === "" ? "ausente" : "ilegivel";
}

/**
 * O 426 por versão antiga. O corpo não leva dado de município nem de pessoa:
 * `erro`, `mensagem` e, quando há, `versaoMinima`.
 */
function recusarVersaoAntiga(
  resposta: FastifyReply,
  mensagem: string,
  versaoMinima?: string,
): FastifyReply {
  if (versaoMinima) {
    return resposta.code(426).send({ erro: "versao_do_aplicativo_antiga", mensagem, versaoMinima });
  }
  return resposta.code(426).send({ erro: "versao_do_aplicativo_antiga", mensagem });
}

/**
 * O `onRequest` do escopo `/v1` (E06).
 *
 *   - Cabeçalho ausente: aceito e CONTADO em log `info` até o fim do espelho
 *     (sem usuário, sem município, sem endereço).
 *   - Ilegível ou de aplicativo desconhecido: ignorado, também contado.
 *   - Abaixo do mínimo do aplicativo declarado: 426 antes de autenticar.
 *   - Mínimo vazio: sem recusa nenhuma.
 *
 * A rota pública da versão mínima nunca é recusada: é por ela que o aplicativo
 * velho descobre o que precisa instalar.
 */
export function hookDeVersaoNoV1(app: FastifyInstance, config: Config) {
  return async function versaoNoV1(
    req: FastifyRequest,
    resposta: FastifyReply,
  ): Promise<FastifyReply | void> {
    if (req.routeOptions.url === ROTA_DA_VERSAO_MINIMA) return;
    const bruto = cabecalhoDeVersao(req);
    const lida = lerCabecalhoDeVersao(bruto);
    const situacao = situacaoDoCabecalho(bruto, lida);
    if (situacao !== "ok") {
      app.log.info(
        { evento: "versao_do_aplicativo", situacao, rota: req.routeOptions.url ?? null },
        "pedido em /v1 sem versão do aplicativo legível",
      );
      return;
    }
    const minimo = versaoMinimaDe(config, lida!.aplicativo);
    if (estaAbaixoDoMinimo(lida, minimo)) {
      return recusarVersaoAntiga(
        resposta,
        `Esta versão do aplicativo não é mais aceita. Atualize para a versão ${minimo!} ou mais nova.`,
        minimo!,
      );
    }
  };
}

/**
 * Se o espelho legado está encerrado AGORA: chave ligada E o fim do dia de
 * `ESPELHO_LEGADO_ATE` (23:59:59 UTC, o mesmo instante do `Sunset`) já passou.
 * Com a chave em `nao` ou a data no futuro, o espelho atende.
 */
export function espelhoEncerrado(
  config: Pick<Config, "ESPELHO_LEGADO_ENCERRADO" | "ESPELHO_LEGADO_ATE">,
  agora: number = Date.now(),
): boolean {
  if (config.ESPELHO_LEGADO_ENCERRADO !== "sim") return false;
  const fim = Date.parse(`${config.ESPELHO_LEGADO_ATE}T23:59:59.999Z`);
  return Number.isFinite(fim) && agora > fim;
}

/**
 * O `onRequest` do espelho legado (E08).
 *
 * 1. CONTA o uso em log `info`: método, modelo da rota (`/ocorrencias/:id`,
 *    nunca o identificador real) e a versão declarada. Não leva usuário,
 *    município, token, endereço IP, corpo nem consulta da URL: o relatório de
 *    uso decide a data do fim do espelho, e dado de pessoa não ajuda nisso.
 * 2. Com o encerramento ligado e a data vencida, responde 426
 *    `versao_do_aplicativo_antiga` (e não 404: o aplicativo antigo deve parecer
 *    desatualizado, não quebrado). O `onSend` do escopo acrescenta o `Link` para
 *    `/v1`. Vem antes da autenticação e é igual para todo município.
 */
export function hookDoEspelho(app: FastifyInstance, config: Config) {
  return async function usoDoEspelho(
    req: FastifyRequest,
    resposta: FastifyReply,
  ): Promise<FastifyReply | void> {
    const bruto = cabecalhoDeVersao(req);
    const lida = lerCabecalhoDeVersao(bruto);
    const situacao = situacaoDoCabecalho(bruto, lida);
    app.log.info(
      {
        evento: "uso_do_espelho",
        metodo: req.method,
        rota: req.routeOptions.url ?? null,
        aplicativo: lida?.aplicativo ?? situacao,
        versao: lida?.versao ?? null,
      },
      "uso do espelho legado",
    );
    if (espelhoEncerrado(config)) {
      return recusarVersaoAntiga(
        resposta,
        "Este endereço da API foi encerrado. Atualize o aplicativo para continuar.",
      );
    }
  };
}
