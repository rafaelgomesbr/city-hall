/**
 * Compara a saída JSON do Semgrep com a baseline triada (`.semgrep/baseline.json`)
 * e reprova só o achado NOVO de severidade ERROR (V2-F01-E05).
 *
 * Por que baseline própria e não `--baseline-commit`: o diff por commit só existe
 * em pull request e esquece o achado antigo no instante em que ele deixa de estar
 * no diff. A baseline daqui é um arquivo no repositório em que cada achado antigo
 * foi LIDO por uma pessoa e tem classe (falso positivo, aceito, defeito), motivo,
 * dono e prazo. Defeito real vira trabalho de V2-F25-E01, não some em silêncio.
 *
 * Impressão do achado: regra + arquivo + o TRECHO INTEIRO do achado (da linha em
 * que ele começa à linha em que termina, cada linha sem a indentação e sem
 * espaços repetidos) + ordem entre achados iguais. Número de linha fica de fora
 * de propósito: inserir código acima não pode transformar achado triado em
 * achado novo. Editar QUALQUER linha do trecho, sim: a consulta mudou e alguém
 * precisa olhar de novo. (Antes só a primeira linha entrava, e uma mudança na
 * parte perigosa de uma consulta multilinha já triada conservava o id: correção
 * 1 da F01, E05.) O Semgrep CE não entrega a impressão própria (`fingerprint`
 * vem como "requires login"), por isso ela é calculada aqui.
 *
 * Cobertura: análise que não examinou arquivo nenhum não é análise limpa. O
 * validador lê `paths.scanned` do JSON e reprova quando ele vem ausente, vazio ou
 * abaixo do piso declarado (`PISO_DE_ARQUIVOS_ANALISADOS`, e dentro de
 * `dc360/apps/api/src/` também), o que pega uma exclusão excessiva no
 * `.semgrepignore` ou numa seleção de arquivos.
 *
 * Duas baselines usam o mesmo mecanismo: `.semgrep/baseline.json` (regras próprias)
 * e `.semgrep/baseline-registro.json` (regras do registro, fixadas por SHA no
 * `sast.yml`), esta escolhida por `--baseline`.
 *
 * Erro de análise (arquivo que o Semgrep não conseguiu ler por inteiro) também
 * reprova quando está em `dc360/apps/api/src/` ou é de nível `error` (DV-16); fora
 * dessa pasta é listado como aviso. Ver `classificarErrosDeAnalise`.
 *
 * Uso (na raiz do repositório):
 *   node dc360/scripts/sast-baseline.mjs conferir saida-do-semgrep.json
 *   node dc360/scripts/sast-baseline.mjs propor   saida-do-semgrep.json
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hojeEmIso, problemasDaExcecao } from "./excecoes-de-seguranca.mjs";

export const CLASSES = ["falso-positivo", "aceito", "defeito"];
export const ARQUIVO_DA_BASELINE = ".semgrep/baseline.json";
export const ARQUIVO_DA_BASELINE_DO_REGISTRO = ".semgrep/baseline-registro.json";
/**
 * Piso de arquivos examinados (`paths.scanned` do Semgrep). A varredura das regras próprias
 * examinou 72 em 2026-10-24; o piso fica bem abaixo disso, só para pegar o colapso
 * (exclusão excessiva, seleção vazia), e sobe junto com o produto, nunca desce em silêncio.
 */
export const PISO_DE_ARQUIVOS_ANALISADOS = 30;
/** O mesmo piso, só para os arquivos de `dc360/apps/api/src/`, onde as regras próprias valem. */
export const PISO_NA_PASTA_DAS_REGRAS_PROPRIAS = 30;
/** Defeito real da baseline é tratado nesta etapa, nunca escondido. */
export const ETAPA_DOS_DEFEITOS = "V2-F25-E01";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** O id da regra sem o prefixo do caminho da configuração (`semgrep.regras.` etc.). */
export function idCurto(checkId) {
  return String(checkId).split(".").pop();
}

