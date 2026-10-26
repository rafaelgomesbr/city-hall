import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as EventoDeTecla, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { acompanharAJanela } from "./acompanhar-janela";
import { registrarModalAberto } from "./modais-abertos";

/* A conta da rolagem do painel mora com o resto do acompanhamento; continua exportada daqui. */
export { rolagemParaVerNoPainel } from "./acompanhar-janela";

/**
 * A janela modal que o painel não tinha.
 *
 * Enquanto ela não existia, a única confirmação do produto (encerrar
 * ocorrência, que é irreversível e entra numa trilha sem policy de UPDATE nem
 * de DELETE) precisou ser feita como dois toques no próprio bloco da tela. O
 * comentário que justificava aquilo dizia a razão com todas as letras: meia
 * biblioteca de modal, escrita às pressas dentro de uma página, vira
 * armadilha de teclado, e armadilha de teclado é pior do que não ter
 * confirmação nenhuma. Este arquivo é o outro turno de trabalho que aquele
 * comentário adiava.
 *
 * O defeito que cada regra daqui evita, um a um:
 *
 * 1. **Foco preso dentro da janela.** Sem isto, o Tab sai da janela pela
 *    borda e continua percorrendo a página atrás, que continua visível e
 *    clicável. Quem navega por teclado passa a operar controles que não vê,
 *    achando que ainda está dentro da confirmação, e o Enter cai em qualquer
 *    coisa.
 * 2. **O foco entra ao abrir e VOLTA para quem abriu ao fechar.** Foco perdido
 *    não é detalhe: o leitor de tela volta para o topo do documento e a pessoa
 *    recomeça a navegação da lateral inteira, sem nenhuma pista de que a
 *    janela fechou.
 * 3. **O resto da página fica `inert` e `aria-hidden`.** `inert` tira do
 *    alcance do ponteiro e do Tab; `aria-hidden` tira da árvore que o leitor
 *    de tela percorre com as teclas de leitura, que ignoram o foco. As duas
 *    coisas são necessárias porque são dois caminhos diferentes de chegar ao
 *    conteúdo de trás.
 * 4. **Escape fecha, e clique fora fecha SÓ quando a decisão não é
 *    destrutiva.** Clique fora é gesto acidental (arrastar o mouse, esbarrar
 *    no trackpad); fechar por acidente uma janela de rascunho é barato,
 *    fechar a de encerramento no meio da leitura da consequência não é.
 *
 * A peça visual mora em `CorpoDoModal`, exportada de propósito: o comportamento
 * (foco, `inert`, portal) só existe em navegador, mas a AMARRAÇÃO
 * (`role`, `aria-modal`, `aria-labelledby`, `aria-describedby`) é o que
 * costuma quebrar em silêncio, e assim ela é conferida em teste que roda sem
 * navegador nenhum.
 */

/* ============================================================
   O núcleo, em funções puras
   ============================================================ */

/**
 * O que conta como parada do Tab dentro da janela.
 *
 * `[tabindex="-1"]` fica de fora de propósito: o próprio painel da janela é
 * `tabIndex={-1}` para poder receber o foco quando não há nada focável dentro,
 * e ele não pode virar parada de Tab, senão o ciclo ganharia um degrau vazio.
 */
export const SELETOR_FOCAVEL = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * As paradas de Tab que existem AGORA dentro da janela.
 *
 * A lista é recalculada a cada tecla, e não guardada na abertura, porque o
 * conteúdo muda enquanto a janela está aberta: um botão que estava
 * `disabled` durante a gravação volta a valer, um erro acrescenta um link.
 * Lista velha manda o foco para um elemento que saiu da tela, e o foco some.
 *
 * O filtro por retângulo remove o que está escondido (`display: none`,
 * `input type="hidden"`): esses casam com o seletor, não recebem foco, e cada
 * um deles seria um degrau morto no ciclo do Tab.
 */
export function focaveisDentro(raiz: HTMLElement | null): HTMLElement[] {
  if (!raiz) return [];
  return [...raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)]
    .filter((elemento) => elemento.getClientRects().length > 0);
}

