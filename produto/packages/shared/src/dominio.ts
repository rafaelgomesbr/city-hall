/**
 * Vocabulário do domínio de Defesa Civil.
 *
 * A taxonomia de tipos vem da COBRADE (Codificação Brasileira de Desastres):
 * não inventar nome próprio aqui. Os rótulos em português são o que aparece
 * na interface; as chaves são o que vai para o banco e para a API.
 */

export const TIPOS_COBRADE = [
  "deslizamento",
  "inundacao",
  "alagamento",
  "enxurrada",
  "vendaval",
  "granizo",
  "colapso_edificacao",
  "incendio_urbano",
] as const;

export type TipoCobrade = (typeof TIPOS_COBRADE)[number];

export const ROTULO_TIPO_COBRADE: Record<TipoCobrade, string> = {
  deslizamento: "Deslizamento",
  inundacao: "Inundação",
  alagamento: "Alagamento",
  enxurrada: "Enxurrada",
  vendaval: "Vendaval",
  granizo: "Granizo",
  colapso_edificacao: "Colapso de edificação",
  incendio_urbano: "Incêndio urbano",
};

export const SEVERIDADES = ["baixa", "media", "alta", "critica"] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

/** Prazo padrão de atendimento por severidade, em horas. */
export const PRAZO_PADRAO_HORAS: Record<Severidade, number> = {
  baixa: 72,
  media: 48,
  alta: 24,
  critica: 4,
};

/**
 * Ciclo de vida da ocorrência. A ordem do array é a ordem natural do fluxo,
 * usada para validar transição (ver TRANSICOES_PERMITIDAS).
 */
export const STATUS_OCORRENCIA = [
  "rascunho",
  "registrada",
  "triagem",
  "em_campo",
  "vistoria_concluida",
  "providencia_pendente",
  "encerrada",
] as const;

export type StatusOcorrencia = (typeof STATUS_OCORRENCIA)[number];

export const ROTULO_STATUS: Record<StatusOcorrencia, string> = {
  rascunho: "Rascunho",
  registrada: "Registrada",
  triagem: "Em triagem",
  em_campo: "Em campo",
  vistoria_concluida: "Vistoria concluída",
  providencia_pendente: "Providência pendente",
  encerrada: "Encerrada",
};

/**
 * Transições permitidas. Regra de negócio central: uma ocorrência só sai de
 * circulação por encerramento com motivo, nunca por exclusão, porque a trilha
 * precisa continuar auditável depois do fato.
 *
 * Encerrar é permitido de quase qualquer estado (a realidade da rua impõe
 * isso: um chamado pode ser encerrado por improcedência antes da vistoria),
 * mas nunca de "encerrada", que é terminal.
 */
export const TRANSICOES_PERMITIDAS: Record<StatusOcorrencia, readonly StatusOcorrencia[]> = {
  rascunho: ["registrada", "encerrada"],
  registrada: ["triagem", "encerrada"],
  triagem: ["em_campo", "encerrada"],
  em_campo: ["vistoria_concluida", "encerrada"],
  vistoria_concluida: ["providencia_pendente", "encerrada"],
  providencia_pendente: ["encerrada"],
  encerrada: [],
};

export function transicaoPermitida(de: StatusOcorrencia, para: StatusOcorrencia): boolean {
  return TRANSICOES_PERMITIDAS[de].includes(para);
}

/** Ocorrência ativa é a que ainda consome atenção da equipe. */
export function ocorrenciaAtiva(status: StatusOcorrencia): boolean {
  return status !== "encerrada" && status !== "rascunho";
}

export const PAPEIS = ["coordenador", "operador", "agente_campo", "administrador"] as const;
export type Papel = (typeof PAPEIS)[number];

export const ROTULO_PAPEL: Record<Papel, string> = {
  coordenador: "Coordenador",
  operador: "Operador de plantão",
  agente_campo: "Agente de campo",
  administrador: "Administrador da organização",
};

/** Origem do registro na trilha de auditoria. */
export const ORIGENS = ["campo", "escritorio"] as const;
export type Origem = (typeof ORIGENS)[number];

export const CANAIS_ENTRADA = [
  "telefone",
  "whatsapp",
  "presencial",
  "oficio",
  "outro",
] as const;
export type CanalEntrada = (typeof CANAIS_ENTRADA)[number];

export const ROTULO_CANAL: Record<CanalEntrada, string> = {
  telefone: "Telefone",
  whatsapp: "WhatsApp",
  presencial: "Presencial",
  oficio: "Ofício de secretaria",
  outro: "Outro",
};
