/**
 * Conta os casos de teste do aplicativo de campo lendo o código-fonte.
 *
 * O resto do repositório não conta assim: ele pergunta ao vitest quais testes
 * existem (`vitest list`), que é a forma honesta, porque quem executa é quem
 * sabe. O aplicativo não cabe nesse caminho. Ele fica fora do `workspaces` de
 * propósito (o Expo traz quase seiscentos pacotes), roda no jest com o preset
 * da Expo, e o jest não tem equivalente de `vitest list`: `--listTests` lista
 * ARQUIVOS, não casos. Enumerar de verdade exigiria executar a suíte, e a
 * integração contínua roda `conferir:numeros` num trabalho que nem instala as
 * dependências do aplicativo.
 *
 * Então aqui se lê o texto, e a regra base é deliberadamente burra: `it` ou
 * `test` abrindo a linha, com no máximo espaço antes. Burra porque a
 * alternativa é heurística esperta que erra em silêncio, e número errado no
 * README é pior que número nenhum.
 *
 * A EXCEÇÃO QUE CUSTOU CARO: `it.each`. Uma linha de `it.each(OS_DOIS_TEMAS)`
 * vira DOIS testes no relatório do jest, e a primeira versão deste arquivo
 * contava um. O aplicativo tinha três dessas, o script dizia 34 e o jest dizia
 * 37, e a divergência apareceu no mesmo dia em que o script nasceu. Contar
 * linha por caso é uma regra que já estava errada quando foi escrita.
 *
 * Por isso `it.each` é RESOLVIDO: a tabela é lida (literal na chamada, ou
 * constante declarada no mesmo arquivo) e o número de linhas dela entra na
 * conta. Quando a tabela não é resolvível, isto ESTOURA com o arquivo e a
 * linha em que desistiu, em vez de devolver um número menor. Desistir alto é o
 * ponto: um portão que chuta some justamente quando é preciso.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/*
  `dist` e `coverage` entram na lista junto com `node_modules` porque as três
  guardam CÓPIA do que já foi contado. Contar a cópia dobraria o número sem que
  nenhum teste novo existisse, e número inflado passa despercebido bem mais
  fácil que número faltando.

  `.expo`, `android` e `ios` entram por outro motivo: são saída do `prebuild`,
  não código escrito por gente, e `ios` chega a trazer os Pods inteiros. Varrer
  aquilo custaria segundos para achar zero caso de teste.
*/
const PASTAS_IGNORADAS = new Set(["node_modules", "dist", ".git", "coverage", ".expo", "android", "ios"]);

const NOME_DE_TESTE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;

/*
  O sufixo opcional cobre `it.only(`, `test.skip(`, `it.concurrent.each(`. Sem
  ele, marcar um caso como `.only` durante uma investigação faria a contagem
  cair sozinha e o portão acusar o README de mentir, quando o texto está certo
  e quem mudou foi o código.
*/
const ABERTURA_DE_CASO = /^[ \t]*(?:it|test)((?:\.[A-Za-z]+)*)[ \t]*(?=[(`])/gm;

/*
  `describe.each` multiplica TODOS os casos de dentro do bloco, e não só um.
  Ninguém usa hoje, e o dia em que alguém usar esta contagem fica errada em
  silêncio. Então ela é procurada de propósito, para estourar antes.
*/
const DESCRIBE_EACH = /^[ \t]*describe(?:\.[A-Za-z]+)*\.each\b/m;

/** Todos os arquivos de teste sob uma pasta, ignorando cópias e dependências. */
export function arquivosDeTeste(pasta) {
  const achados = [];
  for (const nome of readdirSync(pasta)) {
    if (PASTAS_IGNORADAS.has(nome)) continue;
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosDeTeste(caminho));
    else if (NOME_DE_TESTE.test(nome)) achados.push(caminho);
  }
  return achados.sort();
}

/** Índice da aspa que fecha a string (ou template) aberta em `inicio`. */
function fimDaString(texto, inicio) {
  const aspa = texto[inicio];
  for (let i = inicio + 1; i < texto.length; i++) {
    if (texto[i] === "\\") { i++; continue; }
    if (texto[i] === aspa) return i;
  }
  throw new Error(`string aberta na posição ${inicio} nunca fecha`);
}

/**
 * Quantos elementos de primeiro nível tem o literal de array que começa em
 * `inicio`.
 *
 * Conta segmento com conteúdo, e não vírgula, porque `[a, b,]` tem dois
 * elementos e três seria o tipo de erro que ninguém percebe até o número do
 * README ficar um a mais.
 */
function contarElementosDoArray(texto, inicio) {
  let profundidade = 0;
  let elementos = 0;
  let segmentoTemConteudo = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];

    if (c === '"' || c === "'" || c === "`") {
      if (profundidade >= 1) segmentoTemConteudo = true;
      i = fimDaString(texto, i);
      continue;
    }
    if (c === "/" && texto[i + 1] === "/") {
      const fim = texto.indexOf("\n", i);
      i = fim < 0 ? texto.length : fim;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      const fim = texto.indexOf("*/", i + 2);
      i = fim < 0 ? texto.length : fim + 1;
      continue;
    }
    if (c === "[" || c === "(" || c === "{") {
      if (profundidade >= 1) segmentoTemConteudo = true;
      profundidade++;
      continue;
    }
    if (c === "]" || c === ")" || c === "}") {
      profundidade--;
      /*
        O último segmento só conta se tiver algo dentro. É o que separa
        `[a, b]` (dois) de `[a, b,]` (dois também) e de `[]` (nenhum).
      */
      if (profundidade === 0) return segmentoTemConteudo ? elementos + 1 : elementos;
      continue;
    }
    if (profundidade === 1 && c === ",") {
      if (segmentoTemConteudo) elementos++;
      segmentoTemConteudo = false;
      continue;
    }
    if (profundidade >= 1 && !/\s/.test(c)) segmentoTemConteudo = true;
  }

  throw new Error(`colchete aberto na posição ${inicio} nunca fecha`);
}

