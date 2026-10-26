/**
 * Conferência de licenças das dependências de PRODUÇÃO (V2-F01-E19).
 *
 * O problema: sem inventário nem conferência, uma dependência AGPL entraria na
 * imagem ou no binário de loja sem ninguém ver. Aqui cada componente que vai
 * para produção é lido do lockfile e comparado com `politica-de-licencas.json`.
 *
 * Por que o lockfile e não `node_modules`: o lockfile é o que a imagem e o
 * binário de loja instalam (`npm ci`), é o mesmo em qualquer máquina e não exige
 * instalar nada para conferir. O campo `license` dele vem do `package.json` de
 * cada pacote. Quando o pacote não declara (ou declara no formato antigo
 * `licenses`, que o lockfile não copia), a conferência o trata como SEM
 * LICENÇA: quem reprova ou aceita é uma exceção nomeada, nunca o silêncio.
 *
 * "Produção" = o que o GRAFO de execução alcança (`nosDeRuntimeDoLockfile`, o
 * mesmo cálculo do `auditar`, que segue só `dependencies`, `optionalDependencies`
 * e `peerDependencies` a partir da raiz e dos workspaces) MAIS tudo que o npm não
 * marca como `dev: true`. A marca sozinha não basta: um lockfile editado ou
 * corrompido pode marcar `dev: true` num pacote que a imagem instala, e ele
 * sumiria da conferência de licença (o `auditar` barra a marca inconsistente,
 * mas este conferidor roda sozinho). O `devOptional`
 * (necessário para desenvolvimento OU como opcional de produção) entra de
 * propósito: é o que `npm ci --omit=dev` ainda instala quando o opcional casa
 * com a plataforma. Os workspaces do próprio produto (sem prefixo
 * `node_modules/`) e os links entre eles não são dependência de terceiro.
 *
 * Duas árvores, dois lockfiles (como o `auditar`): a raiz do monorepo
 * (`package-lock.json`, "plataforma") e o aplicativo de campo
 * (`apps/campo/package-lock.json`, "campo").
 *
 * Expressões SPDX: `MIT OR Apache-2.0` passa se UMA alternativa passa (quem usa
 * escolhe a licença), `MIT AND Apache-2.0` só passa se as DUAS passam,
 * `GPL-2.0 WITH Classpath-exception-2.0` vale pela licença base. Id fora da
 * lista permitida e fora das proibidas é "não classificado".
 *
 * O CP-43 (a lista de permitidas e proibidas, decidida por Rafael com o
 * jurídico) ESTÁ ABERTO. Por isso a política carrega `decisao.status`:
 *
 *   "proposta"  a conferência AVISA: os achados saem na tela e como anotação do
 *               CI, e o código de saída é 0.
 *   "decidida"  a conferência REPROVA (código 1): licença proibida, componente
 *               sem licença, licença não classificada ou exceção vencida.
 *
 * O que reprova nos DOIS estados é defeito do próprio arquivo de política:
 * JSON ilegível, campo faltando, exceção sem motivo, dono ou prazo (a mesma
 * régua de `excecoes-de-seguranca.mjs`, prazo de no máximo um ano), exceção
 * vencida, exceção que não casa com componente nenhum ou que nem seria
 * necessária, e lockfile sem componente algum (verde por não ter lido nada).
 * Mudar de "proposta" para "decidida" exige quem decidiu e a data.
 *
 * Uso (na pasta dc360):
 *   node scripts/licencas.mjs
 * Opções (os testes usam): `--raiz=DIR`, `--politica=ARQUIVO`, `--hoje=AAAA-MM-DD`.
 * Saída: 0 em ordem (com ou sem aviso), 1 reprovou, 2 uso errado ou arquivo ilegível.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { nosDeRuntimeDoLockfile } from "./auditar-excecoes.mjs";
import { hojeEmIso, lerDataIso, problemasDaExcecao } from "./excecoes-de-seguranca.mjs";

export const RAIZ_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** As duas árvores de produção, na ordem em que aparecem no relatório. */
export const ARVORES = [
  { nome: "plataforma", lockfile: "package-lock.json" },
  { nome: "campo", lockfile: "apps/campo/package-lock.json" },
];

export const POLITICA_PADRAO = "politica-de-licencas.json";

export const VEREDITOS = ["permitida", "excecao", "proibida", "sem_licenca", "nao_classificada"];

