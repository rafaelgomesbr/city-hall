/**
 * Política de exceção do SAST (V2-F01-E05).
 *
 * Cinco coisas travadas aqui, todas sem precisar do Semgrep nem do Trivy instalados:
 *  1. todo `nosemgrep` do repositório tem regra, motivo, dono e prazo vigente
 *     (e reprova se vencido), e as funções que decidem isso mordem de verdade;
 *  2. a baseline triada obedece à mesma política;
 *  3. nenhuma cópia das regras do registro mora no repositório (ele é público e a
 *     licença das regras proíbe redistribuir) e toda regra própria tem casos
 *     positivos e negativos em `.semgrep/test/`;
 *  4. o workflow `sast.yml` não deixa código sair do runner nem versão flutuar, e
 *     as regras do registro rodam FIXADAS num commit e ERROR novo delas reprova
 *     pela baseline do registro (correção 1 da F01);
 *  5. (V2-F01-E20, DV-22) a mesma política de exceção para o scan de imagens: toda
 *     entrada do `.trivyignore.yaml` tem ID, caminho (só o npm embutido na imagem
 *     base), motivo, dono e prazo vigente, e o script
 *     `varrer-imagem.sh` (com um Trivy de mentira) e os dois workflows que o
 *     chamam não deixam a varredura virar verde por engano.
 *
 * Rodar: `node --test scripts/excecoes-de-seguranca.test.mjs` (em dc360/).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PRAZO_MAXIMO_EM_DIAS,
  analisarArquivo,
  analisarTrivyignoreYaml,
  hojeEmIso,
  lerDataIso,
  problemasDaExcecao,
  varrerRepositorio,
} from "./excecoes-de-seguranca.mjs";
import { ARQUIVO_DA_BASELINE_DO_REGISTRO, lerBaseline, problemasDaBaseline } from "./sast-baseline.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lerTexto = (rel) => readFileSync(join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");
const HOJE = "2026-10-24";

// O marcador é montado em pedaços para este arquivo não conter, ele mesmo, um
// `nosemgrep` que o Semgrep leria como supressão de verdade.
const NS = "nosem" + "grep";
const BOA = `// ${NS}: dc360-sql-por-interpolacao -- motivo: fragmento estático com marcadores; dono: Rafael; ate: 2026-12-31`;

test("exceção completa e vigente é aceita", () => {
  assert.deepEqual(analisarArquivo(`const x = 1; ${BOA}\n`, HOJE), []);
});

test("o marcador na linha de comentário acima do código também vale", () => {
  assert.deepEqual(analisarArquivo(`${BOA}\nconst x = 1;\n`, HOJE), []);
});

test("vários ids de regra na mesma exceção são aceitos", () => {
  const linha = `// ${NS}: regra-a, regra-b -- motivo: duas regras, mesma causa estática; dono: Rafael; ate: 2026-12-31`;
  assert.deepEqual(analisarArquivo(linha, HOJE), []);
});

test("sem motivo reprova", () => {
  const v = analisarArquivo(`// ${NS}: regra-a -- dono: Rafael; ate: 2026-12-31`, HOJE);
  assert.equal(v.length, 1);
  assert.match(v[0].problema, /falta o motivo/);
});

test("motivo de uma palavra reprova: não explica nada", () => {
  const v = analisarArquivo(`// ${NS}: regra-a -- motivo: ok; dono: Rafael; ate: 2026-12-31`, HOJE);
  assert.match(v[0].problema, /motivo curto demais/);
});

test("sem dono reprova", () => {
  const v = analisarArquivo(`// ${NS}: regra-a -- motivo: fragmento estático conferido; ate: 2026-12-31`, HOJE);
  assert.equal(v.length, 1);
  assert.match(v[0].problema, /falta o dono/);
});

test("sem data reprova", () => {
  const v = analisarArquivo(`// ${NS}: regra-a -- motivo: fragmento estático conferido; dono: Rafael`, HOJE);
  assert.equal(v.length, 1);
  assert.match(v[0].problema, /falta a data/);
});

test("data mal formada ou impossível reprova", () => {
  for (const data of ["31/12/2026", "2026-13-01", "2026-02-31", "amanhã", "2026-1-5"]) {
    const v = analisarArquivo(
      `// ${NS}: regra-a -- motivo: fragmento estático conferido; dono: Rafael; ate: ${data}`, HOJE);
    assert.equal(v.length, 1, `data ${data}`);
    assert.match(v[0].problema, /inválida/, `data ${data}`);
  }
});

test("exceção vencida reprova, e a data vale até o fim do próprio dia", () => {
  const com = (data) => analisarArquivo(
    `// ${NS}: regra-a -- motivo: fragmento estático conferido; dono: Rafael; ate: ${data}`, HOJE);
  assert.deepEqual(com(HOJE), [], "vence hoje: ainda vale");
  const ontem = com("2026-10-23");
  assert.equal(ontem.length, 1);
  assert.match(ontem[0].problema, /vencida em 2026-10-23/);
});

test("prazo maior que um ano reprova: exceção não é decisão permanente", () => {
  const v = analisarArquivo(
    `// ${NS}: regra-a -- motivo: fragmento estático conferido; dono: Rafael; ate: 2099-01-01`, HOJE);
  assert.equal(v.length, 1);
  assert.match(v[0].problema, new RegExp(`passa de ${PRAZO_MAXIMO_EM_DIAS}`));
});

test("supressão cega (sem id de regra) é proibida, mesmo com motivo, dono e data", () => {
  for (const linha of [
    `foo(); // ${NS}`,
    `foo(); // ${NS} -- motivo: tudo certo aqui; dono: Rafael; ate: 2026-12-31`,
    `foo(); /* ${NS} */`,
    `# ${NS}`,
  ]) {
    const v = analisarArquivo(linha, HOJE);
    assert.equal(v.length, 1, linha);
    assert.match(v[0].problema, /sem id de regra/, linha);
  }
});

test("a linha do problema é a do marcador", () => {
  const v = analisarArquivo(`a();\nb();\nc(); // ${NS}: regra-a\nd();\n`, HOJE);
  assert.equal(v[0].linha, 3);
});

test("a palavra solta em prosa, sem comentário, não é marcador", () => {
  assert.deepEqual(analisarArquivo(`const aviso = "use o ${NS} com motivo";\n`, HOJE), []);
});

