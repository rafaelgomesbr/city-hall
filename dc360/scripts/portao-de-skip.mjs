/**
 * O varredor do portão de skip (política T42, `docs/POLITICA-DE-TESTE-VERMELHO.md`).
 *
 * Por que isto existe: a vigência de conta, papel e sessão ficou desligada na
 * escrita e ninguém viu, porque o teste que a provava estava num `describe.skip`
 * sem dono, sem prazo e sem referência. Teste pulado em silêncio é vermelho
 * escondido. Aqui a regra é de máquina: pular de forma incondicional exige uma
 * marca na linha logo acima, e a marca vence.
 *
 *   // T42 dono=<nome> issue=<ref> ate=AAAA-MM-DD
 *
 * Duas famílias de skip, tratadas de forma diferente de propósito:
 *
 * - POR AMBIENTE (`it.runIf(...)`, `it.skipIf(...)`, e `skip: <condição> && "motivo"`
 *   do `node:test`): o teste roda onde a condição vale e é pulado onde ela não
 *   vale (sem pasta `ios/`, sem a extensão de trigramas). É permitido, não
 *   exige marca, e é CONTADO por arquivo para ninguém descobrir meses depois
 *   que a máquina de CI pula metade da suíte.
 * - INCONDICIONAL (`skip`, `xit`, `xdescribe`, `todo`, `skip: true`, `skip` sem
 *   motivo textual): pula em toda máquina, sempre. Exige a marca.
 *
 * `.only` reprova sempre, com ou sem marca: ele faz o resto da suíte sumir e o
 * resultado continuar verde.
 *
 * Limites honestos do varredor (é uma leitura por linha, não um analisador de
 * sintaxe): enxerga a chamada que COMEÇA a linha (depois de recuo) e a opção
 * `skip:` na própria linha do `test(`; opção `skip` numa linha separada, ou
 * chamada escondida atrás de um apelido, passa. Linhas de comentário e de
 * bloco de comentário são ignoradas, e uma chamada dentro de um texto que
 * começa a linha com aspas também (é o que os testes do próprio portão usam).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Prazo máximo de um skip incondicional, em dias corridos a partir de hoje.
 * PREMISSA registrada no STATUS (seção 9): Rafael ainda não escolheu o número.
 */
export const PRAZO_MAXIMO_EM_DIAS = 30;

/**
 * O relógio do portão é UTC e a marca é escrita no horário de Brasília: perto da
 * meia-noite os dois estão em dias diferentes. Um dia de folga evita reprovar
 * uma marca de 30 dias escrita "ontem" para o relógio UTC.
 */
export const FOLGA_DE_FUSO_EM_DIAS = 1;

export const DONO_PADRAO = "rafael";

/** Onde se varre (relativo a `dc360/`). `*` casa uma pasta, nunca mais de uma. */
export const PASTAS_VARRIDAS = [
  "apps/*/test",
  "apps/*/src",
  "packages/*/test",
  "packages/*/src",
  "db/test",
  "scripts",
];

const EXTENSOES = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const PASTAS_IGNORADAS = new Set(["node_modules", "dist", "build", ".expo", "coverage"]);

const BLOCO = "(?:it|test|describe|suite)";
const RE_ONLY = new RegExp(`^(?:${BLOCO}(?:\\.\\w+)*\\.only\\b|fit\\s*\\(|fdescribe\\s*\\()`);
const RE_INCONDICIONAL = new RegExp(`^(?:${BLOCO}(?:\\.\\w+)*\\.(skip|todo)\\b|(x(?:it|describe|test))\\s*\\(|(?:t|ctx|context)\\.(skip|todo)\\s*\\()`);
const RE_AMBIENTE_CHAMADA = new RegExp(`^${BLOCO}(?:\\.\\w+)*\\.(runIf|skipIf)\\s*\\(`);
const RE_OPCAO = new RegExp(`^${BLOCO}\\s*\\(.*[{,]\\s*(skip|todo)\\s*:\\s*(.+?)\\s*(?:\\}|$)`);
const RE_MARCA = /^\s*\/\/\s*T42\b(.*)$/;

