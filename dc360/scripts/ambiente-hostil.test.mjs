// Testes do montador das condições hostis da V2-F00-E21 (scripts/ambiente-hostil.mjs).
//
// O job `plataformas` do CI confia neste script para dizer que a árvore está
// CRLF, que o cache está velho e que o índice não tem CRLF. Se ele mentir para
// o lado verde, o job prova o que não aconteceu; por isso os casos abaixo
// olham sobretudo o lado que reprova.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AGULHA_ANTIGA, estadoDoFimDeLinha, paraCrlf, resumirEol } from "./ambiente-hostil.mjs";

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
