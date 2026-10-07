/**
 * Prova que o portão local alcança o aplicativo de campo.
 *
 * Estes testes existem por um motivo específico: até agora o aplicativo era
 * verificado só na integração contínua, e o que garantia isso era um arquivo
 * YAML que ninguém executa na máquina. Um portão que só existe no runner é um
 * portão que se descobre quebrado depois do push.
 *
 * Então aqui se testa duas coisas diferentes, e vale distinguir:
 *
 * - A REGRA: quando falhar, quando pular, o que compilar antes, e como se
 *   contam os casos de teste do aplicativo. Isso é lógica, e se testa direto.
 * - A FIAÇÃO: que `npm run verificar` de fato passa por `test:campo`, e que o
 *   conferidor de números de fato pergunta pelo aplicativo. Isso é uma
 *   verificação de texto do `package.json` e do script, e é assumidamente
 *   grosseira. Ela existe porque o defeito ERA a fiação: a regra podia estar
 *   perfeita e continuar sem ser chamada por ninguém.
 *
 * Roda no executor embutido do node (`node --test`), e não no vitest, de
 * propósito: `scripts/` não é workspace, não tem `node_modules` próprio, e
 * arrastar um executor para cá seria dependência nova para testar um script de
 * quarenta linhas.
 *
 * Rodar:  npm run test:scripts
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { planejar, planejarCacheDeRotas, rotaDoArquivo, rotasQueFaltamNoCache } from "./testar-campo.mjs";
import { arquivosDeTeste, contarCasos, contarCasosDoAplicativo } from "./casos-do-aplicativo.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

/** Finge um disco: só os caminhos listados existem. */
function disco(...presentes) {
  const conjunto = new Set(presentes);
  return (relativo) => conjunto.has(relativo);
}

/* ---------- A regra: quando falhar, quando pular, o que compilar ---------- */

test("sem as dependências do aplicativo, falha e diz o comando exato", () => {
  const plano = planejar({ ambiente: {}, existe: disco() });

  assert.equal(plano.acao, "falhar");
  // O comando literal importa: instrução aproximada obriga a pessoa a
  // adivinhar, e adivinhar num repositório com dois lockfiles dá errado.
  assert.equal(plano.comando, "npm ci --prefix apps/campo");
  assert.match(plano.motivo, /apps\/campo\/node_modules/);
});

test("a falha por dependência ausente aponta o escape, em vez de deixar a pessoa presa", () => {
  const plano = planejar({ ambiente: {}, existe: disco() });

  assert.equal(plano.escape, "DC360_SEM_APP=1");
});

test("o escape só vale ligado em 1: variável presente com outro valor não pula", () => {
  // Sem isto, um `DC360_SEM_APP=0` deixado no shell desligaria o portão em
  // silêncio, que é o oposto do que quem escreveu `=0` quis dizer.
  for (const valor of ["0", "", "false", "sim"]) {
    const plano = planejar({ ambiente: { DC360_SEM_APP: valor }, existe: disco() });
    assert.equal(plano.acao, "falhar", `DC360_SEM_APP=${valor} não pode pular`);
  }
});

test("DC360_SEM_APP=1 pula mesmo com as dependências instaladas", () => {
  const plano = planejar({
    ambiente: { DC360_SEM_APP: "1" },
    existe: disco("apps/campo/node_modules", "packages/shared/dist", "packages/campo/dist"),
  });

  // Se pulasse só quando a pasta falta, a mesma variável às vezes custaria
  // seis minutos e às vezes zero, dependendo do que houvesse no disco.
  assert.equal(plano.acao, "pular");
});

test("com tudo no lugar, roda sem mandar compilar nada", () => {
  const plano = planejar({
    ambiente: {},
    existe: disco("apps/campo/node_modules", "packages/shared/dist", "packages/campo/dist"),
  });

  assert.equal(plano.acao, "rodar");
  assert.deepEqual(plano.compilar, []);
});

test("dist ausente entra na lista de compilação, e shared vem antes de campo", () => {
  const plano = planejar({ ambiente: {}, existe: disco("apps/campo/node_modules") });

  // A ordem não é estética: `@dc360/campo` importa `@dc360/shared`, e compilar
  // na ordem trocada deixa o build sem os tipos de que depende.
  assert.deepEqual(plano.compilar.map((c) => c.pacote), ["@dc360/shared", "@dc360/campo"]);
});

test("dist que já existe não é recompilado", () => {
  const plano = planejar({
    ambiente: {},
    existe: disco("apps/campo/node_modules", "packages/shared/dist"),
  });

  assert.deepEqual(plano.compilar.map((c) => c.pacote), ["@dc360/campo"]);
});

/* ---------- A regra: como se contam os casos do aplicativo ---------- */

test("conta it e test abrindo a linha, com ou sem sufixo", () => {
  const fonte = [
    'it("um", () => {});',
    '  test("dois", () => {});',
    '  it.only("três", () => {});',
    '  test.skip("quatro", () => {});',
    '\tit ("cinco", () => {});',
  ].join("\n");

  assert.equal(contarCasos(fonte), 5);
});

