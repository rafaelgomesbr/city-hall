import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * A varredura das mensagens que a pessoa lê, sem acento onde o português pede
 * (V2-F00-E09, correção 4, arbitragem da rodada 5).
 *
 * O defeito que a originou: "A senha atual nao confere." saía da API sem acento
 * e o painel a mostrava como estava, em Minha conta e na tela "Defina a sua
 * senha". Os comentários e os identificadores deste repositório, de propósito,
 * não levam acento (`ocorrencia`, `sessao`), então a regra não pode ser "nenhuma
 * palavra sem acento no arquivo": ela precisa saber o que a pessoa LÊ.
 *
 * Por isso a leitura é pela árvore sintática do TypeScript, e não por texto:
 * comentário não é literal de cadeia e nunca entra. E o que entra depende de
 * onde o texto mora:
 *
 * - "mensagens" (a API e o aplicativo de campo): só o que vira frase de erro
 *   para quem está do outro lado. É o argumento de `new RegraDeNegocio`,
 *   `new FalhaAutenticacao`, `new FalhaTemporaria` e `new FalhaPermanente`; o
 *   valor de uma propriedade `mensagem`, `message`, `detalhe`, `titulo`,
 *   `rotulo` ou `aviso`; e o argumento de texto dos métodos de esquema do Zod
 *   (`.min(1, "...")`, `.refine(fn, "...")`). Linha de log e `throw new Error`
 *   são para quem opera o servidor, não para a tela, e ficam de fora.
 * - "tudo" (o painel e o pacote compartilhado): toda frase, porque ali quase
 *   tudo é texto de tela. Ficam de fora a cadeia de uma palavra só (código,
 *   caminho, nome de classe) e o que parece SQL, HTML ou CSS.
 *
 * O dicionário é de palavras que NUNCA se escrevem sem acento ou cedilha em
 * prosa (`nao`, `voce`, `sessao`, `ocorrencia`, qualquer `-cao`). Não é um
 * corretor ortográfico: acha o erro de quem digitou sem acento, que é o erro
 * real que apareceu. Palavra do dicionário que é de fato código (`PUSH_ATIVO=nao`)
 * entra na lista de exceções do teste, com o motivo.
 */

export type Achado = { arquivo: string; linha: number; palavra: string; texto: string };

const PALAVRAS = [
  "nao", "voce", "voces", "tambem", "invalido", "invalida", "invalidos", "invalidas",
  "obrigatorio", "obrigatoria", "ja", "ate", "alem", "apos", "ultimo", "ultima",
  "proximo", "proxima", "pagina", "paginas", "numero", "numeros", "codigo", "codigos",
  "endereco", "enderecos", "municipio", "municipios", "orgao", "orgaos", "servico",
  "servicos", "historico", "disponivel", "indisponivel", "possivel", "impossivel",
  "necessario", "necessaria", "producao", "periodo", "periodos", "relatorio",
  "ocorrencia", "ocorrencias", "referencia", "ausencia", "vigencia", "competencia",
  "excecao", "descricao", "usuario", "usuarios", "unico", "unica", "publico", "publica",
  "provisoria", "provisorio", "duvida", "duvidas", "experiencia", "emergencia",
  "responsavel", "politica", "tecnico", "tecnica", "pratica", "analise", "conexao",
  "entao", "atraves", "porem", "tres", "facil", "dificil", "util", "rapido", "unicos",
];
/*
  `-cao`, `-sao`, `-xao` e os plurais em `-coes`/`-soes`/`-xoes` nunca se escrevem
  sem til em prosa (`sessao`, `autorizacao`, `conexao`). `secretaria`, `historia`
  e `primario` FICAM FORA de propósito: sem acento também é português.
*/
const SUFIXOS = /^[a-z]{2,}(?:cao|coes|sao|soes|xao|xoes)$/;
const DICIONARIO = new Set(PALAVRAS);

/** Só a palavra inteira, em minúsculas ou com a primeira maiúscula: `useSessao` e `NAO_FAZ` não são prosa. */
function ehPalavraDeProsa(palavra: string): boolean {
  return /^[A-Za-z][a-z]*$/.test(palavra);
}

/**
 * Acha, num texto, a primeira palavra que pede acento e vem sem. Devolve `null`
 * quando o texto está limpo.
 */
