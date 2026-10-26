import { z } from "zod";
import {
  CANAIS_ENTRADA,
  DESFECHOS_PROVIDENCIA,
  MOTIVOS_DE_DEVOLUCAO,
  ORIGENS,
  SEVERIDADES,
  STATUS_OCORRENCIA,
  TIPOS_DE_ENTRADA,
  aberturaOcorrenciaSchema,
  correcaoDeCoordenadaSchema,
  desinterdicaoSchema,
  despachoSchema,
  encerramentoSchema,
  respostaProvidenciaSchema,
  triagemSchema,
} from "@dc360/shared";
import {
  consultaDeDuplicidadesSchema,
  consultaMapaSchema,
  consultaSchema,
  providenciaComOrgaoSchema,
} from "../../rotas/ocorrencias.js";
import {
  ERROS_AUTENTICADA,
  ERROS_AUTORIZADA,
  parametroId,
  parametroIdEProvidencia,
} from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Ocorrências (`rotas/ocorrencias.ts`). Parte 3C2 do lote 3.
 *
 * Todas as rotas do grupo têm entrada. Os esquemas de pedido que moravam DENTRO
 * de `rotas/ocorrencias.ts` (`consultaSchema`, `consultaMapaSchema`, a query de
 * duplicidades e `providenciaComOrgaoSchema`) foram exportados de lá, sem mudar
 * uma linha do que o handler aceita: o contrato descreve o MESMO objeto que a
 * rota aplica, e não uma cópia.
 *
 * Os esquemas de RESPOSTA abaixo são deste arquivo (o pacote compartilhado não
 * os tem) e seguem o que o handler devolve, linha a linha. Várias respostas são
 * a linha do banco como veio (`o.*`, `SELECT *`), com o nome de coluna do banco
 * (`solicitante_nome`, `criado_em`...); o documento diz isso do jeito que é, e
 * `test/contrato-3c2-respostas.test.ts` confere uma resposta real de cada rota
 * contra o esquema (e que nenhum campo é cortado).
 *
 * Quando a rota responde 200 numa repetição e 201 na primeira vez
 * (`POST /v1/ocorrencias`), o registro só comporta um status de sucesso: vai o
 * 201 e a frase da descrição conta o 200.
 */

const uuid = z.string().uuid();
const instante = z.string();
const anulavel = <T extends z.ZodType>(esquema: T) => esquema.nullable();

/** Um ponto como a API o devolve nas correções de coordenada. */
const pontoDaCoordenada = z.object({ lat: z.number(), lng: z.number() });

/**
 * A linha de `ocorrencias` inteira, mais o nome da equipe: o que `GET /:id`
 * devolve em `ocorrencia`. Nomes de coluna do banco.
 */
const linhaDeOcorrencia = z.object({
  id: uuid,
  organizacao_id: uuid,
  protocolo: z.string(),
  tipo: z.enum(TIPOS_DE_ENTRADA),
  tipo_descricao: anulavel(z.string()),
  status: z.enum(STATUS_OCORRENCIA),
  severidade: anulavel(z.enum(SEVERIDADES)),
  vulnerabilidade_presente: z.boolean(),
  vulnerabilidade_descricao: anulavel(z.string()),
  vulnerabilidade_removida_em: anulavel(instante),
  endereco: z.string(),
  ponto_referencia: anulavel(z.string()),
  latitude: anulavel(z.number()),
  longitude: anulavel(z.number()),
  solicitante_nome: z.string(),
  solicitante_contato: anulavel(z.string()),
  solicitante_removido_em: anulavel(instante),
  canal_entrada: z.enum(CANAIS_ENTRADA),
  descricao: z.string(),
  descricao_removida_em: anulavel(instante),
  equipe_id: anulavel(uuid),
  equipe_nome: anulavel(z.string()),
  vinculada_a: anulavel(uuid),
  prazo_em: anulavel(instante),
  criado_em: instante,
  encerrado_em: anulavel(instante),
  motivo_encerramento: anulavel(z.string()),
  interditada_em: anulavel(instante),
  interditada_por: anulavel(uuid),
  desinterditada_em: anulavel(instante),
  desinterditada_por: anulavel(uuid),
  desinterdicao_motivo: anulavel(z.string()),
  busca: anulavel(z.string()),
  chave_de_criacao: anulavel(uuid),
});

/**
 * A linha da LISTA: a mesma, sem as quatro colunas que só o dossiê entrega
 * (`privacidade/lista.ts`: contato, relato, descrição de vulnerabilidade e a
 * chave de busca).
 */
const linhaDaLista = linhaDeOcorrencia.omit({
  solicitante_contato: true,
  descricao: true,
  vulnerabilidade_descricao: true,
  busca: true,
});

