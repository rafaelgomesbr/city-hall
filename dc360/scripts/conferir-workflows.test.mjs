/**
 * Regras de CI aplicadas a TODOS os workflows de `.github/workflows/`
 * (V2-F01-E02).
 *
 * Por que um teste e não só a revisão do PR: workflow é código que roda com o
 * token do repositório. Ação por tag móvel pode ser reescrita e rodar código
 * no runner; token com escrita padrão amplia o dano; job sem tempo máximo
 * consome seis horas de fila quando trava; `pull_request_target` roda código de
 * fork com segredo. Cada uma dessas coisas é fácil de reintroduzir sem
 * perceber, num workflow novo, e nenhuma delas quebra o CI por si só. Este
 * teste quebra.
 *
 * As regras (E02), aplicadas a cada arquivo `.yml` ou `.yaml` da pasta:
 *   1. `permissions:` declarado no topo, sem escrita;
 *   2. `timeout-minutes` em todo job;
 *   3. toda `uses:` fixada por SHA de 40 caracteres, com a versão em comentário;
 *   4. nenhum `pull_request_target`;
 *   5. runner com versão (nunca `ubuntu-latest`).
 *
 * O repositório não tem biblioteca de YAML (e o CI não instala nada para a
 * raiz de `scripts/`), então a leitura é por texto, sobre o formato que os
 * workflows usam: `jobs:` na coluna 0, um job por chave com 2 espaços, as
 * chaves do job com 4. Se alguém reformatar de outro jeito, o teste reclama de
 * não achar o que procura, que é o comportamento desejado.
 *
 * As regras são funções puras, e os casos negativos as aplicam a workflows
 * sintéticos estragados, para provar que elas mordem.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = new URL("../../", import.meta.url);
const PASTA = fileURLToPath(new URL(".github/workflows/", RAIZ));

/** Maior `timeout-minutes` aceito. O padrão do GitHub é 360; o maior job real (baseline) usa 120. */
const TIMEOUT_MAXIMO = 120;
/** Runners que flutuam de versão e por isso são proibidos. O Windows fica de fora de propósito (ver verificar.yml). */
const RUNNERS_QUE_FLUTUAM = /\b(ubuntu|macos)-latest\b/;

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** O texto sem as linhas que são só comentário (um comentário pode citar `pull_request_target` sem usá-lo). */
export function semComentarios(texto) {
  return texto
    .split("\n")
    .filter((linha) => !/^\s*#/.test(linha))
    .join("\n");
}

/** Os jobs do workflow: `{ id, texto }`, com o texto do job sem comentários. Vazio se não achar `jobs:`. */
export function jobsDe(texto) {
  const linhas = semComentarios(texto).split("\n");
  const inicio = linhas.findIndex((l) => /^jobs:\s*$/.test(l));
  if (inicio < 0) return [];
  const jobs = [];
  let atual = null;
  for (const linha of linhas.slice(inicio + 1)) {
    if (/^\S/.test(linha)) break; // outra chave de topo: acabou a seção `jobs:`
    const abre = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(linha);
    if (abre) {
      atual = { id: abre[1], linhas: [] };
      jobs.push(atual);
    } else if (atual) {
      atual.linhas.push(linha);
    }
  }
  return jobs.map((j) => ({ id: j.id, texto: j.linhas.join("\n") }));
}

/** O bloco `permissions:` de topo: o texto dele, ou `null` se não existir. */
export function permissoesDoTopo(texto) {
  const linhas = semComentarios(texto).split("\n");
  const i = linhas.findIndex((l) => /^permissions:/.test(l));
  if (i < 0) return null;
  const bloco = [linhas[i]];
  for (const linha of linhas.slice(i + 1)) {
    if (/^\s+\S/.test(linha)) bloco.push(linha);
    else break;
  }
  return bloco.join("\n");
}

// ---------------------------------------------------------------------------
// Regras da E02: cada uma devolve a lista de problemas (vazia = em ordem)
// ---------------------------------------------------------------------------

export function problemasDePermissoes(texto) {
  const bloco = permissoesDoTopo(texto);
  if (bloco === null) return ["falta `permissions:` no topo do workflow"];
  if (/:\s*write\b|write-all/.test(bloco)) return [`permissions de topo com escrita: ${bloco.replace(/\n/g, " ")}`];
  return [];
}

export function problemasDeTimeout(texto) {
  const jobs = jobsDe(texto);
  if (jobs.length === 0) return ["nenhum job encontrado (o formato mudou?)"];
  const problemas = [];
  for (const job of jobs) {
    const m = /^ {4}timeout-minutes:\s*(\d+)\s*$/m.exec(job.texto);
    if (!m) problemas.push(`job \`${job.id}\` sem timeout-minutes`);
    else if (Number(m[1]) < 1 || Number(m[1]) > TIMEOUT_MAXIMO) {
      problemas.push(`job \`${job.id}\` com timeout-minutes ${m[1]} fora de 1..${TIMEOUT_MAXIMO}`);
    }
  }
  return problemas;
}

export function problemasDeUsos(texto) {
  const problemas = [];
  // Linhas inteiras: a versão em comentário fica ao lado do SHA.
  for (const linha of texto.split("\n")) {
    if (/^\s*#/.test(linha)) continue;
    const m = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/.exec(linha);
    if (!m) continue;
    const [, acao, resto] = m;
    if (acao.startsWith("./")) continue; // ação local, versionada junto
    if (!/@[0-9a-f]{40}$/.test(acao)) {
      problemas.push(`\`uses: ${acao}\` sem SHA completo de commit (tag e ramo são móveis)`);
    } else if (!/#\s*v?\d+(\.\d+)*/.test(resto)) {
      problemas.push(`\`uses: ${acao}\` sem a versão em comentário ao lado`);
    }
  }
  return problemas;
}

export function problemasDeGatilho(texto) {
  return /\bpull_request_target\b/.test(semComentarios(texto)) ? ["usa `pull_request_target` (roda código de fork com segredo)"] : [];
}

export function problemasDeRunner(texto) {
  const problemas = [];
  const jobs = jobsDe(texto);
  for (const job of jobs) {
    if (!/^ {4}runs-on:/m.test(job.texto)) problemas.push(`job \`${job.id}\` sem runs-on`);
  }
  const m = RUNNERS_QUE_FLUTUAM.exec(semComentarios(texto));
  if (m) problemas.push(`runner \`${m[0]}\` muda de versão sem aviso; use a versão (ex.: ubuntu-24.04)`);
  return problemas;
}

/** Todas as regras da E02 sobre um workflow. */
export function problemasDoWorkflow(texto) {
  return [
    ...problemasDePermissoes(texto),
    ...problemasDeTimeout(texto),
    ...problemasDeUsos(texto),
    ...problemasDeGatilho(texto),
    ...problemasDeRunner(texto),
  ];
}

// ---------------------------------------------------------------------------
// Workflows reais
// ---------------------------------------------------------------------------

const arquivos = readdirSync(PASTA).filter((n) => /\.ya?ml$/.test(n)).sort();
const workflows = Object.fromEntries(arquivos.map((n) => [n, readFileSync(PASTA + n, "utf8")]));

test("a pasta de workflows tem os arquivos esperados (o teste não passa por estar olhando uma pasta vazia)", () => {
  for (const esperado of ["verificar.yml", "demonstracao.yml", "sast.yml", "segredos.yml", "auditoria-semanal.yml"]) {
    assert.ok(arquivos.includes(esperado), `falta .github/workflows/${esperado}`);
  }
});

// Um caso só, com o laço dentro: o `baseline.mjs` conta os `test(` do texto, e
// um caso criado por arquivo daria uma contagem que o texto não enxerga.
test("todo workflow: permissions mínimas, timeout, ações por SHA, runner com versão, sem pull_request_target", () => {
  const problemas = Object.fromEntries(
    arquivos.map((nome) => [nome, problemasDoWorkflow(workflows[nome])]).filter(([, p]) => p.length > 0),
  );
  assert.deepEqual(problemas, {});
});

test("nenhum workflow declara escrita em permissions, nem de job", () => {
  for (const [nome, texto] of Object.entries(workflows)) {
    assert.doesNotMatch(semComentarios(texto), /^\s*[\w-]+:\s*write\s*$/m, `${nome}: permissão de escrita`);
  }
});

test("os nomes de exibição dos jobs do verificar.yml não mudaram (são contrato com o ruleset da master)", () => {
  const nomes = jobsDe(workflows["verificar.yml"]).map((j) => /^ {4}name:\s*(.+?)\s*$/m.exec(j.texto)?.[1]);
  for (const contrato of [
    "Testes, tipos e scripts",
    "Fluxo ponta a ponta no navegador",
    "A API sobe contra Postgres real",
    "Aplicativo de campo",
  ]) {
    assert.ok(nomes.includes(contrato), `o job "${contrato}" sumiu ou foi renomeado`);
  }
});

test("o job da demonstração mora em demonstracao.yml, com filtro de caminho, e saiu do verificar.yml", () => {
  assert.equal(jobsDe(workflows["verificar.yml"]).some((j) => j.id === "demonstracao"), false);
  const demo = semComentarios(workflows["demonstracao.yml"]);
  assert.ok(jobsDe(demo).some((j) => j.id === "demonstracao"));
  assert.match(demo, /^ {4}paths:\n(?: {6}- .+\n)*? {6}- "mockup\/\*\*"/m, "push filtrado por mockup/**");
  assert.match(demo, /^ {4}paths:\n(?: {6}- .+\n)*? {6}- "scripts\/\*\*"/m, "push filtrado por scripts/**");
  // O filtro vale para push e para pull_request.
  assert.equal([...demo.matchAll(/^ {4}paths:$/gm)].length, 2);
});

test("cancel-in-progress só em pull_request (a execução da master e a de um SHA candidato nunca são canceladas)", () => {
  for (const nome of ["verificar.yml", "demonstracao.yml", "sast.yml"]) {
    const texto = semComentarios(workflows[nome]);
    assert.match(texto, /^ {2}cancel-in-progress:\s*\$\{\{\s*github\.event_name == 'pull_request'\s*\}\}\s*$/m, `${nome}: cancel-in-progress`);
  }
});

test("os navegadores do Playwright vêm de cache nos workflows que os instalam", () => {
  for (const [nome, texto] of Object.entries(workflows)) {
    const corpo = semComentarios(texto);
    if (!/playwright install/.test(corpo)) continue;
    assert.match(corpo, /path:\s*~\/\.cache\/ms-playwright/, `${nome}: instala navegador sem cache de ~/.cache/ms-playwright`);
  }
});

test("o job aplicativo guarda o cache de npm dos DOIS lockfiles", () => {
  const job = jobsDe(workflows["verificar.yml"]).find((j) => j.id === "aplicativo");
  assert.ok(job);
  assert.match(job.texto, /cache-dependency-path:\s*\|\n\s+dc360\/package-lock\.json\n\s+dc360\/apps\/campo\/package-lock\.json/);
});

// ---------------------------------------------------------------------------
// Casos negativos: o teste morde
// ---------------------------------------------------------------------------

/** Um workflow que cumpre todas as regras, para o negativo estragar uma de cada vez. */
const BOM = `name: Exemplo
on:
  pull_request:
permissions:
  contents: read
jobs:
  um:
    name: Um
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      - run: echo oi
`;

test("negativo: o workflow sintético correto passa (a base dos outros casos)", () => {
  assert.deepEqual(problemasDoWorkflow(BOM), []);
});

test("negativo: uses por tag móvel reprova", () => {
  const ruim = BOM.replace(/@11d5960a326750d5838078e36cf38b85af677262 # v4\.4\.0/, "@v4");
  assert.match(problemasDeUsos(ruim).join("\n"), /sem SHA completo/);
  // E por ramo, e por SHA curto
  assert.equal(problemasDeUsos(BOM.replace(/@[0-9a-f]{40}/, "@main")).length, 1);
  assert.equal(problemasDeUsos(BOM.replace(/@[0-9a-f]{40}/, "@11d5960")).length, 1);
});

test("negativo: SHA sem a versão em comentário reprova", () => {
  const ruim = BOM.replace(" # v4.4.0", "");
  assert.match(problemasDeUsos(ruim).join("\n"), /sem a versão em comentário/);
});

test("negativo: job sem timeout-minutes reprova", () => {
  const ruim = BOM.replace("    timeout-minutes: 10\n", "");
  assert.match(problemasDeTimeout(ruim).join("\n"), /job `um` sem timeout-minutes/);
  assert.match(problemasDeTimeout(BOM.replace("timeout-minutes: 10", "timeout-minutes: 360")).join("\n"), /fora de/);
});

test("negativo: workflow sem permissions reprova, e com escrita no topo também", () => {
  assert.match(problemasDePermissoes(BOM.replace("permissions:\n  contents: read\n", "")).join("\n"), /falta `permissions:`/);
  assert.match(problemasDePermissoes(BOM.replace("contents: read", "contents: write")).join("\n"), /com escrita/);
  assert.match(problemasDePermissoes(BOM.replace("permissions:\n  contents: read\n", "permissions: write-all\n")).join("\n"), /com escrita/);
});

test("negativo: pull_request_target reprova, mas citado só em comentário não", () => {
  assert.match(problemasDeGatilho(BOM.replace("pull_request:", "pull_request_target:")).join("\n"), /pull_request_target/);
  assert.deepEqual(problemasDeGatilho("# nunca usar pull_request_target aqui\n" + BOM), []);
});

test("negativo: ubuntu-latest reprova, inclusive dentro de matriz, e job sem runs-on também", () => {
  assert.match(problemasDeRunner(BOM.replace("ubuntu-24.04", "ubuntu-latest")).join("\n"), /ubuntu-latest/);
  const matriz = BOM.replace("runs-on: ubuntu-24.04", "strategy:\n      matrix:\n        os: [windows-latest, ubuntu-latest]\n    runs-on: ${{ matrix.os }}");
  assert.match(problemasDeRunner(matriz).join("\n"), /ubuntu-latest/);
  assert.match(problemasDeRunner(BOM.replace("    runs-on: ubuntu-24.04\n", "")).join("\n"), /sem runs-on/);
  assert.deepEqual(problemasDeRunner(BOM.replace("ubuntu-24.04", "windows-latest")), []);
});