export function palavraSemAcento(texto: string): string | null {
  for (const pedaco of texto.split(/\s+/)) {
    // Endereço de email, caminho, variável de ambiente e nome de classe não são prosa.
    if (/[@/_=#\-]/.test(pedaco)) continue;
    for (const bruto of pedaco.match(/[A-Za-zÀ-ÿ]+/g) ?? []) {
      if (!ehPalavraDeProsa(bruto)) continue;
      const p = bruto.toLowerCase();
      if (DICIONARIO.has(p) || SUFIXOS.test(p)) return bruto;
    }
  }
  return null;
}

/**
 * Parece SQL, HTML ou CSS, base64, ou é uma cadeia de uma palavra só (código,
 * caminho, nome de classe): não é frase que alguém lê.
 */
function naoEhFraseDeTela(texto: string): boolean {
  const t = texto.trim();
  if (!/\s/.test(t)) return true;
  if (t.split(/\s+/).some((pedaco) => pedaco.length > 40)) return true;
  if (/\b(SELECT|UPDATE|INSERT|DELETE|FROM|WHERE|CREATE|ALTER|RETURNING|VALUES)\b/.test(t)) return true;
  if (/[<>{};]/.test(t)) return true;
  return false;
}

const CONSTRUTORES_DE_ERRO = new Set([
  "RegraDeNegocio", "FalhaAutenticacao", "FalhaTemporaria", "FalhaPermanente",
]);
const PROPRIEDADES_DE_TEXTO = new Set([
  "mensagem", "message", "detalhe", "titulo", "rotulo", "aviso",
]);
const METODOS_DO_ZOD = new Set([
  "min", "max", "length", "regex", "refine", "superRefine", "email", "url", "uuid",
  "startsWith", "endsWith", "includes", "int", "positive", "negative", "nonnegative",
  "nonempty", "datetime", "multipleOf", "finite", "gt", "gte", "lt", "lte", "check",
]);

function textosDe(no: ts.Node): ts.Node[] {
  const achados: ts.Node[] = [];
  const visitar = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
      || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) achados.push(n);
    ts.forEachChild(n, visitar);
  };
  visitar(no);
  return achados;
}

function nomeDaPropriedade(n: ts.PropertyAssignment): string | null {
  const nome = n.name;
  if (ts.isIdentifier(nome) || ts.isStringLiteral(nome)) return nome.text;
  return null;
}

export function varrerFonte(
  arquivo: string, fonte: string, modo: "mensagens" | "tudo",
): Achado[] {
  const sf = ts.createSourceFile(
    arquivo, fonte, ts.ScriptTarget.Latest, true,
    arquivo.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const candidatos = new Set<ts.Node>();

  const visitar = (n: ts.Node) => {
    if (modo === "tudo") {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
        || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)
        || ts.isJsxText(n)) candidatos.add(n);
    } else {
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)
        && CONSTRUTORES_DE_ERRO.has(n.expression.text)) {
        for (const argumento of n.arguments ?? []) textosDe(argumento).forEach((t) => candidatos.add(t));
      }
      if (ts.isPropertyAssignment(n)) {
        const nome = nomeDaPropriedade(n);
        if (nome && PROPRIEDADES_DE_TEXTO.has(nome)) textosDe(n.initializer).forEach((t) => candidatos.add(t));
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && METODOS_DO_ZOD.has(n.expression.name.text)) {
        for (const argumento of n.arguments) {
          if (ts.isStringLiteral(argumento) || ts.isNoSubstitutionTemplateLiteral(argumento)) candidatos.add(argumento);
        }
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);

  const achados: Achado[] = [];
  for (const no of candidatos) {
    const texto = ts.isJsxText(no) ? no.text : (no as ts.StringLiteral).text;
    if (naoEhFraseDeTela(texto)) continue;
    const palavra = palavraSemAcento(texto);
    if (palavra === null) continue;
    const { line } = sf.getLineAndCharacterOfPosition(no.getStart());
    achados.push({ arquivo, linha: line + 1, palavra, texto: texto.replace(/\s+/g, " ").trim().slice(0, 120) });
  }
  return achados.sort((a, b) => a.linha - b.linha);
}

/** Todos os `.ts` e `.tsx` de uma pasta, menos teste, dependência e saída de build. */
export function fontesDe(pasta: string): string[] {
  const saida: string[] = [];
  const andar = (d: string) => {
    for (const nome of readdirSync(d)) {
      if (nome === "node_modules" || nome === "dist" || nome === "test") continue;
      const caminho = join(d, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.tsx?$/.test(nome) && !/\.(test|e2e)\./.test(nome) && !nome.endsWith(".d.ts")) saida.push(caminho);
    }
  };
  andar(pasta);
  return saida;
}

export function varrerPasta(pasta: string, modo: "mensagens" | "tudo"): Achado[] {
  return fontesDe(pasta).flatMap((f) => varrerFonte(f, readFileSync(f, "utf8"), modo));
}
