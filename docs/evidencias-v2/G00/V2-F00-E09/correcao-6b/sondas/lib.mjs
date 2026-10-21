// Apoio das sondas da correção 6 da E09 (portas 5811 e 5812, próprias).
import { chromium, firefox, webkit } from "/Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/node_modules/playwright/index.mjs";
import { appendFileSync, mkdirSync } from "node:fs";
export const WEB = "http://localhost:5812";
export const API = "http://127.0.0.1:5811";
export const SENHA = "defesa-civil-2026";
export const S = "/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad";
export const CAP = `${S}/capturas`;
mkdirSync(CAP, { recursive: true });
export const EMAILS = {
  helena: "helena.coutinho@serraalta.exemplo.gov.br",
  jonas: "jonas.ferreira@serraalta.exemplo.gov.br",
  rita: "rita.lopes@serraalta.exemplo.gov.br",
};
export function registro(arquivo) { return (l) => { console.log(l); appendFileSync(arquivo, l + "\n"); }; }
export async function api(caminho, { metodo = "GET", token, corpo } = {}) {
  const r = await fetch(API + caminho, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
export async function tokenDe(email, senha = SENHA) { return (await api("/auth/entrar", { metodo: "POST", corpo: { email, senha } })).json?.acesso; }
export async function navegador(motor) { return ({ firefox, webkit, chromium }[motor]).launch(); }
export async function contexto(nav, { largura, altura, tema = "claro", dpr = 1 }) {
  const ctx = await nav.newContext({ locale: "pt-BR", viewport: { width: largura, height: altura }, deviceScaleFactor: dpr, colorScheme: tema === "escuro" ? "dark" : "light" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("dc360:tema", t); } catch {} }, tema);
  return { ctx, pg: await ctx.newPage() };
}
export async function entrar(pg, email, senha = SENHA) {
  await pg.goto(`${WEB}/entrar`, { waitUntil: "networkidle" });
  await pg.locator("#entrada-email").fill(email);
  await pg.locator("#entrada-senha").fill(senha);
  await pg.getByRole("button", { name: "Entrar", exact: true }).click();
  await pg.waitForSelector(".cabecalho-pagina h1", { timeout: 30000 });
}
/** Rótulo e campo focados inteiros entre o topo fixo e a barra do pé, e não cobertos no centro. */
export async function aVista(pg) {
  return pg.evaluate(() => {
    const a = document.activeElement;
    const rot = a?.id ? document.querySelector(`label[for="${a.id}"]`) : null;
    if (!a || !rot) return { ok: false, txt: `foco=${a?.id || a?.tagName} sem rótulo` };
    const rc = a.getBoundingClientRect(), rl = rot.getBoundingClientRect();
    const topoEl = document.querySelector(".topo");
    const topo = topoEl ? topoEl.getBoundingClientRect().bottom : 0;
    const lat = document.querySelector(".lateral");
    const lr = lat?.getBoundingClientRect();
    const pe = lat && getComputedStyle(lat).position === "sticky" && lr.top > innerHeight / 2 ? lr.top : innerHeight;
    const cima = Math.min(rc.top, rl.top), baixo = Math.max(rc.bottom, rl.bottom);
    const cobre = (r, el) => { const x = r.left + Math.min(r.width / 2, 20), y = r.top + r.height / 2; const e = document.elementFromPoint(x, y); return !(e === el || el.contains(e)); };
    const ok = cima >= topo - 0.5 && baixo <= pe + 0.5 && !cobre(rc, a) && !cobre(rl, rot);
    return { ok, txt: `foco=${a.id} rótulo=${Math.round(rl.top)}..${Math.round(rl.bottom)} campo=${Math.round(rc.top)}..${Math.round(rc.bottom)} topo até ${Math.round(topo)} pé desde ${Math.round(pe)} janela ${innerWidth}x${innerHeight} spt=${getComputedStyle(document.documentElement).scrollPaddingTop} spb=${getComputedStyle(document.documentElement).scrollPaddingBottom}` };
  });
}
