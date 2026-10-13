import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  analisarTexto,
  conferirMarca,
  descreverContagem,
  hojeIso,
  PRAZO_MAXIMO_EM_DIAS,
  varrerArvore,
} from "./portao-de-skip.mjs";

/**
 * O portão de skip da política T42. Os casos sintéticos montam o texto linha a
 * linha com aspas de propósito: uma linha que COMEÇA com `it.skip(` seria lida
 * pelo próprio varredor quando ele varre este arquivo.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOJE = "2026-10-05";
const texto = (...linhas) => linhas.join("\n");
const MARCA = "// T42 dono=rafael issue=V2-F00-E04 ate=2026-10-10";

// ---- A árvore de verdade ---------------------------------------------------

const arvore = varrerArvore(RAIZ, hojeIso());
console.log(descreverContagem(arvore));

test("a árvore atual passa no portão: nenhum skip sem marca, vencido ou .only", () => {
  assert.deepEqual(arvore.problemas, []);
  assert.ok(arvore.arquivos > 100, `varreu só ${arvore.arquivos} arquivos: as pastas estão certas?`);
});

test("a vigência da escrita voltou a rodar: o skip da E04 saiu e nenhum skip incondicional resta", () => {
  // A marca T42 da vigência apontava para a V2-F00-E04, que tirou o describe.skip.
  // Se alguém pular de novo, o portão exige marca nova, e este teste lembra por quê.
  assert.equal(
    arvore.marcados.find((m) => m.arquivo === "apps/api/test/vigencia-na-escrita.test.ts"),
    undefined,
    "a vigência da escrita não pode voltar a ficar pulada",
  );
  assert.equal(arvore.marcados.length, 0, "nenhum skip incondicional marcado deve restar na árvore");
});

test("a contagem por ambiente lista os runIf de busca e os skip de entitlements e de som", () => {
  assert.equal(arvore.ambientePorArquivo["db/test/busca.test.ts"], 3);
  assert.ok(arvore.ambientePorArquivo["scripts/entitlements-do-ios.test.mjs"] >= 1);
  assert.ok(arvore.ambientePorArquivo["scripts/som-de-despacho.test.mjs"] >= 1);
});

// ---- Casos negativos -------------------------------------------------------

test("it.skip sem marca reprova", () => {
  const r = analisarTexto(texto('it.skip("x", () => {});'), HOJE);
  assert.equal(r.problemas.length, 1);
  assert.match(r.problemas[0].motivo, /sem a marca/);
});

test("skip, todo, xit, xdescribe e t.skip incondicionais sem marca reprovam", () => {
  for (const linha of [
    'test.skip("x", () => {});',
    'describe.skip("x", () => {});',
    'it.skip.each([1])("x", () => {});',
    'it.todo("x");',
    'xit("x", () => {});',
    'xdescribe("x", () => {});',
    'test("x", { skip: true }, () => {});',
    'test("x", { todo: "depois" }, () => {});',
  ]) {
    assert.equal(analisarTexto(linha, HOJE).problemas.length, 1, linha);
  }
});

test("marca sem dono, sem issue ou sem ate reprova", () => {
  for (const [marca, faltando] of [
    ["// T42 issue=V2-F00-E04 ate=2026-10-10", "dono"],
    ["// T42 dono=rafael ate=2026-10-10", "issue"],
    ["// T42 dono=rafael issue=V2-F00-E04", "ate"],
  ]) {
    const r = analisarTexto(texto(marca, 'it.skip("x", () => {});'), HOJE);
    assert.equal(r.problemas.length, 1, marca);
    assert.match(r.problemas[0].motivo, new RegExp(`sem \`${faltando}=\``));
  }
});

test("marca com ate no passado reprova, e ate igual a hoje ainda vale", () => {
  const vencida = analisarTexto(texto("// T42 dono=rafael issue=V2-F00-E04 ate=2026-10-04", 'it.skip("x", () => {});'), HOJE);
  assert.match(vencida.problemas[0].motivo, /vencida/);
  const hoje = analisarTexto(texto("// T42 dono=rafael issue=V2-F00-E04 ate=2026-10-05", 'it.skip("x", () => {});'), HOJE);
  assert.deepEqual(hoje.problemas, []);
});

test("marca com prazo além do máximo, ou com data que não existe, reprova", () => {
  const longa = analisarTexto(texto("// T42 dono=rafael issue=V2-F00-E04 ate=2027-01-01", 'it.skip("x", () => {});'), HOJE);
  assert.match(longa.problemas[0].motivo, new RegExp(`máximo é ${PRAZO_MAXIMO_EM_DIAS}`));
  const falsa = analisarTexto(texto("// T42 dono=rafael issue=V2-F00-E04 ate=2026-02-30", 'it.skip("x", () => {});'), HOJE);
  assert.match(falsa.problemas[0].motivo, /não é uma data/);
});

test("it.only reprova mesmo com marca válida, em it, test, describe e fit", () => {
  for (const linha of ['it.only("x", () => {});', 'describe.only("x", () => {});', 'test.concurrent.only("x", () => {});', 'fit("x", () => {});']) {
    const r = analisarTexto(texto(MARCA, linha), HOJE);
    assert.equal(r.problemas.length, 1, linha);
    assert.match(r.problemas[0].motivo, /\.only/);
  }
});

test("a marca precisa estar na linha imediatamente acima", () => {
  const r = analisarTexto(texto(MARCA, "", 'it.skip("x", () => {});'), HOJE);
  assert.equal(r.problemas.length, 1);
});

test("skip por opção sem condição e sem motivo textual reprova", () => {
  const r = analisarTexto(texto('test("x", { skip: !existsSync(PASTA) }, () => {});'), HOJE);
  assert.equal(r.problemas.length, 1);
  assert.deepEqual(r.ambiente, []);
});

// ---- Casos positivos -------------------------------------------------------

test("describe.skip com marca dentro do prazo passa e aparece como marcado", () => {
  const r = analisarTexto(texto(MARCA, 'describe.skip("x", () => {});'), HOJE);
  assert.deepEqual(r.problemas, []);
  assert.equal(r.marcados.length, 1);
  assert.equal(r.marcados[0].issue, "V2-F00-E04");
});

test("skip por ambiente (runIf, skipIf e skip com condição e motivo) passa e é contado", () => {
  const r = analisarTexto(
    texto(
      'it.runIf(comTrigramas)("a", async () => {});',
      'it.skipIf(!comTrigramas)("b", async () => {});',
      'test("c", { skip: !existsSync(ARQUIVO) && "sem o arquivo" }, () => {});',
      'test("d", { skip: windows ? "só no Linux" : false }, () => {});',
      'test("e", { skip: false }, () => {});',
    ),
    HOJE,
  );
  assert.deepEqual(r.problemas, []);
  assert.equal(r.ambiente.length, 4);
});

test("comentário, bloco de comentário e texto entre aspas não disparam falso positivo", () => {
  const r = analisarTexto(
    texto(
      "// it.skip(\"x\") aparece só em comentário",
      "/*",
      " it.only(\"x\")",
      "*/",
      " * describe.skip(\"x\") na margem de um bloco",
      "const exemplo = 'it.only(\"y\")';",
      '"it.skip(\\"z\\")",',
    ),
    HOJE,
  );
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.ambiente, []);
});

