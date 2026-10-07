#!/usr/bin/env node
/**
 * Confere um relatório executivo (HTML) contra a coleta do período e reprova o
 * que afirma mais do que o STATUS registra.
 *
 * Por que existe (28-execucao-e-validacao.md, seções 2 e 16). O relatório é
 * redigido por um modelo, e um texto bem escrito é exatamente o lugar onde o
 * status incha: "entregue" no lugar de "implementado, aguarda validação". Esta
 * conferência é mecânica de propósito: não julga o estilo, só recusa o que o
 * registro desmente. Ela NÃO relê as etapas nem reroda teste: compara o HTML com
 * o JSON de `coletar-relatorio.mjs`.
 *
 * O contrato do HTML (o modelo em docs/relatorios-v2/modelo/ já o segue):
 * - `<html data-relatorio="semanal|fase" data-desde data-ate data-fase-atual>`;
 * - todo item que fala de uma etapa leva `data-etapa="V2-Fnn-Enn"` e
 *   `data-status="<status registrado>"`;
 * - seções levam `data-secao="..."`; a de bloqueios traz cinco blocos
 *   `data-bloqueio="tecnico|rafael|alyson|juridico-dpo|externo"`;
 * - o título da etapa, quando citado como está no roadmap, vai em
 *   `data-titulo` (títulos como "conforme política aprovada" não são afirmação);
 * - `data-situacao="NO RUMO|ATENÇÃO|BLOQUEADO"` e `data-sha` no rodapé.
 *
 * Código de saída: 0 confere, 1 reprovado, 2 uso errado.
 *
 * Uso:
 *   node scripts/roadmap/conferir-relatorio.mjs <arquivo.html> --dados <coleta.json> [--json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { GATE_APROVADO, STATUS_DE_ETAPA, STATUS_DE_GATE } from "./roadmap.mjs";

/* ---------- Léxico (28, seção 16: "vocabulário") ---------- */

const STATUS_CONCLUIDOS = new Set(["CONCLUÍDA", "CONCLUÍDA COM RISCO ACEITO"]);
const STATUS_VALIDADOS = new Set(["VALIDADA", "VALIDADA COM PENDÊNCIA HUMANA", "CONCLUÍDA", "CONCLUÍDA COM RISCO ACEITO"]);

/** Termos que afirmam mais do que "implementado". Cada grupo diz que status o sustenta. */
const GRUPOS_DE_TERMOS = [
  {
    nome: "concluído ou entregue",
    re: /(?<![\p{L}\p{N}_])(entregues?|conclu[ií]d[oa]s?|pront[oa]s?|finalizad[oa]s?)(?![\p{L}\p{N}_])/giu,
    sustentam: STATUS_CONCLUIDOS,
    exige: "CONCLUÍDA ou CONCLUÍDA COM RISCO ACEITO",
  },
  {
    nome: "validado, aprovado, provado ou testado",
    re: /(?<![\p{L}\p{N}_])(validad[oa]s?|aprovad[oa]s?|provad[oa]s?|testad[oa]s?)(?![\p{L}\p{N}_])/giu,
    sustentam: STATUS_VALIDADOS,
    exige: "VALIDADA ou acima",
  },
];

/** Palavras que, logo antes do termo, o tornam negação ou expectativa, e não afirmação. */
const NEGADORES = [
  "não", "nao", "nem", "nunca", "ainda", "nada", "nenhum", "nenhuma", "falta", "faltam", "faltou",
  "aguarda", "aguardam", "aguardando", "antes", "até", "ate", "depende", "dependem", "pendente", "pendentes",
  "quando", "enquanto", "será", "serão", "ser", "se", "caso", "for", "forem", "seja", "sejam", "precisa", "precisam",
  "deve", "devem",
];

/** "pronto para validação" descreve o próximo passo, não o estado. */
const RE_PRONTO_PARA = /^pront[oa]s?\s+para\s+(?:a\s+|ser\s+)?(?:valida|revis|confer|audit|an[aá]lise|teste)/iu;

/** O rótulo que cada status registrado exige quando o item está numa seção estrita. */
const RE_AGUARDA_VALIDACAO =
  /aguarda(?:m)?\s+(?:a\s+)?valida[cç][aã]o|falta(?:m)?\s+(?:a\s+)?valida[cç][aã]o|sem\s+valida[cç][aã]o|ainda\s+n[aã]o\s+(?:foi\s+|est[aá]\s+|foram\s+|est[aã]o\s+)?validad|pendente\s+de\s+valida[cç][aã]o|valida[cç][aã]o\s+(?:independente\s+)?pendente/iu;

