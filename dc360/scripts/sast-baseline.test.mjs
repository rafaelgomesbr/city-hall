/**
 * A comparação com a baseline triada (V2-F01-E05): só achado NOVO de severidade
 * ERROR reprova, e achado antigo não vira novo por causa de linha que andou.
 *
 * Roda sem o Semgrep: usa JSON sintético no formato da saída `--json` dele.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compararComBaseline, idCurto, normalizarAchados } from "./sast-baseline.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

const ARQUIVO = [
  "const a = 1;",
  "const itens = await c.query(",
  "  `SELECT * FROM x ${onde}`,",
  "  params,",
  ");",
  "const outros = await c.query(",
  "  `SELECT * FROM x ${onde}`,",
  "  params,",
  ");",
];
const lerLinhas = () => ARQUIVO;

function achado(linha, extra = {}) {
  return {
    check_id: "semgrep.regras.dc360-sql-por-interpolacao",
    path: "dc360/apps/api/src/rotas/x.ts",
    start: { line: linha, col: 3 },
    end: { line: linha + 1, col: 4 },
    extra: { severity: "ERROR", lines: "requires login" },
    ...extra,
  };
}

test("o id da regra perde o prefixo do caminho da configuração", () => {
  assert.equal(idCurto("semgrep.regras.dc360-sql-por-interpolacao"), "dc360-sql-por-interpolacao");
  assert.equal(idCurto("dc360-sql-por-interpolacao"), "dc360-sql-por-interpolacao");
});

test("achados iguais em linhas diferentes têm impressão própria (a ordem entre eles), e a linha não entra nela", () => {
  const a = normalizarAchados({ results: [achado(3), achado(7)] }, lerLinhas);
  assert.equal(a.length, 2);
  assert.notEqual(a[0].id, a[1].id);
  assert.match(a[0].id, /#1$/);
  assert.match(a[1].id, /#2$/);
  assert.equal(a[0].id.split("#")[0], a[1].id.split("#")[0], "mesmo texto, mesma base");
});

test("a mesma regra vinda de dois pacotes entra uma vez só", () => {
  const dup = normalizarAchados({ results: [achado(3), achado(3, { check_id: "outro.pacote.dc360-sql-por-interpolacao" })] }, lerLinhas);
  assert.equal(dup.length, 1);
});

test("achado que já está na baseline não é novo; linha que andou também não", () => {
  const antes = normalizarAchados({ results: [achado(3)] }, lerLinhas);
  const baseline = { achados: [{ id: antes[0].id, regra: antes[0].regra, arquivo: antes[0].arquivo }] };

  const mesmo = compararComBaseline(antes, baseline);
  assert.equal(mesmo.novos.length, 0);
  assert.equal(mesmo.casados.length, 1);

  // O mesmo texto, 40 linhas abaixo: continua sendo o achado triado.
  const abaixo = Array.from({ length: 40 }, () => "// nada").concat(ARQUIVO);
  const movido = normalizarAchados({ results: [achado(43)] }, () => abaixo);
  assert.equal(compararComBaseline(movido, baseline).novos.length, 0);
});

test("achado NOVO (outro texto, outro arquivo ou segunda ocorrência) fica de fora da baseline", () => {
  const [antigo] = normalizarAchados({ results: [achado(3)] }, lerLinhas);
  const baseline = { achados: [{ id: antigo.id }] };

  // Primeira linha editada: a consulta mudou, alguém precisa olhar de novo.
  const editado = normalizarAchados({ results: [achado(3)] }, () => ["", "", "  `SELECT * FROM y ${onde}`,"]);
  assert.equal(compararComBaseline(editado, baseline).novos.length, 1);

  // Outro arquivo.
  const outro = normalizarAchados({ results: [achado(3, { path: "dc360/apps/api/src/rotas/novo.ts" })] }, lerLinhas);
  assert.equal(compararComBaseline(outro, baseline).novos.length, 1);

  // Segunda ocorrência idêntica no mesmo arquivo: o triado era UM.
  const duas = normalizarAchados({ results: [achado(3), achado(7)] }, lerLinhas);
  const r = compararComBaseline(duas, baseline);
  assert.equal(r.casados.length, 1);
  assert.equal(r.novos.length, 1);
});

test("entrada da baseline que o Semgrep já não encontra é listada como obsoleta", () => {
  const r = compararComBaseline([], { achados: [{ id: "x#1", regra: "r", arquivo: "f.ts" }] });
  assert.equal(r.obsoletas.length, 1);
});

// ---- a linha de comando, ponta a ponta ------------------------------------------

function rodar(json) {
  const pasta = mkdtempSync(join(tmpdir(), "sast-baseline-"));
  const arquivo = join(pasta, "semgrep.json");
  writeFileSync(arquivo, JSON.stringify(json));
  // cwd na raiz do repositório, como no workflow; a baseline real é lida do disco.
  return spawnSync(process.execPath, [join(AQUI, "sast-baseline.mjs"), "conferir", arquivo], {
    cwd: resolve(AQUI, "..", ".."), encoding: "utf8",
  });
}

test("CLI: varredura sem nenhum achado aprova (e avisa as entradas obsoletas)", () => {
  const r = rodar({ results: [], errors: [] });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Aprovado/);
});

test("CLI: achado ERROR novo reprova com código 1 e diz onde", () => {
  const r = rodar({
    results: [achado(1, { path: "dc360/apps/api/src/rotas/inexistente.ts", check_id: "semgrep.regras.dc360-organizacao-lida-da-requisicao" })],
    errors: [],
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /NOVO ERROR: dc360-organizacao-lida-da-requisicao em dc360\/apps\/api\/src\/rotas\/inexistente\.ts:1/);
});

test("CLI: achado novo de severidade WARNING avisa e não reprova", () => {
  const r = rodar({
    results: [achado(1, { path: "dc360/apps/api/src/rotas/inexistente.ts", extra: { severity: "WARNING" } })],
    errors: [],
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /aviso \(não reprova\)/);
});

test("CLI: análise com erro do Semgrep reprova (sem leitura confiável não há aprovação)", () => {
  const r = rodar({ results: [], errors: [{ level: "error", message: "Rule parse error" }] });
  assert.equal(r.status, 2, r.stdout + r.stderr);
});
