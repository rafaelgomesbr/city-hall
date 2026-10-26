// Segunda rodada da correção 4: as capturas dos seis itens da revisão, a 320, 390, 768, 1280 e 1440 px, claro e escuro.
import { chromium, novoContexto, entrar, api, token, log, EMAIL, WEB, pasta, tema } from "./comum.mjs";
const FASE = process.argv[2]; const L = `revisao-${FASE}.txt`; const dir = pasta();
const TELAS = [[320, 568], [390, 844], [768, 1024], [1280, 900], [1440, 900]];
const TEMAS = ["claro", "escuro"];
const browser = await chromium.launch();
const suf = Date.now().toString(36);
const rita = await token(EMAIL.rita);
const criar = (nome, email) => api("/usuarios", { token: rita, metodo: "POST", corpo: { nome, matricula: `RV-${Math.random().toString(36).slice(2, 7)}`.toUpperCase(), email, papel: "operador", equipeId: null, senha: "senha-provisoria-do-teste-1" } });

// 1, 2 e 3: Minha conta e a tela da provisória, com o erro de campo e o foco
{
  const em = `conta.${suf}@serraalta.exemplo.gov.br`;
  await api("/usuarios", { token: rita, metodo: "POST", corpo: { nome: "Conta Revisao", matricula: `CR-${suf.slice(-5)}`.toUpperCase(), email: em, papel: "coordenador", equipeId: null, senha: "senha-provisoria-do-teste-1" } });
  const { ctx, page, erros } = await novoContexto(browser);
  await entrar(page, em, "senha-provisoria-do-teste-1");
  await page.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" });
  const f = page.locator("#conta-senha-atual");
  const preencher = async (a, n) => { await f.fill(a); await page.locator("#conta-senha-nova").fill(n); await page.locator("#conta-senha-repetida").fill(n); await page.getByRole("button", { name: "Trocar senha", exact: true }).click(); };
  await preencher("errada-errada-1234", "frase-nova-comprida-2026");
  await page.locator("#conta-senha-atual-erro").waitFor(); await page.waitForTimeout(300);
  log(L, "minha conta: erro; foco em", await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName), "; svg", await page.locator("#conta-senha-atual-erro svg").evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  for (const [w, h] of TELAS) for (const t of TEMAS) {
    await page.setViewportSize({ width: w, height: h }); await tema(page, t);
    await page.locator("#conta-senha-atual-erro").scrollIntoViewIfNeeded();
    await page.locator(".cartao", { has: page.locator("#conta-senha-atual") }).first().screenshot({ path: `${dir}/r2-minha-conta-erro-${FASE}-${w}-${t}.png` });
  }
  // troca certa e depois senha errada
  await page.setViewportSize({ width: 390, height: 844 });
  await preencher("senha-provisoria-do-teste-1", "frase-nova-comprida-2026");
  await page.locator(".aviso--sucesso").waitFor(); await page.waitForTimeout(300);
  log(L, "minha conta: sucesso; foco em", await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName));
  for (const t of TEMAS) { await tema(page, t); await page.locator(".cartao", { has: page.locator("#conta-senha-atual") }).first().screenshot({ path: `${dir}/r2-minha-conta-sucesso-${FASE}-390-${t}.png` }); }
  await preencher("errada-de-novo-1234", "outra-frase-comprida-2026");
  await page.locator("#conta-senha-atual-erro").waitFor(); await page.waitForTimeout(300);
  log(L, "minha conta: sucesso+erro; confirmações na tela", await page.locator(".aviso--sucesso").count(), "; foco em", await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
  for (const t of TEMAS) { await tema(page, t); await page.locator(".cartao", { has: page.locator("#conta-senha-atual") }).first().screenshot({ path: `${dir}/r2-minha-conta-sucesso-depois-erro-${FASE}-390-${t}.png` }); }
  log(L, "console", erros); await ctx.close();
}
{
  const e2 = `prov.${suf}@serraalta.exemplo.gov.br`;
  const u = await criar("Provisoria Revisao", e2);
  const red = await api(`/usuarios/${u.corpo.id}/redefinir-senha`, { token: rita, metodo: "POST", corpo: {} });
  const { ctx, page, erros } = await novoContexto(browser, { width: 390, height: 844 });
  await entrar(page, e2, red.corpo.senhaTemporaria, false);
  await page.getByRole("heading", { name: "Defina a sua senha" }).waitFor();
  await page.locator("#senha-nova-atual").fill("provisoria-errada-123"); await page.locator("#senha-nova").fill("frase-nova-do-teste-2026"); await page.locator("#senha-nova-repetida").fill("frase-nova-do-teste-2026");
  await page.getByRole("button", { name: "Definir senha e entrar" }).click(); await page.locator("#senha-nova-atual-erro").waitFor(); await page.waitForTimeout(300);
  log(L, "provisória: erro; foco em", await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName), "; svg", await page.locator("#senha-nova-atual-erro svg").evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  for (const [w, h] of TELAS) for (const t of TEMAS) { await page.setViewportSize({ width: w, height: h }); await tema(page, t); await page.screenshot({ path: `${dir}/r2-provisoria-erro-${FASE}-${w}-${t}.png`, fullPage: true }); }
  log(L, "console", erros); await ctx.close();
}
// 5: a janela da senha temporária abre no topo
{
  const em = `janela.${suf}@serraalta.exemplo.gov.br`; await criar("Janela Revisao", em);
  for (const [w, h] of TELAS) for (const t of TEMAS) {
    const { ctx, page, erros } = await novoContexto(browser, { width: w, height: h });
    await entrar(page, EMAIL.rita); await page.goto(`${WEB}/usuarios`, { waitUntil: "networkidle" }); await tema(page, t);
    const linha = page.locator("tbody tr", { hasText: em });
    await linha.getByRole("button", { name: "Redefinir senha", exact: true }).scrollIntoViewIfNeeded();
    await linha.getByRole("button", { name: "Redefinir senha", exact: true }).click();
    await page.getByRole("button", { name: /^Redefinir a senha de / }).click();
    await page.getByRole("button", { name: "Já anotei a senha" }).waitFor(); await page.waitForTimeout(500);
    const m = await page.evaluate(() => { const p = document.querySelector(".modal__painel"); const h = p.querySelector("h2").getBoundingClientRect(); return { scrollTop: p.scrollTop, titulo: [Math.round(h.top), Math.round(h.bottom)], foco: document.activeElement?.getAttribute("role") ?? document.activeElement?.textContent?.trim().slice(0, 20) }; });
    log(L, `janela ${w}x${h} ${t}`, m, erros.length ? erros : "");
    await page.screenshot({ path: `${dir}/r2-janela-senha-${FASE}-${w}-${t}.png` });
    await ctx.close();
  }
}
// 4 e 6: Usuários (email de parte comprida) e Órgãos
{
  await criar("Joana Semponto", `joanaplantao24horasdefesacivilmunicipal${suf}@serraalta.exemplo.gov.br`);
  await criar("Ana Subdominios", `ana.${suf}@coordenadoria.defesacivil.secretaria.serraalta.exemplo.gov.br`);
  await api("/orgaos", { token: rita, metodo: "POST", corpo: { nome: `Companhia de Saneamento ${suf}`, sigla: "CSR", email: `atendimento.emergencial.${suf}@saneamento.serraalta.exemplo.gov.br`, telefone: "(35) 3333-0000" } });
  const { ctx, page, erros } = await novoContexto(browser);
  await entrar(page, EMAIL.rita);
  for (const [rota, nome] of [["usuarios", "usuarios"], ["orgaos", "orgaos"]]) {
    await page.goto(`${WEB}/${rota}`, { waitUntil: "networkidle" }); await page.locator("tbody tr").first().waitFor();
    for (const [w, h] of TELAS) for (const t of TEMAS) {
      await page.setViewportSize({ width: w, height: h }); await tema(page, t); await page.waitForTimeout(250);
      log(L, `${nome} ${w} ${t}`, await page.evaluate(() => { const e = document.querySelector("table.tabela").parentElement; const acoes = [...document.querySelectorAll(".tabela__acoes button")]; const c = e.getBoundingClientRect(); return `tabela ${e.scrollWidth}/${e.clientWidth}; botões de ação fora: ${acoes.filter((b) => b.getBoundingClientRect().right > c.right + 0.5).length}`; }));
      const cartao = page.locator(".cartao", { has: page.locator("table.tabela") }).first(); await cartao.scrollIntoViewIfNeeded();
      await cartao.screenshot({ path: `${dir}/r2-${nome}-${FASE}-${w}-${t}.png` });
    }
  }
  log(L, "console", erros); await ctx.close();
}
await browser.close();
