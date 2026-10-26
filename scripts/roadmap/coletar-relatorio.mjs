#!/usr/bin/env node
/**
 * Coleta o que mudou num período e entrega como JSON, para quem redige o
 * relatório executivo (semanal ou de fase) trabalhar sobre fatos.
 *
 * Por que existe (28-execucao-e-validacao.md, seção 16). O relatório é uma VISÃO
 * do estado que o processo já mantém, e não uma nova auditoria: esta coleta não
 * relê as etapas uma a uma, não reroda teste e nunca abre `saidas/` nem o
 * conteúdo bruto de uma evidência. Lê só o STATUS (a cópia de trabalho e a
 * versão de um commit anterior), os arquivos de fase, os GATE.md, os
 * RISCO-ACEITO.md, o arquivo de decisões e o `git log`.
 *
 * A comparação de duas versões do STATUS é o que responde "o que mudou nesta
 * semana": o commit mais recente ANTES de `--desde` é a base; se não houver
 * nenhum (o STATUS nasceu depois), a base é o primeiro commit que o tem.
 *
 * Duas regras de honestidade que o JSON carrega para o conferidor:
 * - `statusPorEtapa` tem o status REGISTRADO de todas as etapas, e é contra ele
 *   que `conferir-relatorio.mjs` compara o que o texto afirma;
 * - cada mudança traz o `tipo` (avanço, regressão, reprovada, bloqueada...), e
 *   o conferidor exige que regressão, reprovação, bloqueio novo e gate
 *   reaberto não sumam do texto.
 *
 * Uso:
 *   node scripts/roadmap/coletar-relatorio.mjs --desde AAAA-MM-DD [--ate AAAA-MM-DD]
 *        [--fase Fnn] [--saida arquivo.json]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  GATE_APROVADO,
  RAIZ,
  STATUS_DE_ETAPA,
  cabecalhoDaFase,
  caminhos,
  checkpointsDaEtapa,
  citacoes,
  fasesEmOrdem,
  gateDaFase,
  git,
  lerArquivo,
  lerDecisoes,
  lerStatus,
  localizarEtapa,
  normalizar,
  primeiraFrase,
  riscoAceitoVigente,
  secoesDoStatus,
  celulasDaLinha,
  temPendenciaHumana,
  varrerEvidencias,
} from "./roadmap.mjs";

export const VERSAO_DA_COLETA = 1;
/** U+2014 escrito por código: o repositório não tem o caractere literal em arquivo algum. */
const TRAVESSAO = String.fromCharCode(0x2014);
const CAMINHO_DO_STATUS = "docs/roadmap-v2/STATUS.md";
const CAMINHO_DAS_DECISOES = "docs/roadmap-v2/01-decisoes-e-principios.md";

