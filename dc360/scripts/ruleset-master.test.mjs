/**
 * O ruleset da master (V2-F01-E01) prende a regra "nada entra sem PR e sem CI".
 *
 * Por que um teste de arquivo: o ruleset só vale depois que o Rafael o importa no
 * GitHub, e nenhum teste do repositório enxerga o GitHub. O que dá para provar
 * aqui, e que se perde sem ninguém notar, é a ligação entre o JSON e o resto:
 * o nome de cada check obrigatório TEM de ser o nome de exibição de um job que
 * roda em pull request. Um check obrigatório com nome que não existe deixa todo
 * PR esperando para sempre ("Expected, waiting for status"), e um job renomeado
 * (o roadmap já renomeou "Testes, tipos e auditoria") faz exatamente isso.
 *
 * O repositório não tem biblioteca de YAML, então os workflows são lidos por
 * blocos de texto, sobre o formato que eles usam: `jobs:` e, dentro, um bloco
 * por job, que começa em `  <id>:` (dois espaços) e tem `    name:` (quatro).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const ler = (relativo) => readFileSync(new URL(relativo, new URL("../../", import.meta.url)), "utf8");

// Montado por código para este arquivo não conter o caractere (o portão de conteúdo varre tudo).
const TRAVESSAO = String.fromCharCode(0x2014);

const WORKFLOWS =["verificar.yml", "segredos.yml", "sast.yml"];

/** Jobs de um workflow: id, nome de exibição e se há `if:` no nível do job. */
function jobsDoWorkflow(texto) {
  const depoisDeJobs = texto.split(/^jobs:\s*$/m)[1];
  if (depoisDeJobs === undefined) return [];
  const blocos = depoisDeJobs.split(/^  ([A-Za-z0-9_-]+):\s*$/m).slice(1);
  const jobs = [];
  for (let i = 0; i < blocos.length; i += 2) {
    const id = blocos[i];
    const corpo = blocos[i + 1] ?? "";
    const nome = /^    name:\s*(.+?)\s*$/m.exec(corpo)?.[1]?.replace(/^"(.*)"$/, "$1");
    jobs.push({ id, nome: nome ?? id, condicional: /^    if:/m.test(corpo) });
  }
  return jobs;
}

/** Nomes de exibição dos jobs que rodam em todo pull request (sem `if:` e sem matriz). */
function nomesQueRodamEmPullRequest() {
  const nomes = new Set();
  for (const arquivo of WORKFLOWS) {
    for (const job of jobsDoWorkflow(ler(`.github/workflows/${arquivo}`))) {
      if (job.condicional) continue;
      if (job.nome.includes("${{")) continue; // matriz: o nome varia por execução
      nomes.add(job.nome);
    }
  }
  return nomes;
}

/** Todas as verificações do ruleset em função pura, para o caso negativo provar que elas mordem. */
function problemasDoRuleset(ruleset, nomesReais) {
  const problemas = [];
  if (ruleset.target !== "branch") problemas.push("o alvo não é branch");
  if (ruleset.enforcement !== "active") problemas.push("o ruleset não está ativo");
  const incluidos = ruleset.conditions?.ref_name?.include ?? [];
  if (incluidos.length !== 1 || incluidos[0] !== "refs/heads/master") problemas.push("não mira só refs/heads/master");
  if ((ruleset.conditions?.ref_name?.exclude ?? []).length > 0) problemas.push("exclui ramos");
  if ((ruleset.bypass_actors ?? []).length > 0) problemas.push("tem exceção (bypass_actors)");

  const regras = new Map((ruleset.rules ?? []).map((r) => [r.type, r]));
  for (const tipo of ["deletion", "non_fast_forward", "required_linear_history"]) {
    if (!regras.has(tipo)) problemas.push(`falta a regra ${tipo}`);
  }

  const pr = regras.get("pull_request")?.parameters;
  if (!pr) problemas.push("falta a regra pull_request");
  else {
    if (pr.required_approving_review_count !== 0) problemas.push("aprovações exigidas não são 0 (travaria quem contribui sozinho)");
    if (pr.require_code_owner_review !== false) problemas.push("exige revisão do dono do código (travaria quem contribui sozinho)");
    const metodos = pr.allowed_merge_methods ?? [];
    if (metodos.length !== 1 || metodos[0] !== "squash") problemas.push("o merge não é só squash");
  }

  const checks = regras.get("required_status_checks")?.parameters;
  if (!checks) problemas.push("falta a regra required_status_checks");
  else {
    if (checks.strict_required_status_checks_policy !== true) problemas.push("não exige o branch atualizado");
    const contextos = (checks.required_status_checks ?? []).map((c) => c.context);
    if (contextos.length === 0) problemas.push("nenhum check obrigatório");
    if (new Set(contextos).size !== contextos.length) problemas.push("check repetido");
    for (const contexto of contextos) {
      if (!nomesReais.has(contexto)) problemas.push(`o check "${contexto}" não é o nome de nenhum job que roda em pull request`);
    }
    for (const obrigatorio of ["Varredura de segredos", "SAST (Semgrep)"]) {
      if (!contextos.includes(obrigatorio)) problemas.push(`falta o check "${obrigatorio}"`);
    }
    for (const c of checks.required_status_checks ?? []) {
      if (c.integration_id !== 15368) problemas.push(`o check "${c.context}" não está preso ao GitHub Actions (integration_id 15368)`);
    }
  }
  return problemas;
}

