/**
 * Política de varredura de segredos (V2-F01-E04).
 *
 * O que este teste garante, e por quê:
 *
 * - A allowlist do `.gitleaks.toml` é estreita e não apodrece. Todo caminho
 *   perdoado é UM arquivo, escrito por inteiro, que existe hoje; pasta
 *   inteira, curinga e exceção sem razão ou sem regra-alvo reprovam. Um
 *   caminho que sumiu do repositório deixaria uma exceção órfã, pronta para
 *   absolver o próximo arquivo que aparecer com aquele nome.
 * - O hook de pre-commit existe, é executável, só AVISA quando o gitleaks não
 *   está instalado (hook opcional por máquina, o CI é o portão) e BARRA
 *   quando o gitleaks acusa.
 * - O workflow chama o gitleaks com histórico completo, `--redact`,
 *   permissão mínima, binário de versão fixa com SHA-256 e ações fixadas por
 *   SHA de commit, sem receber nenhum segredo.
 *
 * Este teste não roda o gitleaks de verdade: o binário não existe em toda
 * máquina e o teste não pode depender dele (nem pular por causa dele). A prova
 * de que a varredura acusa e perdoa fica na evidência da etapa.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ_DO_PRODUTO = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = join(RAIZ_DO_PRODUTO, "..");
const WINDOWS = process.platform === "win32";
const BASH = WINDOWS ? "bash" : execFileSync("sh", ["-c", "command -v bash"], { encoding: "utf8" }).trim();

/**
 * Lê as listas de exceção de um `.gitleaks.toml`. É um leitor mínimo de
 * propósito: só entende o subconjunto que a política usa (cabeçalho
 * `[[allowlists]]`, `chave = "texto"`, `chave = ["a", "b"]` com aspas simples
 * triplas ou duplas, tudo numa linha). Linha que ele não entende reprova,
 * em vez de ser ignorada em silêncio.
 */
export function lerAllowlists(texto) {
  const listas = [];
  let atual = null;
  for (const [i, bruta] of texto.split(/\r?\n/).entries()) {
    const linha = bruta.trim();
    if (linha === "" || linha.startsWith("#")) continue;
    if (linha === "[[allowlists]]") {
      atual = { _linha: i + 1 };
      listas.push(atual);
      continue;
    }
    if (/^\[.*\]$/.test(linha)) {
      atual = null; // outra seção ([extend], por exemplo)
      continue;
    }
    const m = /^([A-Za-z]+)\s*=\s*(.+)$/.exec(linha);
    if (!m) throw new Error(`.gitleaks.toml linha ${i + 1}: não entendi "${linha.slice(0, 60)}"`);
    if (!atual) continue; // chave de outra seção
    atual[m[1]] = lerValor(m[2], i + 1);
  }
  return listas;
}

function lerValor(valor, numeroDaLinha) {
  const v = valor.trim();
  if (v.startsWith("[")) {
    if (!v.endsWith("]")) throw new Error(`.gitleaks.toml linha ${numeroDaLinha}: lista precisa caber numa linha`);
    const itens = [];
    const padrao = /'''(.*?)'''|"((?:[^"\\]|\\.)*)"/g;
    let achou;
    while ((achou = padrao.exec(v.slice(1, -1))) !== null) itens.push(achou[1] ?? achou[2]);
    return itens;
  }
  const texto = /^"((?:[^"\\]|\\.)*)"$/.exec(v);
  if (texto) return texto[1];
  throw new Error(`.gitleaks.toml linha ${numeroDaLinha}: valor não suportado "${v.slice(0, 40)}"`);
}

/** Forma aceita para um caminho da allowlist: ^arquivo/inteiro\.ext$ , sem metacaractere. */
const ARQUIVO_LITERAL = /^\^((?:[A-Za-z0-9_\-/]|\\\.)+)\$$/;