/* ---------- Datas ---------- */

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function dataValida(texto) {
  if (!RE_DATA.test(texto ?? "")) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** Data de hoje na hora local, em ISO. */
export function hojeIso() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/* ---------- Classificação de mudança de status ---------- */

/** Degraus de avanço. REPROVADA fica no degrau de EM ANDAMENTO: volta a ser trabalho. */
const DEGRAU = new Map([
  ["PENDENTE", 0],
  ["EM ANDAMENTO", 1],
  ["REPROVADA", 1],
  ["IMPLEMENTADA", 2],
  ["EM VALIDAÇÃO", 3],
  ["VALIDADA COM PENDÊNCIA HUMANA", 4],
  ["ACEITA", 4],
  ["VALIDADA", 5],
  ["CONCLUÍDA COM RISCO ACEITO", 6],
  ["CONCLUÍDA", 7],
]);

export function degrauDoStatus(status) {
  return DEGRAU.has(status) ? DEGRAU.get(status) : null;
}

/** Tipos que o texto do relatório é OBRIGADO a citar (o conferidor lê esta lista). */
export const TIPOS_OBRIGATORIOS = new Set(["regressao", "reprovada", "bloqueada", "cancelada"]);

/**
 * `antes` é `null` para etapa que não existia na versão base.
 * - regressao: etapa que já estava validada (ou mais) voltou para trás;
 * - reprovada: FAIL de uma etapa que ainda não estava validada;
 * - bloqueada: virou BLOQUEADA agora;
 * - desbloqueada: saiu de BLOQUEADA;
 * - cancelada, nova, avanco, recuo (volta de degrau abaixo de validada).
 */
export function classificarMudanca(antes, depois) {
  const dAntes = degrauDoStatus(antes);
  const dDepois = degrauDoStatus(depois);
  if (dAntes !== null && dAntes >= 4 && (depois === "BLOQUEADA" || depois === "REPROVADA")) return "regressao";
  if (dAntes !== null && dDepois !== null && dDepois < dAntes && dAntes >= 4) return "regressao";
  if (depois === "BLOQUEADA") return "bloqueada";
  if (antes === "BLOQUEADA") return "desbloqueada";
  if (depois === "REPROVADA") return "reprovada";
  if (depois === "CANCELADA") return "cancelada";
  if (antes === null) return "nova";
  if (dAntes !== null && dDepois !== null && dDepois < dAntes) return "recuo";
  return "avanco";
}

/* ---------- Quem decide (CPs) ---------- */

/** Rafael, Alyson, jurídico ou DPO, e o município (externo): uma célula pode citar mais de um. */
export function categoriasDeQuem(quemDecide) {
  const t = String(quemDecide ?? "");
  const cats = [];
  if (/rafael/i.test(t)) cats.push("rafael");
  if (/alyson/i.test(t)) cats.push("alyson");
  if (/jur[ií]dico|\bdpo\b|encarregado/i.test(t)) cats.push("juridico-dpo");
  if (/munic[ií]pio|[óo]rg[ãa]o externo|fornecedor/i.test(t)) cats.push("externo");
  return cats;
}

/* ---------- Texto ---------- */

/** O repositório não usa travessão: o que vem do STATUS passa por aqui antes de ir ao JSON. */
function semTravessao(valor) {
  if (typeof valor === "string") return valor.replaceAll(TRAVESSAO, ",");
  if (Array.isArray(valor)) return valor.map(semTravessao);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, semTravessao(v)]));
  }
  return valor;
}

/** O que falta, escrito na observação: do "falta" até o fim da frase. */
export function oQueFalta(observacao) {
  const m = /(?<![-\w`])faltam?(?![-\w`])[^.]*(?:\.(?!\s|$)[^.]*)*/i.exec(observacao ?? "");
  if (!m) return null;
  const texto = m[0].replace(/\s+/g, " ").trim();
  return texto.length > 240 ? `${texto.slice(0, 237).trimEnd()}...` : texto;
}

/* ---------- Git ---------- */

function gitOuNulo(args, raiz) {
  const r = git(args, raiz);
  return r.ok ? r.saida.trim() : null;
}

/** Versão do STATUS num commit: o texto, ou `null` se o arquivo não existe lá. */
function statusNoCommit(sha, raiz) {
  const r = git(["show", `${sha}:${CAMINHO_DO_STATUS}`], raiz);
  return r.ok ? normalizar(r.saida) : null;
}

function decisoesNoCommit(sha, raiz) {
  const r = git(["show", `${sha}:${CAMINHO_DAS_DECISOES}`], raiz);
  if (!r.ok) return null;
  const ids = new Set();
  for (const linha of normalizar(r.saida).split("\n")) {
    const c = celulasDaLinha(linha);
    const m = c ? /^(D-\d\d)\b/.exec(c[0]) : null;
    if (m) ids.add(m[1]);
  }
  return ids;
}

/**
 * Escolhe a base de comparação: o último commit que mexeu no STATUS antes de
 * `desde` às 00:00; sem nenhum, o primeiro commit que tem o arquivo.
 */