const ruleset = JSON.parse(ler(".github/rulesets/master.json"));
const nomesReais = nomesQueRodamEmPullRequest();

test("o leitor de workflows acha os jobs que a regra precisa (senão os casos abaixo não provam nada)", () => {
  for (const esperado of ["Testes, tipos e scripts", "Varredura de segredos", "SAST (Semgrep)", "Aplicativo de campo"]) {
    assert.ok(nomesReais.has(esperado), `o leitor não achou o job "${esperado}"`);
  }
  // Os dois jobs longos têm `if:` e nem existem em pull request: ficar fora da lista é de propósito.
  assert.ok(!nomesReais.has("Linha de base (baseline.mjs) em Linux"));
  assert.ok(!nomesReais.has("Restore do banco, Postgres 17 (CA-08)"));
});

test("o ruleset real da master não tem problema nenhum", () => {
  assert.deepEqual(problemasDoRuleset(ruleset, nomesReais), []);
});

test("cada check obrigatório é o nome de exibição de um job que roda em todo pull request", () => {
  const contextos = ruleset.rules.find((r) => r.type === "required_status_checks").parameters.required_status_checks.map((c) => c.context);
  assert.ok(contextos.length >= 9);
  for (const contexto of contextos) assert.ok(nomesReais.has(contexto), `"${contexto}" não existe nos workflows`);
});

test("sem exceção para ninguém, nem para administrador", () => {
  assert.deepEqual(ruleset.bypass_actors, []);
});

test("o merge é só por squash e a master não aceita force-push nem exclusão", () => {
  const tipos = ruleset.rules.map((r) => r.type);
  assert.ok(tipos.includes("non_fast_forward"));
  assert.ok(tipos.includes("deletion"));
  assert.deepEqual(ruleset.rules.find((r) => r.type === "pull_request").parameters.allowed_merge_methods, ["squash"]);
});

test("negativo: ruleset com exceção, check inventado, 2 métodos de merge e sem os checks novos é reprovado", () => {
  const estragado = structuredClone(ruleset);
  estragado.bypass_actors = [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }];
  const pr = estragado.rules.find((r) => r.type === "pull_request").parameters;
  pr.allowed_merge_methods = ["squash", "merge"];
  pr.required_approving_review_count = 1;
  const checks = estragado.rules.find((r) => r.type === "required_status_checks").parameters;
  checks.required_status_checks = [{ context: "Testes, tipos e auditoria", integration_id: 15368 }];
  checks.strict_required_status_checks_policy = false;
  const problemas = problemasDoRuleset(estragado, nomesReais).join(" | ");
  assert.match(problemas, /bypass_actors/);
  assert.match(problemas, /só squash/);
  assert.match(problemas, /não são 0/);
  assert.match(problemas, /Testes, tipos e auditoria/);
  assert.match(problemas, /Varredura de segredos/);
  assert.match(problemas, /SAST \(Semgrep\)/);
  assert.match(problemas, /atualizado/);
});

test("negativo: ruleset sem force-push bloqueado e sem alvo na master é reprovado", () => {
  const estragado = structuredClone(ruleset);
  estragado.rules = estragado.rules.filter((r) => r.type !== "non_fast_forward");
  estragado.conditions.ref_name.include = ["~DEFAULT_BRANCH", "refs/heads/v2/*"];
  estragado.enforcement = "evaluate";
  const problemas = problemasDoRuleset(estragado, nomesReais).join(" | ");
  assert.match(problemas, /non_fast_forward/);
  assert.match(problemas, /refs\/heads\/master/);
  assert.match(problemas, /não está ativo/);
});

test("o CODEOWNERS nomeia as migrações, a autenticação da API e o .github, e os caminhos existem", () => {
  const texto = ler(".github/CODEOWNERS");
  const linhas = texto.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  const caminhos = linhas.map((l) => l.trim().split(/\s+/)[0]);
  assert.deepEqual(caminhos, ["/dc360/db/migrations/", "/dc360/apps/api/src/auth/", "/.github/"]);
  for (const linha of linhas) assert.match(linha, /@\S+$/, `a linha "${linha}" não tem dono`);
  for (const caminho of caminhos) assert.ok(existsSync(RAIZ + caminho.slice(1)), `${caminho} não existe`);
});

test("o modelo de PR traz o checklist de auto-aprovação (gates locais, migração aditiva, rollback, evidência)", () => {
  const texto = ler(".github/pull_request_template.md");
  for (const trecho of ["Gates locais", "Migração aditiva", "Rollback", "Evidência", "Isolamento e autorização", "Segredos"]) {
    assert.ok(texto.includes(`**${trecho}`), `falta o item "${trecho}"`);
  }
  assert.ok((texto.match(/^- \[ \] /gm) ?? []).length >= 6);
  assert.ok(!texto.includes(TRAVESSAO), "travessão no modelo de PR");
});

test("o CLAUDE.md manda a master por PR e o texto novo não tem travessão", () => {
  const texto = ler("CLAUDE.md");
  assert.match(texto, /`master` não recebe commit direto/);
  assert.match(texto, /\.github\/rulesets\/master\.json/);
  for (const arquivo of [".github/rulesets/master.json", ".github/CODEOWNERS", ".github/pull_request_template.md"]) {
    assert.ok(!ler(arquivo).includes(TRAVESSAO), `travessão em ${arquivo}`);
  }
});
