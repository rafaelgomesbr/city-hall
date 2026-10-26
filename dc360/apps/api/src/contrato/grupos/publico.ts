import { z } from "zod";
import { interesseMunicipioSchema } from "@dc360/shared";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * O que responde sem token (`rotas/interesse.ts`). Parte 3C3 do lote 3.
 *
 * O ofício público (`GET /publico/oficio/:token`) e as URLs assinadas do
 * armazenamento NÃO entram: ficam fora do `/v1` (`ROTAS_FORA_DO_PREFIXO`), e o
 * documento descreve só o `/v1`.
 */
export const grupo: GrupoDoContrato = {
  nome: "publico",
  rotas: [
    rota({
      metodo: "POST",
      caminho: "/v1/publico/interesse",
      resumo:
        "Formulário público de contato de um município interessado (sem token; não cria município).",
      corpo: interesseMunicipioSchema,
      resposta: {
        status: 202,
        descricao:
          "Sempre a mesma resposta, tenha o pedido sido gravado agora ou recusado pela janela de seis horas.",
        esquema: z.object({ recebido: z.literal(true), mensagem: z.string() }),
      },
      erros: ["dados_invalidos"],
    }),
  ],
  pendentes: [],
};