function escolherBase(desde, raiz) {
  const antes = gitOuNulo(["rev-list", "-1", `--before=${desde} 00:00:00`, "HEAD", "--", CAMINHO_DO_STATUS], raiz);
  if (antes) {
    return { sha: antes, motivo: `último commit do STATUS antes de ${desde}` };
  }
  const todos = gitOuNulo(["rev-list", "--reverse", "HEAD", "--", CAMINHO_DO_STATUS], raiz);
  const primeiro = todos ? todos.split("\n")[0] : null;
  return primeiro ? { sha: primeiro, primeiro: true, motivo: `primeiro commit que tem o STATUS (nenhum anterior a ${desde})` } : null;
}

/** Último commit que mexeu no STATUS até o fim de `ate`, para períodos que já acabaram. */
function escolherFim(ate, raiz) {
  return gitOuNulo(["rev-list", "-1", `--before=${ate} 23:59:59`, "HEAD", "--", CAMINHO_DO_STATUS], raiz);
}

/* ---------- Partes da coleta ---------- */

function mapaDeEtapas(status) {
  return new Map(status.etapas.map((e) => [e.id, e]));
}

function diffDeEtapas(base, atual) {
  const mapaBase = mapaDeEtapas(base);
  const mudancas = [];
  for (const e of atual.etapas) {
    const b = mapaBase.get(e.id);
    const antes = b?.status ?? null;
    if (antes === e.status) continue;
    mudancas.push({
      id: e.id,
      fase: e.fase,
      titulo: e.titulo,
      antes,
      depois: e.status,
      tipo: classificarMudanca(antes, e.status),
      observacao: primeiraFrase(e.observacao, 300),
    });
  }
  return mudancas;
}

function diffDeGates(base, atual, raiz, evidencias) {
  const mapaBase = new Map(base.gates.map((g) => [g.gate, g]));
  const mudancas = [];
  for (const g of atual.gates) {
    const antes = mapaBase.get(g.gate)?.status ?? null;
    if (antes === g.status) continue;
    mudancas.push({
      gate: g.gate,
      fase: g.fase,
      nome: g.nomeDoGate,
      antes,
      depois: g.status,
      reaberto: g.status === "REABERTO",
      motivo: g.status === "REABERTO" ? motivoDeReabertura(g.gate, evidencias) : "",
    });
  }
  return mudancas;
}

function motivoDeReabertura(gate, evidencias) {
  const texto = evidencias.gates.get(gate)?.gateMd ?? "";
  const linha = texto.split("\n").filter((l) => /REABERTO/.test(l)).pop();
  return linha ? primeiraFrase(linha.replace(/^[-*\s]+/, ""), 240) : "";
}

function diffDeCheckpoints(base, atual) {
  const mapaBase = new Map(base.checkpoints.map((c) => [c.id, c]));
  const mudancas = [];
  for (const c of atual.checkpoints) {
    const antes = mapaBase.get(c.id)?.status ?? null;
    if (antes === c.status) continue;
    mudancas.push({
      id: c.id,
      assunto: c.assunto,
      quemDecide: c.quemDecide,
      antes,
      depois: c.status,
      observacao: primeiraFrase(c.observacao, 240),
    });
  }
  return mudancas;
}

/** A primeira fase, na ordem de execução, cujo gate não está aprovado. */
function descobrirFaseAtual(status) {
  for (const o of fasesEmOrdem(status)) {
    const gate = gateDaFase(status, o.fase);
    if (!GATE_APROVADO.has(gate?.status)) return o.fase;
  }
  return null;
}

/**
 * CPs ABERTOS ou PARCIAIS ligados a uma fase: os do cabeçalho dela e os que
 * travam alguma etapa. `travaEtapas` é o que separa "bloqueia de verdade" de "é
 * citado".
 */
