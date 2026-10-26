import { z } from "zod";
import { PAPEIS, TIPOS_DE_ENTRADA } from "@dc360/shared";
import {
  filtroConsultasSchema,
  filtroExportacaoSchema,
  filtroTrilhaSchema,
  nivelDaExportacaoSchema,
} from "../../rotas/prestacao-de-contas.js";
import { ERROS_AUTORIZADA } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Prestação de contas: trilha, relatórios e a saída do município
 * (`rotas/prestacao-de-contas.ts` e `rotas/saida.ts`). Parte 3C3 do lote 3.
 *
 * Os filtros são os esquemas que o handler aplica, exportados do arquivo da
 * rota. O CSV e o ZIP são ARQUIVOS: a `resposta` deles leva o tipo de mídia, sem
 * esquema JSON, e o nome do arquivo vem no cabeçalho `Content-Disposition:
 * attachment` (dito na `descricao`, porque o registro ainda não tem campo para
 * cabeçalho). Os esquemas de RESPOSTA das rotas JSON moram aqui, descrevendo a
 * linha do banco como o handler a devolve (nomes de coluna em snake_case nas
 * listas; camelCase no resumo, que o handler monta). O teste
 * `contrato-respostas-3c3.test.ts` confere uma resposta real contra cada um.
 */

/**
 * A query de `GET /relatorios/ocorrencias.csv`. O handler aplica DOIS esquemas
 * à mesma query (`filtroExportacaoSchema` e `nivelDaExportacaoSchema`); o
 * contrato descreve a junção deles, mantendo a regra da justificativa (o nível
 * completo exige justificativa escrita) que sai como `x-regras-adicionais`.
 */
export const consultaDoCsvSchema = nivelDaExportacaoSchema.safeExtend(filtroExportacaoSchema.shape);

const itemDaTrilhaSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  autor_nome: z.string(),
  autor_papel: z.enum(PAPEIS),
  origem: z.enum(["campo", "escritorio"]),
  ocorrido_em: z.string(),
  registrado_em: z.string(),
  /** O detalhe do evento: um objeto livre por tipo de evento, ou nulo. */
  detalhe: z.unknown(),
  ocorrencia_id: z.string().uuid(),
  protocolo: z.string(),
  endereco: z.string(),
});

/** `GET /v1/trilha`: uma página de eventos, do mais recente ao mais antigo. */
export const respostaDaTrilhaSchema = z.object({
  itens: z.array(itemDaTrilhaSchema),
  total: z.number().int(),
  pagina: z.number().int(),
  porPagina: z.number().int(),
});

/** `GET /v1/trilha/tipos`. */
export const respostaDosTiposDaTrilhaSchema = z.object({
  itens: z.array(z.object({ tipo: z.string(), total: z.number().int() })),
});

/** `GET /v1/relatorios/resumo`: os números do período (mediana, não média). */
export const respostaDoResumoSchema = z.object({
  total: z.number().int(),
  encerradas: z.number().int(),
  criticas: z.number().int(),
  comVulnerabilidade: z.number().int(),
  medianaHorasAteEncerrar: z.number().nullable(),
  porTipo: z.array(
    z.object({ tipo: z.enum(TIPOS_DE_ENTRADA), rotulo: z.string(), total: z.number().int() }),
  ),
  porBairro: z.array(z.object({ bairro: z.string(), total: z.number().int() })),
});

/** `GET /v1/relatorios/exportacoes`: as últimas 200 operações de exportação. */
export const respostaDasExportacoesSchema = z.object({
  itens: z.array(
    z.object({
      id: z.string().uuid(),
      usuario_nome: z.string(),
      tipo: z.string(),
      /** O recorte usado (`de`, `ate`, `status`...). */
      filtros: z.record(z.string(), z.unknown()),
      total_registros: z.number().int(),
      criada_em: z.string(),
    }),
  ),
});

/** `GET /v1/relatorios/consultas`: quem consultou dado de cidadão. Sem o endereço de rede. */
export const respostaDasConsultasSchema = z.object({
  itens: z.array(
    z.object({
      id: z.string().uuid(),
      usuario_nome: z.string(),
      usuario_papel: z.enum(PAPEIS),
      recurso: z.string(),
      finalidade: z.string(),
      consultada_em: z.string(),
      ocorrencia_id: z.string().uuid(),
      protocolo: z.string(),
    }),
  ),
  total: z.number().int(),
  pagina: z.number().int(),
  porPagina: z.number().int(),
});

export const grupo: GrupoDoContrato = {
  nome: "prestacao-de-contas",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/trilha",
      resumo: "Lista a trilha de auditoria do município, com filtros e paginação.",
      consulta: filtroTrilhaSchema,
      resposta: {
        status: 200,
        descricao:
          "Uma página de eventos da trilha (autor, papel, ocorrência de origem), filtrada pela hora " +
          "em que o SERVIDOR registrou o evento.",
        esquema: respostaDaTrilhaSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/trilha/tipos",
      resumo: "Lista os tipos de evento da trilha de auditoria, para a tela montar o filtro.",
      resposta: {
        status: 200,
        descricao: "Cada tipo de evento que existe no município e quantas vezes ocorreu.",
        esquema: respostaDosTiposDaTrilhaSchema,
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/relatorios/ocorrencias.csv",
      resumo:
        "Exporta as ocorrências em CSV, no nível básico (sem dado pessoal) ou completo (com justificativa).",
      consulta: consultaDoCsvSchema,
      resposta: {
        status: 200,
        descricao:
          "O CSV em UTF-8. Cabeçalho Content-Disposition: attachment; filename=" +
          '"ocorrencias-AAAA-MM-DD.csv" (nível básico) ou "ocorrencias-com-dados-pessoais-AAAA-MM-DD.csv" ' +
          "(nível completo). Toda exportação fica registrada.",
        tipo: "text/csv",
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "posto_insuficiente_para_dado_pessoal",
        "recorte_grande_demais",
      ],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/relatorios/resumo",
      resumo:
        "Números do período para a conversa com a chefia (total, encerradas, mediana de tempo).",
      consulta: filtroExportacaoSchema,
      resposta: {
        status: 200,
        descricao:
          "Totais do período, tempo mediano até encerrar, ocorrências por tipo e os dez trechos de " +
          "endereço com mais chamados.",
        esquema: respostaDoResumoSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/relatorios/exportacoes",
      resumo: "Quem exportou o quê e quando (registro de operações da LGPD).",
      resposta: {
        status: 200,
        descricao: "As últimas 200 exportações do município, da mais recente para a mais antiga.",
        esquema: respostaDasExportacoesSchema,
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/relatorios/consultas",
      resumo: "Quem consultou dado de cidadão, e sobre qual ocorrência (registro de acesso).",
      consulta: filtroConsultasSchema,
      resposta: {
        status: 200,
        descricao:
          "Uma página de consultas registradas. O endereço de rede de quem consultou fica gravado e " +
          "não sai por esta rota.",
        esquema: respostaDasConsultasSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida/pacote.zip",
      resumo:
        "Gera o pacote de saída do município: ato do administrador, que exige duas permissões.",
      resposta: {
        status: 200,
        descricao:
          "O pacote ZIP com tudo que é do município, em fluxo e sem Content-Length. Cabeçalho " +
          'Content-Disposition: attachment; filename="saida-<município>-<uf>-AAAA-MM-DD.zip". O pedido ' +
          "fica registrado antes do primeiro byte; nada é apagado.",
        tipo: "application/zip",
      },
      erros: ERROS_AUTORIZADA,
    }),
  ],
  pendentes: [],
};
