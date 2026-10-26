import { useSyncExternalStore } from "react";

/**
 * A barra do pé do celular e o menu "Mais".
 *
 * O painel tem até onze destinos (nove telas e, no celular, as duas ações de
 * tela e de conta). Numa barra de 320 a 900 px eles não cabem, e a solução
 * antiga, rolar a barra na horizontal, escondia justamente o que a pessoa não
 * sabia que existia (V2-F00-E13, achado da H08; decisão do Rafael em
 * 2026-10-26: menu "Mais"). Agora a barra mostra só os destinos mais usados, em
 * número que cabe INTEIRO na largura, e o resto vai para um menu que abre
 * acima dela. Este arquivo guarda as decisões que não dependem de navegador,
 * para serem exercitadas em teste de unidade.
 */

/**
 * Quantos destinos ficam na barra em cada largura, fora o botão "Mais". A conta
 * é a de ladrilhos que cabem inteiros: com o "Mais" são 3, 4 e 6 ladrilhos, os
 * mesmos números de `--barra-visiveis` da folha (a 361 px já cabem quatro).
 * A ordem vai do mais estreito ao mais largo; vale a primeira consulta que casa.
 */
export const CONSULTAS_DA_BARRA = [
  { consulta: "(max-width: 360px)", naBarra: 2 },
  { consulta: "(max-width: 600px)", naBarra: 3 },
  { consulta: "(max-width: 900px)", naBarra: 5 },
] as const;

/**
 * Quantos destinos ficam na barra agora. Zero quer dizer "não é celular": a
 * lateral continua como sempre, com todos os itens e sem menu "Mais".
 */
export function quantosNaBarra(casa: (consulta: string) => boolean): number {
  for (const { consulta, naBarra } of CONSULTAS_DA_BARRA) {
    if (casa(consulta)) return naBarra;
  }
  return 0;
}

/**
 * Reparte os destinos entre a barra e o menu "Mais".
 *
 * Os marcados como `principal` ocupam a barra, na ordem em que a navegação os
 * declara, até `quantos`; todo o resto vai para o menu, também na ordem. Dois
 * cuidados que o teste prova:
 *
 * - nenhum destino some: `naBarra` mais `noMais` é sempre a lista inteira, na
 *   mesma ordem relativa (o menu é o único caminho para o que sai da barra);
 * - quem só tem destinos principais (o agente de campo, com "Meu trabalho" e o
 *   mapa) não perde nenhum para o menu enquanto couberem.
 */
export function repartirNavegacao<T extends { principal?: boolean }>(
  itens: readonly T[],
  quantos: number,
): { naBarra: T[]; noMais: T[] } {
  const naBarra: T[] = [];
  const noMais: T[] = [];
  for (const item of itens) {
    if (item.principal && naBarra.length < quantos) naBarra.push(item);
    else noMais.push(item);
  }
  return { naBarra, noMais };
}

/**
 * A tela atual é este destino? Mesma regra do `NavLink` do React Router: o
 * próprio caminho ou um filho dele ("/ocorrencias/abc" é de "/ocorrencias").
 * Serve para marcar o botão "Mais" quando a tela de agora mora dentro dele.
 */
export function ehDaRota(caminhoAtual: string, para: string): boolean {
  return caminhoAtual === para || caminhoAtual.startsWith(`${para}/`);
}

/** O que o teclado faz com o menu aberto: só o Escape age, o resto segue. */
export function decidirTeclaDoMenu(tecla: string): "fechar" | "seguir" {
  return tecla === "Escape" ? "fechar" : "seguir";
}

/** Fora do navegador (testes em Node) não há `matchMedia`, e a resposta é "não é celular". */
function casaNoNavegador(consulta: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(consulta).matches;
}

function assinar(avisar: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const listas = CONSULTAS_DA_BARRA.map(({ consulta }) => window.matchMedia(consulta));
  for (const lista of listas) lista.addEventListener("change", avisar);
  return () => { for (const lista of listas) lista.removeEventListener("change", avisar); };
}

/** Quantos destinos cabem na barra nesta largura, acompanhando girar o aparelho e redimensionar. */
export function useQuantosNaBarra(): number {
  return useSyncExternalStore(assinar, () => quantosNaBarra(casaNoNavegador), () => 0);
}
