import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { conferirSenha } from "../../api/src/auth/senha.js";
import { DONO, cadastrarPrefeitura, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste } from "./apoio/console-de-teste.js";

/**
 * Restaurar o acesso do administrador de um município (migração 054, decisão
 * H06 B), num NAVEGADOR DE VERDADE, com a política de segurança de conteúdo
 * valendo. Mesmo desenho de `no-navegador.test.ts`: servidor de teste numa
 * porta de verdade, Chromium do Playwright, e qualquer erro de console, de
 * página ou violação de política derruba o caso.
 *
 * O que só o navegador mostra: o modal abre com foco dentro e a página atrás
 * inerte, o botão de agir é do tipo destrutivo, a senha temporária aparece
 * no cartão, Escape NÃO fecha enquanto ela está à vista (só o botão de
 * concluir), e ao concluir a senha sai do documento.
 *
 * CAPTURAS: com `CAPTURAS_RESTAURAR=<pasta>`, o caso grava capturas de tela do
 * modal nos dois temas, em largura de notebook e de celular. Sem a variável,
 * não grava nada (teste não escreve na árvore do repositório).
 */

let c: ConsoleDeTeste;
let base: string;
let navegador: Browser;
let pagina: Page;
let rioVerde: { organizacaoId: string; usuarioId: string };
const problemas: string[] = [];
const PASTA_DE_CAPTURAS = process.env.CAPTURAS_RESTAURAR ?? "";

async function capturar(nome: string): Promise<void> {
  if (!PASTA_DE_CAPTURAS) return;
  mkdirSync(PASTA_DE_CAPTURAS, { recursive: true });
  /* As entradas da página têm transição curta; a captura espera ela terminar. */
  await pagina.waitForTimeout(700);
  await pagina.screenshot({ path: join(PASTA_DE_CAPTURAS, `${nome}.png`), fullPage: false });
}

/**
 * Troca o tema pelo mesmo atributo que o botão do topo escreve. Com o modal
 * aberto o topo está `inert` (é o que o modal promete), então clicar no botão
 * não é possível, e é por isso que a captura do segundo tema escreve o
 * atributo direto.
 */
async function usarTema(tema: "claro" | "escuro"): Promise<void> {
  await pagina.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t === "escuro" ? "dark" : "light");
  }, tema);
}

beforeAll(async () => {
  c = await subirConsoleDeTeste();
  const tokenDoDono = await c.entrar(DONO.email, DONO.senha, c.segredoDoDono);
  rioVerde = await cadastrarPrefeitura(c.app, tokenDoDono, "Rio Verde");

  base = await c.app.listen({ port: 0, host: "127.0.0.1" });

  const { chromium } = await import("playwright");
  navegador = await chromium.launch();
  pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  pagina.on("pageerror", (e) => problemas.push(`erro de pagina: ${e.message}`));
  pagina.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problemas.push(`console ${m.type()}: ${m.text()}`);
  });
  pagina.on("requestfailed", (r) => problemas.push(`pedido falhou: ${r.url()} ${r.failure()?.errorText}`));
}, 240_000);

afterAll(async () => {
  await navegador?.close();
  await c?.encerrar();
});

