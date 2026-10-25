// DV-04: compara o runtime calculado pelo grafo (nosDeRuntimeDoLockfile) com o de `npm ls --omit=dev --all`.
// Uso: node equivalencia.mjs <pasta dc360>
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = process.argv[2];
const { nosDeRuntimeDoLockfile, marcasDevEmRuntime, defeitoDoGrafo } = await import(
  pathToFileURL(join(RAIZ, "scripts", "auditar-excecoes.mjs")).href
);

for (const pasta of [".", "apps/campo"]) {
  const l = JSON.parse(readFileSync(join(RAIZ, pasta, "package-lock.json"), "utf8"));
  const meu = new Set();
  for (const k of nosDeRuntimeDoLockfile(l)) {
    if (!k.split("/").includes("node_modules") || l.packages[k].link) continue;
    meu.add(`${k.slice(k.lastIndexOf("node_modules/") + 13)}@${l.packages[k].version}`);
  }
  let bruto;
  try {
    bruto = execFileSync("npm", ["ls", "--package-lock-only", "--omit=dev", "--all", "--json"], {
      cwd: join(RAIZ, pasta), encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (e) {
    bruto = e.stdout; // o aplicativo tem pacotes `file:` que o npm ls chama de "missing" e sai 1; o JSON vem igual
  }
  const npm = new Set();
  (function andar(n) {
    for (const [nome, d] of Object.entries(n.dependencies ?? {})) {
      const link = l.packages[`node_modules/${nome}`]?.link === true;
      if (d.version && !link && !String(d.resolved ?? "").startsWith("file:")) npm.add(`${nome}@${d.version}`);
      andar(d);
    }
  })(JSON.parse(bruto));
  console.log(pasta === "." ? "raiz" : pasta, {
    pelo_grafo: meu.size,
    pelo_npm_ls: npm.size,
    so_no_grafo: [...meu].filter((x) => !npm.has(x)),
    so_no_npm_ls: [...npm].filter((x) => !meu.has(x)),
    marcas_dev_em_runtime: marcasDevEmRuntime(l),
    defeito_do_grafo: defeitoDoGrafo(l),
  });
}