// ---------------------------------------------------------------------------
// Leitura do lockfile
// ---------------------------------------------------------------------------

/** O `license` do lockfile vem como texto, ou (formato antigo) como objeto ou lista. */
export function normalizarLicenca(bruta) {
  if (typeof bruta === "string") return bruta.trim();
  if (
    bruta &&
    typeof bruta === "object" &&
    !Array.isArray(bruta) &&
    typeof bruta.type === "string"
  ) {
    return bruta.type.trim();
  }
  if (Array.isArray(bruta)) {
    const tipos = bruta.map((e) => normalizarLicenca(e)).filter(Boolean);
    return tipos.length ? `(${tipos.join(" OR ")})` : "";
  }
  return "";
}

/**
 * Componentes de produção de UM lockfile: `{ pacote, versao, licenca }`, sem
 * repetição de `pacote@versao` (o mesmo pacote em duas pastas conta uma vez).
 */
export function componentesDeProducao(lock) {
  if (!lock || typeof lock !== "object" || !lock.packages || typeof lock.packages !== "object") {
    throw new Error("lockfile sem o campo `packages` (só o formato 2 e 3 do npm é lido)");
  }
  // O grafo é a fonte de verdade do que a imagem instala (o mesmo cálculo do
  // `auditar`); a marca `dev: true` sozinha pode ser editada ou corrompida.
  const runtime = nosDeRuntimeDoLockfile(lock);
  const vistos = new Map();
  for (const [chave, v] of Object.entries(lock.packages)) {
    if (chave === "" || !v || typeof v !== "object") continue;
    if (v.link) continue;
    const posicao = chave.lastIndexOf("node_modules/");
    if (posicao < 0) continue; // workspace do próprio produto
    // Alcançado pelo grafo de execução: é produção, qualquer que seja a marca.
    // Fora do grafo, vale a marca (o `devOptional` entra de propósito).
    if (v.dev && !runtime.has(chave)) continue;
    const pacote =
      typeof v.name === "string" && v.name ? v.name : chave.slice(posicao + "node_modules/".length);
    const versao = typeof v.version === "string" ? v.version : "?";
    const id = `${pacote}@${versao}`;
    if (!vistos.has(id)) vistos.set(id, { pacote, versao, licenca: normalizarLicenca(v.license) });
  }
  return [...vistos.values()].sort((a, b) => (a.pacote + a.versao < b.pacote + b.versao ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Expressões SPDX
// ---------------------------------------------------------------------------

/** Quebra a expressão em ids, operadores e parênteses. */
function simbolos(texto) {
  return texto.replace(/\(/g, " ( ").replace(/\)/g, " ) ").split(/\s+/).filter(Boolean);
}

/**
 * Árvore da expressão: `{ tipo: "id", id }`, `{ tipo: "ou" | "e", itens }`.
 * Devolve `null` quando a expressão não é SPDX legível (parêntese solto,
 * operador sobrando, "MIT/X11"), e o chamador a trata como não classificada.
 */
export function lerExpressao(texto) {
  const tokens = simbolos(texto);
  let i = 0;
  const OPERADOR = /^(AND|OR|WITH)$/i;

  const ler_ou = () => {
    const itens = [ler_e()];
    while (i < tokens.length && /^OR$/i.test(tokens[i])) {
      i++;
      itens.push(ler_e());
    }
    return itens.length === 1 ? itens[0] : { tipo: "ou", itens };
  };
  const ler_e = () => {
    const itens = [ler_atomo()];
    while (i < tokens.length && /^AND$/i.test(tokens[i])) {
      i++;
      itens.push(ler_atomo());
    }
    return itens.length === 1 ? itens[0] : { tipo: "e", itens };
  };
  const ler_atomo = () => {
    const t = tokens[i];
    if (t === undefined) throw new Error("expressão termina antes da hora");
    if (t === "(") {
      i++;
      const dentro = ler_ou();
      if (tokens[i] !== ")") throw new Error("parêntese sem fechar");
      i++;
      return dentro;
    }
    if (t === ")" || OPERADOR.test(t)) throw new Error(`símbolo fora do lugar: ${t}`);
    i++;
    // `ID WITH exceção`: a exceção não muda a família, só a restringe. Vale pela base.
    if (i < tokens.length && /^WITH$/i.test(tokens[i])) {
      i++;
      if (
        tokens[i] === undefined ||
        tokens[i] === "(" ||
        tokens[i] === ")" ||
        OPERADOR.test(tokens[i])
      ) {
        throw new Error("WITH sem a exceção");
      }
      i++;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(t)) throw new Error(`id inválido: ${t}`);
    return { tipo: "id", id: t };
  };

  try {
    if (tokens.length === 0) return null;
    const arvore = ler_ou();
    if (i !== tokens.length) return null;
    return arvore;
  } catch {
    return null;
  }
}

/** `GPL-2.0+` e `GPL-2.0-only` ficam com a mesma família: tira o `+` final. */
const semMais = (id) => id.replace(/\+$/, "");

const MARCADORES_DE_AUSENCIA =
  /^(UNLICENSED|NONE|NOASSERTION|SEE LICENSE IN\b.*|SEE LICENCE IN\b.*)$/i;

/** Cada id é permitido (igualdade, sem caixa), proibido (família `GPL` casa `GPL-3.0` e `GPL-2.0+`) ou neutro. */
export function classificarId(id, politica) {
  const base = semMais(id).toLowerCase();
  if (politica.permitidas.some((p) => p.toLowerCase() === base)) return "permitida";
  for (const familia of politica.proibidas) {
    const f = familia.toLowerCase();
    if (base === f || base.startsWith(`${f}-`)) return "proibida";
  }
  return "nao_classificada";
}

const ORDEM = { permitida: 0, nao_classificada: 1, proibida: 2 };

/** Veredito de uma árvore: OU escolhe a melhor alternativa, E fica com a pior. */
function avaliarArvore(no, politica) {
  if (no.tipo === "id") return classificarId(no.id, politica);
  const itens = no.itens.map((n) => avaliarArvore(n, politica));
  const escolher = no.tipo === "ou" ? Math.min : Math.max;
  const nivel = escolher(...itens.map((v) => ORDEM[v]));
  return Object.keys(ORDEM).find((k) => ORDEM[k] === nivel);
}

/** Veredito do TEXTO da licença: permitida, proibida, sem_licenca ou nao_classificada. */
export function avaliarLicenca(texto, politica) {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (t === "" || MARCADORES_DE_AUSENCIA.test(t)) return "sem_licenca";
  const arvore = lerExpressao(t);
  if (arvore === null) return "nao_classificada";
  return avaliarArvore(arvore, politica);
}

// ---------------------------------------------------------------------------
// Política
// ---------------------------------------------------------------------------

/** Defeitos do arquivo de política em si. Lista vazia = bem formado. Reprovam nos dois estados. */
export function problemasDaPolitica(politica, hoje) {
  const p = [];
  if (!politica || typeof politica !== "object" || Array.isArray(politica))
    return ["a política não é um objeto JSON"];

  const decisao = politica.decisao;
  if (!decisao || typeof decisao !== "object") {
    p.push("falta `decisao` (checkpoint e status)");
  } else {
    if (decisao.checkpoint !== "CP-43") p.push('`decisao.checkpoint` tem de ser "CP-43"');
    if (decisao.status !== "proposta" && decisao.status !== "decidida") {
      p.push('`decisao.status` tem de ser "proposta" (só avisa) ou "decidida" (reprova)');
    }
    if (decisao.status === "decidida") {
      if (typeof decisao.decidida_por !== "string" || decisao.decidida_por.trim().length < 2) {
        p.push("política decidida sem `decisao.decidida_por`");
      }
      if (lerDataIso(decisao.decidida_em) === null)
        p.push("política decidida sem `decisao.decidida_em` (AAAA-MM-DD)");
    }
  }

  for (const campo of ["permitidas", "proibidas"]) {
    const lista = politica[campo];
    if (
      !Array.isArray(lista) ||
      lista.length === 0 ||
      lista.some((x) => typeof x !== "string" || !x.trim())
    ) {
      p.push(`\`${campo}\` tem de ser uma lista de ids SPDX, não vazia`);
      continue;
    }
    const minusculas = lista.map((x) => x.trim().toLowerCase());
    if (new Set(minusculas).size !== minusculas.length) p.push(`\`${campo}\` tem id repetido`);
  }
  if (Array.isArray(politica.permitidas) && Array.isArray(politica.proibidas)) {
    const prob = politica.proibidas.map((f) => String(f).toLowerCase());
    for (const id of politica.permitidas) {
      const b = semMais(String(id)).toLowerCase();
      if (prob.some((f) => b === f || b.startsWith(`${f}-`)))
        p.push(`\`${id}\` está em permitidas e cai numa família proibida`);
    }
  }

  if (!Array.isArray(politica.excecoes)) {
    p.push("`excecoes` tem de ser uma lista (vazia se não houver)");
  } else {
    const chaves = new Set();
    politica.excecoes.forEach((e, i) => {
      const nome = e && typeof e === "object" ? `${e.pacote}@${e.versao}` : `#${i + 1}`;
      if (
        !e ||
        typeof e !== "object" ||
        typeof e.pacote !== "string" ||
        !e.pacote ||
        typeof e.versao !== "string" ||
        !e.versao
      ) {
        p.push(`exceção ${nome}: precisa de \`pacote\` e \`versao\` exata`);
        return;
      }
      if (chaves.has(nome)) p.push(`exceção ${nome} repetida`);
      chaves.add(nome);
      for (const problema of problemasDaExcecao(e, hoje)) p.push(`exceção ${nome}: ${problema}`);
    });
  }
  return p;
}

// ---------------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------------

/**
 * Confere os componentes de cada árvore contra a política.
 *
 * `arvores`: `[{ nome, componentes }]`. Devolve
 *   - `defeitos`: defeitos do arquivo de política e da leitura (sempre reprovam);
 *   - `achados`: componentes fora da política `{ arvore, pacote, versao, licenca, veredito }`
 *     (reprovam só com a política "decidida");
 *   - `contagem`: por árvore, quantos componentes e quantos por veredito;
 *   - `reprova` e `modo` ("avisa" | "reprova").
 */
export function conferir(arvores, politica, hoje) {
  const defeitos = problemasDaPolitica(politica, hoje);
  const listaDeTextos = (x) => Array.isArray(x) && x.every((t) => typeof t === "string");
  if (
    defeitos.length > 0 &&
    (!politica || !listaDeTextos(politica.permitidas) || !listaDeTextos(politica.proibidas))
  ) {
    return { defeitos, achados: [], contagem: {}, reprova: true, modo: "avisa" };
  }

  const modo = politica.decisao?.status === "decidida" ? "reprova" : "avisa";
  const excecoes = new Map();
  for (const e of Array.isArray(politica.excecoes) ? politica.excecoes : []) {
    if (e && typeof e.pacote === "string") excecoes.set(`${e.pacote}@${e.versao}`, e);
  }
  const usadas = new Set();
  const achados = [];
  const contagem = {};

  for (const { nome, componentes } of arvores) {
    contagem[nome] = { total: componentes.length };
    for (const v of VEREDITOS) contagem[nome][v] = 0;
    if (componentes.length === 0) {
      defeitos.push(
        `${nome}: nenhum componente de produção lido (lockfile vazio ou de formato inesperado)`,
      );
    }
    for (const c of componentes) {
      const id = `${c.pacote}@${c.versao}`;
      const veredito = avaliarLicenca(c.licenca, politica);
      const excecao = excecoes.get(id);
      if (veredito === "permitida") {
        contagem[nome].permitida++;
        if (excecao)
          defeitos.push(
            `exceção ${id}: desnecessária, a licença ${c.licenca} já é permitida (apague a exceção)`,
          );
        if (excecao) usadas.add(id);
        continue;
      }
      if (excecao) {
        usadas.add(id);
        // Exceção vencida ou malformada já virou defeito acima; aqui ela só deixa de valer.
        if (problemasDaExcecao(excecao, hoje).length === 0) {
          contagem[nome].excecao++;
          continue;
        }
      }
      contagem[nome][veredito]++;
      achados.push({
        arvore: nome,
        pacote: c.pacote,
        versao: c.versao,
        licenca: c.licenca,
        veredito,
      });
    }
  }

  for (const id of excecoes.keys()) {
    if (!usadas.has(id))
      defeitos.push(
        `exceção ${id}: não casa com nenhum componente de produção (a dependência saiu ou mudou de versão; apague ou atualize)`,
      );
  }

  return {
    defeitos,
    achados,
    contagem,
    modo,
    reprova: defeitos.length > 0 || (modo === "reprova" && achados.length > 0),
  };
}

const ROTULO = {
  proibida: "licença PROIBIDA",
  sem_licenca: "SEM licença declarada",
  nao_classificada: "licença fora da lista (nem permitida nem proibida)",
};

/** Texto para a tela e para o artefato do CI. */
export function relatorio(resultado) {
  const linhas = [];
  for (const [nome, c] of Object.entries(resultado.contagem)) {
    linhas.push(
      `${nome}: ${c.total} componentes de produção; ${c.permitida} permitidos, ${c.excecao} por exceção nomeada, ` +
        `${c.proibida} proibidos, ${c.sem_licenca} sem licença, ${c.nao_classificada} fora da lista`,
    );
  }
  for (const d of resultado.defeitos) linhas.push(`DEFEITO: ${d}`);

  // Agrupa por licença, que é como o jurídico lê a lista.
  const porLicenca = new Map();
  for (const a of resultado.achados) {
    const chave = `${ROTULO[a.veredito]}: ${a.licenca || "(vazia)"}`;
    if (!porLicenca.has(chave)) porLicenca.set(chave, []);
    porLicenca.get(chave).push(`${a.pacote}@${a.versao} (${a.arvore})`);
  }
  const rotulo = resultado.modo === "reprova" ? "REPROVA" : "AVISO (CP-43 em aberto)";
  for (const [chave, itens] of [...porLicenca.entries()].sort()) {
    linhas.push(`${rotulo}, ${chave}, ${itens.length} componente(s): ${itens.join(", ")}`);
  }

  if (resultado.reprova) {
    linhas.push(
      resultado.defeitos.length > 0
        ? "RESULTADO: reprovado (defeito na política ou na leitura, vale nos dois estados)."
        : "RESULTADO: reprovado (política decidida e há componente fora dela).",
    );
  } else if (resultado.achados.length > 0) {
    linhas.push(
      `RESULTADO: em ordem, com ${resultado.achados.length} aviso(s). A política é uma PROPOSTA (CP-43 aberto): ` +
        'ela só passa a reprovar quando `decisao.status` for "decidida".',
    );
  } else {
    linhas.push(
      "RESULTADO: em ordem, todos os componentes de produção estão na lista permitida (ou por exceção nomeada).",
    );
  }
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------

function lerJson(caminho, descricao) {
  if (!existsSync(caminho)) throw new Error(`${descricao} não existe: ${caminho}`);
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch (erro) {
    throw new Error(`${descricao} não é JSON válido (${caminho}): ${erro.message}`);
  }
}

/** Executa tudo e devolve `{ codigo, texto }`. Separado do `process.exit` para os testes. */
export function executar({ raiz = RAIZ_PADRAO, politica = null, hoje = hojeEmIso() } = {}) {
  let pol;
  const arvores = [];
  try {
    pol = lerJson(politica ?? join(raiz, POLITICA_PADRAO), "a política de licenças");
    for (const { nome, lockfile } of ARVORES) {
      arvores.push({
        nome,
        componentes: componentesDeProducao(lerJson(join(raiz, lockfile), `o lockfile (${nome})`)),
      });
    }
  } catch (erro) {
    return { codigo: 2, texto: `licencas: ${erro.message}` };
  }
  const resultado = conferir(arvores, pol, hoje);
  return { codigo: resultado.reprova ? 1 : 0, texto: relatorio(resultado), resultado };
}

function principal(argv) {
  const opcoes = {};
  for (const a of argv) {
    const m = /^--(raiz|politica|hoje)=(.+)$/.exec(a);
    if (!m) {
      console.error(
        "uso: node scripts/licencas.mjs [--raiz=DIR] [--politica=ARQUIVO] [--hoje=AAAA-MM-DD]",
      );
      return 2;
    }
    opcoes[m[1]] = m[1] === "hoje" ? m[2] : resolve(m[2]);
  }
  if (opcoes.hoje !== undefined && lerDataIso(opcoes.hoje) === null) {
    console.error("licencas: --hoje precisa ser AAAA-MM-DD");
    return 2;
  }
  const { codigo, texto, resultado } = executar(opcoes);
  console.log(texto);
  // Anotação do GitHub Actions: o aviso aparece no resumo do run, sem reprovar.
  if (
    process.env.GITHUB_ACTIONS === "true" &&
    resultado &&
    resultado.modo === "avisa" &&
    resultado.achados.length > 0
  ) {
    console.log(
      `::warning title=Licencas (CP-43 em aberto)::${resultado.achados.length} componente(s) de producao fora da lista permitida; a politica e uma proposta e ainda nao reprova. Detalhe no passo do job.`,
    );
  }
  return codigo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2));
}
