import { z } from "zod";
import { APLICATIVOS_COM_VERSAO_MINIMA } from "@dc360/shared";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * A versão mínima de cada aplicativo de loja (`rotas/aplicativos.ts`,
 * V2-F02-E06). Rota NOVA, só em `/v1`, pública (sem token e sem dado de
 * município): ver `ROTAS_SO_NO_V1` em `versao-v1.ts`.
 */
export const grupo: GrupoDoContrato = {
  nome: "aplicativos",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/aplicativos/:aplicativo/versao-minima",
      resumo:
        "Versão mínima aceita de um aplicativo de loja (sem token; igual para todo município).",
      parametros: z.object({
        aplicativo: z.enum(APLICATIVOS_COM_VERSAO_MINIMA).describe("campo ou cidadao"),
      }),
      resposta: {
        status: 200,
        descricao:
          "O aplicativo pedido e a versão mínima configurada (maior.menor.correção), ou null quando não há mínimo.",
        esquema: z.object({
          aplicativo: z.enum(APLICATIVOS_COM_VERSAO_MINIMA),
          versaoMinima: z.string().nullable(),
        }),
      },
      erros: ["nao_encontrado"],
      nova: true,
    }),
  ],
  pendentes: [],
};
