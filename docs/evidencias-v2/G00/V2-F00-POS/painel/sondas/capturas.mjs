const pw = await import("file:///C:/Projetos/city-hall/.claude/worktrees/agent-a8d79f1562a162af3/dc360/node_modules/playwright/index.mjs");
import { mkdirSync } from "node:fs";
const SAIDA = "C:/Projetos/city-hall/.claude/worktrees/agent-a8d79f1562a162af3/docs/evidencias-v2/G00/V2-F00-POS/painel/capturas";
mkdirSync(SAIDA, { recursive: true });
const BASE = "http://localhost:4691", API = "http://127.0.0.1:3691";
const SENHA = "defesa-civil-2026";
async function viaApi(caminho, { metodo = "GET", token, corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, { method: metodo, headers: { ...(corpo ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const rita = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
const sufixo = Date.now().toString(36);
const email = `longo.${sufixo}@serraalta.exemplo.gov.br`;
const criada = await viaApi("/usuarios", { metodo: "POST", token: rita.json.acesso, corpo: { nome: "Marcos Vinicius Teles de Albuquerque Sobrinho", matricula: `LG-${sufixo}`.toUpperCase(), email, papel: "operador", equipeId: null, senha: "senha-provisoria-do-teste-1" } });
console.log("usuario", criada.status);
await viaApi("/auth/entrar", { metodo: "POST", corpo: { email, senha: "senha-provisoria-do-teste-1" } });

const nav = await pw.chromium.launch();
const alturas = { 320: 640, 390: 844, 1280: 800 };
for (const tema of ["light", "dark"]) {
  const rotuloTema = tema === "light" ? "claro" : "escuro";
  for (const l of [320, 390, 1280]) {
    const ctx = await nav.newContext({ viewport: { width: l, height: alturas[l] }, colorScheme: tema, locale: "pt-BR" });
    const page = await ctx.newPage();
    const erros = [];
    page.on("pageerror", (e) => erros.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/font/i.test(m.text())) erros.push(m.text()); });
    await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
    await page.locator("#entrada-email").fill("rita.lopes@serraalta.exemplo.gov.br");
    await page.locator("#entrada-senha").fill(SENHA);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SAIDA}/h08-${rotuloTema}-${l}-barra-fechada.png` });
    if (l < 1280) {
      await page.locator("button.lateral__mais").click();
      await page.locator(".lateral__menu").waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SAIDA}/h08-${rotuloTema}-${l}-menu-aberto.png` });
      await page.keyboard.press("Escape");
      // Tela de dentro do menu: o Mais leva a marca.
      await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
      await page.waitForSelector(".tabela tbody tr", { timeout: 30000 });
      await page.waitForTimeout(400);
      await page.locator("button.lateral__mais").click();
      await page.locator(".lateral__menu").waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SAIDA}/h08-${rotuloTema}-${l}-menu-aberto-em-usuarios.png` });
      await page.keyboard.press("Escape");
    }
    // H05 e H26: encerrar as sessões (nasce o aviso), redefinir a senha (janela da senha), Esc, botão.
    await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
    await page.waitForSelector(".tabela tbody tr", { timeout: 30000 });
    const alvo = page.locator("tbody tr", { hasText: email });
    await alvo.getByRole("button", { name: "Encerrar sessões", exact: true }).scrollIntoViewIfNeeded();
    await alvo.getByRole("button", { name: "Encerrar sessões", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Encerrar sessões de Marcos/ }).click();
    await page.waitForSelector(".toast", { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SAIDA}/h26-${rotuloTema}-${l}-1-aviso-de-sessoes-encerradas.png` });
    await alvo.getByRole("button", { name: "Redefinir senha", exact: true }).click();
    const janela = page.getByRole("dialog");
    await janela.getByRole("button", { name: /^Redefinir a senha de Marcos/ }).click();
    await janela.getByRole("button", { name: "Já anotei a senha" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SAIDA}/h26-${rotuloTema}-${l}-2-janela-da-senha-sem-aviso-por-cima.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const aindaAberta = await janela.isVisible();
    console.log(tema, l, "depois do Esc a janela da senha segue aberta:", aindaAberta, "avisos na pagina:", await page.locator(".toast").count());
    await page.screenshot({ path: `${SAIDA}/h05-${rotuloTema}-${l}-3-depois-do-esc-a-janela-continua.png` });
    await janela.getByRole("button", { name: "Já anotei a senha" }).click();
    await janela.waitFor({ state: "detached" });
    await page.waitForSelector(".toast", { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SAIDA}/h26-${rotuloTema}-${l}-4-janela-fechada-o-aviso-volta.png` });
    if (erros.length) console.log(tema, l, "ERROS", erros);
    await ctx.close();
  }
}
await nav.close();
