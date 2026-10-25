/**
 * Prende os perfis de `apps/campo/eas.json` à identidade do aplicativo e ao
 * contrato de ambientes (V2-F01-E13).
 *
 * ## O defeito que isto fecha
 *
 * O perfil `homologacao` apontava para `api-homologacao.exemplo.gov.br`, um
 * endereço que não existe, e `app.config.ts` dava o MESMO identificador
 * (`com.solerte.dc360.campo`) a todo perfil. Dois riscos, os dois calados:
 *
 * 1. Um build interno de HML instalado num aparelho que já tem o de PROD
 *    SOBRESCREVE o de PROD (mesmo identificador, mesmo aplicativo). O agente
 *    passa a trabalhar num binário de teste sem perceber.
 * 2. Quem "consertasse" o endereço de exemplo apontando HML para a URL de PROD
 *    faria o build de teste gravar ocorrência no banco das prefeituras.
 *
 * ## O que ele confere, e de onde vem cada valor
 *
 * - O identificador de cada perfil é o que o `app.config.ts` RESOLVE de verdade
 *   (rodado em outro processo com `EAS_BUILD_PROFILE`), e não o que uma regex
 *   acha no texto. O de HML é o de PROD mais `.hml` e é diferente dele.
 * - A URL de HML de `eas.json` sai da MESMA fonte do `fly.hml.toml`
 *   (`https://<app>.fly.dev`, a regra que já vale para PROD) e, quando o
 *   `ambientes.json` declara o app de HML, concorda com ele. Nenhum domínio é
 *   inventado: o domínio próprio de HML é marcador até o CP-05.
 * - Só `producao` fala com a URL de PROD, e nenhum perfil tem endereço de
 *   exemplo.
 * - `APNS_BUNDLE` do `fly.toml` é o bundle de PROD, e o do `fly.hml.toml` é o de
 *   HML (é o `apns-topic`), com `APNS_AMBIENTE=teste`.
 *
 * ## O que ele NÃO confere, e por quê
 *
 * O `google-services.json` precisa de um cliente Android de HML
 * (`com.solerte.dc360.campo.hml`) ANTES do primeiro build de HML, senão o
 * Gradle para com "No matching client found". Criar o cliente é no console do
 * Firebase, com a conta do dono (CP-04), e fica registrado como pendência
 * humana. O teste só garante que o cliente de PROD continua lá e que nenhum
 * pacote desconhecido entrou.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lerEnvDoToml, lerMatriz } from "./conferir-ambiente.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const lerTexto = (caminho) => readFileSync(`${RAIZ}${caminho}`, "utf8");

/**
 * O especificador que o `import()` aceita para um arquivo local. Caminho solto
 * como `D:\a\x\app.config.ts` o ESM do Node recusa no Windows
 * (`ERR_UNSUPPORTED_ESM_URL_SCHEME`: a letra da unidade vira "esquema"), e a
 * falha derrubava o arquivo inteiro. Por isso vira URL `file://` em todo
 * sistema. `windows` existe para o teste simular o caminho do Windows no Linux
 * e no macOS.
 */
export const especificadorDoModulo = (arquivo, windows = process.platform === "win32") =>
  pathToFileURL(arquivo, { windows }).href;

/**
 * Converte o TypeScript do `app.config.ts` em JavaScript de módulo, com o
 * compilador do próprio repositório (`typescript`, que a raiz já instala).
 *
 * Até a V2-F01-E13 o arquivo era carregado com `node --experimental-strip-types`,
 * que só APAGA anotação de tipo. No Node 22.17 a bandeira é obrigatória e some
 * quando o recurso vira padrão; e `enum`, `namespace` e propriedade de parâmetro
 * (sintaxe que gera código) fazem o Node recusar o arquivo
 * (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`) em qualquer versão. Quem mexesse no
 * `app.config.ts` com um `enum` quebraria este teste por um motivo que não é o
 * contrato dos perfis (DV-29). O compilador entende o TypeScript inteiro e não
 * depende da versão do Node: é o mesmo resultado no 22 do `.nvmrc` e no 24.
 *
 * Só serve a arquivo sem import de valor (o `app.config.ts` só importa o TIPO
 * `ExpoConfig`, que a conversão apaga). Import de valor de pacote não resolveria
 * a partir da pasta temporária, e falha alto, com o nome do pacote.
 */
