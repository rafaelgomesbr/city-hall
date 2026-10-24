/**
 * Testes do smoke das imagens Docker e do que prende o job `imagens`
 * (V2-F01-E08).
 *
 * Dois grupos. O primeiro prova a RÉGUA (`smoke-das-imagens.mjs`) com um `docker`
 * de mentira: a imagem boa passa, e a que roda como root, a que não tem Chromium
 * e a que carimba a versão errada reprovam. Régua que nunca reprova não prova
 * nada. O segundo prende os arquivos: base por digest nos dois Dockerfiles, o
 * carimbo do build antes do `USER node`, o job `imagens` fazendo o que a etapa
 * promete (sem segredo, com Postgres 17, com as quatro conferências) e o
 * runbook de rollback com as cinco frentes.
 *
 * Nada aqui precisa de Docker: a prova de que a imagem constrói e sobe é o job
 * `imagens` do CI, que roda isto de novo antes de construir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  USUARIO_ESPERADO, principal, problemasDaSaude, problemasDoChromium, problemasDoUsuario,
} from "./smoke-das-imagens.mjs";

const RAIZ = new URL("../../", import.meta.url);
const ler = (relativo) => readFileSync(new URL(relativo, RAIZ), "utf8");
const IMAGEM = "dc360-api:ci";
const IMAGEM_POSTGIS =
  "postgis/postgis:17-3.5@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6";
const POSTGIS_17_POR_DIGEST = IMAGEM_POSTGIS.replace(/[./]/g, "\\$&");
const VERSAO = "0.1.0";
const COMMIT = "f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c";

/**
 * Um `docker` de mentira. `cenario` troca o que a imagem "tem": usuário
 * configurado, uid, nome, e a resposta do Chromium. O padrão é a imagem boa.
 */
function dockerDeMentira(cenario = {}) {
  const c = {
    configurado: USUARIO_ESPERADO, uid: "1000", nome: USUARIO_ESPERADO,
    chromium: { status: 0, stdout: "Chromium 131.0.6778.204 built on Debian 12\n", stderr: "" },
    ...cenario,
  };
  const chamadas = [];
  const docker = (args) => {
    chamadas.push(args);
    const linha = args.join(" ");
    if (args[0] === "image" && args[1] === "inspect") return { status: 0, stdout: `${c.configurado}\n`, stderr: "" };
    if (linha.includes("--entrypoint id") && args.at(-1) === "-u") return { status: 0, stdout: `${c.uid}\n`, stderr: "" };
    if (linha.includes("--entrypoint id") && args.at(-1) === "-un") return { status: 0, stdout: `${c.nome}\n`, stderr: "" };
    if (linha.includes("--entrypoint chromium")) return c.chromium;
    return { status: 127, stdout: "", stderr: `docker de mentira: não conheço ${linha}` };
  };
  docker.chamadas = chamadas;
  return docker;
}

const SAUDE_DA_API = JSON.stringify({
  status: "ok", banco: "ok", ultimaMigracao: "060", eliminacoes: { agendadas: 0, vencidas: 0 }, push: null,
  versao: VERSAO, commit: COMMIT,
});
const SAUDE_DO_CONSOLE = JSON.stringify({ ok: true, versao: VERSAO, commit: COMMIT });

// ----- a régua -----

test("a imagem boa passa nas três conferências de imagem, com o docker pelo ponto de entrada trocado", () => {
  const docker = dockerDeMentira();
  assert.deepEqual(problemasDoUsuario(docker, IMAGEM), []);
  assert.deepEqual(problemasDoChromium(docker, IMAGEM), []);
  // O smoke não depende do CMD da imagem: troca o ponto de entrada, sempre.
  const execucoes = docker.chamadas.filter((a) => a[0] === "run");
  assert.ok(execucoes.length >= 3);
  for (const a of execucoes) assert.ok(a.includes("--entrypoint") && a.includes("--rm"), a.join(" "));
});

test("negativo: imagem sem USER node (root na configuração) reprova", () => {
  const p = problemasDoUsuario(dockerDeMentira({ configurado: "" }), IMAGEM);
  assert.ok(p.some((x) => /declara o usuário ""/.test(x) && /root/.test(x)), p.join(" | "));
});

test("negativo: processo com uid 0 reprova, mesmo se a configuração disser node", () => {
  const p = problemasDoUsuario(dockerDeMentira({ uid: "0", nome: "root" }), IMAGEM);
  assert.ok(p.some((x) => /roda como root \(uid 0\)/.test(x)), p.join(" | "));
  assert.ok(p.some((x) => /roda como "root"/.test(x)), p.join(" | "));
});

