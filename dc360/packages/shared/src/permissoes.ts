import { PAPEIS_DE_SERVIDOR, ROTULO_PAPEL, type Papel, type PapelDeServidor } from "./dominio.js";

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
  "consultar_oficio",
  "levantar_interdicao",
  "registrar_vistoria",
  "gerenciar_equipes",
  "gerenciar_usuarios",
  "consultar_trilha",
  "exportar_dados",
  "acompanhar_saida_a_campo",
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
  consultar_oficio: "consultar os ofícios de encaminhamento",
  levantar_interdicao: "levantar a interdição de um imóvel",
  registrar_vistoria: "registrar vistoria",
  gerenciar_equipes: "gerenciar equipes",
  gerenciar_usuarios: "gerenciar usuários",
  consultar_trilha: "consultar a trilha de auditoria",
  exportar_dados: "exportar dados",
  acompanhar_saida_a_campo: "acompanhar quem está em campo agora",
};

const PERMISSOES: Record<Papel, readonly Acao[]> = {
  /*
    O `usuario_orgao` NÃO TEM AÇÃO NENHUMA (V2-F03-E04, ADR 0009 decisão 5).
    Não é lista a preencher depois por descuido: é a lista vazia de propósito.
    O que essa conta faz vem do vínculo com o órgão (gestor, executor, leitor)
    e das ações do encaminhamento da F04, e nunca de uma ação de servidor. Uma
    ação nova que alguém acrescente a `ACOES` e esqueça de negar a esse papel
    não o alcança, porque aqui o padrão é negar.
  */
  usuario_orgao: [],
  /*
    O operador registra a resposta porque é quem atende o telefone quando a
    secretaria liga de volta. Ele continua sem decidir o fluxo.

    E ele ACOMPANHA QUEM ESTÁ EM CAMPO, que é a única permissão deste produto
    concedida ao posto mais baixo por uma razão que não é de fluxo: o valor
    inteiro desse recurso é alguém enxergar o prazo estourado, e a pessoa que
    está na sala às três da manhã de uma noite de temporal é o operador de
    plantão. Restringir isso à coordenação seria escolher a elegância da tabela
    de permissões contra a finalidade da coisa, e o custo do erro é um agente
    no morro sem ninguém olhando.

    A mesma permissão também ENCERRA a saída, e ela não se divide em duas de
    propósito. Quem chama o agente pelo rádio às três da manhã é essa mesma
    pessoa, e deixá-la ver o alerta sem poder registrar o que fez produziria o
    pior par possível: o fato continua aberto na tela e o ato que resolveu o
    caso fica invisível. O encerramento leva nome e hora para a trilha, que é
    onde ele fica auditável, e a trilha não se reescreve.

    O que ele continua sem fazer é decidir o fluxo: triar, despachar, encerrar
    a ocorrência. Saber que alguém não desceu do morro não é decisão de fluxo.
  */
  /*
    CONSULTAR OFÍCIO (V2-F00-E08) é leitura, e não emissão: a tela da ocorrência
    lista os ofícios dela ("o que já saiu para o órgão"), para ninguém responder
    "encaminhei" por cima de um papel que não saiu. O operador continua sem
    emitir (`emitir_documento`) e sem enviar (`encaminhar_providencia`). O
    agente de campo NÃO tem a ação: a ficha do ofício traz o e-mail do órgão,
    as observações da coordenação e o IP de quem abriu o link, e o aparelho
    dele não usa ofício.
  */
  operador: [
    "abrir_ocorrencia",
    "responder_providencia",
    "consultar_oficio",
    "acompanhar_saida_a_campo",
  ],
  agente_campo: ["registrar_vistoria"],
  coordenador: [
    "abrir_ocorrencia",
    "classificar_triagem",
    "despachar_equipe",
    "encaminhar_providencia",
    "responder_providencia",
    "encerrar_ocorrencia",
    "emitir_documento",
    "consultar_oficio",
    "levantar_interdicao",
    "gerenciar_equipes",
    "gerenciar_usuarios",
    "consultar_trilha",
    "exportar_dados",
    "acompanhar_saida_a_campo",
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
    "consultar_oficio",
    "levantar_interdicao",
    "gerenciar_equipes",
    "gerenciar_usuarios",
    "consultar_trilha",
    "exportar_dados",
    "acompanhar_saida_a_campo",
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
  usuario_orgao: 1,
  agente_campo: 1,
  operador: 1,
  coordenador: 2,
  administrador: 3,
};

/**
 * Se `quem` pode criar, editar, ativar ou desativar uma conta de `alvo`.
 *
 * ABAIXO, e não "abaixo ou igual", para quem não é o teto. A ADR 0006 diz que
 * o coordenador "administra equipes e usuários abaixo dele" e que o
 * administrador "é o único que administra outro administrador". Até
 * 15/09/2026 a comparação era `>=`, e com ela um coordenador criava outro
 * coordenador, rebaixava o colega a operador e o desativava: dois nomes para
 * o mesmo poder de novo, um degrau abaixo do problema que a ADR resolveu.
 *
 * O administrador administra o próprio posto porque alguém precisa poder
 * criar o segundo administrador, e porque a regra do "último administrador"
 * (em `rotas/administracao.ts`) já impede que ele derrube o município.
 */
export function podeGerirPapel(quem: Papel, alvo: Papel): boolean {
  if (quem === "administrador") return POSTO[quem] >= POSTO[alvo];
  return POSTO[quem] > POSTO[alvo];
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

/**
 * Os papéis que `quem` consegue conceder. Serve para montar o formulário.
 *
 * Só papel de SERVIDOR: o `usuario_orgao` nasce por convite e não se concede
 * por formulário nem por troca de papel (ADR 0009, decisão 5).
 */
export function papeisQuePodeConceder(quem: Papel): readonly PapelDeServidor[] {
  return PAPEIS_DE_SERVIDOR.filter((p) => podeGerirPapel(quem, p));
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