test("lerDataIso só aceita data de calendário", () => {
  assert.ok(lerDataIso("2024-02-29"));
  assert.equal(lerDataIso("2026-02-29"), null);
  assert.equal(lerDataIso(undefined), null);
});

test("problemasDaExcecao vale também para entrada fora de comentário (a baseline)", () => {
  assert.deepEqual(problemasDaExcecao({ motivo: "x".repeat(30), dono: "Rafael", ate: "2026-12-31" }, HOJE), []);
  assert.ok(problemasDaExcecao({}, HOJE).length >= 3);
});

// ---- o repositório de verdade -------------------------------------------------

test("todo nosemgrep do repositório tem regra, motivo, dono e prazo vigente", () => {
  const violacoes = varrerRepositorio(RAIZ, hojeEmIso());
  assert.deepEqual(
    violacoes.map((v) => `${v.arquivo}:${v.linha} ${v.problema}`),
    [],
    "exceção de SAST fora da política (motivo, dono e prazo vigente): corrija a linha ou renove com decisão",
  );
});

test("a baseline triada tem classe, motivo, dono e prazo vigente em toda entrada", () => {
  const baseline = lerBaseline(RAIZ);
  assert.ok(baseline.achados.length > 0, "a baseline não pode estar vazia: os achados antigos têm de estar triados");
  assert.deepEqual(problemasDaBaseline(baseline, hojeEmIso()), []);
});

test("a baseline não aceita entrada sem triagem, classe inventada nem defeito sem trabalho", () => {
  const base = { id: "a#1", regra: "r", arquivo: "f.ts", motivo: "x".repeat(30), dono: "Rafael", ate: "2026-12-31" };
  const ruim = (extra) => problemasDaBaseline({ achados: [{ ...base, ...extra }] }, HOJE);
  assert.deepEqual(ruim({ classe: "falso-positivo" }), []);
  assert.match(ruim({ classe: "PENDENTE" })[0], /classe "PENDENTE"/);
  assert.match(ruim({ classe: "defeito" })[0], /V2-F25-E01/);
  assert.deepEqual(ruim({ classe: "defeito", trabalho: "V2-F25-E01" }), []);
  assert.match(ruim({ classe: "aceito", ate: "2026-01-01" })[0], /vencida/);
  assert.match(ruim({ classe: "aceito", dono: "" })[0], /falta o dono/);
});

// ---- regras fixadas e testadas ------------------------------------------------

test("nenhuma cópia das regras do registro mora no repositório (público, licença sem redistribuição)", () => {
  assert.equal(existsSync(join(RAIZ, ".semgrep", "registro")), false, ".semgrep/registro/ não pode existir");
  assert.equal(existsSync(join(RAIZ, ".semgrep", "atualizar-registro.mjs")), false);
  const soRegras = readdirSync(join(RAIZ, ".semgrep", "regras")).filter((n) => n.endsWith(".yml"));
  assert.deepEqual(soRegras, ["log-de-autorizacao.yml", "organizacao-da-requisicao.yml", "sql-por-interpolacao.yml"],
    "só regras de autoria do projeto em .semgrep/regras");
  for (const nome of soRegras) {
    assert.doesNotMatch(lerTexto(`.semgrep/regras/${nome}`), /Semgrep Rules License|semgrep\.dev\/r\//, `${nome} parece cópia do registro`);
  }
});

test("toda regra própria tem casos positivos (ruleid) e negativos (ok) em .semgrep/test/", () => {
  const regras = readdirSync(join(RAIZ, ".semgrep", "regras")).filter((n) => n.endsWith(".yml"));
  assert.ok(regras.length >= 3, "as três regras da etapa: organização da requisição, SQL por interpolação, log de Authorization");
  for (const arquivo of regras) {
    const ids = [...lerTexto(`.semgrep/regras/${arquivo}`).matchAll(/^\s*- id:\s*(\S+)/gm)].map((m) => m[1]);
    assert.ok(ids.length > 0, `${arquivo} sem regra`);
    const casos = lerTexto(`.semgrep/test/${arquivo.replace(/\.yml$/, ".ts")}`);
    for (const id of ids) {
      assert.match(casos, new RegExp(`//\\s*ruleid:\\s*${id}\\b`), `${id}: falta caso positivo (ruleid)`);
      assert.match(casos, new RegExp(`//\\s*ok:\\s*${id}\\b`), `${id}: falta caso negativo (ok)`);
    }
  }
});

test("as regras próprias reprovam em ERROR (é o que o portão do PR lê)", () => {
  for (const arquivo of readdirSync(join(RAIZ, ".semgrep", "regras")).filter((n) => n.endsWith(".yml"))) {
    const texto = lerTexto(`.semgrep/regras/${arquivo}`);
    const quantas = (texto.match(/^\s*- id:/gm) ?? []).length;
    const erro = (texto.match(/^\s*severity:\s*ERROR\s*$/gm) ?? []).length;
    assert.equal(erro, quantas, `${arquivo}: toda regra própria é ERROR`);
  }
});

// ---- o workflow ----------------------------------------------------------------

/** O workflow sem os comentários: o texto explicativo cita termos que a política proíbe de USAR. */
function workflowSemComentarios() {
  return lerTexto(".github/workflows/sast.yml")
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/, ""))
    .join("\n");
}