/** A vistoria que o dossiê mostra: `v.*` mais o nome do agente. */
const linhaDeVistoria = z.object({
  id: uuid,
  organizacao_id: uuid,
  ocorrencia_id: uuid,
  agente_id: anulavel(uuid),
  agente_nome: anulavel(z.string()),
  checklist: z.unknown().describe("As respostas do checklist, como foram coletadas."),
  gps_precisao_metros: anulavel(z.number()),
  latitude: anulavel(z.number()),
  longitude: anulavel(z.number()),
  assinante_nome: z.string(),
  assinatura_chave: anulavel(z.string()),
  observacoes: anulavel(z.string()),
  observacoes_removidas_em: anulavel(instante),
  coletada_em: instante,
  sincronizada_em: instante,
  idempotency_key: uuid,
  desalojados: anulavel(z.number().int()),
  desabrigados: anulavel(z.number().int()),
  feridos: anulavel(z.number().int()),
  desaparecidos: anulavel(z.number().int()),
  obitos: anulavel(z.number().int()),
  equipe_designada_id: anulavel(uuid),
  equipe_do_agente_id: anulavel(uuid),
});

/** A providência do dossiê: a linha de `providencias` inteira. */
const linhaDeProvidencia = z.object({
  id: uuid,
  organizacao_id: uuid,
  ocorrencia_id: uuid,
  orgao_id: uuid,
  orgao_destino: z.string(),
  descricao: z.string(),
  responsavel: z.string(),
  prazo_em: instante,
  encaminhada_em: instante,
  respondida_em: anulavel(instante),
  resposta: anulavel(z.string()),
  respondida_por: anulavel(z.string()),
  desfecho: anulavel(z.enum(DESFECHOS_PROVIDENCIA)),
});

/** Um evento da trilha, sem a organização (o dossiê não a entrega). */
const eventoDaTrilha = z.object({
  id: uuid,
  tipo: z.string(),
  autor_nome: z.string(),
  autor_papel: z.string(),
  origem: z.enum(ORIGENS),
  ocorrido_em: instante,
  registrado_em: instante,
  detalhe: anulavel(z.record(z.string(), z.unknown())),
});

/** A ocorrência ligada por duplicidade (de que esta é continuação, ou que a continua). */
const ocorrenciaLigada = z.object({
  id: uuid,
  protocolo: z.string(),
  status: z.enum(STATUS_OCORRENCIA),
  endereco: z.string(),
  criado_em: instante,
});

const respostaDoDossie = z.object({
  ocorrencia: linhaDeOcorrencia,
  trilha: z.array(eventoDaTrilha),
  vistoria: anulavel(linhaDeVistoria),
  providencias: z.array(linhaDeProvidencia),
  vinculadaA: anulavel(ocorrenciaLigada),
  vinculadas: z.array(ocorrenciaLigada),
  devolucao: anulavel(
    z.object({
      decidida_em: instante,
      motivo: z.enum(MOTIVOS_DE_DEVOLUCAO),
      observacao: anulavel(z.string()),
      observacao_removida_em: anulavel(instante),
      prazo_em: instante,
      devolvida_por_nome: anulavel(z.string()),
    }),
  ).describe("A devolução mais recente do campo, com o texto livre do agente."),
});

const respostaDaLista = z.object({
  itens: z.array(linhaDaLista),
  total: z.number().int().describe("Quantas ocorrências casam com o filtro, em todas as páginas."),
  pagina: z.number().int(),
  porPagina: z.number().int(),
});

const respostaDoMapa = z.object({
  itens: z.array(
    z.object({
      id: uuid,
      protocolo: z.string(),
      tipo: z.enum(TIPOS_DE_ENTRADA),
      status: z.enum(STATUS_OCORRENCIA),
      severidade: anulavel(z.enum(SEVERIDADES)),
      endereco: z.string(),
      latitude: z.number(),
      longitude: z.number(),
    }),
  ),
  total: z.number().int().describe("Quantas ocorrências ativas têm coordenada."),
  semCoordenada: z.number().int().describe("Quantas ocorrências ativas não têm coordenada."),
  pagina: z.number().int(),
  porPagina: z.number().int(),
});

const respostaDeDuplicidades = z.object({
  itens: z.array(
    z.object({
      id: uuid,
      protocolo: z.string(),
      endereco: z.string(),
      criado_em: instante,
      status: z.enum(STATUS_OCORRENCIA),
    }),
  ),
});

