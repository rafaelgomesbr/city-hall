import type { Papel } from "./dominio.js";

/**
 * A máquina de estados do encaminhamento e o catálogo dos eventos que ela gera
 * (V2-F04-E03, parte shared, 0D).
 *
 * Norma: ADR 0010, decisões 8 (quem age em nome de quem), 9 (a máquina) e 17
 * (os fatos são gravados pelo banco). Este arquivo é a versão do pacote
 * compartilhado; a versão do banco (`transicoes_do_encaminhamento()` e o
 * gatilho `encaminhamento_transicao_valida`, E03 banco) é conferida contra esta
 * por teste. Regra de negócio que só existe na tela não existe: por isso a
 * tabela mora aqui, e a API e o banco a repetem.
 *
 * O que NÃO está aqui: as ações finas de cada papel dentro do órgão
 * (`PERMISSOES_NO_ORGAO`, CP-20, parte 3C), o dossiê (`dossie.ts`) e o relógio
 * de prazo (`prazo-do-encaminhamento.ts`).
 */

/* ==========================================================================
   Estados
   ========================================================================== */

/**
 * Os sete estados (CP-20, premissa alternativa A). `prazo_vencido` e
 * `sem_aceite` NÃO são estados: são derivados do relógio e nunca se gravam na
 * coluna.
 */
export const ESTADOS_DO_ENCAMINHAMENTO = [
  "enviado",
  "aceito",
  "aguardando_dc",
  "respondido",
  "devolvido",
  "concluido",
  "cancelado",
] as const;

export type EstadoDoEncaminhamento = (typeof ESTADOS_DO_ENCAMINHAMENTO)[number];

