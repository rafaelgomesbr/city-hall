/**
 * A precisão da leitura de GPS, em metros inteiros, do jeito que o esquema
 * compartilhado aceita (`vistoriaSchema`: positiva ou nula).
 *
 * Piso de 1 metro. `Math.round(0.3)` é 0, o esquema exige precisão positiva,
 * e o melhor GPS do plantão era o único que não conseguia concluir: o
 * servidor respondia 422 (CMP-33, V2-F00-E15). Dizer "1 metro" de uma leitura
 * de 0,3 m é arredondar para o lado prudente, nunca prometer mais precisão do
 * que houve.
 *
 * Sem precisão informada (o aparelho não mediu, ou mediu algo que não é
 * número) continua nulo, que é "não informada", e não um número inventado. O
 * zero cai no mesmo caso: nenhum receptor mede erro zero, então zero é falta
 * de medida, e é assim que o aplicativo sempre o tratou.
 */
export function precisaoDoGpsEmMetros(precisao: number | null | undefined): number | null {
  if (typeof precisao !== "number" || !Number.isFinite(precisao) || precisao <= 0) return null;
  return Math.max(1, Math.round(precisao));
}
