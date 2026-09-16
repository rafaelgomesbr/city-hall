import type { FilaDeSincronizacao, ResultadoDaRetirada } from "@dc360/campo";
import { esquecerColeta } from "./coletas";
import { rascunhoDaColeta, salvarRascunho } from "./rascunho";

/**
 * "CORRIGIR A VISTORIA": a coleta parada na fila volta a ser rascunho.
 *
 * Existe por causa da vistoria 000009/2026, em 15/09/2026. O servidor recusou a
 * fotografia com 422, o cartão da fila disse "Precisa de atenção" e ofereceu
 * "Tentar de novo" (que repete a recusa) e "Descartar" (que apaga uma vistoria
 * feita no local). O dono do produto, com o aparelho na mão: "cadê o botão de
 * editar? só tem de descartar". Este é o caminho do botão de editar.
 *
 * Três passos, nesta ordem, e cada inversão perde alguma coisa:
 *
 *   1. O motor devolve a coleta e o rascunho é GRAVADO antes de o item sair da
 *      fila (a ordem mora em `retirarParaCorrecao`, no pacote, com teste lá).
 *      Se a gravação falhar, a coleta continua na fila: nada se perde.
 *   2. A lápide de coleta da ocorrência sai. Ela dizia "coletada, aguardando
 *      envio" e barrava a abertura da tela de vistoria; agora a coleta É o
 *      rascunho, e o rascunho é o registro. Se este passo falhar, a tela de
 *      vistoria mostra "já coletada" com a saída "fazer nova vistoria", que
 *      arquiva a lápide e reabre o rascunho gravado no passo 1: recupera.
 *   3. Quem chamou abre `vistoria/[id]`, que acha o rascunho e continua, com a
 *      lista do que o servidor recusou e com a MESMA chave de idempotência,
 *      para o servidor reconhecer o reenvio.
 *
 * `esquecerColeta` e não `arquivarColeta`: arquivada quer dizer "o agente
 * pediu para fazer OUTRA vistoria, com chave nova", e explica duas coletas do
 * mesmo protocolo na fila. Aqui não há duas: é a mesma, de volta ao rascunho.
 */
export async function devolverParaCorrecao(
  fila: FilaDeSincronizacao,
  itemId: string,
): Promise<ResultadoDaRetirada> {
  const resultado = await fila.retirarParaCorrecao(itemId, async (coleta) => {
    await salvarRascunho(rascunhoDaColeta(coleta));
  });
  if (resultado.retirada) await esquecerColeta(resultado.coleta.ocorrenciaId);
  return resultado;
}
