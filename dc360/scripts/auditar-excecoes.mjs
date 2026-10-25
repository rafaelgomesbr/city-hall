/**
 * A lista nomeada de exceções do aplicativo de campo (CP-03), a regra que a
 * valida e as regras puras do portão (casar advisory por id, provar que houve
 * consulta de verdade). Fica fora de `auditar.mjs` porque aquele arquivo roda o
 * portão assim que é importado, e o teste precisa chamar estas funções sozinhas,
 * com datas, listas e relatórios sintéticos.
 */

/**
 * Advisories do aplicativo de campo que hoje NÃO dá para fechar, com o motivo.
 *
 * Nenhuma delas vem de dependência escolhida por este projeto: chegam por
 * dentro do Expo, e `npm audit fix --force` quebraria a compilação nativa.
 * A lista tem nome e razão de propósito, para envelhecer em público.
 *
 * `js-yaml` (por `@expo/xcpretty`) esteve aqui até 15/09/2026 com a razão
 * "sai quando o Expo atualizar", e a razão era falsa: o `npm audit` já dizia
 * `fixAvailable: true`, e um `npm audit fix` a fechou. É o caso que fez este
 * portão passar a reprovar aceita com correção disponível (ver abaixo).
 */
/*
  Cada exceção tem `advisories`, `motivo`, `dono` e `ate` (AAAA-MM-DD).

  `advisories` mapeia cada id GHSA aceito NAQUELE pacote (vale também a URL da
  advisory, que o portão reduz ao id) para a gravidade com que foi aceito. Até
  2026-10-20 a exceção casava pelo nome do pacote, e uma advisory nova e crítica
  em `node-forge` passava como "aceita" porque o pacote já estava na lista
  (validação da rodada 6). Aceitar um risco é aceitar AQUELE risco, com AQUELA
  gravidade: advisory nova no mesmo pacote reprova, e advisory aceita que muda de
  gravidade também, até alguém ler, decidir e atualizar a linha.

  A lista também é prova: cada advisory aceita TEM de voltar na própria auditoria
  do aplicativo. Se uma some, ou a auditoria não é confiável (proxy ou espelho
  que forja a resposta) ou a lista está velha; nos dois casos o portão sai 2. Vencido o prazo, o
  portão reprova até alguém reavaliar. `comCorrecao: true` só vale para o caso em
  que o `npm audit` diz `fixAvailable: true` mas a correção é inaplicável (ver
  CP-03, decidido por Rafael em 2026-10-07): o `npm audit fix` em apps/campo
  reembaralha a árvore inteira do Expo e mistura pacotes do SDK 57 e do 58.
*/
const DONO = "Rafael";
const PRAZO = "2027-01-05";
const FERRAMENTA_DO_EXPO = "Chega por dentro do pacote `expo` (ferramenta de "
  + "build e de desenvolvimento, que roda na máquina de quem compila) e NÃO entra "
  + "no pacote JavaScript que vai para o telefone do agente. ";
const SEM_FIX_SEGURO = "O `npm audit fix` em apps/campo não é aplicável: "
  + "reembaralha a árvore do Expo e mistura pacotes do SDK 57 e 58. A saída é "
  + "subir o SDK do Expo por inteiro, o que exige novo binário nativo. ";

export const ACEITAS_NO_APLICATIVO = {
  "decode-uri-component": {
    advisories: { "GHSA-vcc3-ghjq-m6fr": "moderate" },
    motivo: "Chega por expo-router > query-string, e esta vai "
      + "junto com o aplicativo. O ataque é negação de serviço por percentual mal "
      + "formado numa URL, e a única URL que o aplicativo analisa é o próprio link "
      + "profundo dele. Sem correção acima sem trocar o expo-router.",
    dono: DONO, ate: PRAZO,
  },
  "brace-expansion": {
    advisories: { "GHSA-q2hr-2g5m-vwhr": "moderate", "GHSA-qhr7-859c-m2p7": "high", "GHSA-6j4f-fj2g-mc7p": "high" },
    motivo: FERRAMENTA_DO_EXPO + "Três avisos de negação de serviço na expansão de "
      + "glob (padrão `{a},b}` e recursão em chaves aninhadas), e o aplicativo não "
      + "expande glob em execução. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO, comCorrecao: true,
  },
  "node-forge": {
    advisories: { "GHSA-86w9-cpqp-85rv": "high" },
    motivo: FERRAMENTA_DO_EXPO + "Vem de @expo/code-signing-certificates, usado "
      + "para assinar atualização do EAS na máquina de build, não no telefone. "
      + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO,
  },
  "shell-quote": {
    advisories: { "GHSA-pqg4-j6r4-53mv": "critical" },
    motivo: FERRAMENTA_DO_EXPO + "Vem de react-devtools-core, só no modo de "
      + "desenvolvimento. Injeção de comando exige que o desenvolvedor passe "
      + "entrada hostil ao `quote()` local. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO, comCorrecao: true,
  },
  /*
    O `zod` DO PRODUTO subiu para a linha 4 (correção 10 da E19) e não é
    aceito aqui: esta exceção cobre SÓ a cópia da linha 3 que o `@expo/cli`
    carrega por dentro (`^3.25.76`, inclusive na versão mais nova do CLI), e por
    isso vale apenas para o caminho `node_modules/expo/node_modules/`. Se o
    `zod` de nível superior do aplicativo (o de `@dc360/shared`) voltar a uma
    versão vulnerável, o caminho é outro e o portão reprova.
  */
  zod: {
    advisories: { "GHSA-mrhx-c7xc-m3w5": "high" },
    somenteEm: ["node_modules/expo/node_modules/"],
    motivo: FERRAMENTA_DO_EXPO + "É a cópia do `zod` 3 que o `@expo/cli` usa na máquina de "
      + "build; a falha é consumo de memória ao validar coleções enormes de entrada "
      + "hostil, e o telefone não carrega o CLI. O `@expo/cli` pede `zod@^3.25.76` mesmo na versão mais nova (58.1.15), então não há "
      + "correção pela árvore. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO,
  },
};

