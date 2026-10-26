import { z } from "zod";
import { PAPEIS } from "@dc360/shared";
import { registroSchema, revogacaoSchema } from "../../rotas/aparelhos.js";
import { consultaSchema as consultaDeAvisosSchema, leituraSchema } from "../../rotas/avisos.js";
import { confirmacaoSchema, pedidoSchema } from "../../rotas/usuarios-eu.js";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * A pessoa sobre a própria conta e o que o aplicativo precisa saber do
 * ambiente: `rotas/usuarios-eu.ts`, `aparelhos.ts`, `avisos.ts`,
 * `configuracao.ts` e `armazenamento.ts`. Parte 3C1 do lote 3.
 *
 * Os esquemas de ENTRADA são os que os handlers aplicam (exportados das
 * rotas). Os de RESPOSTA moram aqui, fiéis ao que o handler devolve, e
 * `test/contrato-conta-administracao-respostas.test.ts` confere uma resposta real, por
 * `inject`, contra cada um.
 */

/** O vocabulário do tipo do aviso mora no CHECK do banco (migrações 018 e 031). */
const avisoSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  ocorrenciaId: z.string().uuid(),
  protocolo: z.string(),
  criadoEm: z.string(),
  detalhe: z.string().nullable(),
  lido: z.boolean(),
});

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
      metodo: "POST",
      caminho: "/v1/usuarios/eu/foto/autorizar-envio",
      resumo:
        "Pede a autorização para enviar a foto de perfil: o servidor decide a chave e emite a URL de escrita.",
      corpo: pedidoSchema,
      resposta: {
        status: 201,
        descricao:
          "A chave (sob o prefixo da própria pessoa), a URL pré-assinada de vida curta, os " +
          "cabeçalhos que o envio precisa levar e o instante em que a URL vence.",
        esquema: z.object({
          chave: z.string(),
          url: z.string(),
          cabecalhos: z.record(z.string(), z.string()),
          expiraEm: z.string(),
        }),
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "teto_de_armazenamento"],
    }),
    rota({
      metodo: "PUT",
      caminho: "/v1/usuarios/eu/foto",
      resumo: "Confirma a foto enviada: grava a chave e só então apaga a foto anterior.",
      corpo: confirmacaoSchema,
      resposta: {
        status: 200,
        descricao: "A URL de leitura da foto nova (vence em minutos; a chave crua não sai).",
        esquema: z.object({ fotoUrl: z.string() }),
      },
      erros: [
        ...ERROS_AUTENTICADA,
        "dados_invalidos",
        "chave_fora_do_lugar",
        "arquivo_ausente",
        "arquivo_grande_demais",
        "teto_de_armazenamento",
      ],
    }),
    rota({
      metodo: "DELETE",
      caminho: "/v1/usuarios/eu/foto",
      resumo: "Remove a foto da própria conta (204 mesmo quando não havia foto).",
      resposta: { status: 204, descricao: "Sem corpo." },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/aparelhos",
      resumo: "Registra (ou atualiza) o aparelho de quem está logado para receber notificação.",
      corpo: registroSchema,
      resposta: {
        status: 200,
        descricao:
          "O identificador da linha do aparelho; a ficha de push nunca volta numa resposta.",
        esquema: z.object({ id: z.string().uuid(), registrado: z.literal(true) }),
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "push_desligado", "push_android_desligado"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/aparelhos/revogar",
      resumo: "Revoga o aparelho de quem está logado (204 mesmo quando não havia o que revogar).",
      corpo: revogacaoSchema,
      resposta: { status: 204, descricao: "Sem corpo." },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "push_desligado"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/avisos",
      resumo:
        "O sino de avisos: o que mudou no município desde o cursor devolvido na resposta anterior.",
      consulta: consultaDeAvisosSchema,
      resposta: {
        status: 200,
        descricao:
          "Os avisos em ordem crescente (o corte do teto deixa de fora os mais novos), o cursor " +
          "`ate` mais `ateId` para a pergunta seguinte, o teto, se a lista foi cortada " +
          "(`truncada`) e quantos avisos a pessoa ainda não leu (a contagem também tem teto).",
        esquema: z.object({
          ate: z.string(),
          ateId: z.string().uuid().nullable(),
          itens: z.array(avisoSchema),
          teto: z.number().int().positive(),
          truncada: z.boolean(),
          naoLidos: z.number().int().min(0),
          naoLidosTruncado: z.boolean(),
        }),
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/avisos/lidos",
      resumo: "Marca como lidos os avisos informados, só os que a pessoa pode ver.",
      corpo: leituraSchema,
      resposta: {
        status: 200,
        descricao:
          "Quantos foram marcados; aviso de outro município ou fora do recorte conta zero, " +
          "igual a um identificador que não existe.",
        esquema: z.object({ marcados: z.number().int().min(0) }),
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/configuracao",
      resumo:
        "O que o painel precisa saber do ambiente (a chave do mapa), igual para todos os municípios.",
      resposta: {
        status: 200,
        descricao: "A chave do mapa (vazia quando não há) e se o mapa está autorizado.",
        esquema: z.object({ chaveDoMapa: z.string(), mapaAutorizado: z.boolean() }),
      },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/armazenamento/uso",
      resumo: "Quanto o município ocupa do armazenamento e qual é o teto dele.",
      resposta: {
        status: 200,
        descricao:
          "Bytes usados, teto e margem (nulos quando o município não tem teto) e a situação " +
          "calculada pelo banco.",
        esquema: z.object({
          bytesUsados: z.number().int().min(0),
          tetoBytes: z.number().int().min(0).nullable(),
          margemBytes: z.number().int().min(0).nullable(),
          situacao: z.enum(["sem_teto", "normal", "aviso", "acima_do_teto", "recusado"]),
        }),
      },
      erros: ERROS_AUTORIZADA,
    }),
  ],
  pendentes: [],
};