function checkpointsAbertosDaFase(status, fase, raiz, rotulo) {
  const achados = new Map();
  const registrar = (id, campo, valor) => {
    if (!achados.has(id)) achados.set(id, { travaEtapas: new Set(), noCabecalho: false });
    const a = achados.get(id);
    if (campo === "cabecalho") a.noCabecalho = true;
    else a.travaEtapas.add(valor);
  };
  const cabecalho = cabecalhoDaFase(fase, raiz);
  for (const cp of cabecalho?.checkpointsDaFase ?? []) registrar(cp, "cabecalho");
  for (const e of status.etapas.filter((x) => x.fase === fase)) {
    const bloco = localizarEtapa(e.id, raiz);
    if (!bloco) continue;
    for (const cp of checkpointsDaEtapa(bloco).travam) registrar(cp, "etapa", e.id);
  }
  return [...achados.entries()]
    .map(([id, a]) => ({ cp: status.checkpoints.find((c) => c.id === id), ...a }))
    .filter((x) => x.cp && (x.cp.status === "ABERTO" || x.cp.status === "PARCIAL"))
    .sort((a, b) => a.cp.id.localeCompare(b.cp.id))
    .map(({ cp, travaEtapas, noCabecalho }) => ({
      id: cp.id,
      assunto: cp.assunto,
      quemDecide: cp.quemDecide,
      quem: categoriasDeQuem(cp.quemDecide),
      status: cp.status,
      observacao: primeiraFrase(cp.observacao, 200),
      fase,
      daFase: rotulo,
      travaEtapas: [...travaEtapas].sort(),
      noCabecalho,
      bloqueia: travaEtapas.size > 0,
    }));
}

function linhasDoDiario(textoDoStatus, desde, ate) {
  const secao = secoesDoStatus(textoDoStatus).find((s) => s.numero === 10);
  const entradas = [];
  for (const { texto } of secao?.linhas ?? []) {
    const c = celulasDaLinha(texto);
    if (!c || c.length < 2 || !RE_DATA.test(c[0])) continue;
    if (c[0] < desde || c[0] > ate) continue;
    const temQuem = c.length >= 3;
    const corpo = c.slice(1, temQuem ? -1 : undefined).join(" | ").trim();
    entradas.push({
      data: c[0],
      resumo: primeiraFrase(corpo, 300),
      texto: corpo,
      quem: temQuem ? c[c.length - 1] : "",
    });
  }
  return entradas;
}

function contarPorStatus(etapas) {
  const contagem = new Map();
  for (const e of etapas) contagem.set(e.status, (contagem.get(e.status) ?? 0) + 1);
  const ordem = [...STATUS_DE_ETAPA, ...[...contagem.keys()].filter((s) => !STATUS_DE_ETAPA.includes(s))];
  return Object.fromEntries(ordem.filter((s) => contagem.has(s)).map((s) => [s, contagem.get(s)]));
}

/* ---------- Coleta ---------- */

/**
 * @param {object} p
 * @param {string} p.desde  AAAA-MM-DD, inclusive
 * @param {string} [p.ate]  AAAA-MM-DD, inclusive (padrão: hoje)
 * @param {string} [p.fase] força a fase do relatório (relatório de fase); padrão: a fase atual
 */
