import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { estimar } from "./estimar-prazo.mjs";
import { RAIZ } from "./roadmap.mjs";
import {
  agruparPorBloco,
  conferirTextos,
  contarStatus,
  curto,
  esc,
  estatisticasPorFase,
  formatarData,
  mesAno,
  montarRelatorio,
  TEXTO_DO_STATUS,
} from "./relatorio-visual.mjs";

const PARAMETROS = {
  meta: "2026-12-31",
  inicioDaImplementacao: "2026-10-05",
  diasDeMontagemUnicos: 2,
  pontosPorTamanho: { XS: 0.5, S: 1, M: 2, L: 4 },
  ritmoDeReserva: { pontosPorSemana: 14 },
  cenarios: {
    otimista: { fatorDoRitmo: 1, diasEntreCandidatoEGate: 1, fatorDasEsperasExternas: 0.5, diasParaFecharAFaseAtual: 2 },
    provavel: { fatorDoRitmo: 0.5, diasEntreCandidatoEGate: 2, fatorDasEsperasExternas: 1, diasParaFecharAFaseAtual: 4 },
    conservador: { fatorDoRitmo: 0.3, diasEntreCandidatoEGate: 4, fatorDasEsperasExternas: 1.5, diasParaFecharAFaseAtual: 8 },
  },
  esperasExternasEmDias: { F02: 10 },
  esperasExternasMotivo: { F02: "espera de teste" },
  premissas: ["Premissa de teste."],
};

const STATUS = {
  "V2-F00-E01": "IMPLEMENTADA",
  "V2-F00-E02": "VALIDADA",
  "V2-F00-E03": "VALIDADA COM PENDÊNCIA HUMANA",
  "V2-F00-E04": "REPROVADA",
  "V2-F01-E01": "PENDENTE",
  "V2-F01-E02": "PENDENTE",
  "V2-F02-E01": "PENDENTE",
};

const ETAPAS = Object.entries(STATUS).map(([id, status], i) => ({
  id,
  fase: /^V2-(F\d\d)/.exec(id)[1],
  titulo: `Etapa de teste ${i + 1}`,
  tamanho: i % 2 ? "M" : "S",
  status,
  paralelizavel: i % 2 === 0,
}));
const ORDEM = [
  { fase: "F00", nome: "Estabilização", gate: "G00" },
  { fase: "F01", nome: "Fundação", gate: "G01" },
  { fase: "F02", nome: "API", gate: "G02" },
];
const GATES = { F00: "EM ANDAMENTO", F01: "NÃO INICIADO", F02: "NÃO INICIADO" };
const COLETA = {
  periodo: { desde: "2026-10-08", ate: "2026-10-13" },
  base: { sha: "a".repeat(40), shaCurto: "aaaaaaa", ramo: "v2/f00" },
  fase: { fase: "F00", nome: "Estabilização", ordem: 1, totalDeFases: 3, gate: "G00", statusDoGate: "EM ANDAMENTO", etapas: 4 },
  statusPorEtapa: STATUS,
  etapasDaFase: ETAPAS.filter((e) => e.fase === "F00").map((e) => ({ id: e.id, titulo: e.titulo, status: e.status })),
};
const BLOCOS = [
  { nome: "Base", fases: ["F00"], entrega: "x" },
  { nome: "Resto", fases: ["F01", "F02"], entrega: "y" },
];
const LINHA = { antes: "Antes da V2: teste.", marcos: [{ data: "05/10", iso: "2026-10-05", titulo: "Começo", texto: "Início da fase 1.", tipo: "marco" }] };
const EDITORIAL = {
  lead: "Frase de abertura de teste. Nenhuma etapa está concluída ainda.",
  aSeguir: { titulo: "Próximo", texto: "Segunda validação." },
  validacao: { lead: "Texto.", achados: [{ titulo: "Achado", texto: "descrição.", selo: "corrigido" }] },
  decisoes: [{ quem: "Rafael", titulo: "Gate", texto: "Aprovar." }],
};
const CSS = ":root{--bg:#fff}";

