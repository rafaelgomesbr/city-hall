/**
 * Capturas da rodada de conserto (correcao 2, terceira passada) de V2-F00-E09 e V2-F00-E10:
 * a confirmação que recebe o foco (Minha conta depois de encerrar; senha redefinida;
 * pedido de recuperação enviado), em 320, 390 e 1280 px, claro e escuro.
 *
 *   BASE_WEB=... BASE_API=... ROTULO=depois-2 SAIDA=pasta NOTIFICADOR_ARQUIVO=arquivo \
 *     node capturar-rodada.mjs
 *
 * Os envios são feitos pelo TECLADO (Enter), porque é o teclado que mostra o anel de foco
 * (:focus-visible) na confirmação, e é para quem usa teclado que o foco importa.
 * Cria por API uma coordenadora e uma pessoa para recuperar a senha, com e-mail único.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../../../dc360/apps/web/package.json", import.meta.url));
const { chromium } = require("playwright");

const BASE = process.env.BASE_WEB, API = process.env.BASE_API, ROTULO = process.env.ROTULO;
const SAIDA = process.env.SAIDA, ARQ = process.env.NOTIFICADOR_ARQUIVO;
const SENHA = "defesa-civil-2026", SENHA_C = "senha-provisoria-do-teste-1";
const LARGURAS = [320, 390, 1280];
const TEMAS = ["claro", "escuro"];
mkdirSync(`${SAIDA}/${ROTULO}`, { recursive: true });
const sufixo = Date.now().toString(36);
const eventos = [];

async function viaApi(caminho, { metodo = "GET", token, corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { ...(corpo ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function fotografar(pg, nome, largura, tema, cheia = true) {
  // Página inteira SEM `fullPage`: a janela ganha a altura do conteúdo. Com `fullPage` a
  // barra do topo e a do pé (fixas) apareciam no meio da imagem, um artefato da captura.
  await pg.setViewportSize({ width: largura, height: largura <= 390 ? 844 : 900 });
  await pg.evaluate((t) => { document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light"; }, tema);
  await pg.waitForTimeout(150);
  if (cheia) {
    const alt = await pg.evaluate(() => document.documentElement.scrollHeight);
    await pg.setViewportSize({ width: largura, height: Math.max(alt, 600) });
    await pg.waitForTimeout(150);
  }
  await pg.screenshot({ path: `${SAIDA}/${ROTULO}/${nome}-${ROTULO}-${largura}-${tema}.png` });
}

const rita = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
const criar = (nome, mat, email, papel, senha) => viaApi("/usuarios", {
  metodo: "POST", token: rita.json.acesso,
  corpo: { nome, matricula: mat, email, papel, equipeId: null, senha },
});
const emailC = `coordenacao.${sufixo}@serraalta.exemplo.gov.br`;
const c = await criar("Coordenadora de Teste de Layout", `CO-${sufixo}`.toUpperCase(), emailC, "coordenador", SENHA_C);
const emailR = `recupera.${sufixo}@serraalta.exemplo.gov.br`;
const r = await criar("Pessoa de Teste da Recuperação", `RC-${sufixo}`.toUpperCase(), emailR, "operador", "senha-provisoria-do-teste-2");
console.log("criadas", c.status, r.status);

const nav = await chromium.launch();
const ctx = await nav.newContext({ locale: "pt-BR" });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => eventos.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error") eventos.push(`console: ${m.text()}`); });

// ---------------- E09 ----------------
await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: emailC, senha: SENHA_C } });
await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.locator("#entrada-email").fill(emailC);
await pg.locator("#entrada-senha").fill(SENHA_C);
await pg.getByRole("button", { name: "Entrar", exact: true }).click();
await pg.waitForSelector(".cabecalho-pagina h1", { timeout: 30000 });
await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
await pg.getByRole("button", { name: "Encerrar minhas outras sessões" }).waitFor({ timeout: 30000 });
// depois de encerrar, a 320 e 390 px (cada largura com sessões novas)
for (const l of [320, 390, 1280]) {
  await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: emailC, senha: SENHA_C } });
  await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: emailC, senha: SENHA_C } });
  await pg.setViewportSize({ width: l, height: 844 });
  await pg.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await pg.reload({ waitUntil: "networkidle" });
  const botao = pg.getByRole("button", { name: "Encerrar minhas outras sessões" });
  await botao.waitFor({ timeout: 30000 });
  await botao.focus();
  await pg.keyboard.press("Enter");
  const janela = pg.getByRole("dialog");
  await janela.waitFor({ timeout: 10000 });
  await janela.getByRole("button", { name: /^Encerrar (a outra sessão|as outras \d+ sessões)$/ }).press("Enter");
  await pg.locator(".aviso--sucesso").waitFor({ timeout: 20000 });
  await botao.waitFor({ state: "detached", timeout: 20000 });
  await pg.waitForTimeout(400);
  const foco = await pg.evaluate(() => {
    const a = document.activeElement;
    return `${a?.tagName} class=${a?.className} tabindex=${a?.getAttribute("tabindex")} role=${a?.getAttribute("role")} "${(a?.textContent ?? "").trim().slice(0, 50)}"`;
  });
  console.log(`${ROTULO} ${l} px foco depois de encerrar: ${foco}`);
  for (const t of TEMAS) await fotografar(pg, "E09-minha-conta-depois-de-encerrar", l, t);
}

// ---------------- E10 ----------------
const ctx2 = await nav.newContext({ locale: "pt-BR" });
const p2 = await ctx2.newPage();
p2.on("pageerror", (e) => eventos.push(`pageerror: ${e.message}`));
p2.on("console", (m) => { if (m.type() === "error") eventos.push(`console: ${m.text()}`); });
const havia = (readFileSync(ARQ, "utf8").match(/redefinir-senha\?token=/g) ?? []).length;
await p2.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
await p2.locator("#recuperar-email").fill(emailR);
await p2.locator("#recuperar-email").press("Enter");
await p2.waitForSelector(".aviso--sucesso", { timeout: 20000 });
await p2.waitForTimeout(300);
console.log(`${ROTULO} E10 foco depois de enviar o pedido: ${await p2.evaluate(() => { const a = document.activeElement; return `${a?.tagName} class=${a?.className} tabindex=${a?.getAttribute("tabindex")} role=${a?.getAttribute("role")}`; })}`);
for (const l of LARGURAS) for (const t of TEMAS) await fotografar(p2, "E10-pedido-enviado", l, t, false);
let link = null;
for (let i = 0; i < 50 && !link; i++) {
  const todos = [...readFileSync(ARQ, "utf8").matchAll(/https?:\/\/\S*redefinir-senha\?token=\S+/g)].map((m) => m[0]);
  if (todos.length > havia) link = todos.at(-1);
  else await p2.waitForTimeout(200);
}
const token = new URL(link).searchParams.get("token");
await p2.goto(`${BASE}/redefinir-senha?token=${encodeURIComponent(token)}`);
await p2.waitForSelector("#nova-senha", { timeout: 30000 });
await p2.locator("#nova-senha").fill("recuperada-senha-nova-2026");
await p2.locator("#repetir-senha").fill("recuperada-senha-nova-2026");
await p2.locator("#repetir-senha").press("Enter");
await p2.waitForSelector(".aviso--sucesso", { timeout: 20000 });
await p2.waitForTimeout(300);
console.log(`${ROTULO} E10 foco depois de redefinir: ${await p2.evaluate(() => { const a = document.activeElement; return `${a?.tagName} class=${a?.className} tabindex=${a?.getAttribute("tabindex")} role=${a?.getAttribute("role")}`; })}`);
console.log(`${ROTULO} E10 ações na tela de sucesso: ${await p2.locator(".entrada a, .entrada button").count()}`);
for (const l of LARGURAS) for (const t of TEMAS) await fotografar(p2, "E10-senha-redefinida", l, t);
await p2.waitForTimeout(5000);
console.log(`${ROTULO} E10: 5 s depois do sucesso a URL é ${new URL(p2.url()).pathname}; confirmação na tela: ${await p2.locator(".aviso--sucesso").count()}`);
console.log(`${ROTULO} eventos de console: ${eventos.length ? eventos.join(" | ") : "nenhum"}`);
await nav.close();
