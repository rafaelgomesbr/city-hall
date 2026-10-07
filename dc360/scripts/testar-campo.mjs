#!/usr/bin/env node
/**
 * Faz o portão local alcançar o aplicativo de campo.
 *
 * O buraco que este arquivo fecha: `npm run verificar` na raiz media tudo
 * menos o aplicativo. Não por descuido, e sim porque `apps/campo` fica FORA do
 * `workspaces` de propósito (o Expo traz quase seiscentos pacotes, e o
 * Dockerfile da API copia só os `package.json` dos workspaces; pôr o
 * aplicativo lá dentro quebraria a imagem). O efeito colateral é que nenhum
 * comando da raiz enxergava o aplicativo, e a integração contínua era o único
 * lugar do mundo onde ele era testado. Quem quebrasse o aplicativo na máquina
 * via verde local e descobria minutos depois, no runner.
 *
 * Três decisões que valem explicação:
 *
 * 1. SEM AS DEPENDÊNCIAS INSTALADAS, ISTO FALHA. Não pula em silêncio. Pular
 *    em silêncio é como um portão vira decoração: a máquina sem `node_modules`
 *    é justamente a máquina nova, onde o aplicativo nunca foi verificado, e é
 *    onde um verde falso engana mais.
 *
 * 2. O escape existe, mas é barulhento e deliberado: `DC360_SEM_APP=1`. Quem
 *    só quer mexer na API não deve ser obrigado a baixar o React Native, mas
 *    precisa dizer isso em voz alta e ver escrito que o aplicativo não foi
 *    verificado.
 *
 * 3. Os pacotes compartilhados são compilados antes. O aplicativo consome
 *    `@dc360/shared` e `@dc360/campo` pelo `dist`, e não pelo TypeScript de
 *    origem. Sem o `dist`, o typecheck do aplicativo falha por falta de tipos,
 *    o que parece defeito do aplicativo e não é.
 *
 * No fim ele faz uma quarta coisa, que não é teste e sim conferência de
 * honestidade: pergunta ao jest quantos casos ele executou e compara com a
 * contagem que `conferir:numeros` faz lendo o código. As duas TÊM que bater. É
 * aqui, e só aqui, que dá para cruzar as duas, porque este é o único comando
 * que sabe que as dependências do aplicativo existem. Na primeira versão elas
 * não batiam (o script dizia 34, o jest dizia 37, e a diferença eram três
 * `it.each` valendo dois cada), e o número do README seria falso sem ninguém
 * notar.
 *
 * O que ele NÃO faz, dito na cara: confere que o `dist` EXISTE, não que está
 * atualizado. `dist` velho passa aqui. Quem mexeu no pacote compartilhado
 * roda `npm run build:shared`, e a integração contínua sempre compila do zero.
 *
 * Rodar:  npm run test:campo
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { contarCasosDoAplicativo } from "./casos-do-aplicativo.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/*
  A ordem importa: `@dc360/campo` importa `@dc360/shared`, então compilar o
  segundo antes do primeiro deixa o build do primeiro sem tipos.
*/
const COMPARTILHADOS = [
  { pacote: "@dc360/shared", dist: "packages/shared/dist" },
  { pacote: "@dc360/campo", dist: "packages/campo/dist" },
];

const ESCAPE = "DC360_SEM_APP";
const INSTALAR = "npm ci --prefix apps/campo";

/**
 * Decide o que fazer, sem tocar em nada. Separado da execução para poder ser
 * testado: a regra "falha quando falta, a menos que o escape esteja ligado" é
 * a parte que precisa continuar valendo, e ela não se prova rodando jest.
 *
 * `existe` recebe caminho relativo à raiz do dc360.
 */
export function planejar({ ambiente, existe }) {
  /*
    O escape é checado ANTES da presença das dependências, e não só no caso em
    que elas faltam. Quem liga `DC360_SEM_APP=1` está dizendo "não meça o
    aplicativo agora", e medir mesmo assim porque por acaso a pasta existe
    tornaria a variável imprevisível: às vezes rápida, às vezes seis minutos.
  */
  if (ambiente[ESCAPE] === "1") {
    return { acao: "pular", motivo: `${ESCAPE}=1 está no ambiente` };
  }

  if (!existe("apps/campo/node_modules")) {
    return {
      acao: "falhar",
      motivo: "apps/campo/node_modules não existe: as dependências do aplicativo nunca foram instaladas nesta máquina",
      comando: INSTALAR,
      escape: `${ESCAPE}=1`,
    };
  }

  return { acao: "rodar", compilar: COMPARTILHADOS.filter((c) => !existe(c.dist)) };
}

