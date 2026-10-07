#!/usr/bin/env node
/**
 * Deriva as tags de uma etapa, os validadores obrigatórios, se Opus revisa e
 * quais gatilhos do portão visual disparam.
 *
 * É a implementação das seções 9, 10 e 12 de
 * docs/roadmap-v2/28-execucao-e-validacao.md. A política diz que a seleção de
 * validador "sai de script, o gatekeeper só acrescenta, nunca tira": este é o
 * script. Ele não decide aprovação nenhuma, só diz quem precisa olhar.
 *
 * Três fontes, como a política manda: os campos da etapa, os prefixos de camada
 * de "O que deve ser implementado" (`Frontend:`, `API:`, `Migration:`...) e os
 * caminhos do diff, quando há diff. Sem diff, os caminhos citados em "Arquivos e
 * módulos prováveis" fazem o papel dos caminhos do diff (menos os marcados como
 * "só leitura"), e a saída diz de onde cada tag veio.
 *
 * Fail-closed para o humano: quando um gatilho visual não dá para descartar,
 * ele conta como disparado. Errar para o lado de chamar o Rafael é barato;
 * errar para o outro é o falso verde que a seção 11 de 28 trata como defeito do
 * processo.
 *
 * Uso:
 *   node scripts/roadmap/tags.mjs V2-F00-E04
 *   node scripts/roadmap/tags.mjs V2-F00-E04 --diff origem/v2/f00..HEAD
 *   node scripts/roadmap/tags.mjs V2-F00-E04 --json
 */
import { pathToFileURL } from "node:url";

import {
  RAIZ,
  git,
  idValido,
  localizarEtapa,
  semAcento,
  subitensDoImplementar,
} from "./roadmap.mjs";

export const TAGS_EM_ORDEM = [
  "UI", "MOBILE", "OFFLINE", "A11Y", "AUTH", "AUTHZ", "TENANT", "RLS",
  "DB", "MIGRATION", "API", "PUBLIC_API", "LGPD", "DOCUMENTO", "ARQUIVO", "INFRA",
];

/**
 * Ordem de risco dos validadores, do maior para o menor. É a REGRA DE
 * DESEMPATE do teto de quatro: `qa` entra sempre, e dos demais ficam os três
 * que aparecem primeiro nesta lista. A lista é total (nenhum empate possível) e
 * põe segurança e isolamento antes de tudo, porque a régua do projeto é
 * "isolamento entre municípios é a regra número um" e depois OWASP ASVS 4.0
 * nível 2; depois dado pessoal, depois contrato de documento, depois entrega,
 * e só então o que olha a tela e os testes (que o `qa` já cobre em parte).
 */
export const ORDEM_DE_RISCO = [
  "red-team",
  "seguranca-aplicacao",
  "banco-de-dados",
  "privacidade-lgpd",
  "especificacao",
  "engenharia-entrega",
  "acessibilidade",
  "ux",
  "testes",
];

export const TETO_DE_VALIDADORES = 4;

/* ---------- Texto da etapa ---------- */

function campo(bloco, nome) {
  return bloco.campos[nome] ?? "";
}

/** Tudo que o texto da etapa diz sobre o que será feito, sem as seções de teste e de regressão (que citam o mesmo comando em toda etapa). */
function textoDeEscopo(bloco) {
  return [bloco.titulo, campo(bloco, "Objetivo"), campo(bloco, "O que deve ser implementado")].join("\n");
}

function prefixosNormalizados(bloco) {
  return subitensDoImplementar(bloco).map((s) => ({ ...s, chave: semAcento(s.prefixo).toLowerCase() }));
}

/* ---------- Caminhos ---------- */

/** Tira o `dc360/` da frente: a política escreve `apps/web/src`, o repositório guarda `dc360/apps/web/src`. */
export function normalizarCaminho(caminho) {
  return caminho.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^dc360\//, "");
}

const NAO_E_TESTE = (c) => !/(^|\/)(test|tests|__tests__)\//.test(c) && !/\.(test|spec)\.[a-z]+$/.test(c);

