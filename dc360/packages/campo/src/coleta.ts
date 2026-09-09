/**
 * A lápide da coleta: o que o aparelho lembra depois que a vistoria saiu da
 * tela e entrou na fila.
 *
 * O defeito que este arquivo existe para impedir foi visto na sequência mais
 * comum do produto, e ele produz duas versões do mesmo laudo:
 *
 *   1. O agente conclui a vistoria. Ela entra na fila de sincronização e o
 *      rascunho é apagado, porque quem responde por ela a partir dali é a fila.
 *   2. A lista de tarefas continua sendo a que foi baixada de manhã, e ela só
 *      muda quando houver sinal. No morro, isso leva horas.
 *   3. A ocorrência segue lá, sem marca nenhuma. Um toque abre a tela de
 *      vistoria, que não acha rascunho e cunha uma chave de idempotência NOVA.
 *   4. O servidor recebe duas coletas com chaves diferentes para a mesma
 *      ocorrência e aceita as duas, porque é exatamente isso que uma chave
 *      diferente significa. Duas vistorias, dois laudos, um protocolo só.
 *
 * A chave de idempotência não resolve isso: ela impede o MESMO envio de entrar
 * duas vezes, e aqui são dois envios diferentes de verdade. O que falta é
 * memória local de que aquela ocorrência já foi coletada NESTE aparelho, e é
 * essa memória que a lápide guarda.
 *
 * A decisão de abrir mora aqui, fora do Expo, para ter teste sem aparelho. A
 * tela obedece.
 */

/**
 * Em que pé está a coleta que este aparelho já fez.
 *
 * - `na_fila`: entrou na fila de sincronização e ainda não subiu.
 * - `enviada`: a fila confirmou o envio ao servidor.
 * - `arquivada`: o agente pediu, com confirmação, para vistoriar de novo. A
 *   lápide continua existindo (ela é o registro de que houve uma coleta antes),
 *   mas deixa de barrar a abertura.
 */
export type SituacaoDaColeta = "na_fila" | "enviada" | "arquivada";

export type ColetaLocal = {
  ocorrenciaId: string;
  /** A chave da coleta que já foi feita. Serve para achá-la na fila de envio. */
  idempotencyKey: string;
  protocolo: string;
  coletadaEm: string;
  situacao: SituacaoDaColeta;
};

/**
 * O que a tela de vistoria faz ao abrir.
 *
 * - `continuar`: existe rascunho, e ele é retomado como sempre foi.
 * - `ja_coletada`: esta ocorrência já foi coletada neste aparelho. A tela NÃO
 *   cria rascunho: cria rascunho é o que produz a segunda vistoria.
 * - `nova`: nada aqui, começa do zero.
 */
export type DecisaoDeAbertura = "continuar" | "ja_coletada" | "nova";

/**
 * A ordem das perguntas é a correção, e não um detalhe de escrita.
 *
 * A lápide é consultada ANTES do rascunho, e isso cobre o único jeito de os
 * dois existirem ao mesmo tempo sem intenção do agente: a conclusão enfileira,
 * grava a lápide e só então apaga o rascunho, e se o aparelho morrer entre a
 * segunda e a terceira etapa sobra um rascunho de uma coleta que já está na
 * fila. Retomar esse rascunho seria refazer, à mão, a vistoria que já foi.
 *
 * `arquivada` não barra, e é assim que a saída deliberada funciona: o agente
 * confirma "fazer nova vistoria", a lápide passa a arquivada e a próxima
 * decisão volta a ser `continuar` (se havia rascunho) ou `nova`. Repare que
 * arquivar NÃO destrói o rascunho preso no caso acima: ele reaparece em vez de
 * ser perdido, que é o desfecho certo para dado que o agente digitou no morro.
 *
 * Bloquear a revistoria por completo seria pior do que o defeito: revistoria é
 * legítima (a migração 009 trata disso, uma ocorrência pode ser vistoriada mais
 * de uma vez). O que não pode é ela acontecer por acidente de um toque.
 */
export function decidirAberturaDaVistoria(entrada: {
  rascunho: { idempotencyKey: string } | null;
  coleta: ColetaLocal | null;
}): DecisaoDeAbertura {
  const { rascunho, coleta } = entrada;
  if (coleta && coleta.situacao !== "arquivada") return "ja_coletada";
  if (rascunho) return "continuar";
  return "nova";
}

/**
 * O que a lista de tarefas escreve na ocorrência que já foi coletada.
 *
 * Sem isto a tarefa continua na lista exatamente igual às que ninguém tocou,
 * durante todo o tempo em que faltar sinal, e o agente não tem como saber que
 * já esteve lá. O selo é a diferença entre "ainda preciso subir" e "isso já
 * foi, está só esperando rede".
 *
 * `arquivada` não gera selo: o agente decidiu vistoriar de novo, então a
 * tarefa está em aberto outra vez e dizer "coletada" ali seria mentira.
 */
export function seloDaColeta(coleta: ColetaLocal | null): string | null {
  if (!coleta) return null;
  if (coleta.situacao === "na_fila") return "Coletada, aguardando envio";
  if (coleta.situacao === "enviada") return "Coletada e enviada";
  return null;
}

/**
 * A ordem da conclusão, e ela é obrigatória: enfileirar, gravar a lápide,
 * apagar o rascunho.
 *
 * Cada inversão perde alguma coisa, e nenhuma delas é recuperável em campo:
 *
 * - Apagar o rascunho antes de enfileirar perde a vistoria inteira se a fila
 *   recusar. É o pior desfecho possível da tela.
 * - Apagar o rascunho antes de gravar a lápide deixa, se a gravação falhar, uma
 *   coleta na fila sem lápide nenhuma e sem rascunho: a tarefa volta a parecer
 *   intocada e o próximo toque abre a segunda vistoria, que é exatamente o
 *   defeito que a lápide existe para impedir.
 *
 * Na ordem certa, toda falha para num ponto seguro: sem fila, nada mudou; sem
 * lápide, o rascunho continua lá; sem apagar o rascunho, a lápide já barra a
 * abertura (ver `decidirAberturaDaVistoria`).
 *
 * Mora aqui, e não solto dentro da tela, porque ordem que só existe em três
 * linhas seguidas de um componente é ordem que a próxima edição inverte sem
 * ninguém perceber. Aqui ela tem teste.
 */
export async function concluirColetaEmOrdem(passos: {
  /*
    `Promise<unknown>` e nao `Promise<void>` de proposito: `fila.enfileirar`
    devolve o item criado, e exigir `void` aqui obrigaria cada chamada a
    embrulhar o passo numa funcao so para descartar o retorno. O que importa
    nesta funcao e a ORDEM e a interrupcao na primeira falha, nunca o valor.
  */
  enfileirar: () => Promise<unknown>;
  registrarColeta: () => Promise<unknown>;
  descartarRascunho: () => Promise<unknown>;
}): Promise<void> {
  await passos.enfileirar();
  await passos.registrarColeta();
  await passos.descartarRascunho();
}
