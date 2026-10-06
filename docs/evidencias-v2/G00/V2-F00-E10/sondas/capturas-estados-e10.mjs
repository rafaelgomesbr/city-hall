/**
 * Capturas dos ESTADOS da V2-F00-E10 que o e2e (`fluxo-api.e2e.mjs`, secao 27) nao
 * captura: verificando se a recuperacao esta ligada, enviando, salvando, falha do
 * servidor, recuperacao desligada vista pelo link, sucesso (com a ida automatica
 * para a entrada suspensa so para a foto) e o modo de demonstracao.
 *
 * Para a API real usa interceptacao de rota do Playwright nos estados de espera e de
 * falha, e por isso o navegador registra 500 e 503 no console DE PROPOSITO: este
 * roteiro nao confere erro de console (o conferido e o e2e). O sucesso usa um link
 * REAL, lido do arquivo do notificador de teste.
 *
 * Uso: BASE_WEB=... BASE_LOCAL=... NOTIFICADOR_ARQUIVO=... CAPTURAS_E10=pasta node este.mjs
 */
import * as playwright from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE_WEB ?? "http://localhost:4190";
const LOCAL = process.env.BASE_LOCAL ?? "http://localhost:4191";
const ARQUIVO = process.env.NOTIFICADOR_ARQUIVO;
const PASTA = process.env.CAPTURAS_E10;
mkdirSync(PASTA, { recursive: true });

const navegador = await playwright.chromium.launch();

async function capturar(pagina, nome, { cheia = true } = {}) {
  const original = pagina.viewportSize();
  for (const [largura, altura] of [[1280, 900], [390, 844]]) {
    for (const tema of ["claro", "escuro"]) {
      await pagina.setViewportSize({ width: largura, height: altura });
      await pagina.evaluate((t) => {
        document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light";
      }, tema);
      await pagina.waitForTimeout(150);
      await pagina.screenshot({ path: `${PASTA}/${nome}-${largura}-${tema}.png`, fullPage: cheia });
    }
  }
  await pagina.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await pagina.setViewportSize(original ?? { width: 1280, height: 900 });
}

const json = (status, corpo) => ({ status, contentType: "application/json", body: JSON.stringify(corpo) });

// ---- Pedido: verificando (a pergunta ao servidor demora) ----
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  let liberar;
  const segura = new Promise((r) => { liberar = r; });
  await pagina.route("**/auth/recuperacao", async (rota) => { await segura; await rota.fulfill(json(200, { ativa: true })); });
  await pagina.goto(`${BASE}/recuperar-senha`, { waitUntil: "domcontentloaded" });
  await pagina.getByText("Conferindo se a recuperação por email está ligada").waitFor({ timeout: 20_000 });
  await capturar(pagina, "pedido-verificando");
  liberar();
  await pagina.close();
}

// ---- Pedido: enviando (o servidor demora para responder) ----
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  let liberar;
  const segura = new Promise((r) => { liberar = r; });
  await pagina.route("**/auth/recuperar", async (rota) => {
    await segura;
    await rota.fulfill(json(202, { mensagem: "Se existir conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada." }));
  });
  await pagina.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
  await pagina.locator("#recuperar-email").fill("nome.sobrenome@orgao.exemplo.gov.br");
  await pagina.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await pagina.getByRole("button", { name: "Enviando" }).waitFor({ timeout: 10_000 });
  await capturar(pagina, "pedido-enviando");
  liberar();
  await pagina.close();
}

// ---- Pedido: falha do servidor (500) ----
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await pagina.route("**/auth/recuperar", (rota) => rota.fulfill(json(500, {
    erro: "erro_interno", mensagem: "Erro inesperado. Informe o código abaixo ao suporte.", requisicao: "req-1",
  })));
  await pagina.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
  await pagina.locator("#recuperar-email").fill("nome.sobrenome@orgao.exemplo.gov.br");
  await pagina.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await pagina.locator(".aviso--perigo").waitFor({ timeout: 10_000 });
  await capturar(pagina, "pedido-erro-servidor");
  await pagina.close();
}

// ---- Pedido: desligada descoberta so no pedido (503) ----
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await pagina.route("**/auth/recuperar", (rota) => rota.fulfill(json(503, {
    erro: "recuperacao_desligada", mensagem: "A recuperação de senha por email está desligada neste município.",
  })));
  await pagina.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
  await pagina.locator("#recuperar-email").fill("nome.sobrenome@orgao.exemplo.gov.br");
  await pagina.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await pagina.locator(".passos").waitFor({ timeout: 10_000 });
  await capturar(pagina, "pedido-desligada-pelo-pedido");
  await pagina.close();
}

// ---- Definir: salvando (o servidor demora) ----
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  let liberar;
  const segura = new Promise((r) => { liberar = r; });
  await pagina.route("**/auth/redefinir", async (rota) => {
    await segura;
    await rota.fulfill(json(401, { erro: "sessao_encerrada", mensagem: "Este link de redefinição não vale mais. Peça um novo." }));
  });
  await pagina.goto(`${BASE}/redefinir-senha?token=token-so-para-a-captura-de-estados-1234567`, { waitUntil: "networkidle" });
  await pagina.locator("#nova-senha").fill("uma-senha-bem-longa-qualquer");
  await pagina.locator("#repetir-senha").fill("uma-senha-bem-longa-qualquer");
  await pagina.getByRole("button", { name: "Definir nova senha" }).click();
  await pagina.getByRole("button", { name: "Salvando" }).waitFor({ timeout: 10_000 });
  await capturar(pagina, "definir-salvando");
  liberar();
  await pagina.close();
}

