/**
 * O que a janela modal faz DEPOIS de aberta para o foco continuar à vista e
 * dentro dela (V2-F00-E09, correção 8).
 *
 * A abertura do `Modal` acerta o foco e a rolagem uma vez. A rodada 9 da
 * validação (quarta reprovação pela mesma classe: foco ou confirmação fora da
 * vista) mostrou que o mundo muda depois da abertura, e que cada conserto
 * anterior tratou UM caminho por vez:
 *
 * 1. **O tamanho muda.** Girar o celular ou dar zoom com a janela aberta
 *    deixava "Cancelar" com o foco e fora da parte visível do painel, nos três
 *    motores: o ajuste rodava na abertura e a cada mudança de conteúdo, nunca
 *    quando a janela do navegador mudava de tamanho.
 * 2. **O foco cai na página.** Depois de um erro do servidor (os botões ficam
 *    `disabled` enquanto grava e o foco se perde com eles) ou de um clique no
 *    fundo escurecido, o foco ia para o `<body>`, e o Esc deixava de fechar a
 *    janela porque quem ouvia a tecla era o painel, que não recebe tecla com o
 *    alvo no `<body>`. No WebKit nem o Tab saía de lá.
 *
 * A classe, dita de uma vez: o foco tem de estar num controle VISÍVEL da
 * janela em todo instante em que ela está aberta, e o que o mantém assim não
 * pode depender de ninguém ter lembrado de chamar o ajuste. Por isso tudo isto
 * mora num lugar só, é ligado na abertura e desligado por inteiro no
 * fechamento, e está escrito sobre `document` e `window` lidos na hora (e não
 * guardados), para o teste substituí-los.
 *
 * Nada aqui cria laço: a rolagem do painel não gera `resize`, não gera
 * mutação e não move o foco, e cada ajuste só age quando o foco já está num
 * controle da janela.
 */

/**
 * Quanto o painel da janela rola (para baixo, positivo; para cima, negativo)
 * para o controle ficar inteiro dentro da parte visível dele, com um respiro de
 * cada lado quando cabe (o anel de foco é uma sombra de alguns pixels, e uma
 * borda de painel que rola a corta). Zero quando já está. Controle mais alto
 * que o painel não cabe: o começo dele vai ao começo do painel.
 */
export function rolagemParaVerNoPainel(a: {
  painelTopo: number;
  painelBase: number;
  alvoTopo: number;
  alvoBase: number;
  respiro: number;
}): number {
  const altura = a.painelBase - a.painelTopo;
  const alturaDoAlvo = a.alvoBase - a.alvoTopo;
  if (alturaDoAlvo >= altura) return a.alvoTopo - a.painelTopo;
  const respiro = Math.max(0, Math.min(a.respiro, (altura - alturaDoAlvo) / 2));
  if (a.alvoTopo < a.painelTopo + respiro - 0.5) return a.alvoTopo - (a.painelTopo + respiro);
  if (a.alvoBase > a.painelBase - respiro + 0.5) return a.alvoBase - (a.painelBase - respiro);
  return 0;
}

/** O que a janela visual (`visualViewport`) diz da parte da tela que a pessoa enxerga. */
export type JanelaVisual = { offsetTop: number; height: number; scale: number };

/**
 * A parte do painel que a pessoa de fato enxerga: a do painel, cortada pela
 * janela visual quando ela é menor (o teclado virtual aberto, a barra de
 * endereço que volta). Com zoom de pinça (`scale` acima de 1) a janela visual é
 * só o pedaço que a pessoa escolheu olhar, e rolar o painel para dentro dele
 * brigaria com o gesto dela: aí vale o painel inteiro.
 */
export function areaVisivelDoPainel(a: {
  topo: number;
  base: number;
  visual?: JanelaVisual | null;
}): { topo: number; base: number } {
  const v = a.visual;
  if (!v || !Number.isFinite(v.height) || !Number.isFinite(v.offsetTop) || v.scale > 1.01) {
    return { topo: a.topo, base: a.base };
  }
  const topo = Math.max(a.topo, v.offsetTop);
  const base = Math.min(a.base, v.offsetTop + v.height);
  // Janela visual que nem toca o painel: não é medida confiável, vale o painel.
  return base - topo < 1 ? { topo: a.topo, base: a.base } : { topo, base };
}

export type OpcoesDoAcompanhamento = {
  /** O painel da janela (o que rola). `null` enquanto não está na tela. */
  painel: () => HTMLElement | null;
  /** O botão pedido como foco inicial (o "Cancelar"); a janela sem um não o mantém à vista nas mutações. */
  focoInicial: () => HTMLElement | null | undefined;
  /** As paradas de Tab de agora (o destino do foco quando ele se perde). */
  focaveis: () => HTMLElement[];
  /** A tecla que chegou FORA do painel (o foco no `<body>`): a mesma decisão do teclado do painel. */
  aoTeclarFora: (evento: KeyboardEvent) => void;
};

export type Acompanhamento = {
  /** Leva o foco inicial à vista agora (a abertura chama depois de rolar ao topo). */
  ajustarOFocoInicial: () => void;
  /** Desliga tudo: ouvintes, observador e quadros pendentes. */
  parar: () => void;
};

