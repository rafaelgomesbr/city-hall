/**
 * Regras de CI aplicadas a TODOS os workflows de `.github/workflows/`
 * (V2-F01-E02 e V2-F01-E03).
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
 * E a regra da E03, sobre o conjunto: todo comando do script `verificar` do
 * `package.json` aparece em algum `run:` de algum workflow. Portão novo que
 * fique só no `npm run verificar` local, sem ir para o CI, reprova aqui. O
 * `auditar` pode aparecer como `npm run auditar` ou como `node
 * scripts/auditar.mjs` (o CI chama o `node` de propósito: nenhuma configuração
 * do npm decide se o portão roda).
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
const lerRaiz = (relativo) => readFileSync(new URL(relativo, RAIZ), "utf8");

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

/** Os comandos de todos os `run:` do workflow (inline e em bloco), sem as linhas de comentário. */
export function comandosDosRuns(texto) {
  const linhas = semComentarios(texto).split("\n");
  const comandos = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(linhas[i]);
    if (!m) continue;
    const recuo = m[1].length;
    const valor = m[2].trim();
    if (/^[|>][+-]?\d*$/.test(valor)) {
      for (let j = i + 1; j < linhas.length; j++) {
        const l = linhas[j];
        if (l.trim() !== "" && l.search(/\S/) <= recuo) break;
        comandos.push(l.trim());
      }
    } else {
      comandos.push(valor);
    }
  }
  return comandos.filter(Boolean);
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
// Regra da E03: o `verificar` inteiro roda no CI
// ---------------------------------------------------------------------------

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Os comandos do script `verificar` (separados por `&&`), na ordem. */
export function comandosDoVerificar(packageJson) {
  const verificar = packageJson.scripts?.verificar;
  if (typeof verificar !== "string") throw new Error("o package.json não tem o script `verificar`");
  return verificar.split("&&").map((c) => c.trim()).filter(Boolean);
}

/**
 * As formas aceitas de um comando aparecer num `run:`. `npm run X` vale também
 * pelo corpo do script X quando ele é um comando simples (`node scripts/...`).
 * `npm test` só vale literal: `npm run test --workspace X` roda um pedaço da suíte,
 * e não ela.
 */
export function formasAceitas(comando, scripts) {
  const formas = [comando];
  const m = /^npm run ([\w:.-]+)$/.exec(comando);
  if (m) {
    const corpo = scripts[m[1]];
    if (typeof corpo === "string" && !corpo.includes("&&")) formas.push(corpo.trim());
  }
  return formas;
}

/** Comandos do `verificar` que não aparecem em nenhum `run:` dos comandos dados. */
export function comandosFaltando(packageJson, comandosDeRun) {
  const texto = comandosDeRun.join("\n");
  return comandosDoVerificar(packageJson).filter(
    (comando) =>
      !formasAceitas(comando, packageJson.scripts).some((forma) =>
        // Fronteira depois: `npm run test` não pode casar com `npm run test:scripts`.
        new RegExp(`(^|[\\s;&|(])${escapar(forma)}(?![\\w:.-])`, "m").test(texto),
      ),
  );
}

/**
 * Os `npm audit` que DECIDEM: os que não terminam em `|| true` ou que usam
 * `--audit-level`. A política de dependências é `scripts/auditar.mjs` (CP-03);
 * o `npm audit --json ... || true` do job `dependencias` só guarda o relatório
 * bruto como evidência.
 */
export function auditoriasQueDecidem(comandosDeRun) {
  return comandosDeRun.filter((c) => /\bnpm audit\b/.test(c) && (!/\|\|\s*true\b/.test(c) || /--audit-level/.test(c)));
}

// ---------------------------------------------------------------------------
// Workflows reais
// ---------------------------------------------------------------------------

const arquivos = readdirSync(PASTA).filter((n) => /\.ya?ml$/.test(n)).sort();
const workflows = Object.fromEntries(arquivos.map((n) => [n, readFileSync(PASTA + n, "utf8")]));
const pacote = JSON.parse(lerRaiz("dc360/package.json"));

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

// Única escrita permitida em todo o repositório (V2-F01-E19): o job `publicar`
// do `sbom.yml` anexa o SBOM ao Release da tag, com `contents: write`. As travas
// finas dele (só em tag, só nesse job, só `contents`) estão em `sbom.test.mjs`.
const ESCRITA_PERMITIDA = { "sbom.yml": 1 };