// ---- Definir: falha do servidor, rede e limite ----
for (const [nome, resposta] of [
  ["definir-erro-servidor", (rota) => rota.fulfill(json(500, { erro: "erro_interno", mensagem: "Erro inesperado.", requisicao: "req-2" }))],
  ["definir-erro-rede", (rota) => rota.abort("failed")],
  ["definir-erro-excesso", (rota) => rota.fulfill(json(429, { erro: "excesso_de_requisicoes", mensagem: "Requisições demais. Aguarde um instante." }))],
]) {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await pagina.route("**/auth/redefinir", resposta);
  await pagina.goto(`${BASE}/redefinir-senha?token=token-so-para-a-captura-de-estados-1234567`, { waitUntil: "networkidle" });
  await pagina.locator("#nova-senha").fill("uma-senha-bem-longa-qualquer");
  await pagina.locator("#repetir-senha").fill("uma-senha-bem-longa-qualquer");
  await pagina.getByRole("button", { name: "Definir nova senha" }).click();
  await pagina.locator(".aviso--perigo").waitFor({ timeout: 10_000 });
  await capturar(pagina, nome);
  await pagina.close();
}

// ---- Definir: recuperacao desligada vista pelo link (503 ao definir) ----
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await pagina.route("**/auth/redefinir", (rota) => rota.fulfill(json(503, {
    erro: "recuperacao_desligada", mensagem: "A recuperação de senha por email está desligada neste município.",
  })));
  await pagina.goto(`${BASE}/redefinir-senha?token=token-so-para-a-captura-de-estados-1234567`, { waitUntil: "networkidle" });
  await pagina.locator("#nova-senha").fill("uma-senha-bem-longa-qualquer");
  await pagina.locator("#repetir-senha").fill("uma-senha-bem-longa-qualquer");
  await pagina.getByRole("button", { name: "Definir nova senha" }).click();
  await pagina.locator(".passos").waitFor({ timeout: 10_000 });
  await capturar(pagina, "definir-desligada");
  await pagina.close();
}

// ---- Definir: sucesso, com um link REAL (a ida para a entrada fica suspensa so para a foto) ----
{
  const bruto = readFileSync(ARQUIVO, "utf8");
  const links = [...bruto.matchAll(/https?:\/\/\S*redefinir-senha\?token=\S+/g)].map((m) => m[0]);
  const jonas = bruto.split("---").filter((bloco) => bloco.includes("jonas.ferreira@")).at(-1);
  const link = jonas.match(/https?:\/\/\S*redefinir-senha\?token=\S+/)[0];
  if (!link || links.length === 0) throw new Error("sem link de teste para a captura de sucesso");

  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await pagina.addInitScript(() => {
    const original = window.setTimeout;
    // So o atraso de 2500 ms da ida para a entrada: o resto do relogio segue normal.
    window.setTimeout = (f, t, ...args) => (t === 2500 ? 0 : original(f, t, ...args));
  });
  await pagina.goto(`${BASE}/redefinir-senha?token=${encodeURIComponent(new URL(link).searchParams.get("token"))}`, { waitUntil: "networkidle" });
  await pagina.locator("#nova-senha").fill("jonas-senha-nova-2026-e10");
  await pagina.locator("#repetir-senha").fill("jonas-senha-nova-2026-e10");
  await pagina.getByRole("button", { name: "Definir nova senha" }).click();
  await pagina.locator(".aviso--sucesso").waitFor({ timeout: 20_000 });
  await capturar(pagina, "definir-sucesso");
  await pagina.close();
}

// ---- A tela de entrada: o link "Esqueceu a senha?" ganhou alvo de toque de 44 px ----
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await pagina.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await pagina.locator("#entrada-email").waitFor({ timeout: 30_000 });
  const altura = await pagina.getByRole("link", { name: "Esqueceu a senha?" }).evaluate((e) => Math.round(e.getBoundingClientRect().height));
  console.log(`entrada: altura do link Esqueceu a senha? = ${altura}px`);
  await capturar(pagina, "entrada-esqueceu-a-senha");
  await pagina.close();
}

// ---- Modo de demonstracao (build sem servidor) ----
{
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  await pagina.goto(`${LOCAL}/recuperar-senha`, { waitUntil: "networkidle" });
  await pagina.locator("#recuperar-email").waitFor({ timeout: 30_000 });
  const desligado = await pagina.getByRole("button", { name: "Enviar link de redefinição" }).isDisabled();
  console.log(`modo local: botao desligado = ${desligado}`);
  await capturar(pagina, "pedido-modo-demonstracao");
  await pagina.close();
}

await navegador.close();
console.log("capturas dos estados da E10 prontas");
