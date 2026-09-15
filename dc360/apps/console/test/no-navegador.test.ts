import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { DONO, cadastrarPrefeitura, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste } from "./apoio/console-de-teste.js";

/**
 * O fluxo de eliminar e cancelar num NAVEGADOR DE VERDADE, com a política de
 * segurança de conteúdo valendo.
 *
 * POR QUE ESTE ARQUIVO EXISTE além de `a-tela-responde.test.ts`: o DOM de
 * mentira de lá mede comportamento (o botão trava, o pedido sai com o corpo
 * certo, a linha muda), e não mede o que só o navegador sabe: se a política
 * `script-src 'self'; style-src 'self'` deixou o script rodar e a folha
 * pintar, se o `inert` de verdade tirou a página de trás do alcance, se o
 * diálogo abre com foco dentro, se um `<rect>` desenhado por
 * `createElementNS` aparece. Os três defeitos que a frente anterior do
 * console encontrou só apareceram abrindo a página, e este arquivo é o que
 * faz "abrir a página" ser parte da suíte.
 *
 * O servidor é o de teste, ESCUTANDO numa porta de verdade (e não `inject`):
 * a política de segurança de conteúdo é um cabeçalho, e cabeçalho só vale
 * quando um navegador o lê. Qualquer erro de console, erro de página ou
 * violação de política derruba o caso, e é isso que ele mede.
 *
 * Roda no Chromium do Playwright já instalado para o painel e para a API
 * (`npx playwright install chromium`, uma vez por máquina).
 */

let c: ConsoleDeTeste;
let base: string;
let navegador: Browser;
let pagina: Page;
let serraAlta: string;
const problemas: string[] = [];

