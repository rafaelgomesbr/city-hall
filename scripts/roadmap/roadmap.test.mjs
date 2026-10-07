import assert from "node:assert/strict";
import { test } from "node:test";

import { RAIZ_REAL, FIXTURE, converterParaCrlf, copiarFixture } from "./apoio-de-teste.mjs";
import {
  GATE_APROVADO,
  arquivosDeFase,
  blocoDoGate,
  cabecalhoDaFase,
  celulasDaLinha,
  checkpointsDaEtapa,
  citacoes,
  dependenciasDaEtapa,
  etapaDoStatus,
  gateAnterior,
  hashesCitados,
  hashesDaObservacao,
  lerArquivo,
  lerDecisoes,
  lerRiscoAceito,
  lerStatus,
  lerStatusDoRepositorio,
  lerVeredito,
  listarAdrs,
  localizarEtapa,
  normalizar,
  primeiraFrase,
  separarStatus,
  STATUS_DE_ETAPA,
  subitensDoImplementar,
  temPendenciaHumana,
  todasAsEtapasDosArquivos,
} from "./roadmap.mjs";

const statusDaFixture = () => lerStatusDoRepositorio(FIXTURE);

/* ---------- Tabelas ---------- */

test("celulasDaLinha respeita a barra escapada e ignora o que não é tabela", () => {
  assert.deepEqual(celulasDaLinha("| a | b \\| c | d |"), ["a", "b | c", "d"]);
  assert.equal(celulasDaLinha("texto solto"), null);
  assert.deepEqual(celulasDaLinha("| só | duas"), ["só", "duas"]);
});

test("separarStatus escolhe o prefixo mais longo e guarda o resto", () => {
  assert.deepEqual(separarStatus("VALIDADA COM PENDÊNCIA HUMANA", STATUS_DE_ETAPA), { status: "VALIDADA COM PENDÊNCIA HUMANA", extra: "" });
  assert.deepEqual(separarStatus("**BLOQUEADA** (CP-03)", STATUS_DE_ETAPA), { status: "BLOQUEADA", extra: "(CP-03)" });
  assert.equal(separarStatus("INVENTADO", STATUS_DE_ETAPA).desconhecido, true);
});

/* ---------- STATUS (fixture) ---------- */

test("lerStatus lê as quatro tabelas da fixture", () => {
  const s = statusDaFixture();
  assert.deepEqual(s.ordem.map((o) => o.fase), ["F00", "F02", "F01"]);
  assert.deepEqual(s.gates.map((g) => [g.gate, g.status]), [["G00", "NÃO INICIADO"], ["G02", "NÃO INICIADO"], ["G01", "NÃO INICIADO"]]);
  assert.equal(s.gates[0].nomeDoGate, "BASE DE BRINQUEDO");
  assert.deepEqual(s.checkpoints.map((c) => [c.id, c.status]), [["CP-01", "DECIDIDO"], ["CP-03", "ABERTO"], ["CP-19", "PARCIAL"]]);
  assert.equal(s.etapas.length, 5);
  const e01 = etapaDoStatus(s, "V2-F00-E01");
  assert.equal(e01.status, "EM ANDAMENTO");
  assert.equal(e01.fase, "F00");
  assert.match(e01.observacao, /falta validação humana/);
});

test("a observação mantém a barra vertical escapada e o que vem depois dela", () => {
  const e03 = etapaDoStatus(statusDaFixture(), "V2-F00-E03");
  assert.ok(e03.observacao.includes("`npm run auditar | tail` fica como esta"), e03.observacao);
});

test("lerStatus devolve a mesma coisa com CRLF", () => {
  const lf = lerArquivo(`${FIXTURE}/docs/roadmap-v2/STATUS.md`);
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.ok(crlf.includes("\r\n"));
  assert.deepEqual(lerStatus(crlf), lerStatus(lf));
  assert.equal(normalizar(`﻿${crlf}`), lf);
});

test("o gate anterior segue a ordem de execução, e não a numeração", () => {
  const s = statusDaFixture();
  assert.equal(gateAnterior(s, "F00"), null);
  assert.deepEqual(gateAnterior(s, "F02"), { fase: "F00", gate: "G00", status: "NÃO INICIADO" });
  // F01 vem depois de F02 na ordem, mesmo tendo número menor.
  assert.deepEqual(gateAnterior(s, "F01"), { fase: "F02", gate: "G02", status: "NÃO INICIADO" });
});

