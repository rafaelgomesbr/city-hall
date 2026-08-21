/**
 * Teste de fluxo ponta a ponta do painel web.
 *
 * Ele exercita o que nenhum teste de unidade alcança: o banco de verdade
 * subindo no navegador, o RLS negando dado de outro município, o protocolo
 * saindo em sequência e a trilha registrando autoria a cada transição.
 *
 * Como rodar:
 *   npm run build --workspace @dc360/web
 *   npx vite preview --port 4173 --strictPort   (em outro terminal, dentro de apps/web)
 *   npm run test:e2e --workspace @dc360/web
 *
 * Na primeira vez, baixe o navegador: npx playwright install chromium
 */
import { chromium } from "playwright";

const BASE = "http://localhost:4173";
const erros = [];
let passou = 0, falhou = 0;

function ok(nome, cond, extra = "") {
  if (cond) { passou++; console.log(`  OK   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome} ${extra}`); }
}

const navegador = await chromium.launch();
const contexto = await navegador.newContext();
const page = await contexto.newPage();
page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text()}`); });

console.log("\n== 1. Entrada e preparo do banco ==");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".conta", { timeout: 90_000 });
const contas = await page.locator(".conta").count();
ok("lista de contas carregou dos dois municipios", contas === 7, `(${contas})`);
ok("Serra Alta aparece", await page.getByText("Serra Alta, MG").isVisible());
ok("Vale Fundo aparece", await page.getByText("Vale Fundo, MG").isVisible());

console.log("\n== 2. Painel do coordenador de Serra Alta ==");
await page.getByRole("button", { name: /Helena Vasques Coutinho/ }).click();
await page.waitForSelector(".indicador", { timeout: 30_000 });
const naFila = await page.locator(".indicador").first().locator(".indicador__valor").textContent();
ok("indicador Na fila conta as 6 ativas de Serra Alta", naFila.trim() === "6", `(${naFila})`);
const criticas = await page.locator(".indicador", { hasText: "Críticas ativas" }).locator(".indicador__valor").textContent();
ok("uma critica ativa", criticas.trim() === "1", `(${criticas})`);
ok("fila mostra protocolo critico primeiro",
   (await page.locator(".tabela tbody tr").first().textContent()).includes("000471/2026"));

console.log("\n== 3. Isolamento entre municipios ==");
await page.getByPlaceholder("Buscar protocolo, endereço ou solicitante").fill("000112");
await page.keyboard.press("Enter");
await page.waitForURL(/busca=000112/);
await page.waitForTimeout(800);
const achou = await page.locator(".vazio__titulo").isVisible().catch(() => false);
ok("protocolo de Vale Fundo NAO aparece para Serra Alta", achou);

console.log("\n== 4. Registrar ocorrencia: protocolo gerado pelo banco ==");
await page.goto(`${BASE}/ocorrencias/nova`);
await page.waitForSelector("#nova-solicitante");
await page.locator("#nova-tipo").selectOption("vendaval");
await page.locator("#nova-solicitante").fill("Benedito Alcantara Rosa");
await page.locator("#nova-contato").fill("(35) 99000-1234");
await page.locator("#nova-endereco").fill("Rua Sete de Setembro, 410, Centro");
await page.locator("#nova-lat").fill("-22.4200");
await page.locator("#nova-lng").fill("-45.4480");
await page.locator("#nova-descricao").fill("Arvore de grande porte caiu sobre a via apos rajada de vento.");
await page.getByRole("button", { name: /Registrar e gerar protocolo/ }).click();
await page.waitForURL(/\/ocorrencias\/[0-9a-f-]{36}$/, { timeout: 20_000 });
const protocoloNovo = (await page.locator("h1 .mono").textContent()).trim();
ok("protocolo segue a sequencia do municipio (000479/2026)", protocoloNovo === "000479/2026", `(${protocoloNovo})`);
ok("status inicial Registrada", await page.locator(".selo", { hasText: "Registrada" }).first().isVisible());

console.log("\n== 5. Fluxo completo: triagem, despacho, encerramento ==");
await page.locator("#triagem-severidade").selectOption("alta");
await page.getByRole("checkbox").check();
await page.locator("#triagem-vuln").fill("Morador cadeirante no imovel atingido.");
await page.getByRole("button", { name: "Registrar triagem" }).click();
await page.waitForSelector("#despacho-equipe", { timeout: 20_000 });
ok("triagem gravou e o bloco de despacho apareceu", true);
ok("prazo de 24h herdado da severidade alta",
   (await page.locator("#despacho-prazo").inputValue()) === "24");
ok("aviso de vulnerabilidade visivel",
   await page.locator(".aviso--alerta").isVisible());

const valorCharlie = await page.locator("#despacho-equipe option")
  .filter({ hasText: "Equipe Charlie" }).first().getAttribute("value");
await page.locator("#despacho-equipe").selectOption(valorCharlie);
await page.locator("#despacho-instrucoes").fill("Levar motosserra e cones de sinalizacao.");
await page.getByRole("button", { name: "Despachar" }).click();
// Espera a mensagem DESTA acao: o aviso de sucesso da triagem ja estava na tela.
await page.locator(".aviso--sucesso", { hasText: "Equipe despachada" }).waitFor({ timeout: 20_000 });
ok("status virou Em campo", await page.locator(".selo", { hasText: "Em campo" }).first().isVisible());
ok("equipe designada aparece", (await page.textContent(".detalhe")).includes("Equipe Charlie"));

const eventos = await page.locator(".trilha__item").count();
ok("trilha tem 3 eventos com autoria", eventos === 3, `(${eventos})`);
const autoria = await page.locator(".trilha__autoria").first().textContent();
ok("trilha nomeia autor e papel", autoria.includes("Helena Vasques Coutinho") && autoria.includes("Coordenador"));

console.log("\n== 6. Encerramento exige motivo ==");
await page.getByRole("button", { name: "Encerrar ocorrência" }).click();
await page.waitForTimeout(400);
ok("recusa encerrar sem motivo", await page.locator(".campo__erro").isVisible());
await page.locator("#encerrar-motivo").fill("Via desobstruida pela equipe e arvore removida. Sem risco remanescente.");
await page.getByRole("button", { name: "Encerrar ocorrência" }).click();
await page.locator(".selo", { hasText: "Encerrada" }).first().waitFor({ timeout: 20_000 }).catch(() => {});
ok("encerrou com motivo", await page.locator(".selo", { hasText: "Encerrada" }).first().isVisible());
ok("motivo aparece no cartao de encerramento",
   (await page.textContent(".detalhe")).includes("Via desobstruida pela equipe"));

console.log("\n== 7. Painel refletiu o encerramento ==");
await page.getByRole("link", { name: "Painel" }).click();
await page.waitForSelector(".indicador");
const filaDepois = await page.locator(".indicador").first().locator(".indicador__valor").textContent();
ok("Na fila voltou para 6 (entrou 1, encerrou 1)", filaDepois.trim() === "6", `(${filaDepois})`);
if (filaDepois.trim() !== "6") {
  await page.goto(`${BASE}/ocorrencias?status=ativas`);
  await page.waitForTimeout(1200);
  console.log("    ativas:", (await page.locator(".tabela__protocolo").allTextContents()).join(", "));
}

console.log("\n== 8. Equipes: cadastrar, editar, desativar ==");
await page.getByRole("link", { name: "Equipes" }).click();
await page.waitForSelector("#equipe-nome");
await page.locator("#equipe-nome").fill("Equipe Delta");
await page.locator("#equipe-especialidade").fill("Resgate em altura");
await page.getByRole("button", { name: /Cadastrar equipe/ }).click();
await page.waitForTimeout(800);
ok("equipe criada aparece na tabela", (await page.textContent(".tabela")).includes("Equipe Delta"));

await page.locator("#equipe-nome").fill("Equipe Alfa");
await page.getByRole("button", { name: /Cadastrar equipe/ }).click();
await page.waitForTimeout(800);
ok("recusa nome duplicado no mesmo municipio",
   (await page.textContent(".aviso--perigo").catch(() => "")).includes("Já existe uma equipe"));

console.log("\n== 9. Usuarios ==");
await page.getByRole("link", { name: "Usuários" }).click();
await page.waitForSelector("#usuario-nome");
await page.locator("#usuario-nome").fill("Marcos Vinicius Teles");
await page.locator("#usuario-matricula").fill("SA-4001");
await page.locator("#usuario-email").fill("marcos.teles@serraalta.exemplo.gov.br");
await page.locator("#usuario-papel").selectOption("agente_campo");
await page.getByRole("button", { name: /Cadastrar usuário/ }).click();
await page.waitForTimeout(800);
ok("usuario criado", (await page.textContent(".tabela")).includes("Marcos Vinicius Teles"));
const propriaConta = page.locator(".tabela tbody tr", { hasText: "Helena Vasques Coutinho" })
  .getByRole("button", { name: "Desativar" });
ok("nao permite desativar a propria conta", await propriaConta.isDisabled());

console.log("\n== 10. Mapa ==");
await page.getByRole("link", { name: "Mapa da cidade" }).click();
await page.waitForSelector("h1");
await page.waitForTimeout(800);
const pinos = await page.locator("[aria-label*='0004']").count();
ok("mapa plota as ativas com coordenada", pinos >= 5, `(${pinos})`);
await page.locator("[aria-label*='000471']").first().click();
await page.waitForTimeout(400);
ok("selecionar pino mostra o protocolo",
   (await page.textContent(".detalhe .coluna:last-child")).includes("000471/2026"));

console.log("\n== 11. Papel restringe o menu ==");
await page.getByRole("button", { name: "Sair" }).click();
await page.waitForSelector(".conta");
await page.getByRole("button", { name: /Jonas Ferreira/ }).click();
await page.waitForSelector(".indicador", { timeout: 30_000 });
ok("operador nao ve Usuarios no menu",
   (await page.locator(".lateral__item", { hasText: "Usuários" }).count()) === 0);
ok("operador nao ve Equipes no menu",
   (await page.locator(".lateral__item", { hasText: "Equipes" }).count()) === 0);
await page.goto(`${BASE}/ocorrencias/`);
await page.waitForTimeout(600);
await page.locator(".tabela__protocolo").first().click();
await page.waitForTimeout(1000);
ok("operador nao ve bloco de encerramento",
   (await page.locator("#encerrar-motivo").count()) === 0);

console.log("\n== 12. Isolamento visto do outro municipio ==");
await page.getByRole("button", { name: "Sair" }).click();
await page.waitForSelector(".conta");
await page.getByRole("button", { name: /Aurélio Prates Machado/ }).click();
await page.waitForSelector(".indicador", { timeout: 30_000 });
const filaVF = await page.locator(".indicador").first().locator(".indicador__valor").textContent();
ok("Vale Fundo ve apenas as proprias 2 ocorrencias", filaVF.trim() === "2", `(${filaVF})`);
const textoPainelVF = await page.textContent(".conteudo");
ok("nenhum protocolo de Serra Alta vaza", !textoPainelVF.includes("/2026".padStart(1)) || !textoPainelVF.includes("000471"));
ok("equipes de Serra Alta nao aparecem", !textoPainelVF.includes("Equipe Alfa"));

console.log("\n== 13. Tema escuro ==");
await page.getByRole("button", { name: "Tema escuro" }).click();
await page.waitForTimeout(400);
ok("atributo data-theme aplicado",
   (await page.getAttribute("html", "data-theme")) === "dark");
const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok("fundo mudou para o escuro do token", fundo === "rgb(16, 21, 25)", `(${fundo})`);

console.log("\n== 14. Persistencia entre recarregamentos ==");
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".indicador", { timeout: 60_000 });
ok("sessao sobreviveu ao reload", (await page.textContent(".identidade__nome")).includes("Aurélio"));
ok("tema sobreviveu ao reload", (await page.getAttribute("html", "data-theme")) === "dark");

await navegador.close();

console.log(`\n${"=".repeat(50)}`);
console.log(`Passou: ${passou}   Falhou: ${falhou}`);
if (erros.length) {
  console.log(`\nErros de console/pagina (${erros.length}):`);
  for (const e of [...new Set(erros)]) console.log(`  - ${e}`);
} else {
  console.log("Zero erro de console.");
}
process.exit(falhou > 0 || erros.length > 0 ? 1 : 0);
