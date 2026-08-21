/**
 * Fluxo ponta a ponta com o painel ligado à API.
 *
 * A outra suíte (`fluxo.e2e.mjs`) cobre o modo local, em que o banco vive na
 * própria aba. Esta cobre o caminho de produção: navegador, HTTP, servidor,
 * Postgres. É a única que exercita autenticação de verdade, CORS, renovação
 * de token e revogação de sessão.
 *
 * A suíte assume uma API recém-iniciada, com a semente intacta: ela confere
 * contagens exatas e o próximo número de protocolo. Rodar duas vezes contra o
 * mesmo processo falha de propósito, porque a primeira execução deixa registro
 * novo no banco. Em CI o servidor sobe junto com o teste.
 *
 * Como rodar:
 *   # terminal 1
 *   cd apps/api && JWT_SEGREDO=... ORIGENS_PERMITIDAS=http://localhost:4173 npx tsx src/index.ts
 *   # terminal 2
 *   cd apps/web && VITE_API_URL=http://127.0.0.1:3333 npm run build && npx vite preview --port 4173
 *   # terminal 3
 *   node test/fluxo-api.e2e.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_WEB ?? "http://localhost:4173";
const SENHA = "defesa-civil-2026";
const erros = [];
let passou = 0, falhou = 0;

function ok(nome, cond, extra = "") {
  if (cond) { passou++; console.log(`  OK   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome} ${extra}`); }
}

const navegador = await chromium.launch();
const page = await (await navegador.newContext()).newPage();
/**
 * O Chrome registra no console toda resposta que não é 2xx, e esta suíte
 * provoca 401, 403 e 404 DE PROPÓSITO: senha errada, papel sem permissão e
 * recurso de outro município. Esses registros são a prova de que a API
 * recusou, não sintoma de defeito.
 *
 * O que continua sendo falha: exceção na página, e qualquer outro erro de
 * console, incluindo 5xx e bloqueio de CORS.
 */
const ESPERADOS = /Failed to load resource: the server responded with a status of (401|403|404|422)/;

function registrar(page) {
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (ESPERADOS.test(m.text())) return;
    erros.push(`console: ${m.text()}`);
  });
}
registrar(page);

