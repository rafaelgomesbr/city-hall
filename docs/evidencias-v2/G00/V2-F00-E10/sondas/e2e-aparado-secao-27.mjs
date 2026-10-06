/**
 * COPIA APARADA para provar a secao 27 isolada: o e2e completo cai na secao 13 (CORS do PUT,
 * E18, pre-existente). Cabecalho, ajudantes e a secao 27, sem alteracao, do arquivo
 * apps/web/test/fluxo-api.e2e.mjs.
 */
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
 *   cd apps/api && JWT_SEGREDO=... ORIGENS_PERMITIDAS=http://localhost:4173  *     LOGIN_POR_IP=10000 npx tsx src/index.ts
 *
 * `LOGIN_POR_IP` alto porque a suíte entra e sai dezenas de vezes do mesmo
 * endereço, e o limite real (10 em 5 minutos) existe justamente para impedir
 * isso. O limite em si é exercitado nos testes de integração da API.
 *   # terminal 2
 *   cd apps/web && VITE_API_URL=http://127.0.0.1:3333 npm run build && npx vite preview --port 4173
 *   # terminal 3
 *   node test/fluxo-api.e2e.mjs
 */
import * as playwright from "playwright";

/*
  O motor vem por variavel de ambiente porque o painel precisa funcionar
  fora do Chromium: uma prefeitura abre o que estiver instalado na maquina.
  MOTOR=firefox ou MOTOR=webkit troca o motor sem mexer no teste.
*/
const MOTOR = process.env.MOTOR ?? "chromium";
const lancador = playwright[MOTOR];
if (!lancador) {
  console.error(`motor desconhecido: ${MOTOR}`);
  process.exit(2);
}
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_WEB ?? "http://localhost:4173";
const SENHA = "defesa-civil-2026";
const erros = [];
let passou = 0, falhou = 0;

function ok(nome, cond, extra = "") {
  if (cond) { passou++; console.log(`  OK   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome} ${extra}`); }
}

const navegador = await lancador.launch();
const contexto = await navegador.newContext();
const page = await contexto.newPage();
/**
 * O Chrome registra no console toda resposta que não é 2xx, e esta suíte
 * provoca 401, 403 e 404 DE PROPÓSITO: senha errada, papel sem permissão e
 * recurso de outro município. Esses registros são a prova de que a API
 * recusou, não sintoma de defeito.
 *
 * O que continua sendo falha: exceção na página, e qualquer outro erro de
 * console, incluindo 5xx e bloqueio de CORS.
 */
const ESPERADOS = new RegExp([
  // 429 e 503 so na secao 27, que os provoca por interceptacao de rota para
  // mostrar a tela de limite de pedidos e a de recuperacao desligada.
  "Failed to load resource: the server responded with a status of (401|403|404|422|429|503)",
  // A seção 19 derruba a rota da API de propósito para conferir a mensagem de
  // rede caída. O navegador reclama por causa disso, e a reclamação é o
  // comportamento esperado do teste, não defeito do app.
  "Failed to load resource: net::ERR_FAILED",
].join("|"));

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

  // Falhar dizendo o motivo: um timeout genérico esperando o painel esconde
  // se foi senha errada, conta bloqueada ou limite por endereço.
  const erro = page.locator(".campo__erro");
  //
  // A espera aceita duas telas porque cada papel cai numa: a coordenação vai
  // para o painel, que tem indicadores, e o agente de campo vai para "Meu
  // trabalho", que não tem nenhum, e nem deveria ter.
  const chegou = await Promise.race([
    page.waitForSelector(".indicador", { timeout: 30_000 }).then(() => "painel"),
    page.waitForSelector(".cartao", { timeout: 30_000 }).then(() => "painel"),
    erro.waitFor({ timeout: 30_000 }).then(() => "erro"),
  ]).catch(() => "tempo esgotado");

  if (chegou !== "painel") {
    const texto = await erro.textContent().catch(() => "(sem mensagem)");
    throw new Error(`nao entrou como ${email}: ${texto}`);
  }
}


const API_E07 = process.env.BASE_API ?? "http://127.0.0.1:3333";
const SENHA_DA_HELENA_E07 = "senha-nova-da-helena-2026";
const NOVA_DA_HELENA_E07 = "terceira-senha-da-helena-2026";

