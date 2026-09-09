import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * "Obrigatório" precisa ser dito, não só desenhado.
 *
 * O painel escolheu marcar a EXCEÇÃO: campo opcional leva "(opcional)" no
 * rótulo, e o resto é obrigatório. A convenção é boa e fica, porque marcar o
 * comum enche a tela de asterisco. Só que ela vivia inteira no texto do
 * rótulo: nenhum campo do painel tinha `required`, então quem navega por Tab
 * com leitor de tela ouvia "Nome completo, edição de texto" e nada mais, sem
 * nenhuma pista de que aquele campo é obrigatório e o de baixo não é. E quem
 * enxerga não tinha onde ler a convenção: dez rótulos limpos e dois marcados
 * não dizem, sozinhos, qual dos dois grupos é a exceção.
 *
 * Este arquivo é o portão dos três pedaços da correção:
 *
 * 1. campo obrigatório declara `required`, que é o que o navegador anuncia
 *    junto do rótulo;
 * 2. formulário que tem campo `required` desliga a validação nativa, porque a
 *    validação é a do esquema compartilhado, a mesma que o servidor roda, e a
 *    bolha do navegador atropelaria as mensagens escritas para este domínio;
 * 3. formulário com mais de um campo abre dizendo a convenção.
 *
 * O que fica FORA do portão, e por quê:
 *
 * - `type="search"`: filtro não é campo a preencher. Exigir preenchimento de
 *   uma busca seria proibir de limpar o filtro.
 * - caixa de marcação e botão de rádio: `required` neles significa "precisa
 *   estar marcado", que é outra regra, e neste painel seria falsa (a marcação
 *   de vulnerabilidade social é justamente a que pode ficar desmarcada).
 * - `<select>`: sempre tem opção escolhida, então não há como estar vazio, e
 *   `required` ali não muda nada para o leitor de tela.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const AVISO = "<AvisoDeObrigatorios";

function arquivos(pasta: string): string[] {
  const achados: string[] = [];
  for (const arquivo of readdirSync(pasta)) {
    const caminho = join(pasta, arquivo);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho));
    else if (arquivo.endsWith(".tsx")) achados.push(caminho);
  }
  return achados;
}

function nome(caminho: string): string {
  return relative(RAIZ, caminho).split(sep).join("/");
}

/**
 * Lê uma tag JSX inteira a partir do `<`.
 *
 * Não dá para parar no primeiro `>`: quase toda tag deste painel carrega um
 * `onChange={(e) => ...}`, e a seta tem um `>` no meio. Contar chaves resolve,
 * porque toda seta mora dentro de um `{}`.
 */
function lerTag(fonte: string, inicio: number): string {
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i++) {
    const c = fonte[i];
    if (c === "{") profundidade++;
    else if (c === "}") profundidade--;
    else if (c === ">" && profundidade === 0) return fonte.slice(inicio, i + 1);
  }
  return fonte.slice(inicio);
}

function linhaDe(fonte: string, posicao: number): number {
  return fonte.slice(0, posicao).split("\n").length;
}

/** Mapa de `id` para o texto do rótulo que aponta para ele. */
function rotulos(fonte: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const casou of fonte.matchAll(/<label\b/g)) {
    const abertura = lerTag(fonte, casou.index);
    const para = /\bhtmlFor="([^"]+)"/.exec(abertura);
    if (!para) continue;
    const inicioTexto = casou.index + abertura.length;
    const fimTexto = fonte.indexOf("</label>", inicioTexto);
    if (fimTexto === -1) continue;
    mapa.set(para[1]!, fonte.slice(inicioTexto, fimTexto));
  }
  return mapa;
}

type Campo = {
  arquivo: string;
  linha: number;
  tag: string;
  id: string | null;
  elemento: string;
  tipo: string | null;
};

type Formulario = { arquivo: string; linha: number; abertura: string; corpo: string; campos: Campo[] };

/** Todo `<form>` do painel, com os campos que moram dentro dele. */
function formularios(caminho: string): Formulario[] {
  const fonte = readFileSync(caminho, "utf8");
  const achados: Formulario[] = [];

  for (const casou of fonte.matchAll(/<form\b/g)) {
    const abertura = lerTag(fonte, casou.index);
    const fim = fonte.indexOf("</form>", casou.index);
    const corpo = fonte.slice(casou.index, fim === -1 ? fonte.length : fim);

    const campos: Campo[] = [];
    for (const dentro of corpo.matchAll(/<(input|textarea|select)\b/g)) {
      const tag = lerTag(corpo, dentro.index);
      campos.push({
        arquivo: nome(caminho),
        linha: linhaDe(fonte, casou.index + dentro.index),
        tag,
        elemento: dentro[1]!,
        id: /\bid="([^"]+)"/.exec(tag)?.[1] ?? null,
        tipo: /\btype="([^"]+)"/.exec(tag)?.[1] ?? null,
      });
    }
    achados.push({ arquivo: nome(caminho), linha: linhaDe(fonte, casou.index), abertura, corpo, campos });
  }
  return achados;
}