/** Seções estritas: o status do item tem de ser um dos listados. */
const SECOES_ESTRITAS = {
  implementado: new Set(["EM ANDAMENTO", "IMPLEMENTADA", "EM VALIDAÇÃO", "REPROVADA"]),
  validado: new Set(["VALIDADA", "VALIDADA COM PENDÊNCIA HUMANA"]),
  concluido: new Set(["CONCLUÍDA"]),
  "risco-aceito": new Set(["CONCLUÍDA COM RISCO ACEITO"]),
};

const SECOES_OBRIGATORIAS = {
  semanal: [
    "resumo", "onde-estamos", "implementado", "validado", "concluido", "bloqueios", "decisoes-tomadas",
    "decisoes-proximas", "riscos", "agora", "a-seguir", "depois", "proximo-passo", "observacao-gestao",
  ],
  fase: [
    "objetivo", "por-que", "situacao-antes", "feito", "antes-depois", "provas", "gate", "riscos-residuais",
    "decisoes-tomadas", "adiados", "libera", "proxima-fase",
  ],
};

const BLOCOS_DE_BLOQUEIO = ["tecnico", "rafael", "alyson", "juridico-dpo", "externo"];
const SITUACOES = ["NO RUMO", "ATENÇÃO", "BLOQUEADO"];

/** Nomes que não podem aparecer em relatório: semente de teste e papéis de banco. */
export const NOMES_PROIBIDOS = ["Serra Alta", "Vale Fundo", "dc360_app", "dc360_setup", "dc360_api", "dc360_console"];

/* ---------- Leitor de HTML (sem dependência) ---------- */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BRUTOS = new Set(["script", "style"]);
const FECHA_SOZINHOS = new Set(["p", "li", "td", "th", "tr", "dt", "dd", "option"]);
const EM_LINHA = new Set(["a", "span", "b", "strong", "em", "i", "code", "small", "sup", "sub", "abbr", "time", "mark", "u", "kbd"]);
const CABECALHOS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "th", "title", "summary", "figcaption", "caption", "legend"]);

/** U+2014 escrito por código: o repositório não tem o caractere literal em arquivo algum. */
const TRAVESSAO = String.fromCharCode(0x2014);

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: TRAVESSAO, ndash: "–", hellip: "…" };

export function decodificar(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, nome) => {
    if (nome[0] === "#") {
      const codigo = nome[1].toLowerCase() === "x" ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      return Number.isFinite(codigo) && codigo > 0 && codigo < 0x110000 ? String.fromCodePoint(codigo) : inteiro;
    }
    return ENTIDADES[nome.toLowerCase()] ?? inteiro;
  });
}