/**
 * Para onde o Tab vai, dado onde ele está.
 *
 * É circular nas duas pontas: do último volta ao primeiro, do primeiro (com
 * Shift) volta ao último. Essa volta é a armadilha de foco inteira.
 *
 * O caso do foco que não está na lista é o que salva a janela quando algo
 * roubou o cursor (um clique no fundo, um `autofocus` de terceiro, o
 * `document.body` depois que um botão sumiu): em vez de deixar o Tab seguir
 * para a página de trás, o foco é trazido para a primeira parada, ou para a
 * última se veio de Shift+Tab.
 */
export function proximoFoco<T>(
  focaveis: readonly T[],
  ativo: T | null,
  comShift: boolean,
): T | null {
  if (focaveis.length === 0) return null;
  const ultimo = focaveis.length - 1;
  const atual = ativo === null ? -1 : focaveis.indexOf(ativo);
  if (atual === -1) return (comShift ? focaveis[ultimo] : focaveis[0]) ?? null;
  const passo = comShift ? -1 : 1;
  return focaveis[(atual + passo + focaveis.length) % focaveis.length] ?? null;
}

export type IntencaoDoModal<T> =
  /** Escape: a janela fecha. */
  | { acao: "fechar" }
  /** Tab: o foco vai para este elemento, e não para onde o navegador levaria. */
  | { acao: "mover"; alvo: T }
  /** Tab sem nada focável dentro: segura o foco onde está, não deixa vazar. */
  | { acao: "prender" }
  /** Qualquer outra tecla: a janela não se mete. */
  | { acao: "seguir" };

/**
 * A decisão de teclado da janela, separada do DOM para poder ser exercitada.
 *
 * O caso "prender" existe por uma janela real: confirmação sem campo e sem
 * botão habilitado (tudo `disabled` durante a gravação). Sem ele, o Tab não
 * encontraria destino, o navegador levaria o foco para a página de trás, e a
 * armadilha teria um furo justamente no instante mais delicado.
 */
export function decidirTecla<T>({ tecla, comShift, focaveis, ativo }: {
  tecla: string;
  comShift: boolean;
  focaveis: readonly T[];
  ativo: T | null;
}): IntencaoDoModal<T> {
  if (tecla === "Escape") return { acao: "fechar" };
  if (tecla !== "Tab") return { acao: "seguir" };
  const alvo = proximoFoco(focaveis, ativo, comShift);
  return alvo === null ? { acao: "prender" } : { acao: "mover", alvo };
}

/** O mínimo que a interdição precisa de um elemento, para poder ser testada. */
export type ElementoInterditavel = {
  hasAttribute(nome: string): boolean;
  setAttribute(nome: string, valor: string): void;
  removeAttribute(nome: string): void;
};

/**
 * Tira a página de trás do alcance enquanto a janela estiver aberta, e devolve
 * a função que desfaz exatamente o que foi feito.
 *
 * Só marca quem ainda não estava marcado, e só desmarca o que ela mesma
 * marcou. A diferença aparece com duas janelas abertas em sequência e com
 * conteúdo que o próprio painel já escondia: desmarcar às cegas revelaria,
 * ao fechar a janela, algo que estava escondido de propósito, e ninguém
 * ligaria uma coisa à outra depois.
 */
export function interditarFundo(irmaos: readonly ElementoInterditavel[]): () => void {
  const desfazer: Array<() => void> = [];
  for (const irmao of irmaos) {
    for (const [atributo, valor] of [["inert", ""], ["aria-hidden", "true"]] as const) {
      if (irmao.hasAttribute(atributo)) continue;
      irmao.setAttribute(atributo, valor);
      desfazer.push(() => irmao.removeAttribute(atributo));
    }
  }
  return () => {
    for (const passo of desfazer) passo();
  };
}

/**
 * Clique fora fecha? Só quando o clique foi no fundo mesmo e a janela permite.
 *
 * A conferência de que o alvo é o próprio fundo não é firula: sem ela, soltar
 * o botão do mouse sobre o fundo depois de ter selecionado texto DENTRO da
 * janela conta como clique fora, e a janela some no meio de uma leitura.
 */
