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
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACEITAS_EM_DESENVOLVIMENTO, ACEITAS_NO_APLICATIVO, CONTROLE, REGISTRO_OFICIAL,
  aceitasAusentes, advisoriesNaoAceitas, defeitoDaArvore, defeitoDoControle, idDaAdvisory, mudancasDeGravidade,
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
if (process.env.AUDITAR_LOG) {
  const npmrc = existsSync(".npmrc") ? readFileSync(".npmrc", "utf8").trim() : null;
  appendFileSync(process.env.AUDITAR_LOG, JSON.stringify({ controle, app: cwd.endsWith("apps/campo"), args, npmrc }) + "\\n");
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
    const { fixAvailable, ids = [ghsaDe(nome)], gravidade, nodes = [`node_modules/${nome}`] } = opcoes;
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

function rodar(opcoes, { env = {} } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, PATH: pasta + delimiter + process.env.PATH, AUDITAR_FIXTURE: fixtura(opcoes), ...env },
  });
  return { codigo: r.status, saida: r.stdout + r.stderr };
}

/** Roda e devolve também cada chamada que o npm falso recebeu. */
function rodarComRegistro(opcoes) {
  const log = join(mkdtempSync(join(tmpdir(), "auditar-log-")), "chamadas.jsonl");
  const resultado = rodar(opcoes, { env: { AUDITAR_LOG: log } });
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
      for (const bandeira of [`--registry=${REGISTRO_OFICIAL}`, "--offline=false", "--prefer-offline=false", "--prefer-online", "--dry-run=false"]) {
        assert.ok(args.includes(bandeira), `falta ${bandeira} em ${args.join(" ")}`);
      }
    }
    const controles = chamadas.filter((c) => c.controle);
    assert.equal(controles.length, 2);
    for (const { args } of controles) assert.ok(args.includes("--package-lock-only"));
    assert.match(saida, /Consulta de controle: lodash 4\.17\.20 voltou com GHSA-35jh-r3h4-6jhm/);
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
    assert.match(saida, /Aplicativo de campo \(vai para o telefone\): 8 vulnerabilidade/);
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
  function rodarCopia(alterar, { npmrc, semLockfile = false } = {}) {
    const raiz = mkdtempSync(join(tmpdir(), "auditar-copia-"));
    try {
      mkdirSync(join(raiz, "scripts"));
      mkdirSync(join(raiz, "apps", "campo"), { recursive: true });
      copyFileSync(SCRIPT, join(raiz, "scripts", "auditar.mjs"));
      if (!semLockfile) copyFileSync(join(AQUI, "..", "package-lock.json"), join(raiz, "package-lock.json"));
      const lista = readFileSync(join(AQUI, "auditar-excecoes.mjs"), "utf8").replaceAll("\r\n", "\n");
      const nova = alterar(lista);
      assert.notEqual(nova, lista, "a adulteração não mudou nada: o teste estaria mentindo");
      writeFileSync(join(raiz, "scripts", "auditar-excecoes.mjs"), nova);
      if (npmrc) {
        writeFileSync(join(raiz, ".npmrc"), npmrc.raiz);
        writeFileSync(join(raiz, "apps", "campo", ".npmrc"), npmrc.app);
      }
      const log = join(raiz, "chamadas.jsonl");
      const r = spawnSync(process.execPath, [join(raiz, "scripts", "auditar.mjs")], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: pasta + delimiter + process.env.PATH,
          AUDITAR_LOG: log,
          AUDITAR_FIXTURE: fixtura({}),
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

  it("reprova a exceção vencida", () => {
    const { codigo, saida } = rodarCopia((t) => t.replace('const PRAZO = "2027-01-05"', 'const PRAZO = "2020-01-01"'));
    assert.equal(codigo, 1, saida);
    assert.match(saida, /venceu em 2020-01-01/);
  });
});
