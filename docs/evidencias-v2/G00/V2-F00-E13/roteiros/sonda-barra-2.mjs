/** Segunda sonda da barra do rodapé a 390 px: Tab de verdade e toque de verdade. */
import * as playwright from "playwright";

const BASE = "http://localhost:4173";
const navegador = await playwright.chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
});
const page = await contexto.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".conta", { timeout: 90_000 });
await page.getByRole("button", { name: /Helena Vasques Coutinho/ }).click();
await page.waitForSelector(".indicador", { timeout: 60_000 });

async function estado() {
  return page.evaluate(() => {
    const barra = document.querySelector(".lateral");
    const ativo = document.activeElement;
    const b = barra.getBoundingClientRect();
    const a = ativo?.getBoundingClientRect?.();
    return {
      scrollLeft: Math.round(barra.scrollLeft),
      focado: ativo?.textContent?.trim()?.slice(0, 30) ?? null,
      dentroDaBarra: !!(ativo && barra.contains(ativo)),
      inteiroNaTela: a ? a.left >= b.left - 1 && a.right <= b.right + 1 : null,
    };
  });
}

console.log("== Tab de verdade ate cada item da barra ==");
await page.evaluate(() => { document.querySelector(".lateral").scrollLeft = 0; });
await page.locator("body").click({ position: { x: 5, y: 300 } });
for (let i = 0; i < 40; i++) {
  await page.keyboard.press("Tab");
  // O navegador rola a área até o item focado com animação: medir na hora
  // mediria o quadro anterior.
  await page.waitForTimeout(500);
  const e = await estado();
  if (e.dentroDaBarra) {
    console.log(`  Tab ${i + 1}: ${JSON.stringify(e)}`);
    if (/Sair/.test(e.focado ?? "")) break;
  }
}

console.log("\n== Toque de verdade: arrasto horizontal na barra ==");
await page.evaluate(() => { document.querySelector(".lateral").scrollLeft = 0; });
const caixa = await page.locator(".lateral").boundingBox();
const y = Math.round(caixa.y + caixa.height / 2);
const cdp = await contexto.newCDPSession(page);
const ponto = (x) => [{ x, y, radiusX: 10, radiusY: 10, force: 1, id: 1 }];
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: ponto(340) });
for (let x = 320; x >= 60; x -= 20) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: ponto(x) });
  await page.waitForTimeout(16);
}
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(800);
console.log("  scrollLeft depois do arrasto por toque:",
  await page.evaluate(() => Math.round(document.querySelector(".lateral").scrollLeft)));

await navegador.close();
