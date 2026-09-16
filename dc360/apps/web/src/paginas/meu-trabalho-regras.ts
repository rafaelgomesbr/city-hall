import { chaveDeBusca } from "../busca/registros";

/**
 * O filtro de "Meu trabalho", fora do React.
 *
 * A caixa de busca do topo manda o agente de campo para
 * `/meu-trabalho?busca=...`, e a tela ignorava o parâmetro: quem digitava o
 * protocolo e dava Enter chegava na lista inteira, sem sinal de que a busca
 * existiu. O filtro é sobre o que a tela já tem (a lista da equipe dele,
 * que é curta por definição), sem nova consulta: protocolo e endereço, sem
 * acento e sem caixa, pela mesma normalização da busca.
 */
export function filtrarTarefas<T extends { protocolo: string; endereco: string }>(
  busca: string,
  tarefas: readonly T[],
): T[] {
  const termo = chaveDeBusca(busca);
  if (termo.length === 0) return [...tarefas];
  return tarefas.filter((t) => chaveDeBusca(`${t.protocolo} ${t.endereco}`).includes(termo));
}
