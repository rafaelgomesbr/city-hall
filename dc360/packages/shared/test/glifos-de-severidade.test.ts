import { describe, expect, it } from "vitest";
import {
  GLIFOS_DE_SEVERIDADE, GRADE_DO_GLIFO, SEVERIDADES, TRACO_DO_GLIFO, VIEWBOX_DO_GLIFO,
  glifoDeSeveridade, type GlifoDeSeveridade,
} from "../src/index.js";

/**
 * O desenho da severidade, numa fonte só.
 *
 * O defeito que este arquivo fecha: o painel e o aplicativo desenhavam a
 * gravidade com formas diferentes (ponto colorido numa pílula e círculo,
 * triângulo, quadrado e losango no mapa do painel; um medidor igual para os
 * quatro níveis e triângulo, losango, quadrado, círculo e anel no mapa do
 * aplicativo). Quem paga viu os dois lado a lado e pediu o mesmo ícone nos
 * dois canais. A resposta certa não é copiar o caminho de um lado para o
 * outro, é ter UM lugar de onde os dois leem, e é este pacote.
 *
 * O que se mede aqui é o dado: cinco glifos, na grade de 24 dos ícones do
 * aplicativo, com caminhos válidos e formas que não se confundem. Quem prova
 * que cada canal DESENHA a partir daqui é o portão de paridade em
 * `scripts/paridade-de-severidade.test.mjs`.
 */

const NIVEIS = [...SEVERIDADES, null] as const;

/** Os comandos de caminho SVG que um glifo pode usar, e nada além deles. */
const COMANDO = /[MLHVAZmlhvaz]/;

/**
 * Lê um `d` como a lista de números que ele carrega, reprovando qualquer
 * coisa que não seja comando ou número. É o bastante para pegar o erro de
 * digitação clássico (vírgula solta, letra trocada) sem reimplementar um
 * rasterizador.
 */
function numerosDoCaminho(d: string): number[] {
  const restos = d.replace(/[MLHVAZmlhvaz]/g, " ").trim();
  expect(d.trim().length, "caminho vazio").toBeGreaterThan(0);
  expect(COMANDO.test(d[0]!), `caminho não começa com comando: ${d}`).toBe(true);
  const numeros = restos.split(/[\s,]+/).filter(Boolean).map((token) => {
    // "-3.4-2" é uma sequência legítima em SVG; separe pelo sinal também.
    return token;
  });
  const soltos: number[] = [];
  for (const token of numeros) {
    for (const parte of token.match(/-?\d*\.?\d+/g) ?? []) soltos.push(Number(parte));
    expect(token.replace(/-?\d*\.?\d+/g, ""), `lixo no caminho: ${token}`).toBe("");
  }
  return soltos;
}

describe("os cinco glifos existem, na grade dos ícones do aplicativo", () => {
  it("há um glifo por severidade e um para sem classificação, e nenhum a mais", () => {
    expect(Object.keys(GLIFOS_DE_SEVERIDADE).sort()).toEqual(
      [...SEVERIDADES, "sem_classificacao"].sort(),
    );
  });

  it("a grade é 24 e o traço 1,8, os mesmos dos 24 ícones do aplicativo", () => {
    expect(GRADE_DO_GLIFO).toBe(24);
    expect(VIEWBOX_DO_GLIFO).toBe("0 0 24 24");
    expect(TRACO_DO_GLIFO).toBe(1.8);
  });

  it("`glifoDeSeveridade` responde por nível e por `null`", () => {
    for (const severidade of SEVERIDADES) {
      expect(glifoDeSeveridade(severidade)).toBe(GLIFOS_DE_SEVERIDADE[severidade]);
    }
    expect(glifoDeSeveridade(null)).toBe(GLIFOS_DE_SEVERIDADE.sem_classificacao);
  });
});

