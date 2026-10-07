/**
 * Sonda da barra de navegação do rodapé a 390 px (V2-F00-E13).
 *
 * Responde a uma pergunta só: o rótulo que aparece cortado na borda direita é
 * texto cortado de verdade (defeito de layout) ou a borda de uma área que rola
 * na horizontal, alcançável por teclado e por toque?
 *
 * Roteiro descartável: sai do repositório quando a etapa termina.
 */
import * as playwright from "playwright";

const BASE = "http://localhost:4173";
const navegador = await playwright.chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const page = await contexto.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".conta", { timeout: 90_000 });
await page.getByRole("button", { name: /Helena Vasques Coutinho/ }).click();
await page.waitForSelector(".indicador", { timeout: 60_000 });

const medida = await page.evaluate(() => {
  const barra = document.querySelector(".lateral");
  const estilo = getComputedStyle(barra);
  return {
    overflowX: estilo.overflowX,
    clientWidth: barra.clientWidth,
    scrollWidth: barra.scrollWidth,
    clientHeight: barra.clientHeight,
    itens: [...barra.querySelectorAll(".lateral__item")].map((n) => n.textContent.trim()),
  };
});
console.log("barra:", JSON.stringify(medida, null, 2));

// 1. O rótulo que aparece cortado: ele está inteiro no DOM e sem reticências?
const mapa = page.getByRole("link", { name: "Mapa da cidade" });
const cortePorCss = await mapa.evaluate((n) => {
  const e = getComputedStyle(n);
  return { textOverflow: e.textOverflow, overflow: e.overflow, whiteSpace: e.whiteSpace,
           larguraDoTexto: n.scrollWidth, larguraDaCaixa: n.clientWidth };
});
console.log("rotulo 'Mapa da cidade':", JSON.stringify(cortePorCss));

// 2. Teclado: o Tab alcança o item e o navegador rola a barra até ele?
await page.evaluate(() => { document.querySelector(".lateral").scrollLeft = 0; });
await mapa.focus();
await page.waitForTimeout(400);
const depoisDoFoco = await page.evaluate(() => {
  const barra = document.querySelector(".lateral");
  const alvo = [...barra.querySelectorAll(".lateral__item")].find((n) => n.textContent.includes("Mapa da cidade"));
  const b = barra.getBoundingClientRect();
  const a = alvo.getBoundingClientRect();
  return {
    scrollLeft: Math.round(barra.scrollLeft),
    focado: document.activeElement === alvo,
    inteiroNaTela: a.left >= b.left - 1 && a.right <= b.right + 1,
  };
});
console.log("depois do foco por teclado:", JSON.stringify(depoisDoFoco));

// 3. Toque: um arrasto horizontal rola a barra?
await page.evaluate(() => { document.querySelector(".lateral").scrollLeft = 0; });
const caixa = await page.locator(".lateral").boundingBox();
await page.mouse.move(caixa.x + caixa.width - 40, caixa.y + caixa.height / 2);
await page.mouse.down();
await page.mouse.move(caixa.x + 40, caixa.y + caixa.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
const depoisDoArrasto = await page.evaluate(() => Math.round(document.querySelector(".lateral").scrollLeft));
console.log("scrollLeft depois do arrasto:", depoisDoArrasto);

// 4. O último item da barra é alcançável rolando até o fim?
await page.evaluate(() => { const b = document.querySelector(".lateral"); b.scrollLeft = b.scrollWidth; });
await page.waitForTimeout(400);
const ultimo = await page.evaluate(() => {
  const barra = document.querySelector(".lateral");
  const itens = [...barra.querySelectorAll(".lateral__item")];
  const a = itens[itens.length - 1].getBoundingClientRect();
  const b = barra.getBoundingClientRect();
  return { rotulo: itens[itens.length - 1].textContent.trim(),
           inteiroNaTela: a.left >= b.left - 1 && a.right <= b.right + 1 };
});
console.log("ultimo item com a barra rolada ate o fim:", JSON.stringify(ultimo));

await navegador.close();