/*
  O cache de rotas tipadas do expo-router (V2-F00-E21).

  Com `experiments.typedRoutes` ligado no `app.config.ts`, o `expo start` grava
  em `apps/campo/.expo/types/router.d.ts` a lista das rotas que existiam
  NAQUELE momento, e o `tsconfig` do aplicativo inclui esse arquivo. Ele é
  gerado, é por máquina e o `.gitignore` do aplicativo o deixa fora do git
  (`.expo/`), então ninguém o atualiza a não ser o próprio `expo start`. Numa
  máquina onde o Expo não roda há semanas, o arquivo velho não conhece as rotas
  novas e o typecheck reprova `router.push("/perfil")` como se a rota não
  existisse: em 2026-10-07, dois TS2345 (`perfil.tsx` e `Sino.tsx`) por um
  `router.d.ts` de 2026-08-27 sem `mapa`, `perfil` e `avisos`. Sem o arquivo o
  typecheck passa limpo, porque o `href` volta a ser texto.

  Então, antes do typecheck, o arquivo é conferido contra as rotas que existem
  no disco, e só é apagado quando falta alguma. Apagar sempre também
  funcionaria, mas jogaria fora a checagem de rota tipada justamente na máquina
  em que o cache está em dia. O próximo `expo start` o recria.
*/
const PASTA_DE_ROTAS = "apps/campo/src/app";
const TIPOS_DE_ROTA = "apps/campo/.expo/types";
const ARQUIVO_DE_ROTAS = `${TIPOS_DE_ROTA}/router.d.ts`;

/**
 * Converte o caminho de um arquivo de `src/app` na rota que o expo-router
 * publica, ou `null` quando o arquivo não é rota.
 *
 * Regras do expo-router que importam aqui: `_layout` e `_sitemap` não são
 * rota, `+html` e `+not-found` também não; grupo entre parênteses some do
 * caminho; `index` é a raiz da pasta.
 */
export function rotaDoArquivo(relativo) {
  const partes = relativo.replaceAll("\\", "/").split("/");
  const arquivo = partes.pop();
  const nome = arquivo.replace(/\.(tsx|ts|jsx|js)$/, "");
  if (nome === arquivo || /^[_+]/.test(nome) || /\.(test|spec)$/.test(nome)) return null;
  const segmentos = partes.filter((p) => !/^\(.*\)$/.test(p));
  if (nome !== "index") segmentos.push(nome);
  return `/${segmentos.join("/")}`;
}

/** Rotas que o arquivo de tipos gerado não conhece. Vazio quando está em dia. */
export function rotasQueFaltamNoCache(rotas, conteudo) {
  // Toda rota aparece no arquivo gerado como literal fechado por crase.
  return [...new Set(rotas)].filter((rota) => !conteudo.includes(`${rota}\``));
}

function arquivosDeRota(pasta) {
  return readdirSync(pasta, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(pasta, join(e.parentPath ?? e.path, e.name)));
}

/**
 * Decide o que fazer com o cache, sem tocar em nada (testável com disco
 * falso). `ler` devolve o conteúdo do arquivo de rotas, ou `null` se ele não
 * existe.
 */
export function planejarCacheDeRotas({ rotas, ler }) {
  const conteudo = ler(ARQUIVO_DE_ROTAS);
  if (conteudo === null) return { acao: "nada", motivo: "não há cache de rotas tipadas" };
  const faltam = rotasQueFaltamNoCache(rotas, conteudo);
  if (faltam.length === 0) return { acao: "manter", motivo: "o cache de rotas tipadas conhece todas as rotas" };
  return { acao: "apagar", alvo: TIPOS_DE_ROTA, faltam, motivo: `o cache de rotas tipadas não conhece ${faltam.join(", ")}` };
}

function limparCacheDeRotasVelho() {
  const rotas = arquivosDeRota(join(RAIZ, PASTA_DE_ROTAS)).map(rotaDoArquivo).filter(Boolean);
  const plano = planejarCacheDeRotas({
    rotas,
    ler: (relativo) => (existsSync(join(RAIZ, relativo)) ? readFileSync(join(RAIZ, relativo), "utf8") : null),
  });
  if (plano.acao === "apagar") {
    console.log(`\n== Cache .expo/types desatualizado (${plano.motivo}): apagado, o próximo \`expo start\` o recria ==`);
    rmSync(join(RAIZ, plano.alvo), { recursive: true, force: true });
  } else {
    console.log(`\n== Cache .expo/types: ${plano.motivo} ==`);
  }
}

/*
  Síncrono e com a saída herdada: quem roda isto quer ver o jest falando em
  tempo real, e não um bloco de texto guardado até o fim. `shell` no Windows
  porque lá `npm` é `npm.cmd`, e `spawn` sem shell falha com EINVAL.
*/
function rodar(argumentos) {
  const r = spawnSync("npm", argumentos, {
    cwd: RAIZ, stdio: "inherit", shell: process.platform === "win32",
  });
  if (r.error) throw r.error;
  const status = r.status ?? 1;
  if (status !== 0) {
    console.error(`\nFALHOU: npm ${argumentos.join(" ")} saiu com ${status}.`);
    process.exit(status);
  }
}