let compilador;
export function emJavaScript(texto, nome = "app.config.ts") {
  compilador ??= createRequire(import.meta.url)("typescript");
  const { outputText, diagnostics } = compilador.transpileModule(texto, {
    fileName: nome,
    reportDiagnostics: true,
    compilerOptions: {
      module: compilador.ModuleKind.ESNext,
      target: compilador.ScriptTarget.ES2022,
      verbatimModuleSyntax: false,
    },
  });
  const erros = (diagnostics ?? []).filter(
    (d) => d.category === compilador.DiagnosticCategory.Error,
  );
  assert.equal(
    erros.length,
    0,
    `${nome} não converteu: ${erros.map((d) => compilador.flattenDiagnosticMessageText(d.messageText, " ")).join("; ")}`,
  );
  return outputText;
}

/** O que o próprio `app.config.ts` resolve para um perfil do EAS (`undefined` é fora do EAS). */
export function resolverConfiguracao(perfil, arquivo = `${RAIZ}apps/campo/app.config.ts`) {
  const env = { ...process.env };
  delete env["EAS_BUILD_PROFILE"];
  delete env["DC360_API_URL"];
  if (perfil !== undefined) env["EAS_BUILD_PROFILE"] = perfil;
  const pasta = mkdtempSync(join(tmpdir(), "perfis-do-eas-js-"));
  try {
    const convertido = join(pasta, "app.config.mjs");
    writeFileSync(convertido, emJavaScript(readFileSync(arquivo, "utf8"), arquivo));
    const roteiro =
      `const { default: c } = await import(${JSON.stringify(especificadorDoModulo(convertido))});` +
      "process.stdout.write(JSON.stringify({ name: c.name, scheme: c.scheme," +
      " ios: c.ios?.bundleIdentifier, android: c.android?.package," +
      " pushAmbiente: c.extra?.pushAmbiente }));";
    const r = spawnSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", roteiro], {
      env,
      encoding: "utf8",
    });
    assert.equal(
      r.status,
      0,
      `o app.config.ts não carregou com EAS_BUILD_PROFILE=${perfil}: ${r.stderr}`,
    );
    return JSON.parse(r.stdout);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

/** O nome do app do Fly (`app = "..."` do nível de cima do toml), ou null. */
export function appDoToml(texto) {
  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim();
    if (t.startsWith("[")) return null;
    const m = /^app\s*=\s*"([^"]+)"/.exec(t);
    if (m) return m[1];
  }
  return null;
}

/** O endereço público padrão de um app do Fly, a mesma regra do endereço de PROD. */
export const urlDoApp = (app) => `https://${app}.fly.dev`;

/**
 * Problemas do `eas.json` contra o contrato de ambientes. Lista vazia é verde.
 * `prodUrl` e `hmlUrl` são as URLs esperadas, derivadas dos toml pela chamada.
 */
export function problemasDoEas(eas, { prodUrl, hmlUrl }) {
  const problemas = [];
  const p = (m) => problemas.push(m);
  const perfis = eas?.build ?? {};
  for (const nome of ["desenvolvimento", "homologacao", "producao"]) {
    if (!perfis[nome]) p(`falta o perfil ${nome}`);
  }
  for (const [nome, perfil] of Object.entries(perfis)) {
    const url = perfil?.env?.DC360_API_URL;
    if (url === undefined) continue;
    if (/exemplo|example/i.test(url)) p(`${nome}: DC360_API_URL é endereço de exemplo (${url})`);
    if (nome !== "producao" && url === prodUrl)
      p(`${nome}: DC360_API_URL aponta para a API de PRODUÇÃO (${url})`);
  }
  const hml = perfis.homologacao;
  if (hml) {
    if (hml.env?.DC360_API_URL !== hmlUrl) {
      p(
        `homologacao: DC360_API_URL deveria ser ${hmlUrl} (a do fly.hml.toml) e é ${hml.env?.DC360_API_URL}`,
      );
    }
    if (hml.distribution !== "internal")
      p(`homologacao: distribution deveria ser internal (é ${hml.distribution})`);
    if (hml.channel !== "homologacao")
      p(`homologacao: channel deveria ser homologacao (é ${hml.channel})`);
  }
  const prod = perfis.producao;
  if (prod && prod.env?.DC360_API_URL !== prodUrl) {
    p(
      `producao: DC360_API_URL deveria ser ${prodUrl} (a do fly.toml) e é ${prod.env?.DC360_API_URL}`,
    );
  }
  const canais = Object.entries(perfis).map(([nome, perfil]) => [nome, perfil?.channel]);
  const vistos = new Map();
  for (const [nome, canal] of canais) {
    if (!canal) continue;
    if (vistos.has(canal)) p(`${nome} e ${vistos.get(canal)} dividem o canal ${canal}`);
    vistos.set(canal, nome);
  }
  return problemas;
}

