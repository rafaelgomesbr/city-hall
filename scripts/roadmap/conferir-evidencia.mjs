#!/usr/bin/env node
/**
 * Conferências mecânicas e fail-closed da evidência de uma etapa, no SHA
 * candidato (28-execucao-e-validacao.md, seção 6, e passo 3 da skill
 * `.claude/skills/validar-etapa/SKILL.md`).
 *
 * O que ele é e o que não é. É o que o gatekeeper conferiria à mão e esqueceria
 * às duas da tarde: a pasta existe, o `INDEX.md` bate com os arquivos byte a
 * byte, não há segredo nem travessão, há captura nas larguras e temas
 * exigidos, há sonda antes e depois quando o risco é alto, o SHA existe e é
 * ancestral do HEAD, o que veio depois dele só tocou a lista permitida, e as
 * regras que aprovam (política, mapa, skill, scripts) estão commitadas. Ele NÃO
 * julga se a evidência é boa: só se ela existe, está inteira e não vaza.
 *
 * Fail-closed: o que ele não consegue ler vira FALHA, e só o que ele sabe que
 * pode ser variação de nome (o padrão de nome das capturas) vira AVISO. Código
 * de saída 1 se houver qualquer FALHA.
 *
 * Com `--registro` (commit de registro da validação) confere também o formato
 * dos relatórios `validacao/<sha7>/*.md` (cabeçalho YAML, seções da seção 15,
 * "Tentativas de reprovar" e, em risco alto, "Não verificado" não vazios), o
 * VEREDITO.md com as três versões das regras e o `gerar-estado --conferir`.
 *
 * Uso:
 *   node scripts/roadmap/conferir-evidencia.mjs V2-Fnn-Enn --sha <sha> [--registro] [--json]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { conferir as conferirEstado } from "./gerar-estado.mjs";
import { casa, lerCabecalho, lerMapa } from "./impacto.mjs";
import {
  RAIZ,
  git,
  gateDaFase,
  idValido,
  faseDoId,
  lerStatusDoRepositorio,
  lerVeredito,
  localizarEtapa,
  normalizar,
  pastaDeEvidencia,
  relativo,
  tabelasDoTexto,
} from "./roadmap.mjs";
import { analisarEtapa } from "./tags.mjs";

/** O que muda a regra que aprova: precisa estar commitado (28, seção 6, última regra). */
export const CAMINHOS_DE_REGRA = [
  "docs/roadmap-v2/28-execucao-e-validacao.md",
  "docs/roadmap-v2/mapa-de-impacto.json",
  ".claude/skills/validar-etapa",
  "scripts/roadmap",
];

export const LARGURAS_EXIGIDAS = [1280, 390];
export const TEMAS_EXIGIDOS = ["claro", "escuro"];

const EXTENSOES_DE_TEXTO = new Set([".md", ".txt", ".json", ".patch", ".log", ".yml", ".yaml", ".sql", ".mjs", ".js", ".ts", ".tsx", ".csv", ".html", ".sh", ".css", ".toml", ".env", ".diff", ".xml"]);
const EXTENSOES_DE_IMAGEM = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** Campos do cabeçalho de um relatório de validador (seção 15). `herdado_de` é opcional. */
export const CAMPOS_DO_RELATORIO = [
  "validador", "modelo", "etapa", "sha_validado", "ci_run", "rodada", "tags",
  "nivel_de_prova_exigido", "nivel_de_prova_obtido", "veredito", "confianca",
  "humano_necessario", "escalar",
];

export const SECOES_DO_RELATORIO = [
  "Critérios verificados", "Evidência", "Cenários positivos", "Cenários negativos",
  "Tentativas de reprovar", "Achados", "Não verificado", "Risco residual", "Motivo do humano",
];

