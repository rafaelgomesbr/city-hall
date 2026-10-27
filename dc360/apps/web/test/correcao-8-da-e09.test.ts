import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acompanharAJanela, areaVisivelDoPainel } from "../src/componentes/acompanhar-janela";
import { lerFonte } from "./ler-fonte";

/**
 * Os achados que reprovaram a V2-F00-E09 na rodada 9 (sobre dda7557), na parte
 * que roda sem navegador. A prova no navegador, nos três motores, está em
 * `test/layout-estreito.e2e.mjs`, seção 15. Aqui ficam as regras, as causas e
 * a ausência de laço e de vazamento (o que se liga na abertura se desliga por
 * inteiro no fechamento).
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (...partes: string[]) => lerFonte(join(SRC, ...partes));

describe("A parte do painel que a pessoa enxerga", () => {
  const painel = { topo: 20, base: 236 };

  it("sem janela visual, vale o painel inteiro", () => {
    expect(areaVisivelDoPainel({ ...painel })).toEqual(painel);
    expect(areaVisivelDoPainel({ ...painel, visual: null })).toEqual(painel);
  });

  it("com o teclado virtual aberto (janela visual mais baixa, sem zoom), a base é a da janela visual", () => {
    expect(
      areaVisivelDoPainel({ ...painel, visual: { offsetTop: 0, height: 150, scale: 1 } }),
    ).toEqual({ topo: 20, base: 150 });
  });

  it("com a janela visual rolada para baixo, o topo é o dela", () => {
    expect(
      areaVisivelDoPainel({ ...painel, visual: { offsetTop: 60, height: 400, scale: 1 } }),
    ).toEqual({ topo: 60, base: 236 });
  });

  it("com zoom de pinça (escala acima de 1) a janela visual é o pedaço que a pessoa escolheu olhar: vale o painel inteiro, para não brigar com o gesto", () => {
    expect(
      areaVisivelDoPainel({ ...painel, visual: { offsetTop: 0, height: 100, scale: 2 } }),
    ).toEqual(painel);
  });

  it("janela visual que nem toca o painel, ou com números quebrados, não é medida confiável", () => {
    expect(
      areaVisivelDoPainel({ ...painel, visual: { offsetTop: 500, height: 100, scale: 1 } }),
    ).toEqual(painel);
    expect(
      areaVisivelDoPainel({ ...painel, visual: { offsetTop: 0, height: Number.NaN, scale: 1 } }),
    ).toEqual(painel);
  });
});

/* ------------------------------------------------------------
   Um DOM mínimo para o acompanhamento. Nada de jsdom: o que importa é
   quais ouvintes entram, o que cada um faz e se saem todos.
   ------------------------------------------------------------ */

type Ouvinte = (evento: unknown) => void;

class ElementoFalso {
  disabled = false;
  isConnected = true;
  topo: number;
  altura: number;
  focado = vi.fn(() => {
    cenario.doc.activeElement = this;
  });
  filhos = new Set<ElementoFalso>();
  constructor(topo = 0, altura = 44) {
    this.topo = topo;
    this.altura = altura;
  }
  matches(seletor: string): boolean {
    return seletor === ":disabled" && this.disabled;
  }
  focus(): void {
    this.focado();
  }
  getBoundingClientRect() {
    return { top: this.topo, bottom: this.topo + this.altura, height: this.altura };
  }
}

class PainelFalso extends ElementoFalso {
  scrollTop = 0;
  clientTop = 0;
  clientHeight = 216;
  style: Record<string, string> = {};
  ouvintes = new Map<string, Ouvinte[]>();
  contains(el: unknown): boolean {
    return el === this || (el instanceof ElementoFalso && this.filhos.has(el));
  }
  querySelector() {
    return null;
  }
  addEventListener(tipo: string, f: Ouvinte) {
    this.ouvintes.set(tipo, [...(this.ouvintes.get(tipo) ?? []), f]);
  }
  removeEventListener(tipo: string, f: Ouvinte) {
    this.ouvintes.set(
      tipo,
      (this.ouvintes.get(tipo) ?? []).filter((x) => x !== f),
    );
  }
  total() {
    return [...this.ouvintes.values()].reduce((a, l) => a + l.length, 0);
  }
}

