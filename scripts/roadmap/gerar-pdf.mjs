#!/usr/bin/env node
/**
 * Gera o PDF de um relatório HTML com o Chromium do Playwright.
 *
 * Generaliza `dc360/docs/apresentacao/gerar-pdf.mjs` (que só aceitava um nome
 * numa pasta fixa). O Playwright não é dependência da raiz: ele já é de
 * `dc360/apps/web`, então o módulo é resolvido a partir do `package.json`
 * dessa pasta, e este script roda de qualquer diretório. Se o navegador não
 * estiver instalado: `npx playwright install chromium` dentro de `dc360/apps/web`.
 *
 * O que ele confere, e por quê (as mesmas razões do script original):
 * - espera as fontes carregarem ANTES de imprimir. Sem isso o PDF sai na fonte
 *   de reserva, com outra métrica, e a paginação muda de uma execução para a
 *   outra (aconteceu: 22 páginas numa execução e 26 na seguinte, o mesmo arquivo);
 * - imprime em A4 com as margens, o cabeçalho e a numeração do `@page` do
 *   próprio HTML (`preferCSSPageSize`);
 * - confere que o arquivo tem bytes e conta as páginas, para o resultado não
 *   ser um PDF vazio com cara de pronto;
 * - recusa qualquer requisição que não seja o arquivo local ou a fonte do
 *   Google (a regra do projeto é nenhuma rede além da fonte) e falha se houver;
 * - falha se o console do navegador registrar erro.
 *
 * Código de saída: 0 gerado e conferido, 1 PDF vazio, erro de console ou
 * requisição de rede indevida, 2 uso errado ou navegador indisponível.
 *
 * Uso:
 *   node scripts/roadmap/gerar-pdf.mjs <arquivo.html> [--pdf saida.pdf] [--exigir-fontes]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");

/** Hosts que o modelo pode usar: só a fonte. */
export const HOSTS_PERMITIDOS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/** A requisição é o arquivo local, uma URL de dados ou a fonte? */
export function requisicaoPermitida(url) {
  if (url.startsWith("file:") || url.startsWith("data:") || url.startsWith("about:") || url.startsWith("blob:")) return true;
  try {
    return HOSTS_PERMITIDOS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Páginas de um PDF: objetos `/Type /Page` (e não `/Pages`). */
export function contarPaginas(buffer) {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function carregarPlaywright(raiz) {
  const ancora = join(raiz, "dc360", "apps", "web", "package.json");
  if (!existsSync(ancora)) throw new Error(`Não achei ${ancora}: o Playwright é resolvido a partir de dc360/apps/web.`);
  return createRequire(ancora)("playwright");
}

export async function gerarPdf({ html, pdf, exigirFontes = false, raiz = RAIZ }) {
  const entrada = resolve(html);
  if (!existsSync(entrada)) throw Object.assign(new Error(`Não achei o arquivo ${entrada}`), { codigo: 2 });
  const saida = resolve(pdf ?? entrada.replace(/\.html?$/i, "") + ".pdf");

  let chromium;
  try {
    ({ chromium } = carregarPlaywright(raiz));
  } catch (e) {
    throw Object.assign(new Error(`Playwright indisponível: ${e.message}`), { codigo: 2 });
  }
  let navegador;
  try {
    navegador = await chromium.launch();
  } catch (e) {
    throw Object.assign(new Error(`Não consegui abrir o Chromium (${e.message.split("\n")[0]}). Rode "npx playwright install chromium" dentro de dc360/apps/web.`), { codigo: 2 });
  }

  const erros = [];
  const recusadas = [];
  try {
    const pagina = await navegador.newPage({ viewport: { width: 794, height: 1123 } });
    pagina.on("console", (m) => {
      if (m.type() === "error") erros.push(m.text());
    });
    pagina.on("pageerror", (e) => erros.push(String(e)));
    await pagina.route("**/*", (rota) => {
      const url = rota.request().url();
      if (requisicaoPermitida(url)) return rota.continue();
      recusadas.push(url);
      return rota.abort();
    });

    await pagina.goto(pathToFileURL(entrada).href, { waitUntil: "networkidle" });
    await pagina.evaluate(() => document.fonts.ready);
    const fontes = await pagina.evaluate(() => ({
      workSans: document.fonts.check('16px "Work Sans"'),
      robotoMono: document.fonts.check('16px "Roboto Mono"'),
    }));
    const fonteOk = fontes.workSans && fontes.robotoMono;

    await pagina.emulateMedia({ media: "print" });
    await pagina.pdf({ path: saida, format: "A4", printBackground: true, preferCSSPageSize: true });

    const buffer = readFileSync(saida);
    const bytes = statSync(saida).size;
    const paginas = contarPaginas(buffer);
    return {
      pdf: saida,
      bytes,
      paginas,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      fontes,
      fonteOk,
      errosDeConsole: erros,
      requisicoesRecusadas: recusadas,
      vazio: bytes === 0 || paginas === 0,
      reprovado: bytes === 0 || paginas === 0 || erros.length > 0 || recusadas.length > 0 || (exigirFontes && !fonteOk),
    };
  } finally {
    await navegador.close();
  }
}

const USO = "Uso: node scripts/roadmap/gerar-pdf.mjs <arquivo.html> [--pdf saida.pdf] [--exigir-fontes]";

async function principal(argv) {
  const args = argv.slice(2);
  let html = null;
  let pdf = null;
  let exigirFontes = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pdf") pdf = args[++i];
    else if (args[i] === "--exigir-fontes") exigirFontes = true;
    else if (args[i].startsWith("--")) {
      console.error(`Argumento não reconhecido: ${args[i]}\n${USO}`);
      return 2;
    } else if (!html) html = args[i];
    else {
      console.error(`Argumento sobrando: ${args[i]}\n${USO}`);
      return 2;
    }
  }
  if (!html || (args.includes("--pdf") && !pdf)) {
    console.error(USO);
    return 2;
  }
  let r;
  try {
    r = await gerarPdf({ html, pdf, exigirFontes });
  } catch (e) {
    console.error(e.message);
    return e.codigo ?? 2;
  }
  if (!r.fonteOk) console.warn("aviso: a fonte do Google não carregou; o PDF saiu na fonte de reserva (a paginação pode mudar numa próxima geração)", r.fontes);
  if (r.vazio) {
    console.error("o PDF saiu vazio", { bytes: r.bytes, paginas: r.paginas });
    return 1;
  }
  console.log(`${r.pdf}: ${r.bytes} bytes, ${r.paginas} páginas, erros de console: ${r.errosDeConsole.length}, requisições recusadas: ${r.requisicoesRecusadas.length}`);
  console.log(`SHA-256: ${r.sha256}`);
  if (r.errosDeConsole.length) console.log(r.errosDeConsole.join("\n"));
  if (r.requisicoesRecusadas.length) console.log(`Requisições fora da regra (só o arquivo local e a fonte são permitidos):\n${r.requisicoesRecusadas.join("\n")}`);
  return r.reprovado ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv).then((c) => {
    process.exitCode = c;
  });
}
