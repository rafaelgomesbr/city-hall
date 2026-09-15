import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GRADE_DO_GLIFO, ROTULO_SEVERIDADE, SEVERIDADES, TRACO_DO_GLIFO, VIEWBOX_DO_GLIFO,
  glifoDeSeveridade,
} from "@dc360/shared";
import { SeloSeveridade } from "../src/componentes/comuns";
import { FormaSeveridade } from "../src/componentes/Icones";
import { CENTRO_DO_GLIFO, caminhoDaSeveridade } from "../src/paginas/mapa-de-base";

/**
 * O painel desenha a severidade a partir do pacote compartilhado, e de mais
 * lugar nenhum.
 *
 * Antes deste arquivo, o selo era um PONTO colorido ao lado da palavra (só
 * cor, contra a regra da casa), e o mapa usava círculo, triângulo, quadrado
 * e losango numa ordem que não era a do aplicativo. Quem paga viu os dois
 * canais lado a lado e pediu o mesmo ícone nos dois. O que se mede aqui é o
 * lado do painel: pílula, pino do plano esquemático e símbolo do marcador do
 * Google, todos lendo o MESMO glifo de `@dc360/shared`.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const NIVEIS = [...SEVERIDADES, null] as const;

/** Os `d` de todo `<path>` do trecho, na ordem em que aparecem. */
function caminhos(html: string): string[] {
  return [...html.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);
}

describe("o selo de severidade desenha o glifo compartilhado, e não um ponto", () => {
  it.each(NIVEIS)("%s: contorno e marca vêm do pacote, em traço na cor do selo", (nivel) => {
    const html = renderToStaticMarkup(h(SeloSeveridade, { severidade: nivel }));
    const glifo = glifoDeSeveridade(nivel);

    expect(html).toContain(`viewBox="${VIEWBOX_DO_GLIFO}"`);
    expect(caminhos(html)).toEqual([glifo.contorno, ...glifo.marca]);
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain(`stroke-width="${TRACO_DO_GLIFO}"`);
    // Traço, nunca mancha: é o mesmo desenho da pílula do aplicativo.
    expect(html).not.toMatch(/fill="(?!none)/);
  });

  it("o ponto colorido saiu: ele comunicava só por cor", () => {
    for (const nivel of NIVEIS) {
      expect(renderToStaticMarkup(h(SeloSeveridade, { severidade: nivel }))).not.toContain("selo__ponto");
    }
  });

  it("a palavra continua vindo do vocabulário compartilhado, e o desenho é decorativo", () => {
    for (const severidade of SEVERIDADES) {
      const html = renderToStaticMarkup(h(SeloSeveridade, { severidade }));
      expect(html).toContain(ROTULO_SEVERIDADE[severidade]);
      expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    }
    expect(renderToStaticMarkup(h(SeloSeveridade, { severidade: null }))).toContain("Sem classificação");
  });
});

describe("o pino do mapa é o mesmo glifo do selo, cheio", () => {
  it.each(SEVERIDADES)("%s: o contorno vira mancha na cor do pino e a marca vai por cima", (severidade) => {
    const html = renderToStaticMarkup(h(FormaSeveridade, { severidade }));
    const glifo = glifoDeSeveridade(severidade);

    expect(html).toContain(`viewBox="${VIEWBOX_DO_GLIFO}"`);
    expect(caminhos(html)).toEqual([glifo.contorno, ...glifo.marca]);
    expect(html).toMatch(new RegExp(`<path[^>]*d="${glifo.contorno.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*fill="currentColor"`));
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("sem classificação fica vazado: um círculo cinza cheio pareceria mais um degrau da escala", () => {
    const html = renderToStaticMarkup(h(FormaSeveridade, { severidade: null }));
    expect(caminhos(html)).toEqual([glifoDeSeveridade(null).contorno]);
    expect(html).not.toContain('fill="currentColor"');
  });

  it("obedece ao tamanho pedido e cai em 16 sem pedido", () => {
    expect(renderToStaticMarkup(h(FormaSeveridade, { severidade: "alta", tamanho: 14 })))
      .toMatch(/<svg[^>]*width="14"[^>]*height="14"/);
    expect(renderToStaticMarkup(h(FormaSeveridade, { severidade: "alta" })))
      .toMatch(/<svg[^>]*width="16"[^>]*height="16"/);
  });
});

describe("o marcador do Google desenha o mesmo glifo", () => {
  it.each(NIVEIS)("%s: o símbolo é contorno mais marca do pacote, ancorado no centro da grade", (nivel) => {
    const glifo = glifoDeSeveridade(nivel);
    expect(caminhoDaSeveridade(nivel)).toBe([glifo.contorno, ...glifo.marca].join(" "));
    expect(CENTRO_DO_GLIFO).toBe(GRADE_DO_GLIFO / 2);
  });

  it("o arquivo do Google ancora no centro e só preenche o que o glifo manda preencher", () => {
    const google = readFileSync(join(RAIZ, "paginas", "MapaDoGoogle.tsx"), "utf8");
    expect(google).toContain("caminhoDaSeveridade(");
    expect(google).toMatch(/anchor:\s*new api\.Point\(CENTRO_DO_GLIFO,\s*CENTRO_DO_GLIFO\)/);
    expect(google).toMatch(/fillOpacity:\s*glifoDeSeveridade\(ponto\.severidade\)\.preenche \? 1 : 0/);
  });
});

describe("o estilo acompanha", () => {
  const css = readFileSync(join(RAIZ, "estilos", "app.css"), "utf8");

  it("a pulsação da crítica passou do ponto para o glifo", () => {
    expect(css).toMatch(/\.selo--critica \.selo__glifo\s*\{[^}]*animation:/);
    expect(css).not.toMatch(/\.selo--critica \.selo__ponto/);
  });

  it("o glifo no selo tem tamanho de linha de legenda, e não estica a pílula", () => {
    expect(css).toMatch(/\.selo__glifo\s*\{[^}]*flex:\s*none/);
  });
});
