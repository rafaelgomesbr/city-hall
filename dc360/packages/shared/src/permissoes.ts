import type { Papel } from "./dominio.js";

/**
 * Quem pode fazer o quê.
 *
 * Isto vive no pacote compartilhado, e não numa condicional de tela, porque a
 * tela é o único lugar onde a regra NÃO vale: qualquer pessoa com o console do
 * navegador aberto contorna um `if` de renderização. A mesma tabela é
 * consultada pela camada de dados hoje e pela API amanhã, e é ela que a tela
 * apenas reflete ao decidir o que desenhar.
 *
 * A divisão segue a realidade de uma coordenadoria municipal: quem atende o
 * telefone registra, quem tem competência técnica classifica e despacha, quem
 * vai a campo coleta, e o encerramento é ato de coordenação porque encerra
 * responsabilidade do órgão.
 */

export const ACOES = [
  "abrir_ocorrencia",
  "classificar_triagem",
  "despachar_equipe",
  "encaminhar_providencia",
  "responder_providencia",
  "encerrar_ocorrencia",
  "registrar_vistoria",
  "gerenciar_equipes",
  "gerenciar_usuarios",
] as const;

export type Acao = (typeof ACOES)[number];

export const ROTULO_ACAO: Record<Acao, string> = {
  abrir_ocorrencia: "registrar ocorrência",
  classificar_triagem: "classificar na triagem",
  despachar_equipe: "despachar equipe",
  encaminhar_providencia: "encaminhar providência",
  responder_providencia: "registrar a resposta de uma providência",
  encerrar_ocorrencia: "encerrar ocorrência",
  registrar_vistoria: "registrar vistoria",
  gerenciar_equipes: "gerenciar equipes",
  gerenciar_usuarios: "gerenciar usuários",
};

const PERMISSOES: Record<Papel, readonly Acao[]> = {
  // O operador registra a resposta porque é quem atende o telefone quando a
  // secretaria liga de volta. Ele continua sem decidir o fluxo.
  operador: ["abrir_ocorrencia", "responder_providencia"],
  agente_campo: ["registrar_vistoria"],
  coordenador: [
    "abrir_ocorrencia",
    "classificar_triagem",
    "despachar_equipe",
    "encaminhar_providencia",
    "responder_providencia",
    "encerrar_ocorrencia",
    "gerenciar_equipes",
    "gerenciar_usuarios",
  ],
  administrador: [
    "abrir_ocorrencia",
    "classificar_triagem",
    "despachar_equipe",
    "encaminhar_providencia",
    "responder_providencia",
    "encerrar_ocorrencia",
    "gerenciar_equipes",
    "gerenciar_usuarios",
  ],
};

export function podeExecutar(papel: Papel, acao: Acao): boolean {
  return PERMISSOES[papel].includes(acao);
}

export function acoesDoPapel(papel: Papel): readonly Acao[] {
  return PERMISSOES[papel];
}

/** Erro de autorização, distinguível de erro de validação e de erro de banco. */
export class SemPermissao extends Error {
  readonly papel: Papel;
  readonly acao: Acao;

  constructor(papel: Papel, acao: Acao) {
    super(`Seu perfil não tem permissão para ${ROTULO_ACAO[acao]}.`);
    this.name = "SemPermissao";
    this.papel = papel;
    this.acao = acao;
  }
}

/** Lança se o papel não puder executar a ação. Usar no ponto de escrita. */
export function exigirPermissao(papel: Papel, acao: Acao): void {
  if (!podeExecutar(papel, acao)) {
    throw new SemPermissao(papel, acao);
  }
}