function montar(extra = {}) {
  const estimativa = estimar({ etapas: ETAPAS, ordem: ORDEM, gates: GATES, hoje: "2026-10-13", parametros: PARAMETROS });
  return montarRelatorio({ coleta: COLETA, estimativa, editorial: EDITORIAL, linha: LINHA, blocos: BLOCOS, css: CSS, ...extra });
}

test("esc protege o HTML e formatarData omite o ano de referência", () => {
  assert.equal(esc('<b a="1">&'), "&lt;b a=&quot;1&quot;&gt;&amp;");
  assert.equal(formatarData("2026-10-13", 2026), "13/10");
  assert.equal(formatarData("2027-08-11", 2026), "11/08/2027");
  assert.equal(mesAno("2027-08-11"), "ago/2027");
  assert.equal(curto("a".repeat(10), 20), "aaaaaaaaaa");
  assert.match(curto("palavra ".repeat(30), 40), /\.\.\.$/);
});

test("contagens: validadas incluem as com pendência humana, concluídas só as concluídas", () => {
  const c = contarStatus(STATUS);
  assert.equal(c.total, 7);
  assert.equal(c.validadas, 2);
  assert.equal(c.comPendenciaHumana, 1);
  assert.equal(c.concluidas, 0);
  assert.equal(c.aguardam, 1);
  assert.equal(c.problema, 1);
  assert.equal(c.pendentes, 3);
  assert.equal(c.emAndamento, 4);
});

test("os números do relatório vêm da coleta, não do texto", () => {
  const { html, contagens } = montar();
  assert.equal(contagens.total, 7);
  assert.match(html, /<div class="card kpi"><b>7<\/b><span>etapas no plano da V2/);
  assert.match(html, /<div class="card kpi ok"><b>2<\/b>/);
  assert.match(html, /<div class="card kpi"><b>0<\/b><span>concluídas/);
});