describe("Restaurar o acesso do administrador, no navegador", () => {
  it("o dono entra e a linha ativa oferece Restaurar acesso", async () => {
    await pagina.goto(base + "/", { waitUntil: "networkidle" });
    await pagina.fill("#email", DONO.email);
    await pagina.fill("#senha", DONO.senha);
    await pagina.click("#continuar");
    await pagina.waitForSelector("#forma-codigo:not([hidden])", { timeout: 30_000 });
    await pagina.fill("#codigo", codigoNovo(c.relogio, c.segredoDoDono));
    await pagina.click("#entrar");
    await pagina.waitForSelector("#painel:not([hidden])", { timeout: 30_000 });

    const linha = pagina.locator("#linhas tr", { hasText: "Rio Verde (MG)" });
    await expect.poll(() => linha.count()).toBe(1);
    expect(await linha.getByRole("button", { name: "Restaurar acesso" }).isVisible()).toBe(true);
    await usarTema("claro");
    await capturar("01-claro-1280-linha-com-restaurar-acesso");
  }, 90_000);

  it("o modal abre com foco dentro, página atrás inerte, histórico vazio e botão destrutivo", async () => {
    const linha = pagina.locator("#linhas tr", { hasText: "Rio Verde (MG)" });
    await linha.getByRole("button", { name: "Restaurar acesso" }).click();
    await pagina.waitForSelector("#dialogo-restaurar:not([hidden])");

    expect(await pagina.locator("#restaurar-titulo").textContent()).toBe(
      "Restaurar o acesso do administrador de Rio Verde (MG)");
    expect(await pagina.locator("#restaurar-agir-texto").textContent()).toBe(
      "Restaurar o acesso do administrador de Rio Verde");
    expect(await pagina.evaluate(() => document.activeElement?.id ?? "")).toBe("restaurar-cartao");
    expect(await pagina.locator("#principal").getAttribute("inert")).not.toBeNull();
    await expect.poll(() => pagina.locator("#restaurar-historico").textContent())
      .toBe("Nenhuma restauração anterior neste município.");
    expect(await pagina.locator("#restaurar-agir").getAttribute("class")).toContain("botao-perigo");

    /* Motivo curto: a tela aponta antes de gastar o código. */
    await pagina.fill("#restaurar-email", "rita@rioverde.mg.gov.br");
    await pagina.fill("#restaurar-senha", DONO.senha);
    await pagina.fill("#restaurar-codigo", "123456");
    await pagina.fill("#restaurar-motivo", "curto");
    await pagina.click("#restaurar-agir");
    await expect.poll(() => pagina.locator("#recado-restaurar-texto").textContent())
      .toContain("pelo menos 10 caracteres");

    await capturar("02-claro-1280-modal-com-recado");
    await usarTema("escuro");
    await capturar("03-escuro-1280-modal-com-recado");
    await pagina.setViewportSize({ width: 390, height: 844 });
    await capturar("04-escuro-390-modal-com-recado");
    await usarTema("claro");
    await capturar("05-claro-390-modal-com-recado");
    await pagina.setViewportSize({ width: 1280, height: 900 });
  }, 60_000);

  it("com tudo certo, a senha aparece uma vez, Escape não fecha, e concluir a tira do documento", async () => {
    await pagina.fill("#restaurar-email", "rita@rioverde.mg.gov.br");
    await pagina.fill("#restaurar-senha", DONO.senha);
    await pagina.fill("#restaurar-codigo", codigoNovo(c.relogio, c.segredoDoDono));
    await pagina.fill("#restaurar-motivo", "Chamado 77: administradora sem acesso, identidade conferida por videochamada");
    await pagina.click("#restaurar-agir");

    await pagina.waitForSelector("#restaurar-entregue:not([hidden])", { timeout: 60_000 });
    expect(await pagina.locator("#forma-restaurar").isHidden()).toBe(true);
    const senha = (await pagina.locator("#senha-restaurada").textContent()) ?? "";
    expect(senha.length).toBeGreaterThanOrEqual(12);
    expect(await pagina.locator("#restaurar-validade").textContent()).toMatch(
      /^Vale até \d{2}\/\d{2} às \d{2}:\d{2} e exige senha nova na primeira entrada\. 0 sessões encerradas\./);

    const linhaNoBanco = (await c.mem.bruto.query<{ senha_hash: string; senha_provisoria_ate: string | null }>(
      "SELECT senha_hash, senha_provisoria_ate FROM usuarios WHERE id = $1", [rioVerde.usuarioId],
    )).rows[0]!;
    expect(await conferirSenha(senha, linhaNoBanco.senha_hash), "a senha da tela não é a gravada").toBe(true);
    expect(linhaNoBanco.senha_provisoria_ate).not.toBeNull();

    await capturar("06-claro-1280-senha-temporaria");
    await usarTema("escuro");
    await capturar("07-escuro-1280-senha-temporaria");
    await pagina.setViewportSize({ width: 390, height: 844 });
    await capturar("08-escuro-390-senha-temporaria");
    await usarTema("claro");
    await capturar("09-claro-390-senha-temporaria");
    await pagina.setViewportSize({ width: 1280, height: 900 });

    /* Escape com a senha à vista não fecha. */
    await pagina.locator("#restaurar-cartao").focus();
    await pagina.keyboard.press("Escape");
    expect(await pagina.locator("#dialogo-restaurar").isVisible(), "Escape fechou a senha temporária").toBe(true);

    await pagina.click("#restaurar-concluir");
    await pagina.waitForSelector("#dialogo-restaurar", { state: "hidden" });
    expect(await pagina.locator("#senha-restaurada").textContent()).toBe("");
    expect(await pagina.locator("#principal").getAttribute("inert")).toBeNull();
    const html = await pagina.content();
    expect(html, "a senha temporária ficou no documento depois de concluir").not.toContain(senha);
  }, 120_000);

  it("reabrir mostra a restauração no histórico, e o caminho inteiro não produziu erro", async () => {
    const linha = pagina.locator("#linhas tr", { hasText: "Rio Verde (MG)" });
    await linha.getByRole("button", { name: "Restaurar acesso" }).click();
    await pagina.waitForSelector("#dialogo-restaurar:not([hidden])");
    await expect.poll(() => pagina.locator("#restaurar-historico").textContent())
      .toMatch(/^1 restauração anterior\. A última em \d{2}\/\d{2} às \d{2}:\d{2}, por dona@fornecedor\.com\.br: Chamado 77/);
    await capturar("10-claro-1280-historico");
    await pagina.keyboard.press("Escape");
    await pagina.waitForSelector("#dialogo-restaurar", { state: "hidden" });

    expect(
      problemas,
      "o navegador reclamou durante o fluxo (erro de console, de pagina, pedido falhado "
      + "ou violacao da politica de seguranca de conteudo)",
    ).toEqual([]);
  }, 60_000);
});
