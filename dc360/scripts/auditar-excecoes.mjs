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

  `advisories` é a lista dos ids GHSA aceitos NAQUELE pacote (vale também a URL
  da advisory, que o portão reduz ao id). Até 2026-10-20 a exceção casava pelo
  nome do pacote, e uma advisory nova e crítica em `node-forge` passava como
  "aceita" porque o pacote já estava na lista (validação da rodada 6). Aceitar
  um risco é aceitar AQUELE risco: advisory nova no mesmo pacote reprova até
  alguém ler, escrever o motivo e acrescentar o id. Vencido o prazo, o
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
    advisories: ["GHSA-vcc3-ghjq-m6fr"],
    motivo: "Chega por expo-router > query-string, e esta vai "
      + "junto com o aplicativo. O ataque é negação de serviço por percentual mal "
      + "formado numa URL, e a única URL que o aplicativo analisa é o próprio link "
      + "profundo dele. Sem correção acima sem trocar o expo-router.",
    dono: DONO, ate: PRAZO,
  },
  "brace-expansion": {
    advisories: ["GHSA-q2hr-2g5m-vwhr", "GHSA-qhr7-859c-m2p7", "GHSA-6j4f-fj2g-mc7p"],
    motivo: FERRAMENTA_DO_EXPO + "Três avisos de negação de serviço na expansão de "
      + "glob (padrão `{a},b}` e recursão em chaves aninhadas), e o aplicativo não "
      + "expande glob em execução. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO, comCorrecao: true,
  },
  braces: {
    advisories: ["GHSA-vfj7-8cjw-p6xm"],
    motivo: FERRAMENTA_DO_EXPO + "Negação de serviço por padrão aninhado em glob "
      + "(micromatch), só no bundler. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO,
  },
  "node-forge": {
    advisories: ["GHSA-86w9-cpqp-85rv"],
    motivo: FERRAMENTA_DO_EXPO + "Vem de @expo/code-signing-certificates, usado "
      + "para assinar atualização do EAS na máquina de build, não no telefone. "
      + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO,
  },
  "shell-quote": {
    advisories: ["GHSA-pqg4-j6r4-53mv"],
    motivo: FERRAMENTA_DO_EXPO + "Vem de react-devtools-core, só no modo de "
      + "desenvolvimento. Injeção de comando exige que o desenvolvedor passe "
      + "entrada hostil ao `quote()` local. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO, comCorrecao: true,
  },
  "sprintf-js": {
    advisories: ["GHSA-hp3w-g68c-fv3c"],
    motivo: FERRAMENTA_DO_EXPO + "Vem de argparse > js-yaml, usado só para ler "
      + "configuração local de ferramenta. " + SEM_FIX_SEGURO,
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
 * Vale até o fim do dia escrito: vence quando `ate < hoje`.
 *
 * Com `exigirAdvisories` (a lista do aplicativo), cada exceção precisa nomear as
 * advisories que aceita, por id GHSA ou URL: sem isso o portão voltaria a aceitar
 * pelo nome do pacote.
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
      if (!Array.isArray(e?.advisories) || e.advisories.length === 0) {
        problemas.push(`${nome}: exceção sem a lista \`advisories\` (o id GHSA ou a URL de cada advisory aceita)`);
      } else {
        for (const a of e.advisories) {
          if (typeof a !== "string" || !idDaAdvisory(a)?.startsWith("GHSA-")) {
            problemas.push(`${nome}: advisory inválida ${JSON.stringify(a)} (esperado o id GHSA-xxxx-xxxx-xxxx ou a URL dela)`);
          }
        }
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
 * @param {Record<string, {advisories?: string[]}>} aceitas
 * @returns {{pacote: string, id: string, gravidade: string, titulo: string}[]}
 */
export function advisoriesNaoAceitas(vulnerabilidades, aceitas) {
  const novas = new Map();
  for (const [pacote, entrada] of Object.entries(vulnerabilidades ?? {})) {
    const aceitasDoPacote = new Set(
      Object.hasOwn(aceitas, pacote) ? (aceitas[pacote].advisories ?? []).map(idDaAdvisory).filter(Boolean) : [],
    );
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
]);

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