/** Fora do portão: filtro, marcação e escolha em lista. Ver o cabeçalho. */
const TIPOS_ISENTOS = new Set(["search", "checkbox", "radio", "hidden", "submit", "button", "reset"]);

function preenchivel(campo: Campo): boolean {
  if (campo.elemento === "select") return false;
  return !TIPOS_ISENTOS.has(campo.tipo ?? "");
}

const TODOS = arquivos(RAIZ).flatMap(formularios);
const ROTULOS = new Map(
  arquivos(RAIZ).map((c) => [nome(c), rotulos(readFileSync(c, "utf8"))] as const),
);

function ehOpcional(campo: Campo): boolean {
  if (!campo.id) return true;
  const rotulo = ROTULOS.get(campo.arquivo)?.get(campo.id);
  // Sem rótulo associado o problema é outro, e não é este portão que pega.
  if (rotulo === undefined) return true;
  return rotulo.includes("(opcional)");
}

describe("O obrigatório é anunciado", () => {
  it("a varredura enxerga os formulários de verdade", () => {
    /*
      Âncora. Sem ela, um erro na leitura das tags faria todos os testes
      abaixo passarem vazios, que é o pior jeito de um portão falhar: ele
      continua verde enquanto deixa de olhar.
    */
    expect(TODOS.length).toBeGreaterThanOrEqual(15);
    expect(TODOS.map((f) => f.arquivo)).toContain("paginas/NovaOcorrencia.tsx");
    const obrigatorios = TODOS.flatMap((f) => f.campos).filter((c) => preenchivel(c) && !ehOpcional(c));
    expect(obrigatorios.length).toBeGreaterThanOrEqual(20);
  });

  it("a leitura de tag não se perde na seta de uma função", () => {
    const tag = lerTag('<input id="x" onChange={(e) => setX(e.target.value)} required />', 0);
    expect(tag.endsWith("/>")).toBe(true);
    expect(tag).toContain("required");
    // E o rótulo é lido junto do campo a que pertence.
    expect(rotulos('<label htmlFor="x">Nome (opcional)</label>').get("x")).toBe("Nome (opcional)");
  });

  it("todo campo obrigatório declara required", () => {
    const faltando: string[] = [];
    for (const formulario of TODOS) {
      for (const campo of formulario.campos) {
        if (!preenchivel(campo) || ehOpcional(campo)) continue;
        if (/\brequired\b/.test(campo.tag)) continue;
        faltando.push(`${campo.arquivo}:${campo.linha}  ${campo.tag.slice(0, 90)}`);
      }
    }
    expect(
      faltando,
      "campo obrigatório sem `required`. Quem navega por leitor de tela ouve "
      + "o rótulo e nada mais, e descobre que o campo era obrigatório só "
      + "depois de enviar. Se o campo for opcional mesmo, marque "
      + '"(opcional)" no rótulo, que é a convenção deste painel:\n'
      + faltando.join("\n"),
    ).toEqual([]);
  });

  it("formulário com campo obrigatório desliga a validação nativa", () => {
    const semNoValidate = TODOS
      .filter((f) => f.campos.some((c) => /\brequired\b/.test(c.tag)))
      .filter((f) => !/\bnoValidate\b/.test(f.abertura))
      .map((f) => `${f.arquivo}:${f.linha}`);
    expect(
      semNoValidate,
      "`required` sem `noValidate`: o navegador passa a barrar o envio com a "
      + "bolha nativa dele, em texto que não é nosso, e a mensagem do esquema "
      + "compartilhado (a mesma que o servidor devolve) nunca chega à tela:\n"
      + semNoValidate.join("\n"),
    ).toEqual([]);
  });

  it("formulário de mais de um campo abre dizendo a convenção", () => {
    const mudos = TODOS
      .filter((f) => f.campos.filter(preenchivel).length + f.campos.filter((c) => c.elemento === "select").length > 1)
      .filter((f) => !f.corpo.includes(AVISO))
      .map((f) => `${f.arquivo}:${f.linha}`);
    expect(
      mudos,
      "formulário com vários campos e sem a frase de obrigatoriedade. A "
      + 'convenção de marcar só a exceção ("(opcional)") não se explica '
      + "sozinha: quem chega vê rótulos limpos e não sabe se o limpo é o "
      + "obrigatório ou o contrário:\n" + mudos.join("\n"),
    ).toEqual([]);
  });

  it("a frase existe uma vez só, como componente", () => {
    // Frase repetida à mão em dez telas vira dez frases diferentes na
    // primeira vez que alguém reescrever uma delas.
    const comuns = readFileSync(join(RAIZ, "componentes", "comuns.tsx"), "utf8");
    expect(comuns).toMatch(/export function AvisoDeObrigatorios/);
    expect(comuns).toMatch(/Todos os campos são obrigatórios, exceto os marcados como opcional\./);
  });
});
