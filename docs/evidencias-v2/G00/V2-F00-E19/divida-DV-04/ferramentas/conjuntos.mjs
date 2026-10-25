import { readdirSync, readFileSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const [,, dir, npmBin = "npm"] = process.argv;
function instalados(nm, out) {
  for (const e of readdirSync(nm)) {
    if (e.startsWith(".")) continue;
    const p = join(nm, e);
    if (e.startsWith("@")) { for (const s of readdirSync(p)) um(join(p, s), out); } else um(p, out);
  }
}
function um(p, out) {
  if (lstatSync(p).isSymbolicLink()) return;
  const pj = join(p, "package.json");
  if (existsSync(pj)) { const j = JSON.parse(readFileSync(pj, "utf8")); out.add(`${j.name}@${j.version}`); }
  const nested = join(p, "node_modules");
  if (existsSync(nested)) instalados(nested, out);
}
const inst = new Set(); instalados(join(dir, "node_modules"), inst);
const ls = JSON.parse(execFileSync(npmBin, ["ls", "--package-lock-only", "--omit=dev", "--all", "--json"], { cwd: dir, encoding: "utf8", maxBuffer: 1 << 28 }));
const grafo = new Set();
(function andar(n) { for (const [nome, d] of Object.entries(n.dependencies ?? {})) { if (d.version && !String(d.resolved ?? "").startsWith("file:")) grafo.add(`${nome}@${d.version}`); andar(d); } })(ls);
const soInst = [...inst].filter((x) => !grafo.has(x) && !x.startsWith("@dc360/"));
const soGrafo = [...grafo].filter((x) => !inst.has(x));
console.log({ instalados: inst.size, grafo: grafo.size, soInstalado: soInst, soGrafo });
