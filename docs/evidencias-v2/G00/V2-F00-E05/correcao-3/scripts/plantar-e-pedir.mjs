// Planta UMA mutação da revisão no worktree (com arquivo novo, trecho extra e linha no fim, como o
// `plantar.mjs` dela), sobe o servidor nos dois modos da guarda, pede POST /orgaos, e restaura.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
const [,, W, nome, saida, porta] = process.argv;
const { MUTACOES } = await import(new URL("./mutacoes-da-revisao.mjs", import.meta.url));
const m = MUTACOES.find((x) => x.nome === nome);
const arq = `${W}/dc360/apps/api/src/${m.arquivo}`;
const original = readFileSync(arq);
let texto = original.toString("utf8");
const trocar = (de, para) => { if (!texto.includes(de)) throw new Error("âncora " + de.slice(0, 40)); texto = texto.replace(de, para); };
if (m.de) trocar(m.de, m.para);
if (m.extra) trocar(m.extra.de, m.extra.para);
if (m.fim) texto += "\n" + m.fim + "\n";
const novo = m.novo ? `${W}/${m.novo.caminho}` : null;
let out = `== ${nome}\n`;
try {
  writeFileSync(arq, texto);
  if (novo) writeFileSync(novo, m.novo.fonte);
  for (const modo of ["falhar", "corrigir"]) {
    try {
      out += execSync(`../../node_modules/.bin/tsx ${new URL("./servidor-com-guarda.mts", import.meta.url).pathname}`, {
        cwd: `${W}/dc360/apps/api`, env: { ...process.env, W, MODO: modo, PORTA: porta && modo === "corrigir" ? porta : "" }, encoding: "utf8", timeout: 180000,
      }).split("\n").filter((l) => /^(inject|http|desvios|log do)/.test(l)).join("\n") + "\n";
    } catch (e) { out += `falhou ${e.status}\n${String(e.stdout).slice(-600)}\n${String(e.stderr).slice(-600)}\n`; }
  }
  if (process.env.VARREDURA === "sim") {
    try {
      execSync("npx vitest run test/codigos-de-erro.test.ts -t 'toda resposta 401 ou 403 da API'", { cwd: `${W}/dc360/apps/api`, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
      out += "varredura: VERDE\n";
    } catch (e) {
      out += "varredura: VERMELHA\n" + String(e.stdout).replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter((l) => /^\s+\+\s+"|Tests /.test(l)).join("\n") + "\n";
    }
  }
} finally {
  writeFileSync(arq, original);
  if (novo && existsSync(novo)) unlinkSync(novo);
}
writeFileSync(saida, out);
console.log(out);
