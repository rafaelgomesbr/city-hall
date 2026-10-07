import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { FIXTURE, RAIZ_REAL, executarCli } from "./apoio-de-teste.mjs";
import {
  PADROES_DE_SEGREDO,
  conferirCapturas,
  conferirEvidencia,
  conferirIndice,
  conferirRelatorio,
  conferirSegredos,
  conferirSonda,
  conferirTravessao,
  conferirVeredito,
  corpoDaSecao,
  formatarResultado,
} from "./conferir-evidencia.mjs";
import { gerarEstado } from "./gerar-estado.mjs";

const TRAVESSAO = String.fromCharCode(0x2014);
const ID = "V2-F00-E01";
const PASTA_REL = `docs/evidencias-v2/G00/${ID}`;

/* ---------- Repositório git descartável ---------- */

function git(raiz, ...args) {
  return execFileSync("git", ["-c", "user.name=teste", "-c", "user.email=teste@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", ...args], { cwd: raiz, encoding: "utf8" }).trim();
}

function escrever(raiz, relativo, conteudo) {
  const caminho = join(raiz, ...relativo.split("/"));
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

function listar(pasta, base = pasta) {
  return readdirSync(pasta).flatMap((n) => {
    const c = join(pasta, n);
    return statSync(c).isDirectory() ? listar(c, base) : [c.slice(base.length + 1).split("\\").join("/")];
  });
}

/** O mesmo formato de `montarIndice` (dc360/scripts/baseline.mjs): todo arquivo menos INDEX.md, em qualquer profundidade. */
function gravarIndice(pasta) {
  const linhas = ["# INDEX", "", "| Arquivo | SHA-256 |", "| --- | --- |"];
  for (const nome of listar(pasta).filter((n) => n.split("/").pop() !== "INDEX.md" && !/^(VEREDITO|RISCO-ACEITO)\.md$|^validacao\//.test(n)).sort()) {
    linhas.push(`| ${nome} | ${createHash("sha256").update(readFileSync(join(pasta, nome))).digest("hex")} |`);
  }
  writeFileSync(join(pasta, "INDEX.md"), linhas.join("\n") + "\n");
}

/**
 * Cópia da fixture como repositório git com a evidência da V2-F00-E01 pronta
 * (risco alto, sem UI) e commitada. Devolve `{ raiz, sha, pasta, limpar }`.
 */
function repoComEvidencia() {
  const base = mkdtempSync(join(tmpdir(), "roadmap-evidencia-"));
  const raiz = join(base, "repo");
  cpSync(FIXTURE, raiz, { recursive: true });
  // A fixture cita um hash que não existe de propósito; aqui ele só atrapalharia o gerar-estado.
  const statusRel = "docs/roadmap-v2/STATUS.md";
  writeFileSync(join(raiz, statusRel), readFileSync(join(raiz, statusRel), "utf8").replace("`abc1234`", "abc1234"));
  cpSync(join(RAIZ_REAL, "docs", "roadmap-v2", "mapa-de-impacto.json"), join(raiz, "docs", "roadmap-v2", "mapa-de-impacto.json"));
  const pasta = join(raiz, ...PASTA_REL.split("/"));
  escrever(raiz, `${PASTA_REL}/RESUMO.md`, "# Resumo\n\nFatos.\n");
  escrever(raiz, `${PASTA_REL}/saidas/01-sonda-antes.txt`, "sonda antes: 6 de 13 vermelhos\n");
  escrever(raiz, `${PASTA_REL}/saidas/02-sonda-depois.txt`, "sonda depois: 13 de 13 verdes\n");
  gravarIndice(pasta);
  git(raiz, "init", "-q");
  git(raiz, "add", "-A");
  git(raiz, "commit", "-q", "-m", `${ID}: candidato`);
  const sha = git(raiz, "rev-parse", "HEAD");
  return { raiz, base, sha, pasta, limpar: () => rmSync(base, { recursive: true, force: true }) };
}

const porCodigo = (r, codigo) => r.resultados.filter((x) => x.codigo === codigo);
const nivel = (r, codigo) => porCodigo(r, codigo).map((x) => x.nivel);

/* ---------- Caminho feliz e cada falha ---------- */

test("evidência inteira e commitada: nenhuma falha", () => {
  const r = repoComEvidencia();
  try {
    const res = conferirEvidencia({ id: ID, sha: r.sha, raiz: r.raiz });
    assert.equal(res.falhas, 0, formatarResultado(res));
    for (const c of ["etapa", "sha", "lista-permitida", "regras-commitadas", "pasta", "indice", "segredos", "travessao", "capturas", "sonda"]) {
      assert.deepEqual(nivel(res, c), ["OK"], c);
    }
    assert.match(formatarResultado(res), /RESULTADO: sem falha/);
  } finally {
    r.limpar();
  }
});

test("pasta da etapa que não existe", () => {
  const r = repoComEvidencia();
  try {
    const res = conferirEvidencia({ id: "V2-F00-E03", sha: r.sha, raiz: r.raiz });
    assert.deepEqual(nivel(res, "pasta"), ["FALHA"]);
    assert.equal(res.falhas >= 1, true);
  } finally {
    r.limpar();
  }
});

test("etapa inexistente nos arquivos de fase", () => {
  const r = repoComEvidencia();
  try {
    const res = conferirEvidencia({ id: "V2-F00-E77", sha: r.sha, raiz: r.raiz });
    assert.deepEqual(nivel(res, "etapa"), ["FALHA"]);
  } finally {
    r.limpar();
  }
});

test("INDEX.md: ausente, arquivo trocado, arquivo novo, arquivo sumido", () => {
  const r = repoComEvidencia();
  try {
    assert.deepEqual(conferirIndice(r.pasta).map((x) => x.nivel), ["OK"]);

    writeFileSync(join(r.pasta, "RESUMO.md"), "# Resumo\n\nFatos alterados depois do índice.\n");
    let [x] = conferirIndice(r.pasta);
    assert.equal(x.nivel, "FALHA");
    assert.match(x.mensagem, /RESUMO\.md tem SHA-256 diferente/);
    writeFileSync(join(r.pasta, "RESUMO.md"), "# Resumo\n\nFatos.\n");

    escrever(r.raiz, `${PASTA_REL}/saidas/03-extra.txt`, "novo\n");
    [x] = conferirIndice(r.pasta);
    assert.match(x.mensagem, /03-extra\.txt existe e não está no INDEX\.md/);
    rmSync(join(r.pasta, "saidas", "03-extra.txt"));

    rmSync(join(r.pasta, "saidas", "02-sonda-depois.txt"));
    [x] = conferirIndice(r.pasta);
    assert.match(x.mensagem, /02-sonda-depois\.txt está no INDEX\.md e não existe/);

    rmSync(join(r.pasta, "INDEX.md"));
    [x] = conferirIndice(r.pasta);
    assert.equal(x.nivel, "FALHA");
    assert.match(x.mensagem, /INDEX\.md não existe/);
  } finally {
    r.limpar();
  }
});

test("INDEX.md: INDEX.md de subpasta fica de fora, e arquivo do gatekeeper (VEREDITO, validacao/) não precisa estar listado", () => {
  const r = repoComEvidencia();
  try {
    escrever(r.raiz, `${PASTA_REL}/saidas/INDEX.md`, "# outro\n");
    escrever(r.raiz, `${PASTA_REL}/VEREDITO.md`, "veredito: PASS\n");
    escrever(r.raiz, `${PASTA_REL}/validacao/abc1234/qa.md`, "x\n");
    assert.deepEqual(conferirIndice(r.pasta).map((x) => x.nivel), ["OK"]);
  } finally {
    r.limpar();
  }
});

test("INDEX.md: bate só normalizando CRLF vira AVISO, não FALHA", () => {
  const r = repoComEvidencia();
  try {
    writeFileSync(join(r.pasta, "RESUMO.md"), "# Resumo\r\n\r\nFatos.\r\n");
    const res = conferirIndice(r.pasta);
    assert.deepEqual(res.map((x) => x.nivel), ["OK", "AVISO"]);
    assert.match(res[1].mensagem, /CRLF/);
  } finally {
    r.limpar();
  }
});

test("segredos: cada padrão é pego, e nunca com o valor na mensagem", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-segredo-"));
  try {
    const casos = {
      JWT: "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdEFGH1234 fim",
      "cabeçalho Bearer com valor": "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789",
      "cabeçalho Basic com valor": "Authorization: Basic dXNlcjpwYXNzd29yZDEyMzQ1Njc4",
      "PASSWORD com valor": "CREATE ROLE dc360_app LOGIN PASSWORD 'senha-do-teste-123';",
      "URL com usuário e senha": "DATABASE_URL=postgres://dc360:segredo123@localhost:5432/dc360",
      "variável *_SEGREDO com valor": "JWT_SEGREDO=0123456789abcdef0123456789abcdef",
    };
    for (const [nome, linha] of Object.entries(casos)) {
      writeFileSync(join(pasta, "saida.txt"), `linha limpa\n${linha}\n`);
      const [r] = conferirSegredos(pasta);
      assert.equal(r.nivel, "FALHA", nome);
      assert.ok(r.mensagem.includes(nome), `${nome}: ${r.mensagem}`);
      assert.ok(r.mensagem.includes("saida.txt:2"), r.mensagem);
      assert.ok(!r.mensagem.includes("0123456789abcdef"), "a mensagem não pode repetir o valor");
      assert.ok(!r.mensagem.includes("senha-do-teste"), "a mensagem não pode repetir o valor");
    }
    assert.equal(PADROES_DE_SEGREDO.length, Object.keys(casos).length);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("segredos: o que a redação do baseline deixa não é segredo", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-segredo-"));
  try {
    writeFileSync(
      join(pasta, "saida.txt"),
      [
        "[JWT REDIGIDO] e Bearer [REDIGIDO] e Basic [REDIGIDO]",
        "postgres://[REDIGIDO]@localhost/db",
        "DC360_JWT_SEGREDO=",
        "DC360_JWT_SEGREDO=<segredo>",
        "DC360_JWT_SEGREDO=$DC360_JWT_SEGREDO",
        "a coluna PASSWORD existe e o texto password aparece sem valor",
        "SEGREDO sozinho e Bearer curto",
      ].join("\n"),
    );
    assert.deepEqual(conferirSegredos(pasta).map((x) => x.nivel), ["OK"]);
    // Arquivo binário não é lido.
    writeFileSync(join(pasta, "captura.png"), Buffer.from("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdEFGH1234"));
    assert.deepEqual(conferirSegredos(pasta).map((x) => x.nivel), ["OK"]);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("travessão: só em .md, com arquivo e linha", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-travessao-"));
  try {
    writeFileSync(join(pasta, "saida.txt"), `saída bruta pode ter ${TRAVESSAO}\n`);
    assert.deepEqual(conferirTravessao(pasta).map((x) => x.nivel), ["OK"]);
    writeFileSync(join(pasta, "RESUMO.md"), `# Resumo\n\nTexto com ${TRAVESSAO} no meio.\n`);
    const [r] = conferirTravessao(pasta);
    assert.equal(r.nivel, "FALHA");
    assert.match(r.mensagem, /RESUMO\.md:3/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("capturas: nenhuma, faltando combinação, nome ilegível e completo", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-capturas-"));
  try {
    const toque = (nome) => {
      mkdirSync(dirname(join(pasta, nome)), { recursive: true });
      writeFileSync(join(pasta, nome), "");
    };
    assert.equal(conferirCapturas(pasta)[0].nivel, "FALHA");
    assert.match(conferirCapturas(pasta)[0].mensagem, /nenhuma captura/);

    toque("capturas/entrada-1280-claro.png");
    toque("capturas/entrada-1280-escuro.png");
    toque("capturas/entrada-390-claro.png");
    let [r] = conferirCapturas(pasta);
    assert.equal(r.nivel, "FALHA");
    assert.match(r.mensagem, /390 px escuro/);
    assert.ok(!r.mensagem.includes("1280 px"));

    toque("capturas/entrada-390-escuro.png");
    assert.deepEqual(conferirCapturas(pasta).map((x) => x.nivel), ["OK"]);

    // Nome em inglês e pasta "antes" também valem.
    rmSync(join(pasta, "capturas"), { recursive: true });
    for (const n of ["a-1280-light.webp", "a-1280-dark.webp", "a-390-light.jpg", "antes/a-390-dark.jpeg"]) toque(n);
    assert.deepEqual(conferirCapturas(pasta).map((x) => x.nivel), ["OK"]);

    // Nome que o padrão não lê: AVISO, nunca OK calado nem FALHA.
    rmSync(pasta, { recursive: true });
    mkdirSync(pasta);
    toque("tela1.png");
    toque("tela2.png");
    [r] = conferirCapturas(pasta);
    assert.equal(r.nivel, "AVISO");
    assert.match(r.mensagem, /padrão de nome/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("capturas só são exigidas com tag UI (a E02 da fixture é UI)", () => {
  const r = repoComEvidencia();
  try {
    escrever(r.raiz, "docs/evidencias-v2/G00/V2-F00-E02/RESUMO.md", "# Resumo\n");
    gravarIndice(join(r.raiz, "docs", "evidencias-v2", "G00", "V2-F00-E02"));
    git(r.raiz, "add", "-A");
    git(r.raiz, "commit", "-q", "-m", "evidencia E02");
    const sha = git(r.raiz, "rev-parse", "HEAD");
    const res = conferirEvidencia({ id: "V2-F00-E02", sha, raiz: r.raiz });
    assert.deepEqual(nivel(res, "capturas"), ["FALHA"]);
    assert.deepEqual(nivel(res, "sonda"), ["OK"], "risco médio não exige sonda");
  } finally {
    r.limpar();
  }
});

test("sonda: risco alto sem 'antes' falha, só 'antes' avisa, os dois passam", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-sonda-"));
  try {
    mkdirSync(join(pasta, "saidas"));
    writeFileSync(join(pasta, "saidas", "01-api-completa.txt"), "x");
    assert.equal(conferirSonda(pasta)[0].nivel, "FALHA");
    writeFileSync(join(pasta, "saidas", "02-sonda-ANTES-do-conserto.txt"), "x");
    assert.equal(conferirSonda(pasta)[0].nivel, "AVISO");
    mkdirSync(join(pasta, "sondas"));
    writeFileSync(join(pasta, "sondas", "depois.txt"), "x");
    assert.equal(conferirSonda(pasta)[0].nivel, "OK");
    // "antes" fora de saidas/ e sondas/ não vale.
    rmSync(join(pasta, "saidas"), { recursive: true });
    writeFileSync(join(pasta, "antes.txt"), "x");
    assert.equal(conferirSonda(pasta)[0].nivel, "FALHA");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("sonda: a E01 da fixture (risco alto) falha sem sonda antes", () => {
  const r = repoComEvidencia();
  try {
    rmSync(join(r.pasta, "saidas"), { recursive: true });
    gravarIndice(r.pasta);
    git(r.raiz, "add", "-A");
    git(r.raiz, "commit", "-q", "-m", "sem sonda");
    const res = conferirEvidencia({ id: ID, sha: git(r.raiz, "rev-parse", "HEAD"), raiz: r.raiz });
    assert.deepEqual(nivel(res, "sonda"), ["FALHA"]);
  } finally {
    r.limpar();
  }
});

/* ---------- Git: SHA, ancestral, lista permitida, regras ---------- */

test("sha: formato inválido, inexistente e fora da história do HEAD", () => {
  const r = repoComEvidencia();
  try {
    assert.deepEqual(nivel(conferirEvidencia({ id: ID, sha: "xyz", raiz: r.raiz }), "sha"), ["FALHA"]);
    assert.deepEqual(nivel(conferirEvidencia({ id: ID, sha: "0000000deadbeef", raiz: r.raiz }), "sha"), ["FALHA"]);
    assert.match(porCodigo(conferirEvidencia({ id: ID, sha: "0000000deadbeef", raiz: r.raiz }), "sha")[0].mensagem, /não existe como commit/);

    // Um commit num ramo que o HEAD não contém.
    git(r.raiz, "checkout", "-q", "-b", "lateral");
    escrever(r.raiz, "lateral.txt", "x");
    git(r.raiz, "add", "-A");
    git(r.raiz, "commit", "-q", "-m", "lateral");
    const lateral = git(r.raiz, "rev-parse", "HEAD");
    git(r.raiz, "checkout", "-q", "-");
    const res = conferirEvidencia({ id: ID, sha: lateral, raiz: r.raiz });
    assert.match(porCodigo(res, "sha")[0].mensagem, /não é ancestral do HEAD/);
    assert.ok(res.falhas >= 1);
    assert.match(porCodigo(res, "lista-permitida")[0].mensagem, /não conferida porque o SHA não passou/);
  } finally {
    r.limpar();
  }
});

test("lista permitida: registro depois do candidato passa, mudança de produto reprova", () => {
  const r = repoComEvidencia();
  try {
    escrever(r.raiz, `${PASTA_REL}/VEREDITO.md`, "veredito: PASS\n");
    escrever(r.raiz, `${PASTA_REL}/validacao/${r.sha.slice(0, 7)}/qa.md`, "x\n");
    escrever(r.raiz, "docs/roadmap-v2/ESTADO-ATUAL.md", "x\n");
    escrever(r.raiz, "docs/relatorios-v2/semanais/2026-10-12.html", "<p>x</p>");
    git(r.raiz, "add", "-A");
    git(r.raiz, "commit", "-q", "-m", "registro");
    let res = conferirEvidencia({ id: ID, sha: r.sha, raiz: r.raiz });
    assert.deepEqual(nivel(res, "lista-permitida"), ["OK"], formatarResultado(res));

    escrever(r.raiz, "dc360/apps/api/src/servidor.ts", "export {};\n");
    git(r.raiz, "add", "-A");
    git(r.raiz, "commit", "-q", "-m", "mexeu no produto");
    res = conferirEvidencia({ id: ID, sha: r.sha, raiz: r.raiz });
    assert.deepEqual(nivel(res, "lista-permitida"), ["FALHA"]);
    assert.match(porCodigo(res, "lista-permitida")[0].mensagem, /dc360\/apps\/api\/src\/servidor\.ts/);
    assert.match(porCodigo(res, "lista-permitida")[0].mensagem, /peça um candidato novo/);
  } finally {
    r.limpar();
  }
});

test("regras commitadas: mapa alterado, skill e scripts novos e não commitados reprovam", () => {
  const r = repoComEvidencia();
  try {
    assert.deepEqual(nivel(conferirEvidencia({ id: ID, sha: r.sha, raiz: r.raiz }), "regras-commitadas"), ["OK"]);

    writeFileSync(join(r.raiz, "docs", "roadmap-v2", "mapa-de-impacto.json"), readFileSync(join(r.raiz, "docs", "roadmap-v2", "mapa-de-impacto.json"), "utf8") + "\n");
    let res = conferirEvidencia({ id: ID, sha: r.sha, raiz: r.raiz });
    assert.deepEqual(nivel(res, "regras-commitadas"), ["FALHA"]);
    assert.match(porCodigo(res, "regras-commitadas")[0].mensagem, /mapa-de-impacto\.json/);
    git(r.raiz, "checkout", "--", "docs/roadmap-v2/mapa-de-impacto.json");

    escrever(r.raiz, ".claude/skills/validar-etapa/SKILL.md", "nova skill\n");
    res = conferirEvidencia({ id: ID, sha: r.sha, raiz: r.raiz });
    assert.deepEqual(nivel(res, "regras-commitadas"), ["FALHA"], "arquivo novo e solto também é regra não commitada");
    rmSync(join(r.raiz, ".claude"), { recursive: true });

    escrever(r.raiz, "scripts/roadmap/novo.mjs", "export {};\n");
    assert.deepEqual(nivel(conferirEvidencia({ id: ID, sha: r.sha, raiz: r.raiz }), "regras-commitadas"), ["FALHA"]);
  } finally {
    r.limpar();
  }
});

/* ---------- Registro (--registro) ---------- */

const CABECALHO = (sha, extra = {}) => {
  const c = {
    validador: "qa", modelo: "claude-sonnet", etapa: ID, sha_validado: sha, ci_run: "ausente", rodada: "1", herdado_de: "",
    tags: "[AUTHZ]", nivel_de_prova_exigido: "[E1]", nivel_de_prova_obtido: "[E1]", veredito: "PASS", confianca: "alta",
    humano_necessario: "nao", escalar: "nenhum", ...extra,
  };
  return `---\n${Object.entries(c).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n`;
};

const CORPO = (sobrescrever = {}) => {
  const base = {
    "Critérios verificados": "- vigência liga a escrita: saidas/02-sonda-depois.txt",
    "Evidência": "- comando X, código 0",
    "Cenários positivos": "- conta ativa escreve",
    "Cenários negativos": "- conta desativada recebe 401",
    "Tentativas de reprovar": "- tentei escrever com token de conta desativada: 401",
    "Achados": "nenhum",
    "Não verificado": "- o CI do SHA",
    "Risco residual": "baixo",
    "Motivo do humano": "não se aplica",
    ...sobrescrever,
  };
  return Object.entries(base).map(([t, c]) => `## ${t}\n${c}\n`).join("");
};

const RELATORIO_OK = (sha) => CABECALHO(sha) + CORPO();

const VEREDITO_OK = (sha) => [
  `# VEREDITO de ${ID}`,
  "",
  "| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  `| 1 | 2026-10-08 | ${sha.slice(0, 7)} | ausente | PASS | aaaaaaa | bbbbbbb | ccccccc |`,
  "",
].join("\n");

/** Commit de registro completo: três relatórios (os validadores da E01), VEREDITO e ESTADO-ATUAL. */
function gravarRegistro(r, { relatorio = RELATORIO_OK, veredito = VEREDITO_OK } = {}) {
  const sha7 = r.sha.slice(0, 7);
  for (const dimensao of ["qa", "red-team", "seguranca-aplicacao"]) {
    escrever(r.raiz, `${PASTA_REL}/validacao/${sha7}/${dimensao}.md`, relatorio(r.sha).replace("validador: qa", `validador: ${dimensao}`));
  }
  escrever(r.raiz, `${PASTA_REL}/VEREDITO.md`, veredito(r.sha));
  writeFileSync(join(r.raiz, "docs", "roadmap-v2", "ESTADO-ATUAL.md"), gerarEstado(r.raiz));
  git(r.raiz, "add", "-A");
  git(r.raiz, "commit", "-q", "-m", `${ID}: registro da validação de ${sha7}, PASS`);
}

test("--registro: relatórios, VEREDITO e estado em ordem, sem falha", () => {
  const r = repoComEvidencia();
  try {
    gravarRegistro(r);
    const res = conferirEvidencia({ id: ID, sha: r.sha, registro: true, raiz: r.raiz });
    assert.equal(res.falhas, 0, formatarResultado(res));
    assert.deepEqual(nivel(res, "registro-relatorios"), ["OK"]);
    assert.deepEqual(nivel(res, "registro-veredito"), ["OK"]);
    assert.deepEqual(nivel(res, "registro-estado"), ["OK"]);
    assert.deepEqual(nivel(res, "registro-dimensoes"), [], "as três dimensões obrigatórias estão lá");
    // Sem --registro, nada disso é conferido.
    assert.deepEqual(nivel(conferirEvidencia({ id: ID, sha: r.sha, raiz: r.raiz }), "registro-relatorios"), []);
  } finally {
    r.limpar();
  }
});

test("--registro: sem pasta validacao/<sha7>, sem VEREDITO e estado velho", () => {
  const r = repoComEvidencia();
  try {
    const res = conferirEvidencia({ id: ID, sha: r.sha, registro: true, raiz: r.raiz });
    assert.deepEqual(nivel(res, "registro-relatorios"), ["FALHA"]);
    assert.deepEqual(nivel(res, "registro-veredito"), ["FALHA"]);
    // Não há ESTADO-ATUAL.md nesta cópia: o conferir de estado reprova.
    assert.deepEqual(nivel(res, "registro-estado"), ["FALHA"]);
    assert.ok(res.falhas >= 3);
  } finally {
    r.limpar();
  }
});

test("--registro: dimensão obrigatória que falta vira AVISO com o nome dela", () => {
  const r = repoComEvidencia();
  try {
    gravarRegistro(r);
    rmSync(join(r.pasta, "validacao", r.sha.slice(0, 7), "red-team.md"));
    git(r.raiz, "add", "-A");
    git(r.raiz, "commit", "-q", "-m", "tirou uma");
    const res = conferirEvidencia({ id: ID, sha: r.sha, registro: true, raiz: r.raiz });
    assert.deepEqual(nivel(res, "registro-dimensoes"), ["AVISO"]);
    assert.match(porCodigo(res, "registro-dimensoes")[0].mensagem, /red-team/);
  } finally {
    r.limpar();
  }
});

test("relatório: cabeçalho, campos, valores e seções", () => {
  const sha = "1234567890abcdef";
  const opcoes = { arquivo: "validacao/1234567/qa.md", id: ID, sha, riscoAlto: true };
  assert.deepEqual(conferirRelatorio(RELATORIO_OK(sha), opcoes), []);

  assert.match(conferirRelatorio("sem cabeçalho nenhum", opcoes)[0], /sem cabeçalho YAML/);
  assert.ok(conferirRelatorio(RELATORIO_OK(sha).replace("confianca: alta\n", ""), opcoes).some((p) => /"confianca" ausente/.test(p)));
  assert.ok(conferirRelatorio(RELATORIO_OK(sha).replace("ci_run: ausente", "ci_run: "), opcoes).some((p) => /"ci_run" ausente ou vazio/.test(p)));
  assert.ok(conferirRelatorio(RELATORIO_OK(sha).replace("veredito: PASS", "veredito: APROVADO"), opcoes).some((p) => /veredito "APROVADO"/.test(p)));
  assert.ok(conferirRelatorio(RELATORIO_OK(sha).replace("confianca: alta", "confianca: certa"), opcoes).some((p) => /confianca/.test(p)));
  assert.ok(conferirRelatorio(RELATORIO_OK(sha).replace("humano_necessario: nao", "humano_necessario: talvez"), opcoes).some((p) => /humano_necessario/.test(p)));
  assert.ok(conferirRelatorio(RELATORIO_OK(sha).replace(`etapa: ${ID}`, "etapa: V2-F00-E02"), opcoes).some((p) => /não é V2-F00-E01/.test(p)));
  assert.ok(conferirRelatorio(RELATORIO_OK(sha).replace(`sha_validado: ${sha}`, "sha_validado: fffffff"), opcoes).some((p) => /sha_validado/.test(p)));
  assert.ok(conferirRelatorio(RELATORIO_OK(sha).replace("## Risco residual\n", ""), opcoes).some((p) => /falta a seção "## Risco residual"/.test(p)));
  // SHA curto no cabeçalho (sete caracteres) vale.
  assert.deepEqual(conferirRelatorio(RELATORIO_OK(sha).replace(`sha_validado: ${sha}`, "sha_validado: 1234567"), opcoes), []);
});

test("relatório: 'Tentativas de reprovar' vazia recusa; 'Não verificado' vazio só recusa em risco alto; comentário de modelo conta como vazio", () => {
  const sha = "1234567890abcdef";
  const opcoes = (riscoAlto) => ({ arquivo: "validacao/1234567/qa.md", id: ID, sha, riscoAlto });
  const vazia = CABECALHO(sha) + CORPO({ "Tentativas de reprovar": "" });
  assert.ok(conferirRelatorio(vazia, opcoes(false)).some((p) => /"Tentativas de reprovar" está vazia/.test(p)));
  const soModelo = CABECALHO(sha) + CORPO({ "Tentativas de reprovar": "(o que você tentou quebrar e o que aconteceu; vazio invalida o relatório)" });
  assert.ok(conferirRelatorio(soModelo, opcoes(false)).some((p) => /"Tentativas de reprovar" está vazia/.test(p)));

  const semNaoVerificado = CABECALHO(sha) + CORPO({ "Não verificado": "" });
  assert.deepEqual(conferirRelatorio(semNaoVerificado, opcoes(false)), []);
  assert.ok(conferirRelatorio(semNaoVerificado, opcoes(true)).some((p) => /"Não verificado" está vazio em etapa de risco alto/.test(p)));

  // Herdado de rodada anterior: as duas seções podem vir curtas.
  const herdado = CABECALHO(sha, { herdado_de: "abc1234" }) + CORPO({ "Tentativas de reprovar": "", "Não verificado": "" });
  assert.deepEqual(conferirRelatorio(herdado, opcoes(true)), []);
});

test("corpoDaSecao: nula se a seção não existe, vazia se só tem espaço ou comentário de modelo", () => {
  assert.equal(corpoDaSecao("## A\ntexto\n## B\n", "A"), "texto");
  assert.equal(corpoDaSecao("## A\ntexto\n## B\n", "B"), "");
  assert.equal(corpoDaSecao("## A\n(comentário)\n\n## B\n", "A"), "");
  assert.equal(corpoDaSecao("## A\ntexto\n", "C"), null);
});

test("VEREDITO: rodada do topo no SHA, veredito legível e as três versões", () => {
  const sha = "1234567890abcdef";
  assert.deepEqual(conferirVeredito(VEREDITO_OK(sha), { sha }), []);
  assert.ok(conferirVeredito(VEREDITO_OK(sha), { sha: "fffffff0000000" }).some((p) => /valida "1234567"/.test(p)));
  assert.ok(conferirVeredito(VEREDITO_OK(sha).replace("| PASS |", "| TALVEZ |"), { sha }).some((p) => /não é PASS, FAIL nem BLOCKED/.test(p)));
  assert.ok(conferirVeredito(VEREDITO_OK(sha).replace("| aaaaaaa |", "| |"), { sha }).some((p) => /politica_validacao_sha/.test(p)));
  assert.ok(conferirVeredito(VEREDITO_OK(sha).replace("| mapa_impacto_sha ", "| outra_coluna ").replace("| bbbbbbb |", "| xx |"), { sha }).some((p) => /mapa_impacto_sha/.test(p)));
  assert.ok(conferirVeredito(VEREDITO_OK(sha).replace("| versao_gatekeeper |", "| versao |"), { sha }).some((p) => /versao_gatekeeper/.test(p)));
  assert.match(conferirVeredito("# VEREDITO\nveredito: PASS\n", { sha })[0], /não achei a tabela de rodadas/);
  // Rodada nova no topo: a antiga embaixo não conta.
  const duas = VEREDITO_OK(sha).replace("| 1 | 2026-10-08", "| 2 | 2026-10-09") + "| 1 | 2026-10-07 | fffffff | ausente | FAIL | aaaaaaa | bbbbbbb | ccccccc |\n";
  assert.deepEqual(conferirVeredito(duas, { sha }), []);
});

/* ---------- Repositório real: a E04 no 99390e0 ---------- */

test("repositório real: a E04 no 99390e0 (sem VEREDITO ainda)", () => {
  const res = conferirEvidencia({ id: "V2-F00-E04", sha: "99390e0", raiz: RAIZ_REAL });
  assert.deepEqual(nivel(res, "etapa"), ["OK"]);
  assert.deepEqual(nivel(res, "sha"), ["OK"]);
  assert.deepEqual(nivel(res, "pasta"), ["OK"]);
  assert.deepEqual(nivel(res, "indice"), ["OK"], "o INDEX.md da E04 bate com os arquivos");
  assert.deepEqual(nivel(res, "segredos"), ["OK"]);
  assert.deepEqual(nivel(res, "travessao"), ["OK"]);
  assert.deepEqual(nivel(res, "capturas"), ["OK"], "a E04 não é de interface");
  assert.deepEqual(nivel(res, "sonda"), ["OK"], "a E04 é de risco alto e tem sonda antes e depois");
  // O HEAD tem commits de política depois do 99390e0 (D-30, skills, mapa): a lista permitida reprova, e é o esperado.
  assert.deepEqual(nivel(res, "lista-permitida"), ["FALHA"]);
  assert.match(porCodigo(res, "lista-permitida")[0].mensagem, /99390e0\.\.HEAD toca \d+ arquivo/);
  assert.ok(res.falhas >= 1);
});

test("repositório real, --registro: a E04 ainda não tem relatórios nem VEREDITO", () => {
  const res = conferirEvidencia({ id: "V2-F00-E04", sha: "99390e0", registro: true, raiz: RAIZ_REAL });
  assert.deepEqual(nivel(res, "registro-relatorios"), ["FALHA"]);
  assert.deepEqual(nivel(res, "registro-veredito"), ["FALHA"]);
});

test("CLI: sai com 1 quando há FALHA, 2 para uso errado, e --json é JSON", () => {
  const r = executarCli("conferir-evidencia.mjs", ["V2-F00-E04", "--sha", "99390e0"]);
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /^Conferência de evidência de V2-F00-E04 no SHA 99390e0/);
  assert.match(r.saida, /OK\s+indice/);
  assert.match(r.saida, /FALHA lista-permitida/);
  assert.match(r.saida, /RESULTADO: \d+ FALHA/);

  const j = executarCli("conferir-evidencia.mjs", ["V2-F00-E04", "--sha=99390e0", "--json"]);
  assert.equal(j.codigo, 1);
  assert.equal(JSON.parse(j.saida).id, "V2-F00-E04");

  assert.equal(executarCli("conferir-evidencia.mjs", ["V2-F00-E04"]).codigo, 2);
  assert.equal(executarCli("conferir-evidencia.mjs", ["--sha", "99390e0"]).codigo, 2);
  assert.equal(executarCli("conferir-evidencia.mjs", ["V2-F00-E04", "--sha", "99390e0", "--x"]).codigo, 2);
});