export function deveFecharPeloFundo(permitido: boolean, alvoEhOFundo: boolean): boolean {
  return permitido && alvoEhOFundo;
}

/**
 * Aplica a decisão de teclado da janela a uma tecla de verdade. É a mesma para
 * a tecla que chega ao painel (o foco está dentro dele) e para a que chega ao
 * documento com o foco no `<body>`, que o painel não recebe: um só caminho para
 * as duas, ou o Esc passaria a valer num caso e não no outro (rodada 9 da
 * V2-F00-E09: depois de um erro do servidor ou de um clique no fundo, o Esc
 * morria).
 */
function tratarTecla(
  evento: { key: string; shiftKey: boolean; preventDefault(): void },
  painel: HTMLElement | null,
  aoFechar: () => void,
): void {
  const intencao = decidirTecla<HTMLElement>({
    tecla: evento.key,
    comShift: evento.shiftKey,
    focaveis: focaveisDentro(painel),
    ativo: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  });
  if (intencao.acao === "seguir") return;
  // Tudo o que não é "seguir" substitui o comportamento do navegador:
  // sem isto o Tab moveria o foco DUAS vezes, o nosso e o dele.
  evento.preventDefault();
  if (intencao.acao === "fechar") aoFechar();
  if (intencao.acao === "mover") intencao.alvo.focus();
  // "prender": nada focável dentro (tudo travado gravando); o foco fica onde está, no painel.
  if (intencao.acao === "prender") painel?.focus({ preventScroll: true });
}

/* ============================================================
   A peça visual, sem comportamento
   ============================================================ */

const ESTILO_FUNDO: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: "var(--ds-z-modal)",
  background: "color-mix(in srgb, var(--ds-ink-950) 72%, transparent)",
  display: "grid",
  placeItems: "center",
  padding: "var(--ds-sp-5)",
};

const ESTILO_PAINEL: CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "84vh",
  overflowY: "auto",
  background: "var(--ds-surface)",
  color: "var(--ds-text)",
  border: "1px solid var(--ds-border)",
  borderRadius: "var(--ds-radius-card)",
  boxShadow: "var(--ds-shadow-3)",
  padding: "var(--ds-sp-5)",
};

/*
  O título fica preso no topo do painel quando ele rola (V2-F00-E09, correção 8,
  achado 4 da rodada 9). Em janela baixa (zoom de 400 por cento, celular
  deitado) o "Cancelar" focado exige rolar o painel, e o título, que é a
  primeira coisa que se lê, saía por cima. Preso, ele fica à vista sem esconder
  o campo focado: `acompanhar-janela.ts` conta a altura dele como parte coberta
  do painel e a repassa ao `scroll-padding-top`. Em repouso nada muda de lugar:
  a folga de cima do painel (`--ds-sp-5`) passa para dentro do cabeçalho, com a
  margem negativa de mesmo valor, para o título preso ter o mesmo respiro.
*/
const ESTILO_CABECALHO: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--ds-sp-3)",
  position: "sticky",
  /* A borda de cima do cabeçalho preso encosta na borda do painel, e não na folga (padding) dele: sem o valor negativo, o texto que rola passava por cima do título, naquela folga. */
  top: "calc(-1 * var(--ds-sp-5))",
  zIndex: 1,
  background: "var(--ds-surface)",
  margin: "calc(-1 * var(--ds-sp-5)) 0 calc(var(--ds-sp-3) - var(--ds-sp-2))",
  paddingTop: "var(--ds-sp-5)",
  /* Um respiro embaixo do título preso: o texto que rola por baixo dele não encosta nas letras. Em repouso a soma com a margem é a de antes (`--ds-sp-3`). */
  paddingBottom: "var(--ds-sp-2)",
};

const ESTILO_RODAPE: CSSProperties = {
  display: "flex",
  gap: "var(--ds-sp-2)",
  flexWrap: "wrap",
  marginTop: "var(--ds-sp-5)",
};

