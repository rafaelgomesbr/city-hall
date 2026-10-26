import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { BarraDoCelular, type DestinoDaBarra } from "../src/componentes/BarraDoCelular";
import {
  CONSULTAS_DA_BARRA, decidirTeclaDoMenu, ehDaRota, quantosNaBarra, repartirNavegacao,
} from "../src/componentes/navegacao-mais";

/**
 * O menu "Mais" da barra do celular (H08, decisão do Rafael em 2026-10-26),
 * provado sem navegador.
 *
 * A barra de onze destinos rolava na horizontal no celular e escondia o que a
 * pessoa não sabia que existia. Agora a barra mostra os destinos principais
 * que cabem inteiros e o resto vai para um menu. O que se prova aqui é o que
 * dá para provar em Node: as decisões (quem fica na barra, quem vai para o
 * menu, quando a tela atual está dentro dele, o que o Esc faz) e a amarração
 * de acessibilidade da marcação (`aria-expanded`, `aria-controls`, grupos com
 * nome, o texto escondido). O foco, o Esc de verdade, o clique fora e os 44 px
 * são medidos no navegador, em `layout-estreito.e2e.mjs` (seção 3b).
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const lerFonte = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf8");

type Item = DestinoDaBarra & { principal?: boolean };
const item = (para: string, rotulo: string, grupo: string, principal = false): Item =>
  ({ para, rotulo, grupo, icone: null, principal });

/** Os destinos do coordenador, na ordem de `Estrutura.tsx`. */
const COORDENADOR: Item[] = [
  item("/painel", "Painel", "Operação", true),
  item("/ocorrencias", "Ocorrências", "Operação", true),
  item("/mapa", "Mapa da cidade", "Operação", true),
  item("/quem-esta-em-campo", "Quem está em campo", "Operação", true),
  item("/equipes", "Equipes", "Administração"),
  item("/orgaos", "Órgãos de destino", "Administração"),
  item("/usuarios", "Usuários", "Administração"),
  item("/auditoria", "Prestação de contas", "Administração"),
  item("/organizacao", "Organização", "Administração"),
];

/** O agente de campo só tem duas telas, as duas principais. */
const AGENTE: Item[] = [
  item("/meu-trabalho", "Meu trabalho", "Operação", true),
  item("/mapa", "Mapa da cidade", "Operação", true),
];

function marcacao(aberto: boolean, naBarra: number, itens: Item[], tema: "claro" | "escuro" = "claro", caminho = "/painel") {
  const { naBarra: barra, noMais } = repartirNavegacao(itens, naBarra);
  return renderToStaticMarkup(
    h(MemoryRouter, { initialEntries: [caminho] },
      h(BarraDoCelular, {
        naBarra: barra, noMais, aberto, menuId: "menu-teste",
        maisTemATela: noMais.some((i) => ehDaRota(caminho, i.para)), tema,
        aoAlternarMenu: () => {}, aoEscolher: () => {}, aoAlternarTema: () => {}, aoSair: () => {},
      })),
  );
}

describe("Quantos destinos cabem na barra", () => {
  const casando = (consultas: string[]) => (c: string) => consultas.includes(c);

  it("em tela de mesa a lateral fica como sempre, sem menu (zero)", () => {
    expect(quantosNaBarra(casando([]))).toBe(0);
  });

  it("quanto mais estreita a tela, menos destinos na barra, e vale a primeira consulta que casa", () => {
    // Uma tela de 320 px casa as TRÊS consultas (max-width é cumulativo): tem de valer a mais estreita.
    const todas = CONSULTAS_DA_BARRA.map((c) => c.consulta);
    expect(quantosNaBarra(casando(todas))).toBe(2);
    expect(quantosNaBarra(casando(todas.slice(1)))).toBe(3);
    expect(quantosNaBarra(casando(todas.slice(2)))).toBe(5);
  });

  it("com o botão Mais, os ladrilhos são os mesmos 3, 4 e 6 que a folha desenha", () => {
    const css = lerFonte("estilos", "app.css");
    const visiveis = [...css.matchAll(/--barra-visiveis:\s*(\d+)/g)].map((m) => Number(m[1]));
    // A folha lista do mais largo (900) ao mais estreito: 6, 4 e 3.
    expect(visiveis).toEqual(CONSULTAS_DA_BARRA.map((c) => c.naBarra + 1).reverse());
  });

  it("as consultas da barra são as mesmas larguras da folha", () => {
    const css = lerFonte("estilos", "app.css");
    for (const { consulta } of CONSULTAS_DA_BARRA) {
      expect(css, `a folha não tem a consulta ${consulta}`).toContain(`@media ${consulta}`);
    }
  });
});