/**
 * Advisories de FERRAMENTA DE DESENVOLVIMENTO da raiz (o programa que roda os
 * testes). Ficam só na máquina de quem desenvolve e nunca vão para a imagem.
 * Não reprovam o portão, mas desde 2026-10-13 (D3, Q5, decidida por Rafael)
 * têm dono e prazo como as do aplicativo: corrigir pede subir o `vitest` para a
 * versão 5, mudança grande que mexe em todas as suítes e entra como etapa
 * planejada, não como conserto agora. Quando o `vitest` subir, o teste reclama
 * de excesso e alguém apaga a linha.
 */
const FERRAMENTA_DE_TESTE = "Chega por dentro do `vitest` (o programa que roda os testes da raiz), "
  + "só na máquina de desenvolvimento e no CI, e NÃO entra na imagem do servidor nem no telefone. "
  + "Corrigir pede subir o `vitest` para a versão 5, que mexe em todas as suítes. ";

export const ACEITAS_EM_DESENVOLVIMENTO = {
  vitest: {
    motivo: FERRAMENTA_DE_TESTE + "Aviso do próprio pacote.",
    dono: DONO, ate: PRAZO,
  },
  "@vitest/mocker": {
    motivo: FERRAMENTA_DE_TESTE + "Aviso de gravidade moderada no módulo de dublês de teste.",
    dono: DONO, ate: PRAZO,
  },
  tinypool: {
    motivo: FERRAMENTA_DE_TESTE + "Dois avisos de execução de código no processo de teste, que só roda "
      + "código escrito por este projeto.",
    dono: DONO, ate: PRAZO,
  },
};

/**
 * A política do CP-03 diz que exceção é NOMEADA, com dono e prazo. Esta função é
 * o que faz a lista cumprir isso, em vez de a regra viver só num comentário.
 *
 * Devolve uma frase por defeito (vazio = lista válida), olhando TODAS as
 * entradas e não só as que aparecem no relatório de hoje: exceção malformada que
 * ainda não foi usada é o defeito que explode no dia em que o pacote aparecer.
 *
 * O prazo exige AAAA-MM-DD que exista no calendário. Sem isso `undefined < hoje`
 * e `"amanhã" < hoje` são falsos, e a exceção ficaria eterna sem ninguém ver.
 * Vale até o fim do dia escrito, no fuso de São Paulo (`hojeEmSaoPaulo`): vence
 * quando `ate < hoje`.
 *
 * Com `exigirAdvisories` (a lista do aplicativo), cada exceção precisa nomear as
 * advisories que aceita, por id GHSA ou URL, cada uma com a gravidade aceita: sem
 * isso o portão voltaria a aceitar pelo nome do pacote.
 *
 * @param {Record<string, {advisories?: unknown, motivo?: unknown, dono?: unknown, ate?: unknown}>} aceitas
 * @param {string} hoje AAAA-MM-DD
 * @param {{ exigirAdvisories?: boolean }} [opcoes]
 * @returns {string[]}
 */