/** Padrões de segredo. Cada um diz o nome, e o achado mostra arquivo e linha, nunca o valor. */
export const PADROES_DE_SEGREDO = [
  { nome: "JWT", re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/ },
  { nome: "cabeçalho Bearer com valor", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { nome: "cabeçalho Basic com valor", re: /\bBasic\s+[A-Za-z0-9+/=]{16,}/ },
  { nome: "PASSWORD com valor", re: /\bPASSWORD\s+'[^']+'|\bPASSWORD\s*[=:]\s*["'][^"']{2,}["']/i },
  { nome: "URL com usuário e senha", re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@\[\]]+:[^/\s@\[\]]+@/i },
  { nome: "variável *_SEGREDO com valor", re: /\b[A-Z][A-Z0-9_]*SEGREDO[A-Z0-9_]*\s*=\s*(?!\s|["']?\s*$|\[|<|\$|["']?(?:xxx|\*{3}|\.\.\.|redigido|exemplo))[^\s"']{3,}/i },
];

/* ---------- Utilidades ---------- */

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Todos os arquivos de uma pasta, recursivamente, como caminhos relativos com barra normal. */
export function listarArquivos(pasta, base = pasta) {
  const achados = [];
  for (const nome of readdirSync(pasta).sort()) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...listarArquivos(caminho, base));
    else achados.push(relativo(base, caminho));
  }
  return achados;
}

/** Arquivos que o gatekeeper acrescenta DEPOIS do INDEX.md: não entram na conferência do índice. */
export const ehDoGatekeeper = (arquivo) => arquivo === "VEREDITO.md" || arquivo === "RISCO-ACEITO.md" || arquivo.startsWith("validacao/");

/** Texto de uma seção `## Título` até a próxima `## `, sem os comentários de modelo entre parênteses. */
export function corpoDaSecao(texto, titulo) {
  const linhas = normalizar(texto).split("\n");
  const i = linhas.findIndex((l) => l.trim().toLowerCase() === `## ${titulo}`.toLowerCase());
  if (i < 0) return null;
  const corpo = [];
  for (let j = i + 1; j < linhas.length; j++) {
    if (/^## /.test(linhas[j])) break;
    corpo.push(linhas[j]);
  }
  return corpo
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^\(.*\)$/.test(l))
    .join("\n");
}

/* ---------- Cada conferência devolve `{ codigo, nivel, mensagem }` ---------- */

const ok = (codigo, mensagem) => ({ codigo, nivel: "OK", mensagem });
const falha = (codigo, mensagem) => ({ codigo, nivel: "FALHA", mensagem });
const aviso = (codigo, mensagem) => ({ codigo, nivel: "AVISO", mensagem });

/** O INDEX.md existe e cada arquivo da pasta bate com o SHA-256 dele. */
export function conferirIndice(pasta) {
  const caminhoIndex = join(pasta, "INDEX.md");
  if (!existsSync(caminhoIndex)) return [falha("indice", "INDEX.md não existe na pasta da etapa")];

  const listados = new Map();
  for (const t of tabelasDoTexto(readFileSync(caminhoIndex, "utf8"))) {
    if (!t.cabecalho.includes("arquivo") || !t.cabecalho.includes("sha-256")) continue;
    for (const l of t.linhas) listados.set(l["arquivo"], l["sha-256"].toLowerCase());
  }
  if (listados.size === 0) return [falha("indice", "INDEX.md não tem a tabela | Arquivo | SHA-256 | com linhas")];

  const resultados = [];
  // `montarIndice` (dc360/scripts/baseline.mjs) deixa de fora todo arquivo chamado INDEX.md, em qualquer profundidade.
  const reais = listarArquivos(pasta).filter((a) => a.split("/").pop() !== "INDEX.md");
  const problemas = [];
  const avisos = [];
  for (const arquivo of reais) {
    const esperado = listados.get(arquivo);
    if (esperado === undefined) {
      if (!ehDoGatekeeper(arquivo)) problemas.push(`${arquivo} existe e não está no INDEX.md`);
      continue;
    }
    const bytes = readFileSync(join(pasta, arquivo));
    if (sha256(bytes) === esperado) continue;
    // O índice de uma máquina com CRLF e o arquivo de outra: bate se as quebras de linha forem normalizadas.
    const lf = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    if (sha256(lf) === esperado) avisos.push(`${arquivo} só bate com o SHA-256 normalizando CRLF para LF`);
    else problemas.push(`${arquivo} tem SHA-256 diferente do INDEX.md`);
  }
  for (const [arquivo] of listados) {
    if (!reais.includes(arquivo)) problemas.push(`${arquivo} está no INDEX.md e não existe na pasta`);
  }
  if (problemas.length > 0) resultados.push(falha("indice", `INDEX.md não bate: ${problemas.slice(0, 6).join("; ")}${problemas.length > 6 ? `; e mais ${problemas.length - 6}` : ""}`));
  else resultados.push(ok("indice", `INDEX.md bate com os ${listados.size} arquivo(s) listado(s), SHA-256 a SHA-256`));
  for (const a of avisos) resultados.push(aviso("indice-crlf", a));
  return resultados;
}

