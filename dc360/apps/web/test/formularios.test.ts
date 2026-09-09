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
 *
 * ---------------------------------------------------------------------------
 * ONDE A CONVENÇÃO MORA DEPOIS DA MIGRAÇÃO PARA `Campo`
 * ---------------------------------------------------------------------------
 *
 * Esta varredura lia `<label htmlFor="...">` e `<input ... required>` como
 * TEXTO, e as duas coisas saíram das telas: agora quem escreve o rótulo, o
 * `required` e o `aria-describedby` é `componentes/Campo.tsx`, e a tela declara
 * `<Campo id="..." rotulo="..." opcional>` e espalha `{...campo}` no controle.
 *
 * O portão não baixou os mínimos por causa disso, e não podia: mínimo que cede
 * quando a contagem cai deixa de ser mínimo. Ele aprendeu a ler a forma nova,
 * e as três perguntas continuam as mesmas, só que feitas no lugar certo:
 *
 * 1. o campo obrigatório declara `required`? Agora isso é: o controle espalha
 *    as ligações do `Campo` que o embrulha. Quem escreve o `required` a partir
 *    daí é o `Campo`, e `test/campo.test.ts` é quem prova que ele escreve;
 * 2. o formulário desliga a validação nativa? Igual, só que a pergunta passa a
 *    valer para todo formulário que tenha `Campo` não opcional;
 * 3. a convenção é dita no topo? Igual, sem mudança.
 *
 * O que MARCA a exceção também mudou de lugar, e é o ponto mais importante
 * daqui: antes era o texto "(opcional)" digitado no rótulo, e agora é a
 * propriedade `opcional` do `Campo`, que faz as duas coisas de uma vez
 * (escreve "(opcional)" no rótulo e tira o `required` do controle). Separadas,
 * elas divergiam: rótulo limpo com campo sem `required`, ou o contrário.
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

/**
 * O tag sem as strings e sem as expressões `{...}`.
 *
 * Serve para perguntar se uma propriedade NUA está escrita ali (`opcional`),
 * sem que a palavra apareça por acaso dentro de um rótulo, de uma dica ou de
 * um trecho de JSX passado por propriedade. Sem isto, um campo com a dica
 * "preencher é opcional" passaria a contar como opcional de verdade.
 */
function apenasPropriedadesNuas(tag: string): string {
  let saida = "";
  let i = 0;
  while (i < tag.length) {
    const c = tag[i]!;
    if (c === '"' || c === "'") {
      const fim = tag.indexOf(c, i + 1);
      i = fim === -1 ? tag.length : fim + 1;
      saida += " ";
      continue;
    }
    if (c === "{") {
      let profundidade = 0;
      while (i < tag.length) {
        if (tag[i] === "{") profundidade++;
        else if (tag[i] === "}") {
          profundidade--;
          if (profundidade === 0) { i++; break; }
        }
        i++;
      }
      saida += " ";
      continue;
    }
    saida += c;
    i++;
  }
  return saida;
}

/** Um `<Campo>` da tela, e o pedaço de fonte que ele embrulha. */
type BlocoCampo = { id: string; opcional: boolean; inicio: number; fim: number };

/**
 * Todo `<Campo>` do arquivo, com o trecho que fica dentro dele.
 *
 * O fim é achado contando `<Campo` e `</Campo>`, e não pelo primeiro
 * fechamento: `Campo` recebe o controle como função, e nada impede que um dia
 * um deles tenha outro dentro. Parar no primeiro `</Campo>` daria um bloco
 * curto demais e o controle de dentro ficaria órfão, contado como campo sem
 * rótulo, que é o jeito silencioso deste portão parar de olhar.
 */