beforeAll(async () => {
  c = await subirConsoleDeTeste();
  const tokenDoDono = await c.entrar(DONO.email, DONO.senha, c.segredoDoDono);
  serraAlta = (await cadastrarPrefeitura(c.app, tokenDoDono, "Serra Alta")).organizacaoId;

  base = await c.app.listen({ port: 0, host: "127.0.0.1" });

  const { chromium } = await import("playwright");
  navegador = await chromium.launch();
  pagina = await navegador.newPage();
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

async function estadoNoBanco() {
  const r = await c.mem.bruto.query<{
    acesso_suspenso_em: string | null; eliminacao_agendada_para: string | null;
  }>("SELECT acesso_suspenso_em, eliminacao_agendada_para FROM organizacoes WHERE id = $1", [serraAlta]);
  return r.rows[0]!;
}

describe("Eliminar e cancelar, no navegador, com a politica de seguranca valendo", () => {
  it("a pagina abre com a politica no cabecalho, e o script e a folha passam por ela", async () => {
    const resposta = await pagina.goto(base + "/", { waitUntil: "networkidle" });
    const politica = resposta?.headers()["content-security-policy"] ?? "";
    expect(politica, "a pagina veio sem politica de seguranca de conteudo").toContain("script-src 'self'");
    expect(politica).toContain("style-src 'self'");
    expect(politica).not.toContain("unsafe-inline");

    /* A folha pintou: o cartão da porta tem a sombra do token, e não a de um
       elemento sem estilo. E o script rodou: o botão do tema tem o rótulo
       que só o script escreve. */
    const sombra = await pagina.locator(".cartao-porta").evaluate((el) => getComputedStyle(el).boxShadow);
    expect(sombra, "a folha de estilo nao foi aplicada").not.toBe("none");
    await expect.poll(() => pagina.locator("#tema-rotulo").textContent()).toMatch(/Mudar para o modo/);
  }, 60_000);

  it("o dono entra pela porta de duas etapas e ve a linha de Serra Alta com as acoes", async () => {
    await pagina.fill("#email", DONO.email);
    await pagina.fill("#senha", DONO.senha);
    await pagina.click("#continuar");
    await pagina.waitForSelector("#forma-codigo:not([hidden])", { timeout: 30_000 });

    await pagina.fill("#codigo", codigoNovo(c.relogio, c.segredoDoDono));
    await pagina.click("#entrar");
    await pagina.waitForSelector("#painel:not([hidden])", { timeout: 30_000 });

    const linha = pagina.locator("#linhas tr", { hasText: "Serra Alta (MG)" });
    await expect.poll(() => linha.count()).toBe(1);
    await expect.poll(() => linha.textContent()).toContain("ativo");
    expect(await linha.getByRole("button", { name: "Eliminar" }).isVisible()).toBe(true);
    expect(await linha.getByRole("button", { name: "Desativar acesso" }).isVisible()).toBe(true);
  }, 90_000);

  it("eliminar abre o modal destrutivo, com foco dentro e a pagina atras inerte", async () => {
    const linha = pagina.locator("#linhas tr", { hasText: "Serra Alta (MG)" });
    await linha.getByRole("button", { name: "Eliminar" }).click();
    await pagina.waitForSelector("#dialogo-eliminar:not([hidden])");

    expect(await pagina.locator("#eliminar-titulo").textContent()).toContain("Serra Alta");
    expect(await pagina.locator("#eliminar-agir-texto").textContent()).toBe("Agendar a eliminação de Serra Alta");

    /* O foco entrou no modal (no primeiro campo), e a página de trás está inerte. */
    const focado = await pagina.evaluate(() => document.activeElement?.id ?? "");
    expect(["eliminar-senha", "eliminar-cartao"]).toContain(focado);
    expect(await pagina.locator("#principal").getAttribute("inert")).not.toBeNull();

    /* E o botão de agir é do tipo destrutivo, pintado com o token de perigo:
       a borda computada é exatamente o valor do token no tema em vigor. */
    const cor = await pagina.locator("#eliminar-agir").evaluate((el) => getComputedStyle(el).borderColor);
    const perigo = await pagina.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--ds-danger-fg").trim());
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(perigo);
    expect(hex, `o token de perigo nao e um hex de seis digitos: ${perigo}`).not.toBeNull();
    const esperado = `rgb(${parseInt(hex![1]!, 16)}, ${parseInt(hex![2]!, 16)}, ${parseInt(hex![3]!, 16)})`;
    expect(cor, "o botao de eliminar nao esta pintado com o token de perigo").toBe(esperado);
  }, 60_000);

  it("com senha, codigo novo, nome exato e motivo, agenda; a linha mostra o prazo e o cancelar", async () => {
    await pagina.fill("#eliminar-senha", DONO.senha);
    await pagina.fill("#eliminar-codigo", codigoNovo(c.relogio, c.segredoDoDono));
    await pagina.fill("#eliminar-nome", "Serra Alta");
    await pagina.fill("#eliminar-motivo", "Contrato encerrado, teste de navegador");
    await pagina.click("#eliminar-agir");

    await pagina.waitForSelector("#dialogo-eliminar", { state: "hidden", timeout: 60_000 });
    const linha = pagina.locator("#linhas tr", { hasText: "Serra Alta (MG)" });
    await expect.poll(() => linha.textContent(), { timeout: 30_000 }).toMatch(/eliminação em 7 dias, dia \d{2}\/\d{2} às \d{2}:\d{2}/);
    expect(await linha.getByRole("button", { name: "Cancelar eliminação" }).isVisible()).toBe(true);
    expect(await linha.getByRole("button", { name: "Eliminar" }).count()).toBe(0);

    const banco = await estadoNoBanco();
    expect(banco.eliminacao_agendada_para).not.toBeNull();
    expect(banco.acesso_suspenso_em).not.toBeNull();

    /* A página de trás voltou a responder. */
    expect(await pagina.locator("#principal").getAttribute("inert")).toBeNull();
  }, 120_000);

  it("cancelar durante o prazo passa pelo dialogo, e a linha volta a suspensa, sem reativar sozinha", async () => {
    const linha = pagina.locator("#linhas tr", { hasText: "Serra Alta (MG)" });
    await linha.getByRole("button", { name: "Cancelar eliminação" }).click();
    await pagina.waitForSelector("#dialogo:not([hidden])");
    expect(await pagina.locator("#dialogo-agir-texto").textContent()).toBe("Cancelar a eliminação de Serra Alta");

    await pagina.click("#dialogo-agir");
    await pagina.waitForSelector("#dialogo", { state: "hidden", timeout: 60_000 });
    await expect.poll(() => linha.textContent(), { timeout: 30_000 }).toContain("suspenso desde");
    expect(await linha.getByRole("button", { name: "Reativar" }).isVisible()).toBe(true);

    const banco = await estadoNoBanco();
    expect(banco.eliminacao_agendada_para).toBeNull();
    expect(banco.acesso_suspenso_em, "cancelar reativou o acesso por conta propria").not.toBeNull();
  }, 120_000);

  it("Escape fecha o dialogo, e nada no caminho inteiro produziu erro de console nem violacao de politica", async () => {
    const linha = pagina.locator("#linhas tr", { hasText: "Serra Alta (MG)" });
    await linha.getByRole("button", { name: "Reativar" }).click();
    await pagina.waitForSelector("#dialogo:not([hidden])");
    await pagina.keyboard.press("Escape");
    await pagina.waitForSelector("#dialogo", { state: "hidden" });

    expect(
      problemas,
      "o navegador reclamou durante o fluxo (erro de console, de pagina, pedido falhado "
      + "ou violacao da politica de seguranca de conteudo)",
    ).toEqual([]);
  }, 60_000);
});
