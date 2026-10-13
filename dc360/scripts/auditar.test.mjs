/**
 * Testa o portão `auditar.mjs` com saída sintética de `npm audit --json`.
 *
 * O portão chama `npm`, então o teste põe um `npm` falso na frente do PATH que
 * devolve o relatório combinado, sem rede e sem depender do estado real das
 * dependências.
 *
 * O prazo (`ate`) depende do relógio, então o vencimento é provado de dois
 * jeitos sem mexer no relógio da máquina: a função pura recebe `hoje` por
 * argumento, e o teste de ponta a ponta roda uma CÓPIA do portão cuja lista de
 * exceções foi reescrita (prazo apagado, vencido, dono vazio), que é o que prova
 * que a validação está ligada ao `exit 1` e não só existe.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ACEITAS_EM_DESENVOLVIMENTO, ACEITAS_NO_APLICATIVO, problemasDasExcecoes } from "./auditar-excecoes.mjs";

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

  it("dev nomeado na lista (CP-03, D3 Q5) aparece como aceito, com dono e prazo, e não como 'precisa de dono'", () => {
    const { codigo, saida } = rodar({ tudo: relatorio({ vitest: false, tinypool: false }) });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /aceita \(desenvolvimento\): vitest \(dono Rafael, até 2027-01-05\)/);
    assert.match(saida, /aceita \(desenvolvimento\): tinypool/);
    assert.match(saida, /todas aceitas com dono e prazo/);
    assert.doesNotMatch(saida, /precisa de dono/);
  });

  it("dev que NÃO está na lista continua só avisando, mas diz o nome e que falta dono e prazo", () => {
    const { codigo, saida } = rodar({ tudo: relatorio({ vitest: false, "pacote-novo-de-teste": false }) });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /sem dono e prazo: pacote-novo-de-teste/);
    assert.match(saida, /aceita \(desenvolvimento\): vitest/);
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

describe("exceções do CP-03: nome, dono e prazo", () => {
  const boa = { motivo: "porque sim", dono: "Rafael", ate: "2027-01-05" };
  const HOJE = "2026-10-13";

  it("aceita exceção com motivo, dono e prazo no futuro", () => {
    assert.deepEqual(problemasDasExcecoes({ pacote: boa }, HOJE), []);
  });

  it("aceita exceção que vence hoje (o prazo vale até o fim do dia)", () => {
    assert.deepEqual(problemasDasExcecoes({ pacote: { ...boa, ate: HOJE } }, HOJE), []);
  });

  it("reprova exceção sem prazo", () => {
    const { ate, ...semPrazo } = boa;
    const p = problemasDasExcecoes({ pacote: semPrazo }, HOJE);
    assert.equal(p.length, 1);
    assert.match(p[0], /pacote.*sem prazo/);
  });

  it("reprova prazo em branco, fora do formato ou que não existe no calendário", () => {
    for (const ate of ["", "  ", "05/01/2027", "2027-1-5", "2027-02-30", "2027-13-01", "amanhã", 20270105, null]) {
      const p = problemasDasExcecoes({ pacote: { ...boa, ate } }, HOJE);
      assert.equal(p.length, 1, `prazo ${JSON.stringify(ate)} deveria reprovar`);
      assert.match(p[0], /pacote.*prazo/);
    }
  });

  it("reprova exceção sem dono ou com dono em branco", () => {
    for (const dono of [undefined, "", "   ", null]) {
      const p = problemasDasExcecoes({ pacote: { ...boa, dono } }, HOJE);
      assert.equal(p.length, 1);
      assert.match(p[0], /pacote.*sem dono/);
    }
  });

  it("reprova exceção sem motivo ou com motivo em branco", () => {
    for (const motivo of [undefined, "", "   "]) {
      const p = problemasDasExcecoes({ pacote: { ...boa, motivo } }, HOJE);
      assert.equal(p.length, 1);
      assert.match(p[0], /pacote.*sem motivo/);
    }
  });

  it("reprova exceção vencida e diz a data", () => {
    const p = problemasDasExcecoes({ pacote: { ...boa, ate: "2026-10-12" } }, HOJE);
    assert.equal(p.length, 1);
    assert.match(p[0], /pacote.*venceu em 2026-10-12/);
  });

  it("aponta todos os defeitos de uma vez, de todas as exceções", () => {
    const p = problemasDasExcecoes({ a: { motivo: "x" }, b: { ...boa, ate: "2020-01-01" } }, HOJE);
    assert.equal(p.length, 3); // a: sem dono e sem prazo; b: vencida
  });

  it("a lista REAL tem motivo, dono e prazo válidos e no futuro", () => {
    assert.ok(Object.keys(ACEITAS_NO_APLICATIVO).length > 0);
    const hoje = new Date().toISOString().slice(0, 10);
    assert.deepEqual(problemasDasExcecoes(ACEITAS_NO_APLICATIVO, hoje), []);
  });

  it("a lista REAL de desenvolvimento nomeia os três pacotes do vitest, com dono e prazo válidos", () => {
    assert.deepEqual(Object.keys(ACEITAS_EM_DESENVOLVIMENTO).sort(), ["@vitest/mocker", "tinypool", "vitest"]);
    const hoje = new Date().toISOString().slice(0, 10);
    assert.deepEqual(problemasDasExcecoes(ACEITAS_EM_DESENVOLVIMENTO, hoje), []);
  });
});

describe("auditar.mjs com a lista de exceções adulterada", () => {
  /** Copia o portão para uma pasta própria, com a lista reescrita por `alterar`. */
  function rodarCopia(alterar) {
    const raiz = mkdtempSync(join(tmpdir(), "auditar-copia-"));
    try {
      mkdirSync(join(raiz, "scripts"));
      mkdirSync(join(raiz, "apps", "campo"), { recursive: true });
      copyFileSync(SCRIPT, join(raiz, "scripts", "auditar.mjs"));
      const lista = readFileSync(join(AQUI, "auditar-excecoes.mjs"), "utf8").replaceAll("\r\n", "\n");
      const nova = alterar(lista);
      assert.notEqual(nova, lista, "a adulteração não mudou nada: o teste estaria mentindo");
      writeFileSync(join(raiz, "scripts", "auditar-excecoes.mjs"), nova);
      const r = spawnSync(process.execPath, [join(raiz, "scripts", "auditar.mjs")], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: pasta + delimiter + process.env.PATH,
          AUDITAR_FIXTURE: JSON.stringify({ runtime: limpo, tudo: limpo, app: relatorio({ "node-forge": false }) }),
        },
      });
      return { codigo: r.status, saida: r.stdout + r.stderr };
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }

  it("a cópia sem adulteração passa (controle do próprio teste)", () => {
    const { codigo, saida } = rodarCopia((t) => `${t}\n// controle\n`);
    assert.equal(codigo, 0, saida);
  });

  it("reprova a exceção sem prazo, mesmo que o pacote esteja no relatório", () => {
    const { codigo, saida } = rodarCopia((t) => t.replace(/(  "node-forge": \{[\s\S]*?dono: DONO), ate: PRAZO/, "$1"));
    assert.equal(codigo, 1, saida);
    assert.match(saida, /node-forge.*sem prazo/);
  });

  it("reprova a exceção sem dono", () => {
    const { codigo, saida } = rodarCopia((t) => t.replace(/(  "node-forge": \{[\s\S]*?)dono: DONO, /, "$1"));
    assert.equal(codigo, 1, saida);
    assert.match(saida, /node-forge.*sem dono/);
  });

  it("reprova a exceção vencida", () => {
    const { codigo, saida } = rodarCopia((t) => t.replace('const PRAZO = "2027-01-05"', 'const PRAZO = "2020-01-01"'));
    assert.equal(codigo, 1, saida);
    assert.match(saida, /venceu em 2020-01-01/);
  });
});