test("o workflow de SAST fixa a versão e não deixa código sair do runner", () => {
  const w = workflowSemComentarios();
  assert.match(w, /SEMGREP_VERSION:\s*"\d+\.\d+\.\d+"/, "versão do Semgrep fixa (X.Y.Z)");
  // V2-F01-E05, DV-15: a instalação é por hash (ver o teste abaixo), não por `semgrep==` solto.
  assert.doesNotMatch(w, /pip install[^\n]*"?semgrep==/, "nada de `pip install semgrep==x` sem hash");
  assert.match(w, /SEMGREP_SEND_METRICS:\s*"off"/);
  assert.ok((w.match(/--metrics=off/g) ?? []).length >= 2, "--metrics=off no teste e na varredura");
  assert.doesNotMatch(w, /SEMGREP_APP_TOKEN|SEMGREP_APP_URL|semgrep\s+login|semgrep\s+ci\b/, "sem login, sem token, sem `semgrep ci`");
  assert.doesNotMatch(w, /--config\s+(auto|r\/|https?:)/, "nem `auto`, nem regra avulsa, nem URL");
  assert.doesNotMatch(w, /secrets\./, "o SAST não precisa de segredo nenhum");
  assert.doesNotMatch(w, /\.semgrep\/registro/, "não há cópia do registro para apontar");
});

// ---- DV-15: dependências do Semgrep travadas por hash ---------------------------

/** Os comandos `pip install` do workflow (continuações de linha juntadas), sem comentários. */
export function comandosPipDoWorkflow(texto) {
  return texto.replace(/\\\n\s*/g, " ").split("\n").filter((l) => /\bpip3?\s+install\b/.test(l)).map((l) => l.trim());
}

const ORIGEM_FORA_DO_PYPI = /^(-e\b|--editable|[a-z]+\+[a-z]+:|https?:|file:|\.{0,2}\/)|@\s*([a-z]+\+)?(https?|file|ssh):/;

/**
 * Problemas de um `requirements.txt` gerado com hashes: todo pacote tem versão exata e
 * ao menos um `--hash=sha256:<64 hex>`, e nada vem de URL, de repositório ou de caminho local.
 */
export function problemasDoRequirementsComHashes(texto) {
  const problemas = [];
  const linhas = texto.replace(/\r\n/g, "\n").replace(/\\\n\s*/g, " ").split("\n");
  let pacotes = 0;
  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (linha === "" || linha.startsWith("#")) continue;
    if (ORIGEM_FORA_DO_PYPI.test(linha)) {
      problemas.push(`origem que não é o PyPI por hash: ${linha.slice(0, 60)}`);
      continue;
    }
    if (linha.startsWith("-")) {
      problemas.push(`opção inesperada no arquivo de dependências: ${linha.slice(0, 60)}`);
      continue;
    }
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([0-9][^\s;]*)(?:\s*;[^\\]*?)?\s+(--hash=sha256:[0-9a-f]{64}(?:\s+--hash=sha256:[0-9a-f]{64})*)\s*$/.exec(linha);
    if (!m) {
      problemas.push(`pacote sem versão exata (==) ou sem --hash=sha256 de 64 hexadecimais: ${linha.slice(0, 60)}`);
      continue;
    }
    pacotes++;
  }
  if (pacotes === 0) problemas.push("o arquivo não tem nenhum pacote");
  return problemas;
}

test("DV-15: o Semgrep e todas as transitivas são instalados por hash (--require-hashes) a partir de um arquivo versionado", () => {
  const w = workflowSemComentarios();
  const pips = comandosPipDoWorkflow(w);
  assert.ok(pips.length >= 1, "o workflow instala o Semgrep com pip");
  for (const c of pips) {
    assert.match(c, /--require-hashes/, `pip sem --require-hashes: ${c}`);
    assert.match(c, /-r \.semgrep\/requirements\.txt\b/, `pip precisa ler o arquivo travado: ${c}`);
    assert.match(c, /--only-binary=:all:/, `sdist rodaria código de build sem hash: ${c}`);
    assert.match(c, /--no-deps/, `o arquivo já traz a árvore inteira: ${c}`);
    assert.doesNotMatch(c, /\bsemgrep==|\bsetuptools[<=>]/, `pacote avulso no comando (fora do arquivo com hash): ${c}`);
  }
  assert.match(w, /semgrep --version \| grep -Fx "\$\{SEMGREP_VERSION\}"/, "confere que a versão instalada é a fixada");
});

test("DV-15: .semgrep/requirements.txt tem hash em todo pacote, é gerado do .in e a versão do Semgrep bate com a do workflow", () => {
  const txt = lerTexto(".semgrep/requirements.txt");
  assert.deepEqual(problemasDoRequirementsComHashes(txt), []);
  assert.match(txt, /^# This file was autogenerated by uv via the following command:\n#\s+uv pip compile \.semgrep\/requirements\.in .*--generate-hashes/m,
    "o cabeçalho traz o comando que reproduz o arquivo");
  assert.match(txt, /--python-version 3\.11\b/, "gerado para o Python do CI (3.11)");
  assert.match(txt, /--exclude-newer \d{4}-\d{2}-\d{2}/, "a data de corte torna a geração reproduzível");
  const versao = /SEMGREP_VERSION:\s*"(\d+\.\d+\.\d+)"/.exec(lerTexto(".github/workflows/sast.yml"))?.[1];
  assert.ok(versao);
  const v = versao.replace(/\./g, "\\.");
  assert.match(txt, new RegExp(`^semgrep==${v} \\\\$`, "m"), "semgrep no arquivo travado = SEMGREP_VERSION");
  assert.match(lerTexto(".semgrep/requirements.in"), new RegExp(`^semgrep==${v}$`, "m"));
  assert.match(txt, /^setuptools==80\./m, "setuptools abaixo da 81 (pkg_resources) também está no arquivo");
});

test("DV-15: o verificador de requirements com hash morde (sem hash, sem versão exata, URL, hash curto)", () => {
  const h = "a".repeat(64);
  assert.deepEqual(problemasDoRequirementsComHashes(`attrs==26.1.0 \\\n    --hash=sha256:${h} \\\n    --hash=sha256:${"b".repeat(64)}\n    # via x\n`), []);
  assert.match(problemasDoRequirementsComHashes("attrs==26.1.0\n").join("|"), /--hash/);
  assert.match(problemasDoRequirementsComHashes(`attrs>=26 \\\n    --hash=sha256:${h}\n`).join("|"), /sem versão exata/);
  assert.match(problemasDoRequirementsComHashes("attrs==26.1.0 \\\n    --hash=sha256:abc123\n").join("|"), /64 hexadecimais/);
  assert.match(problemasDoRequirementsComHashes("git+https://example.org/x.git\n").join("|"), /não é o PyPI/);
  assert.match(problemasDoRequirementsComHashes(`x @ https://example.org/x.whl \\\n    --hash=sha256:${h}\n`).join("|"), /não é o PyPI/);
  assert.match(problemasDoRequirementsComHashes("# só comentário\n").join("|"), /nenhum pacote/);
  // O comando antigo do workflow (sem hash) é achado pelo extrator.
  assert.deepEqual(comandosPipDoWorkflow('python -m pip install "semgrep==1.0.0" "setuptools<81"\n'), ['python -m pip install "semgrep==1.0.0" "setuptools<81"']);
});

/** Os passos do job, cada um com o texto do bloco (sem comentários). */
function passosDoWorkflow() {
  const w = workflowSemComentarios();
  return w.split(/^      - /m).slice(1).map((bloco) => ({ nome: (bloco.match(/name:\s*(.+)/) ?? [undefined, ""])[1].trim(), bloco }));
}

