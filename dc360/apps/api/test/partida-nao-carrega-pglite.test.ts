import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A partida da API com `DATABASE_URL` não pode carregar o Postgres em
 * WebAssembly.
 *
 * `@electric-sql/pglite` é devDependency da API, de propósito: ele existe
 * para desenvolver sem instalar nada e para os testes, e a imagem de produção
 * é montada sem as devDependencies. Até 15/09/2026 `src/index.ts` importava
 * `./banco/memoria.js` ESTATICAMENTE, e `memoria.ts` importa o PGlite
 * estaticamente: o grafo de módulos da partida alcançava o pacote em toda
 * subida, com ou sem `DATABASE_URL`. Num contêiner sem devDependencies isso é
 * `ERR_MODULE_NOT_FOUND` antes da primeira linha de `index.ts` rodar, e a
 * suíte não pegava porque a suíte roda com as devDependencies instaladas.
 *
 * O console já fazia certo (`apps/console/src/index.ts` só importa
 * `./banco-em-memoria.js` por `await import(...)` dentro do ramo sem banco), e
 * este teste cobra o mesmo da API pelo único jeito que não depende de subir o
 * servidor: lendo o grafo de `import` ESTÁTICO a partir de `index.ts`.
 * Import dinâmico (`await import("...")`) não entra no grafo, porque é
 * exatamente ele que só roda no ramo de desenvolvimento.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Os módulos que `import ... from "..."` de um arquivo alcança, sem os dinâmicos. */
function importsEstaticos(caminho: string): string[] {
  const fonte = readFileSync(caminho, "utf8");
  const achados: string[] = [];
  // `import x from "y"`, `import { a } from "y"`, `import "y"`, `export ... from "y"`.
  const padrao = /^\s*(?:import|export)\s+(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (const casou of fonte.matchAll(padrao)) achados.push(casou[1]!);
  return achados;
}

function resolverRelativo(de: string, especificador: string): string | null {
  if (!especificador.startsWith(".")) return null;
  const semJs = especificador.replace(/\.js$/, "");
  for (const candidato of [`${semJs}.ts`, `${semJs}/index.ts`]) {
    const caminho = resolve(dirname(de), candidato);
    if (existsSync(caminho)) return caminho;
  }
  throw new Error(`import relativo que não resolve: ${especificador} a partir de ${de}`);
}

/** Todo módulo alcançável por import estático a partir de `entrada`, e quem o trouxe. */
function grafoEstatico(entrada: string): Map<string, string[]> {
  const alcancados = new Map<string, string[]>();
  const fila: Array<{ modulo: string; caminho: string[] }> = [{ modulo: entrada, caminho: [] }];
  while (fila.length > 0) {
    const { modulo, caminho } = fila.shift()!;
    if (alcancados.has(modulo)) continue;
    alcancados.set(modulo, caminho);
    if (!modulo.startsWith(SRC)) continue;
    for (const especificador of importsEstaticos(modulo)) {
      const relativo = resolverRelativo(modulo, especificador);
      fila.push({ modulo: relativo ?? especificador, caminho: [...caminho, modulo] });
    }
  }
  return alcancados;
}

describe("a partida com DATABASE_URL não carrega o Postgres em WebAssembly", () => {
  const grafo = grafoEstatico(join(SRC, "index.ts"));

  it("a varredura enxerga o grafo de verdade", () => {
    // Sem esta âncora, um erro na leitura faria o grafo sair vazio e o teste
    // passar medindo nada.
    expect(grafo.size).toBeGreaterThan(20);
    expect(grafo.has(join(SRC, "servidor.ts"))).toBe(true);
    expect(grafo.has("fastify")).toBe(true);
  });

  it("@electric-sql/pglite não é alcançável por import estático a partir de index.ts", () => {
    const trilha = grafo.get("@electric-sql/pglite");
    expect(
      trilha,
      "o PGlite entrou no grafo estático da partida por: "
      + (trilha ?? []).map((m) => m.replace(`${SRC}/`, "")).join(" > ")
      + " > @electric-sql/pglite. Ele é devDependency e não existe na imagem de "
      + "produção: importe `./banco/memoria.js` com `await import(...)` dentro do "
      + "ramo sem DATABASE_URL, como o console faz.",
    ).toBeUndefined();
  });

  it("memoria.ts continua importando o PGlite, e é por isso que index.ts não pode importá-lo direto", () => {
    // Se alguém tornar o import do PGlite dinâmico DENTRO de memoria.ts, o
    // caso acima passa a ser verde por outro caminho, e este diz que a régua
    // mudou de lugar: aí o import estático de memoria.js em index.ts voltaria
    // a ser aceitável, e o cabeçalho deste arquivo precisa ser reescrito.
    expect(importsEstaticos(join(SRC, "banco", "memoria.ts"))).toContain("@electric-sql/pglite");
  });

  it("a leitura de import cobre as formas que o código usa", () => {
    expect(importsEstaticos(join(SRC, "index.ts"))).toContain("./config.js");
    expect(importsEstaticos(join(SRC, "index.ts"))).toContain("@dc360/db");
  });
});
