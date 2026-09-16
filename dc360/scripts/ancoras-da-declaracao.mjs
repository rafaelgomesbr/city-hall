/**
 * As âncoras de `docs/DECLARACAO-NAS-LOJAS.md`, conferidas contra o código.
 *
 * ## O que uma âncora é, e por que ela não é mais um número de linha
 *
 * A regra do documento diz que toda afirmação copiada para o formulário das
 * lojas aponta para o código que a sustenta. Até 15/09/2026 o apontamento era
 * por NÚMERO DE LINHA (`app.config.ts`, linha 212), e um revisor provou o que
 * número de linha faz: seis âncoras já apontavam para o lugar errado, porque
 * os arquivos cresceram em cima delas. Uma âncora que mente é pior que
 * nenhuma, porque quem confere abre o arquivo no número, vê outra coisa, e
 * conclui que a afirmação é falsa (ou pior, não confere).
 *
 * A âncora passa a ser por SÍMBOLO, escrita em crase, na forma
 *
 *   `caminho/do/arquivo.ts#nomeDoSimbolo`
 *
 * e o que este módulo confere é que o arquivo existe e que o símbolo aparece
 * nele como palavra inteira. Símbolo é nome de função, de constante, de
 * coluna, de tabela, de chave de configuração: o que um `grep` acha. Com o
 * `!` na frente (`arquivo#!simbolo`) a âncora afirma AUSÊNCIA, e é conferida
 * do mesmo jeito, ao contrário. Um caminho de PASTA com `#!` afirma ausência
 * em todos os arquivos dela.
 *
 * ## O que ele NÃO confere, dito na cara
 *
 * Que o símbolo faz o que o documento diz. Isso continua sendo leitura de
 * gente. O que sai daqui é a metade que a máquina consegue: a âncora aponta
 * para um lugar que existe. A busca é textual, então um símbolo citado só em
 * comentário passa; por isso as âncoras de ausência só são escritas em arquivo
 * que não menciona o nome nem em comentário (o teste irmão prova o limite).
 *
 * ## Resolução do caminho
 *
 * Relativo à raiz do repositório (`apps/campo/app.config.ts`), e, para caber
 * nas tabelas, também a `apps/campo` (`app.config.ts`) e a `apps/campo/src`
 * (`dados/api.ts`). O primeiro que existir vale. `../` resolve a partir de
 * `docs/`, que é onde o documento mora.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Onde um caminho citado pode estar, na ordem em que é procurado. */
export function bases(raiz) {
  return [raiz, join(raiz, "apps", "campo"), join(raiz, "apps", "campo", "src"), join(raiz, "docs")];
}

export function resolverCaminho(raiz, caminho) {
  for (const base of bases(raiz)) {
    const candidato = resolve(base, caminho);
    if (existsSync(candidato)) return candidato;
  }
  return null;
}

/** Todo arquivo de texto debaixo de uma pasta, para a âncora de ausência em pasta. */
function arquivosDe(pasta) {
  const achados = [];
  for (const nome of readdirSync(pasta)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosDe(caminho));
    else if (/\.(ts|tsx|js|mjs|json|sql|md|css)$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

function escapar(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** O símbolo como palavra inteira: `foto` não casa em `foto_chave`, nem `sair` em `sairDaApi`. */
export function contemSimbolo(fonte, simbolo) {
  return new RegExp(`(?<![\\w$])${escapar(simbolo)}(?![\\w$])`).test(fonte);
}

/** A forma da âncora, dentro de crases. */
export const ANCORA = /`([^`#\s]+)#(!?)([A-Za-z_$][\w$.-]*)`/g;

/** Um caminho de arquivo do repositório dentro de crases, com ou sem âncora. */
const CAMINHO_CITADO = /`((?:\.\.\/)?(?:apps|packages|db|scripts|docs|[a-z-]+)\/[^`#\s]+\.(?:ts|tsx|js|mjs|json|sql|md|wav|txt|toml))(?:#[^`]*)?`|`((?:app\.config|eas|package)\.(?:ts|json))(?:#[^`]*)?`/g;

/** Número de linha como âncora, que é o que este módulo existe para banir. */
const LINHA_NUMERADA = /\b[Ll]inhas?\s+\d+/g;

/**
 * Confere o texto do documento e devolve a lista de problemas, vazia quando
 * está tudo certo. Cada problema traz a linha do documento e o motivo.
 */
export function conferirAncoras(texto, raiz) {
  const problemas = [];
  const linhas = texto.split("\n");

  linhas.forEach((linha, i) => {
    const numero = i + 1;

    for (const m of linha.matchAll(LINHA_NUMERADA)) {
      problemas.push({
        linha: numero,
        motivo: `âncora por número de linha ("${m[0]}"): use \`arquivo#simbolo\`. Número de linha envelhece em silêncio.`,
      });
    }

    for (const m of linha.matchAll(CAMINHO_CITADO)) {
      const caminho = m[1] ?? m[2];
      if (!resolverCaminho(raiz, caminho)) {
        problemas.push({ linha: numero, motivo: `o arquivo citado não existe: ${caminho}` });
      }
    }

    for (const m of linha.matchAll(ANCORA)) {
      const [, caminho, negacao, simbolo] = m;
      const alvo = resolverCaminho(raiz, caminho);
      if (!alvo) {
        problemas.push({ linha: numero, motivo: `a âncora aponta para arquivo que não existe: ${caminho}#${negacao}${simbolo}` });
        continue;
      }
      const ehPasta = statSync(alvo).isDirectory();
      if (ehPasta && !negacao) {
        problemas.push({ linha: numero, motivo: `âncora de presença em pasta não diz onde olhar: ${caminho}#${simbolo}` });
        continue;
      }
      const arquivos = ehPasta ? arquivosDe(alvo) : [alvo];
      const onde = arquivos.filter((a) => contemSimbolo(readFileSync(a, "utf8"), simbolo));
      if (negacao && onde.length > 0) {
        problemas.push({
          linha: numero,
          motivo: `a âncora afirma que ${simbolo} NÃO existe em ${caminho}, e ele existe (${onde.length} arquivo(s))`,
        });
      } else if (!negacao && onde.length === 0) {
        problemas.push({ linha: numero, motivo: `o símbolo ${simbolo} não existe em ${caminho}` });
      }
    }
  });

  return problemas;
}

export function descrever(problemas) {
  return problemas.map((p) => `  linha ${p.linha}: ${p.motivo}`).join("\n");
}