const respostaDeDevolvidas = z.object({
  itens: z.array(
    z.object({
      id: uuid,
      protocolo: z.string(),
      endereco: z.string(),
      status: z.enum(STATUS_OCORRENCIA),
      severidade: anulavel(z.enum(SEVERIDADES)),
      prazo_em: anulavel(instante),
      devolvida_em: instante,
      devolvida_por_nome: anulavel(z.string()),
      motivo: z.enum(MOTIVOS_DE_DEVOLUCAO),
      tem_observacao: z.boolean(),
    }),
  ),
});

const respostaDeInterditados = z.object({
  itens: z.array(
    z.object({
      id: uuid,
      protocolo: z.string(),
      tipo: z.enum(TIPOS_DE_ENTRADA),
      severidade: anulavel(z.enum(SEVERIDADES)),
      status: z.enum(STATUS_OCORRENCIA),
      endereco: z.string(),
      ponto_referencia: anulavel(z.string()),
      interditada_em: instante,
      interditada_por_nome: anulavel(z.string()),
    }),
  ),
});

const respostaDeProvidenciasPendentes = z.object({
  itens: z.array(
    z.object({
      id: uuid,
      orgao_destino: z.string(),
      descricao: z.string(),
      responsavel: z.string(),
      prazo_em: instante,
      encaminhada_em: instante,
      ocorrencia_id: uuid,
      protocolo: z.string(),
      endereco: z.string(),
      status: z.enum(STATUS_OCORRENCIA),
    }),
  ),
});

const respostaDosIndicadores = z.object({
  na_fila: z.number().int().describe("Ocorrências que não estão encerradas nem em rascunho."),
  em_campo: z.number().int(),
  atrasadas: z.number().int().describe("A mesma conta do filtro `atrasadas` da lista."),
  encerradas_7d: z.number().int(),
  criticas: z.number().int(),
  providencias_abertas: z.number().int(),
  providencias_vencidas: z.number().int(),
});