/** Linhas de uma tabela em template literal: as linhas com `|`, menos o cabeçalho. */
function contarLinhasDaTabela(texto, inicio) {
  const fim = fimDaString(texto, inicio);
  const linhas = texto.slice(inicio + 1, fim).split("\n").filter((l) => l.includes("|"));
  if (linhas.length < 2) {
    throw new Error("tabela de `each` em template sem cabeçalho e ao menos uma linha");
  }
  return linhas.length - 1;
}

/** Primeira posição depois de `inicio` que não é espaço. */
function pularEspaco(texto, inicio) {
  let i = inicio;
  while (i < texto.length && /\s/.test(texto[i])) i++;
  return i;
}

/**
 * Quantos casos um `each` gera. Resolve o literal na própria chamada e a
 * constante declarada no mesmo arquivo, que são as duas formas que aparecem
 * na prática. Qualquer outra coisa estoura.
 */
function contarCasosDoEach(fonte, posicaoDoDelimitador, onde) {
  if (fonte[posicaoDoDelimitador] === "`") {
    return contarLinhasDaTabela(fonte, posicaoDoDelimitador);
  }

  const inicioDoArgumento = pularEspaco(fonte, posicaoDoDelimitador + 1);

  if (fonte[inicioDoArgumento] === "[") {
    return contarElementosDoArray(fonte, inicioDoArgumento);
  }

  const identificador = /^[A-Za-z_$][\w$]*/.exec(fonte.slice(inicioDoArgumento));
  if (identificador) {
    const declaracao = new RegExp(
      `(?:const|let|var)\\s+${identificador[0]}\\b[\\s\\S]*?=\\s*\\[`,
    ).exec(fonte);
    if (declaracao) {
      return contarElementosDoArray(fonte, declaracao.index + declaracao[0].length - 1);
    }
  }

  const linha = fonte.slice(0, posicaoDoDelimitador).split("\n").length;
  throw new Error(
    `${onde}:${linha}: não sei quantos casos este \`each\` gera. A tabela precisa ser ` +
    "um literal na própria chamada, uma constante declarada neste arquivo, ou um " +
    "template com cabeçalho. Ensine o script antes de confiar no número.",
  );
}

/**
 * Quantos casos de teste um arquivo declara, já multiplicando os `each`.
 *
 * `onde` só serve para a mensagem de erro apontar o arquivo culpado: sem isso,
 * quem topa com o estouro recebe uma posição de caractere e nenhum caminho.
 */
export function contarCasos(fonte, onde = "(fonte)") {
  if (DESCRIBE_EACH.test(fonte)) {
    throw new Error(
      `${onde}: tem \`describe.each\`, que multiplica todos os casos do bloco. ` +
      "Esta contagem não sabe fazer isso, e um número calado seria pior que este erro.",
    );
  }

  let total = 0;
  for (const casou of fonte.matchAll(ABERTURA_DE_CASO)) {
    const sufixos = casou[1];
    const delimitador = casou.index + casou[0].length;
    total += sufixos.split(".").includes("each")
      ? contarCasosDoEach(fonte, delimitador, onde)
      : 1;
  }
  return total;
}

/**
 * Mapa de caminho relativo para número de casos, dentro do aplicativo.
 *
 * Devolve o mapa e não só o total porque quem conserta um número quebrado
 * precisa saber qual arquivo mudou, e um total solto não conta essa história.
 */
export function contarCasosDoAplicativo(raizDoAplicativo) {
  const porArquivo = new Map();
  for (const caminho of arquivosDeTeste(raizDoAplicativo)) {
    const relativo = relative(raizDoAplicativo, caminho).split(sep).join("/");
    porArquivo.set(relativo, contarCasos(readFileSync(caminho, "utf8"), relativo));
  }
  return porArquivo;
}
