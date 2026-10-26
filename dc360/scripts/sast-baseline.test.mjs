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
import {
  classificarErrosDeAnalise, compararComBaseline, idCurto, normalizarAchados,
  PISO_DE_ARQUIVOS_ANALISADOS, PISO_NA_PASTA_DAS_REGRAS_PROPRIAS, problemasDeCobertura,
} from "./sast-baseline.mjs";

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

/** Uma análise que examinou arquivos de verdade: o que o Semgrep escreve em `paths.scanned`. */
function arquivosAnalisados(n = 72) {
  return { scanned: Array.from({ length: n }, (_, i) => `dc360/apps/api/src/rotas/arquivo-${i}.ts`) };
}

function rodar(json, { semCobertura = false, argumentos = [] } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "sast-baseline-"));
  const arquivo = join(pasta, "semgrep.json");
  writeFileSync(arquivo, JSON.stringify(semCobertura || json.paths !== undefined ? json : { ...json, paths: arquivosAnalisados() }));
  // cwd na raiz do repositório, como no workflow; a baseline real é lida do disco.
  return spawnSync(process.execPath, [join(AQUI, "sast-baseline.mjs"), "conferir", ...argumentos, arquivo], {
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

// ---- DV-16: erro de análise de nível `warn` também deixa arquivo sem leitura ----
//
// O formato abaixo é o que o Semgrep 1.136.0 escreveu de verdade para um arquivo
// com erro de sintaxe em dc360/apps/api/src (evidência da DV-16): nível `warn`,
// código de saída 0, e a regra não rodou nesse arquivo.

const ERRO_DE_SINTAXE = {
  code: 3,
  level: "warn",
  type: "Syntax error",
  message: "Syntax error at line dc360/apps/api/src/rotas/x.ts:1:\n `export function f(req: any) {\n  const x = ;;; { {` was unexpected",
  path: "dc360/apps/api/src/rotas/x.ts",
};

test("DV-16: erro de sintaxe (warn) em dc360/apps/api/src reprova, e a mensagem não despeja o código", () => {
  const r = rodar({ results: [], errors: [ERRO_DE_SINTAXE] });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /\[warn\] Syntax error em dc360\/apps\/api\/src\/rotas\/x\.ts/);
  assert.doesNotMatch(r.stderr, /const x = ;;;/, "só a primeira linha da mensagem");
});

test("DV-16: parse parcial e tempo esgotado (type em lista, nível warn) em api/src também reprovam", () => {
  const parcial = { level: "warn", type: ["PartialParsing", [{ file: "x" }]], message: "Partial parsing error", path: "dc360/apps/api/src/a.ts" };
  const tempo = { level: "warn", type: ["Timeout", "dc360-regra"], message: "Timeout", path: "dc360/apps/api/src/b.ts" };
  const r = rodar({ results: [], errors: [parcial, tempo] });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /PartialParsing em dc360\/apps\/api\/src\/a\.ts/);
  assert.match(r.stderr, /Timeout em dc360\/apps\/api\/src\/b\.ts/);
});

test("DV-16: erro warn fora de api/src é listado como aviso e não reprova; sem caminho reprova", () => {
  const fora = rodar({ results: [], errors: [{ ...ERRO_DE_SINTAXE, path: "dc360/packages/shared/src/y.ts" }] });
  assert.equal(fora.status, 0, fora.stdout + fora.stderr);
  assert.match(fora.stdout, /erro de análise fora de dc360\/apps\/api\/src\/ \(não reprova\): \[warn\] Syntax error em dc360\/packages\/shared\/src\/y\.ts/);
  const semCaminho = rodar({ results: [], errors: [{ level: "warn", type: "Syntax error", message: "x" }] });
  assert.equal(semCaminho.status, 2, semCaminho.stdout + semCaminho.stderr);
});

test("DV-16: classificarErrosDeAnalise separa bloqueantes e avisos e aceita lista vazia ou ausente", () => {
  assert.deepEqual(classificarErrosDeAnalise(undefined), { bloqueantes: [], avisos: [] });
  assert.deepEqual(classificarErrosDeAnalise([]), { bloqueantes: [], avisos: [] });
  const c = classificarErrosDeAnalise([
    ERRO_DE_SINTAXE,
    { ...ERRO_DE_SINTAXE, path: "./dc360/apps/api/src/c.ts" },
    { level: "error", type: "Fatal", message: "m", path: "mockup/z.js" },
    { level: "warn", type: "Syntax error", message: "m", path: "dc360/apps/campo/App.tsx" },
  ]);
  assert.equal(c.bloqueantes.length, 3);
  assert.deepEqual(c.avisos.map((a) => a.caminho), ["dc360/apps/campo/App.tsx"]);
});

// ---- correção 1 da F01 (E05): impressão do achado inteiro e análise que não leu nada --------

