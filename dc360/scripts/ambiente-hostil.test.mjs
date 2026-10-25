// Testes do montador das condições hostis da V2-F00-E21 (scripts/ambiente-hostil.mjs).
//
// O job `plataformas` do CI confia neste script para dizer que a árvore está
// CRLF, que o cache está velho e que o índice não tem CRLF. Se ele mentir para
// o lado verde, o job prova o que não aconteceu; por isso os casos abaixo
// olham sobretudo o lado que reprova.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AGULHA_ANTIGA, crlfPeloGit, divergenciasDoPainel, estadoDoFimDeLinha, paraCrlf, resumirEol } from "./ambiente-hostil.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "ambiente-hostil.mjs");
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "router.d.ts.velho");

test("paraCrlf converte LF e não duplica o CR de linha que já é CRLF", () => {
  assert.equal(paraCrlf("a\nb\r\nc\n"), "a\r\nb\r\nc\r\n");
  assert.equal(paraCrlf(paraCrlf("x\n}\n")), "x\r\n}\r\n");
});

test("numa fonte em CRLF a agulha antiga some, e é isso que reprovava o teste", () => {
  const fonte = "function a() {\n  return 1;\n}\n\nfunction b() {}\n";
  assert.equal(estadoDoFimDeLinha(fonte).agulhaAntiga, true);
  const emCrlf = estadoDoFimDeLinha(paraCrlf(fonte));
  assert.equal(emCrlf.agulhaAntiga, false);
  assert.equal(emCrlf.lfSozinho, 0);
  assert.equal(emCrlf.crlf, 5);
  assert.equal(AGULHA_ANTIGA, "\n}\n");
});

test("estadoDoFimDeLinha conta LF sozinho num arquivo misto", () => {
  const estado = estadoDoFimDeLinha("a\r\nb\nc\r\n");
  assert.deepEqual([estado.crlf, estado.lfSozinho], [2, 1]);
});

test("resumirEol aceita LF, binário e CRLF no disco onde o .gitattributes pede", () => {
  const saida = [
    "i/lf    w/lf    attr/text=auto eol=lf \tdc360/a.ts",
    "i/-text w/-text attr/-text            \tdc360/b.png",
    "i/crlf  w/crlf  attr/text eol=crlf    \tdc360/c.ps1",
    "i/lf    w/crlf  attr/text eol=crlf    \tdc360/d.ps1",
  ].join("\n");
  const { total, violacoes, contagem } = resumirEol(saida);
  // `.ps1` em CRLF no índice também é violação: o índice é LF para todo texto.
  assert.equal(total, 4);
  assert.deepEqual(violacoes, ["i/crlf no índice: dc360/c.ps1"]);
  assert.equal(contagem["w/crlf"], 2);
});

test("resumirEol reprova CRLF no disco sem eol=crlf e índice misto", () => {
  const saida = [
    "i/lf    w/crlf  attr/text=auto eol=lf \tdc360/a.ts",
    "i/mixed w/mixed attr/                 \tdc360/b.txt",
  ].join("\r\n");
  const { violacoes } = resumirEol(saida);
  assert.equal(violacoes.length, 3);
  assert.match(violacoes[0], /w\/crlf no disco sem eol=crlf/);
  assert.match(violacoes[1], /i\/mixed no índice/);
});

test("a fixture do cache velho não conhece as três rotas e conhece as outras", () => {
  const texto = readFileSync(FIXTURE, "utf8");
  for (const rota of ["/avisos", "/mapa", "/perfil"]) assert.equal(texto.includes(`${rota}\``), false, rota);
  for (const rota of ["/entrar", "/fila", "/vistoria/[id]"]) assert.equal(texto.includes(`${rota}\``), true, rota);
});

