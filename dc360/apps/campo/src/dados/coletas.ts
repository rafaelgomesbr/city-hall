import type { ColetaLocal, SituacaoDaColeta } from "@dc360/campo";
import { bancoLocal } from "./banco-local";

/**
 * A memória de que esta ocorrência já foi coletada NESTE aparelho.
 *
 * O rascunho responde "a vistoria está em andamento?" e é apagado assim que a
 * coleta entra na fila. A partir daí, e até o servidor confirmar, nada no
 * aparelho sabia que aquela ocorrência já tinha sido vistoriada: a lista de
 * tarefas continuava mostrando a tarefa igual às outras, e um toque abria
 * vistoria nova com chave de idempotência nova. O servidor aceita, porque
 * chave diferente é a definição de coleta diferente, e o protocolo passa a ter
 * dois laudos.
 *
 * Este arquivo é a ponte entre o disco do aparelho e a decisão, que mora em
 * `@dc360/campo` e tem teste sem Expo. Aqui só há SQL.
 *
 * A lápide é APAGADA quando o servidor confirma que a ocorrência saiu com
 * vistoria concluída (ver `aplicarReconciliacao`, em `pendencias.ts`). É isso
 * que impede a tabela de crescer sem fim num aparelho que roda o ano inteiro.
 */

type Linha = {
  ocorrencia_id: string;
  idempotency_key: string;
  protocolo: string;
  coletada_em: string;
  situacao: string;
};

/**
 * Situação lida do disco vira situação conhecida, ou a mais conservadora.
 *
 * Texto solto numa coluna sempre pode virar algo que este código não conhece
 * (versão anterior do aplicativo, gravação truncada). Nesse caso a resposta é
 * `na_fila`, que BARRA a abertura: errar barrando custa ao agente um toque a
 * mais na saída deliberada, e errar liberando custa um segundo laudo.
 */
function situacaoLida(bruta: string): SituacaoDaColeta {
  if (bruta === "enviada" || bruta === "arquivada" || bruta === "na_fila") return bruta;
  return "na_fila";
}

function daLinha(l: Linha): ColetaLocal {
  return {
    ocorrenciaId: l.ocorrencia_id,
    idempotencyKey: l.idempotency_key,
    protocolo: l.protocolo,
    coletadaEm: l.coletada_em,
    situacao: situacaoLida(l.situacao),
  };
}

/**
 * Grava a lápide da coleta que acabou de entrar na fila.
 *
 * `ON CONFLICT DO UPDATE` e não `INSERT` simples: depois de uma revistoria
 * autorizada, a linha arquivada da coleta anterior é substituída pela nova. Um
 * `INSERT` cru falharia ali, e falhar na gravação da lápide é o caminho de
 * volta para o defeito, porque a conclusão continuaria e apagaria o rascunho.
 */
export async function marcarColetada(coleta: {
  ocorrenciaId: string;
  idempotencyKey: string;
  protocolo: string;
  coletadaEm: string;
}): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync(
    `INSERT INTO coletas (ocorrencia_id, idempotency_key, protocolo, coletada_em, situacao)
     VALUES (?, ?, ?, ?, 'na_fila')
     ON CONFLICT (ocorrencia_id) DO UPDATE SET
       idempotency_key = excluded.idempotency_key,
       protocolo       = excluded.protocolo,
       coletada_em     = excluded.coletada_em,
       situacao        = excluded.situacao`,
    [coleta.ocorrenciaId, coleta.idempotencyKey, coleta.protocolo, coleta.coletadaEm],
  );
}

export async function coletaDe(ocorrenciaId: string): Promise<ColetaLocal | null> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<Linha>(
    `SELECT ocorrencia_id, idempotency_key, protocolo, coletada_em, situacao
       FROM coletas WHERE ocorrencia_id = ?`,
    [ocorrenciaId],
  );
  return linha ? daLinha(linha) : null;
}

/** Todas as lápides, para a lista de tarefas poder selar cada item. */
export async function listarColetas(): Promise<ColetaLocal[]> {
  const db = await bancoLocal();
  const linhas = await db.getAllAsync<Linha>(
    `SELECT ocorrencia_id, idempotency_key, protocolo, coletada_em, situacao
       FROM coletas ORDER BY coletada_em DESC`,
  );
  return linhas.map(daLinha);
}

/**
 * A fila confirmou o envio.
 *
 * Só sobe de `na_fila` para `enviada`, com a condição no próprio `WHERE`. Sem
 * ela, uma lápide `arquivada` (o agente autorizou revistoria) voltaria a barrar
 * a abertura assim que a coleta ANTIGA fosse confirmada pela fila, que é uma
 * ordem de eventos perfeitamente comum: arquivar acontece offline, a
 * confirmação chega quando o sinal volta.
 */
export async function marcarEnviada(ocorrenciaId: string): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync(
    "UPDATE coletas SET situacao = 'enviada' WHERE ocorrencia_id = ? AND situacao = 'na_fila'",
    [ocorrenciaId],
  );
}

/**
 * O agente confirmou que quer vistoriar de novo esta ocorrência.
 *
 * Arquiva em vez de apagar. Apagar perderia o único registro local de que
 * houve uma coleta antes, e é ele que explica, na fila de envio, por que
 * existem duas coletas do mesmo protocolo esperando para subir.
 */
export async function arquivarColeta(ocorrenciaId: string): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync(
    "UPDATE coletas SET situacao = 'arquivada' WHERE ocorrencia_id = ?",
    [ocorrenciaId],
  );
}

/**
 * Apaga a lápide. Chamado quando o SERVIDOR confirma que a ocorrência saiu com
 * vistoria concluída, e não por decisão do aparelho: enquanto o servidor não
 * confirmou, a lápide é a única coisa que impede a segunda vistoria.
 */
export async function esquecerColeta(ocorrenciaId: string): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync("DELETE FROM coletas WHERE ocorrencia_id = ?", [ocorrenciaId]);
}