/**
 * A altura que o cabeçalho cola em cima do painel quando ele rola (`sticky`):
 * é a parte do topo que cobre o conteúdo, e portanto não conta como "à vista".
 */
function coberturaDoCabecalho(painel: HTMLElement): number {
  const cabecalho = painel.querySelector<HTMLElement>(".modal__cabecalho");
  if (!cabecalho || getComputedStyle(cabecalho).position !== "sticky") return 0;
  return cabecalho.getBoundingClientRect().height;
}

export function acompanharAJanela(o: OpcoesDoAcompanhamento): Acompanhamento {
  const painelNaTela = (): HTMLElement | null => {
    const p = o.painel();
    return p && p.isConnected ? p : null;
  };

  /**
   * O `scroll-padding-top` do painel é a altura do cabeçalho preso: sem ele, o
   * Tab que leva um campo à vista o encostaria por baixo do título.
   */
  const medirOCabecalho = () => {
    const painel = painelNaTela();
    if (painel) painel.style.scrollPaddingTop = `${Math.ceil(coberturaDoCabecalho(painel))}px`;
  };

  /** Rola o painel o mínimo para o elemento ficar inteiro na parte visível dele. */
  const levarAVista = (elemento: HTMLElement) => {
    const painel = painelNaTela();
    if (!painel || !painel.contains(elemento)) return;
    const caixaDoPainel = painel.getBoundingClientRect();
    const caixaDoAlvo = elemento.getBoundingClientRect();
    const topoUtil = caixaDoPainel.top + painel.clientTop;
    const area = areaVisivelDoPainel({
      topo: topoUtil + coberturaDoCabecalho(painel),
      base: topoUtil + painel.clientHeight,
      visual: window.visualViewport,
    });
    const respiro = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ds-sp-3")) || 0;
    painel.scrollTop += rolagemParaVerNoPainel({
      painelTopo: area.topo, painelBase: area.base,
      alvoTopo: caixaDoAlvo.top, alvoBase: caixaDoAlvo.bottom, respiro,
    });
  };

  const ajustarOFocoInicial = () => {
    const botao = o.focoInicial();
    if (!botao || document.activeElement !== botao) return;
    levarAVista(botao);
  };

  /* ------------------------------------------------------------
     1. O tamanho muda: girar, zoom, barra do navegador, teclado
     ------------------------------------------------------------ */

  /** Só quem já tem o foco num CONTROLE da janela é acompanhado; o painel, que recebe o foco quando não há controle, não rola. */
  const acompanharOFocoNoTamanhoNovo = () => {
    const painel = painelNaTela();
    const ativo = document.activeElement;
    if (!painel || !(ativo instanceof HTMLElement) || ativo === painel || !painel.contains(ativo)) return;
    levarAVista(ativo);
  };

  let quadro: number | null = null;
  const noQuadroSeguinte = () => {
    if (quadro !== null) cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      quadro = null;
      medirOCabecalho();
      acompanharOFocoNoTamanhoNovo();
    });
  };
  /* O tamanho mudou: acerta na hora e de novo no quadro seguinte (alguns motores só terminam o layout depois do evento). */
  const aoMudarOTamanho = () => {
    medirOCabecalho();
    acompanharOFocoNoTamanhoNovo();
    noQuadroSeguinte();
  };
  /* A janela visual rolou ou mudou: só o quadro seguinte, porque o evento é frequente e a conta é a mesma. */
  const aoMudarAJanelaVisual = () => noQuadroSeguinte();

  window.addEventListener("resize", aoMudarOTamanho);
  window.addEventListener("orientationchange", aoMudarOTamanho);
  const visual = window.visualViewport;
  visual?.addEventListener("resize", aoMudarAJanelaVisual);
  visual?.addEventListener("scroll", aoMudarAJanelaVisual);

  /* ------------------------------------------------------------
     2. O foco cai na página: devolve a um controle da janela
     ------------------------------------------------------------ */

  /** O último CONTROLE da janela que teve o foco (o painel, que só recebe foco como último recurso, não conta). */
  let ultimoControle: HTMLElement | null = null;
  /**
   * Quem espera o foco de volta: enquanto a janela grava, os botões ficam
   * `disabled`, o foco espera no painel (que recebe tecla, e portanto o Esc), e
   * quando o botão volta a valer (o erro do servidor chegou) o foco volta para
   * ele. Fica nulo assim que o foco vai a qualquer controle por outro caminho.
   */
  let esperando: HTMLElement | null = null;

  const habilitado = (painel: HTMLElement, el: HTMLElement | null | undefined): el is HTMLElement =>
    Boolean(el && el.isConnected && painel.contains(el) && !el.matches(":disabled"));

  const aoGanharOFoco = (evento: FocusEvent) => {
    const alvo = evento.target;
    if (!(alvo instanceof HTMLElement)) return;
    if (alvo === o.painel()) {
      /*
        O foco saiu de um controle para o painel (o WebKit não foca o botão
        clicado e leva o foco ao painel; o motor que perde o botão travado faz
        o mesmo): o controle espera, e volta se o botão voltar a valer.
      */
      if (ultimoControle) esperando = ultimoControle;
      return;
    }
    ultimoControle = alvo;
    esperando = null;
  };

  /** `reabilitou`: a chamada veio de um botão que voltou a valer (o atributo `disabled` mudou), o único momento em que o foco que espera no painel volta. */
  const devolverOFoco = (reabilitou: boolean) => {
    const painel = painelNaTela();
    if (!painel) return;
    const ativo = document.activeElement;
    const dentro = ativo instanceof HTMLElement && ativo !== document.body && painel.contains(ativo);
    if (dentro && ativo.matches(":disabled")) {
      // O motor deixou o foco num botão travado (ele não recebe tecla): o painel o guarda.
      esperando = ativo;
      painel.focus({ preventScroll: true });
      return;
    }
    if (dentro && ativo === painel && esperando) {
      // O botão que tinha o foco voltou a valer: o foco volta para ele.
      if (reabilitou && habilitado(painel, esperando)) {
        const volta = esperando;
        volta.focus({ preventScroll: true });
        levarAVista(volta);
      }
      return;
    }
    if (dentro) return;
    // O foco está fora da janela (no `<body>`): volta a um controle dela, à vista.
    const inicial = o.focoInicial();
    const destino = [ultimoControle, inicial].find((el) => habilitado(painel, el)) ?? o.focaveis()[0] ?? painel;
    if (destino === painel) {
      // Nada habilitado (gravando): o painel segura o foco, e o último controle espera.
      esperando = ultimoControle ?? inicial ?? null;
      painel.focus({ preventScroll: true });
      return;
    }
    destino.focus({ preventScroll: true });
    levarAVista(destino);
  };

  let tarefa: ReturnType<typeof setTimeout> | null = null;
  const aoPerderOFoco = (evento: FocusEvent) => {
    // `relatedTarget` nulo: o foco não foi para outro elemento. Espera o motor assentar (ele pode estar só trocando de controle).
    if (evento.relatedTarget !== null) return;
    if (tarefa !== null) clearTimeout(tarefa);
    tarefa = setTimeout(() => { tarefa = null; devolverOFoco(false); }, 0);
  };
  const painelDaAbertura = o.painel();
  // O foco da abertura chegou antes dos ouvintes: o controle que já o tem é o último.
  if (document.activeElement instanceof HTMLElement && document.activeElement !== painelDaAbertura
    && painelDaAbertura?.contains(document.activeElement)) ultimoControle = document.activeElement;
  painelDaAbertura?.addEventListener("focusout", aoPerderOFoco);
  painelDaAbertura?.addEventListener("focusin", aoGanharOFoco);

  /* O Esc e o Tab com o foco fora do painel: o painel não os recebe, o documento sim. */
  const aoTeclarNoDocumento = (evento: KeyboardEvent) => {
    const painel = painelNaTela();
    if (!painel || evento.defaultPrevented) return;
    if (evento.target instanceof Node && painel.contains(evento.target)) return;
    o.aoTeclarFora(evento);
  };
  document.addEventListener("keydown", aoTeclarNoDocumento);

  /* ------------------------------------------------------------
     3. O conteúdo muda: a contagem que chega, o erro, o botão que volta a valer
     ------------------------------------------------------------ */

  /*
    "Encerrar sessões" abre com "Conferindo quantas sessões estão abertas." e
    troca pela frase da contagem (16 px mais alta a 320 px), e as outras
    acrescentam o erro do servidor. Cada mudança acima do botão o empurra para
    fora da parte visível, e a medida única da abertura não vê. O atributo
    `disabled` entra na observação porque é ele que trava e destrava os botões
    durante a gravação, e é nessa volta que o foco perdido é devolvido.
    Quem já passou para outro controle não é puxado de volta.
  */
  let observador: MutationObserver | null = null;
  if (typeof MutationObserver === "function" && painelDaAbertura) {
    observador = new MutationObserver((registros) => {
      devolverOFoco(registros.some((registro) => registro.type === "attributes"));
      ajustarOFocoInicial();
    });
    observador.observe(painelDaAbertura, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["disabled"],
    });
  }

  medirOCabecalho();

  return {
    ajustarOFocoInicial,
    parar: () => {
      observador?.disconnect();
      window.removeEventListener("resize", aoMudarOTamanho);
      window.removeEventListener("orientationchange", aoMudarOTamanho);
      visual?.removeEventListener("resize", aoMudarAJanelaVisual);
      visual?.removeEventListener("scroll", aoMudarAJanelaVisual);
      document.removeEventListener("keydown", aoTeclarNoDocumento);
      painelDaAbertura?.removeEventListener("focusout", aoPerderOFoco);
      painelDaAbertura?.removeEventListener("focusin", aoGanharOFoco);
      if (quadro !== null) cancelAnimationFrame(quadro);
      if (tarefa !== null) clearTimeout(tarefa);
      quadro = null;
      tarefa = null;
    },
  };
}