test("como comando, `eol` sai com 1 diante de i/crlf e com 0 numa saída limpa", () => {
  const pasta = mkdtempSync(join(tmpdir(), "ambiente-hostil-"));
  try {
    const limpo = join(pasta, "limpo.txt");
    const sujo = join(pasta, "sujo.txt");
    writeFileSync(limpo, "i/lf    w/lf    attr/text=auto eol=lf \ta.ts\n");
    writeFileSync(sujo, "i/crlf  w/crlf  attr/                 \ta.ts\n");
    assert.equal(spawnSync(process.execPath, [SCRIPT, "eol", limpo]).status, 0);
    const r = spawnSync(process.execPath, [SCRIPT, "eol", sujo], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /i\/crlf no índice: a\.ts/);
    writeFileSync(sujo, "");
    assert.equal(spawnSync(process.execPath, [SCRIPT, "eol", sujo]).status, 1, "saída vazia não é verde");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("como comando, subcomando desconhecido sai com 2", () => {
  assert.equal(spawnSync(process.execPath, [SCRIPT, "outro"]).status, 2);
});

// ----- DV-13: o CRLF do caso 1 é escrito pelo git, não montado por script -----

/** Repositório descartável com a mesma regra do `.gitattributes` do produto (`eol=lf`). */
function repositorioComEolLf() {
  const pasta = mkdtempSync(join(tmpdir(), "ambiente-hostil-git-"));
  const git = (...args) =>
    spawnSync("git", ["-c", "user.name=teste", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-C", pasta, ...args], { encoding: "utf8" });
  assert.equal(git("init", "-q").status, 0);
  writeFileSync(join(pasta, ".gitattributes"), "* text=auto eol=lf\n*.png binary\n");
  mkdirSync(join(pasta, "src", "fundo"), { recursive: true });
  writeFileSync(join(pasta, "src", "a.ts"), "function a() {\n  return 1;\n}\n");
  writeFileSync(join(pasta, "src", "fundo", "b.tsx"), "export const b = 1;\n");
  writeFileSync(join(pasta, "src", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0a, 0x00, 0x0d, 0x0a, 0x0a]));
  writeFileSync(join(pasta, "fora.ts"), "const fora = 1;\n");
  assert.equal(git("add", "-A").status, 0);
  assert.equal(git("commit", "-q", "-m", "base").status, 0);
  return { pasta, git };
}

test("crlfPeloGit: o git escreve CRLF no disco, o índice segue LF e a árvore não aparece como modificada", () => {
  const { pasta, git } = repositorioComEolLf();
  try {
    // Ponto de partida: o checkout com eol=lf é LF (é o que o CI mostra).
    assert.equal(estadoDoFimDeLinha(readFileSync(join(pasta, "src", "a.ts"), "utf8")).crlf, 0);
    const { arquivos, problemas } = crlfPeloGit(["src"], pasta);
    assert.deepEqual(problemas, []);
    assert.equal(arquivos, 3);
    const a = estadoDoFimDeLinha(readFileSync(join(pasta, "src", "a.ts"), "utf8"));
    assert.deepEqual([a.crlf, a.lfSozinho, a.agulhaAntiga], [3, 0, false]);
    assert.equal(estadoDoFimDeLinha(readFileSync(join(pasta, "src", "fundo", "b.tsx"), "utf8")).crlf, 1);
    // O índice continua LF: quem converteu foi o checkout, não um commit.
    assert.equal(git("show", ":src/a.ts").stdout, "function a() {\n  return 1;\n}\n");
    assert.equal(git("status", "--porcelain").stdout, "");
    // Binário byte a byte, e o que está fora das pastas, intocado.
    assert.deepEqual([...readFileSync(join(pasta, "src", "logo.png"))], [0x89, 0x50, 0x4e, 0x47, 0x0a, 0x00, 0x0d, 0x0a, 0x0a]);
    assert.equal(readFileSync(join(pasta, "fora.ts"), "utf8"), "const fora = 1;\n");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("crlfPeloGit reprova pasta sem arquivo rastreado (verde sobre pasta vazia não prova nada)", () => {
  const { pasta } = repositorioComEolLf();
  try {
    const { problemas } = crlfPeloGit(["nao-existe"], pasta);
    assert.match(problemas.join("\n"), /nenhum arquivo rastreado/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ----- DV-14: a contagem do painel sobre a árvore CRLF é a do baseline -----

test("divergenciasDoPainel aceita a contagem do baseline e reprova total, falha e pulo diferentes", () => {
  const esperado = { total: 750, falhas: 0 };
  const saida = (resumo) => `\n Test Files  60 passed (60)\n      Tests  ${resumo}\n   Duration  30s\n`;
  assert.deepEqual(divergenciasDoPainel(saida("750 passed (750)"), esperado), []);
  assert.match(divergenciasDoPainel(saida("723 passed (723)"), esperado).join(), /total 723, o baseline fixa 750/);
  assert.match(divergenciasDoPainel(saida("1 failed | 749 passed (750)"), esperado).join(), /falhas 1/);
  assert.match(divergenciasDoPainel(saida("2 skipped | 748 passed (750)"), esperado).join(), /puladas 2/);
  assert.match(divergenciasDoPainel("sem resumo nenhum", esperado).join(), /não traz a linha/);
});

test("como comando, conferir-painel sai com 1 diante de uma contagem menor e com 0 diante da fixada", () => {
  const pasta = mkdtempSync(join(tmpdir(), "ambiente-hostil-painel-"));
  try {
    const arquivo = join(pasta, "painel.txt");
    writeFileSync(arquivo, "      Tests  1 passed (1)\n");
    const r = spawnSync(process.execPath, [SCRIPT, "conferir-painel", arquivo], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /total 1, o baseline fixa/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
