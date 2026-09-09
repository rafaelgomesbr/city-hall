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

/**
 * A confissão de que a classificação ainda não foi feita.
 *
 * Fica FORA de `TIPOS_COBRADE`, e essa é a decisão inteira. A COBRADE é fechada
 * e não se inventa nome novo dentro dela: quem varre a taxonomia (o gráfico por
 * tipo, a prestação de contas, a série histórica do município) continua varrendo
 * os oito de cima, e nenhum deles ganha um nono irmão que a norma não tem.
 *
 * Só que o plantão recebe chamado que não cabe nos oito: queda de árvore sobre a
 * via, rompimento de adutora, muro do vizinho que desabou. Até aqui o operador
 * escolhia o menos errado, e isso não produz dado incompleto, produz dado FALSO.
 * "Vendaval: dez chamados", dos quais três eram outra coisa, é um número que
 * ninguém pode usar e que ninguém sabe que não pode usar. É pior que a lacuna,
 * porque a lacuna se vê.
 *
 * `outro` não é categoria: é a marca de que a decisão técnica está pendente. E
 * ela não pode ficar pendente para sempre, por isso `precisaReclassificar` barra
 * o despacho enquanto o tipo for este.
 */
export const TIPO_A_CLASSIFICAR = "outro";

/**
 * O que o operador pode escolher na abertura do chamado.
 *
 * A abertura é feita ao telefone, por quem atende, em minutos, e não é ali que
 * mora a competência técnica para dizer se aquilo é enxurrada ou alagamento. A
 * triagem é. Por isso a lista da ABERTURA é mais larga que a taxonomia, e a
 * lista da TRIAGEM é exatamente a taxonomia.
 */
export const TIPOS_DE_ENTRADA = [...TIPOS_COBRADE, TIPO_A_CLASSIFICAR] as const;
export type TipoDeEntrada = (typeof TIPOS_DE_ENTRADA)[number];

/**
 * Quem ainda não pode ser despachado, e por quê.
 *
 * O tipo real precisa ser decidido por quem tem competência técnica, e o único
 * momento em que isso acontece com alguém olhando o chamado inteiro é a triagem.
 * Sem este portão, "outro" atravessaria o fluxo até o laudo: o documento oficial
 * sairia com brasão, assinatura e a palavra "Outro" no campo do tipo, e a
 * classificação nunca mais seria feita, porque depois do despacho ninguém volta.
 *
 * Barra o DESPACHO e não a abertura, de propósito. Recusar na abertura devolveria
 * o problema para quem está ao telefone com a pessoa, que é justamente quem não
 * sabe responder.
 */
export function precisaReclassificar(tipo: string): boolean {
  return tipo === TIPO_A_CLASSIFICAR;
}

/** A frase que a tela e a API dizem quando o despacho é barrado por isto. */
export const MOTIVO_RECLASSIFICAR =
  "Esta ocorrência entrou como \"Outro\" e ainda não foi classificada. "
  + "Escolha o tipo na triagem antes de despachar a equipe.";

