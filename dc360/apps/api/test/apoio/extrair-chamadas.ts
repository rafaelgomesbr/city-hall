/**
 * Leitura, como TEXTO, das chamadas que um cliente faz à API (V2-F02-E05).
 *
 * Nasceu dentro de `contrato-do-painel.test.ts` (V2-F00-E23), só para o painel,
 * e foi generalizado aqui para o painel, o aplicativo de campo e o console
 * (`contrato-cliente-rota.test.ts`). Quem usa passa um PERFIL: o nome das
 * funções que fazem chamada em cada arquivo e onde, em cada uma, estão o
 * método e o corpo (opção `metodo`, terceiro argumento, fixo...).
 *
 * O extrator é por varredura de texto, e extrator de texto erra calado: se ele
 * deixar de ver uma chamada, o teste fica verde sobre menos do que devia. Por
 * isso há DUAS leituras independentes (`extrairChamadas` e `contarChamadas`) e
 * quem usa exige que batam. E por isso o que o extrator não sabe ler nunca é
 * ignorado: vira `naoLidas`, e o teste reprova.
 *
 * Nada aqui toca rede nem servidor: é texto entrando e estrutura saindo.
 */

// ---------------------------------------------------------------------------
// Perfil: o que cada arquivo de cliente chama e como
// ---------------------------------------------------------------------------

/** Onde está o método HTTP numa chamada. */
export type FormaDoMetodo =
  | { onde: "opcoes"; chave: string; padrao: string }
  | { onde: "posicional"; indice: number; padrao: string }
  | { onde: "fixo"; valor: string };

/** Onde está o corpo da requisição numa chamada. */
export type FormaDoCorpo =
  | { onde: "opcoes"; chave: string; json: boolean }
  | { onde: "posicional"; indice: number }
  | { onde: "nenhum" };

/** Como se sabe que o pedido sai SEM token. */
export type FormaDoSemToken =
  | { tipo: "opcao-verdadeira"; chave: string }
  | { tipo: "sem-chave"; chave: string }
  | { tipo: "sem-authorization" }
  | { tipo: "nunca" };

export type FuncaoDeChamada = {
  /** O identificador chamado: `chamar`, `pedir`, `fetch`, `buscar`... */
  nome: string;
  metodo: FormaDoMetodo;
  corpo: FormaDoCorpo;
  semToken: FormaDoSemToken;
  /**
   * Expressões que podem abrir o primeiro argumento como BASE da API
   * (`${BASE}/auth/sair`): a base sai do caminho. Ausente, o primeiro
   * argumento já é o caminho relativo à base.
   */
  bases?: readonly string[];
  /** Índice do argumento que traz o objeto de opções (padrão 1). */
  opcoes?: number;
};

export type Perfil = {
  funcoes: readonly FuncaoDeChamada[];
  /**
   * Primeiros argumentos que NÃO são caminho da API e sim URL assinada que a
   * própria API devolveu (o PUT dos bytes direto no armazenamento). Chave: o
   * texto da expressão; valor: a razão. Fora desta lista, um primeiro
   * argumento que não é literal nem `${base}${caminho}` reprova.
   */
  assinadas?: ReadonlyMap<string, string>;
};

/** `chamar(caminho, { metodo, corpo, semSessao })`, como o painel e o campo. */
export function chamarComOpcoes(semToken: FormaDoSemToken, nome = "chamar"): FuncaoDeChamada {
  return {
    nome,
    metodo: { onde: "opcoes", chave: "metodo", padrao: "GET" },
    corpo: { onde: "opcoes", chave: "corpo", json: false },
    semToken,
  };
}

