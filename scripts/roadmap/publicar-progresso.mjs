#!/usr/bin/env node
/**
 * Atualiza a página de progresso da V2 (https://dc360-painel-web.vercel.app/progresso), protegida por senha.
 *
 * Roda a coleta do STATUS, a estimativa de prazo e o gerador visual, grava o resultado em
 * `docs/relatorios-v2/site/progresso/` e publica na Vercel com a CLI (login do Rafael na máquina; sem token
 * em arquivo). Os NÚMEROS se atualizam a cada execução; o TEXTO vem de `semanais/progresso/editorial.json`,
 * que o agente `relatorio-semanal-visual` reescreve toda semana.
 *
 * Quando rodar: ao fim de cada etapa (commit candidato, registro de validação) e no relatório semanal.
 *
 * Uso:
 *   node scripts/roadmap/publicar-progresso.mjs [--hoje AAAA-MM-DD] [--sem-deploy]
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
    pagina: join(site, "progresso", "index.html"),
    imagens: join(site, "progresso", "img"),
  };
}

/** Os três comandos de geração, na ordem. Separado para poder ser testado sem executar nada. */
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
        "--imagens-externas", "/progresso/img",
        "--pasta-de-imagens", c.imagens,
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
  return true;
}

function publicar(site) {
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
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hoje") hoje = args[++i];
    else if (args[i] === "--sem-deploy") semDeploy = true;
    else {
      console.error(`Argumento não reconhecido: ${args[i]}\nUso: node scripts/roadmap/publicar-progresso.mjs [--hoje AAAA-MM-DD] [--sem-deploy]`);
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
  return publicar(caminhos().site) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
