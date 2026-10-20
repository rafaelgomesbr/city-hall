// Defeito 3: e-mails quebrados no meio da palavra na coluna Pessoa de Usuários.
import { chromium, novoContexto, entrar, log, EMAIL, WEB, pasta, tema } from "./comum.mjs";
const FASE = process.argv[2]; const L = `defeito3-${FASE}.txt`; const dir = pasta();
const browser = await chromium.launch();
const quebras = (page) => page.evaluate(() => {
  const out = [];
  for (const td of document.querySelectorAll("tbody tr td:first-child")) {
    const el = [...td.querySelectorAll(".tabela__secundario")].find((e) => e.textContent.includes("@"));
    if (!el) continue;
    // todos os nós de texto (o <wbr> parte o texto em vários)
    const nos = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); while (w.nextNode()) nos.push(w.currentNode);
    const linhas = []; let atual = ""; let y = null;
    for (const no of nos) for (let i = 0; i < no.textContent.length; i++) {
      const r = document.createRange(); r.setStart(no, i); r.setEnd(no, i + 1);
      const ry = Math.round(r.getBoundingClientRect().top);
      if (y !== null && ry > y + 2) { linhas.push(atual); atual = ""; }
      y = ry; atual += no.textContent[i];
    }
    linhas.push(atual);
    const email = nos.map((n) => n.textContent).join("");
    // quebra no meio da palavra = uma linha que termina em letra/dígito (não em "@" nem ".") e a seguinte começa em letra
    const meio = linhas.slice(0, -1).filter((s, i) => !/[@.]$/.test(s));
    out.push({ email, linhas, quebraNoMeioDaPalavra: meio.length > 0, estouraACelula: el.scrollWidth > el.clientWidth + 1 });
  }
  const t = document.querySelector("table"); const c = t?.parentElement;
  return { emails: out, rolagemDaTabela: c ? `${c.scrollWidth}/${c.clientWidth}` : null, paginaRola: document.documentElement.scrollWidth > innerWidth };
});
const { ctx, page, erros } = await novoContexto(browser);
await entrar(page, EMAIL.rita);
await page.goto(`${WEB}/usuarios`, { waitUntil: "networkidle" });
await page.locator("tbody tr").first().waitFor({ timeout: 60000 });
for (const [l, h, t] of [[1280, 900, "claro"], [1280, 900, "escuro"], [1440, 900, "claro"], [768, 1024, "claro"], [390, 844, "claro"], [390, 844, "escuro"], [320, 568, "claro"]]) {
  await page.setViewportSize({ width: l, height: h }); await tema(page, t); await page.waitForTimeout(300);
  const m = await quebras(page);
  log(L, `${l}px ${t}`, m);
  // a lista inteira (o cartão da tabela), e não só o que cabe na primeira tela
  const cartao = page.locator(".cartao", { has: page.locator("table.tabela") }).first();
  await cartao.scrollIntoViewIfNeeded();
  await cartao.screenshot({ path: `${dir}/c4-usuarios-emails-${FASE}-${l}-${t}.png` });
}
log(L, "console", erros);
await browser.close();
