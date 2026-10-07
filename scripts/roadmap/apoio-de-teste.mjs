/**
 * Apoio dos testes de `scripts/roadmap/`: caminho da fixture, cópia descartável
 * dela e execução dos CLIs como processo de verdade.
 *
 * Não é teste (o nome não termina em `.test.mjs`), então o `node --test` não o
 * coleta. Fica separado porque os quatro arquivos de teste precisam das mesmas
 * três coisas, e cada um redefini-las seria três cópias para manter.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório real (dois níveis acima de scripts/roadmap). */
export const RAIZ_REAL = join(AQUI, "..", "..");

/** A fixture: um repositório de brinquedo com STATUS, duas fases e evidência. */
export const FIXTURE = join(AQUI, "fixtures", "repo-minimo");

/** Copia a fixture para uma pasta temporária que o teste pode estragar à vontade. Devolve `{ raiz, limpar }`. */
export function copiarFixture() {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-fixture-"));
  const raiz = join(pasta, "repo");
  cpSync(FIXTURE, raiz, { recursive: true });
  return { raiz, pasta, limpar: () => rmSync(pasta, { recursive: true, force: true }) };
}

/** Troca um trecho exato de um arquivo da cópia, e falha alto se o trecho não existe (teste que não muda nada é mentira). */
export function trocarNoArquivo(raiz, relativo, de, para) {
  const caminho = join(raiz, ...relativo.split("/"));
  const texto = readFileSync(caminho, "utf8");
  if (!texto.includes(de)) throw new Error(`O trecho "${de}" não existe em ${relativo}`);
  writeFileSync(caminho, texto.replace(de, para));
}

/** Escreve um arquivo na cópia, criando as pastas que faltam. */
export function escrever(raiz, relativo, conteudo) {
  const caminho = join(raiz, ...relativo.split("/"));
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

/** Converte todos os .md de uma pasta, recursivamente, para CRLF. */
export function converterParaCrlf(pasta) {
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) converterParaCrlf(caminho);
    else if (nome.endsWith(".md")) writeFileSync(caminho, readFileSync(caminho, "utf8").replace(/\r?\n/g, "\r\n"));
  }
}

/**
 * Roda um CLI do diretório como processo de verdade, sem shell.
 * Devolve `{ codigo, saida, erro }` e nunca lança por código diferente de zero.
 */
export function executarCli(arquivo, args = []) {
  try {
    const saida = execFileSync(process.execPath, [join(AQUI, arquivo), ...args], {
      cwd: RAIZ_REAL,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { codigo: 0, saida, erro: "" };
  } catch (e) {
    return { codigo: e.status ?? 1, saida: String(e.stdout ?? ""), erro: String(e.stderr ?? "") };
  }
}
