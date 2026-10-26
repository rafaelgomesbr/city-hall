#!/usr/bin/env node
/**
 * ESPERA o painel de um ambiente ser publicado pela Vercel, com limite, antes
 * do selo de HML (V2-F01-E12; correção 1 da F01, achado 5 da revisão
 * independente).
 *
 * ## Por que existe
 *
 * O `deploy-hml.yml` move o ramo `homologacao` e a Vercel publica o painel a
 * partir dele. O job `painel` terminava quando o ramo se movia, e o job
 * `aprovar` punha o selo `hml-ok-<sha>` nas imagens sem ninguém saber se a
 * Vercel tinha publicado: uma falha de build do painel liberava a promoção para
 * PROD de uma versão cujo painel nunca subiu em HML.
 *
 * ## O que ele confere
 *
 * 1. Pela API do GitHub (só leitura, `deployments: read`), o deployment que a
 *    integração da Vercel registra para o COMMIT no projeto de HML, no
 *    ambiente de produção do projeto (`Production – <projeto>`): o ramo
 *    `homologacao` é o ramo de produção do projeto de HML.
 * 2. O estado mais novo desse deployment: `success` é o `Ready` da Vercel;
 *    `failure`, `error` e `inactive` reprovam na hora, com o log; o resto espera.
 * 3. Depois do `Ready`, o endereço do painel do ambiente (o `dominio` de
 *    `scripts/ambientes.json`, a mesma matriz que a API lê) responde 200 com
 *    HTML.
 *
 * Tudo com espera limitada (`--limite-min`, padrão 15): tempo esgotado reprova
 * dizendo o último estado visto. Queda de rede numa consulta não derruba a
 * espera; só o limite derruba.
 *
 * ## O que ele NÃO faz
 *
 * Não fala com a Vercel (o workflow não tem token da Vercel, de propósito), não
 * muda nada em lugar nenhum e não prova que o painel entra na API (isso é o E2E
 * do ambiente).
 *
 * Uso, de dentro de `dc360`, com `GH_TOKEN` e `GITHUB_REPOSITORY` no ambiente:
 *   node scripts/esperar-painel.mjs --ambiente=hml --projeto=NOME --commit=SHA [--limite-min=15]
 *
 * Saída: 0 publicado e respondendo; 1 falhou, esgotou o tempo ou o ambiente
 * não tem domínio declarado; 2 uso errado.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LIMITE_PADRAO_MIN = 15;
export const INTERVALO_MS = 15_000;

const MATRIZ = fileURLToPath(new URL("./ambientes.json", import.meta.url));
const API_DO_GITHUB = "https://api.github.com";

/** Lê os argumentos. Lança `Error` com a razão quando algo está errado. */
export function lerArgumentos(argv) {
  const achado = {
    ambiente: undefined,
    projeto: undefined,
    commit: undefined,
    limiteMin: LIMITE_PADRAO_MIN,
  };
  for (const arg of argv) {
    const m = /^--(ambiente|projeto|commit|limite-min)=(.*)$/.exec(arg);
    if (!m) throw new Error(`argumento desconhecido: ${arg}`);
    if (m[1] === "limite-min") achado.limiteMin = Number(m[2]);
    else achado[m[1]] = m[2].trim();
  }
  if (!["hml", "prod"].includes(achado.ambiente))
    throw new Error("--ambiente tem de ser hml ou prod");
  if (!achado.projeto || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(achado.projeto))
    throw new Error("falta --projeto=NOME (o projeto da Vercel)");
  if (!achado.commit) throw new Error("falta --commit=SHA");
  if (!/^[0-9a-f]{40}$/.test(achado.commit))
    throw new Error("--commit tem de ser o SHA de 40 hexadecimais");
  if (!Number.isInteger(achado.limiteMin) || achado.limiteMin < 1 || achado.limiteMin > 60)
    throw new Error("--limite-min tem de ser um inteiro de 1 a 60");
  return achado;
}

/** O domínio do painel do ambiente, na matriz. Sem ele, LANÇA dizendo de quem depende. */
export function dominioDoAmbiente(ambiente, matriz = JSON.parse(readFileSync(MATRIZ, "utf8"))) {
  const dominio = matriz?.ambientes?.[ambiente]?.dominio;
  if (typeof dominio !== "string" || !dominio) {
    throw new Error(
      `o domínio do painel de ${ambiente.toUpperCase()} não está declarado em scripts/ambientes.json ` +
        `(ambientes.${ambiente}.dominio é ${JSON.stringify(dominio ?? null)}). Ele nasce com o projeto do painel na Vercel ` +
        "e com o ambiente do CP-05; sem ele não há como conferir o painel, e o selo de HML não nasce.",
    );
  }
  return dominio;
}