test("temPendenciaHumana lê as formas reais de escrever a pendência", () => {
  const e = (status, observacao) => ({ status, observacao });
  assert.equal(temPendenciaHumana(e("EM ANDAMENTO", "Falta validação humana: Rafael lê")), true);
  assert.equal(temPendenciaHumana(e("EM ANDAMENTO", "FALTA (validação humana, F14-E12): no iPhone")), true);
  assert.equal(temPendenciaHumana(e("EM ANDAMENTO", "FALTA: rodar em Linux")), true);
  assert.equal(temPendenciaHumana(e("EM ANDAMENTO", "Implementada e medida")), false);
  assert.equal(temPendenciaHumana(e("PENDENTE", "")), false);
  assert.equal(temPendenciaHumana(e("VALIDADA COM PENDÊNCIA HUMANA", "")), true);
  assert.equal(temPendenciaHumana(e("CONCLUÍDA", "falta nada")), false);
});

/* ---------- Hashes ---------- */

test("hashesCitados aceita hash de verdade e recusa número e palavra", () => {
  const texto = [
    "- commit `0045680` depois dele",
    "- número solto `2026100` sem aviso",
    "- palavra `defaced` entre crases",
    "- hash `5d6bc57` normal",
    "- sem crases b793e82 fica de fora",
  ].join("\n");
  assert.deepEqual(hashesCitados(texto).map((h) => h.hash), ["0045680", "5d6bc57"]);
});

test("hashesDaObservacao pega com e sem crases, só com letra e dígito", () => {
  assert.deepEqual(hashesDaObservacao("candidato `1a2b3c4` e também 99390e0, mas não 2026100 nem defaced"), ["1a2b3c4", "99390e0"]);
});

/* ---------- Arquivos de fase (fixture) ---------- */

test("arquivosDeFase descobre pelo conteúdo", () => {
  const nomes = arquivosDeFase(FIXTURE).map((a) => a.split(/[\\/]/).pop());
  assert.deepEqual(nomes, ["03-fase-00-minima.md", "04-fases-01-e-02-minimas.md"]);
});

test("localizarEtapa devolve arquivo, linha, título e campos como mapa", () => {
  const b = localizarEtapa("V2-F00-E01", FIXTURE);
  assert.equal(b.arquivo, "docs/roadmap-v2/03-fase-00-minima.md");
  assert.equal(b.titulo, "Religar a vigencia na escrita");
  assert.equal(b.fase, "F00");
  assert.equal(b.linha, 11);
  assert.equal(b.campos["Prioridade"], "P0");
  // Quatro campos na mesma linha.
  assert.equal(b.campos["Tamanho"], "S");
  assert.equal(b.campos["Complexidade"], "media");
  assert.equal(b.campos["Risco"], "alto");
  assert.equal(b.campos["Paralelizável"], "nao");
  assert.match(b.campos["O que deve ser implementado"], /exigirPermissao/);
  assert.equal(b.texto.split("\n")[0], "### V2-F00-E01 - Religar a vigencia na escrita");
  assert.ok(!b.texto.includes("### V2-F00-E02"));
  assert.equal(localizarEtapa("V2-F00-E99", FIXTURE), null);
  assert.equal(localizarEtapa("invalido", FIXTURE), null);
});

test("o bloco da etapa para no próximo título, inclusive no gate", () => {
  const b = localizarEtapa("V2-F00-E03", FIXTURE);
  assert.ok(!b.texto.includes("# GATE"));
  assert.equal(b.campos["Checkpoint"], "CP-03 (decide a politica de audit).");
});

test("subitensDoImplementar separa os prefixos de camada", () => {
  const b = localizarEtapa("V2-F00-E01", FIXTURE);
  assert.deepEqual(subitensDoImplementar(b).map((s) => s.prefixo), ["API", "Autorização", "Testes"]);
});

test("cabeçalho da fase acha a fase certa num arquivo com duas fases", () => {
  const f01 = cabecalhoDaFase("F01", FIXTURE);
  assert.equal(f01.arquivo, "docs/roadmap-v2/04-fases-01-e-02-minimas.md");
  assert.equal(f01.gate, "G01");
  assert.deepEqual(f01.checkpointsDaFase, ["CP-03"]);
  assert.ok(f01.texto.startsWith("# Fase 01: Terceira na ordem"));
  assert.ok(!f01.texto.includes("F02-E01"));
  const f00 = cabecalhoDaFase("F00", FIXTURE);
  assert.deepEqual(f00.checkpointsDaFase, ["CP-01", "CP-03", "CP-19"]);
  assert.equal(cabecalhoDaFase("F99", FIXTURE), null);
});

test("bloco do gate traz itens marcados e não, o Reabre se e o Libera", () => {
  const g = blocoDoGate("G00", FIXTURE);
  assert.equal(g.nome, "BASE DE BRINQUEDO");
  assert.deepEqual(g.itens.map((i) => i.marcado), [false, true, false]);
  assert.equal(g.reabreSe, "a vigencia desligar de novo.");
  assert.equal(g.libera, "F02 em diante.");
  // O gate da primeira fase do arquivo de duas fases não engole a fase seguinte.
  assert.ok(!blocoDoGate("G02", FIXTURE).texto.includes("Fase 01"));
  assert.equal(blocoDoGate("G77", FIXTURE), null);
});

