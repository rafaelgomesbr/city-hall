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
 *     o registro só roda num passo de relatório que nunca reprova;
 *  5. (V2-F01-E20) a mesma política de exceção para o scan de imagens: toda linha
 *     do `.trivyignore` tem ID, motivo, dono e prazo vigente, e o script
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
  analisarTrivyignore,
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
  return w.split(/^      - /m).slice(1).map((bloco) => ({ nome: (bloco.match(/name:\s*(.+)/) ?? [undefined, ""])[1].trim(), bloco }));
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

// ---- E20: exceções do scan de imagens (Trivy) -----------------------------------

const BOA_TRIVY = "CVE-2026-0001 exp:2026-12-15 # motivo: pacote do npm embutido na imagem base, que não roda em produção; dono: Rafael";

test("trivyignore: linha completa e vigente, comentário e linha em branco são aceitos", () => {
  assert.deepEqual(analisarTrivyignore(`# cabeçalho livre\n\n${BOA_TRIVY}\n`, HOJE), []);
});

test("trivyignore: sem motivo, sem dono ou sem prazo reprova, e diz o quê", () => {
  const v = analisarTrivyignore("CVE-2026-0002\n", HOJE).map((x) => x.problema);
  assert.equal(v.length, 3);
  assert.match(v.join("|"), /falta o motivo/);
  assert.match(v.join("|"), /falta o dono/);
  assert.match(v.join("|"), /falta a data de vencimento \(exp:AAAA-MM-DD\)/);
  const semPrazo = analisarTrivyignore("CVE-2026-0002 # motivo: pacote do npm embutido na imagem base; dono: Rafael", HOJE);
  assert.equal(semPrazo.length, 1);
  assert.match(semPrazo[0].problema, /falta a data/);
});

test("trivyignore: motivo curto, data impossível e prazo de mais de um ano reprovam", () => {
  const com = (extra) => analisarTrivyignore(`CVE-2026-0003 ${extra}`, HOJE).map((x) => x.problema).join("|");
  assert.match(com("exp:2026-12-15 # motivo: ok; dono: Rafael"), /motivo curto demais/);
  assert.match(com("exp:2026-02-31 # motivo: pacote do npm embutido na imagem base; dono: Rafael"), /inválida/);
  assert.match(com("exp:2099-01-01 # motivo: pacote do npm embutido na imagem base; dono: Rafael"), /passa de 366/);
});

test("trivyignore: linha vencida reprova, e o próprio dia do exp: já conta como sem efeito (o exp: do Trivy é exclusivo)", () => {
  const com = (data) => analisarTrivyignore(
    `CVE-2026-0004 exp:${data} # motivo: pacote do npm embutido na imagem base; dono: Rafael`, HOJE);
  assert.match(com("2026-10-23")[0].problema, /vencida em 2026-10-23/);
  assert.match(com(HOJE)[0].problema, /deixa de ignorar a partir do próprio dia/);
  assert.deepEqual(com("2026-10-25"), [], "amanhã ainda vale");
});

test("trivyignore: ID repetido e linha fora do formato reprovam (nada é ignorado em silêncio)", () => {
  const v = analisarTrivyignore(`${BOA_TRIVY}\n${BOA_TRIVY}\nlixo com espaço\n`, HOJE);
  assert.match(v.map((x) => x.problema).join("|"), /CVE-2026-0001 repetido \(primeira vez na linha 1\)/);
  const fora = v.find((x) => x.linha === 3);
  assert.match(fora.problema, /fora do formato/);
});

test("o .trivyignore da raiz existe e toda linha dele tem ID, motivo, dono e prazo vigente", () => {
  assert.equal(existsSync(join(RAIZ, ".trivyignore")), true, ".trivyignore na raiz (mesmo vazio, é onde mora a política)");
  const violacoes = analisarTrivyignore(lerTexto(".trivyignore"), hojeEmIso());
  assert.deepEqual(
    violacoes.map((v) => `.trivyignore:${v.linha} ${v.problema}`),
    [],
    "exceção do Trivy fora da política (ID, motivo, dono e prazo vigente): corrija a linha, renove com decisão ou apague",
  );
});

test("o .trivyignore não esconde achado de forma genérica: toda linha de dados tem ID, exp, motivo e dono", () => {
  const linhas = lerTexto(".trivyignore").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  for (const l of linhas) assert.match(l, /^\S+ exp:\d{4}-\d{2}-\d{2} # motivo: .+; dono: .+$/, l);
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
  assert.doesNotMatch(t, /--skip-(files|dirs)|--ignore-policy|--severity (LOW|MEDIUM|UNKNOWN)/, "nenhum atalho fora do .trivyignore");
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

function rodarVarrer({ scan = 0, convert = 0, excecoes = true } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "dc360-varrer-"));
  try {
    const trivy = trivyDeMentira(pasta);
    const saida = join(pasta, "saida");
    mkdirSync(saida);
    const arquivo = join(pasta, ".trivyignore");
    if (excecoes) writeFileSync(arquivo, "");
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

test("a varredura semanal das imagens mora em auditoria-semanal.yml (CVE nasce sem commit) e roda na agenda", () => {
  const w = lerTexto(".github/workflows/auditoria-semanal.yml");
  assert.match(w, /^ {2}schedule:|^on:\n {2}schedule:/m);
  assert.match(w, /name: Varredura semanal das imagens \(Trivy\)/);
});

test("o job imagens do verificar.yml continua com o nome que o ruleset exige", () => {
  assert.match(lerTexto(".github/workflows/verificar.yml"), /^ {4}name: Imagens Docker \(API e console\)$/m);
});
