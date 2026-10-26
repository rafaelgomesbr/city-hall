import { z } from "zod";
import { consultaDosOficiosSchema, emissaoSchema, envioSchema } from "../../rotas/oficios.js";
import { consultaDosOrgaosSchema, desativacaoSchema, orgaoSchema } from "../../rotas/orgaos.js";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA, parametroId } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Ofícios aos órgãos e o catálogo de órgãos (`rotas/oficios.ts` e
 * `rotas/orgaos.ts`). Parte 3C3 do lote 3.
 *
 * Os esquemas de ENTRADA (`emissaoSchema`, `envioSchema`, `orgaoSchema`,
 * `desativacaoSchema` e as duas queries) são os que o handler aplica, exportados
 * dos arquivos das rotas. Os de RESPOSTA moram aqui: as rotas devolvem a linha
 * do banco montada na mão (nomes de coluna em snake_case, como saem do SQL), sem
 * esquema compartilhado, e o contrato as descreve como elas são. O teste
 * `contrato-respostas-3c3.test.ts` confere uma resposta real contra cada um.
 */

/* ---------------------------------------------------------------------------
   Ofícios
   ------------------------------------------------------------------------ */

const itemDaListaDeOficiosSchema = z.object({
  id: z.string().uuid(),
  numero: z.string(),
  emitido_em: z.string(),
  emitido_por_nome: z.string(),
  ocorrencia_id: z.string().uuid(),
  providencia_id: z.string().uuid(),
  orgao_nome: z.string(),
  orgao_sigla: z.string().nullable(),
  envios: z.number().int(),
  ultimo_envio: z.string().nullable(),
  aberto_em: z.string().nullable(),
});

/** `GET /v1/oficios`. */
export const respostaDaListaDeOficiosSchema = z.object({
  itens: z.array(itemDaListaDeOficiosSchema),
});

/** `POST /v1/oficios`: o que a emissão devolve. */
export const respostaDaEmissaoSchema = z.object({
  id: z.string().uuid(),
  numero: z.string(),
});

const envioDoOficioSchema = z.object({
  id: z.string().uuid(),
  tentativa: z.number().int(),
  destinatario_email: z.string(),
  solicitado_em: z.string(),
  solicitado_por_nome: z.string(),
  desfecho: z.enum(["enviando", "entregue", "falha"]),
  detalhe: z.string().nullable(),
  provedor_id: z.string().nullable(),
  expira_em: z.string(),
});

const aberturaDoOficioSchema = z.object({
  envio_id: z.string().uuid(),
  resultado: z.enum(["entregue", "recusado_ja_aberto", "recusado_expirado"]),
  registrado_em: z.string(),
  ip: z.string().nullable(),
});

/** `GET /v1/oficios/:id`: a ficha, sem o token nem o hash do link. */
export const respostaDaFichaDoOficioSchema = z.object({
  id: z.string().uuid(),
  numero: z.string(),
  observacoes: z.string().nullable(),
  emitido_em: z.string(),
  emitido_por_nome: z.string(),
  ocorrencia_id: z.string().uuid(),
  providencia_id: z.string().uuid(),
  orgao_nome: z.string(),
  orgao_sigla: z.string().nullable(),
  orgao_email: z.string().nullable(),
  envios: z.array(envioDoOficioSchema),
  aberturas: z.array(aberturaDoOficioSchema),
});

/** `POST /v1/oficios/:id/envio`: o endereço volta encoberto (`a***@dominio`). */
export const respostaDoEnvioSchema = z.object({
  tentativa: z.number().int(),
  destinatario: z.string(),
  expiraEmHoras: z.number(),
  restantes: z.number().int(),
});

/* ---------------------------------------------------------------------------
   Órgãos
   ------------------------------------------------------------------------ */

const itemDoCatalogoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  sigla: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  ativo: z.boolean(),
  desativado_em: z.string().nullable(),
  motivo_desativacao: z.string().nullable(),
  providencias: z.number().int(),
  abertas: z.number().int(),
});

/** `GET /v1/orgaos`: cada órgão com a contagem de providências (total e sem resposta). */
export const respostaDoCatalogoSchema = z.object({
  itens: z.array(itemDoCatalogoSchema),
});

/** `POST /v1/orgaos`. */
export const respostaDoOrgaoCriadoSchema = z.object({ id: z.string().uuid() });

