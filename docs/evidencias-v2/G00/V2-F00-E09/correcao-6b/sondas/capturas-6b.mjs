// Capturas da correção 6b (antes e depois), nos três motores, com as medidas ao lado.
import { WEB, EMAILS, S, CAP, api, tokenDe, navegador, contexto, entrar, registro, aVista } from "./lib.mjs";
const ROTULO = process.env.ROTULO ?? "antes";
const log = registro(`${S}/saidas/6b-capturas-${ROTULO}.txt`);
const rita = await tokenDe(EMAILS.rita);
const SI = "senha-inicial-bem-comprida-2026";
let n = 0;
async function contaNova(motor) {
  n++; const email = `c6b.${motor}.${n}.${Date.now() % 100000}@serraalta.exemplo.gov.br`;
  await api("/usuarios", { metodo: "POST", token: rita, corpo: { nome: `Capturas ${motor} ${n}`, matricula: `C6B-${n}-${Date.now() % 10000}`, email, papel: "operador", senha: SI } });
  return email;
}
const largo = `joanaplantao24horasdefesacivilmunicipalmwmwmwmw${Date.now() % 1000}@serraalta.exemplo.gov.br`;
await api("/usuarios", { metodo: "POST", token: rita, corpo: { nome: "Joana Semponto Larga", matricula: `C6BL-${Date.now() % 10000}`, email: largo, papel: "operador", senha: SI } });
const faixa = (pg) => pg.evaluate(() => {
  const a = document.activeElement; const r = a.getBoundingClientRect();
  const t = document.querySelector(".topo"), b = document.querySelector(".lateral");
  const de = ["sticky", "fixed"].includes(getComputedStyle(t).position) ? t.getBoundingClientRect().bottom : 0;
  const rb = b.getBoundingClientRect(); const ate = getComputedStyle(b).position === "sticky" && rb.top > innerHeight / 2 ? rb.top : innerHeight;
  return `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : "." + String(a.className).split(" ")[0]} ${Math.round(r.top)}..${Math.round(r.bottom)} entre ${Math.round(de)} e ${Math.round(ate)}`;
});
for (const motor of ["chromium", "firefox", "webkit"]) {
  const nav = await navegador(motor);
  // 1. Quadro lento: o foco na "Repita a senha" de Minha conta (o caso do WebKit do Linux)
  for (const [l, a, d] of [[390, 844, 1], [640, 450, 2]]) {
    const { ctx, pg } = await contexto(nav, { largura: l, altura: a, dpr: d });
    await ctx.addInitScript(() => { const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { setTimeout(() => o(cb), 1000); return 0; }; });
    await entrar(pg, EMAILS.rita);
    await pg.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" }); await pg.waitForTimeout(300);
    for (const id of ["#conta-senha-atual", "#conta-senha-nova", "#conta-senha-repetida"]) { await pg.locator(id).evaluate((e) => e.focus()); await pg.waitForTimeout(60); }
    log(`[${ROTULO} ${motor} quadro-lento minha-conta ${l}x${a}] ${await faixa(pg)}`);
    await pg.screenshot({ path: `${CAP}/c6b-${ROTULO}-quadro-lento-minha-conta-repita-${l}x${a}-claro-${motor}.png` });
    await ctx.close();
  }
  // 2. Tab até a caixa que rola a tabela, a 390x400 (Painel e Órgãos)
  for (const rota of ["/painel", "/orgaos"]) {
    const { ctx, pg } = await contexto(nav, { largura: 390, altura: 400 });
    await entrar(pg, EMAILS.rita);
    await pg.goto(`${WEB}${rota}`, { waitUntil: "networkidle" }); await pg.waitForTimeout(300);
    let achou = false;
    for (let i = 0; i < 60 && !achou; i++) {
      await pg.keyboard.press("Tab"); await pg.waitForTimeout(80);
      achou = await pg.evaluate(() => { const a = document.activeElement; if (!a || a.closest(".topo, .lateral")) return false; const s = getComputedStyle(a); return a.tagName === "DIV" && (s.overflowX === "auto" || s.overflowY === "auto"); });
    }
    log(`[${ROTULO} ${motor} tab-caixa ${rota} 390x400] ${achou ? await faixa(pg) : "o Tab deste motor não para na caixa que rola"}`);
    if (achou) await pg.screenshot({ path: `${CAP}/c6b-${ROTULO}-tab-caixa-${rota.slice(1)}-390x400-claro-${motor}.png` });
    await ctx.close();
  }
  // 3. 320 px: a paginação de Ocorrências e de Prestação de contas, e o filtro
  for (const rota of ["/ocorrencias", "/auditoria"]) {
    const { ctx, pg } = await contexto(nav, { largura: 320, altura: 640 });
    await entrar(pg, EMAILS.rita);
    await pg.goto(`${WEB}${rota}`, { waitUntil: "networkidle" }); await pg.waitForTimeout(300);
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
    if (rota === "/ocorrencias") await pg.screenshot({ path: `${CAP}/c6b-${ROTULO}-filtro-ocorrencias-320-claro-${motor}.png` });
    const pag = pg.locator(".paginacao").first();
    if (await pag.count()) { await pag.scrollIntoViewIfNeeded(); await pg.evaluate(() => window.scrollBy(0, 120)); }
    log(`[${ROTULO} ${motor} 320 ${rota}] largura da página ${sw} de 320; paginação ${await pag.count() ? "presente" : "ausente"}`);
    await pg.screenshot({ path: `${CAP}/c6b-${ROTULO}-paginacao-${rota.slice(1)}-320-claro-${motor}.png` });
    await ctx.close();
  }
  // 4. Usuários a 1440 com o email de parte local larga
  {
    const { ctx, pg } = await contexto(nav, { largura: 1440, altura: 900 });
    await entrar(pg, EMAILS.rita);
    await pg.goto(`${WEB}/usuarios`, { waitUntil: "networkidle" }); await pg.waitForSelector(".tabela tbody tr");
    const linha = pg.locator("tbody tr", { hasText: "Joana Semponto Larga" }); await linha.scrollIntoViewIfNeeded();
    const m = await pg.evaluate(() => { const t = document.querySelector("table.tabela"); const e = t.parentElement; return `${e.scrollWidth}/${e.clientWidth}`; });
    log(`[${ROTULO} ${motor} usuarios 1440] tabela ${m}`);
    await pg.screenshot({ path: `${CAP}/c6b-${ROTULO}-usuarios-email-largo-1440-claro-${motor}.png` });
    await ctx.close();
  }
  // 5. Android deitado: senha errada em Minha conta a 640x360 e 740x360
  for (const [l, a] of [[640, 360], [740, 360]]) {
    const email = await contaNova(motor);
    const { ctx, pg } = await contexto(nav, { largura: l, altura: a });
    await entrar(pg, email, SI);
    await pg.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("senha-errada-desta-conta");
    await pg.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
    await pg.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
    const b = pg.getByRole("button", { name: "Trocar senha", exact: true }); await b.click();
    await pg.locator("#conta-senha-atual-erro").waitFor({ timeout: 20000 });
    await pg.waitForFunction((el) => !el.disabled, await b.elementHandle(), { timeout: 20000 }); await pg.waitForTimeout(400);
    const m = await aVista(pg);
    log(`[${ROTULO} ${motor} deitado ${l}x${a}] ${m.ok ? "À VISTA" : "ESCONDIDO"} ${m.txt}`);
    await pg.screenshot({ path: `${CAP}/c6b-${ROTULO}-deitado-minha-conta-senha-errada-${l}x${a}-claro-${motor}.png` });
    await ctx.close();
  }
  await nav.close();
}