type Cenario = {
  doc: {
    activeElement: unknown;
    body: ElementoFalso;
    documentElement: object;
    ouvintes: Map<string, Ouvinte[]>;
    addEventListener: (t: string, f: Ouvinte) => void;
    removeEventListener: (t: string, f: Ouvinte) => void;
  };
  janela: { ouvintes: Map<string, Ouvinte[]>; visualViewport: ReturnType<typeof criarVisual> };
};
// Atribuído em `montar`; a classe acima o lê na hora de focar.
let cenario: Cenario;

function criarVisual() {
  const ouvintes = new Map<string, Ouvinte[]>();
  return {
    offsetTop: 0,
    height: 700,
    scale: 1,
    ouvintes,
    addEventListener: (t: string, f: Ouvinte) => {
      ouvintes.set(t, [...(ouvintes.get(t) ?? []), f]);
    },
    removeEventListener: (t: string, f: Ouvinte) => {
      ouvintes.set(
        t,
        (ouvintes.get(t) ?? []).filter((x) => x !== f),
      );
    },
  };
}

function contar(m: Map<string, Ouvinte[]>): number {
  return [...m.values()].reduce((a, l) => a + l.length, 0);
}

function montar() {
  const quadros: Array<() => void> = [];
  const visual = criarVisual();
  const doc = {
    activeElement: null as unknown,
    body: new ElementoFalso(),
    documentElement: {},
    ouvintes: new Map<string, Ouvinte[]>(),
    addEventListener(t: string, f: Ouvinte) {
      doc.ouvintes.set(t, [...(doc.ouvintes.get(t) ?? []), f]);
    },
    removeEventListener(t: string, f: Ouvinte) {
      doc.ouvintes.set(
        t,
        (doc.ouvintes.get(t) ?? []).filter((x) => x !== f),
      );
    },
  };
  const janela = {
    ouvintes: new Map<string, Ouvinte[]>(),
    visualViewport: visual,
    addEventListener(t: string, f: Ouvinte) {
      janela.ouvintes.set(t, [...(janela.ouvintes.get(t) ?? []), f]);
    },
    removeEventListener(t: string, f: Ouvinte) {
      janela.ouvintes.set(
        t,
        (janela.ouvintes.get(t) ?? []).filter((x) => x !== f),
      );
    },
  };
  cenario = { doc, janela };
  let observadores = 0;
  let observadorAtual: {
    chamar: (r: unknown[]) => void;
    desligado: boolean;
    opcoes: unknown;
  } | null = null;
  class ObservadorFalso {
    constructor(f: (r: unknown[]) => void) {
      observadores++;
      observadorAtual = { chamar: f, desligado: false, opcoes: null };
    }
    observe(_alvo: unknown, opcoes: unknown) {
      if (observadorAtual) observadorAtual.opcoes = opcoes;
    }
    disconnect() {
      if (observadorAtual) observadorAtual.desligado = true;
    }
  }
  vi.stubGlobal("HTMLElement", ElementoFalso);
  vi.stubGlobal("Node", ElementoFalso);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", janela);
  vi.stubGlobal("MutationObserver", ObservadorFalso);
  vi.stubGlobal("getComputedStyle", () => ({ position: "static", getPropertyValue: () => "12" }));
  vi.stubGlobal("requestAnimationFrame", (f: () => void) => {
    quadros.push(f);
    return quadros.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    quadros[id - 1] = () => {};
  });

  const painel = new PainelFalso(20, 216);
  const cancelar = new ElementoFalso(170, 44);
  const confirmar = new ElementoFalso(100, 44);
  painel.filhos.add(cancelar).add(confirmar);
  doc.activeElement = cancelar;
  const aoTeclarFora = vi.fn();
  const acompanhamento = acompanharAJanela({
    painel: () => painel as unknown as HTMLElement,
    focoInicial: () => cancelar as unknown as HTMLElement,
    focaveis: () => [confirmar, cancelar].filter((e) => !e.disabled) as unknown as HTMLElement[],
    aoTeclarFora,
  });
  const dispararQuadros = () => {
    while (quadros.length) quadros.shift()?.();
  };
  return {
    painel,
    cancelar,
    confirmar,
    doc,
    janela,
    visual,
    acompanhamento,
    aoTeclarFora,
    dispararQuadros,
    observador: () => observadorAtual,
    observadores: () => observadores,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Achado 1: a janela aberta acompanha a mudança de tamanho", () => {
  it("liga resize, orientationchange e a janela visual (resize e scroll)", () => {
    const m = montar();
    expect(m.janela.ouvintes.get("resize")).toHaveLength(1);
    expect(m.janela.ouvintes.get("orientationchange")).toHaveLength(1);
    expect(m.visual.ouvintes.get("resize")).toHaveLength(1);
    expect(m.visual.ouvintes.get("scroll")).toHaveLength(1);
    m.acompanhamento.parar();
  });

  it("o 'Cancelar' que o zoom empurrou para fora (424..468 numa janela de 20..236) volta à vista quando a janela muda de tamanho", () => {
    const m = montar();
    m.cancelar.topo = 424; // a parte visível continua 20..236 (216 de altura)
    m.janela.ouvintes.get("resize")![0]!({});
    // O painel rolou o necessário: o botão agora termina no respiro de baixo (236 - 12).
    expect(m.painel.scrollTop).toBe(424 + 44 - (236 - 12));
    m.acompanhamento.parar();
  });

  it("a mesma conta roda nos outros eventos e no quadro seguinte (alguns motores terminam o layout depois do evento)", () => {
    const m = montar();
    m.cancelar.topo = 300;
    m.janela.ouvintes.get("orientationchange")![0]!({});
    const depoisDoEvento = m.painel.scrollTop;
    expect(depoisDoEvento).toBeGreaterThan(0);
    m.cancelar.topo = 400; // o layout terminou de se acomodar: o botão está ainda mais abaixo
    m.dispararQuadros();
    expect(m.painel.scrollTop).toBeGreaterThan(depoisDoEvento);
    m.visual.ouvintes.get("resize")![0]!({});
    m.cancelar.topo = 500;
    m.visual.ouvintes.get("scroll")![0]!({});
    m.dispararQuadros();
    expect(m.painel.scrollTop).toBeGreaterThan(depoisDoEvento);
    m.acompanhamento.parar();
  });

  it("sem laço: com o botão já à vista, repetir o evento não rola nada", () => {
    const m = montar();
    m.cancelar.topo = 150; // à vista, com folga
    for (let i = 0; i < 20; i++) {
      m.janela.ouvintes.get("resize")![0]!({});
      m.dispararQuadros();
    }
    expect(m.painel.scrollTop).toBe(0);
    m.cancelar.topo = 424;
    m.janela.ouvintes.get("resize")![0]!({});
    const uma = m.painel.scrollTop;
    // O botão acompanha a rolagem (como no navegador): depois do ajuste ele está à vista, e repetir não muda mais nada.
    m.cancelar.topo = 424 - uma;
    for (let i = 0; i < 20; i++) {
      m.janela.ouvintes.get("resize")![0]!({});
      m.dispararQuadros();
    }
    expect(m.painel.scrollTop).toBe(uma);
    m.acompanhamento.parar();
  });

  it("o painel, que recebe o foco quando não há controle, não rola; um controle da janela com o foco, sim", () => {
    const m = montar();
    m.doc.activeElement = m.painel;
    m.cancelar.topo = 424;
    m.janela.ouvintes.get("resize")![0]!({});
    expect(m.painel.scrollTop).toBe(0);
    m.doc.activeElement = m.confirmar;
    m.confirmar.topo = 424;
    m.janela.ouvintes.get("resize")![0]!({});
    expect(m.painel.scrollTop).toBeGreaterThan(0);
    m.acompanhamento.parar();
  });

  it("com o teclado virtual aberto, a base é a da janela visual", () => {
    const m = montar();
    m.visual.height = 150; // só 0..150 da tela está à vista
    m.cancelar.topo = 120; // à vista no painel, mas sob o teclado
    m.janela.ouvintes.get("resize")![0]!({});
    expect(m.painel.scrollTop).toBe(120 + 44 - (150 - 12));
    m.acompanhamento.parar();
  });

  it("parar() desliga TUDO: ouvintes da janela, da janela visual, do documento e do painel, o observador e os quadros pendentes", () => {
    const m = montar();
    m.janela.ouvintes.get("resize")![0]!({}); // deixa um quadro pendente
    expect(
      contar(m.janela.ouvintes) +
        contar(m.visual.ouvintes) +
        contar(m.doc.ouvintes) +
        m.painel.total(),
    ).toBeGreaterThan(0);
    m.acompanhamento.parar();
    expect(contar(m.janela.ouvintes)).toBe(0);
    expect(contar(m.visual.ouvintes)).toBe(0);
    expect(contar(m.doc.ouvintes)).toBe(0);
    expect(m.painel.total()).toBe(0);
    expect(m.observador()?.desligado).toBe(true);
    m.cancelar.topo = 424;
    m.dispararQuadros(); // o quadro pendente foi cancelado: nada acontece
    expect(m.painel.scrollTop).toBe(0);
  });

  it("abrir e fechar muitas vezes não acumula ouvinte nem observador", () => {
    for (let i = 0; i < 50; i++) {
      const m = montar();
      m.acompanhamento.parar();
      expect(
        contar(m.janela.ouvintes) +
          contar(m.visual.ouvintes) +
          contar(m.doc.ouvintes) +
          m.painel.total(),
      ).toBe(0);
    }
  });

  it("depois que o painel sai da tela (a janela fechou), nenhum ouvinte mexe em nada", () => {
    const m = montar();
    m.painel.isConnected = false;
    m.cancelar.topo = 424;
    m.janela.ouvintes.get("resize")![0]!({});
    m.dispararQuadros();
    expect(m.painel.scrollTop).toBe(0);
    m.observador()!.chamar([{ type: "childList" }]);
    expect(m.cancelar.focado).not.toHaveBeenCalled();
    m.acompanhamento.parar();
  });
});

