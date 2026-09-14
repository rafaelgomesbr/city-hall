import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * As regras de conteúdo do projeto, verificadas por máquina.
 *
 * `CLAUDE.md` fixa duas que não são estilo e sim risco:
 *
 * 1. **Nenhum travessão.** É preferência declarada do projeto para todo texto
 *    que sai daqui, e vale também para o que aparece na tela.
 * 2. **Nenhuma norma além das autorizadas, e nenhum artigo inventado.** Um
 *    número de lei errado num termo de interdição é motivo para anular o ato,
 *    e um artigo inventado num documento oficial é pior que nenhuma citação.
 *
 * Até aqui as duas dependiam de alguém lembrar. Este arquivo as transforma em
 * portão, e ele varre a superfície que o PRODUTO gera: o código do sistema,
 * o texto que ele imprime e o protótipo de demonstração.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PRODUTO = join(AQUI, "..", "..", "..");        // dc360/
const RAIZ_REPO = join(RAIZ_PRODUTO, "..");               // repositório

/**
 * Normas que `docs/CONTEXTO.md` autoriza citar. Qualquer outra num texto que
 * chega ao cidadão ou ao processo administrativo reprova.
 */
const NORMAS_AUTORIZADAS = new Set([
  "12.608/2012", // Política Nacional de Proteção e Defesa Civil
  "14.750/2023", // altera a 12.608
  "13.709/2018", // LGPD
  "14.133/2021", // licitações e contratos
  "182/2021",    // Marco Legal das Startups
  "14.129/2021", // Governo Digital
  "13.146/2015", // acessibilidade digital
]);

const CITACAO_DE_NORMA =
  /(?:Lei|Decreto|Portaria|Instru[çc][ãa]o\s+Normativa|Resolu[çc][ãa]o)[^,.;:<)\n]{0,60}?(\d[\d.]*\/\d{4})/g;

const TRAVESSAO = "—";

/*
  `Pods` entra na lista pela mesma razão de `node_modules`: é dependência de
  terceiro baixada, não texto que este produto escreve.

  Ela apareceu quando o aplicativo passou a depender de módulo nativo e alguém
  rodou `npx expo prebuild`: a pasta `apps/campo/ios/` inteira é gerada e está no
  `.gitignore`, e dentro dela o CocoaPods deixa o código-fonte das bibliotecas,
  com os `README.md` delas. A varredura passou a reprovar por um travessão no
  README do utilitário de mapas do Google.

  Esta regra governa o que o PRODUTO afirma, e não o que a dependência dele diz
  de si mesma, do mesmo jeito que `docs/referencia/` é isento por ser pesquisa.
  Apagar travessão dentro de `Pods` seria editar código de terceiro que a
  próxima instalação reescreve.
*/
const PASTAS_IGNORADAS = new Set([
  "node_modules", "dist", ".git", "coverage", ".angular", "Pods",
]);
const EXTENSOES = [".ts", ".tsx", ".css", ".sql", ".md", ".js", ".mjs", ".html", ".txt"];

/**
 * `docs/referencia/` fica de fora, e a razão importa.
 *
 * São documentos de PESQUISA: o levantamento técnico jurídico e o dossiê de
 * viabilidade. O trabalho deles é justamente levantar normas, e várias que
 * eles citam não estão na lista autorizada porque a lista governa o que o
 * PRODUTO afirma, não o que a pesquisa investigou. Apagar citação de pesquisa
 * para satisfazer um teste seria destruir a evidência que sustentou a decisão.
 */
const CAMINHOS_IGNORADOS = [
  join("docs", "referencia"),
  join("relatorio"),
  join("dc360", "packages", "shared", "test"), // este arquivo cita normas por natureza
];

function arquivos(raiz: string): string[] {
  const encontrados: string[] = [];

  function percorrer(pasta: string): void {
    for (const nome of readdirSync(pasta)) {
      if (PASTAS_IGNORADAS.has(nome)) continue;
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) {
        percorrer(caminho);
      } else if (EXTENSOES.some((e) => nome.endsWith(e))) {
        const relativo = relative(RAIZ_REPO, caminho);
        if (CAMINHOS_IGNORADOS.some((ignorado) => relativo.startsWith(ignorado))) continue;
        encontrados.push(caminho);
      }
    }
  }

  percorrer(raiz);
  return encontrados;
}

