#!/usr/bin/env node
/**
 * Relatório semanal VISUAL do Defesa Civil 360 (a "cara" aprovada pelo Rafael em 2026-10-13).
 *
 * Os NÚMEROS (indicadores, barras, quadro de etapas, blocos, estimativa de prazo) são calculados aqui
 * a partir da coleta (`coletar-relatorio.mjs`) e da estimativa (`estimar-prazo.mjs`): quem redige não
 * digita número. O TEXTO (frase de abertura, achados, decisões, a seguir) vem de um JSON editorial, e a
 * linha do tempo vem de `docs/relatorios-v2/semanais/linha-do-tempo.json`, que só cresce.
 *
 * Saída: um fragmento de página para o Artifact (`<title>`, `<link>`, `<style>`, `<div class="dc">`),
 * ou, com `--completo`, um documento HTML inteiro para ver no navegador.
 *
 * Uso:
 *   node scripts/roadmap/relatorio-visual.mjs --coleta c.json --estimativa e.json --editorial ed.json --saida r.html [--completo]
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ } from "./roadmap.mjs";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIA = 86400000;

const STATUS_VALIDADO = new Set(["VALIDADA", "CONCLUÍDA", "CONCLUÍDA COM RISCO ACEITO"]);
const STATUS_CONCLUIDO = new Set(["CONCLUÍDA", "CONCLUÍDA COM RISCO ACEITO"]);
const STATUS_AGUARDA = new Set(["IMPLEMENTADA", "EM VALIDAÇÃO", "EM ANDAMENTO"]);
const STATUS_PROBLEMA = new Set(["REPROVADA", "BLOQUEADA"]);

/** Vocabulário de status em linguagem comum (política: nunca mais forte que o status registrado). */
export const TEXTO_DO_STATUS = {
  PENDENTE: "ainda não começou",
  "EM ANDAMENTO": "em andamento",
  IMPLEMENTADA: "implementada, aguarda validação",
  "EM VALIDAÇÃO": "em validação",
  VALIDADA: "validada",
  "VALIDADA COM PENDÊNCIA HUMANA": "validada, falta conferência humana",
  REPROVADA: "em correção",
  BLOQUEADA: "bloqueada",
  CONCLUÍDA: "concluída",
  "CONCLUÍDA COM RISCO ACEITO": "concluída com risco aceito",
  CANCELADA: "cancelada",
};

