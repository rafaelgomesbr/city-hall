import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { focarPrimeiroInvalido, SELETOR_MOLDURA, type NoFocavel } from "../src/componentes/foco";
import {
  barraPresaNoPe, deslocamentoParaAFaixa, focoDoPonteiro, folgaDaBorda, JANELA_DO_PONTEIRO_MS, topoPreso, VARIAVEL_PE, VARIAVEL_TOPO,
} from "../src/componentes/usar-bordas-fixas";
import { estadoDoEnvio, rotuloDasTentativas } from "../src/paginas/oficio-regras";
import { lerFonte } from "./ler-fonte";

/**
 * Os achados da rodada 7 da V2-F00-E09 (validador de UX, FAIL, sobre fd17ff4),
 * na parte que roda sem navegador. A prova no navegador, nos três motores, com
 * a matriz de larguras, alturas e o zoom de 200 por cento, está em
 * `test/layout-estreito.e2e.mjs`, seção 13. Aqui ficam as regras e as causas.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (...partes: string[]) => lerFonte(join(SRC, ...partes));
const css = () => fonte("estilos", "app.css");

/** O trecho da folha de um `@media` até o fechamento dele (o primeiro "}" na coluna zero). */
function blocoDaMidia(folha: string, inicio: string): string {
  const de = folha.indexOf(inicio);
  expect(de, `bloco "${inicio}" na folha`).toBeGreaterThanOrEqual(0);
  return folha.slice(de, folha.indexOf("\n}", de) + 2);
}

describe("Achados 1, 2 e 4: o foco leva à vista a moldura do campo, e não só o controle", () => {
  it("foca sem rolar, leva a moldura (rótulo, controle e erro) à vista e depois o controle, os dois com `nearest`", () => {
    const chamadas: string[] = [];
    const no: NoFocavel = {
      focus: (opcoes) => { chamadas.push(`focus ${JSON.stringify(opcoes)}`); },
      scrollIntoView: (opcoes) => { chamadas.push(`controle ${JSON.stringify(opcoes)}`); },
      closest: (seletor) => {
        chamadas.push(`closest ${seletor}`);
        return { scrollIntoView: (opcoes) => { chamadas.push(`moldura ${JSON.stringify(opcoes)}`); } };
      },
    };
    expect(focarPrimeiroInvalido({ querySelector: () => no })).toBe(true);
    expect(chamadas).toEqual([
      'focus {"preventScroll":true}',
      "closest .campo",
      'moldura {"block":"nearest"}',
      'controle {"block":"nearest"}',
    ]);
  });

  it("a moldura é a que o `Campo` desenha (o rótulo mora dentro dela)", () => {
    expect(SELETOR_MOLDURA).toBe(".campo");
    expect(fonte("componentes", "Campo.tsx")).toMatch(/<div className=\{`campo\$\{.*\}`\}>\s*<label htmlFor=\{id\}>/);
  });

  it("controle fora de moldura (sem `.campo` em volta) continua indo à vista sozinho", () => {
    const chamadas: string[] = [];
    const no: NoFocavel = {
      focus: () => { chamadas.push("focus"); },
      scrollIntoView: () => { chamadas.push("controle"); },
      closest: () => null,
    };
    expect(focarPrimeiroInvalido({ querySelector: () => no })).toBe(true);
    expect(chamadas).toEqual(["focus", "controle"]);
  });
});