export type PropsCorpoDoModal = {
  tituloId: string;
  descricaoId: string;
  titulo: string;
  descricao?: ReactNode;
  children?: ReactNode;
  rodape?: ReactNode;
  aoFechar: () => void;
  fecharAoClicarFora: boolean;
  mostrarBotaoFechar: boolean;
  refPainel?: RefObject<HTMLDivElement>;
  aoTeclar?: (evento: EventoDeTecla<HTMLDivElement>) => void;
};

/**
 * O desenho da janela, sem nada que dependa de navegador.
 *
 * Fica separado para que a amarração de acessibilidade seja conferível em
 * teste de unidade. `aria-labelledby` apontando para um `id` que não existe,
 * ou `aria-modal` esquecido, não quebram nada visível: a janela continua
 * bonita e o leitor de tela é que passa a anunciar "diálogo, em branco".
 *
 * O estilo vem em `style` com tokens `--ds-*` em vez de classe na folha
 * porque, nesta rodada, `src/estilos/app.css` pertence a outra frente de
 * trabalho. Os nomes de classe já estão aqui (`modal`, `modal__painel`) para
 * que mover isto para a folha depois seja recortar e colar, sem tocar no JSX.
 */
export function CorpoDoModal({
  tituloId, descricaoId, titulo, descricao, children, rodape,
  aoFechar, fecharAoClicarFora, mostrarBotaoFechar, refPainel, aoTeclar,
}: PropsCorpoDoModal) {
  return (
    /*
      acessibilidade: excecao. Clique no fundo é atalho de ponteiro, e ele tem
      contrapartida de teclado no mesmo componente: Escape fecha, e o botão
      "Fechar" ou o "Cancelar" do rodapé fecham por Tab e Enter. Dar
      `tabIndex` ao fundo seria pior: acrescentaria ao ciclo do Tab uma parada
      que não é controle nenhum.
    */
    <div
      className="modal"
      style={ESTILO_FUNDO}
      /*
        Apertar o botão do mouse (ou tocar) no fundo escurecido tira o foco de
        onde ele estava e o leva ao `<body>`, e dali o Esc não chega ao painel.
        O fundo não é controle nenhum, então o gesto não precisa mover o foco:
        sem isto, clicar fora de uma janela destrutiva (que de propósito não
        fecha) a deixava sem foco (V2-F00-E09, correção 8). O clique continua
        valendo, e `acompanhar-janela.ts` ainda devolve o foco se algum motor
        o perder por outro caminho.
      */
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) evento.preventDefault();
      }}
      onClick={(evento) => {
        if (deveFecharPeloFundo(fecharAoClicarFora, evento.target === evento.currentTarget)) {
          aoFechar();
        }
      }}
    >
      <div
        className="modal__painel"
        style={ESTILO_PAINEL}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descricaoId : undefined}
        tabIndex={-1}
        ref={refPainel}
        onKeyDown={aoTeclar}
      >
        <div className="modal__cabecalho" style={ESTILO_CABECALHO}>
          <h2 className="modal__titulo" id={tituloId} style={{ margin: 0, fontSize: "var(--ds-fs-h3)" }}>
            {titulo}
          </h2>
          {mostrarBotaoFechar && (
            <button
              type="button"
              className="botao botao--discreto"
              style={{ marginLeft: "auto" }}
              onClick={aoFechar}
            >
              Fechar
            </button>
          )}
        </div>
        {descricao && (
          <p
            className="modal__descricao"
            id={descricaoId}
            style={{ margin: 0, color: "var(--ds-text-muted)", fontSize: "var(--ds-fs-body-sm)" }}
          >
            {descricao}
          </p>
        )}
        {children}
        {rodape && <div className="modal__rodape" style={ESTILO_RODAPE}>{rodape}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   A janela, com comportamento
   ============================================================ */

export type PropsModal = {
  aberto: boolean;
  titulo: string;
  /** A consequência em uma frase. Vira `aria-describedby` do diálogo. */
  descricao?: ReactNode;
  aoFechar: () => void;
  /** Falso em decisão destrutiva: ver o cabeçalho deste arquivo. */
  fecharAoClicarFora?: boolean;
  /** Redundante quando o rodapé já tem "Cancelar", e aí atrapalha. */
  mostrarBotaoFechar?: boolean;
  /** Quem recebe o foco ao abrir. Sem isto, a primeira parada de Tab. */
  focoInicial?: RefObject<HTMLElement>;
  rodape?: ReactNode;
  children?: ReactNode;
};

export function Modal({
  aberto, titulo, descricao, aoFechar,
  fecharAoClicarFora = true, mostrarBotaoFechar = true,
  focoInicial, rodape, children,
}: PropsModal) {
  const painel = useRef<HTMLDivElement>(null);
  /* O ouvinte do documento vive uma abertura inteira; o `aoFechar` dele não pode ser o da primeira renderização. */
  const aoFecharAtual = useRef(aoFechar);
  aoFecharAtual.current = aoFechar;
  const tituloId = useId();
  const descricaoId = useId();

  /*
    O nó da janela vive fora da árvore da aplicação, colado no `<body>`.

    Isto não é preferência de arquitetura: é o que torna a interdição possível.
    Renderizada dentro da página, a janela seria descendente do mesmo `<main>`
    que precisa virar `inert`, e `inert` num ancestral desliga o descendente
    junto. A janela ficaria inalcançável por ela mesma.
  */
  const [hospedeiro] = useState(() => {
    /*
      Sem DOM não há janela, e isso não é hipótese: a suíte de testes deste
      painel monta as telas com `renderToStaticMarkup`, em Node, sem
      `document`. Criar o nó direto derrubaria com "document is not defined"
      qualquer teste de uma tela que apenas TENHA uma confirmação, mesmo
      fechada, e o erro apareceria longe daqui, num arquivo de outra pessoa.
      Uma janela modal é interação: fora do navegador, o certo é não existir.
    */
    if (typeof document === "undefined") return null;
    const no = document.createElement("div");
    no.setAttribute("data-modal", "");
    return no;
  });

  /*
    Abrir e fechar em UM efeito só, porque a ordem entre as três coisas é o
    que faz cada uma funcionar, e efeitos separados não deixam essa ordem ser
    escrita:

    - guardar quem abriu tem de vir ANTES da interdição. Marcar `inert` num
      ancestral do elemento focado tira o foco dele na hora, então um efeito
      que lesse `document.activeElement` depois guardaria o `<body>`, e a
      devolução do foco viraria "voltar para o topo do documento", que é
      exatamente o defeito que se queria evitar;
    - devolver a página (tirar `inert`) tem de vir ANTES de devolver o foco,
      pelo mesmo motivo ao contrário: `focus()` em elemento dentro de subárvore
      inerte não faz nada, em silêncio, e o foco fica no `<body>`.
  */
  useEffect(() => {
    if (!aberto || !hospedeiro) return;

    const quemAbriu = document.activeElement;
    document.body.appendChild(hospedeiro);
    /*
      Avisa quem não pode aparecer por cima da janela (o aviso passageiro, ver
      `modais-abertos.ts`). Vem antes da interdição porque o aviso que estava
      na tela sai dela agora, e não depois de a página virar `inert`.
    */
    const liberarAvisos = registrarModalAberto();
    const restaurar = interditarFundo(
      [...document.body.children].filter((filho) => filho !== hospedeiro),
    );

    /*
      O painel é o último recurso, e por isso ele é `tabIndex={-1}`: janela
      sem nada focável dentro (tudo `disabled` enquanto grava) deixaria o foco
      lá atrás, e a pessoa continuaria digitando numa página que ela não vê
      mais.
    */
    /*
      A janela abre NO TOPO (V2-F00-E09, correção 4, revisão). O painel rola
      (`overflow-y: auto`, 84vh) e `focus()` rola até o elemento focado: a 320x568
      a janela da senha temporária abria rolada 229 px, porque o primeiro botão
      fica no pé dela, e o título, que é o que se lê primeiro, ficava fora da
      vista. Quando ninguém pediu um foco inicial e o primeiro controle está fora da
      parte visível do painel, o foco vai para o próprio painel (que se anuncia
      pelo título e pela descrição, e o Tab segue para o primeiro botão), sem
      rolar. Se o primeiro controle está à vista (a janela cabe, ou o botão
      Fechar do cabeçalho de uma janela alta), nada muda: o foco vai a ele.
    */
    const primeiro = focaveisDentro(painel.current)[0];
    const aVista = (el: HTMLElement | undefined): boolean => {
      if (!el || !painel.current) return false;
      const p = painel.current.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5;
    };
    const alvo = focoInicial?.current ?? (aVista(primeiro) ? primeiro : painel.current);
    alvo?.focus({ preventScroll: true });
    if (painel.current) painel.current.scrollTop = 0;
    /*
      O foco inicial pedido (o "Cancelar" de `ConfirmarAcao`) TEM DE ESTAR À
      VISTA dentro da janela (WCAG 2.4.7 e 2.4.11; achado 1 da acessibilidade na
      rodada 8 da V2-F00-E09, correção 7). O `scrollTop = 0` de cima faz a janela
      abrir no topo, e quando o painel rola (zoom de 300 e 400 por cento, celular
      deitado) o botão fica 150 a 190 px abaixo da borda: a pessoa via o título
      e o texto, nenhum botão e nenhum anel de foco, em Chromium e Firefox (o
      WebKit rolava sozinho). Quem pediu um foco inicial pediu um CONTROLE, e
      um controle fora da vista não é foco: o painel rola o mínimo para
      mostrá-lo, com o respiro de sempre, e o título que sai por cima é lido
      pelo leitor de tela na abertura (`aria-labelledby`). Sem foco pedido, o
      caminho é o de antes (o foco vai ao painel, e a janela abre no topo).
    */
    /*
      Daqui para a frente a janela é ACOMPANHADA (ver `acompanhar-janela.ts`):
      o foco inicial é levado à vista agora e de novo a cada mudança do
      conteúdo (a contagem de sessões que chega, o erro do servidor), do
      tamanho da janela do navegador (girar o celular, dar zoom) e da janela
      visual; o foco que cai no `<body>` volta a um controle da janela; e o
      Esc e o Tab valem mesmo com o foco fora do painel. Tudo desligado no
      fechamento.
    */
    const acompanhamento = acompanharAJanela({
      painel: () => painel.current,
      focoInicial: () => focoInicial?.current,
      focaveis: () => focaveisDentro(painel.current),
      aoTeclarFora: (evento) => tratarTecla(evento, painel.current, aoFecharAtual.current),
    });
    if (focoInicial?.current && alvo === focoInicial.current) acompanhamento.ajustarOFocoInicial();

    return () => {
      acompanhamento.parar();
      restaurar();
      hospedeiro.remove();
      liberarAvisos();
      /*
        Quem abriu pode ter sumido: encerrar a ocorrência tira da tela o
        próprio botão de encerrar. `focus()` em nó desconectado não falha e não
        faz nada, e o foco cai no `<body>`. Daí a queda para o conteúdo.
      */
      const volta = quemAbriu instanceof HTMLElement && quemAbriu.isConnected
        ? quemAbriu
        : document.getElementById("conteudo");
      volta?.focus();
    };
    /*
      `focoInicial` fica fora das dependências de propósito: é um ref, a
      identidade dele não muda, e o que importa é o instante da abertura.
    */
  }, [aberto, hospedeiro]);

  if (!aberto || !hospedeiro) return null;

  return createPortal(
    <CorpoDoModal
      tituloId={tituloId}
      descricaoId={descricaoId}
      titulo={titulo}
      descricao={descricao}
      rodape={rodape}
      aoFechar={aoFechar}
      fecharAoClicarFora={fecharAoClicarFora}
      mostrarBotaoFechar={mostrarBotaoFechar}
      refPainel={painel}
      aoTeclar={(evento) => tratarTecla(evento, painel.current, aoFechar)}
    >
      {children}
    </CorpoDoModal>,
    hospedeiro,
  );
}
