import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * A varredura que prende o catálogo de códigos de erro (V2-F00-E05, correção 2).
 *
 * Lê o código-fonte pela árvore sintática do TypeScript, e não por expressão
 * regular: `new RegraDeNegocio(\n  "codigo",\n  "...",\n  403,\n)` tem o código
 * numa linha e o status em outra, com parênteses no meio, e foi exatamente o que
 * a leitura por texto da primeira versão deixou passar.
 *
 * Uma "emissão" é qualquer ponto do fonte que faz o servidor responder com um
 * código de erro. As formas conhecidas:
 *
 *   - `<resposta>.code(N).send({ erro: "x", ... })`, e `.status(N)`, e o corpo
 *     passado por uma constante (`send(RESPOSTA_DESLIGADA)`);
 *   - `new RegraDeNegocio("x", mensagem, status = 409)`;
 *   - `new FalhaAutenticacao("x", mensagem)` (429 para `bloqueado`, 401 no resto,
 *     como o tratador global decide);
 *   - classe de erro com `codigo` literal (`readonly codigo = "x" as const`).
 *
 * O que a varredura não entende ela NÃO deixa passar calada: vira `problema`, e o
 * teste reprova. Isso vale para `.code(401 | 403)` fora de uma cadeia com `send`,
 * para `statusCode: 403` escrito à mão, para corpo 401 ou 403 sem `erro` e para
 * código calculado em ponto que não está na lista de repasses conhecidos.
 *
 * ISTO É HEURÍSTICA, a primeira linha. A garantia de que nenhuma resposta 401 ou
 * 403 sai fora do catálogo é a guarda em tempo de execução
 * (`src/guarda-de-codigos-de-erro.ts`): depois das regras abaixo, a revisão
 * independente ainda achou dezesseis formas que esta varredura não lia, e a
 * guarda pega todas as que passam pelo Fastify. O que a guarda não vê (escrita no
 * socket, `raw`, `hijack`, `writeHead`), esta varredura proíbe.
 *
 * Correção 3 (rodada 5, red-team): quatro formas passavam caladas, e cada uma
 * abriu uma família que agora reprova.
 *
 *   - A (`recusa.erro = "x"` depois de declarar) e B (`let recusa = {...}`
 *     reatribuída): o corpo por constante só é lido quando o nome resolve, PELO
 *     ESCOPO, a um `const` não exportado com objeto literal, e todo outro uso
 *     desse nome no arquivo é leitura (`X.campo`, `...X`, outro `send(X)`).
 *     Escrita, `let`/`var`, exportação, passar adiante ou apelidar deixam o corpo
 *     sem leitura. E escrever em `.erro` ou `.corpo` (ponto, colchete, operador
 *     composto, `delete`, `++`, desestruturação) reprova em qualquer lugar.
 *   - C (`resposta["code"](403)["send"]({...})`): colchete com chave literal nos
 *     nomes que a varredura lê com ponto reprova; colchete com chave calculada
 *     chamado como função reprova; `.send` usado sem ser chamado e qualquer
 *     `.call`, `.apply` e `.bind` reprovam (método da resposta tirado do objeto).
 *   - N (`{ code: "FST_ERR_CTP_X", statusCode }` abreviado): `statusCode` em
 *     objeto por abreviação, método ou acessor reprova; chave calculada que não
 *     resolve a um `const` de texto reprova; texto com `FST_` reprova (só o
 *     tratador global LÊ o prefixo do Fastify); e forjar a classe de um erro
 *     (`Object.setPrototypeOf`, `Object.create`, `__proto__`, `extends` de
 *     expressão que não é nome) reprova.
 */

export type FormaDeEmissao = "send" | "RegraDeNegocio" | "FalhaAutenticacao" | "classe" | "recusa";

export type Emissao = {
  arquivo: string;
  linha: number;
  forma: FormaDeEmissao;
  /** O código literal, ou `null` quando é calculado. */
  codigo: string | null;
  /** O texto da expressão do código quando calculado (para a lista de repasses). */
  expressao: string | null;
  /** O que identifica a emissão numa lista de repasses: o código literal ou a expressão. */
  chave: string;
  /** De onde vem o objeto de `X.codigo`: `parametro-do-tratador`, `new:Classe`, `init:texto`, `parametro`. */
  origem?: string | null;
  /** De onde vem o status quando é uma variável: o texto do que a inicializa (`doLeitorDeCorpo.statusCode`). */
  statusOrigem?: string | null;
  /** O status literal, ou `null` quando não dá para saber pelo texto. */
  status: number | null;
};

export type Problema = {
  arquivo: string;
  linha: number;
  problema: string;
  /** Para a lista de repasses: a expressão do corpo que a varredura não resolveu, quando é o caso. */
  chave: string | null;
  /** Para a lista de repasses: onde o objeto aparece (`chamada:resolver`, quando é argumento de `resolver(...)`). */
  origem?: string | null;
};

export type Varredura = { emissoes: Emissao[]; problemas: Problema[] };

function textoDoLiteral(no: ts.Node | undefined): string | null {
  if (!no) return null;
  let atual = no;
  // `"x" as const`, `("x")` e `<const>"x"`.
  while (ts.isAsExpression(atual) || ts.isParenthesizedExpression(atual) || ts.isTypeAssertionExpression(atual)) {
    atual = atual.expression;
  }
  if (ts.isStringLiteral(atual) || ts.isNoSubstitutionTemplateLiteral(atual)) return atual.text;
  return null;
}

function numeroDoLiteral(no: ts.Node | undefined): number | null {
  if (!no) return null;
  let atual = no;
  while (ts.isAsExpression(atual) || ts.isParenthesizedExpression(atual)) atual = atual.expression;
  return ts.isNumericLiteral(atual) ? Number(atual.text) : null;
}

function nomeDaPropriedade(nome: ts.PropertyName): string | null {
  if (ts.isIdentifier(nome) || ts.isStringLiteral(nome) || ts.isNoSubstitutionTemplateLiteral(nome)) return nome.text;
  // `["statusCode"]: 403`
  if (ts.isComputedPropertyName(nome)) {
    const lit = textoDoLiteral(nome.expression);
    if (lit !== null) return lit;
    // `[CHAVE]: ...` com `const CHAVE = "x"` no escopo: é o texto dele.
    if (ts.isIdentifier(nome.expression)) return textoDeConstante(nome.expression);
  }
  return null;
}

/** O texto de um identificador que resolve, pelo escopo, a `const X = "texto"`. */
function textoDeConstante(id: ts.Identifier): string | null {
  const d = resolverDeclaracao(id.text, id);
  if (!d || !ts.isVariableDeclaration(d) || !ehConst(d)) return null;
  return textoDoLiteral(d.initializer);
}

function ehConst(d: ts.VariableDeclaration): boolean {
  return ts.isVariableDeclarationList(d.parent) && (d.parent.flags & ts.NodeFlags.Const) !== 0;
}

/** Tira `as`, parênteses, `!`, `satisfies` e `<T>` de volta de uma expressão. */
function desembrulhar(e: ts.Expression): ts.Expression {
  let x = e;
  while (
    ts.isAsExpression(x) || ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x)
    || ts.isSatisfiesExpression(x) || ts.isTypeAssertionExpression(x)
  ) x = x.expression;
  return x;
}

/**
 * O nó é ALVO de escrita: lado esquerdo de qualquer atribuição (`=`, `+=`, `??=`...),
 * operando de `delete`, `++` ou `--`, ou alvo dentro de uma desestruturação
 * (`[x.erro] = ...`, `({ a: x.erro } = ...)`, `for (x.erro of ...)`).
 */
