import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { copiarFixture, escrever, executarCli, trocarNoArquivo } from "./apoio-de-teste.mjs";
import { categoriasDeQuem, classificarMudanca, coletar, dataValida, lerArgumentos, oQueFalta } from "./coletar-relatorio.mjs";

const STATUS = "docs/roadmap-v2/STATUS.md";

/** Roda git na cópia da fixture, com a data do commit controlada. */
function git(raiz, args, data) {
  const env = { ...process.env, GIT_AUTHOR_NAME: "Teste", GIT_AUTHOR_EMAIL: "teste@example.com", GIT_COMMITTER_NAME: "Teste", GIT_COMMITTER_EMAIL: "teste@example.com" };
  if (data) {
    env.GIT_AUTHOR_DATE = `${data}T12:00:00`;
    env.GIT_COMMITTER_DATE = `${data}T12:00:00`;
  }
  return execFileSync("git", args, { cwd: raiz, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commitar(raiz, mensagem, data) {
  git(raiz, ["add", "-A"]);
  git(raiz, ["commit", "-q", "-m", mensagem], data);
  return git(raiz, ["rev-parse", "HEAD"]);
}

/**
 * Repositório de brinquedo com história:
 *  - 2026-10-01: STATUS da fixture (E01 EM ANDAMENTO, E02 e E03 PENDENTE, CP-03 ABERTO);
 *  - 2026-10-06: E01 VALIDADA, E02 BLOQUEADA, CP-03 DECIDIDO, D-04 nova, entrada no diário;
 *  - cópia de trabalho (sem commit): E03 EM ANDAMENTO.
 */
function montarHistoria() {
  const { raiz, limpar } = copiarFixture();
  git(raiz, ["init", "-q", "-b", "v2/f00"]);
  const c1 = commitar(raiz, "base de 10-01", "2026-10-01");

  trocarNoArquivo(raiz, STATUS, "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | EM ANDAMENTO |", "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | VALIDADA |");
  trocarNoArquivo(raiz, STATUS, "| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | PENDENTE |", "| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | BLOQUEADA |");
  trocarNoArquivo(raiz, STATUS, "| CP-03 | Politica de audit | Rafael | ABERTO |  |", "| CP-03 | Politica de audit | Rafael | DECIDIDO | aceitar o risco |");
  appendFileSync(join(raiz, STATUS), "| 2026-10-06 | E01 validada, E02 bloqueada pelo CP-03. Segunda frase que não entra no resumo | Claude |\n| 2026-10-04 | Entrada antes do período | Claude |\n");
  appendFileSync(join(raiz, "docs/roadmap-v2/01-decisoes-e-principios.md"), "| D-04 | Valida por agente independente. Segunda frase. | Sequência | F00 |\n");
  const c2 = commitar(raiz, "V2-F00-E01: registro da validacao", "2026-10-06");

  trocarNoArquivo(raiz, STATUS, "| V2-F00-E03 | Audit conforme politica | M | P0 | PENDENTE |", "| V2-F00-E03 | Audit conforme politica | M | P0 | EM ANDAMENTO |");
  return { raiz, limpar, c1, c2 };
}

const PERIODO = { desde: "2026-10-05", ate: "2026-10-07", hoje: "2026-10-07" };

/* ---------- Classificação ---------- */

test("classificarMudanca: avanço, regressão, reprovação, bloqueio, desbloqueio e cancelamento", () => {
  const casos = [
    ["PENDENTE", "EM ANDAMENTO", "avanco"],
    ["EM ANDAMENTO", "IMPLEMENTADA", "avanco"],
    ["IMPLEMENTADA", "VALIDADA", "avanco"],
    ["VALIDADA", "CONCLUÍDA", "avanco"],
    ["VALIDADA", "EM ANDAMENTO", "regressao"],
    ["VALIDADA", "BLOQUEADA", "regressao"],
    ["VALIDADA", "REPROVADA", "regressao"],
    ["CONCLUÍDA", "VALIDADA", "regressao"],
    ["CONCLUÍDA COM RISCO ACEITO", "BLOQUEADA", "regressao"],
    ["VALIDADA COM PENDÊNCIA HUMANA", "REPROVADA", "regressao"],
    ["EM VALIDAÇÃO", "REPROVADA", "reprovada"],
    ["IMPLEMENTADA", "REPROVADA", "reprovada"],
    ["PENDENTE", "BLOQUEADA", "bloqueada"],
    ["EM ANDAMENTO", "BLOQUEADA", "bloqueada"],
    ["BLOQUEADA", "EM ANDAMENTO", "desbloqueada"],
    ["EM ANDAMENTO", "CANCELADA", "cancelada"],
    [null, "PENDENTE", "nova"],
    ["IMPLEMENTADA", "EM ANDAMENTO", "recuo"],
  ];
  for (const [antes, depois, esperado] of casos) {
    assert.equal(classificarMudanca(antes, depois), esperado, `${antes} para ${depois}`);
  }
});

test("categoriasDeQuem: Rafael, Alyson, jurídico ou DPO e município, com o emoji da tabela", () => {
  assert.deepEqual(categoriasDeQuem("🛑 Rafael"), ["rafael"]);
  assert.deepEqual(categoriasDeQuem("🛑 Rafael e ⚖️ jurídico"), ["rafael", "juridico-dpo"]);
  assert.deepEqual(categoriasDeQuem("🛑 Alyson e ⚖️ DPO, município"), ["alyson", "juridico-dpo", "externo"]);
  assert.deepEqual(categoriasDeQuem("🛑 município, Alyson e ⚖️ jurídico"), ["alyson", "juridico-dpo", "externo"]);
  assert.deepEqual(categoriasDeQuem(""), []);
});

test("oQueFalta: do 'falta' até o fim da frase, sem confundir com nome de arquivo", () => {
  assert.equal(oQueFalta("Implementada. Falta validação humana (Rafael vê a sonda). Evidência: x"), "Falta validação humana (Rafael vê a sonda)");
  assert.equal(oQueFalta("FALTA: rodar em Linux. Resto."), "FALTA: rodar em Linux");
  assert.equal(oQueFalta("Arquivo falta-de-sinal.test.tsx rewritten, sem pendência."), null);
  assert.equal(oQueFalta("tudo certo"), null);
});

test("dataValida: só ISO real", () => {
  assert.equal(dataValida("2026-10-07"), true);
  assert.equal(dataValida("2026-02-30"), false);
  assert.equal(dataValida("07/10/2026"), false);
  assert.equal(dataValida(undefined), false);
});

test("lerArgumentos: exige --desde e recusa o que não conhece", () => {
  assert.ok(lerArgumentos([]).erro);
  assert.ok(lerArgumentos(["--desde"]).erro);
  assert.ok(lerArgumentos(["--desde", "2026-10-05", "--inventado", "x"]).erro);
  assert.deepEqual(lerArgumentos(["--desde", "2026-10-05", "--saida", "a.json"]).opcoes, { desde: "2026-10-05", saida: "a.json" });
});

/* ---------- Coleta sobre um repositório com história ---------- */

test("coleta: compara com o último commit do STATUS antes de --desde e classifica as mudanças", () => {
  const h = montarHistoria();
  try {
    const d = coletar({ raiz: h.raiz, ...PERIODO });
    assert.equal(d.versao, 1);
    assert.equal(d.base.sha, git(h.raiz, ["rev-parse", "HEAD"]));
    assert.equal(d.base.ramo, "v2/f00");
    assert.equal(d.base.statusBase.sha, h.c1, "a base é o último commit do STATUS antes de 2026-10-05");
    assert.match(d.base.statusBase.motivo, /último commit do STATUS antes de 2026-10-05/);
    assert.equal(d.base.statusBase.etapasPresumidasPendentes, false);
    assert.equal(d.base.statusFinal.tipo, "copia-de-trabalho");
    assert.ok(d.base.alteracoesNaoCommitadas >= 1);
    assert.ok(d.avisos.some((a) => /não commitadas/.test(a)), "avisa que o STATUS tem alteração fora do git");

    const m = Object.fromEntries(d.mudancas.etapas.map((x) => [x.id, x]));
    assert.deepEqual(Object.keys(m).sort(), ["V2-F00-E01", "V2-F00-E02", "V2-F00-E03"]);
    assert.deepEqual([m["V2-F00-E01"].antes, m["V2-F00-E01"].depois, m["V2-F00-E01"].tipo], ["EM ANDAMENTO", "VALIDADA", "avanco"]);
    assert.deepEqual([m["V2-F00-E02"].antes, m["V2-F00-E02"].depois, m["V2-F00-E02"].tipo], ["PENDENTE", "BLOQUEADA", "bloqueada"]);
    assert.deepEqual([m["V2-F00-E03"].antes, m["V2-F00-E03"].depois, m["V2-F00-E03"].tipo], ["PENDENTE", "EM ANDAMENTO", "avanco"]);
    assert.equal(m["V2-F00-E01"].titulo, "Religar a vigencia na escrita");
    assert.match(m["V2-F00-E01"].observacao, /^Implementada e medida;/, "a observação resumida é a primeira frase");
    assert.equal(m["V2-F00-E01"].observacao.includes("Evidencia"), false);
    assert.deepEqual(d.mudancas.obrigatorias, ["V2-F00-E02"], "o bloqueio novo é de citação obrigatória");

    assert.deepEqual(d.mudancas.checkpoints.map((c) => [c.id, c.antes, c.depois]), [["CP-03", "ABERTO", "DECIDIDO"]]);
    assert.deepEqual(d.mudancas.gates, []);
    assert.equal(d.statusPorEtapa["V2-F00-E01"], "VALIDADA");
    assert.equal(d.statusPorEtapa["V2-F01-E01"], "PENDENTE", "o mapa tem todas as etapas, não só as da fase");
  } finally {
    h.limpar();
  }
});

test("coleta: fase atual, contagens, bloqueios por quem decide e pendência humana", () => {
  const h = montarHistoria();
  try {
    const d = coletar({ raiz: h.raiz, ...PERIODO });
    assert.equal(d.fase.fase, "F00");
    assert.equal(d.fase.gate, "G00");
    assert.equal(d.fase.statusDoGate, "NÃO INICIADO");
    assert.equal(d.fase.ordem, 1);
    assert.equal(d.fase.totalDeFases, 3);
    assert.deepEqual(d.contagens, { "EM ANDAMENTO": 1, VALIDADA: 1, BLOQUEADA: 1 });
    assert.deepEqual(d.proximasFases.map((f) => f.fase), ["F02", "F01"], "as duas próximas seguem a ordem de execução, não a numeração");
    assert.deepEqual(d.fasesConcluidas, []);

    assert.deepEqual(d.bloqueios.etapasBloqueadas.map((e) => e.id), ["V2-F00-E02"]);
    assert.ok(d.bloqueios.checkpointsAbertos.every((c) => ["atual", "proxima"].includes(c.daFase)));
    assert.ok(d.bloqueios.checkpointsAbertos.some((c) => c.id === "CP-19" && c.quem.includes("rafael")));
    assert.ok(d.bloqueios.porQuem.rafael.includes("CP-19"));
    assert.ok(d.bloqueios.porQuem.tecnico.includes("V2-F00-E02"), "bloqueio sem checkpoint é técnico");

    assert.deepEqual(d.pendenciasHumanas, [], "EM ANDAMENTO sem a palavra 'falta' na observação não é pendência humana");
    trocarNoArquivo(h.raiz, STATUS, "Depende do CP-03.", "Pronta para medir. Falta Rafael ver a tela (no aparelho). Evidência: x.");
    const d2 = coletar({ raiz: h.raiz, ...PERIODO });
    assert.deepEqual(d2.pendenciasHumanas, [{ id: "V2-F00-E03", titulo: "Audit conforme politica", status: "EM ANDAMENTO", falta: "Falta Rafael ver a tela (no aparelho)" }]);
  } finally {
    h.limpar();
  }
});

test("coleta: diário do período, decisão nova e commits (só o assunto) do período", () => {
  const h = montarHistoria();
  try {
    const d = coletar({ raiz: h.raiz, ...PERIODO });
    // A fixture traz uma entrada de 10-07 (dentro do período); a de 10-04 do teste fica de fora.
    assert.deepEqual(d.diario.map((e) => e.data).sort(), ["2026-10-06", "2026-10-07"]);
    const dia6 = d.diario.find((e) => e.data === "2026-10-06");
    assert.equal(dia6.resumo, "E01 validada, E02 bloqueada pelo CP-03.");
    assert.equal(dia6.quem, "Claude");

    assert.deepEqual(d.decisoesNovas, [{ id: "D-04", frase: "Valida por agente independente." }]);

    assert.deepEqual(d.commits.map((c) => c.assunto), ["V2-F00-E01: registro da validacao"], "o commit de 10-01 está fora do período");
    assert.deepEqual(Object.keys(d.commits[0]).sort(), ["assunto", "data", "sha"], "só o assunto, nunca o diff");
    assert.equal(d.commits[0].data, "2026-10-06");
  } finally {
    h.limpar();
  }
});

test("coleta: --desde anterior ao STATUS no git usa o primeiro commit e presume tudo PENDENTE", () => {
  const h = montarHistoria();
  try {
    const d = coletar({ raiz: h.raiz, desde: "2026-09-01", ate: "2026-10-07", hoje: "2026-10-07" });
    assert.equal(d.base.statusBase.sha, h.c1);
    assert.match(d.base.statusBase.motivo, /primeiro commit que tem o STATUS/);
    assert.equal(d.base.statusBase.etapasPresumidasPendentes, true);
    assert.ok(d.avisos.some((a) => /hipótese de que todas começaram PENDENTES/.test(a)));
    const e01 = d.mudancas.etapas.find((x) => x.id === "V2-F00-E01");
    assert.equal(e01.antes, "PENDENTE", "a etapa que já estava EM ANDAMENTO na base conta como PENDENTE no início do período");
    assert.equal(e01.depois, "VALIDADA");
  } finally {
    h.limpar();
  }
});

test("coleta: regressão entre duas versões do STATUS aparece com tipo regressao e é de citação obrigatória", () => {
  const h = montarHistoria();
  try {
    // Faz a E01 voltar de VALIDADA para BLOQUEADA e commita: a base para o período seguinte é o commit com VALIDADA.
    commitar(h.raiz, "estado de 10-08", "2026-10-08");
    trocarNoArquivo(h.raiz, STATUS, "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | VALIDADA |", "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | BLOQUEADA |");
    commitar(h.raiz, "V2-F00-E01: condicao expirada", "2026-10-10");
    const d = coletar({ raiz: h.raiz, desde: "2026-10-09", ate: "2026-10-12", hoje: "2026-10-12" });
    assert.equal(d.base.statusBase.shaCurto, git(h.raiz, ["rev-parse", "--short=7", "HEAD~1"]));
    assert.deepEqual(d.mudancas.etapas.map((x) => [x.id, x.antes, x.depois, x.tipo]), [["V2-F00-E01", "VALIDADA", "BLOQUEADA", "regressao"]]);
    assert.deepEqual(d.mudancas.obrigatorias, ["V2-F00-E01"]);
  } finally {
    h.limpar();
  }
});

test("coleta: gate reaberto no período e gates reabertos vigentes, com o motivo do GATE.md", () => {
  const h = montarHistoria();
  try {
    trocarNoArquivo(h.raiz, STATUS, "| G00 BASE DE BRINQUEDO | 3 | 0 | NÃO INICIADO |", "| G00 BASE DE BRINQUEDO | 3 | 0 | APROVADO |");
    escrever(h.raiz, "docs/evidencias-v2/G00/GATE.md", "# GATE G00\n- Aprovado por Rafael em 2026-10-06.\n");
    commitar(h.raiz, "G00 aprovado", "2026-10-08");
    trocarNoArquivo(h.raiz, STATUS, "| G00 BASE DE BRINQUEDO | 3 | 0 | APROVADO |", "| G00 BASE DE BRINQUEDO | 3 | 0 | REABERTO |");
    escrever(h.raiz, "docs/evidencias-v2/G00/GATE.md", "# GATE G00\n- Aprovado por Rafael em 2026-10-06.\n- REABERTO em 2026-10-11: regressão: V2-F00-E01\n");
    commitar(h.raiz, "G00 reaberto", "2026-10-11");
    const d = coletar({ raiz: h.raiz, desde: "2026-10-09", ate: "2026-10-12", hoje: "2026-10-12" });
    assert.deepEqual(d.mudancas.gates.map((g) => [g.gate, g.antes, g.depois, g.reaberto]), [["G00", "APROVADO", "REABERTO", true]]);
    assert.match(d.mudancas.gates[0].motivo, /regressão: V2-F00-E01/);
    assert.deepEqual(d.gatesReabertos.map((g) => g.gate), ["G00"]);
    assert.equal(d.fase.statusDoGate, "REABERTO", "gate reaberto continua sendo o da fase atual");
    assert.deepEqual(d.fasesConcluidas, [], "REABERTO não conta como gate aprovado");
  } finally {
    h.limpar();
  }
});

test("coleta: risco aceito vigente vem do RISCO-ACEITO.md e o encerrado não", () => {
  const h = montarHistoria();
  try {
    escrever(h.raiz, "docs/evidencias-v2/G00/V2-F00-E01/RISCO-ACEITO.md", "# Risco aceito\n- **Critério:** rodada em Linux\n- **Validade:** até o G01\n- **Quem aceitou:** Rafael\n");
    const d = coletar({ raiz: h.raiz, ...PERIODO });
    assert.deepEqual(d.riscosAceitos, [{ etapa: "V2-F00-E01", criterio: "rodada em Linux", validade: "até o G01", aceitoPor: "Rafael" }]);
    escrever(h.raiz, "docs/evidencias-v2/G00/V2-F00-E01/RISCO-ACEITO.md", "# Risco aceito\n- **Critério:** rodada em Linux\n- **Status:** expirado\n");
    assert.deepEqual(coletar({ raiz: h.raiz, ...PERIODO }).riscosAceitos, []);
  } finally {
    h.limpar();
  }
});

test("coleta: nunca lê saidas/ nem o conteúdo bruto de evidência", () => {
  const h = montarHistoria();
  try {
    escrever(h.raiz, "docs/evidencias-v2/G00/V2-F00-E01/saidas/bruto.txt", "SEGREDO-DA-SAIDA-BRUTA-123456\n");
    escrever(h.raiz, "docs/evidencias-v2/G00/V2-F00-E01/RESUMO.md", "## Fatos\nSEGREDO-DO-RESUMO-654321\n");
    const json = JSON.stringify(coletar({ raiz: h.raiz, ...PERIODO }));
    assert.equal(json.includes("SEGREDO-DA-SAIDA-BRUTA"), false);
    assert.equal(json.includes("SEGREDO-DO-RESUMO"), false);
  } finally {
    h.limpar();
  }
});

test("coleta: o JSON não carrega travessão, mesmo que o STATUS tenha", () => {
  const h = montarHistoria();
  try {
    const travessao = String.fromCharCode(0x2014);
    trocarNoArquivo(h.raiz, STATUS, "Implementada e medida; falta validação humana", `Implementada e medida ${travessao} falta validação humana`);
    const json = JSON.stringify(coletar({ raiz: h.raiz, ...PERIODO }));
    assert.equal(json.includes(travessao), false);
  } finally {
    h.limpar();
  }
});

test("coleta: --fase força a fase do relatório (relatório de fase)", () => {
  const h = montarHistoria();
  try {
    const d = coletar({ raiz: h.raiz, ...PERIODO, fase: "F02" });
    assert.equal(d.fase.fase, "F02");
    assert.equal(d.fase.gate, "G02");
    assert.deepEqual(d.proximasFases.map((f) => f.fase), ["F01"]);
    assert.throws(() => coletar({ raiz: h.raiz, ...PERIODO, fase: "F77" }), /não existe na ordem de execução/);
  } finally {
    h.limpar();
  }
});

test("coleta: entradas inválidas são recusadas com mensagem clara", () => {
  const h = montarHistoria();
  try {
    assert.throws(() => coletar({ raiz: h.raiz, desde: "05/10/2026" }), /--desde precisa ser uma data ISO/);
    assert.throws(() => coletar({ raiz: h.raiz, desde: "2026-10-05", ate: "2026-13-01" }), /--ate precisa ser uma data ISO/);
    assert.throws(() => coletar({ raiz: h.raiz, desde: "2026-10-07", ate: "2026-10-05" }), /anterior a --desde/);
    assert.throws(() => coletar({ raiz: h.raiz, ...PERIODO, fase: "00" }), /--fase precisa ser Fnn/);
  } finally {
    h.limpar();
  }
});

test("coleta: período que já acabou usa o STATUS do commit do fim, e não a cópia de trabalho", () => {
  const h = montarHistoria();
  try {
    // A cópia de trabalho tem E03 EM ANDAMENTO (sem commit); o commit de 10-06 não tem.
    const d = coletar({ raiz: h.raiz, desde: "2026-10-05", ate: "2026-10-07", hoje: "2026-10-20" });
    assert.equal(d.base.statusFinal.tipo, "commit");
    assert.equal(d.base.statusFinal.sha, h.c2);
    assert.equal(d.statusPorEtapa["V2-F00-E03"], "PENDENTE");
    assert.deepEqual(d.mudancas.etapas.map((x) => x.id).sort(), ["V2-F00-E01", "V2-F00-E02"]);
  } finally {
    h.limpar();
  }
});

/* ---------- CLI, no repositório real ---------- */

test("CLI: grava o JSON, imprime o resumo e recusa uso errado com código 2", () => {
  const pasta = mkdtempSync(join(tmpdir(), "coleta-cli-"));
  try {
    const saida = join(pasta, "coleta.json");
    const r = executarCli("coletar-relatorio.mjs", ["--desde", "2026-10-05", "--saida", saida]);
    assert.equal(r.codigo, 0, r.erro);
    assert.match(r.saida, /Coleta gravada em/);
    const d = JSON.parse(readFileSync(saida, "utf8"));
    assert.equal(d.versao, 1);
    assert.match(d.base.sha, /^[0-9a-f]{40}$/);
    assert.ok(d.base.ramo.length > 0);
    assert.equal(typeof d.statusPorEtapa["V2-F00-E01"], "string");
    assert.equal(JSON.stringify(d).includes(String.fromCharCode(0x2014)), false);

    assert.equal(executarCli("coletar-relatorio.mjs", []).codigo, 2);
    assert.equal(executarCli("coletar-relatorio.mjs", ["--desde", "ontem"]).codigo, 2);
    assert.equal(executarCli("coletar-relatorio.mjs", ["--desde", "2026-10-05", "--tudo"]).codigo, 2);
    const stdout = executarCli("coletar-relatorio.mjs", ["--desde", "2026-10-05"]);
    assert.equal(stdout.codigo, 0);
    assert.equal(JSON.parse(stdout.saida).periodo.desde, "2026-10-05", "sem --saida o JSON vai para a saída padrão");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
