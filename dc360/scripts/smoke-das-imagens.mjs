#!/usr/bin/env node
/**
 * As conferências do smoke das imagens Docker (job `imagens` do `verificar.yml`,
 * V2-F01-E08).
 *
 * O job constrói as duas imagens e as sobe. O que ele CONFERE depois de subir
 * mora aqui, e não em `run:` solto do workflow, por um motivo só: conferência que
 * só existe dentro do YAML não tem teste, e conferência sem teste negativo
 * aprova qualquer coisa. Cada função abaixo devolve a LISTA DE PROBLEMAS (vazia
 * quer dizer que passou), recebe o `docker` por parâmetro, e
 * `smoke-das-imagens.test.mjs` prova os dois lados: a imagem boa passa, e a
 * imagem que roda como root, sem Chromium ou com a versão trocada reprova.
 *
 * Uso (da pasta dc360, no job):
 *   node scripts/smoke-das-imagens.mjs usuario IMAGEM
 *   node scripts/smoke-das-imagens.mjs chromium IMAGEM
 *   node scripts/smoke-das-imagens.mjs saude-api ARQUIVO_JSON VERSAO COMMIT
 *   node scripts/smoke-das-imagens.mjs saude-console ARQUIVO_JSON VERSAO COMMIT
 * Saída: 0 passou, 1 achou problema (impresso), 2 uso errado.
 *
 * Nada aqui lê segredo nem escreve fora do stdout.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** O usuário que as duas imagens declaram (`USER node` nos Dockerfiles). */
export const USUARIO_ESPERADO = "node";

/** `docker` de verdade: devolve { status, stdout, stderr }. */
export function dockerDeVerdade(args) {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error?.message ?? "") };
}

/** Roda um comando dentro da imagem, trocando o ponto de entrada. */
function dentroDaImagem(docker, imagem, comando, argumentos = []) {
  return docker(["run", "--rm", "--entrypoint", comando, imagem, ...argumentos]);
}

/**
 * O processo da imagem NÃO é root, e a imagem diz isso na configuração.
 * Root no lugar de `USER node` reprova (o teste de autorização da etapa).
 */
export function problemasDoUsuario(docker, imagem) {
  const problemas = [];

  const configurado = docker(["image", "inspect", "--format", "{{.Config.User}}", imagem]);
  if (configurado.status !== 0) {
    problemas.push(`não consegui ler a configuração da imagem ${imagem}: ${configurado.stderr.trim()}`);
  } else if (configurado.stdout.trim() !== USUARIO_ESPERADO) {
    problemas.push(
      `a configuração da imagem ${imagem} declara o usuário "${configurado.stdout.trim()}" `
      + `(esperado "${USUARIO_ESPERADO}"): sem \`USER ${USUARIO_ESPERADO}\` o contêiner roda como root`,
    );
  }

  const uid = dentroDaImagem(docker, imagem, "id", ["-u"]);
  const nome = dentroDaImagem(docker, imagem, "id", ["-un"]);
  if (uid.status !== 0 || nome.status !== 0) {
    problemas.push(`não consegui rodar \`id\` dentro de ${imagem}: ${(uid.stderr || nome.stderr).trim()}`);
  } else {
    if (uid.stdout.trim() === "0") problemas.push(`o processo de ${imagem} roda como root (uid 0)`);
    if (nome.stdout.trim() !== USUARIO_ESPERADO) {
      problemas.push(`o processo de ${imagem} roda como "${nome.stdout.trim()}" (esperado "${USUARIO_ESPERADO}")`);
    }
  }
  return problemas;
}

/** O Chromium da imagem da API existe e responde `--version`. Sem ele o PDF do laudo é 503. */
export function problemasDoChromium(docker, imagem) {
  const r = dentroDaImagem(docker, imagem, "chromium", ["--version"]);
  if (r.status !== 0) {
    return [`\`chromium --version\` falhou dentro de ${imagem} (código ${r.status}): ${r.stderr.trim()}`];
  }
  if (!/^Chromium \d+\.\d+/.test(r.stdout.trim())) {
    return [`\`chromium --version\` respondeu algo que não é a versão do Chromium: "${r.stdout.trim()}"`];
  }
  return [];
}

/**
 * O corpo de `/saude`. `tipo` é "api" (`status` e `banco` "ok") ou "console"
 * (`ok` verdadeiro). Nos dois, `versao` e `commit` têm de ser os do build: é a
 * mesma conta que o rollback faz de fora.
 */
export function problemasDaSaude(texto, tipo, versao, commit) {
  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return [`a resposta de /saude não é JSON: ${String(texto).slice(0, 120)}`];
  }
  const problemas = [];
  if (tipo === "api") {
    if (corpo.status !== "ok") problemas.push(`status é ${JSON.stringify(corpo.status)} (esperado "ok")`);
    if (corpo.banco !== "ok") problemas.push(`banco é ${JSON.stringify(corpo.banco)} (esperado "ok")`);
  } else if (tipo === "console") {
    if (corpo.ok !== true) problemas.push(`ok é ${JSON.stringify(corpo.ok)} (esperado true)`);
  } else {
    problemas.push(`tipo de /saude desconhecido: ${tipo}`);
  }
  if (corpo.versao !== versao) {
    problemas.push(`versao é ${JSON.stringify(corpo.versao)} e o build passou ${JSON.stringify(versao)}`);
  }
  if (corpo.commit !== commit) {
    problemas.push(`commit é ${JSON.stringify(corpo.commit)} e o build passou ${JSON.stringify(commit)}`);
  }
  return problemas;
}

export function principal(argv, { docker = dockerDeVerdade, ler = (c) => readFileSync(c, "utf8"), saida = console } = {}) {
  const [comando, ...resto] = argv;
  let problemas;
  if (comando === "usuario" && resto.length === 1) {
    problemas = problemasDoUsuario(docker, resto[0]);
  } else if (comando === "chromium" && resto.length === 1) {
    problemas = problemasDoChromium(docker, resto[0]);
  } else if ((comando === "saude-api" || comando === "saude-console") && resto.length === 3) {
    const [arquivo, versao, commit] = resto;
    if (!versao || !commit) {
      saida.error("versão e commit esperados não podem ser vazios");
      return 2;
    }
    problemas = problemasDaSaude(ler(arquivo), comando === "saude-api" ? "api" : "console", versao, commit);
  } else {
    saida.error("uso: smoke-das-imagens.mjs usuario|chromium IMAGEM | saude-api|saude-console ARQUIVO VERSAO COMMIT");
    return 2;
  }
  if (problemas.length > 0) {
    for (const p of problemas) saida.error(`REPROVADO: ${p}`);
    return 1;
  }
  saida.log(`ok: ${comando} ${resto[0]}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2));
}
