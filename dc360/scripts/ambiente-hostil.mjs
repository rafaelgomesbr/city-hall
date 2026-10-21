/*
  Monta, no CI, as três condições hostis da V2-F00-E21 e confere que elas
  estão mesmo presentes antes de o teste rodar (job `plataformas` de
  `.github/workflows/verificar.yml`, em Windows e em Linux).

  Por que um script e não comandos soltos no YAML: o mesmo passo roda no Git
  Bash do Windows e no bash do Linux, e `sed`, `unix2dos` e `cp` não se
  comportam igual nos dois. Node é o mesmo nos dois lados.

  Por que conferir a condição: um teste verde sobre uma árvore que, sem
  ninguém perceber, ficou LF (o `.gitattributes` com `eol=lf` vence o
  `core.autocrlf=true`) ou sobre um cache que não está velho não prova nada.
  Cada subcomando sai com 1 quando a condição hostil NÃO se reproduz.

  Subcomandos (rodar a partir de `dc360/`):

    node scripts/ambiente-hostil.mjs crlf PASTA...
        Grava em CRLF todo arquivo de texto de fonte das pastas. Simula a
        árvore do Windows de antes do `.gitattributes` (índice LF, disco CRLF).

    node scripts/ambiente-hostil.mjs conferir-crlf ARQUIVO
        Confere que o arquivo está em CRLF no disco e que a agulha antiga do
        teste ("\n}\n") não aparece nele: é o que fazia o teste reprovar.

    node scripts/ambiente-hostil.mjs cache-velho
        Põe em `apps/campo/.expo/types/router.d.ts` o cache de rotas tipadas
        sem `/avisos`, `/mapa` e `/perfil` (`scripts/fixtures/router.d.ts.velho`,
        derivado do arquivo que o `expo start` gera, com as três rotas tiradas).

    node scripts/ambiente-hostil.mjs eol ARQUIVO
        Lê a saída de `git ls-files --eol` e reprova se algum arquivo está
        CRLF ou misto no índice, ou CRLF no disco sem o `.gitattributes` pedir.
*/
import { copyFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Extensões de fonte que os testes do painel leem do disco. */
const EXTENSOES_DE_TEXTO = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".json", ".html", ".md"]);

/** LF para CRLF, sem duplicar o CR de linha que já é CRLF. */
export function paraCrlf(texto) {
  return texto.replace(/\r?\n/g, "\r\n");
}

/** A agulha que o teste antigo procurava e que some numa árvore CRLF. */
export const AGULHA_ANTIGA = "\n}\n";

export function estadoDoFimDeLinha(texto) {
  const crlf = (texto.match(/\r\n/g) ?? []).length;
  const lfSozinho = (texto.match(/(?<!\r)\n/g) ?? []).length;
  return { crlf, lfSozinho, agulhaAntiga: texto.includes(AGULHA_ANTIGA) };
}

/**
 * Resume `git ls-files --eol` e devolve o que viola a regra do repositório.
 * Formato de cada linha: `i/<x> w/<y> attr/<atributos>\t<caminho>`.
 */
export function resumirEol(saida) {
  const contagem = {};
  const violacoes = [];
  let total = 0;
  for (const linha of saida.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const tab = linha.indexOf("\t");
    if (tab < 0) continue;
    const [indice, disco, ...resto] = linha.slice(0, tab).trim().split(/\s+/);
    const atributos = resto.join(" ");
    const caminho = linha.slice(tab + 1);
    total += 1;
    contagem[indice] = (contagem[indice] ?? 0) + 1;
    contagem[disco] = (contagem[disco] ?? 0) + 1;
    if (indice === "i/crlf" || indice === "i/mixed") violacoes.push(`${indice} no índice: ${caminho}`);
    if ((disco === "w/crlf" || disco === "w/mixed") && !atributos.includes("eol=crlf")) {
      violacoes.push(`${disco} no disco sem eol=crlf no .gitattributes: ${caminho}`);
    }
  }
  return { total, contagem, violacoes };
}

function arquivosDeTexto(pasta) {
  const saida = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosDeTexto(caminho));
    else if (EXTENSOES_DE_TEXTO.has(extname(nome))) saida.push(caminho);
  }
  return saida;
}

