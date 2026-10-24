/**
 * Testa o portão `auditar.mjs` com saída sintética de `npm audit --json`.
 *
 * O portão chama `npm`, então o teste põe um `npm` falso na frente do PATH que
 * devolve o relatório combinado, sem rede e sem depender do estado real das
 * dependências.
 *
 * O npm falso também imita o que enganava o portão até a rodada 6: com
 * `offline` na fixture ele devolve o relatório vazio e bem formado do npm em
 * modo offline, a menos que a chamada traga `--offline=false` e o registro
 * oficial; com `ignorarBandeiras` ele devolve esse relatório vazio sempre, em
 * toda pasta, inclusive na consulta de controle (o espelho que responde `{}`).
 * Cada chamada fica registrada em AUDITAR_LOG, para o teste conferir as bandeiras.
 *
 * O prazo (`ate`) depende do relógio, então o vencimento é provado de dois
 * jeitos sem mexer no relógio da máquina: a função pura recebe `hoje` por
 * argumento, e o teste de ponta a ponta roda uma CÓPIA do portão cuja lista de
 * exceções foi reescrita (prazo apagado, vencido, dono vazio), que é o que prova
 * que a validação está ligada ao `exit 1` e não só existe.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACEITAS_EM_DESENVOLVIMENTO, ACEITAS_NO_APLICATIVO, CONTROLE, REGISTRO_OFICIAL,
  CHAVES_PERMITIDAS, aceitasAusentes, mascararComoONpm, mesmoProjeto, shrinkwrapsPresentes, advisoriesNaoAceitas, ambienteDaConsulta, chavesDoNpmrc, chavesProibidas,
  hojeEmSaoPaulo, lerNpmConfigList, normalizarChave, defeitoDaArvore, defeitoDoControle, idDaAdvisory, mudancasDeGravidade,
  pacotesAceitosAusentes, pacotesDeRuntimeNoCompleto, problemasDasExcecoes,
} from "./auditar-excecoes.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(AQUI, "auditar.mjs");

let pasta;

before(() => {
  pasta = mkdtempSync(join(tmpdir(), "auditar-teste-"));
  writeFileSync(
    join(pasta, "npm.mjs"),
    `import { appendFileSync, existsSync, readFileSync } from "node:fs";
const cwd = process.cwd().replaceAll("\\\\", "/");
const f = JSON.parse(process.env.AUDITAR_FIXTURE);
const args = process.argv.slice(2);
const controle = /\\/auditar-controle-[^/]*$/.test(cwd);
// \`npm config list\`: o formato do npm real (projeto e ambiente), ou o texto da fixture.
if (args[0] === "config") {
  const nome = cwd.endsWith("apps/campo") ? "configApp" : "configRaiz";
  if (typeof f[nome] === "string") { process.stdout.write(f[nome]); process.exit(f[nome + "Codigo"] ?? 0); }
  const linhas = [];
  if (existsSync(".npmrc")) {
    linhas.push(\`; "project" config from \${process.cwd()}/.npmrc\`, "");
    for (const l of readFileSync(".npmrc", "utf8").split(/\\r?\\n/)) {
      const t = l.trim(); if (!t || t.startsWith(";") || t.startsWith("#")) continue;
      const i = t.indexOf("="); linhas.push(i < 0 ? \`\${t} = true\` : \`\${t.slice(0, i).trim()} = \${t.slice(i + 1).trim()}\`);
    }
    linhas.push("");
  }
  const doAmbiente = Object.keys(process.env).filter((n) => /^npm_config_/i.test(n));
  if (doAmbiente.length) {
    linhas.push('; "env" config from environment', "");
    for (const n of doAmbiente) linhas.push(\`\${n.slice(11).toLowerCase().replaceAll("_", "-")} = "\${process.env[n]}"\`);
    linhas.push("");
  }
  if (f[nome + "Extra"]) linhas.push(f[nome + "Extra"], "");
  // O npm 11 mascara com *** todo trecho com cara de UUID (@npmcli/redact), inclusive no caminho.
  const mascarar = (t) => t.replace(/\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b/gi, "***");
  linhas.push("; npm version = 11.0.0", \`; npm local prefix = \${f[nome + "Prefixo"] ?? mascarar(process.cwd())}\`, \`; cwd = \${mascarar(process.cwd())}\`);
  process.stdout.write(linhas.join("\\n") + "\\n");
  process.exit(0);
}
if (process.env.AUDITAR_LOG) {
  const npmrc = existsSync(".npmrc") ? readFileSync(".npmrc", "utf8").trim() : null;
  const workspaceNoAmbiente = Object.keys(process.env).filter((n) => /^npm_config_(workspaces?|include[_-]workspace[_-]root)$/i.test(n));
  const npmConfig = Object.keys(process.env).filter((n) => /^npm_config_/i.test(n)).sort();
  appendFileSync(process.env.AUDITAR_LOG, JSON.stringify({ controle, app: cwd.endsWith("apps/campo"), cwd, args, npmrc, workspaceNoAmbiente, npmConfig }) + "\\n");
}
const fixado = args.includes("--registry=${REGISTRO_OFICIAL}") && args.includes("--offline=false");
const rel = f.ignorarBandeiras || (f.offline && !fixado) ? f.vazioBemFormado
  : controle ? f.controle
  : cwd.endsWith("apps/campo") ? f.app
  : args.includes("--omit=dev") ? f.runtime : f.tudo;
// Texto cru simula o npm que não devolve JSON nenhum.
if (typeof rel === "string") { process.stdout.write(rel); process.exit(1); }
process.stdout.write(JSON.stringify(rel));
// Relatório com error ou sem metadata é o do registro fora do ar: o npm real
// sai com 1 e devolve só message e error.
process.exit(Object.keys(rel.vulnerabilities ?? {}).length || rel.error || !rel.metadata ? 1 : 0);
`,
  );
  writeFileSync(join(pasta, "npm.cmd"), '@node "%~dp0npm.mjs" %*\r\n');
  writeFileSync(join(pasta, "npm"), '#!/bin/sh\nexec node "$(dirname "$0")/npm.mjs" "$@"\n');
  chmodSync(join(pasta, "npm"), 0o755);
});

after(() => rmSync(pasta, { recursive: true, force: true }));

const ARVORE = { prod: 90, dev: 150, optional: 50, peer: 0, peerOptional: 0, total: 249 };
const limpo = { vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 }, dependencies: ARVORE } };
/** O que o npm real devolve em modo offline, ou atrás de um registro que responde `{}`. */
const VAZIO_BEM_FORMADO = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, dependencies: ARVORE },
};
const urlDe = (id) => `https://github.com/advisories/${id}`;
/** O primeiro GHSA aceito do pacote, ou um GHSA que nenhuma lista aceita. */
const ghsaDe = (nome) => Object.keys(ACEITAS_NO_APLICATIVO[nome]?.advisories ?? {})[0] ?? "GHSA-n0va-0000-0000";
/** A gravidade com que o GHSA foi aceito no pacote, ou "high". */
const gravidadeAceita = (nome, id) => ACEITAS_NO_APLICATIVO[nome]?.advisories?.[id] ?? "high";

/**
 * Relatório com advisory PRÓPRIA (via com objeto) por pacote informado. O valor é
 * o `fixAvailable`, ou `{ fixAvailable, ids, gravidade, nodes }` para escolher os
 * GHSA, forçar a gravidade e os caminhos no `node_modules` (o portão os confere
 * no `package-lock.json` real para separar runtime de desenvolvimento).
 */
