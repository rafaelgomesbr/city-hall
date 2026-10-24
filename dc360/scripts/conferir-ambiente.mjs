#!/usr/bin/env node
/**
 * Confere o contrato de ambiente DEV, HML e PROD (V2-F01-E09).
 *
 * ## Por que este roteiro existe
 *
 * `scripts/ambientes.json` é a matriz: para cada variável de cada app, em cada
 * ambiente, diz se é obrigatória, opcional ou proibida, e onde ela mora (no
 * `[env]` do `fly*.toml`, versionada, ou nos segredos do Fly). A partida da API
 * e do console recusa configuração incoerente (`apps/api/src/ambiente.ts`), mas
 * isso só é visto no deploy. Aqui o defeito aparece ANTES, em duas conferências:
 *
 *   1. DO REPOSITÓRIO (sem rede, roda no CI e no `test:scripts`): a matriz é bem
 *      formada, cobre exatamente as variáveis que o `config.ts` de cada app lê,
 *      os `fly*.toml` declaram o que a matriz manda e nada que ela proíbe, HML e
 *      PROD declaram identidades de banco e domínios DIFERENTES, e as versões
 *      de Node e de Postgres batem entre os arquivos.
 *   2. DO FLY (precisa do `fly` e de login, é manual): os NOMES de
 *      `fly secrets list` de um app contra a coluna do ambiente. Reprova segredo
 *      que falta, segredo proibido naquele ambiente (o caso típico: segredo
 *      exclusivo de PROD no app de HML), nome que a matriz não conhece e nome
 *      que deveria estar no `[env]` e está nos segredos (um segredo vence o
 *      `[env]`, e aí a linha versionada deixa de valer sem ninguém ver).
 *
 * ## O que ele NUNCA faz
 *
 * Nunca lê nem imprime VALOR de segredo. `fly secrets list` só devolve nomes e
 * um resumo; este roteiro extrai o nome e descarta o resto. A matriz nunca
 * guarda segredo (a validação reprova valor fixo em variável de segredo). E ele
 * não muda nada em lugar nenhum: só lê.
 *
 * ## Uso, de dentro de `dc360`
 *
 *   node scripts/conferir-ambiente.mjs
 *       confere o repositório (código de saída 0 ou 1)
 *
 *   node scripts/conferir-ambiente.mjs --ambiente=prod --app=api
 *   node scripts/conferir-ambiente.mjs --ambiente=hml --app=console --fly=NOME
 *       roda `fly secrets list -a NOME --json` e compara os nomes com a matriz.
 *       Sem `--fly`, usa o app da matriz para aquele ambiente (HML só depois da E11).
 *
 *   fly secrets list -a defesa-civil --json | node scripts/conferir-ambiente.mjs --ambiente=prod --app=api --lista=-
 *       ou `--lista=ARQUIVO`: lê a saída já guardada, sem chamar o `fly`.
 *
 *   DATABASE_URL_SETUP=... node scripts/conferir-ambiente.mjs --extensoes [--ambiente=hml|prod]
 *       (V2-F01-E22) confere o PostGIS no banco, SÓ LEITURA: o provedor oferece,
 *       está no schema certo, nenhum papel do provedor o alcança e `dc360_app`
 *       enxerga o mínimo. Em PROD, só a disponibilidade. Ver
 *       `scripts/conferir-extensoes.mjs`.
 *
 * Saída: 0 tudo confere; 1 alguma conferência falhou; 2 uso errado.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executarExtensoes, lerArgumentosDeExtensoes } from "./conferir-extensoes.mjs";

const AQUI = fileURLToPath(new URL(".", import.meta.url));
export const RAIZ_DO_PRODUTO = resolve(AQUI, "..");

export const AMBIENTES = ["dev", "hml", "prod"];
export const ESTADOS = ["obrigatoria", "opcional", "proibida"];
export const LUGARES = ["env", "segredo"];
export const APPS = ["api", "console"];

/**
 * Domínios que o provedor reparte entre milhares de clientes. Precisa ser IGUAL
 * à lista `DOMINIOS_COMPARTILHADOS` de `apps/api/src/ambiente.ts`: o teste
 * `conferir-ambiente.test.mjs` compara as duas e reprova a divergência.
 */
