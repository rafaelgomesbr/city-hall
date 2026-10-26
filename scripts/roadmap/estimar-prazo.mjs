#!/usr/bin/env node
/**
 * Estimativa de prazo da V2, por fase, por etapa e para o total.
 *
 * Não é cronograma prometido: é uma conta, com as premissas à vista, a partir de
 * três fontes (nada vem da conversa):
 *   1. o tamanho que cada etapa declara no roadmap (S, M, L viram pontos);
 *   2. o status registrado no STATUS (o que já foi entregue e o que falta);
 *   3. o RITMO MEDIDO: pontos entregues desde o início da implementação, divididos
 *      pelos dias corridos descontados os dias de montagem únicos do sistema de validação.
 * Os parâmetros (cenários, esperas externas, meta) ficam em
 * docs/relatorios-v2/modelo/estimativa-parametros.json e são premissas, não fatos.
 *
 * Uso:
 *   node scripts/roadmap/estimar-prazo.mjs --hoje 2026-10-13 --saida docs/relatorios-v2/semanais/2026-10-13-estimativa.json [--csv arquivo.csv]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  RAIZ,
  GATE_APROVADO,
  fasesEmOrdem,
  lerStatusDoRepositorio,
  todasAsEtapasDosArquivos,
} from "./roadmap.mjs";

const DIA = 86400000;

/** Status a partir do qual o trabalho de implementação conta como entregue ao revisor. */
const STATUS_ENTREGUE = new Set([
  "IMPLEMENTADA",
  "EM VALIDAÇÃO",
  "VALIDADA",
  "VALIDADA COM PENDÊNCIA HUMANA",
  "ACEITA",
  "CONCLUÍDA",
  "CONCLUÍDA COM RISCO ACEITO",
]);

export function lerParametros(raiz = RAIZ) {
  return JSON.parse(readFileSync(join(raiz, "docs", "relatorios-v2", "modelo", "estimativa-parametros.json"), "utf8"));
}

