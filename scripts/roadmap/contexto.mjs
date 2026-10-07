#!/usr/bin/env node
/**
 * Pacote de contexto de uma etapa: tudo que uma sessão nova precisa para
 * começar sem depender da conversa.
 *
 * A seção 3 de docs/roadmap-v2/28-execucao-e-validacao.md manda reconstruir o
 * estado pelo repositório, na ordem: estado gerado, etapa, gate anterior,
 * checkpoints, decisões e ADRs, evidência, código. Este script faz o trabalho
 * de abrir cada um deles e entrega um texto curto (alvo: menos de 150 linhas),
 * mais as TRAVAS: o que impede a etapa de começar agora.
 *
 * O que ele não faz: não escreve nada, não decide nada e não roda teste. Uma
 * trava é um fato do repositório ("o CP-03 está ABERTO"), não uma opinião.
 *
 * Uso:
 *   node scripts/roadmap/contexto.mjs V2-F00-E04
 *   node scripts/roadmap/contexto.mjs V2-F00-E04 --json
 */
import { pathToFileURL } from "node:url";

import {
  GATE_APROVADO,
  RAIZ,
  STATUS_QUE_SATISFAZ_DEPENDENCIA,
  cabecalhoDaFase,
  checkpointsDaEtapa,
  dependenciasDaEtapa,
  etapaDoStatus,
  faseDoId,
  gateAnterior,
  gateDaFase,
  git,
  idValido,
  inspecionarEvidencia,
  lerDecisoes,
  lerStatusDoRepositorio,
  listarAdrs,
  localizarEtapa,
  citacoes,
  temPendenciaHumana,
} from "./roadmap.mjs";
import { analisarEtapa } from "./tags.mjs";

const MAX_OBSERVACAO = 400;

/* ---------- Git ---------- */

/** Ramo, HEAD, árvore e sincronia com o `@{u}` local. Nenhum comando toca a rede. */
export function estadoDoGit(raiz = RAIZ) {
  const ramo = git(["rev-parse", "--abbrev-ref", "HEAD"], raiz);
  const head = git(["log", "-1", "--format=%h%x09%s"], raiz);
  const status = git(["status", "--short"], raiz);
  const [hash, ...assunto] = head.ok ? head.saida.trim().split("\t") : ["", ""];

  const linhas = status.ok ? status.saida.split("\n").filter((l) => l.trim() !== "") : [];
  const novos = linhas.filter((l) => l.startsWith("??")).length;
  const apagados = linhas.filter((l) => !l.startsWith("??") && (l[0] === "D" || l[1] === "D")).length;
  const alterados = linhas.length - novos - apagados;

  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], raiz);
  let remoto;
  if (!upstream.ok) {
    remoto = { upstream: null, aFrente: null, atras: null, estado: "sem ramo remoto configurado (@{u}); não dá para comparar" };
  } else {
    const contagem = git(["rev-list", "--left-right", "--count", "HEAD...@{u}"], raiz);
    const [aFrente, atras] = contagem.ok ? contagem.saida.trim().split(/\s+/).map(Number) : [null, null];
    let estado;
    if (aFrente === null) estado = "não consegui comparar com o remoto";
    else if (aFrente === 0 && atras === 0) estado = `sincronizado com ${upstream.saida.trim()}`;
    else if (atras === 0) estado = `${aFrente} commit(s) à frente de ${upstream.saida.trim()}, falta push`;
    else if (aFrente === 0) estado = `${atras} commit(s) atrás de ${upstream.saida.trim()}, falta pull`;
    else estado = `divergente de ${upstream.saida.trim()} (${aFrente} à frente, ${atras} atrás)`;
    remoto = { upstream: upstream.saida.trim(), aFrente, atras, estado: `${estado} (referência local, sem rede)` };
  }

  return {
    ramo: ramo.ok ? ramo.saida.trim() : "desconhecido",
    head: { hash, assunto: assunto.join("\t") },
    arvore: {
      limpa: linhas.length === 0,
      total: linhas.length,
      alterados,
      novos,
      apagados,
      amostra: linhas.slice(0, 8),
    },
    remoto,
  };
}

/* ---------- Travas ---------- */