/** Devolve a lista de problemas da política para um texto de `.gitleaks.toml`. */
export function problemasDaAllowlist(texto, raiz) {
  const problemas = [];
  const listas = lerAllowlists(texto);
  if (!/^useDefault\s*=\s*true\s*$/m.test(texto)) {
    problemas.push("falta `useDefault = true` em [extend]: sem as regras padrão a varredura enxerga quase nada");
  }
  if (listas.length === 0) problemas.push("nenhuma allowlist declarada");
  for (const lista of listas) {
    const onde = `allowlist da linha ${lista._linha}`;
    if (typeof lista.description !== "string" || lista.description.trim().length < 40) {
      problemas.push(`${onde}: falta a razão (description com pelo menos 40 caracteres)`);
    }
    if (!Array.isArray(lista.targetRules) || lista.targetRules.length === 0) {
      problemas.push(`${onde}: falta targetRules (a exceção valeria para TODAS as regras)`);
    }
    const caminhos = lista.paths ?? [];
    const regexes = lista.regexes ?? [];
    if (caminhos.length === 0 && regexes.length === 0) {
      problemas.push(`${onde}: sem paths nem regexes (perdoaria tudo)`);
    }
    if (caminhos.length > 0 && regexes.length === 0 && lista.condition !== "AND" && caminhos.length > 1) {
      problemas.push(`${onde}: mais de um caminho na mesma exceção, uma exceção por arquivo`);
    }
    for (const caminho of caminhos) {
      const forma = ARQUIVO_LITERAL.exec(caminho);
      if (!forma) {
        problemas.push(`${onde}: o caminho "${caminho}" não é um arquivo escrito por inteiro (use ^pasta/arquivo\\.ext$)`);
        continue;
      }
      const relativo = forma[1].replace(/\\\./g, ".");
      const absoluto = join(raiz, relativo);
      if (!existsSync(absoluto)) {
        problemas.push(`${onde}: o caminho "${relativo}" não existe mais (exceção órfã)`);
      } else if (!statSync(absoluto).isFile()) {
        problemas.push(`${onde}: "${relativo}" é pasta, e pasta inteira não pode ser perdoada`);
      }
    }
    for (const r of regexes) {
      try {
        new RegExp(r);
      } catch {
        problemas.push(`${onde}: a regex "${r}" não compila`);
        continue;
      }
      if (/^(\^)?\.[*+]\$?$/.test(r) || r.length < 12) {
        problemas.push(`${onde}: a regex "${r}" é curta ou ampla demais`);
      }
    }
    if (regexes.length > 0 && lista.regexTarget !== "line" && lista.regexTarget !== "match") {
      problemas.push(`${onde}: regex sem regexTarget "line" ou "match" (o padrão, "secret", casa o valor escondido)`);
    }
  }
  return problemas;
}

const TOML = readFileSync(join(RAIZ, ".gitleaks.toml"), "utf8");
const WORKFLOW = readFileSync(join(RAIZ, ".github", "workflows", "segredos.yml"), "utf8");
const HOOK_CAMINHO = join(RAIZ, ".githooks", "pre-commit");

