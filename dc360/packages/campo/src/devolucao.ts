import type { ItemFila } from "./tipos.js";

/**
 * As regras da devolução de tarefa vencida, fora da tela.
 *
 * Elas moram aqui pelo mesmo motivo de `conclusao.ts`: regra escrita dentro do
 * componente é regra sem teste, e a lista de condições que libera um botão
 * sempre acaba existindo duas vezes (uma no `disabled`, outra no aviso que
 * explica o que falta) até as duas divergirem. Aqui é uma função só, e a frase
 * que o agente lê sai da mesma resposta que esconde o botão.
 *
 * O QUE A DEVOLUÇÃO É, em uma frase, porque a palavra decide o uso: a tarefa
 * sai da lista do agente e a ocorrência VOLTA para a coordenação, com nome,
 * hora e motivo. Não encerra nada e não apaga nada. Por isso o verbo é
 * "devolver" e nunca "descartar": quem lê "descartar" acredita que a ocorrência
 * some e aperta achando que está limpando lixo, quando está pedindo que outra
 * pessoa assuma.
 */

/**
 * Por que esta tarefa NÃO pode ser devolvida agora.
 *
 * - `no_prazo`: o prazo ainda corre. Sem essa trava, um dia ruim vira uma lista
 *   limpa às oito da manhã e a coordenação descobre ao meio-dia.
 * - `coleta_no_aparelho`: existe vistoria desta ocorrência esperando envio
 *   neste aparelho. Devolver jogaria fora trabalho já feito no morro, em
 *   silêncio, e faria a coordenação receber "não deu para vistoriar" sobre uma
 *   vistoria que existe.
 */
export type ImpedimentoDeDevolucao = "no_prazo" | "coleta_no_aparelho";

/**
 * A decisão da TELA, que é a primeira barreira e não a única.
 *
 * Quem decide de verdade se a tarefa venceu é o relógio do SERVIDOR (ver
 * `devolucaoDeTarefaSchema`): relógio de aparelho é ajustável, erra sozinho e
 * atravessa fuso. Esta função existe para o agente não tocar num botão que vai
 * receber recusa, e não para autorizar coisa nenhuma.
 */
export function impedimentoParaDevolver(situacao: {
  /** Calculado com `quantoFalta`, que é o mesmo prazo que a lista já mostra. */
  vencida: boolean;
  /**
   * Há vistoria desta ocorrência guardada neste aparelho.
   *
   * Duas fontes, e as duas contam: o item na fila de envio, e a lápide da
   * coleta (`coletas`), que sobrevive à fila ser limpa depois da confirmação.
   * Só a fila deixaria uma janela: a coleta confirmada sai da fila em trinta
   * segundos, e a tarefa vencida da lista antiga voltaria a oferecer devolução
   * sobre uma vistoria que já está no servidor.
   */
  coletaNoAparelho: boolean;
}): ImpedimentoDeDevolucao | null {
  /*
    A coleta vem ANTES do prazo, e a ordem é o conteúdo: a tarefa vencida COM
    coleta guardada é o caso em que a frase errada custa uma vistoria. Dizer
    "ainda está no prazo" ali seria mentira, e dizer nada convidaria ao toque.
  */
  if (situacao.coletaNoAparelho) return "coleta_no_aparelho";
  if (!situacao.vencida) return "no_prazo";
  return null;
}

/**
 * O que a tela escreve no lugar do botão, para cada impedimento.
 *
 * Cada frase termina no que o agente pode fazer, porque frase que só nega
 * ensina a pessoa a procurar outro caminho (e o outro caminho aqui é refazer a
 * vistoria ou ligar para a coordenação).
 */
export const FRASE_DO_IMPEDIMENTO: Record<ImpedimentoDeDevolucao, string> = {
  no_prazo:
    "Esta tarefa ainda está no prazo. Devolver só é possível depois que o prazo "
    + "vencer: até lá, a vistoria continua sendo sua.",
  coleta_no_aparelho:
    "Você já vistoriou esta ocorrência neste aparelho. Devolver jogaria esse "
    + "trabalho fora, e a coordenação receberia \"não deu para vistoriar\" sobre "
    + "uma vistoria que existe. Se ela ainda não chegou lá, o que falta é sinal: "
    + "veja a fila de envio.",
};

/**
 * Em que pé está a devolução que já foi pedida neste aparelho.
 *
 * - `a_caminho`: pedida e ainda não recusada. A tarefa SAI da lista ativa do
 *   agente, que é o alívio que ele quer, e o item continua visível na fila até
 *   o servidor confirmar. Some do aparelho só depois disso.
 * - `recusada`: o servidor não aceitou (a tarefa ainda não venceu pelo relógio
 *   dele, a equipe é outra, o autor diverge). A tarefa VOLTA para a lista, com
 *   a frase que veio do servidor. Sumir da lista sem a coordenação ter recebido
 *   seria o pior dos dois mundos: ninguém foi lá e ninguém sabe disso.
 */
export type SituacaoDaDevolucao = "a_caminho" | "recusada";

export type DevolucaoNoAparelho = {
  ocorrenciaId: string;
  situacao: SituacaoDaDevolucao;
  /** A frase do servidor, quando houve recusa. Nunca inventada aqui. */
  mensagem: string | null;
};

/**
 * O que a fila diz, por ocorrência, sobre devolução.
 *
 * Uma função só, e a lista de tarefas e a tela da fila leem daqui, pela mesma
 * razão de `autoriaDaColeta`: duas listas para o mesmo fato divergem na
 * primeira pressa, e a divergência aqui seria a lista escondendo uma tarefa
 * cuja devolução o servidor já recusou.
 *
 * `confirmado` conta como `a_caminho` de propósito: o item ainda está na fila,
 * visível, e quem o tira de lá é a limpeza dos confirmados. Enquanto ele
 * existir, a tarefa continua fora da lista, e é a confirmação que autoriza o
 * aparelho a esquecer a tarefa de vez.
 *
 * `arquivado` conta como `recusada`: é o código `ja_encerrada`, ou seja, a
 * ocorrência foi encerrada no painel. A devolução não chegou a acontecer, e a
 * tarefa precisa reaparecer com a explicação em vez de sumir em silêncio.
 */
export function devolucoesPorOcorrencia(
  itens: readonly ItemFila[],
): Map<string, DevolucaoNoAparelho> {
  const mapa = new Map<string, DevolucaoNoAparelho>();
  for (const item of itens) {
    if (item.tipo !== "devolucao") continue;
    const recusada = item.estado === "bloqueado" || item.estado === "arquivado";
    mapa.set(item.ocorrenciaId, {
      ocorrenciaId: item.ocorrenciaId,
      situacao: recusada ? "recusada" : "a_caminho",
      mensagem: recusada ? item.ultimaFalha?.mensagem ?? null : null,
    });
  }
  return mapa;
}

/**
 * Há coleta desta ocorrência guardada neste aparelho?
 *
 * Em QUALQUER estado, e isso é a regra e não descuido: bloqueada é trabalho a
 * recuperar, confirmada já chegou ao servidor, e nos dois casos uma devolução
 * dizendo "não deu para vistoriar" seria falsa.
 */
export function temColetaNaFila(
  itens: readonly ItemFila[],
  ocorrenciaId: string,
): boolean {
  return itens.some((i) => i.tipo === "vistoria" && i.ocorrenciaId === ocorrenciaId);
}
