import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "node:test";

import { FIXTURE, RAIZ_REAL, copiarFixture, executarCli, trocarNoArquivo } from "./apoio-de-teste.mjs";
import { calcularTravas, estadoDoGit, formatarContexto, montarContexto } from "./contexto.mjs";
import { checkpointsDaEtapa, etapaDoStatus, gateAnterior, gateDaFase, lerStatusDoRepositorio, localizarEtapa } from "./roadmap.mjs";

const tiposDeTrava = (c) => c.travas.map((t) => t.tipo);

/* ---------- Fixture ---------- */

test("pacote da fixture: etapa, fase, status e evidência", () => {
  const c = montarContexto("V2-F00-E01", FIXTURE);
  assert.equal(c.etapa.titulo, "Religar a vigencia na escrita");
  assert.equal(c.fase.gate, "G00");
  assert.equal(c.statusDaEtapa.status, "EM ANDAMENTO");
  assert.match(c.statusDaEtapa.observacao, /falta validação humana/);
  assert.equal(c.gateAnterior, null, "a primeira fase não tem gate anterior");
  assert.deepEqual(c.gateDaFase, { gate: "G00", status: "NÃO INICIADO" });
  assert.equal(c.evidencia.existe, true);
  assert.equal(c.evidencia.index, true);
  assert.equal(c.evidencia.vereditoArquivo, false);
  assert.equal(c.evidencia.riscoAceito, false);
  assert.equal(c.evidencia.validacao, false);
  assert.deepEqual(c.evidencia.entradas, ["INDEX.md"]);
  // D-02 e ADR 0001 vêm do texto da etapa.
  assert.deepEqual(c.decisoes.map((d) => d.id), ["D-02"]);
  assert.equal(c.decisoes[0].situacao, "(REVOGADA por D-03)");
  assert.deepEqual(c.adrs.map((a) => a.numero), ["0001"]);
  assert.match(c.adrs[0].titulo, /Isolamento de fixture/);
  // Nada trava a primeira etapa da primeira fase.
  assert.deepEqual(c.travas, []);
});

test("travas da fixture: CP aberto, dependência pendente e gate de dependência", () => {
  const c = montarContexto("V2-F00-E03", FIXTURE);
  const descricoes = c.travas.map((t) => t.descricao).join("\n");
  assert.ok(tiposDeTrava(c).includes("checkpoint"));
  assert.match(descricoes, /CP-03 está ABERTO/);
  // E01 está EM ANDAMENTO com pendência humana: aviso, não trava.
  assert.ok(c.avisos.some((a) => a.includes("V2-F00-E01")));
  assert.ok(!descricoes.includes("V2-F00-E01"));
  // E02 está PENDENTE: trava de verdade.
  assert.match(descricoes, /V2-F00-E02 não está concluída \(PENDENTE\)/);
  // G02 não aprovado é dependência declarada.
  assert.match(descricoes, /o gate G02 está NÃO INICIADO/);
});

test("trava de gate anterior segue a ordem de execução (F01 vem depois da F02)", () => {
  const c = montarContexto("V2-F01-E01", FIXTURE);
  assert.deepEqual(c.gateAnterior, { fase: "F02", gate: "G02", status: "NÃO INICIADO" });
  assert.ok(tiposDeTrava(c).includes("gate-anterior"));
  assert.match(c.travas.find((t) => t.tipo === "gate-anterior").descricao, /G02/);
});

test("CP citado só como referência (campo Checkpoint começa com Não) não trava", () => {
  const c = montarContexto("V2-F00-E02", FIXTURE);
  assert.deepEqual(c.checkpoints, [{ id: "CP-19", status: "PARCIAL", assunto: "E-mail de producao", trava: false }]);
  assert.ok(!tiposDeTrava(c).includes("checkpoint"));
});

test("CP PARCIAL em dependência também trava", () => {
  const copia = copiarFixture();
  try {
    trocarNoArquivo(copia.raiz, "docs/roadmap-v2/03-fase-00-minima.md", "E01 a E02 e CP-03; gate G02.", "E01 a E02 e CP-19; gate G02.");
    const c = montarContexto("V2-F00-E03", copia.raiz);
    assert.ok(c.travas.some((t) => /CP-19 está PARCIAL/.test(t.descricao)));
  } finally {
    copia.limpar();
  }
});

