import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A regra do design system, verificada por máquina.
 *
 * `CLAUDE.md` diz: cor, sombra, raio ou duração escritos direto no componente
 * são bug. Até agora isso dependia de um revisor humano olhar cada mudança, e
 * revisor humano não olha o diff das duas da manhã.
 *
 * O motivo da regra não é gosto. Uma cor literal não acompanha o tema: ela
 * fica igual no claro e no escuro, e o resultado é texto ilegível em um dos
 * dois. Uma sombra literal não acompanha o tema também, e sombra clara sobre
 * fundo escuro simplesmente some. E cada valor solto é um lugar a mais para
 * consertar quando a identidade visual mudar, como já mudou uma vez neste
 * projeto (laranja para violeta).
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * `tokens.css` é onde os valores literais MORAM. É o único arquivo isento, e
 * ele é cópia do design system, revisada com contraste calculado à mão.
 */
const ISENTOS = new Set(["tokens.css"]);

/**
 * Marcador para a exceção deliberada e rara.
 *
 * Existe para que uma exceção seja uma decisão escrita na linha de cima, e não
 * um valor solto que ninguém percebeu.
 */
const PERMISSAO = "design-system: excecao";

const REGRAS: Array<{ nome: string; padrao: RegExp; porque: string }> = [
  {
    nome: "cor em hexadecimal",
    padrao: /#[0-9a-fA-F]{3,8}\b/,
    porque: "cor literal não troca com o tema: fica igual no claro e no escuro",
  },
  {
    nome: "cor em rgb ou hsl",
    padrao: /\b(?:rgba?|hsla?)\s*\(/,
    porque: "mesma razão da cor em hexadecimal",
  },
  {
    nome: "duração de movimento literal",
    padrao: /(?:transition|animation)(?:-duration)?\s*:[^;{}]*?\b\d+(?:\.\d+)?m?s\b/,
    porque: "duração vem de --ds-dur-*, inclusive para respeitar prefers-reduced-motion",
  },
  {
    nome: "sombra literal",
    padrao: /box-shadow\s*:\s*(?![^;]*var\(--ds-)[^;]*\d/,
    porque: "sombra literal não escurece junto com o tema e some no fundo escuro",
  },
];

function arquivosDeFonte(pasta: string): string[] {
  const encontrados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      encontrados.push(...arquivosDeFonte(caminho));
    } else if (/\.(css|tsx|ts)$/.test(nome) && !ISENTOS.has(nome)) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

type Achado = { arquivo: string; linha: number; regra: string; trecho: string; porque: string };

function varrer(): Achado[] {
  const achados: Achado[] = [];

  for (const caminho of arquivosDeFonte(RAIZ)) {
    const linhas = readFileSync(caminho, "utf8").split("\n");

    linhas.forEach((linha, i) => {
      const anterior = linhas[i - 1] ?? "";
      if (anterior.includes(PERMISSAO) || linha.includes(PERMISSAO)) return;

      for (const regra of REGRAS) {
        if (regra.padrao.test(linha)) {
          achados.push({
            arquivo: relative(RAIZ, caminho).split(sep).join("/"),
            linha: i + 1,
            regra: regra.nome,
            trecho: linha.trim().slice(0, 100),
            porque: regra.porque,
          });
        }
      }
    });
  }
  return achados;
}

describe("Nenhum valor de design escrito à mão", () => {
  it("a varredura enxerga os arquivos de verdade", () => {
    // Sem esta âncora, um erro no caminho faria a varredura passar vazia e o
    // teste virar decoração.
    const arquivos = arquivosDeFonte(RAIZ);
    expect(arquivos.length).toBeGreaterThan(15);
    expect(arquivos.some((a) => a.endsWith("app.css"))).toBe(true);
    expect(arquivos.some((a) => a.endsWith(".tsx"))).toBe(true);
  });

  it("nem no CSS, nem nos estilos escritos dentro do componente", () => {
    const achados = varrer();
    const relatorio = achados
      .map((a) => `${a.arquivo}:${a.linha} [${a.regra}] ${a.trecho}\n      porque: ${a.porque}`)
      .join("\n");

    expect(
      achados,
      achados.length === 0
        ? ""
        : `valores de design escritos à mão:\n${relatorio}\n\n` +
          `Use um token --ds-*. Se a exceção for deliberada, escreva ` +
          `"${PERMISSAO}" num comentário na linha de cima, com a razão.`,
    ).toEqual([]);
  });

  it("a varredura pega o que deveria pegar", () => {
    // Prova de que as expressões funcionam, sem depender de o código estar
    // errado para descobrir isso.
    const casos = [
      "color: #5B21B6;",
      "background: rgba(0,0,0,0.5);",
      "transition: transform 200ms ease;",
      "box-shadow: 0 4px 12px rgba(0,0,0,0.1);",
    ];
    for (const caso of casos) {
      expect(
        REGRAS.some((r) => r.padrao.test(caso)),
        `nenhuma regra pega: ${caso}`,
      ).toBe(true);
    }
  });

  it("a varredura não reclama do que está certo", () => {
    const corretos = [
      "color: var(--ds-text);",
      "box-shadow: var(--ds-shadow-2);",
      "transition: transform var(--ds-dur-base) var(--ds-ease);",
      "width: 264px;",
      "grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));",
    ];
    for (const caso of corretos) {
      expect(
        REGRAS.filter((r) => r.padrao.test(caso)).map((r) => r.nome),
        `falso positivo em: ${caso}`,
      ).toEqual([]);
    }
  });
});
