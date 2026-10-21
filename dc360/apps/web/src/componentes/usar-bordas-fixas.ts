import { useEffect, useLayoutEffect, type RefObject } from "react";

/**
 * As duas bordas fixas do painel, medidas, viram a folga da rolagem da página.
 *
 * O DEFEITO (V2-F00-E09, correção 6, rodada 7 da validação): o painel tem o
 * topo fixo (`.topo`, `position: sticky`) e, até 900 px, a barra de navegação
 * fixa no pé (`.lateral`). Quando o foco leva um campo à vista, o navegador o
 * encosta na borda da janela, e o que estiver fixo ali fica POR CIMA dele. A
 * folha dizia a altura do topo com um número escolhido por faixa de largura
 * (80 px numa linha, 140 px até 600 px), e errava nas outras: entre 601 e uns
 * 700 px o topo quebra em duas linhas (141 px) conforme o tamanho do nome de
 * quem entrou, e no zoom de 200 por cento de uma tela de 1280x900 (640x450 de
 * CSS) o campo inteiro ficava atrás dele. No pé não havia folga nenhuma: o
 * campo abaixo da janela parava atrás da barra.
 *
 * A altura do topo depende do conteúdo (o nome, o papel, a largura), então não
 * dá para escrevê-la na folha: ela é MEDIDA, aqui, e passa para a folha por
 * duas variáveis no `<html>`, que o `scroll-padding` usa. A folha guarda as
 * estimativas antigas como reserva para o primeiro quadro, antes da medida.
 */

/** A variável que a folha usa no `scroll-padding-top`. */
export const VARIAVEL_TOPO = "--topo-fixo-folga";
/** A variável que a folha usa no `scroll-padding-bottom`. */
export const VARIAVEL_PE = "--pe-fixo-folga";

/**
 * A folga de uma borda fixa: a altura medida, arredondada para cima (meio pixel
 * de topo por cima da borda de um campo já é um corte visível), mais um passo
 * de respiro do design system, para o campo não encostar na borda.
 */
export function folgaDaBorda(altura: number): string {
  const px = Number.isFinite(altura) && altura > 0 ? Math.ceil(altura) : 0;
  return `calc(${px}px + var(--ds-sp-3))`;
}

/**
 * O topo só é borda fixa quando a folha o prende (`sticky`). Em janela muito
 * baixa (o zoom de 400 por cento) ele rola com a página e não cobre nada.
 */
export function topoPreso(estilo: { position: string }): boolean {
  return estilo.position === "sticky" || estilo.position === "fixed";
}

/**
 * A barra lateral só é borda fixa no pé quando a folha a prende embaixo
 * (`position: sticky; bottom: 0`, até 900 px). Na largura de mesa ela é a
 * coluna da esquerda e não cobre nada da rolagem, e em janela muito baixa ela
 * rola com a página.
 */
export function barraPresaNoPe(estilo: { position: string; bottom: string }): boolean {
  return estilo.position === "sticky" && estilo.bottom !== "auto";
}

/**
 * Mede o topo e a barra a cada mudança de tamanho (a janela, o zoom, o nome que
 * quebra o topo em duas linhas) e escreve a folga das duas bordas no `<html>`.
 * `desenhada` diz se a estrutura já está na tela: `Estrutura` não desenha nada
 * sem sessão, e o efeito tem de rodar de novo quando ela aparece.
 */
export function useBordasFixas(
  topoRef: RefObject<HTMLElement | null>,
  barraRef: RefObject<HTMLElement | null>,
  desenhada: boolean,
): void {
  useLayoutEffect(() => {
    const topo = topoRef.current;
    const barra = barraRef.current;
    const raiz = document.documentElement;
    if (!topo || !barra) return;
    const medir = () => {
      const preso = topoPreso(getComputedStyle(topo));
      raiz.style.setProperty(VARIAVEL_TOPO, folgaDaBorda(preso ? topo.getBoundingClientRect().height : 0));
      const noPe = barraPresaNoPe(getComputedStyle(barra));
      raiz.style.setProperty(VARIAVEL_PE, folgaDaBorda(noPe ? barra.getBoundingClientRect().height : 0));
    };
    medir();
    const observador = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    observador?.observe(topo);
    observador?.observe(barra);
    window.addEventListener("resize", medir);
    return () => {
      observador?.disconnect();
      window.removeEventListener("resize", medir);
      raiz.style.removeProperty(VARIAVEL_TOPO);
      raiz.style.removeProperty(VARIAVEL_PE);
    };
  }, [topoRef, barraRef, desenhada]);
}

/**
 * O Tab também precisa respeitar as duas bordas (achado 2 da acessibilidade na
 * rodada 7 da V2-F00-E09, WCAG 2.4.11). Cada motor rola o elemento que recebe o
 * Tab do seu jeito: o Chromium deixava a caixa "Descrição" da Nova ocorrência
 * pela metade atrás da barra do pé a 320 px, porque um elemento já à vista em
 * parte não é rolado.
 *
 * Diz quantos pixels a página tem de rolar na vertical para o elemento focado
 * ficar inteiro entre a borda de baixo do topo fixo (`faixaDe`) e a de cima da
 * barra do pé (`faixaAte`), com um respiro de cada lado quando cabe. Zero quando
 * já está.
 *
 * A conta é sobre as bordas REAIS, e não sobre o `scroll-padding` (que já soma o
 * respiro): a versão anterior decidia pela faixa com as folgas, e o elemento que
 * cabia na faixa real mas não na faixa com folgas (a caixa que rola o painel no
 * Firefox, a 390x400) era tratado como alto demais e ficava 6 px escondido sob a
 * barra (revisão da correção 6). O que é mais alto que a faixa real não cabe
 * inteiro: aí o começo dele vai para o começo da faixa, o máximo que se pode
 * mostrar (antes só rolava quando o começo estava fora, e a caixa de Órgãos a
 * 390x400 ficava com 26 px à vista).
 */