/** `fetch(\`${base}/caminho\`, { method, body, headers })`. */
export function fetchNaBase(bases: readonly string[], nome = "fetch"): FuncaoDeChamada {
  return {
    nome,
    metodo: { onde: "opcoes", chave: "method", padrao: "GET" },
    corpo: { onde: "opcoes", chave: "body", json: true },
    semToken: { tipo: "sem-authorization" },
    bases,
  };
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type CorpoLido =
  | { tipo: "nenhum" }
  /** `chaves` são as escritas no literal; `possiveis` incluem as de trechos espalhados (`...`). */
  | { tipo: "literal"; chaves: string[]; possiveis: string[] }
  | { tipo: "ilegivel"; motivo: string };

export type ConsultaLida = { chaves: string[]; dinamica: boolean };

export type Chamada = {
  funcao: string;
  linha: number;
  metodo: string;
  /** Um caminho normalizado, ou vários quando uma interpolação se expande. */
  caminhos: string[];
  /** Pedido feito sem token. */
  semToken: boolean;
  corpo: CorpoLido;
  consulta: ConsultaLida;
};

export type Infra = "definicao" | "repeticao" | "envio" | "assinada";

export type Extracao = {
  chamadas: Chamada[];
  infra: Infra[];
  naoLidas: string[];
};

// ---------------------------------------------------------------------------
// Texto: comentários, literais, argumentos
// ---------------------------------------------------------------------------

type Parte = { tipo: "texto" | "expr"; valor: string };

function linhaDe(fonte: string, i: number): number {
  return fonte.slice(0, i).split("\n").length;
}

/**
 * Troca por espaços o que é comentário, preservando os deslocamentos e as
 * quebras de linha (o número de linha de uma chamada continua o do arquivo).
 *
 * Existe porque comentário que cita `chamar(` ou `fetch(` (e há muito) seria
 * lido como chamada, e porque a versão por "linha que começa com asterisco" não
 * vê o comentário de bloco cujas linhas internas não têm asterisco. Sabe de
 * literais e de templates aninhados; para barra de divisão contra literal de
 * expressão regular usa a heurística do último caractere significativo.
 * Só serve a arquivo `.ts` (em JSX, o apóstrofo do texto parece aspa).
 */
export function semComentarios(fonte: string): string {
  const n = fonte.length;
  const saida = fonte.split("");
  type Contexto = { tipo: "codigo"; chaves: number } | { tipo: "template" };
  const pilha: Contexto[] = [{ tipo: "codigo", chaves: 0 }];
  let anterior = "";
  let i = 0;

  const branquear = (de: number, ate: number): void => {
    for (let j = de; j < ate; j++) if (saida[j] !== "\n") saida[j] = " ";
  };

  while (i < n) {
    const topo = pilha[pilha.length - 1]!;
    const c = fonte[i]!;
    const d = fonte[i + 1];

    if (topo.tipo === "template") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        pilha.pop();
        anterior = "`";
        i++;
        continue;
      }
      if (c === "$" && d === "{") {
        pilha.push({ tipo: "codigo", chaves: 0 });
        anterior = "{";
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (c === "/" && d === "/") {
      const fim = fonte.indexOf("\n", i);
      const ate = fim < 0 ? n : fim;
      branquear(i, ate);
      i = ate;
      continue;
    }
    if (c === "/" && d === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      const ate = fim < 0 ? n : fim + 2;
      branquear(i, ate);
      i = ate;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && fonte[j] !== c && fonte[j] !== "\n") j += fonte[j] === "\\" ? 2 : 1;
      i = j + 1;
      anterior = c;
      continue;
    }
    if (c === "`") {
      pilha.push({ tipo: "template" });
      i++;
      continue;
    }
    if (c === "/" && (anterior === "" || "(,=:[!&|?{};".includes(anterior))) {
      // literal de expressão regular: vai até a barra que fecha, fora de [...]
      let j = i + 1;
      let classe = false;
      while (j < n && fonte[j] !== "\n") {
        const e = fonte[j]!;
        if (e === "\\") {
          j += 2;
          continue;
        }
        if (e === "[") classe = true;
        else if (e === "]") classe = false;
        else if (e === "/" && !classe) break;
        j++;
      }
      i = j + 1;
      anterior = "/";
      continue;
    }
    if (c === "{") topo.chaves++;
    if (c === "}") {
      if (topo.chaves === 0 && pilha.length > 1) {
        pilha.pop();
        i++;
        continue;
      }
      topo.chaves--;
    }
    if (!/\s/.test(c)) anterior = c;
    i++;
  }
  return saida.join("");
}

/** Índice depois do fim do literal que abre em `i`. */
function pularLiteral(fonte: string, i: number): number {
  return lerLiteral(fonte, i).fim;
}

/**
 * Lê um literal de string. Template devolve as partes de texto e as
 * interpolações separadas, com aninhamento (template dentro de `${}`).
 */
