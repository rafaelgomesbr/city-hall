import { z } from "zod";
import { codigoSchema } from "../../rotas/documentos.js";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA, parametroId } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Documentos técnicos de uma ocorrência (`rotas/documentos.ts`). Parte 3C3 do
 * lote 3.
 *
 * As seis rotas estão descritas. Cinco devolvem um ARQUIVO, e por isso a
 * `resposta` delas leva o tipo de mídia e não um esquema JSON: o laudo e os
 * termos saem em HTML pronto para impressão (`text/html`) ou em PDF
 * (`application/pdf`). O PDF acrescenta o cabeçalho `Content-Disposition:
 * inline; filename="<documento>-<oito primeiros caracteres do id>.pdf"`; o
 * registro do contrato ainda não tem campo para cabeçalho, então ele é dito na
 * `descricao` da resposta.
 *
 * Estas rotas são GET que ESCREVEM (emitir o termo de interdição É interditar,
 * e todo acesso fica registrado na trilha): o contrato lista, por isso, os
 * códigos de recusa de negócio (409) que cada documento pode devolver.
 *
 * O único corpo JSON do grupo é o de `GET /documentos/validar/:codigo`, e o
 * esquema dele (`respostaDaValidacaoSchema`) mora aqui: o handler monta o
 * objeto na mão, sem esquema compartilhado.
 */

/** Uma emissão de documento técnico (laudo ou termo) que o identificador do rodapé confere. */
const validacaoDeDocumentoSchema = z.object({
  codigo: z.string(),
  documento: z.string(),
  protocolo: z.string(),
  ocorrenciaId: z.string().uuid(),
  vistoriaId: z.string().uuid(),
  formato: z.string(),
  emitidoEm: z.string(),
  emitidoPor: z.string(),
});

/** Um ofício de encaminhamento que o identificador do rodapé confere. */
const validacaoDeOficioSchema = z.object({
  codigo: z.string(),
  documento: z.literal("oficio"),
  numero: z.string(),
  protocolo: z.string(),
  ocorrenciaId: z.string().uuid(),
  oficioId: z.string().uuid(),
  emitidoEm: z.string(),
  emitidoPor: z.string(),
});

/** O que `GET /documentos/validar/:codigo` devolve: uma das duas formas, conforme o que emitiu o identificador. */
export const respostaDaValidacaoSchema = z.union([
  validacaoDeDocumentoSchema,
  validacaoDeOficioSchema,
]);

/** Os códigos que as rotas de documento por ocorrência compartilham. */
const ERROS_DO_DOCUMENTO = [
  ...ERROS_AUTORIZADA,
  "dados_invalidos",
  "nao_encontrada",
  "sem_vistoria",
] as const;

/** O termo de interdição é ato: além dos acima, recusa o que o ato não pode ser. */
const ERROS_DO_TERMO_DE_INTERDICAO = [
  ...ERROS_DO_DOCUMENTO,
  "interdicao_nao_indicada",
  "sem_despacho",
  "ocorrencia_encerrada",
  "estado_mudou",
] as const;

export const grupo: GrupoDoContrato = {
  nome: "documentos",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/laudo",
      resumo: "Emite o laudo técnico de uma ocorrência.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "O laudo de vistoria em HTML pronto para impressão (UTF-8). O acesso fica registrado na trilha.",
        tipo: "text/html",
      },
      erros: [...ERROS_DO_DOCUMENTO],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/laudo.pdf",
      resumo: "Emite o laudo técnico de uma ocorrência em PDF.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "O mesmo laudo em PDF, gerado na hora. Cabeçalho Content-Disposition: inline; " +
          'filename="laudo-de-vistoria-<oito primeiros caracteres do id>.pdf".',
        tipo: "application/pdf",
      },
      erros: [...ERROS_DO_DOCUMENTO, "pdf_indisponivel"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/termo-de-interdicao",
      resumo: "Emite o termo de interdição de uma ocorrência.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "O termo de interdição em HTML pronto para impressão (UTF-8). A primeira emissão É o ato de " +
          "interditar; as seguintes são segunda via.",
        tipo: "text/html",
      },
      erros: [...ERROS_DO_TERMO_DE_INTERDICAO],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/termo-de-interdicao.pdf",
      resumo: "Emite o termo de interdição de uma ocorrência em PDF.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "O mesmo termo em PDF. Só interdita depois que o PDF foi gerado. Cabeçalho " +
          'Content-Disposition: inline; filename="termo-de-interdicao-<oito primeiros caracteres do id>.pdf".',
        tipo: "application/pdf",
      },
      erros: [...ERROS_DO_TERMO_DE_INTERDICAO, "pdf_indisponivel"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/:id/termo-de-desinterdicao",
      resumo: "Emite o termo de desinterdição de uma ocorrência.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "O termo de desinterdição em HTML pronto para impressão (UTF-8). Não desinterdita: o " +
          "levantamento já foi registrado antes.",
        tipo: "text/html",
      },
      erros: [...ERROS_DO_DOCUMENTO, "nao_desinterditada"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/documentos/validar/:codigo",
      resumo:
        "Confere a que emissão (documento técnico ou ofício) do município corresponde o identificador do rodapé.",
      parametros: codigoSchema,
      resposta: {
        status: 200,
        descricao:
          "A emissão que gerou o identificador: protocolo, documento, instante e quem emitiu. Não " +
          "valida o conteúdo e não devolve dado do cidadão.",
        esquema: respostaDaValidacaoSchema,
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "nao_encontrado"],
    }),
  ],
  pendentes: [],
};