/** Superfícies que o produto gera ou apresenta. */
function superficiesDoProduto(): string[] {
  return [
    ...arquivos(RAIZ_PRODUTO),
    ...arquivos(join(RAIZ_REPO, "mockup")),
    ...arquivos(join(RAIZ_REPO, "docs")),
  ];
}

function nome(caminho: string): string {
  return relative(RAIZ_REPO, caminho).split(sep).join("/");
}

describe("Regras de conteúdo", () => {
  it("a varredura alcança o código, o protótipo e a documentação", () => {
    // Âncora: sem ela, um caminho errado faria a varredura passar vazia.
    const lista = superficiesDoProduto().map(nome);
    expect(lista.length).toBeGreaterThan(40);
    expect(lista.some((a) => a.startsWith("dc360/apps/api/src"))).toBe(true);
    expect(lista.some((a) => a.startsWith("mockup/"))).toBe(true);
    expect(lista.some((a) => a.startsWith("docs/"))).toBe(true);
    // E a isenção da pesquisa está de fato valendo.
    expect(lista.some((a) => a.startsWith("docs/referencia"))).toBe(false);
  });

  it("nenhum travessão em texto nenhum", () => {
    const achados: string[] = [];

    for (const caminho of superficiesDoProduto()) {
      readFileSync(caminho, "utf8").split("\n").forEach((linha, i) => {
        if (linha.includes(TRAVESSAO)) {
          achados.push(`${nome(caminho)}:${i + 1}  ${linha.trim().slice(0, 90)}`);
        }
      });
    }

    expect(
      achados,
      achados.length === 0
        ? ""
        : `travessão encontrado; use vírgula, dois pontos ou parênteses:\n${achados.join("\n")}`,
    ).toEqual([]);
  });

  it("nenhuma norma citada fora da lista autorizada", () => {
    const achados: string[] = [];

    for (const caminho of superficiesDoProduto()) {
      readFileSync(caminho, "utf8").split("\n").forEach((linha, i) => {
        for (const casou of linha.matchAll(CITACAO_DE_NORMA)) {
          if (!NORMAS_AUTORIZADAS.has(casou[1]!)) {
            achados.push(`${nome(caminho)}:${i + 1}  ${casou[0].trim()}`);
          }
        }
      });
    }

    expect(
      achados,
      achados.length === 0
        ? ""
        : "norma fora da lista de docs/CONTEXTO.md. Um número de lei errado num " +
          `termo de interdição é motivo para anular o ato:\n${achados.join("\n")}`,
    ).toEqual([]);
  });

  it("nenhum número de artigo em documento oficial", () => {
    /*
      A lista autorizada nomeia leis, não artigos. Citar "artigo 7º" de uma lei
      que o projeto não leu é inventar, e num termo de interdição isso é
      munição para anular o ato.

      A varredura é restrita aos geradores de documento oficial: comentário de
      código e documentação de projeto podem falar de artigo sem que isso saia
      impresso com o brasão do município.
    */
    const geradores = arquivos(join(RAIZ_PRODUTO, "apps", "api", "src", "documentos"));
    expect(geradores.length).toBeGreaterThan(0);

    const achados: string[] = [];
    for (const caminho of geradores) {
      readFileSync(caminho, "utf8").split("\n").forEach((linha, i) => {
        if (/\bart(?:\.|igo)\s*\d/i.test(linha)) {
          achados.push(`${nome(caminho)}:${i + 1}  ${linha.trim().slice(0, 90)}`);
        }
      });
    }
    expect(achados).toEqual([]);
  });

  it("as próprias expressões funcionam", () => {
    // Sem isto, um erro nas expressões faria a varredura passar vazia.
    expect(`texto com ${TRAVESSAO} travessão`.includes(TRAVESSAO)).toBe(true);

    const encontradas = [...
      "nos termos da Lei 12.608/2012 e do Decreto 99.999/2030, considerando"
        .matchAll(CITACAO_DE_NORMA)
    ].map((m) => m[1]);
    expect(encontradas).toContain("12.608/2012");
    expect(encontradas).toContain("99.999/2030");
    expect(NORMAS_AUTORIZADAS.has("99.999/2030")).toBe(false);

    expect(/\bart(?:\.|igo)\s*\d/i.test("nos termos do art. 7º")).toBe(true);
    expect(/\bart(?:\.|igo)\s*\d/i.test("artigo 12 da lei")).toBe(true);
    expect(/\bart(?:\.|igo)\s*\d/i.test("o artesão da cidade")).toBe(false);
  });
});