export function problemasDasExcecoes(aceitas, hoje, { exigirAdvisories = false } = {}) {
  const problemas = [];
  const preenchido = (v) => typeof v === "string" && v.trim() !== "";
  for (const [nome, e] of Object.entries(aceitas)) {
    if (exigirAdvisories) {
      const lista = e?.advisories;
      if (lista === null || typeof lista !== "object" || Array.isArray(lista) || Object.keys(lista).length === 0) {
        problemas.push(`${nome}: exceção sem a lista \`advisories\` (o id GHSA ou a URL de cada advisory aceita, com a gravidade)`);
      } else {
        for (const [a, gravidade] of Object.entries(lista)) {
          if (!idDaAdvisory(a)?.startsWith("GHSA-")) {
            problemas.push(`${nome}: advisory inválida ${JSON.stringify(a)} (esperado o id GHSA-xxxx-xxxx-xxxx ou a URL dela)`);
          }
          if (!GRAVIDADES.includes(gravidade)) {
            problemas.push(`${nome}: gravidade aceita inválida ${JSON.stringify(gravidade)} para ${a} (esperado ${GRAVIDADES.join(", ")})`);
          }
        }
      }
    }
    if (e?.somenteEm !== undefined) {
      const caminhos = e.somenteEm;
      if (!Array.isArray(caminhos) || caminhos.length === 0
        || caminhos.some((c) => typeof c !== "string" || !c.startsWith("node_modules/") || !c.endsWith("/"))) {
        problemas.push(`${nome}: \`somenteEm\` inválido (esperado uma lista de prefixos "node_modules/.../" com barra no fim)`);
      }
    }
    if (!preenchido(e?.motivo)) problemas.push(`${nome}: exceção sem motivo escrito`);
    if (!preenchido(e?.dono)) problemas.push(`${nome}: exceção sem dono`);
    if (e?.ate === undefined || e?.ate === null || e?.ate === "") {
      problemas.push(`${nome}: exceção sem prazo (\`ate\`, AAAA-MM-DD)`);
    } else if (!dataValida(e.ate)) {
      problemas.push(`${nome}: prazo inválido ${JSON.stringify(e.ate)} (esperado AAAA-MM-DD, uma data que exista)`);
    } else if (e.ate < hoje) {
      problemas.push(`${nome}: a exceção venceu em ${e.ate}`);
    }
  }
  return problemas;
}

