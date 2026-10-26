#!/usr/bin/env node
/**
 * Página dedicada às pendências humanas da V2 (/progresso/decisoes).
 *
 * Cada decisão vira um cartão com um diagrama: a situação de hoje, a pergunta e o que acontece em cada
 * resposta. Cada conferência vira um fluxo curto: fazer, o que deve acontecer, quando reprova. O texto vem de
 * `docs/relatorios-v2/semanais/progresso/decisoes.json`, que resume `docs/roadmap-v2/pendencias-humanas.md`
 * (se divergirem, vale o .md; o teste confere que nenhum código aberto ficou de fora).
 *
 * Uso:
 *   node scripts/roadmap/decisoes-visual.mjs --dados decisoes.json --saida index.html [--completo] [--sem-indexar] [--link-de-saida /progresso/sair] [--link-do-relatorio /progresso]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ } from "./roadmap.mjs";
import { conferirTextos, envolverDocumento, esc, secaoGlossario } from "./relatorio-visual.mjs";

const LETRAS = "ABCDEFGH";
const ESTADOS_DO_CAMINHO = {
  feito: { glifo: "✓", rotulo: "feito" },
  voce: { glifo: "●", rotulo: "sua decisão" },
  depois: { glifo: "○", rotulo: "depois" },
};

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Códigos que o resumo cobre (decisões e conferências). */
export function codigosCobertos(dados) {
  return [...dados.decisoes.map((d) => d.codigo), ...dados.conferencias.itens.map((i) => i.codigo)];
}

/** Problemas na estrutura do resumo (códigos repetidos, grupo ou tipo inexistente, decisão sem opção). */
export function conferirEstrutura(dados) {
  const problemas = [];
  const vistos = new Set();
  for (const c of codigosCobertos(dados)) {
    if (vistos.has(c)) problemas.push(`${c}: código repetido`);
    vistos.add(c);
  }
  const grupos = new Set(dados.grupos.map((g) => g.id));
  for (const d of dados.decisoes) {
    if (!grupos.has(d.grupo)) problemas.push(`${d.codigo}: grupo "${d.grupo}" não existe`);
    if (!Array.isArray(d.opcoes) || d.opcoes.length === 0) problemas.push(`${d.codigo}: sem opções`);
    if (d.opcoes?.length > LETRAS.length) problemas.push(`${d.codigo}: opções demais`);
    for (const campo of ["etapa", "curto", "titulo", "hoje", "pergunta", "quem"]) if (!d[campo]) problemas.push(`${d.codigo}: falta "${campo}"`);
  }
  const tipos = new Set(dados.conferencias.tipos.map((t) => t.id));
  for (const i of dados.conferencias.itens) {
    if (!tipos.has(i.tipo)) problemas.push(`${i.codigo}: tipo "${i.tipo}" não existe`);
    for (const campo of ["etapa", "curto", "fazer"]) if (!i[campo]) problemas.push(`${i.codigo}: falta "${campo}"`);
  }
  return problemas;
}

/**
 * Compara o resumo com `pendencias-humanas.md`: `faltam` são códigos abertos (seções A a D) sem cartão;
 * `resolvidas` são códigos com cartão que o documento já deu por resolvidos (seção F) ou que não existem mais.
 * Serve de aviso, não de trava: quem resolve uma pendência não precisa mexer aqui para o CI passar.
 */
export function diferencasComPendencias({ dados, markdown }) {
  const abertos = new Set();
  const resolvidos = new Set();
  let secao = "";
  for (const linha of markdown.split(/\r?\n/)) {
    const titulo = /^## ([A-Z])\./.exec(linha);
    if (titulo) secao = titulo[1];
    const codigo = /^\| (H\d+) \|/.exec(linha)?.[1];
    if (!codigo) continue;
    if ("ABCD".includes(secao)) abertos.add(codigo);
    else if (secao === "F") resolvidos.add(codigo);
  }
  const cobertos = new Set(codigosCobertos(dados));
  return {
    faltam: [...abertos].filter((c) => !cobertos.has(c)),
    resolvidas: [...cobertos].filter((c) => !abertos.has(c)),
    resolvidasNoDocumento: [...cobertos].filter((c) => resolvidos.has(c)),
  };
}

/* ---------- Peças ---------- */

