/**
 * Biblioteca do sistema de execução da V2: lê o STATUS, os arquivos de fase, as
 * decisões e os ADRs, e entrega tudo como dado.
 *
 * Por que isto existe. A política (docs/roadmap-v2/28-execucao-e-validacao.md,
 * seção 3) diz que a conversa nunca é fonte de verdade: toda sessão reconstrói o
 * estado a partir do repositório. Reconstruir à mão é ler 1186 linhas de STATUS
 * e 15 arquivos de fase com 618 etapas, e é exatamente o tipo de trabalho que
 * apodrece quando alguém "lembra" errado. Aqui ele vira função.
 *
 * Três decisões que valem explicação:
 *
 * 1. SÓ LÊ. Nada aqui escreve no repositório. Quem escreve é `gerar-estado.mjs`,
 *    e só o arquivo gerado.
 *
 * 2. ROBUSTO A CRLF. Os arquivos do roadmap chegam com CRLF no Windows (o
 *    `.gitattributes` manda LF, mas a cópia de trabalho pode estar de outro
 *    jeito). `normalizar` converte tudo para LF e remove o BOM antes de qualquer
 *    expressão regular, e os testes provam com o mesmo texto em CRLF.
 *
 * 3. NÃO INTERPRETA O QUE NÃO PRECISA. Uma etapa é um título e 25 campos
 *    `- **Campo:** valor`; o campo é devolvido como texto bruto, e quem precisa
 *    de uma regra sobre ele (as tags, por exemplo) a escreve no lugar certo.
 *
 * Nada aqui depende de pacote externo: só módulos nativos do Node.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Os status que a política conhece (seção 6 de 28 e seção 3 do STATUS). */
export const STATUS_DE_ETAPA = [
  "PENDENTE",
  "EM ANDAMENTO",
  "IMPLEMENTADA",
  "EM VALIDAÇÃO",
  "VALIDADA",
  "VALIDADA COM PENDÊNCIA HUMANA",
  "ACEITA",
  "REPROVADA",
  "BLOQUEADA",
  "CONCLUÍDA",
  "CONCLUÍDA COM RISCO ACEITO",
  "CANCELADA",
];

export const STATUS_DE_GATE = [
  "NÃO INICIADO",
  "EM ANDAMENTO",
  "RECOMENDADO",
  "APROVADO",
  "APROVADO COM RISCO ACEITO",
  "REPROVADO",
  "REABERTO",
];

/** Gate que libera a fase seguinte. REABERTO e REPROVADO NÃO liberam. */
export const GATE_APROVADO = new Set(["APROVADO", "APROVADO COM RISCO ACEITO"]);

/** Etapa que a política considera pronta o bastante para uma dependência. */
export const STATUS_QUE_SATISFAZ_DEPENDENCIA = new Set([
  "VALIDADA",
  "ACEITA",
  "CONCLUÍDA",
  "CONCLUÍDA COM RISCO ACEITO",
]);

const RE_ID_DE_ETAPA = /^V2-F\d\d-E\d\d$/;

/* ---------- Leitura e normalização ---------- */

