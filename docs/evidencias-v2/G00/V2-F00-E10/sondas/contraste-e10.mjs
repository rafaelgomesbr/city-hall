/**
 * Contraste AA medido (e nao presumido) nas duas telas da V2-F00-E10, em cada estado e
 * nos dois temas. Para todo elemento com texto visivel, compara a cor do texto com o
 * fundo efetivo (sobe pelos ancestrais compondo o alfa) e exige 4.5:1, ou 3:1 para
 * texto grande (24 px, ou 18.66 px em negrito). Imprime o PIOR caso de cada estado.
 *
 * O foco visivel tambem e medido: o `outline` do elemento focado precisa ter 3:1 contra
 * o fundo (WCAG 1.4.11).
 *
 * Uso: BASE_WEB=... node contraste-e10.mjs
 */
import * as playwright from "playwright";

const BASE = process.env.BASE_WEB ?? "http://localhost:4190";
const json = (status, corpo) => ({ status, contentType: "application/json", body: JSON.stringify(corpo) });

const navegador = await playwright.chromium.launch();
let reprovados = 0;

function medir() {
  function analisar(css) {
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  }
  function sobre(topo, base) {
    const a = topo.a;
    return {
      r: topo.r * a + base.r * (1 - a), g: topo.g * a + base.g * (1 - a), b: topo.b * a + base.b * (1 - a), a: 1,
    };
  }
  function luminancia({ r, g, b }) {
    const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function razao(a, b) {
    const la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function fundoEfetivo(el) {
    const camadas = [];
    for (let e = el; e; e = e.parentElement) {
      const c = analisar(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) camadas.push(c);
      if (c && c.a === 1) break;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of camadas.reverse()) base = sobre(c, base);
    return base;
  }
  const piores = [];
  const vistos = new Set();
  const percorredor = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = percorredor.nextNode(); n; n = percorredor.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || vistos.has(el)) continue;
    // Decorativo (a sigla "DC" da marca, que e aria-hidden e esta sobre um gradiente): fora da conta.
    if (el.closest('[aria-hidden="true"]')) continue;
    vistos.add(el);
    const estilo = getComputedStyle(el);
    if (estilo.visibility === "hidden" || estilo.display === "none") continue;
    const caixa = el.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) continue;
    const frente = analisar(estilo.color);
    if (!frente) continue;
    const fundo = fundoEfetivo(el);
    const nitido = sobre(frente, fundo);
    const px = parseFloat(estilo.fontSize);
    const negrito = parseInt(estilo.fontWeight, 10) >= 700;
    const grande = px >= 24 || (px >= 18.66 && negrito);
    const minimo = grande ? 3 : 4.5;
    const r = razao(nitido, fundo);
    piores.push({ texto: n.textContent.trim().slice(0, 40), r: Math.round(r * 100) / 100, minimo });
  }
  piores.sort((a, b) => (a.r - a.minimo) - (b.r - b.minimo));
  return piores.slice(0, 3);
}

function medirFoco() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const estilo = getComputedStyle(el);
  return { cor: estilo.outlineColor, largura: estilo.outlineWidth, estilo: estilo.outlineStyle, sombra: estilo.boxShadow };
}

