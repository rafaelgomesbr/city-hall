#!/usr/bin/env node
/**
 * Roda o ESLint nas duas metades do produto (V2-F01-E17): o monorepo
 * (`dc360/`, configuração em `eslint.config.mjs`) e o aplicativo de campo
 * (`dc360/apps/campo/`, configuração própria, baseline própria).
 *
 * Por que um script e não dois `eslint` encadeados no `package.json`: o
 * aplicativo precisa rodar com o próprio diretório como raiz (para achar a
 * configuração e as suppressions dele e os tipos do `node_modules` dele), e um
 * `&&` esconderia o resultado do segundo quando o primeiro reprova. Aqui os
 * dois sempre rodam, e a saída diz qual reprovou.
 *
 * Uso (em `dc360/`):
 *   node scripts/lint.mjs                 # os dois
 *   node scripts/lint.mjs --so=monorepo   # só o monorepo
 *   node scripts/lint.mjs --so=campo      # só o aplicativo
 *   node scripts/lint.mjs --podar         # remove da baseline o achado já corrigido
 *
 * A baseline SÓ DESCE. `--podar` é o único jeito suportado de mexer nela para
 * baixo; subir exige `eslint --suppress-all` à mão e é reprovado no PR por
 * `scripts/lint-teto.mjs contra-base`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DC360 = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const ALVOS = {
  monorepo: { nome: "monorepo", cwd: DC360 },
  campo: { nome: "aplicativo de campo", cwd: join(DC360, "apps", "campo") },
};

/**
 * Como chamar o ESLint sem passar por shell: o `node` que está rodando este
 * script, com o script JS do ESLint como primeiro argumento. O atalho de
 * `node_modules/.bin` no Windows é um arquivo de lote, que só roda por shell,
 * e o shell corta o caminho absoluto no espaço (checkout em
 * `C:\Projetos\Defesa Civil\...`). Direto no `node`, o caminho viaja como UM
 * argumento e o espaço não importa, em qualquer sistema.
 */
export function comandoDoEslint(raiz = DC360) {
  return {
    comando: process.execPath,
    args: [join(raiz, "node_modules", "eslint", "bin", "eslint.js")],
  };
}

export function rodar(alvo, { podar = false, raiz = DC360, stdio = "inherit" } = {}) {
  const { comando, args: base } = comandoDoEslint(raiz);
  if (!existsSync(base[0])) {
    console.error("FALHA: o ESLint não está instalado. Rode `npm ci` em dc360/.");
    return 2;
  }
  // Sem as dependências do aplicativo o lint com tipos enxerga tudo como `any` e
  // passa verde sem ter olhado nada. Mesma regra do `test:campo`: faltar
  // dependência reprova, não pula.
  if (alvo === ALVOS.campo && !existsSync(join(alvo.cwd, "node_modules"))) {
    console.error(
      "FALHA: apps/campo/node_modules não existe, e sem ele o lint com tipos do aplicativo não mede nada. Rode `npm ci` em dc360/apps/campo.",
    );
    return 2;
  }
  const args = ["."];
  if (podar) args.push("--prune-suppressions");
  const r = spawnSync(comando, [...base, ...args], { cwd: alvo.cwd, stdio });
  if (r.error) {
    console.error(`FALHA: não consegui executar o ESLint: ${r.error.message}`);
    return 2;
  }
  return r.status ?? 2;
}

function principal(argv) {
  const so = argv.find((a) => a.startsWith("--so="))?.slice(5);
  const podar = argv.includes("--podar");
  const alvos = so ? [ALVOS[so]] : [ALVOS.monorepo, ALVOS.campo];
  if (alvos.some((a) => a === undefined)) {
    console.error(`--so aceita: ${Object.keys(ALVOS).join(", ")}`);
    return 2;
  }
  let pior = 0;
  for (const alvo of alvos) {
    console.log(`\n== ESLint: ${alvo.nome} ==`);
    const codigo = rodar(alvo, { podar });
    console.log(codigo === 0 ? `OK: ${alvo.nome}` : `REPROVADO: ${alvo.nome} (código ${codigo})`);
    pior = Math.max(pior, codigo);
  }
  return pior;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal(process.argv.slice(2)));
}