function falhar(mensagem) {
  console.error(`\nCONDIÇÃO HOSTIL NÃO REPRODUZIDA: ${mensagem}`);
  process.exit(1);
}

function crlf(pastas) {
  if (pastas.length === 0) falhar("nenhuma pasta informada");
  let convertidos = 0;
  for (const pasta of pastas) {
    for (const arquivo of arquivosDeTexto(join(RAIZ, pasta))) {
      const antes = readFileSync(arquivo, "utf8");
      const depois = paraCrlf(antes);
      if (depois !== antes) {
        writeFileSync(arquivo, depois);
        convertidos += 1;
      }
    }
  }
  console.log(`Gravados em CRLF: ${convertidos} arquivos de ${pastas.join(", ")}.`);
  if (convertidos === 0) falhar("nenhum arquivo mudou; a árvore já estava CRLF ou as pastas estão vazias");
}

function conferirCrlf(arquivo) {
  if (!arquivo) falhar("nenhum arquivo informado");
  const estado = estadoDoFimDeLinha(readFileSync(join(RAIZ, arquivo), "utf8"));
  console.log(`${arquivo}: ${estado.crlf} linhas CRLF, ${estado.lfSozinho} LF sozinho, agulha antiga "\\n}\\n" presente: ${estado.agulhaAntiga ? "sim" : "não"}.`);
  if (estado.crlf === 0 || estado.lfSozinho > 0) falhar(`${arquivo} não está inteiro em CRLF`);
  if (estado.agulhaAntiga) falhar(`a agulha antiga ainda aparece em ${arquivo}; o teste antigo passaria`);
}

function cacheVelho() {
  const origem = join(RAIZ, "scripts/fixtures/router.d.ts.velho");
  const destino = join(RAIZ, "apps/campo/.expo/types/router.d.ts");
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(origem, destino);
  const texto = readFileSync(destino, "utf8");
  const faltam = ["/avisos", "/mapa", "/perfil"].filter((rota) => !texto.includes(`${rota}\``));
  console.log(`Cache velho em ${relative(RAIZ, destino)}; rotas ausentes nele: ${faltam.join(", ") || "nenhuma"}.`);
  if (faltam.length !== 3) falhar("o cache gravado conhece rota que o cache velho não conhecia");
}

function eol(arquivo) {
  if (!arquivo) falhar("nenhum arquivo informado");
  const { total, contagem, violacoes } = resumirEol(readFileSync(arquivo, "utf8"));
  console.log(`git ls-files --eol: ${total} arquivos.`);
  for (const [chave, quantos] of Object.entries(contagem).sort()) console.log(`  ${chave.padEnd(10)} ${quantos}`);
  if (total === 0) {
    console.error("\nFALHA: a saída de git ls-files --eol está vazia.");
    process.exit(1);
  }
  if (violacoes.length > 0) {
    console.error(`\nFALHA: ${violacoes.length} arquivo(s) fora da regra de fim de linha:`);
    for (const v of violacoes) console.error(`  ${v}`);
    process.exit(1);
  }
  console.log("Nenhum i/crlf nem i/mixed; CRLF no disco só onde o .gitattributes pede.");
}

// Os dois lados por `realpath` e, no Windows, sem caixa: a letra da unidade
// pode vir `C:` de um lado e `c:` do outro conforme o diretório digitado.
function mesmoArquivo(a, b) {
  try {
    const [x, y] = [realpathSync(a), realpathSync(b)];
    return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
  } catch {
    return false;
  }
}

const executadoDireto = Boolean(process.argv[1]) && mesmoArquivo(fileURLToPath(import.meta.url), process.argv[1]);
if (executadoDireto) {
  const [subcomando, ...argumentos] = process.argv.slice(2);
  if (subcomando === "crlf") crlf(argumentos);
  else if (subcomando === "conferir-crlf") conferirCrlf(argumentos[0]);
  else if (subcomando === "cache-velho") cacheVelho();
  else if (subcomando === "eol") eol(argumentos[0]);
  else {
    console.error("uso: ambiente-hostil.mjs crlf PASTA... | conferir-crlf ARQUIVO | cache-velho | eol ARQUIVO");
    process.exit(2);
  }
}
