/*
  Gera o PDF da apresentação a partir do HTML, com o Chromium do Playwright
  que já é dependência de `apps/web`. Rode de dentro de `dc360/apps/web`:

    cd dc360/apps/web
    node ../../docs/apresentacao/gerar-pdf.mjs 2026-09-15-para-o-alyson

  Se o navegador não estiver instalado: `npx playwright install chromium`.

  O que ele faz, e por quê:
  - espera as fontes do Google Fonts carregarem ANTES de imprimir. Sem isso
    o PDF sai na fonte de reserva do sistema, com métrica diferente, e a
    paginação muda de uma execução para outra (aconteceu: 22 páginas numa
    execução e 26 na seguinte, o mesmo arquivo);
  - imprime em A4 com as margens do `@page` do próprio HTML;
  - confere que o arquivo tem tamanho e conta as páginas, para o resultado
    não ser um PDF vazio com cara de pronto.
*/
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const aqui = dirname(fileURLToPath(import.meta.url));
const nome = process.argv[2];
if (!nome) {
  console.error("uso: node gerar-pdf.mjs <nome-do-arquivo-sem-extensao>");
  process.exit(2);
}
const html = resolve(join(aqui, `${nome}.html`));
const pdf = resolve(join(aqui, `${nome}.pdf`));

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: 794, height: 1123 } });
  const erros = [];
  pagina.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  pagina.on("pageerror", (e) => erros.push(String(e)));

  await pagina.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
  await pagina.evaluate(() => document.fonts.ready);
  const fontes = await pagina.evaluate(() => ({
    workSans: document.fonts.check('16px "Work Sans"'),
    robotoMono: document.fonts.check('16px "Roboto Mono"'),
  }));
  if (!fontes.workSans || !fontes.robotoMono) {
    console.warn("aviso: fonte do Google não carregou; o PDF vai sair na fonte de reserva", fontes);
  }

  await pagina.emulateMedia({ media: "print" });
  await pagina.pdf({
    path: pdf,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
  });

  const bytes = statSync(pdf).size;
  const paginas = (readFileSync(pdf, "latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (bytes === 0 || paginas === 0) {
    console.error("o PDF saiu vazio", { bytes, paginas });
    process.exit(1);
  }
  console.log(`${pdf}: ${bytes} bytes, ${paginas} páginas, erros de console: ${erros.length}`);
  if (erros.length) console.log(erros.join("\n"));
} finally {
  await navegador.close();
}