function ehAlvoDeEscrita(n: ts.Node): boolean {
  let filho: ts.Node = n;
  let pai: ts.Node | undefined = n.parent;
  // Sobe pelos invólucros e pelos literais de desestruturação.
  while (pai && (
    ts.isParenthesizedExpression(pai) || ts.isAsExpression(pai) || ts.isNonNullExpression(pai)
    || ts.isSatisfiesExpression(pai) || ts.isTypeAssertionExpression(pai)
    || ts.isArrayLiteralExpression(pai) || ts.isObjectLiteralExpression(pai)
    || ts.isPropertyAssignment(pai) || ts.isShorthandPropertyAssignment(pai)
    || ts.isSpreadElement(pai) || ts.isSpreadAssignment(pai)
  )) {
    if (ts.isPropertyAssignment(pai) && pai.initializer !== filho) return false;
    filho = pai;
    pai = pai.parent;
  }
  if (!pai) return false;
  const direto = filho === n || ts.isParenthesizedExpression(filho) || ts.isAsExpression(filho)
    || ts.isNonNullExpression(filho) || ts.isSatisfiesExpression(filho) || ts.isTypeAssertionExpression(filho);
  if (ts.isBinaryExpression(pai) && pai.left === filho
    && pai.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && pai.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
    return true;
  }
  if ((ts.isForOfStatement(pai) || ts.isForInStatement(pai)) && pai.initializer === filho) return true;
  if (!direto) return false;
  if (ts.isDeleteExpression(pai)) return true;
  if ((ts.isPrefixUnaryExpression(pai) || ts.isPostfixUnaryExpression(pai))
    && (pai.operator === ts.SyntaxKind.PlusPlusToken || pai.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  return false;
}

/** O nome que um acesso `x.nome` ou `x["nome"]` (chave literal) lê; `null` para chave calculada. */
function nomeDoAcesso(n: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(n)) return n.name.text;
  if (ts.isElementAccessExpression(n)) return textoDoLiteral(n.argumentExpression);
  return null;
}

/**
 * Os nomes que a varredura lê pela forma com ponto. Pelo colchete com chave literal
 * (`resposta["code"](403)`) ela não os segue, então o colchete com eles reprova.
 */
const LIDOS_COM_PONTO = new Set([
  "send", "code", "status", "statusCode", "erro", "codigo", "corpo", "raw", "hijack", "writeHead",
  "addHook", "setErrorHandler", "httpErrors", "assign", "defineProperty", "defineProperties",
  "setPrototypeOf", "create", "call", "apply", "bind", "__proto__", "prototype", "constructor", "serializer",
  "socket", "connection",
]);

/** Nomes que trocam o corpo ou o código fora do que a varredura lê; aparecer em qualquer lugar reprova. */
const TROCAM_O_CORPO = new Set(["toJSON", "setReplySerializer", "setSerializerCompiler", "eval"]);

/** O spread que não pode sobrescrever `erro`: objeto literal sem `erro`, ou condicional de dois assim. */
function espalhoSeguro(e: ts.Expression): boolean {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x)) x = x.expression;
  if (ts.isConditionalExpression(x)) return espalhoSeguro(x.whenTrue) && espalhoSeguro(x.whenFalse);
  if (!ts.isObjectLiteralExpression(x)) return false;
  return x.properties.every((p) => {
    if (ts.isShorthandPropertyAssignment(p)) return p.name.text !== "erro";
    if (ts.isPropertyAssignment(p)) {
      const n = nomeDaPropriedade(p.name);
      return n !== null && n !== "erro";
    }
    return false;
  });
}

/** Há spread DEPOIS de `erro` que pode sobrescrevê-lo (`{ erro: "x", ...extra }`). */
function espalhoQueSobrescreve(objeto: ts.ObjectLiteralExpression): boolean {
  let viuErro = false;
  for (const p of objeto.properties) {
    if ((ts.isPropertyAssignment(p) && nomeDaPropriedade(p.name) === "erro") || (ts.isShorthandPropertyAssignment(p) && p.name.text === "erro")) viuErro = true;
    else if (viuErro && ts.isSpreadAssignment(p) && !espalhoSeguro(p.expression)) return true;
  }
  return false;
}

/** A declaração mais próxima de `nome`, subindo pelos escopos a partir de `no`. */
function resolverDeclaracao(nome: string, no: ts.Node): ts.Node | null {
  for (let a: ts.Node | undefined = no.parent; a; a = a.parent) {
    if (ts.isFunctionLike(a)) {
      const par = a.parameters.find((q) => ts.isIdentifier(q.name) && q.name.text === nome);
      if (par) return par;
    }
    if (ts.isCatchClause(a) && a.variableDeclaration && ts.isIdentifier(a.variableDeclaration.name) && a.variableDeclaration.name.text === nome) return a.variableDeclaration;
    if (ts.isBlock(a) || ts.isSourceFile(a) || ts.isModuleBlock(a) || ts.isCaseClause(a) || ts.isDefaultClause(a)) {
      for (const st of a.statements) {
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === nome) return d;
        }
      }
    }
  }
  return null;
}

/** De onde vem o objeto `nome` de `nome.codigo`. */
function origemDoObjeto(nome: string, no: ts.Node): string {
  const d = resolverDeclaracao(nome, no);
  if (!d) return "sem-declaracao";
  if (ts.isParameter(d)) {
    const fn = d.parent;
    const chamada = fn.parent;
    const primeiro = ts.isFunctionLike(fn) && fn.parameters[0] === d;
    if (primeiro && chamada && ts.isCallExpression(chamada) && ts.isPropertyAccessExpression(chamada.expression) && chamada.expression.name.text === "setErrorHandler") {
      return "parametro-do-tratador";
    }
    return "parametro";
  }
  if (ts.isVariableDeclaration(d) && d.initializer) {
    let i = d.initializer;
    while (ts.isParenthesizedExpression(i) || ts.isAsExpression(i)) i = i.expression;
    if (ts.isNewExpression(i)) return `new:${ultimoNome(i.expression) ?? "?"}`;
    return `init:${i.getText()}`;
  }
  return "outro";
}

/** O texto que inicializa a variável `nome` (para o status que o Fastify decide). */
function inicializadorDe(nome: string, no: ts.Node): string | null {
  const d = resolverDeclaracao(nome, no);
  return d && ts.isVariableDeclaration(d) && d.initializer ? d.initializer.getText() : null;
}

/**
 * Acha a propriedade `erro` de um objeto literal. `undefined` quando não há;
 * `"ilegivel"` quando há `erro` por getter, setter ou método, ou chave calculada
 * que não resolve (`{ [k]: "x" }`), porque aí o texto não diz qual é o código.
 * Vale a ÚLTIMA ocorrência, como no JavaScript.
 */
function propriedadeErro(objeto: ts.ObjectLiteralExpression): ts.Expression | undefined | "espalhado" | "ilegivel" {
  let achado: ts.Expression | undefined;
  for (const p of objeto.properties) {
    if (ts.isSpreadAssignment(p)) continue;
    const n = ts.isShorthandPropertyAssignment(p) ? p.name.text : p.name ? nomeDaPropriedade(p.name) : null;
    if (n === null) return "ilegivel";
    if (n !== "erro") continue;
    if (ts.isPropertyAssignment(p)) achado = p.initializer;
    // `{ erro }` abreviado: o código é uma variável.
    else if (ts.isShorthandPropertyAssignment(p)) achado = p.name;
    else return "ilegivel";
  }
  if (achado) return achado;
  return objeto.properties.some(ts.isSpreadAssignment) ? "espalhado" : undefined;
}

type Familia = "RegraDeNegocio" | "FalhaAutenticacao";