describe("cada caminho é válido e cabe na grade", () => {
  it.each(NIVEIS)("%s: contorno e marca só usam comandos conhecidos e ficam dentro de 0..24", (nivel) => {
    const glifo = glifoDeSeveridade(nivel);
    for (const d of [glifo.contorno, ...glifo.marca]) {
      const numeros = numerosDoCaminho(d);
      expect(numeros.length).toBeGreaterThan(0);
      /*
        Coordenada absoluta fora da grade sai cortada no aparelho. As relativas
        (letra minúscula) são deslocamentos e podem ser negativas; o teto de 24
        vale para qualquer número, porque nenhum deslocamento legítimo cruza a
        grade inteira.
      */
      for (const n of numeros) {
        expect(Math.abs(n), `número fora da grade em ${d}`).toBeLessThanOrEqual(GRADE_DO_GLIFO);
      }
    }
  });

  it("o contorno dos quatro níveis é fechado; o de sem classificação é tracejado, e por isso aberto", () => {
    for (const severidade of SEVERIDADES) {
      expect(glifoDeSeveridade(severidade).contorno.trim().endsWith("Z")).toBe(true);
    }
    const sem = glifoDeSeveridade(null);
    expect(sem.contorno).not.toMatch(/Z/i);
    // Tracejado desenhado com arcos separados, e não com `stroke-dasharray`:
    // o marcador do Google não entende dasharray, e o pino tem de ser o mesmo.
    expect(sem.contorno.split(/(?=M)/).length).toBeGreaterThanOrEqual(3);
  });
});

describe("as formas não se confundem, mesmo sem cor", () => {
  it("cinco silhuetas, cinco nomes diferentes", () => {
    const silhuetas = NIVEIS.map((n) => glifoDeSeveridade(n).silhueta);
    expect(new Set(silhuetas).size).toBe(NIVEIS.length);
  });

  it("cinco contornos, todos com geometria diferente", () => {
    const contornos = NIVEIS.map((n) => glifoDeSeveridade(n).contorno);
    expect(new Set(contornos).size).toBe(NIVEIS.length);
  });

  it("os quatro níveis têm marca interna, e nenhuma marca é igual à de outro nível", () => {
    const marcas = SEVERIDADES.map((s) => JSON.stringify(glifoDeSeveridade(s).marca));
    for (const marca of marcas) expect(marca).not.toBe("[]");
    expect(new Set(marcas).size).toBe(SEVERIDADES.length);
  });

  /*
    A escala sobe: a marca de dentro vai de um ponto (baixa) a um traço
    (média) e à exclamação (alta e crítica), e a silhueta vai do círculo ao
    octógono. Aqui se trava a metade que dá para contar: a quantidade de
    traços da marca nunca diminui ao subir na escala.
  */
  it("a quantidade de traços da marca não cai ao subir na escala", () => {
    const contagens = SEVERIDADES.map((s) => glifoDeSeveridade(s).marca.length);
    for (let i = 1; i < contagens.length; i++) {
      expect(contagens[i]).toBeGreaterThanOrEqual(contagens[i - 1]!);
    }
    expect(glifoDeSeveridade(null).marca).toEqual([]);
  });

  it("os quatro níveis viram pino cheio; sem classificação fica vazado", () => {
    for (const severidade of SEVERIDADES) expect(glifoDeSeveridade(severidade).preenche).toBe(true);
    expect(glifoDeSeveridade(null).preenche).toBe(false);
  });

  it("as silhuetas são as combinadas: círculo, quadrado, triângulo, octógono e círculo tracejado", () => {
    const esperado: Record<string, GlifoDeSeveridade["silhueta"]> = {
      baixa: "circulo",
      media: "quadrado",
      alta: "triangulo",
      critica: "octogono",
      sem_classificacao: "circulo_tracejado",
    };
    for (const [chave, silhueta] of Object.entries(esperado)) {
      expect(GLIFOS_DE_SEVERIDADE[chave as keyof typeof GLIFOS_DE_SEVERIDADE].silhueta).toBe(silhueta);
    }
  });
});
