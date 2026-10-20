import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STATUS_INICIAL, TRANSICOES_PERMITIDAS, estadoTerminal } from "@dc360/shared";

import {
  DURACAO_PADRAO, DURACAO_PARA_DITAR, Toast, agendarFechamento, duracaoComPausa,
} from "../src/componentes/Toast";
import { avisoDoRegistro } from "../src/paginas/ocorrencia-regras";

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
    // E a lista de dependências do efeito é a duração e as duas pausas (ponteiro e janela aberta), nada mais: o
    // `aoFechar` entrando ali é o defeito que o ref existe para impedir.
    expect(FONTE).toMatch(/agendarFechamento\([\s\S]*?\), \[duracao, interagindo, esperandoJanela\]\);/);
    expect(FONTE).not.toMatch(/\[duracao, aoFechar\]/);
    expect(FONTE).not.toMatch(/\[duracao, interagindo, esperandoJanela, aoFechar\]/);
  });
});

describe("O aviso não some enquanto a pessoa mexe nele", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("com o ponteiro em cima, ou o foco dentro, o relógio não corre", () => {
    /*
      Este é o caso que nenhum número resolve: o aviso traz o protocolo, a
      pessoa leva o mouse até o canto da tela e arrasta por cima do número
      para copiar, e o relógio termina no meio da seleção. O número some
      justamente de quem estava tentando levá-lo.
    */
    const fechou = vi.fn();
    const cancelar = agendarFechamento(duracaoComPausa(DURACAO_PARA_DITAR, true), fechou);
    vi.advanceTimersByTime(10 * 60_000);
    expect(fechou, "o aviso sumiu enquanto a pessoa copiava o número").not.toHaveBeenCalled();
    cancelar();
  });

  it("solto o ponteiro, o relógio volta a correr", () => {
    // Pausa que não termina é aviso entalado tapando o canto da tela.
    const fechou = vi.fn();
    agendarFechamento(duracaoComPausa(DURACAO_PARA_DITAR, false), fechou);
    vi.advanceTimersByTime(DURACAO_PARA_DITAR);
    expect(fechou).toHaveBeenCalledTimes(1);
  });

  it("a pausa não inventa caminho novo: ela é o mesmo `null` de sempre", () => {
    // `agendarFechamento` já sabia tratar "aviso que fica". Um segundo
    // mecanismo de pausa seria um segundo lugar para o relógio vazar.
    expect(duracaoComPausa(DURACAO_PARA_DITAR, true)).toBeNull();
    expect(duracaoComPausa(null, false)).toBeNull();
    expect(duracaoComPausa(DURACAO_PARA_DITAR, false)).toBe(DURACAO_PARA_DITAR);
  });

  it("o componente liga a pausa ao ponteiro E ao teclado", () => {
    /*
      Ligar só no ponteiro faria a pausa ser um favor a quem usa mouse. Quem
      navega por teclado chega ao botão Fechar por dentro do aviso, e é o par
      `onFocus`/`onBlur` (que sobem no React) que segura o relógio para essa
      pessoa.
    */
    expect(FONTE).toContain("onPointerEnter={() => setInteragindo(true)}");
    expect(FONTE).toContain("onPointerLeave={() => setInteragindo(false)}");
    expect(FONTE).toContain("onFocus={() => setInteragindo(true)}");
    expect(FONTE).toContain("onBlur={() => setInteragindo(false)}");
  });

  it("o tempo de ditar um número é bem maior que o de ler uma frase", () => {
    // Não é ajuste fino: ditar "000123/2026" dígito por dígito e esperar a
    // repetição de quem está na linha não cabe no relógio de ler.
    expect(DURACAO_PARA_DITAR).toBeGreaterThanOrEqual(DURACAO_PADRAO * 2);
  });
});

describe("O aviso do registro de ocorrência", () => {
  const RAIZ_PAGINAS = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "paginas");
  const DETALHE = readFileSync(join(RAIZ_PAGINAS, "Ocorrencia.tsx"), "utf8");

  it("entrega o protocolo separado do texto", () => {
    /*
      O número é ditado por telefone e copiado. Numa frase pronta, a tela não
      tem como desenhar só ele na fonte tabular, e o protocolo sai no mesmo
      tipo do corpo, onde o zero se parece com a letra e cada dígito tem uma
      largura. Por isso o aviso vem partido: o pedaço do meio é o número.
    */
    const aviso = avisoDoRegistro({ protocolo: "000123/2026", papel: "coordenador" });
    expect(aviso.protocolo, "o protocolo não vem isolado").toBe("000123/2026");
    expect(aviso.antes, "o texto de antes invadiu o número").not.toContain("000123");
    expect(aviso.depois, "o texto de depois invadiu o número").not.toContain("000123");
    expect(`${aviso.antes}${aviso.protocolo}${aviso.depois}`)
      .toBe("Ocorrência registrada com o protocolo 000123/2026. "
        + "Próximo passo: classificar na triagem, "
        + "que é o que define a severidade e o prazo.");
  });

  it("a tela desenha o número na fonte tabular do design system", () => {
    // `.mono` é `--ds-font-mono` com `tabular-nums`. Sem isto, o pedaço
    // isolado não serve para nada.
    expect(
      DETALHE,
      "o protocolo do aviso não sai na fonte tabular",
    ).toContain('<span className="mono">{registro.protocolo}</span>');
  });

  it("a tela dá ao aviso o relógio de ditar, e não o de ler", () => {
    expect(
      DETALHE,
      "o aviso do registro some no relógio padrão, antes de o número ser passado adiante",
    ).toContain("duracao={DURACAO_PARA_DITAR}");
  });

  it("o próximo passo é o do estado em que a ocorrência nasce", () => {
    /*
      Âncora na máquina de estados, e não na memória de quem escreveu a frase.

      A ocorrência nasce em `STATUS_INICIAL`, e a única saída dali que não é o
      fim do caso é a triagem: quem age em seguida é quem classifica, não quem
      despacha. No dia em que o fluxo mudar, a frase passaria a mandar a
      pessoa para um passo que não existe mais, e este teste é o que avisa.
    */
    expect(STATUS_INICIAL).toBe("registrada");
    const seguintes = TRANSICOES_PERMITIDAS[STATUS_INICIAL].filter((s) => !estadoTerminal(s));
    expect(seguintes).toEqual(["triagem"]);

    const aviso = avisoDoRegistro({ protocolo: "000123/2026", papel: "coordenador" });
    expect(aviso.depois).toMatch(/pr[óo]ximo passo/i);
    expect(aviso.depois).toMatch(/triagem/i);
    expect(aviso.depois, "quem despacha não é o próximo a agir").not.toMatch(/despach/i);

    // Quem não classifica não pode ser mandado classificar: o servidor
    // recusa, e a frase viraria uma instrução para levar 403.
    expect(avisoDoRegistro({ protocolo: "000123/2026", papel: "operador" }).depois)
      .toMatch(/coordena[çc][ãa]o/i);
  });
});
