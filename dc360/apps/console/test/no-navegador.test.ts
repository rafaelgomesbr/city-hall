import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { base32Decodificar } from "../../api/src/auth/totp.js";
import { DONO, cadastrarPrefeitura, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste } from "./apoio/console-de-teste.js";

/**
 * O fluxo de eliminar e cancelar, e o de gerar códigos de recuperação e
 * recuperar a conta com um deles, num NAVEGADOR DE VERDADE, com a política de
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

describe("Gerar codigos de recuperacao e recuperar a conta com um deles, no navegador", () => {
  let codigos: string[] = [];
  let segredoNovo = "";
  const SENHA_NOVA = "senha-recuperada-no-navegador-de-verdade";

  it("em Minha senha, com a senha e um codigo novo, os oito codigos aparecem uma vez e a contagem muda", async () => {
    await pagina.click("#ir-senha");
    await pagina.waitForSelector("#minha-senha:not([hidden])");
    await expect.poll(() => pagina.locator("#codigos-restantes").textContent(), { timeout: 30_000 })
      .toContain("Nenhum");

    await pagina.fill("#codigos-senha", DONO.senha);
    await pagina.fill("#codigos-codigo", codigoNovo(c.relogio, c.segredoDoDono));
    await pagina.click("#gerar-codigos");
    await pagina.waitForSelector("#codigos-entregues:not([hidden])", { timeout: 90_000 });

    codigos = await pagina.locator("#lista-de-codigos li").allTextContents();
    expect(codigos).toHaveLength(8);
    for (const codigo of codigos) expect(codigo).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);
    await expect.poll(() => pagina.locator("#codigos-restantes").textContent()).toContain("8");

    /* O aviso de "mostrado uma vez" esta pintado com o token de perigo, e tem a palavra. */
    const aviso = pagina.locator("#codigos-entregues .alerta");
    expect(await aviso.textContent()).toContain("Atenção");
    expect(await aviso.evaluate((el) => getComputedStyle(el).borderLeftWidth)).not.toBe("0px");

    await pagina.click("#codigos-concluir");
    expect(await pagina.locator("#lista-de-codigos li").count()).toBe(0);
    expect(await pagina.locator("#forma-codigos").isVisible()).toBe(true);
  }, 150_000);

  it("sair, Esqueci a senha, um codigo e a senha nova: o QR novo aparece, e a pessoa entra pela porta com ele", async () => {
    await pagina.click("#sair");
    await pagina.waitForSelector("#porta:not([hidden])");
    await pagina.fill("#email", DONO.email);
    await pagina.click("#esqueci-senha");
    await pagina.waitForSelector("#forma-recuperar:not([hidden])");
    expect(await pagina.inputValue("#recuperar-email")).toBe(DONO.email);
    expect(await pagina.locator("#forma-senha").isVisible()).toBe(false);

    await pagina.fill("#recuperar-codigo", codigos[0]!);
    await pagina.fill("#recuperar-senha", SENHA_NOVA);
    await pagina.fill("#recuperar-senha-2", SENHA_NOVA);
    await pagina.click("#recuperar");
    await pagina.waitForSelector("#recuperado:not([hidden])", { timeout: 90_000 });

    segredoNovo = ((await pagina.locator("#recuperado-segredo").textContent()) ?? "").replace(/\s+/g, "");
    expect(base32Decodificar(segredoNovo), "o segredo novo na tela nao e base32").not.toBeNull();
    expect(segredoNovo).not.toBe(c.segredoDoDono);
    expect(await pagina.locator("#recuperado-qr svg rect.qr__modulo").count(), "o QR novo nao foi desenhado")
      .toBeGreaterThan(100);
    await expect.poll(() => pagina.locator("#recuperado-restantes").textContent()).toContain("7");

    const noBanco = await c.mem.bruto.query<{ usados: string; livres: string }>(
      `SELECT count(*) FILTER (WHERE usado_em IS NOT NULL)::text AS usados,
              count(*) FILTER (WHERE usado_em IS NULL)::text AS livres
         FROM console_codigos_de_recuperacao`,
    );
    expect(Number(noBanco.rows[0]!.usados)).toBe(1);
    expect(Number(noBanco.rows[0]!.livres)).toBe(7);

    await pagina.click("#recuperado-entrar");
    await pagina.waitForSelector("#forma-senha:not([hidden])");
    expect(await pagina.locator("#recuperado-segredo").textContent()).toBe("");
    expect(await pagina.inputValue("#email")).toBe(DONO.email);

    await pagina.fill("#senha", SENHA_NOVA);
    await pagina.click("#continuar");
    await pagina.waitForSelector("#forma-codigo:not([hidden])", { timeout: 30_000 });
    await pagina.fill("#codigo", codigoNovo(c.relogio, segredoNovo));
    await pagina.click("#entrar");
    await pagina.waitForSelector("#painel:not([hidden])", { timeout: 30_000 });
    await expect.poll(() => pagina.locator("#quem-email").textContent()).toBe(DONO.email);

    expect(
      problemas,
      "o navegador reclamou durante a recuperacao (erro de console, de pagina, pedido falhado "
      + "ou violacao da politica de seguranca de conteudo)",
    ).toEqual([]);
  }, 180_000);
});