/**
 * As travas da etapa, em ordem de gravidade. `travas` impedem começar;
 * `avisos` não impedem, mas o implementador precisa saber.
 */
export function calcularTravas({ status, etapaDoStatus: etapa, bloco, gateAnteriorDaFase, gateDaFaseAtual }) {
  const travas = [];
  const avisos = [];

  if (etapa && (etapa.status === "BLOQUEADA" || etapa.status === "CANCELADA")) {
    travas.push({ tipo: "etapa", descricao: `a própria etapa está ${etapa.status} no STATUS` });
  }
  if (gateAnteriorDaFase && !GATE_APROVADO.has(gateAnteriorDaFase.status)) {
    travas.push({ tipo: "gate-anterior", descricao: `o gate anterior na ordem de execução, ${gateAnteriorDaFase.gate} (${gateAnteriorDaFase.fase}), está ${gateAnteriorDaFase.status}` });
  }
  if (gateDaFaseAtual?.status === "REABERTO") {
    travas.push({ tipo: "gate-reaberto", descricao: `o gate da própria fase, ${gateDaFaseAtual.gate}, está REABERTO` });
  }

  const { travam } = checkpointsDaEtapa(bloco);
  for (const cp of travam) {
    const c = status.checkpoints.find((x) => x.id === cp);
    if (!c) travas.push({ tipo: "checkpoint", descricao: `${cp} é citado e não existe na seção 7 do STATUS` });
    else if (c.status === "ABERTO") travas.push({ tipo: "checkpoint", descricao: `${cp} está ABERTO (${c.assunto})` });
    else if (c.status === "PARCIAL") travas.push({ tipo: "checkpoint", descricao: `${cp} está PARCIAL (${c.assunto})` });
    else if (c.status === "ADIADO") avisos.push(`${cp} está ADIADO (${c.assunto})`);
  }

  const dependencias = dependenciasDaEtapa(bloco);
  for (const dep of dependencias.etapas) {
    const e = etapaDoStatus(status, dep);
    if (!e) {
      travas.push({ tipo: "dependencia", descricao: `${dep} é citada e não existe no STATUS` });
    } else if (STATUS_QUE_SATISFAZ_DEPENDENCIA.has(e.status)) {
      continue;
    } else if (temPendenciaHumana(e)) {
      // A regra da seção 3 do STATUS: validação humana pendente não bloqueia a etapa seguinte.
      avisos.push(`${dep} está ${e.status} com pendência humana registrada (não bloqueia, regra da seção 3 do STATUS)`);
    } else {
      travas.push({ tipo: "dependencia", descricao: `${dep} não está concluída (${e.status})` });
    }
  }
  for (const g of dependencias.gates) {
    const gate = status.gates.find((x) => x.gate === g);
    if (!gate) travas.push({ tipo: "dependencia", descricao: `${g} é citado e não existe no STATUS` });
    else if (!GATE_APROVADO.has(gate.status)) travas.push({ tipo: "dependencia", descricao: `o gate ${g} está ${gate.status}` });
  }
  return { travas, avisos };
}

/* ---------- Pacote ---------- */