function limpar(texto) {
  return texto.trim().replace(/\s+/g, " ");
}

function primeiraLinha(achado, lerLinhas) {
  return limpar(lerLinhas(achado.path)?.[achado.start.line - 1] ?? "");
}

/**
 * O trecho inteiro do achado: as linhas de `start.line` a `end.line`, cada uma sem a
 * indentação e sem espaços repetidos, separadas por quebra de linha. Sem `end`, só a inicial.
 */
function trechoCompleto(achado, lerLinhas) {
  const linhas = lerLinhas(achado.path);
  const inicio = achado.start.line;
  const fim = Math.max(inicio, Number.isInteger(achado.end?.line) ? achado.end.line : inicio);
  const partes = [];
  for (let n = inicio; n <= fim; n++) partes.push(limpar(linhas?.[n - 1] ?? ""));
  return partes.join("\n");
}

/**
 * Transforma o JSON do Semgrep em achados com impressão digital estável.
 * `lerLinhas(caminho)` devolve as linhas do arquivo (ou undefined).
 * Achados repetidos (a mesma regra em dois pacotes) entram uma vez só.
 */
export function normalizarAchados(json, lerLinhas) {
  const vistos = new Set();
  const lista = [];
  for (const r of json.results ?? []) {
    const regra = idCurto(r.check_id);
    const chave = `${regra}|${r.path}|${r.start.line}|${r.start.col}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push({
      regra,
      arquivo: r.path,
      linha: r.start.line,
      severidade: r.extra?.severity ?? "INFO",
      trecho: primeiraLinha(r, lerLinhas),
      completo: trechoCompleto(r, lerLinhas),
    });
  }
  lista.sort((a, b) => a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha);

  const contagem = new Map();
  for (const a of lista) {
    const base = createHash("sha256").update(`${a.regra}\n${a.arquivo}\n${a.completo}`).digest("hex").slice(0, 24);
    const n = (contagem.get(base) ?? 0) + 1;
    contagem.set(base, n);
    a.id = `${base}#${n}`;
  }
  return lista;
}

/**
 * Separa os achados em novos (não estão na baseline), conhecidos e o que a
 * baseline lista mas o Semgrep já não encontra (obsoletas: aviso, a linha
 * pode ser tirada).
 */
export function compararComBaseline(achados, baseline) {
  const conhecidos = new Map((baseline.achados ?? []).map((e) => [e.id, e]));
  const novos = [];
  const casados = [];
  const vistos = new Set();
  for (const a of achados) {
    if (conhecidos.has(a.id)) { casados.push(a); vistos.add(a.id); } else novos.push(a);
  }
  const obsoletas = [...conhecidos.values()].filter((e) => !vistos.has(e.id));
  return { novos, casados, obsoletas };
}

/** Problemas da própria baseline: entrada sem triagem, classe inventada, motivo, dono ou prazo ruins. */
export function problemasDaBaseline(baseline, hoje) {
  const problemas = [];
  const ids = new Set();
  for (const e of baseline.achados ?? []) {
    const nome = `${e.regra ?? "?"} em ${e.arquivo ?? "?"}`;
    if (!e.id) problemas.push(`${nome}: falta o id`);
    else if (ids.has(e.id)) problemas.push(`${nome}: id repetido`);
    else ids.add(e.id);
    if (!CLASSES.includes(e.classe)) problemas.push(`${nome}: classe "${e.classe}" fora de ${CLASSES.join(", ")}`);
    if (e.classe === "defeito" && e.trabalho !== ETAPA_DOS_DEFEITOS) {
      problemas.push(`${nome}: defeito real precisa de "trabalho": "${ETAPA_DOS_DEFEITOS}"`);
    }
    for (const p of problemasDaExcecao(e, hoje)) problemas.push(`${nome}: ${p}`);
  }
  return problemas;
}

/** Onde as regras próprias valem (`paths.include` delas): arquivo sem análise aqui é um furo no portão. */
export const PASTA_DAS_REGRAS_PROPRIAS = "dc360/apps/api/src/";