export const DOMINIOS_COMPARTILHADOS = [
  "vercel.app",
  "fly.dev",
  "supabase.co",
  "supabase.com",
  "netlify.app",
  "github.io",
  "herokuapp.com",
  "onrender.com",
  "railway.app",
  "pages.dev",
  "workers.dev",
  "web.app",
  "firebaseapp.com",
  "com.br",
  "gov.br",
  "org.br",
  "net.br",
];

const NOME_DE_VARIAVEL = /^[A-Z][A-Z0-9_]*$/;
const IDENTIDADE = /^[a-z0-9][a-z0-9_-]{2,62}$/i;
const DOMINIO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Lê e interpreta a matriz. Quem chama decide o que fazer com o erro de JSON. */
export function lerMatriz(caminho = join(AQUI, "ambientes.json")) {
  return JSON.parse(readFileSync(caminho, "utf8"));
}

/** O estado de uma variável num ambiente. Ausente na matriz quer dizer `opcional`. */
export function estadoDe(variavel, ambiente) {
  return variavel[ambiente] ?? "opcional";
}

/** `host` é o `dominio` ou fica embaixo dele? */
function hostNoDominio(host, dominio) {
  return host === dominio || host.endsWith(`.${dominio}`);
}

/** Um domínio dentro do outro, em qualquer direção, ou igual. */
function dominiosSeCruzam(a, b) {
  return hostNoDominio(a, b) || hostNoDominio(b, a);
}

/**
 * A matriz está bem formada? Devolve a lista de problemas (vazia = bem formada).
 *
 * Regras estruturais, sem olhar o repositório: cada nome é único e tem o formato
 * certo, `onde` e os estados são os conhecidos, variável de SEGREDO nunca tem
 * valor fixo (a matriz nunca guarda segredo), valor fixo não contradiz a
 * proibição, e as identidades e os domínios de HML e PROD são diferentes.
 */
export function validarMatriz(matriz) {
  const problemas = [];
  const p = (texto) => problemas.push(texto);

  if (matriz?.versao !== 1) p("versao da matriz precisa ser 1");
  for (const amb of AMBIENTES) {
    if (!matriz?.ambientes?.[amb]) p(`ambientes.${amb} está faltando`);
  }
  if (!matriz?.apps) {
    p("apps está faltando");
    return problemas;
  }

  for (const app of APPS) {
    const lista = matriz.apps[app]?.variaveis;
    if (!Array.isArray(lista) || lista.length === 0) {
      p(`apps.${app}.variaveis está faltando ou vazia`);
      continue;
    }
    const vistos = new Set();
    for (const v of lista) {
      const onde = `apps.${app}.${v?.nome ?? "(sem nome)"}`;
      if (typeof v?.nome !== "string" || !NOME_DE_VARIAVEL.test(v.nome)) {
        p(`${onde}: nome fora do formato MAIUSCULAS_COM_SUBLINHADO`);
        continue;
      }
      if (vistos.has(v.nome)) p(`${onde}: nome repetido`);
      vistos.add(v.nome);
      if (!LUGARES.includes(v.onde)) p(`${onde}: "onde" precisa ser ${LUGARES.join(" ou ")}`);
      for (const amb of AMBIENTES) {
        if (v[amb] !== undefined && !ESTADOS.includes(v[amb])) {
          p(`${onde}: ${amb} precisa ser ${ESTADOS.join(", ")} (veio ${JSON.stringify(v[amb])})`);
        }
      }
      if (v.valores !== undefined) {
        if (v.onde === "segredo")
          p(`${onde}: variável de SEGREDO não pode ter valor fixo na matriz`);
        for (const [amb, valor] of Object.entries(v.valores)) {
          if (!AMBIENTES.includes(amb)) p(`${onde}: valores.${amb} não é um ambiente`);
          if (typeof valor !== "string") p(`${onde}: valores.${amb} precisa ser texto`);
          if (estadoDe(v, amb) === "proibida") p(`${onde}: valores.${amb} contradiz a proibição`);
        }
      }
      if ((v.identidade || v.dominio) && v.onde !== "env") {
        p(`${onde}: identidade e domínio moram no [env], não nos segredos`);
      }
      if (v.dev === "obrigatoria")
        p(`${onde}: nada é obrigatório em dev (o repositório precisa rodar recém-clonado)`);
    }
  }

  const { hml, prod } = matriz.ambientes ?? {};
  for (const [nome, amb] of [
    ["hml", hml],
    ["prod", prod],
  ]) {
    if (!amb) continue;
    if (amb.identidadeDoBanco != null && !IDENTIDADE.test(amb.identidadeDoBanco)) {
      p(
        `ambientes.${nome}.identidadeDoBanco fora do formato (3 a 63 letras, números, hífen ou sublinhado, sem ponto)`,
      );
    }
    if (amb.dominio != null) {
      if (!DOMINIO.test(amb.dominio)) p(`ambientes.${nome}.dominio fora do formato de domínio`);
      if (DOMINIOS_COMPARTILHADOS.includes(amb.dominio)) {
        p(
          `ambientes.${nome}.dominio é um domínio compartilhado do provedor: use o nome inteiro do projeto`,
        );
      }
    }
  }
  if (hml && prod) {
    if (
      hml.identidadeDoBanco != null &&
      hml.identidadeDoBanco.toLowerCase() === prod.identidadeDoBanco?.toLowerCase()
    ) {
      p(
        "HML e PROD declaram a MESMA identidade de banco: a trava de ambiente cruzado não separaria nada",
      );
    }
    if (
      hml.dominio != null &&
      prod.dominio != null &&
      dominiosSeCruzam(hml.dominio, prod.dominio)
    ) {
      p(
        "HML e PROD declaram domínios iguais ou um dentro do outro: o CORS de um aceitaria o painel do outro",
      );
    }
  }
  return problemas;
}

