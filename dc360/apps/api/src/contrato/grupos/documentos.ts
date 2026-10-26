import { ERROS_AUTORIZADA, parametroId } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Documentos técnicos de uma ocorrência (`rotas/documentos.ts`). Parte 3C3 do
 * lote 3.
 *
 * As cinco rotas descritas só têm o `:id` de caminho. `GET
 * /v1/documentos/validar/:codigo` fica em `pendentes` porque o esquema do
 * `:codigo` (`codigoSchema`) mora dentro de `rotas/documentos.ts`. O tipo de
 * mídia da resposta (HTML ou PDF) é a dívida de `resposta` que a 3C3 paga.
 */
export const grupo: GrupoDoContrato = {
  nome: "documentos",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/laudo",
      resumo: "Emite o laudo técnico de uma ocorrência.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/laudo.pdf",
      resumo: "Emite o laudo técnico de uma ocorrência em PDF.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/termo-de-interdicao",
      resumo: "Emite o termo de interdição de uma ocorrência.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/termo-de-interdicao.pdf",
      resumo: "Emite o termo de interdição de uma ocorrência em PDF.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/termo-de-desinterdicao",
      resumo: "Emite o termo de desinterdição de uma ocorrência.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
  ],
  pendentes: ["GET /v1/documentos/validar/:codigo"],
};