/** Nenhum padrão de segredo em arquivo de texto da pasta (inclusive a validacao/). */
export function conferirSegredos(pasta) {
  const achados = [];
  let lidos = 0;
  for (const arquivo of listarArquivos(pasta)) {
    if (!EXTENSOES_DE_TEXTO.has(extname(arquivo).toLowerCase())) continue;
    lidos++;
    const linhas = normalizar(readFileSync(join(pasta, arquivo), "utf8")).split("\n");
    linhas.forEach((linha, i) => {
      for (const { nome, re } of PADROES_DE_SEGREDO) {
        if (re.test(linha)) achados.push(`${arquivo}:${i + 1} (${nome})`);
      }
    });
  }
  if (achados.length > 0) {
    return [falha("segredos", `possível segredo em ${achados.length} linha(s): ${achados.slice(0, 5).join("; ")}${achados.length > 5 ? `; e mais ${achados.length - 5}` : ""}`)];
  }
  return [ok("segredos", `nenhum padrão de segredo em ${lidos} arquivo(s) de texto`)];
}

/** Nenhum travessão (U+2014) em .md da pasta. */
export function conferirTravessao(pasta) {
  const achados = [];
  for (const arquivo of listarArquivos(pasta)) {
    if (extname(arquivo).toLowerCase() !== ".md") continue;
    normalizar(readFileSync(join(pasta, arquivo), "utf8")).split("\n").forEach((linha, i) => {
      if (linha.includes("\u2014")) achados.push(`${arquivo}:${i + 1}`);
    });
  }
  if (achados.length > 0) return [falha("travessao", `travessão em ${achados.length} linha(s) de .md: ${achados.slice(0, 5).join("; ")}${achados.length > 5 ? `; e mais ${achados.length - 5}` : ""}`)];
  return [ok("travessao", "nenhum travessão nos .md da pasta")];
}

/** Capturas nas larguras e temas exigidos, lidas pelo nome do arquivo. */
export function conferirCapturas(pasta) {
  const imagens = listarArquivos(pasta).filter((a) => EXTENSOES_DE_IMAGEM.has(extname(a).toLowerCase()));
  if (imagens.length === 0) return [falha("capturas", "etapa de interface sem nenhuma captura de tela na pasta (png, jpg, webp)")];

  const combinacoes = new Set();
  let comLargura = 0;
  let comTema = 0;
  for (const imagem of imagens) {
    const nome = imagem.toLowerCase();
    const largura = /(?<![0-9])(1280|768|390|320)(?![0-9])/.exec(nome)?.[1];
    const tema = /(?<![a-z])(claro|escuro|light|dark)(?![a-z])/.exec(nome)?.[1];
    if (largura) comLargura++;
    if (tema) comTema++;
    if (largura && tema) combinacoes.add(`${largura}:${tema === "light" ? "claro" : tema === "dark" ? "escuro" : tema}`);
  }
  const faltam = [];
  for (const l of LARGURAS_EXIGIDAS) for (const t of TEMAS_EXIGIDOS) if (!combinacoes.has(`${l}:${t}`)) faltam.push(`${l} px ${t}`);

  if (comLargura === 0 || comTema === 0) {
    return [aviso("capturas", `${imagens.length} captura(s), mas o padrão de nome não dá para ler (esperado algo como tela-1280-claro.png): confira largura e tema à mão`)];
  }
  if (faltam.length > 0) return [falha("capturas", `faltam capturas pelo nome: ${faltam.join(", ")} (achei ${imagens.length} imagem(ns))`)];
  return [ok("capturas", `capturas em 1280 e 390 px, claro e escuro (${imagens.length} imagem(ns))`)];
}

