import { createRequire } from "node:module";
const require = createRequire(process.env.DC360 + "/package.json");
const playwright = require("playwright");
const WEB = process.env.BASE_WEB, API = process.env.BASE_API;
const SENHA = "defesa-civil-2026";
const sufixo = Date.now().toString(36);
async function api(c, { token, metodo = "GET", corpo } = {}) {
  const r = await fetch(`${API}${c}`, { method: metodo, headers: { ...(corpo ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}
const rita = await api("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
const email = `p.${sufixo}@serraalta.exemplo.gov.br`;
await api("/usuarios", { metodo: "POST", token: rita.corpo.acesso, corpo: { nome: "Probe", matricula: `PR-${sufixo}`.toUpperCase(), email, papel: "coordenador", equipeId: null, senha: "senha-provisoria-do-teste-1" } });
for (const motor of ["chromium", "firefox", "webkit"]) {
  const b = await playwright[motor].launch();
  for (const w of [320, 390]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/entrar`, { waitUntil: "networkidle" });
    await page.locator("#entrada-email").fill(email); await page.locator("#entrada-senha").fill("senha-provisoria-do-teste-1");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForSelector(".cabecalho-pagina h1");
    await page.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" });
    await page.locator("#conta-senha-atual").fill("errada-errada-1"); await page.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026"); await page.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
    await page.getByRole("button", { name: "Trocar senha", exact: true }).click();
    await page.locator("#conta-senha-atual-erro").waitFor();
    for (const t of [0, 300, 600, 1500]) {
      await page.waitForTimeout(t === 0 ? 0 : 300);
      const m = await page.evaluate(() => { const a = document.activeElement; const c = a.closest(".campo"); const l = c.querySelector("label"); return { topo: document.querySelector(".topo").getBoundingClientRect().bottom, campo: c.getBoundingClientRect().top, rotulo: l.getBoundingClientRect().top, input: a.getBoundingClientRect().top, y: window.scrollY, sp: getComputedStyle(document.documentElement).scrollPaddingTop }; });
      console.log(motor, w, t, JSON.stringify(m));
    }
    await ctx.close();
  }
  await b.close();
}
