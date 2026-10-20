// Achado 1 da acessibilidade: todas as telas que usam `focar`, com os zooms de 200 e 400 por cento.
import { WEB, EMAILS, S, CAP, api, tokenDe, navegador, contexto, entrar, registro, aVista } from "./lib.mjs";
const ROTULO = process.env.ROTULO ?? "antes";
const log = registro(`${S}/saidas/telas-${ROTULO}.txt`);
const rita = await tokenDe(EMAILS.rita);
const SI = "senha-inicial-bem-comprida-2026";
let n = 0, ruins = 0, total = 0;
async function contaNova(motor) {
  n++;
  const email = `c6t.${motor}.${n}.${Date.now() % 100000}@serraalta.exemplo.gov.br`;
  const r = await api("/usuarios", { metodo: "POST", token: rita, corpo: { nome: `Telas ${motor} ${n}`, matricula: `C6T-${n}-${Date.now() % 10000}`, email, papel: "operador", senha: SI } });
  if (r.status >= 300) throw new Error(`criar: ${r.status}`);
  return { email, id: r.json.id };
}
const nome = (l, a, d) => `${l}x${a}${d > 1 ? "-dpr2" : ""}`;
const TAMS = (process.env.TAMS ?? "320x256,640x450x2,390x844,320x640,768x600,1280x600").split(",").map((t) => { const [l, a, d] = t.split("x").map(Number); return [l, a, d || 1]; });
const espera = (pg) => pg.waitForTimeout(600);
const CASOS = {
  "minha-conta": async (pg, motor) => {
    const { email } = await contaNova(motor); await entrar(pg, email, SI);
    await pg.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("senha-errada-desta-conta");
    await pg.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
    await pg.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
    const b = pg.getByRole("button", { name: "Trocar senha", exact: true }); await b.click();
    await pg.locator("#conta-senha-atual-erro").waitFor({ timeout: 20000 });
    await pg.waitForFunction((el) => !el.disabled, await b.elementHandle(), { timeout: 20000 });
  },
  "defina-a-senha": async (pg, motor) => {
    const { email, id } = await contaNova(motor);
    const t = (await api(`/usuarios/${id}/redefinir-senha`, { metodo: "POST", token: rita, corpo: {} })).json.senhaTemporaria;
    await pg.goto(`${WEB}/entrar`, { waitUntil: "networkidle" });
    await pg.locator("#entrada-email").fill(email); await pg.locator("#entrada-senha").fill(t);
    await pg.getByRole("button", { name: "Entrar", exact: true }).click();
    await pg.getByRole("heading", { name: "Defina a sua senha" }).waitFor({ timeout: 30000 });
    await pg.locator("#senha-nova-atual").fill("provisoria-digitada-errada");
    await pg.locator("#senha-nova").fill("frase-nova-do-teste-2026");
    await pg.locator("#senha-nova-repetida").fill("frase-nova-do-teste-2026");
    const b = pg.getByRole("button", { name: "Definir senha e entrar" }); await b.click();
    await pg.locator("#senha-nova-atual-erro").waitFor({ timeout: 20000 });
    await pg.waitForFunction((el) => !el.disabled, await b.elementHandle(), { timeout: 20000 });
  },
  "nova-ocorrencia": async (pg, motor) => {
    const { email } = await contaNova(motor); await entrar(pg, email, SI);
    await pg.goto(`${WEB}/ocorrencias/nova`, { waitUntil: "networkidle" });
    await pg.locator("#nova-solicitante").fill("Joana Prado");
    await pg.locator("#nova-solicitante").press("Enter");
    await pg.locator("#nova-endereco-erro").waitFor({ timeout: 10000 });
  },
  "usuarios": async (pg) => {
    await entrar(pg, EMAILS.rita);
    await pg.goto(`${WEB}/usuarios`, { waitUntil: "networkidle" });
    await pg.locator("#usuario-email").fill("alguem@serraalta.exemplo.gov.br");
    await pg.locator("#usuario-email").press("Enter");
    await pg.locator("#usuario-nome-erro").waitFor({ timeout: 10000 });
  },
  "ocorrencia-coordenada": async (pg) => {
    await entrar(pg, EMAILS.rita);
    await pg.goto(`${WEB}/ocorrencias/11111111-1111-4111-8111-0000000000c4`, { waitUntil: "networkidle" });
    const b = pg.getByRole("button", { name: /^(Corrigir|Informar) a coordenada$/ }).first();
    await b.scrollIntoViewIfNeeded(); await b.click();
    await espera(pg);
  },
  "quero-conhecer": async (pg) => {
    await pg.goto(`${WEB}/quero-conhecer`, { waitUntil: "networkidle" });
    await pg.locator("#ic-municipio").fill("Serra Alta");
    await pg.locator("#ic-uf").selectOption({ index: 1 }).catch(async () => { await pg.locator("#ic-uf").fill("MG"); });
    await pg.locator("#ic-email").fill("contato@serraalta.exemplo.gov.br");
    await pg.getByRole("button", { name: "Quero conhecer", exact: true }).click();
    await pg.locator("#ic-nome-erro").waitFor({ timeout: 10000 });
  },
};
const SO = process.env.CASOS ? process.env.CASOS.split(",") : Object.keys(CASOS);
for (const motor of (process.env.MOTORES ?? "chromium,firefox,webkit").split(",")) {
  const nav = await navegador(motor);
  for (const caso of SO) for (const [l, a, d] of TAMS) {
    const { ctx, pg } = await contexto(nav, { largura: l, altura: a, dpr: d });
    try {
      await CASOS[caso](pg, motor);
      await espera(pg);
      const m = await aVista(pg); total++; if (!m.ok) ruins++;
      log(`[${ROTULO} ${motor} ${caso} ${nome(l, a, d)}] ${m.ok ? "À VISTA" : "ESCONDIDO"} ${m.txt}`);
      if (process.env.CAPTURAS) await pg.screenshot({ path: `${CAP}/c6-${ROTULO}-${caso}-${nome(l, a, d)}-claro-${motor}.png` });
    } catch (e) { total++; ruins++; log(`[${ROTULO} ${motor} ${caso} ${nome(l, a, d)}] ERRO ${String(e.message).split("\n")[0]}`); }
    await ctx.close();
  }
  await nav.close();
}
log(`[${ROTULO}] resumo: ${total - ruins} de ${total} à vista`);
