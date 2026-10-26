import { test } from "node:test";
import assert from "node:assert/strict";
import { estimar, estimarDoRepositorio, paraCsv, pontosDaEtapa, somarDias, paraData, paraIso } from "./estimar-prazo.mjs";

const PARAMETROS = {
  meta: "2026-12-31",
  inicioDaImplementacao: "2026-10-05",
  diasDeMontagemUnicos: 2,
  pontosPorTamanho: { XS: 0.5, S: 1, M: 2, L: 4 },
  ritmoDeReserva: { pontosPorSemana: 14 },
  cenarios: {
    otimista: { fatorDoRitmo: 1, diasEntreCandidatoEGate: 1, fatorDasEsperasExternas: 0.5, diasParaFecharAFaseAtual: 2 },
    provavel: { fatorDoRitmo: 0.5, diasEntreCandidatoEGate: 2, fatorDasEsperasExternas: 1, diasParaFecharAFaseAtual: 4 },
  },
  esperasExternasEmDias: { F02: 10 },
};

// 10 pontos entregues em 7 dias de trabalho (05/10 a 13/10 menos 2 dias de montagem): 10/7 por dia.
const ETAPAS = [
  { id: "V2-F00-E01", fase: "F00", titulo: "a", tamanho: "M", status: "IMPLEMENTADA" },
  { id: "V2-F00-E02", fase: "F00", titulo: "b", tamanho: "M", status: "VALIDADA" },
  { id: "V2-F00-E03", fase: "F00", titulo: "c", tamanho: "L", status: "VALIDADA COM PENDÊNCIA HUMANA" },
  { id: "V2-F01-E01", fase: "F01", titulo: "d", tamanho: "S", status: "PENDENTE" },
  { id: "V2-F01-E02", fase: "F01", titulo: "e", tamanho: "M", status: "PENDENTE" },
  { id: "V2-F02-E01", fase: "F02", titulo: "f", tamanho: "L", status: "PENDENTE" },
];
const ORDEM = [
  { fase: "F00", nome: "Estabilização", gate: "G00" },
  { fase: "F01", nome: "Fundação", gate: "G01" },
  { fase: "F02", nome: "API", gate: "G02" },
];
const GATES = { F00: "EM ANDAMENTO", F01: "NÃO INICIADO", F02: "NÃO INICIADO" };

function rodar(extra = {}) {
  return estimar({ etapas: ETAPAS, ordem: ORDEM, gates: GATES, hoje: "2026-10-13", parametros: PARAMETROS, ...extra });
}

test("pontos: S=1, M=2, L=4, tamanho desconhecido cai em M", () => {
  assert.equal(pontosDaEtapa({ tamanho: "S" }, PARAMETROS), 1);
  assert.equal(pontosDaEtapa({ tamanho: "l" }, PARAMETROS), 4);
  assert.equal(pontosDaEtapa({ tamanho: "XS" }, PARAMETROS), 0.5);
  assert.equal(pontosDaEtapa({ tamanho: "?" }, PARAMETROS), 2);
});

test("ritmo medido: pontos entregues pelos dias corridos menos a montagem", () => {
  const r = rodar();
  assert.equal(r.ritmoMedido.pontosEntregues, 8);
  assert.equal(r.ritmoMedido.diasDeTrabalho, 7);
  assert.equal(r.ritmoMedido.pontosPorSemana, 8);
});

test("sem nada entregue, usa o ritmo de reserva e não divide por zero", () => {
  const etapas = ETAPAS.map((e) => ({ ...e, status: "PENDENTE" }));
  const r = rodar({ etapas });
  assert.equal(r.ritmoMedido.pontosEntregues, 0);
  assert.equal(r.ritmoMedido.pontosPorSemana, 14);
  assert.ok(Number.isFinite(paraData(r.cenarios.provavel.fimTotal).getTime()));
});

test("as fases são sequenciais: cada uma começa quando o gate da anterior termina", () => {
  const c = rodar().cenarios.otimista;
  assert.deepEqual(c.fases.map((f) => f.fase), ["F00", "F01", "F02"]);
  assert.equal(c.fases[1].inicio, c.fases[0].gatePrevisto);
  assert.equal(c.fases[2].inicio, c.fases[1].gatePrevisto);
  assert.equal(c.fimTotal, c.fases[2].gatePrevisto);
});

test("fase atual sem etapa pendente só espera o fechamento do gate", () => {
  const c = rodar().cenarios.otimista;
  assert.equal(c.fases[0].pontosPendentes, 0);
  assert.equal(c.fases[0].gatePrevisto, paraIso(somarDias(paraData("2026-10-13"), 2)));
});

test("espera externa soma depois do trabalho, escalada pelo cenário", () => {
  const o = rodar().cenarios.otimista.fases[2];
  const p = rodar().cenarios.provavel.fases[2];
  assert.equal(o.esperaExternaDias, 5);
  assert.equal(p.esperaExternaDias, 10);
});