/** Sonda antes e depois em etapa de risco alto ou crítico: arquivo com "antes" (e "depois") no nome em saidas/ ou sondas/. */
export function conferirSonda(pasta) {
  const candidatos = listarArquivos(pasta).filter((a) => /^(saidas|sondas)\//i.test(a));
  const antes = candidatos.filter((a) => /antes/i.test(a));
  const depois = candidatos.filter((a) => /depois/i.test(a));
  if (antes.length === 0) return [falha("sonda", 'risco alto ou crítico sem sonda "antes": nenhum arquivo com "antes" no nome em saidas/ ou sondas/')];
  if (depois.length === 0) return [aviso("sonda", `há sonda "antes" (${antes[0]}), mas nenhum arquivo com "depois" no nome em saidas/ ou sondas/`)];
  return [ok("sonda", `sonda antes e depois presentes (${antes[0]} e ${depois[0]})`)];
}

/** O SHA existe, é commit e é ancestral do HEAD. */
export function conferirSha(sha, raiz) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return [falha("sha", `"${sha}" não parece um SHA (7 a 40 hexadecimais)`)];
  if (!git(["cat-file", "-e", `${sha}^{commit}`], raiz).ok) return [falha("sha", `${sha} não existe como commit neste repositório`)];
  if (!git(["merge-base", "--is-ancestor", sha, "HEAD"], raiz).ok) return [falha("sha", `${sha} existe, mas não é ancestral do HEAD`)];
  return [ok("sha", `${sha.slice(0, 7)} existe e é ancestral do HEAD`)];
}

/** `<sha>..HEAD` só toca a lista permitida da seção 6. */
export function conferirListaPermitida(sha, raiz, mapa) {
  const r = git(["diff", "--name-only", `${sha}..HEAD`], raiz);
  if (!r.ok) return [falha("lista-permitida", `não consegui ler o diff ${sha.slice(0, 7)}..HEAD: ${r.saida}`)];
  const tocados = r.saida.split("\n").map((l) => l.trim()).filter(Boolean);
  const fora = tocados.filter((c) => !casa(mapa.lista_permitida, c));
  if (fora.length > 0) {
    return [falha("lista-permitida", `${sha.slice(0, 7)}..HEAD toca ${fora.length} arquivo(s) fora da lista permitida (o candidato não é o produto atual, peça um candidato novo): ${fora.slice(0, 5).join("; ")}${fora.length > 5 ? `; e mais ${fora.length - 5}` : ""}`)];
  }
  return [ok("lista-permitida", `${sha.slice(0, 7)}..HEAD só toca a lista permitida (${tocados.length} arquivo(s))`)];
}

