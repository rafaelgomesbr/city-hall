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
  }
  return null;
}

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

/** Acha a propriedade `erro` de um objeto literal. `undefined` quando não há. */
function propriedadeErro(objeto: ts.ObjectLiteralExpression): ts.Expression | undefined | "espalhado" {
  for (const p of objeto.properties) {
    if (ts.isPropertyAssignment(p) && nomeDaPropriedade(p.name) === "erro") return p.initializer;
    // `{ erro }` abreviado: o código é uma variável.
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === "erro") return p.name;
  }
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

  // Constantes de corpo de erro: `const RESPOSTA_X = { erro: "x", mensagem: "..." }`.
  const constantes = new Map<string, ts.ObjectLiteralExpression>();
  const coletar = (no: ts.Node): void => {
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.initializer) {
      let init: ts.Expression = no.initializer;
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      if (ts.isObjectLiteralExpression(init)) constantes.set(no.name.text, init);
    }
    ts.forEachChild(no, coletar);
  };
  coletar(sf);

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
          status = numeroDoLiteral(atual.arguments[0]);
          argumento = atual.arguments[0] ?? null;
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
      if (corpo && ts.isObjectLiteralExpression(corpo)) objeto = corpo;
      else if (corpo && ts.isIdentifier(corpo)) objeto = constantes.get(corpo.text) ?? null;

      const dentroDoFamiliaDeAcesso = !achou || status === null || status === 401 || status === 403;
      if (objeto) {
        const erro = propriedadeErro(objeto);
        if (erro === undefined) {
          if (status === 401 || status === 403) problema(no, `resposta ${status} sem a propriedade \`erro\``);
        } else if (erro === "espalhado") {
          if (dentroDoFamiliaDeAcesso && achou) problema(no, "corpo com spread e sem `erro` literal em resposta de acesso");
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
        problema(no, `resposta ${status} com corpo que a varredura não resolve (\`${corpo?.getText(sf) ?? ""}\`)`, corpo?.getText(sf) ?? "");
      } else if (achou && status === null && corpo) {
        // Status calculado e corpo opaco: pode ser um erro de acesso.
        problema(no, `resposta com status calculado e corpo que a varredura não resolve (\`${corpo.getText(sf)}\`)`, corpo.getText(sf));
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
      for (const p of no.properties) {
        if (ts.isShorthandPropertyAssignment(p)) {
          if (p.name.text === "status") temStatus = true;
          if (p.name.text === "corpo") corpoDoPar = p.name;
          continue;
        }
        if (!ts.isPropertyAssignment(p)) continue;
        const n = nomeDaPropriedade(p.name);
        if (n === "status") { temStatus = true; statusDoPar = numeroDoLiteral(p.initializer); }
        if (n === "corpo") corpoDoPar = p.initializer;
      }
      if (temStatus && corpoDoPar) {
        let corpo: ts.Expression = corpoDoPar;
        while (ts.isAsExpression(corpo) || ts.isParenthesizedExpression(corpo)) corpo = corpo.expression;
        if (!ts.isObjectLiteralExpression(corpo)) {
          const pai = no.parent;
          const origemDoPar = ts.isCallExpression(pai) && ts.isIdentifier(pai.expression) ? `chamada:${pai.expression.text}` : null;
          problema(no, `par { status, corpo } com corpo que a varredura não resolve (\`${corpo.getText(sf)}\`)`, `par:${corpo.getText(sf)}`, origemDoPar);
        } else {
          const erro = propriedadeErro(corpo);
          if (erro === undefined || erro === "espalhado") {
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
          if (reescreve) problema(no, `gancho \`${tipo ?? "calculado"}\` que reescreve a resposta ou lança erro de negócio: a varredura não vê o código dessa resposta`);
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
      const n = numeroDoLiteral(no.initializer);
      if (n === null || n === 401 || n === 403) problema(no, `\`statusCode: ${n ?? "calculado"}\` escrito à mão: a varredura não vê o código dessa resposta`);
    }
    if (
      ts.isBinaryExpression(no) && no.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(no.left)
      && (no.left.name.text === "statusCode" || no.left.name.text === "status")
    ) {
      const n = numeroDoLiteral(no.right);
      // `this.status = status` no construtor de uma classe de erro é o campo que o tratador lê; o
      // código dessa classe é varrido à parte. Só o literal 401 ou 403 ali é uma resposta de acesso.
      const campoDaClasse = no.left.expression.kind === ts.SyntaxKind.ThisKeyword && no.left.name.text === "status";
      if (campoDaClasse ? (n === 401 || n === 403) : (n === null || n === 401 || n === 403)) problema(no, `atribuição de status ${n ?? "calculado"} fora de \`code(...)\`: a varredura não vê o código dessa resposta`);
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
    e.chave !== null && regras.repasses.some((r) =>
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