function blocosDeCampo(fonte: string): BlocoCampo[] {
  const blocos: BlocoCampo[] = [];
  for (const casou of fonte.matchAll(/<Campo\b/g)) {
    const abertura = lerTag(fonte, casou.index);
    const id = /\bid="([^"]+)"/.exec(abertura)?.[1];
    if (!id) continue;

    let profundidade = 1;
    let i = casou.index + abertura.length;
    while (i < fonte.length && profundidade > 0) {
      const proximoAbre = fonte.indexOf("<Campo", i);
      const proximoFecha = fonte.indexOf("</Campo>", i);
      if (proximoFecha === -1) { i = fonte.length; break; }
      if (proximoAbre !== -1 && proximoAbre < proximoFecha) {
        profundidade++;
        i = proximoAbre + "<Campo".length;
      } else {
        profundidade--;
        i = proximoFecha + "</Campo>".length;
      }
    }

    blocos.push({
      id,
      opcional: /(?:^|\s)opcional(?=[\s/>]|$)/.test(apenasPropriedadesNuas(abertura)),
      inicio: casou.index,
      fim: i,
    });
  }
  return blocos;
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
  /** O `<Campo>` que embrulha este controle, quando existe um. */
  bloco: BlocoCampo | null;
};

type Formulario = { arquivo: string; linha: number; abertura: string; corpo: string; campos: Campo[] };

/** Todo `<form>` do painel, com os campos que moram dentro dele. */
function formularios(caminho: string): Formulario[] {
  const fonte = readFileSync(caminho, "utf8");
  const blocos = blocosDeCampo(fonte);
  const achados: Formulario[] = [];

  for (const casou of fonte.matchAll(/<form\b/g)) {
    const abertura = lerTag(fonte, casou.index);
    const fim = fonte.indexOf("</form>", casou.index);
    const corpo = fonte.slice(casou.index, fim === -1 ? fonte.length : fim);

    const campos: Campo[] = [];
    for (const dentro of corpo.matchAll(/<(input|textarea|select)\b/g)) {
      const tag = lerTag(corpo, dentro.index);
      const posicao = casou.index + dentro.index;
      /*
        O `<Campo>` MAIS INTERNO que contém este controle. O mais interno, e
        não o primeiro: com blocos aninhados, o de fora responderia pelo campo
        de dentro e a obrigatoriedade sairia trocada.
      */
      const bloco = blocos
        .filter((b) => b.inicio < posicao && posicao < b.fim)
        .sort((a, b) => b.inicio - a.inicio)[0] ?? null;
      campos.push({
        arquivo: nome(caminho),
        linha: linhaDe(fonte, posicao),
        tag,
        elemento: dentro[1]!,
        id: /\bid="([^"]+)"/.exec(tag)?.[1] ?? bloco?.id ?? null,
        tipo: /\btype="([^"]+)"/.exec(tag)?.[1] ?? null,
        bloco,
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
  /*
    Dentro de um `<Campo>`, quem diz é a propriedade `opcional`. Ela é a
    ÚNICA fonte, e é por isso que ela vale mais do que o texto do rótulo: é
    ela que, ao mesmo tempo, escreve "(opcional)" no rótulo e tira o
    `required` do controle. Ler o texto aqui seria voltar a conferir o efeito
    em vez da causa.
  */
  if (campo.bloco) return campo.bloco.opcional;
  if (!campo.id) return true;
  const rotulo = ROTULOS.get(campo.arquivo)?.get(campo.id);
  // Sem rótulo associado o problema é outro, e não é este portão que pega.
  if (rotulo === undefined) return true;
  return rotulo.includes("(opcional)");
}

/**
 * O controle recebeu as ligações do `Campo` que o embrulha?
 *
 * `{...campo}` é o que traz `id`, `required`, `aria-invalid` e
 * `aria-describedby` de uma vez. Espalhar é tudo ou nada de propósito: um
 * controle que escolhe atributos a dedo é a amarração feita à mão de novo, e a
 * primeira parte a sumir é sempre a que não muda um pixel na tela.
 */
