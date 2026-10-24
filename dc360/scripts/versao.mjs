/**
 * Versão do produto: sobe, confere e valida o nome de tag (V2-F01-E07).
 *
 * O problema que isto resolve: todos os `package.json` estavam em 0.1.0 por
 * inércia, não havia tag e não havia CHANGELOG, então nada ligava o que está no
 * ar a um commit. Aqui a versão passa a ser uma decisão escrita em um lugar só
 * por linha, e o script reprova quando os arquivos discordam entre si.
 *
 * DUAS LINHAS de versão, cada uma com sua tag:
 *
 *   plataforma  API, painel, console, banco e pacotes compartilhados. UM número,
 *               o de `dc360/package.json`, igual em todo workspace e no
 *               `package-lock.json`. Tag `vX.Y.Z`.
 *   campo       Aplicativo do agente. O número é `VERSAO` de
 *               `apps/campo/app.config.ts`, e `apps/campo/package.json` (com o
 *               lockfile do aplicativo) acompanha. Tag `campo-vX.Y.Z`. O `BUILD`
 *               é outra coisa: segue do EAS e este script não o toca.
 *
 * Regra de SemVer deste produto: antes da G28 a major é 0 (`0.y.z`). Migration ou
 * contrato incompatível sobe o `y` (e zera o `z`); correção sobe o `z`. A 1.0.0
 * é recusada aqui de propósito: ela é uma decisão do Rafael na G28, não um bump.
 *
 * Cada versão precisa de uma seção em `CHANGELOG.md` com o título
 * `## plataforma X.Y.Z - AAAA-MM-DD` (ou `## campo ...`). Versão sem seção
 * reprova em `conferir`. Seção "Não lançado" no topo é aceita e ignorada.
 *
 * Este script NUNCA cria tag. Tag é ato do dono (e do workflow da E12, que ainda
 * não existe). Ele só diz se o NOME proposto é válido e se bate com o que os
 * arquivos dizem.
 *
 * Uso (da pasta dc360, sem script novo no package.json):
 *   node scripts/versao.mjs conferir
 *   node scripts/versao.mjs mostrar
 *   node scripts/versao.mjs subir <plataforma|campo> <y|z|X.Y.Z>
 *   node scripts/versao.mjs conferir-tag <vX.Y.Z|campo-vX.Y.Z>
 * `--raiz=DIR` aponta para outra árvore (os testes usam uma de mentira).
 * Saída: 0 tudo certo, 1 problema encontrado, 2 uso errado.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Antes da G28 a major é 0. Mudar isto é decisão de produto, não de script. */
export const MAJOR_ATE_G28 = 0;

export const LINHAS = ["plataforma", "campo"];
const PREFIXO_DA_TAG = { plataforma: "v", campo: "campo-v" };

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ARQUIVO_DO_APP = "apps/campo/app.config.ts";
const PASTA_DO_APP = "apps/campo";
const LINHA_VERSAO_DO_APP = /^const VERSAO = "([^"]*)";$/m;

/** Divide "X.Y.Z" em números, ou devolve null se não for SemVer estrito. */
export function lerSemVer(texto) {
  const casou = typeof texto === "string" ? SEMVER.exec(texto) : null;
  return casou ? [Number(casou[1]), Number(casou[2]), Number(casou[3])] : null;
}

