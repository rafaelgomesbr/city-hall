import type { FastifyInstance } from "fastify";
import { ehAplicativoComVersaoMinima } from "@dc360/shared";
import type { Config } from "../config.js";
import { RegraDeNegocio } from "../servidor.js";
import { versaoMinimaDe } from "../versao-do-aplicativo.js";

/**
 * A versão mínima aceita de cada aplicativo de loja (V2-F02-E06).
 *
 * `GET /v1/aplicativos/:aplicativo/versao-minima` responde SEM token, de
 * propósito: é por aqui que o aplicativo velho (ou o que ainda nem entrou)
 * descobre o que precisa instalar, e quem está com a versão recusada não
 * consegue autenticar para perguntar. Por isso também fica de fora da recusa
 * por versão (ver `hookDeVersaoNoV1`).
 *
 * O que devolve é só uma configuração do servidor, igual para todo mundo:
 * `{ aplicativo, versaoMinima }`, com `versaoMinima: null` quando não há mínimo.
 * Nenhum dado de município, de usuário ou de ocorrência passa por aqui.
 *
 * Só existe em `/v1` (aplicativo antigo nunca a chamou): entra em
 * `ROTAS_SO_NO_V1`. Aplicativo que não tem mínimo (`painel`, ou nome qualquer)
 * responde 404 com o mesmo corpo de rota inexistente.
 */
export async function rotasAplicativos(
  app: FastifyInstance,
  { config }: { config: Config },
): Promise<void> {
  app.get<{ Params: { aplicativo: string } }>("/:aplicativo/versao-minima", async (req) => {
    const aplicativo = req.params.aplicativo;
    if (!ehAplicativoComVersaoMinima(aplicativo)) {
      throw new RegraDeNegocio("nao_encontrado", "Aplicativo não encontrado.", 404);
    }
    return { aplicativo, versaoMinima: versaoMinimaDe(config, aplicativo) ?? null };
  });
}