describe("Quem fica na barra e quem vai para o menu", () => {
  it("nenhum destino se perde: barra mais menu é a lista inteira, na mesma ordem", () => {
    for (const quantos of [0, 1, 2, 3, 4, 5, 9]) {
      const { naBarra, noMais } = repartirNavegacao(COORDENADOR, quantos);
      const paras = [...naBarra, ...noMais].map((i) => i.para).sort();
      expect(paras, `com ${quantos} na barra`).toEqual(COORDENADOR.map((i) => i.para).sort());
      expect(naBarra.map((i) => i.para)).toEqual(
        COORDENADOR.filter((i) => naBarra.includes(i)).map((i) => i.para),
      );
    }
  });

  it("a barra nunca passa do que cabe, e só leva destino principal", () => {
    for (const quantos of [2, 3, 5]) {
      const { naBarra } = repartirNavegacao(COORDENADOR, quantos);
      expect(naBarra.length).toBeLessThanOrEqual(quantos);
      expect(naBarra.every((i) => i.principal)).toBe(true);
    }
  });

  it("a 320 px a barra leva Painel e Ocorrências, e o mapa vai para o menu", () => {
    const { naBarra, noMais } = repartirNavegacao(COORDENADOR, 2);
    expect(naBarra.map((i) => i.rotulo)).toEqual(["Painel", "Ocorrências"]);
    expect(noMais.map((i) => i.rotulo)).toContain("Mapa da cidade");
  });

  it("a 390 px a barra leva os três mais usados, e Usuários e Organização vão para o menu", () => {
    const { naBarra, noMais } = repartirNavegacao(COORDENADOR, 3);
    expect(naBarra.map((i) => i.rotulo)).toEqual(["Painel", "Ocorrências", "Mapa da cidade"]);
    expect(noMais.map((i) => i.rotulo)).toEqual(expect.arrayContaining(["Usuários", "Organização"]));
  });

  it("o agente de campo não perde nenhuma das duas telas dele para o menu", () => {
    const { naBarra, noMais } = repartirNavegacao(AGENTE, 2);
    expect(naBarra.map((i) => i.rotulo)).toEqual(["Meu trabalho", "Mapa da cidade"]);
    expect(noMais).toEqual([]);
  });

  it("os principais da navegação real são os que o código declara (Painel, Ocorrências, Mapa, Quem está em campo, Meu trabalho)", () => {
    const estrutura = lerFonte("componentes", "Estrutura.tsx");
    const principais = [...estrutura.matchAll(/para: "([^"]+)", rotulo: "([^"]+)"[\s\S]*?(?=\n  \{ para:|\n\];)/g)]
      .filter((m) => /principal: true/.test(m[0]))
      .map((m) => m[2]);
    expect(principais).toEqual(["Meu trabalho", "Painel", "Ocorrências", "Mapa da cidade", "Quem está em campo"]);
  });
});

describe("A tela atual dentro do menu", () => {
  it("o caminho exato e os filhos dele contam, o vizinho de prefixo parecido não", () => {
    expect(ehDaRota("/usuarios", "/usuarios")).toBe(true);
    expect(ehDaRota("/ocorrencias/abc", "/ocorrencias")).toBe(true);
    expect(ehDaRota("/ocorrencias-antigas", "/ocorrencias")).toBe(false);
    expect(ehDaRota("/painel", "/usuarios")).toBe(false);
  });

  it("com a tela atual no menu, o botão Mais leva a marca e o texto escondido que diz isso", () => {
    const html = marcacao(false, 3, COORDENADOR, "claro", "/usuarios");
    expect(html).toContain("lateral__mais--atual");
    expect(html).toContain("oculto-visualmente");
    expect(html).toContain(", inclui a tela atual");
  });

  it("com a tela atual na barra, o botão Mais não leva marca nem texto escondido", () => {
    const html = marcacao(false, 3, COORDENADOR, "claro", "/painel");
    expect(html).not.toContain("lateral__mais--atual");
    expect(html).not.toContain("inclui a tela atual");
  });
});

