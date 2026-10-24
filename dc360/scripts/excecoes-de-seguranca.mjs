/**
 * Política de exceção do SAST (V2-F01-E05): toda supressão de achado do Semgrep
 * tem motivo, dono e prazo, e prazo vencido reprova.
 *
 * Existe por um motivo só: regra ruidosa leva a `nosemgrep` sem critério, e um
 * `nosemgrep` sem critério esconde o achado que importa (a regra de isolamento
 * entre municípios, por exemplo) para sempre. Aqui a exceção envelhece em
 * público, no mesmo molde da lista nomeada do aplicativo de campo
 * (`auditar-excecoes.mjs`, CP-03).
 *
 * Formato exigido, na mesma linha do marcador (ou na linha de comentário logo
 * acima do código):
 *
 *   // nosemgrep: <id-da-regra> -- motivo: <texto>; dono: <nome>; ate: AAAA-MM-DD
 *
 * O Semgrep lê só o marcador e os ids; o resto da linha ele ignora (conferido
 * na etapa, ver a evidência), por isso o motivo, o dono e a data podem morar ali.
 *
 * O `nosemgrep` sem id de regra (supressão cega de tudo na linha) é proibido.
 *
 * As entradas da baseline triada (`.semgrep/baseline.json`) obedecem à mesma
 * regra de motivo, dono e prazo: uma baseline sem prazo seria só um tapete.
 *
 * Fica separado do teste para as funções poderem ser chamadas sozinhas, com
 * datas e textos sintéticos.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Prazo máximo de uma exceção a partir de hoje. Passou disso, é decisão, não exceção. */
export const PRAZO_MAXIMO_EM_DIAS = 366;

/** Menor motivo aceito: "ok" ou "falso positivo" não explicam nada. */
export const MOTIVO_MINIMO = 20;

const MARCADOR = /(?:\/\/|\/\*|#|<!--)[ \t]*nosem(?:grep)?\b(.*)$/;
const IDS = /^[ \t]*:[ \t]*([A-Za-z0-9_.-]+(?:[ \t]*,[ \t]*[A-Za-z0-9_.-]+)*)/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data AAAA-MM-DD válida de verdade (rejeita 2026-02-31), em UTC para não depender do fuso. */
export function lerDataIso(texto) {
  if (typeof texto !== "string" || !DATA_ISO.test(texto)) return null;
  const d = new Date(`${texto}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto) return null;
  return d;
}

export function hojeEmIso(agora = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/**
 * Confere os três campos de uma exceção. Devolve a lista de problemas (vazia
 * quando está tudo certo). A data vale ATÉ o fim do dia dela: no dia seguinte
 * reprova.
 */
export function problemasDaExcecao({ motivo, dono, ate }, hoje) {
  const problemas = [];
  const m = typeof motivo === "string" ? motivo.trim() : "";
  if (m.length < MOTIVO_MINIMO) {
    problemas.push(m ? `motivo curto demais (mínimo ${MOTIVO_MINIMO} caracteres)` : "falta o motivo");
  }
  if (typeof dono !== "string" || dono.trim().length < 2) problemas.push("falta o dono");

  if (ate === undefined || ate === null || ate === "") {
    problemas.push("falta a data de vencimento (ate: AAAA-MM-DD)");
  } else {
    const d = lerDataIso(ate);
    const h = lerDataIso(hoje);
    if (!d) {
      problemas.push(`data de vencimento inválida: "${ate}" (use AAAA-MM-DD)`);
    } else if (h) {
      const dias = Math.round((d.getTime() - h.getTime()) / 86_400_000);
      if (dias < 0) problemas.push(`exceção vencida em ${ate}`);
      else if (dias > PRAZO_MAXIMO_EM_DIAS) {
        problemas.push(`prazo de ${dias} dias passa de ${PRAZO_MAXIMO_EM_DIAS}: exceção não é decisão permanente`);
      }
    }
  }
  return problemas;
}

/** Lê motivo, dono e prazo do que vem depois dos ids do `nosemgrep`. */
export function lerCamposDaExcecao(resto) {
  const campo = (nome) => {
    const m = new RegExp(`(?:^|[;\\s])${nome}[ \\t]*:[ \\t]*([^;]*)`, "i").exec(resto);
    return m ? m[1].trim().replace(/\s*(?:\*\/|-->)\s*$/, "") : undefined;
  };
  return { motivo: campo("motivo"), dono: campo("dono"), ate: campo("ate") };
}

/**
 * Analisa o texto de um arquivo e devolve as violações: `{ linha, problema }`.
 * Cada `nosemgrep` precisa de ids de regra, motivo, dono e prazo vigente.
 */
export function analisarArquivo(texto, hoje) {
  const violacoes = [];
  texto.split(/\r?\n/).forEach((linha, i) => {
    const achou = MARCADOR.exec(linha);
    if (!achou) return;
    const resto = achou[1];
    const ids = IDS.exec(resto);
    if (!ids) {
      violacoes.push({
        linha: i + 1,
        problema: "nosemgrep sem id de regra (supressão cega proibida): use `nosemgrep: <id-da-regra>`",
      });
      return;
    }
    const campos = lerCamposDaExcecao(resto.slice(ids[0].length));
    for (const p of problemasDaExcecao(campos, hoje)) violacoes.push({ linha: i + 1, problema: p });
  });
  return violacoes;
}

/**
 * Exceções da varredura de imagens (Trivy), arquivo `.trivyignore` da raiz
 * (V2-F01-E20). Uma linha por achado, no formato
 *
 *   <ID> exp:AAAA-MM-DD # motivo: <texto>; dono: <nome>
 *
 * É o formato nativo do Trivy (ID, `exp:` e comentário depois de `#`, que ele
 * ignora): o Trivy deixa de ignorar a linha NO DIA do `exp:` (a data é o
 * primeiro dia sem exceção, conferido na etapa), e este
 * leitor confere o resto, que ele não confere: motivo de verdade, dono, prazo
 * obrigatório e no máximo um ano, e nenhum ID repetido. Linha de comentário
 * inteira (`#`) e linha em branco são livres. Qualquer outra coisa reprova, em
 * vez de ser ignorada em silêncio.
 */
const LINHA_TRIVYIGNORE = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:[ \t]+exp:(\S+))?[ \t]*(?:#[ \t]*(.*))?$/;

export function analisarTrivyignore(texto, hoje) {
  const violacoes = [];
  const vistos = new Map();
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.trim();
    if (linha === "" || linha.startsWith("#")) return;
    const n = i + 1;
    const achou = LINHA_TRIVYIGNORE.exec(linha);
    if (!achou) {
      violacoes.push({
        linha: n,
        problema: "linha fora do formato: use `<ID> exp:AAAA-MM-DD # motivo: ...; dono: ...`",
      });
      return;
    }
    const [, id, exp, comentario = ""] = achou;
    if (vistos.has(id)) {
      violacoes.push({ linha: n, problema: `${id} repetido (primeira vez na linha ${vistos.get(id)})` });
    } else {
      vistos.set(id, n);
    }
    const { motivo, dono } = lerCamposDaExcecao(comentario);
    const problemas = problemasDaExcecao({ motivo, dono, ate: exp }, hoje)
      .map((p) => p.replace("(ate: AAAA-MM-DD)", "(exp:AAAA-MM-DD)"));
    // Conferido contra o Trivy 0.75.0: o `exp:` é EXCLUSIVO. No dia da data ele já
    // não ignora o achado, então a linha "vence hoje" já está sem efeito no scan.
    if (exp === hoje) problemas.push(`o Trivy deixa de ignorar a partir do próprio dia ${exp} (exp: é exclusivo): renove ou apague`);
    for (const p of problemas) violacoes.push({ linha: n, problema: `${id}: ${p}` });
  });
  return violacoes;
}