test("não conta describe, comentário, nem palavra terminada em it ou test", () => {
  const fonte = [
    'describe("um bloco", () => {});',
    '// it("caso comentado", () => {});',
    '  const url = await visit("/rota");',
    '  const x = omit(objeto, ["a"]);',
    '  expect(latest("x")).toBe(1);',
    '  const dentro = it("isto está no meio da linha", () => {});',
  ].join("\n");

  // A última linha é o caso interessante: `it(` existe ali, mas não abre a
  // linha. A regra é burra de propósito, e errar para MENOS faz o portão
  // reclamar; errar para mais infla o número em silêncio.
  assert.equal(contarCasos(fonte), 0);
});

test("it.each com tabela literal vale uma vez por linha, e não uma vez só", () => {
  // Este é o defeito que a primeira versão tinha: contava linha de código, e o
  // jest conta caso executado. Três `it.each` de dois temas viraram uma
  // divergência de 34 contra 37 no mesmo dia em que o script nasceu.
  const fonte = [
    '  it.each([["light"], ["dark"]])("no tema %s", () => {});',
    '  test.each([1, 2, 3])("com %i", () => {});',
  ].join("\n");

  assert.equal(contarCasos(fonte), 5);
});

test("it.each resolve tabela declarada como constante no mesmo arquivo", () => {
  const fonte = [
    'const OS_DOIS_TEMAS: Array<"light" | "dark"> = ["light", "dark"];',
    '',
    '  it.each(OS_DOIS_TEMAS)(',
    '    "no tema %s, tem contraste AA",',
    '    async (esquema) => {},',
    '  );',
  ].join("\n");

  assert.equal(contarCasos(fonte), 2);
});

test("vírgula sobrando no fim da tabela não inventa um caso", () => {
  // `[a, b,]` tem dois elementos. Contar vírgula daria três, e um a mais é
  // exatamente o tipo de erro que ninguém percebe olhando o README.
  assert.equal(contarCasos('  it.each(["light", "dark",])("tema %s", () => {});'), 2);
});

test("it.each com tabela em template conta as linhas, menos o cabeçalho", () => {
  const fonte = [
    "  it.each`",
    "    entrada | esperado",
    "    ${1}    | ${2}",
    "    ${3}    | ${4}",
    "    ${5}    | ${6}",
    '  `("$entrada vira $esperado", () => {});',
  ].join("\n");

  assert.equal(contarCasos(fonte), 3);
});

test("each que a leitura não sabe resolver estoura, e diz onde", () => {
  // Devolver um número menor seria pior: o portão ficaria verde afirmando um
  // README falso. Estourar obriga alguém a olhar.
  const fonte = ["", '  it.each(montarTabela())("caso %s", () => {});'].join("\n");

  assert.throws(
    () => contarCasos(fonte, "algum.test.ts"),
    /algum\.test\.ts:2:.*não sei quantos casos/s,
  );
});

test("describe.each estoura, porque multiplica tudo que está dentro do bloco", () => {
  const fonte = [
    '  describe.each(["light", "dark"])("no tema %s", () => {',
    '    it("um", () => {});',
    '    it("dois", () => {});',
    "  });",
  ].join("\n");

  assert.throws(() => contarCasos(fonte, "outro.test.ts"), /describe\.each/);
});

test("a varredura ignora node_modules e dist, que só guardam cópia", () => {
  const pasta = mkdtempSync(join(tmpdir(), "dc360-casos-"));
  mkdirSync(join(pasta, "src"), { recursive: true });
  mkdirSync(join(pasta, "node_modules", "algum-pacote"), { recursive: true });
  mkdirSync(join(pasta, "dist"), { recursive: true });

  writeFileSync(join(pasta, "src", "a.test.ts"), 'it("um", () => {});\nit("dois", () => {});\n');
  writeFileSync(join(pasta, "node_modules", "algum-pacote", "b.test.js"), 'it("de fora", () => {});\n');
  writeFileSync(join(pasta, "dist", "a.test.js"), 'it("cópia compilada", () => {});\n');

  assert.deepEqual([...contarCasosDoAplicativo(pasta)], [["src/a.test.ts", 2]]);
});

test("o aplicativo de campo tem casos de teste, e cada arquivo achado tem pelo menos um", () => {
  const porArquivo = contarCasosDoAplicativo(join(RAIZ, "apps/campo"));

  // Zero aqui não é "tudo certo": é a varredura tendo perdido o caminho. Foi
  // assim que o número do README ficaria verde medindo nada.
  assert.ok(porArquivo.size > 0, "nenhum arquivo de teste achado em apps/campo");
  for (const [arquivo, quantos] of porArquivo) {
    assert.ok(quantos > 0, `${arquivo} foi contado como arquivo de teste e não tem nenhum caso`);
  }
});