export function coletar({ raiz = RAIZ, desde, ate, fase: faseForcada, hoje = hojeIso() } = {}) {
  if (!dataValida(desde)) throw new Error(`--desde precisa ser uma data ISO válida (AAAA-MM-DD), recebi "${desde ?? ""}"`);
  const fim = ate ?? hoje;
  if (!dataValida(fim)) throw new Error(`--ate precisa ser uma data ISO válida (AAAA-MM-DD), recebi "${fim}"`);
  if (fim < desde) throw new Error(`--ate (${fim}) é anterior a --desde (${desde})`);
  if (faseForcada !== undefined && !/^F\d\d$/.test(faseForcada)) throw new Error(`--fase precisa ser Fnn, recebi "${faseForcada}"`);

  const avisos = [];
  const sha = gitOuNulo(["rev-parse", "HEAD"], raiz);
  if (!sha) throw new Error("Não consegui ler o HEAD: este diretório não é um repositório git com commits.");
  const ramo = gitOuNulo(["rev-parse", "--abbrev-ref", "HEAD"], raiz) ?? "desconhecido";
  const sujas = (gitOuNulo(["status", "--porcelain"], raiz) ?? "").split("\n").filter((l) => l.trim() !== "");
  const statusSujo = sujas.some((l) => l.includes(CAMINHO_DO_STATUS));

  // Versão final do STATUS: a cópia de trabalho, ou o commit do fim do período se ele já passou.
  let textoFinal;
  let origemFinal;
  if (fim < hoje) {
    const shaFim = escolherFim(fim, raiz);
    const texto = shaFim ? statusNoCommit(shaFim, raiz) : null;
    if (texto) {
      textoFinal = texto;
      origemFinal = { tipo: "commit", sha: shaFim };
    }
  }
  if (!textoFinal) {
    textoFinal = lerArquivo(caminhos(raiz).status);
    origemFinal = { tipo: "copia-de-trabalho", sha: null };
    if (statusSujo) avisos.push("O STATUS.md tem alterações não commitadas: a coleta reflete a cópia de trabalho, e o SHA citado é o do HEAD.");
  }
  const atual = lerStatus(textoFinal);

  // Versão base do STATUS.
  const escolhida = escolherBase(desde, raiz);
  const textoBase = escolhida ? statusNoCommit(escolhida.sha, raiz) : null;
  if (!textoBase) avisos.push("Não encontrei versão anterior do STATUS.md no git: nada pode ser comparado e `mudancas` ficou vazio.");
  const base = textoBase ? lerStatus(textoBase) : { etapas: [], gates: [], checkpoints: [], ordem: [] };
  const dataDaBase = escolhida ? gitOuNulo(["show", "-s", "--format=%ad", "--date=short", escolhida.sha], raiz) : null;

  // Quando o STATUS nasceu DENTRO do período, o que aconteceu antes do primeiro commit dele não deixou rastro:
  // a base já traz etapas adiantadas. Presume-se que o período começou com tudo PENDENTE (a V2 só começa a
  // implementar com o STATUS pronto) e o aviso diz isso, para o texto não afirmar mais do que se sabe.
  const baseDentroDoPeriodo = Boolean(escolhida && escolhida.primeiro && dataDaBase && dataDaBase >= desde);
  if (baseDentroDoPeriodo) {
    base.etapas = base.etapas.map((e) => ({ ...e, status: "PENDENTE" }));
    avisos.push(
      `O STATUS.md só passa a existir no git em ${dataDaBase} (${escolhida.sha.slice(0, 7)}), dentro do período: ` +
        "as mudanças de etapa foram comparadas com a hipótese de que todas começaram PENDENTES. Confira com o diário.",
    );
  }

  const evidencias = varrerEvidencias(raiz);
  const ordem = fasesEmOrdem(atual);
  const faseDoRelatorio = faseForcada ?? descobrirFaseAtual(atual);
  const posicao = ordem.findIndex((o) => o.fase === faseDoRelatorio);
  if (faseForcada && posicao < 0) throw new Error(`A fase ${faseForcada} não existe na ordem de execução do STATUS.`);

  // Fase do relatório.
  let faseInfo = null;
  let etapasDaFase = [];
  if (faseDoRelatorio) {
    const o = ordem[posicao];
    const gate = gateDaFase(atual, faseDoRelatorio);
    etapasDaFase = atual.etapas.filter((e) => e.fase === faseDoRelatorio);
    faseInfo = {
      fase: faseDoRelatorio,
      nome: o.nome,
      ordem: o.ordem,
      totalDeFases: ordem.length,
      gate: gate?.gate ?? o.gate,
      nomeDoGate: gate?.nomeDoGate ?? "",
      statusDoGate: gate?.status ?? "DESCONHECIDO",
      gateMdPresente: Boolean(evidencias.gates.get(gate?.gate ?? o.gate)?.gateMd),
      etapas: etapasDaFase.length,
    };
  }

  const proxima = posicao >= 0 ? ordem[posicao + 1] ?? null : null;
  const aprovadas = ordem
    .map((o) => ({ o, g: gateDaFase(atual, o.fase) }))
    .filter(({ g }) => GATE_APROVADO.has(g?.status))
    .map(({ o, g }) => ({ fase: o.fase, nome: o.nome, gate: g.gate, status: g.status }));
  const proximasFases = (posicao >= 0 ? ordem.slice(posicao + 1, posicao + 3) : []).map((o) => ({
    fase: o.fase,
    nome: o.nome,
    gate: gateDaFase(atual, o.fase)?.gate ?? o.gate,
    etapas: atual.etapas.filter((e) => e.fase === o.fase).length,
  }));

  // Bloqueios.
  const cps = [];
  if (faseDoRelatorio) cps.push(...checkpointsAbertosDaFase(atual, faseDoRelatorio, raiz, "atual"));
  if (proxima) cps.push(...checkpointsAbertosDaFase(atual, proxima.fase, raiz, "proxima"));
  const porQuem = { tecnico: [], rafael: [], alyson: [], "juridico-dpo": [], externo: [] };
  for (const cp of cps.filter((x) => x.daFase === "atual" && (x.bloqueia || x.noCabecalho))) {
    for (const q of cp.quem) if (!porQuem[q].includes(cp.id)) porQuem[q].push(cp.id);
  }
  const etapasBloqueadas = etapasDaFase
    .filter((e) => e.status === "BLOQUEADA")
    .map((e) => ({
      id: e.id,
      titulo: e.titulo,
      motivo: primeiraFrase(e.observacao, 300),
      checkpoints: citacoes(e.observacao).checkpoints,
    }));
  for (const e of etapasBloqueadas) if (e.checkpoints.length === 0) porQuem.tecnico.push(e.id);

  // Pendências humanas: etapas da fase com "falta ..." registrado.
  const pendenciasHumanas = etapasDaFase.filter(temPendenciaHumana).map((e) => ({
    id: e.id,
    titulo: e.titulo,
    status: e.status,
    falta: oQueFalta(e.observacao),
  }));

  // Riscos aceitos e gates reabertos.
  const riscosAceitos = [...evidencias.etapas.entries()]
    .filter(([, v]) => riscoAceitoVigente(v.riscoAceito))
    .map(([id, v]) => ({
      etapa: id,
      criterio: v.riscoAceito.criterio,
      validade: v.riscoAceito.validade,
      aceitoPor: v.riscoAceito.aceitoPor,
    }));
  const gatesReabertos = atual.gates
    .filter((g) => g.status === "REABERTO")
    .map((g) => ({ gate: g.gate, fase: g.fase, motivo: motivoDeReabertura(g.gate, evidencias) }));

  // Decisões novas no período (frase do arquivo de decisões).
  let decisoesNovas = [];
  const idsBase = escolhida ? decisoesNoCommit(escolhida.sha, raiz) : null;
  if (idsBase) {
    decisoesNovas = lerDecisoes(raiz).filter((d) => !idsBase.has(d.id)).map((d) => ({ id: d.id, frase: d.frase }));
  } else {
    avisos.push("O arquivo de decisões não existe na versão base: `decisoesNovas` ficou vazio.");
  }

  // Commits do período: só o assunto.
  const log = gitOuNulo(
    ["log", `--since=${desde} 00:00:00`, `--until=${fim} 23:59:59`, "--format=%h%x09%ad%x09%s", "--date=short"],
    raiz,
  );
  const commits = (log ?? "")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const [curto, data, ...resto] = l.split("\t");
      return { sha: curto, data, assunto: resto.join("\t") };
    });

  const mudancasDeEtapas = diffDeEtapas(base, atual);
  const mudancasDeGates = diffDeGates(base, atual, raiz, evidencias);

  return semTravessao({
    versao: VERSAO_DA_COLETA,
    periodo: { desde, ate: fim },
    geradoEm: hoje,
    base: {
      sha,
      shaCurto: sha.slice(0, 7),
      ramo,
      alteracoesNaoCommitadas: sujas.length,
      statusFinal: origemFinal,
      statusBase: escolhida
        ? { sha: escolhida.sha, shaCurto: escolhida.sha.slice(0, 7), data: dataDaBase, motivo: escolhida.motivo, etapasPresumidasPendentes: baseDentroDoPeriodo }
        : null,
    },
    fase: faseInfo,
    contagens: contarPorStatus(etapasDaFase),
    etapasDaFase: etapasDaFase.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      status: e.status,
      pendenciaHumana: temPendenciaHumana(e),
      observacao: primeiraFrase(e.observacao, 300),
    })),
    fasesConcluidas: aprovadas,
    proximasFases,
    gates: atual.gates.map((g) => ({ fase: g.fase, gate: g.gate, status: g.status })),
    statusPorEtapa: Object.fromEntries(atual.etapas.map((e) => [e.id, e.status])),
    mudancas: {
      etapas: mudancasDeEtapas,
      gates: mudancasDeGates,
      checkpoints: diffDeCheckpoints(base, atual),
      obrigatorias: mudancasDeEtapas.filter((m) => TIPOS_OBRIGATORIOS.has(m.tipo)).map((m) => m.id),
    },
    bloqueios: {
      checkpointsAbertos: cps,
      etapasBloqueadas,
      porQuem,
    },
    pendenciasHumanas,
    riscosAceitos,
    gatesReabertos,
    decisoesNovas,
    diario: linhasDoDiario(textoFinal, desde, fim),
    commits,
    avisos,
  });
}