function relatorio(pacotes) {
  const vulnerabilities = {};
  let total = 0;
  for (const [nome, valor] of Object.entries(pacotes)) {
    const opcoes = valor !== null && typeof valor === "object" ? valor : { fixAvailable: valor };
    const { fixAvailable, ids = [ghsaDe(nome)], gravidade, nodes = [`${ACEITAS_NO_APLICATIVO[nome]?.somenteEm?.[0] ?? "node_modules/"}${nome}`] } = opcoes;
    vulnerabilities[nome] = {
      name: nome, severity: "high", fixAvailable, nodes,
      via: ids.map((id, i) => ({
        source: 1000 + i, url: urlDe(id), title: `advisory ${id} de ${nome}`, severity: gravidade ?? gravidadeAceita(nome, id),
      })),
    };
    total += ids.length;
  }
  return { vulnerabilities, metadata: { vulnerabilities: { total, high: total }, dependencies: ARVORE } };
}

/** Junta relatórios; pacote repetido fica com a versão do último. */
function juntar(...relatorios) {
  const vulnerabilities = Object.assign({}, ...relatorios.map((r) => r.vulnerabilities));
  const total = Object.values(vulnerabilities).reduce((n, v) => n + v.via.filter((o) => typeof o === "object").length, 0);
  return { vulnerabilities, metadata: { vulnerabilities: { total, high: total }, dependencies: ARVORE } };
}

/** O aplicativo como o registro responde hoje: todas as advisories aceitas, com a gravidade aceita. */
const APP_ACEITO = relatorio(Object.fromEntries(Object.entries(ACEITAS_NO_APLICATIVO).map(
  ([nome, e]) => [nome, { fixAvailable: Boolean(e.comCorrecao), ids: Object.keys(e.advisories) }],
)));
/** O conjunto completo da raiz como o registro responde hoje: os três pacotes aceitos do vitest. */
const DEV_ACEITO = relatorio({ vitest: false, "@vitest/mocker": false, tinypool: false });
/** Nó que o `package-lock.json` real marca como só de desenvolvimento. */
const NO_DE_DEV = ["node_modules/vitest"];

/** A consulta de controle como o registro oficial responde: lodash 4.17.20 com a advisory conhecida. */
const CONTROLE_BOM = relatorio({ [CONTROLE.pacote]: { fixAvailable: true, ids: [CONTROLE.advisory, "GHSA-29mw-wpgm-hmr9"] } });

function fixtura({
  runtime = limpo,
  tudo = runtime?.vulnerabilities ? juntar(runtime, DEV_ACEITO) : DEV_ACEITO,
  app = APP_ACEITO, controle = CONTROLE_BOM, ...resto
}) {
  return JSON.stringify({ runtime, tudo, app, controle, vazioBemFormado: VAZIO_BEM_FORMADO, ...resto });
}

/**
 * O ambiente do teste SEM nenhuma \`npm_config_*\`: rodando por \`npm run\`, o npm
 * exporta várias, e o portão confere as que sobram. Cada teste põe as suas.
 */
const AMBIENTE_LIMPO = Object.fromEntries(Object.entries(process.env).filter(([n]) => !/^npm_config_/i.test(n)));

function rodar(opcoes, { env = {}, cwd } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8", ...(cwd ? { cwd } : {}),
    env: { ...AMBIENTE_LIMPO, PATH: pasta + delimiter + process.env.PATH, AUDITAR_FIXTURE: fixtura(opcoes), ...env },
  });
  return { codigo: r.status, saida: r.stdout + r.stderr };
}

/** Roda e devolve também cada chamada que o npm falso recebeu. */
function rodarComRegistro(opcoes, { env = {}, cwd } = {}) {
  const log = join(mkdtempSync(join(tmpdir(), "auditar-log-")), "chamadas.jsonl");
  const resultado = rodar(opcoes, { env: { AUDITAR_LOG: log, ...env }, cwd });
  const chamadas = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  rmSync(dirname(log), { recursive: true, force: true });
  return { ...resultado, chamadas };
}

