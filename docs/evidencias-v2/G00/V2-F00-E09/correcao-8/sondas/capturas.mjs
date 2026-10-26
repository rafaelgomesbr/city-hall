// Capturas da correção 8: as quatro situações da rodada 9, antes e depois.
// Uso (de dentro de dc360/apps/web, com a API e o painel de pé):
//   MOTOR=webkit CAPTURAS=<pasta> node test/_capturas.tmp.mjs c8-antes
import * as playwright from "playwright";

const MOTOR = process.env.MOTOR ?? "chromium";
const BASE = process.env.BASE_WEB ?? "http://localhost:7812";
const API = process.env.BASE_API ?? "http://127.0.0.1:7811";
const PASTA = process.env.CAPTURAS ?? "";
const PREFIXO = process.argv[2] ?? "c8";
const SENHA = "defesa-civil-2026";
const CORS = { "access-control-allow-origin": new URL(BASE).origin, "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

const navegador = await playwright[MOTOR].launch();
const saida = [];

async function entrar(pg) {
  await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await pg.locator("#entrada-email").fill("rita.lopes@serraalta.exemplo.gov.br");
  await pg.locator("#entrada-senha").fill(SENHA);
  await pg.getByRole("button", { name: "Entrar", exact: true }).click();
  await pg.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
  await pg.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
}
async function abrir(pg, nome) {
  const g = pg.getByRole("button", { name: nome, exact: true }).first();
  await g.scrollIntoViewIfNeeded();
  await g.focus();
  await pg.keyboard.press("Enter");
  await pg.getByRole("dialog").waitFor({ timeout: 10_000 });
  await pg.waitForTimeout(500);
}
const medir = (pg) => pg.evaluate(() => {
  const painel = document.querySelector(".modal__painel");
  const el = document.activeElement;
  if (!painel) return "sem janela";
  const p = painel.getBoundingClientRect();
  const topo = p.top + painel.clientTop, base = topo + painel.clientHeight;
  const r = el && el !== document.body ? el.getBoundingClientRect() : null;
  const t = painel.querySelector(".modal__titulo")?.getBoundingClientRect();
  return `foco em ${el === document.body ? "BODY" : (el === painel ? "o painel" : `${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 20)}"`)}${r ? ` ${Math.round(r.top)}..${Math.round(r.bottom)}` : ""}; parte visível ${Math.round(topo)}..${Math.round(base)}; título ${t ? `${Math.round(t.top)}..${Math.round(t.bottom)}` : "?"}`;
});
async function foto(pg, nome) {
  if (PASTA) await pg.screenshot({ path: `${PASTA}/${PREFIXO}-${nome}-${MOTOR}.png` });
}
async function cenario(nome, vp0, vp1, nomeDaJanela, depois = async () => {}, rota = null) {
  const ctx = await navegador.newContext({ locale: "pt-BR", viewport: { width: vp0[0], height: vp0[1] } });
  const pg = await ctx.newPage();
  if (rota) await pg.route(rota.padrao, rota.tratador);
  await entrar(pg);
  await abrir(pg, nomeDaJanela);
  if (vp1) { await pg.setViewportSize({ width: vp1[0], height: vp1[1] }); await pg.waitForTimeout(800); }
  await depois(pg);
  const m = await medir(pg);
  await foto(pg, nome);
  saida.push(`${PREFIXO} ${MOTOR} ${nome}: ${m}`);
  await ctx.close();
}

await cenario("rotacao-320x568-para-568x320", [320, 568], [568, 320], "Redefinir senha");
await cenario("zoom-1280x1024-para-320x256", [1280, 1024], [320, 256], "Encerrar sessões");
await cenario("janela-baixa-320x256-titulo", [320, 256], null, "Redefinir senha");
await cenario("fundo-390x844-clique-no-fundo", [390, 844], null, "Redefinir senha", async (pg) => {
  await pg.mouse.click(3, 3);
  await pg.waitForTimeout(500);
});
await cenario("erro-390x844-depois-do-erro", [390, 844], null, "Redefinir senha", async (pg) => {
  const confirmar = pg.getByRole("dialog").locator(".modal__rodape button").first();
  await confirmar.focus();
  await pg.keyboard.press("Enter");
  await pg.getByRole("dialog").locator('[role="alert"], .aviso--perigo').first().waitFor({ timeout: 10_000 });
  await pg.waitForTimeout(600);
}, {
  padrao: /\/usuarios\/[^/]+\/(redefinir-senha|encerrar-sessoes)$/,
  tratador: async (rota) => {
    if (rota.request().method() === "OPTIONS") return rota.fulfill({ status: 204, headers: CORS });
    await new Promise((r) => setTimeout(r, 800));
    return rota.fulfill({ status: 500, headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({ codigo: "erro_interno", mensagem: "Erro do servidor" }) });
  },
});

await navegador.close();
console.log(saida.join("\n"));