/**
 * As classes de erro de negócio que a varredura segue: as duas bases, as
 * subclasses (`class X extends RegraDeNegocio`, em qualquer arquivo e em
 * qualquer profundidade) e os nomes sob os quais elas são importadas ou
 * reexportadas (`import { RegraDeNegocio as R }`). `base` é verdadeiro para a
 * própria classe base ou um apelido dela (`new R(...)` emite o código); falso
 * para subclasse (quem emite é o `super(...)` dela).
 */
export type Rastreadas = Map<string, { familia: Familia; base: boolean }>;

const BASES: ReadonlyArray<Familia> = ["RegraDeNegocio", "FalhaAutenticacao"];

/** O último nome de uma expressão `A`, `A.B` ou `A.B.C`; `null` para qualquer outra coisa. */
function ultimoNome(e: ts.Expression): string | null {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** Junta as classes rastreadas de vários fontes, até não achar mais nenhuma (ponto fixo). */
export function rastrearClasses(fontes: ReadonlyArray<{ fonte: string; nome: string }>): Rastreadas {
  const mapa: Rastreadas = new Map(BASES.map((b) => [b, { familia: b, base: true }] as const));
  const arvores = fontes.map(({ fonte, nome }) => ts.createSourceFile(nome, fonte, ts.ScriptTarget.Latest, true));
  let mudou = true;
  while (mudou) {
    mudou = false;
    const incluir = (nomeLocal: string, origem: string) => {
      const o = mapa.get(origem);
      if (!o || mapa.has(nomeLocal)) return;
      mapa.set(nomeLocal, { familia: o.familia, base: o.base });
      mudou = true;
    };
    const visitar = (no: ts.Node): void => {
      if (ts.isImportSpecifier(no) && no.propertyName) incluir(no.name.text, no.propertyName.text);
      if (ts.isExportSpecifier(no) && no.propertyName) incluir(no.name.text, no.propertyName.text);
      if (ts.isClassDeclaration(no) || ts.isClassExpression(no)) {
        const pai = no.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
        const nomePai = pai ? ultimoNome(pai.expression) : null;
        const origem = nomePai ? mapa.get(nomePai) : undefined;
        if (origem && no.name && !mapa.has(no.name.text)) {
          mapa.set(no.name.text, { familia: origem.familia, base: false });
          mudou = true;
        }
      }
      ts.forEachChild(no, visitar);
    };
    for (const sf of arvores) visitar(sf);
  }
  return mapa;
}

/**
 * Varre UM arquivo. `nome` só aparece nos achados. `rastreadas` vem de
 * `rastrearClasses` sobre a pasta inteira; sem ele, vale só este fonte.
 */
export function varrerFonte(fonte: string, nome: string, rastreadas?: Rastreadas): Varredura {
  const rastr = rastreadas ?? rastrearClasses([{ fonte, nome }]);
  const sf = ts.createSourceFile(nome, fonte, ts.ScriptTarget.Latest, true);
  const emissoes: Emissao[] = [];
  const problemas: Problema[] = [];
  const linhaDe = (no: ts.Node) => sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;
  const problema = (no: ts.Node, texto: string, chave: string | null = null, origem: string | null = null) =>
    problemas.push({ arquivo: nome, linha: linhaDe(no), problema: texto, chave, origem });

  /**
   * Correção 4 (rodada 6): o status que o Node escreve é `statusCode | 0`, então
   * `403.5`, `"403"`, `"403.2"` e `-4294966893` saem como 403 no fio, e a regra que
   * comparava o literal com 401 e 403 os via como "outro status". No lugar de um
   * status (`code`, `status`, terceiro argumento de `RegraDeNegocio`, `{ status }`,
   * `statusCode`, `redirect`), literal em texto, número não inteiro, fora de 100 a
   * 599 ou com sinal reprova.
   */
  const conferirLiteralDeStatus = (no: ts.Node | undefined): void => {
    if (!no) return;
    let atual = no;
    while (ts.isAsExpression(atual) || ts.isParenthesizedExpression(atual) || ts.isTypeAssertionExpression(atual)
      || ts.isSatisfiesExpression(atual) || ts.isNonNullExpression(atual)) atual = atual.expression;
    if (ts.isStringLiteral(atual) || ts.isNoSubstitutionTemplateLiteral(atual) || ts.isTemplateExpression(atual)) {
      problema(no, `status em texto (\`${no.getText(sf)}\`): o Node o converte com \`| 0\` e a varredura não o compara com 401 e 403`);
      return;
    }
    if (ts.isPrefixUnaryExpression(atual) && ts.isNumericLiteral(atual.operand)) {
      problema(no, `status com sinal (\`${no.getText(sf)}\`): o Node o converte com \`| 0\` e pode escrever 401 ou 403`);
      return;
    }
    if (ts.isNumericLiteral(atual)) {
      const n = Number(atual.text);
      if (!Number.isInteger(n) || n < 100 || n > 599) {
        problema(no, `status ${atual.text} não é número inteiro de 100 a 599: o Node escreve ${n | 0}`);
      }
    }
  };

  /**
   * O corpo passado por nome (`send(RESPOSTA_X)`), resolvido PELO ESCOPO (um
   * parâmetro homônimo não vira a constante do módulo). Só é lido quando é um
   * `const` não exportado com objeto literal e todo outro uso do nome no arquivo é
   * leitura: `X.campo` ou `X["campo"]` sem escrita, `...X`, outro `send(X)` ou
   * `typeof X`. Qualquer outra coisa (escrita em campo, `let`/`var`, exportação,
   * passar a uma função, apelidar, `as` com escrita) pode trocar o `erro` sem o
   * texto mostrar, e o corpo fica sem leitura (formas A e B do red-team).
   */
  const identificadores: ts.Identifier[] = [];
  const juntar = (no: ts.Node): void => {
    if (ts.isIdentifier(no)) identificadores.push(no);
    ts.forEachChild(no, juntar);
  };
  juntar(sf);
  const ehSendDe = (id: ts.Node): boolean => {
    const pai = id.parent;
    return ts.isCallExpression(pai) && pai.arguments[0] === id
      && ts.isPropertyAccessExpression(pai.expression) && pai.expression.name.text === "send";
  };
  /** O identificador é uma REFERÊNCIA a variável (não nome de propriedade, de chave ou de declaração). */
  const ehReferencia = (id: ts.Identifier): boolean => {
    const p = id.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)
      || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isPropertySignature(p)
      || ts.isMethodSignature(p) || ts.isEnumMember(p)) && p.name === id) return false;
    if (ts.isQualifiedName(p) && p.right === id) return false;
    if (ts.isVariableDeclaration(p) && p.name === id) return false;
    if ((ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isParameter(p)
      || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isBindingElement(p)) && p.name === id) return false;
    if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false;
    if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
    // Posição de tipo (`typeof X` num tipo) não existe em tempo de execução.
    if (ts.isTypeReferenceNode(p) || ts.isTypeQueryNode(p)) return false;
    return true;
  };
  const usoDeLeitura = (id: ts.Identifier): boolean => {
    const p = id.parent;
    if (ehSendDe(id)) return true;
    // `{ ...X }` copia: o objeto novo é lido à parte, com a regra do spread.
    if (ts.isSpreadAssignment(p)) return true;
    if (ts.isTypeOfExpression(p)) return true;
    if ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === id) {
      // `X.campo` lido; `X.campo = ...`, `delete X.campo`, `X[k] = ...` não.
      if (ehAlvoDeEscrita(p)) return false;
      // `X.campo.metodo(...)` pode mexer no campo (um array em `campos`), mas não no `erro`, que é texto.
      return true;
    }
    return false;
  };
  function corpoPorNome(id: ts.Identifier): { objeto: ts.ObjectLiteralExpression } | { motivo: string } {
    const d = resolverDeclaracao(id.text, id);
    if (!d) return { motivo: "o nome não resolve a uma declaração deste arquivo" };
    if (!ts.isVariableDeclaration(d)) return { motivo: "o nome é um parâmetro ou variável de captura, não uma constante" };
    if (!ehConst(d)) return { motivo: "o nome é `let` ou `var` e pode ser reatribuído" };
    const init = d.initializer ? desembrulhar(d.initializer) : undefined;
    if (!init || !ts.isObjectLiteralExpression(init)) return { motivo: "a constante não é um objeto literal" };
    const declaracao = d.parent.parent;
    if (ts.isVariableStatement(declaracao) && declaracao.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      return { motivo: "a constante é exportada e pode ser escrita em outro arquivo" };
    }
    for (const outro of identificadores) {
      if (outro === id || outro.text !== id.text || !ehReferencia(outro)) continue;
      if (resolverDeclaracao(outro.text, outro) !== d) continue;
      if (!usoDeLeitura(outro)) {
        return { motivo: `a constante é usada na linha ${linhaDe(outro)} de um jeito que não é só leitura (\`${outro.parent.getText(sf).slice(0, 60)}\`)` };
      }
    }
    return { objeto: init };
  }

  /** Os `.code(N)` e `.status(N)` que pertencem a uma cadeia terminada em `send`. */
  const codesDeCadeiaComSend = new Set<ts.Node>();

  /** Sobe pela cadeia `a.b(...).c(...).send(...)` e devolve o status de `code`/`status`. */
  function statusDaCadeia(send: ts.CallExpression): { status: number | null; achou: boolean; argumento: ts.Expression | null } {
    let atual: ts.Expression = (send.expression as ts.PropertyAccessExpression).expression;
    let status: number | null = null;
    let achou = false;
    let argumento: ts.Expression | null = null;
    while (true) {
      if (ts.isCallExpression(atual) && ts.isPropertyAccessExpression(atual.expression)) {
        const metodo = atual.expression.name.text;
        if ((metodo === "code" || metodo === "status") && atual.arguments.length === 1) {
          codesDeCadeiaComSend.add(atual);
          // O que vale é o `code` mais perto do `send` (o último aplicado), e é o primeiro que a
          // subida encontra. `code(403).code(200)` é 200; `code(200).code(403)` é 403 (M11 da revisão).
          if (!achou) {
            status = numeroDoLiteral(atual.arguments[0]);
            argumento = atual.arguments[0] ?? null;
          }
          achou = true;
        }
        atual = atual.expression.expression;
        continue;
      }
      if (ts.isPropertyAccessExpression(atual)) { atual = atual.expression; continue; }
      break;
    }
    return { status, achou, argumento };
  }

  const visitar = (no: ts.Node): void => {
    // 1. `<...>.send(corpo)`.
    if (
      ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)
      && no.expression.name.text === "send"
    ) {
      const { status, achou, argumento } = statusDaCadeia(no);
      let corpo: ts.Expression | undefined = no.arguments[0];
      while (corpo && (ts.isAsExpression(corpo) || ts.isParenthesizedExpression(corpo))) corpo = corpo.expression;
      let objeto: ts.ObjectLiteralExpression | null = null;
      let semLeitura = "";
      if (corpo && ts.isObjectLiteralExpression(corpo)) objeto = corpo;
      else if (corpo && ts.isIdentifier(corpo)) {
        const r = corpoPorNome(corpo);
        if ("objeto" in r) objeto = r.objeto;
        else semLeitura = `: ${r.motivo}`;
      }

      const dentroDoFamiliaDeAcesso = !achou || status === null || status === 401 || status === 403;
      if (objeto) {
        const erro = propriedadeErro(objeto);
        if (erro === undefined) {
          if (status === 401 || status === 403) problema(no, `resposta ${status} sem a propriedade \`erro\``);
        } else if (erro === "espalhado") {
          if (dentroDoFamiliaDeAcesso && achou) problema(no, "corpo com spread e sem `erro` literal em resposta de acesso");
        } else if (erro === "ilegivel") {
          if (dentroDoFamiliaDeAcesso) problema(no, "corpo com `erro` por getter, setter ou método, ou com chave calculada: a varredura não lê o código");
        } else {
          const codigo = textoDoLiteral(erro);
          let origem: string | null = null;
          if (codigo === null && ts.isPropertyAccessExpression(erro) && ts.isIdentifier(erro.expression)) {
            origem = origemDoObjeto(erro.expression.text, erro);
          }
          const statusOrigem = argumento && ts.isIdentifier(argumento) ? inicializadorDe(argumento.text, argumento) : null;
          emissoes.push({
            arquivo: nome, linha: linhaDe(no), forma: "send", codigo,
            expressao: codigo === null ? erro.getText(sf) : null,
            chave: codigo ?? erro.getText(sf), status: achou ? status : null, origem, statusOrigem,
          });
          if (dentroDoFamiliaDeAcesso && espalhoQueSobrescreve(objeto)) {
            problema(no, "spread depois de `erro` pode sobrescrever o código da resposta de acesso");
          }
        }
      } else if (achou && (status === 401 || status === 403)) {
        problema(no, `resposta ${status} com corpo que a varredura não resolve (\`${corpo?.getText(sf) ?? ""}\`)${semLeitura}`, corpo?.getText(sf) ?? "");
      } else if (achou && status === null && corpo) {
        // Status calculado e corpo opaco: pode ser um erro de acesso.
        problema(no, `resposta com status calculado e corpo que a varredura não resolve (\`${corpo.getText(sf)}\`)${semLeitura}`, corpo.getText(sf));
      }
    }

    // 2. `new RegraDeNegocio(...)`, `new FalhaAutenticacao(...)`, com apelido de importação ou
    // espaço de nomes (`new S.RegraDeNegocio`), e `super(...)` das subclasses.
    const emitirDeConstrucao = (no2: ts.Node, familia: Familia, args: ReadonlyArray<ts.Expression>, forma: "RegraDeNegocio" | "FalhaAutenticacao") => {
      if (args.some(ts.isSpreadElement)) {
        problema(no2, "argumentos espalhados (`...x`) na construção de um erro: a varredura não vê o código nem o status");
      }
      const codigo = textoDoLiteral(args[0]);
      if (familia === "RegraDeNegocio") {
        if (args.length >= 3) conferirLiteralDeStatus(args[2]);
        const status = args.length >= 3 ? numeroDoLiteral(args[2]) : 409;
        emissoes.push({
          arquivo: nome, linha: linhaDe(no2), forma, codigo,
          expressao: codigo === null ? (args[0]?.getText(sf) ?? "") : null,
          chave: codigo ?? (args[0]?.getText(sf) ?? ""), status,
        });
      } else {
        emissoes.push({
          arquivo: nome, linha: linhaDe(no2), forma, codigo,
          expressao: codigo === null ? (args[0]?.getText(sf) ?? "") : null,
          chave: codigo ?? (args[0]?.getText(sf) ?? ""),
          status: codigo === null ? null : codigo === "bloqueado" ? 429 : 401,
        });
      }
    };
    if (ts.isNewExpression(no)) {
      const nomeDaClasse = ultimoNome(no.expression);
      const r = nomeDaClasse ? rastr.get(nomeDaClasse) : undefined;
      if (r?.base) emitirDeConstrucao(no, r.familia, no.arguments ?? [], r.familia);
    }
    if (ts.isCallExpression(no) && no.expression.kind === ts.SyntaxKind.SuperKeyword) {
      let classe: ts.Node | undefined = no.parent;
      while (classe && !ts.isClassDeclaration(classe) && !ts.isClassExpression(classe)) classe = classe.parent;
      const pai = classe?.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
      const nomePai = pai ? ultimoNome(pai.expression) : null;
      const r = nomePai ? rastr.get(nomePai) : undefined;
      if (r) emitirDeConstrucao(no, r.familia, no.arguments, r.familia);
    }

    // 2b. Qualquer outro uso do nome de uma classe rastreada (atribuir a variável, passar como valor,
    // `Reflect.construct`) é uma forma que a varredura não segue: reprova.
    if (ts.isIdentifier(no) && rastr.has(no.text)) {
      let ref: ts.Node = no;
      if (ts.isPropertyAccessExpression(no.parent) && no.parent.name === no) ref = no.parent;
      const pai = ref.parent;
      const permitido =
        (ts.isNewExpression(pai) && pai.expression === ref)
        || ts.isExpressionWithTypeArguments(pai)
        || (ts.isBinaryExpression(pai) && pai.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && pai.right === ref)
        || ts.isImportSpecifier(pai) || ts.isExportSpecifier(pai) || ts.isImportClause(pai)
        || ts.isTypeReferenceNode(pai) || ts.isTypeQueryNode(pai)
        || ((ts.isClassDeclaration(pai) || ts.isClassExpression(pai)) && pai.name === no)
        // `S.RegraDeNegocio` como cabeça de `new S.RegraDeNegocio`, ou como parte de um nome qualificado de tipo.
        || ts.isQualifiedName(pai);
      if (!permitido) {
        problema(no, `uso de \`${no.text}\` que a varredura não segue (só \`new\`, \`extends\`, \`instanceof\`, importação e tipo)`);
      }
    }

    // 3. Classe de erro com `codigo`: literal na declaração (`readonly codigo = "x" as const`),
    // atribuído no construtor (`this.codigo = ...`), por getter ou por propriedade de parâmetro.
    // O que não é literal vira emissão calculada (chave `Classe.codigo`), que só passa por repasse.
    if (ts.isClassDeclaration(no) || ts.isClassExpression(no)) {
      const nomeDaClasse = no.name?.text ?? "(anônima)";
      let status: number | null = null;
      for (const membro of no.members) {
        if (ts.isPropertyDeclaration(membro) && ts.isIdentifier(membro.name) && membro.name.text === "status" && membro.initializer) {
          status = numeroDoLiteral(membro.initializer);
        }
      }
      const ehSubclasse = ((): boolean => {
        const pai = no.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
        const n2 = pai ? ultimoNome(pai.expression) : null;
        return n2 !== null && rastr.has(n2);
      })();
      for (const membro of no.members) {
        const nm = (ts.isPropertyDeclaration(membro) || ts.isGetAccessorDeclaration(membro) || ts.isMethodDeclaration(membro))
          ? nomeDaPropriedade(membro.name) : null;
        if (nm !== "status" && nm !== "statusCode") continue;
        const lit = ts.isPropertyDeclaration(membro) ? numeroDoLiteral(membro.initializer) : null;
        if (ehSubclasse || lit === 401 || lit === 403 || nm === "statusCode") {
          problema(membro, `\`${nm}\` declarado na classe de erro: a varredura não vê o status dessa resposta`);
        }
      }
      const emitirClasse = (expr: ts.Expression | undefined, ponto: ts.Node) => {
        const lit = textoDoLiteral(expr);
        emissoes.push({
          arquivo: nome, linha: linhaDe(ponto), forma: "classe", codigo: lit,
          expressao: lit === null ? `${nomeDaClasse}.codigo` : null,
          chave: lit ?? `${nomeDaClasse}.codigo`, status,
        });
      };
      for (const membro of no.members) {
        if (ts.isPropertyDeclaration(membro) && ts.isIdentifier(membro.name) && membro.name.text === "codigo" && membro.initializer) {
          emitirClasse(membro.initializer, membro);
        }
        if (ts.isGetAccessorDeclaration(membro) && ts.isIdentifier(membro.name) && membro.name.text === "codigo") {
          let achouRetorno = false;
          const procurar = (n: ts.Node): void => {
            if (ts.isReturnStatement(n)) { achouRetorno = true; emitirClasse(n.expression, n); }
            if (!ts.isFunctionLike(n) || n === membro) ts.forEachChild(n, procurar);
          };
          procurar(membro);
          if (!achouRetorno) emitirClasse(undefined, membro);
        }
        if (ts.isConstructorDeclaration(membro)) {
          for (const par of membro.parameters) {
            if (ts.isIdentifier(par.name) && par.name.text === "codigo" && (par.modifiers?.length ?? 0) > 0) {
              emitirClasse(par.initializer, par);
            }
          }
          const procurarAtribuicao = (n: ts.Node): void => {
            if (
              ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
              && ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === ts.SyntaxKind.ThisKeyword
              && n.left.name.text === "codigo"
            ) emitirClasse(n.right, n);
            ts.forEachChild(n, procurarAtribuicao);
          };
          if (membro.body) procurarAtribuicao(membro.body);
        }
      }
    }

    // 3b. `{ status: 403, corpo: { erro: "x", ... } }`: a recusa montada numa função e
    // enviada depois por `send(recusa.corpo)` (o console do fornecedor faz assim). Todo par
    // `status` + `corpo` tem de ter o corpo literal; status calculado vira "não resolvido".
    if (ts.isObjectLiteralExpression(no)) {
      let temStatus = false;
      let statusDoPar: number | null = null;
      let corpoDoPar: ts.Expression | null = null;
      let noDoStatus: ts.Expression | undefined;
      for (const p of no.properties) {
        if (ts.isShorthandPropertyAssignment(p)) {
          if (p.name.text === "status") temStatus = true;
          if (p.name.text === "corpo") corpoDoPar = p.name;
          continue;
        }
        if (!ts.isPropertyAssignment(p)) continue;
        const n = nomeDaPropriedade(p.name);
        if (n === "status") { temStatus = true; statusDoPar = numeroDoLiteral(p.initializer); noDoStatus = p.initializer; }
        if (n === "corpo") corpoDoPar = p.initializer;
      }
      if (temStatus && corpoDoPar) {
        conferirLiteralDeStatus(noDoStatus);
        let corpo: ts.Expression = corpoDoPar;
        while (ts.isAsExpression(corpo) || ts.isParenthesizedExpression(corpo)) corpo = corpo.expression;
        if (!ts.isObjectLiteralExpression(corpo)) {
          const pai = no.parent;
          const origemDoPar = ts.isCallExpression(pai) && ts.isIdentifier(pai.expression) ? `chamada:${pai.expression.text}` : null;
          problema(no, `par { status, corpo } com corpo que a varredura não resolve (\`${corpo.getText(sf)}\`)`, `par:${corpo.getText(sf)}`, origemDoPar);
        } else {
          const erro = propriedadeErro(corpo);
          if (erro === undefined || erro === "espalhado" || erro === "ilegivel") {
            if (statusDoPar === null || statusDoPar === 401 || statusDoPar === 403) problema(no, "par { status, corpo } sem `erro` literal em resposta de acesso", `par:${corpo.getText(sf)}`);
          } else {
            const codigo = textoDoLiteral(erro);
            emissoes.push({
              arquivo: nome, linha: linhaDe(no), forma: "recusa", codigo,
              expressao: codigo === null ? erro.getText(sf) : null,
              chave: codigo ?? erro.getText(sf), status: statusDoPar,
            });
          }
        }
      }
    }

    // 3c. Erros do Fastify montados por fora do tratador: `app.httpErrors.forbidden()`,
    // `createError(...)` e `statusCode = 403` declarado na classe.
    if (ts.isPropertyAccessExpression(no) && no.name.text === "httpErrors") {
      problema(no, "`httpErrors` do Fastify: a varredura não vê o código dessa resposta");
    }
    if (ts.isCallExpression(no) && ts.isIdentifier(no.expression) && no.expression.text === "createError") {
      problema(no, "`createError(...)`: a varredura não vê o código dessa resposta");
    }
    if (ts.isPropertyDeclaration(no) && no.initializer && ts.isIdentifier(no.name) && no.name.text === "statusCode") {
      const n = numeroDoLiteral(no.initializer);
      if (n === 401 || n === 403) problema(no, `\`statusCode = ${n}\` declarado na classe: a varredura não vê o código dessa resposta`);
    }

    // 3d. Escrita direta na resposta do Node: o corpo não passa por `send` e a varredura não o vê.
    if (ts.isPropertyAccessExpression(no) && no.name.text === "raw") {
      problema(no, "`.raw`: escrita direta na resposta do Node, a varredura não vê o código dessa resposta");
    }
    // O socket da requisição: escrever nele é responder sem passar pelo Fastify, e é a única forma que a
    // guarda em tempo de execução não vê (M08 da revisão). Qualquer `.socket` ou `.connection` reprova.
    if (ts.isPropertyAccessExpression(no) && (no.name.text === "socket" || no.name.text === "connection")) {
      problema(no, `\`.${no.name.text}\`: escrita direta no socket, que nem a guarda em tempo de execução vê`, `socket:${no.getText(sf)}`);
    }
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)
      && (no.expression.name.text === "hijack" || no.expression.name.text === "writeHead")) {
      problema(no, `\`.${no.expression.name.text}()\`: escrita direta na resposta, a varredura não vê o código dessa resposta`);
    }

    // 3e. Ganchos que reescrevem o corpo ou a resposta, e remendos de objeto que mudam código ou status.
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)) {
      const m = no.expression.name.text;
      if (m === "addHook") {
        const tipo = textoDoLiteral(no.arguments[0]);
        const cb = no.arguments[1];
        if (tipo === "onSend" || tipo === "preSerialization" || tipo === "onError" || tipo === "onRequest" || tipo === "preHandler" || tipo === "preValidation" || tipo === "preParsing" || tipo === "onResponse" || tipo === null) {
          const funcao = cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) ? cb : null;
          let reescreve = !funcao || tipo === null;
          if (funcao && (tipo === "onSend" || tipo === "preSerialization") && funcao.parameters.length >= 3) reescreve = true;
          if (funcao) {
            const procurar = (n: ts.Node): void => {
              if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ["send", "code", "status"].includes(n.expression.name.text)) reescreve = true;
              if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && rastr.has(n.expression.text)) reescreve = true;
              ts.forEachChild(n, procurar);
            };
            procurar(funcao);
          }
          if (reescreve) problema(no, `gancho \`${tipo ?? "calculado"}\` que reescreve a resposta ou lança erro de negócio: a varredura não vê o código dessa resposta`, `gancho:${tipo ?? "calculado"}:${cb?.getText(sf) ?? ""}`);
        }
      }
      if ((m === "assign" || m === "defineProperty" || m === "defineProperties") && ts.isIdentifier(no.expression.expression) && no.expression.expression.text === "Object") {
        problema(no, `\`Object.${m}\`: remenda código ou status de um erro sem passar pelo que a varredura lê`);
      }
    }
    if (
      ts.isBinaryExpression(no) && no.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isElementAccessExpression(no.left)
    ) {
      const chave = textoDoLiteral(no.left.argumentExpression);
      const n = numeroDoLiteral(no.right);
      if (chave === "statusCode" || chave === "status" || chave === "codigo" || chave === "erro" || (chave === null && (n === 401 || n === 403))) {
        problema(no, `atribuição por colchete (\`[${chave ?? "calculado"}]\`) de ${chave ?? "status"}: a varredura não vê o código dessa resposta`);
      }
    }

    // 3f. `Reflect.*` sobre erro (set, defineProperty, construct) não é lido.
    if (ts.isIdentifier(no) && no.text === "Reflect" && !ts.isImportSpecifier(no.parent)) {
      problema(no, "`Reflect`: muda ou constrói erro sem passar pelo que a varredura lê");
    }
    // Atribuição ao `codigo` de um erro fora do construtor reconhecido (S3), e reatribuição do parâmetro do
    // tratador global (S1), que faria o repasse `erro.codigo` valer para outra coisa.
    if (ts.isBinaryExpression(no) && no.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && no.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const esq = no.left;
      if (ts.isPropertyAccessExpression(esq) && esq.name.text === "codigo") {
        let alvo: ts.Expression = esq.expression;
        while (ts.isParenthesizedExpression(alvo) || ts.isAsExpression(alvo) || ts.isNonNullExpression(alvo)) alvo = alvo.expression;
        let fn: ts.Node | undefined = no.parent;
        while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
        const noConstrutor = alvo.kind === ts.SyntaxKind.ThisKeyword && fn !== undefined && ts.isConstructorDeclaration(fn);
        if (!noConstrutor) problema(no, "atribuição ao `codigo` de um erro fora do construtor: a varredura não vê o código dessa resposta");
      }
      if (ts.isIdentifier(esq) && origemDoObjeto(esq.text, esq) === "parametro-do-tratador") {
        problema(no, `reatribuição de \`${esq.text}\`, o parâmetro do tratador global: o repasse de \`${esq.text}.codigo\` deixaria de valer`);
      }
    }

    // 4. `statusCode: 403` escrito à mão (erro do Fastify com status próprio).
    if (ts.isPropertyAssignment(no) && nomeDaPropriedade(no.name) === "statusCode") {
      conferirLiteralDeStatus(no.initializer);
      const n = numeroDoLiteral(no.initializer);
      if (n === null || n === 401 || n === 403) problema(no, `\`statusCode: ${n ?? "calculado"}\` escrito à mão: a varredura não vê o código dessa resposta`);
    }
    if (
      ts.isBinaryExpression(no) && no.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(no.left)
      && (no.left.name.text === "statusCode" || no.left.name.text === "status")
    ) {
      conferirLiteralDeStatus(no.right);
      const n = numeroDoLiteral(no.right);
      // `this.status = status` no construtor de uma classe de erro é o campo que o tratador lê; o
      // código dessa classe é varrido à parte. Só o literal 401 ou 403 ali é uma resposta de acesso.
      const campoDaClasse = no.left.expression.kind === ts.SyntaxKind.ThisKeyword && no.left.name.text === "status";
      if (campoDaClasse ? (n === 401 || n === 403) : (n === null || n === 401 || n === 403)) problema(no, `atribuição de status ${n ?? "calculado"} fora de \`code(...)\`: a varredura não vê o código dessa resposta`);
    }

    // 6. Correção 3 (rodada 5): as famílias das formas A, B, C e N do red-team.

    // 6a. Escrita no `erro` ou no `corpo` de um objeto, por qualquer forma (A): ponto, colchete literal,
    // operador composto, `delete`, `++`, desestruturação. E, para `status`, `statusCode` e `codigo`, a
    // escrita que não é o `=` simples que as regras acima já leem.
    {
      const alvo = nomeDoAcesso(no);
      if (alvo !== null && (ts.isPropertyAccessExpression(no) || ts.isElementAccessExpression(no)) && ehAlvoDeEscrita(no)) {
        const pai = no.parent;
        const simples = ts.isBinaryExpression(pai) && pai.left === no && pai.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        if (alvo === "erro" || alvo === "corpo") {
          problema(no, `escrita em \`${alvo}\` de um objeto (\`${no.getText(sf)}\`): o código da resposta pode mudar sem o texto mostrar`);
        } else if ((alvo === "status" || alvo === "statusCode" || alvo === "codigo") && !simples) {
          problema(no, `escrita em \`${alvo}\` por operador composto, \`delete\`, \`++\` ou desestruturação: a varredura não vê o valor`);
        }
      }
    }

    // 6b. Colchete (C). Chave literal com um nome que a varredura só lê com ponto, ou com o nome de uma
    // classe de erro rastreada (`S["RegraDeNegocio"]`), reprova. Chave calculada chamada como função
    // (`resposta[metodo](403)`) reprova: pode ser `code`, `status` ou `send`.
    if (ts.isElementAccessExpression(no)) {
      const chave = textoDoLiteral(no.argumentExpression);
      if (chave !== null && (LIDOS_COM_PONTO.has(chave) || rastr.has(chave) || chave === "Reflect")) {
        problema(no, `acesso por colchete a \`${chave}\` (\`${no.getText(sf)}\`): a varredura só lê esse nome com ponto`);
      }
      const pai = no.parent;
      if (chave === null && !ts.isNumericLiteral(no.argumentExpression) && ts.isCallExpression(pai) && pai.expression === no) {
        problema(no, `chamada por chave calculada (\`${no.getText(sf)}(...)\`): a varredura não sabe qual método é`, `colchete:${no.getText(sf)}`);
      }
    }

    // 6c. O método tirado da resposta (C): `.send` usado sem ser chamado, e qualquer `.call`, `.apply` ou
    // `.bind`, que chamam um método fora da forma `x.metodo(...)` que a varredura lê. A única exceção é
    // `Object.prototype.hasOwnProperty.call`, que só pergunta se a chave existe.
    if (ts.isPropertyAccessExpression(no)) {
      const m = no.name.text;
      const pai = no.parent;
      if (m === "send" && !(ts.isCallExpression(pai) && pai.expression === no)) {
        problema(no, `\`.send\` usado sem ser chamado (\`${pai.getText(sf).slice(0, 60)}\`): a varredura não segue o método guardado`);
      }
      if ((m === "call" || m === "apply" || m === "bind") && no.expression.getText(sf) !== "Object.prototype.hasOwnProperty") {
        problema(no, `\`.${m}\` (\`${no.getText(sf)}\`): chama um método fora da forma \`x.metodo(...)\` que a varredura lê`);
      }
    }

    // 6d. `statusCode` em objeto literal por abreviação (N), método, getter ou setter: o valor não é um
    // literal que a varredura leia. (Por propriedade, a regra 4 já lê o literal.)
    if (ts.isObjectLiteralExpression(no)) {
      for (const p of no.properties) {
        if (ts.isSpreadAssignment(p) || ts.isPropertyAssignment(p)) continue;
        const n = ts.isShorthandPropertyAssignment(p) ? p.name.text : p.name ? nomeDaPropriedade(p.name) : null;
        if (n === "statusCode") {
          problema(p, "`statusCode` abreviado, por método ou por acessor: a varredura não vê o status desse erro");
        }
      }
    }

    // 6e. Chave calculada que não resolve a um `const` de texto, em objeto ou classe: pode ser `statusCode`,
    // `erro` ou `codigo` sem o texto mostrar.
    if (ts.isComputedPropertyName(no) && !ts.isNumericLiteral(no.expression) && nomeDaPropriedade(no) === null) {
      let fn: ts.Node | undefined = no.parent;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      const nomeDaFuncao = fn && ts.isFunctionLike(fn) && fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)
        ? fn.parent.name.text
        : fn && (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name && ts.isIdentifier(fn.name) ? fn.name.text : null;
      problema(no, `chave calculada (\`${no.getText(sf)}\`): a varredura não sabe que nome é`, `chave:${no.expression.getText(sf)}`, nomeDaFuncao ? `funcao:${nomeDaFuncao}` : null);
    }

    // 6f. O prefixo dos erros do Fastify (N). O tratador global repassa o status de um erro cujo `code`
    // começa com `FST_ERR_CTP_`; escrever esse texto à mão forja um. Só LER o prefixo é conferido
    // (`x.startsWith("FST_ERR_CTP_")`, repasse no teste).
    if (
      (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no) || ts.isTemplateHead(no)
        || ts.isTemplateMiddle(no) || ts.isTemplateTail(no))
      && no.text.includes("FST_")
    ) {
      const pai = no.parent;
      const origem = ts.isCallExpression(pai) && ts.isPropertyAccessExpression(pai.expression) && pai.arguments[0] === no
        ? `chamada:${pai.expression.name.text}` : null;
      problema(no, `texto com \`FST_\` (\`${no.getText(sf)}\`): forja o código de um erro do Fastify, cujo status o tratador repassa`, `literal:${no.text}`, origem);
    }

    // 6g. Forjar a classe de um erro: um objeto qualquer que passa no `instanceof` do tratador sai com o
    // `codigo` e o `status` dele, sem `new` que a varredura leia.
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)
      && ts.isIdentifier(no.expression.expression) && no.expression.expression.text === "Object"
      && (no.expression.name.text === "setPrototypeOf" || no.expression.name.text === "create")) {
      problema(no, `\`Object.${no.expression.name.text}\`: forja a classe de um objeto sem \`new\` que a varredura leia`);
    }
    if ((ts.isIdentifier(no) || ts.isStringLiteral(no)) && no.text === "__proto__") {
      problema(no, "`__proto__`: forja a classe de um objeto sem `new` que a varredura leia");
    }
    // 6h. O que troca o corpo DEPOIS do `send`, sem gancho: `toJSON` (o `JSON.stringify` do Fastify usa
    // o que ele devolve no lugar do objeto), o serializador da resposta (`setReplySerializer`,
    // `setSerializerCompiler`, `resposta.serializer(...)`), e código montado em texto (`eval`, `Function`).
    if ((ts.isIdentifier(no) || ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) && TROCAM_O_CORPO.has(no.text)) {
      problema(no, `\`${no.text}\`: troca o corpo ou o código sem passar pelo que a varredura lê`);
    }
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && no.expression.name.text === "serializer") {
      problema(no, "`.serializer(...)`: serializa a resposta por uma função que a varredura não lê");
    }
    // `resposta.redirect(url, status)` (Fastify 5) também escolhe o status, com corpo vazio: só o 3xx
    // literal passa.
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && no.expression.name.text === "redirect"
      && no.arguments.length !== 1) {
      conferirLiteralDeStatus(no.arguments[1]);
      const n = numeroDoLiteral(no.arguments[1]);
      if (n === null || n < 300 || n > 399) problema(no, `\`.redirect(...)\` com status ${n ?? "calculado"}: resposta sem \`erro\``);
    }
    if ((ts.isNewExpression(no) || ts.isCallExpression(no)) && ts.isIdentifier(no.expression) && no.expression.text === "Function") {
      problema(no, "`Function(...)`: código montado em texto, que a varredura não lê");
    }
    if (ts.isHeritageClause(no) && no.token === ts.SyntaxKind.ExtendsKeyword && (ts.isClassDeclaration(no.parent) || ts.isClassExpression(no.parent))) {
      for (const t of no.types) {
        let e: ts.Expression = t.expression;
        while (ts.isPropertyAccessExpression(e)) e = e.expression;
        if (!ts.isIdentifier(e)) problema(t, `\`extends\` de uma expressão (\`${t.getText(sf)}\`): a varredura não sabe de que classe é`);
      }
    }

    // 7. Correção 4 (rodada 6): status que o Node escreve como 401 ou 403 sem estar escrito assim.
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)
      && ["code", "status", "writeHead"].includes(no.expression.name.text) && no.arguments.length >= 1) {
      conferirLiteralDeStatus(no.arguments[0]);
    }
    if (ts.isPropertyDeclaration(no) && no.initializer && nomeDaPropriedade(no.name) !== null
      && (nomeDaPropriedade(no.name) === "status" || nomeDaPropriedade(no.name) === "statusCode")) {
      conferirLiteralDeStatus(no.initializer);
    }
    // Em qualquer lugar: o número que vira 401 ou 403 pelo `| 0` do Node sem ser 401 ou 403
    // (`403.5`, `401.9`, `4294967699`, `-4294966893`), mesmo guardado numa constante.
    if (ts.isNumericLiteral(no)) {
      const negativo = ts.isPrefixUnaryExpression(no.parent) && no.parent.operator === ts.SyntaxKind.MinusToken;
      const v = (negativo ? -1 : 1) * Number(no.text);
      if ((v | 0) !== v && ((v | 0) === 401 || (v | 0) === 403)) {
        problema(no, `número ${negativo ? "-" : ""}${no.text} que o Node escreve como ${v | 0} num status: só 401 ou 403 escritos assim`);
      }
    }

    ts.forEachChild(no, visitar);
  };
  visitar(sf);

  // 5. `.code(401|403)` que não está numa cadeia com `send`.
  const orfaos = (no: ts.Node): void => {
    if (
      ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)
      && (no.expression.name.text === "code" || no.expression.name.text === "status")
      && no.arguments.length === 1 && !codesDeCadeiaComSend.has(no)
    ) {
      const n = numeroDoLiteral(no.arguments[0]);
      if (n === null || n === 401 || n === 403) {
        problema(no, `\`.${no.expression.name.text}(${n ?? no.arguments[0]?.getText(sf)})\` fora de uma cadeia com \`send\`: a varredura não vê o código`);
      }
    }
    ts.forEachChild(no, orfaos);
  };
  orfaos(sf);

  return { emissoes, problemas };
}