function cartaoDecisao(d) {
  const n = d.opcoes.length;
  const ramos = d.opcoes
    .map(
      (o, i) => `<li class="ramo${o.recomendada ? " rec" : ""}"><b><span class="letra" aria-hidden="true">${LETRAS[i]}</span>${esc(o.rotulo)}</b><span>${esc(o.efeito)}</span>${o.recomendada ? '<em class="selo-rec">✓ Recomendada no documento</em>' : ""}</li>`,
    )
    .join("");
  const tipoDeCampo = d.multipla ? "checkbox" : "radio";
  const opcoes = [
    ...d.opcoes.map((o, i) => ({ valor: LETRAS[i], rotulo: o.rotulo, letra: LETRAS[i] })),
    { valor: "outra", rotulo: "Outra decisão", letra: null },
  ];
  const campos = opcoes
    .map(
      (o) => `<label class="opc${o.letra ? "" : " outra"}"><input type="${tipoDeCampo}" name="${esc(d.codigo)}" value="${esc(o.valor)}" data-valor data-rotulo="${esc(o.rotulo)}"><span>${o.letra ? `<b>${o.letra}.</b> ` : "<b>"}${esc(o.rotulo)}${o.letra ? "" : "</b>"}</span></label>`,
    )
    .join("\n        ");
  const resposta = `<fieldset class="resposta">
      <legend>Sua resposta${d.multipla ? " (pode marcar mais de uma)" : ""}</legend>
      ${campos}
      <textarea rows="2" aria-label="${esc(`Outra decisão ou observação, ${d.codigo}`)}" placeholder="Outra decisão: escreva aqui (a opção é marcada sozinha)"></textarea>
      <button type="button" class="btn-limpar" data-limpar>Limpar resposta</button>
    </fieldset>`;
  return `<article class="card dcs" id="${esc(d.codigo)}" data-resp="${esc(d.codigo)}" data-curto="${esc(d.curto)}" data-tipo="decisao">
    <header class="dcs-topo"><span class="cod">${esc(d.codigo)}</span><span class="et">Refere-se a ${esc(d.etapa)}</span><span class="feito-tag">✓ Respondido</span><span class="quem">${esc(d.quem)}</span></header>
    <h3>${esc(d.titulo)}</h3>
    <div class="fluxo" role="group" aria-label="${esc(`Diagrama da decisão ${d.codigo}`)}">
      <div class="no hoje"><small>Hoje</small><p>${esc(d.hoje)}</p></div>
      <div class="desce" aria-hidden="true"></div>
      <div class="no pergunta"><small>Você decide</small><p>${esc(d.pergunta)}</p></div>
      <ul class="ramos" style="--n:${n}">${ramos}</ul>
    </div>
    ${d.tambem ? `<p class="tambem"><b>Atenção:</b> ${esc(d.tambem)}</p>` : ""}
    ${resposta}
    ${d.ler ? `<p class="ler">Onde ler: <code>${esc(d.ler)}</code></p>` : ""}
  </article>`;
}

function cartaoConferencia(i) {
  const passos = [
    ["fazer", "Fazer", i.fazer],
    i.esperado ? ["esperado", "Deve acontecer", i.esperado] : null,
    i.reprova ? ["reprova", "Reprova se", i.reprova] : null,
  ].filter(Boolean);
  const fluxo = passos
    .map(([cls, rotulo, texto], idx) => `${idx > 0 ? '<div class="liga" aria-hidden="true">→</div>' : ""}<div class="no ${cls}"><small>${rotulo}</small><p>${esc(texto)}</p></div>`)
    .join("");
  const resultado = `<fieldset class="resposta">
      <legend>Resultado</legend>
      <label class="opc"><input type="radio" name="${esc(i.codigo)}" value="feito" data-valor data-rotulo="Feito"><span><b>Feito</b>, passou</span></label>
      <label class="opc"><input type="radio" name="${esc(i.codigo)}" value="reprovo" data-valor data-rotulo="Reprovo"><span><b>Reprovo</b>, explique abaixo</span></label>
      <textarea rows="2" aria-label="${esc(`Observação ou motivo, ${i.codigo}`)}" placeholder="Observação ou, se reprovou, o motivo (opcional)"></textarea>
      <button type="button" class="btn-limpar" data-limpar>Limpar resposta</button>
    </fieldset>`;
  return `<article class="card conf" id="${esc(i.codigo)}" data-resp="${esc(i.codigo)}" data-curto="${esc(i.curto)}" data-tipo="conferencia">
    <header class="dcs-topo"><span class="cod">${esc(i.codigo)}</span><span class="et">Refere-se a ${esc(i.etapa)}</span><span class="feito-tag">✓ Respondido</span></header>
    <div class="fluxo-linha n${passos.length}" role="group" aria-label="${esc(`Roteiro da conferência ${i.codigo}`)}">${fluxo}</div>
    ${resultado}
    ${i.ler ? `<p class="ler">Onde ler: <code>${esc(i.ler)}</code></p>` : ""}
  </article>`;
}