test("gate anterior aprovado libera a fase, mas dependência aberta continua travando", () => {
  const copia = copiarFixture();
  try {
    const arquivo = "docs/roadmap-v2/STATUS.md";
    trocarNoArquivo(copia.raiz, arquivo, "| G00 BASE DE BRINQUEDO | 3 | 0 | NÃO INICIADO |", "| G00 BASE DE BRINQUEDO | 3 | 3 | APROVADO |");
    trocarNoArquivo(copia.raiz, arquivo, "| CP-03 | Politica de audit | Rafael | ABERTO |", "| CP-03 | Politica de audit | Rafael | DECIDIDO |");
    const c = montarContexto("V2-F02-E01", copia.raiz);
    // F02-E01 depende de F00-E03 e F00-E01, ambas ainda abertas.
    assert.ok(c.travas.some((t) => /V2-F00-E03/.test(t.descricao)));
    assert.ok(!c.travas.some((t) => t.tipo === "gate-anterior"), "G00 aprovado libera a F02");
  } finally {
    copia.limpar();
  }
});

test("etapa BLOQUEADA no STATUS é trava da própria etapa", () => {
  const copia = copiarFixture();
  try {
    trocarNoArquivo(copia.raiz, "docs/roadmap-v2/STATUS.md", "| V2-F02-E01 | Contrato da API v1 | M | P0 | PENDENTE |", "| V2-F02-E01 | Contrato da API v1 | M | P0 | BLOQUEADA (CP-03) |");
    const c = montarContexto("V2-F02-E01", copia.raiz);
    assert.equal(c.statusDaEtapa.status, "BLOQUEADA");
    assert.ok(c.travas.some((t) => t.tipo === "etapa"));
  } finally {
    copia.limpar();
  }
});

test("a observação é cortada em 400 caracteres", () => {
  const copia = copiarFixture();
  try {
    trocarNoArquivo(copia.raiz, "docs/roadmap-v2/STATUS.md", "| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | PENDENTE |  |", `| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | EM ANDAMENTO | ${"palavra ".repeat(100)}|`);
    const c = montarContexto("V2-F00-E02", copia.raiz);
    assert.equal(c.statusDaEtapa.observacao.length, 400);
    assert.ok(c.statusDaEtapa.observacao.endsWith("..."));
    assert.equal(c.statusDaEtapa.observacaoCortada, true);
    assert.match(formatarContexto(c), /cortada em 400 caracteres/);
  } finally {
    copia.limpar();
  }
});

test("evidência com VEREDITO.md, RISCO-ACEITO.md e validacao/ é descrita", () => {
  const copia = copiarFixture();
  try {
    const pasta = "docs/evidencias-v2/G00/V2-F00-E01";
    writeFileSync(`${copia.raiz}/${pasta}/VEREDITO.md`, "veredito: PASS\n");
    writeFileSync(`${copia.raiz}/${pasta}/RISCO-ACEITO.md`, "- Critério: x\n");
    mkdirSync(`${copia.raiz}/${pasta}/validacao`, { recursive: true });
    const e = montarContexto("V2-F00-E01", copia.raiz).evidencia;
    assert.deepEqual([e.index, e.vereditoArquivo, e.riscoAceito, e.validacao], [true, true, true, true]);
    assert.equal(e.veredito, "PASS");
    assert.deepEqual(e.entradas, ["INDEX.md", "RISCO-ACEITO.md", "VEREDITO.md", "validacao/"]);
  } finally {
    copia.limpar();
  }
});

test("etapa inexistente devolve null", () => {
  assert.equal(montarContexto("V2-F00-E99", FIXTURE), null);
});