/** A política, o mapa, a skill e os scripts sem mudança não commitada (nem arquivo novo solto). */
export function conferirRegrasCommitadas(raiz) {
  const r = git(["status", "--porcelain", "--", ...CAMINHOS_DE_REGRA], raiz);
  if (!r.ok) return [falha("regras-commitadas", `não consegui ler o git status: ${r.saida}`)];
  const sujos = r.saida.split("\n").filter((l) => l.trim() !== "");
  if (sujos.length > 0) {
    return [falha("regras-commitadas", `regra com mudança não commitada (a validação fica BLOCKED): ${sujos.slice(0, 5).map((l) => l.trim()).join("; ")}${sujos.length > 5 ? `; e mais ${sujos.length - 5}` : ""}`)];
  }
  return [ok("regras-commitadas", "política, mapa de impacto, skill e scripts sem mudança não commitada")];
}

/* ---------- Registro da validação (--registro) ---------- */

/** Formato de um relatório `validacao/<sha7>/<dimensao>.md` (seção 15). */
export function conferirRelatorio(texto, { arquivo, id, sha, riscoAlto }) {
  const problemas = [];
  const cab = lerCabecalho(texto);
  if (!cab) return [`${arquivo}: sem cabeçalho YAML entre dois "---"`];
  for (const campo of CAMPOS_DO_RELATORIO) {
    if (!(campo in cab) || cab[campo] === "") problemas.push(`${arquivo}: campo "${campo}" ausente ou vazio no cabeçalho`);
  }
  if (cab.etapa && cab.etapa !== id) problemas.push(`${arquivo}: etapa "${cab.etapa}" não é ${id}`);
  if (cab.sha_validado && !cab.sha_validado.toLowerCase().startsWith(sha.slice(0, 7).toLowerCase()) && !sha.toLowerCase().startsWith(cab.sha_validado.toLowerCase().slice(0, 7))) {
    problemas.push(`${arquivo}: sha_validado "${cab.sha_validado}" não é ${sha.slice(0, 7)}`);
  }
  if (cab.veredito && !["PASS", "FAIL", "BLOCKED", "N/A"].includes(cab.veredito.toUpperCase())) problemas.push(`${arquivo}: veredito "${cab.veredito}" fora de PASS, FAIL, BLOCKED ou N/A`);
  if (cab.confianca && !["alta", "media", "baixa"].includes(cab.confianca.toLowerCase())) problemas.push(`${arquivo}: confianca "${cab.confianca}" fora de alta, media ou baixa`);
  if (cab.humano_necessario && !["sim", "nao"].includes(cab.humano_necessario.toLowerCase())) problemas.push(`${arquivo}: humano_necessario "${cab.humano_necessario}" fora de sim ou nao`);
  if (cab.rodada && !/^\d+$/.test(cab.rodada)) problemas.push(`${arquivo}: rodada "${cab.rodada}" não é número`);

  for (const secao of SECOES_DO_RELATORIO) {
    if (corpoDaSecao(texto, secao) === null) problemas.push(`${arquivo}: falta a seção "## ${secao}"`);
  }
  const herdado = (cab.herdado_de ?? "") !== "";
  if (corpoDaSecao(texto, "Tentativas de reprovar") === "" && !herdado) problemas.push(`${arquivo}: "Tentativas de reprovar" está vazia (o relatório é recusado)`);
  if (riscoAlto && corpoDaSecao(texto, "Não verificado") === "" && !herdado) problemas.push(`${arquivo}: "Não verificado" está vazio em etapa de risco alto (o relatório é recusado)`);
  return problemas;
}