test("quadro de etapas: um bloco por etapa da fase atual, com a classe do status", () => {
  const { html } = montar();
  assert.equal((html.match(/class="wt /g) ?? []).length, 4);
  assert.match(html, /class="wt warn"[^>]*>E01/);
  assert.match(html, /class="wt ok"[^>]*>E02/);
  assert.match(html, /class="wt pend"[^>]*>E03/);
  assert.match(html, /class="wt bad"[^>]*>E04/);
});

test("blocos: soma de etapas e marca de onde estamos", () => {
  const g = agruparPorBloco({ blocos: BLOCOS, estatisticasPorFase: estatisticasPorFase(STATUS), faseAtual: "F00" });
  assert.deepEqual(g.map((b) => [b.total, b.feitas, b.aqui]), [[4, 4, true], [3, 0, false]]);
  assert.match(montar().html, /estamos aqui/);
});

test("seção de prazo traz meta, três cenários, ritmo e a tabela por etapa", () => {
  const { html } = montar();
  assert.match(html, /Prazo e estimativa de entrega/);
  assert.match(html, /Meta do Rafael/);
  assert.match(html, /31\/12\/2026/);
  assert.match(html, /Otimista: /);
  assert.match(html, /Provável: /);
  assert.match(html, /Conservador: /);
  assert.match(html, /Estimativa por fase e por etapa/);
  assert.match(html, /Como a estimativa é calculada/);
  assert.match(html, /Premissa de teste\./);
});

test("a seção de prazo diz se o cenário conservador cabe no teto desejado e compara o ritmo medido", () => {
  const dentro = montar({ estimativa: estimar({ etapas: ETAPAS, ordem: ORDEM, gates: GATES, hoje: "2026-10-13", parametros: { ...PARAMETROS, tetoDeEntregaDesejado: "2040-01-01" } }) }).html;
  assert.match(dentro, /dentro do teto desejado/);
  const fora = montar({ estimativa: estimar({ etapas: ETAPAS, ordem: ORDEM, gates: GATES, hoje: "2026-10-13", parametros: { ...PARAMETROS, tetoDeEntregaDesejado: "2026-10-20" } }) }).html;
  assert.match(fora, /FORA do teto desejado/);
  assert.match(dentro, /O que precisa ser verdade para essas datas/);
  assert.match(dentro, /O ritmo medido hoje/);
});

test("o link de saída só aparece quando pedido", () => {
  assert.doesNotMatch(montar().html, /href="\/progresso\/sair"/);
  assert.match(montar({ linkDeSaida: "/progresso/sair" }).html, /<a class="sair" href="\/progresso\/sair">Sair<\/a>/);
});

test("linha do tempo traz os marcos do arquivo e o 'a seguir' do editorial", () => {
  const { html } = montar();
  assert.match(html, /Início da fase 1\./);
  assert.match(html, /class="prox"/);
  assert.match(html, /Antes da V2: teste\./);
});

test("o HTML do texto editorial é escapado", () => {
  const { html } = montar({ editorial: { ...EDITORIAL, lead: 'Aberto <script>alert(1)</script>. Nenhuma concluída.' } });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test("conferência: travessão, 'pronto', 'entregue' e 'concluído' sem lastro reprovam", () => {
  const conferir = (texto, concluidas = 0) => conferirTextos({ editorial: { lead: texto }, linha: { marcos: [] }, concluidas });
  assert.equal(conferir("Tudo certo, sem problema.").length, 0);
  assert.equal(conferir("Isto \u2014 aquilo.").length, 1);
  assert.equal(conferir("A fase está pronta.").length, 1);
  assert.equal(conferir("As etapas ficam prontas para validar.").length, 0);
  assert.equal(conferir("12 etapas entregues.").length, 1);
  assert.equal(conferir("Nenhuma etapa foi entregue ainda.").length, 0);
  assert.equal(conferir("A etapa está concluída.").length, 1);
  assert.equal(conferir("A etapa está concluída.", 3).length, 0);
  assert.equal(conferir("Nenhuma etapa está concluída ainda.").length, 0);
  assert.equal(conferir("token: abc123def456").length, 1);
});

test("conferência olha também a linha do tempo", () => {
  const p = conferirTextos({ editorial: {}, linha: { antes: "ok", marcos: [{ texto: "Feito \u2014 sim." }] }, concluidas: 0 });
  assert.equal(p.length, 1);
  assert.match(p[0], /linha\.marcos\[0\]\.texto/);
});

test("vocabulário cobre todos os status do roadmap", () => {
  for (const s of ["PENDENTE", "EM ANDAMENTO", "IMPLEMENTADA", "EM VALIDAÇÃO", "VALIDADA", "VALIDADA COM PENDÊNCIA HUMANA", "REPROVADA", "BLOQUEADA", "CONCLUÍDA", "CONCLUÍDA COM RISCO ACEITO", "CANCELADA"]) {
    assert.ok(TEXTO_DO_STATUS[s], s);
  }
  assert.equal(TEXTO_DO_STATUS.REPROVADA, "em correção");
});

test("o texto editorial e a linha do tempo REAIS desta semana passam na conferência", () => {
  const editorial = JSON.parse(readFileSync(join(RAIZ, "docs", "relatorios-v2", "semanais", "2026-10-13-editorial.json"), "utf8"));
  const linha = JSON.parse(readFileSync(join(RAIZ, "docs", "relatorios-v2", "semanais", "linha-do-tempo.json"), "utf8"));
  assert.deepEqual(conferirTextos({ editorial, linha, concluidas: 0 }), []);
});

test("blocos reais cobrem as 36 fases, cada uma uma vez", () => {
  const { blocos } = JSON.parse(readFileSync(join(RAIZ, "docs", "relatorios-v2", "modelo", "blocos.json"), "utf8"));
  const fases = blocos.flatMap((b) => b.fases);
  assert.equal(fases.length, 36);
  assert.equal(new Set(fases).size, 36);
});
