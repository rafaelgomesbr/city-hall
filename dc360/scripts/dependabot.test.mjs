/**
 * A configuração de atualização de dependências (V2-F01-E06) prende as travas
 * que a política exige, e o workflow da auditoria semanal segue as regras do CI.
 *
 * Por que um teste de configuração: a prova real da etapa é o PR automático do
 * Dependabot, que só existe depois do merge no ramo padrão. Até lá, e depois
 * dela, a trava que mais importa é a negativa: "major de expo NÃO gera PR".
 * Uma edição bem-intencionada do `dependabot.yml` que apague o `ignore` do Expo
 * abriria, na segunda-feira seguinte, um PR que mistura SDK 57 e 58 no
 * aplicativo de campo (o que o CP-03 descartou). Este teste vermelha antes.
 *
 * O repositório não tem biblioteca de YAML (e o CI não instala nada para a
 * raiz), então a leitura é por blocos de texto, sobre o formato que o próprio
 * arquivo usa: uma lista `updates:` em que cada item começa em
 * `  - package-ecosystem:`. Se alguém reformatar o arquivo de outro jeito, o
 * teste reclama de não achar o bloco, que é o comportamento desejado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ_DO_REPO = fileURLToPath(new URL("../..", import.meta.url));
const ler = (relativo) => readFileSync(new URL(relativo, new URL("../../", import.meta.url)), "utf8");

const MAJOR = "version-update:semver-major";
const MINOR = "version-update:semver-minor";
const PATCH = "version-update:semver-patch";

/** Quebra o texto do dependabot.yml em um bloco por `package-ecosystem`. */
function blocos(texto) {
  const partes = texto.split(/^  - package-ecosystem:/m).slice(1);
  return partes.map((parte) => {
    const completo = "package-ecosystem:" + parte;
    const ecossistema = /^package-ecosystem:\s*"?([^"\s]+)"?/.exec(completo)?.[1];
    const diretorio = /^\s+directory:\s*"?([^"\s]+)"?/m.exec(completo)?.[1];
    const intervalo = /^\s+interval:\s*"?([^"\s]+)"?/m.exec(completo)?.[1];
    // Cada regra de `ignore` é um par `dependency-name` + `update-types` na linha seguinte.
    const ignore = {};
    for (const m of completo.matchAll(/^\s+- dependency-name:\s*"([^"]+)"\s*\n\s+update-types:\s*\[([^\]]*)\]/gm)) {
      ignore[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((t) => t[1]);
    }
    return { ecossistema, diretorio, intervalo, texto: completo, ignore };
  });
}

const config = ler(".github/dependabot.yml");
const todos = blocos(config);
const achar = (eco, dir) => todos.find((b) => b.ecossistema === eco && b.diretorio === dir);

/**
 * As verificações em funções puras, para o teste negativo poder aplicá-las a um
 * arquivo sintético estragado e provar que elas mordem.
 */
function problemasDoAplicativo(texto) {
  const bloco = blocos(texto).find((b) => b.ecossistema === "npm" && b.diretorio === "/dc360/apps/campo");
  if (!bloco) return ["falta o bloco npm de /dc360/apps/campo"];
  const problemas = [];
  for (const nome of ["expo", "react-native", "react-native-reanimated", "react-native-worklets"]) {
    const tipos = bloco.ignore[nome] ?? [];
    if (!tipos.includes(MAJOR)) problemas.push(`${nome}: major não está ignorado`);
    if (!tipos.includes(MINOR)) problemas.push(`${nome}: minor não está ignorado`);
    if (tipos.includes(PATCH)) problemas.push(`${nome}: patch não pode ser ignorado (correção de segurança entra por patch)`);
  }
  if (!/expo-sdk-patch:/.test(bloco.texto)) problemas.push("falta o grupo expo-sdk-patch (patch do Expo sobe só em grupo)");
  return problemas;
}

test("os quatro ecossistemas pedidos existem, com as pastas certas, todos semanais", () => {
  assert.ok(achar("npm", "/dc360"), "npm em /dc360");
  assert.ok(achar("npm", "/dc360/apps/campo"), "npm em /dc360/apps/campo");
  assert.ok(achar("github-actions", "/"), "github-actions em /");
  assert.ok(achar("docker", "/dc360"), "docker em /dc360");
  assert.equal(todos.length, 4, "só estas quatro frentes (Renovate e compose ficam de fora)");
  for (const b of todos) assert.equal(b.intervalo, "weekly", `${b.ecossistema} ${b.diretorio} é semanal`);
});

test("as pastas do Dependabot existem de verdade e têm o arquivo que ele lê", () => {
  // Pasta com lockfile ou manifesto inexistente é configuração que não faz nada, em silêncio.
  ler("dc360/package.json");
  ler("dc360/package-lock.json");
  ler("dc360/apps/campo/package.json");
  ler("dc360/apps/campo/package-lock.json");
  ler("dc360/Dockerfile");
  assert.ok(RAIZ_DO_REPO.length > 0);
});

test("NEGATIVO: major e minor de expo, react-native, reanimated e worklets estão ignorados no aplicativo, e patch não", () => {
  assert.deepEqual(problemasDoAplicativo(config), []);
});

test("NEGATIVO: o ignore do Expo cobre também a família atrelada ao SDK", () => {
  const bloco = achar("npm", "/dc360/apps/campo");
  for (const padrao of ["expo-*", "@expo/*", "react-native-*", "@react-native/*", "jest-expo", "react", "react-dom"]) {
    const tipos = bloco.ignore[padrao] ?? [];
    assert.ok(tipos.includes(MAJOR) && tipos.includes(MINOR), `${padrao}: major e minor ignorados`);
  }
});

