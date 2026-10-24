import * as playwright from "playwright";
const MOTOR = process.env.MOTOR ?? "chromium";
const BASE = "http://localhost:6712";
const nav = await playwright[MOTOR].launch();
const ctx = await nav.newContext({ locale: "pt-BR", viewport: { width: 320, height: 256 } });
const pg = await ctx.newPage();
await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.locator("#entrada-email").fill("rita.lopes@serraalta.exemplo.gov.br");
await pg.locator("#entrada-senha").fill("defesa-civil-2026");
await pg.getByRole("button", { name: "Entrar", exact: true }).click();
await pg.waitForSelector(".cabecalho-pagina h1");
await pg.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
await pg.waitForSelector(".tabela tbody tr");
const medir = () => pg.evaluate(() => {
  const p = document.querySelector(".modal__painel"); const el = document.activeElement;
  const r = el.getBoundingClientRect(); const pr = p.getBoundingClientRect();
  return { foco: el.textContent.trim().slice(0, 20), btn: `${Math.round(r.top)}..${Math.round(r.bottom)}`, painel: `${Math.round(pr.top + p.clientTop)}..${Math.round(pr.top + p.clientTop + p.clientHeight)}`, st: p.scrollTop, sh: p.scrollHeight, ch: p.clientHeight, ativoNoPainel: p.contains(el) };
});
for (const nome of ["Redefinir senha", "Encerrar sessões", "Encerrar sessões"]) {
  await pg.getByRole("button", { name: nome, exact: true }).first().focus();
  await pg.keyboard.press("Enter");
  await pg.getByRole("dialog").waitFor();
  for (const ms of [0, 50, 200, 600]) { await pg.waitForTimeout(ms); console.log(nome, ms, JSON.stringify(await medir())); }
  await pg.keyboard.press("Escape");
  await pg.getByRole("dialog").waitFor({ state: "detached" });
}
await nav.close();