test("os mesmos blocos saem de arquivos com CRLF", () => {
  const copia = copiarFixture();
  try {
    converterParaCrlf(copia.raiz);
    assert.deepEqual(localizarEtapa("V2-F00-E02", copia.raiz).campos, localizarEtapa("V2-F00-E02", FIXTURE).campos);
    assert.equal(cabecalhoDaFase("F01", copia.raiz).gate, "G01");
    assert.equal(blocoDoGate("G02", copia.raiz).itens.length, 1);
    assert.equal(lerDecisoes(copia.raiz).length, 3);
    assert.equal(listarAdrs(copia.raiz)[0].titulo, "ADR 0001: Isolamento de fixture");
  } finally {
    copia.limpar();
  }
});

/* ---------- Citações e dependências ---------- */

test("citacoes junta CP, D e ADR sem repetir", () => {
  const c = citacoes("veja CP-03 e CP-01, D-04 (PR:D-04) e ADR 0008, ADR-0001");
  assert.deepEqual(c.checkpoints, ["CP-01", "CP-03"]);
  assert.deepEqual(c.decisoes, ["D-04"]);
  assert.deepEqual(c.adrs, ["0001", "0008"]);
});

test("dependenciasDaEtapa expande intervalo, resolve a fase e separa gates e CPs", () => {
  const e03 = dependenciasDaEtapa(localizarEtapa("V2-F00-E03", FIXTURE));
  assert.deepEqual(e03.etapas, ["V2-F00-E01", "V2-F00-E02"]);
  assert.deepEqual(e03.gates, ["G02"]);
  assert.deepEqual(e03.checkpoints, ["CP-03"]);

  const f02 = dependenciasDaEtapa(localizarEtapa("V2-F02-E01", FIXTURE));
  assert.deepEqual(f02.etapas, ["V2-F00-E01", "V2-F00-E03"]);

  assert.deepEqual(dependenciasDaEtapa(localizarEtapa("V2-F00-E01", FIXTURE)).etapas, []);
  // E01 na F01 aponta para a própria F01-E01 e por isso é descartada.
  assert.deepEqual(dependenciasDaEtapa(localizarEtapa("V2-F01-E01", FIXTURE)).etapas, []);
});

test("CP só trava quando o campo Checkpoint não começa com Não", () => {
  const e02 = checkpointsDaEtapa(localizarEtapa("V2-F00-E02", FIXTURE));
  assert.deepEqual(e02.travam, []);
  assert.deepEqual(e02.citados, ["CP-19"]);
  const e03 = checkpointsDaEtapa(localizarEtapa("V2-F00-E03", FIXTURE));
  assert.deepEqual(e03.travam, ["CP-03"]);
});

/* ---------- Decisões e ADRs ---------- */

test("decisões: id, situação e só a primeira frase", () => {
  const d = lerDecisoes(FIXTURE);
  assert.deepEqual(d.map((x) => x.id), ["D-01", "D-02", "D-03"]);
  assert.equal(d[0].frase, "PORTAL primeiro, APP depois.");
  assert.equal(d[1].situacao, "(REVOGADA por D-03)");
  assert.equal(d[2].frase, "Conta separada por município.");
});

test("primeiraFrase corta no tamanho máximo", () => {
  assert.equal(primeiraFrase("Uma frase longa demais para caber aqui sem ponto final nenhum", 20), "Uma frase longa d...");
});

test("ADRs vêm de docs/adr com número e título", () => {
  assert.deepEqual(listarAdrs(FIXTURE), [{ numero: "0001", arquivo: "docs/adr/0001-isolamento-de-fixture.md", titulo: "ADR 0001: Isolamento de fixture" }]);
});

/* ---------- Veredito e risco aceito ---------- */