test("negativo: usuário que não é o node (mesmo sem ser root) reprova", () => {
  const p = problemasDoUsuario(dockerDeMentira({ configurado: "app", uid: "1001", nome: "app" }), IMAGEM);
  assert.equal(p.length, 2, p.join(" | "));
});

test("negativo: imagem sem Chromium reprova, e Chromium que responde outra coisa também", () => {
  const sem = problemasDoChromium(
    dockerDeMentira({ chromium: { status: 127, stdout: "", stderr: "executable file `chromium` not found" } }), IMAGEM,
  );
  assert.equal(sem.length, 1);
  assert.match(sem[0], /chromium --version.*falhou.*127/);
  const estranho = problemasDoChromium(
    dockerDeMentira({ chromium: { status: 0, stdout: "Firefox 130\n", stderr: "" } }), IMAGEM,
  );
  assert.match(estranho[0], /não é a versão do Chromium/);
});

test("a /saude da API e a do console passam quando versao e commit são os do build", () => {
  assert.deepEqual(problemasDaSaude(SAUDE_DA_API, "api", VERSAO, COMMIT), []);
  assert.deepEqual(problemasDaSaude(SAUDE_DO_CONSOLE, "console", VERSAO, COMMIT), []);
});

test("negativo: /saude com versao ou commit diferentes do build, banco fora, ok falso ou lixo reprova", () => {
  const trocada = problemasDaSaude(SAUDE_DA_API, "api", "0.2.0", COMMIT);
  assert.equal(trocada.length, 1);
  assert.match(trocada[0], /versao.*0\.1\.0.*0\.2\.0/);

  const outroCommit = problemasDaSaude(SAUDE_DA_API, "api", VERSAO, "a".repeat(40));
  assert.match(outroCommit[0], /commit/);

  // A imagem construída sem os argumentos de build: tudo "desconhecida".
  const semCarimbo = JSON.stringify({ status: "ok", banco: "ok", versao: "desconhecida", commit: "desconhecido" });
  assert.equal(problemasDaSaude(semCarimbo, "api", VERSAO, COMMIT).length, 2);

  const bancoFora = JSON.stringify({ status: "indisponivel", banco: "indisponivel" });
  assert.ok(problemasDaSaude(bancoFora, "api", VERSAO, COMMIT).some((x) => /banco/.test(x)));

  assert.ok(problemasDaSaude(JSON.stringify({ ok: false, versao: VERSAO, commit: COMMIT }), "console", VERSAO, COMMIT)
    .some((x) => /ok é false/.test(x)));
  assert.match(problemasDaSaude("<html>502</html>", "api", VERSAO, COMMIT)[0], /não é JSON/);
  assert.match(problemasDaSaude(SAUDE_DA_API, "outro", VERSAO, COMMIT)[0], /desconhecido/);
});

test("o comando devolve 0, 1 e 2 como o CI espera, e escreve o motivo da reprovação", () => {
  const saida = { log: [], error: [] };
  const anota = { log: (m) => saida.log.push(m), error: (m) => saida.error.push(m) };
  const arquivos = { "boa.json": SAUDE_DA_API, "ruim.json": JSON.stringify({ status: "ok", banco: "ok", versao: "9.9.9", commit: COMMIT }) };
  const deps = { docker: dockerDeMentira(), ler: (c) => arquivos[c], saida: anota };

  assert.equal(principal(["usuario", IMAGEM], deps), 0);
  assert.equal(principal(["chromium", IMAGEM], deps), 0);
  assert.equal(principal(["saude-api", "boa.json", VERSAO, COMMIT], deps), 0);
  assert.equal(saida.error.length, 0);

  assert.equal(principal(["saude-api", "ruim.json", VERSAO, COMMIT], deps), 1);
  assert.match(saida.error.join("\n"), /REPROVADO: versao/);
  assert.equal(principal(["usuario", IMAGEM], { ...deps, docker: dockerDeMentira({ uid: "0", nome: "root", configurado: "" }) }), 1);

  assert.equal(principal([], deps), 2);
  assert.equal(principal(["usuario"], deps), 2);
  assert.equal(principal(["saude-api", "boa.json", "", COMMIT], deps), 2);
});

// ----- os arquivos -----

const DIGEST = /^FROM node:22-bookworm-slim@sha256:[0-9a-f]{64} AS base$/m;