/**
 * Lê as linhas `NOME = "valor"` da seção `[env]` de um `fly*.toml`. Comentário
 * (linha inteira ou depois do valor) não conta, e outra seção encerra a leitura.
 * É um leitor de uma seção só, de propósito: o resto do arquivo não importa aqui.
 */
export function lerEnvDoToml(texto) {
  const env = {};
  let dentro = false;
  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim();
    if (t.startsWith("[")) {
      dentro = t === "[env]";
      continue;
    }
    if (!dentro || t === "" || t.startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(t);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * As variáveis que um `config.ts` lê: as chaves de primeiro nível do
 * `z.object({...})` chamado `esquema` (ou `ESQUEMA`), mais todo
 * `process.env["X"]` e `process.env.X` do arquivo.
 */
export function variaveisDoEsquema(fonte) {
  const abertura = /const (?:esquema|ESQUEMA)\s*=\s*z\.object\(\{/.exec(fonte);
  if (!abertura) throw new Error("config.ts não declara mais `const esquema = z.object({`");
  const inicio = abertura.index + abertura[0].length;
  let profundidade = 1;
  let fim = inicio;
  for (; fim < fonte.length && profundidade > 0; fim++) {
    if (fonte[fim] === "{") profundidade += 1;
    if (fonte[fim] === "}") profundidade -= 1;
  }
  const corpo = semComentarios(fonte.slice(inicio, fim));
  const nomes = new Set([...corpo.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\s*:/gm)].map((m) => m[1]));
  for (const m of fonte.matchAll(/process\.env(?:\["([A-Z][A-Z0-9_]*)"\]|\.([A-Z][A-Z0-9_]*))/g)) {
    nomes.add(m[1] ?? m[2]);
  }
  return nomes;
}

const CONFIG_DO_APP = { api: "apps/api/src/config.ts", console: "apps/console/src/config.ts" };

function ler(raiz, caminho) {
  return readFileSync(join(raiz, caminho), "utf8");
}

/**
 * Confere o repositório contra a matriz. Devolve `{ problemas, avisos }`.
 *
 * `problemas` reprova. `avisos` só informa o que ainda não existe por desenho
 * (os `fly*.toml` de HML antes da E11), sem reprovar.
 */
export function conferirRepositorio({ raiz = RAIZ_DO_PRODUTO, matriz = lerMatriz() } = {}) {
  const problemas = validarMatriz(matriz);
  const avisos = [];
  const p = (t) => problemas.push(t);
  if (problemas.length > 0) return { problemas, avisos };

  // 1. A matriz cobre exatamente o que cada config.ts lê.
  for (const app of APPS) {
    const lidas = variaveisDoEsquema(ler(raiz, CONFIG_DO_APP[app]));
    const naMatriz = new Set(matriz.apps[app].variaveis.map((v) => v.nome));
    for (const nome of [...lidas].sort()) {
      if (!naMatriz.has(nome))
        p(`${app}: ${nome} é lida por ${CONFIG_DO_APP[app]} e não está na matriz`);
    }
    for (const nome of [...naMatriz].sort()) {
      if (!lidas.has(nome))
        p(`${app}: ${nome} está na matriz e ${CONFIG_DO_APP[app]} não a lê mais`);
    }
  }

  // 2. Cada fly*.toml declara o que a matriz manda neste ambiente, e nada além.
  const tomls = {};
  for (const amb of ["hml", "prod"]) {
    const dados = matriz.ambientes[amb];
    for (const app of APPS) {
      const arquivo = dados.arquivos[app];
      if (!existsSync(join(raiz, arquivo))) {
        if (amb === "prod") p(`${arquivo} (PROD, ${app}) não existe`);
        else if (dados.identidadeDoBanco != null)
          p(`${arquivo} (HML, ${app}) não existe, mas a matriz já declara a identidade de HML`);
        else avisos.push(`${arquivo} (HML, ${app}) ainda não existe: nasce na V2-F01-E11`);
        continue;
      }
      const env = lerEnvDoToml(ler(raiz, arquivo));
      tomls[`${amb}/${app}`] = env;
      const variaveis = matriz.apps[app].variaveis;
      const porNome = new Map(variaveis.map((v) => [v.nome, v]));

      for (const v of variaveis) {
        const estado = estadoDe(v, amb);
        const declarada = Object.hasOwn(env, v.nome);
        if (v.onde === "env" && estado === "obrigatoria" && !declarada) {
          p(`${arquivo}: [env] não declara ${v.nome}, obrigatória em ${amb.toUpperCase()}`);
        }
        if (declarada && estado === "proibida") {
          p(`${arquivo}: [env] declara ${v.nome}, proibida em ${amb.toUpperCase()}`);
        }
        const esperado = v.valores?.[amb];
        if (declarada && esperado !== undefined && env[v.nome] !== esperado) {
          p(`${arquivo}: ${v.nome} deveria valer "${esperado}" em ${amb.toUpperCase()}`);
        }
        if (
          declarada &&
          v.identidade &&
          dados.identidadeDoBanco != null &&
          env[v.nome] !== dados.identidadeDoBanco
        ) {
          p(
            `${arquivo}: ${v.nome} não é a identidade de banco que a matriz declara para ${amb.toUpperCase()}`,
          );
        }
        if (declarada && v.dominio && dados.dominio != null && env[v.nome] !== dados.dominio) {
          p(`${arquivo}: ${v.nome} não é o domínio que a matriz declara para ${amb.toUpperCase()}`);
        }
      }
      for (const nome of Object.keys(env)) {
        const v = porNome.get(nome);
        if (!v) p(`${arquivo}: [env] declara ${nome}, que a matriz não conhece`);
        else if (v.onde === "segredo")
          p(`${arquivo}: [env] declara ${nome}, que é SEGREDO e não pode estar no repositório`);
      }
    }
  }

  // 3. Um ambiente não carrega a identidade nem o domínio do outro.
  for (const app of APPS) {
    const h = tomls[`hml/${app}`];
    const pr = tomls[`prod/${app}`];
    if (!h || !pr) continue;
    for (const v of matriz.apps[app].variaveis) {
      if (!(v.identidade || v.dominio)) continue;
      if (h[v.nome] !== undefined && h[v.nome] === pr[v.nome]) {
        p(`${app}: ${v.nome} tem o MESMO valor no toml de HML e no de PROD`);
      }
    }
  }

  // 4. Versões: Node 22 e Postgres 17 em todo lugar que as declara.
  const nvmrc = ler(raiz, ".nvmrc").trim();
  if (!existsSync(join(raiz, ".node-version"))) p(".node-version não existe");
  else if (ler(raiz, ".node-version").trim() !== nvmrc)
    p(`.node-version e .nvmrc divergem (${ler(raiz, ".node-version").trim()} e ${nvmrc})`);
  if (nvmrc !== "22") p(`.nvmrc deveria dizer 22 (diz ${nvmrc})`);
  const engines = JSON.parse(ler(raiz, "package.json")).engines?.node;
  if (engines !== ">=22 <23")
    p(`package.json engines.node deveria ser ">=22 <23" (é ${JSON.stringify(engines)})`);
  for (const dockerfile of ["Dockerfile", "Dockerfile.console"]) {
    if (!/^FROM node:22[\s-]/m.test(ler(raiz, dockerfile)))
      p(`${dockerfile}: a imagem base deveria ser node:22`);
  }
  const imagens = [...ler(raiz, "compose.yaml").matchAll(/^\s*image:\s*(\S*postgis\S*)\s*$/gm)].map(
    (m) => m[1],
  );
  if (imagens.length === 0) p("compose.yaml: nenhuma imagem de Postgres/PostGIS encontrada");
  for (const imagem of imagens) {
    if (!/^postgis\/postgis:17-/.test(imagem))
      p(`compose.yaml: ${imagem} deveria ser Postgres 17 (a produção roda 17.6)`);
  }

  return { problemas, avisos };
}

/**
 * Tira os NOMES de segredos da saída de `fly secrets list`, em JSON ou em texto.
 * O valor (ou o resumo dele) é descartado aqui, antes de qualquer impressão.
 */
export function lerNomesDeSegredos(saida) {
  const texto = String(saida).trim();
  const nomes = new Set();
  if (texto.startsWith("[") || texto.startsWith("{")) {
    let json;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new Error("a saída parece JSON mas não é JSON válido");
    }
    const lista = Array.isArray(json) ? json : (json.secrets ?? json.Secrets ?? []);
    for (const item of lista) {
      const nome = typeof item === "string" ? item : (item?.Name ?? item?.name ?? item?.NAME);
      if (typeof nome === "string") nomes.add(nome);
    }
    return [...nomes];
  }
  for (const linha of texto.split(/\r?\n/)) {
    const primeiro = linha.trim().split(/\s+/)[0] ?? "";
    // `NAME` é o cabeçalho da tabela do `fly`, e não um segredo.
    if (primeiro !== "NAME" && NOME_DE_VARIAVEL.test(primeiro)) nomes.add(primeiro);
  }
  return [...nomes];
}

/**
 * Compara os nomes de segredos de um app do Fly com a coluna de um ambiente.
 *
 * - `faltando`: segredo obrigatório que não está lá.
 * - `proibidos`: segredo que a matriz proíbe neste ambiente. O caso que a etapa
 *   quer pego é o segredo exclusivo de PROD aparecendo no app de HML.
 * - `noLugarErrado`: nome que a matriz manda ficar no `[env]` e está nos
 *   segredos. Um segredo vence o `[env]`: a linha versionada deixa de valer.
 * - `desconhecidos`: nome que a matriz não tem (deriva, ou segredo de outro app).
 *
 * Nomes que começam com `FLY_` são do próprio Fly e não entram.
 */
export function compararNomes({ matriz, app, ambiente, nomes }) {
  if (!APPS.includes(app)) throw new Error(`app desconhecido: ${app}`);
  if (!["hml", "prod"].includes(ambiente)) throw new Error(`ambiente sem app no Fly: ${ambiente}`);
  const presentes = new Set(nomes.filter((n) => !n.startsWith("FLY_")));
  const variaveis = matriz.apps[app].variaveis;
  const conhecidos = new Set(variaveis.map((v) => v.nome));
  const resultado = { faltando: [], proibidos: [], noLugarErrado: [], desconhecidos: [] };

  for (const v of variaveis) {
    const estado = estadoDe(v, ambiente);
    const presente = presentes.has(v.nome);
    if (v.onde === "segredo") {
      if (!presente && estado === "obrigatoria") resultado.faltando.push(v.nome);
      if (presente && estado === "proibida") resultado.proibidos.push(v.nome);
    } else if (presente) {
      resultado.noLugarErrado.push(v.nome);
    }
  }
  for (const nome of presentes) {
    if (!conhecidos.has(nome)) resultado.desconhecidos.push(nome);
  }
  for (const lista of Object.values(resultado)) lista.sort();
  return resultado;
}

/** O resultado de `compararNomes` virou reprovação? */
export function reprovou(resultado) {
  return Object.values(resultado).some((lista) => lista.length > 0);
}

/** Linhas para imprimir. Só NOMES e frases, nunca valor. */
export function formatarComparacao({ app, ambiente, nomes, resultado }) {
  const linhas = [
    `${app} em ${ambiente.toUpperCase()}: ${nomes.length} nome(s) de segredo lido(s) (só nomes)`,
  ];
  const grupos = [
    ["faltando", "FALTA  segredo obrigatório ausente"],
    ["proibidos", "SOBRA  segredo proibido neste ambiente"],
    ["noLugarErrado", "LUGAR  deveria estar no [env] do toml, e está nos segredos"],
    ["desconhecidos", "DESCONHECIDO  nome que a matriz não tem"],
  ];
  for (const [chave, rotulo] of grupos) {
    for (const nome of resultado[chave]) linhas.push(`  ${rotulo}: ${nome}`);
  }
  if (!reprovou(resultado)) linhas.push("  OK: os nomes batem com a matriz");
  return linhas;
}

/** Lê os argumentos `--chave=valor`. Devolve `{ erro }` quando algo está errado. */
export function lerArgumentos(argv) {
  if (argv.includes("--extensoes")) return lerArgumentosDeExtensoes(argv);
  const saida = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) return { erro: `argumento inesperado: ${a}` };
    saida[m[1]] = m[2] ?? true;
  }
  const conhecidos = new Set(["ambiente", "app", "fly", "lista"]);
  for (const k of Object.keys(saida)) {
    if (!conhecidos.has(k)) return { erro: `opção desconhecida: --${k}` };
  }
  const quer =
    saida.ambiente !== undefined ||
    saida.app !== undefined ||
    saida.fly !== undefined ||
    saida.lista !== undefined;
  if (quer) {
    if (!["hml", "prod"].includes(saida.ambiente))
      return { erro: "--ambiente precisa ser hml ou prod" };
    if (!APPS.includes(saida.app)) return { erro: `--app precisa ser ${APPS.join(" ou ")}` };
    if (
      saida.fly !== undefined &&
      (saida.fly === true || !/^[a-z0-9][a-z0-9-]*$/.test(saida.fly))
    ) {
      return { erro: "--fly precisa ser o nome do app no Fly" };
    }
    if (saida.lista === true)
      return { erro: "--lista precisa de um arquivo, ou - para a entrada padrão" };
  }
  return { ...saida, comparar: quer };
}