/** VEREDITO.md: rodada do SHA no topo, veredito legível e as três versões das regras. */
export function conferirVeredito(texto, { sha }) {
  const problemas = [];
  const lido = lerVeredito(texto);
  if (lido.rodadas.length === 0) return ["VEREDITO.md: não achei a tabela de rodadas (cabeçalho com Rodada e Veredito)"];
  const primeira = lido.rodadas[0];
  const celula = (nome) => (primeira[nome] ?? "").trim();
  const sha7 = sha.slice(0, 7).toLowerCase();
  if (!celula("sha validado").toLowerCase().startsWith(sha7)) problemas.push(`VEREDITO.md: a rodada do topo valida "${celula("sha validado") || "nada"}" e não ${sha7}`);
  if (!["PASS", "FAIL", "BLOCKED"].includes(lido.veredito ?? "")) problemas.push("VEREDITO.md: o veredito da rodada do topo não é PASS, FAIL nem BLOCKED");
  for (const versao of ["politica_validacao_sha", "mapa_impacto_sha", "versao_gatekeeper"]) {
    if (!(versao in primeira)) problemas.push(`VEREDITO.md: a tabela de rodadas não tem a coluna ${versao}`);
    else if (!/^[0-9a-f]{7,40}$/i.test(celula(versao))) problemas.push(`VEREDITO.md: ${versao} da rodada do topo não é um SHA ("${celula(versao)}")`);
  }
  return problemas;
}

function conferirRegistro({ pasta, id, sha, riscoAlto, validadoresObrigatorios, raiz }) {
  const resultados = [];
  const sha7 = sha.slice(0, 7);
  const pastaDoSha = join(pasta, "validacao", sha7);
  if (!existsSync(pastaDoSha)) {
    resultados.push(falha("registro-relatorios", `não existe ${relativo(raiz, pastaDoSha)}`));
  } else {
    const relatorios = readdirSync(pastaDoSha).filter((n) => n.endsWith(".md")).sort();
    if (relatorios.length === 0) resultados.push(falha("registro-relatorios", `${relativo(raiz, pastaDoSha)} não tem nenhum relatório .md`));
    const problemas = [];
    for (const nome of relatorios) {
      problemas.push(...conferirRelatorio(readFileSync(join(pastaDoSha, nome), "utf8"), { arquivo: `validacao/${sha7}/${nome}`, id, sha, riscoAlto }));
    }
    if (relatorios.length > 0) {
      if (problemas.length > 0) resultados.push(falha("registro-relatorios", `${problemas.length} problema(s) de formato: ${problemas.slice(0, 5).join("; ")}${problemas.length > 5 ? `; e mais ${problemas.length - 5}` : ""}`));
      else resultados.push(ok("registro-relatorios", `${relatorios.length} relatório(s) em validacao/${sha7}/ no formato da seção 15`));
    }
    const faltando = validadoresObrigatorios.filter((v) => !relatorios.includes(`${v}.md`));
    if (faltando.length > 0) {
      resultados.push(aviso("registro-dimensoes", `faltam relatórios de dimensão obrigatória pela análise de texto: ${faltando.join(", ")} (a lista por diff pode diferir; dimensão obrigatória nunca é N/A)`));
    }
  }

  const caminhoVeredito = join(pasta, "VEREDITO.md");
  if (!existsSync(caminhoVeredito)) resultados.push(falha("registro-veredito", "VEREDITO.md não existe"));
  else {
    const problemas = conferirVeredito(readFileSync(caminhoVeredito, "utf8"), { sha });
    if (problemas.length > 0) resultados.push(falha("registro-veredito", problemas.join("; ")));
    else resultados.push(ok("registro-veredito", "VEREDITO.md com a rodada do SHA no topo, veredito legível e as três versões das regras"));
  }

  const estado = conferirEstado({ raiz });
  if (estado.length > 0) resultados.push(falha("registro-estado", `gerar-estado --conferir falha: ${estado.slice(0, 3).map((p) => `[${p.codigo}] ${p.mensagem}`).join("; ")}${estado.length > 3 ? `; e mais ${estado.length - 3}` : ""}`));
  else resultados.push(ok("registro-estado", "gerar-estado --conferir confere"));
  return resultados;
}

/* ---------- Orquestração ---------- */

/**
 * Roda todas as conferências. Devolve `{ id, sha, resultados, falhas, avisos }`.
 * `mapa` pode ser passado (testes); senão é lido do repositório.
 */