export const grupo: GrupoDoContrato = {
  nome: "ocorrencias",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias",
      resumo:
        "Lista paginada das ocorrências do município, com filtro de texto, status, severidade e atrasadas (agente de campo só vê as da própria equipe).",
      consulta: consultaSchema,
      resposta: {
        status: 200,
        descricao:
          "A página pedida e o total que casa com o filtro. Cada item é a linha do banco com o nome da equipe, sem contato, relato, descrição de vulnerabilidade e chave de busca (esses só o dossiê entrega).",
        esquema: respostaDaLista,
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias",
      resumo:
        "Abre uma ocorrência a partir de uma solicitação, com protocolo gerado pelo servidor.",
      corpo: aberturaOcorrenciaSchema,
      resposta: {
        status: 201,
        descricao:
          "O chamado criado. Com `chaveDeCriacao` repetida, a rota responde 200 com o mesmo corpo (o chamado que já nasceu, sem gastar protocolo).",
        esquema: z.object({ id: uuid, protocolo: z.string() }),
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/mapa",
      resumo:
        "Os pontos que o mapa desenha (ocorrências ativas com coordenada), com o total e a contagem das que não têm ponto.",
      consulta: consultaMapaSchema,
      resposta: {
        status: 200,
        descricao:
          "Os pontos da página, ordenados da mais grave para a menos grave, mais `total` e `semCoordenada` para a tela dizer a verdade inteira quando o teto corta.",
        esquema: respostaDoMapa,
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/duplicidades/consulta",
      resumo:
        "Procura possíveis duplicidades: mesmo tipo, ativa, nas últimas 48 horas, com o mesmo início de endereço.",
      consulta: consultaDeDuplicidadesSchema,
      resposta: {
        status: 200,
        descricao:
          "Até dez ocorrências parecidas. Vazia quando o trecho de endereço tem menos de quatro letras.",
        esquema: respostaDeDuplicidades,
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/:id",
      resumo:
        "Lê o dossiê de uma ocorrência do município (agente de campo só vê as da própria equipe).",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "O dossiê: a ocorrência, a trilha, a última vistoria, as providências, as ligações de duplicidade e a última devolução do campo. Abrir o dossiê registra a consulta.",
        esquema: respostaDoDossie,
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/triagem",
      resumo: "Registra a triagem: severidade, vulnerabilidade e, se mudar, o tipo COBRADE.",
      parametros: parametroId,
      corpo: triagemSchema,
      resposta: {
        status: 200,
        descricao: "A ocorrência passou a `triagem`.",
        esquema: z.object({ status: z.literal("triagem") }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "nao_encontrada",
        "transicao_invalida",
        "ja_no_estado_final",
        "estado_mudou",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/despacho",
      resumo: "Despacha uma equipe para a ocorrência.",
      parametros: parametroId,
      corpo: despachoSchema,
      resposta: {
        status: 200,
        descricao: "A ocorrência passou a `em_campo`; o aviso da tarefa nova foi enfileirado.",
        esquema: z.object({ status: z.literal("em_campo") }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "nao_encontrada",
        "transicao_invalida",
        "ja_no_estado_final",
        "estado_mudou",
        "tipo_a_classificar",
        "equipe_inexistente",
        "equipe_inativa",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/providencia",
      resumo:
        "Encaminha uma providência a um órgão (pelo catálogo, com `orgaoId`, ou pelo nome, com `orgaoDestino`).",
      parametros: parametroId,
      corpo: providenciaComOrgaoSchema,
      resposta: {
        status: 200,
        descricao:
          "A ocorrência passou a `providencia_pendente`; `orgaoDestino` é o nome que o encaminhamento levou.",
        esquema: z.object({
          status: z.literal("providencia_pendente"),
          orgaoDestino: z.string(),
        }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "nao_encontrada",
        "transicao_invalida",
        "ja_no_estado_final",
        "estado_mudou",
        "orgao_nao_encontrado",
        "orgao_desativado",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/providencia/:providenciaId/resposta",
      resumo: "Registra a resposta do órgão a uma providência encaminhada.",
      parametros: parametroIdEProvidencia,
      corpo: respostaProvidenciaSchema,
      resposta: {
        status: 200,
        descricao: "O desfecho gravado.",
        esquema: z.object({ desfecho: z.enum(DESFECHOS_PROVIDENCIA) }),
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada", "ja_respondida"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/encerramento",
      resumo: "Encerra a ocorrência com motivo (registro não se apaga, se encerra).",
      parametros: parametroId,
      corpo: encerramentoSchema,
      resposta: {
        status: 200,
        descricao:
          "A ocorrência foi encerrada. `providenciasSemResposta` lista os órgãos que não responderam (não impedem o encerramento); a interdição ativa impede, então `interdicaoAtiva` vem sempre falso aqui.",
        esquema: z.object({
          status: z.literal("encerrada"),
          providenciasSemResposta: z.array(z.string()),
          interdicaoAtiva: z.boolean(),
        }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "nao_encontrada",
        "transicao_invalida",
        "ja_no_estado_final",
        "estado_mudou",
        "interdicao_ativa",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/desinterdicao",
      resumo: "Levanta a interdição de uma ocorrência interditada.",
      parametros: parametroId,
      corpo: desinterdicaoSchema,
      resposta: {
        status: 200,
        descricao: "A interdição foi levantada.",
        esquema: z.object({ status: z.literal("desinterditada") }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "nao_encontrada",
        "ocorrencia_encerrada",
        "nao_interditada",
        "ja_desinterditada",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/coordenada",
      resumo: "Corrige a coordenada de abertura da ocorrência, sem tocar na medida em campo.",
      parametros: parametroId,
      corpo: correcaoDeCoordenadaSchema,
      resposta: {
        status: 200,
        descricao:
          "O ponto novo, o ponto anterior (nulo quando a ocorrência nasceu sem ponto) e se algum documento oficial já tinha saído antes da correção.",
        esquema: z.object({
          coordenada: pontoDaCoordenada,
          anterior: anulavel(pontoDaCoordenada),
          documentoJaEmitido: z.boolean(),
        }),
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada", "ocorrencia_encerrada"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/devolvidas",
      resumo:
        "Lista as ocorrências cujas tarefas o agente devolveu e esperam decisão da coordenação.",
      resposta: {
        status: 200,
        descricao:
          "Uma linha por ocorrência em triagem com devolução, com o motivo da mais recente e se há observação (o texto não vem na lista).",
        esquema: respostaDeDevolvidas,
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/interditados",
      resumo:
        "Lista as ocorrências com interdição ativa (agente de campo só vê as da própria equipe).",
      resposta: {
        status: 200,
        descricao: "As interdições de pé, da mais antiga para a mais nova.",
        esquema: respostaDeInterditados,
      },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/providencias/pendentes",
      resumo: "Lista as providências encaminhadas que ainda esperam resposta do órgão.",
      resposta: {
        status: 200,
        descricao: "As providências sem resposta, pelo prazo mais próximo.",
        esquema: respostaDeProvidenciasPendentes,
      },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/indicadores/painel",
      resumo: "Os indicadores do painel do coordenador.",
      resposta: {
        status: 200,
        descricao:
          "Sete contagens do município (do recorte da equipe, para o agente de campo), com os nomes de coluna do banco.",
        esquema: respostaDosIndicadores,
      },
      erros: ERROS_AUTENTICADA,
    }),
  ],
  pendentes: [],
};