async function entrar(email, senha = SENHA) {
  // Ir para /entrar com sessao ativa redireciona ao painel, que e o
  // comportamento correto do app. Entao sai de verdade antes, pelo botao.
  await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
  const sair = page.getByRole("button", { name: "Sair" });
  if (await sair.count()) {
    await sair.click();
    await page.waitForSelector("#entrada-email", { timeout: 30_000 });
  } else {
    await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  }
  await page.waitForSelector("#entrada-email", { timeout: 30_000 });
  await page.locator("#entrada-email").fill(email);
  await page.locator("#entrada-senha").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

console.log("\n== 1. Entrada por senha, contra a API ==");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("#entrada-email", { timeout: 30_000 });
ok("a tela pede email e senha, nao lista de perfis",
   (await page.locator(".conta").count()) === 0);

await page.locator("#entrada-email").fill("helena.coutinho@serraalta.exemplo.gov.br");
await page.locator("#entrada-senha").fill("senha-completamente-errada");
await page.getByRole("button", { name: "Entrar", exact: true }).click();
await page.waitForSelector(".campo__erro", { timeout: 20_000 });
ok("senha errada mostra erro e nao entra",
   (await page.locator(".campo__erro").textContent()).includes("inválidos"));
ok("continua na tela de entrada", page.url().includes("/entrar"));

await entrar("helena.coutinho@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
ok("senha correta entra no painel", page.url().includes("/painel"));
ok("identidade vem do servidor",
   (await page.textContent(".identidade__nome")).includes("Helena"));

console.log("\n== 2. Dados vêm da API, com o mesmo conteúdo da semente ==");
const naFila = await page.locator(".indicador").first().locator(".indicador__valor").textContent();
ok("Na fila conta as 6 ativas de Serra Alta", naFila.trim() === "6", `(${naFila})`);
ok("fila mostra a critica primeiro",
   (await page.locator(".tabela tbody tr").first().textContent()).includes("000471/2026"));

console.log("\n== 3. Token no armazenamento, e nunca a senha ==");
const guardado = await page.evaluate(() => sessionStorage.getItem("dc360:tokens"));
ok("tokens guardados na sessao", !!guardado && guardado.includes("acesso"));
const tudo = await page.evaluate(() => JSON.stringify(sessionStorage) + JSON.stringify(localStorage));
ok("a senha nao fica guardada em lugar nenhum", !tudo.includes("defesa-civil-2026"));
ok("nem o hash da senha chega ao navegador", !tudo.includes("scrypt$"));

console.log("\n== 4. Isolamento imposto pelo servidor ==");
await page.getByPlaceholder("Buscar protocolo, endereço ou solicitante").fill("000112");
await page.keyboard.press("Enter");
await page.waitForURL(/busca=000112/);
await page.waitForTimeout(1200);
ok("protocolo de Vale Fundo nao aparece para Serra Alta",
   await page.locator(".vazio__titulo").isVisible().catch(() => false));

// Tentativa direta pela URL, sem passar pela lista: a API responde 404.
await page.goto(`${BASE}/ocorrencias/22222222-2222-4222-8222-0000000000c1`);
await page.waitForTimeout(1500);
const corpoDetalhe = await page.textContent("body");
ok("abrir ocorrencia de outro municipio pela URL nao mostra o registro",
   !corpoDetalhe.includes("000112/2026") && !corpoDetalhe.includes("Nova Esperança"));

console.log("\n== 5. Fluxo completo gravando no servidor ==");
await page.goto(`${BASE}/ocorrencias/nova`);
await page.waitForSelector("#nova-solicitante", { timeout: 20_000 });
await page.locator("#nova-tipo").selectOption("vendaval");
await page.locator("#nova-solicitante").fill("Benedito Alcantara Rosa");
await page.locator("#nova-endereco").fill("Rua Sete de Setembro, 410, Centro");
await page.locator("#nova-descricao").fill("Arvore de grande porte caiu sobre a via.");
await page.getByRole("button", { name: /Registrar e gerar protocolo/ }).click();
await page.waitForURL(/\/ocorrencias\/[0-9a-f-]{36}$/, { timeout: 30_000 });
const protocolo = (await page.locator("h1 .mono").textContent()).trim();
ok("protocolo gerado pelo banco segue a sequencia", protocolo === "000479/2026", `(${protocolo})`);
const urlOcorrencia = page.url();

await page.locator("#triagem-severidade").selectOption("alta");
await page.getByRole("button", { name: "Registrar triagem" }).click();
await page.locator(".aviso--sucesso", { hasText: "Triagem registrada" }).waitFor({ timeout: 20_000 });
ok("triagem gravou pela API", true);

const valorEquipe = await page.locator("#despacho-equipe option")
  .filter({ hasText: "Equipe Charlie" }).first().getAttribute("value");
await page.locator("#despacho-equipe").selectOption(valorEquipe);
await page.getByRole("button", { name: "Despachar" }).click();
await page.locator(".aviso--sucesso", { hasText: "Equipe despachada" }).waitFor({ timeout: 20_000 });
ok("despacho gravou pela API", true);

const eventos = await page.locator(".trilha__item").count();
ok("trilha do servidor tem os 3 eventos", eventos === 3, `(${eventos})`);
ok("autoria veio do token, nao da tela",
   (await page.locator(".trilha__autoria").last().textContent()).includes("Helena Vasques Coutinho"));

console.log("\n== 6. Persistencia real: outro navegador ve o mesmo dado ==");
const outro = await (await navegador.newContext()).newPage();
registrar(outro);
await outro.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await outro.waitForSelector("#entrada-email", { timeout: 30_000 });
await outro.locator("#entrada-email").fill("jonas.ferreira@serraalta.exemplo.gov.br");
await outro.locator("#entrada-senha").fill(SENHA);
await outro.getByRole("button", { name: "Entrar", exact: true }).click();
await outro.waitForSelector(".indicador", { timeout: 30_000 });
await outro.goto(`${BASE}/ocorrencias?status=todas&busca=000479`);
await outro.waitForTimeout(1500);
ok("a ocorrencia criada numa sessao aparece na outra",
   (await outro.textContent("body")).includes("000479/2026"));
await outro.close();

console.log("\n== 7. Papel restringe do lado do servidor ==");
await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
ok("operador nao ve Usuarios no menu",
   (await page.locator(".lateral__item", { hasText: "Usuários" }).count()) === 0);
await page.goto(urlOcorrencia);
await page.waitForTimeout(1500);
ok("operador nao ve bloco de encerramento",
   (await page.locator("#encerrar-motivo").count()) === 0);

// A tela esconde, mas quem recusa e o servidor: chama a API direto do console.
const recusa = await page.evaluate(async (url) => {
  const tokens = JSON.parse(sessionStorage.getItem("dc360:tokens"));
  const id = location.pathname.split("/").pop();
  const r = await fetch(`${url}/ocorrencias/${id}/encerramento`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${tokens.acesso}` },
    body: JSON.stringify({ motivo: "tentativa direta pela API, contornando a tela" }),
  });
  return { status: r.status, corpo: await r.text() };
}, process.env.BASE_API ?? "http://127.0.0.1:3333");
ok("a API recusa mesmo contornando a interface", recusa.status === 403, `(${recusa.status})`);
ok("e diz que e falta de permissao", recusa.corpo.includes("sem_permissao"));

console.log("\n== 8. Sair revoga a sessao no servidor ==");
const tokensAntes = await page.evaluate(() => sessionStorage.getItem("dc360:tokens"));
const renovacaoAntes = JSON.parse(tokensAntes).renovacao;
await page.getByRole("button", { name: "Sair" }).click();
await page.waitForSelector("#entrada-email", { timeout: 20_000 });
ok("voltou para a entrada", page.url().includes("/entrar"));
ok("tokens apagados do navegador",
   (await page.evaluate(() => sessionStorage.getItem("dc360:tokens"))) === null);

const aposSair = await page.evaluate(async ({ url, renovacao }) => {
  const r = await fetch(`${url}/auth/renovar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ renovacao }),
  });
  return r.status;
}, { url: process.env.BASE_API ?? "http://127.0.0.1:3333", renovacao: renovacaoAntes });
ok("o token de renovacao nao vale mais no servidor", aposSair === 401, `(${aposSair})`);

