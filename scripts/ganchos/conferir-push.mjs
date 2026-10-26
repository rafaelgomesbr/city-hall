/**
 * A regra da master sem ruleset (D-33, item 4, seção 21 de `docs/roadmap-v2/28-execucao-e-validacao.md`).
 *
 * Repositório privado no plano gratuito do GitHub não tem ruleset nem proteção de ramo. Este conferidor roda
 * no gancho `pre-push` (`scripts/ganchos/pre-push`, ligado por `git config core.hooksPath scripts/ganchos`) e
 * recusa push em `master` que não siga a regra:
 *
 * 1. Cada commit novo na linha principal de master (primeiro pai) é um COMMIT DE MERGE (dois pais), nunca
 *    squash nem commit direto, ou um commit que só toca `docs/evidencias-v2/ci-local/**` (o arquivamento da
 *    evidência do CI local, que só pode vir depois do merge, porque roda sobre o SHA dele).
 * 2. Todo commit de merge novo tem, na árvore que está sendo empurrada, a evidência do CI local do próprio
 *    SHA (`docs/evidencias-v2/ci-local/<sha>/resumo.json`) com `"verde": true`.
 * 3. Nunca reescrever master: push que não é avanço rápido sobre o master remoto é recusado.
 *
 * Limitação declarada na D-33: gancho local se pula com `--no-verify` e não protege contra outra máquina. A
 * proteção principal continua sendo "merge em master só pelo Rafael".
 */
import { execFileSync } from "node:child_process";

const ZERO = /^0+$/;
const PASTA_DA_EVIDENCIA = "docs/evidencias-v2/ci-local/";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Lê as linhas que o git passa ao pre-push: "<ref local> <sha local> <ref remota> <sha remoto>". */
export function lerAtualizacoes(entrada) {
  return entrada
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 4)
    .map(([refLocal, shaLocal, refRemota, shaRemoto]) => ({ refLocal, shaLocal, refRemota, shaRemoto }));
}

/**
 * Confere uma atualização de master. `consultar` isola o git para o teste: { ehAncestral(a, b), pais(sha),
 * arquivosMudados(sha), lerArquivo(sha, caminho), linhaPrincipal(de, ate) }. Devolve a lista de problemas.
 */
export function conferirMaster(atualizacao, consultar) {
  const { shaLocal, shaRemoto } = atualizacao;
  if (ZERO.test(shaLocal)) return ["apagar master é proibido"];
  const problemas = [];
  const base = ZERO.test(shaRemoto) ? null : shaRemoto;
  if (base && !consultar.ehAncestral(base, shaLocal)) {
    return [`o push reescreve master: ${shaRemoto.slice(0, 8)} não é ancestral de ${shaLocal.slice(0, 8)}`];
  }
  for (const sha of consultar.linhaPrincipal(base, shaLocal)) {
    const curto = sha.slice(0, 8);
    const pais = consultar.pais(sha);
    if (pais.length >= 2) {
      const caminho = `${PASTA_DA_EVIDENCIA}${sha}/resumo.json`;
      const texto = consultar.lerArquivo(shaLocal, caminho);
      if (texto === null) {
        problemas.push(`${curto} é merge sem evidência do CI local (${caminho} ausente no que está sendo empurrado)`);
        continue;
      }
      let resumo;
      try {
        resumo = JSON.parse(texto);
      } catch {
        problemas.push(`${curto}: ${caminho} não é JSON legível`);
        continue;
      }
      if (resumo.sha !== sha) problemas.push(`${curto}: o resumo.json fala de outro SHA (${String(resumo.sha).slice(0, 8)})`);
      if (resumo.verde !== true) problemas.push(`${curto}: o CI local deste merge não está verde`);
      continue;
    }
    const arquivos = consultar.arquivosMudados(sha);
    const soEvidencia = arquivos.length > 0 && arquivos.every((a) => a.startsWith(PASTA_DA_EVIDENCIA));
    if (!soEvidencia) {
      problemas.push(`${curto} não é commit de merge e não é só arquivamento de evidência do CI local (master aceita só merge, nunca squash nem commit direto)`);
    }
  }
  return problemas;
}

/** O consultor de verdade, sobre o repositório em `cwd`. */
export function consultorDoGit(cwd) {
  return {
    ehAncestral(a, b) {
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", a, b], { cwd, stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
    pais(sha) {
      return git(["rev-list", "--parents", "-n", "1", sha], cwd).split(" ").slice(1);
    },
    arquivosMudados(sha) {
      const saida = git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha], cwd);
      return saida ? saida.split("\n") : [];
    },
    lerArquivo(sha, caminho) {
      try {
        return execFileSync("git", ["show", `${sha}:${caminho}`], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return null;
      }
    },
    linhaPrincipal(de, ate) {
      const intervalo = de ? `${de}..${ate}` : ate;
      const saida = git(["rev-list", "--first-parent", "--reverse", intervalo], cwd);
      return saida ? saida.split("\n") : [];
    },
  };
}

export function conferirPush(entrada, cwd = process.cwd()) {
  const consultar = consultorDoGit(cwd);
  return lerAtualizacoes(entrada)
    .filter((a) => a.refRemota === "refs/heads/master")
    .flatMap((a) => conferirMaster(a, consultar));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/").replace(/^\/?/, "/")}` || process.argv[1]?.endsWith("conferir-push.mjs")) {
  let entrada = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (entrada += c));
  process.stdin.on("end", () => {
    const problemas = conferirPush(entrada);
    if (problemas.length > 0) {
      console.error("\nPush em master recusado pela regra da D-33 (seção 21 de 28-execucao-e-validacao.md):\n");
      for (const p of problemas) console.error(`  - ${p}`);
      console.error("\nMaster só aceita commit de merge com CI local verde do próprio SHA, mais o commit que arquiva essa evidência.\n");
      process.exit(1);
    }
  });
}