describe("Achado 2: o foco que cai na página volta a um controle da janela, e o Esc e o Tab valem", () => {
  it("a tecla que chega ao documento com o alvo FORA do painel é entregue à janela; a que vem de dentro, não (o painel já a trata)", () => {
    const m = montar();
    const noDocumento = m.doc.ouvintes.get("keydown")![0]!;
    noDocumento({ key: "Escape", target: m.doc.body, defaultPrevented: false });
    expect(m.aoTeclarFora).toHaveBeenCalledTimes(1);
    noDocumento({ key: "Escape", target: m.cancelar, defaultPrevented: false });
    noDocumento({ key: "Escape", target: m.doc.body, defaultPrevented: true });
    expect(m.aoTeclarFora).toHaveBeenCalledTimes(1);
    m.acompanhamento.parar();
  });

  it("o foco arrancado da janela (focusout sem destino) volta ao último controle que o teve", () => {
    vi.useFakeTimers();
    const m = montar();
    m.doc.activeElement = m.doc.body; // o foco caiu em BODY
    m.painel.ouvintes.get("focusout")![0]!({ relatedTarget: null });
    vi.runAllTimers();
    expect(m.cancelar.focado).toHaveBeenCalled();
    expect(m.doc.activeElement).toBe(m.cancelar);
    m.acompanhamento.parar();
  });

  it("focusout para outro elemento (o foco só mudou de controle) não é perda", () => {
    vi.useFakeTimers();
    const m = montar();
    m.doc.activeElement = m.confirmar;
    m.painel.ouvintes.get("focusout")![0]!({ relatedTarget: m.confirmar });
    vi.runAllTimers();
    expect(m.cancelar.focado).not.toHaveBeenCalled();
    m.acompanhamento.parar();
  });

  it("o foco em BODY depois que os botões travaram gravando vai para o painel, e VOLTA ao botão quando ele volta a valer (o erro do servidor)", () => {
    const m = montar();
    // Gravando: os dois botões travam e o foco já caiu em BODY, sem evento nenhum (o motor só o perde).
    m.cancelar.disabled = true;
    m.confirmar.disabled = true;
    m.doc.activeElement = m.doc.body;
    m.observador()!.chamar([{ type: "attributes" }]);
    expect(m.doc.activeElement).toBe(m.painel);
    // O erro chega: os botões voltam a valer, e o foco volta para "Cancelar" (o último controle que o teve).
    m.cancelar.disabled = false;
    m.confirmar.disabled = false;
    m.observador()!.chamar([{ type: "attributes" }, { type: "childList" }]);
    expect(m.doc.activeElement).toBe(m.cancelar);
    m.acompanhamento.parar();
  });

  it("o botão travado que o motor deixa com o foco (sem soltá-lo) também é guardado pelo painel e devolvido", () => {
    const m = montar();
    m.cancelar.disabled = true;
    m.confirmar.disabled = true;
    m.observador()!.chamar([{ type: "attributes" }]);
    expect(m.doc.activeElement).toBe(m.painel);
    m.cancelar.disabled = false;
    m.confirmar.disabled = false;
    m.observador()!.chamar([{ type: "attributes" }]);
    expect(m.doc.activeElement).toBe(m.cancelar);
    m.acompanhamento.parar();
  });

  it("o WebKit, que leva o foco ao painel quando um botão é clicado, também devolve o foco quando os botões voltam a valer", () => {
    const m = montar();
    // Clique em "confirmar": o WebKit não foca o botão, foca o painel.
    m.painel.ouvintes.get("focusin")![0]!({ target: m.painel });
    m.doc.activeElement = m.painel;
    m.cancelar.disabled = true;
    m.confirmar.disabled = true;
    m.observador()!.chamar([{ type: "attributes" }]);
    m.cancelar.disabled = false;
    m.confirmar.disabled = false;
    m.observador()!.chamar([{ type: "attributes" }]);
    expect(m.doc.activeElement).toBe(m.cancelar);
    m.acompanhamento.parar();
  });

  it("quem moveu o foco por conta própria para outro controle não é puxado de volta", () => {
    const m = montar();
    m.doc.activeElement = m.confirmar;
    m.painel.ouvintes.get("focusin")![0]!({ target: m.confirmar });
    m.cancelar.focado.mockClear();
    m.observador()!.chamar([{ type: "childList" }, { type: "attributes" }]);
    expect(m.doc.activeElement).toBe(m.confirmar);
    expect(m.cancelar.focado).not.toHaveBeenCalled();
    m.acompanhamento.parar();
  });

  it("o foco no painel que o usuário escolheu (sem nada esperando) não é tirado de lá por mutação", () => {
    const m = montar();
    m.doc.activeElement = m.painel;
    m.observador()!.chamar([{ type: "childList" }, { type: "attributes" }]);
    expect(m.doc.activeElement).toBe(m.painel);
    m.acompanhamento.parar();
  });

  it("o observador também vê o atributo `disabled`, além do conteúdo", () => {
    const m = montar();
    expect(m.observador()?.opcoes).toEqual({
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
    m.acompanhamento.parar();
  });

  it("a mutação com o foco ainda no botão pedido o mantém à vista (o que a correção 7 já fazia)", () => {
    const m = montar();
    m.cancelar.topo = 424;
    m.observador()!.chamar([{ type: "childList" }]);
    expect(m.painel.scrollTop).toBeGreaterThan(0);
    m.acompanhamento.parar();
  });
});

describe("Os achados estão ligados ao Modal", () => {
  const modal = fonte("componentes", "Modal.tsx");

  it("o Modal liga o acompanhamento na abertura e o desliga no fechamento, e a conta da rolagem continua exportada dele", () => {
    expect(modal).toContain("const acompanhamento = acompanharAJanela({");
    expect(modal).toMatch(/return \(\) => \{\s+acompanhamento\.parar\(\);\s+restaurar\(\);/);
    expect(modal).toContain('export { rolagemParaVerNoPainel } from "./acompanhar-janela";');
  });

  it("Esc e Tab têm UM caminho só, para o painel e para o documento, e o aoFechar do ouvinte do documento não fica velho", () => {
    expect(modal).toContain("function tratarTecla(");
    expect(modal).toContain("aoTeclar={(evento) => tratarTecla(evento, painel.current, aoFechar)}");
    expect(modal).toContain(
      "aoTeclarFora: (evento) => tratarTecla(evento, painel.current, aoFecharAtual.current),",
    );
    expect(modal).toContain("aoFecharAtual.current = aoFechar;");
  });

  it("apertar o mouse no fundo escurecido não tira o foco de onde estava", () => {
    expect(modal).toMatch(
      /onMouseDown=\{\(evento\) => \{\s+if \(evento\.target === evento\.currentTarget\) evento\.preventDefault\(\);/,
    );
  });

  it("o título fica preso no topo do painel, encostado na borda dele, sem mudar o repouso", () => {
    expect(modal).toContain('position: "sticky",');
    expect(modal).toContain('top: "calc(-1 * var(--ds-sp-5))",');
    expect(modal).toContain(
      'margin: "calc(-1 * var(--ds-sp-5)) 0 calc(var(--ds-sp-3) - var(--ds-sp-2))",',
    );
    expect(modal).toContain('paddingBottom: "var(--ds-sp-2)",');
    expect(modal).toContain('paddingTop: "var(--ds-sp-5)",');
    expect(modal).toContain('background: "var(--ds-surface)",');
  });

  it("o acompanhamento conta o cabeçalho preso como parte coberta do painel e o repassa ao scroll-padding-top", () => {
    const acompanhamento = fonte("componentes", "acompanhar-janela.ts");
    expect(acompanhamento).toContain('getComputedStyle(cabecalho).position !== "sticky"');
    expect(acompanhamento).toContain("topo: topoUtil + coberturaDoCabecalho(painel),");
    expect(acompanhamento).toContain("painel.style.scrollPaddingTop");
  });
});

describe("Achado 3: as frases das janelas dizem o que o sistema faz, e nada além", () => {
  const usuarios = fonte("paginas", "Usuarios.tsx");
  const conta = fonte("paginas", "MinhaConta.tsx");

  it("'Encerrar sessões' não promete que a pessoa sai de todos os navegadores agora", () => {
    expect(usuarios).not.toContain("sai de todos os navegadores");
    expect(usuarios).toContain("deixa de poder renovar a sessão, gravar e consultar agora");
    expect(usuarios).toContain("que já estava aberto fica visível");
    expect(usuarios).toContain("nenhuma consulta nova é atendida");
  });

  it("'Redefinir senha' não promete que as sessões abertas caem na hora", () => {
    expect(usuarios).not.toMatch(/as sessões abertas\s+caem/);
    expect(usuarios).toContain("as sessões abertas deixam");
    expect(usuarios).toContain("de renovar, de gravar e de consultar na hora. O sistema sorteia");
  });

  it("'Encerrar minhas outras sessões' diz a mesma coisa, sem fixar o número de minutos", () => {
    expect(conta).not.toContain("saem agora e precisam entrar de novo");
    expect(conta).toContain("deixam de poder renovar a sessão,");
    expect(conta).toContain("nenhuma consulta nova é atendida");
  });
});

describe("A prova no navegador existe", () => {
  it("a seção 15 do layout-estreito gira e dá zoom com a janela aberta, clica no fundo e provoca o erro do servidor", () => {
    const e2e = fonte("..", "test", "layout-estreito.e2e.mjs");
    expect(e2e).toContain(
      "== 15. A janela de confirmação aberta acompanha a mudança de tamanho e não perde o foco",
    );
    expect(e2e).toContain("await pg.setViewportSize({ width: resto[i], height: resto[i + 1] });");
    expect(e2e).toContain('["zoom de 400 por cento", 1280, 1024, 320, 256]');
    expect(e2e).toContain('["rotação do celular", 320, 568, 568, 320]');
    expect(e2e).toContain("depois de um ${via} no fundo escurecido da janela destrutiva");
    expect(e2e).toContain("status: 500");
    expect(e2e).toContain("o Esc que chega ao documento fecha a janela");
  });
});

beforeEach(() => {
  vi.unstubAllGlobals();
});
