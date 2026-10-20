// O texto de exemplo cabe? A mesma medida do e2e (span com a fonte computada contra a caixa de conteúdo, menos 24 px do "x" no campo de busca).
import { WEB, EMAILS, S, CAP, navegador, contexto, entrar, registro } from "./lib.mjs";
const ROTULO = process.env.ROTULO ?? "antes";
const log = registro(`${S}/saidas/6b-exemplo-${ROTULO}.txt`);
for (const motor of ["chromium", "firefox", "webkit"]) {
  const nav = await navegador(motor);
  const { ctx, pg } = await contexto(nav, { largura: 320, altura: 640 });
  await entrar(pg, EMAILS.rita);
  await pg.goto(`${WEB}/ocorrencias`, { waitUntil: "networkidle" });
  for (const sel of ["#filtro-busca", "#busca-global"]) {
    const m = await pg.evaluate((s) => {
      const campo = document.querySelector(s); const cs = getComputedStyle(campo);
      const r = document.createElement("span"); r.textContent = campo.placeholder;
      r.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
      document.body.append(r); const texto = r.getBoundingClientRect().width; r.remove();
      const area = campo.getBoundingClientRect().width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const reserva = campo.type === "search" ? 24 : 0;
      return { cabe: texto + reserva <= area + 0.5, txt: `"${campo.placeholder}" ${texto.toFixed(1)} + ${reserva} em ${area.toFixed(1)}` };
    }, sel);
    log(`[${ROTULO} ${motor} 320 ${sel}] ${m.cabe ? "CABE" : "CORTADO"} ${m.txt}`);
  }
  await pg.screenshot({ path: `${CAP}/c6b-${ROTULO}-filtro-ocorrencias-320-claro-${motor}.png` });
  await nav.close();
}
