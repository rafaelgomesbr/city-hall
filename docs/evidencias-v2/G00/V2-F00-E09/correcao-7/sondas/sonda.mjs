// Sonda da correção 7: reproduz os dois achados bloqueantes da rodada 8.
// Uso: MOTOR=webkit BASE_WEB=... BASE_API=... node sonda.mjs [captura-prefixo]
import * as playwright from "playwright";
import { mkdirSync } from "node:fs";

const MOTOR = process.env.MOTOR ?? "chromium";
const BASE = process.env.BASE_WEB ?? "http://localhost:6712";
const API = process.env.BASE_API ?? "http://127.0.0.1:6711";
const PREFIXO = process.argv[2] ?? "";
const PASTA = process.env.CAPTURAS ?? "";
const SENHA = "defesa-civil-2026";
const SENHA_T = "senha-provisoria-do-teste-1";
const sufixo = Date.now().toString(36);

async function viaApi(caminho, { metodo = "GET", token, corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { ...(corpo ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const adm = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
let n = 0;
async function conta(papel = "operador") {
  n++;
  const email = `c7.${n}.${sufixo}@serraalta.exemplo.gov.br`;
  const r = await viaApi("/usuarios", { metodo: "POST", token: adm.json.acesso,
    corpo: { nome: `Sessões Sete ${n}`, matricula: `C7-${n}-${sufixo}`.toUpperCase().slice(0, 20), email, papel, equipeId: null, senha: SENHA_T } });
  if (r.status !== 201 && r.status !== 200) throw new Error(`conta ${n}: ${r.status}`);
  return email;
}
const lancador = playwright[MOTOR];
const navegador = await lancador.launch();
async function pagina(l, a, dpr = 1) {
  const ctx = await navegador.newContext({ locale: "pt-BR", viewport: { width: l, height: a }, deviceScaleFactor: dpr, hasTouch: false });
  const pg = await ctx.newPage();
  return { ctx, pg };
}
async function entrar(pg, email, senha) {
  await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await pg.locator("#entrada-email").fill(email);
  await pg.locator("#entrada-senha").fill(senha);
  await pg.getByRole("button", { name: "Entrar", exact: true }).click();
  await pg.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
}
const medirFaixa = (pg, seletor) => pg.evaluate((sel) => {
  const el = sel ? document.querySelector(sel) : document.activeElement;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const topo = document.querySelector(".topo");
  const barra = document.querySelector(".lateral");
  const cima = topo && ["sticky", "fixed"].includes(getComputedStyle(topo).position) ? topo.getBoundingClientRect().bottom : 0;
  const rb = barra?.getBoundingClientRect();
  const baixo = barra && getComputedStyle(barra).position === "sticky" && rb.top > innerHeight / 2 ? rb.top : innerHeight;
  const meio = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), cima: Math.round(cima), baixo: Math.round(baixo),
    inteiro: r.top >= cima - 0.5 && r.bottom <= baixo + 0.5, aVista: Boolean(meio && (meio === el || el.contains(meio))) };
}, seletor);

const resultados = [];
async function sessoes(l, a, via) {
  const email = await conta();
  await viaApi("/auth/entrar", { metodo: "POST", corpo: { email, senha: SENHA_T } });
  await viaApi("/auth/entrar", { metodo: "POST", corpo: { email, senha: SENHA_T } });
  const { ctx, pg } = await pagina(l, a);
  await entrar(pg, email, SENHA_T);
  await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
  await pg.waitForTimeout(500);
  const botao = pg.getByRole("button", { name: "Encerrar minhas outras sessões" });
  await botao.scrollIntoViewIfNeeded();
  if (via === "teclado") { await botao.focus(); await pg.keyboard.press("Enter"); }
  else await botao.click();
  const janela = pg.getByRole("dialog");
  await janela.waitFor({ timeout: 10_000 });
  const confirmar = janela.getByRole("button", { name: /^Encerrar (a outra sessão|as outras \d+ sessões)$/ });
  if (via === "teclado") { await confirmar.focus(); await pg.keyboard.press("Enter"); }
  else await confirmar.click();
  await pg.locator(".aviso--sucesso").waitFor({ timeout: 20_000 });
  await pg.waitForTimeout(1500);
  const m = await medirFaixa(pg, null);
  const foco = await pg.evaluate(() => document.activeElement?.className ?? "");
  const aviso = await medirFaixa(pg, ".aviso--sucesso");
  const okFoco = /aviso--sucesso/.test(foco) && aviso && aviso.inteiro && aviso.aVista;
  resultados.push({ caso: `sessoes ${l}x${a} ${via}`, ok: Boolean(okFoco), aviso, foco });
  if (PASTA && PREFIXO) await pg.screenshot({ path: `${PASTA}/${PREFIXO}-sessoes-${l}x${a}-${via}-${MOTOR}.png` });
  await ctx.close();
}
async function janelaAbre(l, a, dpr, rota, abrir) {
  const { ctx, pg } = await pagina(l, a, dpr);
  await entrar(pg, "rita.lopes@serraalta.exemplo.gov.br", SENHA);
  await pg.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
  await pg.waitForTimeout(500);
  await abrir(pg);
  await pg.getByRole("dialog").waitFor({ timeout: 10_000 });
  await pg.waitForTimeout(600);
  const r = await pg.evaluate(() => {
    const painel = document.querySelector(".modal__painel");
    const el = document.activeElement;
    const p = painel.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    const meio = document.elementFromPoint(e.left + e.width / 2, Math.min(Math.max(e.top + e.height / 2, 0), innerHeight - 1));
    const dentro = painel.contains(el);
    const tu = p.top + painel.clientTop, bu = tu + painel.clientHeight;
    const inteiro = e.top >= tu - 0.5 && e.bottom <= bu + 0.5 && e.left >= p.left - 0.5 && e.right <= p.right + 0.5;
    const aVista = Boolean(meio && (meio === el || el.contains(meio)));
    const cs = getComputedStyle(el);
    return {
      foco: `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ").join(".") : ""} "${(el.textContent || "").trim().slice(0, 30)}"`,
      dentro, inteiro, aVista, painel: `${Math.round(p.top)}..${Math.round(p.bottom)}`, el: `${Math.round(e.top)}..${Math.round(e.bottom)}`,
      scrollTop: painel.scrollTop, paginaRola: document.documentElement.scrollWidth > innerWidth + 1, painelRola: painel.scrollWidth > painel.clientWidth + 1,
      anel: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 || (el === painel ? false : cs.boxShadow !== "none"),
      eOPainel: el === painel,
    };
  });
  // "visível": o foco está num controle (ou no painel) que cabe na janela e não está coberto
  const ok = r.dentro && r.aVista && (r.inteiro || r.eOPainel) && !r.paginaRola && !r.painelRola;
  resultados.push({ caso: `janela ${rota} ${l}x${a}${dpr > 1 ? " dpr" + dpr : ""}`, ok, ...r });
  if (PASTA && PREFIXO) await pg.screenshot({ path: `${PASTA}/${PREFIXO}-janela-${rota.slice(1)}-${l}x${a}-${MOTOR}.png` });
  await ctx.close();
}

const so = process.env.SO ?? "tudo";
if (so === "tudo" || so === "sessoes") {
  const CAPT = process.env.CAPT === "1";
  for (const [l, a] of CAPT ? [[360, 640], [320, 568]] : [[360, 640], [390, 664], [375, 667], [375, 553], [320, 568], [640, 450]])
    for (const via of CAPT ? ["clique"] : ["clique", "teclado"]) await sessoes(l, a, via);
}
if (so === "tudo" || so === "janelas") {
  const redefinir = async (pg) => { await pg.getByRole("button", { name: /^Redefinir senha/ }).first().focus(); await pg.keyboard.press("Enter"); };
  const encerrar = async (pg) => { await pg.getByRole("button", { name: /^Encerrar sessões/ }).first().focus(); await pg.keyboard.press("Enter"); };
  for (const [l, a, d] of process.env.CAPT === "1" ? [[320, 256, 1], [568, 320, 1]] : [[320, 256, 1], [320, 450, 1], [390, 450, 1], [640, 300, 1], [568, 320, 1], [640, 450, 2], [1280, 720, 1]]) {
    await janelaAbre(l, a, d, "/usuarios", redefinir);
    if (process.env.CAPT !== "1") await janelaAbre(l, a, d, "/usuarios", encerrar);
  }
}
await navegador.close();
let ruins = 0;
for (const r of resultados) { if (!r.ok) ruins++; console.log(`${r.ok ? "OK   " : "FALHA"} ${r.caso} ${JSON.stringify({ ...r, caso: undefined, ok: undefined })}`); }
console.log(`\n${MOTOR}: ${resultados.length - ruins} de ${resultados.length} aprovadas`);
