/**
 * O lint roda em checkout com espaço no caminho (V2-F01-E17, correção 1).
 *
 * O `lint.mjs` chamava o `.cmd` do ESLint por `spawnSync` com `shell: true` e o
 * executável absoluto sem aspas: num checkout como `C:\Projetos\Defesa Civil\...`
 * o shell cortava o nome no espaço e tentava executar `C:\Projetos\Defesa`.
 * Agora chama `node` direto no script JS do ESLint, sem shell. Estes casos usam
 * um "ESLint" falso numa pasta COM ESPAÇO no nome, em qualquer sistema.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { comandoDoEslint, rodar } from "./lint.mjs";

const DC360 = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function checkoutFalso(codigoDeSaida = 0) {
  const base = mkdtempSync(join(tmpdir(), "lint com espaco-"));
  const raiz = join(base, "Defesa Civil", "dc360");
  const bin = join(raiz, "node_modules", "eslint", "bin");
  mkdirSync(bin, { recursive: true });
  const registro = join(base, "chamada.json");
  writeFileSync(
    join(bin, "eslint.js"),
    `require("node:fs").writeFileSync(${JSON.stringify(registro)}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\nprocess.exit(${codigoDeSaida});\n`,
  );
  return { base, raiz, registro };
}

describe("lint.mjs com espaço no caminho do checkout", () => {
  it("chama o node no script do ESLint, sem shell e sem o .cmd", () => {
    const { comando, args } = comandoDoEslint("C:/Projetos/Defesa Civil/dc360");
    assert.equal(comando, process.execPath);
    assert.equal(args.length, 1);
    assert.match(
      args[0].replaceAll("\\", "/"),
      /Defesa Civil\/dc360\/node_modules\/eslint\/bin\/eslint\.js$/,
    );
    assert.ok(!/\.cmd$/i.test(args[0]));
  });

  it("roda de verdade num caminho com espaço e repassa argumentos e cwd", () => {
    const { base, raiz, registro } = checkoutFalso(0);
    try {
      const codigo = rodar({ nome: "falso", cwd: raiz }, { raiz, stdio: "ignore" });
      assert.equal(codigo, 0);
      const visto = JSON.parse(readFileSync(registro, "utf8"));
      assert.deepEqual(visto.argv, ["."]);
      assert.match(visto.cwd.replaceAll("\\", "/"), /Defesa Civil\/dc360$/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("repassa --prune-suppressions e o código de saída do ESLint", () => {
    const { base, raiz, registro } = checkoutFalso(1);
    try {
      const codigo = rodar({ nome: "falso", cwd: raiz }, { raiz, podar: true, stdio: "ignore" });
      assert.equal(codigo, 1);
      assert.deepEqual(JSON.parse(readFileSync(registro, "utf8")).argv, [
        ".",
        "--prune-suppressions",
      ]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("ESLint ausente reprova com código 2, não passa em silêncio", () => {
    const base = mkdtempSync(join(tmpdir(), "lint sem eslint-"));
    try {
      assert.equal(rodar({ nome: "falso", cwd: base }, { raiz: base, stdio: "ignore" }), 2);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("o lint.mjs não usa mais shell nem o .cmd", () => {
    const fonte = readFileSync(join(DC360, "scripts", "lint.mjs"), "utf8");
    assert.doesNotMatch(fonte, /shell:\s*(true|process\.platform)/);
    assert.doesNotMatch(fonte, /\.cmd/);
  });
});
