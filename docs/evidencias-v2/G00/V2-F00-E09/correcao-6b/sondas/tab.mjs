// Achado 2 da acessibilidade: o Tab natural deixa o elemento sob a barra do pé ou o topo?
import { WEB, EMAILS, S, CAP, navegador, contexto, entrar, registro } from "./lib.mjs";
const ROTULO = process.env.ROTULO ?? "antes";
const log = registro(`${S}/saidas/tab-${ROTULO}.txt`);
const medir = (pg) => pg.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body || a.closest(".topo, .lateral, .pular-para-conteudo") || a.id === "conteudo") return null;
  const r = a.getBoundingClientRect();
  const topo = document.querySelector(".topo"); const tr = topo.getBoundingClientRect();
  const lim0 = ["sticky", "fixed"].includes(getComputedStyle(topo).position) ? tr.bottom : 0;
  const lat = document.querySelector(".lateral"); const lr = lat.getBoundingClientRect();
  const lim1 = getComputedStyle(lat).position === "sticky" && lr.top > innerHeight / 2 ? lr.top : innerHeight;
  const meio = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
  const coberto = !(meio === a || a.contains(meio));
  const inteiro = r.top >= lim0 - 0.5 && r.bottom <= lim1 + 0.5;
  const nome = `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}${a.id ? "" : ` "${(a.textContent || "").trim().slice(0, 24)}"`}`;
  return { ok: inteiro && !coberto, nome, txt: `${Math.round(r.top)}..${Math.round(r.bottom)} entre ${Math.round(lim0)} e ${Math.round(lim1)}${coberto ? " COBERTO" : ""}` };
});
let ruins = 0, total = 0;
for (const motor of (process.env.MOTORES ?? "chromium,firefox,webkit").split(",")) {
  const nav = await navegador(motor);
  for (const [l, a, d] of [[390, 844, 1], [320, 640, 1], [640, 450, 2], [320, 256, 1]]) {
    for (const rota of ["/ocorrencias/nova", "/minha-conta", "/orgaos"]) {
      const { ctx, pg } = await contexto(nav, { largura: l, altura: a, dpr: d });
      // Simula o quadro lento do WebKit sem tela do Linux: requestAnimationFrame atrasado.
      if (process.env.RAF_ATRASO) await ctx.addInitScript((ms) => { const orig = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { setTimeout(() => orig(cb), ms); return 0; }; }, Number(process.env.RAF_ATRASO));
      await entrar(pg, EMAILS.rita);
      await pg.goto(`${WEB}${rota}`, { waitUntil: "networkidle" }); await pg.waitForTimeout(400);
      const maus = []; let paradas = 0;
      if (motor === "webkit") {
        // No WebKit do Mac o Tab não para em botão nem link: o foco por código, na ordem do documento, faz a mesma rolagem do motor.
        const n = await pg.evaluate(() => { const els = [...document.querySelectorAll("#conteudo a[href], #conteudo button, #conteudo input, #conteudo select, #conteudo textarea")].filter((e) => !e.disabled && e.getClientRects().length); els.forEach((e, i) => e.setAttribute("data-ordem-tab", String(i))); return els.length; });
        for (let i = 0; i < Math.min(n, 40); i++) {
          await pg.locator(`[data-ordem-tab="${i}"]`).evaluate((e) => e.focus()); await pg.waitForTimeout(Number(process.env.ESPERA ?? 60));
          const m = await medir(pg); if (!m) continue; paradas++; if (!m.ok) maus.push(`${m.nome} ${m.txt}`);
        }
      } else {
        for (let i = 0; i < 40; i++) {
          await pg.keyboard.press("Tab"); await pg.waitForTimeout(Number(process.env.ESPERA ?? 60));
          const m = await medir(pg); if (!m) continue; paradas++; if (!m.ok) maus.push(`${m.nome} ${m.txt}`);
        }
      }
      total += paradas; ruins += maus.length;
      log(`[${ROTULO} ${motor} ${l}x${a}${d > 1 ? "-dpr2" : ""} ${rota}] ${maus.length} de ${paradas} paradas fora da faixa livre${maus.length ? ": " + maus.slice(0, 6).join("; ") : ""}`);
      await ctx.close();
    }
  }
  await nav.close();
}
log(`[${ROTULO}] resumo: ${ruins} de ${total} paradas fora da faixa livre`);
