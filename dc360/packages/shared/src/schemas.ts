import { z } from "zod";
import {
  CANAIS_ENTRADA,
  CHECKLIST_OBRIGATORIO,
  CHECKLIST_VISTORIA,
  ORIGENS,
  PAPEIS,
  SEVERIDADES,
  STATUS_OCORRENCIA,
  TIPOS_COBRADE,
} from "./dominio.js";

/**
 * Um schema, uma verdade. Estes schemas validam tanto o payload que entra na
 * API quanto o que o formulário do front envia, para as duas pontas nunca
 * divergirem sobre o que é um dado válido.
 */

export const uuidSchema = z.string().uuid();

/**
 * Protocolo no formato NNNNNN/AAAA, único por organização e ano.
 * O formato é o que o servidor público já reconhece no papel.
 */
export const protocoloSchema = z
  .string()
  .regex(/^\d{6}\/\d{4}$/, "Protocolo deve estar no formato 000123/2026");

export const coordenadaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const organizacaoSchema = z.object({
  id: uuidSchema,
  nome: z.string().min(1).max(200),
  municipio: z.string().min(1).max(200),
  uf: z.string().length(2),
  criadoEm: z.string().datetime(),
});

export const usuarioSchema = z.object({
  id: uuidSchema,
  organizacaoId: uuidSchema,
  nome: z.string().min(1).max(200),
  matricula: z.string().min(1).max(40),
  email: z.string().email(),
  papel: z.enum(PAPEIS),
  equipeId: uuidSchema.nullable(),
  ativo: z.boolean(),
});

export const equipeSchema = z.object({
  id: uuidSchema,
  organizacaoId: uuidSchema,
  nome: z.string().min(1).max(120),
  especialidade: z.string().max(200).nullable(),
  ativa: z.boolean(),
});

/** Abertura: o que o operador informa quando o chamado entra. */
export const aberturaOcorrenciaSchema = z.object({
  solicitanteNome: z.string().min(1, "Informe o nome do solicitante").max(200),
  solicitanteContato: z.string().max(120).optional(),
  canalEntrada: z.enum(CANAIS_ENTRADA),
  endereco: z.string().min(1, "Informe o endereço").max(400),
  coordenada: coordenadaSchema.optional(),
  /**
   * Como chegar, em linguagem de quem mora ali.
   *
   * Em área de risco, rua sem placa e numeração que pula são a regra, e
   * ninguém no telefone sabe dizer coordenada. O que a pessoa sabe dizer é
   * a referência, e era isso que estava se perdendo por falta de campo.
   */
  pontoReferencia: z.string().max(300).optional(),
  tipo: z.enum(TIPOS_COBRADE),
  descricao: z.string().min(1, "Descreva o que foi relatado").max(4000),
  /** Preenchido quando o operador decide vincular a um chamado anterior. */
  vinculadaA: uuidSchema.optional(),
});
export type AberturaOcorrencia = z.infer<typeof aberturaOcorrenciaSchema>;

/** Triagem: classificação técnica, feita por quem tem competência para isso. */
export const triagemSchema = z.object({
  severidade: z.enum(SEVERIDADES),
  vulnerabilidadePresente: z.boolean(),
  vulnerabilidadeDescricao: z.string().max(500).optional(),
}).refine(
  (v) => !v.vulnerabilidadePresente || !!v.vulnerabilidadeDescricao?.trim(),
  { message: "Descreva a vulnerabilidade identificada", path: ["vulnerabilidadeDescricao"] },
);
export type Triagem = z.infer<typeof triagemSchema>;

export const despachoSchema = z.object({
  equipeId: uuidSchema,
  prazoHoras: z.number().int().min(1).max(720),
  instrucoes: z.string().max(2000).optional(),
});
export type Despacho = z.infer<typeof despachoSchema>;

export const itemChecklistSchema = z.object({
  chave: z.string().min(1).max(60),
  resposta: z.boolean(),
});

export const evidenciaFotoSchema = z.object({
  /** Chave no storage, sempre prefixada por tenant/{orgId}/. */
  chave: z.string().min(1),
  capturadaEm: z.string().datetime(),
  coordenada: coordenadaSchema.optional(),
  legenda: z.string().max(300).optional(),
});

/**
 * Vistoria concluída em campo. `coletadaEm` é a hora do aparelho no momento
 * da coleta; `sincronizadaEm` é quando o servidor recebeu. Os dois diferem
 * sempre que a coleta foi offline, e o laudo precisa mostrar ambos.
 */