/** Os pacotes Android declarados num `google-services.json`. */
export const pacotesDoFirebase = (json) =>
  (json?.client ?? [])
    .map((c) => c?.client_info?.android_client_info?.package_name)
    .filter(Boolean);

// ---- O caminho que o Windows entrega ao import() ---------------------------

test("o especificador do import() é URL file:// também para caminho de Windows", () => {
  assert.equal(
    especificadorDoModulo("D:\\a\\city-hall\\dc360\\apps\\campo\\app.config.ts", true),
    "file:///D:/a/city-hall/dc360/apps/campo/app.config.ts",
  );
  // A raiz do teste termina com barra invertida no Windows e o resto vem com
  // barra normal: a mistura também tem de virar uma URL só.
  assert.equal(
    especificadorDoModulo("D:\\a\\city-hall\\dc360\\apps/campo/app.config.ts", true),
    "file:///D:/a/city-hall/dc360/apps/campo/app.config.ts",
  );
  assert.match(
    especificadorDoModulo("D:\\com espaço\\app.config.ts", true),
    /^file:\/\/\/D:\/com%20espa/,
  );
});

test("o especificador do import() é URL file:// também para caminho de POSIX", () => {
  assert.equal(
    especificadorDoModulo("/home/runner/work/dc360/apps/campo/app.config.ts", false),
    "file:///home/runner/work/dc360/apps/campo/app.config.ts",
  );
});

