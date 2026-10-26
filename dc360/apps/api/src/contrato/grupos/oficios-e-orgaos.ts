import { ERROS_AUTORIZADA, parametroId } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Ofícios aos órgãos e o catálogo de órgãos (`rotas/oficios.ts` e
 * `rotas/orgaos.ts`). Parte 3C3 do lote 3.
 *
 * Em `pendentes`, as sete rotas cujo esquema de corpo ou de query mora dentro
 * do arquivo da rota (`emissaoSchema`, `envioSchema`, `orgaoSchema`, a
 * `desativacaoSchema` e as queries inline das duas listas). A 3C3 os exporta e
 * tira a rota da lista.
 */
export const grupo: GrupoDoContrato = {
  nome: "oficios-e-orgaos",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/oficios/:id",
      resumo: "Lê um ofício emitido pelo município.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/oficios/:id/documento",
      resumo: "Abre o documento do ofício emitido.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/orgaos/:id/reativacao",
      resumo: "Reativa um órgão do catálogo (órgão se desativa em vez de sumir).",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
  ],
  pendentes: [
    "GET /v1/oficios",
    "POST /v1/oficios",
    "POST /v1/oficios/:id/envio",
    "GET /v1/orgaos",
    "POST /v1/orgaos",
    "PATCH /v1/orgaos/:id",
    "POST /v1/orgaos/:id/desativacao",
  ],
};
