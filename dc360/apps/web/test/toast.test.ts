import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { agendarFechamento, Toast } from "../src/componentes/Toast";

/**
 * O aviso passageiro: anunciado, e sem relógio esquecido de pé.
 *
 * Os dois defeitos que este arquivo guarda são de tipos diferentes. O
 * anúncio (`role="status"` com `aria-live="polite"`) é marcação, e some sem
 * fazer barulho: o aviso continua bonito na tela e simplesmente não existe
 * para quem usa leitor de tela. O temporizador não cancelado é pior de
 * achar: sair da tela antes de o aviso sumir deixa um `setTimeout` de pé,
 * que dispara depois, sobre um componente que já não existe. Em produção
 * isso vira o aviso da tela anterior fechando por cima da tela nova, sem
 * ninguém conseguir reproduzir.
 */

const FONTE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "componentes", "Toast.tsx"),
  "utf8",
);

describe("O relógio do aviso", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("fecha sozinho quando o tempo passa", () => {
    const fechou = vi.fn();
    agendarFechamento(1000, fechou);
    vi.advanceTimersByTime(999);
    expect(fechou).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fechou).toHaveBeenCalledTimes(1);
  });

  it("cancelado, não dispara nunca mais", () => {
    /*
      Este é o desmonte: a tela trocou, o componente saiu, e o que sobrou do
      aviso é a função de limpeza. Sem `clearTimeout`, o `aoFechar` roda
      depois, mexendo no estado de um componente que já não está montado.
    */
    const fechou = vi.fn();
    const cancelar = agendarFechamento(1000, fechou);
    cancelar();
    vi.advanceTimersByTime(60_000);
    expect(fechou).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("duração nula é aviso que fica, e não agenda nada", () => {
    // Existe erro que não pode sumir sozinho enquanto ninguém o leu.
    const fechou = vi.fn();
    agendarFechamento(null, fechou);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(fechou).not.toHaveBeenCalled();
  });

  it("duração zero ou negativa não vira aviso que pisca", () => {
    const fechou = vi.fn();
    agendarFechamento(0, fechou);
    agendarFechamento(-5, fechou);
    vi.advanceTimersByTime(60_000);
    expect(fechou).not.toHaveBeenCalled();
  });
});

describe("O aviso é anunciado", () => {
  it("declara região de status e anúncio educado", () => {
    const html = renderToStaticMarkup(
      h(Toast, { mensagem: "Ocorrência 000123/2026 registrada", aoFechar: () => {} }),
    );
    expect(html).toContain('role="status"');
    /*
      "Polite" é deliberado: `assertive` corta a frase que o leitor de tela
      está falando, e um aviso de sucesso não vale interromper alguém no meio
      da leitura de um endereço.
    */
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Ocorrência 000123/2026 registrada");
  });

  it("tem saída manual, e não só o relógio", () => {
    // Quem usa ampliador de tela, ou precisa de mais tempo, não pode
    // depender do relógio de outra pessoa para tirar o aviso do caminho.
    const html = renderToStaticMarkup(h(Toast, { mensagem: "oi", aoFechar: () => {} }));
    expect(html).toMatch(/<button[^>]*>Fechar<\/button>/);
  });
});

describe("O componente usa o próprio relógio", () => {
  it("o efeito devolve o cancelamento, que é o que o desmonte chama", () => {
    /*
      `useEffect(() => agendarFechamento(...))` devolve a limpeza porque a
      seta sem chaves retorna o valor. Trocar isso por um corpo com chaves,
      sem `return`, apaga o cancelamento e nenhum teste de função pura
      percebe.
    */
    expect(FONTE).toMatch(/useEffect\(\(\) => agendarFechamento\(/);
  });

  it("o aoFechar mora num ref, senão o aviso nunca fecha", () => {
    /*
      Uma seta escrita na tela (`aoFechar={() => setAviso(null)}`) tem
      identidade nova a cada renderização do pai. Se ela entrasse nas
      dependências, o efeito reiniciaria junto e o temporizador nunca
      chegaria ao fim, num painel que se atualiza sozinho.
    */
    expect(FONTE).toMatch(/useRef\(aoFechar\)/);
    // E a lista de dependências do efeito é só a duração.
    expect(FONTE).toMatch(/agendarFechamento\([\s\S]*?\), \[duracao\]\);/);
    expect(FONTE).not.toMatch(/\[duracao, aoFechar\]/);
  });
});