function lerLiteral(fonte: string, i: number): { partes: Parte[]; fim: number } {
  const aspa = fonte[i]!;
  const partes: Parte[] = [];
  let texto = "";
  let j = i + 1;
  while (j < fonte.length) {
    const c = fonte[j]!;
    if (c === "\\") {
      texto += fonte.slice(j, j + 2);
      j += 2;
      continue;
    }
    if (c === aspa) {
      if (texto) partes.push({ tipo: "texto", valor: texto });
      return { partes, fim: j + 1 };
    }
    if (aspa === "`" && c === "$" && fonte[j + 1] === "{") {
      if (texto) partes.push({ tipo: "texto", valor: texto });
      texto = "";
      const inicio = j + 2;
      let k = inicio;
      let nivel = 1;
      while (k < fonte.length && nivel > 0) {
        const d = fonte[k]!;
        if (d === '"' || d === "'" || d === "`") {
          k = pularLiteral(fonte, k);
          continue;
        }
        if (d === "{") nivel++;
        else if (d === "}") nivel--;
        k++;
      }
      partes.push({ tipo: "expr", valor: fonte.slice(inicio, k - 1).trim() });
      j = k;
      continue;
    }
    texto += c;
    j++;
  }
  throw new Error(`literal sem fim na linha ${linhaDe(fonte, i)}`);
}

/** Índice depois do `>` que fecha o genérico em `i`, ignorando `=>`. */
export function pularGenerico(fonte: string, i: number): number {
  let nivel = 0;
  let k = i;
  while (k < fonte.length) {
    const c = fonte[k]!;
    if (c === '"' || c === "'" || c === "`") {
      k = pularLiteral(fonte, k);
      continue;
    }
    if (c === "<") nivel++;
    else if (c === ">" && fonte[k - 1] !== "=") {
      nivel--;
      if (nivel === 0) return k + 1;
    }
    k++;
  }
  throw new Error(`genérico sem fim na linha ${linhaDe(fonte, i)}`);
}

/** Índice depois do `)` que fecha os argumentos abertos em `i`. */
function pularArgumentos(fonte: string, i: number): number {
  let nivel = 0;
  let k = i;
  while (k < fonte.length) {
    const c = fonte[k]!;
    if (c === '"' || c === "'" || c === "`") {
      k = pularLiteral(fonte, k);
      continue;
    }
    if (c === "(") nivel++;
    else if (c === ")") {
      nivel--;
      if (nivel === 0) return k + 1;
    }
    k++;
  }
  throw new Error(`chamada sem fim na linha ${linhaDe(fonte, i)}`);
}