async function principal() {
  const args = lerArgumentos(process.argv.slice(2));
  if (args.erro) {
    console.error(`conferir-ambiente: ${args.erro}`);
    console.error(
      "uso: node scripts/conferir-ambiente.mjs [--ambiente=hml|prod --app=api|console [--fly=NOME] [--lista=ARQUIVO|-]]",
    );
    console.error(
      "     node scripts/conferir-ambiente.mjs --extensoes [--ambiente=hml|prod] [--esquema=extensions] [--fatos=ARQUIVO|-]",
    );
    process.exit(2);
  }
  if (args.extensoes) process.exit(await executarExtensoes(args));
  let matriz;
  try {
    matriz = lerMatriz();
  } catch (erro) {
    console.error(`conferir-ambiente: não consegui ler scripts/ambientes.json (${erro.message})`);
    process.exit(2);
  }

  if (!args.comparar) {
    const { problemas, avisos } = conferirRepositorio({ matriz });
    for (const a of avisos) console.log(`aviso: ${a}`);
    if (problemas.length > 0) {
      for (const t of problemas) console.error(`PROBLEMA: ${t}`);
      console.error(`conferir-ambiente: ${problemas.length} problema(s)`);
      process.exit(1);
    }
    console.log("conferir-ambiente: o repositório bate com scripts/ambientes.json");
    return;
  }

  let bruto;
  if (args.lista !== undefined) {
    bruto = args.lista === "-" ? readFileSync(0, "utf8") : readFileSync(args.lista, "utf8");
  } else {
    const nomeNoFly = args.fly ?? matriz.ambientes[args.ambiente].appsNoFly[args.app];
    if (!nomeNoFly) {
      console.error(
        `conferir-ambiente: a matriz ainda não tem o app de ${args.app} em ${args.ambiente.toUpperCase()}; passe --fly=NOME`,
      );
      process.exit(2);
    }
    try {
      bruto = execFileSync("fly", ["secrets", "list", "-a", nomeNoFly, "--json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (erro) {
      console.error(
        `conferir-ambiente: o comando \`fly secrets list -a ${nomeNoFly} --json\` falhou (${erro.code ?? "sem código"}). Entre com \`fly auth login\` ou use --lista=ARQUIVO.`,
      );
      process.exit(2);
    }
  }
  let nomes;
  try {
    nomes = lerNomesDeSegredos(bruto);
  } catch (erro) {
    console.error(`conferir-ambiente: ${erro.message}`);
    process.exit(2);
  }
  const resultado = compararNomes({ matriz, app: args.app, ambiente: args.ambiente, nomes });
  for (const linha of formatarComparacao({
    app: args.app,
    ambiente: args.ambiente,
    nomes,
    resultado,
  }))
    console.log(linha);
  if (reprovou(resultado)) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
