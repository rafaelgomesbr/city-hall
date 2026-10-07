import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * As regras de acessibilidade do projeto, verificadas por máquina.
 *
 * `CLAUDE.md` fixa três, e até aqui as três dependiam de um revisor humano
 * olhar cada tela:
 *
 * 1. **Contraste nível AA.** Estava escrito como comentário dentro de
 *    `tokens.css` ("8.98:1 sobre branco"). Comentário não recalcula quando
 *    alguém escurece um neutro, e o texto some sem nada reclamar. Aqui o
 *    número é CALCULADO a partir dos tokens, nos dois temas.
 * 2. **Navegação por teclado nos fluxos principais.** O jeito mais comum de
 *    quebrar isso é pendurar `onClick` numa `div`: funciona com mouse, e some
 *    para quem navega por Tab ou usa leitor de tela.
 * 3. **Nunca comunicar estado apenas por cor.** Aplicado aqui no que é
 *    mecanicamente verificável: foco visível nunca removido sem substituto, e
 *    imagem sempre com texto alternativo.
 *
 * Isto não substitui teste com pessoa real nem com leitor de tela. Substitui
 * a lembrança de um revisor, que é o que sustentava as regras antes.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const REGEX_CSS = /\.css$/;
const TOKENS = join(RAIZ, "estilos", "tokens.css");

/* ============================================================
   Contraste calculado a partir dos tokens
   ============================================================ */

type Cor = { r: number; g: number; b: number; a: number };

/** Lê um bloco `seletor { ... }` do CSS como mapa de custom properties. */
function bloco(css: string, seletor: string): Record<string, string> {
  const inicio = css.indexOf(seletor);
  if (inicio === -1) throw new Error(`bloco não encontrado no tokens.css: ${seletor}`);
  const abre = css.indexOf("{", inicio);
  let profundidade = 0;
  let fim = abre;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === "{") profundidade++;
    if (css[i] === "}") {
      profundidade--;
      if (profundidade === 0) { fim = i; break; }
    }
  }
  const corpo = css.slice(abre + 1, fim).replace(/\/\*[\s\S]*?\*\//g, "");
  const mapa: Record<string, string> = {};
  for (const casou of corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    mapa[casou[1]!] = casou[2]!.trim();
  }
  return mapa;
}

/** Resolve cadeias de `var(--x)` até chegar num literal. */
function resolver(
  nomeToken: string,
  mapa: Record<string, string>,
  visitados = new Set<string>(),
): string {
  if (visitados.has(nomeToken)) throw new Error(`ciclo de var() em ${nomeToken}`);
  visitados.add(nomeToken);
  const valor = mapa[nomeToken];
  if (valor === undefined) throw new Error(`token inexistente: ${nomeToken}`);
  const referencia = /^var\(\s*(--[\w-]+)\s*\)$/.exec(valor);
  return referencia ? resolver(referencia[1]!, mapa, visitados) : valor;
}

