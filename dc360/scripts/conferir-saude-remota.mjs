#!/usr/bin/env node
/**
 * Confere, DE FORA e com tentativas, que o app implantado está de pé e é a versão
 * certa (V2-F01-E12).
 *
 * Os workflows de deploy (`deploy-hml.yml` e `promover-producao.yml`) chamam isto
 * depois de cada `fly deploy`. O `fly deploy` já espera a verificação de saúde do
 * Fly, mas ela só diz que o processo responde: não diz QUE imagem está de pé. A
 * resposta de `/saude` traz `versao` e `commit` (carimbo do build, V2-F01-E08), e
 * é isso que prova que o digest implantado é o que o workflow quis implantar. Um
 * deploy que "deu certo" e deixou o commit antigo no ar é exatamente o defeito que
 * esta conferência existe para pegar.
 *
 * Reaproveita a régua de `smoke-das-imagens.mjs` (`problemasDaSaude`), a mesma que
 * o CI usa sobre a imagem recém-construída, para API e console terem um critério só.
 *
 * Uso:
 *   node scripts/conferir-saude-remota.mjs --tipo=api|console --url=https://app.fly.dev \
 *     --versao=X.Y.Z --commit=<sha de 40 caracteres> [--tentativas=24] [--espera=5]
 *
 * Saída: 0 conferido, 1 não ficou como esperado dentro das tentativas, 2 uso errado.
 * Nunca imprime cabeçalho nem corpo além do que `/saude` já publica (rota pública).
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { problemasDaSaude } from "./smoke-das-imagens.mjs";

const SHA_COMPLETO = /^[0-9a-f]{40}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Lê `--chave=valor` de uma lista de argumentos. */
export function lerArgumentos(argv) {
  const opcoes = {};
  for (const arg of argv) {
    const m = /^--([\w-]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`argumento inválido: ${arg}`);
    opcoes[m[1]] = m[2];
  }
  return opcoes;
}

/** Problemas dos argumentos. Lista vazia é tudo certo. */
export function problemasDeUso(opcoes) {
  const problemas = [];
  if (!["api", "console"].includes(opcoes.tipo)) problemas.push("--tipo tem de ser api ou console");
  // https obrigatório: conferir a saúde por HTTP puro aceitaria um intermediário.
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(opcoes.url ?? ""))
    problemas.push("--url tem de ser https, sem caminho nem barra final");
  if (!SEMVER.test(opcoes.versao ?? "")) problemas.push("--versao tem de ser X.Y.Z");
  if (!SHA_COMPLETO.test(opcoes.commit ?? ""))
    problemas.push("--commit tem de ser o SHA completo de 40 caracteres");
  for (const nome of ["tentativas", "espera"]) {
    if (opcoes[nome] !== undefined && !/^[1-9]\d{0,3}$/.test(opcoes[nome]))
      problemas.push(`--${nome} tem de ser um inteiro positivo`);
  }
  return problemas;
}

/**
 * Pergunta ao `/saude` até ele responder o esperado ou as tentativas acabarem.
 * `buscar` e `dormir` são injetados para o teste não usar rede nem relógio.
 */
export async function esperarSaude(
  { url, tipo, versao, commit, tentativas = 24, espera = 5 },
  {
    buscar = (u) => fetch(u, { signal: AbortSignal.timeout(10_000) }),
    dormir = (s) => new Promise((r) => setTimeout(r, s * 1000)),
    saida = console,
  } = {},
) {
  let ultimo = ["nenhuma tentativa feita"];
  for (let n = 1; n <= tentativas; n++) {
    try {
      const resposta = await buscar(`${url}/saude`);
      const texto = await resposta.text();
      ultimo = resposta.ok
        ? problemasDaSaude(texto, tipo, versao, commit)
        : [`HTTP ${resposta.status}`];
    } catch (erro) {
      ultimo = [`sem resposta: ${erro?.cause?.code ?? erro?.name ?? "erro de rede"}`];
    }
    if (ultimo.length === 0) {
      saida.log(`ok: ${url}/saude é ${tipo} ${versao} (${commit.slice(0, 7)}), na tentativa ${n}`);
      return 0;
    }
    saida.log(`tentativa ${n}/${tentativas}: ${ultimo.join("; ")}`);
    if (n < tentativas) await dormir(espera);
  }
  for (const p of ultimo) saida.error(`REPROVADO: ${p}`);
  return 1;
}

export async function principal(argv, dependencias = {}) {
  const saida = dependencias.saida ?? console;
  let opcoes;
  try {
    opcoes = lerArgumentos(argv);
  } catch (erro) {
    saida.error(erro.message);
    return 2;
  }
  const problemas = problemasDeUso(opcoes);
  if (problemas.length > 0) {
    for (const p of problemas) saida.error(`uso: ${p}`);
    return 2;
  }
  return esperarSaude(
    {
      url: opcoes.url,
      tipo: opcoes.tipo,
      versao: opcoes.versao,
      commit: opcoes.commit,
      ...(opcoes.tentativas ? { tentativas: Number(opcoes.tentativas) } : {}),
      ...(opcoes.espera ? { espera: Number(opcoes.espera) } : {}),
    },
    dependencias,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void principal(process.argv.slice(2)).then((codigo) => {
    process.exitCode = codigo;
  });
}