/**
 * Separa os erros de análise do Semgrep (`errors` do JSON) em bloqueantes e avisos
 * (V2-F01-E05, DV-16). Um arquivo com erro de sintaxe, parse parcial ou tempo
 * esgotado sai como `level: "warn"` e o Semgrep termina com código 0, mas as regras
 * não rodaram nele (ou só em parte): o portão passava verde sem ter lido o arquivo.
 *
 * Bloqueia (1) qualquer erro de nível `error`; (2) QUALQUER erro, de qualquer nível
 * e tipo, em `dc360/apps/api/src/` (é onde as regras próprias valem); (3) erro sem
 * caminho, porque não dá para provar que está fora dessa pasta. Os demais, de
 * arquivo fora da pasta, são listados como aviso: nenhum erro de parse some.
 */
export function classificarErrosDeAnalise(erros) {
  const bloqueantes = [];
  const avisos = [];
  for (const e of erros ?? []) {
    const caminho = typeof e.path === "string" ? e.path.replace(/\\/g, "/").replace(/^\.\//, "") : "";
    const dentro = caminho !== "" && (caminho.startsWith(PASTA_DAS_REGRAS_PROPRIAS) || caminho.includes(`/${PASTA_DAS_REGRAS_PROPRIAS}`));
    const tipo = Array.isArray(e.type) ? String(e.type[0]) : String(e.type ?? "erro");
    const item = {
      nivel: String(e.level ?? "?"),
      tipo,
      caminho: caminho || "(sem caminho)",
      mensagem: String(e.message ?? "").split("\n")[0],
    };
    if (e.level === "error" || caminho === "" || dentro) bloqueantes.push(item);
    else avisos.push(item);
  }
  return { bloqueantes, avisos };
}

/**
 * Problemas de cobertura do JSON do Semgrep: `paths.scanned` ausente, vazio ou abaixo do piso.
 * Sem isso, "nenhum achado" também é o que sai de uma análise que não leu arquivo nenhum.
 */
export function problemasDeCobertura(json) {
  const lista = json?.paths?.scanned;
  if (!Array.isArray(lista)) {
    return ["o JSON do Semgrep não traz `paths.scanned`: não dá para provar que algum arquivo foi examinado"];
  }
  if (lista.length === 0) {
    return ["a análise não examinou nenhum arquivo (`paths.scanned` vazio): ausência de achado aqui não prova nada"];
  }
  const problemas = [];
  if (lista.length < PISO_DE_ARQUIVOS_ANALISADOS) {
    problemas.push(`só ${lista.length} arquivo(s) examinado(s), abaixo do piso de ${PISO_DE_ARQUIVOS_ANALISADOS}: exclusão excessiva ou seleção quebrada?`);
  }
  const naPasta = lista.filter((c) => {
    const caminho = String(c).replace(/\\/g, "/").replace(/^\.\//, "");
    return caminho.startsWith(PASTA_DAS_REGRAS_PROPRIAS) || caminho.includes(`/${PASTA_DAS_REGRAS_PROPRIAS}`);
  }).length;
  if (naPasta < PISO_NA_PASTA_DAS_REGRAS_PROPRIAS) {
    problemas.push(`só ${naPasta} arquivo(s) examinado(s) em ${PASTA_DAS_REGRAS_PROPRIAS}, abaixo do piso de ${PISO_NA_PASTA_DAS_REGRAS_PROPRIAS}: é onde as regras próprias valem`);
  }
  return problemas;
}

function lerLinhasDoDisco(caminho) {
  try { return readFileSync(join(RAIZ, caminho), "utf8").split(/\r?\n/); } catch { return undefined; }
}

export function lerBaseline(raiz = RAIZ, arquivo = ARQUIVO_DA_BASELINE) {
  return JSON.parse(readFileSync(join(raiz, arquivo), "utf8"));
}

const USO = "uso: node dc360/scripts/sast-baseline.mjs <conferir|propor> [--baseline <arquivo>] <saida-do-semgrep.json>";

function principal(argv) {
  const [modo, ...resto] = argv;
  let arquivoDaBaseline = ARQUIVO_DA_BASELINE;
  const posicionais = [];
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === "--baseline") {
      arquivoDaBaseline = resto[++i];
      if (!arquivoDaBaseline) { console.error(USO); return 2; }
    } else posicionais.push(resto[i]);
  }
  const [arquivoJson] = posicionais;
  if (!["conferir", "propor"].includes(modo) || !arquivoJson || posicionais.length !== 1) {
    console.error(USO);
    return 2;
  }
  const json = JSON.parse(readFileSync(arquivoJson, "utf8"));
  const semCobertura = problemasDeCobertura(json);
  if (semCobertura.length) {
    console.error("O Semgrep não provou que examinou o código; o portão reprova.");
    for (const p of semCobertura) console.error(`  - ${p}`);
    return 2;
  }
  const { bloqueantes, avisos: errosFora } = classificarErrosDeAnalise(json.errors);
  for (const e of errosFora) console.log(`  erro de análise fora de ${PASTA_DAS_REGRAS_PROPRIAS} (não reprova): [${e.nivel}] ${e.tipo} em ${e.caminho}`);
  if (bloqueantes.length) {
    console.error(`O Semgrep terminou com ${bloqueantes.length} erro(s) de análise que deixam arquivo sem leitura confiável; o portão reprova.`);
    for (const e of bloqueantes) console.error(`  - [${e.nivel}] ${e.tipo} em ${e.caminho}: ${e.mensagem}`);
    return 2;
  }
  const achados = normalizarAchados(json, lerLinhasDoDisco);

  if (modo === "propor") {
    const propostas = achados.map((a) => ({
      id: a.id, regra: a.regra, arquivo: a.arquivo, linha: a.linha, severidade: a.severidade,
      trecho: a.trecho, classe: "PENDENTE", motivo: "", dono: "", ate: "",
    }));
    console.log(JSON.stringify({ achados: propostas }, null, 2));
    return 0;
  }

  let baseline;
  try {
    baseline = lerBaseline(RAIZ, arquivoDaBaseline);
  } catch (erro) {
    console.error(`Não foi possível ler a baseline ${arquivoDaBaseline}: ${erro.message}`);
    return 2;
  }
  const hoje = hojeEmIso();
  console.log(`Baseline: ${arquivoDaBaseline}; ${json.paths.scanned.length} arquivo(s) examinado(s).`);
  const dela = problemasDaBaseline(baseline, hoje);
  const { novos, casados, obsoletas } = compararComBaseline(achados, baseline);
  const novosErro = novos.filter((a) => a.severidade === "ERROR");
  const novosAviso = novos.filter((a) => a.severidade !== "ERROR");

  console.log(`Semgrep: ${achados.length} achado(s); ${casados.length} na baseline triada; ${novos.length} novo(s).`);
  for (const a of novosAviso) console.log(`  aviso (não reprova): ${a.regra} em ${a.arquivo}:${a.linha} [${a.severidade}]`);
  for (const e of obsoletas) console.log(`  baseline obsoleta (pode sair): ${e.regra} em ${e.arquivo}`);
  for (const a of novosErro) console.error(`  NOVO ERROR: ${a.regra} em ${a.arquivo}:${a.linha}\n    ${a.trecho}`);
  for (const p of dela) console.error(`  baseline: ${p}`);

  if (novosErro.length || dela.length) {
    console.error(
      "Reprovado. Achado novo se corrige no código; se for falso positivo, entra na baseline com classe, "
      + "motivo, dono e prazo (ou recebe `nosemgrep` com motivo, dono e prazo). Ver dc360/README.md.",
    );
    return 1;
  }
  console.log("Aprovado: nenhum achado ERROR novo.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal(process.argv.slice(2)));
}