describe("A marcação da barra e do menu", () => {
  it("fechado: o botão diz aria-expanded=false, não aponta para um menu que não existe e não há menu", () => {
    const html = marcacao(false, 3, COORDENADOR);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    expect(html).not.toContain("aria-controls");
    expect(html).not.toContain("lateral__menu");
    expect(html).not.toContain("Usuários");
  });

  it("aberto: o botão diz aria-expanded=true e controla o menu pelo id, que existe", () => {
    const html = marcacao(true, 3, COORDENADOR);
    expect(html).toMatch(/<button[^>]*aria-expanded="true"[^>]*aria-controls="menu-teste"/);
    expect(html).toContain('id="menu-teste"');
  });

  it("o botão Mais é o último ladrilho da barra, antes do menu", () => {
    const html = marcacao(true, 3, COORDENADOR);
    expect(html.indexOf("Mapa da cidade")).toBeLessThan(html.indexOf(">Mais<"));
    expect(html.indexOf(">Mais<")).toBeLessThan(html.indexOf('id="menu-teste"'));
  });

  it("aberto: cada destino que saiu da barra está no menu, uma vez só, e os da barra não se repetem nele", () => {
    const html = marcacao(true, 2, COORDENADOR);
    const menu = html.slice(html.indexOf('id="menu-teste"'));
    for (const rotulo of ["Mapa da cidade", "Quem está em campo", "Equipes", "Órgãos de destino", "Usuários", "Prestação de contas", "Organização"]) {
      expect(menu.split(`<span>${rotulo}</span>`).length - 1, `${rotulo} no menu`).toBe(1);
    }
    expect(menu).not.toContain("<span>Painel</span>");
    expect(menu).not.toContain("<span>Ocorrências</span>");
  });

  it("aberto: Tema e Sair moram no menu, e o tema oferece o que ainda não está ligado", () => {
    expect(marcacao(true, 3, COORDENADOR, "claro")).toContain("<span>Tema escuro</span>");
    expect(marcacao(true, 3, COORDENADOR, "escuro")).toContain("<span>Tema claro</span>");
    const html = marcacao(true, 3, COORDENADOR);
    expect(html).toContain("<span>Sair</span>");
    // Fora do menu, a barra só tem destinos e o Mais: o Sair nunca é um ladrilho solto.
    expect(html.slice(0, html.indexOf('id="menu-teste"'))).not.toContain("Sair");
  });

  it("aberto: os grupos têm nome para o leitor de tela e o destino atual do menu leva aria-current", () => {
    const html = marcacao(true, 3, COORDENADOR, "claro", "/usuarios");
    expect(html).toContain('role="group" aria-label="Administração"');
    expect(html).toContain('role="group" aria-label="Sistema"');
    expect(html).toMatch(/<a aria-current="page" class="lateral__menu-item active" href="\/usuarios"/);
  });

  it("o agente, que não precisa de menu para destino, ainda tem o Mais para o Tema e o Sair", () => {
    const html = marcacao(true, 2, AGENTE);
    expect(html).toContain("<span>Tema escuro</span>");
    expect(html).toContain("<span>Sair</span>");
    expect(html).not.toContain("Administração");
  });
});

