import { z } from "zod";
import {
  DESFECHOS_DE_SAIDA,
  SEVERIDADES,
  STATUS_OCORRENCIA,
  TIPOS_DE_ENTRADA,
  devolucaoDeTarefaSchema,
  encerramentoDeSaidaSchema,
  envelopeSincronizacaoSchema,
  pedidoDeEvidenciaSchema,
  prorrogacaoDeSaidaSchema,
  retornoDeCampoSchema,
  saidaACampoSchema,
} from "@dc360/shared";
import { confirmacaoSchema } from "../../rotas/evidencias.js";
import { reconciliacaoSchema } from "../../rotas/sincronizacao.js";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA, parametroId } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * O trabalho do agente de campo: fila de sincronização, tarefa, saída a campo
 * e evidências (`rotas/sincronizacao.ts`, `campo.ts`, `saida-a-campo.ts`,
 * `evidencias.ts`). Parte 3C2 do lote 3.
 *
 * Todas as rotas têm entrada. `reconciliacaoSchema` (sincronização) e
 * `confirmacaoSchema` (evidências) foram exportados de lá sem mudar o que a rota
 * aceita; o pedido de autorização de evidência já é o `pedidoDeEvidenciaSchema`
 * do pacote compartilhado (a rota o usa direto).
 *
 * É O CORAÇÃO DO PRODUTO, então a fidelidade manda:
 *
 * - Os esquemas de resposta seguem o que o handler devolve. O aplicativo de
 *   campo instalado lê estes corpos, e `test/contrato-3c2-respostas.test.ts`
 *   confere uma resposta real de cada rota (e que nenhum campo é cortado).
 * - As três rotas de idempotência por chave (`/sincronizacao/vistoria`,
 *   `/sincronizacao/devolucao`, `POST /saida-a-campo`) respondem 201 na primeira
 *   vez e 200 com o MESMO corpo (`duplicada: true`) no reenvio. O registro só
 *   comporta um status de sucesso: vai o 201, e a descrição conta o 200.
 * - As rotas da fila (`ROTA_DA_FILA_DO_CAMPO`) respondem 503 `acesso_suspenso`
 *   quando o município está suspenso, em vez do 403 das demais, para a fila do
 *   aparelho esperar em vez de bloquear a coleta.
 */

const uuid = z.string().uuid();
const instante = z.string();
const anulavel = <T extends z.ZodType>(esquema: T) => esquema.nullable();

/** A saída a campo como `daLinha` a monta (`rotas/saida-a-campo.ts`), em camelCase. */
const saidaACampo = z.object({
  id: uuid,
  ocorrenciaId: uuid,
  protocolo: z.string(),
  endereco: z.string(),
  severidade: anulavel(z.enum(SEVERIDADES)),
  agenteId: uuid,
  agenteNome: z.string(),
  equipeNome: anulavel(z.string()),
  sozinho: z.boolean(),
  duracaoMinutos: z.number().int(),
  declaradaEm: instante,
  registradaEm: instante,
  retornoPrevistoInicial: instante,
  retornoPrevistoEm: instante,
  prorrogacoes: z.number().int(),
  vencida: z.boolean(),
  atrasoEmMinutos: z.number().int(),
});

/** O que desce para o aparelho de cada tarefa em campo. Nome de coluna do banco. */
const tarefaDoAparelho = z.object({
  id: uuid,
  protocolo: z.string(),
  tipo: z.enum(TIPOS_DE_ENTRADA),
  severidade: anulavel(z.enum(SEVERIDADES)),
  endereco: z.string(),
  ponto_referencia: anulavel(z.string()),
  latitude: anulavel(z.number()),
  longitude: anulavel(z.number()),
  descricao: z.string(),
  solicitante_nome: z.string(),
  solicitante_contato: anulavel(z.string()),
  vulnerabilidade_presente: z.boolean(),
  vulnerabilidade_descricao: anulavel(z.string()),
  prazo_em: anulavel(instante),
  criado_em: instante,
});

const respostaDeVistoria = z.object({
  vistoriaId: uuid,
  duplicada: z
    .boolean()
    .describe("Verdadeiro quando a chave já tinha sido recebida: nada foi gravado de novo."),
  foraDaEquipeDesignada: z
    .boolean()
    .describe(
      "Verdadeiro quando o agente não é da equipe designada ou a ocorrência não tinha despacho: a coleta entra, marcada.",
    ),
});

