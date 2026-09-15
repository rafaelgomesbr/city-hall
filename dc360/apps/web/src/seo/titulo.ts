import { useEffect } from "react";

/**
 * O título da aba, escrito num lugar só.
 *
 * Duas coisas escrevem `document.title` no painel, e as duas passam por aqui
 * para que a aba nunca diga a mesma coisa de dois jeitos:
 *
 * 1. `TrocaDeTela` (src/componentes), a cada mudança de rota, com o nome que a
 *    rota tem no mapa dela. É a rede de segurança: garante que toda rota tem
 *    título mesmo que a tela esqueça de pedir o seu, e que o título muda no
 *    instante da navegação, antes de qualquer dado chegar.
 * 2. `useTitulo`, chamado por cada tela em `src/paginas`, com o nome que a
 *    tela conhece melhor do que a rota. É o que permite ao detalhe da
 *    ocorrência dizer o protocolo em vez de só "Ocorrência".
 *
 * O efeito da tela roda depois do efeito de `TrocaDeTela` na mesma renderização
 * (ele está mais fundo na árvore), então quando os dois discordam, a tela
 * vence.
 */

export const PRODUTO = "Defesa Civil 360";

/** "Ocorrências · Defesa Civil 360"; sem tela, só o nome do produto. */
export function tituloDaAba(tela?: string): string {
  const nome = tela?.trim();
  if (!nome || nome === PRODUTO) return PRODUTO;
  return `${nome} · ${PRODUTO}`;
}

/**
 * Grava o título desta tela na aba enquanto ela estiver montada, e devolve o
 * padrão ao sair. Passe o que muda quando a tela souber mais (o protocolo,
 * por exemplo): o título acompanha.
 */
export function useTitulo(tela: string): void {
  useEffect(() => {
    document.title = tituloDaAba(tela);
    return () => {
      document.title = tituloDaAba();
    };
  }, [tela]);
}
