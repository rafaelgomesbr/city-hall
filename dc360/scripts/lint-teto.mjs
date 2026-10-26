#!/usr/bin/env node
/**
 * O teto da baseline de lint e de formatação (V2-F01-E17): a baseline só desce.
 *
 * O ESLint já reprova achado novo (a contagem por arquivo e regra em
 * `eslint-suppressions.json` é um teto local) e reprova supressão que sobrou
 * sem achado. O que ele NÃO impede é alguém regenerar a baseline com
 * `--suppress-all` depois de introduzir um defeito: a contagem nova vira o
 * "registrado" e tudo fica verde. Este script fecha esse buraco com dois
 * portões:
 *
 *   conferir     `lint-teto.json` é EXATAMENTE a soma das duas baselines
 *                (monorepo e aplicativo). Teto com folga (maior que a soma) é
 *                reprovado também: folga é espaço para o achado novo se esconder.
 *   contra-base  o teto, a contagem de cada regra, a contagem de CADA PAR
 *                (projeto, arquivo, regra) e a lista de arquivos sem formatação
 *                não podem subir em relação ao ramo-base do PR. O par importa:
 *                só o total e a regra deixam corrigir uma supressão num arquivo
 *                e abrir outra do mesmo tipo em outro, e o total fica igual.
 *
 * Uso (em `dc360/`):
 *   node scripts/lint-teto.mjs conferir
 *   node scripts/lint-teto.mjs contra-base <ref>     (ex.: origin/master)
 *   node scripts/lint-teto.mjs atualizar             (só grava se nada subiu)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DC360 = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const ARQUIVOS = {
  teto: "lint-teto.json",
  monorepo: "eslint-suppressions.json",
  campo: "apps/campo/eslint-suppressions.json",
  formato: "formato-baseline.json",
};

/**
 * Soma as supressões de um `eslint-suppressions.json`
 * ({ arquivo: { regra: { count } } }).
 */
export function contarSupressoes(json) {
  const porRegra = {};
  let total = 0;
  for (const regras of Object.values(json ?? {})) {
    for (const [regra, info] of Object.entries(regras)) {
      const n = Number(info?.count ?? 0);
      porRegra[regra] = (porRegra[regra] ?? 0) + n;
      total += n;
    }
  }
  return { total, porRegra };
}

/** Monta o conteúdo de `lint-teto.json` a partir das duas baselines. */
export function montarTeto(monorepo, campo) {
  const a = contarSupressoes(monorepo);
  const b = contarSupressoes(campo);
  const porRegra = {};
  for (const m of [a.porRegra, b.porRegra]) {
    for (const [regra, n] of Object.entries(m)) porRegra[regra] = (porRegra[regra] ?? 0) + n;
  }
  const ordenado = Object.fromEntries(
    Object.entries(porRegra).sort(([x], [y]) => x.localeCompare(y)),
  );
  return {
    versao: 1,
    total: a.total + b.total,
    porProjeto: { monorepo: a.total, campo: b.total },
    porRegra: ordenado,
  };
}

/** O teto gravado tem de ser igual ao calculado: nem folga, nem a menos. */
export function problemasDeConsistencia(gravado, calculado) {
  const problemas = [];
  if (!gravado || typeof gravado !== "object") {
    return ["lint-teto.json ausente ou malformado"];
  }
  if (gravado.total !== calculado.total) {
    const relacao =
      gravado.total > calculado.total ? "com folga (maior que a soma)" : "menor que a soma";
    problemas.push(
      `lint-teto.json diz ${gravado.total}, as baselines somam ${calculado.total}: teto ${relacao}. ` +
        "O teto é exatamente a soma. Para baixar, corrija o achado, rode `npm run lint:podar` e `node scripts/lint-teto.mjs atualizar`.",
    );
  }
  const regras = new Set([
    ...Object.keys(gravado.porRegra ?? {}),
    ...Object.keys(calculado.porRegra),
  ]);
  for (const regra of [...regras].sort()) {
    const g = gravado.porRegra?.[regra] ?? 0;
    const c = calculado.porRegra[regra] ?? 0;
    if (g !== c) problemas.push(`regra ${regra}: lint-teto.json diz ${g}, as baselines somam ${c}`);
  }
  return problemas;
}

/**
 * Nenhum par (projeto, arquivo, regra) pode subir em relação ao ramo-base, e
 * par que não existia não pode aparecer. `atual` e `base` têm a forma
 * `{ monorepo, campo }`, cada um um `eslint-suppressions.json`. Base ausente
 * (`null` no projeto) é a introdução do mecanismo: não há contra o quê comparar.
 * Mover um arquivo que tem supressão também reprova (o par "novo" não existia):
 * a saída é corrigir o achado, não carregá-lo para o endereço novo.
 */
export function problemasPorArquivoERegra(atual, base) {
  const problemas = [];
  if (!atual || !base) return problemas;
  for (const projeto of ["monorepo", "campo"]) {
    const depois = atual[projeto];
    const antes = base[projeto];
    if (!depois || !antes) continue;
    for (const [arquivo, regras] of Object.entries(depois)) {
      for (const [regra, info] of Object.entries(regras ?? {})) {
        const n = Number(info?.count ?? 0);
        const era = Number(antes[arquivo]?.[regra]?.count ?? 0);
        if (n > era) {
          problemas.push(
            `${projeto}: ${arquivo} regra ${regra} subiu: ${era} na base, ${n} aqui` +
              `${era === 0 ? " (par arquivo+regra novo na baseline)" : ""}. ` +
              "Corrija o achado em vez de baselinar.",
          );
        }
      }
    }
  }
  return problemas;
}

