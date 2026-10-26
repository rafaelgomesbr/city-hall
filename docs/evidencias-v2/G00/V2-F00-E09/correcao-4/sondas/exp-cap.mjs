import { chromium, entrar, api, token, EMAIL, WEB, novoContexto } from "./comum.mjs";
const t = await token(EMAIL.rita); const suf = Date.now().toString(36);
for (const [n, e] of [["Joana Semponto", `joanaplantao24horasdefesacivilmunicipal${suf}@serraalta.exemplo.gov.br`], ["Ana Subdominios", `ana.${suf}@coordenadoria.defesacivil.secretaria.serraalta.exemplo.gov.br`]])
  console.log(n, (await api("/usuarios", { token: t, metodo: "POST", corpo: { nome: n, matricula: "EX-" + Math.random().toString(36).slice(2, 7).toUpperCase(), email: e, papel: "operador", equipeId: null, senha: "senha-provisoria-do-teste-1" } })).status);
const b = await chromium.launch(); const { page } = await novoContexto(b);
await entrar(page, EMAIL.rita); await page.goto(`${WEB}/usuarios`, { waitUntil: "networkidle" }); await page.locator("tbody tr").first().waitFor();
for (const cap of [null, "calc(var(--ds-sp-8) * 2.2)", "calc(var(--ds-sp-8) * 2.5)", "calc(var(--ds-sp-8) * 3)", "calc(var(--ds-sp-8) * 3.5)"]) {
  for (const w of [1280, 1440, 768]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate((cap) => { document.getElementById("x")?.remove(); if (!cap) return; const s = document.createElement("style"); s.id = "x"; s.textContent = `.tabela__secundario--email{overflow-wrap:break-word;max-width:${cap}}`; document.head.append(s); }, cap);
    await page.waitForTimeout(200);
    console.log(cap ?? "sem cap", w, await page.evaluate(() => { const t = document.querySelector("table.tabela"); return `${t.parentElement.scrollWidth}/${t.parentElement.clientWidth}`; }));
  }
}
await b.close();