/* ---------- CLI ---------- */

const USO = "Uso: node scripts/roadmap/coletar-relatorio.mjs --desde AAAA-MM-DD [--ate AAAA-MM-DD] [--fase Fnn] [--saida arquivo.json]";

export function lerArgumentos(args) {
  const opcoes = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const nome = /^--(desde|ate|fase|saida|raiz)$/.exec(a)?.[1];
    if (!nome) return { erro: `Argumento não reconhecido: ${a}` };
    const valor = args[++i];
    if (valor === undefined || valor.startsWith("--")) return { erro: `${a} precisa de um valor` };
    opcoes[nome] = valor;
  }
  if (!opcoes.desde) return { erro: "--desde é obrigatório" };
  return { opcoes };
}

function principal(argv) {
  const { opcoes, erro } = lerArgumentos(argv.slice(2));
  if (erro) {
    console.error(`${erro}\n${USO}`);
    return 2;
  }
  let dados;
  try {
    dados = coletar({ raiz: opcoes.raiz ? resolve(opcoes.raiz) : RAIZ, desde: opcoes.desde, ate: opcoes.ate, fase: opcoes.fase });
  } catch (e) {
    console.error(`Coleta falhou: ${e.message}`);
    return 2;
  }
  const json = `${JSON.stringify(dados, null, 2)}\n`;
  if (opcoes.saida) {
    const destino = resolve(opcoes.saida);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, json, "utf8");
    const m = dados.mudancas;
    console.log(
      `Coleta gravada em ${destino}: ${dados.periodo.desde} a ${dados.periodo.ate}, base ${dados.base.shaCurto} (${dados.base.ramo}), ` +
        `${m.etapas.length} etapa(s) mudaram de status, ${dados.commits.length} commit(s), ${dados.diario.length} entrada(s) do diário.`,
    );
    for (const a of dados.avisos) console.log(`AVISO: ${a}`);
  } else {
    process.stdout.write(json);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}