test("o fim de linha CRLF não atrapalha a leitura da marca", () => {
  const r = analisarTexto([MARCA, 'describe.skip("x", () => {});'].join("\r\n"), HOJE);
  assert.deepEqual(r.problemas, []);
});

test("conferirMarca aceita o limite exato do prazo e rejeita um dia a mais que a folga de fuso", () => {
  assert.equal(conferirMarca("// T42 dono=a issue=b ate=2026-10-09", HOJE).ok, true);
  assert.equal(conferirMarca("// T42 dono=a issue=b ate=2026-10-10", HOJE).ok, true);
  assert.equal(conferirMarca("// T42 dono=a issue=b ate=2026-10-11", HOJE).ok, true);
  assert.equal(conferirMarca("// T42 dono=a issue=b ate=2026-10-12", HOJE).ok, false);
});

// ---- Em disco --------------------------------------------------------------

test("a varredura em disco acha o skip sem marca de um arquivo sintético e ignora node_modules", () => {
  const pasta = mkdtempSync(join(tmpdir(), "portao-skip-"));
  try {
    mkdirSync(join(pasta, "scripts"), { recursive: true });
    mkdirSync(join(pasta, "scripts", "node_modules", "lib"), { recursive: true });
    mkdirSync(join(pasta, "apps", "api", "test"), { recursive: true });
    writeFileSync(join(pasta, "scripts", "feio.test.mjs"), 'it.skip("sem dono", () => {});\n');
    writeFileSync(join(pasta, "scripts", "node_modules", "lib", "ignorado.test.mjs"), 'it.skip("de terceiro", () => {});\n');
    writeFileSync(join(pasta, "apps", "api", "test", "ok.test.ts"), `${MARCA}\r\ndescribe.skip("marcado", () => {});\r\n`);
    const r = varrerArvore(pasta, HOJE);
    assert.equal(r.arquivos, 2);
    assert.equal(r.problemas.length, 1);
    assert.equal(r.problemas[0].arquivo, "scripts/feio.test.mjs");
    assert.equal(r.problemas[0].linha, 1);
    assert.equal(r.marcados.length, 1);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