/*
  A tabela de rótulos cobre `TipoDeEntrada`, e não só a COBRADE, apesar do nome.

  Não é descuido de nomenclatura: toda tela do produto imprime o tipo com
  `ROTULO_TIPO_COBRADE[o.tipo]`, e uma ocorrência aberta como "outro" que caísse
  numa tabela sem essa chave sairia como espaço em branco no meio da lista do
  coordenador. Espaço em branco não é erro visível, é uma linha que parece sem
  tipo, e ninguém abre chamado para investigar um branco.
*/
export const ROTULO_TIPO_COBRADE: Record<TipoDeEntrada, string> = {
  deslizamento: "Deslizamento",
  inundacao: "Inundação",
  alagamento: "Alagamento",
  enxurrada: "Enxurrada",
  vendaval: "Vendaval",
  granizo: "Granizo",
  colapso_edificacao: "Colapso de edificação",
  incendio_urbano: "Incêndio urbano",
  /*
    O rótulo diz o que falta, e não só "Outro". Quem lê isto na fila de triagem
    precisa entender que a linha exige uma decisão dele, e "Outro" sozinho parece
    uma categoria legítima que já foi escolhida por alguém.
  */
  [TIPO_A_CLASSIFICAR]: "Outro, a classificar na triagem",
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

/**
 * Estado do qual não se sai.
 *
 * Serve para separar dois casos que parecem o mesmo: repetir um passo e
 * repetir um desfecho.
 *
 * Reclassificar uma ocorrência que já está em triagem é rotina, e o segundo
 * evento na trilha é informação verdadeira: a severidade mudou. Encerrar uma
 * ocorrência já encerrada não é rotina, é um clique duplicado num botão, e o
 * segundo evento é uma mentira gravada num histórico que não tem policy de
 * DELETE. Não existe correção depois.
 */
export function estadoTerminal(status: StatusOcorrencia): boolean {
  return TRANSICOES_PERMITIDAS[status].length === 0;
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

/**
 * O item que não se resolve com sim ou não, e o defeito que isso causava.
 *
 * "Necessário acionar outro órgão: sim" é meia informação. O laudo chegava ao
 * coordenador dizendo que alguém precisa ser acionado e não dizia quem, então a
 * primeira coisa que ele fazia era ligar para o agente para perguntar. Isso
 * acontecia depois, na base, com o agente já em outra ocorrência ou fora do
 * turno, e é um telefonema que existia só porque a resposta ficou no aparelho.
 *
 * A informação existe no instante da vistoria: quem está no barranco sabe que
 * ali precisa da concessionária de energia, e sabe naquele minuto. O que faltava
 * era lugar para escrever.
 *
 * A constante mora aqui, tipada como `ChaveChecklist`, porque três pontas
 * dependem dela (a tela que abre a seleção, a regra que libera a conclusão e a
 * validação do envelope). Renomear a chave no catálogo acima passa a quebrar a
 * compilação das três, em vez de desligar o desdobramento em silêncio.
 */
export const CHAVE_ACIONAR_ORGAO: ChaveChecklist = "acionar_outro_orgao";

/**
 * Os tipos de evento da trilha, e como cada um se lê na tela.
 *
 * Este mapa existia DUAS vezes, copiado, uma na tela de auditoria e outra na
 * linha do tempo da ocorrência, e as duas cópias já tinham divergido: nenhuma
 * conhecia `documento_emitido`, e a da linha do tempo também não conhecia
 * `resposta_providencia`. As duas telas caíam no `?? tipo` e mostravam a chave
 * crua do banco para o coordenador.
 *
 * Não é defeito estético. A auditoria é a tela que alguém abre quando precisa
 * provar o que aconteceu, e "documento_emitido" numa linha de prova é o
 * sistema falando consigo mesmo na frente de quem precisa entender.
 *
 * `trilha_eventos.tipo` é texto livre no banco de propósito (evento novo não
 * deve exigir migração), e por isso a garantia mora aqui e num portão de
 * teste que varre o código do servidor atrás de tipo sem rótulo.
 */
export const ROTULO_EVENTO_TRILHA: Record<string, string> = {
  registro: "Chamado registrado",
  triagem: "Classificado na triagem",
  despacho: "Equipe despachada",
  vistoria: "Vistoria concluída em campo",
  /*
    A coleta entrou por agente de fora da equipe designada. Evento próprio, e
    não um campo dentro de `vistoria`, porque a pergunta que ele responde é uma
    lista: quais vistorias precisam de conferência da coordenação. Ver a
    migração 024 e `rotas/sincronizacao.ts`.
  */
  vistoria_fora_da_equipe: "Vistoria coletada fora da equipe designada",
  /*
    Alguém acrescentou prova ao processo. O produto registrava quem ABRIU um
    laudo e não registrava quem colocou uma foto dentro dele, que é a peça que
    sai impressa no documento oficial.
  */
  evidencia_anexada: "Evidência fotográfica anexada",
  documento_emitido: "Documento oficial emitido",
  providencia: "Providência encaminhada",
  resposta_providencia: "Resposta do órgão registrada",
  desinterdicao: "Interdição levantada",
  encerramento: "Ocorrência encerrada",
  /*
    Este evento NÃO é escrito por rota, e é o único assim: ele nasce dentro do
    SQL da varredura de minimização, na MESMA transação que remove o nome e o
    contato do solicitante. Em transação separada, um processo que morresse no
    meio deixaria dado removido sem rastro nenhum, e isso é indistinguível de
    perda de dado numa auditoria.

    A consequência para este arquivo: o portão `eventos-tem-rotulo.test.ts`
    varre `apps/api/src` atrás dos tipos gravados, então ele NÃO enxerga este.
    Sem a linha aqui, a tela de auditoria imprimiria a chave crua do banco para
    justamente o evento que o cidadão tem mais razão de querer ler.
  */
  minimizacao_por_prazo: "Dado do solicitante removido por prazo",
};

/** O rótulo, ou a própria chave quando o evento é mais novo que esta versão. */
export function rotuloEventoTrilha(tipo: string): string {
  return ROTULO_EVENTO_TRILHA[tipo] ?? tipo;
}
