import { WEB, EMAILS, navegador, contexto, entrar } from "./lib.mjs";
const nav = await navegador("chromium");
const { ctx, pg } = await contexto(nav, { largura: 320, altura: 640 });
let rota = "";
pg.on("response", (r) => { if (r.status() >= 400) console.log(rota, r.status(), r.url()); });
await entrar(pg, EMAILS.rita);
for (rota of ["/painel", "/meu-trabalho", "/minha-conta", "/ocorrencias", "/ocorrencias/nova", "/ocorrencias/11111111-1111-4111-8111-0000000000c4", "/mapa", "/quem-esta-em-campo", "/equipes", "/orgaos", "/usuarios", "/auditoria", "/organizacao"]) {
  await pg.goto(`${WEB}${rota}`, { waitUntil: "networkidle" }); await pg.waitForTimeout(300);
  console.log(rota, "largura", await pg.evaluate(() => document.documentElement.scrollWidth), "h1", await pg.locator("h1").first().textContent().catch(() => "-"));
}
await nav.close();
