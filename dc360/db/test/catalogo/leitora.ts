/**
 * A LEITORA de `origens_de_conta` conferida por LISTA PERMITIDA (ADR 0009,
 * decisão 1, correção 6; junção do lote 1 da F03).
 *
 * O verificador adiado da origem do `pessoa_id` é uma função separada, a única
 * que pode LER a marca sem ser escritora. A garantia de que ela só lê não vem
 * de enumerar efeitos (notificação, trava consultiva, `set_config`, sequência,
 * função auxiliar, escrita desfeita: a sexta revisão mostrou que um contador
 * sempre deixa um de fora), e sim do corpo: o `prosrc`, normalizado, só pode
 * ter as construções abaixo, e qualquer outra coisa reprova, inclusive a
 * inofensiva que o conferidor não reconhece (falha fechada):
 *
 *   - `DECLARE` com variáveis de tipo `uuid`, `text` ou `xid8`, sem valor
 *     inicial (os tipos são uma lista nominal: nenhum tipo do usuário, e por
 *     isso nenhuma conversão ou operador do usuário alcançado por variável);
 *   - `SELECT a.col, ... INTO var, ... FROM public.<origens_de_conta | pessoas>
 *     <apelido> WHERE <condição> [LIMIT 1]`, com o filtro pela chave da
 *     própria conta (`<apelido>.usuario_id = NEW.id`, ou `<apelido>.id =
 *     NEW.pessoa_id` em `pessoas`) ou da própria transação
 *     (`<apelido>.transacao = pg_current_xact_id()`, no gatilho de comando),
 *     e, dentro da condição, só `[NOT] EXISTS (SELECT 1 FROM public.usuarios
 *     <apelido> WHERE <condição>)`; todo destino de `INTO` é variável declarada;
 *   - `IF <condição> THEN ... END IF`, sem `ELSE` nem `ELSIF`;
 *   - `RAISE EXCEPTION USING <opção> = '<literal>'`, só com literais (os
 *     adjacentes contam como um), opções `ERRCODE`, `MESSAGE`, `DETAIL`,
 *     `HINT`, `CONSTRAINT`, `TABLE` e `COLUMN`;
 *   - `RETURN NULL` e `RETURN NEW`.
 *
 * Na condição: as variáveis declaradas, `FOUND`, `TG_RELID`, `TG_OP`,
 * `TG_NAME`, `TG_WHEN`, `TG_LEVEL`, `NEW.<coluna>`, as colunas dos apelidos
 * do próprio comando, literais (e `'<literal>'::regclass`, a única conversão),
 * `=`, `<>`, `AND`, `OR`, `NOT`, `IS [NOT] [DISTINCT FROM] NULL`, parênteses,
 * e só as funções `pg_current_xact_id()` e `coalesce(...)`.
 *
 * A normalização tira comentários e espaços e PRESERVA os literais (um `--`
 * dentro de um literal é texto, não comentário). Identificador entre aspas,
 * literal com prefixo (`E'...'`, `U&'...'`) e texto entre cifrões reprovam.
 */

/** Os tipos que a leitora pode declarar (Codex, sétima leitura da ADR 0009). */
export const TIPOS_DA_LEITORA = ["uuid", "text", "xid8"] as const;

/** O `search_path` que a leitora fixa (correção 6). */
export const SEARCH_PATH_DA_LEITORA = "search_path=pg_catalog, public, pg_temp";

type Simbolo =
  | { readonly t: "lit"; readonly v: string }
  | { readonly t: "id"; readonly v: string }
  | { readonly t: "num"; readonly v: string }
  | { readonly t: "op"; readonly v: string };

const OPERADORES = ["::", "<>", "!=", "<=", ">=", ":=", "||", "->", "=>"];

