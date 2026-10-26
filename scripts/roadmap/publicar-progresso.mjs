#!/usr/bin/env node
/**
 * Atualiza a página de progresso da V2 (https://defesa-civil-progresso.fly.dev/progresso), protegida por senha.
 *
 * Roda a coleta do STATUS, a estimativa de prazo, o gerador visual e a página de decisões pendentes
 * (/progresso/decisoes, de `semanais/progresso/decisoes.json`), grava o resultado em
 * `docs/relatorios-v2/site/progresso/` e publica no Fly (app `defesa-civil-progresso`, `flyctl deploy` com o login do
 * Rafael na máquina; sem token em arquivo). A Vercel (`--vercel`) ficou como alternativa, mas o plano gratuito dela
 * recusa depois de 100 deploys por dia. Os NÚMEROS se atualizam a cada execução; o TEXTO vem de `semanais/progresso/editorial.json`,
 * que o agente `relatorio-semanal-visual` reescreve toda semana.
 *
 * Quando rodar: ao fim de cada etapa (commit candidato, registro de validação) e no relatório semanal.
 *
 * Uso:
 *   node scripts/roadmap/publicar-progresso.mjs [--hoje AAAA-MM-DD] [--sem-deploy] [--vercel]
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ } from "./roadmap.mjs";

const DIA = 86400000;

export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function diasAntes(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) - dias * DIA).toISOString().slice(0, 10);
}

/** Caminhos que o script usa, todos relativos à raiz do repositório. */
export function caminhos(raiz = RAIZ) {
  const dados = join(raiz, "docs", "relatorios-v2", "semanais", "progresso");
  const site = join(raiz, "docs", "relatorios-v2", "site");
  return {
    dados,
    site,
    coleta: join(dados, "coleta.json"),
    estimativa: join(dados, "estimativa.json"),
    csv: join(dados, "estimativa.csv"),
    editorial: join(dados, "editorial.json"),
    decisoes: join(dados, "decisoes.json"),
    glossario: join(dados, "glossario.json"),
    pendencias: join(raiz, "docs", "roadmap-v2", "pendencias-humanas.md"),
    pagina: join(site, "progresso", "index.html"),
    paginaDeDecisoes: join(site, "progresso", "decisoes", "index.html"),
    imagens: join(site, "progresso", "img"),
  };
}

/** Os comandos de geração, na ordem. Separado para poder ser testado sem executar nada. */
export function comandosDeGeracao({ hoje, raiz = RAIZ }) {
  const c = caminhos(raiz);
  const node = process.execPath;
  const s = (nome) => join(raiz, "scripts", "roadmap", nome);
  return [
    { rotulo: "coleta", args: [s("coletar-relatorio.mjs"), "--desde", diasAntes(hoje, 7), "--ate", hoje, "--saida", c.coleta], node },
    { rotulo: "estimativa", args: [s("estimar-prazo.mjs"), "--hoje", hoje, "--saida", c.estimativa, "--csv", c.csv], node },
    {
      rotulo: "página",
      args: [
        s("relatorio-visual.mjs"),
        "--coleta", c.coleta,
        "--estimativa", c.estimativa,
        "--editorial", c.editorial,
        "--saida", c.pagina,
        "--completo",
        "--sem-indexar",
        "--link-de-saida", "/progresso/sair",
        "--link-das-decisoes", "/progresso/decisoes",
        "--glossario", c.glossario,
        "--imagens-externas", "/progresso/img",
        "--pasta-de-imagens", c.imagens,
      ],
      node,
    },
    {
      rotulo: "decisões",
      args: [
        s("decisoes-visual.mjs"),
        "--dados", c.decisoes,
        "--pendencias", c.pendencias,
        "--glossario", c.glossario,
        "--saida", c.paginaDeDecisoes,
        "--completo",
        "--sem-indexar",
        "--link-de-saida", "/progresso/sair",
        "--link-do-relatorio", "/progresso",
      ],
      node,
    },
  ];
}

function executar({ rotulo, args, node }) {
  const r = spawnSync(node, args, { encoding: "utf8", cwd: RAIZ });
  if (r.status !== 0) {
    console.error(`Falhou em "${rotulo}" (código ${r.status}):\n${r.stdout ?? ""}${r.stderr ?? ""}`);
    return false;
  }
  const ultima = (r.stdout ?? "").trim().split("\n").filter(Boolean).at(-1);
  if (ultima) console.log(`[${rotulo}] ${ultima}`);
  // Avisos (por exemplo, pendência sem cartão em decisoes.json) não derrubam a publicação, mas aparecem.
  if ((r.stderr ?? "").trim()) console.warn(`[${rotulo}] ${(r.stderr ?? "").trim()}`);
  return true;
}

function publicarNoFly(site) {
  if (!existsSync(join(site, "fly.toml"))) {
    console.error("Não achei fly.toml em docs/relatorios-v2/site.");
    return false;
  }
  // Primeiro plano e sem --ha: uma máquina só, que hiberna (a página é consultada por poucas pessoas).
  const r = spawnSync("flyctl", ["deploy", "--ha=false"], { cwd: site, encoding: "utf8", shell: true });
  if (r.status !== 0) {
    console.error(`A publicação no Fly falhou (código ${r.status}). Confira o login (flyctl auth whoami):
${r.stdout ?? ""}${r.stderr ?? ""}`);
    return false;
  }
  console.log("[publicação] feita no Fly. Endereço: https://defesa-civil-progresso.fly.dev/progresso");
  return true;
}

function publicarNaVercel(site) {
  if (!existsSync(join(site, ".vercel", "project.json"))) {
    console.error('A pasta do site ainda não está ligada a um projeto da Vercel. Rode, uma vez, "vercel link --yes --project dc360-progresso" dentro de docs/relatorios-v2/site.');
    return false;
  }
  const r = spawnSync("vercel", ["deploy", "--prod", "--yes"], { cwd: site, encoding: "utf8", shell: true });
  if (r.status !== 0) {
    console.error(`A publicação falhou (código ${r.status}):\n${r.stdout ?? ""}${r.stderr ?? ""}`);
    return false;
  }
  const url = `${r.stdout ?? ""}${r.stderr ?? ""}`.match(/https:\/\/[^\s]+\.vercel\.app/g)?.at(-1);
  console.log(`[publicação] feita${url ? `: ${url}` : ""}. Endereço público: https://dc360-painel-web.vercel.app/progresso`);
  return true;
}

function principal(argv) {
  const args = argv.slice(2);
  let hoje = hojeEmSaoPaulo();
  let semDeploy = false;
  let naVercel = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hoje") hoje = args[++i];
    else if (args[i] === "--sem-deploy") semDeploy = true;
    else if (args[i] === "--vercel") naVercel = true;
    else {
      console.error(`Argumento não reconhecido: ${args[i]}\nUso: node scripts/roadmap/publicar-progresso.mjs [--hoje AAAA-MM-DD] [--sem-deploy] [--vercel]`);
      return 2;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) {
    console.error("--hoje precisa ser AAAA-MM-DD.");
    return 2;
  }
  for (const comando of comandosDeGeracao({ hoje })) if (!executar(comando)) return 1;
  if (semDeploy) {
    console.log("Página gerada, sem publicar (--sem-deploy).");
    return 0;
  }
  return (naVercel ? publicarNaVercel : publicarNoFly)(caminhos().site) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
