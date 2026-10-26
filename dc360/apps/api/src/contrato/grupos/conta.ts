import { z } from "zod";
import { PAPEIS } from "@dc360/shared";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * A pessoa sobre a própria conta e o que o aplicativo precisa saber do
 * ambiente: `rotas/usuarios-eu.ts`, `aparelhos.ts`, `avisos.ts`,
 * `configuracao.ts` e `armazenamento.ts`. Parte 3C1 do lote 3.
 *
 * Em `pendentes`, as rotas com esquema de corpo ou de query dentro do arquivo
 * da rota (`pedidoSchema`/`confirmacaoSchema` da foto, `registroSchema` e
 * `revogacaoSchema` de aparelho, `consultaSchema` e `leituraSchema` de avisos).
 * A 3C1 os exporta e tira a rota da lista.
 */
export const grupo: GrupoDoContrato = {
  nome: "conta",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/usuarios/eu",
      resumo: "Lê o cadastro da própria conta, com a URL de leitura da foto.",
      resposta: {
        status: 200,
        descricao: "O cadastro da pessoa; `fotoUrl` é nula quando não há foto.",
        esquema: z.object({
          id: z.string().uuid(),
          nome: z.string(),
          matricula: z.string(),
          email: z.string(),
          papel: z.enum(PAPEIS),
          equipeId: z.string().uuid().nullable(),
          fotoUrl: z.string().nullable(),
        }),
      },
      erros: [...ERROS_AUTENTICADA, "nao_encontrado"],
    }),
    rota({
      metodo: "DELETE",
      caminho: "/v1/usuarios/eu/foto",
      resumo: "Remove a foto da própria conta (204 mesmo quando não havia foto).",
      resposta: { status: 204, descricao: "Sem corpo." },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/configuracao",
      resumo:
        "O que o painel precisa saber do ambiente (a chave do mapa), igual para todos os municípios.",
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/armazenamento/uso",
      resumo: "Quanto o município ocupa do armazenamento e qual é o teto dele.",
      erros: ERROS_AUTORIZADA,
    }),
  ],
  pendentes: [
    "POST /v1/usuarios/eu/foto/autorizar-envio",
    "PUT /v1/usuarios/eu/foto",
    "POST /v1/aparelhos",
    "POST /v1/aparelhos/revogar",
    "GET /v1/avisos",
    "POST /v1/avisos/lidos",
  ],
};