/** `skip: cond && "motivo"` ou `skip: cond ? "motivo" : false`: condicional E com motivo escrito. */
const RE_CONDICIONAL_COM_MOTIVO = [
  /&&\s*(["'`])[^"'`]+\1\s*$/,
  /\?\s*(["'`])[^"'`]+\1\s*:\s*false\s*$/,
];

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const d = new Date(`${texto}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto ? null : d;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** O dia de hoje em ISO, no relógio UTC (ver `FOLGA_DE_FUSO_EM_DIAS`). */
export function hojeIso(agora = new Date()) {
  return agora.toISOString().slice(0, 10);
}

/**
 * Lê a marca de uma linha. Devolve `{ ok, dados, motivo }`: `ok` só quando
 * dono, issue e ate existem, a data é real, não venceu e cabe no teto.
 */
export function conferirMarca(linha, hoje) {
  const m = RE_MARCA.exec(linha ?? "");
  if (!m) return { ok: false, dados: null, motivo: "sem a marca `// T42 dono=<nome> issue=<ref> ate=AAAA-MM-DD` na linha acima" };
  const dados = {};
  for (const par of m[1].trim().split(/\s+/).filter(Boolean)) {
    const i = par.indexOf("=");
    if (i > 0) dados[par.slice(0, i)] = par.slice(i + 1);
  }
  for (const campo of ["dono", "issue", "ate"]) {
    if (!dados[campo]) return { ok: false, dados, motivo: `marca T42 sem \`${campo}=\`` };
  }
  const ate = dataValida(dados.ate);
  if (!ate) return { ok: false, dados, motivo: `marca T42 com \`ate=${dados.ate}\` que não é uma data AAAA-MM-DD real` };
  const dias = Math.round((ate.getTime() - dataValida(hoje).getTime()) / DIA_MS);
  if (dias < 0) return { ok: false, dados, motivo: `marca T42 vencida em ${dados.ate} (hoje é ${hoje})` };
  if (dias > PRAZO_MAXIMO_EM_DIAS + FOLGA_DE_FUSO_EM_DIAS) {
    return { ok: false, dados, motivo: `marca T42 com prazo de ${dias} dias; o máximo é ${PRAZO_MAXIMO_EM_DIAS} (ate=${dados.ate}, hoje ${hoje})` };
  }
  return { ok: true, dados, motivo: "" };
}

/**
 * Analisa o texto de UM arquivo. `hoje` é injetável para o teste não depender
 * do relógio.
 *
 * @returns {{ problemas: {linha:number, motivo:string, trecho:string}[],
 *             ambiente: {linha:number, tipo:string}[],
 *             marcados: {linha:number, tipo:string, dono:string, issue:string, ate:string}[] }}
 */
export function analisarTexto(texto, hoje = hojeIso()) {
  const linhas = texto.split(/\r?\n/);
  const problemas = [];
  const ambiente = [];
  const marcados = [];
  let emBloco = false;

  const exigirMarca = (indice, tipo, trecho) => {
    const r = conferirMarca(linhas[indice - 1], hoje);
    if (r.ok) marcados.push({ linha: indice + 1, tipo, dono: r.dados.dono, issue: r.dados.issue, ate: r.dados.ate });
    else problemas.push({ linha: indice + 1, motivo: `${tipo}: ${r.motivo}`, trecho });
  };

  for (let i = 0; i < linhas.length; i++) {
    let codigo = linhas[i];
    if (emBloco) {
      const fim = codigo.indexOf("*/");
      if (fim === -1) continue;
      emBloco = false;
      codigo = codigo.slice(fim + 2);
    }
    codigo = codigo.replace(/\/\*.*?\*\//g, "");
    const abre = codigo.indexOf("/*");
    if (abre !== -1) {
      emBloco = true;
      codigo = codigo.slice(0, abre);
    }
    const t = codigo.trim();
    if (!t || t.startsWith("//")) continue;
    const trecho = t.length > 120 ? `${t.slice(0, 117)}...` : t;

    if (RE_ONLY.test(t)) {
      problemas.push({ linha: i + 1, motivo: "`.only` esquecido: o resto da suíte some e o resultado continua verde", trecho });
      continue;
    }
    const inc = RE_INCONDICIONAL.exec(t);
    if (inc) {
      exigirMarca(i, `${inc[1] ?? inc[2] ?? inc[3]} incondicional`, trecho);
      continue;
    }
    if (RE_AMBIENTE_CHAMADA.test(t)) {
      ambiente.push({ linha: i + 1, tipo: RE_AMBIENTE_CHAMADA.exec(t)[1] });
      continue;
    }
    const opc = RE_OPCAO.exec(t);
    if (opc) {
      const valor = opc[2];
      if (valor === "false") continue;
      if (RE_CONDICIONAL_COM_MOTIVO.some((re) => re.test(valor))) ambiente.push({ linha: i + 1, tipo: `${opc[1]}:` });
      else exigirMarca(i, `\`${opc[1]}:\` sem condição e motivo textual`, trecho);
    }
  }
  return { problemas, ambiente, marcados };
}

function expandir(raiz, padrao) {
  let atuais = [raiz];
  for (const parte of padrao.split("/")) {
    const proximos = [];
    for (const base of atuais) {
      if (parte !== "*") {
        proximos.push(join(base, parte));
        continue;
      }
      let filhos = [];
      try {
        filhos = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && !PASTAS_IGNORADAS.has(e.name));
      } catch {
        // pasta inexistente: nada a varrer
      }
      for (const f of filhos) proximos.push(join(base, f.name));
    }
    atuais = proximos;
  }
  return atuais;
}

function arquivosDe(pasta) {
  let entradas = [];
  try {
    entradas = readdirSync(pasta, { withFileTypes: true });
  } catch {
    return [];
  }
  const achados = [];
  for (const e of entradas) {
    if (e.isDirectory()) {
      if (!PASTAS_IGNORADAS.has(e.name)) achados.push(...arquivosDe(join(pasta, e.name)));
    } else if (e.isFile() && EXTENSOES.test(e.name)) achados.push(join(pasta, e.name));
  }
  return achados;
}

/**
 * Varre a árvore a partir de `raiz` (a pasta `dc360/`).
 * `porArquivo` só traz arquivos com algum skip, para a contagem ficar legível.
 */
export function varrerArvore(raiz, hoje = hojeIso(), pastas = PASTAS_VARRIDAS) {
  const vistos = new Set();
  const problemas = [];
  const marcados = [];
  const ambientePorArquivo = {};
  let arquivos = 0;
  for (const padrao of pastas) {
    for (const pasta of expandir(raiz, padrao)) {
      for (const caminho of arquivosDe(pasta)) {
        if (vistos.has(caminho)) continue;
        vistos.add(caminho);
        arquivos++;
        const rel = relative(raiz, caminho).split(sep).join("/");
        const r = analisarTexto(readFileSync(caminho, "utf8"), hoje);
        for (const p of r.problemas) problemas.push({ arquivo: rel, ...p });
        for (const m of r.marcados) marcados.push({ arquivo: rel, ...m });
        if (r.ambiente.length) ambientePorArquivo[rel] = r.ambiente.length;
      }
    }
  }
  return { arquivos, problemas, marcados, ambientePorArquivo };
}

/** Texto curto da contagem por ambiente, para ficar visível na saída do teste. */
export function descreverContagem(resultado) {
  const linhas = Object.entries(resultado.ambientePorArquivo).sort(([a], [b]) => a.localeCompare(b));
  const total = linhas.reduce((s, [, n]) => s + n, 0);
  return [
    `Portão de skip: ${resultado.arquivos} arquivos varridos; ${total} skips por ambiente em ${linhas.length} arquivos; ${resultado.marcados.length} incondicionais com marca T42.`,
    ...linhas.map(([arquivo, n]) => `  por ambiente: ${n} em ${arquivo}`),
    ...resultado.marcados.map((m) => `  incondicional marcado: ${m.arquivo}:${m.linha} dono=${m.dono} issue=${m.issue} ate=${m.ate}`),
  ].join("\n");
}
