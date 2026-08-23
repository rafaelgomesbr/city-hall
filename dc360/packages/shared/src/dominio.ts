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

/** Por onde uma ocorrência entra no fluxo. Hoje só existe um caminho. */
export const STATUS_INICIAL: StatusOcorrencia = "registrada";

/**
 * Estados que existem no domínio sem ninguém produzir, e por quê.
 *
 * `rascunho` foi encontrado numa auditoria como estado inteiramente morto:
 * declarado, com rótulo, ícone, cor de selo e até um índice parcial do banco
 * que o exclui, mas sem um único produtor. Nada no sistema jamais cria uma
 * ocorrência nesse estado, o que tornava duas transições da máquina de estados
 * permanentemente inalcançáveis.
 *
 * Ele fica, e a razão está aqui em vez de na cabeça de alguém: é o estado que
 * o aplicativo de campo vai usar para a ocorrência aberta sem sinal, que
 * existe no aparelho antes de existir protocolo. Tirá-lo agora custaria uma
 * migração para mudar a restrição do banco, e outra para trazê-lo de volta.
 *
 * A lista é a exceção, e o teste exige que qualquer estado fora dela seja
 * alcançável a partir de `STATUS_INICIAL`. Estado morto novo reprova.
 */
export const STATUS_RESERVADOS: Partial<Record<StatusOcorrencia, string>> = {
  rascunho:
    "Reservado para a ocorrência aberta sem sinal no aplicativo de campo, que " +
    "existe no aparelho antes de existir protocolo. Nenhum produtor hoje.",
};

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

/* ==========================================================================
   Checklist da vistoria de campo
   ========================================================================== */

/**
 * Os itens que o agente responde no local, e a única definição deles.
 *
 * Antes existiam duas: o gerador de documento conhecia seis itens e o painel
 * conhecia quatro. Uma vistoria com `danos_estruturais` saía escrita por
 * extenso no laudo e como `danos_estruturais`, chave crua, na tela do
 * coordenador. Mesmo dado, dois documentos diferentes, e o aplicativo de campo
 * ia herdar uma terceira cópia.
 *
 * `obrigatorio` governa o aparelho: sem esses itens respondidos, a vistoria não
 * pode ser concluída. Os opcionais existem porque nem toda ocorrência os
 * envolve, e obrigar resposta em item que não se aplica ensina a pessoa a
 * marcar qualquer coisa para o botão liberar.
 */
export const CHECKLIST_VISTORIA = [
  { chave: "risco_iminente", rotulo: "Risco iminente identificado", obrigatorio: true },
  { chave: "evacuacao_necessaria", rotulo: "Evacuação necessária", obrigatorio: true },
  { chave: "interdicao_indicada", rotulo: "Interdição indicada", obrigatorio: true },
  { chave: "acionar_outro_orgao", rotulo: "Necessário acionar outro órgão", obrigatorio: true },
  { chave: "danos_estruturais", rotulo: "Danos estruturais visíveis", obrigatorio: false },
  { chave: "acesso_comprometido", rotulo: "Acesso ao imóvel comprometido", obrigatorio: false },
] as const;

export type ChaveChecklist = (typeof CHECKLIST_VISTORIA)[number]["chave"];

export const ROTULO_CHECKLIST: Record<string, string> = Object.fromEntries(
  CHECKLIST_VISTORIA.map((i) => [i.chave, i.rotulo]),
);

/** Os que o aparelho exige antes de liberar a conclusão da vistoria. */
export const CHECKLIST_OBRIGATORIO = CHECKLIST_VISTORIA.filter((i) => i.obrigatorio);
