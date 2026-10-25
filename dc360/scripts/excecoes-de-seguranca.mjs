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
 * Exceções da varredura de imagens (Trivy), arquivo `.trivyignore.yaml` da raiz
 * (V2-F01-E20; DV-22 trocou o `.trivyignore` por linha, que valia por
 * identificador na imagem INTEIRA, por este, que vale por CAMINHO). Uma entrada
 * por identificador:
 *
 *   vulnerabilities:
 *     - id: CVE-AAAA-NNNN
 *       paths:
 *         - "usr/local/lib/node_modules/npm/**"
 *       statement: "motivo: <texto>; dono: <nome>"
 *       expired_at: AAAA-MM-DD
 *
 * É o formato nativo do Trivy: `paths` casa com o arquivo do pacote afetado
 * (`PkgPath` do relatório), então a mesma CVE num pacote do app não é perdoada.
 * O `expired_at` é EXCLUSIVO (conferido contra o Trivy 0.75.0 na DV-22: no próprio
 * dia da data ele já não ignora). Este leitor confere o que o Trivy não confere:
 * motivo de verdade, dono, prazo obrigatório e no máximo um ano, nenhum ID
 * repetido, caminho obrigatório e só dentro de `CAMINHOS_PERMITIDOS`, sem `..`.
 * Só o subconjunto acima é aceito: qualquer outra chave ou linha reprova, em vez de
 * ser ignorada em silêncio (outra chave do Trivy, como `purls` ou `statuses`,
 * abriria outra porta de exceção sem motivo e sem caminho).
 */
export const CAMINHOS_PERMITIDOS = ["usr/local/lib/node_modules/npm/"];

/** Caminho de exceção: relativo (sem barra inicial), dentro de um prefixo permitido e sem `..`. */
export function problemaDoCaminhoDaExcecao(caminho) {
  if (typeof caminho !== "string" || caminho.trim() === "") return "caminho vazio";
  if (caminho.startsWith("/")) return `caminho com barra inicial: "${caminho}" (o Trivy compara sem ela)`;
  if (caminho.split("/").includes("..")) return `caminho com "..": "${caminho}"`;
  if (!CAMINHOS_PERMITIDOS.some((p) => caminho.startsWith(p))) {
    return `caminho "${caminho}" fora de ${CAMINHOS_PERMITIDOS.map((p) => `"${p}"`).join(", ")} (o npm embutido na imagem base): ampliar é decisão, com a política e o teste mudados juntos`;
  }
  return null;
}

const CHAVES_DA_ENTRADA = new Set(["paths", "statement", "expired_at"]);

/** Tira as aspas de um escalar YAML simples (`"texto"`, `'texto'` ou sem aspas). */
function escalarYaml(texto) {
  const v = texto.trim();
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(v) ?? /^'((?:[^']|'')*)'$/.exec(v);
  return m ? m[1] : v;
}

export function analisarTrivyignoreYaml(texto, hoje) {
  const violacoes = [];
  const vistos = new Map();
  let entrada = null;
  let noCabecalho = false;
  let lendoPaths = false;

  const fechar = () => {
    if (!entrada) return;
    const { linha, id, paths, statement, expired_at: exp } = entrada;
    const nome = id ?? `entrada da linha ${linha}`;
    if (!id) violacoes.push({ linha, problema: "entrada sem id" });
    else if (vistos.has(id)) violacoes.push({ linha, problema: `${id} repetido (primeira vez na linha ${vistos.get(id)})` });
    else vistos.set(id, linha);
    if (!paths || paths.length === 0) {
      violacoes.push({ linha, problema: `${nome}: falta paths (sem caminho a exceção valeria para a imagem inteira)` });
    } else {
      for (const c of paths) {
        const p = problemaDoCaminhoDaExcecao(c);
        if (p) violacoes.push({ linha, problema: `${nome}: ${p}` });
      }
    }
    const { motivo, dono } = lerCamposDaExcecao(statement ?? "");
    const problemas = problemasDaExcecao({ motivo, dono, ate: exp }, hoje)
      .map((x) => x.replace("(ate: AAAA-MM-DD)", "(expired_at: AAAA-MM-DD)"));
    // Conferido contra o Trivy 0.75.0 (DV-22): `expired_at` é EXCLUSIVO, como o `exp:` antigo.
    if (exp === hoje) problemas.push(`o Trivy deixa de ignorar a partir do próprio dia ${exp} (expired_at é exclusivo): renove ou apague`);
    for (const x of problemas) violacoes.push({ linha, problema: `${nome}: ${x}` });
    entrada = null;
  };

  texto.split(/\r?\n/).forEach((bruta, i) => {
    const n = i + 1;
    if (bruta.trim() === "" || bruta.trim().startsWith("#")) return;
    if (/^vulnerabilities:\s*$/.test(bruta)) {
      noCabecalho = true;
      lendoPaths = false;
      return;
    }
    if (!noCabecalho) {
      violacoes.push({ linha: n, problema: "só a chave `vulnerabilities:` é aceita no topo (outras chaves do Trivy abririam outra porta de exceção)" });
      return;
    }
    let m;
    if ((m = /^ {2}- id:\s*(\S.*?)\s*$/.exec(bruta))) {
      fechar();
      entrada = { linha: n, id: escalarYaml(m[1]) };
      lendoPaths = false;
      return;
    }
    if (!entrada) {
      violacoes.push({ linha: n, problema: "linha fora do formato: cada entrada começa em `  - id: <ID>`" });
      return;
    }
    if (lendoPaths && (m = /^ {6}- (\S.*?)\s*$/.exec(bruta))) {
      entrada.paths.push(escalarYaml(m[1]));
      return;
    }
    if ((m = /^ {4}([a-z_]+):\s*(.*?)\s*$/.exec(bruta))) {
      const [, chave, valor] = m;
      lendoPaths = false;
      if (!CHAVES_DA_ENTRADA.has(chave)) {
        violacoes.push({ linha: n, problema: `chave \`${chave}\` não é aceita (use paths, statement e expired_at)` });
      } else if (chave === "paths") {
        if (entrada.paths) violacoes.push({ linha: n, problema: "chave `paths` repetida na mesma entrada" });
        entrada.paths ??= [];
        if (valor !== "") violacoes.push({ linha: n, problema: "paths é uma lista, um caminho por linha (`      - \"caminho\"`)" });
        lendoPaths = true;
      } else if (chave in entrada) {
        violacoes.push({ linha: n, problema: `chave \`${chave}\` repetida na mesma entrada` });
      } else {
        entrada[chave] = escalarYaml(valor);
      }
      return;
    }
    violacoes.push({ linha: n, problema: "linha fora do formato (veja o cabeçalho de .trivyignore.yaml)" });
  });
  fechar();
  if (!noCabecalho) violacoes.push({ linha: 1, problema: "falta a chave `vulnerabilities:` (arquivo vazio ou fora do formato)" });
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