function secaoRelatorio() {
  return `<section class="sec" id="relatorio" aria-labelledby="h-relatorio">
  <h2 id="h-relatorio">Gerar o relatório das suas respostas</h2>
  <p class="lead">Marque as respostas acima. Elas ficam salvas neste navegador. Quando terminar, gere o relatório, copie e cole no chat: ele diz o que foi decidido, o que foi conferido e o que ficou sem resposta.</p>
  <div class="card relatorio">
    <p class="progresso-resp"><b data-contador>0 de 0</b> itens com resposta</p>
    <div class="botoes">
      <button type="button" class="btn primario" id="btn-gerar">Gerar relatório</button>
      <button type="button" class="btn" id="btn-copiar">Copiar relatório</button>
      <button type="button" class="btn perigo" id="btn-apagar">Apagar todas as respostas</button>
    </div>
    <p class="nota" id="relatorio-aviso" role="status" aria-live="polite"></p>
    <label class="rot-saida" for="relatorio-saida">Relatório (texto para copiar)</label>
    <textarea id="relatorio-saida" class="saida" readonly hidden rows="12"></textarea>
    <p class="nota">As respostas ficam só neste navegador e neste aparelho. Em outro navegador, a página começa em branco.</p>
  </div>
</section>`;
}

function barraDeResposta() {
  return `<div class="barra-resp"><span><b data-contador>0 de 0</b> com resposta</span><a href="#relatorio">Ir para o relatório →</a></div>`;
}

function secaoCaminho(caminho) {
  const passos = caminho.passos
    .map((p, i) => {
      const e = ESTADOS_DO_CAMINHO[p.estado] ?? ESTADOS_DO_CAMINHO.depois;
      return `<li class="passo ${esc(p.estado)}"><span class="marca-passo" aria-hidden="true">${e.glifo}</span><b>${esc(p.rotulo)}</b><span>${esc(p.texto)}</span><em>${e.rotulo}</em></li>${i < caminho.passos.length - 1 ? '<li class="elo" aria-hidden="true">→</li>' : ""}`;
    })
    .join("");
  return `<section class="sec" aria-labelledby="h-caminho">
  <h2 id="h-caminho">${esc(caminho.titulo)}</h2>
  <ol class="caminho">${passos}</ol>
  ${caminho.fora ? `<p class="nota">${esc(caminho.fora)}</p>` : ""}
</section>`;
}

function indice(dados) {
  const chips = (itens) => itens.map((c) => `<a class="chip" href="#${esc(c.codigo)}"><b>${esc(c.codigo)}</b><span>${esc(c.curto ?? "")}</span></a>`).join("");
  return `<nav class="indice" aria-label="Atalhos para cada item">
    <div><span class="rot">Decisões (clique para ir ao cartão)</span>${chips(dados.decisoes)}</div>
    <div><span class="rot">Conferências</span>${chips(dados.conferencias.itens)}</div>
  </nav>`;
}

/* ---------- Montagem ---------- */

export function montarDecisoes({ dados, css, script = null, glossario = null, linkDoRelatorio = null, linkDeSaida = null }) {
  const problemas = [...conferirEstrutura(dados), ...conferirTextos({ editorial: { ...dados, glossario }, linha: { marcos: [] }, concluidas: 0 })];
  const pecasDoG00 = dados.decisoes.filter((d) => d.grupo === "agora").length;
  const comPrazo = dados.decisoes.filter((d) => d.grupo === "prazo").length;
  const topo = `<header class="top">
  <div class="marca"><div class="brasao" aria-hidden="true">DC</div> Defesa Civil 360</div>
  <p class="eyebrow">Pendências humanas · posição em ${esc(dados.posicao)}</p>
  <h1>${esc(dados.titulo)}</h1>
  <p class="lead">${esc(dados.lead)}</p>
  ${linkDoRelatorio ? `<p><a class="voltar" href="${esc(linkDoRelatorio)}">← Voltar ao relatório de progresso</a></p>` : ""}
  <div class="kpis">
    <div class="card kpi acc"><b>${dados.decisoes.length}</b><span>decisões a tomar</span></div>
    <div class="card kpi"><b>${pecasDoG00}</b><span>fecham o gate G00</span></div>
    <div class="card kpi"><b>${comPrazo}</b><span>com risco ou prazo definido</span></div>
    <div class="card kpi"><b>${dados.conferencias.itens.length}</b><span>conferências a fazer</span></div>
  </div>
  ${indice(dados)}
</header>`;
  const grupos = dados.grupos
    .map((g) => {
      const itens = dados.decisoes.filter((d) => d.grupo === g.id);
      if (itens.length === 0) return "";
      return `<section class="sec" aria-labelledby="h-${esc(g.id)}">
  <h2 id="h-${esc(g.id)}">${esc(g.titulo)} <span class="contagem">${plural(itens.length, "decisão", "decisões")}</span></h2>
  <p class="lead">${esc(g.texto)}</p>
  <div class="lista">
    ${itens.map(cartaoDecisao).join("\n    ")}
  </div>
</section>`;
    })
    .join("\n\n");
  const conf = dados.conferencias;
  const tipos = conf.tipos
    .map((t) => {
      const itens = conf.itens.filter((i) => i.tipo === t.id);
      if (itens.length === 0) return "";
      return `<div class="tipo">
    <h3>${esc(t.titulo)} <span class="contagem">${itens.length}</span></h3>
    <p class="nota">${esc(t.texto)}</p>
    <div class="lista">
      ${itens.map(cartaoConferencia).join("\n      ")}
    </div>
  </div>`;
    })
    .join("\n  ");
  const secaoConf = `<section class="sec" aria-labelledby="h-conf">
  <h2 id="h-conf">${esc(conf.titulo)} <span class="contagem">${plural(conf.itens.length, "item", "itens")}</span></h2>
  <p class="lead">${esc(conf.lead)}</p>
  ${tipos}
</section>`;
  const rodape = `<p class="rodape">Fonte: docs/roadmap-v2/pendencias-humanas.md, na posição de ${esc(dados.posicao)}. Se esta página e o documento divergirem, vale o documento. Quando resolver um item, diga o código no chat (por exemplo, "H18 feito"); quem registra é o assistente.${linkDeSaida ? ` <a class="sair" href="${esc(linkDeSaida)}">Sair</a>` : ""}</p>`;
  const partes = [topo, secaoGlossario({ glossario, mostrarDestaque: true }), secaoCaminho(dados.caminho), grupos, secaoConf, secaoRelatorio(), rodape, barraDeResposta()].filter(Boolean);
  const html = `<title>Defesa Civil 360, decisões pendentes</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800&family=Roboto+Mono:wght@400;500&display=swap">
<style>
${css}
</style>

<div class="dc" data-posicao="${esc(dados.posicao)}">

${partes.join("\n\n")}

</div>
${script ? `<script>\n${script.replaceAll("</script", "<\\/script")}\n</script>\n` : ""}`;
  return { html, problemas };
}

