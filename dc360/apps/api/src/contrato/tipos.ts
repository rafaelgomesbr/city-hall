import type { ZodType } from "zod";
import type { CodigoDeErro } from "@dc360/shared";

/**
 * A forma de uma entrada do registro de rotas (V2-F02-E04).
 *
 * O registro é a ÚNICA lista do contrato da API: o documento OpenAPI sai dele
 * e a V2-F03-E12 o estende com ação, ator, plateia e escopo de cada rota. Não
 * nascem duas listas.
 */

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** O que a rota devolve quando dá certo. */
export type RespostaDoContrato = {
  /** O status HTTP de sucesso. */
  readonly status: number;
  /** Uma frase sobre o que vem no corpo. */
  readonly descricao: string;
  /** O esquema do corpo JSON. Ausente quando o corpo é arquivo (PDF, CSV, ZIP). */
  readonly esquema?: ZodType;
  /** O tipo de mídia quando não é JSON (`application/pdf`, `text/csv`...). */
  readonly tipo?: string;
};

export type RotaDoContrato = {
  readonly metodo: MetodoHttp;
  /**
   * O caminho COMPLETO, com o `/v1` na frente e o parâmetro na forma do
   * Fastify (`/v1/ocorrencias/:id`), exatamente como o servidor o registra.
   * Sem barra no fim.
   */
  readonly caminho: string;
  /** Uma frase, em português, do que a rota faz. */
  readonly resumo: string;
  /** O corpo da requisição. É o esquema que o handler de fato aplica. */
  readonly corpo?: ZodType;
  /** A query string. */
  readonly consulta?: ZodType;
  /** Os parâmetros de caminho. */
  readonly parametros?: ZodType;
  /** Ausente em rota existente é DÍVIDA listada. Em rota `nova`, reprova. */
  readonly resposta?: RespostaDoContrato;
  /** Os códigos do catálogo (`CODIGOS_DE_ERRO`) com que esta rota pode responder. */
  readonly erros?: readonly CodigoDeErro[];
  /** Rota criada depois do contrato existir: `resposta` é obrigatória. */
  readonly nova?: boolean;
};

/**
 * Um grupo de rotas, um arquivo em `grupos/`.
 *
 * `rotas` são as entradas já descritas. `pendentes` é a lista DECLARADA das
 * rotas registradas que ainda não têm entrada (chave `MÉTODO /v1/caminho`):
 * é a dívida do grupo, visível e contada, e o teste reprova a lista que cresce
 * além do teto, a que cita rota que não existe e a que repete uma rota já
 * descrita. Descrever uma rota é tirá-la de `pendentes` e pô-la em `rotas`.
 */
export type GrupoDoContrato = {
  readonly nome: string;
  readonly rotas: readonly RotaDoContrato[];
  readonly pendentes: readonly string[];
};

/** Escreve uma entrada com o tipo conferido, sem alargar os literais. */
export function rota(entrada: RotaDoContrato): RotaDoContrato {
  return entrada;
}

/** A chave que o teste de paridade e `pendentes` usam: `MÉTODO /v1/caminho`. */
export function chaveDaRota(r: { metodo: string; caminho: string }): string {
  return `${r.metodo} ${r.caminho}`;
}