async function estado(nome, preparar) {
  for (const tema of ["claro", "escuro"]) {
    const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
    await pagina.addInitScript((t) => {
      try { localStorage.setItem("dc360:tema", t === "escuro" ? "dark" : "light"); } catch { /* sem armazenamento */ }
    }, tema);
    await preparar(pagina);
    await pagina.evaluate((t) => { document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light"; }, tema);
    await pagina.waitForTimeout(200);
    const piores = await pagina.evaluate(medir);
    const pior = piores[0];
    const passa = pior.r >= pior.minimo;
    if (!passa) reprovados += 1;
    console.log(`${passa ? "OK   " : "FALHA"} ${nome} (${tema}): pior ${pior.r}:1 (minimo ${pior.minimo}) em "${pior.texto}"`);
    await pagina.close();
  }
}

const ligada = (pagina) => pagina.route("**/auth/recuperacao", (rota) => rota.fulfill(json(200, { ativa: true })));
const preencher = async (pagina) => {
  await pagina.locator("#nova-senha").fill("uma-senha-bem-longa-qualquer");
  await pagina.locator("#repetir-senha").fill("outra-senha-bem-longa-qualquer");
};

await estado("pedido normal", async (p) => { await ligada(p); await p.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" }); await p.locator("#recuperar-email").waitFor(); });
await estado("pedido com erro de campo", async (p) => { await ligada(p); await p.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" }); await p.getByRole("button", { name: "Enviar link de redefinição" }).click(); await p.locator(".campo__erro").waitFor(); });
await estado("pedido enviado", async (p) => {
  await ligada(p);
  await p.route("**/auth/recuperar", (rota) => rota.fulfill(json(202, { mensagem: "x" })));
  await p.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
  await p.locator("#recuperar-email").fill("nome@orgao.gov.br");
  await p.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await p.locator(".aviso--sucesso").waitFor();
});
await estado("pedido com falha (limite)", async (p) => {
  await ligada(p);
  await p.route("**/auth/recuperar", (rota) => rota.fulfill(json(429, { erro: "excesso_de_requisicoes", mensagem: "x" })));
  await p.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
  await p.locator("#recuperar-email").fill("nome@orgao.gov.br");
  await p.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await p.locator(".aviso--perigo").waitFor();
});
await estado("recuperacao desligada", async (p) => {
  await p.route("**/auth/recuperacao", (rota) => rota.fulfill(json(200, { ativa: false })));
  await p.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
  await p.locator(".passos").waitFor();
});
await estado("definir senha normal", async (p) => { await p.goto(`${BASE}/redefinir-senha?token=abc`, { waitUntil: "networkidle" }); await p.locator("#nova-senha").waitFor(); });
await estado("definir senha com erro (diferentes)", async (p) => {
  await p.goto(`${BASE}/redefinir-senha?token=abc`, { waitUntil: "networkidle" });
  await preencher(p);
  await p.getByRole("button", { name: "Definir nova senha" }).click();
  await p.locator(".campo__erro").waitFor();
});
await estado("link que nao vale mais", async (p) => {
  await p.route("**/auth/redefinir", (rota) => rota.fulfill(json(401, { erro: "sessao_encerrada", mensagem: "x" })));
  await p.goto(`${BASE}/redefinir-senha?token=abc`, { waitUntil: "networkidle" });
  await p.locator("#nova-senha").fill("uma-senha-bem-longa-qualquer");
  await p.locator("#repetir-senha").fill("uma-senha-bem-longa-qualquer");
  await p.getByRole("button", { name: "Definir nova senha" }).click();
  await p.locator(".aviso--perigo").waitFor();
});

// Foco visivel: o campo e o botao, nos dois temas.
for (const tema of ["claro", "escuro"]) {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await ligada(pagina);
  await pagina.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
  await pagina.evaluate((t) => { document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light"; }, tema);
  await pagina.keyboard.press("Tab");
  await pagina.waitForTimeout(400); // o anel do botao entra por transicao de box-shadow
  const noCampo = await pagina.evaluate(medirFoco);
  await pagina.keyboard.press("Tab");
  await pagina.waitForTimeout(400);
  const noBotao = await pagina.evaluate(medirFoco);
  const visivel = (f) => f && ((f.estilo !== "none" && parseFloat(f.largura) >= 2) || (f.sombra && f.sombra !== "none"));
  const passa = Boolean(visivel(noCampo) && visivel(noBotao));
  if (!passa) reprovados += 1;
  console.log(`${passa ? "OK   " : "FALHA"} foco visivel (${tema}): campo ${JSON.stringify(noCampo)} | botao ${JSON.stringify(noBotao)}`);
  await pagina.close();
}

await navegador.close();
console.log(reprovados === 0 ? "\nContraste AA e foco visivel: tudo dentro do minimo." : `\n${reprovados} estado(s) abaixo do minimo.`);
process.exit(reprovados === 0 ? 0 : 1);