const respostaDeDevolucao = z.object({
  devolucaoId: uuid,
  duplicada: z.boolean(),
  status: z.literal("triagem").describe("Para onde a ocorrência foi."),
});

const respostaDePendencias = z.object({
  itens: z.array(tarefaDoAparelho),
  teto: z.number().int().describe("Quantas tarefas cabem numa resposta."),
  truncada: z.boolean().describe("Verdadeiro quando havia mais tarefas que o teto."),
  orgaos: z
    .array(z.object({ id: uuid, nome: z.string(), sigla: anulavel(z.string()) }))
    .describe("O catálogo de órgãos ativos do município, que desce junto das tarefas."),
});

const respostaDeReconciliacao = z.object({
  saidas: z.array(
    z.object({
      id: uuid,
      protocolo: z.string(),
      motivo: anulavel(z.string()),
      saiuEm: anulavel(instante),
      desfecho: z.enum(["concluida", "encerrada", "devolvida", "outra_equipe"]),
    }),
  ),
});

const respostaDoMeuTrabalho = z.object({
  equipe: anulavel(
    z.object({
      id: uuid,
      nome: anulavel(z.string()),
      especialidade: anulavel(z.string()),
      ativa: anulavel(z.boolean()),
    }),
  ).describe("Nula quando o agente ainda não foi alocado a uma equipe."),
  colegas: z.array(
    z.object({
      id: uuid,
      nome: z.string(),
      papel: z.string(),
      ativo: z.boolean(),
      fotoUrl: anulavel(z.string()).describe("URL assinada, de vida curta."),
      emCampo: z.boolean(),
    }),
  ),
  designadas: z.array(tarefaDoAparelho.extend({ status: z.enum(STATUS_OCORRENCIA) })),
  concluidas: z.array(
    z.object({
      id: uuid,
      coletada_em: instante,
      sincronizada_em: instante,
      gps_precisao_metros: anulavel(z.number()),
      assinante_nome: z.string(),
      ocorrencia_id: uuid,
      protocolo: z.string(),
      tipo: z.enum(TIPOS_DE_ENTRADA),
      severidade: anulavel(z.enum(SEVERIDADES)),
      status: z.enum(STATUS_OCORRENCIA),
      endereco: z.string(),
      despachada_em: anulavel(instante),
    }),
  ),
  totalConcluidas: z
    .number()
    .int()
    .optional()
    .describe(
      "Quantas vistorias o agente assinou de verdade (a lista corta no teto). Ausente sem equipe.",
    ),
  tetoDeConcluidas: z.number().int().optional().describe("Ausente sem equipe."),
  devolvidasNoMes: z
    .number()
    .int()
    .optional()
    .describe("Tarefas que o agente devolveu nos últimos trinta dias. Ausente sem equipe."),
});

const respostaDaSaidaDeclarada = z.object({
  saida: saidaACampo,
  duplicada: z.boolean(),
  aviso: z
    .string()
    .describe("A frase que o aparelho mostra: o que a coordenação vê e o que o produto não faz."),
});

const respostaDaProrrogacao = z.object({
  saidaId: uuid,
  retornoPrevistoEm: instante,
  prorrogacoes: z.number().int(),
  duplicada: z.boolean(),
});

const respostaDoRetorno = z.object({
  saidaId: uuid,
  encerradaEm: instante,
  desfecho: anulavel(z.enum(DESFECHOS_DE_SAIDA)),
  duplicada: z
    .boolean()
    .describe(
      "Verdadeiro quando a saída já estava encerrada (a coordenação foi na frente): não é erro.",
    ),
});

const respostaDoEncerramentoDeSaida = z.object({
  saidaId: uuid,
  encerradaEm: instante,
  desfecho: z.enum(DESFECHOS_DE_SAIDA),
});

const respostaDasSaidasAbertas = z.object({
  itens: z.array(saidaACampo),
  emCampo: z.number().int(),
  vencidas: z.number().int(),
  limite: z
    .string()
    .describe("A frase que diz o que a lista NÃO faz: não detecta queda nem aciona ninguém."),
});

/** O que o aparelho precisa para amarrar a foto ao envelope da vistoria. */
const evidenciaJaEnviada = z.object({
  evidenciaId: uuid,
  chave: z.string(),
  jaEnviada: z.literal(true),
});