/*
  Caminho RELATIVO à raiz do aplicativo de propósito. O absoluto passaria pelo
  `shell: true` do Windows, e raiz de repositório com espaço no nome viraria
  dois argumentos, com o jest escrevendo em lugar nenhum e a conferência
  abaixo acusando divergência que não existe.

  Fica dentro de `node_modules` porque lá já é território ignorado pelo git: um
  relatório de execução não é fonte, e não pode virar arquivo pendente no
  `git status` de quem só rodou a suíte.
*/
const RELATIVO_DO_RELATORIO = "node_modules/.cache/dc360-contagem.json";
const RELATORIO = join(RAIZ, "apps/campo", RELATIVO_DO_RELATORIO);

/**
 * Cruza o que o jest EXECUTOU com o que o conferidor de números LÊ do código.
 *
 * Existe porque a contagem por leitura é uma aposta, e aposta sem árbitro
 * envelhece: `it.each` já fez o número divergir uma vez. Aqui as duas contas
 * se encontram, no único comando que tem o aplicativo instalado à mão.
 */
function conferirContagem() {
  let relatorio;
  try {
    relatorio = JSON.parse(readFileSync(RELATORIO, "utf8"));
  } catch (erro) {
    console.error(`\nFALHA: o jest não deixou o relatório em ${RELATIVO_DO_RELATORIO} (${erro.message}).`);
    console.error("Sem ele não dá para cruzar a contagem, e cruzar é o ponto.");
    process.exit(1);
  }

  const porArquivo = contarCasosDoAplicativo(join(RAIZ, "apps/campo"));
  const lido = [...porArquivo.values()].reduce((a, b) => a + b, 0);
  const executado = relatorio.numTotalTests;

  if (lido !== executado) {
    console.error(`\nFALHA: o jest executou ${executado} casos e a leitura do código conta ${lido}.`);
    console.error("\nPor arquivo, o que a leitura viu:");
    for (const [arquivo, quantos] of porArquivo) console.error(`  ${String(quantos).padStart(4)}  ${arquivo}`);
    console.error(
      "\nO conferidor de números do README usa essa leitura. Enquanto as duas não\n" +
      "baterem, qualquer número que o README afirmar sobre o aplicativo é chute.\n" +
      "Ensine `scripts/casos-do-aplicativo.mjs` a ver o que ele está perdendo.",
    );
    process.exit(1);
  }

  console.log(`\nA leitura do código e o jest concordam: ${executado} casos.`);
}

function principal() {
  const plano = planejar({
    ambiente: process.env,
    existe: (relativo) => existsSync(join(RAIZ, relativo)),
  });

  if (plano.acao === "pular") {
    console.log(`\nAPLICATIVO DE CAMPO NÃO VERIFICADO: ${plano.motivo}.`);
    console.log("Nada foi rodado. Verde aqui não diz nada sobre o aplicativo.");
    return;
  }

  if (plano.acao === "falhar") {
    console.error(`\nFALHA: ${plano.motivo}.`);
    console.error(`\nInstale as dependências do aplicativo:\n\n    ${plano.comando}\n`);
    console.error("Ou, se a intenção é mesmo deixar o aplicativo sem verificação:\n");
    console.error(`    ${plano.escape} npm run test:campo\n`);
    process.exit(1);
  }

  for (const alvo of plano.compilar) {
    console.log(`\n== Compilando ${alvo.pacote}: o aplicativo consome o dist, não a origem ==`);
    rodar(["run", "build", "--workspace", alvo.pacote]);
  }

  limparCacheDeRotasVelho();

  console.log("\n== TypeScript estrito do aplicativo de campo ==");
  rodar(["run", "typecheck", "--prefix", "apps/campo"]);

  console.log("\n== Testes do aplicativo de campo ==");
  /*
    O relatório é apagado ANTES da execução. Se o jest morrer sem escrever, o
    arquivo da execução anterior ficaria no lugar e a conferência abaixo
    compararia com um número de ontem, dando verde por inércia.
  */
  mkdirSync(dirname(RELATORIO), { recursive: true });
  rmSync(RELATORIO, { force: true });
  rodar(["test", "--prefix", "apps/campo", "--", "--json", `--outputFile=${RELATIVO_DO_RELATORIO}`]);

  conferirContagem();

  console.log("\nO aplicativo de campo passou: tipos limpos e testes verdes.");
}

/*
  Só executa quando chamado como programa. Sem esta guarda, o arquivo de teste
  que importa `planejar` dispararia o jest do aplicativo inteiro no momento do
  `import`, o que é exatamente o tipo de surpresa que faz alguém desistir de
  rodar a suíte.
*/
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  principal();
}