describe("O teclado no menu", () => {
  it("o Esc fecha, e nenhuma outra tecla mexe no menu (o Tab segue o caminho natural, sem armadilha)", () => {
    expect(decidirTeclaDoMenu("Escape")).toBe("fechar");
    for (const tecla of ["Tab", "Enter", " ", "ArrowDown", "a"]) {
      expect(decidirTeclaDoMenu(tecla), tecla).toBe("seguir");
    }
  });

  it("a Estrutura liga o menu ao teclado, ao clique fora e ao foco que sai, e devolve o foco só no Esc", () => {
    const fonte = lerFonte("componentes", "Estrutura.tsx");
    expect(fonte).toContain('document.addEventListener("keydown", aoTeclar)');
    expect(fonte).toContain('document.addEventListener("pointerdown", aoMexerFora)');
    expect(fonte).toContain('document.addEventListener("focusin", aoMexerFora)');
    expect(fonte).toContain("fecharMais(true)");
    expect(fonte).toContain("fecharMais(false)");
    // Os três ouvintes saem junto com o menu: ouvinte esquecido no documento vira vazamento.
    expect(fonte).toContain('document.removeEventListener("keydown", aoTeclar)');
    expect(fonte).toContain('document.removeEventListener("pointerdown", aoMexerFora)');
    expect(fonte).toContain('document.removeEventListener("focusin", aoMexerFora)');
    // Ao abrir, o foco entra no menu; o aviso passageiro espera enquanto ele está aberto.
    expect(fonte).toContain('menuRef.current?.querySelector<HTMLElement>("a, button")?.focus()');
    expect(fonte).toContain("registrarModalAberto()");
    // Trocar de tela fecha o menu.
    expect(fonte).toMatch(/useEffect\(\(\) => \{ setMaisAberto\(false\); \}, \[pathname\]\)/);
    // Passar para a tela de mesa zera o estado: na volta ao celular o menu começa fechado.
    expect(fonte).toMatch(/useEffect\(\(\) => \{ if \(naBarra === 0\) setMaisAberto\(false\); \}, \[naBarra\]\)/);
  });

  it("a lateral de mesa não tem menu: naBarra zero devolve a lista inteira em coluna", () => {
    const fonte = lerFonte("componentes", "Estrutura.tsx");
    expect(fonte).toContain("{naBarra === 0 ? (");
    const { naBarra, noMais } = repartirNavegacao(COORDENADOR, 0);
    expect(naBarra).toEqual([]);
    expect(noMais).toHaveLength(COORDENADOR.length);
  });
});

describe("A folha do menu usa só o design system", () => {
  const css = lerFonte("estilos", "app.css");
  const regras = [...css.matchAll(/\.lateral__(?:menu|mais)[\w-]*[^{]*\{[^}]*\}/g)].map((m) => m[0]);

  it("as regras do menu existem e a área de toque é a do token, não um número solto", () => {
    expect(regras.length).toBeGreaterThanOrEqual(6);
    const item = regras.find((r) => /^\.lateral__menu-item\s*\{/.test(r)) ?? "";
    expect(item).toMatch(/min-height:\s*var\(--ds-touch\)/);
  });

  it("nenhuma cor, sombra, raio ou espaço do menu é escrito à mão", () => {
    for (const regra of regras) {
      expect(regra, regra).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(regra, regra).not.toMatch(/\brgba?\(/);
      expect(regra, regra).not.toMatch(/\b(?:padding|margin|gap|border-radius|top|bottom|left|right)[a-z-]*:[^;]*\b\d+px/);
    }
  });

  it("a barra do celular não rola e o menu não é cortado por ela", () => {
    const celular = css.slice(css.indexOf("@media (max-width: 900px)"), css.indexOf("@media (max-height: 340px)"));
    expect(celular.match(/\.lateral\s*\{[^}]*\}/)?.[0] ?? "").not.toMatch(/overflow/);
    expect(celular).toMatch(/\.lateral__menu\s*\{[^}]*position:\s*fixed/);
    // Aberto, a barra sobe acima do topo, que também é fixo, abaixo da janela modal e do aviso.
    expect(celular).toMatch(/\.lateral--com-menu\s*\{\s*z-index:\s*var\(--ds-z-overlay\)/);
  });

  it("o Mais e o Tema ou Sair da lateral de mesa usam a classe nova, não o estilo escrito no elemento", () => {
    const estrutura = lerFonte("componentes", "Estrutura.tsx");
    expect(estrutura).not.toMatch(/style=\{\{ border: "none"/);
    expect(estrutura).toContain("lateral__item lateral__item--botao");
    expect(css).toMatch(/\.lateral__item--botao\s*\{[^}]*border:\s*none/);
  });
});
