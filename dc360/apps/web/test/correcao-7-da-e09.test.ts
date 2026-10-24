import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { rolagemParaVerNoPainel } from "../src/componentes/Modal";
import { levarAFaixaDasBordas, manterNaFaixaDasBordas } from "../src/componentes/usar-bordas-fixas";
import { lerFonte } from "./ler-fonte";

/**
 * Os achados que bloquearam a V2-F00-E09 na rodada 8 (UX e acessibilidade, FAIL,
 * sobre 60cbc2f), na parte que roda sem navegador. A prova no navegador, nos três
 * motores, está em `test/layout-estreito.e2e.mjs`, seção 14. Aqui ficam as
 * regras e as causas.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (...partes: string[]) => lerFonte(join(SRC, ...partes));

describe("Achado de acessibilidade 1: o foco inicial da janela de confirmação fica à vista no painel", () => {
  // O painel de 20..236 do achado (320x256, zoom de 400 por cento): 216 px de parte visível.
  const painel = { painelTopo: 20, painelBase: 236, respiro: 12 };

  it("o 'Cancelar' 150 a 190 px abaixo da borda faz o painel rolar até mostrá-lo, com respiro embaixo", () => {
    const delta = rolagemParaVerNoPainel({ ...painel, alvoTopo: 424, alvoBase: 468 });
    expect(delta).toBe(468 - (236 - 12));
    // Depois da rolagem o botão está inteiro dentro do painel, com o respiro.
    expect(468 - delta).toBeLessThanOrEqual(236 - 12);
    expect(424 - delta).toBeGreaterThanOrEqual(20);
  });

  it("controle já à vista, com folga dos dois lados, não faz o painel rolar", () => {
    expect(rolagemParaVerNoPainel({ ...painel, alvoTopo: 120, alvoBase: 164 })).toBe(0);
  });

  it("controle encostado na borda de baixo (dentro do respiro) rola só o que falta, sem passar do respiro", () => {
    expect(rolagemParaVerNoPainel({ ...painel, alvoTopo: 190, alvoBase: 234 })).toBe(234 - 224);
  });

  it("controle acima da parte visível rola para cima (valor negativo)", () => {
    expect(rolagemParaVerNoPainel({ ...painel, alvoTopo: -30, alvoBase: 14 })).toBe(-30 - 32);
  });

  it("controle mais alto que o painel não cabe: o começo dele vai ao começo do painel", () => {
    expect(rolagemParaVerNoPainel({ ...painel, alvoTopo: 300, alvoBase: 560 })).toBe(300 - 20);
  });

  it("o respiro encolhe quando a folga é pouca (painel de 50 px, botão de 44)", () => {
    expect(rolagemParaVerNoPainel({ painelTopo: 0, painelBase: 50, alvoTopo: 40, alvoBase: 84, respiro: 12 })).toBe(84 - 47);
  });

  it("o conteúdo que muda depois de aberta (a contagem de sessões que chega) refaz a conta enquanto o foco continua no botão, e o observador é desligado ao fechar", () => {
    const modal = fonte("componentes", "Modal.tsx");
    expect(modal).toContain("if (!botao || !corpo || document.activeElement !== botao) return;");
    expect(modal).toContain("observador = new MutationObserver(levarOFocoInicialAVista);");
    expect(modal).toContain("observador.observe(painel.current, { childList: true, subtree: true, characterData: true });");
    expect(modal).toMatch(/return \(\) => \{\s+observador\?\.disconnect\(\);\s+restaurar\(\);/);
  });

  it("o Modal usa a conta depois de abrir no topo, só quando um foco inicial foi pedido, e já não deixa o focus() rolar a página", () => {
    const modal = fonte("componentes", "Modal.tsx");
    expect(modal).toContain("alvo?.focus({ preventScroll: true });");
    expect(modal).toContain("if (painel.current) painel.current.scrollTop = 0;");
    expect(modal.indexOf("painel.current.scrollTop = 0;")).toBeLessThan(modal.indexOf("corpo.scrollTop += rolagemParaVerNoPainel({"));
    expect(modal).toContain("if (focoInicial?.current && alvo === focoInicial.current && painel.current) {");
    // Sem foco pedido, o caminho da correção 4 continua: primeiro controle à vista, senão o painel.
    expect(modal).toContain("focoInicial?.current ?? (aVista(primeiro) ? primeiro : painel.current)");
  });
});

describe("Achado de UX 1 e de acessibilidade 2: a confirmação das sessões fica à vista no WebKit", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Um DOM mínimo: a faixa livre é 129..561 (topo fixo e barra do pé), como a 360x640. */
  function montar(topoDoAviso: number, ativo: "o aviso" | "outro") {
    const rolagens: number[] = [];
    const caixaDoAviso = { top: topoDoAviso, height: 84, bottom: topoDoAviso + 84 };
    const aviso = {
      isConnected: true,
      scrollIntoView: vi.fn(),
      getBoundingClientRect: () => ({ ...caixaDoAviso, bottom: caixaDoAviso.top + caixaDoAviso.height }),
    };
    const topo = { getBoundingClientRect: () => ({ bottom: 129 }) };
    const barra = { getBoundingClientRect: () => ({ top: 561 }) };
    vi.stubGlobal("document", {
      activeElement: ativo === "o aviso" ? aviso : {},
      documentElement: {},
      querySelector: (seletor: string) => (seletor === ".topo" ? topo : seletor === ".lateral" ? barra : null),
    });
    vi.stubGlobal("window", {
      innerHeight: 640,
      scrollBy: (_x: number, y: number) => { rolagens.push(y); caixaDoAviso.top -= y; },
    });
    vi.stubGlobal("getComputedStyle", (el: unknown) => (el === topo
      ? { position: "sticky" }
      : el === barra ? { position: "sticky", bottom: "0px" } : { getPropertyValue: () => "12" }));
    vi.stubGlobal("requestAnimationFrame", (acao: () => void) => { acao(); return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    return { aviso: aviso as unknown as HTMLElement, rolagens, caixaDoAviso };
  }

  it("a frase atrás do topo (10..94 contra 129) é puxada para a faixa livre", () => {
    const { aviso, rolagens, caixaDoAviso } = montar(10, "o aviso");
    levarAFaixaDasBordas(aviso);
    expect(rolagens).toHaveLength(1);
    expect(caixaDoAviso.top).toBeGreaterThanOrEqual(129);
    expect(caixaDoAviso.top + 84).toBeLessThanOrEqual(561);
  });

  it("a frase já à vista não rola nada", () => {
    const { aviso, rolagens } = montar(200, "o aviso");
    levarAFaixaDasBordas(aviso);
    expect(rolagens).toEqual([]);
  });

  it("manter na faixa age enquanto o foco está no elemento, e não puxa de volta quem já seguiu adiante", () => {
    const comFoco = montar(-136, "o aviso");
    const cancelar = manterNaFaixaDasBordas(comFoco.aviso);
    expect(comFoco.caixaDoAviso.top).toBeGreaterThanOrEqual(129);
    cancelar();
    const semFoco = montar(-136, "outro");
    manterNaFaixaDasBordas(semFoco.aviso)();
    expect(semFoco.rolagens).toEqual([]);
  });

  it("Minha conta chama o ajuste quando a confirmação aparece E quando a lista relida chega (é ela que encolhe a página)", () => {
    const conta = fonte("paginas", "MinhaConta.tsx");
    expect(conta).toContain('import { manterNaFaixaDasBordas } from "../componentes/usar-bordas-fixas";');
    expect(conta).toMatch(/return manterNaFaixaDasBordas\(confirmacao\.current\);\s+\}, \[sucesso, sessoes\]\);/);
    // O foco continua sendo da confirmação, por UM mecanismo só (correção 2).
    expect(conta).toContain("if (sucesso) confirmacao.current?.focus();");
  });

  it("o ajuste do Tab usa o mesmo miolo (uma conta só para as duas coisas)", () => {
    const hook = fonte("componentes", "usar-bordas-fixas.ts");
    expect(hook).toMatch(/levarAFaixaDasBordas\(alvo\);\s+\};/);
    expect(hook.match(/deslocamentoParaAFaixa\(\{/g)?.length).toBe(1);
  });
});

describe("A prova no navegador existe", () => {
  it("a seção 14 do layout-estreito mede a confirmação das sessões por clique, toque e teclado e o foco da janela de confirmação", () => {
    const e2e = fonte("..", "test", "layout-estreito.e2e.mjs");
    expect(e2e).toContain("== 14. A confirmação das sessões e o foco da janela de confirmação ficam à vista");
    expect(e2e).toContain('for (const via of ["clique", "toque", "teclado"])');
    expect(e2e).toContain("abre com o foco em \"Cancelar\" à vista dentro da janela");
  });
});
