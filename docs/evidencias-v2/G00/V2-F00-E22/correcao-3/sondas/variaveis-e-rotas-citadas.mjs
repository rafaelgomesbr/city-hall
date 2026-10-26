// Confere, nos documentos dados, (a) variáveis de ambiente entre crases que não aparecem em nenhum
// arquivo de código ou de configuração e (b) rotas `GET /caminho` entre crases que não estão registradas
// em apps/api/src ou apps/console/src (comparação por sufixo do caminho, porque o prefixo é do `register`).
// Uso (da raiz do repositório): node .../variaveis-e-rotas-citadas.mjs <documento>...
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const sh = (c) => execSync(c, { maxBuffer: 1e9, encoding: "utf8" });
const texto = process.argv.slice(2).map((d) => readFileSync(d, "utf8")).join("\n");

const codigo = sh("git ls-files -- 'dc360/*.ts' 'dc360/*.tsx' 'dc360/*.mjs' 'dc360/*.sql' 'dc360/*.toml' 'dc360/*.yml' 'dc360/*.json' '.github/*'")
  .split("\n").filter(Boolean).map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
const variaveis = [...new Set([...texto.matchAll(/`([A-Z][A-Z0-9_]{4,})`/g)].map((m) => m[1]))].sort();
const semCodigo = variaveis.filter((v) => !codigo.includes(v));
console.log(`variaveis citadas: ${variaveis.length}; sem nenhuma ocorrencia no codigo: ${semCodigo.length}`);
for (const v of semCodigo) console.log(`  sem codigo: ${v}`);

// -A2: o caminho às vezes fica na linha seguinte à chamada (`app.post(` e, embaixo, `"/municipios/:id/eliminar"`).
const rotasNoCodigo = sh("git grep -h -A2 -E '\\.(get|post|put|patch|delete)(<[^>]*>)?\\(' -- dc360/apps/api/src dc360/apps/console/src");
const rotas = [...new Set([...texto.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/[^`\s]+)`/g)].map((m) => `${m[1]} ${m[2]}`))].sort();
let semRota = 0;
for (const r of rotas) {
  const caminho = r.split(" ")[1].split("?")[0].split("<")[0];
  const seg = caminho.replace(/^\//, "").split("/");
  let achou = false;
  for (let i = 0; i < seg.length && !achou; i++) {
    const sufixo = "/" + seg.slice(i).join("/");
    if (rotasNoCodigo.includes(`"${sufixo}"`) || rotasNoCodigo.includes(`'${sufixo}'`)) achou = true;
  }
  // Rota de raiz do prefixo (`GET /avisos`): o código registra "/" sob o prefixo.
  if (!achou && seg.length === 1 && (rotasNoCodigo.includes('"/"') || rotasNoCodigo.includes("'/'"))) achou = true;
  if (!achou) { console.log(`  rota sem registro: ${r}`); semRota++; }
}
console.log(`rotas citadas: ${rotas.length}; sem registro: ${semRota}`);