function principal(argv) {
  const args = argv.slice(2);
  const op = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dados") op.dados = args[++i];
    else if (a === "--saida") op.saida = args[++i];
    else if (a === "--pendencias") op.pendencias = args[++i];
    else if (a === "--glossario") op.glossario = args[++i];
    else if (a === "--completo") op.completo = true;
    else if (a === "--sem-indexar") op.semIndexar = true;
    else if (a === "--link-de-saida") op.linkDeSaida = args[++i];
    else if (a === "--link-do-relatorio") op.linkDoRelatorio = args[++i];
    else {
      console.error(`Argumento não reconhecido: ${a}\nUso: node scripts/roadmap/decisoes-visual.mjs --dados decisoes.json --saida index.html [--completo] [--sem-indexar]`);
      return 2;
    }
  }
  for (const k of ["dados", "saida"]) {
    if (!op[k]) {
      console.error(`Faltou --${k}.`);
      return 2;
    }
  }
  const dados = JSON.parse(readFileSync(resolve(op.dados), "utf8"));
  const modelo = join(RAIZ, "docs", "relatorios-v2", "modelo");
  const css = `${readFileSync(join(modelo, "relatorio-visual.css"), "utf8")}\n${readFileSync(join(modelo, "decisoes.css"), "utf8")}`;
  const glossario = op.glossario ? JSON.parse(readFileSync(resolve(op.glossario), "utf8")) : null;
  const script = readFileSync(join(modelo, "decisoes.js"), "utf8");
  const r = montarDecisoes({ dados, css, script, glossario, linkDoRelatorio: op.linkDoRelatorio ?? null, linkDeSaida: op.linkDeSaida ?? null });
  if (r.problemas.length) {
    console.error(`A página de decisões não passa na conferência (${r.problemas.length} problema(s)):`);
    for (const p of r.problemas) console.error(`  - ${p}`);
    return 1;
  }
  if (op.pendencias) {
    const d = diferencasComPendencias({ dados, markdown: readFileSync(resolve(op.pendencias), "utf8") });
    if (d.faltam.length) console.warn(`AVISO: pendências abertas sem cartão em decisoes.json: ${d.faltam.join(", ")}.`);
    if (d.resolvidas.length) console.warn(`AVISO: cartões de pendências que não estão mais abertas em pendencias-humanas.md: ${d.resolvidas.join(", ")}.`);
  }
  mkdirSync(dirname(resolve(op.saida)), { recursive: true });
  writeFileSync(resolve(op.saida), op.completo ? envolverDocumento(r.html, { semIndexar: op.semIndexar }) : r.html);
  console.log(`Decisões gravadas em ${resolve(op.saida)}: ${dados.decisoes.length} decisões e ${dados.conferencias.itens.length} conferências.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
