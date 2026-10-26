// Mutações para provar que os testes novos mordem. Uso: node mutar.mjs <raiz do dc360>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.argv[2];
const alvo = join(raiz, "scripts", "auditar-excecoes.mjs");
const original = readFileSync(alvo, "utf8");

function rodar(rotulo, mutado) {
  console.log(`## ${rotulo}`);
  if (mutado === original) throw new Error(`mutação não mudou nada: ${rotulo}`);
  writeFileSync(alvo, mutado);
  try {
    let saida = "";
    try {
      saida = execFileSync("node", ["--test", "scripts/auditar.test.mjs"], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { saida = String(e.stdout ?? ""); }
    for (const l of saida.split("\n")) if (/^ℹ (tests|pass|fail)|^\s*✖ (somenteEm|problemasDasExcecoes|aceita o nomeado|com offline)/.test(l)) console.log(l);
  } finally { writeFileSync(alvo, original); }
  console.log();
}

rodar("Mutação 1: foraDoCaminho sempre falso (a restrição de caminho some)",
  original.replace("function foraDoCaminho(aceitas, pacote, entrada) {", "function foraDoCaminho(aceitas, pacote, entrada) {\n  return false;"));
rodar("Mutação 2: a exceção do zod sem somenteEm",
  original.replace('    somenteEm: ["node_modules/expo/node_modules/"],\n', ""));
rodar("Mutação 3: braces volta à lista do aplicativo",
  original.replace("  zod: {\n    advisories", '  braces: { advisories: { "GHSA-vfj7-8cjw-p6xm": "high" }, motivo: "m", dono: DONO, ate: PRAZO },\n  zod: {\n    advisories'));
console.log("## Restaurado");
const saida = (() => { try { return execFileSync("node", ["--test", "scripts/auditar.test.mjs"], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return String(e.stdout ?? ""); } })();
for (const l of saida.split("\n")) if (/^ℹ (tests|pass|fail)/.test(l)) console.log(l);