/** Todos os `.ts` de uma pasta, sem entrar em `node_modules` nem em `dist`. */
export function fontesDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    if (nome === "node_modules" || nome === "dist") return [];
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? fontesDe(caminho) : caminho.endsWith(".ts") ? [caminho] : [];
  });
}

export function varrerPasta(...pastas: string[]): Varredura {
  const fontes = pastas.flatMap(fontesDe).map((arquivo) => ({ arquivo, fonte: readFileSync(arquivo, "utf8") }));
  const rastreadas = rastrearClasses(fontes.map(({ arquivo, fonte }) => ({ nome: arquivo, fonte })));
  const todas: Varredura = { emissoes: [], problemas: [] };
  for (const { arquivo, fonte } of fontes) {
    const v = varrerFonte(fonte, arquivo, rastreadas);
    todas.emissoes.push(...v.emissoes);
    todas.problemas.push(...v.problemas);
  }
  return todas;
}

/**
 * Um ponto que a varredura não resolve sozinha e que alguém conferiu: o código
 * calculado que repassa o de uma classe já varrida, ou o status que o Fastify
 * decide. `chave` é o código literal ou a expressão, como a varredura a vê.
 */
export type Repasse = {
  /**
   * `chave: "*"` libera o ARQUIVO INTEIRO. Só serve para o módulo da própria guarda
   * em tempo de execução, que mexe na resposta do Node de propósito e é provado pelos
   * testes dela, não por esta varredura.
   */
  arquivo: RegExp; chave: string; porque: string;
  /** Exige que o objeto de `X.codigo` venha de onde foi conferido (`parametro-do-tratador`, `new:Classe`). */
  origem?: string;
  /** Exige que o status seja uma variável inicializada exatamente por este texto. */
  statusOrigem?: string;
};

