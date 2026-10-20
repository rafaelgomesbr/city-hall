// Achado 6 (anotado 7): o texto de exemplo da busca do topo cabe inteiro a 320 px?
import { WEB, EMAILS, S, CAP, navegador, contexto, entrar, registro } from "./lib.mjs";
const ROTULO = process.env.ROTULO ?? "antes";
const log = registro(`${S}/saidas/busca-${ROTULO}.txt`);
for (const motor of ["chromium", "firefox", "webkit"]) {
  const nav = await navegador(motor);
  for (const [l, a] of [[320, 568], [360, 700], [390, 844], [601, 700], [768, 600]]) {
    const { ctx, pg } = await contexto(nav, { largura: l, altura: a });
    await entrar(pg, EMAILS.jonas);
    const m = await pg.evaluate(() => {
      const i = document.querySelector("#busca-global"); const cs = getComputedStyle(i);
      const c = document.createElement("canvas").getContext("2d"); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const texto = c.measureText(i.placeholder).width;
      const util = i.getBoundingClientRect().width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const kbd = document.querySelector(".busca-global__atalho"); const kv = kbd && getComputedStyle(kbd).display !== "none";
      return { cabe: texto <= util + 0.5, txt: `texto ${texto.toFixed(1)} px, área do texto ${util.toFixed(1)} px, dica do atalho ${kv ? "visível" : "escondida"}, aria-describedby=${i.getAttribute("aria-describedby")}` };
    });
    log(`[${ROTULO} ${motor} ${l}x${a}] ${m.cabe ? "CABE" : "CORTADO"} ${m.txt}`);
    if (l <= 360) await pg.screenshot({ path: `${CAP}/c6-${ROTULO}-busca-do-topo-${l}-claro-${motor}.png`, clip: { x: 0, y: 0, width: l, height: 160 } });
    await ctx.close();
  }
  await nav.close();
}