test("lerVeredito: campo, tabela e fail-closed", () => {
  assert.equal(lerVeredito("---\nveredito: PASS\n---").veredito, "PASS");
  assert.equal(lerVeredito("**Veredito:** FAIL").veredito, "FAIL");
  assert.equal(lerVeredito("- Veredito final: BLOCKED\n- Veredito: PASS").veredito, "PASS", "a última ocorrência decide");
  // Modelo da skill validar-etapa: tabela de rodadas (a mais nova no topo) e depois a tabela de dimensões, que também tem coluna Veredito.
  const modelo = [
    "# VEREDITO de V2-F00-E04",
    "Situação atual: VALIDADA",
    "| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "| 2 | 2026-10-08 | def5678 | def5678 | PASS | aaaaaaa | bbbbbbb | ccccccc |",
    "| 1 | 2026-10-07 | abc1234 | abc1234 | FAIL | aaaaaaa | bbbbbbb | ccccccc |",
    "",
    "### Dimensões",
    "| Dimensão | Validador | Modelo | Veredito |",
    "| --- | --- | --- | --- |",
    "| QA | qa | sonnet | FAIL |",
  ].join("\n");
  const lido = lerVeredito(modelo);
  assert.equal(lido.veredito, "PASS", "vale a primeira linha da tabela de rodadas, e não a de dimensões");
  assert.equal(lido.fonte, "tabela de rodadas");
  assert.equal(lido.rodadas.length, 2);
  assert.equal(lido.rodadas[0]["politica_validacao_sha"], "aaaaaaa");
  assert.equal(lerVeredito(modelo.replace("| 2 | 2026-10-08 | def5678 | def5678 | PASS", "| 2 | 2026-10-08 | def5678 | def5678 | BLOCKED")).veredito, "BLOCKED");
  // Tabela qualquer com coluna veredito: a última linha, e FAIL ou BLOCKED na linha reprova.
  const generica = ["| Dimensão | qa | Veredito |", "| --- | --- | --- |", "| x | PASS | PASS |", "| y | FAIL | PASS |"].join("\n");
  assert.deepEqual(lerVeredito(generica).veredito, "FAIL");
  assert.equal(lerVeredito("Tudo certo, parece correto.").veredito, null);
  assert.equal(lerVeredito("").veredito, null);
});

test("lerRiscoAceito lê critério, validade e quem aceitou", () => {
  const r = lerRiscoAceito("# Risco\n- **Critério:** pentest externo\n- **Validade:** G05\n- **Quem aceitou:** Rafael\n");
  assert.deepEqual(r, { criterio: "pentest externo", validade: "G05", aceitoPor: "Rafael", encerrado: false });
  assert.equal(lerRiscoAceito("- Status: EXPIRADO").encerrado, true);
});

/* ---------- Repositório real ---------- */

test("repositório real: as 618 etapas dos arquivos batem com as do STATUS, sem duplicata", () => {
  const status = lerStatusDoRepositorio(RAIZ_REAL);
  const doStatus = status.etapas.map((e) => e.id);
  const dosArquivos = todasAsEtapasDosArquivos(RAIZ_REAL).map((e) => e.id);
  assert.equal(new Set(dosArquivos).size, dosArquivos.length, "ID repetido nos arquivos de fase");
  assert.deepEqual([...doStatus].sort(), [...dosArquivos].sort());
  assert.ok(doStatus.length >= 618);
  assert.equal(status.etapas.filter((e) => e.statusDesconhecido).length, 0, "status de etapa fora da política");
  assert.equal(status.ordem.length, 36);
  assert.equal(status.gates.length, 36);
});

test("repositório real: toda etapa tem o mesmo conjunto de campos", () => {
  const todas = todasAsEtapasDosArquivos(RAIZ_REAL);
  const base = Object.keys(todas[0].campos).sort();
  assert.equal(base.length, 28, "25 linhas de campo, uma delas com 4 campos juntos");
  for (const e of todas) {
    assert.deepEqual(Object.keys(e.campos).sort(), base, `campos de ${e.id}`);
  }
});

test("repositório real: toda fase tem cabeçalho e todo gate tem bloco com itens", () => {
  const status = lerStatusDoRepositorio(RAIZ_REAL);
  for (const o of status.ordem) {
    const cab = cabecalhoDaFase(o.fase, RAIZ_REAL);
    assert.ok(cab, `cabeçalho da ${o.fase}`);
    assert.equal(cab.gate, o.gate, `gate declarado no cabeçalho da ${o.fase}`);
    const gate = blocoDoGate(o.gate, RAIZ_REAL);
    assert.ok(gate && gate.itens.length > 0, `bloco do ${o.gate}`);
  }
});

test("repositório real: V2-F00-E04, decisões e ADRs", () => {
  const b = localizarEtapa("V2-F00-E04", RAIZ_REAL);
  assert.equal(b.arquivo, "docs/roadmap-v2/03-fase-00-estabilizacao.md");
  assert.match(b.titulo, /^Religar a vigência/);
  assert.equal(b.campos["Risco"], "alto");
  assert.deepEqual(dependenciasDaEtapa(b).etapas, ["V2-F00-E01", "V2-F00-E02"]);
  const decisoes = lerDecisoes(RAIZ_REAL);
  assert.ok(decisoes.length >= 30);
  assert.ok(decisoes.some((d) => d.id === "D-30"));
  assert.ok(listarAdrs(RAIZ_REAL).length >= 8);
  assert.ok(GATE_APROVADO.has("APROVADO"));
});