test("os dois Dockerfiles têm a base fixada por digest, o mesmo digest, e o carimbo do build antes do USER node", () => {
  const api = ler("dc360/Dockerfile");
  const console_ = ler("dc360/Dockerfile.console");
  for (const [nome, texto] of [["Dockerfile", api], ["Dockerfile.console", console_]]) {
    assert.match(texto, DIGEST, `${nome}: FROM por digest`);
    assert.doesNotMatch(texto, /^FROM node:[^@\s]+ AS/m, `${nome}: FROM por tag móvel`);
    const ultimaLinhaUtil = texto.split("\n").filter((l) => /^(ARG|ENV|USER|CMD|EXPOSE)\b/.test(l));
    assert.ok(ultimaLinhaUtil.some((l) => l.startsWith("ARG DC360_VERSAO=")), `${nome}: ARG DC360_VERSAO`);
    assert.ok(ultimaLinhaUtil.some((l) => l.startsWith("ARG DC360_COMMIT=")), `${nome}: ARG DC360_COMMIT`);
    const posicao = (re) => texto.search(re);
    assert.ok(posicao(/^ARG DC360_VERSAO=/m) > 0 && posicao(/^ARG DC360_VERSAO=/m) < posicao(/^USER node$/m), `${nome}: ARG depois do USER`);
    assert.match(texto, /ENV DC360_VERSAO=\$DC360_VERSAO \\\n\s+DC360_COMMIT=\$DC360_COMMIT/, `${nome}: o ENV repete os dois ARG`);
    assert.equal([...texto.matchAll(/^USER (\S+)$/gm)].map((m) => m[1]).join(","), "node", `${nome}: um USER só, o node`);
  }
  assert.equal(DIGEST.exec(api)[0], DIGEST.exec(console_)[0], "as duas imagens usam a mesma base");
});

/** O texto sem as linhas que são só comentário. */
const semComentarios = (texto) => texto.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

/** Os jobs do workflow como `{ id, texto }` (formato do repositório: `jobs:` na coluna 0, um job a 2 espaços). */
function jobsDe(texto) {
  const linhas = semComentarios(texto).split("\n");
  const inicio = linhas.findIndex((l) => /^jobs:\s*$/.test(l));
  const jobs = [];
  let atual = null;
  for (const linha of linhas.slice(inicio + 1)) {
    if (/^\S/.test(linha)) break;
    const abre = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(linha);
    if (abre) { atual = { id: abre[1], linhas: [] }; jobs.push(atual); } else if (atual) atual.linhas.push(linha);
  }
  return jobs.map((j) => ({ id: j.id, texto: j.linhas.join("\n") }));
}

const workflow = ler(".github/workflows/verificar.yml");
const job = jobsDe(workflow).find((j) => j.id === "imagens");

test("o job `imagens` existe, sem segredo, sem permissão extra, com Postgres 17 e timeout", () => {
  assert.ok(job, "job `imagens` ausente do verificar.yml");
  assert.match(job.texto, /^ {4}name: Imagens Docker \(API e console\)$/m);
  assert.match(job.texto, /^ {4}runs-on: ubuntu-24\.04$/m);
  assert.match(job.texto, /^ {4}timeout-minutes: \d+$/m);
  assert.match(job.texto, new RegExp(`^ {8}image: ${POSTGIS_17_POR_DIGEST}$`, "m"));
  assert.doesNotMatch(job.texto, /\bsecrets\./, "o job não recebe segredo");
  assert.doesNotMatch(job.texto, /^ {4}permissions:/m, "o job usa só o contents: read do topo");
  assert.doesNotMatch(job.texto, /docker (push|login)|registry\.fly\.io|FLY_API_TOKEN/, "o job não publica imagem");
});

test("o job `imagens` constrói as duas imagens com os dois argumentos de build e roda as quatro conferências", () => {
  assert.match(job.texto, /docker build[^\n]*-f Dockerfile -t dc360-api:ci/);
  assert.match(job.texto, /docker build[^\n]*-f Dockerfile\.console -t dc360-console:ci/);
  assert.equal([...job.texto.matchAll(/--build-arg DC360_VERSAO="\$DC360_VERSAO"/g)].length, 2);
  assert.equal([...job.texto.matchAll(/--build-arg DC360_COMMIT="\$DC360_COMMIT"/g)].length, 2);
  for (const conferencia of [
    "smoke-das-imagens.mjs usuario dc360-api:ci",
    "smoke-das-imagens.mjs usuario dc360-console:ci",
    "smoke-das-imagens.mjs chromium dc360-api:ci",
    "smoke-das-imagens.mjs saude-api",
    "smoke-das-imagens.mjs saude-console",
  ]) assert.ok(job.texto.includes(conferencia), `falta a conferência: ${conferencia}`);
  assert.ok(job.texto.includes("scripts/versao.mjs conferir"), "o job confere as versões antes de carimbar");
  assert.ok(job.texto.includes("NODE_ENV=development"), "a API do smoke sobe em desenvolvimento");
  assert.ok(job.texto.includes("-e DATABASE_URL=postgres://dc360_setup:setup@localhost:5432/dc360"), "a migração usa o papel de setup");
  assert.ok(job.texto.includes("DATABASE_URL=postgres://dc360_api:api@localhost:5432/dc360"), "a API usa o papel restrito");
});

