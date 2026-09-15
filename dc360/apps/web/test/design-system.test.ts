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

  it("todo tipo de input que as telas usam recebe estilo", () => {
    /*
      Este caso nasceu de um defeito real: a regra de campo era uma lista de
      tipos PERMITIDOS (text, email, search, number), e `type="password"` não
      estava nela. Os quatro campos de senha do produto, incluindo o da tela de
      entrada, saíam com a aparência crua do navegador ao lado de um campo de
      email estilizado, no mesmo formulário.

      A regra virou lista de EXCEÇÃO. Este teste confere que ela continua
      assim: todo tipo de input que as telas realmente renderizam ou recebe
      estilo, ou está declarado como exceção deliberada.
    */
    const css = readFileSync(join(RAIZ, "estilos", "app.css"), "utf8");
    // A regra encadeia vários `:not(...)` no mesmo seletor, então a busca
    // precisa ser pela linha inteira, e não por cada `input:not(` isolado.
    const seletor = css.split("\n").find((l) => l.startsWith("input:not(")) ?? "";
    const excluidos = new Set(
      [...seletor.matchAll(/:not\(\[type="([a-z]+)"\]\)/g)].map((m) => m[1]!),
    );
    expect(excluidos.size, "a regra de campo deixou de ser lista de exceção").toBeGreaterThan(3);

    /* Tipos que são botão ou marcação não precisam do estilo de campo. */
    const NAO_SAO_CAMPO = new Set(["button", "submit", "reset", "checkbox", "radio"]);

    const usados = new Set<string>();
    for (const caminho of arquivosDeFonte(RAIZ)) {
      if (!caminho.endsWith(".tsx")) continue;
      for (const casou of readFileSync(caminho, "utf8").matchAll(/type="([a-z]+)"/g)) {
        usados.add(casou[1]!);
      }
    }
    expect(usados.has("password"), "âncora: as telas ainda têm campo de senha").toBe(true);

    const semEstilo = [...usados].filter((t) => !NAO_SAO_CAMPO.has(t) && excluidos.has(t));
    expect(
      semEstilo,
      `tipo de input renderizado pelas telas e excluído do estilo: ${semEstilo.join(", ")}`,
    ).toEqual([]);
  });

  it("a lupa da busca não fica sobre o texto: quem afasta o texto vence a regra genérica de campo", () => {
    /*
      Defeito visto na tela: a lupa desenhada em cima do placeholder da busca.

      A causa foi MEDIDA, não chutada. A regra genérica de campo é
      `input:not([type="checkbox"]):not(...)` oito vezes, e cada `:not([type])`
      conta como um atributo: especificidade (0,8,1). A regra que afastava o
      texto era `.topo__busca input`, (0,1,1). O `padding` da genérica, mais
      forte e mais abaixo no arquivo, reescrevia o `padding-left` da busca, e
      o texto começava a 12px, debaixo de um ícone de 18px.

      A régua, então: toda regra que estilize UM campo específico precisa
      vencer (0,8,1). Este portão calcula as duas especificidades e reprova
      quando a da busca perde, para que o próximo `.alguma-coisa input` não
      volte a perder em silêncio.
    */
    const css = readFileSync(join(RAIZ, "estilos", "app.css"), "utf8");

    function especificidade(seletor: string): [number, number, number] {
      let a = 0, b = 0, c = 0;
      // `:not(X)` vale o que X vale.
      const semNot = seletor.replace(/:not\(([^)]*)\)/g, (_, dentro: string) => {
        const [x, y, z] = especificidade(dentro);
        a += x; b += y; c += z;
        return "";
      });
      a += (semNot.match(/#[\w-]+/g) ?? []).length;
      b += (semNot.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
      c += (semNot.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
      return [a, b, c];
    }
    function vence(x: [number, number, number], y: [number, number, number]): boolean {
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
      return false;
    }

    const generica = css.split("\n").find((l) => l.startsWith("input:not(")) ?? "";
    expect(generica, "âncora: a regra genérica de campo ainda existe").not.toBe("");
    const daGenerica = especificidade(generica.replace(/,\s*$/, ""));
    expect(daGenerica[1], "a genérica continua carregando os :not([type])").toBeGreaterThanOrEqual(8);

    // A regra que afasta o texto da lupa: qualquer seletor da busca do topo que
    // declare padding-left (ou padding-inline-start).
    const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => ({ seletor: m[1]!.trim(), corpo: m[2]! }))
      .filter((r) => /topo__busca|busca-global/.test(r.seletor)
        && /padding-(left|inline-start)\s*:/.test(r.corpo));
    expect(regras.length, "não achei a regra que afasta o texto da lupa").toBeGreaterThan(0);

    const perdedoras = regras
      .filter((r) => !vence(especificidade(r.seletor), daGenerica))
      .map((r) => `${r.seletor} (${especificidade(r.seletor).join(",")}) perde para a genérica (${daGenerica.join(",")})`);
    expect(
      perdedoras,
      "a regra que afasta o texto da lupa perde para a regra genérica de campo, "
      + "e o `padding` dela reescreve o `padding-left`: a lupa volta para cima "
      + "do texto. Dê à regra da busca especificidade maior que a genérica:\n"
      + perdedoras.join("\n"),
    ).toEqual([]);

    // Prova de que o cálculo mede o que diz medir.
    expect(especificidade(".topo__busca input")).toEqual([0, 1, 1]);
    expect(especificidade('input:not([type="a"]):not([type="b"])')).toEqual([0, 2, 1]);
    expect(especificidade(".topo__busca #busca-global")).toEqual([1, 1, 0]);
    expect(vence([0, 1, 1], [0, 8, 1])).toBe(false);
    expect(vence([1, 0, 0], [0, 8, 1])).toBe(true);
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