/**
 * O PR não pode subir nada em relação ao ramo-base: nem o total, nem a contagem
 * de uma regra, nem regra que não existia, nem arquivo sem formatação a mais.
 * Base ausente (`null`) é a introdução do mecanismo: não há contra o quê comparar.
 */
export function problemasContraBase({
  tetoAtual,
  tetoBase,
  formatoAtual,
  formatoBase,
  supressoesAtual,
  supressoesBase,
}) {
  const problemas = [];
  if (tetoBase && tetoAtual) {
    if (tetoAtual.total > tetoBase.total) {
      problemas.push(
        `o teto de lint subiu: ${tetoBase.total} na base, ${tetoAtual.total} aqui. A baseline só desce.`,
      );
    }
    for (const [regra, n] of Object.entries(tetoAtual.porRegra ?? {})) {
      const antes = tetoBase.porRegra?.[regra] ?? 0;
      if (n > antes) {
        problemas.push(
          `regra ${regra} subiu: ${antes} na base, ${n} aqui${antes === 0 ? " (regra nova na baseline)" : ""}`,
        );
      }
    }
  }
  problemas.push(...problemasPorArquivoERegra(supressoesAtual, supressoesBase));
  if (formatoBase && formatoAtual) {
    const antes = new Set(formatoBase.arquivos ?? []);
    for (const arq of formatoAtual.arquivos ?? []) {
      if (!antes.has(arq))
        problemas.push(
          `arquivo novo na baseline de formatação: ${arq}. Formate-o com \`npx prettier --write\` em vez de baselinar.`,
        );
    }
  }
  return problemas;
}

function lerJson(caminho) {
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, "utf8"));
}

/** Lê um JSON de `dc360/` como ele estava em `ref`; `null` se não existia lá. */
export function lerDoRef(ref, arquivo, raiz = DC360) {
  try {
    const texto = execFileSync("git", ["show", `${ref}:./${arquivo}`], {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(texto);
  } catch (e) {
    const msg = String(e?.stderr ?? e?.message ?? "");
    if (/exists on disk, but not in|does not exist in|path .* does not exist/i.test(msg))
      return null;
    throw new Error(`não consegui ler ${arquivo} em ${ref}: ${msg.trim().split("\n")[0]}`, {
      cause: e,
    });
  }
}

export function calcularAtual(raiz = DC360) {
  const monorepo = lerJson(join(raiz, ARQUIVOS.monorepo));
  const campo = lerJson(join(raiz, ARQUIVOS.campo));
  if (!monorepo || !campo) {
    throw new Error(`faltam ${ARQUIVOS.monorepo} ou ${ARQUIVOS.campo}`);
  }
  return montarTeto(monorepo, campo);
}

function principal(argv) {
  const [comando, ref] = argv;
  if (comando === "conferir") {
    const p = problemasDeConsistencia(lerJson(join(DC360, ARQUIVOS.teto)), calcularAtual());
    if (p.length) {
      console.error(`REPROVADO (${p.length}):\n- ${p.join("\n- ")}`);
      return 1;
    }
    console.log(
      `OK: lint-teto.json confere com as baselines (${calcularAtual().total} supressões).`,
    );
    return 0;
  }
  if (comando === "contra-base") {
    if (!ref) {
      console.error("uso: lint-teto.mjs contra-base <ref>");
      return 2;
    }
    const p = problemasContraBase({
      tetoAtual: lerJson(join(DC360, ARQUIVOS.teto)),
      tetoBase: lerDoRef(ref, ARQUIVOS.teto),
      formatoAtual: lerJson(join(DC360, ARQUIVOS.formato)),
      formatoBase: lerDoRef(ref, ARQUIVOS.formato),
      supressoesAtual: {
        monorepo: lerJson(join(DC360, ARQUIVOS.monorepo)),
        campo: lerJson(join(DC360, ARQUIVOS.campo)),
      },
      supressoesBase: {
        monorepo: lerDoRef(ref, ARQUIVOS.monorepo),
        campo: lerDoRef(ref, ARQUIVOS.campo),
      },
    });
    if (p.length) {
      console.error(`REPROVADO contra ${ref} (${p.length}):\n- ${p.join("\n- ")}`);
      return 1;
    }
    console.log(`OK: nada subiu em relação a ${ref}.`);
    return 0;
  }
  if (comando === "atualizar") {
    const calculado = calcularAtual();
    const caminho = join(DC360, ARQUIVOS.teto);
    const gravado = lerJson(caminho);
    if (gravado) {
      const subiu = problemasContraBase({ tetoAtual: calculado, tetoBase: gravado });
      if (subiu.length) {
        console.error(`RECUSADO: atualizar não sobe o teto.\n- ${subiu.join("\n- ")}`);
        return 1;
      }
    }
    writeFileSync(caminho, `${JSON.stringify(calculado, null, 2)}\n`);
    console.log(`lint-teto.json gravado: ${calculado.total} supressões.`);
    return 0;
  }
  console.error("uso: lint-teto.mjs conferir | contra-base <ref> | atualizar");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(principal(process.argv.slice(2)));
  } catch (e) {
    console.error(`FALHA: ${e.message}`);
    process.exit(2);
  }
}