test("o commit do build é o da ponta do PR, e não o do merge sintético", () => {
  assert.match(job.texto, /commit="\$\{PR_HEAD_SHA:-\$GITHUB_SHA\}"/);
});

test("o nome do job `imagens` é check obrigatório da master", () => {
  const ruleset = JSON.parse(ler(".github/rulesets/master.json"));
  const contextos = ruleset.rules.find((r) => r.type === "required_status_checks").parameters.required_status_checks.map((c) => c.context);
  assert.ok(contextos.includes("Imagens Docker (API e console)"));
});

test("o implantavel prova a partida contra o Postgres 17 de produção, e nenhum job fica em 16", () => {
  const implantavel = jobsDe(workflow).find((j) => j.id === "implantavel");
  assert.match(implantavel.texto, new RegExp(`^ {8}image: ${POSTGIS_17_POR_DIGEST}$`, "m"));
  assert.doesNotMatch(semComentarios(workflow), /image: postgres:16/);
});

test("PostGIS 17 por digest (V2-F01-E21): implantavel, imagens e compose usam a mesma imagem, e nenhum usa tag solta", () => {
  const compose = ler("dc360/compose.yaml");
  const imagensDoCompose = [...compose.matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(imagensDoCompose, [IMAGEM_POSTGIS, IMAGEM_POSTGIS], "banco e papeis");
  const doWorkflow = [...semComentarios(workflow).matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(doWorkflow, [IMAGEM_POSTGIS, IMAGEM_POSTGIS], "implantavel e imagens");
  assert.match(IMAGEM_POSTGIS, /^postgis\/postgis:17-[\d.]+@sha256:[0-9a-f]{64}$/);
});

test("o implantavel roda test:espacial exigindo PostGIS e reprova se o teste foi pulado", () => {
  const implantavel = jobsDe(workflow).find((j) => j.id === "implantavel");
  assert.match(implantavel.texto, /^ {10}DC360_EXIGE_POSTGIS: "1"$/m);
  assert.match(implantavel.texto, /^ {10}DC360_POSTGRES_DE_PROVA: postgres:\/\/postgres:postgres@localhost:5432\/postgres$/m);
  assert.ok(implantavel.texto.includes("npm run test:espacial"), "falta o test:espacial");
  assert.ok(implantavel.texto.includes('grep -Eq "Tests .*skipped"'), "pulado tem de reprovar");
});

test("test:espacial existe na raiz e no db, e o npm test comum não roda os espaciais", () => {
  const raiz = JSON.parse(ler("dc360/package.json"));
  const db = JSON.parse(ler("dc360/db/package.json"));
  assert.equal(raiz.scripts["test:espacial"], "npm run test:espacial --workspace @dc360/db");
  assert.equal(db.scripts["test:espacial"], "vitest run --config vitest.espacial.config.ts");
  assert.ok(!raiz.scripts.verificar.includes("test:espacial"), "o verificar local não exige Docker");
  assert.match(ler("dc360/db/vitest.config.ts"), /exclude:.*\*\*\/\*\.espacial\.test\.ts/);
  assert.match(ler("dc360/db/vitest.espacial.config.ts"), /include: \["test\/\*\*\/\*\.espacial\.test\.ts"\]/);
});

test("rollback.md existe e cobre as cinco frentes com o comando de cada uma", () => {
  const caminho = "dc360/docs/runbooks/rollback.md";
  assert.ok(existsSync(fileURLToPath(new URL(caminho, RAIZ))), "falta dc360/docs/runbooks/rollback.md");
  const texto = ler(caminho);
  for (const [frente, rotulo] of [
    [/^## .*API/m, "seção da API"],
    [/fly releases/, "fly releases"],
    [/fly deploy[^\n]*--image/, "fly deploy --image"],
    [/^## .*[Pp]ainel/m, "seção do painel"],
    [/Vercel/, "Vercel"],
    [/^## .*[Cc]onsole/m, "seção do console"],
    [/^## .*[Aa]plicativo/m, "seção do aplicativo"],
    [/EAS/, "EAS"],
    [/^## .*[Bb]anco/m, "seção do banco"],
    [/\/saude/, "conferência por /saude"],
  ]) assert.match(texto, frente, `rollback.md sem ${rotulo}`);
  assert.ok(!texto.includes(String.fromCharCode(0x2014)), "travessão proibido");
});