/** Divide `texto` nas vírgulas de nível zero (fora de literal e de colchete). */
function dividirNasVirgulas(texto: string): string[] {
  const pedacos: string[] = [];
  let nivel = 0;
  let inicio = 0;
  let k = 0;
  while (k < texto.length) {
    const c = texto[k]!;
    if (c === '"' || c === "'" || c === "`") {
      k = pularLiteral(texto, k);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") nivel++;
    else if (c === ")" || c === "]" || c === "}") nivel--;
    else if (c === "," && nivel === 0) {
      pedacos.push(texto.slice(inicio, k).trim());
      inicio = k + 1;
    }
    k++;
  }
  const resto = texto.slice(inicio).trim();
  if (resto) pedacos.push(resto);
  return pedacos;
}

/**
 * Lê um argumento de caminho: literal, ou termos de literal e expressão
 * ligados por `+` (como o console escreve). Devolve `null` se sobrar algo que
 * não é isso (`as string`, ternário...).
 */
function lerTermos(argumento: string): Parte[] | null {
  const partes: Parte[] = [];
  let i = 0;
  const pular = (): void => {
    while (i < argumento.length && /\s/.test(argumento[i]!)) i++;
  };
  for (;;) {
    pular();
    const c = argumento[i];
    if (c === '"' || c === "'" || c === "`") {
      const lido = lerLiteral(argumento, i);
      partes.push(...lido.partes);
      i = lido.fim;
    } else {
      const inicio = i;
      let nivel = 0;
      while (i < argumento.length) {
        const d = argumento[i]!;
        if (d === '"' || d === "'" || d === "`") {
          i = pularLiteral(argumento, i);
          continue;
        }
        if (d === "(" || d === "[" || d === "{") nivel++;
        else if (d === ")" || d === "]" || d === "}") nivel--;
        else if (d === "+" && nivel === 0) break;
        i++;
      }
      const valor = argumento.slice(inicio, i).trim();
      if (!valor) return null;
      partes.push({ tipo: "expr", valor });
    }
    pular();
    if (i >= argumento.length) return partes;
    if (argumento[i] === "+") {
      i++;
      continue;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Objeto literal: as chaves do corpo e das opções
// ---------------------------------------------------------------------------

type EntradaDeObjeto = { chave: string; valor: string };
type ObjetoLido = { entradas: EntradaDeObjeto[]; espalhados: string[] };

/** As entradas de nível zero de `{ ... }`, ou `null` se o texto não é um objeto literal inteiro. */
function lerObjeto(texto: string): ObjetoLido | null {
  const t = texto.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  // O `{` do começo precisa fechar no `}` do fim, e não antes (`{a}, {b}`).
  let nivel = 0;
  for (let k = 0; k < t.length; k++) {
    const c = t[k]!;
    if (c === '"' || c === "'" || c === "`") {
      k = pularLiteral(t, k) - 1;
      continue;
    }
    if (c === "{" || c === "[" || c === "(") nivel++;
    else if (c === "}" || c === "]" || c === ")") {
      nivel--;
      if (nivel === 0 && k < t.length - 1) return null;
    }
  }
  const objeto: ObjetoLido = { entradas: [], espalhados: [] };
  for (const pedaco of dividirNasVirgulas(t.slice(1, -1))) {
    if (pedaco.startsWith("...")) {
      objeto.espalhados.push(pedaco.slice(3).trim());
      continue;
    }
    const casou = /^(?:([A-Za-z_$][\w$]*)|"([^"]+)"|'([^']+)')\s*(?::([\s\S]*))?$/.exec(pedaco);
    if (!casou) return null;
    const chave = casou[1] ?? casou[2] ?? casou[3]!;
    objeto.entradas.push({ chave, valor: casou[4] !== undefined ? casou[4].trim() : chave });
  }
  return objeto;
}

function chavesPossiveisEm(texto: string): string[] {
  return [...texto.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*(?=[:,}])/g)].map((m) => m[1]!);
}

/** O corpo, lido do texto da expressão. */
export function lerCorpo(expressao: string | undefined, json: boolean): CorpoLido {
  if (expressao === undefined) return { tipo: "nenhum" };
  let texto = expressao.trim();
  if (json) {
    const casou = /^JSON\.stringify\(([\s\S]*)\)$/.exec(texto);
    if (!casou) return { tipo: "ilegivel", motivo: "o corpo não é JSON.stringify de um literal" };
    texto = casou[1]!.trim();
  }
  const objeto = lerObjeto(texto);
  if (!objeto) {
    return {
      tipo: "ilegivel",
      motivo: /^[A-Za-z_$][\w$.]*$/.test(texto)
        ? `o corpo vem da variável ${texto}`
        : "o corpo não é um objeto literal",
    };
  }
  const chaves = objeto.entradas.map((e) => e.chave);
  const possiveis = [...chaves, ...objeto.espalhados.flatMap(chavesPossiveisEm)];
  return { tipo: "literal", chaves, possiveis };
}

// ---------------------------------------------------------------------------
// Caminho e query
// ---------------------------------------------------------------------------

/**
 * Transforma as partes do literal em caminho(s) de rota e lê a query.
 *
 * Interpolação que ocupa um segmento inteiro vira `:p`; a que fica no fim e
 * monta query (`${x ? "?a=1" : ""}`) sai junto com a query; qualquer outra
 * forma é recusada, para nunca adivinhar um caminho.
 */
function montarCaminhos(
  partes: Parte[],
  exp: Map<string, string[]>,
): { caminhos: string[]; consulta: ConsultaLida } | string {
  let caminhos = [""];
  const consulta: ConsultaLida = { chaves: [], dinamica: false };
  for (let n = 0; n < partes.length; n++) {
    const p = partes[n]!;
    if (p.tipo === "texto") {
      const corte = p.valor.indexOf("?");
      const pedaco = corte >= 0 ? p.valor.slice(0, corte) : p.valor;
      caminhos = caminhos.map((c) => c + pedaco);
      if (corte >= 0) {
        lerConsulta(p.valor.slice(corte + 1), partes.slice(n + 1), consulta);
        return { caminhos, consulta };
      }
      continue;
    }
    const anterior = caminhos[0]!;
    const seguinte = partes[n + 1];
    const fechaSegmento = !seguinte || (seguinte.tipo === "texto" && /^[/?]/.test(seguinte.valor));
    if (anterior.endsWith("/") && fechaSegmento) {
      const valores = exp.get(p.valor);
      caminhos = valores
        ? caminhos.flatMap((c) => valores.map((v) => c + v))
        : caminhos.map((c) => c + ":p");
      continue;
    }
    if (!seguinte && /["'`]\?/.test(p.valor)) {
      consulta.dinamica = true;
      return { caminhos, consulta };
    }
    return `interpolação que não é segmento nem query: \${${p.valor}}`;
  }
  return { caminhos, consulta };
}

/** As chaves de `a=1&b=${x}` e se alguma parte da query é montada em tempo de execução. */
function lerConsulta(resto: string, seguintes: Parte[], consulta: ConsultaLida): void {
  const chaves = (texto: string): void => {
    for (const m of texto.matchAll(/(?:^|&)([A-Za-z_][\w.]*)=/g)) consulta.chaves.push(m[1]!);
  };
  chaves(resto);
  let anterior = resto;
  for (const p of seguintes) {
    if (p.tipo === "expr") {
      // `a=${x}` é valor de uma chave que se vê; `?${p.toString()}` não é.
      if (!anterior.endsWith("=")) consulta.dinamica = true;
      anterior = "";
    } else {
      chaves(p.valor);
      anterior = p.valor;
    }
  }
}

// ---------------------------------------------------------------------------
// A extração
// ---------------------------------------------------------------------------

function regexDosNomes(perfil: Perfil): RegExp {
  const nomes = [...new Set(perfil.funcoes.map((f) => f.nome))];
  return new RegExp(`(?<![.\\w$])(${nomes.join("|")})(?![\\w$])`, "g");
}

/**
 * Tira de `fonte` cada chamada ao servidor. Exportada só para os casos
 * sintéticos poderem trocá-la por uma que perde chamada e provar a âncora.
 *
 * `fonte` já deve estar sem comentários (`semComentarios`) quando é de arquivo
 * `.ts`; o texto sintético dos testes não tem comentário.
 */
export function extrairChamadas(
  fonte: string,
  perfil: Perfil,
  exp: Map<string, string[]> = new Map(),
): Extracao {
  const chamadas: Chamada[] = [];
  const infra: Infra[] = [];
  const naoLidas: string[] = [];

  for (const casou of fonte.matchAll(regexDosNomes(perfil))) {
    const funcao = perfil.funcoes.find((f) => f.nome === casou[1])!;
    const inicio = casou.index!;
    const linha = linhaDe(fonte, inicio);

    let k = inicio + funcao.nome.length;
    while (/\s/.test(fonte[k] ?? "")) k++;
    if (fonte[k] === "<") {
      k = pularGenerico(fonte, k);
      while (/\s/.test(fonte[k] ?? "")) k++;
    }
    if (fonte[k] !== "(") continue;

    if (/function\s+$/.test(fonte.slice(Math.max(0, inicio - 20), inicio))) {
      infra.push("definicao");
      continue;
    }

    const fimDosArgumentos = pularArgumentos(fonte, k);
    const args = dividirNasVirgulas(fonte.slice(k + 1, fimDosArgumentos - 1));
    const primeiro = args[0] ?? "";

    if (/^caminho$/.test(primeiro)) {
      infra.push("repeticao");
      continue;
    }
    const assinada = perfil.assinadas?.get(primeiro);
    if (assinada !== undefined) {
      infra.push("assinada");
      continue;
    }

    const termos = lerTermos(primeiro);
    if (!termos) {
      naoLidas.push(
        `linha ${linha}: ${funcao.nome} com caminho que não é literal (${primeiro.slice(0, 40)})`,
      );
      continue;
    }
    let partes = termos;
    if (funcao.bases) {
      if (partes[0]?.tipo !== "expr" || !funcao.bases.includes(partes[0].valor)) {
        naoLidas.push(
          `linha ${linha}: ${funcao.nome} que não começa por \${${funcao.bases.join("|")}}`,
        );
        continue;
      }
      if (partes.length === 2 && partes[1]!.tipo === "expr" && partes[1]!.valor === "caminho") {
        infra.push("envio");
        continue;
      }
      partes = partes.slice(1);
    }
    if (partes[0]?.tipo !== "texto" || !partes[0].valor.startsWith("/")) {
      naoLidas.push(`linha ${linha}: caminho que não começa por /`);
      continue;
    }

    const montado = montarCaminhos(partes, exp);
    if (typeof montado === "string") {
      naoLidas.push(`linha ${linha}: ${montado}`);
      continue;
    }

    // As opções, quando a função as recebe como objeto.
    const indiceDasOpcoes = funcao.opcoes ?? 1;
    const textoDasOpcoes = args[indiceDasOpcoes];
    const precisaDeOpcoes =
      funcao.metodo.onde === "opcoes" ||
      funcao.corpo.onde === "opcoes" ||
      funcao.semToken.tipo === "opcao-verdadeira" ||
      funcao.semToken.tipo === "sem-chave";
    let opcoes: ObjetoLido | null = null;
    if (precisaDeOpcoes && textoDasOpcoes !== undefined) {
      opcoes = lerObjeto(textoDasOpcoes);
      if (!opcoes) {
        naoLidas.push(`linha ${linha}: opções de ${funcao.nome} que não são um objeto literal`);
        continue;
      }
    }
    const entrada = (chave: string): EntradaDeObjeto | undefined =>
      opcoes?.entradas.find((e) => e.chave === chave);

    // Método
    let metodo: string;
    const forma = funcao.metodo;
    if (forma.onde === "fixo") metodo = forma.valor;
    else {
      const valor = forma.onde === "opcoes" ? entrada(forma.chave)?.valor : args[forma.indice];
      if (valor === undefined) metodo = forma.padrao;
      else {
        const literal = /^["']([A-Z]+)["']$/.exec(valor);
        if (!literal) {
          naoLidas.push(`linha ${linha}: método que não é literal`);
          continue;
        }
        metodo = literal[1]!;
      }
    }

    // Corpo
    const f = funcao.corpo;
    const textoDoCorpo =
      f.onde === "opcoes"
        ? entrada(f.chave)?.valor
        : f.onde === "posicional"
          ? args[f.indice]
          : undefined;
    const corpo = lerCorpo(textoDoCorpo, f.onde === "opcoes" && f.json);

    // Token
    const s = funcao.semToken;
    const semToken =
      s.tipo === "nunca"
        ? false
        : s.tipo === "opcao-verdadeira"
          ? entrada(s.chave)?.valor === "true"
          : s.tipo === "sem-chave"
            ? entrada(s.chave) === undefined
            : !/authorization/i.test(textoDasOpcoes ?? "");

    chamadas.push({
      funcao: funcao.nome,
      linha,
      metodo,
      caminhos: montado.caminhos,
      semToken,
      corpo,
      consulta: montado.consulta,
    });
  }
  return { chamadas, infra, naoLidas };
}

/**
 * A âncora: conta as chamadas sem o extrator, por expressão regular sobre o
 * texto sem comentários. Caminho independente de propósito: se os dois usassem
 * o mesmo código, um defeito nele enganaria os dois juntos.
 */
export function contarChamadas(fonte: string, perfil: Perfil): number {
  const nomes = [...new Set(perfil.funcoes.map((f) => f.nome))].join("|");
  const contador = new RegExp(`(?<![.\\w$])(?:${nomes})\\s*[<(]`, "g");
  return fonte
    .split("\n")
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .reduce((total, l) => total + (l.match(contador)?.length ?? 0), 0);
}

/**
 * Chamada de rede em arquivo que NÃO está nos perfis: o cliente novo que
 * ninguém declarou. Só linhas de código (sem comentário de linha/JSDoc); serve
 * a `.ts` e a `.tsx`.
 */
export function usosDeRedeFora(fonte: string): { linha: number; texto: string }[] {
  return fonte
    .split("\n")
    .map((texto, i) => ({ linha: i + 1, texto }))
    .filter(({ texto }) => !/^\s*(\*|\/\/|\/\*)/.test(texto))
    .filter(({ texto }) =>
      /(?<![\w$])fetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\baxios\b/.test(texto),
    );
}
