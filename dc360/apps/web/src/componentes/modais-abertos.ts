import { useSyncExternalStore } from "react";

/**
 * Quantas janelas modais estão abertas agora, para quem não pode aparecer por
 * cima delas.
 *
 * O defeito (V2-F00-E09, correção 4, defeito 2 da arbitragem da rodada 5): o
 * aviso passageiro ("Sessões de ... encerradas") fica no `z-index` do aviso (50),
 * acima do da janela (40), e vive dentro da página, que a janela torna `inert`.
 * A 320x568 ele ficava desenhado em cima de "Copiar senha" e de "Já anotei a
 * senha" da janela da senha temporária. Pior: como o aviso está num ramo
 * `inert`, o navegador o ignora no toque, e o toque no TEXTO do aviso caía no
 * botão escondido embaixo. Quem tocava "para fechar o aviso" fechava a janela, e
 * a senha de uso único, que não aparece de novo, se perdia. O "Fechar" do aviso,
 * dentro de uma subárvore `inert`, não respondia a nada.
 *
 * Subir o `z-index` do aviso não resolve: ele continuaria `inert` e cobrindo o
 * rodapé da janela. Subir o da janela também não: o aviso é só confirmação do
 * que acabou de acontecer, e a janela ainda é a decisão da pessoa. A regra é a
 * mais simples: com janela aberta, o aviso espera. Ele reaparece quando a
 * última janela fecha, com o relógio do começo (`Toast`), e então não é mais
 * `inert`, de modo que o "Fechar" dele funciona.
 *
 * É um contador de módulo, e não um contexto do React, porque a janela vive num
 * portal colado no `<body>` e o aviso na árvore da tela: não há ancestral comum
 * por onde passar o valor.
 */

let abertas = 0;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of [...ouvintes]) ouvinte();
}

/** Marca uma janela como aberta e devolve o desfazer, que só vale uma vez. */
export function registrarModalAberto(): () => void {
  abertas += 1;
  avisar();
  let desfeito = false;
  return () => {
    if (desfeito) return;
    desfeito = true;
    abertas -= 1;
    avisar();
  };
}

export function haModalAberto(): boolean {
  return abertas > 0;
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** Verdadeiro enquanto houver janela modal aberta. Fora do navegador, sempre falso. */
export function useHaModalAberto(): boolean {
  return useSyncExternalStore(assinar, haModalAberto, () => false);
}