/** O deployment mais novo de produção do projeto, ou `null`. */
export function escolherDeployment(deployments, projeto) {
  const deProducao = (Array.isArray(deployments) ? deployments : []).filter((d) => {
    const m = /^production\s+[–-]\s+(\S+)$/i.exec(String(d?.environment ?? "").trim());
    return m !== null && m[1].toLowerCase() === projeto.toLowerCase();
  });
  deProducao.sort(
    (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || (b.id ?? 0) - (a.id ?? 0),
  );
  return deProducao[0] ?? null;
}

/** O estado mais novo de um deployment: `pronto`, `falhou` ou `esperando`. */
export function estadoDoDeployment(statuses) {
  const lista = [...(Array.isArray(statuses) ? statuses : [])].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );
  const ultimo = lista[0];
  if (!ultimo) return { estado: "esperando", detalhe: "o deployment ainda não tem estado" };
  const onde =
    ultimo.log_url || ultimo.target_url ? ` (log: ${ultimo.log_url || ultimo.target_url})` : "";
  if (ultimo.state === "success") return { estado: "pronto", detalhe: "Ready (success)" };
  if (["failure", "error", "inactive"].includes(ultimo.state)) {
    return { estado: "falhou", detalhe: `a Vercel registrou o estado ${ultimo.state}${onde}` };
  }
  return { estado: "esperando", detalhe: `estado ${ultimo.state}` };
}

/** O endereço do painel tem de responder 200 com HTML. */
export function avaliarPainel(resposta) {
  const tipo = resposta.headers?.get?.("content-type") ?? "";
  if (resposta.status !== 200) return { ok: false, detalhe: `respondeu ${resposta.status}` };
  if (!/text\/html/i.test(tipo))
    return { ok: false, detalhe: `respondeu 200 com ${tipo || "tipo ausente"}, esperado HTML` };
  return { ok: true, detalhe: "respondeu 200 com HTML" };
}

/**
 * A espera inteira. `buscar` é o `fetch` (trocado nos testes); `agora` e
 * `dormir` são o relógio. Devolve `{ ok, detalhe }`.
 */
export async function esperarPainel({
  repositorio,
  token,
  commit,
  projeto,
  endereco,
  limiteMs = LIMITE_PADRAO_MIN * 60_000,
  intervaloMs = INTERVALO_MS,
  buscar = fetch,
  agora = Date.now,
  dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
  registrar = () => {},
}) {
  const inicio = agora();
  const doGithub = async (caminho) => {
    const r = await buscar(`${API_DO_GITHUB}${caminho}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`a API do GitHub respondeu ${r.status} em ${caminho}`);
    return r.json();
  };
  let ultimo = "nenhuma consulta terminou";
  let pronto = false;
  for (;;) {
    try {
      if (!pronto) {
        const lista = await doGithub(
          `/repos/${repositorio}/deployments?sha=${commit}&per_page=100`,
        );
        const deployment = escolherDeployment(lista, projeto);
        if (!deployment) {
          ultimo = `nenhum deployment de produção do projeto ${projeto} para o commit ${commit} (a Vercel ainda não registrou, ou o projeto tem outro nome)`;
        } else {
          const estado = estadoDoDeployment(
            await doGithub(
              `/repos/${repositorio}/deployments/${deployment.id}/statuses?per_page=100`,
            ),
          );
          if (estado.estado === "falhou") {
            return {
              ok: false,
              detalhe: `o painel de ${projeto} NÃO foi publicado para ${commit}: ${estado.detalhe}`,
            };
          }
          ultimo = `deployment ${deployment.id}: ${estado.detalhe}`;
          pronto = estado.estado === "pronto";
        }
      }
      if (pronto) {
        const r = await buscar(`https://${endereco}/`, {
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
        });
        await r.body?.cancel?.();
        const painel = avaliarPainel(r);
        if (painel.ok)
          return {
            ok: true,
            detalhe: `painel de ${projeto} Ready para ${commit}, e https://${endereco}/ ${painel.detalhe}`,
          };
        ultimo = `deployment Ready, mas https://${endereco}/ ${painel.detalhe}`;
      }
    } catch (erro) {
      ultimo = `erro de rede: ${erro?.cause?.code ?? ""} ${erro?.message ?? erro}`
        .replace(/\s+/g, " ")
        .trim();
    }
    registrar(ultimo);
    if (agora() - inicio + intervaloMs > limiteMs) {
      return {
        ok: false,
        detalhe: `tempo esgotado (${Math.round(limiteMs / 60_000)} min) esperando o painel de ${projeto}: ${ultimo}`,
      };
    }
    await dormir(intervaloMs);
  }
}

async function principal() {
  let alvo;
  try {
    alvo = lerArgumentos(process.argv.slice(2));
  } catch (erro) {
    console.error(`esperar-painel: ${erro.message}`);
    console.error(
      "uso: node scripts/esperar-painel.mjs --ambiente=hml|prod --projeto=NOME --commit=SHA [--limite-min=15]",
    );
    process.exit(2);
  }
  let endereco;
  try {
    endereco = dominioDoAmbiente(alvo.ambiente);
  } catch (erro) {
    console.error(`esperar-painel: ${erro.message}`);
    process.exit(1);
  }
  const token = process.env.GH_TOKEN;
  const repositorio = process.env.GITHUB_REPOSITORY;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repositorio ?? "")) {
    console.error(
      "esperar-painel: faltam GH_TOKEN e GITHUB_REPOSITORY (dono/repositorio) no ambiente",
    );
    process.exit(2);
  }
  const r = await esperarPainel({
    repositorio,
    token,
    commit: alvo.commit,
    projeto: alvo.projeto,
    endereco,
    limiteMs: alvo.limiteMin * 60_000,
    registrar: (linha) => console.log(`... ${linha}`),
  });
  if (r.ok) {
    console.log(r.detalhe);
    process.exit(0);
  }
  console.error(`::error::${r.detalhe}`);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