function dataValida(texto) {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/* ---------- Casar a exceção pela advisory, e não pelo nome do pacote ---------- */

const GHSA = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

/**
 * O id de uma advisory: o GHSA tirado da URL (ou do texto, se a lista trouxer o
 * id puro), normalizado para `GHSA-xxxx-xxxx-xxxx`. O `npm audit` repete o mesmo
 * GHSA com `source` diferente para cada faixa de versão, então o GHSA é o que
 * identifica o risco. Advisory sem GHSA cai no número do npm (`npm:123`), que
 * nunca casa com a lista e por isso reprova.
 *
 * @param {unknown} origem um objeto de `via` do `npm audit --json`, ou um texto da lista
 * @returns {string | null}
 */
export function idDaAdvisory(origem) {
  const texto = typeof origem === "string" ? origem : String(origem?.url ?? "");
  const m = GHSA.exec(texto);
  if (m) return `GHSA${m[0].slice(4).toLowerCase()}`;
  if (origem && typeof origem === "object" && origem.source !== undefined) return `npm:${origem.source}`;
  return null;
}

/** As advisories PRÓPRIAS de uma entrada do relatório (objetos em `via`; texto é só arrasto). */
export function advisoriesProprias(entrada) {
  return (entrada?.via ?? []).filter((origem) => origem !== null && typeof origem === "object");
}

/**
 * Toda advisory própria do relatório que a lista NÃO aceita, uma por par
 * (pacote, id). Pacote fora da lista reprova; pacote na lista com advisory que
 * não está em `advisories` também.
 *
 * @param {Record<string, {via?: unknown[]}>} vulnerabilidades o `vulnerabilities` do relatório
 * @param {Record<string, {advisories?: Record<string, string>}>} aceitas
 * @returns {{pacote: string, id: string, gravidade: string, titulo: string}[]}
 */
export function advisoriesNaoAceitas(vulnerabilidades, aceitas) {
  const novas = new Map();
  for (const [pacote, entrada] of Object.entries(vulnerabilidades ?? {})) {
    /* Exceção com `somenteEm` vale só para as cópias naquele caminho: se o
       pacote também aparece em outro lugar (a cópia do próprio projeto), nada
       dele é aceito, e a advisory sai como nova. */
    const aceitasDoPacote = foraDoCaminho(aceitas, pacote, entrada)
      ? new Set() : new Set(aceitasDe(aceitas, pacote).keys());
    for (const origem of advisoriesProprias(entrada)) {
      const id = idDaAdvisory(origem) ?? "(sem id)";
      if (aceitasDoPacote.has(id) || novas.has(`${pacote} ${id}`)) continue;
      novas.set(`${pacote} ${id}`, {
        pacote, id, gravidade: String(origem.severity ?? "?"), titulo: String(origem.title ?? "").slice(0, 120),
      });
    }
  }
  return [...novas.values()];
}

/**
 * Verdade quando a exceção do pacote tem `somenteEm` e alguma cópia vulnerável
 * (`nodes` da entrada do relatório) está FORA desses prefixos. Sem `nodes` no
 * relatório, não há como provar o caminho, e a exceção não vale.
 */
function foraDoCaminho(aceitas, pacote, entrada) {
  if (!Object.hasOwn(aceitas, pacote)) return false;
  const prefixos = aceitas[pacote].somenteEm;
  if (prefixos === undefined) return false;
  const nos = Array.isArray(entrada?.nodes) ? entrada.nodes : [];
  if (nos.length === 0) return true;
  return nos.some((no) => !prefixos.some((prefixo) => String(no).startsWith(prefixo)));
}

/** As gravidades do `npm audit`, da menor para a maior. */
export const GRAVIDADES = Object.freeze(["info", "low", "moderate", "high", "critical"]);

/** Mapa id GHSA normalizado para a gravidade aceita, das exceções de um pacote. */
function aceitasDe(aceitas, pacote) {
  const lista = Object.hasOwn(aceitas, pacote) ? aceitas[pacote].advisories ?? {} : {};
  return new Map(Object.entries(lista).map(([a, g]) => [idDaAdvisory(a), g]).filter(([id]) => id));
}

/**
 * A gravidade de cada par (pacote, id) no relatório. O mesmo GHSA aparece uma vez
 * por faixa de versão; vale a maior gravidade entre elas.
 *
 * @returns {Map<string, string>} chave `pacote id`
 */
function gravidadesNoRelatorio(vulnerabilidades) {
  const mapa = new Map();
  for (const [pacote, entrada] of Object.entries(vulnerabilidades ?? {})) {
    for (const origem of advisoriesProprias(entrada)) {
      const chave = `${pacote} ${idDaAdvisory(origem) ?? "(sem id)"}`;
      const g = String(origem.severity ?? "");
      if (!mapa.has(chave) || GRAVIDADES.indexOf(g) > GRAVIDADES.indexOf(mapa.get(chave))) mapa.set(chave, g);
    }
  }
  return mapa;
}

/**
 * Advisory aceita que voltou com outra gravidade. A aceitação foi daquela
 * gravidade: subiu (ou desceu), alguém decide de novo.
 *
 * @returns {{pacote: string, id: string, aceita: string, agora: string}[]}
 */
export function mudancasDeGravidade(vulnerabilidades, aceitas) {
  const mudancas = [];
  for (const [chave, agora] of gravidadesNoRelatorio(vulnerabilidades)) {
    const [pacote, id] = chave.split(" ");
    const aceita = aceitasDe(aceitas, pacote).get(id);
    if (aceita !== undefined && aceita !== agora) mudancas.push({ pacote, id, aceita, agora });
  }
  return mudancas;
}

/**
 * Advisories aceitas que NÃO voltaram no relatório (`pacote id`). É a prova
 * dentro da própria consulta: um proxy ou espelho que responde `{}`, ou que
 * repassa só a consulta de controle, apaga também as aceitas, e isso aparece aqui.
 */
export function aceitasAusentes(vulnerabilidades, aceitas) {
  const vistas = gravidadesNoRelatorio(vulnerabilidades);
  return Object.keys(aceitas).flatMap((pacote) => [...aceitasDe(aceitas, pacote).keys()]
    .filter((id) => !vistas.has(`${pacote} ${id}`))
    .map((id) => `${pacote} ${id}`));
}

/** Pacotes aceitos em desenvolvimento que não voltaram com advisory própria no relatório completo. */
export function pacotesAceitosAusentes(vulnerabilidades, aceitas) {
  return Object.keys(aceitas).filter((nome) => advisoriesProprias(vulnerabilidades?.[nome]).length === 0);
}

/**
 * Os pacotes vulneráveis do relatório COMPLETO que não são só de desenvolvimento,
 * pelo `package-lock.json`: nó que não tem `dev: true` (ou que o lockfile não
 * conhece) é runtime. Serve para não depender só da consulta `--omit=dev`, que
 * não tem nenhuma advisory conhecida dentro e por isso, sozinha, poderia ser
 * forjada vazia sem ninguém notar; a completa traz as aceitas de desenvolvimento.
 */
export function pacotesDeRuntimeNoCompleto(vulnerabilidades, lockfile) {
  const pacotes = lockfile?.packages ?? {};
  return Object.entries(vulnerabilidades ?? {})
    .filter(([nome, v]) => {
      const nos = Array.isArray(v.nodes) && v.nodes.length > 0 ? v.nodes : [`node_modules/${nome}`];
      return nos.some((no) => pacotes[no]?.dev !== true);
    })
    .map(([nome]) => nome)
    .sort();
}

/**
 * Onde o npm procura `nome` a partir de `de`: a pasta `node_modules` do próprio
 * nó, depois a de cada pasta acima, até a raiz. Devolve a chave do
 * `package-lock.json` ou `null`. `de` é a chave de um nó (`""` é a raiz).
 */
function resolverNoLockfile(pacotes, de, nome) {
  let base = de;
  for (;;) {
    const candidato = base === "" ? `node_modules/${nome}` : `${base}/node_modules/${nome}`;
    if (Object.hasOwn(pacotes, candidato)) return candidato;
    if (base === "") return null;
    const corte = base.lastIndexOf("/");
    base = corte === -1 ? "" : base.slice(0, corte);
  }
}

/**
 * Os nós do `package-lock.json` que a imagem de produção instala, calculados
 * pelo GRAFO e não pela marca `dev` (DV-04, V2-F00-E19).
 *
 * A marca `dev: true` do lockfile é a fronteira que este portão usava entre
 * runtime e desenvolvimento, e o `npm ci --omit=dev` do Dockerfile NÃO a obedece
 * igual nas versões do npm: com um `fast-uri` de runtime marcado `dev: true` à
 * mão, o npm 10.9.9 (a imagem `node:22-bookworm-slim`) não o instala, e o
 * npm 11 o instala, porque recalcula quem é de desenvolvimento a partir das
 * dependências. Então a marca sozinha não diz o que vai para o servidor. O que
 * diz é a árvore: a partir da raiz e de cada workspace (o Dockerfile instala
 * `--workspaces --include-workspace-root`), seguem-se SÓ as dependências de
 * execução (`dependencies`, `optionalDependencies` e `peerDependencies`, que o
 * npm instala), resolvidas como o npm resolve (`node_modules` do nó e de cada
 * pasta acima). `devDependencies` de raiz e de workspace não entram. Quem for
 * alcançado assim é runtime, qualquer que seja a marca.
 *
 * É a mesma resposta de `npm ls --omit=dev --all` (o teste compara os dois nos
 * dois lockfiles do repositório) e a de uma instalação `npm ci --omit=dev` de
 * npm 10 e de npm 11 sobre um lockfile honesto, mas dá a CHAVE do nó (o npm ls
 * só dá nome e versão, e um nome pode ter duas cópias, uma só de
 * desenvolvimento) e não depende de qual npm está no PATH.
 */
export function nosDeRuntimeDoLockfile(lockfile) {
  const pacotes = lockfile?.packages ?? {};
  const alcancados = new Set();
  const fila = [];
  const entrar = (chave) => {
    if (alcancados.has(chave)) return;
    alcancados.add(chave);
    const no = pacotes[chave];
    if (no?.link === true && typeof no.resolved === "string" && Object.hasOwn(pacotes, no.resolved)) {
      entrar(no.resolved);
      return;
    }
    fila.push(chave);
  };
  // Raiz e workspaces: as chaves sem `node_modules` no caminho (o link
  // `node_modules/@dc360/api` aponta para `apps/api`, que já é uma delas).
  for (const chave of Object.keys(pacotes)) if (!chave.split("/").includes("node_modules")) entrar(chave);
  while (fila.length > 0) {
    const chave = fila.pop();
    const no = pacotes[chave];
    const nomes = new Set([
      ...Object.keys(no?.dependencies ?? {}),
      ...Object.keys(no?.optionalDependencies ?? {}),
      ...Object.keys(no?.peerDependencies ?? {}),
    ]);
    for (const nome of nomes) {
      const alvo = resolverNoLockfile(pacotes, chave, nome);
      if (alvo !== null) entrar(alvo);
    }
  }
  return alcancados;
}

/**
 * As chaves que o grafo alcança em runtime e o `package-lock.json` marca como
 * só de desenvolvimento (`dev: true`). Em lockfile honesto é lista vazia: o
 * próprio npm calcula a marca a partir do grafo. Lista não vazia quer dizer
 * lockfile editado ou corrompido, e é exatamente o caso em que o `npm audit
 * --omit=dev` esconde a advisory e o `npm ci --omit=dev` instala ou não o
 * pacote conforme a versão do npm. Reprova mesmo sem advisory hoje.
 */
export function marcasDevEmRuntime(lockfile) {
  const pacotes = lockfile?.packages ?? {};
  return [...nosDeRuntimeDoLockfile(lockfile)]
    .filter((chave) => chave !== "" && pacotes[chave]?.dev === true)
    .sort();
}

/**
 * Texto do defeito se o grafo de runtime não é confiável (lockfile sem o mapa
 * `packages`, como o de versão 1, ou grafo que não alcança nenhum pacote), ou
 * `null`. Um grafo vazio deixaria `marcasDevEmRuntime` devolver "nada" sem ter
 * olhado coisa nenhuma, e falta de prova não é prova de ausência.
 */
export function defeitoDoGrafo(lockfile) {
  const pacotes = lockfile?.packages;
  if (pacotes === null || typeof pacotes !== "object" || Array.isArray(pacotes) || !Object.hasOwn(pacotes, "")) {
    return "o lockfile não traz o mapa `packages` com a raiz (lockfileVersion antigo?), então não dá para calcular o runtime pelo grafo";
  }
  const alcancados = [...nosDeRuntimeDoLockfile(lockfile)].filter((chave) => chave.split("/").includes("node_modules"));
  if (alcancados.length === 0) {
    return "o grafo de execução não alcançou nenhum pacote (lockfile vazio ou sem dependências de execução)";
  }
  return null;
}

/* ---------- Provar que houve consulta de verdade ---------- */

/**
 * O registro de onde vêm as advisories. Fixado NA CHAMADA, e não lido da
 * configuração: bandeira de linha de comando vence `.npmrc` e variável de
 * ambiente, então `npm_config_registry`, `offline=true` num `.npmrc` ou um
 * espelho corporativo não mudam para onde o portão pergunta.
 */
export const REGISTRO_OFICIAL = "https://registry.npmjs.org/";

/**
 * As bandeiras de toda chamada ao `npm audit`. Até 2026-10-20 elas não existiam,
 * e `npm_config_offline=true` fazia o npm devolver, sem perguntar a ninguém, um
 * relatório vazio e bem formado (`total: 0`) que o portão lia como "Runtime
 * limpo" e saía 0 (validação da rodada 6). `prefer-offline` e `dry-run` vão
 * anulados pelo mesmo motivo.
 */
export const BANDEIRAS_DA_CONSULTA_REAL = Object.freeze([
  `--registry=${REGISTRO_OFICIAL}`,
  "--offline=false",
  "--prefer-offline=false",
  "--prefer-online",
  "--dry-run=false",
  /*
    Rodada 7: com `package-lock=false` num `.npmrc` o npm deixa de ler o
    `package-lock.json` e audita a árvore IDEAL resolvida das faixas do
    `package.json` (`arborist.audit()`), e o portão aprovava um lockfile com
    dependência de runtime de advisory alta, que o `npm ci --omit=dev` do
    Dockerfile instala. As consultas reais passam também `--package-lock-only=false`
    (ver `auditar.mjs`); a de controle passa `--package-lock-only`.
  */
  "--package-lock=true",
  /*
    `--workspaces=false` (correção 7) SAIU daqui na correção 8. Com ele o npm
    aplica `excludeWorkspacesDependencySet`: audita só o que a RAIZ declara e
    descarta tudo o que só os workspaces usam. Hoje a raiz não declara
    dependência nenhuma, o filtro sai vazio e por acaso não filtra nada; no dia
    em que a raiz ganhar uma dependência direta, o runtime de `apps/api` some do
    relatório (provado com o npm real numa cópia, `correcao-8/saidas`). Sem a
    bandeira o npm audita a árvore inteira; o filtro por workspace fica fechado
    pelo `cwd` fixo, pelas variáveis anuladas abaixo e pela recusa de
    `workspace`, `workspaces` e `include-workspace-root` em qualquer `.npmrc`
    (`CHAVES_PERMITIDAS`).
  */
]);

/**
 * Variáveis `npm_config_*` que o próprio `npm run` exporta para o script (onde
 * estão o cache, os arquivos de configuração, a versão) ou que restringem o npm
 * a um workspace. Saem do ambiente de toda chamada ao npm: sem elas o npm usa os
 * próprios padrões, e são esses os arquivos que o portão lê e confere. Qualquer
 * OUTRA `npm_config_*` chega ao npm e passa pela lista de `CHAVES_PERMITIDAS`.
 */
const VARIAVEIS_ANULADAS = /^npm_config_(workspaces?|include[_-]workspace[_-]root|cache|global[_-]prefix|globalconfig|init[_-]module|local[_-]prefix|node[_-]gyp|noproxy|npm[_-]version|prefix|user[_-]agent|userconfig)$/i;

/**
 * O ambiente com que toda chamada ao npm roda: o do processo sem as
 * `VARIAVEIS_ANULADAS`. As de workspace saíram na correção 7: dentro de um
 * workspace, ou com uma delas definida, o npm audita só aquele workspace e
 * devolve um relatório bem formado e limpo para a raiz inteira.
 */
export function ambienteDaConsulta(env) {
  return Object.fromEntries(Object.entries(env).filter(([nome]) => !VARIAVEIS_ANULADAS.test(nome)));
}

/* ---------- O que a configuração do npm pode ter ---------- */

/**
 * As ÚNICAS chaves de configuração do npm que o portão aceita, venham de onde
 * vierem (o `.npmrc` do projeto, do usuário, o global, o embutido no npm, ou uma
 * `npm_config_*` do ambiente). Qualquer outra sai 2 com o nome dela (rodada 7:
 * `package-lock=false` num `.npmrc` fazia o npm auditar outra árvore). Em vez de
 * tapar bandeira por bandeira, a classe fecha ao contrário: o que não se sabe
 * que é inofensivo não passa. Cada uma foi provada com o npm real numa cópia
 * com runtime vulnerável plantado (`correcao-8/saidas`): com ela no `.npmrc`, o
 * portão continua saindo 1.
 */
export const CHAVES_PERMITIDAS = Object.freeze({
  // Só mexem no que o npm escreve no terminal; o relatório JSON sai igual.
  loglevel: "só o nível de log do stderr",
  color: "só a cor do terminal",
  progress: "só a barra de progresso",
  fund: "só a mensagem de financiamento do `npm install`",
  "update-notifier": "só o aviso de versão nova do npm",
  // Lugares no disco que não entram no que o `npm audit` olha.
  cache: "pasta do cache; a consulta de advisories vai com --prefer-online e não sai do cache",
  prefix: "pasta das instalações globais e do npmrc global (que o portão também lê e confere)",
  // Anuladas: toda chamada passa a bandeira, e bandeira vence configuração.
  registry: "anulada por --registry",
  offline: "anulada por --offline=false",
  "prefer-offline": "anulada por --prefer-offline=false",
  "prefer-online": "anulada por --prefer-online",
  "dry-run": "anulada por --dry-run=false",
  "package-lock": "anulada por --package-lock=true",
  "package-lock-only": "anulada por --package-lock-only (false nas consultas reais, true na de controle)",
  "audit-level": "anulada por --audit-level=low",
  json: "anulada por --json",
  // Credencial do registro oficial: muda quem pergunta, não o que volta.
  "//registry.npmjs.org/:_authToken": "credencial do registro oficial",
});

/**
 * O nome de chave como o npm o entende: em variável de ambiente
 * `npm_config_prefer_offline` (qualquer caixa) vira `prefer-offline`; num
 * `.npmrc`, `chave[]` (lista) vira `chave`.
 */
export function normalizarChave(chave, { doAmbiente = false } = {}) {
  if (doAmbiente) return chave.replace(/^npm_config_/i, "").toLowerCase().replaceAll("_", "-");
  return chave.trim().replace(/\[\]$/, "");
}

/** As chaves de um `.npmrc` (formato ini): comentário com `;` ou `#`; seção `[x]` vira a chave `[x]`. */
export function chavesDoNpmrc(texto) {
  const chaves = [];
  for (const crua of String(texto).split(/\r?\n/)) {
    const linha = crua.trim();
    if (linha === "" || linha.startsWith(";") || linha.startsWith("#")) continue;
    if (/^\[.*\]$/.test(linha)) { chaves.push(linha); continue; }
    const igual = linha.indexOf("=");
    chaves.push(normalizarChave(igual === -1 ? linha : linha.slice(0, igual)));
  }
  return chaves;
}

/**
 * Lê a saída de `npm config list` (sem `-l`): o npm lista ali, por fonte
 * (`builtin`, `global`, `user`, `project`, `env`, `cli`), só o que difere do
 * padrão, com o arquivo de onde veio. É o próprio npm dizendo o que vai usar,
 * inclusive do npmrc embutido e do global, que o portão não saberia achar
 * sozinho. Devolve também o `npm local prefix`, a pasta que o npm tomou como
 * projeto.
 *
 * @returns {{ chaves: {chave: string, origem: string}[], prefixoLocal: string | null }}
 */
export function lerNpmConfigList(texto) {
  const chaves = [];
  let origem = null;
  let prefixoLocal = null;
  for (const crua of String(texto).split(/\r?\n/)) {
    const linha = crua.trim();
    const cabecalho = /^; "([^"]+)" config from (.+)$/.exec(linha);
    if (cabecalho) { origem = `${cabecalho[1]} (${cabecalho[2]})`; continue; }
    const prefixo = /^; npm local prefix = (.+)$/.exec(linha);
    if (prefixo) { prefixoLocal = prefixo[1]; origem = null; continue; }
    if (linha === "" || linha.startsWith(";")) continue;
    const m = /^(.+?) = /.exec(linha);
    chaves.push({ chave: normalizarChave(m ? m[1] : linha), origem: origem ?? "npm config list (fonte não identificada)" });
  }
  return { chaves, prefixoLocal };
}

