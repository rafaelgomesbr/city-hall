import ts from "typescript";

/**
 * A VARREDURA DOS ENVIOS DE ERRO POR `.code(N).send(...)` (V2-F02-E03, correção 1).
 *
 * `varredura-de-erros.ts` lê o código de cada emissão, mas devolve `codigo:
 * null` quando o `erro` não é literal, e nenhum filtro reprovava isso; também
 * não olhava a FORMA do corpo. Aqui o critério é o da etapa: toda resposta de
 * erro escrita por `<resposta>.code(N).send(corpo)` (ou `.status(N)`), com N
 * maior ou igual a 400, tem de ter
 *
 *   - corpo objeto literal (ou nome de um `const` do mesmo arquivo com objeto
 *     literal), nunca texto, lista ou expressão calculada;
 *   - `erro` com texto literal DO CATÁLOGO (o chamador confere o catálogo);
 *   - `mensagem` presente, e nenhuma chave fora de `erro`, `mensagem`, `campos`,
 *     `requisicao`, `categoria` (`message` no lugar de `mensagem` reprova);
 *   - status N literal.
 *
 * O que sai do critério só entra por uma lista de exceções curta, justificada e
 * nomeada por arquivo e expressão (o tratador central, que repassa um código já
 * tipado por `RegraDeNegocio`). A lista mora no teste.
 *
 * Fora do alcance, de propósito: o que não passa por `.code(N).send(...)`
 * (escrita no `raw`, que `varredura-de-erros.ts` proíbe, e `reply.send` sem
 * status na mesma cadeia, que não diz se é erro).
 */

export type ViolacaoDeEnvio = { arquivo: string; linha: number; problema: string; chave: string };

export const CHAVES_DO_CORPO_DE_ERRO = [
  "erro",
  "mensagem",
  "campos",
  "requisicao",
  "categoria",
] as const;

const ELOS_DA_CADEIA = new Set([
  "header",
  "headers",
  "type",
  "removeHeader",
  "trailer",
  "serializer",
]);

function textoLiteral(n: ts.Expression): string | null {
  return ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null;
}

function nomeDaChave(p: ts.ObjectLiteralElementLike): string | null {
  if (!p.name) return null;
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text;
  return null;
}

/** O objeto literal do corpo, ou o de um `const` do arquivo com esse nome. */
function objetoDoCorpo(
  arg: ts.Expression,
  fonte: ts.SourceFile,
): ts.ObjectLiteralExpression | null {
  if (ts.isObjectLiteralExpression(arg)) return arg;
  if (ts.isIdentifier(arg)) {
    for (const st of fonte.statements) {
      if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === arg.text && d.initializer) {
          const init = ts.isAsExpression(d.initializer) ? d.initializer.expression : d.initializer;
          if (ts.isObjectLiteralExpression(init)) return init;
        }
      }
    }
  }
  return null;
}

