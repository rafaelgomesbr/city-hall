import { espaco } from "../tokens";

/**
 * O LADO DO QUADRADO do mapa, na tela do mapa.
 *
 * O reclame de quem paga: "a área que o mapa ocupa na tela também é pequena,
 * eu imaginava pelo menos um quadrado perfeito". Era 38% da altura da tela,
 * com piso e teto, e as duas legendas DENTRO dessa altura: num telefone comum
 * sobravam uns 260 pontos de mapa para uns 400 de largura, e o quadrado
 * "perfeito" que ele imaginava era o dobro disso.
 *
 * Agora o lado é a largura útil da tela (a largura menos o recuo lateral que
 * toda a tela usa), e a altura é igual. As legendas ficam embaixo, fora do
 * quadrado, porque a tela inteira rola e não há mais faixa fixa para dividir.
 *
 * Função pura, com a largura entrando como argumento, para o caso de teste
 * medir a conta sem montar tela: `useWindowDimensions` é da tela, a conta é
 * daqui.
 */

/**
 * O teto, para tablet.
 *
 * Num tablet de 1024 pontos de largura, um quadrado de 992 de lado empurraria
 * o cartão da escolhida e a lista inteira para fora da primeira tela, e o
 * agente teria que rolar uma tela inteira de mapa para achar a primeira
 * tarefa. Seiscentos pontos é maior que a largura de qualquer telefone (então
 * no telefone o teto nunca pega) e cabe num tablet deixando o cartão à vista.
 */
export const LADO_MAXIMO_DO_MAPA = 600;

export function ladoDoMapa(larguraDaTela: number): number {
  return Math.min(LADO_MAXIMO_DO_MAPA, Math.max(0, larguraDaTela - 2 * espaco.e4));
}