test("nenhum especificador começa com letra de unidade (o que o ESM recusa)", () => {
  for (const [caminho, windows] of [
    ["C:\\x\\a.ts", true],
    ["z:\\x\\a.ts", true],
    ["/x/a.ts", false],
  ]) {
    assert.match(especificadorDoModulo(caminho, windows), /^file:\/\/\//);
  }
});

// ---- O repositório de verdade ----------------------------------------------

const eas = JSON.parse(lerTexto("apps/campo/eas.json"));
const tomlProd = lerTexto("fly.toml");
const tomlHml = lerTexto("fly.hml.toml");
const matriz = lerMatriz();
const appProd = appDoToml(tomlProd);
const appHml = appDoToml(tomlHml);
const esperadas = { prodUrl: urlDoApp(appProd), hmlUrl: urlDoApp(appHml) };

const hml = resolverConfiguracao("homologacao");
const prod = resolverConfiguracao("producao");
const dev = resolverConfiguracao("desenvolvimento");
const foraDoEas = resolverConfiguracao(undefined);

test("os dois toml declaram o nome do app do Fly, e são nomes diferentes", () => {
  assert.ok(appProd, "fly.toml sem `app = ...`");
  assert.ok(appHml, "fly.hml.toml sem `app = ...`");
  assert.notEqual(appHml, appProd);
});

test("o eas.json de verdade passa: HML na API de HML, só producao na de PROD, zero exemplo", () => {
  assert.deepEqual(problemasDoEas(eas, esperadas), []);
});

test("a URL de HML do perfil concorda com o ambientes.json quando ele declara o app de HML", () => {
  const declarado = matriz.ambientes.hml.appsNoFly.api;
  if (declarado === null) {
    // CP-05 ainda não preencheu a matriz: vale a fonte única, o `app` do fly.hml.toml.
    assert.equal(eas.build.homologacao.env.DC360_API_URL, urlDoApp(appHml));
  } else {
    assert.equal(declarado, appHml, "ambientes.json e fly.hml.toml divergem sobre o app de HML");
    assert.equal(eas.build.homologacao.env.DC360_API_URL, urlDoApp(declarado));
  }
  assert.equal(matriz.ambientes.prod.appsNoFly.api, appProd);
});

test("nenhum endereço de exemplo sobrou em eas.json", () => {
  assert.doesNotMatch(lerTexto("apps/campo/eas.json"), /exemplo\.gov\.br|example\.(com|org|gov)/i);
});

test("com EAS_BUILD_PROFILE=homologacao o app.config.ts resolve o bundle, o pacote e o nome de HML", () => {
  assert.equal(hml.ios, `${prod.ios}.hml`);
  assert.equal(hml.android, `${prod.android}.hml`);
  assert.equal(hml.ios, hml.android, "iOS e Android usam o mesmo identificador em HML");
  assert.equal(hml.name, "DC360 HML");
  assert.equal(hml.scheme, "dc360-hml");
  assert.equal(hml.pushAmbiente, "teste");
});

test("o bundle de HML é diferente do de PROD e do de desenvolvimento: os aplicativos coexistem no aparelho", () => {
  assert.notEqual(hml.ios, prod.ios);
  assert.notEqual(hml.android, prod.android);
  assert.notEqual(hml.name, prod.name);
  assert.notEqual(hml.scheme, prod.scheme);
  assert.notEqual(hml.ios, dev.ios);
});

test("produção, desenvolvimento e fora do EAS mantêm o identificador de sempre", () => {
  for (const config of [prod, dev, foraDoEas]) {
    assert.equal(config.ios, "com.solerte.dc360.campo");
    assert.equal(config.android, "com.solerte.dc360.campo");
    assert.equal(config.name, "Defesa Civil 360");
    assert.equal(config.scheme, "dc360");
  }
  assert.equal(prod.pushAmbiente, "producao");
});

test("APNS_BUNDLE de PROD é o bundle de PROD, e o de HML é o bundle de HML (o apns-topic)", () => {
  assert.equal(lerEnvDoToml(tomlProd)["APNS_BUNDLE"], prod.ios);
  assert.equal(lerEnvDoToml(tomlHml)["APNS_BUNDLE"], hml.ios);
});

test("APNS_AMBIENTE de HML é teste, o mesmo vocabulário do pushAmbiente do binário de HML", () => {
  assert.equal(lerEnvDoToml(tomlHml)["APNS_AMBIENTE"], "teste");
  assert.equal(lerEnvDoToml(tomlHml)["APNS_AMBIENTE"], hml.pushAmbiente);
});

test("o HML segue sem push ligado nem segredo de push de PROD no toml", () => {
  const env = lerEnvDoToml(tomlHml);
  assert.equal(env["PUSH_ATIVO"], "nao");
  for (const proibida of ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_CHAVE", "FCM_CONTA_SERVICO"]) {
    assert.equal(env[proibida], undefined, `${proibida} não pode estar no toml de HML`);
  }
});

test("o google-services.json mantém o cliente de PROD e não traz pacote desconhecido", () => {
  const pacotes = pacotesDoFirebase(JSON.parse(lerTexto("apps/campo/google-services.json")));
  assert.ok(
    pacotes.includes(prod.android),
    "o cliente Android de PROD saiu do google-services.json",
  );
  for (const pacote of pacotes) {
    assert.ok(
      [prod.android, hml.android].includes(pacote),
      `pacote desconhecido no google-services.json: ${pacote}`,
    );
  }
  if (!pacotes.includes(hml.android)) {
    console.log(
      `# PENDENTE (humano): criar o cliente Android ${hml.android} no Firebase e acrescentá-lo ao google-services.json ` +
        "antes do primeiro build de HML (V2-F01-E13, CP-04).",
    );
  }
});

// ---- Casos negativos: o teste reprova o que promete reprovar ---------------

const copia = (objeto) => JSON.parse(JSON.stringify(objeto));

test("negativo: HML apontando para a URL de PROD reprova", () => {
  const ruim = copia(eas);
  ruim.build.homologacao.env.DC360_API_URL = esperadas.prodUrl;
  const problemas = problemasDoEas(ruim, esperadas);
  assert.ok(
    problemas.some((m) => /aponta para a API de PRODUÇÃO/.test(m)),
    problemas.join("\n"),
  );
  assert.ok(problemas.some((m) => /deveria ser .* \(a do fly\.hml\.toml\)/.test(m)));
});

test("negativo: endereço de exemplo em qualquer perfil reprova", () => {
  const ruim = copia(eas);
  ruim.build.homologacao.env.DC360_API_URL = "https://api-homologacao.exemplo.gov.br";
  assert.ok(problemasDoEas(ruim, esperadas).some((m) => /endereço de exemplo/.test(m)));
});

test("negativo: perfil de desenvolvimento com a URL de PROD reprova", () => {
  const ruim = copia(eas);
  ruim.build.desenvolvimento.env = { DC360_API_URL: esperadas.prodUrl };
  assert.ok(problemasDoEas(ruim, esperadas).some((m) => /desenvolvimento: .*PRODUÇÃO/.test(m)));
});

test("negativo: producao com a URL errada, HML fora de internal e canal repetido reprovam", () => {
  const ruim = copia(eas);
  ruim.build.producao.env.DC360_API_URL = esperadas.hmlUrl;
  ruim.build.homologacao.distribution = "store";
  ruim.build.homologacao.channel = "producao";
  const problemas = problemasDoEas(ruim, esperadas).join("\n");
  assert.match(problemas, /producao: DC360_API_URL deveria ser/);
  assert.match(problemas, /distribution deveria ser internal/);
  assert.match(problemas, /dividem o canal producao/);
});

test("negativo: um app.config.ts que dá o mesmo bundle a todo perfil reprova no teste de coexistência", () => {
  // Reproduz o defeito de antes da E13 sobre uma cópia em pasta temporária, sem tocar no arquivo de verdade.
  const original = lerTexto("apps/campo/app.config.ts");
  const estragado = original.replace(
    /const IDENTIFICADOR_DO_APLICATIVO = PERFIL_DE_HOMOLOGACAO\s*\?[^;]+;/,
    "const IDENTIFICADOR_DO_APLICATIVO = IDENTIFICADOR_BASE;",
  );
  assert.notEqual(
    estragado,
    original,
    "o trecho que decide o identificador mudou de forma: ajuste este caso",
  );
  const pasta = mkdtempSync(join(tmpdir(), "perfis-do-eas-"));
  const arquivo = join(pasta, "app.config.estragado.ts");
  writeFileSync(arquivo, estragado);
  try {
    const ruim = resolverConfiguracao("homologacao", arquivo);
    assert.equal(
      ruim.ios,
      prod.ios,
      "o rascunho estragado deveria dar o bundle de PROD ao perfil de HML",
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("negativo: o app do fly.hml.toml sai do texto, e toml sem app devolve null", () => {
  assert.equal(appDoToml('app = "x-hml"\n[env]\n  A = "b"'), "x-hml");
  assert.equal(appDoToml('[env]\n  app = "nao-conta"'), null);
  assert.equal(appDoToml("# só comentário"), null);
});

// ---- O carregador não depende do Node apagar tipos (DV-29) ------------------

test("o carregador entende enum, namespace e propriedade de parâmetro, que o strip-types do Node recusa", () => {
  const pasta = mkdtempSync(join(tmpdir(), "perfis-do-eas-"));
  const arquivo = join(pasta, "app.config.nao-apagavel.ts");
  writeFileSync(
    arquivo,
    [
      'import type { ExpoConfig } from "expo/config";',
      'enum Perfil { Producao = "producao", Homologacao = "homologacao" }',
      'namespace Ids { export const base = "com.exemplo.app"; }',
      "class Identificador { constructor(public readonly base: string) {} }",
      "const id = new Identificador(Ids.base).base;",
      "const config: ExpoConfig = {",
      '  name: "Exemplo", slug: "exemplo", scheme: "exemplo",',
      "  ios: { bundleIdentifier: `${id}.${Perfil.Homologacao}` },",
      "  android: { package: id },",
      '  extra: { pushAmbiente: "teste" },',
      "};",
      "export default config;",
      "",
    ].join("\n"),
  );
  try {
    const lida = resolverConfiguracao("homologacao", arquivo);
    assert.equal(lida.ios, "com.exemplo.app.homologacao");
    assert.equal(lida.android, "com.exemplo.app");
    assert.equal(lida.pushAmbiente, "teste");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("o carregador reprova TypeScript com erro de sintaxe, em vez de entregar um módulo pela metade", () => {
  assert.throws(() => emJavaScript("const = ;", "quebrado.ts"), /quebrado\.ts não converteu/);
  assert.match(emJavaScript("export default { a: 1 as number };"), /export default \{ a: 1 \}/);
});
