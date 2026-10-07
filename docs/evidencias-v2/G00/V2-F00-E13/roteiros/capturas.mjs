/**
 * Capturas da V2-F00-E13. Roteiro descartável: ele vive só enquanto a etapa é
 * executada e sai do repositório depois (a prova arquivada são os PNG).
 *
 * Uso: com o painel servido em http://localhost:4173,
 *   node test/_capturas-e13.mjs <pasta-de-saida>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as playwright from "playwright";

const BASE = "http://localhost:4173";
const SAIDA = process.argv[2];
if (!SAIDA) { console.error("falta a pasta de saída"); process.exit(2); }
mkdirSync(SAIDA, { recursive: true });

const TAMANHOS = [
  { nome: "1280", viewport: { width: 1280, height: 900 } },
  { nome: "390", viewport: { width: 390, height: 844 } },
];
const TEMAS = [["claro", "claro"], ["escuro", "escuro"]];

const navegador = await playwright.chromium.launch();
const erros = [];

async function tirar(page, nome) {
  await page.waitForTimeout(350);
  const caminho = join(SAIDA, `${nome}.png`);
  await page.screenshot({ path: caminho, fullPage: false });
  console.log(`  ${nome}.png`);
}

for (const tamanho of TAMANHOS) {
  for (const [tema, valor] of TEMAS) {
    const sufixo = `${tamanho.nome}-${tema}`;
    const contexto = await navegador.newContext({ viewport: tamanho.viewport });
    await contexto.addInitScript(`localStorage.setItem("dc360:tema", "${valor}")`);
    const page = await contexto.newPage();
    page.on("pageerror", (e) => erros.push(`${sufixo} pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") erros.push(`${sufixo} console: ${m.text()}`); });
    console.log(`\n== ${sufixo} ==`);

    // 1. A entrada, aberta a partir da RAIZ (é o que a etapa conserta).
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForSelector(".conta", { timeout: 90_000 });
    await tirar(page, `entrada-a-partir-da-raiz-${sufixo}`);

    // 2. Entrou pela raiz e caiu na tela do papel, e não em "Esta página não existe".
    await page.getByRole("button", { name: /Helena Vasques Coutinho/ }).click();
    await page.waitForSelector(".indicador", { timeout: 60_000 });
    console.log(`  (url depois de entrar pela raiz: ${page.url()})`);
    await tirar(page, `painel-depois-de-entrar-pela-raiz-${sufixo}`);

    // 3. Usuários: confirmação de gravação (estado normal, com Toast).
    await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
    await page.waitForSelector("#usuario-nome", { timeout: 60_000 });
    await tirar(page, `usuarios-antes-de-gravar-${sufixo}`);
    const marca = Date.now().toString().slice(-5);
    await page.fill("#usuario-nome", "Marina Alencar Prado");
    await page.fill("#usuario-matricula", `DC-${marca}`);
    await page.fill("#usuario-email", `marina.${marca}@serraalta.mg.gov.br`);
    await page.getByRole("button", { name: /Cadastrar usuário/ }).first().click();
    await page.waitForSelector(".toast", { timeout: 30_000 });
    await tirar(page, `usuarios-confirmacao-${sufixo}`);

    // 4. Usuários: estado de ERRO (formulário vazio reprovado campo a campo).
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#usuario-nome", { timeout: 60_000 });
    await page.getByRole("button", { name: /Cadastrar usuário/ }).first().click();
    await page.waitForTimeout(500);
    await tirar(page, `usuarios-erro-de-campo-${sufixo}`);

    // 5. Equipes: confirmação de gravação.
    await page.goto(`${BASE}/equipes`, { waitUntil: "networkidle" });
    await page.waitForSelector("#equipe-nome", { timeout: 60_000 });
    await page.fill("#equipe-nome", `Equipe Aurora ${marca}`);
    await page.fill("#equipe-especialidade", "Deslizamento");
    await page.getByRole("button", { name: /Cadastrar equipe/ }).first().click();
    await page.waitForSelector(".toast", { timeout: 30_000 });
    await tirar(page, `equipes-confirmacao-${sufixo}`);

    // 6. Órgãos: confirmação de gravação.
    await page.goto(`${BASE}/orgaos`, { waitUntil: "networkidle" });
    await page.waitForSelector("#orgao-nome", { timeout: 60_000 });
    await page.fill("#orgao-nome", `Secretaria de Obras ${marca}`);
    await page.fill("#orgao-sigla", "SOB");
    await page.fill("#orgao-email", `obras.${marca}@serraalta.mg.gov.br`);
    await page.getByRole("button", { name: /Cadastrar órgão/ }).first().click();
    await page.waitForSelector(".toast", { timeout: 30_000 });
    await tirar(page, `orgaos-confirmacao-${sufixo}`);

    // 7. Endereço que não existe continua dizendo que não existe (a etapa
    //    conserta a RAIZ, não o curinga).
    await page.goto(`${BASE}/endereco-que-nao-existe`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await tirar(page, `endereco-inexistente-${sufixo}`);

    // 8. Estado VAZIO: o município vizinho ainda não cadastrou órgão nenhum.
    await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
    await page.waitForSelector(".indicador", { timeout: 60_000 });
    await page.getByRole("button", { name: "Sair" }).click();
    await page.waitForSelector(".conta", { timeout: 60_000 });
    await page.getByRole("button", { name: /Aurélio Prates Machado/ }).click();
    await page.waitForSelector(".indicador", { timeout: 60_000 });
    console.log(`  (url do operador depois de sair: ${page.url()})`);
    await page.goto(`${BASE}/orgaos`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await tirar(page, `orgaos-vazio-${sufixo}`);

    // 9. A barra de navegação no pé da tela, por inteiro (o ponto de interface
    //    conferido nesta etapa). Só no celular, onde a lateral vira barra.
    if (tamanho.nome === "390") {
      const barra = await page.evaluate(() => {
        const n = document.querySelector(".lateral");
        return n ? { rola: n.scrollWidth > n.clientWidth + 1, scrollWidth: n.scrollWidth, clientWidth: n.clientWidth } : null;
      });
      console.log(`  (barra inferior: ${JSON.stringify(barra)})`);
      await page.locator(".lateral").screenshot({ path: join(SAIDA, `barra-inferior-${sufixo}.png`) });
      console.log(`  barra-inferior-${sufixo}.png`);
      await page.evaluate(() => { const n = document.querySelector(".lateral"); if (n) n.scrollLeft = n.scrollWidth; });
      await page.waitForTimeout(300);
      await tirar(page, `barra-inferior-rolada-ate-o-fim-${sufixo}`);
      // O Tab parando em "Mapa da cidade": antes, o rótulo ficava cortado na
      // borda direita e a barra não se mexia.
      await page.evaluate(() => { const n = document.querySelector(".lateral"); if (n) n.scrollLeft = 0; });
      await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
      await page.waitForSelector(".indicador", { timeout: 60_000 });
      await page.getByRole("link", { name: "Mapa da cidade" }).focus();
      await page.waitForTimeout(600);
      await page.locator(".lateral").screenshot({ path: join(SAIDA, `barra-foco-no-mapa-${sufixo}.png`) });
      console.log(`  barra-foco-no-mapa-${sufixo}.png`);
    }

    await contexto.close();
  }
}

await navegador.close();
console.log(`\nErros de console/página: ${erros.length}`);
for (const e of [...new Set(erros)]) console.log(`  - ${e}`);
process.exit(erros.length > 0 ? 1 : 0);