describe("allowlist do .gitleaks.toml", () => {
  it("cumpre a política: arquivos existentes, razão escrita, regra-alvo, sem curinga", () => {
    assert.deepEqual(problemasDaAllowlist(TOML, RAIZ), []);
  });

  it("tem as exceções que a E04 triou (nem mais pouco, nem a pasta de testes inteira)", () => {
    const listas = lerAllowlists(TOML);
    const todosOsCaminhos = listas.flatMap((l) => l.paths ?? []);
    assert.ok(todosOsCaminhos.length >= 5, "esperava as exceções de fixture e de evidência triadas");
    assert.ok(
      !todosOsCaminhos.some((c) => /\/test\/?\$?$/.test(c)),
      "pasta de testes inteira nunca entra na allowlist",
    );
  });

  it("reprova caminho que não existe", () => {
    const texto = [
      "[extend]",
      "useDefault = true",
      "[[allowlists]]",
      'description = "Fixture que um dia existiu e foi removida do repositório, restou a exceção."',
      'targetRules = ["generic-api-key"]',
      "paths = ['''^dc360/apps/api/test/arquivo-que-nao-existe\\.test\\.ts$''']",
    ].join("\n");
    const problemas = problemasDaAllowlist(texto, RAIZ);
    assert.equal(problemas.length, 1);
    assert.match(problemas[0], /não existe mais/);
  });

  it("reprova pasta inteira, curinga e padrão que não é arquivo", () => {
    const base = ["[extend]", "useDefault = true", "[[allowlists]]", 'description = "Razão escrita com tamanho suficiente para passar do mínimo."', 'targetRules = ["private-key"]'];
    const pasta = problemasDaAllowlist([...base, "paths = ['''^dc360/apps/api/test/$''']"].join("\n"), RAIZ);
    assert.match(pasta.join("\n"), /pasta|não existe|não é um arquivo/);
    const curinga = problemasDaAllowlist([...base, "paths = ['''^dc360/apps/api/test/.*$''']"].join("\n"), RAIZ);
    assert.match(curinga.join("\n"), /não é um arquivo escrito por inteiro/);
    const semAncora = problemasDaAllowlist([...base, "paths = ['''dc360/package\\.json''']"].join("\n"), RAIZ);
    assert.match(semAncora.join("\n"), /não é um arquivo escrito por inteiro/);
    const realPasta = problemasDaAllowlist([...base, "paths = ['''^dc360/apps$''']"].join("\n"), RAIZ);
    assert.match(realPasta.join("\n"), /é pasta/);
  });

  it("reprova exceção sem razão, sem regra-alvo ou sem critério nenhum", () => {
    const semRazao = problemasDaAllowlist(
      ["[extend]", "useDefault = true", "[[allowlists]]", 'targetRules = ["jwt"]', "paths = ['''^dc360/package\\.json$''']"].join("\n"),
      RAIZ,
    );
    assert.match(semRazao.join("\n"), /falta a razão/);
    const semRegra = problemasDaAllowlist(
      ["[extend]", "useDefault = true", "[[allowlists]]", 'description = "Razão escrita com tamanho suficiente para passar do mínimo."', "paths = ['''^dc360/package\\.json$''']"].join("\n"),
      RAIZ,
    );
    assert.match(semRegra.join("\n"), /falta targetRules/);
    const vazia = problemasDaAllowlist(
      ["[extend]", "useDefault = true", "[[allowlists]]", 'description = "Razão escrita com tamanho suficiente para passar do mínimo."', 'targetRules = ["jwt"]'].join("\n"),
      RAIZ,
    );
    assert.match(vazia.join("\n"), /sem paths nem regexes/);
  });

  it("reprova regex ampla demais e config que desliga as regras padrão", () => {
    const ampla = problemasDaAllowlist(
      ["[extend]", "useDefault = true", "[[allowlists]]", 'description = "Razão escrita com tamanho suficiente para passar do mínimo."', 'targetRules = ["jwt"]', 'regexTarget = "line"', "regexes = ['''.*''']"].join("\n"),
      RAIZ,
    );
    assert.match(ampla.join("\n"), /curta ou ampla demais/);
    const semPadrao = problemasDaAllowlist(
      ["[[allowlists]]", 'description = "Razão escrita com tamanho suficiente para passar do mínimo."', 'targetRules = ["jwt"]', "paths = ['''^dc360/package\\.json$''']"].join("\n"),
      RAIZ,
    );
    assert.match(semPadrao.join("\n"), /useDefault/);
  });

  it("não aceita linha que o leitor não entende (não ignora em silêncio)", () => {
    assert.throws(() => lerAllowlists("[[allowlists]]\nisto nao e toml"), /não entendi/);
  });
});

