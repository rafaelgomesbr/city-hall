// Defeito 2: o aviso passageiro sobre a janela da senha temporária.
import { chromium, novoContexto, entrar, token, log, EMAIL, WEB, pasta, tema } from "./comum.mjs";
const FASE = process.argv[2]; const L = `defeito2-${FASE}.txt`; const dir = pasta();
const browser = await chromium.launch();
const NOME = "Diego Nakamura Alves";
async function abrir(page) {
  await page.goto(`${WEB}/usuarios`, { waitUntil: "networkidle" });
  const linha = page.locator("tbody tr", { hasText: EMAIL.diego });
  await linha.getByRole("button", { name: "Encerrar sessões" }).click();
  await page.getByRole("button", { name: `Encerrar sessões de ${NOME}` }).click();
  await page.waitForSelector(".toast");
  await linha.getByRole("button", { name: "Redefinir senha" }).click();
  await page.getByRole("button", { name: `Redefinir a senha de ${NOME}` }).click();
  await page.getByRole("button", { name: "Já anotei a senha" }).waitFor();
  await page.waitForTimeout(500);
}
const medir = (page) => page.evaluate(() => {
  const t = document.querySelector(".toast");
  const botoes = [...document.querySelectorAll(".modal__painel button")].map((b) => {
    const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const topo = document.elementFromPoint(cx, cy);
    const visivelPeloToast = t ? (() => { const a = t.getBoundingClientRect(); return !(a.right <= r.left || a.left >= r.right || a.bottom <= r.top || a.top >= r.bottom); })() : false;
    return { texto: b.textContent.trim(), dentroDaTela: r.bottom <= innerHeight && r.top >= 0, coberto: visivelPeloToast, noCentroEsta: topo ? (topo.closest(".toast") ? "toast" : topo.closest("button")?.textContent.trim() ?? topo.tagName) : null };
  });
  return { toastNaTela: !!t && getComputedStyle(t).visibility !== "hidden" && t.getClientRects().length > 0, botoes };
});
for (const [l, h, t] of [[320, 568, "claro"], [320, 568, "escuro"], [390, 844, "claro"], [390, 844, "escuro"], [1280, 900, "claro"], [1280, 900, "escuro"]]) {
  await token(EMAIL.diego).catch(() => {});
  const { ctx, page, erros } = await novoContexto(browser, { width: l, height: h });
  await entrar(page, EMAIL.rita);
  await abrir(page); await tema(page, t);
  log(L, `${l}x${h} ${t}: com a janela aberta`, await medir(page));
  await page.screenshot({ path: `${dir}/c4-aviso-sobre-senha-temporaria-${FASE}-${l}-${t}.png` });
  if (l === 320 && t === "claro") {
    // toque no ponto onde o aviso estava desenhado (canto de baixo, direita): não pode fechar a janela
    const alvo = await page.evaluate(() => { const b = [...document.querySelectorAll(".modal__painel button")].find((x) => x.textContent.includes("Já anotei")); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    log(L, "alvo do 'Já anotei a senha' (centro):", alvo);
    await page.keyboard.press("Tab");
    log(L, "foco depois de Tab:", await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40)));
  }
  // fecha a janela pelo botão da janela e mede o que acontece com o aviso
  await page.getByRole("button", { name: "Já anotei a senha" }).click();
  await page.waitForTimeout(600);
  const depois = await page.evaluate(() => { const t = document.querySelector(".toast"); return { toast: !!t, texto: t?.textContent.trim().slice(0, 60) ?? null }; });
  log(L, `${l}x${h} ${t}: depois de fechar a janela`, depois);
  if (depois.toast) {
    await page.screenshot({ path: `${dir}/c4-aviso-depois-de-fechar-a-janela-${FASE}-${l}-${t}.png` });
    // o Fechar do aviso responde
    try { await page.locator(".toast").getByRole("button", { name: "Fechar" }).click({ timeout: 2000 }); log(L, `${l}x${h} ${t}: clique no Fechar do aviso aceito; avisos na tela =`, await page.locator(".toast").count()); }
    catch (e) { log(L, `${l}x${h} ${t}: clique no Fechar do aviso RECUSADO`, String(e.message).split("\n")[0]); }
  }
  log(L, "erros de console", erros);
  await ctx.close();
}
await browser.close();