test("nenhum workflow declara escrita em permissions, nem de job (a única exceção é o job publicar do sbom.yml)", () => {
  for (const [nome, texto] of Object.entries(workflows)) {
    const escritas = semComentarios(texto).match(/^\s*[\w-]+:\s*write\s*$/gm) ?? [];
    assert.equal(escritas.length, ESCRITA_PERMITIDA[nome] ?? 0, `${nome}: permissão de escrita`);
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

// ----- E03 -----

const comandos = Object.values(workflows).flatMap(comandosDosRuns);

test("todo comando do script `verificar` aparece em algum run: de algum workflow", () => {
  assert.deepEqual(comandosFaltando(pacote, comandos), []);
});

test("o script `verificar` ainda tem os nove comandos conhecidos (um comando novo exige este teste ciente)", () => {
  assert.deepEqual(comandosDoVerificar(pacote), [
    "npm run typecheck",
    // V2-F01-E17: lint, teto da baseline e formatação.
    "npm run lint",
    "npm run lint:teto",
    "npm run formato:conferir",
    "npm test",
    "npm run test:scripts",
    "npm run test:campo",
    "npm run auditar",
    "npm run conferir:numeros",
  ]);
});

test("o auditar roda pelo node no job dependencias, e o único `npm audit` cru é evidência que não decide", () => {
  const job = jobsDe(workflows["verificar.yml"]).find((j) => j.id === "dependencias");
  assert.ok(job);
  assert.ok(comandosDosRuns(job.texto).some((c) => /node scripts\/auditar\.mjs/.test(c)));
  for (const [nome, texto] of Object.entries(workflows)) {
    assert.deepEqual(auditoriasQueDecidem(comandosDosRuns(texto)), [], `${nome}: \`npm audit\` que decide no lugar do auditar`);
  }
});

test("o test:scripts roda com as duas árvores instaladas (a do aplicativo antes) e o test:campo no job aplicativo", () => {
  const verificar = workflows["verificar.yml"];
  const produto = jobsDe(verificar).find((j) => j.id === "produto");
  const iApp = produto.texto.indexOf("id: instalar_app");
  const iScripts = produto.texto.indexOf("npm run test:scripts");
  assert.ok(iApp > 0 && iScripts > iApp, "produto: npm ci do aplicativo antes do test:scripts");
  const app = jobsDe(verificar).find((j) => j.id === "aplicativo");
  assert.match(app.texto, /npm run test:campo/);
  assert.doesNotMatch(app.texto, /npm audit/, "o aplicativo não tem mais `npm audit` próprio");
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

test("negativo: tirar `npm run auditar` do workflow reprova (mas `node scripts/auditar.mjs` basta)", () => {
  const sem = comandos.filter((c) => !/auditar/.test(c));
  assert.deepEqual(comandosFaltando(pacote, sem), ["npm run auditar"]);
  assert.deepEqual(comandosFaltando(pacote, [...sem, "npm run auditar 2>&1 | tee x.txt"]), []);
  assert.deepEqual(comandosFaltando(pacote, [...sem, "node scripts/auditar.mjs 2>&1 | tee x.txt"]), []);
});

test("negativo: tirar qualquer outro comando do verificar reprova, e `npm run test:scripts` não vale por `npm test`", () => {
  for (const alvo of ["npm run typecheck", "npm run test:scripts", "npm run test:campo", "npm run conferir:numeros"]) {
    const sem = comandos.filter((c) => !c.includes(alvo));
    assert.ok(comandosFaltando(pacote, sem).includes(alvo), `${alvo}: a falta devia ser notada`);
  }
  // `npm test` não pode ser satisfeito por `npm run test:scripts`.
  const soScripts = comandos.filter((c) => !/(^|\s)npm test(\s|$)/.test(c));
  assert.ok(comandosFaltando(pacote, soScripts).includes("npm test"));
});

test("negativo: `npm audit` que decide reprova, o de evidência com `|| true` não", () => {
  assert.deepEqual(auditoriasQueDecidem(["npm audit --audit-level=low"]), ["npm audit --audit-level=low"]);
  assert.deepEqual(auditoriasQueDecidem(["npm audit --json > a.json"]), ["npm audit --json > a.json"]);
  assert.deepEqual(auditoriasQueDecidem(["npm audit --json > a.json || true"]), []);
  assert.deepEqual(auditoriasQueDecidem(["npm audit --audit-level=low || true"]), ["npm audit --audit-level=low || true"]);
});

test("negativo: comando que só aparece em comentário ou em name: não conta como run:", () => {
  const yml = `jobs:
  um:
    steps:
      # npm run auditar
      - name: npm run auditar
        run: echo nada
`;
  assert.deepEqual(comandosDosRuns(yml), ["echo nada"]);
  assert.deepEqual(comandosFaltando({ scripts: { verificar: "npm run auditar", auditar: "node scripts/auditar.mjs" } }, comandosDosRuns(yml)), ["npm run auditar"]);
});

test("o leitor de run: entende bloco, inline e para no recuo certo", () => {
  const yml = `jobs:
  um:
    steps:
      - run: npm ci
      - name: bloco
        run: |
          npm run typecheck
          { npm run build; } 2>&1

      - name: depois
        run: echo fim
`;
  assert.deepEqual(comandosDosRuns(yml), ["npm ci", "npm run typecheck", "{ npm run build; } 2>&1", "echo fim"]);
});
