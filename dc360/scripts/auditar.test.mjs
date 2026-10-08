/**
 * Testa o portão `auditar.mjs` com saída sintética de `npm audit --json`.
 *
 * O portão chama `npm`, então o teste põe um `npm` falso na frente do PATH que
 * devolve o relatório combinado, sem rede e sem depender do estado real das
 * dependências. Fica sem teste o vencimento do prazo (`ate`), porque depende da
 * data do relógio.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(AQUI, "auditar.mjs");

let pasta;

before(() => {
  pasta = mkdtempSync(join(tmpdir(), "auditar-teste-"));
  writeFileSync(
    join(pasta, "npm.mjs"),
    `const cwd = process.cwd().replaceAll("\\\\", "/");
const f = JSON.parse(process.env.AUDITAR_FIXTURE);
const rel = cwd.endsWith("apps/campo") ? f.app
  : process.argv.includes("--omit=dev") ? f.runtime : f.tudo;
process.stdout.write(JSON.stringify(rel));
process.exit(Object.keys(rel.vulnerabilities ?? {}).length ? 1 : 0);
`,
  );
  writeFileSync(join(pasta, "npm.cmd"), '@node "%~dp0npm.mjs" %*\r\n');
  writeFileSync(join(pasta, "npm"), '#!/bin/sh\nexec node "$(dirname "$0")/npm.mjs" "$@"\n');
  chmodSync(join(pasta, "npm"), 0o755);
});

after(() => rmSync(pasta, { recursive: true, force: true }));

const limpo = { vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };

/** Relatório com um advisory PRÓPRIO (via com objeto) por pacote informado. */
function relatorio(pacotes) {
  const vulnerabilities = {};
  for (const [nome, fixAvailable] of Object.entries(pacotes)) {
    vulnerabilities[nome] = {
      name: nome, severity: "high", via: [{ title: `advisory de ${nome}`, severity: "high" }], fixAvailable,
    };
  }
  const total = Object.keys(vulnerabilities).length;
  return { vulnerabilities, metadata: { vulnerabilities: { total, high: total } } };
}

function rodar({ runtime = limpo, tudo = runtime, app = limpo }) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: pasta + delimiter + process.env.PATH,
      AUDITAR_FIXTURE: JSON.stringify({ runtime, tudo, app }),
    },
  });
  return { codigo: r.status, saida: r.stdout + r.stderr };
}

describe("auditar.mjs", () => {
  it("passa quando runtime e aplicativo estão limpos", () => {
    const { codigo, saida } = rodar({});
    assert.equal(codigo, 0, saida);
  });

  it("reprova vulnerabilidade de runtime", () => {
    const { codigo, saida } = rodar({ runtime: relatorio({ fastify: true }) });
    assert.equal(codigo, 1);
    assert.match(saida, /dependência de runtime/);
  });

  it("só avisa de vulnerabilidade apenas de desenvolvimento", () => {
    const { codigo, saida } = rodar({ tudo: relatorio({ vitest: false }) });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /apenas em ferramenta de/);
  });

  it("reprova advisory nova no aplicativo de campo", () => {
    const { codigo, saida } = rodar({ app: relatorio({ "pacote-novo": false }) });
    assert.equal(codigo, 1);
    assert.match(saida, /NOVA:\s+pacote-novo/);
  });

  it("aceita o nomeado, com dono e prazo na saída", () => {
    const { codigo, saida } = rodar({ app: relatorio({ "node-forge": false }) });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /aceita: node-forge \(dono .+, até \d{4}-\d{2}-\d{2}\)/);
  });

  it("reprova aceita que tem correção disponível e não está marcada como inaplicável", () => {
    const { codigo, saida } = rodar({ app: relatorio({ "decode-uri-component": true }) });
    assert.equal(codigo, 1);
    assert.match(saida, /correção já existe/);
  });

  it("tolera correção disponível quando a exceção é marcada como inaplicável (CP-03)", () => {
    const { codigo, saida } = rodar({ app: relatorio({ "brace-expansion": true }) });
    assert.equal(codigo, 0, saida);
  });
});
