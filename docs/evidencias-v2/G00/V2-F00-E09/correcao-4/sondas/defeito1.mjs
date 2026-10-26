// Defeito 1: a frase da senha errada, em Minha conta e na tela "Defina a sua senha".
import { chromium, novoContexto, entrar, api, token, log, EMAIL, WEB, pasta, tema } from "./comum.mjs";
const FASE = process.argv[2]; const L = `defeito1-${FASE}.txt`; const dir = pasta();
const TELAS = [[1280, 900, "claro"], [1280, 900, "escuro"], [390, 844, "claro"], [390, 844, "escuro"], [320, 568, "claro"], [320, 568, "escuro"]];
const browser = await chromium.launch();
{
  const { ctx, page, erros } = await novoContexto(browser);
  await entrar(page, EMAIL.helena);
  await page.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" });
  const respostas = [];
  page.on("response", async (r) => { if (r.url().includes("/auth/trocar-senha")) respostas.push({ status: r.status(), corpo: await r.json().catch(() => null) }); });
  const form = page.locator("form", { has: page.getByRole("button", { name: /Trocar senha/ }) }).first();
  const campos = form.locator("input[type=password]");
  await campos.nth(0).fill("senha-que-nao-e-a-dela");
  await campos.nth(1).fill("frase-nova-bem-comprida-2026");
  await campos.nth(2).fill("frase-nova-bem-comprida-2026");
  await form.getByRole("button", { name: /Trocar senha/ }).click();
  await page.waitForTimeout(1500);
  log(L, "Minha conta: resposta do servidor", respostas);
  log(L, "Minha conta: mensagens de erro na tela", await page.locator(".campo__erro, .aviso--perigo").allTextContents());
  for (const [l, h, t] of TELAS) {
    await page.setViewportSize({ width: l, height: h }); await tema(page, t);
    await page.locator(".campo__erro, .aviso--perigo").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${dir}/c4-minha-conta-senha-errada-${FASE}-${l}-${t}.png` });
  }
  log(L, "Minha conta: erros de console", erros);
  await ctx.close();
}
{
  const rita = await token(EMAIL.rita);
  const r = await api("/usuarios/11111111-1111-4111-8111-0000000000d2/redefinir-senha", { token: rita, metodo: "POST", corpo: {} });
  const temp = r.corpo?.senhaTemporaria;
  const { ctx, page, erros } = await novoContexto(browser, { width: 390, height: 844 });
  await entrar(page, EMAIL.jonas, temp, false);
  await page.getByRole("heading", { name: "Defina a sua senha" }).waitFor({ timeout: 20000 });
  const respostas = [];
  page.on("response", async (x) => { if (x.url().includes("/auth/trocar-senha")) respostas.push({ status: x.status(), corpo: await x.json().catch(() => null) }); });
  await page.locator("#senha-nova-atual").fill("provisoria-digitada-errada");
  await page.locator("#senha-nova").fill("frase-nova-do-jonas-2026");
  await page.locator("#senha-nova-repetida").fill("frase-nova-do-jonas-2026");
  await page.getByRole("button", { name: "Definir senha e entrar" }).click();
  await page.waitForTimeout(1800);
  log(L, "Senha nova obrigatória: resposta", respostas);
  log(L, "Senha nova obrigatória: mensagens de erro na tela", await page.locator(".campo__erro").allTextContents());
  for (const [l, h, t] of TELAS) {
    await page.setViewportSize({ width: l, height: h }); await tema(page, t);
    await page.screenshot({ path: `${dir}/c4-senha-provisoria-errada-${FASE}-${l}-${t}.png`, fullPage: true });
  }
  log(L, "Senha nova obrigatória: erros de console", erros);
  await ctx.close();
}
await browser.close();