/**
 * Problemas do workflow de SAST quanto ao registro (correção 1 da F01, E05): as regras do
 * registro têm de estar FIXADAS num commit, rodar sem mascarar falha e reprovar ERROR novo
 * pela baseline. Função pura sobre o texto do workflow (sem comentários), para o caso
 * sintético provar que ela morde.
 */
export function problemasDoRegistroNoWorkflow(w) {
  const problemas = [];
  const passos = w.split(/^ {6}- /m).slice(1).map((bloco) => ({ nome: (bloco.match(/name:\s*(.+)/) ?? [undefined, ""])[1].trim(), bloco }));
  if (/--config\s+p\//.test(w)) problemas.push("pacote móvel `--config p/...` do registro: a versão flutua");
  if (/--config\s+(auto|r\/|https?:)/.test(w)) problemas.push("regra avulsa, `auto` ou URL no `--config`");
  if (!/SEMGREP_RULES_SHA:\s*"[0-9a-f]{40}"/.test(w)) problemas.push("falta SEMGREP_RULES_SHA com o commit completo (40 hexadecimais)");
  if (!/git rev-parse HEAD\)"\s*=\s*"\$\{SEMGREP_RULES_SHA\}"/.test(w)) problemas.push("o download não confere o commit com `git rev-parse HEAD`");
  if (!/git fetch[^\n]*"\$\{SEMGREP_RULES_SHA\}"/.test(w)) problemas.push("o download não busca o commit fixado");
  for (const pacote of ["typescript/lang", "typescript/react", "javascript/node-crypto", "javascript/express", "javascript/jsonwebtoken", "javascript/react"]) {
    if (!new RegExp(`SEMGREP_RULES_PASTAS:[^]*?\\b${pacote.replace("/", "\\/")}\\b`).test(w)) problemas.push(`a pasta ${pacote} não está entre as regras do registro`);
  }
  const varredura = passos.find((p) => /semgrep-rules\/\$\{pasta\}/.test(p.bloco) && /semgrep scan/.test(p.bloco));
  if (!varredura) problemas.push("falta o passo que varre com as regras do registro fixadas");
  else if (!/04-registro\.json/.test(varredura.bloco)) problemas.push("a varredura do registro não grava 04-registro.json");
  const decisao = passos.find((p) => /sast-baseline\.mjs conferir[^\n]*--baseline \.semgrep\/baseline-registro\.json[^\n]*04-registro\.json/.test(p.bloco));
  if (!decisao) problemas.push("nenhum passo compara 04-registro.json com .semgrep/baseline-registro.json");
  for (const p of passos.filter((x) => /semgrep (scan|--test)|sast-baseline\.mjs|semgrep-rules/.test(x.bloco))) {
    if (/continue-on-error/.test(p.bloco)) problemas.push(`${p.nome}: passo de SAST com continue-on-error`);
    if (/\|\|\s*true/.test(p.bloco)) problemas.push(`${p.nome}: passo de SAST com \`|| true\``);
    if (/if:\s*\$\{\{\s*false/.test(p.bloco)) problemas.push(`${p.nome}: passo de SAST desligado`);
  }
  return problemas;
}

test("o registro roda FIXADO num commit, sem mascarar falha, e ERROR novo dele reprova pela baseline", () => {
  assert.deepEqual(problemasDoRegistroNoWorkflow(workflowSemComentarios()), []);
  // As regras próprias continuam sem pacote móvel.
  for (const p of passosDoWorkflow().filter((x) => /semgrep (scan|--test)/.test(x.bloco))) {
    assert.doesNotMatch(p.bloco, /--config\s+p\//, `${p.nome}: sem pacote móvel`);
  }
  assert.match(workflowSemComentarios(), /04-registro\.json/, "a saída do registro vai no artefato");
});

test("negativo: workflow com `p/...`, `|| true`, continue-on-error ou commit sem conferência é reprovado", () => {
  const bom = workflowSemComentarios();
  const movel = bom.replace(/--config "\$\{RUNNER_TEMP\}\/semgrep-rules\/\$\{pasta\}"/, "--config p/typescript");
  assert.match(problemasDoRegistroNoWorkflow(movel).join("|"), /pacote móvel/);
  const mascarado = bom.replace("dc360 2>&1 | tee sast-artefatos/04-registro-scan.txt", "dc360 2>&1 | tee sast-artefatos/04-registro-scan.txt || true");
  assert.match(problemasDoRegistroNoWorkflow(mascarado).join("|"), /\|\| true/);
  const tolerante = bom.replace("- name: Varredura com as regras do registro fixadas", "- name: Varredura com as regras do registro fixadas\n        continue-on-error: true");
  assert.match(problemasDoRegistroNoWorkflow(tolerante).join("|"), /continue-on-error/);
  const semConferir = bom.replace(/test "\$\(git rev-parse HEAD\)" = "\$\{SEMGREP_RULES_SHA\}"/, "true");
  assert.match(problemasDoRegistroNoWorkflow(semConferir).join("|"), /rev-parse/);
  const semSha = bom.replace(/SEMGREP_RULES_SHA: "[0-9a-f]{40}"/, 'SEMGREP_RULES_SHA: "develop"');
  assert.match(problemasDoRegistroNoWorkflow(semSha).join("|"), /40 hexadecimais/);
  const semDecisao = bom.replace("--baseline .semgrep/baseline-registro.json", "");
  assert.match(problemasDoRegistroNoWorkflow(semDecisao).join("|"), /nenhum passo compara/);
  // O workflow ANTERIOR (relatório que nunca reprova) é reprovado por esta função.
  const antigo = [
    "      - name: Relatório dos pacotes do registro (não reprova)",
    "        continue-on-error: true",
    "        run: |",
    "          semgrep scan --metrics=off --config p/typescript --config p/nodejs --config p/react --config p/jwt --json --output x.json dc360 || true",
  ].join("\n");
  const p = problemasDoRegistroNoWorkflow(antigo).join("|");
  assert.match(p, /pacote móvel/);
  assert.match(p, /continue-on-error/);
});

test("a baseline do registro existe, obedece à política de exceção e diz de qual commit das regras ela vale", () => {
  const baseline = lerBaseline(RAIZ, ARQUIVO_DA_BASELINE_DO_REGISTRO);
  assert.deepEqual(problemasDaBaseline(baseline, hojeEmIso()), []);
  const sha = /SEMGREP_RULES_SHA:\s*"([0-9a-f]{40})"/.exec(workflowSemComentarios())?.[1];
  assert.ok(sha);
  assert.equal(baseline.regras_do_registro, `semgrep/semgrep-rules@${sha}`, "a baseline do registro vale para o commit fixado no workflow");
  assert.equal(baseline.semgrep, /SEMGREP_VERSION:\s*"(\d+\.\d+\.\d+)"/.exec(workflowSemComentarios())?.[1]);
});

test("o workflow de SAST roda semgrep --test antes da varredura e a baseline decide", () => {
  const w = workflowSemComentarios();
  const iTeste = w.indexOf("semgrep --test");
  const iVarredura = w.indexOf("semgrep scan");
  const iBaseline = w.indexOf("sast-baseline.mjs conferir");
  assert.ok(iTeste > 0 && iVarredura > iTeste && iBaseline > iVarredura,
    "ordem: regras testadas, varredura, comparação com a baseline");
});

test("o workflow de SAST segue as regras de CI: permissions mínimas, timeout, runner fixo, ações por SHA", () => {
  const w = workflowSemComentarios();
  assert.match(w, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(w, /pull_request_target/);
  assert.match(w, /timeout-minutes:\s*\d+/);
  assert.match(w, /runs-on:\s*ubuntu-24\.04/);
  assert.doesNotMatch(w, /ubuntu-latest/);
  const usos = [...w.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(usos.length >= 3);
  for (const u of usos) assert.match(u, /@[0-9a-f]{40}$/, `ação sem SHA completo: ${u}`);
  // A versão fica em comentário ao lado do SHA, para a revisão humana.
  for (const l of lerTexto(".github/workflows/sast.yml").split("\n").filter((x) => /uses:/.test(x))) {
    assert.match(l, /#\s*v\d+\.\d+\.\d+\s*$/, `falta a versão em comentário: ${l.trim()}`);
  }
});

test("o ruleset exige o nome de exibição do job de SAST, então o nome é contrato", () => {
  assert.match(lerTexto(".github/workflows/sast.yml"), /^    name: SAST \(Semgrep\)$/m);
});

// ---- E20 e DV-22: exceções do scan de imagens (Trivy), em .trivyignore.yaml ------

const NPM_EMBUTIDO = "usr/local/lib/node_modules/npm/**";
const MOTIVO_TRIVY = "motivo: pacote do npm embutido na imagem base, que não roda em produção; dono: Rafael";

/** Uma entrada boa do `.trivyignore.yaml`, com campos substituíveis para os casos negativos. */
function entradaTrivy({ id = "CVE-2026-0001", paths = [NPM_EMBUTIDO], statement = MOTIVO_TRIVY, exp = "2026-12-15" } = {}) {
  const linhas = [`  - id: ${id}`];
  if (paths !== null) {
    linhas.push("    paths:");
    for (const p of paths) linhas.push(`      - "${p}"`);
  }
  if (statement !== null) linhas.push(`    statement: "${statement}"`);
  if (exp !== null) linhas.push(`    expired_at: ${exp}`);
  return linhas.join("\n");
}
const arquivoTrivy = (...entradas) => `# cabeçalho livre\n\nvulnerabilities:\n${entradas.join("\n")}\n`;
const problemasTrivy = (texto, hoje = HOJE) => analisarTrivyignoreYaml(texto, hoje).map((x) => x.problema).join("|");

test("trivyignore.yaml: entrada completa e vigente, comentário e linha em branco são aceitos", () => {
  assert.deepEqual(analisarTrivyignoreYaml(arquivoTrivy(entradaTrivy()), HOJE), []);
  assert.deepEqual(analisarTrivyignoreYaml(arquivoTrivy(entradaTrivy(), entradaTrivy({ id: "CVE-2026-0002", paths: [NPM_EMBUTIDO, "usr/local/lib/node_modules/npm/node_modules/x/package.json"] })), HOJE), []);
});

test("trivyignore.yaml: sem motivo, sem dono ou sem prazo reprova, e diz o quê", () => {
  const v = problemasTrivy(arquivoTrivy(entradaTrivy({ statement: null, exp: null })));
  assert.match(v, /falta o motivo/);
  assert.match(v, /falta o dono/);
  assert.match(v, /falta a data de vencimento \(expired_at: AAAA-MM-DD\)/);
  assert.match(problemasTrivy(arquivoTrivy(entradaTrivy({ exp: null }))), /falta a data/);
});

test("trivyignore.yaml: motivo curto, data impossível e prazo de mais de um ano reprovam", () => {
  assert.match(problemasTrivy(arquivoTrivy(entradaTrivy({ statement: "motivo: ok; dono: Rafael" }))), /motivo curto demais/);
  assert.match(problemasTrivy(arquivoTrivy(entradaTrivy({ exp: "2026-02-31" }))), /inválida/);
  assert.match(problemasTrivy(arquivoTrivy(entradaTrivy({ exp: "2099-01-01" }))), /passa de 366/);
});

test("trivyignore.yaml: entrada vencida reprova, e o próprio dia do expired_at já conta como sem efeito (é exclusivo no Trivy)", () => {
  const com = (data) => analisarTrivyignoreYaml(arquivoTrivy(entradaTrivy({ exp: data })), HOJE);
  assert.match(com("2026-10-23")[0].problema, /vencida em 2026-10-23/);
  assert.match(com(HOJE)[0].problema, /deixa de ignorar a partir do próprio dia/);
  assert.deepEqual(com("2026-10-25"), [], "amanhã ainda vale");
});

test("trivyignore.yaml: ID repetido, chave desconhecida e linha fora do formato reprovam (nada é ignorado em silêncio)", () => {
  const repetido = analisarTrivyignoreYaml(arquivoTrivy(entradaTrivy(), entradaTrivy()), HOJE);
  assert.match(repetido.map((x) => x.problema).join("|"), /CVE-2026-0001 repetido/);
  // `purls` e `statuses` são portas de exceção do Trivy que a política não conhece.
  const comPurl = `${entradaTrivy()}\n    purls:\n      - "pkg:npm/brace-expansion"`;
  assert.match(problemasTrivy(arquivoTrivy(comPurl)), /chave `purls` não é aceita/);
  assert.match(problemasTrivy(arquivoTrivy(`${entradaTrivy()}\n    statuses: [affected]`)), /chave `statuses` não é aceita/);
  assert.match(problemasTrivy(arquivoTrivy(`${entradaTrivy()}\nlixo com espaço`)), /fora do formato/);
  // Outras chaves do topo (misconfigurations, secrets, licenses) abririam outra porta.
  assert.match(problemasTrivy(`secrets:\n  - id: aws-access-key-id\nvulnerabilities:\n${entradaTrivy()}\n`), /só a chave `vulnerabilities:`/);
  assert.match(problemasTrivy(""), /falta a chave `vulnerabilities:`/);
});

test("trivyignore.yaml (DV-22): entrada sem caminho ou com caminho largo demais reprova", () => {
  assert.match(problemasTrivy(arquivoTrivy(entradaTrivy({ paths: null }))), /falta paths/);
  assert.match(problemasTrivy(arquivoTrivy(entradaTrivy({ paths: [] }))), /falta paths/);
  for (const largo of ["**", "*", "usr/**", "usr/local/lib/node_modules/**", "app/node_modules/brace-expansion/package.json", "/usr/local/lib/node_modules/npm/**", "usr/local/lib/node_modules/npm/../../../../app/x"]) {
    assert.match(problemasTrivy(arquivoTrivy(entradaTrivy({ paths: [largo] }))), /caminho|barra inicial|\.\./, `deveria reprovar: ${largo}`);
  }
  // Um caminho bom junto de um ruim reprova do mesmo jeito.
  assert.match(problemasTrivy(arquivoTrivy(entradaTrivy({ paths: [NPM_EMBUTIDO, "app/**"] }))), /fora de/);
});

test("o .trivyignore.yaml da raiz existe, o .trivyignore antigo não, e toda entrada tem ID, caminho, motivo, dono e prazo vigente", () => {
  assert.equal(existsSync(join(RAIZ, ".trivyignore.yaml")), true, ".trivyignore.yaml na raiz (é onde mora a política)");
  assert.equal(existsSync(join(RAIZ, ".trivyignore")), false, "o .trivyignore por linha vale por ID na imagem inteira (DV-22): não pode voltar");
  const violacoes = analisarTrivyignoreYaml(lerTexto(".trivyignore.yaml"), hojeEmIso());
  assert.deepEqual(
    violacoes.map((v) => `.trivyignore.yaml:${v.linha} ${v.problema}`),
    [],
    "exceção do Trivy fora da política (ID, caminho, motivo, dono e prazo vigente): corrija a entrada, renove com decisão ou apague",
  );
  const texto = lerTexto(".trivyignore.yaml");
  const ids = [...texto.matchAll(/^ {2}- id: (\S+)$/gm)].map((m) => m[1]);
  assert.equal(ids.length, 9, "as nove CVEs da triagem inicial do npm embutido");
  assert.equal((texto.match(/^ {6}- "usr\/local\/lib\/node_modules\/npm\/\*\*"$/gm) ?? []).length, 9, "cada uma restrita ao npm embutido");
  assert.doesNotMatch(texto.replace(/^\s*#.*$/gm, ""), /purls|statuses/);
});

// ---- E20: o script e os workflows ------------------------------------------------

const SCRIPT_TRIVY = "dc360/scripts/varrer-imagem.sh";

test("varrer-imagem.sh fixa a versão do Trivy com SHA-256 e usa a régua da etapa", () => {
  const t = lerTexto(SCRIPT_TRIVY).split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.match(t, /TRIVY_VERSAO="\d+\.\d+\.\d+"/, "versão fixa X.Y.Z");
  assert.match(t, /TRIVY_SHA256="[0-9a-f]{64}"/, "SHA-256 do tarball do release");
  assert.match(t, /releases\/download\/v\$\{TRIVY_VERSAO\}\//, "baixa a versão fixa do release, nunca `latest`");
  assert.doesNotMatch(t, /releases\/latest|install\.sh/, "nem latest nem script de instalação");
  assert.match(t, /sha256sum --check --strict/, "checksum conferido antes de extrair");
  assert.ok(t.indexOf("--check") < t.indexOf("tar -xzf"), "confere antes de extrair");
  assert.match(t, /--scanners vuln,secret/);
  assert.match(t, /GRAVIDADES="CRITICAL,HIGH"/);
  assert.match(t, /--ignore-unfixed/);
  assert.match(t, /--ignorefile "\$ARQUIVO_DE_EXCECOES"/);
  assert.match(t, /--exit-code 1/, "o portão reprova com código 1");
  assert.doesNotMatch(t, /--skip-(files|dirs)|--ignore-policy|--severity (LOW|MEDIUM|UNKNOWN)/, "nenhum atalho fora do .trivyignore.yaml");
  assert.doesNotMatch(t, /secrets\.|_TOKEN/, "o scan não recebe segredo");
});

/** Cria um `trivy` de mentira que registra os argumentos e devolve os códigos pedidos pelo ambiente. */
function trivyDeMentira(pasta) {
  const caminho = join(pasta, "trivy");
  writeFileSync(caminho, `#!/usr/bin/env bash
echo "$1 $*" >> "$STUB_LOG"
saida=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--output" ]; then saida="$a"; fi
  prev="$a"
done
[ -n "$saida" ] && echo '{}' > "$saida"
if [ "$1" = "image" ]; then exit "\${STUB_SCAN_EXIT:-0}"; fi
if [ "$1" = "convert" ]; then
  case " $* " in *" --exit-code 1 "*) exit "\${STUB_CONVERT_EXIT:-0}";; esac
  exit 0
fi
exit 9
`);
  chmodSync(caminho, 0o755);
  return caminho;
}

function rodarVarrer({ scan = 0, convert = 0, excecoes = true, nomeDoArquivo = ".trivyignore.yaml" } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "dc360-varrer-"));
  try {
    const trivy = trivyDeMentira(pasta);
    const saida = join(pasta, "saida");
    mkdirSync(saida);
    const arquivo = join(pasta, nomeDoArquivo);
    if (excecoes) writeFileSync(arquivo, "vulnerabilities:\n");
    const r = spawnSync("bash", [join(RAIZ, SCRIPT_TRIVY), "varrer", trivy, saida, "api", "dc360-api:ci"], {
      encoding: "utf8",
      env: {
        ...process.env,
        STUB_LOG: join(pasta, "chamadas.log"),
        STUB_SCAN_EXIT: String(scan),
        STUB_CONVERT_EXIT: String(convert),
        TRIVY_ARQUIVO_DE_EXCECOES: arquivo,
      },
    });
    const chamadas = existsSync(join(pasta, "chamadas.log")) ? readFileSync(join(pasta, "chamadas.log"), "utf8") : "";
    return { codigo: r.status, saida: `${r.stdout}${r.stderr}`, chamadas, arquivo };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

const WINDOWS = process.platform === "win32";

test("varrer-imagem.sh: imagem limpa sai 0, e o Trivy recebe a régua inteira e o arquivo de exceções", { skip: WINDOWS && "script em bash" }, () => {
  const r = rodarVarrer();
  assert.equal(r.codigo, 0, r.saida);
  const scan = r.chamadas.split("\n").find((l) => l.startsWith("image "));
  assert.match(scan, /--scanners vuln,secret/);
  assert.match(scan, /--severity CRITICAL,HIGH/);
  assert.match(scan, /--ignore-unfixed/);
  assert.ok(scan.includes(`--ignorefile ${r.arquivo}`), "o arquivo de exceções chega ao Trivy");
  assert.match(scan, /dc360-api:ci$/);
});

test("varrer-imagem.sh: achado de CRITICAL ou HIGH com correção reprova com código 1", { skip: WINDOWS && "script em bash" }, () => {
  const r = rodarVarrer({ convert: 1 });
  assert.equal(r.codigo, 1, r.saida);
});

test("varrer-imagem.sh: Trivy que não consegue varrer sai 2, nunca verde", { skip: WINDOWS && "script em bash" }, () => {
  const r = rodarVarrer({ scan: 1 });
  assert.equal(r.codigo, 2, r.saida);
  assert.match(r.saida, /não conseguiu varrer/);
});

test("varrer-imagem.sh (DV-22): arquivo de exceções que não é YAML (o .trivyignore por linha, sem caminho) não roda", { skip: WINDOWS && "script em bash" }, () => {
  const r = rodarVarrer({ nomeDoArquivo: ".trivyignore" });
  assert.equal(r.codigo, 2, r.saida);
  assert.match(r.saida, /precisa ser YAML/);
  assert.equal(r.chamadas, "", "nem chegou a chamar o Trivy");
  // E o padrão do script é o YAML da raiz.
  assert.match(lerTexto(SCRIPT_TRIVY), /TRIVY_ARQUIVO_DE_EXCECOES:-\$RAIZ_DO_REPOSITORIO\/\.trivyignore\.yaml\}/);
});

test("varrer-imagem.sh: sem o arquivo de exceções a varredura não roda", { skip: WINDOWS && "script em bash" }, () => {
  const r = rodarVarrer({ excecoes: false });
  assert.equal(r.codigo, 2, r.saida);
  assert.match(r.saida, /arquivo de exceções ausente/);
  assert.equal(r.chamadas, "", "nem chegou a chamar o Trivy");
});

test("varrer-imagem.sh: checksum que não bate interrompe a instalação antes de extrair", { skip: WINDOWS && "script em bash" }, () => {
  const pasta = mkdtempSync(join(tmpdir(), "dc360-instalar-"));
  try {
    const bin = join(pasta, "bin");
    mkdirSync(bin);
    // curl de mentira: "baixa" um arquivo com outro conteúdo. O resto do PATH continua o do sistema.
    writeFileSync(join(bin, "curl"), `#!/usr/bin/env bash
saida=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--output" ]; then saida="$a"; fi
  prev="$a"
done
echo "conteudo adulterado" > "$saida"
`);
    chmodSync(join(bin, "curl"), 0o755);
    const destino = join(pasta, "trivy");
    const r = spawnSync("bash", [join(RAIZ, SCRIPT_TRIVY), "instalar", destino], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.notEqual(r.status, 0, "checksum errado tem de reprovar");
    assert.equal(existsSync(join(destino, "trivy")), false, "nada foi extraído");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

/**
 * Roda `varrer-imagem.sh instalar` de verdade, com um curl de mentira que entrega
 * um tarball sintético (contém um `trivy` de mentira) e o SHA-256 desse tarball no
 * lugar do fixado. Tudo o mais é o script real. `adulterar` troca o texto do script
 * antes de rodar (usado para provar que a conferência morde).
 */
function instalarComTarballDeMentira(adulterar = (t) => t) {
  const pasta = mkdtempSync(join(tmpdir(), "dc360-instalar-ok-"));
  try {
    const fonte = join(pasta, "fonte");
    mkdirSync(fonte);
    writeFileSync(join(fonte, "trivy"), '#!/usr/bin/env bash\necho "Version: 0.75.0"\n');
    chmodSync(join(fonte, "trivy"), 0o755);
    const tarball = join(pasta, "trivy.tar.gz");
    const t = spawnSync("tar", ["-czf", tarball, "-C", fonte, "trivy"], { encoding: "utf8" });
    assert.equal(t.status, 0, `tar de apoio falhou: ${t.stderr}`);
    const sha = createHash("sha256").update(readFileSync(tarball)).digest("hex");

    const bin = join(pasta, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "curl"), `#!/usr/bin/env bash
saida=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--output" ]; then saida="$a"; fi
  prev="$a"
done
cp "${tarball}" "$saida"
`);
    chmodSync(join(bin, "curl"), 0o755);
    if (process.platform === "darwin") {
      // O `sha256sum` do macOS não tem `--strict` (o do runner Linux, que é onde o script roda, tem).
      writeFileSync(join(bin, "sha256sum"), '#!/usr/bin/env bash\nexec shasum -a 256 --check\n');
      chmodSync(join(bin, "sha256sum"), 0o755);
    }

    const original = lerTexto(SCRIPT_TRIVY);
    const comSha = original.replace(/^TRIVY_SHA256="[0-9a-f]{64}"$/m, `TRIVY_SHA256="${sha}"`);
    assert.notEqual(comSha, original, "a linha do TRIVY_SHA256 tem de existir para o teste trocá-la");
    const pastaScript = join(pasta, "x", "y");
    mkdirSync(pastaScript, { recursive: true });
    const script = join(pastaScript, "varrer-imagem.sh");
    writeFileSync(script, adulterar(comSha));

    const destino = join(pasta, "destino");
    const r = spawnSync("bash", [script, "instalar", destino], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, destino };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

test("varrer-imagem.sh instalar: o stdout é UMA linha, só o caminho do binário (o workflow o grava em $GITHUB_ENV)", { skip: WINDOWS && "script em bash" }, () => {
  const r = instalarComTarballDeMentira();
  assert.equal(r.status, 0, `instalar deveria dar certo: ${r.stderr}`);
  const linhas = r.stdout.split("\n").filter((l) => l !== "");
  assert.equal(linhas.length, 1, `stdout com mais de uma linha (o GitHub recusa como "Invalid format"): ${JSON.stringify(r.stdout)}`);
  assert.equal(linhas[0], join(r.destino, "trivy"), "a única linha é o caminho do binário");
  assert.match(r.stderr, /OK/, "a confirmação do checksum e a versão continuam visíveis, no stderr");
});

test("varrer-imagem.sh instalar: a trava do stdout morde (sem o redirecionamento da conferência, o teste reprova)", { skip: WINDOWS && "script em bash" }, () => {
  const sem = instalarComTarballDeMentira((t) => t.replace(/(--check(?: --strict)?) >&2/g, "$1"));
  assert.equal(sem.status, 0);
  const linhas = sem.stdout.split("\n").filter((l) => l !== "");
  assert.ok(linhas.length > 1, `o script adulterado tinha de poluir o stdout, e saiu: ${JSON.stringify(sem.stdout)}`);
});

/** O texto de um job de um workflow (sem as linhas de comentário), do `  <id>:` ao próximo job. */
function textoDoJob(arquivo, id) {
  const linhas = lerTexto(arquivo).split("\n").filter((l) => !/^\s*#/.test(l));
  const inicio = linhas.findIndex((l) => l === `  ${id}:`);
  assert.ok(inicio >= 0, `job ${id} não encontrado em ${arquivo}`);
  const fim = linhas.findIndex((l, i) => i > inicio && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l));
  return linhas.slice(inicio, fim < 0 ? undefined : fim).join("\n");
}

function passosDoJob(texto) {
  return texto.split(/^ {6}- /m).slice(1).map((b) => ({ nome: (b.match(/name:\s*(.+)/) ?? [undefined, ""])[1].trim(), bloco: b }));
}

// Um caso só, com o laço dentro: o `baseline.mjs` conta os `test(` do texto.
test("verificar.yml e auditoria-semanal.yml: o job imagens instala o Trivy fixo e varre as duas imagens sem poder ignorar a falha", () => {
  for (const arquivo of [".github/workflows/verificar.yml", ".github/workflows/auditoria-semanal.yml"]) {
    const job = textoDoJob(arquivo, "imagens");
    const passos = passosDoJob(job);
    const iInstalar = passos.findIndex((p) => /varrer-imagem\.sh instalar/.test(p.bloco));
    const iVarrer = passos.findIndex((p) => /varrer-imagem\.sh varrer/.test(p.bloco));
    const iBuildConsole = passos.findIndex((p) => /docker build[\s\S]*Dockerfile\.console/.test(p.bloco));
    assert.ok(iInstalar >= 0 && iVarrer > iInstalar, `${arquivo}: instala o Trivy antes de varrer`);
    assert.ok(iBuildConsole >= 0 && iBuildConsole < iVarrer, `${arquivo}: varre depois de construir as duas imagens`);
    const varrer = passos[iVarrer].bloco;
    assert.match(varrer, /dc360-api:ci/, arquivo);
    assert.match(varrer, /dc360-console:ci/, arquivo);
    assert.match(varrer, /exit "\$falhou"/, `${arquivo}: o passo reprova se qualquer imagem reprovou`);
    for (const p of [passos[iInstalar], passos[iVarrer]]) {
      assert.doesNotMatch(p.bloco, /continue-on-error|\|\|\s*true|if:\s*\$\{\{\s*false/, `${arquivo} ${p.nome}: o scan não pode ser ignorado`);
    }
    assert.doesNotMatch(job, /secrets\./, `${arquivo}: o job de scan não recebe segredo`);
    assert.doesNotMatch(job, /permissions:/, `${arquivo}: nenhuma permissão extra no job`);
  }
});

test("a imagem comunitária do banco (PostGIS, por digest) passa pelo Trivy no PR e na agenda, com a mesma régua e o mesmo digest dos serviços (correção 1 da F01, E21)", () => {
  const compose = lerTexto("dc360/compose.yaml");
  const doCompose = [...compose.matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  assert.ok(doCompose.length >= 1 && new Set(doCompose).size === 1, "o compose usa uma imagem de banco só");
  const imagemDoBanco = doCompose[0];
  assert.match(imagemDoBanco, /^postgis\/postgis:17-[\d.]+@sha256:[0-9a-f]{64}$/);
  for (const arquivo of [".github/workflows/verificar.yml", ".github/workflows/auditoria-semanal.yml"]) {
    const job = textoDoJob(arquivo, "imagens");
    const passo = passosDoJob(job).find((p) => /varrer-imagem\.sh varrer/.test(p.bloco));
    assert.ok(passo, `${arquivo}: passo de varredura`);
    assert.ok(passo.bloco.includes(`postgis="${imagemDoBanco}"`), `${arquivo}: varre ${imagemDoBanco} (o digest dos serviços e do compose)`);
    assert.match(passo.bloco, /docker pull --quiet "\$postgis"/, `${arquivo}: baixa a imagem antes de varrer`);
    assert.match(passo.bloco, /for par in "api:dc360-api:ci" "console:dc360-console:ci" "postgis:\$postgis"; do/, `${arquivo}: a imagem do banco está no MESMO laço das nossas (mesma régua, mesma exceção, mesmo "reprova se qualquer uma falhou")`);
    assert.doesNotMatch(passo.bloco, /continue-on-error|\|\|\s*true|if:\s*\$\{\{\s*false/, `${arquivo}: sem mascarar`);
  }
  // O digest dos serviços do verificar.yml é o mesmo (senão se varre uma imagem e se roda outra).
  const servicos = [...lerTexto(".github/workflows/verificar.yml").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n").matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  assert.ok(servicos.length >= 2);
  for (const s of servicos) assert.equal(s, imagemDoBanco, "serviço do verificar.yml com digest diferente do compose");
});

test("a varredura semanal das imagens mora em auditoria-semanal.yml (CVE nasce sem commit) e roda na agenda", () => {
  const w = lerTexto(".github/workflows/auditoria-semanal.yml");
  assert.match(w, /^ {2}schedule:|^on:\n {2}schedule:/m);
  assert.match(w, /name: Varredura semanal das imagens \(Trivy\)/);
});

test("o job imagens do verificar.yml continua com o nome que o ruleset exige", () => {
  assert.match(lerTexto(".github/workflows/verificar.yml"), /^ {4}name: Imagens Docker \(API e console\)$/m);
});