function comparar(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Problema de uma versão sozinha (formato e major), ou null. */
export function problemaDaVersao(texto) {
  const v = lerSemVer(texto);
  if (!v) return `"${texto}" não é SemVer estrito (X.Y.Z, sem zero à esquerda, sem sufixo)`;
  if (v[0] !== MAJOR_ATE_G28) {
    return `"${texto}" tem major ${v[0]}: antes da G28 a major é ${MAJOR_ATE_G28} (a 1.0.0 é decisão do Rafael, não um bump)`;
  }
  return null;
}

/**
 * Calcula a versão seguinte. `alvo` é `y` (migration ou contrato incompatível,
 * zera o z), `z` (correção) ou um X.Y.Z explícito, que precisa ser maior que a
 * atual. Lança Error com o motivo.
 */
export function proximaVersao(atual, alvo) {
  const v = lerSemVer(atual);
  if (!v) throw new Error(`a versão atual "${atual}" não é SemVer estrito`);
  let nova;
  if (alvo === "y") nova = `${v[0]}.${v[1] + 1}.0`;
  else if (alvo === "z") nova = `${v[0]}.${v[1]}.${v[2] + 1}`;
  else nova = alvo;
  const problema = problemaDaVersao(nova);
  if (problema) throw new Error(problema);
  if (comparar(lerSemVer(nova), v) <= 0) {
    throw new Error(`a versão nova ${nova} precisa ser maior que a atual ${atual} (versão não volta nem se repete)`);
  }
  return nova;
}

/** Nome de tag para uma versão de uma linha. */
export function nomeDaTag(linha, versao) {
  return `${PREFIXO_DA_TAG[linha]}${versao}`;
}

// ---------------------------------------------------------------------------
// Leitura dos arquivos

function lerJson(raiz, arquivo) {
  const caminho = join(raiz, arquivo);
  const texto = readFileSync(caminho, "utf8");
  return { caminho, texto, dados: JSON.parse(texto) };
}

/**
 * Pastas dos workspaces da plataforma, a partir do campo `workspaces` do
 * package.json da raiz (`packages/*` expande para cada subpasta com package.json).
 */
export function pastasDosWorkspaces(raiz) {
  const { dados } = lerJson(raiz, "package.json");
  const pastas = [];
  for (const padrao of dados.workspaces ?? []) {
    if (padrao.endsWith("/*")) {
      const base = padrao.slice(0, -2);
      const caminhoBase = join(raiz, base);
      if (!existsSync(caminhoBase)) continue;
      for (const nome of readdirSync(caminhoBase, { withFileTypes: true })) {
        if (nome.isDirectory() && existsSync(join(caminhoBase, nome.name, "package.json"))) {
          pastas.push(`${base}/${nome.name}`);
        }
      }
    } else {
      pastas.push(padrao);
    }
  }
  return pastas.sort();
}

/**
 * Lista de "onde a versão mora" de cada linha: `{ arquivo, rotulo, versao }`.
 * Versão ausente vira `undefined`, e `conferir` reclama.
 */
export function lerVersoes(raiz) {
  const plataforma = [];
  plataforma.push({ arquivo: "package.json", rotulo: "package.json da raiz", versao: lerJson(raiz, "package.json").dados.version });
  for (const pasta of pastasDosWorkspaces(raiz)) {
    plataforma.push({ arquivo: `${pasta}/package.json`, rotulo: `workspace ${pasta}`, versao: lerJson(raiz, `${pasta}/package.json`).dados.version });
  }
  const trava = lerJson(raiz, "package-lock.json").dados;
  plataforma.push({ arquivo: "package-lock.json", rotulo: "package-lock.json (versão do topo)", versao: trava.version });
  plataforma.push({ arquivo: "package-lock.json", rotulo: "package-lock.json (entrada da raiz)", versao: trava.packages?.[""]?.version });
  for (const pasta of pastasDosWorkspaces(raiz)) {
    plataforma.push({ arquivo: "package-lock.json", rotulo: `package-lock.json (entrada ${pasta})`, versao: trava.packages?.[pasta]?.version });
  }

  const campo = [];
  const config = readFileSync(join(raiz, ARQUIVO_DO_APP), "utf8");
  const casou = LINHA_VERSAO_DO_APP.exec(config);
  campo.push({ arquivo: ARQUIVO_DO_APP, rotulo: "VERSAO de apps/campo/app.config.ts", versao: casou ? casou[1] : undefined });
  campo.push({ arquivo: `${PASTA_DO_APP}/package.json`, rotulo: "apps/campo/package.json", versao: lerJson(raiz, `${PASTA_DO_APP}/package.json`).dados.version });
  const travaDoApp = lerJson(raiz, `${PASTA_DO_APP}/package-lock.json`).dados;
  campo.push({ arquivo: `${PASTA_DO_APP}/package-lock.json`, rotulo: "apps/campo/package-lock.json (versão do topo)", versao: travaDoApp.version });
  campo.push({ arquivo: `${PASTA_DO_APP}/package-lock.json`, rotulo: "apps/campo/package-lock.json (entrada da raiz)", versao: travaDoApp.packages?.[""]?.version });
  return { plataforma, campo };
}

// ---------------------------------------------------------------------------
// CHANGELOG

const TITULO_DE_SECAO = /^## (plataforma|campo) (\S+) - (\S+)\s*$/;
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function dataValida(texto) {
  const casou = DATA_ISO.exec(texto);
  if (!casou) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/**
 * Seções do CHANGELOG, na ordem em que aparecem: `{ linha, versao, data, corpo }`.
 * `problemas` traz título mal formado (começa com "## plataforma" ou "## campo"
 * mas não casa o formato).
 */
export function lerChangelog(texto) {
  const secoes = [];
  const problemas = [];
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  let atual = null;
  for (const linha of linhas) {
    if (linha.startsWith("## ")) {
      atual = null;
      const casou = TITULO_DE_SECAO.exec(linha);
      if (casou) {
        atual = { linha: casou[1], versao: casou[2], data: casou[3], corpo: [] };
        secoes.push(atual);
      } else if (/^## (plataforma|campo)\b/.test(linha)) {
        problemas.push(`título de seção fora do formato "## plataforma X.Y.Z - AAAA-MM-DD": ${linha}`);
      }
    } else if (atual) {
      atual.corpo.push(linha);
    }
  }
  for (const s of secoes) s.corpo = s.corpo.join("\n").trim();
  return { secoes, problemas };
}

function conferirChangelog(texto, versoesAtuais) {
  const problemas = [];
  const { secoes, problemas: malFormados } = lerChangelog(texto);
  problemas.push(...malFormados);
  const vistas = new Set();
  const ultima = {};
  for (const s of secoes) {
    const chave = `${s.linha} ${s.versao}`;
    const erro = problemaDaVersao(s.versao);
    if (erro) problemas.push(`CHANGELOG, seção ${chave}: ${erro}`);
    if (!dataValida(s.data)) problemas.push(`CHANGELOG, seção ${chave}: a data "${s.data}" não é uma data AAAA-MM-DD válida`);
    if (vistas.has(chave)) problemas.push(`CHANGELOG: a seção ${chave} aparece duas vezes`);
    vistas.add(chave);
    if (s.corpo === "") problemas.push(`CHANGELOG, seção ${chave}: está vazia (diga o que mudou)`);
    const v = lerSemVer(s.versao);
    if (v && ultima[s.linha] && comparar(v, ultima[s.linha]) >= 0) {
      problemas.push(`CHANGELOG: a seção ${chave} está fora de ordem (a mais nova vem primeiro dentro de cada linha)`);
    }
    if (v) ultima[s.linha] = v;
  }
  for (const linha of LINHAS) {
    const versao = versoesAtuais[linha];
    if (versao && !vistas.has(`${linha} ${versao}`)) {
      problemas.push(`CHANGELOG sem a seção "## ${linha} ${versao} - AAAA-MM-DD": versão sem changelog não vale`);
    }
  }
  return problemas;
}

// ---------------------------------------------------------------------------
// Conferência

/**
 * Confere uma árvore. Devolve `{ problemas, versoes }`; `versoes` é a versão
 * de cada linha quando os arquivos concordam (senão fica ausente).
 */
export function conferir(raiz = RAIZ_PADRAO) {
  const problemas = [];
  const versoes = {};
  const lidas = lerVersoes(raiz);
  for (const linha of LINHAS) {
    const itens = lidas[linha];
    const referencia = itens[0];
    for (const item of itens) {
      if (item.versao === undefined) {
        problemas.push(`${linha}: ${item.rotulo} não declara versão`);
        continue;
      }
      const erro = problemaDaVersao(item.versao);
      if (erro) problemas.push(`${linha}: ${item.rotulo}: ${erro}`);
    }
    const diferentes = itens.filter((i) => i.versao !== undefined && i.versao !== referencia.versao);
    for (const item of diferentes) {
      problemas.push(
        `${linha}: ${item.rotulo} está em ${item.versao}, mas ${referencia.rotulo} está em ${referencia.versao} (a linha tem UM número só; use "node scripts/versao.mjs subir ${linha} ..." em vez de editar à mão)`,
      );
    }
    if (referencia.versao !== undefined && diferentes.length === 0 && itens.every((i) => i.versao !== undefined)) {
      versoes[linha] = referencia.versao;
    }
  }

  const changelog = join(raiz, "CHANGELOG.md");
  if (!existsSync(changelog)) {
    problemas.push("CHANGELOG.md não existe");
  } else {
    problemas.push(...conferirChangelog(readFileSync(changelog, "utf8"), versoes));
  }
  return { problemas, versoes };
}

/**
 * Confere o NOME de uma tag proposta. Não cria nada.
 * `existentes` é a lista de tags que já existem (tag não se repete nem se move).
 */
export function conferirTag(raiz, nome, { existentes = [] } = {}) {
  const problemas = [];
  const casou = /^(campo-v|v)(.*)$/.exec(nome ?? "");
  if (!casou) {
    return { problemas: [`tag "${nome}" fora do padrão: use vX.Y.Z (plataforma) ou campo-vX.Y.Z (aplicativo do agente)`] };
  }
  const linha = casou[1] === "v" ? "plataforma" : "campo";
  const versao = casou[2];
  const erro = problemaDaVersao(versao);
  if (erro) return { problemas: [`tag "${nome}": ${erro}`] };
  if (existentes.includes(nome)) problemas.push(`a tag ${nome} já existe: tag não se atualiza nem se move, sobe-se outra versão`);

  const { problemas: dosArquivos, versoes } = conferir(raiz);
  problemas.push(...dosArquivos);
  if (versoes[linha] !== undefined && versoes[linha] !== versao) {
    problemas.push(`a tag ${nome} é da versão ${versao}, mas os arquivos da linha ${linha} dizem ${versoes[linha]}: a tag é posta no commit que TEM aquele número`);
  }
  return { problemas, linha, versao };
}

// ---------------------------------------------------------------------------
// Subida

/** Troca a versão de um JSON preservando a formatação; recusa se não der para preservar. */
function jsonComVersao(texto, aplicar, arquivo) {
  const dados = JSON.parse(texto);
  if (`${JSON.stringify(dados, null, 2)}\n` !== texto) {
    throw new Error(`${arquivo}: o formato não é o que o npm grava (2 espaços, LF, fim de linha final); não vou reescrever`);
  }
  aplicar(dados);
  return `${JSON.stringify(dados, null, 2)}\n`;
}

/**
 * Sobe a versão de uma linha em TODOS os arquivos dela, de uma vez: calcula
 * tudo na memória e só grava se nada falhou. Devolve `{ anterior, nova, arquivos }`.
 * Recusa se a linha já está dividida (conserte antes) ou se a versão for inválida.
 */
export function subir(raiz, linha, alvo) {
  if (!LINHAS.includes(linha)) throw new Error(`linha desconhecida "${linha}" (use ${LINHAS.join(" ou ")})`);
  const antes = conferir(raiz);
  const vindoDaLinha = antes.problemas.filter((p) => p.startsWith(`${linha}:`));
  if (vindoDaLinha.length > 0) {
    throw new Error(`a linha ${linha} já está inconsistente, conserte antes de subir:\n- ${vindoDaLinha.join("\n- ")}`);
  }
  const anterior = antes.versoes[linha];
  const nova = proximaVersao(anterior, alvo);

  const gravacoes = new Map(); // arquivo -> texto novo
  const jsons = (arquivo, aplicar) => {
    const base = gravacoes.get(arquivo) ?? readFileSync(join(raiz, arquivo), "utf8");
    gravacoes.set(arquivo, jsonComVersao(base, aplicar, arquivo));
  };

  if (linha === "plataforma") {
    const pastas = pastasDosWorkspaces(raiz);
    jsons("package.json", (d) => { d.version = nova; });
    for (const pasta of pastas) jsons(`${pasta}/package.json`, (d) => { d.version = nova; });
    jsons("package-lock.json", (d) => {
      d.version = nova;
      d.packages[""].version = nova;
      for (const pasta of pastas) d.packages[pasta].version = nova;
    });
  } else {
    const config = readFileSync(join(raiz, ARQUIVO_DO_APP), "utf8");
    if (!LINHA_VERSAO_DO_APP.test(config)) throw new Error(`${ARQUIVO_DO_APP}: não achei a linha \`const VERSAO = "X.Y.Z";\``);
    gravacoes.set(ARQUIVO_DO_APP, config.replace(LINHA_VERSAO_DO_APP, `const VERSAO = "${nova}";`));
    jsons(`${PASTA_DO_APP}/package.json`, (d) => { d.version = nova; });
    jsons(`${PASTA_DO_APP}/package-lock.json`, (d) => {
      d.version = nova;
      d.packages[""].version = nova;
    });
  }

  for (const [arquivo, texto] of gravacoes) writeFileSync(join(raiz, arquivo), texto);
  return { anterior, nova, arquivos: [...gravacoes.keys()] };
}

// ---------------------------------------------------------------------------
// Linha de comando

function tagsExistentes(raiz) {
  try {
    return execFileSync("git", ["tag", "--list"], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function principal(argv, saida = console) {
  const opcoes = argv.filter((a) => a.startsWith("--"));
  const posicionais = argv.filter((a) => !a.startsWith("--"));
  const raizOpcao = opcoes.find((o) => o.startsWith("--raiz="));
  const raiz = raizOpcao ? resolve(raizOpcao.slice("--raiz=".length)) : RAIZ_PADRAO;
  const [comando, ...resto] = posicionais;

  const mostrarProblemas = (problemas) => {
    for (const p of problemas) saida.error(`ERRO: ${p}`);
    return 1;
  };

  try {
    if (comando === "conferir") {
      const { problemas, versoes } = conferir(raiz);
      if (problemas.length > 0) return mostrarProblemas(problemas);
      saida.log(`Versões conferidas: plataforma ${versoes.plataforma}, campo ${versoes.campo}, ambas com seção no CHANGELOG.`);
      return 0;
    }
    if (comando === "mostrar") {
      const { versoes, problemas } = conferir(raiz);
      for (const linha of LINHAS) saida.log(`${linha}: ${versoes[linha] ?? "(inconsistente)"}`);
      return problemas.length > 0 ? mostrarProblemas(problemas) : 0;
    }
    if (comando === "subir") {
      if (resto.length !== 2) {
        saida.error("uso: node scripts/versao.mjs subir <plataforma|campo> <y|z|X.Y.Z>");
        return 2;
      }
      const resultado = subir(raiz, resto[0], resto[1]);
      saida.log(`${resto[0]}: ${resultado.anterior} -> ${resultado.nova} em ${resultado.arquivos.length} arquivo(s):`);
      for (const a of resultado.arquivos) saida.log(`  ${a}`);
      saida.log(`Falta a seção "## ${resto[0]} ${resultado.nova} - AAAA-MM-DD" no CHANGELOG.md; "conferir" reprova sem ela.`);
      return 0;
    }
    if (comando === "conferir-tag") {
      if (resto.length !== 1) {
        saida.error("uso: node scripts/versao.mjs conferir-tag <vX.Y.Z|campo-vX.Y.Z>");
        return 2;
      }
      const { problemas } = conferirTag(raiz, resto[0], { existentes: tagsExistentes(raiz) });
      if (problemas.length > 0) return mostrarProblemas(problemas);
      saida.log(`Tag ${resto[0]} é um nome válido e bate com os arquivos. Este script não cria tag.`);
      return 0;
    }
  } catch (erro) {
    saida.error(`ERRO: ${erro.message}`);
    return 1;
  }
  saida.error("uso: node scripts/versao.mjs <conferir|mostrar|subir|conferir-tag> [--raiz=DIR]");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2));
}
