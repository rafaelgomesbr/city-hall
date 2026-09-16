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

/** Os nomes de cor do CSS, sem `transparent` e `currentColor`, que não escolhem tom. */
const CORES_NOMEADAS = [
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue",
  "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon",
  "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick",
  "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod",
  "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo",
  "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue",
  "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta",
  "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
  "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
  "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite",
  "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink",
  "plum", "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue",
  "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver",
  "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan",
  "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen",
];

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
  {
    /*
      A terceira forma de escrever cor, que as duas regras de cima não viam:
      `color: white`. Um revisor provou em 15/09/2026 que `.sonda { color:
      white; border-radius: 7px; font-weight: 700 }` passava por este portão
      inteiro. A lista é a dos nomes de cor do CSS; `transparent`,
      `currentColor`, `inherit` e `none` ficam de fora porque não escolhem tom.
      A busca é dentro do VALOR de uma propriedade de cor (ou de um atalho que
      carrega cor, como `border` e `background`), e não em qualquer lugar da
      linha, senão `.selo--white` numa classe reprovaria.
    */
    nome: "cor nomeada",
    padrao: new RegExp(
      "(?<![\\w-])(?:[a-zA-Z-]*[cC]olor|background|border(?:-[a-z]+)*|outline|fill|stroke|box-shadow|text-shadow)"
      + "\\s*[:=][^;{}\\n]*?(?<![\\w-])(?:"
      + CORES_NOMEADAS.join("|")
      + ")(?![\\w-])",
      "i",
    ),
    porque: "cor por nome (white, black) é literal como o hexadecimal: não troca com o tema",
  },
  {
    nome: "raio escrito à mão",
    padrao: /(?<![A-Za-z-])border[A-Za-z-]*[rR]adius\s*:\s*["']?\s*(?:[1-9]|0?\.\d)/,
    porque: "raio vem de --ds-radius, --ds-radius-card ou --ds-radius-pill; 0 é ausência de raio e continua permitido",
  },
  {
    nome: "peso de fonte literal",
    padrao: /(?<![A-Za-z-])font-?[wW]eight\s*:\s*["']?\s*(?:\d|bold|lighter|bolder)/,
    porque: "peso vem de --ds-fw-* (medium, semibold, bold, extrabold). Solto, o mesmo 'negrito' vira 600 numa tela e 800 na outra",
  },
  {
    nome: "tamanho de fonte literal",
    padrao: /(?<![A-Za-z-])font-?[sS]ize\s*:\s*["']?\s*\d/,
    porque: "tamanho vem de --ds-fs-* (caption, body-sm, body, body-lg, h3, h2, h1, display)",
  },
  {
    /*
      `0` e `auto` continuam permitidos (ausência de espaço e centralização não
      são valores de design), e dividir um token (`calc(var(--ds-sp-1) / 2)`)
      também, porque metade de um token é derivação e não escolha nova.
    */
    nome: "espaçamento escrito à mão",
    padrao: /(?<![A-Za-z-])(?:padding|margin|gap|row-gap|column-gap|rowGap|columnGap)(?:-[a-z]+)?[A-Za-z]*\s*:[^;{}\n]*?(?<![\w.-]|\/\s*)(?:[1-9]\d*|0?\.\d+)/,
    porque: "espaçamento vem de --ds-sp-1 a --ds-sp-8. Número solto é uma distância que nenhuma outra tela conhece",
  },
];

/**
 * Apaga os blocos `/* ... *\/` preservando o número de linhas, com aspas
 * respeitadas.
 *
 * Existe porque as regras novas (cor nomeada, espaçamento) casam com prosa:
 * o `app.css` tem um parágrafo dizendo "`margin-inline: auto` centraliza o
 * conteudo. Sem ele, o teto de 1320px..." e a regra de espaçamento lia o
 * 1320 como valor. Portão que pune quem explica ensina a apagar a explicação.
 * O marcador de exceção continua sendo procurado na fonte COM comentário,
 * senão não haveria como declarar exceção nenhuma. `//` não é apagado: em
 * CSS ele não é comentário, e nas telas ele aparece dentro de URL.
 */
function semBlocosDeComentario(fonte: string): string {
  let saida = "";
  let i = 0;
  let aspas: string | null = null;
  while (i < fonte.length) {
    const c = fonte[i]!;
    if (aspas) {
      saida += c;
      if (c === "\\") { saida += fonte[i + 1] ?? ""; i += 2; continue; }
      if (c === aspas) aspas = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { aspas = c; saida += c; i += 1; continue; }
    if (c === "/" && fonte[i + 1] === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      const trecho = fonte.slice(i, fim === -1 ? fonte.length : fim + 2);
      saida += trecho.replace(/[^\n]/g, "");
      i += trecho.length;
      continue;
    }
    saida += c;
    i += 1;
  }
  return saida;
}

/**
 * O que denuncia fonte (ou qualquer folha) vinda de rede: `@import` de um
 * endereço http, e qualquer menção aos domínios de fonte do Google, que é o
 * destino que este painel teve até 15/09/2026.
 */
const FONTE_DE_REDE: RegExp[] = [
  /@import\s+(?:url\(\s*)?['"]?https?:\/\//,
  /fonts\.(?:googleapis|gstatic)\.com/,
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

/**
 * Especificidade de um seletor, nos três números do CSS. `:not(X)` vale o
 * que X vale, que é o que faz a regra genérica de campo pesar (0,8,1).
 */
function especificidade(seletor: string): [number, number, number] {
  let a = 0, b = 0, c = 0;
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

/** Cada `seletor { corpo }` da folha, inclusive os de dentro de `@media`. */
function regrasDoCss(css: string): Array<{ seletor: string; corpo: string }> {
  return [...semBlocosDeComentario(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ seletor: m[1]!.trim(), corpo: m[2]! }))
    .filter((r) => !r.seletor.startsWith("@"));
}

/** A especificidade da regra genérica de campo (a linha que começa em `input:not(`). */
function especificidadeDaGenerica(css: string): [number, number, number] {
  const generica = css.split("\n").find((l) => l.startsWith("input:not(")) ?? "";
  expect(generica, "âncora: a regra genérica de campo ainda existe").not.toBe("");
  const medida = especificidade(generica.replace(/,\s*$/, ""));
  expect(medida[1], "a genérica continua carregando os :not([type])").toBeGreaterThanOrEqual(8);
  return medida;
}

type Achado = { arquivo: string; linha: number; regra: string; trecho: string; porque: string };

function varrer(): Achado[] {
  const achados: Achado[] = [];

  for (const caminho of arquivosDeFonte(RAIZ)) {
    const bruto = readFileSync(caminho, "utf8");
    const linhas = bruto.split("\n");
    const limpas = semBlocosDeComentario(bruto).split("\n");

    linhas.forEach((linha, i) => {
      const anterior = linhas[i - 1] ?? "";
      if (anterior.includes(PERMISSAO) || linha.includes(PERMISSAO)) return;

      for (const regra of REGRAS) {
        if (regra.padrao.test(limpas[i]!)) {
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
    const casos: Array<[string, string]> = [
      ["color: #5B21B6;", "cor em hexadecimal"],
      ["background: rgba(0,0,0,0.5);", "cor em rgb ou hsl"],
      ["transition: transform 200ms ease;", "duração de movimento literal"],
      ["box-shadow: 0 4px 12px rgba(0,0,0,0.1);", "sombra literal"],
      /* A sonda do revisor de 15/09/2026, que passava inteira. */
      [".sonda { color: white; border-radius: 7px; font-weight: 700 }", "cor nomeada"],
      [".sonda { color: white; border-radius: 7px; font-weight: 700 }", "raio escrito à mão"],
      [".sonda { color: white; border-radius: 7px; font-weight: 700 }", "peso de fonte literal"],
      ["background-color: Black;", "cor nomeada"],
      ["border: 1px solid white;", "cor nomeada"],
      ["background: white;", "cor nomeada"],
      ['style={{ color: "white" }}', "cor nomeada"],
      ['<path fill="white" />', "cor nomeada"],
      ["border-top-left-radius: 4px;", "raio escrito à mão"],
      ["border-radius: 50%;", "raio escrito à mão"],
      ["borderRadius: 7,", "raio escrito à mão"],
      ["font-weight: bold;", "peso de fonte literal"],
      ["fontWeight: 600 }}", "peso de fonte literal"],
      ["font-size: 13px;", "tamanho de fonte literal"],
      ["font-size: 0.875rem;", "tamanho de fonte literal"],
      ["fontSize: 13,", "tamanho de fonte literal"],
      ["padding: 13px;", "espaçamento escrito à mão"],
      ["padding: 0 13px;", "espaçamento escrito à mão"],
      ["gap: 7px;", "espaçamento escrito à mão"],
      ["margin-top: 2px;", "espaçamento escrito à mão"],
      ["margin: 0 auto 1rem;", "espaçamento escrito à mão"],
      ["padding-inline: .5rem;", "espaçamento escrito à mão"],
      ["padding: 13, gap: 7 }}", "espaçamento escrito à mão"],
    ];
    for (const [caso, esperada] of casos) {
      const pegaram = REGRAS.filter((r) => r.padrao.test(caso)).map((r) => r.nome);
      expect(
        pegaram,
        `a regra "${esperada}" deixou de pegar: ${caso}`,
      ).toContain(esperada);
    }
  });

  it("os blocos de comentário são apagados antes da varredura, e o código da mesma linha não", () => {
    const fonte = [
      "/* `margin-inline: auto` centraliza. Sem ele, o teto de 1320px",
      "   fica encostado à esquerda. */",
      'a { color: var(--ds-text); } /* nunca white aqui */',
      "b { color: white; } /* isto tem que reprovar */",
      'c { background: url("https://exemplo.gov.br/x.png"); }',
    ].join("\n");
    const limpo = semBlocosDeComentario(fonte).split("\n");
    expect(limpo.length, "apagar comentário mudou o número de linhas").toBe(5);
    expect(REGRAS.some((r) => r.padrao.test(limpo[0]!)), "prosa com 1320px ainda reprova").toBe(false);
    expect(REGRAS.some((r) => r.padrao.test(limpo[2]!)), "comentário citando white ainda reprova").toBe(false);
    expect(REGRAS.some((r) => r.padrao.test(limpo[3]!)), "código com comentário na mesma linha ficou cego").toBe(true);
    expect(limpo[4]!.includes("https://exemplo.gov.br/x.png"), "a URL dentro de string foi cortada").toBe(true);
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

    const daGenerica = especificidadeDaGenerica(css);

    // A regra que afasta o texto da lupa: qualquer seletor da busca do topo que
    // declare padding-left (ou padding-inline-start).
    const regras = regrasDoCss(css)
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

  it("o campo inválido fica vermelho, e o campo sob o mouse escurece: as duas regras vencem a genérica", () => {
    /*
      O ACHADO (revisão de 15/09/2026): `input[aria-invalid="true"]` não
      ficava vermelho; o `textarea` ao lado, com o mesmo erro, ficava. A régua
      do caso da lupa explica: a regra de inválido era (0,1,1), a genérica é
      (0,8,1) e escreve `border` por atalho, então a cor da borda dela ganhava.
      O `textarea` só escapava porque a genérica não tem `:not` nele. O mesmo
      vale para `input:hover`, que nunca escureceu.

      A régua, então, para toda regra que estilize `input` por estado: ela
      precisa vencer (0,8,1). Este portão mede as duas.
    */
    const css = readFileSync(join(RAIZ, "estilos", "app.css"), "utf8");
    const daGenerica = especificidadeDaGenerica(css);

    const porEstado = regrasDoCss(css)
      .flatMap((r) => r.seletor.split(",").map((sel) => ({ seletor: sel.trim(), corpo: r.corpo })))
      .filter((r) => /^input\b/.test(r.seletor)
        && (/\[aria-invalid="true"\]/.test(r.seletor) || /:hover\b/.test(r.seletor))
        && /border(-color)?\s*:/.test(r.corpo));
    expect(
      porEstado.some((r) => /aria-invalid/.test(r.seletor)),
      "âncora: a regra de input inválido ainda existe",
    ).toBe(true);
    expect(porEstado.some((r) => /:hover/.test(r.seletor)), "âncora: a regra de input sob o mouse ainda existe").toBe(true);

    const perdedoras = porEstado
      .filter((r) => !vence(especificidade(r.seletor), daGenerica))
      .map((r) => `${r.seletor} (${especificidade(r.seletor).join(",")}) perde para a genérica (${daGenerica.join(",")})`);
    expect(
      perdedoras,
      "a regra de estado do campo perde para a genérica, e a borda dela (escrita "
      + "por atalho `border`) apaga a cor do estado: o campo inválido fica cinza. "
      + "Repita na regra de estado a mesma lista de :not([type]) da genérica:\n"
      + perdedoras.join("\n"),
    ).toEqual([]);
  });

  it("a grade da aplicação não deixa a tabela empurrar a largura da tela", () => {
    /*
      O ACHADO (revisão de 15/09/2026): `/ocorrencias` em 1280 px tinha
      `scrollWidth` 1363, com o sino, a conta e o botão de registrar fora da
      tela. A causa é a definição do CSS: `1fr` numa grade é `minmax(auto,
      1fr)`, e `auto` como mínimo deixa a coluna crescer até o mínimo do
      conteúdo, que numa tabela é a linha mais larga sem quebra. O
      `overflow-x: auto` do envoltório da tabela nunca chega a agir porque a
      coluna já cresceu. `minmax(0, 1fr)` corta isso, e `min-width: 0` nos
      filhos da grade impede que eles voltem a pedir o mínimo do conteúdo.
    */
    const css = readFileSync(join(RAIZ, "estilos", "app.css"), "utf8");
    const grades = regrasDoCss(css)
      .filter((r) => r.seletor.split(",").some((s) => s.trim() === ".aplicacao"))
      .map((r) => /grid-template-columns\s*:\s*([^;]+)/.exec(r.corpo)?.[1]?.trim())
      .filter((v): v is string => Boolean(v));
    expect(grades.length, "âncora: .aplicacao declara grid-template-columns, na base e na mídia estreita").toBeGreaterThanOrEqual(2);

    const cruas = grades.filter((v) => /(?:^|\s)1fr(?:\s|$)/.test(v));
    expect(
      cruas,
      "`1fr` cru na grade da aplicação é `minmax(auto, 1fr)`: a tabela empurra a "
      + "largura e o topo sai da tela. Escreva `minmax(0, 1fr)`:\n" + cruas.join("\n"),
    ).toEqual([]);

    for (const area of [".conteudo", ".topo"]) {
      const regra = regrasDoCss(css).find((r) => r.seletor.split(",").some((s) => s.trim() === area));
      expect(regra, `âncora: a regra ${area} existe`).toBeTruthy();
      expect(
        /min-width\s*:\s*0\b/.test(regra!.corpo),
        `${area} precisa de min-width: 0, senão o filho da grade volta a pedir o mínimo do conteúdo`,
      ).toBe(true);
    }
  });

  it("nenhuma fonte vem de rede: o painel serve as suas, e o portão lê até o tokens.css", () => {
    /*
      O ACHADO (revisão de 15/09/2026): `tokens.css` abria com um `@import` de
      `fonts.googleapis.com`. Cada abertura do painel mandava ao Google, fora
      do país, o endereço IP, o agente do navegador e a página de quem estava
      usando, enquanto `docs/SUBPROCESSADORES.md` dizia que nenhum dado sai do
      painel estático. `tokens.css` é isento das regras de valor literal, e
      era por essa isenção que o `@import` passava: esta regra lê TODOS os
      arquivos, inclusive ele e o `index.html`.
    */
    const suspeitos: string[] = [];
    const arquivos = [
      ...arquivosDeFonte(RAIZ),
      join(RAIZ, "estilos", "tokens.css"),
      join(RAIZ, "..", "index.html"),
    ];
    for (const caminho of arquivos) {
      /* Sem os blocos de comentário, pelo mesmo motivo das outras regras: o
         tokens.css explica em prosa de onde a fonte vinha, e o HTML também
         comenta. `<!-- -->` não é `/* *\/`, então o HTML é limpo à parte. */
      const fonte = semBlocosDeComentario(readFileSync(caminho, "utf8"))
        .replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ""));
      fonte.split("\n").forEach((linha, i) => {
        if (FONTE_DE_REDE.some((r) => r.test(linha))) {
          suspeitos.push(`${relative(RAIZ, caminho).split(sep).join("/")}:${i + 1} ${linha.trim().slice(0, 100)}`);
        }
      });
    }
    expect(
      suspeitos,
      "fonte vinda de rede: o painel serve as suas de public/fontes "
      + "(scripts/gerar-fontes-do-painel.mjs), e um destino fora do país não "
      + "pode nascer por causa de tipografia:\n" + suspeitos.join("\n"),
    ).toEqual([]);
  });

  it("as fontes declaradas no tokens.css existem em public/fontes, com a licença ao lado", () => {
    const tokens = readFileSync(join(RAIZ, "estilos", "tokens.css"), "utf8");
    const declaradas = [...tokens.matchAll(/url\("\/fontes\/([^"]+)"\)/g)].map((m) => m[1]!);
    expect(declaradas.length, "âncora: o tokens.css declara as faces locais").toBeGreaterThanOrEqual(5);
    expect(tokens).toMatch(/font-family: "Work Sans"/);
    expect(tokens).toMatch(/font-family: "Roboto Mono"/);

    const pasta = join(RAIZ, "..", "public", "fontes");
    for (const arquivo of declaradas) {
      expect(statSync(join(pasta, arquivo)).size, `${arquivo} vazio`).toBeGreaterThan(1000);
      /* WOFF 1.0 de verdade, e não um .ttf renomeado: o navegador confere a assinatura. */
      const cabeca = readFileSync(join(pasta, arquivo)).subarray(0, 4).toString("ascii");
      expect(cabeca, `${arquivo} não é WOFF`).toBe("wOFF");
    }
    for (const licenca of ["OFL-WorkSans.txt", "OFL-RobotoMono.txt"]) {
      expect(statSync(join(pasta, licenca)).size, `falta ${licenca}: a OFL exige a licença junto`).toBeGreaterThan(0);
    }
  });

  it("o portão de fonte de rede pega o @import que existia, e deixa passar a declaração local", () => {
    const antigo = "@import url('https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500&display=swap');";
    expect(FONTE_DE_REDE.some((r) => r.test(antigo)), "não pegou o @import do Google").toBe(true);
    expect(FONTE_DE_REDE.some((r) => r.test('<link rel="preconnect" href="https://fonts.gstatic.com">'))).toBe(true);
    expect(FONTE_DE_REDE.some((r) => r.test("@import url('https://cdn.exemplo.com/fonte.css');"))).toBe(true);
    expect(FONTE_DE_REDE.some((r) => r.test('  src: url("/fontes/work-sans-v24-400.woff") format("woff");'))).toBe(false);
    expect(FONTE_DE_REDE.some((r) => r.test("@import './outro.css';"))).toBe(false);
  });

  it("a varredura não reclama do que está certo", () => {
    const corretos = [
      "color: var(--ds-text);",
      "box-shadow: var(--ds-shadow-2);",
      "transition: transform var(--ds-dur-base) var(--ds-ease);",
      "width: 264px;",
      "grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));",
      "color: transparent;",
      "background: transparent;",
      "border: 0;",
      "border: none;",
      "fill: currentColor;",
      "color: inherit;",
      "border-color: var(--ds-border);",
      "color: var(--ds-white);",
      "background: var(--ds-accent-gradient);",
      ".selo--white { color: var(--ds-text); }",
      "border-radius: var(--ds-radius-pill);",
      "border-radius: 0;",
      "font-weight: var(--ds-fw-semibold);",
      "font-weight: inherit;",
      "font-size: var(--ds-fs-body-sm);",
      "padding: 0;",
      "margin: 0 auto;",
      "margin-inline: auto;",
      "padding: var(--ds-sp-2) var(--ds-sp-4);",
      "margin-top: calc(var(--ds-sp-1) / 2);",
      "gap: var(--ds-sp-3);",
      "grid-gap: 0;",
      "padding: 0, cursor: \"pointer\", font: \"inherit\",",
      "flex: 0 0 20px;",
    ];
    for (const caso of corretos) {
      expect(
        REGRAS.filter((r) => r.padrao.test(caso)).map((r) => r.nome),
        `falso positivo em: ${caso}`,
      ).toEqual([]);
    }
  });
});