/** Tags que um caminho sozinho já prova. Conteúdo do diff (tenant, política de RLS) é tratado à parte. */
export function tagsPorCaminho(caminhoBruto) {
  const c = normalizarCaminho(caminhoBruto);
  const tags = new Set();
  const nome = c.split("/").pop() ?? c;

  if (/^apps\/(web|console)\/src\//.test(c)) tags.add("UI");
  // MOBILE só por código-fonte: package.json, lockfile e configuração do app de campo não são tela (calibração de 2026-10-07).
  if (/^(apps|packages)\/campo\/src\//.test(c)) tags.add("MOBILE");
  if (/^(apps|packages)\/campo\/src\/.*(transporte|fila|sincroniz|deposito|offline|sync)/i.test(c)) tags.add("OFFLINE");
  if (/^apps\/api\/src\/auth\//.test(c) || (/^apps\/api\/src\//.test(c) && /(sess(ao|oes)|senha|token)/i.test(semAcento(nome)))) tags.add("AUTH");
  if (/^(apps\/api\/src|packages\/shared\/src)\//.test(c) && /(permiss|catalogo-de-acoes|acoes)/i.test(semAcento(nome))) tags.add("AUTHZ");
  if (/^db\//.test(c)) tags.add("DB");
  if (/^db\/migrations\//.test(c)) tags.add("MIGRATION");
  if (/^db\/test\/isolamento/.test(c)) tags.add("TENANT");
  if (/^apps\/api\/src\/rotas\//.test(c)) tags.add("API");
  if (/^apps\/api\/src\/rotas\/(interesse|publico|publica|validacao)/.test(c)) tags.add("PUBLIC_API");
  if (NAO_E_TESTE(c) && (/(laudo|termo|montador)/i.test(semAcento(nome)) || /(^|\/)saida\//.test(c))) tags.add("DOCUMENTO");
  if (NAO_E_TESTE(c) && /(upload|armazenamento|storage|evidencias)/i.test(semAcento(c))) tags.add("ARQUIVO");
  if (/^\.github\//.test(c) || /(^|\/)(fly[\w.-]*\.toml|Dockerfile[\w.-]*|compose\.ya?ml)$/.test(c)) tags.add("INFRA");
  return tags;
}

/** Caminhos entre crases em "Arquivos e módulos prováveis", sem os marcados como "só leitura". */
export function caminhosProvaveis(bloco) {
  const texto = campo(bloco, "Arquivos e módulos prováveis");
  const achados = [];
  for (const m of texto.matchAll(/`([^`\s]+\/[^`\s]*)`([^`]{0,40})/g)) {
    if (/leitura/i.test(m[2])) continue;
    achados.push(normalizarCaminho(m[1]));
  }
  return [...new Set(achados)];
}

/* ---------- Diff ---------- */

const RE_INTERVALO = /^[A-Za-z0-9_@{}^~./-]+(?:\.\.\.?[A-Za-z0-9_@{}^~./-]+)?$/;

/**
 * Lê `git diff` de um intervalo `a..b`: a lista de arquivos com o status e as
 * linhas acrescentadas e removidas de cada um. Só comandos locais, sem rede.
 */
export function lerDiff(intervalo, raiz = RAIZ) {
  if (!RE_INTERVALO.test(intervalo) || intervalo.startsWith("-")) {
    throw new Error(`Intervalo de diff inválido: "${intervalo}". Use o formato base..head.`);
  }
  const nomes = git(["diff", "--name-status", "-M", intervalo], raiz);
  if (!nomes.ok) throw new Error(`git diff --name-status falhou: ${nomes.saida}`);
  const arquivos = nomes.saida
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((linha) => {
      const partes = linha.split("\t");
      return { status: partes[0][0], caminho: partes[partes.length - 1] };
    });

  const bruto = git(["diff", "-U0", "--no-color", "--no-ext-diff", intervalo], raiz);
  if (!bruto.ok) throw new Error(`git diff falhou: ${bruto.saida}`);
  return { intervalo, arquivos, patch: lerPatch(bruto.saida) };
}

/** Quebra a saída de `git diff -U0` em `[{ caminho, adicionadas, removidas }]`. */
export function lerPatch(saida) {
  const arquivos = [];
  let atual = null;
  for (const linha of saida.split("\n")) {
    const cabecalho = /^diff --git a\/.* b\/(.*)$/.exec(linha);
    if (cabecalho) {
      atual = { caminho: cabecalho[1], adicionadas: [], removidas: [] };
      arquivos.push(atual);
    } else if (atual && linha.startsWith("+") && !linha.startsWith("+++")) {
      atual.adicionadas.push(linha.slice(1));
    } else if (atual && linha.startsWith("-") && !linha.startsWith("---")) {
      atual.removidas.push(linha.slice(1));
    }
  }
  return arquivos;
}

/* ---------- Tags ---------- */

/**
 * Deriva as tags da etapa. `diff` é opcional: `{ arquivos: [{ status, caminho }], patch: [{ caminho, adicionadas, removidas }] }`.
 * Devolve `{ tags, origem }`, e `origem[TAG]` diz de onde cada tag veio.
 */
export function derivarTags(bloco, diff = null) {
  const origem = new Map();
  const marcar = (tag, motivo) => {
    if (!origem.has(tag)) origem.set(tag, []);
    if (!origem.get(tag).includes(motivo)) origem.get(tag).push(motivo);
  };

  const prefixos = prefixosNormalizados(bloco);
  const temPrefixo = (...nomes) => prefixos.filter((p) => nomes.some((n) => p.chave === n || p.chave.startsWith(n + " ")));
  const escopo = textoDeEscopo(bloco);
  const escopoSemAcento = semAcento(escopo);
  const migracao = campo(bloco, "Migração necessária").trim();
  const lgpd = campo(bloco, "Impacto LGPD").trim();
  const validacao = semAcento(campo(bloco, "Validação humana")).toLowerCase();

  // UI e MOBILE: prefixo de camada. "Frontend e mobile" vale para os dois.
  if (temPrefixo("frontend").length > 0) marcar("UI", "prefixo Frontend:");
  if (temPrefixo("mobile").length > 0) marcar("MOBILE", "prefixo Mobile:");
  for (const p of prefixos) {
    if (/^frontend e mobile/.test(p.chave)) {
      marcar("UI", `prefixo ${p.prefixo}:`);
      marcar("MOBILE", `prefixo ${p.prefixo}:`);
    }
  }
  if (validacao.includes("portao visual")) marcar("UI", 'Validação humana cita "portão visual"');

  // AUTHZ e AUTH.
  if (temPrefixo("autorizacao").length > 0) marcar("AUTHZ", "prefixo Autorização:");
  if (/exigirPermissao/.test(escopo)) marcar("AUTHZ", "cita exigirPermissao");
  if (/cat[aá]logo de a[cç][õo]es/i.test(escopo)) marcar("AUTHZ", "cita o catálogo de ações");
  // "sem autenticação" descreve rota pública, que é PUBLIC_API e não AUTH.
  if (/(?<!sem )\b(autentica[cç][aã]o|login|senha|sess[aã]o|sess[õo]es|token|JWT|segundo fator)\b/i.test(`${bloco.titulo}\n${campo(bloco, "Objetivo")}`)) {
    marcar("AUTH", "título ou objetivo falam de autenticação, sessão, senha ou token");
  }

  // TENANT. O comando `test:isolamento` aparece em quase toda etapa na regressão; aqui só conta no escopo, fora das linhas de teste, documentação, infraestrutura e arquivos.
  const linhasDeEscopoSemTeste = [campo(bloco, "Objetivo"), ...subitensDoImplementar(bloco)
    .filter((s) => !/^(testes?|documentacao|infraestrutura|arquivos)\b/.test(semAcento(s.prefixo).toLowerCase()))
    .map((s) => s.texto)].join("\n");
  const tenantNoEscopo = /organizacao_id|SET LOCAL|comTenant/.exec(`${escopo}\n${campo(bloco, "Risco de segurança")}`);
  if (tenantNoEscopo) marcar("TENANT", `cita ${tenantNoEscopo[0]}`);
  else if (/test:isolamento/.test(linhasDeEscopoSemTeste)) marcar("TENANT", "o escopo (fora das linhas de teste) cita test:isolamento");

  // RLS. Só no que fala de banco, porque a sigla aparece em prosa de toda a V2.
  const linhasDeBanco = subitensDoImplementar(bloco)
    .filter((s) => ["migration", "banco"].includes(semAcento(s.prefixo).toLowerCase()))
    .map((s) => s.texto)
    .join("\n");
  if (/POLICY|GRANT|ROW LEVEL SECURITY|\bRLS\b|\bpolic(y|ies)\b|\bgrants?\b/.test(linhasDeBanco)) marcar("RLS", "Migration: ou Banco: cita policy, grant ou RLS");

  // DB e MIGRATION.
  if (temPrefixo("banco").length > 0) marcar("DB", "prefixo Banco:");
  if (/^sim\b/i.test(migracao)) {
    marcar("DB", "Migração necessária: Sim");
    marcar("MIGRATION", "Migração necessária: Sim");
  }
  if (temPrefixo("migration").length > 0) {
    marcar("DB", "prefixo Migration:");
    marcar("MIGRATION", "prefixo Migration:");
  }

  // API e PUBLIC_API.
  const linhasDeApi = subitensDoImplementar(bloco).filter((s) => semAcento(s.prefixo).toLowerCase() === "api");
  if (linhasDeApi.length > 0) marcar("API", "prefixo API:");
  const textoDaApi = [campo(bloco, "Objetivo"), ...linhasDeApi.map((s) => s.texto)].join("\n");
  if ((linhasDeApi.length > 0 || /\bapi\b/i.test(bloco.titulo)) && /sem autentica[cç][aã]o|rota p[uú]blica|api p[uú]blica|\bp[uú]blic[ao]s?\b|an[oô]nim|do cidad[aã]o|\bcidad[aã]o\b/i.test(textoDaApi)) {
    marcar("PUBLIC_API", "API: fala de rota sem autenticação, pública, anônima ou do cidadão");
  }

  // LGPD. "Não se aplica" e "só dado sintético" (sem citar pessoa, IP, e-mail, retenção...) não contam; o resto conta (fail-closed).
  const soSintetico = /sint[ée]tic/i.test(lgpd) && !/pessoal|titular|sens[ií]vel|reten[cç]|\bIP\b|e-mail|cidad|subprocess/i.test(lgpd);
  if (lgpd !== "" && !/^n[ãa]o se aplica/i.test(lgpd) && !soSintetico) {
    marcar("LGPD", "Impacto LGPD diferente de Não se aplica");
  }

  // DOCUMENTO, ARQUIVO, INFRA.
  if (/\blaudos?\b|\btermos?\b|montador|\bsaida\//i.test(`${bloco.titulo}\n${campo(bloco, "Objetivo")}\n${campo(bloco, "Arquivos e módulos prováveis")}`)) {
    marcar("DOCUMENTO", "título, objetivo ou arquivos falam de laudo, termo, montador ou saida/");
  }
  const linhasDeArquivos = subitensDoImplementar(bloco).filter((s) => semAcento(s.prefixo).toLowerCase() === "arquivos");
  /*
    O prefixo `Arquivos:` é ambíguo na V2: na F00 ele lista os arquivos que a
    etapa mexe ("Arquivos: `dc360/scripts/baseline.mjs`..."), na F06 ele fala da
    cadeia de arquivos do produto (upload, armazenamento, anexo). Tomar o
    prefixo ao pé da letra marcaria 127 etapas como ARQUIVO sem que elas tratem
    de arquivo nenhum. Aqui o prefixo só vale se a linha ou o objetivo falam de
    upload, armazenamento, anexo ou evidência de usuário.
  */
  const sobreArquivoDoProduto = /\bupload\b|armazenamento|\bstorage\b|\banexos?\b|\bbucket\b|evid[eê]ncias? (de|da|do) /i;
  if (linhasDeArquivos.some((s) => sobreArquivoDoProduto.test(s.texto)) || sobreArquivoDoProduto.test(`${bloco.titulo}\n${campo(bloco, "Objetivo")}`)) {
    marcar("ARQUIVO", "Arquivos:, título ou objetivo falam de upload, armazenamento ou anexo");
  }
  if (temPrefixo("infraestrutura").length > 0) marcar("INFRA", "prefixo Infraestrutura:");

  // OFFLINE: transporte, fila ou sincronização do campo.
  if (origem.has("MOBILE") && /offline|\bfila\b|sincroniza|transporte/i.test(escopo)) {
    marcar("OFFLINE", "Mobile: com fila, transporte, offline ou sincronização no escopo");
  }

  // Caminhos: os do diff, se houver; senão, os "prováveis" da própria etapa.
  const fonteDosCaminhos = diff ? "diff" : "arquivos prováveis";
  const caminhosConsiderados = diff ? diff.arquivos.map((a) => a.caminho) : caminhosProvaveis(bloco);
  for (const caminho of caminhosConsiderados) {
    for (const tag of tagsPorCaminho(caminho)) marcar(tag, `${fonteDosCaminhos}: ${normalizarCaminho(caminho)}`);
  }

  // Conteúdo do diff: tenant e política de RLS só aparecem lendo as linhas.
  if (diff) {
    for (const arquivo of diff.patch) {
      const c = normalizarCaminho(arquivo.caminho);
      const linhas = [...arquivo.adicionadas, ...arquivo.removidas].join("\n");
      if (/organizacao_id|SET LOCAL|comTenant/.test(linhas) && NAO_E_TESTE(c)) marcar("TENANT", `diff: ${c} mexe em organizacao_id, SET LOCAL ou comTenant`);
      if (/^db\/migrations\/.*\.sql$/.test(c) && /POLICY|GRANT|ROW LEVEL SECURITY/i.test(linhas)) marcar("RLS", `diff: ${c} mexe em POLICY, GRANT ou RLS`);
      if (/exigirPermissao/.test(linhas) && NAO_E_TESTE(c)) marcar("AUTHZ", `diff: ${c} mexe em exigirPermissao`);
    }
  }

  // A11Y vem por último porque depende de UI e MOBILE.
  if (temPrefixo("acessibilidade", "ux e acessibilidade").length > 0) marcar("A11Y", "prefixo Acessibilidade:");
  if (origem.has("UI")) marcar("A11Y", "tag UI");
  if (origem.has("MOBILE")) marcar("A11Y", "tag MOBILE");

  const tags = TAGS_EM_ORDEM.filter((t) => origem.has(t));
  return { tags, origem: Object.fromEntries(tags.map((t) => [t, origem.get(t)])) };
}

/* ---------- Validadores e Opus ---------- */

/**
 * ARQUIVO "público": ARQUIVO com tag PUBLIC_API, ou o texto fala de público,
 * cidadão ou anônimo. A política (matriz da seção 9) pede reforço só para
 * arquivo público, e "público" não é uma tag, então vira esta pergunta.
 */
export function arquivoPublico(bloco, tags) {
  if (!tags.includes("ARQUIVO")) return false;
  if (tags.includes("PUBLIC_API")) return true;
  return /\bp[uú]blic[ao]s?\b|\bcidad[aã]o\b|an[oô]nim|sem login/i.test(`${bloco.titulo}\n${campo(bloco, "Objetivo")}`);
}

/**
 * Validadores obrigatórios pela matriz da seção 9, com o teto de 4.
 *
 * O teto é `qa` mais três. Quem fica nas três vagas, nesta ordem de decisão:
 *
 * 1. `ux` é PROTEGIDO quando há tag UI (seção 10: "validadores de interface não
 *    saem pelo teto"). Senão uma etapa de tela com AUTH não teria ninguém
 *    olhando a tela.
 * 2. Se o risco é médio ou baixo, a duplicidade entre `red-team` e
 *    `seguranca-aplicacao` é cortada primeiro: fica `red-team`. Os dois olham o
 *    mesmo código com a mesma régua, e em risco médio um basta. Só corta se o
 *    teto estiver estourado; sem estouro, os dois ficam.
 * 3. REGRA DE DESEMPATE do que ainda estourar: sai o de menor posição em
 *    `ORDEM_DE_RISCO` (a lista é total, não há empate possível).
 *
 * O que o teto cortou vai em `descartadosPeloTeto`, porque o gatekeeper pode
 * acrescentar e nunca tirar, e precisa saber o que ficou de fora.
 * `sugeridos` traz o que a matriz não exige mas as tags sugerem (acessibilidade
 * em A11Y sem UI).
 */
export function validadoresObrigatorios(tags, { publico = false, risco = "" } = {}) {
  const t = new Set(tags);
  const motivos = new Map();
  const exigir = (validador, motivo) => {
    if (!motivos.has(validador)) motivos.set(validador, []);
    if (!motivos.get(validador).includes(motivo)) motivos.get(validador).push(motivo);
  };
  exigir("qa", "toda etapa");
  if (t.has("UI")) {
    exigir("ux", "UI");
    exigir("acessibilidade", "UI");
  }
  if (t.has("MOBILE") || t.has("OFFLINE")) exigir("testes", "MOBILE ou OFFLINE");
  if (t.has("AUTH") || t.has("AUTHZ")) {
    exigir("seguranca-aplicacao", "AUTH ou AUTHZ");
    exigir("red-team", "AUTH ou AUTHZ");
  }
  if (t.has("TENANT") || t.has("RLS")) {
    exigir("banco-de-dados", "TENANT ou RLS");
    exigir("red-team", "TENANT ou RLS");
  }
  if (t.has("MIGRATION") && !t.has("RLS")) {
    exigir("banco-de-dados", "MIGRATION sem RLS");
    exigir("testes", "MIGRATION sem RLS");
  }
  if (t.has("LGPD")) exigir("privacidade-lgpd", "LGPD");
  if (t.has("PUBLIC_API") || publico) {
    exigir("seguranca-aplicacao", t.has("PUBLIC_API") ? "PUBLIC_API" : "ARQUIVO público");
    exigir("red-team", t.has("PUBLIC_API") ? "PUBLIC_API" : "ARQUIVO público");
  }
  if (t.has("DOCUMENTO")) exigir("especificacao", "DOCUMENTO");
  if (t.has("INFRA")) exigir("engenharia-entrega", "INFRA");

  const vagas = TETO_DE_VALIDADORES - 1;
  const protegidos = t.has("UI") ? ["ux"] : [];
  let demais = [...motivos.keys()].filter((v) => v !== "qa").sort((a, b) => ORDEM_DE_RISCO.indexOf(a) - ORDEM_DE_RISCO.indexOf(b));
  const descartados = [];
  const riscoNormal = semAcento(risco).toLowerCase().trim();
  const riscoMedioOuBaixo = riscoNormal === "medio" || riscoNormal === "baixo";

  if (demais.length > vagas && riscoMedioOuBaixo && demais.includes("red-team") && demais.includes("seguranca-aplicacao")) {
    descartados.push("seguranca-aplicacao");
    demais = demais.filter((v) => v !== "seguranca-aplicacao");
  }
  if (demais.length > vagas) {
    const livres = demais.filter((v) => !protegidos.includes(v));
    const quantosLivres = vagas - demais.filter((v) => protegidos.includes(v)).length;
    const mantidosLivres = livres.slice(0, Math.max(quantosLivres, 0));
    for (const v of livres.slice(Math.max(quantosLivres, 0))) descartados.push(v);
    demais = demais.filter((v) => protegidos.includes(v) || mantidosLivres.includes(v));
  }
  const sugeridos = t.has("A11Y") && !t.has("UI") && !motivos.has("acessibilidade") ? ["acessibilidade"] : [];
  const validadores = ["qa", ...demais];

  return {
    validadores,
    motivos: Object.fromEntries(validadores.map((v) => [v, motivos.get(v)])),
    descartadosPeloTeto: descartados,
    sugeridos,
    regraDeDesempate:
      `qa sempre, mais ${vagas}: ux protegido quando há UI; em risco médio ou baixo corta-se primeiro seguranca-aplicacao quando red-team já está; ` +
      `o resto pela posição em ORDEM_DE_RISCO (${ORDEM_DE_RISCO.join(" > ")})`,
  };
}

/** LGPD estrutural (seção 12, gatilho 4): manifesto de dados, retenção, eliminação, expurgo, anonimização, base legal. */
const RE_LGPD_ESTRUTURAL = /manifesto|reten[cç][aã]o|elimina[cç][aã]o|expurgo|anonimiza|base legal/i;
/** DOCUMENTO que toca imutabilidade ou assinatura. */
const RE_DOCUMENTO_IMUTAVEL = /imut[aá][bv]|assinatur/i;

/**
 * Opus revisa? Duas fontes, e basta uma: a coluna da matriz (seção 9) e o
 * gatilho 4 da seção 12.
 *
 * Calibração de 2026-10-07: LGPD e DOCUMENTO "amplos" (qualquer etapa com a
 * tag) deixavam Opus em 372 das 618 etapas. Agora LGPD só conta quando é
 * ESTRUTURAL e DOCUMENTO só quando o texto ou o diff toca imutabilidade ou
 * assinatura, tanto na coluna da matriz quanto no gatilho 4. O gatilho 4 é:
 * Risco crítico, ou Risco alto com AUTHZ, TENANT, RLS ou PUBLIC_API, ou com
 * DOCUMENTO imutável ou LGPD estrutural.
 */
export function exigeOpus(bloco, tags, { publico = false, diff = null } = {}) {
  const t = new Set(tags);
  const motivos = [];
  // O campo "Impacto LGPD" fica de fora de propósito: ele cita "retenção" em toda etapa que só tem efeito de retenção, e isso não é LGPD estrutural.
  const escopo = textoDeEscopo(bloco);
  const linhasDoDiff = diff ? diff.patch.filter((p) => NAO_E_TESTE(normalizarCaminho(p.caminho))).flatMap((p) => [...p.adicionadas, ...p.removidas]).join("\n") : "";

  const lgpdEstrutural = t.has("LGPD") && (RE_LGPD_ESTRUTURAL.test(escopo) || (diff !== null && RE_LGPD_ESTRUTURAL.test(linhasDoDiff)));
  const documentoImutavel = t.has("DOCUMENTO") && (RE_DOCUMENTO_IMUTAVEL.test(escopo) || (diff !== null && RE_DOCUMENTO_IMUTAVEL.test(linhasDoDiff)));

  // Na coluna "Opus revisa?" da matriz, "sim" vale só em Risco alto ou crítico (seção 9, calibração de 2026-10-07);
  // em risco baixo ou médio a revisão fica nos validadores Sonnet, salvo gatilho da seção 12.
  const risco = semAcento(campo(bloco, "Risco")).toLowerCase().trim();
  if (risco === "alto" || risco === "critico") {
    if (t.has("AUTH") || t.has("AUTHZ")) motivos.push("matriz: AUTH ou AUTHZ");
    if (t.has("TENANT") || t.has("RLS")) motivos.push("matriz: TENANT ou RLS");
    if (t.has("PUBLIC_API") || publico) motivos.push("matriz: PUBLIC_API ou ARQUIVO público");
    if (lgpdEstrutural) motivos.push("matriz: LGPD estrutural (manifesto, retenção, eliminação, expurgo, anonimização ou base legal)");
    if (documentoImutavel) motivos.push("matriz: DOCUMENTO com imutabilidade ou assinatura");
    if (t.has("INFRA")) {
      const infra = subitensDoImplementar(bloco)
        .filter((s) => semAcento(s.prefixo).toLowerCase() === "infraestrutura")
        .map((s) => s.texto)
        .join("\n");
      if (/\bsegredos?\b|\bsecrets?\b|produ[cç][aã]o/i.test(`${infra}\n${campo(bloco, "Objetivo")}`)) motivos.push("matriz: INFRA com segredo ou produção");
    }
  }

  if (risco === "critico") motivos.push("gatilho 4 (seção 12): Risco crítico");
  if (risco === "alto" && ["AUTHZ", "TENANT", "RLS", "PUBLIC_API"].some((x) => t.has(x))) {
    motivos.push("gatilho 4 (seção 12): Risco alto com AUTHZ, TENANT, RLS ou PUBLIC_API");
  }
  if (risco === "alto" && documentoImutavel) motivos.push("gatilho 4 (seção 12): Risco alto com DOCUMENTO que toca imutabilidade ou assinatura");
  if (risco === "alto" && lgpdEstrutural) motivos.push("gatilho 4 (seção 12): Risco alto com LGPD estrutural");
  return { opus: motivos.length > 0, motivos };
}

/* ---------- Portão visual (seção 10) ---------- */

/** Um literal em português visível ao usuário numa linha de código? Na dúvida, sim. */
export function temLiteralEmPortugues(linha) {
  const t = linha.trim();
  if (t === "" || /^(\/\/|\/\*|\*|import\s|export\s+\*)/.test(t)) return false;
  const pareceFrase = (s) =>
    /\s/.test(s.trim()) &&
    (/[áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/.test(s) || /\b(de|da|do|que|para|não|nao|você|sua|seu|com|uma|um|foi|ser|ao|os|as|em|no|na|ou|é|está|ainda|sem)\b/i.test(s)) &&
    !/^[\w./:@#$-]+$/.test(s.trim());
  for (const m of t.matchAll(/(["'`])((?:\\.|(?!\1).){6,}?)\1/g)) {
    if (pareceFrase(m[2])) return true;
  }
  for (const m of t.matchAll(/>([^<>{}]{6,})</g)) {
    if (pareceFrase(m[1])) return true;
  }
  return false;
}

const SUPERFICIE_DE_TEXTO = /^(apps\/(web|console|campo|cidadao)\/src|packages\/shared\/src)\//;

const GATILHOS = [
  ["novo-padrao-visual", "novo padrão visual"],
  ["nova-superficie-ou-tela", "nova superfície ou tela"],
  ["nova-jornada", "nova jornada relevante"],
  ["texto-de-produto", "texto de produto"],
  ["tela-publica", "tela pública"],
  ["mudanca-grande-de-ux", "mudança grande de UX"],
  ["fluxo-de-erro-critico", "fluxo de erro crítico"],
  ["gate-de-fase", "gate de fase"],
  ["e4-explicito", "critério E4 explícito na etapa"],
];

/**
 * Gatilhos que o TEXTO da etapa dispara sozinho (seção 10, "Texto da etapa ou
 * diff"): critério E4 explícito, tela pública e gate de fase (este só vale no
 * gate, nunca na etapa). Os outros seis são decididos pelo DIFF do candidato:
 * antes da implementação quase toda etapa futura "cria" algo, e decidir pelo
 * texto punha Rafael como obrigatório em 207 das 250 etapas de interface.
 */
const GATILHOS_DO_TEXTO = new Set(["tela-publica", "e4-explicito", "gate-de-fase"]);
const GATILHOS_DO_DIFF = GATILHOS.map(([id]) => id).filter((id) => !GATILHOS_DO_TEXTO.has(id));

/** Tag de abertura de elemento de layout (web ou React Native): a "estrutura" que a política distingue de texto e estilo. */
const RE_ELEMENTO_DE_LAYOUT = /<(?:section|div|nav|main|form|header|footer|aside|table|ul|ol|dialog|View|ScrollView|FlatList|Pressable)\b/g;

function elementosDeLayout(linhas) {
  return linhas.reduce((n, l) => n + (l.match(RE_ELEMENTO_DE_LAYOUT)?.length ?? 0), 0);
}

/**
 * Detecta os gatilhos do portão visual. Etapa sem tag UI nem MOBILE não tem
 * portão visual.
 *
 * SEM diff, só disparam por texto os do `GATILHOS_DO_TEXTO`. Os outros seis
 * voltam com `disparado: false`, `deteccao: "a decidir pelo diff"` e, se o
 * texto da etapa sugere o gatilho, `possivel: true`: eles NÃO contam como
 * obrigatórios e o gatekeeper os decide quando houver diff.
 *
 * COM diff, os seis são decididos só pelos caminhos e pelas linhas do diff, e
 * o texto da etapa não dispara nenhum deles. "Mudança grande de UX" dispara
 * por página nova, rota nova, ou mais de um arquivo de tela que ganhou
 * elemento de layout (mais tags de layout abertas do que fechadas pelo diff).
 * Na dúvida, dispara.
 */
export function gatilhosVisuais(bloco, tags, diff = null) {
  const ehInterface = tags.includes("UI") || tags.includes("MOBILE");
  const resultado = new Map(GATILHOS.map(([id, nome]) => [id, { id, nome, disparado: false, possivel: false, deteccao: "texto", motivo: "" }]));
  const disparar = (id, deteccao, motivo) => {
    const r = resultado.get(id);
    if (r.disparado) {
      if (!r.deteccao.includes(deteccao)) r.deteccao = `${r.deteccao} e ${deteccao}`;
      r.motivo += `; ${motivo}`;
      return;
    }
    Object.assign(r, { disparado: true, possivel: true, deteccao, motivo });
  };
  /** O texto sugere o gatilho: dispara se ele é de texto, senão só marca como possível. */
  const dica = (id, motivo) => {
    if (GATILHOS_DO_TEXTO.has(id)) {
      disparar(id, "texto", motivo);
      return;
    }
    if (diff) return;
    const r = resultado.get(id);
    if (!r.possivel) Object.assign(r, { possivel: true, motivo });
  };

  if (!ehInterface) {
    for (const r of resultado.values()) r.deteccao = "nao se aplica (etapa sem UI nem MOBILE)";
    return { aplicavel: false, gatilhos: [...resultado.values()], pendentesDeDiff: [], possiveis: [], rafaelVisualObrigatorio: false };
  }

  const escopo = textoDeEscopo(bloco);
  const arquivos = campo(bloco, "Arquivos e módulos prováveis");
  const validacao = campo(bloco, "Validação humana");
  const estadoAtual = campo(bloco, "Estado atual").trim();
  const e2e = campo(bloco, "E2E");
  const prefixos = prefixosNormalizados(bloco);
  const trecho = (re, texto) => {
    const m = re.exec(texto);
    return m ? `"${m[0]}"` : null;
  };

  // Dicas do texto da etapa.
  let achou = trecho(/componente compartilhado|novo componente|componente novo|token novo|novo token|tokens?\.css|design system|padr[aã]o visual/i, `${escopo}\n${arquivos}`);
  if (achou) dica("novo-padrao-visual", `escopo cita ${achou}`);

  achou = trecho(/nova tela|tela nova|nova p[aá]gina|p[aá]gina nova|nova rota|rota nova|nova superf[ií]cie|`[^`]*\/(?:paginas|app)\/[^`]*`\s*\((?:a criar|novo|nova)/i, `${escopo}\n${arquivos}`);
  if (achou) dica("nova-superficie-ou-tela", `escopo cita ${achou}`);

  achou = trecho(/nova jornada|novo fluxo|fluxo novo|se[cç][aã]o nova no e2e|nova se[cç][aã]o|jornada/i, `${escopo}\n${e2e}`);
  if (achou) dica("nova-jornada", `escopo ou E2E cita ${achou}`);

  achou = trecho(/texto de produto|\bfrases?\b|\bmensagens?\b|reda[cç][aã]o|r[oó]tulo|\bcopy\b|texto da tela|microtexto|legenda/i, `${escopo}\n${validacao}`);
  if (achou) dica("texto-de-produto", `etapa de interface cita ${achou}`);

  if (/^(CRIAR|SUBSTITUIR)\b/i.test(estadoAtual)) dica("mudanca-grande-de-ux", `Estado atual ${estadoAtual.split(/\s/)[0].toUpperCase()}`);
  if (prefixos.some((p) => p.chave === "ux" || p.chave.startsWith("ux "))) dica("mudanca-grande-de-ux", "prefixo UX:");

  achou = trecho(/sess[aã]o (encerrada|expirada|que terminou)|conta desativada|sem permiss[aã]o|permiss[aã]o negada|perda de dado|perde(r|ndo)? (dado|item|coleta)|falha de envio|falha ao enviar|n[aã]o (foi )?enviad|sem sinal|\b40[13]\b/i, `${escopo}\n${validacao}`);
  if (achou) dica("fluxo-de-erro-critico", `etapa de interface cita ${achou}`);

  // Os de texto.
  achou = trecho(/tela p[uú]blica|sem login|an[oô]nim|\bcidad[aã]o\b|portal p[uú]blico|valida[cç][aã]o de documento|rota p[uú]blica|recupera[cç][aã]o de senha|\/entrar\b/i, `${escopo}\n${validacao}`);
  if (achou) dica("tela-publica", `etapa de interface cita ${achou}`);
  else if (tags.includes("PUBLIC_API")) dica("tela-publica", "tag PUBLIC_API numa etapa de interface");

  resultado.get("gate-de-fase").deteccao = "nao se aplica (so no gate da fase)";

  achou = trecho(/aparelho|iPhone|Android|TalkBack|VoiceOver|\bdecide\b|\bdecis[aã]o\b|texto de produto|\bDPO\b|jur[ií]dic|pentest|profissional|segunda pessoa|m[aá]quina limpa/i, validacao);
  if (achou && !/^n[ãa]o se aplica/i.test(validacao.trim())) dica("e4-explicito", `Validação humana cita ${achou}`);

  // Diff: decide os seis que o texto não decide.
  if (diff) {
    const adicionados = diff.arquivos.filter((a) => a.status === "A").map((a) => normalizarCaminho(a.caminho));
    const alterados = diff.arquivos.map((a) => normalizarCaminho(a.caminho));

    const padrao = adicionados.filter((c) => /^apps\/(web|console|campo|cidadao)\/src\/.*(componentes|components|ui)\//.test(c));
    const token = alterados.filter((c) => /(^|\/)(tokens\.css|_tokens\.scss|design-system\/)/.test(c));
    if (padrao.length > 0) disparar("novo-padrao-visual", "diff", `componente novo: ${padrao[0]}`);
    if (token.length > 0) disparar("novo-padrao-visual", "diff", `token alterado: ${token[0]}`);

    const telas = adicionados.filter((c) => /^apps\/(web|console|cidadao)\/src\/paginas\//.test(c) || /^apps\/(campo|cidadao)\/src\/app\//.test(c));
    const rotas = diff.patch.filter((p) => /^apps\/(web|console)\/src\/App\.tsx$/.test(normalizarCaminho(p.caminho)) && p.adicionadas.some((l) => /<Route\b|\bpath\s*[:=]/.test(l)));
    if (telas.length > 0) disparar("nova-superficie-ou-tela", "diff", `arquivo de tela novo: ${telas[0]}`);
    if (rotas.length > 0) disparar("nova-superficie-ou-tela", "diff", "rota acrescentada em App.tsx");

    const e2eNovo = diff.patch.filter((p) => /\.e2e\.mjs$/.test(p.caminho) && p.adicionadas.some((l) => /^\s*\/\/\s*\d+[a-z]?\.\s+\S/.test(l)));
    if (e2eNovo.length > 0) disparar("nova-jornada", "diff", `seção nova no e2e: ${e2eNovo[0].caminho}`);

    const comTexto = diff.patch.filter((p) => {
      const c = normalizarCaminho(p.caminho);
      return SUPERFICIE_DE_TEXTO.test(c) && NAO_E_TESTE(c) && [...p.adicionadas, ...p.removidas].some(temLiteralEmPortugues);
    });
    if (comTexto.length > 0) disparar("texto-de-produto", "diff", `literal em português criado ou alterado em ${normalizarCaminho(comTexto[0].caminho)}`);

    // Mudança grande de UX: página nova, rota nova, ou mais de um arquivo de tela com elemento novo de layout.
    if (telas.length > 0) disparar("mudanca-grande-de-ux", "diff", `página ou tela nova: ${telas[0]}`);
    if (rotas.length > 0) disparar("mudanca-grande-de-ux", "diff", "rota nova em App.tsx");
    const comLayoutNovo = diff.patch.filter((p) => {
      const c = normalizarCaminho(p.caminho);
      return /^apps\/(web|console|campo|cidadao)\/src\/.*\.(tsx|jsx)$/.test(c) && NAO_E_TESTE(c) && elementosDeLayout(p.adicionadas) > elementosDeLayout(p.removidas);
    });
    if (comLayoutNovo.length > 1) disparar("mudanca-grande-de-ux", "diff", `${comLayoutNovo.length} arquivos de tela com elemento novo de layout (ex.: ${normalizarCaminho(comLayoutNovo[0].caminho)})`);

    const publicas = alterados.filter((c) => /^apps\/(web|console|cidadao)\/src\/paginas\/(Entrar|QueroConhecer|Recuperacao|Publico|Validacao)/i.test(c) || /^apps\/cidadao\//.test(c));
    if (publicas.length > 0) disparar("tela-publica", "diff", `tela pública tocada: ${publicas[0]}`);

    const erros = diff.patch.filter((p) => {
      const c = normalizarCaminho(p.caminho);
      if (!NAO_E_TESTE(c)) return false;
      if (/(codigos-de-erro|falha-de-atualizacao|mensagens|sessao)/i.test(semAcento(c))) return true;
      return [...p.adicionadas, ...p.removidas].some((l) => /sess[aã]o (encerrada|expirada)|conta desativada|sem permiss[aã]o|n[aã]o (foi )?enviad|falha (de|ao) envi/i.test(l));
    });
    if (erros.length > 0) disparar("fluxo-de-erro-critico", "diff", `mexe em fluxo de erro: ${normalizarCaminho(erros[0].caminho)}`);
  }

  const lista = [...resultado.values()];
  for (const r of lista) {
    if (!diff && GATILHOS_DO_DIFF.includes(r.id)) r.deteccao = "a decidir pelo diff";
    else if (diff && !r.disparado && GATILHOS_DO_DIFF.includes(r.id)) r.deteccao = "diff (nao dispara)";
  }
  const pendentesDeDiff = diff ? [] : [...GATILHOS_DO_DIFF];
  const possiveis = lista.filter((r) => !diff && GATILHOS_DO_DIFF.includes(r.id) && r.possivel).map((r) => r.id);
  return { aplicavel: true, gatilhos: lista, pendentesDeDiff, possiveis, rafaelVisualObrigatorio: lista.some((r) => r.disparado) };
}

/* ---------- Pacote completo ---------- */

/** Faz tudo para uma etapa já localizada: tags, validadores, Opus e gatilhos. */
export function analisarEtapa(bloco, diff = null) {
  const { tags, origem } = derivarTags(bloco, diff);
  const publico = arquivoPublico(bloco, tags);
  return {
    id: bloco.id,
    titulo: bloco.titulo,
    risco: campo(bloco, "Risco").trim(),
    prioridade: campo(bloco, "Prioridade").trim(),
    estadoAtual: /^[A-ZÀ-Ú]+/.exec(campo(bloco, "Estado atual").trim())?.[0] ?? "",
    fonteDosCaminhos: diff ? `diff ${diff.intervalo}` : "arquivos prováveis da etapa",
    tags,
    origem,
    ...validadoresObrigatorios(tags, { publico, risco: campo(bloco, "Risco") }),
    opus: exigeOpus(bloco, tags, { publico, diff }),
    visual: gatilhosVisuais(bloco, tags, diff),
  };
}

/* ---------- Saída de texto ---------- */

export function formatarAnalise(a) {
  const linhas = [];
  linhas.push(`${a.id}  ${a.titulo}`);
  linhas.push(`Risco ${a.risco || "?"} | Prioridade ${a.prioridade || "?"} | Estado atual ${a.estadoAtual || "?"} | caminhos: ${a.fonteDosCaminhos}`);
  linhas.push(`Tags: ${a.tags.length > 0 ? a.tags.join(", ") : "nenhuma"}`);
  for (const tag of a.tags) linhas.push(`  ${tag}: ${a.origem[tag].slice(0, 3).join("; ")}${a.origem[tag].length > 3 ? ` (e mais ${a.origem[tag].length - 3})` : ""}`);
  linhas.push(`Validadores obrigatórios (teto ${TETO_DE_VALIDADORES}): ${a.validadores.join(", ")}`);
  if (a.descartadosPeloTeto.length > 0) linhas.push(`  cortados pelo teto, o gatekeeper pode acrescentar: ${a.descartadosPeloTeto.join(", ")}`);
  if (a.sugeridos.length > 0) linhas.push(`  sugeridos (fora da matriz): ${a.sugeridos.join(", ")}`);
  linhas.push(`Opus revisa: ${a.opus.opus ? "sim" : "não"}${a.opus.motivos.length > 0 ? ` (${a.opus.motivos.join("; ")})` : ""}`);
  if (!a.visual.aplicavel) {
    linhas.push("Portão visual: não se aplica (etapa sem UI nem MOBILE)");
  } else {
    const disparados = a.visual.gatilhos.filter((g) => g.disparado);
    linhas.push(`Portão visual: Rafael obrigatório = ${a.visual.rafaelVisualObrigatorio ? "sim" : "não"}; ${disparados.length} gatilho(s) disparado(s)`);
    for (const g of disparados) linhas.push(`  [${g.deteccao}] ${g.nome}: ${g.motivo}`);
    if (a.visual.pendentesDeDiff.length > 0) {
      linhas.push(`  a decidir pelo diff (não contam como obrigatórios): ${a.visual.pendentesDeDiff.join(", ")}`);
      if (a.visual.possiveis.length > 0) linhas.push(`  possíveis, pelo texto da etapa: ${a.visual.possiveis.join(", ")}`);
    }
  }
  return linhas.join("\n");
}

/* ---------- CLI ---------- */

function principal(argv) {
  const args = argv.slice(2);
  let id = null;
  let intervalo = null;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") json = true;
    else if (a === "--diff") intervalo = args[++i] ?? "";
    else if (a.startsWith("--diff=")) intervalo = a.slice("--diff=".length);
    else if (!a.startsWith("-") && !id) id = a;
    else {
      console.error(`Argumento não reconhecido: ${a}\nUso: node scripts/roadmap/tags.mjs V2-Fnn-Enn [--diff base..head] [--json]`);
      return 2;
    }
  }
  if (!id || !idValido(id)) {
    console.error("Informe o ID da etapa no formato V2-Fnn-Enn.\nUso: node scripts/roadmap/tags.mjs V2-Fnn-Enn [--diff base..head] [--json]");
    return 2;
  }
  const bloco = localizarEtapa(id);
  if (!bloco) {
    console.error(`Etapa ${id} não encontrada nos arquivos de fase de docs/roadmap-v2/.`);
    return 2;
  }
  let diff = null;
  if (intervalo !== null) {
    try {
      diff = lerDiff(intervalo);
    } catch (erro) {
      console.error(erro.message);
      return 2;
    }
  }
  const analise = analisarEtapa(bloco, diff);
  console.log(json ? JSON.stringify(analise, null, 2) : formatarAnalise(analise));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