/** Árvore mínima: `{ tag, attrs, filhos, linha, pai }`; texto é `{ texto, linha, pai }`. */
export function lerHtml(html) {
  const inicios = [0];
  for (let i = 0; i < html.length; i++) if (html[i] === "\n") inicios.push(i + 1);
  const linhaDe = (pos) => {
    let a = 0;
    let b = inicios.length - 1;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (inicios[m] <= pos) a = m;
      else b = m - 1;
    }
    return a + 1;
  };

  const raiz = { tag: "#raiz", attrs: {}, filhos: [], linha: 1, pai: null };
  let atual = raiz;
  let i = 0;
  const empurrarTexto = (texto, pos) => {
    if (texto === "") return;
    atual.filhos.push({ texto: decodificar(texto), linha: linhaDe(pos), pai: atual });
  };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      empurrarTexto(html.slice(i), i);
      break;
    }
    if (lt > i) empurrarTexto(html.slice(i, lt), i);
    if (html.startsWith("<!--", lt)) {
      const fim = html.indexOf("-->", lt + 4);
      i = fim < 0 ? html.length : fim + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const fim = html.indexOf(">", lt);
      i = fim < 0 ? html.length : fim + 1;
      continue;
    }
    if (html[lt + 1] === "/") {
      const fim = html.indexOf(">", lt);
      const nome = html.slice(lt + 2, fim < 0 ? html.length : fim).trim().toLowerCase();
      let no = atual;
      while (no && no.tag !== nome) no = no.pai;
      if (no && no.pai) atual = no.pai;
      i = fim < 0 ? html.length : fim + 1;
      continue;
    }
    const m = /^<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/.exec(html.slice(lt, lt + 4000));
    if (!m) {
      empurrarTexto("<", lt);
      i = lt + 1;
      continue;
    }
    const tag = m[1].toLowerCase();
    const attrs = {};
    for (const a of m[2].matchAll(/([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = decodificar(a[2] ?? a[3] ?? a[4] ?? "");
    }
    if (FECHA_SOZINHOS.has(tag) && atual.tag === tag) atual = atual.pai;
    const no = { tag, attrs, filhos: [], linha: linhaDe(lt), pai: atual };
    atual.filhos.push(no);
    i = lt + m[0].length;
    const autoFechado = m[0].endsWith("/>") || VOID.has(tag);
    if (BRUTOS.has(tag)) {
      const fim = html.toLowerCase().indexOf(`</${tag}`, i);
      const corpo = html.slice(i, fim < 0 ? html.length : fim);
      no.filhos.push({ texto: corpo, linha: linhaDe(i), pai: no, bruto: true });
      const fecha = fim < 0 ? -1 : html.indexOf(">", fim);
      i = fecha < 0 ? html.length : fecha + 1;
      continue;
    }
    if (!autoFechado) atual = no;
  }
  return raiz;
}

export function percorrer(no, visita) {
  if (no.tag) {
    visita(no);
    for (const f of no.filhos) percorrer(f, visita);
  }
}

/**
 * Texto visível de um nó. Ignora script e style. `ignorar` descarta subárvores
 * (os títulos de etapa marcados com `data-titulo`). Blocos viram espaço.
 */
export function textoDe(no, { ignorar = () => false } = {}) {
  const partes = [];
  const andar = (n) => {
    if (n.texto !== undefined) {
      if (!n.bruto) partes.push(n.texto);
      return;
    }
    if (BRUTOS.has(n.tag) || ignorar(n)) return;
    const bloco = !EM_LINHA.has(n.tag);
    if (bloco) partes.push(" ");
    for (const f of n.filhos) andar(f);
    if (bloco) partes.push(" ");
  };
  andar(no);
  return partes.join("").replace(/\s+/g, " ").trim();
}

function ancestraisAte(no, parar) {
  const lista = [];
  for (let n = no; n && !parar(n); n = n.pai) lista.push(n);
  return lista;
}

function dentroDeCabecalho(no) {
  return ancestraisAte(no, (n) => !n.tag || n.tag === "#raiz").some((n) => CABECALHOS.has(n.tag));
}

/* ---------- Análise do léxico ---------- */

/** Há negação ou expectativa nas palavras que precedem o termo, dentro da mesma frase? */
function precedidoPorNegador(texto, indice) {
  const antes = texto.slice(Math.max(0, indice - 80), indice);
  const frase = antes.split(/[.,;:!?()]/).pop() ?? "";
  const palavras = frase.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).slice(-4);
  return palavras.some((p) => NEGADORES.includes(p));
}

/**
 * Termos mais fortes que o status, no texto de UM item (ou frase).
 * Devolve `[{ termo, grupo, exige }]`.
 */
export function termosFortesDemais(texto, status) {
  const achados = [];
  for (const g of GRUPOS_DE_TERMOS) {
    if (g.sustentam.has(status)) continue;
    for (const m of texto.matchAll(g.re)) {
      if (precedidoPorNegador(texto, m.index)) continue;
      if (g.nome.startsWith("concluído") && RE_PRONTO_PARA.test(texto.slice(m.index))) continue;
      achados.push({ termo: m[0], grupo: g.nome, exige: g.exige });
    }
  }
  return achados;
}

/* ---------- Segredo, detalhe técnico e travessão ---------- */