function espalhaAsLigacoes(campo: Campo): boolean {
  return /\{\s*\.\.\.\s*campo\s*\}/.test(campo.tag);
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

  it("a leitura de `<Campo>` separa a propriedade nua do texto que a menciona", () => {
    /*
      A armadilha que este caso trava: um campo obrigatório cuja dica diz a
      palavra "opcional" passaria a ser lido como opcional, e sumiria da
      contagem sem que ninguém tivesse mexido nele.
    */
    const fonte = [
      '<Campo id="a" rotulo="Nome" dica="Nada aqui é opcional">',
      "  {(campo) => <input {...campo} />}",
      "</Campo>",
      '<Campo id="b" rotulo="Cargo" opcional>',
      "  {(campo) => <input {...campo} />}",
      "</Campo>",
    ].join("\n");

    const blocos = blocosDeCampo(fonte);
    expect(blocos.map((b) => [b.id, b.opcional])).toEqual([["a", false], ["b", true]]);
    // E cada bloco termina no próprio fechamento, não no do vizinho.
    expect(fonte.slice(blocos[0]!.inicio, blocos[0]!.fim)).not.toContain('id="b"');
  });

  it("o bloco aninhado responde pelo campo de dentro", () => {
    const fonte = [
      '<Campo id="fora" rotulo="Fora">',
      '  {() => (<Campo id="dentro" rotulo="Dentro" opcional>',
      "    {(campo) => <input {...campo} />}",
      "  </Campo>)}",
      "</Campo>",
    ].join("\n");
    const blocos = blocosDeCampo(fonte);
    const posicao = fonte.indexOf("<input");
    const maisInterno = blocos
      .filter((b) => b.inicio < posicao && posicao < b.fim)
      .sort((a, b) => b.inicio - a.inicio)[0];
    expect(maisInterno?.id).toBe("dentro");
  });

  it("todo campo obrigatório declara required", () => {
    const faltando: string[] = [];
    for (const formulario of TODOS) {
      for (const campo of formulario.campos) {
        if (!preenchivel(campo) || ehOpcional(campo)) continue;
        /*
          Duas formas passam, e as duas de fato anunciam a obrigatoriedade:
          o `required` escrito no controle, e o `{...campo}` que traz o
          `required` do `Campo` que o embrulha.
        */
        if (campo.bloco ? espalhaAsLigacoes(campo) : /\brequired\b/.test(campo.tag)) continue;
        faltando.push(`${campo.arquivo}:${campo.linha}  ${campo.tag.slice(0, 90)}`);
      }
    }
    expect(
      faltando,
      "campo obrigatório que não anuncia a obrigatoriedade. Quem navega por "
      + "leitor de tela ouve o rótulo e nada mais, e descobre que o campo era "
      + "obrigatório só depois de enviar. Dentro de `<Campo>`, espalhe "
      + "`{...campo}` no controle; fora dele, escreva `required`. Se o campo "
      + 'for opcional mesmo, marque `opcional` no `<Campo>`:\n'
      + faltando.join("\n"),
    ).toEqual([]);
  });

  it("formulário com campo obrigatório desliga a validação nativa", () => {
    const semNoValidate = TODOS
      .filter((f) => f.campos.some(
        (c) => /\brequired\b/.test(c.tag) || (c.bloco !== null && !c.bloco.opcional),
      ))
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

  it("a exceção é marcada no `<Campo>`, e nunca só no texto do rótulo", () => {
    /*
      Escrever "(opcional)" à mão dentro do `rotulo` produziria o rótulo certo
      na tela e um controle `required` por baixo: a tela dizendo "pode deixar
      em branco" e o navegador dizendo "obrigatório" sobre o mesmo campo. Quem
      marca a exceção é a propriedade, que faz as duas coisas de uma vez.
    */
    const amao: string[] = [];
    for (const caminho of arquivos(RAIZ)) {
      const fonte = readFileSync(caminho, "utf8");
      for (const bloco of blocosDeCampo(fonte)) {
        const abertura = lerTag(fonte, bloco.inicio);
        if (!/rotulo=\{?"[^"]*\(opcional\)/.test(abertura)) continue;
        amao.push(`${nome(caminho)}:${linhaDe(fonte, bloco.inicio)}  ${bloco.id}`);
      }
    }
    expect(
      amao,
      '"(opcional)" digitado dentro do `rotulo`. Use a propriedade `opcional` '
      + "do `<Campo>`: é ela que escreve o texto no rótulo E tira o `required` "
      + "do controle, e é por isso que os dois não têm como divergir:\n"
      + amao.join("\n"),
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