test("calcularTravas: dependência concluída ou validada não trava", () => {
  const status = lerStatusDoRepositorio(FIXTURE);
  const bloco = localizarEtapa("V2-F00-E02", FIXTURE);
  const e01 = etapaDoStatus(status, "V2-F00-E01");
  for (const concluido of ["VALIDADA", "CONCLUÍDA", "CONCLUÍDA COM RISCO ACEITO"]) {
    e01.status = concluido;
    const { travas, avisos } = calcularTravas({ status, etapaDoStatus: etapaDoStatus(status, "V2-F00-E02"), bloco, gateAnteriorDaFase: gateAnterior(status, "F00"), gateDaFaseAtual: gateDaFase(status, "F00") });
    assert.deepEqual(travas, [], concluido);
    assert.deepEqual(avisos, [], concluido);
  }
  for (const aberto of ["PENDENTE", "IMPLEMENTADA", "EM VALIDAÇÃO", "REPROVADA", "BLOQUEADA"]) {
    e01.status = aberto;
    e01.observacao = "";
    const { travas } = calcularTravas({ status, etapaDoStatus: etapaDoStatus(status, "V2-F00-E02"), bloco, gateAnteriorDaFase: null, gateDaFaseAtual: gateDaFase(status, "F00") });
    assert.equal(travas.length, 1, aberto);
  }
  assert.deepEqual(checkpointsDaEtapa(bloco).travam, []);
});

/* ---------- Repositório real ---------- */

test("estadoDoGit descreve ramo, HEAD e sincronia sem rede", () => {
  const g = estadoDoGit(RAIZ_REAL);
  assert.ok(g.ramo.length > 0);
  assert.match(g.head.hash, /^[0-9a-f]{7,}$/);
  assert.equal(typeof g.arvore.limpa, "boolean");
  assert.ok(typeof g.remoto.estado === "string" && g.remoto.estado.length > 0);
});

test("repositório real: o pacote da V2-F00-E04 sai completo e curto", () => {
  const c = montarContexto("V2-F00-E04", RAIZ_REAL);
  assert.ok(c);
  assert.equal(c.fase.gate, "G00");
  assert.ok(c.analise.validadores.includes("seguranca-aplicacao"));
  assert.equal(c.analise.opus.opus, true);
  assert.deepEqual(c.decisoes.map((d) => d.id), ["D-04"]);
  assert.equal(c.evidencia.existe, true);
  assert.equal(c.evidencia.index, true);
  const texto = formatarContexto(c);
  assert.ok(texto.split("\n").length < 150, `${texto.split("\n").length} linhas`);
  for (const secao of ["== Repositório ==", "== Etapa", "== Cabeçalho da fase", "== Estado no STATUS ==", "== Validação", "== Evidência existente ==", "== TRAVAS =="]) {
    assert.ok(texto.includes(secao), secao);
  }
});

test("repositório real: V2-F00-E19 não tem mais o CP-03 como trava (decidido em 2026-10-07)", () => {
  const c = montarContexto("V2-F00-E19", RAIZ_REAL);
  assert.ok(!c.travas.some((t) => t.tipo === "checkpoint" && /CP-03/.test(t.descricao)));
});

test("repositório real: toda etapa da F00 monta pacote sem erro e abaixo de 150 linhas", () => {
  const status = lerStatusDoRepositorio(RAIZ_REAL);
  for (const e of status.etapas.filter((x) => x.fase === "F00")) {
    const c = montarContexto(e.id, RAIZ_REAL);
    assert.ok(c, e.id);
    assert.ok(formatarContexto(c).split("\n").length < 150, e.id);
  }
});

test("CLI: contexto.mjs V2-F00-E04 roda sem erro, e --json é JSON", () => {
  const r = executarCli("contexto.mjs", ["V2-F00-E04"]);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /PACOTE DE CONTEXTO V2-F00-E04/);
  assert.ok(r.saida.split("\n").length < 150);
  const j = executarCli("contexto.mjs", ["V2-F00-E04", "--json"]);
  assert.equal(j.codigo, 0, j.erro);
  assert.equal(JSON.parse(j.saida).id, "V2-F00-E04");
});

test("CLI: sem ID, ID inválido, etapa inexistente e opção desconhecida saem com 2", () => {
  assert.equal(executarCli("contexto.mjs", []).codigo, 2);
  assert.equal(executarCli("contexto.mjs", ["E04"]).codigo, 2);
  assert.equal(executarCli("contexto.mjs", ["V2-F00-E99"]).codigo, 2);
  assert.equal(executarCli("contexto.mjs", ["V2-F00-E04", "--x"]).codigo, 2);
});
