import type { GrupoDoContrato } from "../tipos.js";

/**
 * Mapa, caminho por ruas e busca (`rotas/mapa.ts`, `rota.ts` e `busca.ts`).
 * Parte 3C2 do lote 3.
 *
 * Nenhuma das três está descrita ainda, e é de propósito: o esquema de corpo
 * ou de query de cada uma (`pedidoSchema` do link e da rota, `consultaSchema`
 * da busca) mora dentro do arquivo da rota. A 3C2 o exporta, descreve a rota e
 * tira a chave de `pendentes`.
 */
export const grupo: GrupoDoContrato = {
  nome: "mapa-e-busca",
  rotas: [],
  pendentes: ["POST /v1/mapa/resolver-link", "POST /v1/rota", "GET /v1/busca"],
};
