import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { lerFonte } from "./ler-fonte";

/**
 * V2-F00-E09, correção 2: os dois defeitos de Minha conta que a validação da
 * rodada 2 reprovou, travados pela fonte.
 *
 * O que só o navegador prova (o retângulo do botão a 320 px e o foco real
 * depois de encerrar) está em `layout-estreito.e2e.mjs`, seções 5 e 7. Aqui fica
 * a metade barata, que roda em toda `npm test`: a decisão está escrita no lugar
 * certo, e quem a apagar reprova antes de chegar ao navegador.
 */

const PAINEL = new URL("..", import.meta.url);
const ler = (relativo: string) => lerFonte(new URL(relativo, PAINEL).pathname.replace(/^\/(\w:)/, "$1"));

/** O corpo da regra de CSS cujo seletor contém \`seletor\`, sem comentários. */
function regraDoCss(css: string, seletor: string): string {
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = semComentarios.match(new RegExp(`(^|\\n)[^{}]*${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{}]*\\{([^}]*)\\}`));
  if (!m) throw new Error(`regra ${seletor} não encontrada`);
  return m[2];
}

describe("O botão de Minha conta não passa da coluna em tela estreita", () => {
  const css = ler("src/estilos/app.css");
  const conta = ler("src/paginas/MinhaConta.tsx");

  it("existe um modificador que deixa o rótulo quebrar em linhas e limita o botão à coluna", () => {
    const regra = regraDoCss(css, ".botao--quebra");
    expect(regra).toContain("white-space: normal");
    expect(regra).toContain("max-width: 100%");
    expect(regra).toContain("height: auto");
  });

  it("até 600 px o botão com o modificador ocupa a largura da coluna", () => {
    const miolo = css.slice(css.indexOf("@media (max-width: 600px)", css.indexOf(".botao--quebra")));
    expect(miolo.slice(0, 400)).toMatch(/\.botao--quebra\s*\{\s*width:\s*100%/);
  });

  it("o botão 'Encerrar minhas outras sessões' usa o modificador", () => {
    expect(conta).toMatch(/className="botao botao--perigo botao--quebra"/);
  });

  it("o modificador só usa tokens do design system: nenhum número solto de espaço, cor ou duração", () => {
    const regra = regraDoCss(css, ".botao--quebra");
    expect(regra).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(regra).not.toMatch(/\b\d+(\.\d+)?(ms|s)\b/);
    expect(regra).not.toMatch(/padding[^;]*\b[1-9]\d*px/);
  });
});

describe("Depois de encerrar as outras sessões o foco não cai em BODY (WCAG 2.4.3)", () => {
  const conta = ler("src/paginas/MinhaConta.tsx");

  it("a confirmação é um elemento focável por código (tabIndex -1) que a tela guarda por ref", () => {
    expect(conta).toMatch(/const confirmacao = useRef<HTMLDivElement>\(null\)/);
    expect(conta).toMatch(/<div ref=\{confirmacao\} tabIndex=\{-1\}>/);
  });

  it("um efeito sobre \`sucesso\` leva o foco para a confirmação, e não uma chamada solta no envio", () => {
    expect(conta).toMatch(/useEffect\(\(\) => \{\s*if \(sucesso\) confirmacao\.current\?\.focus\(\);\s*\}, \[sucesso\]\);/);
  });
});