describe("Achados 1 e 2: as folgas do topo e da barra do pé são medidas", () => {
  it("a folga é a altura medida arredondada para cima, mais um passo de respiro do design system", () => {
    expect(folgaDaBorda(81)).toBe("calc(81px + var(--ds-sp-3))");
    expect(folgaDaBorda(140.4)).toBe("calc(141px + var(--ds-sp-3))");
    expect(folgaDaBorda(0)).toBe("calc(0px + var(--ds-sp-3))");
    expect(folgaDaBorda(Number.NaN)).toBe("calc(0px + var(--ds-sp-3))");
    expect(folgaDaBorda(-5)).toBe("calc(0px + var(--ds-sp-3))");
  });

  it("a barra lateral só conta como borda do pé quando está presa embaixo (até 900 px)", () => {
    expect(barraPresaNoPe({ position: "sticky", bottom: "0px" })).toBe(true);
    expect(barraPresaNoPe({ position: "static", bottom: "auto" })).toBe(false);
    expect(barraPresaNoPe({ position: "sticky", bottom: "auto" })).toBe(false);
  });

  it("a Estrutura mede o topo e a barra que ela mesma desenha, e de novo quando a sessão aparece", () => {
    const estrutura = fonte("componentes", "Estrutura.tsx");
    expect(estrutura).toMatch(/useBordasFixas\(topoRef, barraRef, Boolean\(sessao\)\);/);
    expect(estrutura).toMatch(/<header className="topo" ref=\{topoRef\}>/);
    // O `className` ganhou a marca do menu "Mais" aberto (H05/H08, V2-F00-POS); o `aria-label` e o `ref` são os mesmos.
    expect(estrutura).toMatch(/<nav className=\{`lateral\$\{menuAberto \? " lateral--com-menu" : ""\}`\}\s+aria-label="Navegação principal" ref=\{barraRef\}>/);
    const hook = fonte("componentes", "usar-bordas-fixas.ts");
    expect(hook).toMatch(/new ResizeObserver\(medir\)/);
    expect(hook).toMatch(/window\.addEventListener\("resize", medir\)/);
    expect(hook).toMatch(/\}, \[topoRef, barraRef, desenhada\]\);/);
  });

  it("a folha usa as duas medidas no scroll-padding, e sem medida (tela pública, sem topo) a folga é só o respiro", () => {
    const folha = css();
    expect(VARIAVEL_TOPO).toBe("--topo-fixo-folga");
    expect(VARIAVEL_PE).toBe("--pe-fixo-folga");
    expect(folha).toMatch(/html \{\n  scroll-padding-top: var\(--topo-fixo-folga, var\(--ds-sp-3\)\);\n  scroll-padding-bottom: var\(--pe-fixo-folga, var\(--ds-sp-3\)\);\n\}/);
    // Nenhum scroll-padding de página escrito sem a medida, nem a estimativa de 140 px que valia na tela pública (achado 5 da acessibilidade).
    expect(folha.match(/scroll-padding-(?:top|bottom): (?!var\(--(?:topo|pe)-fixo-folga, var\(--ds-sp-3\)\))/g) ?? []).toEqual([]);
  });

  it("em janela muito baixa (zoom de 400 por cento, 320x256) o topo e a barra rolam com a página, e a medida os ignora", () => {
    // Correção 6b: a altura desceu de 360 para 340 px (o Android deitado, 640x360, mantém a navegação fixa).
    const baixa = blocoDaMidia(css(), "@media (max-height: 340px) {");
    expect(baixa).toMatch(/\.topo, \.lateral \{ position: static; \}/);
    expect(topoPreso({ position: "sticky" })).toBe(true);
    expect(topoPreso({ position: "static" })).toBe(false);
    expect(fonte("componentes", "usar-bordas-fixas.ts")).toMatch(/folgaDaBorda\(preso \? topo\.getBoundingClientRect\(\)\.height : 0\)/);
  });

  it("o Tab também respeita as bordas: o foco que cai no conteúdo é levado inteiro à faixa entre o topo e a barra do pé", () => {
    const faixa = { faixaDe: 129, faixaAte: 765, respiro: 12 };
    // Já inteiro na faixa: não mexe.
    expect(deslocamentoParaAFaixa({ ...faixa, topo: 300, altura: 44 })).toBe(0);
    // Sob a barra do pé: sobe até a barra, com o respiro.
    expect(deslocamentoParaAFaixa({ ...faixa, topo: 857, altura: 44 })).toBe(857 + 44 - (765 - 12));
    // Sob o topo: desce até o topo, com o respiro.
    expect(deslocamentoParaAFaixa({ ...faixa, topo: 100, altura: 44 })).toBe(100 - (129 + 12));
    const hook = fonte("componentes", "usar-bordas-fixas.ts");
    expect(hook).toMatch(/document\.addEventListener\("focusin", aoFocar\)/);
    expect(hook).toMatch(/if \(desvio !== 0\) window\.scrollBy\(0, desvio\);/);
    expect(hook).toMatch(/alvo\.closest\("\.topo, \.lateral, \.pular-para-conteudo, \[role=\\"dialog\\"\]"\) \|\| alvo\.id === "conteudo"/);
    expect(fonte("componentes", "Estrutura.tsx")).toMatch(/useFocoForaDasBordas\(Boolean\(sessao\)\);/);
  });

  it("a margem do rótulo vale em qualquer largura, e não só até 600 px", () => {
    const folha = css();
    const regra = ".campo input, .campo select, .campo textarea { scroll-margin-top: calc(var(--ds-sp-5) + var(--ds-sp-3)); }";
    expect(folha.split(regra).length - 1).toBe(1);
    const linha = folha.split("\n").find((l) => l.includes(regra));
    expect(linha?.startsWith(".campo")).toBe(true);
  });
});