describe("hook .githooks/pre-commit", () => {
  it("existe, começa com shebang de bash e varre só o que está em stage, com relatório redigido", () => {
    assert.ok(existsSync(HOOK_CAMINHO), ".githooks/pre-commit não existe");
    const hook = readFileSync(HOOK_CAMINHO, "utf8");
    assert.match(hook, /^#!\/usr\/bin\/env bash\n/);
    assert.match(hook, /gitleaks git --pre-commit --staged/);
    assert.match(hook, /--redact/);
    assert.match(hook, /--config "\$\{raiz\}\/\.gitleaks\.toml"/);
  });

  it("é executável", { skip: WINDOWS && "bit de execução não existe no Windows" }, () => {
    assert.ok((statSync(HOOK_CAMINHO).mode & 0o111) !== 0, "falta o bit de execução (chmod +x)");
  });

  it("no índice do git o hook está versionado como executável (100755), que é o que Linux e macOS obedecem", () => {
    const saida = execFileSync("git", ["-C", RAIZ, "ls-files", "-s", "--", ".githooks/pre-commit"], { encoding: "utf8" });
    assert.match(saida, /^100755 /, "hook fora do índice ou sem o modo 100755 (git update-index --chmod=+x)");
  });

  it("sem gitleaks instalado: só avisa e deixa o commit seguir", { skip: WINDOWS && "hook em bash" }, () => {
    const { pasta, ambiente, limpar } = montarCenario({ comGitleaks: null });
    try {
      const r = spawnSync(BASH, [HOOK_CAMINHO], { cwd: pasta, env: ambiente, encoding: "utf8" });
      assert.equal(r.status, 0, `esperava 0, veio ${r.status}: ${r.stderr}`);
      assert.match(r.stderr, /AVISO \(pre-commit\): gitleaks não está instalado/);
    } finally {
      limpar();
    }
  });

  it("com gitleaks que acusa: o commit é barrado e o gitleaks recebe --staged, --redact e a configuração", { skip: WINDOWS && "hook em bash" }, () => {
    const { pasta, ambiente, limpar, registro } = montarCenario({ comGitleaks: 1 });
    try {
      const r = spawnSync(BASH, [HOOK_CAMINHO], { cwd: pasta, env: ambiente, encoding: "utf8" });
      assert.equal(r.status, 1, `esperava 1, veio ${r.status}: ${r.stderr}`);
      const argumentos = readFileSync(registro, "utf8");
      assert.match(argumentos, /git --pre-commit --staged/);
      assert.match(argumentos, /--redact/);
      assert.match(argumentos, /--config .*\.gitleaks\.toml/);
    } finally {
      limpar();
    }
  });

  it("com gitleaks que não acha nada: o commit segue", { skip: WINDOWS && "hook em bash" }, () => {
    const { pasta, ambiente, limpar } = montarCenario({ comGitleaks: 0 });
    try {
      const r = spawnSync(BASH, [HOOK_CAMINHO], { cwd: pasta, env: ambiente, encoding: "utf8" });
      assert.equal(r.status, 0, `esperava 0, veio ${r.status}: ${r.stderr}`);
    } finally {
      limpar();
    }
  });
});

describe("workflow segredos.yml", () => {
  it("chama o gitleaks no histórico completo, redigido e com a configuração do repositório", () => {
    assert.match(WORKFLOW, /fetch-depth:\s*0/);
    assert.match(WORKFLOW, /gitleaks"? git\b/);
    assert.match(WORKFLOW, /--redact/);
    assert.match(WORKFLOW, /--config \.gitleaks\.toml/);
    assert.match(WORKFLOW, /persist-credentials:\s*false/);
  });

  it("segue as regras de workflow da fundação: permissão mínima, prazo, runner e ações fixadas", () => {
    assert.match(WORKFLOW, /^permissions:\n  contents: read\n/m);
    assert.equal((WORKFLOW.match(/^\s*permissions:/gm) ?? []).length, 1, "uma única declaração de permissions, de leitura");
    assert.ok(!/(write|admin)$/m.test(WORKFLOW.match(/^permissions:\n(  .*\n)+/m)?.[0] ?? ""), "permissions sem escrita");
    const jobs = (WORKFLOW.match(/^  [a-z][a-z0-9-]*:\n    name:/gm) ?? []).length;
    assert.ok(jobs >= 1);
    assert.equal((WORKFLOW.match(/timeout-minutes:/g) ?? []).length, jobs, "todo job tem timeout-minutes");
    assert.equal((WORKFLOW.match(/runs-on: ubuntu-24\.04/g) ?? []).length, jobs, "todo job roda em ubuntu-24.04");
    const usos = [...WORKFLOW.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)];
    assert.ok(usos.length >= 1);
    for (const [, alvo, resto] of usos) {
      assert.match(alvo, /@[0-9a-f]{40}$/, `ação sem SHA completo: ${alvo}`);
      assert.match(resto, /#\s*v\d/, `ação sem a versão em comentário: ${alvo}`);
    }
  });

  it("fixa o binário do gitleaks por versão e SHA-256, sem ação de terceiro licenciada", () => {
    const versao = /GITLEAKS_VERSAO:\s*"(\d+\.\d+\.\d+)"/.exec(WORKFLOW)?.[1];
    const sha = /GITLEAKS_SHA256:\s*"([0-9a-f]{64})"/.exec(WORKFLOW)?.[1];
    assert.ok(versao, "falta GITLEAKS_VERSAO");
    assert.ok(sha, "falta GITLEAKS_SHA256 com 64 dígitos hexadecimais");
    assert.match(WORKFLOW, /gitleaks_\$\{GITLEAKS_VERSAO\}_linux_x64\.tar\.gz/);
    assert.match(WORKFLOW, /sha256sum --check --strict/);
    assert.ok(!/^\s*(?:-\s*)?uses:\s*gitleaks\//m.test(WORKFLOW), "a ação gitleaks-action é licenciada: não usar");
    assert.ok(versao.localeCompare("8.25.0", undefined, { numeric: true }) >= 0, "targetRules da allowlist exige gitleaks >= 8.25");
  });

  it("não recebe segredo nenhum (nem GITHUB_TOKEN explícito) nem escreve no repositório", () => {
    assert.ok(!/\$\{\{\s*secrets\./.test(WORKFLOW), "o workflow de segredos não pode receber segredo");
    assert.ok(!/pull_request_target/.test(WORKFLOW), "pull_request_target roda com segredo e escrita: proibido aqui");
  });
});

describe("script preparar", () => {
  it("aponta core.hooksPath para .githooks, a pasta onde o hook mora", () => {
    const pacote = JSON.parse(readFileSync(join(RAIZ_DO_PRODUTO, "package.json"), "utf8"));
    assert.equal(pacote.scripts.preparar, "git config core.hooksPath .githooks");
    assert.ok(existsSync(join(RAIZ, ".githooks", "pre-commit")));
  });

  it("não é um gancho automático do npm (hook é opt-in por máquina)", () => {
    const pacote = JSON.parse(readFileSync(join(RAIZ_DO_PRODUTO, "package.json"), "utf8"));
    for (const automatico of ["prepare", "postinstall", "preinstall", "install"]) {
      assert.ok(!(automatico in pacote.scripts), `scripts.${automatico} instalaria o hook sem ninguém pedir`);
    }
  });
});

/**
 * Monta um repositório vazio e um PATH sem gitleaks (ou com um falso que
 * registra os argumentos e sai com o código pedido).
 */
function montarCenario({ comGitleaks }) {
  const base = mkdtempSync(join(tmpdir(), "dc360-segredos-"));
  const repo = join(base, "repo");
  const bin = join(base, "bin");
  mkdirSync(repo);
  mkdirSync(bin);
  const caminhoDoGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  symlinkSync(caminhoDoGit, join(bin, "git"));
  const caminhoDoEnv = execFileSync("sh", ["-c", "command -v env"], { encoding: "utf8" }).trim();
  symlinkSync(caminhoDoEnv, join(bin, "env"));
  execFileSync("git", ["init", "--quiet", repo]);
  // O hook calcula a raiz com `git rev-parse --show-toplevel` e procura o .gitleaks.toml nela.
  writeFileSync(join(repo, ".gitleaks.toml"), "[extend]\nuseDefault = true\n");
  const registro = join(base, "argumentos.txt");
  if (comGitleaks !== null) {
    const falso = join(bin, "gitleaks");
    writeFileSync(falso, `#!/bin/sh\necho "$@" > "${registro}"\nexit ${comGitleaks}\n`);
    chmodSync(falso, 0o755);
  }
  return {
    pasta: repo,
    registro,
    ambiente: { PATH: bin, HOME: base, GIT_CONFIG_NOSYSTEM: "1" },
    limpar: () => rmSync(base, { recursive: true, force: true }),
  };
}
