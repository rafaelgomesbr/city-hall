#!/usr/bin/env node
/**
 * Regressão seletiva e herança por impacto (28-execucao-e-validacao.md, seções
 * 6 e 14), lidas de `docs/roadmap-v2/mapa-de-impacto.json`.
 *
 * Duas perguntas, as duas respondidas pelo mesmo mapa:
 *
 * 1. "Dado este diff, o que preciso rodar?" `impactoDoDiff` devolve as suítes
 *    (as de sempre primeiro), as seções do e2e, os itens de gate e as
 *    condições "Reabre se" ligadas aos caminhos tocados. Caminho de produto que
 *    nenhuma regra conhece vai em `semRegra` e liga `kitCompleto`: o mapa que
 *    não conhece o caminho não pode dizer que ele não afeta nada (fail-closed).
 *
 * 2. "Esta dimensão que passou na rodada anterior pode ser herdada?" `herdavel`
 *    diz que sim só se o diff entre os dois SHAs não toca nenhum padrão do mapa
 *    da dimensão. Três coisas impedem a herança de saída: o relatório antigo
 *    não ser PASS, o diff não poder ser lido, e o diff tocar a própria
 *    política, o mapa ou a skill (regra que mudou não é a regra que aprovou).
 *
 * Os padrões são glob simples: `**` atravessa pastas, `*` fica num nível, `?` é
 * um caractere. Caminhos são relativos à raiz do repositório, com barra normal.
 *
 * Uso:
 *   node scripts/roadmap/impacto.mjs <base>..<head> [--json]
 *   node scripts/roadmap/impacto.mjs --herdavel RELATORIO.md --para <sha> [--json]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { RAIZ, git, lerArquivo } from "./roadmap.mjs";

export const ARQUIVO_DO_MAPA = "docs/roadmap-v2/mapa-de-impacto.json";

/** Arquivos que MUDAM a regra: se o diff os toca, nada é herdado. */
const ARQUIVOS_DE_REGRA = [ARQUIVO_DO_MAPA, "docs/roadmap-v2/28-execucao-e-validacao.md", ".claude/skills/validar-etapa/**", "scripts/roadmap/**"];

/* ---------- Glob ---------- */

const cacheDeRegex = new Map();

/** Converte o glob simples em expressão regular ancorada. */
export function globParaRegex(glob) {
  if (cacheDeRegex.has(glob)) return cacheDeRegex.get(glob);
  let r = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      // `**/` casa zero ou mais pastas; `**` no fim casa o resto.
      if (glob[i + 2] === "/") {
        r += "(?:.*/)?";
        i += 2;
      } else {
        r += ".*";
        i += 1;
      }
    } else if (c === "*") r += "[^/]*";
    else if (c === "?") r += "[^/]";
    else r += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const regex = new RegExp(`^${r}$`);
  cacheDeRegex.set(glob, regex);
  return regex;
}

export function casa(padroes, caminho) {
  return padroes.some((p) => globParaRegex(p).test(caminho));
}