export function montarContexto(id, raiz = RAIZ) {
  const bloco = localizarEtapa(id, raiz);
  if (!bloco) return null;
  const status = lerStatusDoRepositorio(raiz);
  const etapa = etapaDoStatus(status, id);
  const fase = faseDoId(id);
  const gateDaFaseAtual = gateDaFase(status, fase);
  const anterior = gateAnterior(status, fase);
  const cabecalho = cabecalhoDaFase(fase, raiz);

  const cps = citacoes(bloco.texto).checkpoints;
  const { travam } = checkpointsDaEtapa(bloco);
  const checkpoints = cps.map((cp) => {
    const c = status.checkpoints.find((x) => x.id === cp);
    return { id: cp, status: c?.status ?? "NÃO ENCONTRADO", assunto: c?.assunto ?? "", trava: travam.includes(cp) };
  });

  const decisoesDoRepo = lerDecisoes(raiz);
  const decisoes = citacoes(bloco.texto).decisoes.map((d) => {
    const achada = decisoesDoRepo.find((x) => x.id === d);
    return { id: d, situacao: achada?.situacao ?? "", frase: achada?.frase ?? "(não encontrada em 01-decisoes-e-principios.md)" };
  });
  const adrsDoRepo = listarAdrs(raiz);
  const adrs = citacoes(bloco.texto).adrs.map((n) => {
    const achado = adrsDoRepo.find((x) => x.numero === n);
    return { numero: n, arquivo: achado?.arquivo ?? "", titulo: achado?.titulo ?? "(ADR não encontrado em docs/adr/)" };
  });

  const analise = analisarEtapa(bloco);
  const evidencia = inspecionarEvidencia(raiz, gateDaFaseAtual?.gate ?? `G${fase.slice(1)}`, id);
  const { travas, avisos } = calcularTravas({ status, etapaDoStatus: etapa, bloco, gateAnteriorDaFase: anterior, gateDaFaseAtual });

  const observacao = etapa?.observacao ?? "";
  return {
    id,
    git: estadoDoGit(raiz),
    etapa: { arquivo: bloco.arquivo, linha: bloco.linha, titulo: bloco.titulo, texto: bloco.texto, duplicada: bloco.duplicada },
    fase: cabecalho,
    statusDaEtapa: {
      status: etapa?.status ?? "NÃO ENCONTRADA NO STATUS",
      observacao: observacao.length > MAX_OBSERVACAO ? observacao.slice(0, MAX_OBSERVACAO - 3).trimEnd() + "..." : observacao,
      observacaoCortada: observacao.length > MAX_OBSERVACAO,
    },
    gateDaFase: gateDaFaseAtual ? { gate: gateDaFaseAtual.gate, status: gateDaFaseAtual.status } : null,
    gateAnterior: anterior,
    checkpoints,
    decisoes,
    adrs,
    analise,
    evidencia,
    travas,
    avisos,
  };
}

/* ---------- Saída de texto ---------- */