test("NEGATIVO (o teste morde): config sem o ignore do Expo, ou que ignora patch, é reprovada", () => {
  const semIgnore = config.replace(/ {4}ignore:[\s\S]*? {4}groups:\n {6}expo-sdk-patch:/, "    groups:\n      expo-sdk-patch:");
  assert.notEqual(semIgnore, config, "a fixture sintética precisa ter mudado algo");
  const p1 = problemasDoAplicativo(semIgnore);
  assert.ok(p1.some((p) => p.startsWith("expo: major")), p1.join(" | "));

  const comPatchIgnorado = config.replace(
    /(dependency-name: "expo"\n\s+update-types: \[)([^\]]*)\]/,
    `$1$2, "${PATCH}"]`,
  );
  assert.notEqual(comPatchIgnorado, config);
  assert.ok(problemasDoAplicativo(comPatchIgnorado).some((p) => p.includes("patch não pode ser ignorado")));

  const semGrupo = config.replace("expo-sdk-patch:", "outro-grupo:");
  assert.ok(problemasDoAplicativo(semGrupo).some((p) => p.includes("expo-sdk-patch")));
});

test("patch da família do Expo sobe só em grupo, e o grupo contém os quatro nomeados", () => {
  const bloco = achar("npm", "/dc360/apps/campo");
  const grupo = /expo-sdk-patch:\n([\s\S]*?)\n {6}ferramentas-de-desenvolvimento:/.exec(bloco.texto)?.[1];
  assert.ok(grupo, "grupo expo-sdk-patch");
  for (const nome of ["expo", "react-native", "react-native-*", "expo-*"]) {
    assert.ok(grupo.includes(`"${nome}"`), `${nome} no grupo`);
  }
  assert.match(grupo, /update-types: \["patch"\]/, "o grupo é só de patch");
});

test("docker: major do node ignorado (subir o Node é decisão de plataforma)", () => {
  const b = achar("docker", "/dc360");
  assert.deepEqual(b.ignore.node, [MAJOR]);
});

test("sem auto-merge em lugar nenhum e todo bloco tem cooldown", () => {
  assert.doesNotMatch(config, /^(?!\s*#).*auto-?merge/im, "nenhuma linha de configuração liga auto-merge");
  for (const b of todos) assert.match(b.texto, /cooldown:\n\s+default-days: \d+/, `${b.ecossistema} ${b.diretorio}: cooldown`);
  // Nenhum workflow nem arquivo do GitHub liga auto-merge por conta própria.
  for (const w of ["verificar.yml", "auditoria-semanal.yml"]) {
    assert.doesNotMatch(ler(`.github/workflows/${w}`), /gh pr merge|--auto|enablePullRequestAutoMerge|dependabot\/fetch-metadata/, `${w} não faz merge`);
  }
});

// ----- workflow da auditoria semanal -----

const workflow = ler(".github/workflows/auditoria-semanal.yml");

test("auditoria semanal: agenda semanal, disparo manual e nenhum gatilho de PR", () => {
  assert.match(workflow, /^on:\n {2}schedule:\n\s+(#.*\n\s+)*- cron: "\d+ \d+ \* \* \d"/m, "cron semanal (dia da semana fixo)");
  assert.match(workflow, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(pull_request|pull_request_target|push):/m, "agenda não roda código de PR de fora");
});

test("auditoria semanal: regras do CI (permissões mínimas, timeout, runner fixo, ações por SHA)", () => {
  assert.match(workflow, /^permissions:\n {2}contents: read\n(?!\s+\S+: )/m, "permissions só com contents: read");
  assert.doesNotMatch(workflow, /:\s*write\b/, "nenhuma permissão de escrita");
  assert.match(workflow, /timeout-minutes: \d+/);
  assert.match(workflow, /runs-on: ubuntu-24\.04\b/);
  assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/);
  const usos = [...workflow.matchAll(/^\s*(?:- )?uses:\s*(\S+)(.*)$/gm)];
  assert.ok(usos.length >= 3, "checkout, setup-node e upload-artifact");
  for (const [, acao, resto] of usos) {
    assert.match(acao, /@[0-9a-f]{40}$/, `${acao}: fixada por SHA completo`);
    assert.match(resto, /# v\d+\.\d+\.\d+/, `${acao}: versão em comentário`);
  }
});

test("auditoria semanal: roda o portão do CP-03 pelo node e não mascara a falha", () => {
  assert.match(workflow, /run: node scripts\/auditar\.mjs 2>&1 \| tee /);
  assert.match(workflow, /shell: bash/, "bash liga o pipefail do tee");
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.doesNotMatch(workflow, /npm audit/, "usa o portão, não o npm audit cru");
  assert.doesNotMatch(workflow, /\|\| true/);
});

// ----- a documentação diz o que a configuração faz -----

test("DEPENDENCIAS.md existe, cita o CP-03, os quatro pacotes e marca os prazos como proposta", () => {
  const doc = ler("dc360/docs/DEPENDENCIAS.md");
  for (const termo of ["CP-03", "expo", "react-native", "react-native-reanimated", "react-native-worklets",
    "auditoria-semanal.yml", "dependabot.yml", "2027-01-05", "7 dias", "30 dias", "PROPOSTA", "auto-merge"]) {
    assert.ok(doc.includes(termo), `DEPENDENCIAS.md cita ${termo}`);
  }
  assert.ok(!doc.includes("\u2014"), "sem travessão");
  assert.ok(!config.includes("\u2014") && !workflow.includes("\u2014"), "sem travessão nos arquivos de configuração");
});