const PADROES_DE_SEGREDO = [
  { nome: "chave privada", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { nome: "token JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/ },
  { nome: "chave de acesso da AWS", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { nome: "chave de API", re: /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{20,}/ },
  { nome: "token do GitHub", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { nome: "token do Slack", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { nome: "endereço com usuário e senha", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/i },
  { nome: "cabeçalho Authorization", re: /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+\S{8,}/i },
];

/** "senha: Abc123xyz789": palavra de segredo, separador e valor com letra e dígito. */
function segredoPorAtribuicao(texto) {
  const achados = [];
  const re = /\b(password|passwd|senha|secret|segredo|token|api[_-]?key|chave)\b\s*(?:[:=]|\bé\b)\s*["'`]?([A-Za-z0-9_\-+/=.!@#$%]{10,})/giu;
  for (const m of texto.matchAll(re)) {
    if (/[A-Za-z]/.test(m[2]) && /\d/.test(m[2])) achados.push(m[0]);
  }
  return achados;
}

const PADROES_TECNICOS = [
  { nome: "rota de API", re: /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[\w/:.{}-]*/ },
  { nome: "nome de arquivo de código", re: /\b[\w.-]+\.(?:ts|tsx|mjs|cjs|js|sql|sh|ps1|ya?ml)\b/i },
];

/** "Node.js" e parentes parecem arquivo de código mas são nome de plataforma. */
const PLATAFORMAS_PERMITIDAS = /^(?:node|next|vue|react|express|d3|three).js$/i;

/* ---------- Conferência ---------- */

const norm = (s) => String(s ?? "").normalize("NFC").trim();

/**
 * @param {{ html: string, dados: object, proibidos?: string[] }} entrada
 * @returns {{ problemas: {codigo:string, mensagem:string, linha?:number}[], avisos: string[], resumo: object }}
 */
export function conferirRelatorio({ html, dados, proibidos = NOMES_PROIBIDOS }) {
  const problemas = [];
  const avisos = [];
  const erro = (codigo, mensagem, linha) => problemas.push(linha ? { codigo, mensagem, linha } : { codigo, mensagem });

  const arvore = lerHtml(html);
  const todos = [];
  percorrer(arvore, (n) => todos.push(n));
  const raizHtml = todos.find((n) => n.tag === "html") ?? arvore;

  const statusPorEtapa = dados.statusPorEtapa ?? {};
  const statusDoGate = new Map((dados.gates ?? []).map((g) => [g.gate, g.status]));
  const statusDaFase = new Map((dados.gates ?? []).map((g) => [g.fase, g.status]));

  /* --- Estrutura e cabeçalho --- */
  const tipo = raizHtml.attrs["data-relatorio"];
  if (!["semanal", "fase"].includes(tipo)) {
    erro("estrutura", `o <html> precisa de data-relatorio="semanal" ou "fase" (achei "${tipo ?? ""}")`, raizHtml.linha);
  }
  const secoes = new Map();
  for (const n of todos) {
    if (n.attrs["data-secao"]) {
      if (!secoes.has(n.attrs["data-secao"])) secoes.set(n.attrs["data-secao"], []);
      secoes.get(n.attrs["data-secao"]).push(n);
    }
  }
  for (const nome of SECOES_OBRIGATORIAS[tipo] ?? []) {
    if (!secoes.has(nome)) erro("estrutura", `falta a seção data-secao="${nome}" (mesmo vazia, ela diz "nada neste período")`);
  }
  if (tipo === "semanal") {
    for (const nome of BLOCOS_DE_BLOQUEIO) {
      const existe = todos.some((n) => n.attrs["data-bloqueio"] === nome);
      if (!existe) erro("estrutura", `a seção de bloqueios precisa do bloco data-bloqueio="${nome}" (mesmo que seja "nenhum")`);
    }
  }
  if (dados.periodo) {
    const d = raizHtml.attrs["data-desde"];
    const a = raizHtml.attrs["data-ate"];
    if (tipo === "semanal" && (d !== dados.periodo.desde || a !== dados.periodo.ate)) {
      erro("periodo-divergente", `data-desde/data-ate do relatório (${d ?? "ausente"} a ${a ?? "ausente"}) não batem com a coleta (${dados.periodo.desde} a ${dados.periodo.ate})`, raizHtml.linha);
    }
  }
  if (dados.fase && raizHtml.attrs["data-fase-atual"] !== dados.fase.fase) {
    erro("fase-divergente", `data-fase-atual do relatório ("${raizHtml.attrs["data-fase-atual"] ?? "ausente"}") não bate com a coleta ("${dados.fase.fase}")`, raizHtml.linha);
  }
  if (tipo === "fase" && dados.fase && !GATE_APROVADO.has(dados.fase.statusDoGate)) {
    erro("fase-sem-gate-aprovado", `relatório de conclusão de fase, mas o gate ${dados.fase.gate} da ${dados.fase.fase} está ${dados.fase.statusDoGate}: só se gera depois do gate APROVADO e do merge`);
  }
  const comSha = todos.find((n) => n.attrs["data-sha"] !== undefined);
  if (!comSha) erro("estrutura", "falta o SHA de base no rodapé (atributo data-sha)");
  else if (dados.base?.sha && !(comSha.attrs["data-sha"].length >= 7 && dados.base.sha.startsWith(comSha.attrs["data-sha"]))) {
    erro("sha-divergente", `data-sha do rodapé (${comSha.attrs["data-sha"]}) não é o SHA da coleta (${dados.base.shaCurto})`, comSha.linha);
  }

  /* --- Situação --- */
  const situacaoNo = todos.find((n) => n.attrs["data-situacao"] !== undefined);
  const situacao = situacaoNo ? norm(situacaoNo.attrs["data-situacao"]).toUpperCase() : null;
  if (!situacao || !SITUACOES.includes(situacao)) {
    if (tipo === "semanal") erro("estrutura", `data-situacao precisa ser ${SITUACOES.join(", ")} (achei "${situacaoNo?.attrs["data-situacao"] ?? "ausente"}")`, situacaoNo?.linha);
  } else if (situacao === "NO RUMO") {
    const motivos = [];
    if ((dados.bloqueios?.etapasBloqueadas ?? []).length > 0) motivos.push("há etapa BLOQUEADA na fase atual");
    if ((dados.bloqueios?.checkpointsAbertos ?? []).some((c) => c.daFase === "atual" && c.bloqueia)) motivos.push("há checkpoint aberto travando a fase atual");
    if ((dados.mudancas?.etapas ?? []).some((m) => ["regressao", "reprovada", "bloqueada"].includes(m.tipo))) motivos.push("houve regressão, reprovação ou bloqueio no período");
    if ((dados.gatesReabertos ?? []).length > 0) motivos.push("há gate REABERTO");
    if (motivos.length > 0) erro("situacao-inflada", `a situação é NO RUMO, mas ${motivos.join("; ")}`, situacaoNo.linha);
  }

  /* --- Itens de etapa --- */
  const itens = todos.filter((n) => n.attrs["data-etapa"] !== undefined);
  const ignorarTitulo = (n) => n.attrs["data-titulo"] !== undefined;
  const etapasCitadas = new Set();
  for (const item of itens) {
    const id = norm(item.attrs["data-etapa"]);
    const rotulo = id || "(vazio)";
    etapasCitadas.add(id);
    const registrado = statusPorEtapa[id];
    if (registrado === undefined) {
      erro("etapa-desconhecida", `${rotulo} não existe no STATUS coletado`, item.linha);
      continue;
    }
    const declarado = item.attrs["data-status"];
    if (declarado === undefined || norm(declarado) === "") {
      erro("status-ausente", `${rotulo} não traz data-status (o registrado é ${registrado})`, item.linha);
      continue;
    }
    if (!STATUS_DE_ETAPA.includes(norm(declarado)) || norm(declarado) !== registrado) {
      erro("status-divergente", `${rotulo}: data-status="${declarado}", mas o status registrado é ${registrado}`, item.linha);
    }

    const texto = textoDe(item, { ignorar: ignorarTitulo });

    for (const t of termosFortesDemais(texto, registrado)) {
      erro("termo-forte", `${rotulo} está ${registrado}, mas o texto diz "${t.termo}" (${t.grupo} exige ${t.exige})`, item.linha);
    }
    if (registrado === "CONCLUÍDA COM RISCO ACEITO" && !/risco aceito/i.test(texto)) {
      erro("risco-sem-qualificador", `${rotulo} está CONCLUÍDA COM RISCO ACEITO: o texto precisa dizer "risco aceito", nunca só "concluído"`, item.linha);
    }

    const secaoDoItem = ancestraisAte(item, (n) => !n.tag || n.tag === "#raiz").find((n) => n.attrs["data-secao"])?.attrs["data-secao"];
    if (secaoDoItem && SECOES_ESTRITAS[secaoDoItem] && !SECOES_ESTRITAS[secaoDoItem].has(registrado)) {
      erro("secao-errada", `${rotulo} está ${registrado} e não pode ficar na seção "${secaoDoItem}" (ali só entram: ${[...SECOES_ESTRITAS[secaoDoItem]].join(", ")})`, item.linha);
    }
    if (secaoDoItem === "implementado" && ["EM ANDAMENTO", "IMPLEMENTADA", "EM VALIDAÇÃO"].includes(registrado) && !RE_AGUARDA_VALIDACAO.test(texto)) {
      erro("rotulo-ausente", `${rotulo} está ${registrado}: o texto precisa dizer "implementado, aguarda validação" (ou equivalente)`, item.linha);
    }
    if (secaoDoItem === "validado" && registrado === "VALIDADA COM PENDÊNCIA HUMANA" && !/\bfalta/i.test(texto)) {
      erro("rotulo-ausente", `${rotulo} está VALIDADA COM PENDÊNCIA HUMANA: o texto precisa dizer "validado, falta <o quê>"`, item.linha);
    }
    if (registrado === "BLOQUEADA" && !/bloquead/i.test(texto)) {
      erro("rotulo-ausente", `${rotulo} está BLOQUEADA: o texto precisa dizer "bloqueado por <motivo>"`, item.linha);
    }
    if (registrado === "REPROVADA" && !/em corre[cç][aã]o|reprovad/i.test(texto)) {
      erro("rotulo-ausente", `${rotulo} está REPROVADA: o texto precisa dizer "em correção"`, item.linha);
    }
  }

  /* --- Itens de gate --- */
  const itensDeGate = todos.filter((n) => n.attrs["data-gate"] !== undefined);
  for (const g of itensDeGate) {
    const codigo = norm(g.attrs["data-gate"]);
    const registrado = statusDoGate.get(codigo);
    if (registrado === undefined) {
      erro("gate-desconhecido", `${codigo || "(vazio)"} não existe no STATUS coletado`, g.linha);
      continue;
    }
    const declarado = g.attrs["data-status"];
    if (declarado !== undefined && (!STATUS_DE_GATE.includes(norm(declarado)) || norm(declarado) !== registrado)) {
      erro("status-divergente", `${codigo}: data-status="${declarado}", mas o status registrado do gate é ${registrado}`, g.linha);
    }
  }

  /* --- Risco aceito --- */
  const haRisco =
    (dados.riscosAceitos ?? []).length > 0 ||
    itens.some((n) => statusPorEtapa[norm(n.attrs["data-etapa"])] === "CONCLUÍDA COM RISCO ACEITO");
  if (haRisco) {
    const secao = secoes.get("risco-aceito") ?? [];
    if (secao.length === 0 || secao.every((s) => textoDe(s).length < 20)) {
      erro("risco-aceito-ausente", "há risco aceito registrado e o relatório não traz a seção data-secao=\"risco-aceito\" com conteúdo");
    }
  }

  /* --- Omissões obrigatórias --- */
  for (const m of dados.mudancas?.etapas ?? []) {
    if (["regressao", "reprovada", "bloqueada", "cancelada"].includes(m.tipo) && !etapasCitadas.has(m.id)) {
      const nome = { regressao: "regressão", reprovada: "reprovação", bloqueada: "bloqueio novo (BLOCKED)", cancelada: "cancelamento" }[m.tipo];
      erro("omissao", `o período teve ${nome} em ${m.id} (${m.antes ?? "nova"} para ${m.depois}) e o relatório não a cita com data-etapa="${m.id}"`);
    }
  }
  const gatesCitados = new Set(itensDeGate.map((g) => norm(g.attrs["data-gate"])));
  const reabertos = new Set([
    ...(dados.gatesReabertos ?? []).map((g) => g.gate),
    ...(dados.mudancas?.gates ?? []).filter((g) => g.reaberto).map((g) => g.gate),
  ]);
  for (const gate of reabertos) {
    if (!gatesCitados.has(gate)) erro("omissao", `o gate ${gate} está REABERTO e o relatório não o cita com data-gate="${gate}"`);
  }

  /* --- Afirmações soltas (fora dos itens) --- */
  const textoCorrido = [];
  percorrer(raizHtml, (n) => {
    if (BRUTOS.has(n.tag) || n.tag === "html" || n.tag === "head" || n.tag === "body") return;
    if (CABECALHOS.has(n.tag) || dentroDeCabecalho(n)) return;
    // Só o texto direto do elemento, uma vez; filhos têm a sua vez.
    const proprio = n.filhos.filter((f) => f.texto !== undefined && !f.bruto).map((f) => f.texto).join(" ");
    const semTitulo = ancestraisAte(n, (x) => !x.tag || x.tag === "#raiz").some(ignorarTitulo);
    if (proprio.trim() !== "" && !semTitulo) textoCorrido.push({ texto: proprio.replace(/\s+/g, " ").trim(), linha: n.linha, no: n });
  });

  const temStatus = (conjunto) => Object.values(statusPorEtapa).some((s) => conjunto.has(s));
  const haValidada = temStatus(STATUS_VALIDADOS);
  const haConcluida = temStatus(STATUS_CONCLUIDOS);
  const fraseDeEtapa = /\betapas?\b|\bV2-F\d\d-E\d\d\b|\bF\d\d-E\d\d\b|\bfases?\b|\bgates?\b/i;
  const jaRelatados = new Set();
  for (const { texto, linha, no } of textoCorrido) {
    // Os itens de etapa têm a regra própria, mais exata; aqui só o que está solto.
    if (ancestraisAte(no, (x) => !x.tag || x.tag === "#raiz").some((x) => x.attrs["data-etapa"] !== undefined)) continue;
    for (const frase of texto.split(/(?<=[.!?])\s+/)) {
      if (!fraseDeEtapa.test(frase)) continue;
      for (const g of GRUPOS_DE_TERMOS) {
        for (const m of frase.matchAll(g.re)) {
          if (precedidoPorNegador(frase, m.index)) continue;
          if (g.nome.startsWith("concluído") && RE_PRONTO_PARA.test(frase.slice(m.index))) continue;
          const sustentado = g.nome.startsWith("concluído") ? haConcluida : haValidada;
          // Frases sobre o sistema ("gate APROVADO por Rafael") são checadas pelas regras de gate abaixo.
          if (/\bgates?\b/i.test(frase) && /aprovad/i.test(m[0])) continue;
          if (!sustentado) {
            const chave = `${linha}|${m[0]}`;
            if (jaRelatados.has(chave)) continue;
            jaRelatados.add(chave);
            erro("afirmacao-sem-base", `o texto diz "${m[0]}" sobre etapas ou fases ("${frase.slice(0, 90)}..."), mas nenhuma etapa está ${g.exige} no STATUS`, linha);
          }
        }
      }
    }
  }

  /* --- "Fase concluída" e "gate aprovado" --- */
  const textoTodo = textoDe(raizHtml, { ignorar: (n) => ignorarTitulo(n) || n.tag === "title" });
  const faseDoRelatorio = dados.fase?.fase ?? null;
  const reFaseConcluida = /(?<![\p{L}])fase\s+(?:(F\d\d)\s+)?(?:est[aá]\s+|foi\s+|ficou\s+)?conclu[ií]da|(?<![\p{L}\p{N}])(F\d\d)\s+(?:est[aá]\s+|foi\s+|ficou\s+)?conclu[ií]da/giu;
  for (const m of textoTodo.matchAll(reFaseConcluida)) {
    if (precedidoPorNegador(textoTodo, m.index)) continue;
    const fase = m[1] ?? m[2] ?? faseDoRelatorio;
    const gate = statusDaFase.get(fase);
    if (!GATE_APROVADO.has(gate)) {
      erro("fase-concluida-sem-gate", `o texto diz "${m[0]}", mas o gate da ${fase ?? "fase"} está ${gate ?? "sem registro"}: fase só é concluída com gate APROVADO`);
    }
  }
  const reGateAprovado = /(?<![\p{L}\p{N}])(G\d\d)\s+(?:est[aá]\s+|foi\s+|ficou\s+)?aprovad[oa]/giu;
  for (const m of textoTodo.matchAll(reGateAprovado)) {
    if (precedidoPorNegador(textoTodo, m.index)) continue;
    const gate = statusDoGate.get(m[1]);
    if (!GATE_APROVADO.has(gate)) {
      erro("gate-aprovado-sem-aprovacao", `o texto diz "${m[0]}", mas o gate ${m[1]} está ${gate ?? "sem registro"} no STATUS`);
    }
  }

  /* --- Travessão, segredo e detalhe técnico (arquivo inteiro) --- */
  html.split("\n").forEach((linha, i) => {
    if (linha.includes(TRAVESSAO) || /&mdash;|&#8212;|&#x2014;/i.test(linha)) {
      erro("travessao", "travessão (U+2014) é proibido em qualquer texto do projeto: use vírgula, dois pontos ou parênteses", i + 1);
    }
  });
  const visivel = textoDe(raizHtml, { ignorar: () => false });
  if (visivel.includes("{{") || visivel.includes("}}") || todos.some((n) => Object.values(n.attrs).some((v) => v.includes("{{")))) {
    erro("modelo-nao-preenchido", "sobrou marcador {{...}} do modelo no texto ou nos atributos: troque todos antes de conferir");
  }
  const paraSegredo = `${html}\n${visivel}`;
  for (const p of PADROES_DE_SEGREDO) {
    const m = p.re.exec(paraSegredo);
    if (m) erro("segredo", `algo com cara de segredo (${p.nome}): "${m[0].slice(0, 12)}..." (remova antes de qualquer envio)`);
  }
  for (const s of segredoPorAtribuicao(visivel)) {
    erro("segredo", `algo com cara de segredo atribuído a uma palavra de credencial: "${s.slice(0, 14)}..."`);
  }
  for (const nome of proibidos) {
    if (visivel.toLowerCase().includes(nome.toLowerCase())) {
      erro("detalhe-tecnico", `"${nome}" é nome da semente de teste ou detalhe de banco: não entra em relatório executivo`);
    }
  }
  for (const p of PADROES_TECNICOS) {
    const m = [...visivel.matchAll(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`))].find((x) => !PLATAFORMAS_PERMITIDAS.test(x[0]));
    if (m) erro("detalhe-tecnico", `detalhe técnico fora do nível executivo (${p.nome}): "${m[0]}". Diga o impacto, não o caminho`);
  }
  if (todos.some((n) => n.tag === "code" || n.tag === "pre")) {
    avisos.push("o relatório usa <code> ou <pre>: confirme que não há rota, comando ou caminho exploráveis (nível executivo)");
  }

  return {
    problemas,
    avisos,
    resumo: {
      tipo: tipo ?? null,
      itensDeEtapa: itens.length,
      etapasCitadas: etapasCitadas.size,
      secoes: [...secoes.keys()],
      situacao,
    },
  };
}

/* ---------- CLI ---------- */

const USO = "Uso: node scripts/roadmap/conferir-relatorio.mjs <arquivo.html> --dados <coleta.json> [--json]";

function principal(argv) {
  const args = argv.slice(2);
  let arquivo = null;
  let dados = null;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dados") dados = args[++i];
    else if (args[i] === "--json") json = true;
    else if (args[i].startsWith("--")) {
      console.error(`Argumento não reconhecido: ${args[i]}\n${USO}`);
      return 2;
    } else if (!arquivo) arquivo = args[i];
    else {
      console.error(`Argumento sobrando: ${args[i]}\n${USO}`);
      return 2;
    }
  }
  if (!arquivo || !dados) {
    console.error(USO);
    return 2;
  }
  let html;
  let coleta;
  try {
    html = readFileSync(resolve(arquivo), "utf8");
    coleta = JSON.parse(readFileSync(resolve(dados), "utf8"));
  } catch (e) {
    console.error(`Não consegui ler os arquivos: ${e.message}`);
    return 2;
  }
  const r = conferirRelatorio({ html, dados: coleta });
  if (json) {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    return r.problemas.length === 0 ? 0 : 1;
  }
  for (const a of r.avisos) console.log(`AVISO: ${a}`);
  if (r.problemas.length === 0) {
    console.log(
      `Relatório confere: ${r.resumo.itensDeEtapa} item(ns) de etapa (${r.resumo.etapasCitadas} etapa(s)), situação ${r.resumo.situacao ?? "n/a"}, ` +
        "nenhum termo mais forte que o status, nenhuma omissão obrigatória, sem travessão nem cara de segredo.",
    );
    return 0;
  }
  console.error(`Relatório NÃO confere (${r.problemas.length} problema(s)):`);
  for (const p of r.problemas) console.error(`  [${p.codigo}]${p.linha ? ` linha ${p.linha}:` : ""} ${p.mensagem}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