/** `PATCH /v1/orgaos/:id`. */
export const respostaDoOrgaoEditadoSchema = z.object({ id: z.string().uuid() });

/** `POST /v1/orgaos/:id/desativacao`. */
export const respostaDaDesativacaoSchema = z.object({
  id: z.string().uuid(),
  ativo: z.literal(false),
});

/** `POST /v1/orgaos/:id/reativacao`. */
export const respostaDaReativacaoSchema = z.object({
  id: z.string().uuid(),
  ativo: z.literal(true),
});

export const grupo: GrupoDoContrato = {
  nome: "oficios-e-orgaos",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/oficios",
      resumo: "Lista os ofícios emitidos pelo município, ou os de uma ocorrência.",
      consulta: consultaDosOficiosSchema,
      resposta: {
        status: 200,
        descricao:
          "Os ofícios do município, do mais recente ao mais antigo, com o órgão de destino, o número " +
          "de envios e quando o link foi aberto.",
        esquema: respostaDaListaDeOficiosSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/oficios",
      resumo: "Emite o ofício de uma providência, reservando o próximo número do município.",
      corpo: emissaoSchema,
      resposta: {
        status: 201,
        descricao: "O ofício emitido: identificador e número (um por providência).",
        esquema: respostaDaEmissaoSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada", "ja_emitido"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/oficios/:id",
      resumo: "Lê um ofício emitido pelo município.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "A ficha do ofício com as tentativas de envio e as aberturas do link. Nunca devolve o " +
          "token do link nem o hash dele.",
        esquema: respostaDaFichaDoOficioSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrado"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/oficios/:id/documento",
      resumo: "Abre o documento do ofício emitido.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao: "O ofício de encaminhamento em HTML pronto para impressão (UTF-8).",
        tipo: "text/html",
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrado"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/oficios/:id/envio",
      resumo: "Envia, ou reenvia, o ofício por email ao órgão, com um link de uso único.",
      parametros: parametroId,
      /* O handler lê `req.body ?? {}`: o corpo todo é opcional (padrão: o email do órgão). */
      corpo: envioSchema.optional(),
      resposta: {
        status: 202,
        descricao:
          "O provedor aceitou a mensagem. O endereço volta encoberto, com as horas de validade do " +
          "link e quantos reenvios restam.",
        esquema: respostaDoEnvioSchema,
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "nao_encontrado",
        "envio_desligado",
        "orgao_desativado",
        "orgao_sem_email",
        "teto_de_envios",
        "dominio_nao_autorizado",
        "envio_falhou",
      ],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/orgaos",
      resumo: "Lista o catálogo de órgãos de destino do município.",
      consulta: consultaDosOrgaosSchema,
      resposta: {
        status: 200,
        descricao:
          "Os órgãos (só os ativos, ou todos com incluirInativos), cada um com quantas providências " +
          "recebeu e quantas estão sem resposta.",
        esquema: respostaDoCatalogoSchema,
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/orgaos",
      resumo: "Cadastra um órgão no catálogo do município.",
      corpo: orgaoSchema,
      resposta: {
        status: 201,
        descricao: "O identificador do órgão criado.",
        esquema: respostaDoOrgaoCriadoSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "orgao_repetido"],
    }),
    rota({
      metodo: "PATCH",
      caminho: "/v1/orgaos/:id",
      resumo: "Edita nome, sigla, email e telefone de um órgão do catálogo.",
      parametros: parametroId,
      corpo: orgaoSchema,
      resposta: {
        status: 200,
        descricao: "O identificador do órgão editado.",
        esquema: respostaDoOrgaoEditadoSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrado", "orgao_repetido"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/orgaos/:id/desativacao",
      resumo: "Desativa um órgão do catálogo com motivo escrito (órgão não se apaga).",
      parametros: parametroId,
      corpo: desativacaoSchema,
      resposta: {
        status: 200,
        descricao: "O órgão desativado.",
        esquema: respostaDaDesativacaoSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrado", "ja_desativado"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/orgaos/:id/reativacao",
      resumo: "Reativa um órgão do catálogo (órgão se desativa em vez de sumir).",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao: "O órgão reativado.",
        esquema: respostaDaReativacaoSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrado", "ja_ativo"],
    }),
  ],
  pendentes: [],
};