async function viaApiE07(caminho, { metodo = "GET", token, corpo } = {}) {
  const r = await fetch(`${API_E07}${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}


const destinoNotificacao = process.env.NOTIFICADOR_ARQUIVO;
if (!destinoNotificacao) {
  throw new Error(
    "NOTIFICADOR_ARQUIVO não está definida. Suba a API com essa variável "
    + "apontando para um arquivo, e passe a mesma variável para este teste. "
    + "Sem ela a seção 14 não tem de onde ler o link de redefinição.",
  );
}
// O envio sai DEPOIS da resposta do pedido (V2-F00-E10), entao o arquivo pode levar um instante.
for (let tentativa = 0; tentativa < 50; tentativa += 1) {
  try {
    if (readFileSync(destinoNotificacao, "utf8").includes(`para=${alvoRecuperacao}`)) break;
  } catch { /* o arquivo ainda nao existe */ }
  await page.waitForTimeout(200);
}

// ---- 27. Recuperacao de senha: o link some da barra, vale uma vez, e a tela diz o que fazer ----
console.log("\n== 27. Recuperacao de senha de ponta a ponta com o notificador de teste (V2-F00-E10) ==");

/*
  A seção 14 prova o caminho feliz. Esta prova o que ela não alcança:

  - o link some da barra de endereço assim que a tela o lê;
  - o MESMO link usado duas vezes: a segunda recusada com a frase que manda
    pedir outro, e a senha que a segunda tentou NÃO vale;
  - link inventado dá a mesma frase do link usado (a tela não distingue);
  - o pedido para email de outro município, ou que não existe, tem a mesma
    resposta na tela, e o link de uma conta não mexe em outra;
  - quem está com a sessão aberta e abre um link que não vale não perde a sessão;
  - recuperação desligada no servidor, limite de pedidos e rede caída: a tela
    diz o que fazer em cada caso.

  O link vem do notificador de arquivo (NOTIFICADOR_ARQUIVO), como na seção 14.
  A produção NÃO tem esse canal: `config.ts` derruba a partida com ele.

  Capturas, só quando CAPTURAS_E10 aponta uma pasta, nas duas larguras e nos
  dois temas. A produção desligada e as falhas são provocadas por interceptação
  de rota do navegador (a API deste teste está com a recuperação ligada), e é
  por isso que o console registra 429 e 503 de propósito (ver `ESPERADOS`).
*/
const ALVO_E10 = "tarcisio.ramos@valefundo.exemplo.gov.br";
const SENHA_NOVA_E10 = "tarcisio-senha-nova-2026";

async function capturarE10(pagina, nome, { cheia = true } = {}) {
  const pasta = process.env.CAPTURAS_E10;
  if (!pasta) return;
  const { mkdirSync } = await import("node:fs");
  mkdirSync(pasta, { recursive: true });
  const original = pagina.viewportSize();
  for (const [largura, altura] of [[1280, 900], [390, 844]]) {
    for (const tema of ["claro", "escuro"]) {
      await pagina.setViewportSize({ width: largura, height: altura });
      await pagina.evaluate((t) => {
        document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light";
      }, tema);
      await pagina.waitForTimeout(150);
      await pagina.screenshot({ path: `${pasta}/${nome}-${largura}-${tema}.png`, fullPage: cheia });
    }
  }
  await pagina.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await pagina.setViewportSize(original ?? { width: 1280, height: 900 });
}

function linksEmitidosE10() {
  // O arquivo so existe depois do primeiro envio; antes disso nao ha link nenhum.
  let bruto = "";
  try { bruto = readFileSync(destinoNotificacao, "utf8"); } catch { return []; }
  return [...bruto.matchAll(/https?:\/\/\S*redefinir-senha\?token=\S+/g)].map((m) => m[0]);
}
/** O envio sai DEPOIS da resposta do pedido, entao o arquivo pode levar um instante. */
async function esperarLinkNovoE10(pagina, quantosHavia) {
  for (let i = 0; i < 50; i += 1) {
    const todos = linksEmitidosE10();
    if (todos.length > quantosHavia) return todos.at(-1);
    await pagina.waitForTimeout(200);
  }
  return null;
}

const contextoE10 = await navegador.newContext();
const paginaE10 = await contextoE10.newPage();
registrar(paginaE10);

// ---- O pedido: erro de campo, resposta neutra ----
await paginaE10.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
await paginaE10.waitForSelector("#recuperar-email", { timeout: 30_000 });
ok("com a recuperacao ligada o formulario aparece (a tela perguntou ao servidor antes)",
   (await paginaE10.locator("#recuperar-email").count()) === 1
   && (await paginaE10.locator(".passos").count()) === 0);
await capturarE10(paginaE10, "pedido-normal");

/** Altura de cada controle da tela, no celular: nenhum alvo de toque abaixo de 44 px. */
async function menorAlvoDeToque(pagina) {
  return pagina.evaluate(() => {
    const caixas = [...document.querySelectorAll("input, button, a")]
      .map((e) => e.getBoundingClientRect())
      .filter((c) => c.width > 0 && c.height > 0);
    return Math.min(...caixas.map((c) => Math.round(c.height)));
  });
}
const tamanhoOriginalE10 = paginaE10.viewportSize();
await paginaE10.setViewportSize({ width: 390, height: 844 });
const menorDoPedido = await menorAlvoDeToque(paginaE10);
ok("no celular nenhum controle do pedido tem menos de 44 px de altura", menorDoPedido >= 44, `(${menorDoPedido})`);
await paginaE10.setViewportSize(tamanhoOriginalE10 ?? { width: 1280, height: 900 });

// Teclado: do campo para o botao e deste para o link de voltar, sem armadilha.
await paginaE10.locator("#recuperar-email").focus();
await paginaE10.keyboard.press("Tab");
const aposUmTab = await paginaE10.evaluate(() => document.activeElement?.textContent?.trim());
await paginaE10.keyboard.press("Tab");
const aposDoisTabs = await paginaE10.evaluate(() => document.activeElement?.textContent?.trim());
ok("o Tab vai do email ao botao e do botao ao link de voltar",
   aposUmTab === "Enviar link de redefinição" && aposDoisTabs === "Voltar para a entrada",
   `(${aposUmTab} | ${aposDoisTabs})`);

await paginaE10.getByRole("button", { name: "Enviar link de redefinição" }).click();
await paginaE10.waitForSelector(".campo__erro", { timeout: 10_000 });
ok("email em branco: a frase diz o que digitar",
   (await paginaE10.locator(".campo__erro").textContent()).includes("Informe o seu email funcional."));
ok("e o foco volta para o campo do email",
   (await paginaE10.evaluate(() => document.activeElement?.id)) === "recuperar-email");
await capturarE10(paginaE10, "pedido-erro-vazio");

await paginaE10.locator("#recuperar-email").fill("helena");
await paginaE10.getByRole("button", { name: "Enviar link de redefinição" }).click();
await paginaE10.waitForSelector(".campo__erro", { timeout: 10_000 });
ok("email torto: a frase mostra o formato",
   (await paginaE10.locator(".campo__erro").textContent()).includes("como nome@orgao.gov.br"));
await capturarE10(paginaE10, "pedido-erro-formato");

const antesDoPedidoE10 = linksEmitidosE10().length;
await paginaE10.locator("#recuperar-email").fill(ALVO_E10);
await paginaE10.getByRole("button", { name: "Enviar link de redefinição" }).click();
await paginaE10.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
const respostaDeQuemTemConta = (await paginaE10.locator(".aviso--sucesso").textContent()).trim();
// O link do alvo e lido AGORA, antes dos outros pedidos: o arquivo e o mesmo para todos.
const linkDoAlvoE10 = await esperarLinkNovoE10(paginaE10, antesDoPedidoE10);
await capturarE10(paginaE10, "pedido-enviado");

await paginaE10.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
await paginaE10.locator("#recuperar-email").fill("ninguem-existe-aqui@exemplo.gov.br");
await paginaE10.getByRole("button", { name: "Enviar link de redefinição" }).click();
await paginaE10.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("email que nao existe: a tela diz exatamente o mesmo",
   (await paginaE10.locator(".aviso--sucesso").textContent()).trim() === respostaDeQuemTemConta);

// O pedido de uma conta do OUTRO municipio, feito por uma tela que nao tem nada a ver com ele.
await paginaE10.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
await paginaE10.locator("#recuperar-email").fill("jonas.ferreira@serraalta.exemplo.gov.br");
await paginaE10.getByRole("button", { name: "Enviar link de redefinição" }).click();
await paginaE10.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("email de conta de qualquer municipio: a mesma frase, sem pista de qual municipio e a conta",
   (await paginaE10.locator(".aviso--sucesso").textContent()).trim() === respostaDeQuemTemConta);

await paginaE10.waitForTimeout(800);
ok("o notificador de teste recebeu o link das duas contas que existem e de nenhum email inexistente",
   linkDoAlvoE10 !== null && linksEmitidosE10().length === antesDoPedidoE10 + 2,
   `(${linksEmitidosE10().length - antesDoPedidoE10} novos)`);
const tokenDoAlvoE10 = new URL(linkDoAlvoE10).searchParams.get("token");
ok("o link tem o formato /redefinir-senha?token=...", new URL(linkDoAlvoE10).pathname === "/redefinir-senha"
   && (tokenDoAlvoE10 ?? "").length > 30);

// ---- O link: sai da barra de endereço ----
await paginaE10.goto(`${BASE}/redefinir-senha?token=${encodeURIComponent(tokenDoAlvoE10)}`);
await paginaE10.waitForSelector("#nova-senha", { timeout: 30_000 });
await paginaE10.waitForFunction(() => window.location.search === "", null, { timeout: 5_000 }).catch(() => {});
ok("o token sai da barra de endereco assim que a tela o le",
   !paginaE10.url().includes("token=") && new URL(paginaE10.url()).search === "", paginaE10.url());
ok("e a tela continua funcionando (o token ficou guardado na memoria da pagina)",
   (await paginaE10.locator("#nova-senha").count()) === 1);
await capturarE10(paginaE10, "definir-normal");
await paginaE10.setViewportSize({ width: 390, height: 844 });
const menorDaSenha = await menorAlvoDeToque(paginaE10);
ok("no celular nenhum controle da senha nova tem menos de 44 px de altura", menorDaSenha >= 44, `(${menorDaSenha})`);
await paginaE10.setViewportSize(tamanhoOriginalE10 ?? { width: 1280, height: 900 });

await paginaE10.locator("#nova-senha").fill("curta");
await paginaE10.locator("#repetir-senha").fill("curta");
await paginaE10.getByRole("button", { name: "Definir nova senha" }).click();
await paginaE10.waitForSelector(".campo__erro", { timeout: 10_000 });
ok("senha curta: o erro fica na senha nova, e so nela",
   (await paginaE10.locator(".campo__erro").count()) === 1
   && (await paginaE10.locator("#nova-senha").getAttribute("aria-invalid")) === "true"
   && (await paginaE10.locator("#repetir-senha").getAttribute("aria-invalid")) === null
   && (await paginaE10.locator(".campo__erro").textContent()).includes("pelo menos 12 caracteres"));
await capturarE10(paginaE10, "definir-erro-curta");

await paginaE10.locator("#nova-senha").fill(SENHA_NOVA_E10);
await paginaE10.locator("#repetir-senha").fill("digitei-diferente-aqui");
await paginaE10.getByRole("button", { name: "Definir nova senha" }).click();
await paginaE10.waitForSelector(".campo__erro", { timeout: 10_000 });
ok("senhas diferentes: o erro fica na repeticao, e so nela",
   (await paginaE10.locator(".campo__erro").count()) === 1
   && (await paginaE10.locator("#repetir-senha").getAttribute("aria-invalid")) === "true"
   && (await paginaE10.locator("#nova-senha").getAttribute("aria-invalid")) === null
   && (await paginaE10.locator(".campo__erro").textContent()).includes("precisam ser iguais"));
await capturarE10(paginaE10, "definir-erro-diferentes");

await paginaE10.locator("#repetir-senha").fill(SENHA_NOVA_E10);
await paginaE10.getByRole("button", { name: "Definir nova senha" }).click();
await paginaE10.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("redefine a senha e confirma",
   (await paginaE10.locator(".aviso--sucesso").textContent()).includes("Senha redefinida. Entre com a nova senha."));
ok("a tela oferece ir para a entrada agora",
   (await paginaE10.getByRole("link", { name: "Ir para a entrada" }).count()) === 1);
await paginaE10.waitForURL(/\/entrar/, { timeout: 10_000 }).catch(() => {});
ok("e leva sozinha para a entrada, com recarga completa", new URL(paginaE10.url()).pathname === "/entrar");

const antigaDoAlvoE10 = await viaApiE07("/auth/entrar", { metodo: "POST", corpo: { email: ALVO_E10, senha: SENHA } });
const novaDoAlvoE10 = await viaApiE07("/auth/entrar", { metodo: "POST", corpo: { email: ALVO_E10, senha: SENHA_NOVA_E10 } });
ok("a senha antiga morreu e a nova entra", antigaDoAlvoE10.status === 401 && novaDoAlvoE10.status === 200,
   `(${antigaDoAlvoE10.status} ${novaDoAlvoE10.status})`);
const jonasE10 = await viaApiE07("/auth/entrar", { metodo: "POST", corpo: { email: "jonas.ferreira@serraalta.exemplo.gov.br", senha: SENHA } });
const aurelioE10 = await viaApiE07("/auth/entrar", { metodo: "POST", corpo: { email: "aurelio.machado@valefundo.exemplo.gov.br", senha: SENHA } });
ok("o link de uma conta nao mexeu em nenhuma outra (nem do mesmo municipio, nem do outro)",
   jonasE10.status === 200 && aurelioE10.status === 200, `(${jonasE10.status} ${aurelioE10.status})`);

// ---- O mesmo link duas vezes ----
await paginaE10.goto(`${BASE}/redefinir-senha?token=${encodeURIComponent(tokenDoAlvoE10)}`);
await paginaE10.waitForSelector("#nova-senha", { timeout: 30_000 });
await paginaE10.locator("#nova-senha").fill("outra-senha-que-nao-pode-valer");
await paginaE10.locator("#repetir-senha").fill("outra-senha-que-nao-pode-valer");
await paginaE10.getByRole("button", { name: "Definir nova senha" }).click();
await paginaE10.waitForSelector(".aviso--perigo", { timeout: 20_000 });
const fraseDoLinkUsado = (await paginaE10.locator(".aviso--perigo").textContent()).trim();
ok("o mesmo link duas vezes: a segunda e recusada com a frase que manda pedir outro",
   fraseDoLinkUsado.includes("Este link de redefinição não vale mais.") && fraseDoLinkUsado.includes("Peça um novo link."));
ok("e a tela oferece o caminho de pedir um novo link",
   (await paginaE10.getByRole("link", { name: "Pedir um novo link" }).getAttribute("href")) === "/recuperar-senha"
   && (await paginaE10.locator("#nova-senha").count()) === 0);
await capturarE10(paginaE10, "definir-link-ja-usado");
const naoTrocouE10 = await viaApiE07("/auth/entrar", { metodo: "POST", corpo: { email: ALVO_E10, senha: "outra-senha-que-nao-pode-valer" } });
const continuaE10 = await viaApiE07("/auth/entrar", { metodo: "POST", corpo: { email: ALVO_E10, senha: SENHA_NOVA_E10 } });
ok("a senha que a segunda tentativa quis definir NAO vale; a de antes continua",
   naoTrocouE10.status === 401 && continuaE10.status === 200, `(${naoTrocouE10.status} ${continuaE10.status})`);
const usadoPelaApiE10 = await viaApiE07("/auth/redefinir", { metodo: "POST", corpo: { token: tokenDoAlvoE10, senha: "mais-uma-senha-longa-aqui" } });
ok("pela API tambem: 401", usadoPelaApiE10.status === 401, `(${usadoPelaApiE10.status})`);

// ---- Link inventado: a mesma frase ----
await paginaE10.goto(`${BASE}/redefinir-senha?token=token-inventado-que-nunca-existiu-1234567`);
await paginaE10.waitForSelector("#nova-senha", { timeout: 30_000 });
await paginaE10.locator("#nova-senha").fill("uma-senha-bem-longa-qualquer");
await paginaE10.locator("#repetir-senha").fill("uma-senha-bem-longa-qualquer");
await paginaE10.getByRole("button", { name: "Definir nova senha" }).click();
await paginaE10.waitForSelector(".aviso--perigo", { timeout: 20_000 });
ok("link inventado: exatamente a mesma frase do link usado (a tela nao distingue)",
   (await paginaE10.locator(".aviso--perigo").textContent()).trim() === fraseDoLinkUsado);

// ---- Endereço sem link ----
await paginaE10.goto(`${BASE}/redefinir-senha`);
await paginaE10.waitForSelector(".aviso--perigo", { timeout: 20_000 });
ok("endereco sem link: diz que o link veio incompleto",
   (await paginaE10.locator(".aviso--perigo").textContent()).includes("Este endereço não traz um link de redefinição."));
await capturarE10(paginaE10, "definir-sem-link");

// ---- Quem está com a sessão aberta e abre um link que não vale não perde a sessão ----
await entrar("rita.lopes@serraalta.exemplo.gov.br");
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.goto(`${BASE}/redefinir-senha?token=link-de-outra-pessoa-que-ja-venceu-123456`);
await page.waitForSelector("#nova-senha", { timeout: 30_000 });
await page.locator("#nova-senha").fill("uma-senha-bem-longa-qualquer");
await page.locator("#repetir-senha").fill("uma-senha-bem-longa-qualquer");
await page.getByRole("button", { name: "Definir nova senha" }).click();
await page.waitForSelector(".aviso--perigo", { timeout: 20_000 });
ok("com sessao aberta, o link que nao vale mostra a frase de link, e nao a de sessao encerrada",
   (await page.locator(".aviso--perigo").textContent()).includes("Este link de redefinição não vale mais.")
   && !(await page.locator(".aviso--perigo").textContent()).includes("sessão"));
await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
await page.waitForSelector(".indicador", { timeout: 30_000 });
ok("e a sessao de quem estava logado continua de pe", page.url().includes("/painel"));

// ---- Recuperação desligada no servidor, limite e rede caída ----
await paginaE10.route("**/auth/recuperacao", (rota) => rota.fulfill({
  status: 200, contentType: "application/json", body: JSON.stringify({ ativa: false }),
}));
await paginaE10.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
await paginaE10.waitForSelector(".passos", { timeout: 20_000 });
ok("recuperacao desligada: a tela manda procurar quem administra, com os quatro passos, e nao mostra formulario",
   (await paginaE10.locator(".passos li").count()) === 4
   && (await paginaE10.locator("#recuperar-email").count()) === 0
   && (await paginaE10.locator(".aviso--alerta").textContent()).includes("não está ligada neste município"));
ok("os passos apontam o botao Redefinir senha da lista de Usuarios",
   (await paginaE10.locator(".passos").textContent()).includes("Redefinir senha")
   && (await paginaE10.locator(".passos").textContent()).includes("lista de Usuários"));
await capturarE10(paginaE10, "pedido-desligada");
await paginaE10.unroute("**/auth/recuperacao");

await paginaE10.route("**/auth/recuperar", (rota) => rota.fulfill({
  status: 503, contentType: "application/json",
  body: JSON.stringify({ erro: "recuperacao_desligada", mensagem: "A recuperação de senha por email está desligada neste município." }),
}));
await paginaE10.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
await paginaE10.locator("#recuperar-email").fill("alguem@exemplo.gov.br");
await paginaE10.getByRole("button", { name: "Enviar link de redefinição" }).click();
await paginaE10.waitForSelector(".passos", { timeout: 20_000 });
ok("se o servidor responde 503 recuperacao_desligada no pedido, a tela troca para as instrucoes de quem administra",
   (await paginaE10.locator("#recuperar-email").count()) === 0);
await paginaE10.unroute("**/auth/recuperar");

await paginaE10.route("**/auth/recuperar", (rota) => rota.fulfill({
  status: 429, contentType: "application/json",
  body: JSON.stringify({ erro: "excesso_de_requisicoes", mensagem: "Requisições demais. Aguarde um instante." }),
}));
await paginaE10.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
await paginaE10.locator("#recuperar-email").fill("alguem@exemplo.gov.br");
await paginaE10.getByRole("button", { name: "Enviar link de redefinição" }).click();
await paginaE10.waitForSelector(".aviso--perigo", { timeout: 20_000 });
ok("limite de pedidos (429): a frase manda aguardar, e o formulario continua",
   (await paginaE10.locator(".aviso--perigo").textContent()).includes("Muitos pedidos em pouco tempo")
   && (await paginaE10.locator("#recuperar-email").count()) === 1);
await capturarE10(paginaE10, "pedido-erro-excesso");
await paginaE10.unroute("**/auth/recuperar");

await paginaE10.route("**/auth/recuperar", (rota) => rota.abort("failed"));
await paginaE10.goto(`${BASE}/recuperar-senha`, { waitUntil: "networkidle" });
await paginaE10.locator("#recuperar-email").fill("alguem@exemplo.gov.br");
await paginaE10.getByRole("button", { name: "Enviar link de redefinição" }).click();
await paginaE10.waitForSelector(".aviso--perigo", { timeout: 20_000 });
ok("sem rede: a frase diz que nada foi enviado",
   (await paginaE10.locator(".aviso--perigo").textContent()).includes("Sem conexão com o servidor"));
await capturarE10(paginaE10, "pedido-erro-rede");
await paginaE10.unroute("**/auth/recuperar");
await contextoE10.close();

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