function corDeTexto(texto: string): Cor {
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(texto.trim());
  if (hex) {
    const d = hex[1]!;
    const cheio = d.length === 3 ? d.split("").map((c) => c + c).join("") : d;
    return {
      r: parseInt(cheio.slice(0, 2), 16),
      g: parseInt(cheio.slice(2, 4), 16),
      b: parseInt(cheio.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(texto.trim());
  if (rgba) {
    return {
      r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`cor que este teste não sabe ler: ${texto}`);
}

/**
 * Achata transparência sobre o fundo real.
 *
 * O tema escuro usa selo com 12% de opacidade. Calcular contraste contra o
 * valor translúcido daria um número que não existe na tela: o que está na
 * tela é a composição sobre a superfície debaixo.
 */
function compor(frente: Cor, atras: Cor): Cor {
  return {
    r: frente.r * frente.a + atras.r * (1 - frente.a),
    g: frente.g * frente.a + atras.g * (1 - frente.a),
    b: frente.b * frente.a + atras.b * (1 - frente.a),
    a: 1,
  };
}

function luminancia(c: Cor): number {
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

function contraste(frente: Cor, fundo: Cor): number {
  const composta = frente.a < 1 ? compor(frente, fundo) : frente;
  const a = luminancia(composta);
  const b = luminancia(fundo);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro! + 0.05) / (escuro! + 0.05);
}

/** Tabela de tokens de um tema: o claro é `:root`, o escuro sobrepõe. */
function tema(qual: "claro" | "escuro"): Record<string, string> {
  const css = readFileSync(TOKENS, "utf8");
  const claro = bloco(css, ":root {");
  if (qual === "claro") return claro;
  return { ...claro, ...bloco(css, '[data-theme="dark"]') };
}

/**
 * Pares que precisam passar em AA, com o fundo real de cada um.
 *
 * `sobre` é a superfície debaixo, usada para achatar os selos translúcidos do
 * tema escuro. `minimo` só cai abaixo de 4.5:1 onde o alvo não é texto, e a
 * razão está escrita ao lado.
 */
const PARES: Array<{
  oQue: string; frente: string; fundo: string; sobre?: string; minimo?: number;
}> = [
  { oQue: "texto no fundo da página", frente: "--ds-text", fundo: "--ds-bg" },
  { oQue: "texto no cartão", frente: "--ds-text", fundo: "--ds-surface" },
  { oQue: "texto na superfície secundária", frente: "--ds-text", fundo: "--ds-surface-2" },
  { oQue: "texto discreto no fundo", frente: "--ds-text-muted", fundo: "--ds-bg" },
  { oQue: "texto discreto no cartão", frente: "--ds-text-muted", fundo: "--ds-surface" },
  { oQue: "link ou ação no fundo", frente: "--ds-accent", fundo: "--ds-bg" },
  { oQue: "link ou ação no cartão", frente: "--ds-accent", fundo: "--ds-surface" },
  { oQue: "texto do botão primário", frente: "--ds-on-accent", fundo: "--ds-accent" },
  { oQue: "texto do botão primário em hover", frente: "--ds-on-accent", fundo: "--ds-accent-hover" },
  // Iniciais do avatar na lista de contas e na tabela de usuários: violeta
  // sobre a superfície secundária, que é um fundo diferente dos verificados
  // acima e por isso precisa do seu próprio par.
  { oQue: "iniciais do avatar na superfície secundária", frente: "--ds-accent", fundo: "--ds-surface-2" },

  { oQue: "selo de severidade baixa", frente: "--ds-sev-baixa-fg", fundo: "--ds-sev-baixa-bg", sobre: "--ds-surface" },
  { oQue: "selo de severidade média", frente: "--ds-sev-media-fg", fundo: "--ds-sev-media-bg", sobre: "--ds-surface" },
  { oQue: "selo de severidade alta", frente: "--ds-sev-alta-fg", fundo: "--ds-sev-alta-bg", sobre: "--ds-surface" },
  { oQue: "selo de severidade crítica", frente: "--ds-sev-critica-fg", fundo: "--ds-sev-critica-bg", sobre: "--ds-surface" },

  { oQue: "aviso informativo", frente: "--ds-info-fg", fundo: "--ds-info-bg", sobre: "--ds-surface" },
  { oQue: "aviso de sucesso", frente: "--ds-success-fg", fundo: "--ds-success-bg", sobre: "--ds-surface" },
  { oQue: "aviso de perigo", frente: "--ds-danger-fg", fundo: "--ds-danger-bg", sobre: "--ds-surface" },

  // Elemento gráfico, não texto: a régua da WCAG para componente é 3:1.
  { oQue: "elemento gráfico da marca no fundo", frente: "--ds-accent-graphic", fundo: "--ds-bg", minimo: 3 },

  /*
    Borda de campo de formulário, também 3:1, e é o par que faltava.

    Ela é a ÚNICA coisa que identifica onde um campo começa: o campo tem o
    mesmo fundo do cartão em que está. Com `--ds-border` isto media 1.30 no
    tema claro e 1.33 no escuro, o que reprova a WCAG 1.4.11 por larga
    margem, e ninguém percebia porque a régua de 4.5 só era aplicada a texto.

    Três fundos, porque o campo aparece nos três: cartão, superfície
    secundária e fundo da página.
  */
  { oQue: "borda de campo sobre o cartão", frente: "--ds-border-controle", fundo: "--ds-surface", minimo: 3 },
  { oQue: "borda de campo na superfície secundária", frente: "--ds-border-controle", fundo: "--ds-surface-2", minimo: 3 },
  { oQue: "borda de campo no fundo da página", frente: "--ds-border-controle", fundo: "--ds-bg", minimo: 3 },
];

const AA_TEXTO = 4.5;

describe("Contraste AA calculado a partir dos tokens", () => {
  for (const qual of ["claro", "escuro"] as const) {
    it(`tema ${qual}: todo par passa no mínimo exigido`, () => {
      const mapa = tema(qual);
      const reprovados: string[] = [];

      for (const par of PARES) {
        const fundoBruto = corDeTexto(resolver(par.fundo, mapa));
        const sobre = par.sobre ? corDeTexto(resolver(par.sobre, mapa)) : null;
        const fundo = fundoBruto.a < 1 && sobre ? compor(fundoBruto, sobre) : fundoBruto;
        const frente = corDeTexto(resolver(par.frente, mapa));

        const razao = contraste(frente, fundo);
        const minimo = par.minimo ?? AA_TEXTO;
        if (razao < minimo) {
          reprovados.push(
            `${par.oQue}: ${par.frente} sobre ${par.fundo} = ` +
            `${razao.toFixed(2)}:1 (mínimo ${minimo}:1)`,
          );
        }
      }

      expect(
        reprovados,
        reprovados.length === 0 ? "" :
          `contraste abaixo do mínimo no tema ${qual}:\n${reprovados.join("\n")}`,
      ).toEqual([]);
    });
  }

  it("o cálculo confere com valores conhecidos", () => {
    // Sem esta âncora, um erro na fórmula faria tudo passar sempre.
    const branco = corDeTexto("#FFFFFF");
    const preto = corDeTexto("#000000");
    expect(contraste(preto, branco)).toBeCloseTo(21, 1);
    expect(contraste(branco, branco)).toBeCloseTo(1, 3);
    // Cinza de referência da própria WCAG: #767676 sobre branco dá 4.54:1.
    expect(contraste(corDeTexto("#767676"), branco)).toBeCloseTo(4.54, 1);
  });

  it("a leitura dos tokens resolve as cadeias de var()", () => {
    const claro = tema("claro");
    const escuro = tema("escuro");
    expect(resolver("--ds-text", claro)).toBe("#14191D");
    expect(resolver("--ds-text", escuro)).toBe("#ECF1F4");
    // E o escuro de fato sobrepõe o claro, senão os dois testes seriam um só.
    expect(resolver("--ds-bg", claro)).not.toBe(resolver("--ds-bg", escuro));
  });

  it("a composição de transparência muda o resultado", () => {
    // O tema escuro depende disto: sem achatar, o número seria fantasia.
    const fundoEscuro = corDeTexto("#171E24");
    const selo = corDeTexto("rgba(255, 135, 135, 0.12)");
    const composto = compor(selo, fundoEscuro);
    expect(composto.r).toBeGreaterThan(fundoEscuro.r);
    expect(composto.r).toBeLessThan(255);
  });
});

/* ============================================================
   Regras verificáveis na fonte
   ============================================================ */

const PERMISSAO = "acessibilidade: excecao";

function arquivos(pasta: string, extensao: RegExp): string[] {
  const achados: string[] = [];
  for (const arquivo of readdirSync(pasta)) {
    const caminho = join(pasta, arquivo);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho, extensao));
    else if (extensao.test(arquivo)) achados.push(caminho);
  }
  return achados;
}

function nome(caminho: string): string {
  return relative(RAIZ, caminho).split(sep).join("/");
}

/**
 * Junta o JSX de cada elemento numa linha só.
 *
 * A tag costuma estar quebrada em várias linhas, e um `onKeyDown` três linhas
 * abaixo do `onClick` contaria como ausente se a leitura fosse linha a linha.
 */
function elementos(fonte: string): Array<{ texto: string; linha: number }> {
  const achados: Array<{ texto: string; linha: number }> = [];
  const linhas = fonte.split("\n");

  for (let i = 0; i < linhas.length; i++) {
    if (!/<[a-z][a-zA-Z0-9]*[\s/>]/.test(linhas[i]!)) continue;
    let texto = "";
    // Teto de 12 linhas: sem ele, um JSX malformado varreria o arquivo todo.
    for (let j = i; j < Math.min(i + 12, linhas.length); j++) {
      texto += (j === i ? "" : " ") + linhas[j]!.trim();
      if (linhas[j]!.includes(">")) break;
    }
    const inicio = texto.indexOf("<");
    achados.push({ texto: texto.slice(inicio), linha: i + 1 });
  }
  return achados;
}

const NAO_INTERATIVOS =
  /^<(div|span|li|section|article|p|tr|td|ul|ol|header|footer|figure|img)[\s/>]/;

/**
 * O comentário contíguo imediatamente acima de um elemento.
 *
 * A janela era fixa em quatro linhas, e isso punia exatamente a exceção bem
 * escrita: a de `Modal.tsx` explica em sete linhas por que o clique no fundo
 * não ganha `tabIndex`, a marca ficou na primeira linha do bloco, e o portão
 * leu só as quatro últimas e reprovou. Encurtar a justificativa para caber
 * seria o contrário do que a regra quer.
 *
 * Então a leitura passa a ser o BLOCO inteiro: sobe linha a linha a partir do
 * elemento, atravessa linhas em branco e o JSX de abertura do comentário
 * (`{/*`), e para no começo do bloco (`/*`) ou na primeira linha que não é
 * comentário. Fora de um comentário, nada é lido: a marca continua precisando
 * estar escrita num comentário, e não solta no meio do código.
 */
function comentarioAcima(linhas: string[], linhaDoElemento: number): string {
  const colhidas: string[] = [];
  let i = linhaDoElemento - 2; // índice da linha imediatamente acima
  // Linhas em branco entre o comentário e o elemento não quebram a ligação.
  while (i >= 0 && linhas[i]!.trim() === "") i--;
  if (i < 0) return "";

  const fim = linhas[i]!.trim();
  if (fim.startsWith("//")) {
    // Bloco de linhas `//` seguidas.
    while (i >= 0 && linhas[i]!.trim().startsWith("//")) { colhidas.push(linhas[i]!); i--; }
    return colhidas.join(" ");
  }
  // Comentário de bloco: a linha de cima precisa FECHAR um (`*/` ou `*/}`).
  if (!/\*\/\s*\}?$/.test(fim)) return "";
  while (i >= 0) {
    colhidas.push(linhas[i]!);
    if (/(\{\s*)?\/\*/.test(linhas[i]!)) break;
    i--;
  }
  return colhidas.join(" ");
}

describe("Teclado e leitor de tela", () => {
  it("a varredura enxerga as telas de verdade", () => {
    const telas = arquivos(RAIZ, /\.tsx$/);
    expect(telas.length).toBeGreaterThan(8);
    expect(telas.map(nome)).toContain("paginas/Ocorrencia.tsx");
  });

  it("nenhum onClick pendurado em elemento que o teclado não alcança", () => {
    const achados: string[] = [];

    for (const caminho of arquivos(RAIZ, /\.tsx$/)) {
      const fonte = readFileSync(caminho, "utf8");
      const linhas = fonte.split("\n");

      for (const el of elementos(fonte)) {
        if (!el.texto.includes("onClick")) continue;
        if (!NAO_INTERATIVOS.test(el.texto)) continue;
        /*
          Exceção declarada no comentário logo acima, com a razão escrita. O
          bloco inteiro conta, sem teto de linhas: a razão costuma não caber em
          uma, e obrigar a caber produziria justificativa curta demais para
          significar algo.
        */
        const acima = comentarioAcima(linhas, el.linha);
        if (acima.includes(PERMISSAO)) continue;
        // Alcançável por teclado significa foco mais tecla, os dois.
        const focavel = el.texto.includes("tabIndex");
        const teclado = el.texto.includes("onKeyDown") || el.texto.includes("onKeyUp");
        if (focavel && teclado) continue;

        achados.push(`${nome(caminho)}:${el.linha}  ${el.texto.slice(0, 110)}`);
      }
    }

    expect(
      achados,
      achados.length === 0 ? "" :
        "clique só de mouse. Use <button>, ou declare tabIndex mais onKeyDown, " +
        `ou escreva "${PERMISSAO}" na linha de cima com a razão:\n${achados.join("\n")}`,
    ).toEqual([]);
  });

  it("toda imagem tem texto alternativo", () => {
    const achados: string[] = [];
    for (const caminho of arquivos(RAIZ, /\.tsx$/)) {
      for (const el of elementos(readFileSync(caminho, "utf8"))) {
        if (!/^<img[\s/>]/.test(el.texto)) continue;
        if (/\balt=/.test(el.texto)) continue;
        achados.push(`${nome(caminho)}:${el.linha}  ${el.texto.slice(0, 110)}`);
      }
    }
    expect(achados, `imagem sem alt:\n${achados.join("\n")}`).toEqual([]);
  });

  it("foco visível nunca é removido sem substituto", () => {
    /*
      `outline: none` sozinho é a forma clássica de deixar quem navega por Tab
      sem saber onde está. Só passa quando a mesma regra devolve o anel de
      foco por outro caminho.
    */
    const achados: string[] = [];
    for (const caminho of arquivos(join(RAIZ, "estilos"), /\.css$/)) {
      const css = readFileSync(caminho, "utf8");
      for (const casou of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const corpo = casou[2]!;
        if (!/outline\s*:\s*(none|0)\b/.test(corpo)) continue;
        if (/--ds-focus-ring/.test(corpo)) continue;
        achados.push(`${nome(caminho)}  ${casou[1]!.trim()} { ${corpo.trim().slice(0, 80)} }`);
      }
    }
    expect(
      achados,
      `outline removido sem devolver o anel de foco:\n${achados.join("\n")}`,
    ).toEqual([]);
  });

  it("o foco sobrevive ao Alto Contraste do Windows", () => {
    /*
      O modo de cores forçadas do Windows DESCARTA `box-shadow`. Como o anel de
      foco desta folha é desenhado só por sombra, sem uma contrapartida em
      `forced-colors` quem liga o Alto Contraste navega por Tab às cegas, e
      esse é justamente o cenário de máquina antiga de prefeitura.

      O teste é grosseiro de propósito: exige que exista pelo menos um bloco
      `@media (forced-colors: active)` devolvendo `outline` no arquivo que
      remove o outline. Não tenta provar que o desenho está bonito, só que a
      saída existe.
    */
    const semSaida: string[] = [];
    for (const caminho of arquivos(join(RAIZ, "estilos"), REGEX_CSS)) {
      const css = readFileSync(caminho, "utf8");
      const removeFoco = /:focus-visible[^{]*\{[^{}]*box-shadow:\s*var\(--ds-focus-ring\)/.test(css);
      if (!removeFoco) continue;
      const temForcado = /@media[^{]*forced-colors:\s*active[^{]*\{[\s\S]*?outline:/.test(css);
      if (!temForcado) semSaida.push(nome(caminho));
    }
    expect(
      semSaida,
      "desenha o anel de foco por box-shadow e não devolve outline em "
      + "@media (forced-colors: active). No Alto Contraste do Windows o foco "
      + "some da tela inteira:\n" + semSaida.join("\n"),
    ).toEqual([]);
  });

  it("campo de formulário usa a borda de CONTROLE, não a decorativa", () => {
    /*
      O par de contraste acima confere o TOKEN. Este confere quem o CSS usa.

      Sem os dois, o portão tem um buraco por onde a correção volta: alguém
      troca `--ds-border-controle` por `--ds-border` na regra do campo, o
      contraste cai de 5.53 para 1.30, e o teste de token continua verde
      porque o token em si não mudou. Descobri isso tentando desfazer a
      correção de propósito e vendo a suíte passar.
    */
    const faltando: string[] = [];
    for (const caminho of arquivos(join(RAIZ, "estilos"), /\.css$/)) {
      const css = readFileSync(caminho, "utf8");
      for (const casou of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const seletor = casou[1]!.trim();
        const corpo = casou[2]!;
        // Só a regra que desenha a caixa do campo. Estado (hover, inválido) e
        // outros elementos ficam de fora.
        const ehCampo = /\binput\b/.test(seletor)
          && /\bselect\b/.test(seletor)
          && /\btextarea\b/.test(seletor)
          && !/:hover|:focus|\[aria-invalid/.test(seletor);
        if (!ehCampo) continue;
        if (!/border\s*:/.test(corpo)) continue;
        if (/--ds-border-controle/.test(corpo)) continue;
        faltando.push(`${nome(caminho)}  ${seletor.slice(0, 70)}`);
      }
    }
    expect(
      faltando,
      "a borda do campo é a única coisa que diz onde ele começa, e por isso "
      + "precisa de --ds-border-controle (3:1) e não de --ds-border (1.30):\n"
      + faltando.join("\n"),
    ).toEqual([]);
  });

  it("o Tab traz o item da barra do rodapé inteiro para a tela", () => {
    /*
      No celular a lateral vira barra no pé da tela e rola na horizontal. O
      navegador NÃO rola sozinho um item que está pela metade: medido a 390px,
      o Tab parava em "Mapa da cidade" com o rótulo cortado na borda direita.
      Quem rola é o `onFocus` da estrutura, e o respiro vem do
      `scroll-padding-inline` da folha. São duas metades da mesma correção, e
      este portão guarda as duas.
    */
    const estrutura = readFileSync(join(RAIZ, "componentes", "Estrutura.tsx"), "utf8");
    expect(estrutura).toMatch(/scrollIntoView\(\{\s*inline:\s*"nearest",\s*block:\s*"nearest"\s*\}\)/);
    // Os três tipos de item da barra: destino, troca de tema e sair.
    expect(estrutura.match(/onFocus=\{trazerParaATela\}/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    const css = readFileSync(join(RAIZ, "estilos", "app.css"), "utf8");
    expect(css).toMatch(/\.lateral\s*\{\s*scroll-padding-inline:\s*var\(--ds-sp-\d\)/);
  });

  it("o aviso passageiro não cai em cima da barra de navegação", () => {
    /*
      `.toast` é fixo no canto inferior direito. No celular a barra ocupa esse
      canto, e a confirmação de gravação aparecia POR CIMA dos destinos, com as
      frases sobrepostas. A posição precisa estar na folha (regra de media query
      não vence estilo escrito no elemento) e precisa subir a altura da barra.
    */
    const toast = readFileSync(join(RAIZ, "componentes", "Toast.tsx"), "utf8");
    expect(toast, "a posição do toast não pode voltar para dentro do componente")
      .not.toMatch(/position:\s*"fixed"/);
    const css = readFileSync(join(RAIZ, "estilos", "app.css"), "utf8");
    expect(css).toMatch(/\.toast\s*\{[^}]*position:\s*fixed/);
    // A altura é a mesma conta que desenha a barra, e não um número escolhido.
    expect(css).toMatch(
      /\.toast\s*\{\s*bottom:\s*calc\(var\(--ds-sp-4\)\s*\+\s*var\(--ds-touch\)\s*\+\s*var\(--ds-sp-5\)\s*\*\s*2\)/,
    );
  });

  it("existe um atalho para pular direto ao conteúdo", () => {
    // Sem isso, quem navega por teclado atravessa a lateral inteira a cada
    // troca de tela.
    const fontes = arquivos(RAIZ, /\.tsx$/)
      .map((c) => readFileSync(c, "utf8"))
      .join("\n");
    expect(fontes).toMatch(/pular-para-conteudo/);
  });

  it("as próprias regras pegam o que deveriam pegar", () => {
    // Prova de que a varredura não passa vazia por erro de expressão.
    expect(NAO_INTERATIVOS.test('<div className="x" onClick={f}>')).toBe(true);
    expect(NAO_INTERATIVOS.test('<button type="button" onClick={f}>')).toBe(false);
    expect(NAO_INTERATIVOS.test("<Cartao onClick={f}>")).toBe(false);

    // A junção de linhas precisa alcançar o atributo que está embaixo.
    const juntado = elementos('<div className="a"\n     onClick={f}>\n  oi\n</div>');
    expect(juntado[0]!.texto).toContain("onClick");

    expect(/\balt=/.test('<img src={u} loading="lazy" />')).toBe(false);
    expect(/\balt=/.test('<img src={u} alt="foto" />')).toBe(true);
  });

  it("a exceção vale pelo comentário inteiro, e só por ele", () => {
    /*
      O portão precisa continuar reprovando o clique só de mouse. Se ele
      passasse a aceitar qualquer coisa, os casos acima ficariam verdes para
      sempre sem ninguém notar, que é como um portão morre.
    */
    const comBlocoLongo = [
      "    /*",
      `      ${PERMISSAO}. Clique no fundo é atalho de ponteiro, e a`,
      "      contrapartida de teclado está no mesmo componente: Escape fecha,",
      "      e o botão Cancelar fecha por Tab e Enter. Dar tabIndex ao fundo",
      "      acrescentaria ao ciclo do Tab uma parada que não é controle.",
      "    */",
      "    <div onClick={f}>",
    ];
    // Sete linhas de bloco: a janela fixa de quatro linhas reprovava isto.
    expect(comentarioAcima(comBlocoLongo, 7)).toContain(PERMISSAO);

    // Comentário de linha, e com linha em branco no meio do caminho.
    const comBarras = [`    // ${PERMISSAO}: a razão`, "", "    <div onClick={f}>"];
    expect(comentarioAcima(comBarras, 3)).toContain(PERMISSAO);

    // Sem comentário nenhum: não há exceção, e o caso reprova.
    expect(comentarioAcima(["    <div onClick={f}>"], 1)).toBe("");

    // A marca SOLTA no código, fora de comentário, não vale como exceção.
    const semComentario = [`    const x = "${PERMISSAO}";`, "    <div onClick={f}>"];
    expect(comentarioAcima(semComentario, 2)).toBe("");

    // Nem a marca de um bloco que não é o de cima (há código entre os dois).
    const blocoDistante = [
      "    /*",
      `      ${PERMISSAO}: razão de outro elemento`,
      "    */",
      "    const y = 1;",
      "    <div onClick={f}>",
    ];
    expect(comentarioAcima(blocoDistante, 5)).toBe("");
  });
});

describe("Troca de tela", () => {
  it("toda rota do painel tem título próprio", async () => {
    /*
      Numa aplicação de página única, trocar de rota não é navegação para o
      navegador: o endereço muda, o conteúdo é substituído, e nada é
      anunciado. O título da aba é a primeira coisa que o leitor de tela lê, e
      era estático desde que a página abria.

      Este teste lê as rotas declaradas em `App.tsx` e exige que cada uma
      tenha nome. Assim, rota nova sem título reprova aqui, e não seis meses
      depois num teste com leitor de tela que ninguém vai fazer.
    */
    const { nomeDaTela } = await import("../src/componentes/TrocaDeTela");
    const app = readFileSync(join(RAIZ, "App.tsx"), "utf8");

    const rotas = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((m) => m[1]!)
      // O curinga é redirecionamento, não tela.
      .filter((r) => r !== "*")
      // Parâmetro vira um valor de exemplo, porque o nome sai de um padrão.
      .map((r) => r.replace(":id", "00000000-0000-4000-8000-000000000000"));

    expect(rotas.length).toBeGreaterThan(5);

    const semNome = rotas.filter((r) => nomeDaTela(r) === "Defesa Civil 360");
    expect(
      semNome,
      "rota sem título próprio: quem usa leitor de tela não sabe que a tela "
      + "mudou, e a aba do navegador continua dizendo a mesma coisa:\n"
      + semNome.join("\n"),
    ).toEqual([]);
  });

  it("o conteúdo pode receber foco, senão levar o foco até ele não funciona", () => {
    const estrutura = readFileSync(join(RAIZ, "componentes", "Estrutura.tsx"), "utf8");
    expect(estrutura).toMatch(/id="conteudo"[^>]*tabIndex=\{-1\}/);
  });
});