export function conferirEvidencia({ id, sha, registro = false, raiz = RAIZ, mapa = null }) {
  const resultados = [];
  const status = lerStatusDoRepositorio(raiz);
  const fase = faseDoId(id);
  const gate = gateDaFase(status, fase)?.gate ?? `G${fase?.slice(1)}`;
  const pasta = pastaDeEvidencia(raiz, gate, id);
  const bloco = localizarEtapa(id, raiz);
  const mapaEfetivo = mapa ?? lerMapa(raiz);

  if (!bloco) resultados.push(falha("etapa", `${id} não existe nos arquivos de fase`));
  else resultados.push(ok("etapa", `${id} existe (${bloco.arquivo}:${bloco.linha})`));

  // Regras e histórico, que não dependem da pasta.
  resultados.push(...conferirSha(sha, raiz));
  if (resultados.at(-1).nivel === "OK") resultados.push(...conferirListaPermitida(sha, raiz, mapaEfetivo));
  else resultados.push(falha("lista-permitida", "não conferida porque o SHA não passou"));
  resultados.push(...conferirRegrasCommitadas(raiz));

  if (!existsSync(pasta)) {
    resultados.push(falha("pasta", `${relativo(raiz, pasta)} não existe`));
    return resumir(id, sha, resultados);
  }
  resultados.push(ok("pasta", `${relativo(raiz, pasta)} existe`));
  resultados.push(...conferirIndice(pasta));
  resultados.push(...conferirSegredos(pasta));
  resultados.push(...conferirTravessao(pasta));

  let analise = null;
  if (bloco) analise = analisarEtapa(bloco);
  const risco = (analise?.risco ?? "").toLowerCase();
  const riscoAlto = risco === "alto" || risco === "crítico" || risco === "critico";

  if (analise?.tags.includes("UI")) resultados.push(...conferirCapturas(pasta));
  else resultados.push(ok("capturas", "etapa sem tag UI: capturas não exigidas por esta conferência"));

  if (riscoAlto) resultados.push(...conferirSonda(pasta));
  else resultados.push(ok("sonda", `risco ${analise?.risco || "não lido"}: sonda antes e depois não exigida por esta conferência`));

  if (registro) resultados.push(...conferirRegistro({ pasta, id, sha, riscoAlto, validadoresObrigatorios: analise?.validadores ?? [], raiz }));
  return resumir(id, sha, resultados);
}

function resumir(id, sha, resultados) {
  return {
    id,
    sha,
    resultados,
    falhas: resultados.filter((r) => r.nivel === "FALHA").length,
    avisos: resultados.filter((r) => r.nivel === "AVISO").length,
  };
}

export function formatarResultado(r) {
  const L = [`Conferência de evidência de ${r.id} no SHA ${r.sha}`];
  for (const x of r.resultados) L.push(`${x.nivel.padEnd(5)} ${x.codigo}: ${x.mensagem}`);
  L.push(r.falhas > 0 ? `RESULTADO: ${r.falhas} FALHA(S), ${r.avisos} aviso(s). A validação não pode seguir.` : `RESULTADO: sem falha, ${r.avisos} aviso(s).`);
  return L.join("\n");
}

/* ---------- CLI ---------- */

function principal(argv) {
  const args = argv.slice(2);
  let id = null;
  let sha = null;
  let registro = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--sha") sha = args[++i] ?? null;
    else if (a.startsWith("--sha=")) sha = a.slice("--sha=".length);
    else if (a === "--registro") registro = true;
    else if (a === "--json") json = true;
    else if (!a.startsWith("-") && !id) id = a;
    else {
      console.error(`Argumento não reconhecido: ${a}`);
      return 2;
    }
  }
  if (!id || !idValido(id) || !sha) {
    console.error("Uso: node scripts/roadmap/conferir-evidencia.mjs V2-Fnn-Enn --sha <sha> [--registro] [--json]");
    return 2;
  }
  const r = conferirEvidencia({ id, sha, registro });
  console.log(json ? JSON.stringify(r, null, 2) : formatarResultado(r));
  return r.falhas > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