export function formatarContexto(c) {
  const L = [];
  const titulo = (t) => L.push("", `== ${t} ==`);

  L.push(`PACOTE DE CONTEXTO ${c.id}`);
  L.push("Lido do repositório. A conversa não é fonte de verdade (28, seção 3): se algo aqui divergir da memória, vale isto.");

  titulo("Repositório");
  L.push(`Ramo: ${c.git.ramo} | HEAD: ${c.git.head.hash} ${c.git.head.assunto}`);
  if (c.git.arvore.limpa) L.push("Árvore: limpa");
  else {
    L.push(`Árvore: ${c.git.arvore.total} entrada(s) em git status --short (${c.git.arvore.alterados} alterada(s), ${c.git.arvore.novos} nova(s), ${c.git.arvore.apagados} apagada(s))`);
    for (const l of c.git.arvore.amostra) L.push(`  ${l}`);
    if (c.git.arvore.total > c.git.arvore.amostra.length) L.push(`  ... e mais ${c.git.arvore.total - c.git.arvore.amostra.length}`);
  }
  L.push(`Remoto: ${c.git.remoto.estado}`);

  titulo(`Etapa (${c.etapa.arquivo}:${c.etapa.linha})`);
  L.push(c.etapa.texto);

  titulo(`Cabeçalho da fase (${c.fase ? `${c.fase.arquivo}:${c.fase.linha}` : "não encontrado"})`);
  L.push(c.fase ? c.fase.texto : "(cabeçalho da fase não encontrado)");

  titulo("Estado no STATUS");
  L.push(`Status da etapa: ${c.statusDaEtapa.status}`);
  L.push(`Observação${c.statusDaEtapa.observacaoCortada ? " (cortada em 400 caracteres)" : ""}: ${c.statusDaEtapa.observacao || "(vazia)"}`);
  L.push(c.gateAnterior
    ? `Gate anterior na ordem de execução: ${c.gateAnterior.gate} (${c.gateAnterior.fase}), ${c.gateAnterior.status}`
    : "Gate anterior na ordem de execução: nenhum (é a primeira fase)");
  L.push(c.gateDaFase ? `Gate desta fase: ${c.gateDaFase.gate}, ${c.gateDaFase.status}` : "Gate desta fase: não encontrado");

  titulo("Checkpoints, decisões e ADRs citados");
  if (c.checkpoints.length === 0) L.push("Checkpoints: nenhum citado");
  for (const cp of c.checkpoints) L.push(`${cp.id} ${cp.status}${cp.trava ? " (TRAVA)" : ""}: ${cp.assunto}`);
  if (c.decisoes.length === 0) L.push("Decisões: nenhuma citada");
  for (const d of c.decisoes) L.push(`${d.id}${d.situacao ? ` ${d.situacao}` : ""}: ${d.frase}`);
  if (c.adrs.length === 0) L.push("ADRs: nenhum citado");
  for (const a of c.adrs) L.push(`ADR ${a.numero}: ${a.titulo}${a.arquivo ? ` (${a.arquivo})` : ""}`);

  titulo("Validação (28, seções 9, 10 e 12)");
  const a = c.analise;
  L.push(`Tags: ${a.tags.length > 0 ? a.tags.join(", ") : "nenhuma"} | Risco ${a.risco} | caminhos: ${a.fonteDosCaminhos}`);
  L.push(`Validadores obrigatórios: ${a.validadores.join(", ")}${a.descartadosPeloTeto.length > 0 ? ` (cortados pelo teto de 4: ${a.descartadosPeloTeto.join(", ")})` : ""}`);
  L.push(`Opus revisa: ${a.opus.opus ? "sim" : "não"}${a.opus.motivos.length > 0 ? ` (${a.opus.motivos.join("; ")})` : ""}`);
  if (!a.visual.aplicavel) L.push("Portão visual: não se aplica (sem UI nem MOBILE)");
  else {
    const disparados = a.visual.gatilhos.filter((g) => g.disparado);
    L.push(`Portão visual: Rafael obrigatório = ${a.visual.rafaelVisualObrigatorio ? "sim" : "não"} (disparam por texto: ${disparados.length > 0 ? disparados.map((g) => g.nome).join(", ") : "nenhum"})`);
    if (a.visual.pendentesDeDiff.length > 0) {
      L.push(`  A decidir pelo diff (não contam como obrigatórios); possíveis pelo texto: ${a.visual.possiveis.length > 0 ? a.visual.possiveis.join(", ") : "nenhum"}`);
    }
  }

  titulo("Evidência existente");
  const e = c.evidencia;
  if (!e.existe) L.push(`${e.pasta}: não existe ainda`);
  else {
    L.push(`${e.pasta}: ${e.entradas.length > 0 ? e.entradas.join(", ") : "(vazia)"}`);
    L.push(`INDEX.md: ${e.index ? "sim" : "não"} | VEREDITO.md: ${e.vereditoArquivo ? `sim (${e.veredito ?? "sem veredito legível"})` : "não"} | RISCO-ACEITO.md: ${e.riscoAceito ? "sim" : "não"} | validacao/: ${e.validacao ? "sim" : "não"}`);
  }

  titulo("TRAVAS");
  if (c.travas.length === 0) L.push("Nenhuma trava encontrada.");
  for (const t of c.travas) L.push(`TRAVA [${t.tipo}]: ${t.descricao}`);
  for (const av of c.avisos) L.push(`aviso: ${av}`);

  return L.join("\n");
}

/* ---------- CLI ---------- */

function principal(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const id = args.find((a) => !a.startsWith("-"));
  const desconhecido = args.find((a) => a.startsWith("-") && a !== "--json");
  if (desconhecido) {
    console.error(`Argumento não reconhecido: ${desconhecido}\nUso: node scripts/roadmap/contexto.mjs V2-Fnn-Enn [--json]`);
    return 2;
  }
  if (!id || !idValido(id)) {
    console.error("Informe o ID da etapa no formato V2-Fnn-Enn.\nUso: node scripts/roadmap/contexto.mjs V2-Fnn-Enn [--json]");
    return 2;
  }
  const contexto = montarContexto(id);
  if (!contexto) {
    console.error(`Etapa ${id} não encontrada nos arquivos de fase de docs/roadmap-v2/.`);
    return 2;
  }
  console.log(json ? JSON.stringify(contexto, null, 2) : formatarContexto(contexto));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