export function paraData(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function paraIso(data) {
  return data.toISOString().slice(0, 10);
}

export function somarDias(data, dias) {
  return new Date(data.getTime() + Math.round(dias * DIA));
}

export function diasEntre(a, b) {
  return (b.getTime() - a.getTime()) / DIA;
}

export function pontosDaEtapa(etapa, parametros) {
  const tamanho = (etapa.tamanho ?? "M").trim().toUpperCase();
  const tabela = parametros.pontosPorTamanho;
  return tabela[tamanho] ?? tabela[tamanho[0]] ?? tabela.M;
}

/**
 * @param {{ etapas: Array<{id:string,fase:string,titulo:string,tamanho:string,status:string,paralelizavel?:boolean}>,
 *           ordem: Array<{fase:string,nome:string,gate:string}>,
 *           gates: Record<string,string>, hoje: string, parametros: object, meta?: string }} entrada
 */
export function estimar({ etapas, ordem, gates, hoje, parametros, meta }) {
  const dataHoje = paraData(hoje);
  const dataMeta = paraData(meta ?? parametros.meta);
  const inicio = paraData(parametros.inicioDaImplementacao);

  const comPontos = etapas.map((e) => ({ ...e, pontos: pontosDaEtapa(e, parametros) }));
  const entregues = comPontos.filter((e) => STATUS_ENTREGUE.has(e.status));
  const pontosEntregues = entregues.reduce((s, e) => s + e.pontos, 0);
  const diasDeTrabalho = Math.max(1, diasEntre(inicio, dataHoje) + 1 - parametros.diasDeMontagemUnicos);
  const ritmoMedidoPorDia = pontosEntregues > 0 ? pontosEntregues / diasDeTrabalho : parametros.ritmoDeReserva.pontosPorSemana / 7;

  const pendentes = comPontos.filter((e) => !STATUS_ENTREGUE.has(e.status) && e.status !== "CANCELADA");
  const pontosPendentes = pendentes.reduce((s, e) => s + e.pontos, 0);
  const fasesAbertas = ordem.filter((o) => !GATE_APROVADO.has(gates[o.fase] ?? ""));
  const faseAtual = fasesAbertas[0]?.fase ?? null;
  const totalDeEsperasDefault = (cenario) =>
    fasesAbertas.reduce(
      (s, o) => s + (parametros.esperasExternasEmDias[o.fase] ?? 0) * cenario.fatorDasEsperasExternas,
      0,
    );

  /**
   * Um cenário. `fracaoDaEsperaQueSobrepoe` (0 a 1) é a parte da espera de cada gate e da espera externa que
   * acontece EM PARALELO com o trabalho da fase seguinte (validação e aprovação em lote, contratação e
   * homologação adiantadas). Zero é o processo de hoje: fases e gates estritamente em sequência.
   */
  const rodarCenario = (cen) => {
    const ritmoPorDia = ritmoMedidoPorDia * cen.fatorDoRitmo;
    const sobrepoe = Math.min(1, Math.max(0, cen.fracaoDaEsperaQueSobrepoe ?? 0));
    let cursor = dataHoje;
    const fases = [];
    for (const o of fasesAbertas) {
      const daFase = comPontos.filter((e) => e.fase === o.fase);
      const pend = daFase.filter((e) => !STATUS_ENTREGUE.has(e.status) && e.status !== "CANCELADA");
      const pontosFase = daFase.reduce((s, e) => s + e.pontos, 0);
      const pontosPend = pend.reduce((s, e) => s + e.pontos, 0);
      const trabalhoDias = pontosPend / ritmoPorDia;
      const esperaDias = (parametros.esperasExternasEmDias[o.fase] ?? 0) * cen.fatorDasEsperasExternas;
      const gateDias = o.fase === faseAtual ? cen.diasParaFecharAFaseAtual : cen.diasEntreCandidatoEGate;
      const inicioFase = cursor;
      const fimTrabalho = somarDias(inicioFase, trabalhoDias);
      const gate = somarDias(fimTrabalho, esperaDias + gateDias);
      // A fase atual não sobrepõe nada: o gate dela é o próximo passo concreto.
      const esperaNoCaminho = o.fase === faseAtual ? esperaDias + gateDias : (esperaDias + gateDias) * (1 - sobrepoe);
      // Data de cada etapa pendente: pontos acumulados dentro da fase, na ordem do roadmap.
      let acumulado = 0;
      const porEtapa = pend.map((e) => {
        acumulado += e.pontos;
        return { id: e.id, entrega: paraIso(somarDias(inicioFase, acumulado / ritmoPorDia)) };
      });
      fases.push({
        fase: o.fase,
        nome: o.nome,
        gate: o.gate,
        etapas: daFase.length,
        etapasPendentes: pend.length,
        pontos: pontosFase,
        pontosPendentes: pontosPend,
        inicio: paraIso(inicioFase),
        fimDoTrabalho: paraIso(fimTrabalho),
        esperaExternaDias: Math.round(esperaDias),
        gatePrevisto: paraIso(gate),
        etapasPrevistas: porEtapa,
      });
      cursor = somarDias(fimTrabalho, esperaNoCaminho);
    }
    const fimTotal = fases.length ? fases.map((f) => f.gatePrevisto).sort().at(-1) : paraIso(dataHoje);
    const cabemAteMeta = fases.filter((f) => paraData(f.gatePrevisto) <= dataMeta);
    const emCurso = fases.find((f) => paraData(f.gatePrevisto) > dataMeta && paraData(f.inicio) <= dataMeta) ?? null;
    // Etapas "prontas até a meta": as das fases com gate previsto até a meta, mais, na fase em curso, as já
    // entregues e as previstas até a meta. (Pronta aqui é entregue ao revisor, não concluída.)
    const entreguesDaFase = (fase) => comPontos.filter((e) => e.fase === fase && STATUS_ENTREGUE.has(e.status)).length;
    let etapasAteMeta = cabemAteMeta.reduce((s, f) => s + f.etapas, 0);
    if (emCurso) etapasAteMeta += entreguesDaFase(emCurso.fase) + emCurso.etapasPrevistas.filter((x) => paraData(x.entrega) <= dataMeta).length;
    return {
      parametros: cen,
      ritmoPontosPorSemana: Number((ritmoPorDia * 7).toFixed(1)),
      fimTotal,
      diasAteOFim: Math.round(diasEntre(dataHoje, paraData(fimTotal))),
      fases,
      ateAMeta: {
        fasesComGateAteAMeta: cabemAteMeta.map((f) => f.fase),
        faseEmCursoNaMeta: emCurso ? emCurso.fase : null,
        etapasPrevistasAteAMeta: etapasAteMeta,
      },
    };
  };

  const cenarios = {};
  for (const [nome, cen] of Object.entries(parametros.cenarios)) cenarios[nome] = rodarCenario(cen);
  // Referência: o processo de hoje, sem nenhuma alavanca (mesmo ritmo da fase atual, gates em sequência).
  const referencia = parametros.cenarioDeReferencia ? rodarCenario(parametros.cenarioDeReferencia) : null;

  // O que precisaria ser verdade para entregar tudo até a meta.
  const diasAteAMeta = Math.max(1, diasEntre(dataHoje, dataMeta));
  const prov = parametros.cenarios.provavel;
  const sobrepoeProv = Math.min(1, Math.max(0, prov.fracaoDaEsperaQueSobrepoe ?? 0));
  // Esperas no caminho crítico: gates e esperas externas das fases depois da atual, menos a parte sobreposta,
  // mais o fechamento da fase atual (que não sobrepõe nada).
  const esperasProvaveis =
    (totalDeEsperasDefault(prov) + Math.max(0, fasesAbertas.length - 1) * prov.diasEntreCandidatoEGate) * (1 - sobrepoeProv) + prov.diasParaFecharAFaseAtual;
  const diasLivresParaTrabalho = diasAteAMeta - esperasProvaveis;
  const necessario = {
    meta: paraIso(dataMeta),
    diasAteAMeta: Math.round(diasAteAMeta),
    pontosPendentes,
    ritmoNecessarioSemEsperaPorSemana: Number(((pontosPendentes / diasAteAMeta) * 7).toFixed(1)),
    vezesOMedidoSemEspera: Number((pontosPendentes / diasAteAMeta / ritmoMedidoPorDia).toFixed(1)),
    esperasProvaveisEmDias: Math.round(esperasProvaveis),
    diasLivresComEsperasProvaveis: Math.round(diasLivresParaTrabalho),
    ritmoNecessarioComEsperasProvaveisPorSemana: diasLivresParaTrabalho > 0 ? Number(((pontosPendentes / diasLivresParaTrabalho) * 7).toFixed(1)) : null,
    vezesOMedidoComEsperasProvaveis: diasLivresParaTrabalho > 0 ? Number((pontosPendentes / diasLivresParaTrabalho / ritmoMedidoPorDia).toFixed(1)) : null,
    asEsperasSozinhasPassamDaMeta: diasLivresParaTrabalho <= 0,
    gatesAbertos: fasesAbertas.length,
    etapasParalelizaveis: comPontos.filter((e) => e.paralelizavel).length,
    totalDeEtapas: comPontos.length,
  };

  return {
    hoje,
    meta: paraIso(dataMeta),
    ritmoMedido: {
      pontosEntregues,
      etapasEntregues: entregues.length,
      diasDeTrabalho: Number(diasDeTrabalho.toFixed(1)),
      pontosPorSemana: Number((ritmoMedidoPorDia * 7).toFixed(1)),
      desde: parametros.inicioDaImplementacao,
      diasDeMontagemDescontados: parametros.diasDeMontagemUnicos,
    },
    totais: { etapas: comPontos.length, pontos: comPontos.reduce((s, e) => s + e.pontos, 0), etapasPendentes: pendentes.length, pontosPendentes },
    cenarios,
    referencia,
    necessario,
    etapas: comPontos.map((e) => ({ id: e.id, fase: e.fase, titulo: e.titulo, tamanho: e.tamanho, status: e.status, pontos: e.pontos, paralelizavel: Boolean(e.paralelizavel) })),
    parametros,
  };
}

/** Lê o repositório e devolve a estimativa. */
export function estimarDoRepositorio({ hoje, raiz = RAIZ, meta } = {}) {
  const parametros = lerParametros(raiz);
  const status = lerStatusDoRepositorio(raiz);
  const ordem = fasesEmOrdem(status).map((o) => ({ fase: o.fase, nome: o.nome, gate: o.gate }));
  const gates = Object.fromEntries(status.gates.map((g) => [g.fase, g.status]));
  const statusPorId = new Map(status.etapas.map((e) => [e.id, e.status]));
  const etapas = todasAsEtapasDosArquivos(raiz).map((e) => ({
    id: e.id,
    fase: e.fase,
    titulo: e.titulo,
    tamanho: (e.campos.Tamanho ?? "M").trim().split(/\s+/)[0],
    status: statusPorId.get(e.id) ?? "PENDENTE",
    paralelizavel: /^sim/i.test((e.campos["Paralelizável"] ?? "").trim()),
  }));
  return estimar({ etapas, ordem, gates, hoje, parametros, meta });
}

export function paraCsv(resultado, etapas) {
  const linhas = ["etapa;fase;tamanho;status;entrega_otimista;entrega_provavel;entrega_conservadora"];
  const datas = {};
  for (const [nome, c] of Object.entries(resultado.cenarios)) {
    for (const f of c.fases) for (const x of f.etapasPrevistas) (datas[x.id] ??= {})[nome] = x.entrega;
  }
  for (const e of etapas) {
    const d = datas[e.id] ?? {};
    linhas.push([e.id, e.fase, e.tamanho, e.status, d.otimista ?? "", d.provavel ?? "", d.conservador ?? ""].join(";"));
  }
  return linhas.join("\n") + "\n";
}

function principal(argv) {
  const args = argv.slice(2);
  const op = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--hoje") op.hoje = args[++i];
    else if (a === "--meta") op.meta = args[++i];
    else if (a === "--saida") op.saida = args[++i];
    else if (a === "--csv") op.csv = args[++i];
    else {
      console.error(`Argumento não reconhecido: ${a}\nUso: node scripts/roadmap/estimar-prazo.mjs --hoje AAAA-MM-DD [--meta AAAA-MM-DD] [--saida arq.json] [--csv arq.csv]`);
      return 2;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(op.hoje ?? "")) {
    console.error("Informe --hoje AAAA-MM-DD.");
    return 2;
  }
  const resultado = estimarDoRepositorio({ hoje: op.hoje, meta: op.meta });
  if (op.saida) writeFileSync(resolve(op.saida), JSON.stringify(resultado, null, 2) + "\n");
  if (op.csv) {
    const etapas = todasAsEtapasDosArquivos().map((e) => ({
      id: e.id,
      fase: e.fase,
      tamanho: (e.campos.Tamanho ?? "M").trim().split(/\s+/)[0],
      status: (lerStatusDoRepositorio().etapas.find((x) => x.id === e.id) ?? {}).status ?? "PENDENTE",
    }));
    writeFileSync(resolve(op.csv), paraCsv(resultado, etapas));
  }
  const r = resultado;
  console.log(
    `Ritmo medido: ${r.ritmoMedido.pontosPorSemana} pontos por semana (${r.ritmoMedido.etapasEntregues} etapas em ${r.ritmoMedido.diasDeTrabalho} dias).`,
  );
  for (const [nome, c] of Object.entries(r.cenarios)) console.log(`${nome}: fim em ${c.fimTotal} (${c.diasAteOFim} dias), até a meta: ${c.ateAMeta.fasesComGateAteAMeta.join(", ") || "nenhuma fase"}`);
  console.log(`Para ${r.meta}: ${r.necessario.vezesOMedidoSemEspera}x o ritmo medido sem nenhuma espera; ${r.necessario.asEsperasSozinhasPassamDaMeta ? "as esperas sozinhas já passam da meta" : r.necessario.vezesOMedidoComEsperasProvaveis + "x com as esperas prováveis"}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