describe("Correção 6b: o ajuste do Tab não espera o quadro seguinte", () => {
  it("roda na hora, dentro do focusin, numa tarefa logo depois e de novo no quadro seguinte (no WebKit do Linux o quadro chegava tarde)", () => {
    const hook = fonte("componentes", "usar-bordas-fixas.ts");
    const corpo = hook.slice(hook.indexOf("const aoFocar = (evento: FocusEvent) => {"), hook.indexOf('document.addEventListener("focusin", aoFocar);'));
    expect(corpo).toMatch(/\n\s+ajustar\(alvo\);\n\s+setTimeout\(\(\) => ajustar\(alvo\), 0\);\n\s+requestAnimationFrame\(\(\) => ajustar\(alvo\)\);/);
    // E cada passada confere que o foco ainda está no mesmo elemento antes de rolar.
    expect(hook).toMatch(/const ajustar = \(alvo: HTMLElement\) => \{\n\s+if \(document\.activeElement !== alvo\) return;/);
  });
});

describe("Correção 6b: o ajuste é do teclado, e não rola a página sob o clique", () => {
  it("o foco que chega logo depois de um toque ou clique não é ajustado (rolar no pointerdown perde o clique)", () => {
    expect(focoDoPonteiro(1000, null)).toBe(false);
    expect(focoDoPonteiro(1000, 900)).toBe(true);
    expect(focoDoPonteiro(1000 + JANELA_DO_PONTEIRO_MS, 1000)).toBe(false);
    const hook = fonte("componentes", "usar-bordas-fixas.ts");
    expect(hook).toMatch(/document\.addEventListener\("pointerdown", aoApontar, true\);/);
    expect(hook).toMatch(/if \(focoDoPonteiro\(performance\.now\(\), ultimoPonteiro\)\) return;\n\s+ajustar\(alvo\);/);
  });
});

describe("Correção 6b, revisão: a conta do Tab usa as bordas reais", () => {
  it("o que cabe na faixa real mas não na faixa com respiro vai inteiro, com o respiro que sobra (a caixa do painel a 390x400)", () => {
    // Faixa real de 192 px (129 a 321), caixa de 180 px: sobram 6 px de cada lado.
    expect(deslocamentoParaAFaixa({ topo: 147, altura: 180, faixaDe: 129, faixaAte: 321, respiro: 12 })).toBe(147 + 180 - (321 - 6));
    expect(deslocamentoParaAFaixa({ topo: 135, altura: 180, faixaDe: 129, faixaAte: 321, respiro: 12 })).toBe(0);
  });

  it("o que é mais alto que a faixa real vai com o começo ao começo da faixa (a caixa de Órgãos a 390x400)", () => {
    expect(deslocamentoParaAFaixa({ topo: 295, altura: 267, faixaDe: 129, faixaAte: 321, respiro: 12 })).toBe(295 - 129);
    expect(deslocamentoParaAFaixa({ topo: 129.4, altura: 267, faixaDe: 129, faixaAte: 321, respiro: 12 })).toBe(0);
  });
});

describe("Correção 6b, revisão: nada rola na horizontal a 320 px, e a tabela não estoura em tela larga", () => {
  it("o teto do email da tabela vale em qualquer largura, e não só até 1399 px", () => {
    const folha = css();
    expect(folha).toMatch(/^\.tabela__secundario--email \{ max-width: calc\(var\(--ds-sp-8\) \* 2\.2\); \}$/m);
    expect(folha).not.toMatch(/@media \(max-width: 1399px\) \{\n  \.tabela__secundario--email/);
  });

  it("a paginação e os controles dela quebram em linhas", () => {
    const folha = css();
    expect(folha).toMatch(/\.paginacao \{\n  display: flex; flex-wrap: wrap;/);
    expect(folha).toMatch(/\.paginacao__controles \{ display: flex; flex-wrap: wrap; gap: var\(--ds-sp-2\); \}/);
  });

  it("o texto de exemplo do filtro de Ocorrências é o curto, que cabe a 320 px", () => {
    const tela = fonte("paginas", "Ocorrencias.tsx");
    expect(tela).toMatch(/placeholder="Protocolo, endereço ou relato"/);
    expect(tela).not.toMatch(/solicitante ou relato/);
  });
});

describe("Achado 3: o email longo da tentativa de envio não sai do cartão", () => {
  it("a coluna do ofício e o texto da linha podem encolher abaixo da palavra mais longa", () => {
    const folha = css();
    expect(folha).toMatch(/\.oficio \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(folha).toMatch(/\.oficio__linha > span \{ min-width: 0; overflow-wrap: break-word; word-break: normal; \}/);
  });
});

describe("Achado 5: singular e plural certos no cartão do ofício", () => {
  it("o botão diz \"a tentativa\" com uma e \"as N tentativas\" com mais de uma, nos dois estados", () => {
    expect(rotuloDasTentativas(1, false)).toBe("Ver a tentativa");
    expect(rotuloDasTentativas(1, true)).toBe("Esconder a tentativa");
    expect(rotuloDasTentativas(2, false)).toBe("Ver as 2 tentativas");
    expect(rotuloDasTentativas(3, true)).toBe("Esconder as 3 tentativas");
  });

  it("a explicação concorda o verbo e o particípio com o número de tentativas", () => {
    const um = estadoDoEnvio({ envios: 1, ultimo_envio: null, aberto_em: null });
    const dois = estadoDoEnvio({ envios: 2, ultimo_envio: null, aberto_em: null });
    expect(um.explicacao.startsWith("A tentativa ficou registrada e o provedor de email não aceitou a mensagem.")).toBe(true);
    expect(dois.explicacao.startsWith("As 2 tentativas ficaram registradas e o provedor de email não aceitou a mensagem.")).toBe(true);
    expect(dois.explicacao).not.toMatch(/tentativas ficou registrada/);
  });

  it("a tela usa a regra e não monta mais o rótulo à mão", () => {
    const ocorrencia = fonte("paginas", "Ocorrencia.tsx");
    expect(ocorrencia).toMatch(/\{rotuloDasTentativas\(f\.envios, detalhe\?\.id === f\.id\)\}/);
    expect(ocorrencia).not.toMatch(/"Ver"\} as \{f\.envios\}/);
  });
});

describe("Achado 6: o texto de exemplo da busca cabe a 320 px", () => {
  it("até 600 px a dica do atalho sai da tela e o recuo da direita volta ao respiro comum", () => {
    const celular = blocoDaMidia(css(), "@media (max-width: 600px) {\n  .topo {");
    expect(celular).toMatch(/\.busca-global__atalho \{ display: none; \}/);
    expect(celular).toMatch(/\.busca-global__caixa #busca-global \{ padding-right: var\(--ds-sp-3\); \}/);
  });

  it("a dica continua ligada ao campo para quem ouve a tela", () => {
    const busca = fonte("componentes", "BuscaGlobal.tsx");
    expect(busca).toMatch(/aria-describedby=\{ID_ATALHO\}/);
    expect(busca).toMatch(/<kbd id=\{ID_ATALHO\} className="busca-global__atalho">/);
  });
});

describe("Achado 3 da acessibilidade: o link do topo para Minha conta tem nome em qualquer largura", () => {
  it("o nome dito começa pelo que se vê na largura de mesa (nome e papel) e termina no destino", () => {
    expect(fonte("componentes", "Estrutura.tsx")).toMatch(
      /<NavLink to="\/minha-conta" className="identidade identidade--acionavel"\s+aria-label=\{`\$\{sessao\.usuarioNome\}, \$\{ROTULO_PAPEL\[sessao\.papel\]\}, Minha conta`\}>/);
  });
});