test("a varredura do aplicativo não sai de apps/campo", () => {
  const achados = arquivosDeTeste(join(RAIZ, "apps/campo"));

  for (const caminho of achados) {
    assert.ok(caminho.startsWith(join(RAIZ, "apps/campo")), `${caminho} está fora do aplicativo`);
    assert.ok(!caminho.includes("node_modules"), `${caminho} veio de node_modules`);
  }
});

/* ---------- O cache de rotas tipadas do expo-router (V2-F00-E21) ---------- */

/** Trecho no formato que o `expo start` grava em `.expo/types/router.d.ts`. */
const CACHE_DE_AGOSTO = "{ pathname: `/entrar`; } | { pathname: `/`; } | `/conta` | `/fila` | `/vistoria/[id]`";

test("o arquivo de src/app vira a rota que o expo-router publica", () => {
  assert.equal(rotaDoArquivo("(agente)/perfil.tsx"), "/perfil");
  assert.equal(rotaDoArquivo("(agente)\\vistoria\\[id].tsx"), "/vistoria/[id]");
  assert.equal(rotaDoArquivo("(agente)/index.tsx"), "/");
  assert.equal(rotaDoArquivo("entrar.tsx"), "/entrar");
  for (const naoRota of ["_layout.tsx", "(agente)/_layout.tsx", "+not-found.tsx", "+html.tsx", "LEIA.md", "x.test.tsx"]) {
    assert.equal(rotaDoArquivo(naoRota), null, `${naoRota} não é rota`);
  }
});

test("cache velho que não conhece as rotas novas é apagado, e diz quais faltam", () => {
  const plano = planejarCacheDeRotas({
    rotas: ["/entrar", "/", "/fila", "/vistoria/[id]", "/mapa", "/perfil", "/avisos"],
    ler: () => CACHE_DE_AGOSTO,
  });
  assert.equal(plano.acao, "apagar");
  assert.equal(plano.alvo, "apps/campo/.expo/types");
  assert.deepEqual(plano.faltam, ["/mapa", "/perfil", "/avisos"]);
  assert.match(plano.motivo, /\/mapa, \/perfil, \/avisos/);
});

test("cache em dia fica, para não perder a checagem de rota tipada", () => {
  const plano = planejarCacheDeRotas({ rotas: ["/entrar", "/", "/fila", "/vistoria/[id]"], ler: () => CACHE_DE_AGOSTO });
  assert.equal(plano.acao, "manter");
});

test("sem cache não há nada a apagar", () => {
  assert.equal(planejarCacheDeRotas({ rotas: ["/perfil"], ler: () => null }).acao, "nada");
});

test("rota que é prefixo de outra não conta como presente", () => {
  // `/fila` não pode valer por `/filas`: a crase que fecha o literal é o que separa.
  assert.deepEqual(rotasQueFaltamNoCache(["/fila"], "`/filas`"), ["/fila"]);
});

test("as rotas reais do aplicativo saem do disco, e o cache de 2026-08-27 seria apagado por elas", () => {
  const pasta = join(RAIZ, "apps/campo/src/app");
  const rotas = readdirSync(pasta, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => rotaDoArquivo(relative(pasta, join(e.parentPath ?? e.path, e.name))))
    .filter(Boolean);
  for (const esperada of ["/", "/entrar", "/fila", "/mapa", "/perfil", "/avisos", "/vistoria/[id]"]) {
    assert.ok(rotas.includes(esperada), `${esperada} não saiu de src/app`);
  }
  assert.equal(planejarCacheDeRotas({ rotas, ler: () => CACHE_DE_AGOSTO }).acao, "apagar");
});

test("o test:campo limpa o cache ANTES do typecheck, não depois", () => {
  const fonte = readFileSync(join(AQUI, "testar-campo.mjs"), "utf8");
  const limpa = fonte.indexOf("limparCacheDeRotasVelho();");
  const tipa = fonte.indexOf('rodar(["run", "typecheck"');
  assert.ok(limpa > 0 && tipa > limpa, "a limpeza do cache tem de vir antes do typecheck");
});

/* ---------- A fiação: os comandos da raiz precisam CHAMAR isto ---------- */

const PACOTE = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));

test("existe o comando test:campo, e ele chama este script", () => {
  assert.match(PACOTE.scripts["test:campo"] ?? "", /scripts\/testar-campo\.mjs/);
});

test("npm run verificar alcança o aplicativo de campo", () => {
  // O defeito que este teste tranca: o portão local media tudo menos o
  // aplicativo. A regra podia estar impecável e continuar sem ser chamada.
  assert.match(PACOTE.scripts["verificar"] ?? "", /\btest:campo\b/);
});

test("o conferidor de números pergunta pelo aplicativo", () => {
  // Verificação de texto, e assumidamente grosseira: rodar o conferidor aqui
  // significaria chamar o `vitest list` dos cinco pacotes, que é lento e é
  // justamente o motivo de ele viver fora do `npm test`.
  const fonte = readFileSync(join(RAIZ, "scripts/conferir-numeros.mjs"), "utf8");

  assert.match(fonte, /contarCasosDoAplicativo/);
  assert.match(fonte, /casos-do-aplicativo\.mjs/);
});