/** As chaves fora de `CHAVES_PERMITIDAS`, sem repetir o par (chave, origem). */
export function chavesProibidas(achadas) {
  const vistas = new Set();
  return achadas.filter(({ chave, origem }) => {
    const k = `${chave} ${origem}`;
    if (Object.hasOwn(CHAVES_PERMITIDAS, chave) || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/**
 * O texto como o npm 11 o mostra em `npm config list` e `npm prefix`: ele mascara
 * com `***` todo trecho com cara de UUID (e `npm_***` para segredo do npm), pelo
 * `@npmcli/redact`. Um caminho de projeto com um segmento assim (pasta temporária,
 * worktree, runner de CI) volta mascarado, e a comparação direta com o caminho
 * real falhava (revisão da correção 8). Comparar o mascarado com o mascarado só
 * aceita a diferença que a própria máscara do npm produz.
 */
export function mascararComoONpm(texto) {
  return String(texto)
    .replace(/\b(npms?_)[a-zA-Z0-9]{36,48}\b/gi, "npm_***")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "***");
}

/**
 * O npm tomou `projeto` como projeto? `prefixoDoNpm` é o `npm local prefix`
 * (talvez mascarado); `caminhos` são o caminho dado e o real (sem link). Vale o
 * igual, ou o igual depois de aplicar a mesma máscara do npm aos caminhos.
 */
export function mesmoProjeto(prefixoDoNpm, caminhos) {
  if (typeof prefixoDoNpm !== "string" || prefixoDoNpm === "") return false;
  return caminhos.some((c) => c === prefixoDoNpm || mascararComoONpm(c) === prefixoDoNpm);
}

/**
 * Os `npm-shrinkwrap.json` que existem na raiz, no aplicativo ou em qualquer
 * workspace. O npm dá precedência ao shrinkwrap sobre o `package-lock.json`
 * (`sw || lock` no arborist): com um shrinkwrap limpo ao lado, o `npm audit`
 * olhava o shrinkwrap e aprovava um `package-lock.json` com runtime vulnerável,
 * que é o que o Dockerfile copia e o `npm ci` instala (revisão da correção 8).
 * Não há motivo para shrinkwrap neste repositório: existir já é defeito.
 *
 * Os workspaces vêm do `package.json` da raiz; só `pasta/*` e caminho literal são
 * expandidos, e um padrão diferente volta como defeito (`naoExpandidos`).
 *
 * @returns {{ achados: string[], naoExpandidos: string[] }}
 */
export function shrinkwrapsPresentes(raiz, outrasPastas = [], fs) {
  const { existsSync, readFileSync, readdirSync } = fs;
  const pastas = [raiz, ...outrasPastas];
  const naoExpandidos = [];
  let workspaces = [];
  try {
    const pacote = JSON.parse(readFileSync(`${raiz}/package.json`, "utf8"));
    workspaces = Array.isArray(pacote.workspaces) ? pacote.workspaces : pacote.workspaces?.packages ?? [];
  } catch { /* sem package.json legível o npm audit falha sozinho, e o portão sai 2 */ }
  for (const padrao of workspaces) {
    if (/^[^*?[\]{}!]+\/\*$/.test(padrao)) {
      const base = `${raiz}/${padrao.slice(0, -2)}`;
      if (!existsSync(base)) continue;
      for (const e of readdirSync(base, { withFileTypes: true })) if (e.isDirectory()) pastas.push(`${base}/${e.name}`);
    } else if (/^[^*?[\]{}!]+$/.test(padrao)) {
      pastas.push(`${raiz}/${padrao}`);
    } else {
      naoExpandidos.push(padrao);
    }
  }
  const achados = pastas.map((p) => `${p}/npm-shrinkwrap.json`).filter((f) => existsSync(f));
  return { achados, naoExpandidos };
}

/**
 * A data de hoje no fuso de São Paulo (AAAA-MM-DD). O prazo das exceções "vale
 * até o fim do dia escrito", e o dia é o do Brasil: em UTC a exceção vencia às
 * 21h do último dia (anotado na rodada 7).
 */
export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/**
 * A consulta de controle: um projeto mínimo com uma versão de pacote que TEM
 * advisory publicada há anos. Se o registro responde de verdade, ela volta com a
 * advisory; se volta vazia, o zero dos relatórios reais não prova nada (modo
 * offline que escapou, espelho que responde `{}` ao endpoint de advisories,
 * proxy no meio). Fixar o registro fecha o caminho conhecido; o controle é a
 * prova positiva de que a fonte de advisories respondeu.
 */
export const CONTROLE = Object.freeze({ pacote: "lodash", versao: "4.17.20", advisory: "GHSA-35jh-r3h4-6jhm" });

/** O `package.json` e o `package-lock.json` do projeto de controle. */
export function arquivosDoControle() {
  const { pacote, versao } = CONTROLE;
  const nome = "auditar-controle";
  return {
    "package.json": `${JSON.stringify({ name: nome, version: "1.0.0", private: true, dependencies: { [pacote]: versao } }, null, 2)}\n`,
    "package-lock.json": `${JSON.stringify({
      name: nome, version: "1.0.0", lockfileVersion: 3, requires: true,
      packages: {
        "": { name: nome, version: "1.0.0", dependencies: { [pacote]: versao } },
        [`node_modules/${pacote}`]: { version: versao },
      },
    }, null, 2)}\n`,
  };
}

/** Defeito da consulta de controle (texto), ou null se ela voltou com a advisory conhecida. */
export function defeitoDoControle(relatorio) {
  const { pacote, versao, advisory } = CONTROLE;
  const total = relatorio?.metadata?.vulnerabilities?.total;
  const ids = advisoriesProprias(relatorio?.vulnerabilities?.[pacote]).map(idDaAdvisory);
  if (typeof total === "number" && total > 0 && ids.includes(advisory)) return null;
  return `a consulta de controle (${pacote} ${versao}, que tem a advisory ${advisory} publicada) voltou `
    + `${typeof total === "number" && total > 0 ? `sem ${advisory}` : "sem advisory nenhuma"}. `
    + "A fonte de advisories não respondeu de verdade (modo offline, espelho ou proxy que responde vazio), "
    + "então o zero dos relatórios reais não prova nada";
}

/**
 * Defeito da árvore auditada, ou null. Um relatório com `dependencies.total` 0
 * ou sem ele não olhou dependência nenhuma: zero vulnerabilidade de zero
 * pacotes não é runtime limpo.
 */
export function defeitoDaArvore(relatorio) {
  const total = relatorio?.metadata?.dependencies?.total;
  if (typeof total === "number" && total > 0) return null;
  return `o relatório não diz quantas dependências auditou (metadata.dependencies.total = ${JSON.stringify(total)}); `
    + "zero vulnerabilidade em zero pacote não é prova de nada";
}
