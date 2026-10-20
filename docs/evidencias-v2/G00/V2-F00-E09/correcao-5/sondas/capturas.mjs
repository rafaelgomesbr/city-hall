// Capturas da correção 5 da E09. Roda no worktree, contra API (PGlite semeado) e painel construídos do próprio código.
// Uso (a pilha de pé): DC360=<raiz de dc360> OUT=<pasta> BASE_WEB=... BASE_API=... MOTOR=chromium node capturas.mjs
import { createRequire } from "node:module";
import { mkdirSync, appendFileSync } from "node:fs";
const require = createRequire(process.env.DC360 + "/package.json");
const playwright = require("playwright");
const MOTOR = process.env.MOTOR ?? "chromium";
const WEB = process.env.BASE_WEB, API = process.env.BASE_API, OUT = process.env.OUT;
const SENHA = "defesa-civil-2026";
mkdirSync(OUT, { recursive: true });
const LOG = process.env.LOG ?? `${OUT}/../saidas/capturas-${MOTOR}.txt`;
const log = (...a) => { const t = a.join(" "); console.log(t); appendFileSync(LOG, t + "\n"); };
const LARGURAS = (process.env.LARGURAS ?? "320,360,390,768,1280").split(",").map(Number);
const TEMAS = ["claro", "escuro"];
const sufixo = Date.now().toString(36);

async function api(caminho, { token, metodo = "GET", corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, { method: metodo,
    headers: { ...(corpo ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, corpo: j };
}
const rita = await api("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
const token = rita.corpo.acesso;
const emailAna = `ana.${sufixo}@coordenadoria.defesacivil.secretaria.serraalta.exemplo.gov.br`;
const emailCoord = `coord.${sufixo}@serraalta.exemplo.gov.br`;
const emailProv = `prov.${sufixo}@serraalta.exemplo.gov.br`;
const ids = {};
for (const [nome, email, papel, sigla] of [["Ana Subdominios", emailAna, "operador", "AS"], ["Coordenadora de Captura", emailCoord, "coordenador", "CC"], ["Pessoa Provisoria", emailProv, "operador", "PP"]]) {
  const r = await api("/usuarios", { metodo: "POST", token, corpo: { nome, matricula: `${sigla}-${sufixo}`.toUpperCase(), email, papel, equipeId: null, senha: "senha-provisoria-do-teste-1" } });
  ids[email] = r.corpo?.id;
  log("cadastro", nome, r.status);
}
const redef = await api(`/usuarios/${ids[emailProv]}/redefinir-senha`, { metodo: "POST", token, corpo: {} });
log("redefinir provisoria", redef.status);
const provisoria = redef.corpo?.senhaTemporaria;

const navegador = await playwright[MOTOR].launch();
const erros = [];
async function novo(vp) {
  const ctx = await navegador.newContext({ viewport: vp, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => erros.push(`pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/status of 401|downloadable font/.test(m.text())) erros.push(m.text()); });
  return { ctx, page };
}
const tema = async (page, t) => { await page.evaluate((t) => { document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light"; }, t); await page.waitForTimeout(150); };
async function entrar(page, email, senha) {
  await page.goto(`${WEB}/entrar`, { waitUntil: "networkidle" });
  await page.locator("#entrada-email").fill(email);
  await page.locator("#entrada-senha").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
const foco = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

// 1. As janelas com o email
for (const t of TEMAS) for (const l of LARGURAS) {
  const { ctx, page } = await novo({ width: l, height: l <= 390 ? 800 : 900 });
  await entrar(page, "rita.lopes@serraalta.exemplo.gov.br", SENHA);
  await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30000 });
  await page.goto(`${WEB}/usuarios`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tabela tbody tr");
  await tema(page, t);
  const linha = page.locator("tbody tr", { hasText: emailAna });
  for (const [botao, rotulo] of [["Redefinir senha", "redefinir"], ["Desativar", "desativar"]]) {
    await linha.getByRole("button", { name: botao, exact: true }).scrollIntoViewIfNeeded();
    await linha.getByRole("button", { name: botao, exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/c5-janela-${rotulo}-email-${l}-${t}-${MOTOR}.png` });
    log("janela", rotulo, l, t, MOTOR);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
  }
  await ctx.close();
}

// 2. Minha conta depois da senha atual errada (foco no campo)
for (const t of TEMAS) for (const l of LARGURAS) {
  const { ctx, page } = await novo({ width: l, height: l <= 390 ? 800 : 900 });
  await entrar(page, emailCoord, "senha-provisoria-do-teste-1");
  await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30000 });
  await page.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" });
  await tema(page, t);
  await page.locator("#conta-senha-atual").fill("senha-que-nao-e-a-dela");
  await page.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
  await page.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
  const resp = page.waitForResponse((r) => r.url().includes("/auth/trocar-senha"));
  await page.getByRole("button", { name: "Trocar senha", exact: true }).click();
  await resp; await page.locator("#conta-senha-atual-erro").waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
  const f = await foco(page);
  log("minha conta senha errada", l, t, MOTOR, "foco:", f);
  await page.screenshot({ path: `${OUT}/c5-minha-conta-senha-errada-${l}-${t}-${MOTOR}.png` });
  await ctx.close();
}

// 3. "Defina a sua senha" depois da provisória errada
if (provisoria) for (const t of TEMAS) for (const l of [390, 320, 1280]) {
  const { ctx, page } = await novo({ width: l, height: l <= 390 ? 800 : 900 });
  await entrar(page, emailProv, provisoria);
  await page.getByRole("heading", { name: "Defina a sua senha" }).waitFor({ timeout: 30000 });
  await tema(page, t);
  await page.locator("#senha-nova-atual").fill("provisoria-digitada-errada");
  await page.locator("#senha-nova").fill("frase-nova-do-teste-2026");
  await page.locator("#senha-nova-repetida").fill("frase-nova-do-teste-2026");
  const resp = page.waitForResponse((r) => r.url().includes("/auth/trocar-senha"));
  await page.getByRole("button", { name: "Definir senha e entrar" }).click();
  await resp; await page.locator("#senha-nova-atual-erro").waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
  log("defina a senha provisoria errada", l, t, MOTOR, "foco:", await foco(page));
  await page.screenshot({ path: `${OUT}/c5-defina-a-senha-provisoria-errada-${l}-${t}-${MOTOR}.png` });
  await ctx.close();
}
log("erros de console/pagina:", erros.length ? [...new Set(erros)].join(" | ") : "nenhum");
await navegador.close();