test("a impressão cobre o trecho INTEIRO do achado: mudança na segunda linha da consulta reabre o achado", () => {
  const original = ["const itens = await c.query(", "  `SELECT * FROM x", "     WHERE a = $1", "  `,", "  [a],", ");"];
  const achadoMultilinha = { ...achado(2), end: { line: 4, col: 4 } };
  const [antes] = normalizarAchados({ results: [achadoMultilinha] }, () => original);
  const [mesma] = normalizarAchados({ results: [achadoMultilinha] }, () => [...original]);
  assert.equal(mesma.id, antes.id, "texto igual, mesmo id");

  // A primeira linha é a mesma; a parte perigosa entrou numa linha posterior.
  const mutada = [...original];
  mutada[2] = "     WHERE a = '" + "${entrada}" + "'";
  const [depois] = normalizarAchados({ results: [achadoMultilinha] }, () => mutada);
  assert.equal(depois.trecho, antes.trecho, "a primeira linha não mudou (era a única que entrava na impressão)");
  assert.notEqual(depois.id, antes.id, "mudança posterior numa consulta multilinha tem de gerar id novo");
  assert.equal(compararComBaseline([depois], { achados: [{ id: antes.id }] }).novos.length, 1);

  // Indentação e espaços repetidos continuam não contando; a linha que andou também não.
  const reindentada = ["", ...original.map((l) => "    " + l.trim().replace(/ /g, "  "))];
  const [movida] = normalizarAchados({ results: [{ ...achadoMultilinha, start: { line: 3, col: 5 }, end: { line: 5, col: 8 } }] }, () => reindentada);
  assert.equal(movida.id, antes.id);
});

test("sem a posição final do achado a impressão cai na linha inicial (nunca quebra)", () => {
  const semFim = achado(3);
  delete semFim.end;
  const [a] = normalizarAchados({ results: [semFim] }, lerLinhas);
  assert.match(a.id, /#1$/);
});

test("problemasDeCobertura: análise sem arquivo examinado, ausente ou abaixo do piso reprova", () => {
  assert.deepEqual(problemasDeCobertura({ paths: arquivosAnalisados(72) }), []);
  assert.match(problemasDeCobertura({ paths: { scanned: [] } }).join("|"), /nenhum arquivo/);
  assert.match(problemasDeCobertura({}).join("|"), /paths\.scanned/);
  assert.match(problemasDeCobertura({ paths: { scanned: "x" } }).join("|"), /paths\.scanned/);
  assert.match(problemasDeCobertura({ paths: arquivosAnalisados(PISO_DE_ARQUIVOS_ANALISADOS - 1) }).join("|"), /piso/);
  assert.deepEqual(problemasDeCobertura({ paths: arquivosAnalisados(PISO_DE_ARQUIVOS_ANALISADOS) }), []);
  // Muitos arquivos, nenhum na pasta onde as regras próprias valem: exclusão excessiva.
  const fora = { scanned: Array.from({ length: 200 }, (_, i) => `dc360/packages/shared/src/x-${i}.ts`) };
  const p = problemasDeCobertura({ paths: fora }).join("|");
  assert.match(p, /em dc360\/apps\/api\/src\//);
  const poucosNaPasta = { scanned: [
    ...Array.from({ length: PISO_NA_PASTA_DAS_REGRAS_PROPRIAS - 1 }, (_, i) => `dc360/apps/api/src/a-${i}.ts`),
    ...Array.from({ length: 100 }, (_, i) => `dc360/packages/shared/src/x-${i}.ts`),
  ] };
  assert.match(problemasDeCobertura({ paths: poucosNaPasta }).join("|"), /piso/);
});

test("CLI: análise que não examinou arquivo nenhum NÃO aprova (era o falso verde da revisão)", () => {
  const vazia = rodar({ results: [], errors: [], paths: { scanned: [] } });
  assert.equal(vazia.status, 2, vazia.stdout + vazia.stderr);
  assert.match(vazia.stderr, /nenhum arquivo/);
  assert.doesNotMatch(vazia.stdout, /Aprovado/);

  const semChave = rodar({ results: [], errors: [] }, { semCobertura: true });
  assert.equal(semChave.status, 2, semChave.stdout + semChave.stderr);

  const abaixo = rodar({ results: [], errors: [], paths: arquivosAnalisados(PISO_DE_ARQUIVOS_ANALISADOS - 1) });
  assert.equal(abaixo.status, 2, abaixo.stdout + abaixo.stderr);
  assert.match(abaixo.stderr, /piso/);

  const noPiso = rodar({ results: [], errors: [], paths: arquivosAnalisados(PISO_DE_ARQUIVOS_ANALISADOS) });
  assert.equal(noPiso.status, 0, noPiso.stdout + noPiso.stderr);
});

// ---- a baseline do registro (regras do registro fixadas, ERROR novo reprova) -----------------

test("CLI: --baseline aponta outro arquivo, e achado ERROR do registro que não está nele reprova", () => {
  const registro = ".semgrep/baseline-registro.json";
  const novo = rodar({
    results: [achado(1, { path: "dc360/apps/api/src/auth/inexistente.ts", check_id: "semgrep-rules.javascript.node-crypto.security.gcm-no-tag-length" })],
    errors: [],
  }, { argumentos: ["--baseline", registro] });
  assert.equal(novo.status, 1, novo.stdout + novo.stderr);
  assert.match(novo.stderr, /NOVO ERROR: gcm-no-tag-length/);
  const limpo = rodar({ results: [], errors: [] }, { argumentos: ["--baseline", registro] });
  assert.equal(limpo.status, 0, limpo.stdout + limpo.stderr);
});

test("CLI: --baseline sem o caminho, ou com arquivo que não existe, é erro de uso e nunca aprova", () => {
  const semCaminho = rodar({ results: [], errors: [] }, { argumentos: ["--baseline"] });
  assert.notEqual(semCaminho.status, 0, semCaminho.stdout);
  const inexistente = rodar({ results: [], errors: [] }, { argumentos: ["--baseline", ".semgrep/nao-existe.json"] });
  assert.notEqual(inexistente.status, 0, inexistente.stdout);
});