const EXTENSOES = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".yml", ".yaml"]);
const PASTAS_IGNORADAS = new Set(["node_modules", "dist", ".git", ".expo", "build", "coverage"]);
/** Arquivos que citam o marcador de propósito (esta política e o teste dela). */
const ARQUIVOS_QUE_CITAM_O_MARCADOR = new Set([
  "dc360/scripts/excecoes-de-seguranca.mjs",
  "dc360/scripts/excecoes-de-seguranca.test.mjs",
]);

/** Anda pelas pastas que o Semgrep varre e devolve os caminhos relativos à raiz, com `/`. */
export function arquivosVarridos(raiz, pastas = ["dc360", ".github", "scripts", ".semgrep/regras"]) {
  const achados = [];
  const visitar = (dir) => {
    let itens;
    try { itens = readdirSync(dir); } catch { return; }
    for (const nome of itens) {
      if (PASTAS_IGNORADAS.has(nome)) continue;
      const caminho = join(dir, nome);
      let st;
      try { st = statSync(caminho); } catch { continue; }
      if (st.isDirectory()) { visitar(caminho); continue; }
      const ponto = nome.lastIndexOf(".");
      if (ponto < 0 || !EXTENSOES.has(nome.slice(ponto))) continue;
      const rel = relative(raiz, caminho).split(sep).join("/");
      if (ARQUIVOS_QUE_CITAM_O_MARCADOR.has(rel)) continue;
      achados.push(rel);
    }
  };
  for (const p of pastas) visitar(join(raiz, p));
  return achados.sort();
}

/** Varre o repositório e devolve `{ arquivo, linha, problema }` para cada exceção fora da política. */
export function varrerRepositorio(raiz, hoje) {
  const todas = [];
  for (const arquivo of arquivosVarridos(raiz)) {
    const texto = readFileSync(join(raiz, arquivo), "utf8");
    if (!/nosem/.test(texto)) continue;
    for (const v of analisarArquivo(texto, hoje)) todas.push({ arquivo, ...v });
  }
  return todas;
}
