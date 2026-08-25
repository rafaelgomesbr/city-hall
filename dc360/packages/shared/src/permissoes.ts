import { PAPEIS, ROTULO_PAPEL, type Papel } from "./dominio.js";

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
  "gerenciar_organizacao",
  "classificar_triagem",
  "despachar_equipe",
  "encaminhar_providencia",
  "responder_providencia",
  "encerrar_ocorrencia",
  "emitir_documento",
  "registrar_vistoria",
  "gerenciar_equipes",
  "gerenciar_usuarios",
  "consultar_trilha",
  "exportar_dados",
] as const;

export type Acao = (typeof ACOES)[number];

export const ROTULO_ACAO: Record<Acao, string> = {
  abrir_ocorrencia: "registrar ocorrência",
  gerenciar_organizacao: "alterar os dados do município",
  classificar_triagem: "classificar na triagem",
  despachar_equipe: "despachar equipe",
  encaminhar_providencia: "encaminhar providência",
  responder_providencia: "registrar a resposta de uma providência",
  encerrar_ocorrencia: "encerrar ocorrência",
  emitir_documento: "emitir laudo ou termo de interdição",
  registrar_vistoria: "registrar vistoria",
  gerenciar_equipes: "gerenciar equipes",
  gerenciar_usuarios: "gerenciar usuários",
  consultar_trilha: "consultar a trilha de auditoria",
  exportar_dados: "exportar dados",
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
    "emitir_documento",
    "gerenciar_equipes",
    "gerenciar_usuarios",
    "consultar_trilha",
    "exportar_dados",
  ],
  administrador: [
    "gerenciar_organizacao",
    "abrir_ocorrencia",
    "classificar_triagem",
    "despachar_equipe",
    "encaminhar_providencia",
    "responder_providencia",
    "encerrar_ocorrencia",
    "emitir_documento",
    "gerenciar_equipes",
    "gerenciar_usuarios",
    "consultar_trilha",
    "exportar_dados",
  ],
};

export function podeExecutar(papel: Papel, acao: Acao): boolean {
  return PERMISSOES[papel].includes(acao);
}

export function acoesDoPapel(papel: Papel): readonly Acao[] {
  return PERMISSOES[papel];
}

/* ==========================================================================
   Posto: quem manda mais que quem
   ========================================================================== */

/**
 * A tabela acima diz o que cada papel FAZ. Ela não diz quem manda em quem, e
 * essa era a pergunta sem resposta: coordenador e administrador tinham
 * exatamente a mesma lista, então eram dois nomes para a mesma coisa e
 * nenhum dos dois era o poder máximo do município.
 *
 * O posto resolve isso. Número maior manda mais, e a regra que decorre dele é
 * uma só: **ninguém administra conta de posto acima do seu, nem concede papel
 * de posto acima do seu.**
 *
 * Consequência que interessa: um coordenador não desativa o administrador, não
 * rebaixa o administrador e não se promove a administrador. É isso que impede
 * um de anular o outro. O administrador é o teto do município; acima dele só
 * existe quem provisiona o município, que não é papel de aplicação e sim a
 * ferramenta de linha de comando do banco (ver `db/src/cli.ts`), de propósito:
 * um super-usuário que enxerga todos os municípios contradiria o isolamento,
 * que é a regra número um deste produto.
 */
export const POSTO: Record<Papel, number> = {
  agente_campo: 1,
  operador: 1,
  coordenador: 2,
  administrador: 3,
};

/** Se `quem` pode criar, editar, ativar ou desativar uma conta de `alvo`. */
export function podeGerirPapel(quem: Papel, alvo: Papel): boolean {
  return POSTO[quem] >= POSTO[alvo];
}

/** Erro de posto, distinguível de "não tem a permissão". */
export class PostoInsuficiente extends Error {
  readonly papel: Papel;
  readonly alvo: Papel;

  constructor(papel: Papel, alvo: Papel) {
    super(
      `Seu perfil não administra conta de ${ROTULO_PAPEL[alvo].toLowerCase()}. ` +
      "Peça a quem administra o município.",
    );
    this.name = "PostoInsuficiente";
    this.papel = papel;
    this.alvo = alvo;
  }
}

/**
 * Lança se `quem` não tiver posto para mexer numa conta de `alvo`.
 *
 * Vem SEMPRE junto de `exigirPermissao(papel, "gerenciar_usuarios")`, nunca no
 * lugar dela: a permissão diz que a pessoa administra usuários, o posto diz
 * até onde.
 */
export function exigirPostoParaGerir(quem: Papel, alvo: Papel): void {
  if (!podeGerirPapel(quem, alvo)) {
    throw new PostoInsuficiente(quem, alvo);
  }
}

/** Os papéis que `quem` consegue conceder. Serve para montar o formulário. */
export function papeisQuePodeConceder(quem: Papel): readonly Papel[] {
  return PAPEIS.filter((p) => podeGerirPapel(quem, p));
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