/**
 * O checklist precisa ser o checklist, e isto é regra de negócio, não de tela.
 *
 * Antes, `z.array(itemChecklistSchema).min(1)` aceitava qualquer coisa: uma
 * vistoria com `[{ chave: "chave_inventada_pelo_aparelho", resposta: true }]`
 * era gravada com 201, virava a vistoria vigente, e o LAUDO OFICIAL saía com
 * essa linha na tabela e sem nenhum dos itens obrigatórios. Reproduzido pelo
 * QA contra a API de verdade.
 *
 * `CHECKLIST_OBRIGATORIO` existia no pacote compartilhado desde o começo e era
 * usado só pela tela do aplicativo, com o comentário dizendo que "obrigatorio
 * governa o aparelho". Governar o aparelho não é governar nada: o aparelho é
 * exatamente a parte que um cliente adulterado não executa. O `CLAUDE.md` diz
 * isto com todas as letras: se a validação só existe no formulário, ela não
 * existe.
 *
 * Duas regras, e a segunda importa tanto quanto a primeira:
 *
 * 1. Todo item obrigatório tem que estar respondido.
 * 2. Nenhuma chave fora do catálogo entra. Sem isto, o laudo continua sendo um
 *    lugar onde o aparelho escreve texto livre num documento com brasão.
 */
const CHAVES_CONHECIDAS = new Set<string>(CHECKLIST_VISTORIA.map((i) => i.chave));

const checklistSchema = z.array(itemChecklistSchema).min(1)
  .refine(
    (itens) => CHECKLIST_OBRIGATORIO.every((o) => itens.some((i) => i.chave === o.chave)),
    {
      message:
        "A vistoria precisa responder todos os itens obrigatórios do checklist: "
        + CHECKLIST_OBRIGATORIO.map((i) => i.rotulo).join(", ") + ".",
    },
  )
  .refine(
    (itens) => itens.every((i) => CHAVES_CONHECIDAS.has(i.chave)),
    { message: "O checklist tem item que não existe no catálogo da vistoria." },
  );

export const vistoriaSchema = z.object({
  checklist: checklistSchema,
  fotos: z.array(evidenciaFotoSchema),
  gpsPrecisaoMetros: z.number().positive().nullable(),
  assinanteNome: z.string().min(1, "Informe quem assinou").max(200),
  /** Traço da assinatura, como chave de storage. */
  assinaturaChave: z.string().min(1).nullable(),
  coletadaEm: z.string().datetime(),
  observacoes: z.string().max(4000).optional(),
});
export type Vistoria = z.infer<typeof vistoriaSchema>;

export const providenciaSchema = z.object({
  orgaoDestino: z.string().min(1, "Informe o órgão de destino").max(200),
  descricao: z.string().min(1, "Descreva a providência").max(2000),
  responsavel: z.string().min(1, "Informe o responsável").max(200),
  prazoHoras: z.number().int().min(1).max(2160),
});
export type Providencia = z.infer<typeof providenciaSchema>;

export const DESFECHOS_PROVIDENCIA = [
  "atendida",
  "atendida_parcialmente",
  "recusada",
] as const;
export type DesfechoProvidencia = (typeof DESFECHOS_PROVIDENCIA)[number];

export const ROTULO_DESFECHO: Record<DesfechoProvidencia, string> = {
  atendida: "Atendida",
  atendida_parcialmente: "Atendida parcialmente",
  recusada: "Recusada",
};

/**
 * Resposta do órgão a uma providência.
 *
 * O desfecho é uma lista fechada porque "resolvido" escrito de dez jeitos
 * diferentes não vira indicador nenhum, e é indicador do tipo "quantas
 * providências a Secretaria de Obras atendeu no semestre" que sustenta uma
 * conversa com o prefeito.
 */
export const respostaProvidenciaSchema = z.object({
  desfecho: z.enum(DESFECHOS_PROVIDENCIA),
  resposta: z.string().min(1, "Descreva o que o órgão respondeu").max(2000),
  respondidaPor: z.string().min(1, "Informe quem respondeu").max(200),
});
export type RespostaProvidencia = z.infer<typeof respostaProvidenciaSchema>;

export const encerramentoSchema = z.object({
  motivo: z.string().min(1, "O motivo do encerramento é obrigatório").max(2000),
});
export type Encerramento = z.infer<typeof encerramentoSchema>;

export const ocorrenciaSchema = z.object({
  id: uuidSchema,
  organizacaoId: uuidSchema,
  protocolo: protocoloSchema,
  tipo: z.enum(TIPOS_COBRADE),
  status: z.enum(STATUS_OCORRENCIA),
  severidade: z.enum(SEVERIDADES).nullable(),
  vulnerabilidadePresente: z.boolean(),
  vulnerabilidadeDescricao: z.string().nullable(),
  endereco: z.string(),
  coordenada: coordenadaSchema.nullable(),
  solicitanteNome: z.string(),
  descricao: z.string(),
  equipeId: uuidSchema.nullable(),
  prazoEm: z.string().datetime().nullable(),
  criadoEm: z.string().datetime(),
  encerradoEm: z.string().datetime().nullable(),
  motivoEncerramento: z.string().nullable(),
});
export type Ocorrencia = z.infer<typeof ocorrenciaSchema>;

/**
 * Evento da trilha auditável. Responde "quem fez o quê, quando e de onde".
 * Nunca é editado nem apagado: correção entra como evento novo.
 */