/** LF em tudo e sem BOM. Toda expressão regular deste módulo roda sobre isto. */
export function normalizar(texto) {
  return texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

export function lerArquivo(caminho) {
  return normalizar(readFileSync(caminho, "utf8"));
}

/** Caminho relativo à raiz, sempre com barra normal (a saída não muda de máquina para máquina). */
export function relativo(raiz, caminho) {
  return relative(raiz, caminho).split(sep).join("/");
}

export function semAcento(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function idValido(id) {
  return RE_ID_DE_ETAPA.test(id);
}

export function faseDoId(id) {
  return /^V2-(F\d\d)-E\d\d$/.exec(id)?.[1] ?? null;
}

export function caminhos(raiz = RAIZ) {
  return {
    raiz,
    roadmap: join(raiz, "docs", "roadmap-v2"),
    status: join(raiz, "docs", "roadmap-v2", "STATUS.md"),
    decisoes: join(raiz, "docs", "roadmap-v2", "01-decisoes-e-principios.md"),
    adr: join(raiz, "docs", "adr"),
    evidencias: join(raiz, "docs", "evidencias-v2"),
    estado: join(raiz, "docs", "roadmap-v2", "ESTADO-ATUAL.md"),
  };
}

/* ---------- Tabelas markdown ---------- */

/**
 * Divide uma linha de tabela em células, ou devolve `null` se a linha não é
 * de tabela. `\|` dentro da célula é barra vertical literal.
 */
export function celulasDaLinha(linha) {
  let t = linha.trim();
  if (!t.startsWith("|")) return null;
  t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

/** Corta o texto do STATUS em seções `## N. TÍTULO`, com a linha inicial de cada uma. */
export function secoesDoStatus(texto) {
  const linhas = normalizar(texto).split("\n");
  const secoes = [];
  let atual = null;
  linhas.forEach((linha, i) => {
    const m = /^## (\d+)\. (.*)$/.exec(linha);
    if (m) {
      atual = { numero: Number(m[1]), titulo: m[2].trim(), linhaInicial: i + 1, linhas: [] };
      secoes.push(atual);
    } else if (atual) {
      atual.linhas.push({ numeroDaLinha: i + 1, texto: linha });
    }
  });
  return secoes;
}

/* ---------- STATUS ---------- */

/**
 * Separa o status conhecido do que vem depois dele na mesma célula
 * ("BLOQUEADA (CP-03)" vira status BLOQUEADA e extra "(CP-03)").
 * Prefixo mais longo ganha: "VALIDADA COM PENDÊNCIA HUMANA" não vira "VALIDADA".
 */
export function separarStatus(celula, conhecidos) {
  const limpo = celula.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const maiusculo = limpo.toUpperCase();
  const candidatos = [...conhecidos].sort((a, b) => b.length - a.length);
  for (const status of candidatos) {
    if (maiusculo === status || maiusculo.startsWith(status + " ") || maiusculo.startsWith(status + ":")) {
      return { status, extra: limpo.slice(status.length).trim() };
    }
  }
  return { status: limpo, extra: "", desconhecido: limpo !== "" };
}

/**
 * Lê as quatro tabelas do STATUS que mandam no resto: ordem de execução (seção
 * 5), fases e gates (6), checkpoints (7) e etapas (8).
 */
export function lerStatus(texto) {
  const secoes = secoesDoStatus(texto);
  const secao = (n) => secoes.find((s) => s.numero === n)?.linhas ?? [];

  const ordem = [];
  for (const { texto: linha, numeroDaLinha } of secao(5)) {
    const c = celulasDaLinha(linha);
    if (!c || c.length < 5 || !/^\d+$/.test(c[0]) || !/^F\d\d$/.test(c[1])) continue;
    ordem.push({ ordem: Number(c[0]), fase: c[1], nome: c[2], gate: c[3], arquivo: c[4], linha: numeroDaLinha });
  }

  const gates = [];
  for (const { texto: linha, numeroDaLinha } of secao(6)) {
    const c = celulasDaLinha(linha);
    if (!c || c.length < 7 || !/^\d+$/.test(c[0]) || !/^F\d\d$/.test(c[1])) continue;
    const gate = /^(G\d\d)\b\s*(.*)$/.exec(c[3]);
    const { status, extra, desconhecido } = separarStatus(c[6], STATUS_DE_GATE);
    gates.push({
      ordem: Number(c[0]),
      fase: c[1],
      nomeDaFase: c[2],
      gate: gate ? gate[1] : c[3],
      nomeDoGate: gate ? gate[2] : "",
      etapas: Number(c[4]),
      concluidas: Number(c[5]),
      status,
      statusExtra: extra,
      statusDesconhecido: Boolean(desconhecido),
      linha: numeroDaLinha,
    });
  }

  const checkpoints = [];
  for (const { texto: linha, numeroDaLinha } of secao(7)) {
    const c = celulasDaLinha(linha);
    if (!c || c.length < 4 || !/^CP-\d\d$/.test(c[0])) continue;
    const { status } = separarStatus(c[3], ["ABERTO", "PARCIAL", "DECIDIDO", "ADIADO"]);
    checkpoints.push({
      id: c[0],
      assunto: c[1],
      quemDecide: c[2],
      status,
      observacao: c.slice(4).join(" | ").trim(),
      linha: numeroDaLinha,
    });
  }

  const etapas = [];
  for (const { texto: linha, numeroDaLinha } of secao(8)) {
    const c = celulasDaLinha(linha);
    if (!c || c.length < 5 || !RE_ID_DE_ETAPA.test(c[0])) continue;
    const { status, extra, desconhecido } = separarStatus(c[4], STATUS_DE_ETAPA);
    etapas.push({
      id: c[0],
      fase: faseDoId(c[0]),
      titulo: c[1],
      tamanho: c[2],
      prioridade: c[3],
      status,
      statusExtra: extra,
      statusDesconhecido: Boolean(desconhecido),
      // A observação pode ter barra vertical dentro de código; o que sobra das colunas volta junto.
      observacao: c.slice(5).join(" | ").trim(),
      linha: numeroDaLinha,
    });
  }

  return { ordem, gates, checkpoints, etapas };
}

export function lerStatusDoRepositorio(raiz = RAIZ) {
  return lerStatus(lerArquivo(caminhos(raiz).status));
}

export function etapaDoStatus(status, id) {
  return status.etapas.find((e) => e.id === id) ?? null;
}

export function gateDaFase(status, fase) {
  const o = status.ordem.find((x) => x.fase === fase);
  if (!o) return null;
  return status.gates.find((g) => g.fase === fase) ?? { gate: o.gate, status: "DESCONHECIDO", fase };
}

/** Fases em ordem de execução (seção 5 do STATUS), e não pela numeração. */
export function fasesEmOrdem(status) {
  return [...status.ordem].sort((a, b) => a.ordem - b.ordem);
}

/**
 * O gate anterior NA ORDEM DE EXECUÇÃO. A numeração das fases F29 a F35 não é a
 * ordem, e usar "G(n-1)" aprovaria a F29 contra o gate errado.
 */
export function gateAnterior(status, fase) {
  const ordem = fasesEmOrdem(status);
  const i = ordem.findIndex((o) => o.fase === fase);
  if (i <= 0) return null;
  const anterior = ordem[i - 1];
  const gate = gateDaFase(status, anterior.fase);
  return { fase: anterior.fase, gate: anterior.gate, status: gate?.status ?? "DESCONHECIDO" };
}

/**
 * Pendência humana de uma etapa. A regra da seção 3 do STATUS é "EM ANDAMENTO
 * com a observação 'falta validação humana'", mas as observações reais escrevem
 * "FALTA a validação humana", "FALTA (validação humana, F14-E12)" e "FALTA:
 * rodar ... em Linux" (as 24 etapas da F00 são assim). Casar a frase exata
 * deixaria 11 delas de fora. Por isso, em etapa EM ANDAMENTO ou IMPLEMENTADA, a
 * palavra "falta" ou "faltam" na observação já conta; em VALIDADA COM
 * PENDÊNCIA HUMANA conta sempre. Errar para o lado de listar a mais é de
 * propósito: pendência humana esquecida é pior que pendência humana lembrada.
 */
export function temPendenciaHumana(etapa) {
  if (etapa.status === "VALIDADA COM PENDÊNCIA HUMANA") return true;
  if (etapa.status !== "EM ANDAMENTO" && etapa.status !== "IMPLEMENTADA") return false;
  return /\bfaltam?\b/i.test(etapa.observacao) || /valida[cç][aã]o humana/i.test(etapa.observacao);
}

/* ---------- Hashes de commit citados no STATUS ---------- */

/**
 * Hashes entre crases (`abc1234`), com a linha e o texto que vem antes.
 *
 * O falso positivo que a regra evita: texto entre crases com 7 a 40 caracteres
 * hexadecimais que não é commit (um número como `2026100`, uma palavra como
 * `defaced`). Hash de verdade tem letra E dígito; só com letras ou só com
 * dígitos ele só vale se a palavra "commit", "SHA" ou "candidato" aparecer logo
 * antes. Medido em 2026-10-07: o STATUS cita 4 hashes entre crases e os 4 são
 * commits deste repositório (e `b793e82`, citado sem crases, também), então a
 * regra não dá falso positivo hoje.
 */
export function hashesCitados(texto) {
  const achados = [];
  normalizar(texto).split("\n").forEach((linha, i) => {
    for (const m of linha.matchAll(/`([0-9a-f]{7,40})`/g)) {
      const token = m[1];
      const antes = linha.slice(Math.max(0, m.index - 30), m.index);
      const misto = /[a-f]/.test(token) && /\d/.test(token);
      const anunciado = /\b(commit\w*|sha|candidato)\b/i.test(antes);
      if (misto || anunciado) achados.push({ hash: token, linha: i + 1 });
    }
  });
  return achados;
}

/** Hashes que parecem commit dentro de uma observação, com crase ou sem (letra e dígito, 7 a 40). */
export function hashesDaObservacao(observacao) {
  const achados = new Set();
  for (const m of observacao.matchAll(/(?<![0-9a-zA-Z])`?([0-9a-f]{7,40})`?(?![0-9a-zA-Z])/g)) {
    if (/[a-f]/.test(m[1]) && /\d/.test(m[1])) achados.add(m[1]);
  }
  return [...achados];
}

/* ---------- Arquivos de fase ---------- */

const cacheDeArquivos = new Map();

/** Lê com cache por caminho e data de modificação: o `contexto` lê o mesmo arquivo mais de uma vez. */
function lerComCache(caminho) {
  const mtime = statSync(caminho).mtimeMs;
  const guardado = cacheDeArquivos.get(caminho);
  if (guardado && guardado.mtime === mtime) return guardado.texto;
  const texto = lerArquivo(caminho);
  cacheDeArquivos.set(caminho, { mtime, texto });
  return texto;
}

/**
 * Os arquivos de fase: `NN-*.md` em docs/roadmap-v2 que têm ao menos um
 * `### V2-Fnn-Enn - ` ou um `# GATE`. Descobrir pelo conteúdo, e não por uma
 * lista de nomes, é o que faz a fixture de teste e o repositório real usarem o
 * mesmo código.
 */
export function arquivosDeFase(raiz = RAIZ) {
  const pasta = caminhos(raiz).roadmap;
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((nome) => /^\d\d-.*\.md$/.test(nome))
    .sort()
    .map((nome) => join(pasta, nome))
    .filter((arquivo) => /^### V2-F\d\d-E\d\d - /m.test(lerComCache(arquivo)));
}

/**
 * Corta o bloco de uma etapa e devolve os campos como mapa.
 *
 * O bloco vai do `### V2-...` até o próximo título de nível 1 a 3. Cada campo é
 * `- **Nome:** valor`; as linhas seguintes (os subitens indentados do "O que
 * deve ser implementado") pertencem ao campo anterior. A linha de Tamanho,
 * Complexidade, Risco e Paralelizável traz quatro campos separados por ` | `.
 */
export function lerBlocoDaEtapa(linhas, indiceDoTitulo) {
  const titulo = /^### (V2-F\d\d-E\d\d) - (.*)$/.exec(linhas[indiceDoTitulo]);
  let fim = linhas.length;
  for (let i = indiceDoTitulo + 1; i < linhas.length; i++) {
    if (/^#{1,3} /.test(linhas[i])) {
      fim = i;
      break;
    }
  }
  const corpo = linhas.slice(indiceDoTitulo + 1, fim);
  const campos = {};
  let atual = null;
  for (const linha of corpo) {
    if (/^- \*\*[^*]+?:\*\*/.test(linha)) {
      const partes = linha.replace(/^- /, "").split(/\s+\|\s+(?=\*\*[^*]+?:\*\*)/);
      for (const parte of partes) {
        const m = /^\*\*(.+?):\*\*\s*(.*)$/.exec(parte);
        if (!m) continue;
        campos[m[1]] = m[2];
        atual = m[1];
      }
    } else if (atual && linha.trim() !== "") {
      campos[atual] += "\n" + linha;
    }
  }
  // Fim de bloco sem as linhas em branco do rodapé.
  let ultima = fim;
  while (ultima > indiceDoTitulo + 1 && linhas[ultima - 1].trim() === "") ultima--;
  return {
    id: titulo[1],
    fase: faseDoId(titulo[1]),
    titulo: titulo[2].trim(),
    linha: indiceDoTitulo + 1,
    linhaFinal: ultima,
    campos,
    texto: linhas.slice(indiceDoTitulo, ultima).join("\n"),
  };
}

/** Subitens do campo "O que deve ser implementado": `[{ prefixo, texto }]` na ordem em que aparecem. */
export function subitensDoImplementar(bloco) {
  const valor = bloco.campos["O que deve ser implementado"] ?? "";
  const itens = [];
  for (const linha of valor.split("\n")) {
    const m = /^\s{2}-\s+([^:`\n]{2,40}):\s*(.*)$/.exec(linha);
    if (m) itens.push({ prefixo: m[1].trim(), texto: m[2] });
    else if (itens.length > 0 && linha.trim() !== "") itens[itens.length - 1].texto += "\n" + linha.trim();
  }
  return itens;
}

/**
 * Procura a etapa pelo ID em todos os arquivos de fase.
 * Devolve `{ arquivo, ...bloco }`, ou `null`. Se o ID aparecer em dois lugares,
 * devolve o primeiro e marca `duplicada` (o conferidor de integridade reclama).
 */
export function localizarEtapa(id, raiz = RAIZ) {
  if (!idValido(id)) return null;
  const achados = [];
  for (const arquivo of arquivosDeFase(raiz)) {
    const linhas = lerComCache(arquivo).split("\n");
    linhas.forEach((linha, i) => {
      if (linha.startsWith(`### ${id} - `)) {
        achados.push({ arquivo: relativo(raiz, arquivo), ...lerBlocoDaEtapa(linhas, i) });
      }
    });
  }
  if (achados.length === 0) return null;
  return { ...achados[0], duplicada: achados.length > 1 };
}

/** Todas as etapas de todos os arquivos de fase (para conferência de integridade). */
export function todasAsEtapasDosArquivos(raiz = RAIZ) {
  const todas = [];
  for (const arquivo of arquivosDeFase(raiz)) {
    const linhas = lerComCache(arquivo).split("\n");
    linhas.forEach((linha, i) => {
      if (/^### V2-F\d\d-E\d\d - /.test(linha)) todas.push({ arquivo: relativo(raiz, arquivo), ...lerBlocoDaEtapa(linhas, i) });
    });
  }
  return todas;
}

/**
 * Cabeçalho da fase: do `# Fase NN` até `## Etapas` (exclusive). Um arquivo pode
 * trazer duas fases (o 04 traz F01 e F08), então procura pelo número.
 */
export function cabecalhoDaFase(fase, raiz = RAIZ) {
  const numero = fase.replace(/^F/, "");
  for (const arquivo of arquivosDeFase(raiz)) {
    const linhas = lerComCache(arquivo).split("\n");
    const inicio = linhas.findIndex((l) => new RegExp(`^# Fase ${numero}\\b`).test(l));
    if (inicio < 0) continue;
    let fim = linhas.length;
    for (let i = inicio + 1; i < linhas.length; i++) {
      if (/^## Etapas\b/.test(linhas[i]) || /^# /.test(linhas[i])) {
        fim = i;
        break;
      }
    }
    while (fim > inicio + 1 && linhas[fim - 1].trim() === "") fim--;
    const texto = linhas.slice(inicio, fim).join("\n");
    const gate = /\*\*Gate da fase:\*\*\s*(G\d\d)\b/.exec(texto)?.[1] ?? null;
    const checkpoints = /\*\*Checkpoints da fase:\*\*\s*([^|\n]*)/.exec(texto)?.[1] ?? "";
    return {
      fase,
      arquivo: relativo(raiz, arquivo),
      linha: inicio + 1,
      titulo: linhas[inicio].replace(/^# /, "").trim(),
      gate,
      checkpointsDaFase: citacoes(checkpoints).checkpoints,
      texto,
    };
  }
  return null;
}

/** Bloco do gate: do `# GATE Gnn` até o próximo título de nível 1. */
export function blocoDoGate(gate, raiz = RAIZ) {
  for (const arquivo of arquivosDeFase(raiz)) {
    const linhas = lerComCache(arquivo).split("\n");
    const inicio = linhas.findIndex((l) => new RegExp(`^# GATE ${gate}\\b`).test(l));
    if (inicio < 0) continue;
    let fim = linhas.length;
    for (let i = inicio + 1; i < linhas.length; i++) {
      if (/^# /.test(linhas[i])) {
        fim = i;
        break;
      }
    }
    while (fim > inicio + 1 && linhas[fim - 1].trim() === "") fim--;
    const corpo = linhas.slice(inicio, fim);
    const itens = corpo
      .filter((l) => /^- \[[ xX]\] /.test(l))
      .map((l) => ({ marcado: /^- \[[xX]\]/.test(l), texto: l.replace(/^- \[[ xX]\] /, "") }));
    const campo = (nome) => {
      const i = corpo.findIndex((l) => l.startsWith(`**${nome}:**`));
      return i < 0 ? "" : corpo[i].replace(`**${nome}:**`, "").trim();
    };
    return {
      gate,
      arquivo: relativo(raiz, arquivo),
      linha: inicio + 1,
      nome: corpo[0].replace(new RegExp(`^# GATE ${gate}\\s*-?\\s*`), "").trim(),
      itens,
      reabreSe: campo("Reabre se"),
      libera: campo("Este Gate libera"),
      texto: corpo.join("\n"),
    };
  }
  return null;
}

/* ---------- Citações: CPs, decisões e ADRs ---------- */

export function citacoes(texto) {
  const unicos = (re, formato) => [...new Set([...texto.matchAll(re)].map((m) => formato(m)))].sort();
  return {
    checkpoints: unicos(/\bCP-(\d{2})\b/g, (m) => `CP-${m[1]}`),
    decisoes: unicos(/\bD-(\d{2})\b/g, (m) => `D-${m[1]}`),
    adrs: unicos(/\bADR[\s-]?(\d{4})\b/gi, (m) => m[1]),
  };
}

/**
 * Dependências de entrada, como IDs completos.
 *
 * Formas reais do campo: "E01 e E02", "E01 a E03, E07", "F09-E21 a E28",
 * "V2-F18-E04", "G07; E02", "CP-41". `E01` sozinho é da mesma fase da etapa.
 * Intervalo "E01 a E03" expande para E01, E02, E03. Devolve também os gates
 * (`G07`) e os checkpoints citados no campo.
 */
export function dependenciasDaEtapa(bloco) {
  const campo = bloco.campos["Dependências de entrada"] ?? "";
  const etapas = new Set();
  const re = /\b(?:V2-)?(?:(F\d\d)-)?E(\d\d)(?:\s+a\s+(?:(?:V2-)?(?:F\d\d-)?E(\d\d)))?\b/g;
  for (const m of campo.matchAll(re)) {
    const fase = m[1] ?? bloco.fase;
    const de = Number(m[2]);
    const ate = m[3] ? Number(m[3]) : de;
    for (let n = Math.min(de, ate); n <= Math.max(de, ate); n++) {
      etapas.add(`V2-${fase}-E${String(n).padStart(2, "0")}`);
    }
  }
  etapas.delete(bloco.id);
  return {
    texto: campo,
    etapas: [...etapas].sort(),
    gates: [...new Set([...campo.matchAll(/\bG(\d\d)\b/g)].map((m) => `G${m[1]}`))].sort(),
    checkpoints: citacoes(campo).checkpoints,
  };
}

/**
 * Checkpoints que TRAVAM a etapa: os do campo "Dependências de entrada" e os do
 * campo "Checkpoint", EXCETO quando este começa com "Não" (ali o CP é só
 * referência, por exemplo "Não (e-mail real: CP-19)"). Os demais CPs citados em
 * outros campos aparecem como "citados", sem travar.
 */
export function checkpointsDaEtapa(bloco) {
  const campoCheckpoint = (bloco.campos["Checkpoint"] ?? "").trim();
  const dependencias = dependenciasDaEtapa(bloco).checkpoints;
  const doCampo = citacoes(campoCheckpoint).checkpoints;
  const travam = new Set([...dependencias]);
  if (!/^N[ãa]o\b/i.test(campoCheckpoint)) for (const cp of doCampo) travam.add(cp);
  const citados = citacoes(bloco.texto).checkpoints;
  return { travam: [...travam].sort(), citados };
}

/* ---------- Decisões e ADRs ---------- */

/** Primeira frase de um texto: até o primeiro ponto final seguido de espaço (ou o texto todo), no máximo `maximo` caracteres. */
export function primeiraFrase(texto, maximo = 220) {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(?:\s|$)/.exec(limpo);
  const frase = m ? m[1] : limpo;
  return frase.length > maximo ? frase.slice(0, maximo - 3).trimEnd() + "..." : frase;
}

/** As linhas `| D-NN ... | decisão | ... |` do arquivo de decisões. */
export function lerDecisoes(raiz = RAIZ) {
  const arquivo = caminhos(raiz).decisoes;
  if (!existsSync(arquivo)) return [];
  const decisoes = [];
  lerArquivo(arquivo).split("\n").forEach((linha, i) => {
    const c = celulasDaLinha(linha);
    if (!c || c.length < 2) return;
    const m = /^(D-\d\d)\b\s*(.*)$/.exec(c[0]);
    if (!m) return;
    decisoes.push({ id: m[1], situacao: m[2], frase: primeiraFrase(c[1]), linha: i + 1 });
  });
  return decisoes;
}

/** ADRs de `docs/adr/NNNN-*.md`, com o título da primeira linha `# `. */
export function listarAdrs(raiz = RAIZ) {
  const pasta = caminhos(raiz).adr;
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((nome) => /^\d{4}-.*\.md$/.test(nome))
    .sort()
    .map((nome) => {
      const texto = lerArquivo(join(pasta, nome));
      const titulo = texto.split("\n").find((l) => l.startsWith("# "))?.replace(/^# /, "").trim() ?? nome;
      return { numero: nome.slice(0, 4), arquivo: `docs/adr/${nome}`, titulo };
    });
}

/* ---------- Evidência ---------- */

/** Pasta de evidência de uma etapa: docs/evidencias-v2/Gnn/V2-Fnn-Enn/. */
export function pastaDeEvidencia(raiz, gate, id) {
  return join(caminhos(raiz).evidencias, gate, id);
}

/**
 * Tabelas markdown de um texto, cada uma com o cabeçalho e as linhas de dados
 * como mapa `{ coluna: valor }` (a coluna é o texto do cabeçalho em minúsculas).
 */
export function tabelasDoTexto(texto) {
  const tabelas = [];
  let atual = null;
  for (const linha of normalizar(texto).split("\n")) {
    const c = celulasDaLinha(linha);
    if (!c) {
      atual = null;
      continue;
    }
    if (c.every((x) => /^:?-{2,}:?$/.test(x))) continue;
    if (!atual) {
      atual = { cabecalho: c.map((x) => x.toLowerCase()), linhas: [] };
      tabelas.push(atual);
    } else {
      atual.linhas.push(Object.fromEntries(atual.cabecalho.map((h, i) => [h, c[i] ?? ""])));
    }
  }
  return tabelas;
}

/**
 * Lê o veredito global de um VEREDITO.md. A política (seção 15 de 28) e o
 * modelo da skill validar-etapa descrevem uma tabela de rodadas com SHA, data e
 * veredito, a rodada nova NO TOPO, sem fixar mais nada, então três formas valem
 * e a primeira que existir manda:
 *
 * 1. um campo `veredito: PASS` (ou `Veredito final:`), em qualquer posição de
 *    linha, com negrito ou marcador de lista; a ÚLTIMA ocorrência decide;
 * 2. a tabela de rodadas do modelo (cabeçalho com "rodada" e "veredito"): a
 *    PRIMEIRA linha de dados é a rodada mais recente, e vale a célula da coluna
 *    "veredito" dela. A tabela de dimensões (também com coluna "veredito") não
 *    é a de rodadas e é ignorada, e `rodadas` devolve cada linha como mapa para
 *    quem precisa das três versões (`politica_validacao_sha`, `mapa_impacto_sha`,
 *    `versao_gatekeeper`);
 * 3. qualquer outra tabela com coluna "veredito": a última linha de dados,
 *    FAIL ou BLOCKED em qualquer célula reprova a linha, só PASS aprova.
 *
 * ACEITA (H84, 26/10/2026) é o veredito de etapa aceita por decisão do Rafael
 * sem PASS de validador (item 3 da seção 19 de 28). Vale como veredito próprio,
 * nunca como PASS: quem exige PASS continua recusando.
 *
 * Qualquer outra coisa é `null`, e `null` NÃO é PASS: fail-closed.
 */
export function lerVeredito(texto) {
  const linhas = normalizar(texto).split("\n");
  let ultimoCampo = null;
  for (const linha of linhas) {
    const m = /^\s*(?:[-*>]\s*)?\**veredito(?:[ _](?:final|geral|atual))?\**\s*:\s*\**\s*(PASS|FAIL|BLOCKED|ACEITA)\b/i.exec(linha);
    if (m && /^aceita$/i.test(m[1]) && m[1] !== "ACEITA") continue;
    if (m) ultimoCampo = m[1].toUpperCase();
  }
  const tabelas = tabelasDoTexto(texto).filter((t) => t.cabecalho.includes("veredito"));
  const deRodadas = tabelas.find((t) => t.cabecalho.includes("rodada"));
  const rodadas = deRodadas ? deRodadas.linhas : [];
  if (ultimoCampo) return { veredito: ultimoCampo, fonte: "campo", rodadas };

  const veredito = (celula) =>
    /\b(PASS|FAIL|BLOCKED)\b/i.exec(celula)?.[1].toUpperCase()
    ?? (/\bACEITA\b/.test(celula ?? "") ? "ACEITA" : null);
  if (deRodadas && deRodadas.linhas.length > 0) {
    const v = veredito(deRodadas.linhas[0]["veredito"]);
    return { veredito: v, fonte: "tabela de rodadas", rodadas };
  }
  const outra = tabelas.find((t) => t.linhas.length > 0);
  if (outra) {
    const ultima = Object.values(outra.linhas[outra.linhas.length - 1]).join(" | ");
    for (const v of ["FAIL", "BLOCKED", "PASS"]) {
      if (new RegExp(`\\b${v}\\b`, "i").test(ultima)) return { veredito: v, fonte: "tabela", rodadas };
    }
  }
  return { veredito: null, fonte: null, rodadas };
}

/** Critério, validade e quem aceitou, lidos das linhas `- **Critério:** ...` de um RISCO-ACEITO.md. */
export function lerRiscoAceito(texto) {
  const campo = (nome) => {
    const re = new RegExp(`^\\s*(?:[-*]\\s*)?\\**${nome}\\**\\s*:\\s*\\**\\s*(.+)$`, "im");
    return re.exec(normalizar(texto))?.[1].replace(/\*\*/g, "").trim() ?? "";
  };
  return {
    criterio: campo("crit[eé]rio"),
    validade: campo("validade"),
    aceitoPor: campo("(?:quem aceitou|aceito por)"),
    encerrado: /^\s*(?:[-*]\s*)?\**status\**\s*:\s*\**\s*(expirado|revogado|encerrado)/im.test(normalizar(texto)),
    // Rascunho do gatekeeper deixa "Quem aceitou" vazio: "(vazio) em (vazio)" ou "(vazio; só Rafael ...)".
    aceito: pessoaAceitou(campo("(?:quem aceitou|aceito por)")),
  };
}

/** Falso para o campo "Quem aceitou" em branco ou com marcador de rascunho ("(vazio)", "n/a", "pendente", "-"). */
function pessoaAceitou(valor) {
  const v = valor.trim();
  if (v === "") return false;
  return !/^(?:\(?\s*(?:vazi[oa]|em branco|pendente|nenhum[a]?|n\/a)\b|[-_–]+$)/i.test(v);
}

/** Risco aceito que vale: assinado por alguém e não encerrado, expirado nem revogado. Rascunho não vale. */
export function riscoAceitoVigente(r) {
  return Boolean(r) && r.aceito === true && r.encerrado === false;
}

/** O que existe na pasta de evidência de uma etapa, só o primeiro nível. */
export function inspecionarEvidencia(raiz, gate, id) {
  const pasta = pastaDeEvidencia(raiz, gate, id);
  const relativa = relativo(raiz, pasta);
  if (!existsSync(pasta)) {
    return { pasta: relativa, existe: false, entradas: [], index: false, veredito: null, riscoAceito: false, validacao: false };
  }
  const entradas = readdirSync(pasta)
    .sort()
    .map((nome) => (statSync(join(pasta, nome)).isDirectory() ? `${nome}/` : nome));
  const vereditoCaminho = join(pasta, "VEREDITO.md");
  return {
    pasta: relativa,
    existe: true,
    entradas,
    index: entradas.includes("INDEX.md"),
    vereditoArquivo: entradas.includes("VEREDITO.md"),
    veredito: entradas.includes("VEREDITO.md") ? lerVeredito(lerArquivo(vereditoCaminho)).veredito : null,
    riscoAceito: entradas.includes("RISCO-ACEITO.md"),
    validacao: entradas.includes("validacao/"),
  };
}

/** Varre docs/evidencias-v2 atrás de GATE.md, VEREDITO.md e RISCO-ACEITO.md. */
export function varrerEvidencias(raiz = RAIZ) {
  const base = caminhos(raiz).evidencias;
  const resultado = { gates: new Map(), etapas: new Map() };
  if (!existsSync(base)) return resultado;
  for (const gate of readdirSync(base).sort()) {
    if (!/^G\d\d$/.test(gate)) continue;
    const pastaDoGate = join(base, gate);
    const gateMd = join(pastaDoGate, "GATE.md");
    resultado.gates.set(gate, { gateMd: existsSync(gateMd) ? lerArquivo(gateMd) : null });
    for (const nome of readdirSync(pastaDoGate).sort()) {
      if (!RE_ID_DE_ETAPA.test(nome)) continue;
      const pasta = join(pastaDoGate, nome);
      if (!statSync(pasta).isDirectory()) continue;
      const veredito = join(pasta, "VEREDITO.md");
      const risco = join(pasta, "RISCO-ACEITO.md");
      resultado.etapas.set(nome, {
        gate,
        pasta: relativo(raiz, pasta),
        veredito: existsSync(veredito) ? lerVeredito(lerArquivo(veredito)) : null,
        riscoAceito: existsSync(risco) ? { ...lerRiscoAceito(lerArquivo(risco)), arquivo: relativo(raiz, risco) } : null,
      });
    }
  }
  return resultado;
}

/* ---------- Git ---------- */

/** Roda `git` na raiz e devolve `{ ok, saida }`; nunca lança. Sem rede: só comandos locais. */
export function git(args, raiz = RAIZ, { maxBuffer = 256 * 1024 * 1024 } = {}) {
  try {
    const saida = execFileSync("git", args, {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer,
    });
    return { ok: true, saida: saida.replace(/\r\n/g, "\n") };
  } catch (erro) {
    return { ok: false, saida: String(erro.stderr ?? erro.message ?? "").trim() };
  }
}

/** O hash existe como commit neste repositório? */
export function commitExiste(hash, raiz = RAIZ) {
  return git(["cat-file", "-e", `${hash}^{commit}`], raiz).ok;
}
