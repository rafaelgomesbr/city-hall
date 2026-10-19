// Apoio das capturas da correção 4 da E09. Roda no worktree, contra API (PGlite semeado) e painel construídos do próprio código.
import { createRequire } from "node:module";
import { mkdirSync, appendFileSync } from "node:fs";
const require = createRequire(process.env.DC360 + "/package.json");
export const { chromium } = require("playwright");
export const SP = process.env.SP + "/c4";
export const API = "http://127.0.0.1:5101";
export const WEB = "http://localhost:5111";
export const SENHA = "defesa-civil-2026";
export const EMAIL = {
  helena: "helena.coutinho@serraalta.exemplo.gov.br",
  jonas: "jonas.ferreira@serraalta.exemplo.gov.br",
  diego: "diego.alves@serraalta.exemplo.gov.br",
  rita: "rita.lopes@serraalta.exemplo.gov.br",
};
export const pasta = () => { mkdirSync(`${SP}/capturas`, { recursive: true }); return `${SP}/capturas`; };
export function log(arq, ...a) {
  const t = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  console.log(t); appendFileSync(`${SP}/saidas/${arq}`, t + "\n");
}
export async function novoContexto(browser, vp = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => { if (m.type() === "error" && !/status of (401|403|404|422)/.test(m.text())) erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(`pageerror ${e.message}`));
  return { ctx, page, erros };
}
export async function tema(page, t) { await page.evaluate((t) => { document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light"; }, t); await page.waitForTimeout(200); }
export async function entrar(page, email, senha = SENHA, esperar = true) {
  await page.goto(`${WEB}/entrar`, { waitUntil: "networkidle" });
  await page.locator("#entrada-email").fill(email);
  await page.locator("#entrada-senha").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  if (esperar) { await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 }); await page.waitForLoadState("networkidle"); }
}
export async function api(caminho, { token, metodo = "GET", corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, { method: metodo,
    headers: { ...(corpo ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, corpo: j };
}
export async function token(email, senha = SENHA) {
  const r = await api("/auth/entrar", { metodo: "POST", corpo: { email, senha } });
  if (!r.corpo?.acesso) throw new Error(`login falhou ${email}: ${JSON.stringify(r)}`);
  return r.corpo.acesso;
}
