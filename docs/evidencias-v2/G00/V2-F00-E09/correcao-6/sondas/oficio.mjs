import { WEB, EMAILS, S, CAP, api, tokenDe, navegador, contexto, entrar, registro } from "./lib.mjs";
const ROTULO = process.env.ROTULO ?? "antes";
const log = registro(`${S}/saidas/oficio-${ROTULO}.txt`);
const OC = "11111111-1111-4111-8111-0000000000c4";
const rita = await tokenDe(EMAILS.rita);
let oficio = (await api(`/oficios?ocorrenciaId=${OC}`, { token: rita })).json.itens[0];
if (!oficio) {
  const pend = (await api("/ocorrencias/providencias/pendentes", { token: rita })).json.itens.find((p) => p.ocorrencia_id === OC);
  const emit = await api("/oficios", { metodo: "POST", token: rita, corpo: { providenciaId: pend.id } });
  oficio = { id: emit.json.id };
}
const EMAIL = "plantaocoordenacaodefesacivilserraalta@serraalta.exemplo.gov.br";
for (const motor of (process.env.MOTORES ?? "chromium,firefox,webkit").split(",")) {
  const nav = await navegador(motor);
  for (const [largura, altura] of [[320, 640], [360, 700]]) {
    const { ctx, pg } = await contexto(nav, { largura, altura });
    await pg.route(`**/oficios?ocorrenciaId=*`, async (rota) => { const r = await rota.fetch(); const j = await r.json(); for (const o of (j.itens ?? j)) if (o.id === oficio.id) { o.envios = 1; o.ultimo_envio = null; } await rota.fulfill({ response: r, json: j }); });
    await pg.route(`**/oficios/${oficio.id}`, async (rota) => {
      if (rota.request().method() !== "GET") return rota.continue();
      const r = await rota.fetch(); const j = await r.json();
      j.envios = [{ id: "11111111-1111-4111-8111-00000000e001", tentativa: 1, destinatario_email: EMAIL, solicitado_em: new Date().toISOString(), solicitado_por_nome: "Jonas Ferreira", desfecho: "falhou", detalhe: null, provedor_id: null, expira_em: null }];
      await rota.fulfill({ response: r, json: j });
    });
    await entrar(pg, EMAILS.jonas);
    await pg.goto(`${WEB}/ocorrencias/${OC}`, { waitUntil: "networkidle" });
    const botao = pg.locator(".oficio button", { hasText: /tentativa/ }).first();
    const rotuloBotao = (await botao.textContent()).trim();
    await botao.click();
    await pg.locator("li.oficio__linha").first().waitFor();
    const rotuloDepois = (await botao.textContent()).trim();
    await pg.locator("li.oficio__linha").first().scrollIntoViewIfNeeded();
    const m = await pg.evaluate(() => {
      const li = document.querySelector("li.oficio__linha"); const sp = li.querySelector("span");
      const card = li.closest(".cartao"); const c = card.getBoundingClientRect(); const r = sp.getBoundingClientRect();
      const util = c.right - parseFloat(getComputedStyle(card).paddingRight);
      const explic = [...li.closest(".oficio").querySelectorAll("p, .oficio__linha, div")].map((e) => e.textContent).find((t) => /ficou registrada|ficaram registradas/.test(t)) ?? "";
      return { rola: document.documentElement.scrollWidth > innerWidth + 1, sw: document.documentElement.scrollWidth, spanAte: Math.round(r.right), util: Math.round(util), cartaoAte: Math.round(c.right), frase: explic.match(/(A tentativa|As \d+ tentativas)[^.]*\./)?.[0] ?? "" };
    });
    const ok = !m.rola && m.spanAte <= m.util + 0.5;
    log(`[${ROTULO} ${motor} ${largura}] ${ok ? "OK" : "TRANSBORDA"} página rola=${m.rola} (${m.sw}) texto até ${m.spanAte}, área útil até ${m.util}, cartão até ${m.cartaoAte}; botão "${rotuloBotao}" / "${rotuloDepois}"; frase "${m.frase}"`);
    await pg.screenshot({ path: `${CAP}/c6-${ROTULO}-oficio-email-sem-ponto-${largura}-claro-${motor}.png` });
    await ctx.close();
  }
  await nav.close();
}
