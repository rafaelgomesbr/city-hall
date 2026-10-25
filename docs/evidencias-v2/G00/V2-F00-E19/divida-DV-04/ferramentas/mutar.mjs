// Mutações do grafo de runtime (DV-04): cada uma estraga uma regra de nosDeRuntimeDoLockfile e roda os testes.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const DC = process.argv[2];
const arq = `${DC}/scripts/auditar-excecoes.mjs`;
const original = readFileSync(arq, "utf8");
const mutacoes = [
  ["M1 ignora peerDependencies", "      ...Object.keys(no?.peerDependencies ?? {}),\n", ""],
  ["M2 ignora optionalDependencies", "      ...Object.keys(no?.optionalDependencies ?? {}),\n", ""],
  ["M3 segue devDependencies (o grafo cresce com o desenvolvimento)", "      ...Object.keys(no?.dependencies ?? {}),\n", "      ...Object.keys(no?.dependencies ?? {}),\n      ...Object.keys(no?.devDependencies ?? {}),\n"],
  ["M4 não segue os workspaces (só a raiz)", "if (!chave.split(\"/\").includes(\"node_modules\")) entrar(chave);", "if (chave === \"\") entrar(chave);"],
  ["M5 resolve só na raiz (sem cópia aninhada)", "    const corte = base.lastIndexOf(\"/\");\n    base = corte === -1 ? \"\" : base.slice(0, corte);", "    base = \"\";"],
  ["M6 marcasDevEmRuntime sempre vazia", "    .filter((chave) => chave !== \"\" && pacotes[chave]?.dev === true)", "    .filter(() => false)"],
];
try {
  for (const [nome, de, para] of mutacoes) {
    if (!original.includes(de)) { console.log(`${nome}: TRECHO NAO ACHADO`); continue; }
    writeFileSync(arq, original.replace(de, para));
    const r = spawnSync(process.execPath, ["--test", "--test-name-pattern=nosDeRuntimeDoLockfile|marcasDevEmRuntime|equivalência|DV-04", "scripts/auditar.test.mjs"], { cwd: DC, encoding: "utf8" });
    const m = /ℹ pass (\d+)/.exec(r.stdout), f = /ℹ fail (\d+)/.exec(r.stdout);
    console.log(`${nome}: ${f?.[1] ?? "?"} teste(s) vermelho(s), ${m?.[1] ?? "?"} verdes -> ${Number(f?.[1]) > 0 ? "MORDEU" : "NAO MORDEU"}`);
  }
} finally {
  writeFileSync(arq, original);
}
const r = spawnSync(process.execPath, ["--test", "--test-name-pattern=nosDeRuntimeDoLockfile|marcasDevEmRuntime|equivalência|DV-04", "scripts/auditar.test.mjs"], { cwd: DC, encoding: "utf8" });
console.log(`Restaurado: ${/ℹ pass (\d+)/.exec(r.stdout)?.[1]} verdes, ${/ℹ fail (\d+)/.exec(r.stdout)?.[1]} vermelhos`);