console.log("\n== 9. Cadastro com senha, e a conta nova entra ==");
await entrar("helena.coutinho@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
await page.getByRole("link", { name: "Usuários" }).click();
await page.waitForSelector("#usuario-senha", { timeout: 20_000 });
ok("modo API pede senha inicial no cadastro", true);

await page.locator("#usuario-nome").fill("Marcos Vinicius Teles");
await page.locator("#usuario-matricula").fill("SA-4001");
await page.locator("#usuario-email").fill("marcos.teles@serraalta.exemplo.gov.br");
await page.locator("#usuario-papel").selectOption("operador");
await page.locator("#usuario-senha").fill("curta");
await page.getByRole("button", { name: /Cadastrar usuário/ }).click();
await page.waitForTimeout(800);
ok("recusa senha curta",
   (await page.textContent(".aviso--perigo").catch(() => "")).includes("12 caracteres"));

await page.locator("#usuario-senha").fill("senha-inicial-do-marcos");
await page.getByRole("button", { name: /Cadastrar usuário/ }).click();
await page.waitForTimeout(1500);
ok("usuario criado aparece na tabela",
   (await page.textContent(".tabela")).includes("Marcos Vinicius Teles"));

await entrar("marcos.teles@serraalta.exemplo.gov.br", "senha-inicial-do-marcos");
await page.waitForSelector(".indicador", { timeout: 30_000 });
ok("a conta recem-criada entra com a senha definida",
   (await page.textContent(".identidade__nome")).includes("Marcos"));

console.log("\n== 10. Outro municipio, do zero ==");
await entrar("aurelio.machado@valefundo.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
const filaVF = await page.locator(".indicador").first().locator(".indicador__valor").textContent();
ok("Vale Fundo ve apenas as proprias 2 ocorrencias", filaVF.trim() === "2", `(${filaVF})`);
const conteudoVF = await page.textContent(".conteudo");
ok("nenhum protocolo de Serra Alta vaza", !conteudoVF.includes("000471") && !conteudoVF.includes("000479"));

await navegador.close();

console.log(`\n${"=".repeat(52)}`);
console.log(`Passou: ${passou}   Falhou: ${falhou}`);
if (erros.length) {
  console.log(`\nErros de console/pagina (${erros.length}):`);
  for (const e of [...new Set(erros)]) console.log(`  - ${e}`);
} else {
  console.log("Zero erro de console.");
}
process.exit(falhou > 0 || erros.length > 0 ? 1 : 0);