/** Os valores literais que o status pode ter (número, ou `cond ? 200 : 201`), ou `null` se não se sabe. */
function valoresDoStatus(n: ts.Expression | undefined): number[] | null {
  if (!n) return null;
  if (ts.isNumericLiteral(n)) return [Number(n.text)];
  if (ts.isParenthesizedExpression(n)) return valoresDoStatus(n.expression);
  if (ts.isConditionalExpression(n)) {
    const a = valoresDoStatus(n.whenTrue);
    const b = valoresDoStatus(n.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

/** O que o corpo é, em poucas palavras: `nome()` quando é uma chamada, senão o começo do texto. */
function textoDoCorpo(corpo: ts.Expression | undefined, fonte: ts.SourceFile): string {
  if (!corpo) return "";
  if (ts.isCallExpression(corpo)) return `${corpo.expression.getText(fonte)}()`;
  return corpo.getText(fonte).replace(/\s+/g, " ").slice(0, 40);
}

export type Envio = {
  linha: number;
  status: number | null;
  /** O texto do status quando não é literal. */
  statusExpressao: string;
  erro: string | null;
  /** O texto da expressão de `erro` quando não é literal. */
  erroExpressao: string | null;
  /** As chaves do corpo, em ordem alfabética, separadas por vírgula. */
  corpoChaves: string;
  /** O começo do texto do corpo (para dizer o que é, quando não é objeto literal). */
  corpoTexto: string;
  problemas: string[];
};

/** Todos os envios de erro (`code`/`status` com N >= 400 literal, ou N que não se sabe) de um arquivo. */
export function lerEnviosDeErro(texto: string, nome: string): Envio[] {
  const fonte = ts.createSourceFile(nome, texto, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const achados: Envio[] = [];
  const linhaDe = (n: ts.Node) => fonte.getLineAndCharacterOfPosition(n.getStart(fonte)).line + 1;

  const visitar = (no: ts.Node): void => {
    if (
      ts.isCallExpression(no) &&
      ts.isPropertyAccessExpression(no.expression) &&
      no.expression.name.text === "send"
    ) {
      // Sobe a cadeia: send <- (header|type|...)* <- code|status
      let atual: ts.Expression = no.expression.expression;
      let statusCall: ts.CallExpression | null = null;
      while (ts.isCallExpression(atual) && ts.isPropertyAccessExpression(atual.expression)) {
        const m = atual.expression.name.text;
        if (m === "code" || m === "status") {
          statusCall = atual;
          break;
        }
        if (!ELOS_DA_CADEIA.has(m)) break;
        atual = atual.expression.expression;
      }
      if (statusCall !== null) {
        const argStatus = statusCall.arguments[0];
        const valores = valoresDoStatus(argStatus);
        const status = valores ? Math.max(...valores) : null;
        const problemas: string[] = [];
        let erro: string | null = null;
        let erroExpressao: string | null = null;
        let corpoChaves = "";
        if (status === null || status >= 400) {
          if (status === null) problemas.push("status não literal");
          const corpo = no.arguments[0];
          const objeto = corpo ? objetoDoCorpo(corpo, fonte) : null;
          if (!corpo) problemas.push("send sem corpo");
          else if (!objeto) {
            problemas.push("corpo que não é objeto literal");
          } else {
            const chaves = new Set<string>();
            for (const p of objeto.properties) {
              if (ts.isSpreadAssignment(p)) {
                problemas.push("spread no corpo de erro");
                continue;
              }
              const k = nomeDaChave(p);
              if (k === null) {
                problemas.push("chave calculada no corpo de erro");
                continue;
              }
              chaves.add(k);
              if (!(CHAVES_DO_CORPO_DE_ERRO as readonly string[]).includes(k)) {
                problemas.push(
                  `chave \`${k}\` fora de { erro, mensagem, campos?, requisicao?, categoria? }`,
                );
              }
              if (k === "erro") {
                if (ts.isPropertyAssignment(p)) {
                  erro = textoLiteral(p.initializer);
                  if (erro === null) erroExpressao = p.initializer.getText(fonte);
                } else {
                  erroExpressao = k; // `{ erro }` abreviado
                }
              }
            }
            corpoChaves = [...chaves].sort().join(",");
            if (!chaves.has("erro")) problemas.push("corpo sem `erro`");
            if (!chaves.has("mensagem")) problemas.push("corpo sem `mensagem`");
          }
        }
        achados.push({
          linha: linhaDe(no),
          status,
          statusExpressao: argStatus ? argStatus.getText(fonte) : "",
          erro,
          erroExpressao,
          corpoChaves,
          corpoTexto: textoDoCorpo(no.arguments[0], fonte),
          problemas,
        });
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return achados.filter((e) => e.status === null || e.status >= 400);
}

export type ExcecaoDeEnvio = { arquivo: RegExp; chave: string; porque: string };

/**
 * O que reprova: problema de forma, `erro` não literal, `erro` fora do catálogo.
 * A `chave` de uma exceção é, conforme o problema: o texto de `erro` quando não
 * é literal (`erro.codigo`), `status:<expressão>` para o status calculado,
 * `corpo:<chaves>` para o corpo de forma diferente (a sonda de prontidão) e
 * `corpo-texto:<início do corpo>` para o corpo que não é objeto (a página HTML).
 */
export function reprovacoesDeEnvio(
  texto: string,
  nome: string,
  ehCodigoDoCatalogo: (c: string) => boolean,
  excecoes: readonly ExcecaoDeEnvio[],
): ViolacaoDeEnvio[] {
  const falhas: ViolacaoDeEnvio[] = [];
  const liberado = (chave: string) =>
    excecoes.some((x) => x.arquivo.test(nome) && x.chave === chave);
  for (const e of lerEnviosDeErro(texto, nome)) {
    const naoLiteral = e.erro === null && e.erroExpressao !== null;
    for (const p of e.problemas) {
      let chave: string;
      if (p === "status não literal") chave = `status:${e.statusExpressao}`;
      else if (p === "corpo que não é objeto literal") chave = `corpo-texto:${e.corpoTexto}`;
      else if (naoLiteral)
        chave = e.erroExpressao!; // o corpo do tratador central: `erro.codigo`, com spread de `campos`
      else chave = `corpo:${e.corpoChaves}`;
      if (!liberado(chave)) falhas.push({ arquivo: nome, linha: e.linha, problema: p, chave });
    }
    if (e.erro !== null && !ehCodigoDoCatalogo(e.erro)) {
      falhas.push({
        arquivo: nome,
        linha: e.linha,
        problema: `código \`${e.erro}\` fora do catálogo`,
        chave: e.erro,
      });
    }
    if (naoLiteral && !liberado(e.erroExpressao!)) {
      falhas.push({
        arquivo: nome,
        linha: e.linha,
        problema: `\`erro\` não literal (\`${e.erroExpressao}\`)`,
        chave: e.erroExpressao!,
      });
    }
  }
  return falhas;
}