export const eventoTrilhaSchema = z.object({
  id: uuidSchema,
  organizacaoId: uuidSchema,
  ocorrenciaId: uuidSchema,
  tipo: z.string().min(1).max(60),
  autorId: uuidSchema.nullable(),
  autorNome: z.string(),
  autorPapel: z.enum(PAPEIS),
  origem: z.enum(ORIGENS),
  ocorridoEm: z.string().datetime(),
  registradoEm: z.string().datetime(),
  detalhe: z.record(z.unknown()).nullable(),
});
export type EventoTrilha = z.infer<typeof eventoTrilhaSchema>;

/**
 * Envelope de sincronização vindo do app de campo.
 *
 * `idempotencyKey` é gerada no aparelho e é o que impede duplicação quando o
 * agente reenvia a mesma coleta depois de uma falha de rede: o servidor
 * reconhece a chave e devolve o resultado anterior em vez de aplicar de novo.
 */
export const envelopeSincronizacaoSchema = z.object({
  idempotencyKey: uuidSchema,
  ocorrenciaId: uuidSchema,
  coletadaEm: z.string().datetime(),
  vistoria: vistoriaSchema,
});
export type EnvelopeSincronizacao = z.infer<typeof envelopeSincronizacaoSchema>;

/* ==========================================================================
   Cadastro de usuário e de equipe
   ========================================================================== */

/**
 * Senha segundo o ASVS 4.0 (2.1.1 a 2.1.9): mínimo de doze caracteres, teto
 * alto o bastante para não atrapalhar gerenciador de senha, e nenhuma
 * exigência de composição, que só produz "Senha@123".
 */
export const senhaSchema = z.string()
  .min(12, "A senha precisa de pelo menos 12 caracteres")
  .max(200, "Senha longa demais");

/**
 * O cadastro de usuário mora aqui, e não dentro da rota, porque a mesma regra
 * precisa valer nos dois lados.
 *
 * Antes existiam duas versões: a da API, completa, e uma reimplementação mais
 * fraca no formulário, que não conferia formato de email nem tamanho máximo. O
 * resultado era o usuário descobrir no servidor um erro que a tela poderia ter
 * apontado no campo certo. Uma regra, um lugar.
 */
export const cadastroUsuarioSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(200, "Nome longo demais"),
  matricula: z.string().trim().min(1, "Informe a matrícula").max(40, "Matrícula longa demais"),
  email: z.string().trim().toLowerCase()
    .min(1, "Informe o email")
    .email("Informe um email válido")
    .max(320, "Email longo demais"),
  papel: z.enum(PAPEIS),
  equipeId: uuidSchema.nullish(),
  senha: senhaSchema,
});
export type CadastroUsuario = z.infer<typeof cadastroUsuarioSchema>;

/**
 * Edição de usuário já cadastrado. Sem senha: trocar senha é outro ato, com
 * outras consequências (derruba sessões), e misturar os dois num formulário só
 * faz alguém trocar senha sem querer.
 */
export const edicaoUsuarioSchema = cadastroUsuarioSchema.omit({ senha: true });
export type EdicaoUsuario = z.infer<typeof edicaoUsuarioSchema>;

export const cadastroEquipeSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da equipe").max(120, "Nome longo demais"),
  especialidade: z.string().trim().max(200, "Especialidade longa demais").nullish(),
  ativa: z.boolean().default(true),
});
export type CadastroEquipe = z.infer<typeof cadastroEquipeSchema>;

/**
 * O formulário público de interesse.
 *
 * Pede o mínimo, e o mínimo é decisão e não preguiça: quem preenche isto ainda
 * não é cliente, e cada campo a mais é dado pessoal guardado antes de existir
 * contrato, base legal ou prazo de retenção acordado.
 *
 * Nada de CPF, nada de dado de cidadão, nada de anexo.
 */
export const interesseMunicipioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o seu nome").max(200),
  cargo: z.string().trim().max(200).optional(),
  email: z.string().trim().email("Informe um email válido").max(200),
  telefone: z.string().trim().max(40).optional(),

  municipio: z.string().trim().min(2, "Informe o município").max(200),
  uf: z.string().trim().length(2, "UF com duas letras").regex(/^[A-Za-z]{2}$/, "UF inválida"),
  orgao: z.string().trim().max(200).optional(),

  faixaPopulacao: z.enum([
    "ate_50_mil", "de_50_a_200_mil", "acima_de_200_mil", "nao_sei",
  ]).optional(),
  quantosAgentes: z.coerce.number().int().min(0).max(999).optional(),

  mensagem: z.string().trim().max(2000).optional(),

  /** De onde veio o pedido, para saber o que funciona. Preenchido pela tela. */
  origem: z.string().trim().max(100).optional(),
});
export type InteresseMunicipio = z.infer<typeof interesseMunicipioSchema>;

export const ROTULO_FAIXA_POPULACAO: Record<string, string> = {
  ate_50_mil: "até 50 mil habitantes",
  de_50_a_200_mil: "de 50 a 200 mil habitantes",
  acima_de_200_mil: "acima de 200 mil habitantes",
  nao_sei: "não sei dizer",
};