export function esc(texto) {
  return String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const dataDeIso = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const dd = (n) => String(n).padStart(2, "0");

/** "13/10" no ano de referência, "11/08/2027" em outro ano. */
export function formatarData(iso, anoDeReferencia) {
  const d = dataDeIso(iso);
  const base = `${dd(d.getUTCDate())}/${dd(d.getUTCMonth() + 1)}`;
  return d.getUTCFullYear() === anoDeReferencia ? base : `${base}/${d.getUTCFullYear()}`;
}

/** "ago/2027" */
export function mesAno(iso) {
  const d = dataDeIso(iso);
  return `${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}

export function curto(texto, max = 92) {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max).replace(/\s+\S*$/, "");
  return `${corte}...`;
}

const pluralizar = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- Conferência do texto editorial ---------- */

/** Problemas no texto escrito à mão (editorial e linha do tempo). Vazio quando está em ordem. */
export function conferirTextos({ editorial, linha, concluidas }) {
  const problemas = [];
  const folhas = [];
  const colher = (valor, caminho) => {
    if (typeof valor === "string") folhas.push([caminho, valor]);
    else if (Array.isArray(valor)) valor.forEach((v, i) => colher(v, `${caminho}[${i}]`));
    else if (valor && typeof valor === "object") for (const [k, v] of Object.entries(valor)) colher(v, `${caminho}.${k}`);
  };
  colher(editorial, "editorial");
  colher(linha?.marcos ?? [], "linha.marcos");
  colher(linha?.antes ?? "", "linha.antes");
  for (const [onde, texto] of folhas) {
    if (/\u2014/.test(texto)) problemas.push(`${onde}: travessão (U+2014) é proibido: use vírgula, dois pontos ou parênteses`);
    if (/\bpront[oa]s?\b/i.test(texto) && !/\b(para|prontas? para)\b/i.test(texto)) problemas.push(`${onde}: "pronto/pronta" soa mais forte que o status: diga "implementado, aguarda validação" ou "validado"`);
    if (/\bentregues?\b/i.test(texto) && !/\b(nenhum[a]?|não|ainda não)\b/i.test(texto)) problemas.push(`${onde}: "entregue" soa mais forte que o status registrado`);
    if (/concluíd/i.test(texto) && concluidas === 0 && !/\b(nenhum[a]?|não|ainda não|sem|0|só vale)\b/i.test(texto)) {
      problemas.push(`${onde}: fala em "concluído" mas nenhuma etapa está concluída no STATUS`);
    }
    if (/(segredo|senha|token|jwt)\s*[:=]\s*\S+/i.test(texto)) problemas.push(`${onde}: parece conter segredo`);
  }
  return problemas;
}

/* ---------- Cálculos a partir da coleta ---------- */

export function contarStatus(statusPorEtapa) {
  const c = { total: 0, validadas: 0, concluidas: 0, aguardam: 0, problema: 0, pendentes: 0, comPendenciaHumana: 0, cancelada: 0 };
  for (const status of Object.values(statusPorEtapa)) {
    c.total++;
    if (STATUS_CONCLUIDO.has(status)) c.concluidas++;
    if (STATUS_VALIDADO.has(status) || status === "VALIDADA COM PENDÊNCIA HUMANA") c.validadas++;
    if (status === "VALIDADA COM PENDÊNCIA HUMANA") c.comPendenciaHumana++;
    else if (STATUS_AGUARDA.has(status)) c.aguardam++;
    else if (STATUS_PROBLEMA.has(status)) c.problema++;
    else if (status === "PENDENTE") c.pendentes++;
    else if (status === "CANCELADA") c.cancelada++;
  }
  c.emAndamento = c.total - c.pendentes - c.concluidas - c.cancelada;
  return c;
}

function pct(parte, total) {
  return total === 0 ? 0 : Number(((parte / total) * 100).toFixed(3));
}

function classeDaTile(status) {
  if (STATUS_VALIDADO.has(status)) return ["ok", "✓"];
  if (status === "VALIDADA COM PENDÊNCIA HUMANA") return ["pend", "✓"];
  if (STATUS_AGUARDA.has(status)) return ["warn", "↻"];
  if (STATUS_PROBLEMA.has(status)) return ["bad", "!"];
  return ["idle", "·"];
}

/* ---------- Seções ---------- */

function secaoTopo({ coleta, contagens, editorial, anoRef }) {
  const [a, m, d] = coleta.periodo.ate.split("-");
  return `<header class="top">
  <div class="marca"><div class="brasao" aria-hidden="true">DC</div> Defesa Civil 360</div>
  <p class="eyebrow">V2 · posição em ${d}/${m}/${a}</p>
  <h1>${esc(editorial.titulo ?? "Onde estamos na V2")}</h1>
  <p class="lead">${esc(editorial.lead)}</p>
  <div class="kpis">
    <div class="card kpi"><b>${contagens.total}</b><span>etapas no plano da V2</span></div>
    <div class="card kpi acc"><b>${contagens.emAndamento}</b><span>em andamento ou além</span></div>
    <div class="card kpi ok"><b>${contagens.validadas}</b><span>validadas por revisor independente</span></div>
    <div class="card kpi"><b>${contagens.concluidas}</b><span>concluídas</span></div>
  </div>
</header>`;
}

function barra(segmentos, rotulo) {
  const itens = segmentos.filter((s) => s.n > 0);
  return `<div class="barra" role="img" aria-label="${esc(rotulo)}">${itens.map((s) => `<i class="${s.cls}" style="width:${pct(s.n, segmentos.reduce((t, x) => t + x.n, 0))}%"></i>`).join("")}</div>
    <div class="legenda">${itens.map((s) => `<span><i class="${s.cls}"></i>${s.n} ${esc(s.rotulo)}</span>`).join("")}</div>`;
}

function secaoProgresso({ coleta, contagens }) {
  const faseAtual = coleta.fase.fase;
  const daFase = Object.entries(coleta.statusPorEtapa).filter(([id]) => id.startsWith(`V2-${faseAtual}-`)).map(([, s]) => s);
  const cf = contarStatus(Object.fromEntries(daFase.map((s, i) => [i, s])));
  const seg = (c) => [
    { n: c.validadas, cls: "seg-ok", rotulo: "validadas" },
    { n: c.aguardam, cls: "seg-warn", rotulo: "implementadas, aguardam validação" },
    { n: c.problema, cls: "seg-bad", rotulo: "reprovadas ou bloqueadas" },
    { n: c.pendentes, cls: "seg-idle", rotulo: "ainda não começaram" },
  ];
  const nota = cf.comPendenciaHumana > 0 ? ` (${cf.comPendenciaHumana} esperam uma conferência humana)` : "";
  return `<section class="sec" aria-labelledby="h-prog">
  <h2 id="h-prog">Quanto já andamos</h2>
  <div class="card prog">
    <h3>O plano inteiro <em>${contagens.total} etapas</em></h3>
    ${barra(seg(contagens), `Das ${contagens.total} etapas: ${seg(contagens).filter((s) => s.n > 0).map((s) => `${s.n} ${s.rotulo}`).join(", ")}`)}
  </div>
  <div class="card prog">
    <h3>Só a fase atual, ${esc(coleta.fase.nome)} <em>${daFase.length} etapas</em></h3>
    ${barra(seg(cf), `Fase atual: ${seg(cf).filter((s) => s.n > 0).map((s) => `${s.n} ${s.rotulo}`).join(", ")}`)}
    ${nota ? `<p class="nota">${esc(`${cf.validadas} validadas${nota}`)}</p>` : ""}
  </div>
</section>`;
}

function secaoLinhaDoTempo({ linha, editorial, coleta }) {
  const marcos = [...linha.marcos].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  const itens = marcos.map((m) => `<li class="${esc(m.tipo ?? "marco")}"><span class="d">${esc(m.data)}</span><span class="t"><b>${esc(m.titulo)}</b><span>${esc(m.texto)}</span></span></li>`);
  if (editorial.aSeguir) itens.push(`<li class="prox"><span class="d">A seguir</span><span class="t"><b>${esc(editorial.aSeguir.titulo)}</b><span>${esc(editorial.aSeguir.texto)}</span></span></li>`);
  void coleta;
  return `<section class="sec" aria-labelledby="h-tl">
  <h2 id="h-tl">Linha do tempo</h2>
  ${linha.antes ? `<p class="antes">${esc(linha.antes)}</p>` : ""}
  <ol class="tl">
    ${itens.join("\n    ")}
  </ol>
</section>`;
}

function dataUri(arquivo, raiz) {
  const ext = extname(arquivo).toLowerCase();
  const tipo = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  const bytes = readFileSync(resolve(raiz, arquivo));
  return `data:${tipo};base64,${bytes.toString("base64")}`;
}

function secaoProduto({ editorial, resolverImagem }) {
  const imgs = editorial.imagens ?? [];
  if (imgs.length === 0) return "";
  const figuras = imgs.map((i) => `<figure class="shot ${i.tipo === "cel" ? "cel" : "pc"}"><img alt="${esc(i.alt)}" src="${esc(resolverImagem(i.arquivo))}"><figcaption>${esc(i.legenda)}</figcaption></figure>`);
  return `<section class="sec" aria-labelledby="h-prod">
  <h2 id="h-prod">O produto hoje</h2>
  <div class="shots">
    ${figuras.join("\n    ")}
  </div>
  <p class="nota">${esc(editorial.notaDasImagens ?? "Capturas reais do ambiente de teste, com dados fictícios.")}</p>
</section>`;
}

function secaoValidacao({ coleta, editorial }) {
  const etapas = coleta.etapasDaFase ?? [];
  const tiles = etapas
    .map((e) => {
      const [cls, glifo] = classeDaTile(e.status);
      const curto = e.id.replace(/^V2-F\d\d-/, "");
      return `<div class="wt ${cls}" title="${esc(`${e.id}: ${TEXTO_DO_STATUS[e.status] ?? e.status}`)}">${curto}<small>${glifo}</small></div>`;
    })
    .join("");
  const cont = contarStatus(Object.fromEntries(etapas.map((e) => [e.id, e.status])));
  const legenda = [
    [cont.validadas - cont.comPendenciaHumana, "background:var(--ok-soft);border:2px solid var(--ok)", "✓", "validadas"],
    [cont.comPendenciaHumana, "border:2px dashed var(--ok)", "✓", "validadas, falta conferência humana"],
    [cont.aguardam, "background:var(--warn-soft);border:2px solid var(--warn)", "↻", "implementadas, aguardam validação"],
    [cont.problema, "background:var(--bad-soft);border:2px solid var(--bad)", "!", "reprovadas ou bloqueadas"],
    [cont.pendentes, "border:2px solid var(--line)", "·", "ainda não começaram"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, estilo, g, t]) => `<span><i style="${estilo}"></i>${g} ${n} ${t}</span>`)
    .join("\n        ");
  const val = editorial.validacao ?? {};
  const achados = (val.achados ?? [])
    .map((a) => `<div class="card ach"><span><b>${esc(a.titulo)}</b> ${esc(a.texto)}</span>${a.selo ? `<span class="selo">${esc(a.selo)}</span>` : ""}</div>`)
    .join("\n      ");
  return `<section class="sec" aria-labelledby="h-val">
  <h2 id="h-val">${esc(val.titulo ?? "O que a validação achou")}</h2>
  ${val.lead ? `<p class="lead">${esc(val.lead)}</p>` : ""}
  <div class="${achados ? "valida" : ""}">
    <div>
      <div class="waffle" role="img" aria-label="${esc(`Situação das ${etapas.length} etapas da fase ${coleta.fase.fase}`)}">${tiles}</div>
      <div class="legenda" style="margin-top:14px">
        ${legenda}
      </div>
    </div>
    ${achados ? `<div class="achados">\n      ${achados}\n    </div>` : ""}
  </div>
</section>`;
}

export function agruparPorBloco({ blocos, estatisticasPorFase, faseAtual }) {
  return blocos.map((b) => {
    const fases = b.fases.map((f) => estatisticasPorFase[f]).filter(Boolean);
    const total = fases.reduce((s, f) => s + f.total, 0);
    const feitas = fases.reduce((s, f) => s + f.naoPendentes, 0);
    return { ...b, total, feitas, aqui: b.fases.includes(faseAtual) };
  });
}

export function estatisticasPorFase(statusPorEtapa) {
  const por = {};
  for (const [id, status] of Object.entries(statusPorEtapa)) {
    const fase = /^V2-(F\d\d)-/.exec(id)?.[1];
    if (!fase) continue;
    const f = (por[fase] ??= { total: 0, naoPendentes: 0 });
    f.total++;
    if (status !== "PENDENTE") f.naoPendentes++;
  }
  return por;
}

function secaoBlocos({ coleta, blocos }) {
  const grupos = agruparPorBloco({ blocos, estatisticasPorFase: estatisticasPorFase(coleta.statusPorEtapa), faseAtual: coleta.fase.fase });
  const maximo = Math.max(...grupos.map((g) => g.total));
  const linhas = grupos
    .map((g, i) => {
      const faixaFases = g.fases.length === 1 ? g.fases[0] : `${g.fases[0]} a ${g.fases[g.fases.length - 1]}`;
      return `<div class="bl${g.aqui ? " aqui" : ""}"><div class="n">${i + 1}. ${esc(g.nome)}${g.aqui ? '<span class="aqui-tag">estamos aqui</span>' : ""}<small>${esc(faixaFases)}</small></div><div class="trilho"><i style="width:${pct(g.total, maximo)}%"><b style="width:${pct(g.feitas, g.total)}%"></b></i></div><div class="v">${g.total}</div></div>`;
    })
    .join("\n    ");
  return `<section class="sec" aria-labelledby="h-falta">
  <h2 id="h-falta">O que falta</h2>
  <p class="lead">${coleta.fase.totalDeFases} fases em ${blocos.length} blocos, na ordem em que serão feitos. Cada fase só começa quando o gate da anterior é aprovado pelo Rafael.</p>
  <div class="card blocos">
    ${linhas}
  </div>
  <p class="nota">Número de etapas por bloco. A parte colorida de cada barra é o que já saiu de "ainda não começou".</p>
</section>`;
}

/* ---------- Estimativa de prazo ---------- */

const paraDataMs = (iso) => dataDeIso(iso).getTime();

function posicao(iso, inicio, fim) {
  const t = (dataDeIso(iso).getTime() - inicio.getTime()) / (fim.getTime() - inicio.getTime());
  return Math.min(100, Math.max(0, t * 100));
}

function janelaDoBloco(cenario, fasesDoBloco) {
  const f = cenario.fases.filter((x) => fasesDoBloco.includes(x.fase));
  if (f.length === 0) return null;
  return { inicio: f.map((x) => x.inicio).sort()[0], fim: f.map((x) => x.gatePrevisto).sort().slice(-1)[0] };
}

function secaoPrazo({ est, blocos, anoRef }) {
  const prov = est.cenarios.provavel;
  const otim = est.cenarios.otimista;
  const cons = est.cenarios.conservador;
  const nec = est.necessario;
  const hojeD = dataDeIso(est.hoje);
  const fimEixo = dataDeIso(cons.fimTotal);
  // Eixo: de hoje ao fim do cenário conservador, com marcas a cada 6 meses.
  const marcas = [];
  const cursor = new Date(Date.UTC(hojeD.getUTCFullYear(), hojeD.getUTCMonth() + 1, 1));
  while (cursor < fimEixo) {
    if (cursor.getUTCMonth() % 6 === 0) marcas.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const eixo = marcas
    .map((m) => `<span style="left:${posicao(m.toISOString().slice(0, 10), hojeD, fimEixo)}%">${MESES[m.getUTCMonth()]}/${String(m.getUTCFullYear()).slice(2)}</span>`)
    .join("");
  const metaPos = posicao(est.meta, hojeD, fimEixo);
  const linhasGantt = blocos
    .map((b, i) => {
      const jp = janelaDoBloco(prov, b.fases);
      if (!jp) return "";
      const jo = janelaDoBloco(otim, b.fases);
      const jc = janelaDoBloco(cons, b.fases);
      const aqui = b.fases.includes(prov.fases[0]?.fase);
      return `<div class="gt-linha"><div class="n">${i + 1}. ${esc(b.nome)}</div><div class="gt-trilho"><i class="gt-metalinha" style="left:${metaPos}%"></i><div class="gt-faixa" style="left:${posicao(jo.fim, hojeD, fimEixo)}%;width:${Math.max(0.6, posicao(jc.fim, hojeD, fimEixo) - posicao(jo.fim, hojeD, fimEixo))}%"></div><div class="gt-barra${aqui ? " aqui" : ""}" style="left:${posicao(jp.inicio, hojeD, fimEixo)}%;width:${Math.max(0.8, posicao(jp.fim, hojeD, fimEixo) - posicao(jp.inicio, hojeD, fimEixo))}%" title="${esc(`${b.nome}: de ${formatarData(jp.inicio, anoRef)} a ${formatarData(jp.fim, anoRef)} (provável)`)}"></div></div></div>`;
    })
    .join("\n      ");

  const metaTxt = formatarData(est.meta, 9999);
  const virg = (n) => String(n).replace(".", ",");
  const baseVeredito = `Para fechar tudo até ${metaTxt} seria preciso ${virg(nec.vezesOMedidoSemEspera)} vezes o ritmo medido, mesmo sem nenhuma espera.`;
  const sobrepoeVer = Math.round((prov.parametros.fracaoDaEsperaQueSobrepoe ?? 0) * 100);
  const veredito = nec.asEsperasSozinhasPassamDaMeta
    ? `${baseVeredito} Só as esperas (${nec.gatesAbertos} gates em sequência e os prazos externos) somam cerca de ${nec.esperasProvaveisEmDias} dias, mais que os ${nec.diasAteAMeta} que restam.`
    : nec.diasLivresComEsperasProvaveis < 0.25 * nec.diasAteAMeta
      ? `${baseVeredito} E as esperas prováveis, mesmo com ${sobrepoeVer}% delas em paralelo, ocupam cerca de ${nec.esperasProvaveisEmDias} dos ${nec.diasAteAMeta} dias que restam.`
      : nec.vezesOMedidoComEsperasProvaveis <= 1
        ? `No ritmo medido, a meta de ${metaTxt} cabe, com as esperas prováveis.`
        : `${baseVeredito} Contando as esperas prováveis, seriam ${virg(nec.vezesOMedidoComEsperasProvaveis)} vezes.`;

  const ref = est.referencia;
  const maxRitmo = Math.max(nec.ritmoNecessarioSemEsperaPorSemana, est.ritmoMedido.pontosPorSemana, otim.ritmoPontosPorSemana) * 1.05;
  const linhaRitmo = (rotulo, valor, cls = "") => `<div class="rt ${cls}"><div>${esc(rotulo)}</div><div class="tr"><i style="width:${pct(valor, maxRitmo)}%"></i></div><div class="v">${String(valor).replace(".", ",")}</div></div>`;
  const medido = est.ritmoMedido.pontosPorSemana;
  const acompanha = medido < cons.ritmoPontosPorSemana
    ? `O ritmo medido hoje (${String(medido).replace(".", ",")}) está abaixo do que o cenário conservador assume (${String(cons.ritmoPontosPorSemana).replace(".", ",")}). O prazo só vale se o ritmo subir, e este relatório confere isso toda semana.`
    : `O ritmo medido hoje (${String(medido).replace(".", ",")}) já sustenta o que o cenário conservador assume (${String(cons.ritmoPontosPorSemana).replace(".", ",")}).`;

  const cards = [
    ["Otimista", otim],
    ["Provável", prov],
    ["Conservador", cons],
  ]
    .map(([nome, c]) => {
      const alcanca = c.ateAMeta.fasesComGateAteAMeta.at(-1);
      const emCurso = c.ateAMeta.faseEmCursoNaMeta;
      const texto = alcanca ? `gate da ${alcanca}${emCurso ? `, com a ${emCurso} em curso` : ""}` : emCurso ? `a ${emCurso} em curso` : "nenhum gate";
      return `<div class="card alv"><b>${nome}: ${mesAno(c.fimTotal)}</b><span>Até ${formatarData(est.meta, 9999)}: ${texto}. Ritmo de ${String(c.ritmoPontosPorSemana).replace(".", ",")} pontos por semana.</span></div>`;
    })
    .join("\n    ");

  const paral = nec.etapasParalelizaveis;
  const sobrepoe = Math.round((prov.parametros.fracaoDaEsperaQueSobrepoe ?? 0) * 100);
  const fatorMin = Math.round((cons.parametros.fatorDoRitmo - 1) * 100);
  const fatorMax = Math.round((otim.parametros.fatorDoRitmo - 1) * 100);
  const premissasChave = `<div class="alavancas">
    <div class="card alv"><b>Ritmo ${fatorMin}% a ${fatorMax}% acima do medido</b><span>De ${String(cons.ritmoPontosPorSemana).replace(".", ",")} a ${String(otim.ritmoPontosPorSemana).replace(".", ",")} pontos por semana, contra ${String(medido).replace(".", ",")} medidos. ${paral} das ${nec.totalDeEtapas} etapas (${Math.round((paral / nec.totalDeEtapas) * 100)}%) aceitam execução em paralelo.</span></div>
    <div class="card alv"><b>${sobrepoe}% da espera em paralelo</b><span>Validação e aprovação dos ${nec.gatesAbertos} gates em lote, com a fase seguinte já andando. Isso muda a regra de hoje, de gates em sequência, e precisa ser decidido pelo Rafael.</span></div>
    <div class="card alv"><b>Esperas externas adiantadas</b><span>Contratos, contas de loja, secretaria real e piloto são pedidos antes de a fase chegar a eles. As durações são suposições.</span></div>
  </div>`;
  const teto = est.parametros.tetoDeEntregaDesejado;
  const notaTeto = teto
    ? paraDataMs(cons.fimTotal) <= paraDataMs(teto)
      ? `O cenário conservador termina em ${mesAno(cons.fimTotal)}, dentro do teto desejado (${mesAno(teto)}).`
      : `O cenário conservador termina em ${mesAno(cons.fimTotal)}, FORA do teto desejado (${mesAno(teto)}).`
    : "";
  const semAlavancas = `<p class="nota">${esc([notaTeto, ref ? `Sem essas premissas (processo de hoje, gates em sequência): ${mesAno(ref.fimTotal)}.` : ""].filter(Boolean).join(" "))}</p>`;

  const porEtapa = {};
  for (const [nome, c] of Object.entries(est.cenarios)) for (const f of c.fases) for (const x of f.etapasPrevistas) (porEtapa[x.id] ??= {})[nome] = x.entrega;
  const infoEtapa = new Map(est.etapas.map((e) => [e.id, e]));
  const fasesHtml = prov.fases
    .map((f) => {
      const fo = otim.fases.find((x) => x.fase === f.fase);
      const fc = cons.fases.find((x) => x.fase === f.fase);
      const etapas = est.etapas.filter((e) => e.fase === f.fase);
      const linhas = etapas
        .map((e) => {
          const d = porEtapa[e.id];
          const quando = d
            ? `${formatarData(d.provavel, anoRef)} <span class="nota">(${formatarData(d.otimista, anoRef)} a ${formatarData(d.conservador, anoRef)})</span>`
            : esc(TEXTO_DO_STATUS[e.status] ?? e.status);
          return `<tr><td class="m">${esc(e.id.replace(/^V2-/, ""))}</td><td>${esc(curto(e.titulo))}</td><td class="m">${esc(e.tamanho)}</td><td>${quando}</td></tr>`;
        })
        .join("");
      return `<details class="det"><summary><span>${esc(f.fase)} ${esc(f.nome)}</span><span class="fs"><span>${pluralizar(f.etapas, "etapa", "etapas")}</span><span>gate ${formatarData(f.gatePrevisto, anoRef)}</span><span>faixa ${formatarData(fo.gatePrevisto, anoRef)} a ${formatarData(fc.gatePrevisto, anoRef)}</span></span></summary><div class="conteudo"><div class="rolavel-x"><table class="tab-et"><thead><tr><th>Etapa</th><th>O que é</th><th>Tam.</th><th>Entrega estimada (provável, e faixa)</th></tr></thead><tbody>${linhas}</tbody></table></div></div></details>`;
    })
    .join("\n      ");

  const p = est.parametros;
  const esperas = Object.entries(p.esperasExternasEmDias)
    .map(([f, dias]) => `${f}: ${dias} dias (${p.esperasExternasMotivo?.[f] ?? "espera externa"})`)
    .join("; ");
  const premissas = [
    `Ritmo medido: ${est.ritmoMedido.pontosPorSemana} pontos por semana, a partir de ${pluralizar(est.ritmoMedido.etapasEntregues, "etapa entregue", "etapas entregues")} (${est.ritmoMedido.pontosEntregues} pontos) em ${est.ritmoMedido.diasDeTrabalho} dias de trabalho, desde ${formatarData(est.ritmoMedido.desde, 9999)} e descontados ${est.ritmoMedido.diasDeMontagemDescontados} dias únicos de montagem do sistema de validação.`,
    `Cenários: otimista usa o ritmo medido, provável usa ${Math.round(p.cenarios.provavel.fatorDoRitmo * 100)}% dele, conservador usa ${Math.round(p.cenarios.conservador.fatorDoRitmo * 100)}%. Espera de ${p.cenarios.otimista.diasEntreCandidatoEGate}, ${p.cenarios.provavel.diasEntreCandidatoEGate} e ${p.cenarios.conservador.diasEntreCandidatoEGate} dias entre o fim do trabalho e a aprovação de cada gate.`,
    `Esperas externas, em dias corridos e por cenário (metade, valor cheio e uma vez e meia): ${esperas}.`,
    ...p.premissas,
  ];

  return `<section class="sec" aria-labelledby="h-prazo">
  <h2 id="h-prazo">Prazo e estimativa de entrega</h2>
  <p class="lead">Uma conta feita sobre o ritmo medido até hoje, não uma promessa. É recalculada toda semana.</p>
  <div class="meta-vs">
    <div class="card mv meta"><span class="rot">Meta do Rafael</span><b>${esc(formatarData(est.meta, 9999))}</b><span class="faixa">${nec.diasAteAMeta} dias a partir de ${formatarData(est.hoje, 9999)}</span></div>
    <div class="card mv"><span class="rot">Estimativa provável do total</span><b>${esc(mesAno(prov.fimTotal))}</b><span class="faixa">Entre ${esc(mesAno(otim.fimTotal))} (otimista) e ${esc(mesAno(cons.fimTotal))} (conservador)</span></div>
  </div>
  <p>${esc(veredito)}</p>
  <div class="card gantt">
    <h3 style="font-size:.95rem;font-weight:600">Cada bloco no tempo (provável, com a faixa até o conservador)</h3>
    <div class="gt-linhas">
      <div class="gt-linha"><div></div><div class="gt-eixo" aria-hidden="true">${eixo}<span class="gt-meta-rot" style="left:${metaPos}%">meta</span></div></div>
      ${linhasGantt}
    </div>
    <div class="gt-legenda"><span><i style="width:18px;height:10px;border-radius:3px;background:var(--accent)"></i>janela provável do bloco</span><span><i style="width:18px;height:4px;border-radius:2px;background:var(--accent-soft)"></i>do fim otimista ao fim conservador</span><span><i style="width:0;height:12px;border-left:2px dashed var(--bad)"></i>meta ${esc(formatarData(est.meta, 9999))}</span></div>
  </div>
  <div class="card ritmo">
    <h3 style="font-size:.95rem;font-weight:600">Ritmo, em pontos por semana (P=0,5, S=1, M=2, L=4)</h3>
    ${linhaRitmo("Medido até hoje", medido)}
    ${linhaRitmo("Assumido no cenário provável", prov.ritmoPontosPorSemana)}
    ${linhaRitmo(`Necessário para ${metaTxt}, sem espera`, nec.ritmoNecessarioSemEsperaPorSemana, "nec")}
    <p class="nota">${esc(acompanha)}</p>
  </div>
  <div class="alavancas">
    ${cards}
  </div>
  <h3 style="font-size:1.05rem;font-weight:700;margin-top:6px">O que precisa ser verdade para essas datas</h3>
  ${premissasChave}
  ${semAlavancas}
  <details class="det"><summary><span>Estimativa por fase e por etapa</span><span class="fs"><span>${est.totais.etapas} etapas</span></span></summary><div class="conteudo">
      ${fasesHtml}
  </div></details>
  <details class="det"><summary><span>Como a estimativa é calculada</span></summary><div class="conteudo"><ul class="premissas">${premissas.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></details>
</section>`;
}

function secaoDecisoes({ editorial }) {
  const itens = editorial.decisoes ?? [];
  if (itens.length === 0) return "";
  return `<section class="sec" aria-labelledby="h-dec">
  <h2 id="h-dec">O que depende de decisão</h2>
  <div class="decidir">
    ${itens.map((d) => `<div class="card dec"><span class="quem">${esc(d.quem)}</span><b>${esc(d.titulo)}</b><span>${esc(d.texto)}</span></div>`).join("\n    ")}
  </div>
</section>`;
}

/* ---------- Montagem ---------- */

export function montarRelatorio({ coleta, estimativa, editorial, linha, blocos, css, raiz = RAIZ, resolverImagem = (arquivo) => dataUri(arquivo, raiz) }) {
  const contagens = contarStatus(coleta.statusPorEtapa);
  const anoRef = Number(coleta.periodo.ate.slice(0, 4));
  const problemas = conferirTextos({ editorial, linha, concluidas: contagens.concluidas });
  const [a, m, d] = coleta.periodo.ate.split("-");
  const rodape = `<p class="rodape">Fonte: estado do projeto no repositório em ${d}/${m}/${a} (commit ${esc(coleta.base.shaCurto)}, ramo ${esc(coleta.base.ramo)}). "Concluída" só vale para etapa validada e com as conferências humanas feitas. A estimativa de prazo foi recalculada nesta data e muda a cada semana.</p>`;
  const partes = [
    secaoTopo({ coleta, contagens, editorial, anoRef }),
    secaoProgresso({ coleta, contagens }),
    secaoLinhaDoTempo({ linha, editorial, coleta }),
    secaoProduto({ editorial, resolverImagem }),
    secaoValidacao({ coleta, editorial }),
    secaoBlocos({ coleta, blocos }),
    secaoPrazo({ est: estimativa, blocos, anoRef }),
    secaoDecisoes({ editorial }),
    rodape,
  ].filter(Boolean);
  const html = `<title>Defesa Civil 360 V2</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800&family=Roboto+Mono:wght@400;500&display=swap">
<style>
${css}
</style>

<div class="dc">

${partes.join("\n\n")}

</div>
`;
  return { html, problemas, contagens };
}

export function envolverDocumento(fragmento, { semIndexar = false } = {}) {
  const robots = semIndexar ? '<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">' : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${robots}</head><body style="margin:0">${fragmento}</body></html>`;
}

function principal(argv) {
  const args = argv.slice(2);
  const op = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--coleta") op.coleta = args[++i];
    else if (a === "--estimativa") op.estimativa = args[++i];
    else if (a === "--editorial") op.editorial = args[++i];
    else if (a === "--linha") op.linha = args[++i];
    else if (a === "--saida") op.saida = args[++i];
    else if (a === "--completo") op.completo = true;
    else if (a === "--sem-indexar") op.semIndexar = true;
    else if (a === "--imagens-externas") op.prefixoDasImagens = args[++i];
    else if (a === "--pasta-de-imagens") op.pastaDasImagens = args[++i];
    else {
      console.error(`Argumento não reconhecido: ${a}\nUso: node scripts/roadmap/relatorio-visual.mjs --coleta c.json --estimativa e.json --editorial ed.json --saida r.html [--linha linha.json] [--completo]`);
      return 2;
    }
  }
  for (const k of ["coleta", "estimativa", "editorial", "saida"]) {
    if (!op[k]) {
      console.error(`Faltou --${k}.`);
      return 2;
    }
  }
  const ler = (c) => JSON.parse(readFileSync(resolve(c), "utf8"));
  const coleta = ler(op.coleta);
  const estimativa = ler(op.estimativa);
  const editorial = ler(op.editorial);
  const linha = ler(op.linha ?? join(RAIZ, "docs", "relatorios-v2", "semanais", "linha-do-tempo.json"));
  const blocos = ler(join(RAIZ, "docs", "relatorios-v2", "modelo", "blocos.json")).blocos;
  const css = readFileSync(join(RAIZ, "docs", "relatorios-v2", "modelo", "relatorio-visual.css"), "utf8");
  // Imagens: por padrão, embutidas na página. Com --imagens-externas /caminho/img --pasta-de-imagens dir,
  // são copiadas para a pasta e referenciadas pelo endereço (a página fica leve para republicar).
  let resolverImagem;
  if (op.prefixoDasImagens) {
    if (!op.pastaDasImagens) {
      console.error("--imagens-externas precisa de --pasta-de-imagens.");
      return 2;
    }
    mkdirSync(resolve(op.pastaDasImagens), { recursive: true });
    resolverImagem = (arquivo) => {
      const nome = basename(arquivo);
      copyFileSync(resolve(RAIZ, arquivo), join(resolve(op.pastaDasImagens), nome));
      return `${op.prefixoDasImagens.replace(/\/$/, "")}/${nome}`;
    };
  }
  const r = montarRelatorio({ coleta, estimativa, editorial, linha, blocos, css, ...(resolverImagem ? { resolverImagem } : {}) });
  if (r.problemas.length) {
    console.error(`O texto não passa na conferência (${r.problemas.length} problema(s)):`);
    for (const p of r.problemas) console.error(`  - ${p}`);
    return 1;
  }
  writeFileSync(resolve(op.saida), op.completo ? envolverDocumento(r.html, { semIndexar: op.semIndexar }) : r.html);
  console.log(`Relatório gravado em ${resolve(op.saida)}: ${r.contagens.total} etapas, ${r.contagens.validadas} validadas, ${r.contagens.concluidas} concluídas.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