/** Quebra o corpo em símbolos, tirando comentários e preservando os literais. */
export function simbolosDoCorpo(corpo: string): { simbolos: Simbolo[]; erros: string[] } {
  const simbolos: Simbolo[] = [];
  const erros: string[] = [];
  let i = 0;
  const n = corpo.length;
  while (i < n) {
    const c = corpo[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (corpo.startsWith("--", i)) {
      const fim = corpo.indexOf("\n", i);
      i = fim < 0 ? n : fim + 1;
      continue;
    }
    if (corpo.startsWith("/*", i)) {
      const fim = corpo.indexOf("*/", i + 2);
      if (fim < 0) {
        erros.push("comentário de bloco sem fim");
        break;
      }
      i = fim + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let valor = "";
      for (;;) {
        if (j >= n) {
          erros.push("literal sem fim");
          return { simbolos, erros };
        }
        if (corpo[j] === "'") {
          if (corpo[j + 1] === "'") {
            valor += "'";
            j += 2;
            continue;
          }
          break;
        }
        valor += corpo[j];
        j++;
      }
      const anterior = simbolos[simbolos.length - 1];
      // Literais adjacentes (separados só por espaço e quebra de linha) são um só.
      if (anterior?.t === "lit") {
        simbolos[simbolos.length - 1] = { t: "lit", v: anterior.v + valor };
      } else {
        simbolos.push({ t: "lit", v: valor });
      }
      i = j + 1;
      continue;
    }
    if (c === '"') {
      erros.push("identificador entre aspas");
      i++;
      continue;
    }
    if (c === "$") {
      erros.push("texto entre cifrões ou parâmetro posicional");
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(corpo[j]!)) j++;
      const palavra = corpo.slice(i, j).toLowerCase();
      if (corpo[j] === "'" || (corpo[j] === "&" && corpo[j + 1] === "'")) {
        erros.push(`literal com prefixo (${corpo.slice(i, j)}'...')`);
      }
      simbolos.push({ t: "id", v: palavra });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(corpo[j]!)) j++;
      simbolos.push({ t: "num", v: corpo.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPERADORES.find((o) => corpo.startsWith(o, i));
    if (op) {
      simbolos.push({ t: "op", v: op });
      i += op.length;
      continue;
    }
    simbolos.push({ t: "op", v: c });
    i++;
  }
  return { simbolos, erros };
}

const PALAVRAS_DA_CONDICAO = new Set([
  "and",
  "or",
  "not",
  "is",
  "distinct",
  "from",
  "null",
  "found",
  "true",
  "false",
  "tg_relid",
  "tg_op",
  "tg_name",
  "tg_when",
  "tg_level",
]);
const OPCOES_DO_RAISE = new Set([
  "errcode",
  "message",
  "detail",
  "hint",
  "constraint",
  "table",
  "column",
]);
const TABELAS_DA_LEITORA = new Set(["origens_de_conta", "pessoas"]);

const texto = (s: readonly Simbolo[]) =>
  s.map((x) => (x.t === "lit" ? `'${x.v.replace(/'/g, "''")}'` : x.v)).join(" ");

/**
 * Confere uma condição (do `IF` ou do `WHERE`). `apelidos` são os apelidos
 * de tabela válidos ali; `EXISTS (SELECT 1 FROM public.usuarios x WHERE ...)`
 * é reconhecido e conferido por dentro.
 */
function conferirCondicao(
  s: readonly Simbolo[],
  variaveis: ReadonlySet<string>,
  apelidos: ReadonlySet<string>,
  permiteExists: boolean,
): string[] {
  const erros: string[] = [];
  let profundidade = 0;
  for (let i = 0; i < s.length; i++) {
    const x = s[i]!;
    const prox = s[i + 1];
    if (x.t === "lit") {
      if (prox?.t === "op" && prox.v === "::") {
        const tipo = s[i + 2];
        if (!(tipo?.t === "id" && tipo.v === "regclass")) {
          erros.push(`conversão não permitida depois de literal (${texto(s.slice(i, i + 3))})`);
        }
        i += 2;
      }
      continue;
    }
    if (x.t === "num") continue;
    if (x.t === "op") {
      if (x.v === "(") profundidade++;
      else if (x.v === ")") profundidade--;
      else if (!["=", "<>", ","].includes(x.v)) erros.push(`operador não permitido: ${x.v}`);
      if (profundidade < 0) erros.push("parênteses desbalanceados");
      continue;
    }
    // Identificador.
    if (x.v === "exists" && permiteExists) {
      const forma = s.slice(i + 1, i + 9).map((y) => y.v);
      const alvo = ["(", "select", "1", "from", "public", ".", "usuarios"];
      if (forma.slice(0, 7).join(" ") !== alvo.join(" ") || s[i + 8]?.t !== "id") {
        erros.push(
          `EXISTS fora da forma SELECT 1 FROM public.usuarios <apelido> WHERE (${texto(s.slice(i, i + 9))})`,
        );
        continue;
      }
      const apelido = s[i + 8]!.v;
      if (s[i + 9]?.v !== "where") {
        erros.push("EXISTS sem WHERE");
        continue;
      }
      // Acha o fecha-parêntese do EXISTS.
      let p = 0;
      let fim = -1;
      for (let j = i + 1; j < s.length; j++) {
        if (s[j]!.t === "op" && s[j]!.v === "(") p++;
        if (s[j]!.t === "op" && s[j]!.v === ")") {
          p--;
          if (p === 0) {
            fim = j;
            break;
          }
        }
      }
      if (fim < 0) {
        erros.push("EXISTS sem fim");
        break;
      }
      erros.push(
        ...conferirCondicao(
          s.slice(i + 10, fim),
          variaveis,
          new Set([...apelidos, apelido]),
          false,
        ),
      );
      i = fim;
      continue;
    }
    if (PALAVRAS_DA_CONDICAO.has(x.v) || variaveis.has(x.v)) continue;
    if (x.v === "pg_current_xact_id") {
      if (!(s[i + 1]?.v === "(" && s[i + 2]?.v === ")"))
        erros.push("pg_current_xact_id fora da forma ()");
      i += 2;
      continue;
    }
    if (x.v === "coalesce") {
      if (s[i + 1]?.v !== "(") erros.push("coalesce sem parênteses");
      continue;
    }
    if ((x.v === "new" || apelidos.has(x.v)) && prox?.t === "op" && prox.v === ".") {
      const coluna = s[i + 2];
      if (coluna?.t !== "id") erros.push(`referência incompleta a ${x.v}.`);
      i += 2;
      continue;
    }
    erros.push(`palavra não permitida na condição: ${x.v}`);
  }
  if (profundidade !== 0) erros.push("parênteses desbalanceados");
  return erros;
}

function conferirSelect(s: readonly Simbolo[], variaveis: ReadonlySet<string>): string[] {
  const erros: string[] = [];
  const posInto = s.findIndex((x) => x.t === "id" && x.v === "into");
  const posFrom = s.findIndex((x) => x.t === "id" && x.v === "from");
  if (posInto < 0 || posFrom < posInto) {
    return [`SELECT fora da forma SELECT ... INTO ... FROM (${texto(s)})`];
  }
  const itens = s.slice(1, posInto);
  const destinos = s.slice(posInto + 1, posFrom);
  // Itens: apelido.coluna separados por vírgula.
  const colunas: Array<[string, string]> = [];
  for (let i = 0; i < itens.length; i += 4) {
    const [a, ponto, c, virgula] = [itens[i], itens[i + 1], itens[i + 2], itens[i + 3]];
    if (a?.t !== "id" || ponto?.v !== "." || c?.t !== "id" || (virgula && virgula.v !== ",")) {
      erros.push(`item do SELECT fora da forma apelido.coluna (${texto(itens)})`);
      break;
    }
    colunas.push([a.v, c.v]);
  }
  const vars: string[] = [];
  for (let i = 0; i < destinos.length; i += 2) {
    const [v, virgula] = [destinos[i], destinos[i + 1]];
    if (v?.t !== "id" || (virgula && virgula.v !== ",")) {
      erros.push(`destino do INTO fora da forma (${texto(destinos)})`);
      break;
    }
    if (!variaveis.has(v.v)) erros.push(`destino do INTO que não é variável declarada: ${v.v}`);
    vars.push(v.v);
  }
  if (!erros.length && vars.length !== colunas.length) {
    erros.push("o INTO não tem um destino por coluna");
  }
  const [pub, ponto, tabela, apelido, where] = s.slice(posFrom + 1, posFrom + 6);
  if (pub?.v !== "public" || ponto?.v !== "." || tabela?.t !== "id" || apelido?.t !== "id") {
    return [...erros, `FROM fora da forma public.<tabela> <apelido> (${texto(s.slice(posFrom))})`];
  }
  if (!TABELAS_DA_LEITORA.has(tabela.v)) {
    erros.push(`a leitora lê só origens_de_conta e pessoas, e não ${tabela.v}`);
  }
  if (where?.v !== "where") return [...erros, "SELECT sem WHERE"];
  let cond = s.slice(posFrom + 6);
  const n = cond.length;
  if (n >= 2 && cond[n - 2]!.v === "limit") {
    if (!(cond[n - 1]!.t === "num" && cond[n - 1]!.v === "1")) erros.push("LIMIT diferente de 1");
    cond = cond.slice(0, n - 2);
  }
  for (const [a] of colunas) {
    if (a !== apelido.v) erros.push(`coluna de apelido que não é o do FROM: ${a}`);
  }
  erros.push(...conferirCondicao(cond, variaveis, new Set([apelido.v]), true));
  // O filtro pela chave da própria conta ou da própria transação.
  const t = texto(cond);
  const a = apelido.v;
  const chaves =
    tabela.v === "pessoas"
      ? [`${a} . id = new . pessoa_id`]
      : [`${a} . usuario_id = new . id`, `${a} . transacao = pg_current_xact_id ( )`];
  if (!chaves.some((k) => t.includes(k))) {
    erros.push(
      `SELECT em ${tabela.v} sem o filtro pela chave da própria conta ou da própria transação ` +
        `(${chaves.join(" ou ")})`,
    );
  }
  return erros;
}

function conferirRaise(s: readonly Simbolo[]): string[] {
  if (!(s[1]?.v === "exception" && s[2]?.v === "using")) {
    return [`RAISE fora da forma RAISE EXCEPTION USING (${texto(s)})`];
  }
  const erros: string[] = [];
  const resto = s.slice(3);
  for (let i = 0; i < resto.length; i += 4) {
    const [opcao, igual, valor, virgula] = [resto[i], resto[i + 1], resto[i + 2], resto[i + 3]];
    if (
      opcao?.t !== "id" ||
      !OPCOES_DO_RAISE.has(opcao.v) ||
      igual?.v !== "=" ||
      valor?.t !== "lit" ||
      (virgula && virgula.v !== ",")
    ) {
      erros.push(
        `opção do RAISE fora da forma <opção> = '<literal>' (${texto(resto.slice(i, i + 4))})`,
      );
      break;
    }
  }
  return erros;
}

/**
 * Confere o corpo (`prosrc`) da leitora contra a lista permitida. Devolve os
 * motivos de reprovação (vazio: passa).
 */
export function conferirCorpoDaLeitora(corpo: string): string[] {
  const { simbolos, erros } = simbolosDoCorpo(corpo);
  if (erros.length) return erros.map((e) => `construção não reconhecida: ${e}`);
  const problemas: string[] = [];
  let s = simbolos;
  // DECLARE.
  const variaveis = new Set<string>();
  if (s[0]?.v === "declare") {
    let i = 1;
    while (i < s.length && s[i]!.v !== "begin") {
      const [nome, tipo, fim] = [s[i], s[i + 1], s[i + 2]];
      if (nome?.t !== "id" || tipo?.t !== "id" || fim?.v !== ";") {
        problemas.push(`declaração fora da forma <nome> <tipo>; (${texto(s.slice(i, i + 3))})`);
        return problemas;
      }
      if (!(TIPOS_DA_LEITORA as readonly string[]).includes(tipo.v)) {
        problemas.push(
          `variável ${nome.v} de tipo não permitido: ${tipo.v} (só ${TIPOS_DA_LEITORA.join(", ")})`,
        );
      }
      variaveis.add(nome.v);
      i += 3;
    }
    s = s.slice(i);
  }
  if (s[0]?.v !== "begin") return [...problemas, "o corpo não começa com BEGIN"];
  s = s.slice(1);
  // Tira o END final (com ou sem ponto e vírgula).
  if (s[s.length - 1]?.v === ";") s = s.slice(0, -1);
  if (s[s.length - 1]?.v !== "end") return [...problemas, "o corpo não termina com END"];
  s = s.slice(0, -1);
  // Comandos, separados por ponto e vírgula fora de parênteses.
  const comandos: Simbolo[][] = [];
  let atual: Simbolo[] = [];
  let p = 0;
  for (const x of s) {
    if (x.t === "op" && x.v === "(") p++;
    if (x.t === "op" && x.v === ")") p--;
    if (x.t === "op" && x.v === ";" && p === 0) {
      comandos.push(atual);
      atual = [];
    } else {
      atual.push(x);
    }
  }
  if (atual.length) return [...problemas, `comando sem ponto e vírgula no fim (${texto(atual)})`];
  let ifs = 0;
  for (let c of comandos) {
    while (c[0]?.v === "if") {
      const fimDaCondicao = c.findIndex((x) => x.t === "id" && x.v === "then");
      if (fimDaCondicao < 0) {
        problemas.push(`IF sem THEN (${texto(c)})`);
        c = [];
        break;
      }
      problemas.push(...conferirCondicao(c.slice(1, fimDaCondicao), variaveis, new Set(), false));
      ifs++;
      c = c.slice(fimDaCondicao + 1);
    }
    if (c.length === 0) {
      problemas.push("comando vazio");
      continue;
    }
    const primeiro = c[0]!.v;
    if (primeiro === "end") {
      if (!(c.length === 2 && c[1]!.v === "if")) {
        problemas.push(`END fora da forma END IF (${texto(c)})`);
      } else if (--ifs < 0) {
        problemas.push("END IF sem IF");
      }
    } else if (primeiro === "select") {
      problemas.push(...conferirSelect(c, variaveis));
    } else if (primeiro === "raise") {
      problemas.push(...conferirRaise(c));
    } else if (primeiro === "return") {
      if (!(c.length === 2 && (c[1]!.v === "null" || c[1]!.v === "new"))) {
        problemas.push(`RETURN fora da forma RETURN NULL ou RETURN NEW (${texto(c)})`);
      }
    } else {
      problemas.push(`comando não permitido na leitora: ${texto(c).slice(0, 120)}`);
    }
  }
  if (ifs !== 0) problemas.push("IF sem END IF");
  return problemas;
}
