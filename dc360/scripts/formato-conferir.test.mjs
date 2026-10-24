/**
 * A formatação com baseline que só desce (V2-F01-E17).
 *
 * Usa um diretório temporário com um `.prettierrc.json` próprio, para não
 * depender de quais arquivos do repositório estão ou não formatados hoje.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARQUIVO_DA_BASELINE,
  compararComBaseline,
  ehCodigo,
  listarMalFormatados,
} from "./formato-conferir.mjs";

const DC360 = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("quais arquivos o Prettier olha", () => {
  it("código e estilo entram; lockfile, markdown e imagem não", () => {
    for (const c of ["a.ts", "b.tsx", "c.mjs", "d.js", "e.cjs", "f.css"]) assert.ok(ehCodigo(c), c);
    for (const c of ["package-lock.json", "README.md", "logo.png", "x.sql"])
      assert.ok(!ehCodigo(c), c);
  });
});

describe("a comparação com a baseline", () => {
  it("tudo na baseline passa", () => {
    assert.deepEqual(compararComBaseline(["a.ts", "b.ts"], ["a.ts", "b.ts"]), {
      novos: [],
      obsoletos: [],
    });
  });

  it("arquivo mal formatado fora da baseline é novo (reprova)", () => {
    assert.deepEqual(compararComBaseline(["a.ts", "novo.ts"], ["a.ts"]).novos, ["novo.ts"]);
  });

  it("arquivo da baseline que já está formatado é obsoleto (a lista só desce)", () => {
    assert.deepEqual(compararComBaseline(["a.ts"], ["a.ts", "limpo.ts"]).obsoletos, ["limpo.ts"]);
  });
});

describe("o Prettier de verdade, numa pasta temporária", () => {
  let raiz;
  before(() => {
    raiz = mkdtempSync(join(tmpdir(), "formato-"));
    writeFileSync(join(raiz, ".prettierrc.json"), JSON.stringify({ printWidth: 100 }));
    writeFileSync(join(raiz, ".prettierignore"), "gerado/\n");
    mkdirSync(join(raiz, "gerado"));
    writeFileSync(join(raiz, "formatado.ts"), "export const a = { b: 1 };\n");
    writeFileSync(join(raiz, "torto.ts"), "export const a={b:1}\n");
    writeFileSync(join(raiz, "gerado", "torto.ts"), "export const a={b:1}\n");
  });
  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("só o arquivo fora do padrão e fora do .prettierignore é apontado", async () => {
    const ruins = await listarMalFormatados(["formatado.ts", "torto.ts", "gerado/torto.ts"], raiz);
    assert.deepEqual(ruins, ["torto.ts"]);
  });

  it("depois de formatado, o arquivo some da lista", async () => {
    const abs = join(raiz, "torto.ts");
    writeFileSync(abs, "export const a = { b: 1 };\n");
    assert.deepEqual(await listarMalFormatados(["torto.ts"], raiz), []);
    writeFileSync(abs, "export const a={b:1}\n");
  });
});

describe("o repositório", () => {
  const baseline = JSON.parse(readFileSync(join(DC360, ARQUIVO_DA_BASELINE), "utf8"));

  it("a baseline de formatação está em ordem, sem repetição e com caminhos que existem", () => {
    const lista = baseline.arquivos;
    assert.deepEqual(lista, [...lista].sort());
    assert.equal(new Set(lista).size, lista.length);
    for (const a of lista) {
      assert.ok(ehCodigo(a), `${a} não é código`);
      assert.doesNotThrow(() => readFileSync(join(DC360, a)), `${a} não existe`);
    }
  });

  it("o próprio mecanismo de lint e de formatação nasce formatado (não está na baseline)", () => {
    for (const a of [
      "eslint.base.mjs",
      "eslint.config.mjs",
      "scripts/lint.mjs",
      "scripts/lint-teto.mjs",
      "scripts/formato-conferir.mjs",
    ]) {
      assert.ok(!baseline.arquivos.includes(a), `${a} devia estar formatado`);
    }
  });
});