describe("auditar.mjs", () => {
  it("passa quando runtime e aplicativo estão limpos", () => {
    const { codigo, saida } = rodar({});
    assert.equal(codigo, 0, saida);
  });

  it("reprova vulnerabilidade de runtime", () => {
    const { codigo, saida } = rodar({ runtime: relatorio({ fastify: true }) });
    assert.equal(codigo, 1);
    assert.match(saida, /dependência de runtime/);
  });

  it("só avisa de vulnerabilidade apenas de desenvolvimento", () => {
    const { codigo, saida } = rodar({ tudo: DEV_ACEITO });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /apenas em ferramenta de/);
  });

  it("dev nomeado na lista (CP-03, D3 Q5) aparece como aceito, com dono e prazo, e não como 'precisa de dono'", () => {
    const { codigo, saida } = rodar({ tudo: DEV_ACEITO });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /aceita \(desenvolvimento\): vitest \(dono Rafael, até 2027-01-05\)/);
    assert.match(saida, /aceita \(desenvolvimento\): tinypool/);
    assert.match(saida, /todas aceitas com dono e prazo/);
    assert.doesNotMatch(saida, /precisa de dono/);
  });

  it("dev que NÃO está na lista continua só avisando, mas diz o nome e que falta dono e prazo", () => {
    const { codigo, saida } = rodar({
      tudo: juntar(DEV_ACEITO, relatorio({ "pacote-novo-de-teste": { fixAvailable: false, nodes: NO_DE_DEV } })),
    });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /sem dono e prazo: pacote-novo-de-teste/);
    assert.match(saida, /aceita \(desenvolvimento\): vitest/);
  });

  it("reprova advisory nova no aplicativo de campo", () => {
    const { codigo, saida } = rodar({ app: juntar(APP_ACEITO, relatorio({ "pacote-novo": false })) });
    assert.equal(codigo, 1);
    assert.match(saida, /NOVA:\s+pacote-novo/);
  });

  it("aceita o nomeado, com o id da advisory, dono e prazo na saída", () => {
    const { codigo, saida } = rodar({});
    assert.equal(codigo, 0, saida);
    assert.match(saida, /aceita: node-forge GHSA-86w9-cpqp-85rv \(high, dono .+, até \d{4}-\d{2}-\d{2}\)/);
  });

  /*
    Rodada 6, achado 2: a exceção casava pelo NOME do pacote, e uma advisory nova
    e crítica em `node-forge` passava como "aceita". Agora casa pelo GHSA.
  */
  it("reprova advisory NOVA em pacote já aceito (node-forge com outro GHSA)", () => {
    const { codigo, saida } = rodar({
      app: juntar(APP_ACEITO, relatorio({ "node-forge": { fixAvailable: false, ids: ["GHSA-86w9-cpqp-85rv", "GHSA-n0va-cr1t-1ca0"] } })),
    });
    assert.equal(codigo, 1, saida);
    assert.match(saida, /NOVA:\s+node-forge GHSA-n0va-cr1t-1ca0/);
    assert.match(saida, /aceita: node-forge GHSA-86w9-cpqp-85rv/);
    assert.match(saida, /REPROVADO: 1 advisory nova no aplicativo de campo \(node-forge GHSA-n0va-cr1t-1ca0/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  it("reprova advisory sem GHSA (só o número do npm) em pacote aceito, como o modo forge-nova do validador", () => {
    const app = {
      vulnerabilities: {
        "node-forge": { via: [{ source: 999999, title: "advisory NOVA e critica", severity: "critical" }], fixAvailable: false },
      },
      metadata: { vulnerabilities: { critical: 1, total: 1 }, dependencies: ARVORE },
    };
    const { codigo, saida } = rodar({ app });
    assert.equal(codigo, 1, saida);
    assert.match(saida, /NOVA:\s+node-forge npm:999999 \(critical/);
  });

  it("aceita as três advisories nomeadas de brace-expansion e reprova a quarta", () => {
    const ids = Object.keys(ACEITAS_NO_APLICATIVO["brace-expansion"].advisories);
    assert.equal(rodar({ app: juntar(APP_ACEITO, relatorio({ "brace-expansion": { fixAvailable: true, ids } })) }).codigo, 0);
    const { codigo, saida } = rodar({
      app: juntar(APP_ACEITO, relatorio({ "brace-expansion": { fixAvailable: true, ids: [...ids, "GHSA-qu4r-t4aa-0000"] } })),
    });
    assert.equal(codigo, 1, saida);
    assert.match(saida, /NOVA:\s+brace-expansion GHSA-qu4r-t4aa-0000/);
  });

  it("reprova aceita que tem correção disponível e não está marcada como inaplicável", () => {
    const { codigo, saida } = rodar({ app: juntar(APP_ACEITO, relatorio({ "decode-uri-component": true })) });
    assert.equal(codigo, 1);
    assert.match(saida, /correção já existe/);
  });

  it("tolera correção disponível quando a exceção é marcada como inaplicável (CP-03)", () => {
    const { codigo, saida } = rodar({ app: juntar(APP_ACEITO, relatorio({ "brace-expansion": { fixAvailable: true, ids: Object.keys(ACEITAS_NO_APLICATIVO["brace-expansion"].advisories) } })) });
    assert.equal(codigo, 0, saida);
  });

  /*
    Item 7 da seção 7 de `28`: o portão não pode aprovar sem ter auditado. Com o
    registro de avisos inalcançável o `npm audit --json` devolve só
    `{ message, error }`, sem `metadata`, e o portão antigo lia isso como
    "0 vulnerabilidades", imprimia "Runtime limpo" e saía 0.
  */
  const SEM_AUDITORIA = { message: "request to http://127.0.0.1:9/... failed", error: { summary: "", detail: "" } };

  it("sai 2 e diz que NÃO auditou quando o runtime da raiz volta com erro do registro", () => {
    const { codigo, saida } = rodar({ runtime: SEM_AUDITORIA, tudo: limpo });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /NÃO foi auditad/);
    assert.match(saida, /raiz/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  it("sai 2 quando a auditoria completa da raiz volta com erro do registro", () => {
    const { codigo, saida } = rodar({ runtime: limpo, tudo: SEM_AUDITORIA });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /NÃO foi auditad/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  it("sai 2 quando o aplicativo de campo volta com erro do registro", () => {
    const { codigo, saida } = rodar({ app: SEM_AUDITORIA });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /NÃO foi auditad/);
    assert.match(saida, /aplicativo de campo/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  it("sai 2 quando o npm devolve JSON vazio (sem metadata) na raiz ou no aplicativo", () => {
    for (const onde of ["runtime", "tudo", "app"]) {
      const { codigo, saida } = rodar({ [onde]: {} });
      assert.equal(codigo, 2, `${onde}: ${saida}`);
      assert.match(saida, /NÃO foi auditad/);
      assert.doesNotMatch(saida, /Runtime limpo/);
    }
  });

  it("sai 2 quando o npm não devolve nem JSON", () => {
    const { codigo, saida } = rodar({ app: "isto não é um relatório" });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /NÃO foi auditad/);
  });

  /*
    Rodada 6, achado 1: com `offline=true` na configuração do npm, ou atrás de um
    registro que responde `{}` ao endpoint de advisories, o npm devolve um
    relatório vazio e BEM FORMADO, e o portão dizia "Runtime limpo" e saía 0.
  */
  it("fixa o registro oficial e anula o modo offline em toda chamada, e faz a consulta de controle nas duas configurações", () => {
    const { codigo, saida, chamadas } = rodarComRegistro({});
    assert.equal(codigo, 0, saida);
    assert.equal(chamadas.length, 5, JSON.stringify(chamadas)); // runtime, tudo, aplicativo e dois controles
    for (const { args } of chamadas) {
      for (const bandeira of [
        `--registry=${REGISTRO_OFICIAL}`, "--offline=false", "--prefer-offline=false", "--prefer-online", "--dry-run=false",
        "--package-lock=true",
      ]) {
        assert.ok(args.includes(bandeira), `falta ${bandeira} em ${args.join(" ")}`);
      }
      // Correção 8: \`--workspaces=false\` saiu (com dependência direta na raiz, ele descarta o runtime dos workspaces).
      assert.ok(!args.some((a) => /^--(no-)?workspaces?(=|$)/.test(a)), args.join(" "));
    }
    const controles = chamadas.filter((c) => c.controle);
    assert.equal(controles.length, 2);
    for (const { args } of controles) assert.ok(args.includes("--package-lock-only"));
    for (const { args } of chamadas.filter((c) => !c.controle)) assert.ok(args.includes("--package-lock-only=false"), args.join(" "));
    assert.match(saida, /Consulta de controle: lodash 4\.17\.20 voltou com GHSA-35jh-r3h4-6jhm/);
  });

  /*
    Pré-validação da rodada 7, V2-F00-E19: `auditar()` recebia `cwd` undefined nas
    duas consultas da raiz, então o `npm audit` rodava no diretório do PROCESSO.
    Dentro de um workspace (`cd packages/shared && node ../../scripts/auditar.mjs`)
    o npm audita só aquele workspace: com `fastify@4.10.0` no lockfile a raiz saía 1
    e o mesmo comando de dentro do workspace saía 0 com "Runtime limpo". O mesmo
    vale para `npm_config_workspace` no ambiente.
  */
  it("audita a RAIZ, e não o diretório de onde o comando foi dado (de dentro de um workspace)", () => {
    const raiz = join(AQUI, "..");
    const workspace = join(raiz, "packages", "shared");
    assert.ok(existsSync(join(workspace, "package.json")), "o teste precisa de um workspace real");
    const { codigo, saida, chamadas } = rodarComRegistro({}, { cwd: workspace });
    assert.equal(codigo, 0, saida);
    const daRaiz = chamadas.filter((c) => !c.controle && !c.app);
    assert.equal(daRaiz.length, 2, JSON.stringify(chamadas));
    for (const { cwd } of daRaiz) assert.equal(cwd, raiz.replaceAll("\\", "/"), "a consulta da raiz rodou fora da raiz");
    assert.ok(chamadas.some((c) => c.app && c.cwd.endsWith("apps/campo")), "o aplicativo audita com o cwd dele");
    assert.ok(chamadas.filter((c) => c.controle).every((c) => !c.cwd.startsWith(raiz.replaceAll("\\", "/"))), "o controle roda na pasta temporária");
  });

  it("nenhuma configuração de workspace do ambiente chega ao npm (npm_config_workspace, workspaces e include_workspace_root)", () => {
    const { codigo, saida, chamadas } = rodarComRegistro({}, {
      env: {
        npm_config_workspace: "packages/shared", NPM_CONFIG_WORKSPACES: "true",
        "npm_config_include-workspace-root": "false", npm_config_include_workspace_root: "false",
      },
    });
    assert.equal(codigo, 0, saida);
    assert.equal(chamadas.length, 5);
    for (const { workspaceNoAmbiente, args } of chamadas) {
      assert.deepEqual(workspaceNoAmbiente, []);
      assert.ok(!args.some((a) => /^--(no-)?workspaces?(=|$)/.test(a)));
    }
  });

  it("vulnerabilidade de runtime reprova (1) também quando o comando é dado de dentro de um workspace e com npm_config_workspace", () => {
    const workspace = join(AQUI, "..", "packages", "shared");
    const { codigo, saida } = rodar(
      { runtime: relatorio({ fastify: true }) },
      { cwd: workspace, env: { npm_config_workspace: "packages/shared" } },
    );
    assert.equal(codigo, 1, saida);
    assert.match(saida, /dependência de runtime/);
  });

  it("npm_config_* fora da lista no ambiente sai 2 com o nome (em qualquer caixa), antes de auditar", () => {
    for (const [nome, chave] of [["npm_config_before", "before"], ["NPM_CONFIG_OMIT", "omit"], ["npm_config_https_proxy", "https-proxy"]]) {
      const { codigo, saida, chamadas } = rodarComRegistro({}, { env: { [nome]: "x" } });
      assert.equal(codigo, 2, `${nome}: ${saida}`);
      assert.ok(saida.includes(`  - ${chave}   (de env (${nome}))`), `${nome}: ${saida}`);
      assert.equal(chamadas.length, 0);
    }
  });

  it("as npm_config_* que o npm run exporta são anuladas (não chegam ao npm), e as permitidas chegam e passam", () => {
    const { codigo, saida, chamadas } = rodarComRegistro({}, {
      env: {
        npm_config_userconfig: "/tmp/nao-existe/.npmrc", npm_config_globalconfig: "/tmp/nao-existe/npmrc",
        npm_config_local_prefix: "/tmp", npm_config_prefix: "/tmp", npm_config_cache: "/tmp/cache",
        npm_config_user_agent: "npm/0", npm_config_node_gyp: "x", npm_config_npm_version: "0", npm_config_init_module: "x",
        npm_config_global_prefix: "/tmp", npm_config_noproxy: "",
        npm_config_package_lock: "false", NPM_CONFIG_LOGLEVEL: "silent",
      },
    });
    assert.equal(codigo, 0, saida);
    assert.equal(chamadas.length, 5);
    for (const { npmConfig } of chamadas) assert.deepEqual(npmConfig, ["NPM_CONFIG_LOGLEVEL", "npm_config_package_lock"]);
  });

  it("chave fora da lista que só o npm conhece (npmrc do usuário, global ou embutido) sai 2 com o arquivo de origem", () => {
    const extra = '; "user" config from /casa/.npmrc\n\nfund = false\nomit = ["dev"]\n\n; "global" config from /usr/etc/npmrc\n\nbefore = "2020-01-01"';
    const { codigo, saida } = rodar({ configRaizExtra: extra });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /  - omit   \(de user \(\/casa\/\.npmrc\)\)/);
    assert.match(saida, /  - before   \(de global \(\/usr\/etc\/npmrc\)\)/);
    assert.doesNotMatch(saida, /  - fund /);
  });

  it("sai 2 quando o npm config list falha, não diz o projeto, ou toma outra pasta como projeto", () => {
    for (const [opcoes, motivo] of [
      [{ configRaiz: "", configRaizCodigo: 1 }, /npm config list. falhou/],
      [{ configRaiz: "; nada aqui\n" }, /npm local prefix = ausente/],
      [{ configAppPrefixo: tmpdir() }, /não tomou .* como projeto/],
    ]) {
      const { codigo, saida } = rodar(opcoes);
      assert.equal(codigo, 2, `${JSON.stringify(opcoes)}: ${saida}`);
      assert.match(saida, motivo);
      assert.doesNotMatch(saida, /Runtime limpo/);
    }
  });

  it("com offline=true na configuração do npm, audita mesmo assim: a advisory nova reprova em vez de virar 'Runtime limpo'", () => {
    const { codigo, saida } = rodar({ offline: true, app: juntar(APP_ACEITO, relatorio({ "pacote-novo": false })) });
    assert.equal(codigo, 1, saida);
    assert.match(saida, /NOVA:\s+pacote-novo/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  it("com offline=true e tudo limpo, aprova com os números da consulta real (a consulta de controle passou)", () => {
    const { codigo, saida } = rodar({ offline: true });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /Desenvolvimento \(fica na máquina\): 3 vulnerabilidade/);
    /* Uma por advisory aceita: a conta sai da lista, para não envelhecer a cada exceção que cai (7 hoje). */
    const nAceitas = Object.values(ACEITAS_NO_APLICATIVO).reduce((n, e) => n + Object.keys(e.advisories).length, 0);
    assert.match(saida, new RegExp(`Aplicativo de campo \\(vai para o telefone\\): ${nAceitas} vulnerabilidade`));
  });

  it("sai 2 quando o npm devolve o relatório vazio e bem formado em toda pasta, inclusive no controle (espelho que responde {})", () => {
    const { codigo, saida } = rodar({ ignorarBandeiras: true });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /não é confiável/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  it("sai 2 quando a consulta de controle volta vazia, com erro, sem JSON ou com outra advisory que não a conhecida", () => {
    const outra = relatorio({ [CONTROLE.pacote]: { fixAvailable: true, ids: ["GHSA-29mw-wpgm-hmr9"] } });
    for (const controle of [VAZIO_BEM_FORMADO, SEM_AUDITORIA, {}, "não é JSON", outra]) {
      const { codigo, saida } = rodar({ controle });
      assert.equal(codigo, 2, `${JSON.stringify(controle).slice(0, 60)}: ${saida}`);
      assert.match(saida, /NÃO foi auditad/);
      assert.doesNotMatch(saida, /Runtime limpo/);
    }
  });

  it("sai 2 quando um relatório real não diz que olhou dependência nenhuma (dependencies.total 0 ou ausente)", () => {
    const semArvore = { vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };
    const arvoreVazia = { vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 }, dependencies: { total: 0 } } };
    for (const [onde, rel] of [["runtime", semArvore], ["tudo", arvoreVazia], ["app", semArvore]]) {
      const { codigo, saida } = rodar({ [onde]: rel });
      assert.equal(codigo, 2, `${onde}: ${saida}`);
      assert.match(saida, /dependencies\.total/);
      assert.doesNotMatch(saida, /Runtime limpo/);
    }
  });

  it("achado não precisa de prova para reprovar: runtime vulnerável sai 1 mesmo com o controle vazio", () => {
    const { codigo, saida, chamadas } = rodarComRegistro({ runtime: relatorio({ fastify: true }), controle: VAZIO_BEM_FORMADO });
    assert.equal(codigo, 1, saida);
    assert.equal(chamadas.filter((c) => c.controle).length, 0);
  });

  /*
    Revisão de 915bb6a: um proxy de inspeção TLS que repassa ao registro só a
    consulta de controle e responde `{}` às outras fazia o portão dizer "consulta
    real" com o aplicativo em 0. A prova agora vai DENTRO das consultas reais: as
    advisories aceitas são conhecidas e têm de voltar.
  */
  it("sai 2 quando as consultas reais voltam vazias e só a de controle volta de verdade (o proxy da revisão)", () => {
    const { codigo, saida } = rodar({ runtime: VAZIO_BEM_FORMADO, tudo: VAZIO_BEM_FORMADO, app: VAZIO_BEM_FORMADO });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /a auditoria do aplicativo de campo não é confiável/);
    assert.match(saida, /node-forge GHSA-86w9-cpqp-85rv/);
    assert.doesNotMatch(saida, /Runtime limpo|consulta real|voltaram nas próprias consultas/);
  });

  it("sai 2 quando só a auditoria completa da raiz volta vazia (os pacotes aceitos do vitest sumiram)", () => {
    const { codigo, saida } = rodar({ tudo: VAZIO_BEM_FORMADO });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /a auditoria completa da raiz não é confiável/);
    assert.match(saida, /vitest, @vitest\/mocker, tinypool/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  it("sai 2 quando UMA advisory aceita some (lista velha ou resposta mexida), e diz qual", () => {
    const semUma = juntar(APP_ACEITO, relatorio({ "brace-expansion": { fixAvailable: true, ids: ["GHSA-q2hr-2g5m-vwhr", "GHSA-qhr7-859c-m2p7"] } }));
    const { codigo, saida } = rodar({ app: semUma });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /não voltaram: brace-expansion GHSA-6j4f-fj2g-mc7p\./);
    assert.match(saida, /lista de aceitas está velha/);
  });

  it("runtime forjado vazio não esconde o que a auditoria completa acusa em pacote que o lockfile não marca como dev", () => {
    const { codigo, saida } = rodar({ runtime: limpo, tudo: juntar(DEV_ACEITO, relatorio({ fastify: true })) });
    assert.equal(codigo, 1, saida);
    assert.match(saida, /auditoria completa da raiz acusa fastify/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  it("advisory aceita que muda de gravidade (para cima ou para baixo) deixa de valer sem decisão: sai 1 e diz a mudança", () => {
    for (const agora of ["critical", "moderate"]) {
      const app = juntar(APP_ACEITO, relatorio({ "node-forge": { fixAvailable: false, ids: ["GHSA-86w9-cpqp-85rv"], gravidade: agora } }));
      const { codigo, saida } = rodar({ app });
      assert.equal(codigo, 1, `${agora}: ${saida}`);
      assert.match(saida, new RegExp(`MUDOU:\\s+node-forge GHSA-86w9-cpqp-85rv \\(aceita como high, agora ${agora}\\)`));
      assert.match(saida, /REPROVADO: 1 advisory aceita mudou de gravidade/);
      assert.doesNotMatch(saida, /Runtime limpo/);
    }
  });
});

describe("regras puras do portão: advisory por id e prova de consulta", () => {
  it("ambienteDaConsulta tira só as variáveis de workspace do npm, em qualquer caixa, e mantém o resto", () => {
    const env = {
      PATH: "/bin", npm_config_registry: "x", npm_config_workspace: "a", NPM_CONFIG_WORKSPACES: "true",
      npm_config_include_workspace_root: "1", "npm_config_include-workspace-root": "1", npm_config_workspace_x: "mantém",
    };
    assert.deepEqual(ambienteDaConsulta(env), { PATH: "/bin", npm_config_registry: "x", npm_config_workspace_x: "mantém" });
  });

  it("idDaAdvisory tira o GHSA da URL ou do texto, normalizado, e cai no número do npm sem GHSA", () => {
    assert.equal(idDaAdvisory({ url: "https://github.com/advisories/GHSA-86W9-CPQP-85RV" }), "GHSA-86w9-cpqp-85rv");
    assert.equal(idDaAdvisory("ghsa-86w9-cpqp-85rv"), "GHSA-86w9-cpqp-85rv");
    assert.equal(idDaAdvisory({ source: 999999 }), "npm:999999");
    assert.equal(idDaAdvisory("node-forge"), null);
  });

  it("advisoriesNaoAceitas casa por GHSA, aceita a URL na lista, ignora arrasto e não repete o mesmo GHSA de faixas diferentes", () => {
    const aceitas = { a: { advisories: { "https://github.com/advisories/GHSA-aaaa-aaaa-aaaa": "high" } } };
    const vulns = {
      a: { via: [{ source: 1, url: urlDe("GHSA-aaaa-aaaa-aaaa") }, { source: 2, url: urlDe("GHSA-bbbb-bbbb-bbbb") }, { source: 3, url: urlDe("GHSA-bbbb-bbbb-bbbb") }] },
      b: { via: ["a"] },
      c: { via: [{ source: 4, url: urlDe("GHSA-aaaa-aaaa-aaaa"), severity: "low", title: "t" }] },
    };
    assert.deepEqual(advisoriesNaoAceitas(vulns, aceitas).map((n) => `${n.pacote} ${n.id}`), ["a GHSA-bbbb-bbbb-bbbb", "c GHSA-aaaa-aaaa-aaaa"]);
  });

  it("somenteEm: a exceção vale só para a cópia no caminho nomeado, e a cópia do projeto reprova (E19, correção 10)", () => {
    const aceitas = { zod: { advisories: { "GHSA-mrhx-c7xc-m3w5": "high" }, somenteEm: ["node_modules/expo/node_modules/"] } };
    const via = [{ source: 1, url: urlDe("GHSA-mrhx-c7xc-m3w5"), severity: "high", title: "memória" }];
    const soDoExpo = { zod: { via, nodes: ["node_modules/expo/node_modules/zod"] } };
    const dosDois = { zod: { via, nodes: ["node_modules/expo/node_modules/zod", "node_modules/zod"] } };
    const doProjeto = { zod: { via, nodes: ["node_modules/zod"] } };
    const semCaminho = { zod: { via } };
    assert.deepEqual(advisoriesNaoAceitas(soDoExpo, aceitas), []);
    for (const [rotulo, vulns] of [["as duas cópias", dosDois], ["só a do projeto", doProjeto], ["relatório sem nodes", semCaminho]]) {
      assert.deepEqual(advisoriesNaoAceitas(vulns, aceitas).map((n) => `${n.pacote} ${n.id}`), ["zod GHSA-mrhx-c7xc-m3w5"], rotulo);
    }
    /* Sem `somenteEm` nada muda: a exceção antiga casa pelo pacote e pelo id. */
    assert.deepEqual(advisoriesNaoAceitas(doProjeto, { zod: { advisories: { "GHSA-mrhx-c7xc-m3w5": "high" } } }), []);
  });

  it("problemasDasExcecoes recusa `somenteEm` malformado e a lista real do aplicativo o usa para o zod do Expo", () => {
    const boa = { advisories: { "GHSA-aaaa-aaaa-aaaa": "high" }, motivo: "m", dono: "d", ate: "2099-01-01" };
    assert.deepEqual(problemasDasExcecoes({ p: { ...boa, somenteEm: ["node_modules/expo/node_modules/"] } }, "2026-10-24", { exigirAdvisories: true }), []);
    for (const ruim of [[], "node_modules/expo/", ["node_modules/expo"], ["/abs/"], [7]]) {
      const p = problemasDasExcecoes({ p: { ...boa, somenteEm: ruim } }, "2026-10-24", { exigirAdvisories: true });
      assert.equal(p.length, 1, JSON.stringify(ruim));
      assert.match(p[0], /somenteEm/);
    }
    assert.deepEqual(ACEITAS_NO_APLICATIVO.zod.somenteEm, ["node_modules/expo/node_modules/"]);
    assert.equal(Object.hasOwn(ACEITAS_NO_APLICATIVO, "braces"), false);
    assert.equal(Object.hasOwn(ACEITAS_NO_APLICATIVO, "sprintf-js"), false);
  });

  it("defeitoDoControle só aceita o relatório com a advisory conhecida do pacote de controle", () => {
    assert.equal(defeitoDoControle(CONTROLE_BOM), null);
    assert.match(defeitoDoControle(VAZIO_BEM_FORMADO), /sem advisory nenhuma/);
    assert.match(defeitoDoControle(relatorio({ lodash: { fixAvailable: true, ids: ["GHSA-29mw-wpgm-hmr9"] } })), new RegExp(`sem ${CONTROLE.advisory}`));
  });

  it("mudancasDeGravidade compara com a maior gravidade do mesmo GHSA entre as faixas, e ignora o que não é aceito", () => {
    const aceitas = { a: { advisories: { "GHSA-aaaa-aaaa-aaaa": "moderate" } } };
    const igual = { a: { via: [{ url: urlDe("GHSA-aaaa-aaaa-aaaa"), severity: "moderate" }] }, b: { via: [{ url: urlDe("GHSA-bbbb-bbbb-bbbb"), severity: "critical" }] } };
    assert.deepEqual(mudancasDeGravidade(igual, aceitas), []);
    const subiu = { a: { via: [{ url: urlDe("GHSA-aaaa-aaaa-aaaa"), severity: "moderate" }, { url: urlDe("GHSA-aaaa-aaaa-aaaa"), severity: "high" }] } };
    assert.deepEqual(mudancasDeGravidade(subiu, aceitas), [{ pacote: "a", id: "GHSA-aaaa-aaaa-aaaa", aceita: "moderate", agora: "high" }]);
  });

  it("aceitasAusentes e pacotesAceitosAusentes listam o que sabíamos existir e não voltou", () => {
    const aceitas = { a: { advisories: { "GHSA-aaaa-aaaa-aaaa": "high", "GHSA-cccc-cccc-cccc": "low" } }, b: { advisories: { "GHSA-bbbb-bbbb-bbbb": "high" } } };
    const vulns = { a: { via: [{ url: urlDe("GHSA-aaaa-aaaa-aaaa"), severity: "high" }] }, b: { via: ["a"] } };
    assert.deepEqual(aceitasAusentes(vulns, aceitas), ["a GHSA-cccc-cccc-cccc", "b GHSA-bbbb-bbbb-bbbb"]);
    assert.deepEqual(aceitasAusentes({}, {}), []);
    assert.deepEqual(pacotesAceitosAusentes({ x: { via: [{ title: "t" }] }, y: { via: ["x"] } }, { x: {}, y: {}, z: {} }), ["y", "z"]);
  });

  it("pacotesDeRuntimeNoCompleto: só fica de fora o nó que o lockfile marca dev; nó desconhecido conta como runtime", () => {
    const lock = { packages: { "node_modules/d": { dev: true }, "node_modules/p": {}, "node_modules/o": { devOptional: true } } };
    const vulns = {
      d: { nodes: ["node_modules/d"] }, p: { nodes: ["node_modules/p"] }, o: { nodes: ["node_modules/o"] },
      misto: { nodes: ["node_modules/d", "node_modules/p"] }, desconhecido: { nodes: ["node_modules/zz"] }, semNos: {},
    };
    assert.deepEqual(pacotesDeRuntimeNoCompleto(vulns, lock), ["desconhecido", "misto", "o", "p", "semNos"]);
  });

  it("chavesDoNpmrc lê o ini do .npmrc: comentário, lista com [], seção e linha sem valor", () => {
    assert.deepEqual(
      chavesDoNpmrc("; c\n# d\n\npackage-lock = false\nfoo[]=1\r\n[secao]\n  //registry.npmjs.org/:_authToken=${T}\nsozinha\n"),
      ["package-lock", "foo", "[secao]", "//registry.npmjs.org/:_authToken", "sozinha"],
    );
  });

  it("lerNpmConfigList separa as chaves por fonte e acha o npm local prefix (formato do npm 10 e 11)", () => {
    const texto = '; "user" config from /casa/.npmrc\n\n//registry.npmjs.org/:_authToken = (protected)\nfund = false\n\n'
      + '; "project" config from /p/.npmrc\n\npackage-lock = false\n\n; "env" config from environment\n\nloglevel = "silent"\n\n'
      + "; node bin location = /usr/local/bin/node\n; node version = v22.0.0\n; npm local prefix = /p\n; npm version = 10.9.2\n; cwd = /p\n";
    const { chaves, prefixoLocal } = lerNpmConfigList(texto);
    assert.equal(prefixoLocal, "/p");
    assert.deepEqual(chaves, [
      { chave: "//registry.npmjs.org/:_authToken", origem: "user (/casa/.npmrc)" },
      { chave: "fund", origem: "user (/casa/.npmrc)" },
      { chave: "package-lock", origem: "project (/p/.npmrc)" },
      { chave: "loglevel", origem: "env (environment)" },
    ]);
    assert.deepEqual(chavesProibidas(chaves), []);
  });

  it("normalizarChave e chavesProibidas: variável em qualquer caixa vira a chave do npm; a lista não permite workspace, omit, include nem proxy", () => {
    assert.equal(normalizarChave("NPM_CONFIG_PREFER_OFFLINE", { doAmbiente: true }), "prefer-offline");
    assert.equal(normalizarChave("npm_config_package_lock", { doAmbiente: true }), "package-lock");
    for (const chave of ["workspace", "workspaces", "include-workspace-root", "omit", "include", "before", "proxy", "https-proxy", "cafile", "global", "audit"]) {
      assert.ok(!Object.hasOwn(CHAVES_PERMITIDAS, chave), chave);
    }
    assert.deepEqual(chavesProibidas([{ chave: "omit", origem: "a" }, { chave: "omit", origem: "a" }, { chave: "fund", origem: "a" }]), [{ chave: "omit", origem: "a" }]);
  });

  it("mesmoProjeto aceita o prefixo igual ou mascarado como o npm faz, e só isso", () => {
    const uuid = "/tmp/123e4567-e89b-12d3-a456-426614174000/dc360";
    assert.equal(mascararComoONpm(uuid), "/tmp/***/dc360");
    assert.ok(mesmoProjeto("/tmp/***/dc360", [uuid]));
    assert.ok(mesmoProjeto("/p/dc360", ["/x", "/p/dc360"]));
    assert.ok(!mesmoProjeto("/tmp/***/outro", [uuid]));
    assert.ok(!mesmoProjeto("/tmp/***/dc360", ["/tmp/nao-e-uuid/dc360"]));
    assert.ok(!mesmoProjeto(null, [uuid]));
    assert.ok(!mesmoProjeto("", [""]));
  });

  it("shrinkwrapsPresentes procura na raiz, nas pastas dadas e nos workspaces (pasta/* e literal)", () => {
    const raiz = mkdtempSync(join(tmpdir(), "auditar-sw-"));
    try {
      const escrever = (c, t = "{}") => { mkdirSync(dirname(join(raiz, c)), { recursive: true }); writeFileSync(join(raiz, c), t); };
      escrever("package.json", JSON.stringify({ workspaces: ["packages/*", "db", "nao-existe/*", "x/{a,b}"] }));
      escrever("packages/a/npm-shrinkwrap.json"); escrever("packages/b/package.json"); escrever("db/npm-shrinkwrap.json");
      escrever("app/npm-shrinkwrap.json");
      const fs = { existsSync, readFileSync, readdirSync };
      const r = shrinkwrapsPresentes(raiz, [join(raiz, "app")], fs);
      assert.deepEqual(r.achados.map((f) => f.slice(raiz.length + 1)).sort(), ["app/npm-shrinkwrap.json", "db/npm-shrinkwrap.json", "packages/a/npm-shrinkwrap.json"]);
      assert.deepEqual(r.naoExpandidos, ["x/{a,b}"]);
      escrever("npm-shrinkwrap.json");
      assert.ok(shrinkwrapsPresentes(raiz, [], fs).achados.some((f) => f === `${raiz}/npm-shrinkwrap.json`));
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("hojeEmSaoPaulo: o prazo vence no fim do dia do Brasil, e não às 21h (UTC)", () => {
    assert.equal(hojeEmSaoPaulo(new Date("2027-01-06T01:00:00Z")), "2027-01-05"); // 22h do dia 5 em São Paulo
    assert.equal(hojeEmSaoPaulo(new Date("2027-01-06T03:00:00Z")), "2027-01-06"); // meia-noite do dia 6
    assert.deepEqual(problemasDasExcecoes(ACEITAS_NO_APLICATIVO, hojeEmSaoPaulo(new Date("2027-01-06T02:59:00Z")), { exigirAdvisories: true }), []);
  });

  it("ambienteDaConsulta tira as npm_config_* do npm run e de workspace, e deixa as outras", () => {
    const env = ambienteDaConsulta({
      PATH: "/bin", npm_config_userconfig: "x", NPM_CONFIG_CACHE: "x", npm_config_local_prefix: "x", npm_config_workspace: "x",
      npm_config_before: "x", npm_config_loglevel: "x",
    });
    assert.deepEqual(Object.keys(env).sort(), ["PATH", "npm_config_before", "npm_config_loglevel"]);
  });

  it("defeitoDaArvore exige dependencies.total maior que zero", () => {
    assert.equal(defeitoDaArvore(limpo), null);
    for (const rel of [{}, { metadata: {} }, { metadata: { dependencies: { total: 0 } } }, { metadata: { dependencies: { total: "249" } } }]) {
      assert.ok(defeitoDaArvore(rel), JSON.stringify(rel));
    }
  });

  it("a lista do aplicativo exige advisories: sem a lista, lista vazia ou id inválido reprova", () => {
    const boa = { advisories: { "GHSA-aaaa-aaaa-aaaa": "high" }, motivo: "m", dono: "Rafael", ate: "2027-01-05" };
    const HOJE = "2026-10-20";
    assert.deepEqual(problemasDasExcecoes({ p: boa }, HOJE, { exigirAdvisories: true }), []);
    const { advisories, ...semLista } = boa;
    for (const e of [
      semLista, { ...boa, advisories: {} }, { ...boa, advisories: ["GHSA-aaaa-aaaa-aaaa"] },
      { ...boa, advisories: { "node-forge": "high" } }, { ...boa, advisories: { "GHSA-aaaa-aaaa-aaaa": "grave" } },
      { ...boa, advisories: { "GHSA-aaaa-aaaa-aaaa": undefined } },
    ]) {
      const p = problemasDasExcecoes({ p: e }, HOJE, { exigirAdvisories: true });
      assert.equal(p.length, 1, JSON.stringify(e));
      assert.match(p[0], /^p: (exceção sem a lista `advisories`|advisory inválida|gravidade aceita inválida)/);
    }
    // A lista de desenvolvimento não reprova, então não exige advisories.
    assert.deepEqual(problemasDasExcecoes({ p: semLista }, HOJE), []);
  });
});

describe("exceções do CP-03: nome, dono e prazo", () => {
  const boa = { motivo: "porque sim", dono: "Rafael", ate: "2027-01-05" };
  const HOJE = "2026-10-13";

  it("aceita exceção com motivo, dono e prazo no futuro", () => {
    assert.deepEqual(problemasDasExcecoes({ pacote: boa }, HOJE), []);
  });

  it("aceita exceção que vence hoje (o prazo vale até o fim do dia)", () => {
    assert.deepEqual(problemasDasExcecoes({ pacote: { ...boa, ate: HOJE } }, HOJE), []);
  });

  it("reprova exceção sem prazo", () => {
    const { ate, ...semPrazo } = boa;
    const p = problemasDasExcecoes({ pacote: semPrazo }, HOJE);
    assert.equal(p.length, 1);
    assert.match(p[0], /pacote.*sem prazo/);
  });

  it("reprova prazo em branco, fora do formato ou que não existe no calendário", () => {
    for (const ate of ["", "  ", "05/01/2027", "2027-1-5", "2027-02-30", "2027-13-01", "amanhã", 20270105, null]) {
      const p = problemasDasExcecoes({ pacote: { ...boa, ate } }, HOJE);
      assert.equal(p.length, 1, `prazo ${JSON.stringify(ate)} deveria reprovar`);
      assert.match(p[0], /pacote.*prazo/);
    }
  });

  it("reprova exceção sem dono ou com dono em branco", () => {
    for (const dono of [undefined, "", "   ", null]) {
      const p = problemasDasExcecoes({ pacote: { ...boa, dono } }, HOJE);
      assert.equal(p.length, 1);
      assert.match(p[0], /pacote.*sem dono/);
    }
  });

  it("reprova exceção sem motivo ou com motivo em branco", () => {
    for (const motivo of [undefined, "", "   "]) {
      const p = problemasDasExcecoes({ pacote: { ...boa, motivo } }, HOJE);
      assert.equal(p.length, 1);
      assert.match(p[0], /pacote.*sem motivo/);
    }
  });

  it("reprova exceção vencida e diz a data", () => {
    const p = problemasDasExcecoes({ pacote: { ...boa, ate: "2026-10-12" } }, HOJE);
    assert.equal(p.length, 1);
    assert.match(p[0], /pacote.*venceu em 2026-10-12/);
  });

  it("aponta todos os defeitos de uma vez, de todas as exceções", () => {
    const p = problemasDasExcecoes({ a: { motivo: "x" }, b: { ...boa, ate: "2020-01-01" } }, HOJE);
    assert.equal(p.length, 3); // a: sem dono e sem prazo; b: vencida
  });

  it("a lista REAL tem advisories, motivo, dono e prazo válidos e no futuro", () => {
    assert.ok(Object.keys(ACEITAS_NO_APLICATIVO).length > 0);
    const hoje = new Date().toISOString().slice(0, 10);
    assert.deepEqual(problemasDasExcecoes(ACEITAS_NO_APLICATIVO, hoje, { exigirAdvisories: true }), []);
  });

  it("a lista REAL de desenvolvimento nomeia os três pacotes do vitest, com dono e prazo válidos", () => {
    assert.deepEqual(Object.keys(ACEITAS_EM_DESENVOLVIMENTO).sort(), ["@vitest/mocker", "tinypool", "vitest"]);
    const hoje = new Date().toISOString().slice(0, 10);
    assert.deepEqual(problemasDasExcecoes(ACEITAS_EM_DESENVOLVIMENTO, hoje), []);
  });
});

describe("auditar.mjs com a lista de exceções adulterada", () => {
  /** Copia o portão para uma pasta própria, com a lista reescrita por `alterar`. */
  function rodarCopia(alterar, { npmrc, semLockfile = false, fixturaDaCopia = {}, arquivos = {}, prefixo = "auditar-copia-" } = {}) {
    const raiz = mkdtempSync(join(tmpdir(), prefixo));
    try {
      mkdirSync(join(raiz, "scripts"));
      mkdirSync(join(raiz, "apps", "campo"), { recursive: true });
      copyFileSync(SCRIPT, join(raiz, "scripts", "auditar.mjs"));
      if (!semLockfile) copyFileSync(join(AQUI, "..", "package-lock.json"), join(raiz, "package-lock.json"));
      const lista = readFileSync(join(AQUI, "auditar-excecoes.mjs"), "utf8").replaceAll("\r\n", "\n");
      const nova = alterar(lista);
      assert.notEqual(nova, lista, "a adulteração não mudou nada: o teste estaria mentindo");
      writeFileSync(join(raiz, "scripts", "auditar-excecoes.mjs"), nova);
      for (const [caminho, conteudo] of Object.entries(arquivos)) {
        mkdirSync(dirname(join(raiz, caminho)), { recursive: true });
        writeFileSync(join(raiz, caminho), conteudo);
      }
      if (npmrc) {
        writeFileSync(join(raiz, ".npmrc"), npmrc.raiz);
        writeFileSync(join(raiz, "apps", "campo", ".npmrc"), npmrc.app);
      }
      const log = join(raiz, "chamadas.jsonl");
      const r = spawnSync(process.execPath, [join(raiz, "scripts", "auditar.mjs")], {
        encoding: "utf8",
        env: {
          ...AMBIENTE_LIMPO,
          PATH: pasta + delimiter + process.env.PATH,
          AUDITAR_LOG: log,
          AUDITAR_FIXTURE: fixtura(fixturaDaCopia),
        },
      });
      const chamadas = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
      return { codigo: r.status, saida: r.stdout + r.stderr, chamadas };
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }

  it("a cópia sem adulteração passa (controle do próprio teste)", () => {
    const { codigo, saida } = rodarCopia((t) => `${t}\n// controle\n`);
    assert.equal(codigo, 0, saida);
  });

  it("reprova a exceção sem prazo, mesmo que o pacote esteja no relatório", () => {
    const { codigo, saida } = rodarCopia((t) => t.replace(/(  "node-forge": \{[\s\S]*?dono: DONO), ate: PRAZO/, "$1"));
    assert.equal(codigo, 1, saida);
    assert.match(saida, /node-forge.*sem prazo/);
  });

  it("reprova a exceção sem dono", () => {
    const { codigo, saida } = rodarCopia((t) => t.replace(/(  "node-forge": \{[\s\S]*?)dono: DONO, /, "$1"));
    assert.equal(codigo, 1, saida);
    assert.match(saida, /node-forge.*sem dono/);
  });

  it("a consulta de controle usa o .npmrc de cada projeto (o único ajuste do npm que muda de pasta para pasta)", () => {
    const { codigo, saida, chamadas } = rodarCopia((t) => `${t}\n// controle\n`, {
      npmrc: { raiz: "; npmrc da raiz", app: "; npmrc do aplicativo" },
    });
    assert.equal(codigo, 0, saida);
    assert.deepEqual(chamadas.filter((c) => c.controle).map((c) => c.npmrc), ["; npmrc da raiz", "; npmrc do aplicativo"]);
  });

  it("reprova a exceção do aplicativo sem a lista de advisories (voltaria a aceitar pelo nome do pacote)", () => {
    const { codigo, saida } = rodarCopia((t) => t.replace(/(  "node-forge": \{\n)    advisories: \{[^}]*\},\n/, "$1"));
    assert.equal(codigo, 1, saida);
    assert.match(saida, /node-forge: exceção sem a lista `advisories`/);
  });

  it("sai 2 quando não consegue ler o package-lock.json da raiz (não dá para separar runtime de desenvolvimento)", () => {
    const { codigo, saida } = rodarCopia((t) => `${t}\n// controle\n`, { semLockfile: true });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /package-lock\.json/);
    assert.doesNotMatch(saida, /Runtime limpo/);
  });

  /*
    Rodada 7, achado 1: \`package-lock=false\` no \`.npmrc\` da raiz fazia o npm
    auditar a árvore ideal das faixas do \`package.json\`, e não o lockfile, e o
    portão aprovava um lockfile com runtime vulnerável. A chave é permitida porque
    toda chamada passa \`--package-lock=true\`, que vence a configuração.
  */
  it("package-lock=false (e offline) no .npmrc da raiz: a chave é anulada pela bandeira e o runtime vulnerável reprova", () => {
    const npmrc = { raiz: "package-lock=false\noffline=true\n", app: "package-lock=false\n" };
    const limpa = rodarCopia((t) => `${t}\n// controle\n`, { npmrc });
    assert.equal(limpa.codigo, 0, limpa.saida);
    for (const { args } of limpa.chamadas) assert.ok(args.includes("--package-lock=true"), args.join(" "));
    const { codigo, saida } = rodarCopia((t) => `${t}\n// controle\n`, { npmrc, fixturaDaCopia: { runtime: relatorio({ fastify: true }) } });
    assert.equal(codigo, 1, saida);
    assert.match(saida, /dependência de runtime/);
  });

  it("chave fora da lista no .npmrc da raiz sai 2 com o nome dela e a origem, ANTES de auditar", () => {
    for (const linha of ["before=2020-01-01", "omit=dev", "workspace=packages/shared", "workspaces=false",
      "include-workspace-root=false", "https-proxy=http://127.0.0.1:9", "ignore-scripts=true", "[secao]"]) {
      const { codigo, saida, chamadas } = rodarCopia((t) => `${t}\n// controle\n`, { npmrc: { raiz: `${linha}\n`, app: "" } });
      const chave = linha.startsWith("[") ? linha : linha.split("=")[0];
      assert.equal(codigo, 2, `${linha}: ${saida}`);
      assert.match(saida, /tem chave fora da lista permitida/);
      assert.ok(saida.includes(`  - ${chave}   (de project (`), `${linha}: ${saida}`);
      assert.equal(chamadas.length, 0, `${linha}: auditou antes de conferir a configuração`);
      assert.doesNotMatch(saida, /Runtime limpo/);
    }
  });

  it("chave fora da lista no .npmrc do aplicativo também sai 2, nomeando o aplicativo", () => {
    const { codigo, saida } = rodarCopia((t) => `${t}\n// controle\n`, { npmrc: { raiz: "fund=false\n", app: "omit=\n" } });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /para o projeto do aplicativo de campo .*tem chave fora da lista permitida/);
    assert.match(saida, /  - omit   \(de project/);
  });

  /*
    Revisão da correção 8: o \`npm-shrinkwrap.json\` vence o \`package-lock.json\` no
    npm (\`sw || lock\`). Com um shrinkwrap limpo ao lado, o portão auditava o
    shrinkwrap e aprovava o lockfile com runtime vulnerável que o Dockerfile instala.
  */
  it("sai 2, antes de auditar, se existe npm-shrinkwrap.json na raiz, no aplicativo ou num workspace", () => {
    const pacote = JSON.stringify({ name: "copia", private: true, workspaces: ["packages/*", "db"] });
    for (const onde of ["npm-shrinkwrap.json", "apps/campo/npm-shrinkwrap.json", "packages/um/npm-shrinkwrap.json", "db/npm-shrinkwrap.json"]) {
      const arquivos = { "package.json": pacote, "packages/um/package.json": "{}", "db/package.json": "{}", [onde]: "{}" };
      const { codigo, saida, chamadas } = rodarCopia((t) => `${t}\n// controle\n`, { arquivos });
      assert.equal(codigo, 2, `${onde}: ${saida}`);
      assert.ok(saida.includes(`${onde} existe, e o npm o lê NO LUGAR do package-lock.json`), `${onde}: ${saida}`);
      assert.equal(chamadas.length, 0, `${onde}: auditou com o shrinkwrap ao lado`);
      assert.doesNotMatch(saida, /Runtime limpo/);
    }
    const sem = rodarCopia((t) => `${t}\n// controle\n`, { arquivos: { "package.json": pacote, "packages/um/package.json": "{}" } });
    assert.equal(sem.codigo, 0, sem.saida);
  });

  it("sai 2 com padrão de workspace que o portão não sabe expandir (não dá para procurar shrinkwrap)", () => {
    const arquivos = { "package.json": JSON.stringify({ name: "copia", workspaces: ["pacotes/**"] }) };
    const { codigo, saida } = rodarCopia((t) => `${t}\n// controle\n`, { arquivos });
    assert.equal(codigo, 2, saida);
    assert.match(saida, /padrão de workspace que o portão não sabe expandir .*pacotes\/\*\*/);
  });

  it("projeto numa pasta com cara de UUID: o npm 11 mascara o caminho com *** e o portão reconhece o projeto mesmo assim", () => {
    const { codigo, saida } = rodarCopia((t) => `${t}\n// controle\n`, { prefixo: "123e4567-e89b-12d3-a456-426614174000-" });
    assert.equal(codigo, 0, saida);
    assert.doesNotMatch(saida, /não tomou/);
  });

  it("reprova a exceção vencida", () => {
    const { codigo, saida } = rodarCopia((t) => t.replace('const PRAZO = "2027-01-05"', 'const PRAZO = "2020-01-01"'));
    assert.equal(codigo, 1, saida);
    assert.match(saida, /venceu em 2020-01-01/);
  });
});