const evidenciaParaEnviar = z.object({
  evidenciaId: uuid,
  chave: z.string(),
  jaEnviada: z.literal(false),
  url: z.string().describe("Para onde o aparelho manda o PUT, assinada e de vida curta."),
  cabecalhos: z
    .record(z.string(), z.string())
    .describe("Cabeçalhos que o aparelho é obrigado a repetir no PUT (entram na assinatura)."),
  expiraEm: instante,
  armazenamento: z
    .object({
      bytesUsados: z.number(),
      tetoBytes: anulavel(z.number()),
      margemBytes: anulavel(z.number()),
      situacao: z.enum(["sem_teto", "normal", "aviso", "acima_do_teto"]),
    })
    .optional()
    .describe("A situação do armazenamento do município, lida na mesma transação da autorização."),
});

const respostaDeAutorizacaoDeEnvio = z.union([evidenciaJaEnviada, evidenciaParaEnviar]);

const respostaDaConfirmacaoDeEnvio = z.object({
  evidenciaId: uuid,
  confirmada: z.literal(true),
  jaEstava: z.boolean().describe("Verdadeiro quando a evidência já tinha sido confirmada antes."),
});

export const grupo: GrupoDoContrato = {
  nome: "campo",
  rotas: [
    rota({
      metodo: "POST",
      caminho: "/v1/sincronizacao/vistoria",
      resumo: "Recebe o envelope de uma vistoria feita em campo, de forma idempotente por chave.",
      corpo: envelopeSincronizacaoSchema,
      resposta: {
        status: 201,
        descricao:
          "A vistoria foi gravada. Com a mesma `idempotencyKey` de novo, a rota responde 200 com `duplicada: true` e o mesmo `vistoriaId`, sem gravar nada.",
        esquema: respostaDeVistoria,
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "acesso_suspenso",
        "autor_divergente",
        "nao_encontrada",
        "ja_encerrada",
        "data_implausivel",
        "evidencia_ja_vinculada",
        "evidencia_de_outro_agente",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/sincronizacao/devolucao",
      resumo: "Recebe a devolução de uma tarefa pelo agente, de forma idempotente por chave.",
      corpo: devolucaoDeTarefaSchema,
      resposta: {
        status: 201,
        descricao:
          "A tarefa voltou para a triagem, sem equipe. Com a mesma chave de novo, ou quando um colega da equipe já devolveu, a rota responde 200 com `duplicada: true`.",
        esquema: respostaDeDevolucao,
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "acesso_suspenso",
        "autor_divergente",
        "relogio_do_aparelho",
        "nao_encontrada",
        "vistoria_ja_concluida",
        "ja_encerrada",
        "status_nao_permite",
        "tarefa_no_prazo",
        "transicao_invalida",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/sincronizacao/pendencias/reconciliar",
      resumo:
        "O aparelho informa as tarefas que ainda guarda; a rota diz as que saíram da lista dele e por quê.",
      corpo: reconciliacaoSchema,
      resposta: {
        status: 200,
        descricao:
          "Uma saída por tarefa que não está mais em campo com a equipe do agente: concluída, encerrada, devolvida ou passada a outra equipe. Tarefa que o agente nunca teve não aparece (a rota não confirma existência).",
        esquema: respostaDeReconciliacao,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/sincronizacao/pendencias",
      resumo:
        "Lista as ocorrências despachadas para as equipes do agente: o que o aparelho baixa para trabalhar sem sinal (limitada, com aviso de truncamento).",
      resposta: {
        status: 200,
        descricao:
          "As tarefas em campo da equipe do agente, o teto, se a lista foi cortada e o catálogo de órgãos ativos do município.",
        esquema: respostaDePendencias,
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/campo/meu-trabalho",
      resumo:
        "A tela do agente: a equipe dele, os chamados da equipe e as vistorias que ele já concluiu.",
      resposta: {
        status: 200,
        descricao:
          "Sem equipe, a resposta traz `equipe: null` e as três listas vazias (sem os totais). Com equipe, traz as listas, o total real de concluídas e o teto da lista.",
        esquema: respostaDoMeuTrabalho,
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida-a-campo",
      resumo: "O agente declara que saiu a campo, com a duração prevista e se vai sozinho.",
      corpo: saidaACampoSchema,
      resposta: {
        status: 201,
        descricao:
          "A saída aberta, com o prazo calculado pelo servidor. Com a mesma chave de novo, a rota responde 200 com `duplicada: true`.",
        esquema: respostaDaSaidaDeclarada,
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "autor_divergente",
        "saida_ja_aberta",
        "nao_encontrada",
        "status_nao_permite",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida-a-campo/prorrogar",
      resumo: "O agente prorroga o prazo de retorno da saída aberta.",
      corpo: prorrogacaoDeSaidaSchema,
      resposta: {
        status: 200,
        descricao:
          "O prazo novo (contado a partir de agora, nunca menor que o anterior) e quantas prorrogações a saída já teve. Repetir a mesma chave devolve o estado atual com `duplicada: true`.",
        esquema: respostaDaProrrogacao,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida-a-campo/retorno",
      resumo: "O agente declara que voltou do campo.",
      corpo: retornoDeCampoSchema,
      resposta: {
        status: 200,
        descricao:
          "A saída encerrada. Saída que a coordenação já encerrou não é erro: volta com `duplicada: true` e o desfecho que ela registrou.",
        esquema: respostaDoRetorno,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida-a-campo/encerrar",
      resumo: "A coordenação encerra uma saída a campo, registrando o desfecho.",
      corpo: encerramentoDeSaidaSchema,
      resposta: {
        status: 200,
        descricao: "A saída encerrada e o desfecho gravado.",
        esquema: respostaDoEncerramentoDeSaida,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada", "ja_encerrada"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/saida-a-campo",
      resumo: "Lista as saídas a campo abertas e as que estouraram o prazo, para a coordenação.",
      resposta: {
        status: 200,
        descricao:
          "As saídas abertas (vencidas primeiro, e entre elas quem foi sozinho), as contagens e a frase do limite do que a lista mostra.",
        esquema: respostaDasSaidasAbertas,
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/saida-a-campo/minha",
      resumo: "Lê a saída a campo aberta do próprio agente.",
      resposta: {
        status: 200,
        descricao: "A saída aberta do agente, ou `saida: null` quando não há.",
        esquema: z.object({ saida: anulavel(saidaACampo) }),
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/evidencias/autorizar-envio",
      resumo:
        "Autoriza o envio de uma fotografia: devolve a URL assinada para o aparelho mandar os bytes direto ao armazenamento.",
      corpo: pedidoDeEvidenciaSchema,
      resposta: {
        status: 201,
        descricao:
          "Com o arquivo ainda por enviar, a URL de escrita, os cabeçalhos obrigatórios e a situação do armazenamento. Com o arquivo já no armazenamento (reautorização da mesma chave), `jaEnviada: true` e nenhuma URL de escrita: o aparelho pula o envio dos bytes.",
        esquema: respostaDeAutorizacaoDeEnvio,
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "acesso_suspenso",
        "autor_divergente",
        "chave_ja_usada_em_outro_registro",
        "nao_encontrada",
        "ja_encerrada",
        "data_implausivel",
        "teto_de_armazenamento",
        "armazenamento_indisponivel",
        "tamanho_divergente",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/evidencias/confirmar-envio",
      resumo:
        "Confirma que os bytes da fotografia chegaram ao armazenamento: o servidor mede tamanho e soma de verificação.",
      corpo: confirmacaoSchema,
      resposta: {
        status: 200,
        descricao: "A evidência confirmada (`jaEstava` é verdadeiro no reenvio).",
        esquema: respostaDaConfirmacaoDeEnvio,
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "acesso_suspenso",
        "autor_divergente",
        "nao_encontrada",
        "arquivo_ausente",
        "armazenamento_indisponivel",
        "tamanho_divergente",
        "hash_divergente",
      ],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/evidencias/:id/url",
      resumo: "Devolve a URL assinada, de vida curta, para ver uma evidência do município.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao: "A URL assinada de leitura.",
        esquema: z.object({ url: z.string() }),
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "nao_encontrada", "envio_pendente"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/evidencias/ocorrencia/:id",
      resumo: "Lista as evidências de uma ocorrência.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao: "As evidências já enviadas, com a URL assinada de cada uma.",
        esquema: z.object({
          itens: z.array(
            z.object({
              id: uuid,
              legenda: anulavel(z.string()),
              capturadaEm: instante,
              ordem: z.number().int(),
              tipoConteudo: anulavel(z.string()),
              tamanhoBytes: z.number(),
              url: z.string(),
            }),
          ),
        }),
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
  ],
  pendentes: [],
};