/** Caminho relativo à raiz, com barra normal, sem `./`. */
export function normalizar(caminho) {
  return caminho.replace(/\\/g, "/").replace(/^\.\//, "");
}

/* ---------- Mapa ---------- */

export function lerMapa(raiz = RAIZ) {
  const arquivo = join(raiz, ...ARQUIVO_DO_MAPA.split("/"));
  if (!existsSync(arquivo)) throw new Error(`Mapa de impacto não encontrado: ${ARQUIVO_DO_MAPA}`);
  return JSON.parse(readFileSync(arquivo, "utf8"));
}

/* ---------- Impacto de um diff ---------- */

function juntarSecoes(destino, origem) {
  for (const [arquivo, secoes] of Object.entries(origem ?? {})) {
    if (destino[arquivo] === "todas") continue;
    if (secoes === "todas") destino[arquivo] = "todas";
    else destino[arquivo] = [...new Set([...(destino[arquivo] ?? []), ...secoes])].sort((a, b) => a - b);
  }
}

/**
 * O que um diff pede. `arquivos` é a lista de caminhos tocados (texto ou
 * `{ caminho }`). Os caminhos da lista permitida (registro de validação) não
 * pedem nada.
 */
export function impactoDoDiff(arquivos, mapa) {
  const caminhos = arquivos.map((a) => normalizar(typeof a === "string" ? a : a.caminho));
  const naListaPermitida = caminhos.filter((c) => casa(mapa.lista_permitida, c));
  const deProduto = caminhos.filter((c) => !naListaPermitida.includes(c));

  const suites = [...mapa.sempre.suites];
  const itens = [...mapa.sempre.itens_de_gate];
  const tags = new Set();
  const secoesE2e = {};
  const regrasUsadas = [];
  const semRegra = [];

  for (const caminho of deProduto) {
    const regras = mapa.regras.filter((r) => casa(r.padroes, caminho));
    if (regras.length === 0) semRegra.push(caminho);
    for (const regra of regras) {
      if (!regrasUsadas.includes(regra.id)) regrasUsadas.push(regra.id);
      suites.push(...regra.suites);
      itens.push(...regra.itens_de_gate);
      for (const t of regra.tags) tags.add(t);
      juntarSecoes(secoesE2e, regra.secoes_e2e);
    }
  }

  const reabreSe = mapa.reabre_se.filter((r) => deProduto.some((c) => casa(r.padroes, c)));
  for (const r of reabreSe) {
    suites.push(...r.suites);
    itens.push(...r.itens_de_gate);
  }

  const unicas = [...new Set(suites)];
  return {
    arquivos: caminhos,
    naListaPermitida,
    comandos: unicas.filter((s) => s.startsWith("npm ") || s.startsWith("node ")),
    testes: unicas.filter((s) => !s.startsWith("npm ") && !s.startsWith("node ")),
    secoesE2e,
    itensDeGate: [...new Set(itens)],
    tags: [...tags].sort(),
    regras: regrasUsadas,
    semRegra,
    // O mapa não conhece estes caminhos: a regressão não pode ser seletiva.
    kitCompleto: semRegra.length > 0,
    reabreSe: reabreSe.map((r) => ({ id: r.id, gate: r.gate, condicao: r.condicao })),
  };
}

/** Arquivos tocados entre dois SHAs, por `git diff --name-only`. Lança se o git não consegue. */
export function arquivosEntre(shaAntigo, shaNovo, raiz = RAIZ) {
  for (const sha of [shaAntigo, shaNovo]) {
    if (!/^[0-9a-zA-Z_@{}^~./-]+$/.test(sha) || sha.startsWith("-")) throw new Error(`SHA ou referência inválida: "${sha}"`);
  }
  const r = git(["diff", "--name-only", `${shaAntigo}..${shaNovo}`], raiz);
  if (!r.ok) throw new Error(`git diff --name-only falhou: ${r.saida}`);
  return r.saida.split("\n").map((l) => l.trim()).filter(Boolean);
}

/* ---------- Dimensões e herança ---------- */

/** Padrões do mapa de uma dimensão: os próprios mais os das regras que têm alguma das tags dela. */
export function padroesDaDimensao(dimensao, mapa) {
  const d = mapa.dimensoes[dimensao];
  if (!d) return null;
  const doMapa = mapa.regras.filter((r) => r.tags.some((t) => d.tags.includes(t))).flatMap((r) => r.padroes);
  return [...new Set([...d.padroes, ...doMapa])];
}

/** Arquivos do diff (fora da lista permitida) que tocam o mapa da dimensão. */
export function dimensaoToca(dimensao, arquivos, mapa) {
  const padroes = padroesDaDimensao(dimensao, mapa);
  if (!padroes) return null;
  return arquivos.map(normalizar).filter((c) => !casa(mapa.lista_permitida, c) && casa(padroes, c));
}

/** Campos do cabeçalho YAML simples de um relatório de validador (entre os dois `---`). */
export function lerCabecalho(texto) {
  const linhas = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  if (linhas[0]?.trim() !== "---") return null;
  const fim = linhas.indexOf("---", 1);
  if (fim < 0) return null;
  const campos = {};
  for (const linha of linhas.slice(1, fim)) {
    const m = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(linha);
    if (m) campos[m[1]] = m[2].trim();
  }
  return campos;
}

/**
 * A dimensão do relatório antigo pode ser herdada no SHA novo?
 *
 * `relatorio` é o TEXTO do relatório antigo. `arquivos` (opcional) substitui a
 * leitura do git, para testes.
 */
export function herdavel({ relatorio, shaNovo, mapa, raiz = RAIZ, arquivos = null }) {
  const nao = (motivo, extra = {}) => ({ herdavel: false, motivo, tocados: [], ...extra });
  const cab = lerCabecalho(relatorio);
  if (!cab) return nao("relatório sem cabeçalho YAML legível");
  const dimensao = cab.validador;
  const antigo = cab.sha_validado;
  if (!dimensao || !antigo) return nao("o cabeçalho não diz validador e sha_validado");
  const base = { dimensao, shaAntigo: antigo.slice(0, 7), shaNovo: shaNovo.slice(0, 7) };
  if ((cab.veredito ?? "").toUpperCase() !== "PASS") return nao(`só PASS é herdado e o relatório diz ${cab.veredito || "nada"}`, base);
  if (!mapa.dimensoes[dimensao]) return nao(`a dimensão "${dimensao}" não tem mapa de impacto`, base);

  let tocadosNoDiff;
  try {
    tocadosNoDiff = arquivos ?? arquivosEntre(antigo, shaNovo, raiz);
  } catch (erro) {
    return nao(`não consegui ler o diff: ${erro.message}`, base);
  }
  const regra = tocadosNoDiff.map(normalizar).filter((c) => casa(ARQUIVOS_DE_REGRA, c));
  if (regra.length > 0) return nao(`a regra mudou entre os SHAs (${regra[0]}): nada é herdado`, { ...base, tocados: regra });

  const tocados = dimensaoToca(dimensao, tocadosNoDiff, mapa);
  if (tocados.length > 0) return nao(`o diff toca o mapa da dimensão (${tocados[0]})`, { ...base, tocados });
  return {
    herdavel: true,
    ...base,
    tocados: [],
    motivo: "o diff não toca o mapa da dimensão",
    registro: `herdado de ${base.shaAntigo}, sem impacto`,
  };
}

/* ---------- Saída de texto ---------- */

export function formatarImpacto(i) {
  const L = [];
  L.push(`Arquivos no diff: ${i.arquivos.length} (${i.naListaPermitida.length} na lista permitida)`);
  L.push(`Tags do impacto: ${i.tags.length > 0 ? i.tags.join(", ") : "nenhuma"}`);
  L.push("Comandos (a partir de dc360/):");
  for (const c of i.comandos) L.push(`  ${c}`);
  L.push("Arquivos de teste:");
  for (const t of i.testes) L.push(`  ${t}`);
  if (i.testes.length === 0) L.push("  (nenhum além dos comandos)");
  const secoes = Object.entries(i.secoesE2e).map(([a, s]) => `${a}: ${s === "todas" ? "todas" : s.join(", ")}`);
  L.push(`Seções do e2e: ${secoes.length > 0 ? secoes.join(" | ") : "nenhuma"}`);
  L.push(`Itens de gate: ${i.itensDeGate.join("; ")}`);
  if (i.reabreSe.length > 0) L.push(`Reabre se ligado ao diff: ${i.reabreSe.map((r) => `${r.id} (${r.condicao})`).join("; ")}`);
  if (i.kitCompleto) L.push(`ATENÇÃO, sem regra no mapa (rode o kit completo): ${i.semRegra.join(", ")}`);
  return L.join("\n");
}

/* ---------- CLI ---------- */

function principal(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const mapa = lerMapa();
  const iHerdavel = args.indexOf("--herdavel");
  if (iHerdavel >= 0) {
    const arquivo = args[iHerdavel + 1];
    const iPara = args.indexOf("--para");
    const sha = iPara >= 0 ? args[iPara + 1] : null;
    if (!arquivo || !sha) {
      console.error("Uso: node scripts/roadmap/impacto.mjs --herdavel RELATORIO.md --para <sha> [--json]");
      return 2;
    }
    const resultado = herdavel({ relatorio: lerArquivo(arquivo), shaNovo: sha, mapa });
    console.log(json ? JSON.stringify(resultado, null, 2) : `${resultado.herdavel ? "HERDÁVEL" : "NÃO herdável"} (${resultado.dimensao ?? "?"}): ${resultado.motivo}${resultado.registro ? `\n${resultado.registro}` : ""}`);
    return resultado.herdavel ? 0 : 1;
  }
  const intervalo = args.find((a) => !a.startsWith("-"));
  const m = intervalo ? /^(.+?)\.\.(.+)$/.exec(intervalo) : null;
  if (!m) {
    console.error("Uso: node scripts/roadmap/impacto.mjs <base>..<head> [--json]");
    return 2;
  }
  let arquivos;
  try {
    arquivos = arquivosEntre(m[1], m[2]);
  } catch (erro) {
    console.error(erro.message);
    return 2;
  }
  const impacto = impactoDoDiff(arquivos, mapa);
  console.log(json ? JSON.stringify(impacto, null, 2) : formatarImpacto(impacto));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
