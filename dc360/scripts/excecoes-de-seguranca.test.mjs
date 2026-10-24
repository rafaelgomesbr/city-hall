/**
 * Política de exceção do SAST (V2-F01-E05).
 *
 * Quatro coisas travadas aqui, todas sem precisar do Semgrep instalado:
 *  1. todo `nosemgrep` do repositório tem regra, motivo, dono e prazo vigente
 *     (e reprova se vencido), e as funções que decidem isso mordem de verdade;
 *  2. a baseline triada obedece à mesma política;
 *  3. nenhuma cópia das regras do registro mora no repositório (ele é público e a
 *     licença das regras proíbe redistribuir) e toda regra própria tem casos
 *     positivos e negativos em `.semgrep/test/`;
 *  4. o workflow `sast.yml` não deixa código sair do runner nem versão flutuar, e
 *     o registro só roda num passo de relatório que nunca reprova.
 *
 * Rodar: `node --test scripts/excecoes-de-seguranca.test.mjs` (em dc360/).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PRAZO_MAXIMO_EM_DIAS,
  analisarArquivo,
  hojeEmIso,
  lerDataIso,
  problemasDaExcecao,
  varrerRepositorio,
} from "./excecoes-de-seguranca.mjs";
import { lerBaseline, problemasDaBaseline } from "./sast-baseline.mjs";

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
  assert.match(w, /semgrep==\$\{SEMGREP_VERSION\}/, "instala por versão exata");
  assert.match(w, /SEMGREP_SEND_METRICS:\s*"off"/);
  assert.ok((w.match(/--metrics=off/g) ?? []).length >= 2, "--metrics=off no teste e na varredura");
  assert.doesNotMatch(w, /SEMGREP_APP_TOKEN|SEMGREP_APP_URL|semgrep\s+login|semgrep\s+ci\b/, "sem login, sem token, sem `semgrep ci`");
  assert.doesNotMatch(w, /--config\s+(auto|r\/|https?:)/, "nem `auto`, nem regra avulsa, nem URL");
  assert.doesNotMatch(w, /secrets\./, "o SAST não precisa de segredo nenhum");
  assert.doesNotMatch(w, /\.semgrep\/registro/, "não há cópia do registro para apontar");
});

/** Os passos do job, cada um com o texto do bloco (sem comentários). */
function passosDoWorkflow() {
  const w = workflowSemComentarios();
  return w.split(/^      - /m).slice(1).map((bloco) => ({ nome: (bloco.match(/name:\s*(.+)/) ?? [, ""])[1].trim(), bloco }));
}

test("o registro (p/...) só roda num passo de relatório que nunca reprova; o que bloqueia é só regra própria", () => {
  const passos = passosDoWorkflow();
  const comRegistro = passos.filter((p) => /--config\s+p\//.test(p.bloco));
  assert.equal(comRegistro.length, 1, "um único passo consulta o registro");
  const [rel] = comRegistro;
  assert.match(rel.nome, /Relatório/);
  assert.match(rel.bloco, /continue-on-error:\s*true/, "passo de relatório não reprova o job");
  assert.match(rel.bloco, /\|\|\s*true/, "nem o comando reprova");
  for (const p of passos.filter((x) => /semgrep (scan|--test)/.test(x.bloco) && x !== rel)) {
    assert.doesNotMatch(p.bloco, /--config\s+p\//, `${p.nome}: passo bloqueante só com regra própria`);
    assert.doesNotMatch(p.bloco, /continue-on-error/, `${p.nome}: passo bloqueante não pode ignorar falha`);
    assert.match(p.bloco, /--config \.semgrep\/regras\b/);
  }
  for (const pacote of ["typescript", "nodejs", "react", "jwt"]) {
    assert.match(rel.bloco, new RegExp(`--config p/${pacote}\\b`), `pacote p/${pacote} no relatório`);
  }
  assert.match(rel.bloco, /04-registro-relatorio/, "o relatório sai no artefato");
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
