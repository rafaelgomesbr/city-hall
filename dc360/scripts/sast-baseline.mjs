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
 * Impressão digital do achado: regra + arquivo + a PRIMEIRA linha do trecho
 * (sem espaços repetidos) + ordem entre achados iguais. Número de linha fica
 * de fora de propósito: inserir código acima não pode transformar achado triado
 * em achado novo. Editar a primeira linha do trecho, sim: a consulta mudou e
 * alguém precisa olhar de novo. O Semgrep CE não entrega a impressão própria
 * (`fingerprint` vem como "requires login"), por isso ela é calculada aqui.
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
/** Defeito real da baseline é tratado nesta etapa, nunca escondido. */
export const ETAPA_DOS_DEFEITOS = "V2-F25-E01";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** O id da regra sem o prefixo do caminho da configuração (`semgrep.regras.` etc.). */
export function idCurto(checkId) {
  return String(checkId).split(".").pop();
}

function primeiraLinha(achado, lerLinhas) {
  const linhas = lerLinhas(achado.path);
  const texto = linhas?.[achado.start.line - 1] ?? "";
  return texto.trim().replace(/\s+/g, " ");
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
    });
  }
  lista.sort((a, b) => a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha);

  const contagem = new Map();
  for (const a of lista) {
    const base = createHash("sha256").update(`${a.regra}\n${a.arquivo}\n${a.trecho}`).digest("hex").slice(0, 24);
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

function lerLinhasDoDisco(caminho) {
  try { return readFileSync(join(RAIZ, caminho), "utf8").split(/\r?\n/); } catch { return undefined; }
}

export function lerBaseline(raiz = RAIZ) {
  return JSON.parse(readFileSync(join(raiz, ARQUIVO_DA_BASELINE), "utf8"));
}

function principal(argv) {
  const [modo, arquivoJson] = argv;
  if (!["conferir", "propor"].includes(modo) || !arquivoJson) {
    console.error("uso: node dc360/scripts/sast-baseline.mjs <conferir|propor> <saida-do-semgrep.json>");
    return 2;
  }
  const json = JSON.parse(readFileSync(arquivoJson, "utf8"));
  const erros = (json.errors ?? []).filter((e) => e.level === "error");
  if (erros.length) {
    console.error(`O Semgrep terminou com ${erros.length} erro(s) de análise; sem leitura confiável, o portão reprova.`);
    for (const e of erros) console.error(`  - ${String(e.message).split("\n")[0]}`);
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

  const baseline = lerBaseline();
  const hoje = hojeEmIso();
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