export type RegrasDeConferencia = {
  /** Código -> status que ele tem de ter. Um status ou vários. */
  catalogo: Readonly<Record<string, number | readonly number[]>>;
  /** Códigos aceitos além do catálogo (a entrada, ou o contrato do console). */
  aceitosAlemDoCatalogo: Readonly<Record<string, number | readonly number[]>>;
  repasses: readonly Repasse[];
};

const lista = (s: number | readonly number[]): readonly number[] => (typeof s === "number" ? [s] : s);

/**
 * O que reprova. Escopo: resposta de acesso, isto é, status 401, 403 ou que o
 * texto não resolve. Os demais status (404, 409, 422, 429, 5xx) são da F02-E03.
 */
export function reprovacoes(v: Varredura, regras: RegrasDeConferencia): string[] {
  const falhas: string[] = [];
  const onde = (e: { arquivo: string; linha: number }) => `${e.arquivo.replace(/^.*[\\/]src[\\/]/, "src/")}:${e.linha}`;
  const aceitos = { ...regras.aceitosAlemDoCatalogo, ...regras.catalogo };

  const repassado = (e: { arquivo: string; chave: string | null; origem?: string | null; statusOrigem?: string | null }) =>
    regras.repasses.some((r) => r.arquivo.test(e.arquivo) && r.chave === "*")
    || e.chave !== null && regras.repasses.some((r) =>
      r.arquivo.test(e.arquivo) && r.chave === e.chave
      && (r.origem === undefined || r.origem === e.origem)
      && (r.statusOrigem === undefined || r.statusOrigem === e.statusOrigem));

  for (const p of v.problemas) {
    if (!repassado(p)) falhas.push(`${onde(p)}: ${p.problema}`);
  }

  for (const e of v.emissoes) {
    const acesso = e.status === null || e.status === 401 || e.status === 403;
    if (e.codigo === null) {
      if (!acesso) continue;
      if (!repassado(e)) {
        falhas.push(
          `${onde(e)}: código calculado (\`${e.expressao}\`) em resposta de acesso (status ${e.status ?? "não resolvido"}), `
          + "fora da lista de repasses conhecidos",
        );
      }
      continue;
    }
    // O código do catálogo sai sempre com o status do catálogo, em qualquer faixa.
    const doCatalogo = regras.catalogo[e.codigo];
    if (doCatalogo !== undefined && e.status !== null && !lista(doCatalogo).includes(e.status)) {
      falhas.push(`${onde(e)}: \`${e.codigo}\` sai com status ${e.status}, o catálogo diz ${lista(doCatalogo).join(" ou ")}`);
      continue;
    }
    if (!acesso) continue;
    // Status que só o Fastify decide: o repasse diz por que não é 401 nem 403.
    if (e.status === null && repassado(e)) continue;
    const esperado = aceitos[e.codigo];
    if (esperado === undefined) {
      falhas.push(
        `${onde(e)}: código \`${e.codigo}\` (${e.forma}, status ${e.status ?? "não resolvido"}) `
        + "em resposta de acesso e fora do catálogo",
      );
    } else if (e.status !== null && !lista(esperado).includes(e.status)) {
      falhas.push(`${onde(e)}: \`${e.codigo}\` sai com status ${e.status}, o contrato diz ${lista(esperado).join(" ou ")}`);
    }
  }
  return falhas;
}

/** Códigos do catálogo (ou da lista aceita) que nenhuma emissão literal produz. */
export function codigosMortos(v: Varredura, codigos: readonly string[]): string[] {
  const emitidos = new Set(v.emissoes.flatMap((e) => (e.codigo === null ? [] : [e.codigo])));
  return codigos.filter((c) => !emitidos.has(c));
}