export function deslocamentoParaAFaixa(alvo: {
  topo: number;
  altura: number;
  faixaDe: number;
  faixaAte: number;
  respiro: number;
}): number {
  const faixa = alvo.faixaAte - alvo.faixaDe;
  const baixo = alvo.topo + alvo.altura;
  if (alvo.altura > faixa) {
    const desvio = alvo.topo - alvo.faixaDe;
    return Math.abs(desvio) < 1 ? 0 : desvio;
  }
  const respiro = Math.max(0, Math.min(alvo.respiro, (faixa - alvo.altura) / 2));
  if (alvo.topo < alvo.faixaDe - 0.5) return alvo.topo - (alvo.faixaDe + respiro);
  if (baixo > alvo.faixaAte + 0.5) return baixo - (alvo.faixaAte - respiro);
  return 0;
}

/**
 * Quanto tempo depois de um toque ou clique o foco ainda é "do ponteiro".
 *
 * O ajuste é do TECLADO (WCAG 2.4.11 fala do foco de quem navega por teclado).
 * No foco que vem do ponteiro ele não pode rolar: o foco chega no `pointerdown`,
 * e rolar a página ali faz o `pointerup` cair em outro lugar, e o clique se
 * perde. Visto no WebKit, que não foca o botão clicado e leva o foco ao
 * envoltório focável de fora (`#cartao-coordenada`, `tabIndex={-1}`): a página
 * rolava sob o dedo e "Corrigir a coordenada" não abria (correção 6b).
 */
export const JANELA_DO_PONTEIRO_MS = 800;

export function focoDoPonteiro(agora: number, ultimoPonteiro: number | null): boolean {
  return ultimoPonteiro !== null && agora - ultimoPonteiro >= 0 && agora - ultimoPonteiro < JANELA_DO_PONTEIRO_MS;
}

/**
 * Liga o ajuste do Tab enquanto a estrutura (com as bordas fixas) está na tela.
 *
 * O ajuste roda TRÊS vezes: na hora, dentro do `focusin`; numa tarefa logo
 * depois (`setTimeout` sem espera), quando a rolagem do próprio motor já
 * aconteceu; e de novo no quadro seguinte. Era só no quadro seguinte
 * (`requestAnimationFrame`), e no WebKit sem tela do Linux (o CI, run
 * 39488319365) o quadro demorava mais que o Tab seguinte: o campo ficava parado
 * sob a barra do pé (a 640x450, "Senha nova" em 407..451 com a barra desde 371)
 * ou nem rolava (a 390x844, "Repita a senha" em 857..901, abaixo da janela).
 * Reproduzido no Mac atrasando o quadro em 1 s: os três motores deixavam campos
 * fora da faixa livre. Rodando na hora, o elemento já está inteiro na faixa
 * quando o motor faz a rolagem dele, que só rola o que não está à vista. Em
 * todas as passadas, o que já está na faixa não se mexe.
 *
 * Cada passada leva o elemento à vista na horizontal, dentro da caixa que rola
 * uma tabela larga (`inline: "nearest"`), e acerta a vertical da página pela
 * conta de `deslocamentoParaAFaixa`. Fica de fora o que mora nas próprias
 * bordas (o topo, a barra do pé, o "Pular para o conteúdo"), o `<main>` que
 * recebe o foco do "Pular" e a janela de diálogo, que tem a própria rolagem.
 */
export function useFocoForaDasBordas(desenhada: boolean): void {
  useEffect(() => {
    if (!desenhada) return;
    const ajustar = (alvo: HTMLElement) => {
      if (document.activeElement !== alvo) return;
      if (alvo.closest(".topo, .lateral, .pular-para-conteudo, [role=\"dialog\"]") || alvo.id === "conteudo") return;
      const topo = document.querySelector<HTMLElement>(".topo");
      const barra = document.querySelector<HTMLElement>(".lateral");
      const faixaDe = topo && topoPreso(getComputedStyle(topo)) ? topo.getBoundingClientRect().bottom : 0;
      const faixaAte = barra && barraPresaNoPe(getComputedStyle(barra))
        ? barra.getBoundingClientRect().top : window.innerHeight;
      alvo.scrollIntoView({ block: "nearest", inline: "nearest" });
      const caixa = alvo.getBoundingClientRect();
      const respiro = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ds-sp-3")) || 0;
      const desvio = deslocamentoParaAFaixa({ topo: caixa.top, altura: caixa.height, faixaDe, faixaAte, respiro });
      if (desvio !== 0) window.scrollBy(0, desvio);
    };
    let ultimoPonteiro: number | null = null;
    const aoApontar = () => { ultimoPonteiro = performance.now(); };
    const aoFocar = (evento: FocusEvent) => {
      const alvo = evento.target;
      if (!(alvo instanceof HTMLElement)) return;
      if (focoDoPonteiro(performance.now(), ultimoPonteiro)) return;
      ajustar(alvo);
      setTimeout(() => ajustar(alvo), 0);
      requestAnimationFrame(() => ajustar(alvo));
    };
    document.addEventListener("pointerdown", aoApontar, true);
    document.addEventListener("focusin", aoFocar);
    return () => {
      document.removeEventListener("pointerdown", aoApontar, true);
      document.removeEventListener("focusin", aoFocar);
    };
  }, [desenhada]);
}
