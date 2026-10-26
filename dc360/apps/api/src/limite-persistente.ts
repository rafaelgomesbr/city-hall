import type { FastifyRateLimitStoreCtor } from "@fastify/rate-limit";
import type { Config } from "./config.js";
import { LimitePorRotaSemVersao } from "./limite-por-rota.js";

/**
 * Qual loja de contagem o limitador de taxa usa (ponto de extensão da 1C).
 *
 * Hoje devolve SEMPRE a loja em memória de `limite-por-rota.ts`: é o que o
 * servidor já usava, e `COTAS_PERSISTENTES` ainda não tem efeito. A etapa das
 * cotas persistentes (V2-F03-E17) troca o corpo desta função para devolver a
 * loja que conta no banco quando a chave estiver ligada, sem mexer em
 * `servidor.ts`.
 */
export function lojaDoLimitador(_config: Config): FastifyRateLimitStoreCtor {
  return LimitePorRotaSemVersao;
}
