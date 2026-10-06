/**
 * Capturas dos ESTADOS da V2-F00-E09 que o fluxo feliz do e2e nao alcanca:
 * carregando, erro de leitura, erro ao gravar, leitura da contagem que falha e o
 * modo de demonstracao. Para a API usa interceptacao de rota do Playwright, e por
 * isso o navegador registra respostas 500 no console DE PROPOSITO: este roteiro
 * nao confere erro de console (o e2e conferido e o de `fluxo-api.e2e.mjs`).
 *
 * Uso: BASE_WEB=... BASE_LOCAL=... CAPTURAS_E09=pasta node test/.estados-e09.mjs
 */
import * as playwright from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_WEB ?? "http://localhost:4180";
const LOCAL = process.env.BASE_LOCAL ?? "http://localhost:4181";
const PASTA = process.env.CAPTURAS_E09;
mkdirSync(PASTA, { recursive: true });
const SENHA = "defesa-civil-2026";

const navegador = await playwright.chromium.launch();

async function capturar(pagina, nome, { cheia = false, alvo = null } = {}) {
  const original = pagina.viewportSize();
  for (const [largura, altura] of [[1280, 900], [390, 844]]) {
    for (const tema of ["claro", "escuro"]) {
      await pagina.setViewportSize({ width: largura, height: altura });
      await pagina.evaluate((t) => {
        document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light";
      }, tema);
      if (alvo) await alvo.evaluate((e) => e.scrollIntoView({ block: "center" }));
      await pagina.waitForTimeout(150);
      await pagina.screenshot({ path: `${PASTA}/${nome}-${largura}-${tema}.png`, fullPage: cheia });
    }
  }
  await pagina.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await pagina.setViewportSize(original);
}

async function entrar(pagina, email) {
  await pagina.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await pagina.locator("#entrada-email").fill(email);
  await pagina.locator("#entrada-senha").fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
  await pagina.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
}

// ---- Minha conta: carregando e erro de leitura ---------------------------
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await entrar(pagina, "rita.lopes@serraalta.exemplo.gov.br");

  let liberar;
  const segura = new Promise((r) => { liberar = r; });
  await pagina.route("**/auth/sessoes", async (rota) => { await segura; await rota.abort().catch(() => {}); });
  await pagina.goto(`${BASE}/minha-conta`, { waitUntil: "domcontentloaded" });
  await pagina.getByText("Carregando as suas sessões").waitFor({ timeout: 20_000 });
  await pagina.locator(".sessoes, .carregando").first().scrollIntoViewIfNeeded();
  await capturar(pagina, "minha-conta-sessoes-carregando", { alvo: pagina.getByText("Carregando as suas sessões") });
  liberar();
  await pagina.unroute("**/auth/sessoes");

  await pagina.route("**/auth/sessoes", (rota) => rota.fulfill({
    status: 500, contentType: "application/json",
    body: JSON.stringify({ erro: "interno", mensagem: "O servidor não conseguiu responder agora. Tente de novo em instantes." }),
  }));
  await pagina.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
  await pagina.getByRole("button", { name: "Tentar de novo" }).waitFor({ timeout: 20_000 });
  await pagina.getByRole("button", { name: "Tentar de novo" }).scrollIntoViewIfNeeded();
  await capturar(pagina, "minha-conta-sessoes-erro", { alvo: pagina.getByRole("button", { name: "Tentar de novo" }) });
  await pagina.close();
}

// ---- Usuarios: erro ao gravar e leitura da contagem que falha ----------------
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await entrar(pagina, "rita.lopes@serraalta.exemplo.gov.br");
  await pagina.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
  await pagina.waitForSelector(".tabela tbody tr");
  const linha = pagina.locator("tbody tr", { hasText: "jonas.ferreira@" });

  await pagina.route("**/usuarios/*/sessoes", (rota) => rota.fulfill({
    status: 500, contentType: "application/json",
    body: JSON.stringify({ erro: "interno", mensagem: "falha" }),
  }));
  await pagina.route("**/usuarios/*/encerrar-sessoes", (rota) => rota.fulfill({
    status: 500, contentType: "application/json",
    body: JSON.stringify({ erro: "interno", mensagem: "O servidor não conseguiu encerrar as sessões agora. Nada foi alterado. Tente de novo." }),
  }));
  await linha.getByRole("button", { name: "Encerrar sessões" }).click();
  await pagina.getByText(/Não foi possível conferir quantas sessões/).waitFor({ timeout: 10_000 });
  await capturar(pagina, "usuarios-confirmar-encerrar-sem-contagem");
  await pagina.getByRole("dialog").getByRole("button", { name: /^Encerrar sessões de/ }).click();
  await pagina.getByRole("dialog").locator(".aviso--perigo").waitFor({ timeout: 10_000 });
  await capturar(pagina, "usuarios-confirmar-encerrar-erro");
  await pagina.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

  await pagina.route("**/usuarios/*/redefinir-senha", (rota) => rota.fulfill({
    status: 422, contentType: "application/json",
    body: JSON.stringify({ erro: "autoredefinicao", mensagem: "Para trocar a sua própria senha use Minha conta, onde a senha atual é exigida. Esta tela redefine a senha de outra pessoa." }),
  }));
  await linha.getByRole("button", { name: "Redefinir senha" }).click();
  await pagina.getByRole("dialog").getByRole("button", { name: /^Redefinir a senha de/ }).click();
  await pagina.getByRole("dialog").locator(".aviso--perigo").waitFor({ timeout: 10_000 });
  await capturar(pagina, "usuarios-confirmar-redefinir-erro");
  await pagina.close();
}

// ---- Modo de demonstracao: explica em vez de oferecer -------------------------
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await pagina.goto(LOCAL, { waitUntil: "networkidle" });
  await pagina.waitForSelector(".conta", { timeout: 90_000 });
  await pagina.getByRole("button", { name: /Helena Vasques Coutinho/ }).click();
  await pagina.getByRole("link", { name: "Usuários" }).waitFor({ timeout: 120_000 });
  await pagina.getByRole("link", { name: "Usuários" }).click();
  await pagina.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
  const botoes = await pagina.getByRole("button", { name: /Redefinir senha|Encerrar sessões/ }).count();
  console.log(`modo local: botoes de sessao na lista = ${botoes}`);
  await pagina.getByText("não há senha para redefinir nem sessão para encerrar").scrollIntoViewIfNeeded();
  await capturar(pagina, "usuarios-modo-demonstracao", { alvo: pagina.getByText("não há senha para redefinir nem sessão para encerrar") });
  await pagina.getByRole("link", { name: "Minha conta" }).or(pagina.locator(".identidade--acionavel")).first().click();
  await pagina.getByText("Minhas sessões").waitFor({ timeout: 20_000 });
  await pagina.getByText("Minhas sessões").scrollIntoViewIfNeeded();
  await capturar(pagina, "minha-conta-modo-demonstracao", { alvo: pagina.getByText("Minhas sessões") });
  await pagina.close();
}

await navegador.close();
console.log("capturas de estados prontas");