test("cenário mais lento nunca termina antes do mais rápido", () => {
  const r = rodar();
  assert.ok(paraData(r.cenarios.provavel.fimTotal) >= paraData(r.cenarios.otimista.fimTotal));
});

test("cada etapa pendente tem data, em ordem dentro da fase, e a última cai no fim do trabalho", () => {
  const f = rodar().cenarios.otimista.fases[1];
  assert.equal(f.etapasPrevistas.length, 2);
  assert.ok(f.etapasPrevistas[0].entrega <= f.etapasPrevistas[1].entrega);
  assert.equal(f.etapasPrevistas[1].entrega, f.fimDoTrabalho);
});

test("meta: conta fases com gate até a data e diz o ritmo necessário", () => {
  const r = rodar({ meta: "2026-10-20" });
  assert.equal(r.necessario.meta, "2026-10-20");
  assert.ok(r.necessario.ritmoNecessarioSemEsperaPorSemana > 0);
  assert.ok(r.cenarios.otimista.ateAMeta.fasesComGateAteAMeta.includes("F00"));
  const longe = rodar({ meta: "2030-01-01" });
  assert.equal(longe.necessario.asEsperasSozinhasPassamDaMeta, false);
  assert.deepEqual(longe.cenarios.otimista.ateAMeta.fasesComGateAteAMeta, ["F00", "F01", "F02"]);
});

test("meta muito próxima: as esperas sozinhas passam dela", () => {
  assert.equal(rodar({ meta: "2026-10-20" }).necessario.asEsperasSozinhasPassamDaMeta, true);
});

test("fase com gate aprovado sai da conta", () => {
  const r = rodar({ gates: { ...GATES, F00: "APROVADO" } });
  assert.deepEqual(r.cenarios.otimista.fases.map((f) => f.fase), ["F01", "F02"]);
});

test("CSV: uma linha por etapa, com a data de cada cenário quando pendente", () => {
  const r = rodar();
  const csv = paraCsv(r, ETAPAS);
  const linhas = csv.trim().split("\n");
  assert.equal(linhas.length, ETAPAS.length + 1);
  assert.match(linhas[0], /^etapa;fase;tamanho;status;entrega_otimista;entrega_provavel/);
  assert.match(linhas.find((l) => l.startsWith("V2-F01-E01")), /;\d{4}-\d{2}-\d{2};\d{4}-\d{2}-\d{2};$/); // sem terceiro cenário na fixture: coluna vazia
});

test("sobrepor espera encurta o total e a fase atual não sobrepõe nada", () => {
  const sem = rodar().cenarios.provavel;
  const com = estimar({
    etapas: ETAPAS, ordem: ORDEM, gates: GATES, hoje: "2026-10-13",
    parametros: { ...PARAMETROS, cenarios: { ...PARAMETROS.cenarios, provavel: { ...PARAMETROS.cenarios.provavel, fracaoDaEsperaQueSobrepoe: 0.5 } } },
  }).cenarios.provavel;
  assert.ok(paraData(com.fimTotal) < paraData(sem.fimTotal));
  assert.equal(com.fases[0].gatePrevisto, sem.fases[0].gatePrevisto);
  // O gate da fase seguinte continua depois do trabalho dela; só o INÍCIO da seguinte é que adianta.
  assert.ok(paraData(com.fases[1].gatePrevisto) >= paraData(com.fases[1].fimDoTrabalho));
  assert.ok(paraData(com.fases[2].inicio) < paraData(sem.fases[2].inicio));
});

test("cenário de referência (sem alavancas) é calculado à parte, quando há parâmetro", () => {
  assert.equal(rodar().referencia, null);
  const r = estimar({
    etapas: ETAPAS, ordem: ORDEM, gates: GATES, hoje: "2026-10-13",
    parametros: { ...PARAMETROS, cenarioDeReferencia: { fatorDoRitmo: 0.5, diasEntreCandidatoEGate: 2, fatorDasEsperasExternas: 1, diasParaFecharAFaseAtual: 4 } },
  });
  assert.ok(r.referencia.fimTotal);
  assert.ok(paraData(r.referencia.fimTotal) >= paraData(r.cenarios.otimista.fimTotal));
});

test("repositório real: 618 etapas, 36 fases, ritmo positivo e fim depois de hoje", () => {
  const r = estimarDoRepositorio({ hoje: "2026-10-13" });
  assert.equal(r.totais.etapas, 618);
  assert.ok(r.ritmoMedido.pontosPorSemana > 0);
  for (const c of Object.values(r.cenarios)) {
    assert.ok(c.fases.length <= 36 && c.fases.length > 30);
    assert.ok(paraData(c.fimTotal) > paraData("2026-10-13"));
  }
});
