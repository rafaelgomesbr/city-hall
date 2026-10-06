/**
 * COPIA APARADA para provar a secao 14 (recuperacao de senha, mantida pela E10) isolada: o e2e
 * completo cai na secao 13 (CORS do PUT, E18, pre-existente). Cabecalho, secao 14 e rodape, sem alteracao.
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


console.log("\n== 14. Recuperacao de senha ==");
await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
const jaLogado = await page.locator("#entrada-email").count();
if (jaLogado === 0) {
  await page.goto(`${BASE}/painel`);
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForSelector("#entrada-email", { timeout: 20_000 });
}

await page.getByRole("link", { name: "Esqueceu a senha?" }).click();
await page.waitForSelector("#recuperar-email", { timeout: 20_000 });

const alvoRecuperacao = "simone.paz@valefundo.exemplo.gov.br";
await page.locator("#recuperar-email").fill(alvoRecuperacao);
await page.getByRole("button", { name: /Enviar link/ }).click();
await page.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
const respostaRecuperacao = await page.textContent(".aviso--sucesso");
ok("responde sem confirmar se a conta existe",
   respostaRecuperacao.includes("Se existir conta com esse email"));

// A mesma resposta para email que nao existe: e o que impede a tela de virar
// verificador de quais servidores a prefeitura tem.
await page.goto(`${BASE}/recuperar-senha`);
await page.waitForSelector("#recuperar-email", { timeout: 20_000 });
await page.locator("#recuperar-email").fill("ninguem-mesmo@exemplo.gov.br");
await page.getByRole("button", { name: /Enviar link/ }).click();
await page.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("resposta identica para email inexistente",
   (await page.textContent(".aviso--sucesso")) === respostaRecuperacao);

/*
  O link vem do canal de arquivo do notificador, e não mais do log.

  Ele saía no log até o dia em que o log parou de imprimir o corpo da
  mensagem, por segurança e com razão. A consequência passou despercebida por
  dias: 49 das 103 verificações abaixo deixaram de ser alcançadas, porque esta
  linha lançava e derrubava o arquivo inteiro. Ninguém viu, porque esta suíte
  nunca esteve na integração contínua.

  `NOTIFICADOR_ARQUIVO` é canal de teste, e `config.ts` derruba a partida se
  ele aparecer em produção.
*/
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
const notificacoes = readFileSync(destinoNotificacao, "utf8");
const links = [...notificacoes.matchAll(/https?:\/\/\S*redefinir-senha\?token=\S+/g)].map((m) => m[0]);
ok("um link de redefinicao foi emitido", links.length >= 1, `(${links.length})`);

const tokenRecuperacao = new URL(links.at(-1)).searchParams.get("token");
await page.goto(`${BASE}/redefinir-senha?token=${encodeURIComponent(tokenRecuperacao)}`);
await page.waitForSelector("#nova-senha", { timeout: 20_000 });

await page.locator("#nova-senha").fill("senha-nova-da-simone-2026");
await page.locator("#repetir-senha").fill("digitei-diferente");
await page.getByRole("button", { name: /Definir nova senha/ }).click();
await page.waitForTimeout(400);
ok("recusa quando as duas digitacoes diferem",
   (await page.textContent(".campo__erro")).includes("precisam ser iguais"));

await page.locator("#repetir-senha").fill("senha-nova-da-simone-2026");
await page.getByRole("button", { name: /Definir nova senha/ }).click();
await page.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("redefine a senha", (await page.textContent(".aviso--sucesso")).includes("Senha redefinida"));

await page.goto(`${BASE}/entrar`);
await page.waitForSelector("#entrada-email", { timeout: 20_000 });
await page.locator("#entrada-email").fill(alvoRecuperacao);
await page.locator("#entrada-senha").fill(SENHA);
await page.getByRole("button", { name: "Entrar", exact: true }).click();
await page.waitForSelector(".campo__erro", { timeout: 20_000 });
ok("a senha antiga nao vale mais", page.url().includes("/entrar"));

await entrar(alvoRecuperacao, "senha-nova-da-simone-2026");
ok("a senha nova entra", (await page.textContent(".identidade__nome")).includes("Simone"));


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
