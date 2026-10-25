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
 * E a regra da E12, sobre os dois workflows de implantação (`deploy-hml.yml` e
 * `promover-producao.yml`): HML só dispara pelo `Verificar` verde de um push na
 * master; PROD só por `workflow_dispatch`, com ambiente protegido, SHA que passou
 * por HML (selo `hml-ok-`) e confirmação digitada; imagem sempre por digest; token
 * de deploy um por app e só como segredo de ambiente; migration de HML antes da
 * API; migration de PROD nunca em CI; `/saude` com versão e commit conferido; e as
 * únicas escritas de job permitidas, nomeadas em `ESCRITAS_PERMITIDAS`.
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
  for (const esperado of [
    "verificar.yml", "demonstracao.yml", "sast.yml", "segredos.yml", "auditoria-semanal.yml",
    "deploy-hml.yml", "promover-producao.yml", // V2-F01-E12
  ]) {
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

// A escrita de job do `sbom.yml` (V2-F01-E19): o job `publicar` anexa o SBOM ao
// Release da tag, com `contents: write`. As travas finas dele (só em tag, só nesse
// job, só `contents`) estão em `sbom.test.mjs`.
/**
 * As ÚNICAS escritas permitidas em permissions de job (V2-F01-E12), por workflow,
 * no formato `job:permissao`. Escrita no topo continua proibida (regra 1). Cada
 * uma é justificada no comentário do próprio workflow:
 *   - `construir` e `aprovar` (deploy-hml): publicar a imagem e pôr o selo no GHCR;
 *   - `painel` (deploy-hml): mover o ramo `homologacao`, de onde a Vercel publica;
 *   - `promover` (promover-producao): mover o ramo `producao`, idem;
 *   - `construir:id-token` e `construir:attestations` (deploy-hml, correção da
 *     revisão 1 da F01): a ação `actions/attest-build-provenance` assina com o
 *     OIDC do run (`id-token`) e grava a atestação do digest (`attestations`).
 *     É o que permite à promoção para PROD verificar, com `gh attestation
 *     verify --signer-workflow`, que a imagem saiu do deploy-hml.yml e não de uma
 *     tag `hml-ok-` posta à mão. As duas valem só no job `construir`.
 *   - `publicar` (sbom.yml, V2-F01-E19): anexar o SBOM ao Release da tag.
 * Qualquer outra escrita, ou estas em outro workflow, reprova.
 */
export const ESCRITAS_PERMITIDAS = {
  "deploy-hml.yml": ["aprovar:packages", "construir:attestations", "construir:id-token", "construir:packages", "painel:contents"],
  "promover-producao.yml": ["promover:contents"],
  "sbom.yml": ["publicar:contents"],
};

/** Permissões de escrita declaradas em jobs, como `job:permissao` ordenadas. */
export function escritasDeJobs(texto) {
  const achadas = [];
  for (const job of jobsDe(texto)) {
    const bloco = /^ {4}permissions:\s*\n((?: {6}\S.*\n?)+)/m.exec(job.texto + "\n");
    if (bloco) {
      for (const m of bloco[1].matchAll(/^ {6}([\w-]+):\s*write\s*$/gm)) achadas.push(`${job.id}:${m[1]}`);
    }
    if (/^ {4}permissions:\s*write-all\s*$/m.test(job.texto)) achadas.push(`${job.id}:write-all`);
  }
  return achadas.sort();
}

test("nenhum workflow declara escrita em permissions, a não ser a lista nomeada de jobs da E12", () => {
  for (const [nome, texto] of Object.entries(workflows)) {
    // Topo: nunca escreve.
    assert.deepEqual(problemasDePermissoes(texto), [], `${nome}: permissions de topo`);
    assert.deepEqual(escritasDeJobs(texto), ESCRITAS_PERMITIDAS[nome] ?? [], `${nome}: permissão de escrita fora da lista`);
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

// ----- Dívidas DV-13, DV-14, DV-26 e DV-39 (CI confiável, antes do G01) -----

/** O texto de um passo (`- name:` até o próximo `- name:`/`- uses:`) de um job, ou undefined. */
export function passoDe(textoDoJob, trecho) {
  const partes = textoDoJob.split(/\n(?= {6}- (?:name|uses):)/);
  return partes.find((p) => p.includes(trecho));
}

test("o job aplicativo empacota com o Metro (expo export), com tempo limite no passo, conferidor e artefato (DV-39)", () => {
  const app = jobsDe(workflows["verificar.yml"]).find((j) => j.id === "aplicativo");
  const passo = passoDe(app.texto, "npx expo export");
  assert.ok(passo, "falta o passo `npx expo export` no job aplicativo");
  assert.match(passo, /^ {8}timeout-minutes:\s*\d+\s*$/m, "o passo do Metro precisa de timeout-minutes próprio");
  assert.match(passo, /--platform android --platform ios/, "as duas plataformas");
  assert.match(passo, /--no-bytecode/, "pacote legível, para o conferidor abrir");
  assert.match(passo, /conferir-empacotamento-do-campo\.mjs/, "o conferidor olha DENTRO do pacote");
  assert.match(passo, /tee "\$A\/08-expo-export\.txt"/, "a saída vai para o artefato");
  assert.match(passo, /if:.*steps\.instalar_app\.outcome == 'success'/, "só com o aplicativo instalado");
  // O artefato é publicado depois e `always()`, para a saída existir quando o Metro reprova.
  const iPasso = app.texto.indexOf("npx expo export");
  const iUpload = app.texto.indexOf("actions/upload-artifact");
  assert.ok(iPasso > 0 && iUpload > iPasso, "upload-artifact depois do passo do Metro");
  assert.match(passoDe(app.texto, "actions/upload-artifact") ?? "", /if:\s*\$\{\{\s*always\(\)\s*\}\}/);
});

test("o job windows roda lint, lint:teto e formato:conferir, depois de instalar as duas árvores e compilar o shared (DV-26)", () => {
  const win = jobsDe(workflows["verificar.yml"]).find((j) => j.id === "windows");
  assert.match(win.texto, /^ {4}runs-on:\s*windows-latest\s*$/m);
  // Só o que está em `run:` conta: o nome do passo também cita o comando.
  const runs = comandosDosRuns(win.texto);
  const em = (cmd) => runs.findIndex((c) => c.startsWith(cmd));
  const iBuild = em("npm run build:shared");
  const iApp = em("npm ci");
  assert.ok(iBuild >= 0 && iApp >= 0, "windows: build do shared e npm ci");
  for (const cmd of ["npm run lint ", "npm run lint:teto", "npm run formato:conferir"]) {
    assert.ok(em(cmd) > iBuild, `windows: \`${cmd.trim()}\` ausente ou antes do build do shared`);
  }
  assert.ok(win.texto.indexOf("npm run lint ") > win.texto.indexOf("id: instalar_app"), "o lint do campo precisa do npm ci do aplicativo antes");
});

test("o job plataformas deixa o GIT escrever o CRLF e fixa a contagem do painel (DV-13, DV-14)", () => {
  const plat = jobsDe(workflows["verificar.yml"]).find((j) => j.id === "plataformas");
  const crlf = comandosDosRuns(plat.texto).join("\n");
  assert.match(crlf, /ambiente-hostil\.mjs crlf-pelo-git apps\/web\/src apps\/web\/test/);
  assert.doesNotMatch(crlf, /ambiente-hostil\.mjs crlf apps\//, "o CRLF não pode voltar a ser montado por substituição de texto");
  assert.match(crlf, /ambiente-hostil\.mjs conferir-painel "\$RUNNER_TEMP\/artefatos\/06-painel-em-crlf\.txt"/, "a contagem do painel é conferida contra o baseline");
  // Os TS2345 esperados do controle do caso 3 não viram anotação de erro num job verde.
  assert.match(passoDe(plat.texto, "Caso 3, controle") ?? "", /::remove-matcher owner=tsc::/);
  // A estimativa do comentário não pode voltar a ser a de 15 a 25 minutos.
  assert.doesNotMatch(workflows["verificar.yml"], /15 a 25 minutos/);
});

// ---------------------------------------------------------------------------
// E12: deploy de HML por merge e promoção manual para PROD
// ---------------------------------------------------------------------------
//
// Dois workflows, um por ambiente, e as regras abaixo são o que impede que o
// caminho de PROD fique frouxo sem ninguém notar: gatilho, ambiente protegido,
// token por app, migration antes do código, imagem por digest, /saude conferido
// e o selo de HML. Cada regra é função pura sobre o TEXTO do workflow, e os
// casos negativos mais abaixo estragam o workflow de verdade e provam que ela morde.

const HML = "deploy-hml.yml";
const PROD = "promover-producao.yml";

const ler = (nome) => workflows[nome];
const job = (texto, id) => jobsDe(texto).find((j) => j.id === id);
const ambienteDoJob = (j) => /^ {4}environment:\s*(\S+)\s*$/m.exec(j.texto)?.[1] ?? null;
/** O texto do workflow sem comentários, para regras que olham o que é código. */
const codigo = semComentarios;

/** Os gatilhos declarados em `on:` (chaves de 2 espaços). */
export function gatilhosDe(texto) {
  const linhas = codigo(texto).split("\n");
  const i = linhas.findIndex((l) => /^on:\s*$/.test(l));
  if (i < 0) return [];
  const gatilhos = [];
  for (const l of linhas.slice(i + 1)) {
    if (/^\S/.test(l)) break;
    const m = /^ {2}([a-z_]+):/.exec(l);
    if (m) gatilhos.push(m[1]);
  }
  return gatilhos;
}

/** Nomes de segredo usados (`secrets.NOME`) no código do workflow. */
export function segredosUsados(texto) {
  return [...new Set([...codigo(texto).matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort();
}

/** Regras do deploy de HML. */
export function problemasDoDeployHml(texto) {
  const p = [];
  const c = codigo(texto);
  if (JSON.stringify(gatilhosDe(texto)) !== JSON.stringify(["workflow_run"])) {
    p.push(`gatilhos ${JSON.stringify(gatilhosDe(texto))}: o deploy de HML só dispara por workflow_run do Verificar`);
  }
  if (!/workflows:\s*\["Verificar"\]/.test(c) || !/types:\s*\[completed\]/.test(c) || !/branches:\s*\[master\]/.test(c)) {
    p.push("workflow_run tem de ser do Verificar, completed, ramo master");
  }
  const construir = job(texto, "construir");
  for (const exigido of [
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'master'",
    "github.event.workflow_run.head_repository.full_name == github.repository",
  ]) {
    if (!construir?.texto.includes(exigido)) p.push(`construir sem a trava \`${exigido}\``);
  }
  // O código que roda é o do commit que o CI aprovou, e não a ponta do ramo.
  const checkouts = [...c.matchAll(/uses: actions\/checkout@[^\n]*\n\s+with:\n((?: {10}\S[^\n]*\n)+)/g)];
  if (checkouts.length < 2 || checkouts.some((m) => !/ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/.test(m[1]))) {
    p.push("todo checkout tem de usar ref: github.event.workflow_run.head_sha");
  }
  // Proveniência assinada de cada digest (a promoção a verifica).
  const construirTexto = construir?.texto ?? "";
  const atestados = [...codigo(construirTexto).matchAll(/uses: actions\/attest-build-provenance@[0-9a-f]{40}[^\n]*\n\s+with:\n((?: {10}\S[^\n]*\n)+)/g)].map((m) => m[1]);
  for (const alvo of ["api", "console"]) {
    const bloco = atestados.find((b) => b.includes(`steps.publicar.outputs.digest_${alvo}`));
    if (!bloco) p.push(`construir sem atestação de proveniência do digest da imagem ${alvo}`);
    else if (!/push-to-registry:\s*true/.test(bloco)) p.push(`a atestação da imagem ${alvo} não vai para o registro (push-to-registry)`);
  }
  if (!/^ {6}id-token:\s*write\s*$/m.test(construirTexto) || !/^ {6}attestations:\s*write\s*$/m.test(construirTexto)) {
    p.push("construir sem id-token e attestations write (a atestação não assina)");
  }
  if (job(texto, "aprovar") && !/^ {4}name:\s*Marcar a versão como aprovada em HML\s*$/m.test(job(texto, "aprovar").texto)) {
    p.push("o nome do job aprovar mudou: a promoção o procura pelo nome na API do Actions");
  }
  if (ambienteDoJob(job(texto, "implantar") ?? { texto: "" }) !== "homologacao") p.push("o job implantar tem de usar o ambiente homologacao");
  if (/\bproducao\b/.test(c.replace(/dc360-copias|copiar-producao|migrar-producao|producao\.mjs/g, ""))) p.push("deploy de HML cita producao");
  // Nada de PROD: nem os apps, nem os arquivos de configuração.
  if (/\bfly(\.console)?\.toml\b/.test(c)) p.push("deploy de HML usa o fly.toml de PROD");
  if (/--ambiente\s+prod\b/.test(c)) p.push("deploy de HML mexe no ambiente prod");
  p.push(...problemasDeImplantacao(texto, { ambiente: "hml" }));
  return p;
}

/** Regras do que vale nos DOIS caminhos de implantação. */
export function problemasDeImplantacao(texto, { ambiente }) {
  const p = [];
  const c = codigo(texto);
  const runs = comandosDosRuns(texto).join("\n");
  const toml = ambiente === "hml" ? "fly.hml.toml" : "fly.toml";
  const tomlConsole = ambiente === "hml" ? "fly.console.hml.toml" : "fly.console.toml";

  // Imagem por digest, sempre. `fly deploy` sem --image reconstruiria no Fly.
  const deploys = [...runs.matchAll(/flyctl deploy[^\n]*/g)].map((m) => m[0]);
  if (deploys.length !== 2) p.push(`esperados 2 flyctl deploy (API e console), achei ${deploys.length}`);
  for (const d of deploys) {
    if (!/--image "registry\.fly\.io\/\$\{APP_(API|CONSOLE)\}@\$\{DIGEST_(API|CONSOLE)\}"/.test(d)) p.push(`deploy sem imagem por digest: ${d}`);
    if (!/-a "\$APP_(API|CONSOLE)"/.test(d)) p.push(`deploy sem -a explícito: ${d}`);
    if (/--(build-only|remote-only|local-only|image-label|dockerfile)/.test(d)) p.push(`deploy que constrói: ${d}`);
  }
  if (!runs.includes(`-c ${toml} `) || !runs.includes(`-c ${tomlConsole} `)) p.push(`os deploys têm de usar -c ${toml} e -c ${tomlConsole}`);
  if (/fly deploy\b/.test(runs)) p.push("use flyctl deploy (binário verificado), não fly");

  // /saude com versão e commit, depois de cada deploy.
  const saudes = [...runs.matchAll(/conferir-saude-remota\.mjs --tipo=(api|console)[^\n]*--versao="\$VERSAO" --commit="\$COMMIT"/g)].map((m) => m[1]);
  if (saudes.join() !== "api,console") p.push(`/saude conferido com versao e commit para ${JSON.stringify(saudes)} (esperado api e console)`);

  // Ordem: a cópia da imagem e o deploy da API vêm antes do console.
  const iApi = runs.indexOf(`flyctl deploy -c ${toml}`);
  const iConsole = runs.indexOf(`flyctl deploy -c ${tomlConsole}`);
  if (iApi < 0 || iConsole < 0 || iApi > iConsole) p.push("a API tem de ser implantada antes do console");
  const iSaudeApi = runs.indexOf("conferir-saude-remota.mjs --tipo=api");
  if (iSaudeApi < iApi || iSaudeApi > iConsole) p.push("o /saude da API tem de ser conferido entre o deploy da API e o do console");

  // Imagem copiada entre registros sem reconstruir.
  if ((runs.match(/imagetools create --tag "registry\.fly\.io\//g) ?? []).length < 2) p.push("a imagem tem de ser copiada ao registro do Fly por imagetools create (digest preservado)");
  // Token de deploy só como segredo de ambiente, e um por app.
  const fly = segredosUsados(texto).filter((s) => s.startsWith("FLY_"));
  if (fly.join() !== "FLY_TOKEN_API,FLY_TOKEN_CONSOLE") p.push(`tokens do Fly ${JSON.stringify(fly)} (esperado FLY_TOKEN_API e FLY_TOKEN_CONSOLE, um por app)`);
  for (const j of jobsDe(texto)) {
    const usaSegredo = segredosUsados(j.texto).some((s) => s !== "GITHUB_TOKEN");
    if (usaSegredo && !ambienteDoJob(j)) p.push(`o job \`${j.id}\` usa segredo fora de um ambiente protegido`);
  }
  // O valor de um token nunca vai para o log nem para um comando.
  if (/\bset -x\b|\bprintenv\b|^\s*env\s*$/m.test(runs)) p.push("set -x, printenv ou env vazaria segredo no log");
  if (/echo[^\n]*(FLY_API_TOKEN|secrets\.)/.test(runs)) p.push("echo de token");
  if (/\bgit (tag|push)\b/.test(runs)) p.push("o workflow cria tag ou empurra por git: tag é ato do dono, o ramo vai por gh api");
  // Entrada digitada nunca interpolada no script (injeção).
  if (/\$\{\{/.test(runs)) p.push("expressão ${{ }} dentro de run: passe por env");
  if (c.includes("pull_request")) p.push("workflow de deploy citando pull_request");
  return p;
}

/** Regras da promoção para PROD. */
export function problemasDaPromocao(texto) {
  const p = [];
  const c = codigo(texto);
  const runs = comandosDosRuns(texto).join("\n");
  if (JSON.stringify(gatilhosDe(texto)) !== JSON.stringify(["workflow_dispatch"])) {
    p.push(`gatilhos ${JSON.stringify(gatilhosDe(texto))}: PROD só muda por workflow_dispatch`);
  }
  for (const entrada of ["tag", "sha", "confirmacao", "migracao_confirmada"]) {
    if (!new RegExp(`^ {6}${entrada}:\\s*$`, "m").test(c)) p.push(`falta a entrada ${entrada}`);
  }
  const validar = job(texto, "validar");
  const promover = job(texto, "promover");
  if (!validar || !promover) return [...p, "faltam os jobs validar e promover"];
  if (ambienteDoJob(promover) !== "producao") p.push("o job promover tem de usar o ambiente producao");
  if (!/^ {4}needs:\s*validar\s*$/m.test(promover.texto)) p.push("promover tem de depender de validar");
  if (ambienteDoJob(validar) !== null) p.push("validar não tem ambiente nem segredo");
  if (segredosUsados(validar.texto).some((s) => s !== "GITHUB_TOKEN")) p.push("validar usa segredo além do GITHUB_TOKEN");
  // Só a master, e falhando de verdade.
  if (!/\[ "\$GITHUB_REF" != "refs\/heads\/master" \]/.test(validar.texto) || !/exit 1/.test(validar.texto)) p.push("validar tem de falhar fora da master");
  // O que o pedido precisa provar.
  for (const exigido of [
    '"PROMOVER $TAG"',
    "refs/tags/$TAG^{commit}",
    "merge-base --is-ancestor",
    "conferir-tag",
    "hml-ok-",
    "migracao_confirmada",
  ]) {
    if (!(validar.texto + c).includes(exigido === "migracao_confirmada" ? "inputs.migracao_confirmada" : exigido)) p.push(`validar não confere \`${exigido}\``);
  }
  // A tag do GHCR sozinha não prova HML: run do Actions, digest igual e atestação.
  const v = codigo(validar.texto);
  if (!/^ {6}actions:\s*read\s*$/m.test(validar.texto)) p.push("validar sem actions: read (não consulta os runs do deploy-hml.yml)");
  for (const [exigido, rotulo] of [
    [/actions\/workflows\/deploy-hml\.yml\/runs\?head_sha=\$\{COMMIT\}&event=workflow_run/, "a consulta aos runs do deploy-hml.yml por head_sha e evento workflow_run"],
    [/\.head_sha == \$sha and \.event == "workflow_run" and \.conclusion == "success"/, "head_sha, evento workflow_run e conclusão success do run"],
    [/Marcar a versão como aprovada em HML.*\.conclusion == "success"/, "o job de aprovação do run concluído com sucesso"],
    [/imagetools inspect "\$imagem:sha-\$COMMIT"/, "o digest de sha-<sha>"],
    [/if \[ "\$digest" != "\$construido" \]/, "o digest do selo igual ao digest construído"],
    [/gh attestation verify "oci:\/\/\$imagem@\$digest"/, "gh attestation verify do digest"],
    [/--signer-workflow "\$GITHUB_REPOSITORY\/\.github\/workflows\/deploy-hml\.yml"/, "a atestação assinada pelo deploy-hml.yml deste repositório (--signer-workflow)"],
  ]) {
    if (!exigido.test(v)) p.push(`validar não confere ${rotulo}`);
  }
  // A migration de PROD nunca entra em CI (ADR 0008), e HML não aparece aqui.
  if (/migrar-producao|copiar-producao|DC360_SENHA_BANCO|--aplicar/.test(c.replace(/docs\/runbooks\/migracao\.md/g, ""))) p.push("a promoção toca o banco: a migration de PROD é manual (ADR 0008)");
  // HML só aparece como selo (`hml-ok-`) e em texto; nunca como ambiente, app, arquivo ou segredo.
  if (/homologacao|fly(\.console)?\.hml\.toml|APP_\w+: \S+-hml\b|_HML\b|--ambiente\s+hml\b/.test(c)) p.push("a promoção usa ambiente, app, arquivo ou segredo de HML");
  // O painel só depois de API e console conferidos, e o ramo é a última escrita.
  const iConsole = runs.indexOf("conferir-saude-remota.mjs --tipo=console");
  const iRamo = runs.indexOf("refs/heads/producao");
  if (iConsole < 0 || iRamo < iConsole) p.push("o ramo producao (painel) tem de ser movido depois do /saude do console");
  p.push(...problemasDeImplantacao(texto, { ambiente: "prod" }));
  return p;
}

const hml = ler(HML);
const prod = ler(PROD);

test("E12: o deploy de HML dispara só pelo Verificar verde de um push na master e implanta por digest", () => {
  assert.deepEqual(problemasDoDeployHml(hml), []);
});

test("E12: a promoção para PROD é só manual, valida o pedido, usa o ambiente producao e implanta por digest", () => {
  assert.deepEqual(problemasDaPromocao(prod), []);
});

test("E12: HML migra o banco ANTES de implantar a API, com a cópia do E15, e só depois move o painel e põe o selo", () => {
  const impl = job(hml, "implantar");
  const runs = comandosDosRuns(impl.texto).join("\n");
  const iCopia = runs.indexOf("copiar-producao.mjs --ambiente hml");
  const iMigra = runs.indexOf("migrar-producao.mjs --ambiente hml --aplicar");
  const iApi = runs.indexOf("flyctl deploy -c fly.hml.toml");
  assert.ok(iCopia >= 0 && iMigra > iCopia && iApi > iMigra, "cópia, migration e só então o deploy da API");
  assert.match(job(hml, "painel").texto, /^ {4}needs:\s*\[construir, implantar\]\s*$/m);
  assert.match(job(hml, "aprovar").texto, /^ {4}needs:\s*\[construir, implantar, painel\]\s*$/m);
  // O selo só nasce no último job.
  assert.equal([...codigo(hml).matchAll(/hml-ok-/g)].length, 2);
  assert.ok(codigo(job(hml, "aprovar").texto).includes("hml-ok-"));
});

test("E12: carimbo de versão e commit no build das duas imagens, e o /saude confere o que foi carimbado", () => {
  const c = codigo(hml);
  assert.match(c, /--build-arg "DC360_VERSAO=\$VERSAO"/);
  assert.match(c, /--build-arg "DC360_COMMIT=\$COMMIT"/);
  assert.match(c, /-f "\$dockerfile"|dockerfile=dc360\/Dockerfile\b/);
  assert.match(c, /dc360\/Dockerfile\.console/);
  assert.match(c, /node scripts\/versao\.mjs conferir/);
});

test("E12: o app de HML de cada fly*.toml é o que o workflow usa, e a promoção usa os de PROD", () => {
  const app = (arquivo) => /^app = "([^"]+)"/m.exec(lerRaiz(`dc360/${arquivo}`))[1];
  const alvo = (texto, nome) => new RegExp(`^  ${nome}: (\\S+)\\s*$`, "m").exec(codigo(texto))[1];
  assert.equal(alvo(hml, "APP_API"), app("fly.hml.toml"));
  assert.equal(alvo(hml, "APP_CONSOLE"), app("fly.console.hml.toml"));
  assert.equal(alvo(prod, "APP_API"), app("fly.toml"));
  assert.equal(alvo(prod, "APP_CONSOLE"), app("fly.console.toml"));
  assert.match(alvo(hml, "APP_API"), /-hml$/);
  assert.match(alvo(hml, "APP_CONSOLE"), /-hml$/);
  assert.doesNotMatch(alvo(prod, "APP_API"), /hml/);
  assert.doesNotMatch(alvo(prod, "APP_CONSOLE"), /hml/);
});

test("E12: os segredos de cada workflow são só os esperados, cada um no seu ambiente, e HML e PROD não se misturam", () => {
  assert.deepEqual(segredosUsados(hml), ["DC360_SENHA_BANCO_HML", "FLY_TOKEN_API", "FLY_TOKEN_CONSOLE", "GITHUB_TOKEN"]);
  assert.deepEqual(segredosUsados(prod), ["FLY_TOKEN_API", "FLY_TOKEN_CONSOLE", "GITHUB_TOKEN"]);
  // Os tokens do Fly só no job do ambiente protegido (a regra geral cobre o resto).
  assert.deepEqual(segredosUsados(job(hml, "implantar").texto).filter((s) => s !== "GITHUB_TOKEN"), ["DC360_SENHA_BANCO_HML", "FLY_TOKEN_API", "FLY_TOKEN_CONSOLE"]);
  assert.deepEqual(segredosUsados(job(prod, "promover").texto).filter((s) => s !== "GITHUB_TOKEN"), ["FLY_TOKEN_API", "FLY_TOKEN_CONSOLE"]);
  // Nenhum workflow guarda token, senha ou chave no texto.
  for (const texto of [hml, prod]) {
    assert.doesNotMatch(codigo(texto), /FlyV1|fm2_|-----BEGIN|postgres(ql)?:\/\/[^\s"'$]+:[^\s"'$@]+@/);
  }
});

test("E12: o flyctl é o do release oficial, fixado por versão e SHA-256, igual nos dois workflows", () => {
  const lido = (texto) => ({
    versao: /^ {2}FLYCTL_VERSAO: "(\d+\.\d+\.\d+)"$/m.exec(codigo(texto))?.[1],
    sha: /^ {2}FLYCTL_SHA256: "([0-9a-f]{64})"$/m.exec(codigo(texto))?.[1],
  });
  assert.ok(lido(hml).versao && lido(hml).sha, "versão e SHA-256 do flyctl em deploy-hml.yml");
  assert.deepEqual(lido(prod), lido(hml), "os dois workflows têm de usar o mesmo flyctl");
  for (const texto of [hml, prod]) {
    assert.match(codigo(texto), /sha256sum --check --strict/);
    assert.match(texto, /# SHA-256 de flyctl_\d+\.\d+\.\d+_Linux_x86_64\.tar\.gz/);
  }
});

test("E12: o vercel.json deixa de publicar a master, e o painel de PROD sai do ramo producao", () => {
  const vercel = JSON.parse(lerRaiz("dc360/vercel.json"));
  assert.deepEqual(vercel.git?.deploymentEnabled, { master: false });
  // Os ramos de implantação não podem estar desligados por engano.
  assert.equal(vercel.git.deploymentEnabled.producao, undefined);
  assert.equal(vercel.git.deploymentEnabled.homologacao, undefined);
  assert.match(codigo(prod), /refs\/heads\/producao/);
  assert.match(codigo(hml), /refs\/heads\/homologacao/);
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

// ----- E12: os casos negativos estragam o workflow real e a regra tem de morder -----

/** Troca um trecho que TEM de existir (senão o caso negativo não prova nada). */
function estragar(texto, de, para) {
  assert.ok(texto.includes(de), `o trecho a estragar não existe mais: ${de}`);
  return texto.replace(de, para);
}
const achou = (problemas, padrao) => assert.match(problemas.join("\n"), padrao);

test("negativo E12: gatilho de HML que não espera o CI (push) ou aceita outro ramo reprova", () => {
  achou(problemasDoDeployHml(estragar(hml, "on:\n  workflow_run:", "on:\n  push:\n    branches: [master]\n  workflow_run:")), /só dispara por workflow_run/);
  achou(problemasDoDeployHml(estragar(hml, "branches: [master]\n\npermissions", 'branches: [master, "v2/**"]\n\npermissions')), /workflow_run tem de ser/);
});

test("negativo E12: tirar uma trava do if (CI verde, push, master, mesmo repositório) reprova", () => {
  for (const trava of [
    "github.event.workflow_run.conclusion == 'success' &&\n      ",
    "github.event.workflow_run.event == 'push' &&\n      ",
    "github.event.workflow_run.head_branch == 'master' &&\n      ",
    "github.event.workflow_run.head_repository.full_name == github.repository",
  ]) {
    achou(problemasDoDeployHml(estragar(hml, trava, "")), /construir sem a trava/);
  }
});

test("negativo E12: checkout da ponta do ramo, em vez do commit que o CI aprovou, reprova", () => {
  const ruim = hml.replace("ref: ${{ github.event.workflow_run.head_sha }}", "ref: master");
  assert.notEqual(ruim, hml);
  achou(problemasDoDeployHml(ruim), /head_sha/);
});

test("negativo E12: deploy sem imagem por digest (reconstruiria no Fly), sem -a ou sem /saude reprova", () => {
  const semImagem = hml.replace(/ --image "registry\.fly\.io\/\$\{APP_API\}@\$\{DIGEST_API\}"/, "");
  assert.notEqual(semImagem, hml);
  achou(problemasDoDeployHml(semImagem), /deploy sem imagem por digest/);
  achou(problemasDoDeployHml(estragar(hml, 'flyctl deploy -c fly.hml.toml -a "$APP_API"', "flyctl deploy -c fly.hml.toml --remote-only")), /sem -a explícito|deploy que constrói/);
  achou(
    problemasDoDeployHml(estragar(hml, '--tipo=console --url="https://${APP_CONSOLE}.fly.dev" --versao="$VERSAO" --commit="$COMMIT"', '--tipo=console --url="https://${APP_CONSOLE}.fly.dev"')),
    /\/saude conferido/,
  );
});

test("negativo E12: o deploy de HML com o fly.toml, o ambiente ou o banco de PROD reprova", () => {
  achou(problemasDoDeployHml(estragar(hml, "-c fly.hml.toml -a", "-c fly.toml -a")), /fly\.toml de PROD/);
  achou(problemasDoDeployHml(estragar(hml, "environment: homologacao", "environment: producao")), /ambiente homologacao|cita producao/);
  achou(problemasDoDeployHml(estragar(hml, "migrar-producao.mjs --ambiente hml --aplicar", "migrar-producao.mjs --ambiente prod --aplicar")), /ambiente prod/);
});

test("autorização E12: token de deploy fora de ambiente protegido, token trocado ou vazado em log reprova", () => {
  // Job sem `environment` usando o segredo do Fly.
  achou(problemasDoDeployHml(estragar(hml, "    environment: homologacao\n", "")), /segredo fora de um ambiente protegido/);
  // Um token só para os dois apps: o de um app valendo no outro.
  achou(problemasDoDeployHml(hml.replace("secrets.FLY_TOKEN_CONSOLE", "secrets.FLY_TOKEN_API")), /um por app/);
  achou(problemasDoDeployHml(estragar(hml, "      - name: Implantar a API\n        working-directory: dc360", "      - name: Implantar a API\n        run: set -x\n        working-directory: dc360")), /set -x/);
  achou(problemasDoDeployHml(estragar(hml, '          printf \'%s\' "$FLY_API_TOKEN" | docker login registry.fly.io -u x --password-stdin\n          docker buildx imagetools create --tag "registry.fly.io/${APP_API}', '          echo "$FLY_API_TOKEN"\n          docker buildx imagetools create --tag "registry.fly.io/${APP_API}')), /echo de token/);
  // Entrada interpolada dentro do script (injeção).
  achou(problemasDoDeployHml(estragar(hml, "run: printf '%s' \"$GH_TOKEN\" | docker login ghcr.io -u \"$GITHUB_ACTOR\" --password-stdin\n\n      # As duas imagens", 'run: printf \'%s\' "$GH_TOKEN" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin\n\n      # As duas imagens')), /expressão/);
});

test("negativo E12: a promoção que aceita push, schedule ou perde uma entrada reprova (PROD só por workflow_dispatch)", () => {
  achou(problemasDaPromocao(estragar(prod, "on:\n  workflow_dispatch:", "on:\n  push:\n    branches: [master]\n  workflow_dispatch:")), /só muda por workflow_dispatch/);
  achou(problemasDaPromocao(estragar(prod, "on:\n  workflow_dispatch:", 'on:\n  schedule:\n    - cron: "0 3 * * *"\n  workflow_dispatch:')), /só muda por workflow_dispatch/);
  achou(problemasDaPromocao(estragar(prod, "      confirmacao:\n", "      confirmacao_x:\n")), /falta a entrada confirmacao/);
});

test("autorização E12: a promoção sem ambiente producao, sem validar ou fora da master reprova", () => {
  achou(problemasDaPromocao(estragar(prod, "environment: producao", "environment: homologacao")), /ambiente producao/);
  achou(problemasDaPromocao(estragar(prod, "    environment: producao\n", "")), /ambiente producao|fora de um ambiente/);
  achou(problemasDaPromocao(estragar(prod, "    needs: validar\n", "")), /depender de validar/);
  achou(problemasDaPromocao(estragar(prod, '[ "$GITHUB_REF" != "refs/heads/master" ]', "false")), /falhar fora da master/);
});

test("negativo E12: promoção que dispensa o selo de HML, a tag ou a confirmação digitada reprova", () => {
  achou(problemasDaPromocao(prod.replaceAll("hml-ok-", "sha-")), /hml-ok-/);
  achou(problemasDaPromocao(estragar(prod, "refs/tags/$TAG^{commit}", "refs/tags/$TAG")), /refs\/tags/);
  achou(problemasDaPromocao(estragar(prod, '"PROMOVER $TAG"', '"$TAG"')), /PROMOVER/);
  achou(problemasDaPromocao(estragar(prod, "merge-base --is-ancestor", "merge-base")), /is-ancestor/);
});

test("negativo E12: a promoção que migra o banco de PROD em CI, usa HML ou cria tag reprova", () => {
  achou(
    problemasDaPromocao(estragar(prod, "          flyctl deploy -c fly.toml", "          node scripts/migrar-producao.mjs --ambiente prod --aplicar\n          flyctl deploy -c fly.toml")),
    /migration de PROD é manual/,
  );
  achou(problemasDaPromocao(estragar(prod, "-c fly.toml -a", "-c fly.hml.toml -a")), /de HML|usar -c fly\.toml/);
  achou(problemasDaPromocao(estragar(prod, "          flyctl deploy -c fly.toml", "          git tag v9.9.9\n          flyctl deploy -c fly.toml")), /cria tag/);
});

test("negativo E12: promover o painel antes de conferir o console, ou implantar o console antes da API, reprova", () => {
  const ramo = / {6}- name: Mover o ramo producao para o commit promovido[\s\S]*?\n(?= {6}- name: Registrar o resultado)/.exec(prod)[0];
  const painelAntes = prod.replace(ramo, "").replace("      - name: Implantar a API\n", `${ramo}      - name: Implantar a API\n`);
  achou(problemasDaPromocao(painelAntes), /depois do \/saude do console/);
  const trocado = prod
    .replace("flyctl deploy -c fly.toml", "flyctl deploy -c XAPI")
    .replace("flyctl deploy -c fly.console.toml", "flyctl deploy -c fly.toml")
    .replace("flyctl deploy -c XAPI", "flyctl deploy -c fly.console.toml");
  achou(problemasDaPromocao(trocado), /API tem de ser implantada antes do console/);
});

test("negativo E12: escrita fora da lista (permissão a mais, ou a mesma em outro job) reprova", () => {
  const virou = estragar(
    prod,
    "    timeout-minutes: 15\n    permissions:\n      actions: read\n      contents: read",
    "    timeout-minutes: 15\n    permissions:\n      actions: read\n      contents: write",
  );
  assert.deepEqual(escritasDeJobs(virou), ["promover:contents", "validar:contents"]);
  assert.notDeepEqual(escritasDeJobs(virou), ESCRITAS_PERMITIDAS[PROD]);
  assert.deepEqual(escritasDeJobs(hml), ESCRITAS_PERMITIDAS[HML]);
  assert.deepEqual(escritasDeJobs(BOM), []);
});

test("negativo E12 (revisão 1): promover sem run bem-sucedido do deploy-hml.yml para o SHA, ou só pela tag, reprova", () => {
  const semRun = prod.replace(/ {6}- name: Exigir um deploy de HML bem-sucedido para o SHA[\s\S]*?\n(?= {6}# Prova 3b)/, "");
  assert.notEqual(semRun, prod);
  achou(problemasDaPromocao(semRun), /consulta aos runs do deploy-hml\.yml/);
  achou(problemasDaPromocao(estragar(prod, '.head_sha == $sha and .event == "workflow_run" and .conclusion == "success"', '.head_sha == $sha')), /head_sha, evento workflow_run e conclusão success/);
  achou(problemasDaPromocao(estragar(prod, "&event=workflow_run", "")), /consulta aos runs do deploy-hml\.yml/);
  achou(problemasDaPromocao(estragar(prod, '.name == "Marcar a versão como aprovada em HML" and .conclusion == "success"', '.name == "Marcar a versão como aprovada em HML"')), /job de aprovação/);
  achou(problemasDaPromocao(estragar(prod, "    permissions:\n      actions: read\n", "    permissions:\n")), /actions: read/);
  assert.equal(escritasDeJobs(prod).includes("validar:actions"), false);
});

test("negativo E12 (revisão 1): selo hml-ok com digest diferente do construído reprova", () => {
  const semConferir = prod.replace(/ {12}if \[ "\$digest" != "\$construido" \]; then\n[\s\S]*?\n {12}fi\n/, "");
  assert.notEqual(semConferir, prod);
  achou(problemasDaPromocao(semConferir), /digest do selo igual ao digest construído/);
  achou(problemasDaPromocao(estragar(prod, 'imagetools inspect "$imagem:sha-$COMMIT"', 'imagetools inspect "$imagem:hml-ok-$COMMIT"')), /digest de sha-<sha>/);
});

test("negativo E12 (revisão 1): promoção sem verificar a atestação assinada pelo deploy-hml.yml reprova", () => {
  achou(problemasDaPromocao(estragar(prod, 'gh attestation verify "oci://$imagem@$digest"', 'echo "oci://$imagem@$digest"')), /gh attestation verify/);
  achou(problemasDaPromocao(estragar(prod, ".github/workflows/deploy-hml.yml\"", ".github/workflows/outro.yml\"")), /--signer-workflow/);
  achou(problemasDaPromocao(prod.replace(/ *--signer-workflow [^\n]*\n/, "")), /--signer-workflow/);
});

test("negativo E12 (revisão 1): o deploy de HML sem atestar o digest de cada imagem, ou sem id-token e attestations, reprova", () => {
  const semAtestar = hml.replace(/ {6}- name: Atestar a proveniência da imagem da API[\s\S]*?\n(?= {6}- name: Atestar a proveniência da imagem do console)/, "");
  assert.notEqual(semAtestar, hml);
  achou(problemasDoDeployHml(semAtestar), /sem atestação de proveniência do digest da imagem api/);
  achou(problemasDoDeployHml(estragar(hml, "          subject-digest: ${{ steps.publicar.outputs.digest_console }}\n          push-to-registry: true", "          subject-digest: ${{ steps.publicar.outputs.digest_console }}")), /push-to-registry/);
  achou(problemasDoDeployHml(estragar(hml, "      id-token: write\n", "")), /id-token e attestations/);
  achou(problemasDoDeployHml(estragar(hml, "name: Marcar a versão como aprovada em HML", "name: Aprovar")), /nome do job aprovar mudou/);
  // As escritas novas valem só no job construir.
  assert.deepEqual(escritasDeJobs(hml), ESCRITAS_PERMITIDAS[HML]);
  const aprovarComIdToken = hml.replace("    timeout-minutes: 10\n    permissions:\n      contents: read\n      packages: write", "    timeout-minutes: 10\n    permissions:\n      contents: read\n      packages: write\n      id-token: write");
  assert.ok(escritasDeJobs(aprovarComIdToken).includes("aprovar:id-token"));
  assert.notDeepEqual(escritasDeJobs(aprovarComIdToken), ESCRITAS_PERMITIDAS[HML]);
  assert.notDeepEqual(escritasDeJobs(estragar(hml, "      attestations: write\n", "")), ESCRITAS_PERMITIDAS[HML]);
});