export const ROTULO_ESTADO_DO_ENCAMINHAMENTO: Record<EstadoDoEncaminhamento, string> = {
  enviado: "Enviado ao órgão",
  aceito: "Aceito pelo órgão",
  aguardando_dc: "Aguardando a Defesa Civil",
  respondido: "Respondido pelo órgão",
  devolvido: "Devolvido pelo órgão",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/** Estados dos quais ninguém sai. Registro não se apaga, se encerra com motivo. */
export const ESTADOS_TERMINAIS_DO_ENCAMINHAMENTO: readonly EstadoDoEncaminhamento[] = [
  "concluido",
  "cancelado",
];

export function encaminhamentoEncerrado(estado: EstadoDoEncaminhamento): boolean {
  return ESTADOS_TERMINAIS_DO_ENCAMINHAMENTO.includes(estado);
}

/* ==========================================================================
   Atores
   ========================================================================== */

/**
 * Papel do usuário DENTRO do órgão (o vínculo da conta com o órgão, ADR 0009).
 * É outro eixo que o `Papel` do servidor: um usuário de órgão nunca tem papel
 * de servidor. A divisão fina do que cada um faz é da parte 3C
 * (`PERMISSOES_NO_ORGAO`, CP-20); a tabela de transições abaixo é só o TETO
 * que o banco confere.
 */
export const PAPEIS_NO_ORGAO = ["leitor", "executor", "gestor"] as const;
export type PapelNoOrgao = (typeof PAPEIS_NO_ORGAO)[number];

export const ROTULO_PAPEL_NO_ORGAO: Record<PapelNoOrgao, string> = {
  leitor: "Leitor",
  executor: "Executor",
  gestor: "Gestor",
};

/**
 * Quem pode aparecer como ator de um fato do encaminhamento. `link` não é
 * sessão: é a abertura do link do ofício por alguém sem conta, e só a função
 * `abrir_oficio` o grava (ADR 0010, decisão 8). `sistema` é o relógio.
 */
export const TIPOS_DE_ATOR_DO_ENCAMINHAMENTO = [
  "servidor",
  "usuario_orgao",
  "sistema",
  "link",
] as const;
export type TipoDeAtorDoEncaminhamento = (typeof TIPOS_DE_ATOR_DO_ENCAMINHAMENTO)[number];

export type AtorDoEncaminhamento =
  | { tipo: "servidor"; papel: Papel }
  | { tipo: "usuario_orgao"; papelNoOrgao: PapelNoOrgao }
  | { tipo: "sistema" }
  | { tipo: "link" };

/**
 * D-24: só a coordenação e o administrador fazem as transições da Defesa Civil
 * (a ação `gerir_encaminhamento`; criar exige a de encaminhar, também só deles).
 * O operador NÃO entra aqui, nem o agente de campo.
 *
 * A mesma lista tem de ser igual à dos papéis com `encaminhar_providencia` em
 * `permissoes.ts` (teste), e a ação nova `gerir_encaminhamento` nasce na parte
 * 3C com exatamente estes dois papéis.
 */
export const PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO: readonly Papel[] = [
  "coordenador",
  "administrador",
];

/**
 * P-12: enquanto o órgão não usa o portal (até o CP-22), o servidor com
 * `responder_providencia` registra o aceite e a resposta EM NOME do órgão. É a
 * lista de `permissoes.ts` para essa ação (operador, coordenador,
 * administrador), igual por teste.
 */
export const PAPEIS_QUE_RESPONDEM_EM_NOME_DO_ORGAO: readonly Papel[] = [
  "operador",
  "coordenador",
  "administrador",
];

/**
 * No órgão, o leitor lê e nada mais: nenhuma transição é dele (ADR 0010,
 * decisão 9). Executor e gestor fazem as transições do órgão.
 */
export const PAPEIS_NO_ORGAO_QUE_TRANSITAM: readonly PapelNoOrgao[] = ["executor", "gestor"];

/* ==========================================================================
   Eventos: os tipos (a definição completa vem mais abaixo)
   ========================================================================== */

export const TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO = [
  // Nascem das transições da decisão 9
  "enviado",
  "aceito",
  "devolvido",
  "esclarecimento_solicitado",
  "esclarecimento_respondido",
  "respondido",
  "complemento_solicitado",
  "concluido",
  "cancelado",
  "reenviado",
  // Fatos de linha (mudança de coluna mapeada, sem mudar o estado)
  "prazo_alterado",
  "prioridade_alterada",
  "atribuicao_alterada",
  "cobrado",
  "dossie_recomposto",
  // Gravado no pai quando nasce o filho
  "reencaminhado",
  // Inserção direta
  "visualizado",
  "lembrete",
  "escalonado",
  // Backfill dos legados
  "migracao",
] as const;

export type TipoDeEventoDoEncaminhamento = (typeof TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO)[number];

/* ==========================================================================
   Transições
   ========================================================================== */

/** A ação de `permissoes.ts` que autoriza o servidor naquela transição. */
export type AcaoDaTransicao =
  "encaminhar_providencia" | "gerir_encaminhamento" | "responder_providencia";

export interface TransicaoDoEncaminhamento {
  /** `null` é a criação do encaminhamento. */
  de: EstadoDoEncaminhamento | null;
  para: EstadoDoEncaminhamento;
  /** O evento que o banco grava, no mesmo comando (decisão 17). Um por transição. */
  evento: TipoDeEventoDoEncaminhamento;
  /**
   * O servidor que pode fazê-la, ou `null` quando só o órgão faz. Com
   * `emNomeDoOrgao`, o servidor age pelo órgão (P-12) e o evento leva a marca
   * `em_nome_do_orgao`.
   */
  servidor: {
    acao: AcaoDaTransicao;
    papeis: readonly Papel[];
    emNomeDoOrgao: boolean;
  } | null;
  /**
   * O usuário de órgão que pode fazê-la, por papel no vínculo, ou `null` quando
   * só a Defesa Civil faz. Ator `usuario_orgao` nunca faz transição da Defesa
   * Civil, nem sendo gestor (D-24).
   */
  orgao: {
    papeisNoOrgao: readonly PapelNoOrgao[];
  } | null;
}

function daDefesaCivil(
  de: EstadoDoEncaminhamento | null,
  para: EstadoDoEncaminhamento,
  evento: TipoDeEventoDoEncaminhamento,
  acao: AcaoDaTransicao = "gerir_encaminhamento",
): TransicaoDoEncaminhamento {
  return {
    de,
    para,
    evento,
    servidor: { acao, papeis: PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO, emNomeDoOrgao: false },
    orgao: null,
  };
}

/** Só o órgão faz; o servidor com `responder_providencia` faz em nome dele (P-12). */
function doOrgaoComSubstituto(
  de: EstadoDoEncaminhamento,
  para: EstadoDoEncaminhamento,
  evento: TipoDeEventoDoEncaminhamento,
): TransicaoDoEncaminhamento {
  return {
    de,
    para,
    evento,
    servidor: {
      acao: "responder_providencia",
      papeis: PAPEIS_QUE_RESPONDEM_EM_NOME_DO_ORGAO,
      emNomeDoOrgao: true,
    },
    orgao: { papeisNoOrgao: PAPEIS_NO_ORGAO_QUE_TRANSITAM },
  };
}

/** Só o órgão faz, sem substituto: devolver e pedir esclarecimento nunca são em nome dele. */
function doOrgaoSomente(
  de: EstadoDoEncaminhamento,
  para: EstadoDoEncaminhamento,
  evento: TipoDeEventoDoEncaminhamento,
): TransicaoDoEncaminhamento {
  return {
    de,
    para,
    evento,
    servidor: null,
    orgao: { papeisNoOrgao: PAPEIS_NO_ORGAO_QUE_TRANSITAM },
  };
}

/**
 * A tabela da decisão 9 da ADR 0010, linha por linha. O ator `sistema` e o
 * `link` não aparecem: não mudam estado (o sistema grava `lembrete` e
 * `escalonado`; o link grava `visualizado`). `concluido` e `cancelado` não têm
 * linha de saída: são terminais.
 *
 * D-23: devolver só é possível a partir de `enviado` (antes do aceite). Depois
 * do aceite o órgão responde ou pede esclarecimento; não devolve.
 */
export const TRANSICOES_DO_ENCAMINHAMENTO: readonly TransicaoDoEncaminhamento[] = [
  daDefesaCivil(null, "enviado", "enviado", "encaminhar_providencia"),

  doOrgaoComSubstituto("enviado", "aceito", "aceito"),
  doOrgaoSomente("enviado", "devolvido", "devolvido"),
  daDefesaCivil("enviado", "cancelado", "cancelado"),

  doOrgaoComSubstituto("aceito", "respondido", "respondido"),
  doOrgaoSomente("aceito", "aguardando_dc", "esclarecimento_solicitado"),
  daDefesaCivil("aceito", "cancelado", "cancelado"),

  daDefesaCivil("aguardando_dc", "aceito", "esclarecimento_respondido"),
  daDefesaCivil("aguardando_dc", "cancelado", "cancelado"),

  daDefesaCivil("respondido", "concluido", "concluido"),
  daDefesaCivil("respondido", "aceito", "complemento_solicitado"),

  daDefesaCivil("devolvido", "enviado", "reenviado"),
  daDefesaCivil("devolvido", "cancelado", "cancelado"),
];

export function transicaoDoEncaminhamento(
  de: EstadoDoEncaminhamento | null,
  para: EstadoDoEncaminhamento,
): TransicaoDoEncaminhamento | undefined {
  return TRANSICOES_DO_ENCAMINHAMENTO.find((t) => t.de === de && t.para === para);
}

/** Para onde dá para ir a partir de `de` (vazio nos terminais). */
export function destinosDoEstado(de: EstadoDoEncaminhamento): readonly EstadoDoEncaminhamento[] {
  return TRANSICOES_DO_ENCAMINHAMENTO.filter((t) => t.de === de).map((t) => t.para);
}

/** Se o ator, SOZINHO, está autorizado nessa transição (não olha o estado atual). */
export function atorPodeFazerATransicao(
  ator: AtorDoEncaminhamento,
  transicao: TransicaoDoEncaminhamento,
): boolean {
  switch (ator.tipo) {
    case "servidor":
      return transicao.servidor?.papeis.includes(ator.papel) ?? false;
    case "usuario_orgao":
      return transicao.orgao?.papeisNoOrgao.includes(ator.papelNoOrgao) ?? false;
    default:
      // sistema e link não mudam estado, nunca.
      return false;
  }
}

/**
 * A marca `em_nome_do_orgao` (P-12). Não é parâmetro: deriva do ator. Servidor
 * numa transição do órgão tem a marca; usuário de órgão, não; e a marca não
 * autoriza nada, só impede que o ato do servidor apareça como ato do órgão.
 */
export function transicaoEmNomeDoOrgao(
  ator: AtorDoEncaminhamento,
  transicao: TransicaoDoEncaminhamento,
): boolean {
  return ator.tipo === "servidor" && (transicao.servidor?.emNomeDoOrgao ?? false);
}

/**
 * Os códigos de erro que a API devolve DEPOIS de achar a linha sob o ator
 * (decisão 13: para recurso de outro órgão a resposta é 404, antes disso).
 */
export type RecusaDaTransicao =
  | "encaminhamento_encerrado"
  | "devolucao_so_antes_do_aceite"
  | "transicao_invalida"
  | "sem_permissao";

export type ResultadoDaTransicao =
  | { ok: true; transicao: TransicaoDoEncaminhamento; emNomeDoOrgao: boolean }
  | { ok: false; recusa: RecusaDaTransicao };

/** Estados em que devolver é recusado com o código próprio da D-23. */
const ESTADOS_DEPOIS_DO_ACEITE: readonly EstadoDoEncaminhamento[] = [
  "aceito",
  "aguardando_dc",
  "respondido",
];

/**
 * O que acontece quando `ator` tenta levar o encaminhamento de `de` para
 * `para`. A parte que depende só do estado vem primeiro e é igual para todo
 * ator:
 *
 * 1. de estado terminal: `encaminhamento_encerrado` (E13);
 * 2. devolver depois do aceite: `devolucao_so_antes_do_aceite` (D-23);
 * 3. par fora da tabela: `transicao_invalida`;
 * 4. só então o ator: `sem_permissao`.
 *
 * A rota decide a ORDEM entre isto e o 404 e o 403 de papel (decisão 13); este
 * resultado é o que o domínio responde a respeito da transição em si.
 */
export function avaliarTransicaoDoEncaminhamento(
  ator: AtorDoEncaminhamento,
  de: EstadoDoEncaminhamento,
  para: EstadoDoEncaminhamento,
): ResultadoDaTransicao {
  if (encaminhamentoEncerrado(de)) {
    return { ok: false, recusa: "encaminhamento_encerrado" };
  }
  if (para === "devolvido" && ESTADOS_DEPOIS_DO_ACEITE.includes(de)) {
    return { ok: false, recusa: "devolucao_so_antes_do_aceite" };
  }
  const transicao = transicaoDoEncaminhamento(de, para);
  if (!transicao) {
    return { ok: false, recusa: "transicao_invalida" };
  }
  if (!atorPodeFazerATransicao(ator, transicao)) {
    return { ok: false, recusa: "sem_permissao" };
  }
  return { ok: true, transicao, emNomeDoOrgao: transicaoEmNomeDoOrgao(ator, transicao) };
}

/* ==========================================================================
   Eventos: o catálogo (ADR 0010, decisão 17)
   ========================================================================== */

/**
 * De onde o evento nasce:
 *
 * - `transicao`: o gerador `AFTER INSERT OR UPDATE` em `providencias` grava o
 *   evento do par (estado anterior, estado novo) da tabela acima. Inclui a
 *   criação (`enviado`);
 * - `fato_de_linha`: mudança de coluna mapeada sem mudar o estado (prazo,
 *   prioridade, atribuição, cobrança) e a recomposição do dossiê do legado;
 * - `filho`: o `reencaminhado`, gravado no pai quando nasce o filho com
 *   `parent_id`;
 * - `insercao_direta`: o `dc360_app` insere, numa lista positiva por ator;
 * - `backfill`: um evento por legado, gravado pela migração, antes de os
 *   geradores existirem.
 */
export type NascimentoDoEvento =
  "transicao" | "fato_de_linha" | "filho" | "insercao_direta" | "backfill";

/**
 * O fato de linha que o evento registra. Os nomes são de domínio: a coluna que
 * cada um mapeia é decisão da E02 e da E03 banco.
 */
export type FatoDeLinha =
  "prazo" | "prioridade" | "atribuicao" | "cobranca" | "marca_pedido_em_revisao";

/**
 * - `nova`: o evento DECLARA a versão nova do dossiê (`enviado`, `reenviado` e
 *   `dossie_recomposto`), com unicidade de um evento desses três por versão;
 * - `exibida`: o evento só aponta a versão que foi exibida (`visualizado`) e
 *   não declara versão nova;
 * - `nenhuma`: não leva `dossie_versao`.
 */
export type VersaoDoDossieNoEvento = "nova" | "exibida" | "nenhuma";

export interface DefinicaoDoEvento {
  tipo: TipoDeEventoDoEncaminhamento;
  /** Rótulo em português para a linha do tempo. */
  rotulo: string;
  nascimento: NascimentoDoEvento;
  /** Só em `fato_de_linha`. */
  fatoDeLinha?: FatoDeLinha;
  /**
   * Verdadeiro se o evento leva `fato_seq` (o número do fato, escrito só pelo
   * banco, único por encaminhamento). Só o que nasce de uma transição ou de um
   * fato de linha leva; `reencaminhado`, os de inserção direta e os de
   * backfill têm `fato_seq` nulo.
   */
  levaFatoSeq: boolean;
  dossieVersao: VersaoDoDossieNoEvento;
  /**
   * Se o órgão enxerga o evento (`visivel_ao_orgao`). O `reencaminhado` NUNCA é
   * visível ao órgão (CHECK no banco): o órgão que devolveu não sabe para onde
   * o pedido foi.
   */
  visivelAoOrgao: boolean;
  /**
   * Quem insere diretamente (lista positiva da RESTRICTIVE de INSERT). Vazio
   * para tudo o que o banco gera: o `dc360_app` nunca os insere, sob ator
   * nenhum, servidor inclusive.
   */
  atoresDeInsercaoDireta: readonly TipoDeAtorDoEncaminhamento[];
  /**
   * Só o `visualizado`: o autor `link` é gravado pela função `abrir_oficio`
   * (SECURITY DEFINER), nunca por uma rota (decisão 8).
   */
  gravadoPorFuncao?: "abrir_oficio";
  /**
   * Quem produz o evento quando ele NÃO nasce de uma transição da tabela
   * (para os que nascem de transição, o ator vem da tabela). Os papéis do
   * servidor são os de `permissoes.ts`; os do órgão, os do vínculo.
   */
  quemProduz?: {
    servidor?: readonly Papel[];
    usuarioOrgao?: readonly PapelNoOrgao[];
    sistema?: boolean;
  };
  /**
   * As chaves de TEXTO LIVRE admitidas no `detalhe` (lista de inclusão, decisão
   * 5). Texto livre que a Defesa Civil ou o órgão escreve para a outra ponta só
   * entra por aqui ou pelo dossiê, e o banco confere. O gerador copia o texto
   * da rodada, escrito nas colunas da própria linha, para estas chaves.
   */
  chavesDeTexto: readonly string[];
  /** As demais chaves admitidas: ids, números e marcos, nunca texto livre. */
  chavesEstruturadas: readonly string[];
  /**
   * O que nasce do evento (proposta da parte 0D, a E03 banco e a E11
   * confirmam por teste que comparam com esta tabela):
   * - `espelhoNaTrilha`: a linha em `trilha_eventos` da ocorrência (origem
   *   `portal` se o ator é do órgão, `escritorio` se é servidor);
   * - `avisosParaADefesaCivil`: os tipos de aviso do sino da Defesa Civil;
   * - `avisoDoOrgao`: o aviso do lado do órgão (`avisos_do_orgao`, E11).
   */
  espelhoNaTrilha: boolean;
  avisosParaADefesaCivil: readonly string[];
  avisoDoOrgao: boolean;
}

const SEM_ATOR_DIRETO: readonly TipoDeAtorDoEncaminhamento[] = [];

function geradoPelaTransicao(
  tipo: TipoDeEventoDoEncaminhamento,
  rotulo: string,
  resto: Partial<DefinicaoDoEvento>,
): DefinicaoDoEvento {
  return {
    tipo,
    rotulo,
    nascimento: "transicao",
    levaFatoSeq: true,
    dossieVersao: "nenhuma",
    visivelAoOrgao: true,
    atoresDeInsercaoDireta: SEM_ATOR_DIRETO,
    chavesDeTexto: [],
    chavesEstruturadas: [],
    espelhoNaTrilha: true,
    avisosParaADefesaCivil: [],
    avisoDoOrgao: false,
    ...resto,
  };
}

function fatoDaLinha(
  tipo: TipoDeEventoDoEncaminhamento,
  rotulo: string,
  fato: FatoDeLinha,
  resto: Partial<DefinicaoDoEvento>,
): DefinicaoDoEvento {
  return {
    ...geradoPelaTransicao(tipo, rotulo, {}),
    nascimento: "fato_de_linha",
    fatoDeLinha: fato,
    ...resto,
  };
}

/**
 * Uma entrada por tipo. A tabela tem de concordar com `TRANSICOES_DO_ENCAMINHAMENTO`
 * (todo evento de transição é o de alguma linha, e toda linha tem o seu) e,
 * no banco, com o gerador e com os CHECK por tipo (teste da E03 banco).
 */
export const EVENTOS_DO_ENCAMINHAMENTO: Record<TipoDeEventoDoEncaminhamento, DefinicaoDoEvento> = {
  enviado: geradoPelaTransicao("enviado", "Enviado ao órgão", {
    dossieVersao: "nova",
    chavesEstruturadas: ["campos_do_dossie"], // as chaves do dossiê, nunca os valores
    avisoDoOrgao: true,
  }),
  aceito: geradoPelaTransicao("aceito", "Aceito pelo órgão", {
    avisosParaADefesaCivil: ["encaminhamento_aceito"],
  }),
  devolvido: geradoPelaTransicao("devolvido", "Devolvido pelo órgão", {
    chavesDeTexto: ["motivo"],
    chavesEstruturadas: ["destino_sugerido_orgao_id"], // vem do catálogo de órgãos
    avisosParaADefesaCivil: ["encaminhamento_devolvido"],
  }),
  esclarecimento_solicitado: geradoPelaTransicao(
    "esclarecimento_solicitado",
    "Esclarecimento solicitado pelo órgão",
    {
      chavesDeTexto: ["pergunta"],
      avisosParaADefesaCivil: ["esclarecimento_solicitado"],
    },
  ),
  esclarecimento_respondido: geradoPelaTransicao(
    "esclarecimento_respondido",
    "Esclarecimento respondido pela Defesa Civil",
    {
      chavesDeTexto: ["resposta"],
      avisoDoOrgao: true,
    },
  ),
  respondido: geradoPelaTransicao("respondido", "Respondido pelo órgão", {
    chavesDeTexto: ["resposta"],
    chavesEstruturadas: ["desfecho"],
    avisosParaADefesaCivil: ["encaminhamento_respondido"],
  }),
  complemento_solicitado: geradoPelaTransicao("complemento_solicitado", "Complemento solicitado", {
    chavesDeTexto: ["complemento"],
    avisoDoOrgao: true,
  }),
  concluido: geradoPelaTransicao("concluido", "Concluído", { avisoDoOrgao: true }),
  cancelado: geradoPelaTransicao("cancelado", "Cancelado", {
    chavesDeTexto: ["motivo"],
    avisoDoOrgao: true,
  }),
  reenviado: geradoPelaTransicao("reenviado", "Reenviado ao órgão", {
    dossieVersao: "nova",
    chavesEstruturadas: ["campos_do_dossie"],
    avisoDoOrgao: true,
  }),

  prazo_alterado: fatoDaLinha("prazo_alterado", "Prazo alterado", "prazo", {
    chavesDeTexto: ["motivo"],
    chavesEstruturadas: ["prazo_anterior_em", "prazo_novo_em"],
    avisoDoOrgao: true,
    quemProduz: { servidor: PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO },
  }),
  prioridade_alterada: fatoDaLinha("prioridade_alterada", "Prioridade alterada", "prioridade", {
    chavesDeTexto: ["motivo"],
    chavesEstruturadas: ["prioridade_anterior", "prioridade_nova"],
    avisoDoOrgao: true,
    quemProduz: { servidor: PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO },
  }),
  /*
    A atribuição nominal é do gestor do órgão (CP-20): a matriz coluna por ator
    dá `destinatario_id` ao ator de órgão só com o papel `gestor` no vínculo. A
    Defesa Civil não atribui pessoa de dentro do órgão; se a E03 banco quiser
    dar isso ao servidor, é decisão a registrar, e esta linha muda junto.
    É assunto interno do órgão: não gera aviso para o outro lado.
  */
  atribuicao_alterada: fatoDaLinha("atribuicao_alterada", "Atribuição alterada", "atribuicao", {
    chavesEstruturadas: ["destinatario_anterior_id", "destinatario_novo_id"],
    quemProduz: { usuarioOrgao: ["gestor"] },
  }),
  /*
    A ADR 0010 lista `cobrar` entre as transições da Defesa Civil (D-24) mas não
    diz como o evento nasce, e diz que o servidor não insere evento nenhum na
    F04. Cobrar não muda estado. Logo `cobrado` só pode ser fato de linha (uma
    coluna mapeada que a cobrança toca), e é assim que está declarado. Se a E03
    banco concluir outra coisa, esta linha e a ADR mudam juntas.
  */
  cobrado: fatoDaLinha("cobrado", "Cobrança registrada", "cobranca", {
    chavesDeTexto: ["mensagem"],
    avisoDoOrgao: true,
    quemProduz: { servidor: PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO },
  }),
  /*
    Correção 2, item 2: o encaminhamento legado "pedido em revisão" é o único
    caso de versão nova do dossiê sem transição de estado. O coordenador ou o
    administrador insere a versão 2 e, no comando seguinte, limpa a marca; o
    gerador grava este fato, com a versão.
  */
  dossie_recomposto: fatoDaLinha(
    "dossie_recomposto",
    "Pedido recomposto",
    "marca_pedido_em_revisao",
    {
      dossieVersao: "nova",
      chavesEstruturadas: ["campos_do_dossie"],
      avisoDoOrgao: true,
      quemProduz: { servidor: PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO },
    },
  ),

  /*
    Reencaminhar cria um encaminhamento NOVO para outro órgão. O evento fica no
    pai, preso ao filho por `encaminhamento_filho_id`, e o órgão que devolveu
    nunca o vê nem sabe para onde o pedido foi (CHECK no banco).
  */
  reencaminhado: {
    tipo: "reencaminhado",
    rotulo: "Reencaminhado a outro órgão",
    nascimento: "filho",
    levaFatoSeq: false,
    dossieVersao: "nenhuma",
    visivelAoOrgao: false,
    atoresDeInsercaoDireta: SEM_ATOR_DIRETO,
    quemProduz: { servidor: PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO },
    chavesDeTexto: [],
    chavesEstruturadas: [],
    espelhoNaTrilha: true,
    avisosParaADefesaCivil: [],
    avisoDoOrgao: false,
  },

  /*
    Os de inserção direta: lista positiva por ator, sem `fato_seq`. O banco
    deriva autor, marca e visibilidade e ignora o que vier no comando.
    O `visualizado` do usuário de órgão é só do próprio órgão; o de autor
    `link` é gravado por `abrir_oficio`.
  */
  visualizado: {
    tipo: "visualizado",
    rotulo: "Visualizado",
    nascimento: "insercao_direta",
    levaFatoSeq: false,
    dossieVersao: "exibida",
    visivelAoOrgao: true,
    atoresDeInsercaoDireta: ["usuario_orgao"],
    gravadoPorFuncao: "abrir_oficio",
    quemProduz: { usuarioOrgao: PAPEIS_NO_ORGAO },
    chavesDeTexto: [],
    chavesEstruturadas: [],
    espelhoNaTrilha: false,
    avisosParaADefesaCivil: [],
    avisoDoOrgao: false,
  },
  lembrete: {
    tipo: "lembrete",
    rotulo: "Lembrete de prazo",
    nascimento: "insercao_direta",
    levaFatoSeq: false,
    dossieVersao: "nenhuma",
    visivelAoOrgao: true,
    atoresDeInsercaoDireta: ["sistema"],
    quemProduz: { sistema: true },
    chavesDeTexto: [],
    chavesEstruturadas: ["marco"], // índice único (encaminhamento, marco)
    espelhoNaTrilha: false,
    avisosParaADefesaCivil: ["encaminhamento_sem_aceite", "encaminhamento_vencido"],
    avisoDoOrgao: true,
  },
  /*
    O escalonamento automático é do `sistema`. A E08 e a E16 falam também de uma
    rota da Defesa Civil que "sobe um nível"; pela ADR o servidor não insere
    evento algum na F04, então essa rota precisa de outro caminho (por exemplo,
    pedir ao relógio) a definir pela E16. Aqui vale a ADR.
  */
  escalonado: {
    tipo: "escalonado",
    rotulo: "Escalonado",
    nascimento: "insercao_direta",
    levaFatoSeq: false,
    dossieVersao: "nenhuma",
    visivelAoOrgao: true,
    atoresDeInsercaoDireta: ["sistema"],
    quemProduz: { sistema: true },
    chavesDeTexto: [],
    chavesEstruturadas: ["nivel"], // índice único (encaminhamento, nivel)
    espelhoNaTrilha: false,
    avisosParaADefesaCivil: [],
    avisoDoOrgao: true,
  },

  migracao: {
    tipo: "migracao",
    rotulo: "Registro anterior à nova máquina",
    nascimento: "backfill",
    levaFatoSeq: false,
    dossieVersao: "nenhuma",
    visivelAoOrgao: false,
    atoresDeInsercaoDireta: SEM_ATOR_DIRETO,
    chavesDeTexto: [],
    chavesEstruturadas: [],
    espelhoNaTrilha: false,
    avisosParaADefesaCivil: [],
    avisoDoOrgao: false,
  },
};

/** Os tipos que o BANCO grava a partir do acontecimento: o `dc360_app` nunca os insere. */
export const EVENTOS_GERADOS_PELO_BANCO: readonly TipoDeEventoDoEncaminhamento[] =
  TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO.filter((t) => {
    const n = EVENTOS_DO_ENCAMINHAMENTO[t].nascimento;
    return n === "transicao" || n === "fato_de_linha" || n === "filho";
  });

/** Os tipos de inserção direta pelo `dc360_app`, que a RESTRICTIVE de INSERT lista por ator. */
export const EVENTOS_DE_INSERCAO_DIRETA: readonly TipoDeEventoDoEncaminhamento[] =
  TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO.filter(
    (t) => EVENTOS_DO_ENCAMINHAMENTO[t].nascimento === "insercao_direta",
  );

/**
 * A lista positiva por ator de sessão. `servidor` não insere nenhum na F04. O
 * autor `link` não entra: não passa por policy do `dc360_app`, só por
 * `abrir_oficio`.
 */
export const TIPOS_DE_INSERCAO_DIRETA_POR_ATOR: Record<
  Exclude<TipoDeAtorDoEncaminhamento, "link">,
  readonly TipoDeEventoDoEncaminhamento[]
> = {
  servidor: EVENTOS_DE_INSERCAO_DIRETA.filter((t) =>
    EVENTOS_DO_ENCAMINHAMENTO[t].atoresDeInsercaoDireta.includes("servidor"),
  ),
  usuario_orgao: EVENTOS_DE_INSERCAO_DIRETA.filter((t) =>
    EVENTOS_DO_ENCAMINHAMENTO[t].atoresDeInsercaoDireta.includes("usuario_orgao"),
  ),
  sistema: EVENTOS_DE_INSERCAO_DIRETA.filter((t) =>
    EVENTOS_DO_ENCAMINHAMENTO[t].atoresDeInsercaoDireta.includes("sistema"),
  ),
};

/** Os tipos que declaram versão nova do dossiê: exatamente `enviado`, `reenviado` e `dossie_recomposto`. */
export const EVENTOS_QUE_DECLARAM_VERSAO_DO_DOSSIE: readonly TipoDeEventoDoEncaminhamento[] =
  TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO.filter(
    (t) => EVENTOS_DO_ENCAMINHAMENTO[t].dossieVersao === "nova",
  );

/** O evento que a transição (de, para) grava, ou `undefined` se o par não existe. */
export function eventoDaTransicao(
  de: EstadoDoEncaminhamento | null,
  para: EstadoDoEncaminhamento,
): TipoDeEventoDoEncaminhamento | undefined {
  return transicaoDoEncaminhamento(de, para)?.evento;
}
