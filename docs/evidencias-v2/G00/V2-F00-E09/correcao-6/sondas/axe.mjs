// Achado 3 da acessibilidade: axe-core 4.10.2 (o mesmo do validador) no topo logado, regra link-name e as A/AA.
import { readFileSync } from "node:fs";
import { WEB, EMAILS, S, CAP, navegador, contexto, entrar, registro } from "./lib.mjs";
const ROTULO = process.env.ROTULO ?? "antes";
const log = registro(`${S}/saidas/axe-${ROTULO}.txt`);
const AXE = readFileSync(`${S}/axe/axe.min.js`, "utf8");
for (const motor of ["chromium", "firefox", "webkit"]) {
  const nav = await navegador(motor);
  for (const [l, a] of [[390, 844], [320, 640], [1280, 900]]) {
    for (const rota of ["/painel", "/minha-conta"]) {
      const { ctx, pg } = await contexto(nav, { largura: l, altura: a });
      await entrar(pg, EMAILS.rita);
      await pg.goto(`${WEB}${rota}`, { waitUntil: "networkidle" }); await pg.waitForTimeout(400);
      await pg.addScriptTag({ content: AXE });
      const r = await pg.evaluate(async () => {
        const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
        const nome = document.querySelector(".identidade");
        return { violacoes: res.violations.map((v) => `${v.id}(${v.nodes.length})`), linkName: res.violations.find((v) => v.id === "link-name")?.nodes.map((n) => n.target.join(" ")) ?? [], aria: nome?.getAttribute("aria-label") };
      });
      log(`[${ROTULO} ${motor} ${l}x${a} ${rota}] link-name: ${r.linkName.length ? "VIOLA " + r.linkName.join(", ") : "ok"}; violações A/AA: ${r.violacoes.length ? r.violacoes.join(", ") : "nenhuma"}; aria-label do link: ${r.aria ?? "(nenhum)"}`);
      await ctx.close();
    }
  }
  await nav.close();
}
