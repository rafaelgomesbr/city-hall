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
  "Failed to load resource: the server responded with a status of (401|403|404|422)",
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


import { mkdirSync } from "node:fs";
const DIR_CAPTURAS = process.env.CAPTURAS;
mkdirSync(DIR_CAPTURAS, { recursive: true });
async function capturas(estado) {
  for (const [largura, altura] of [[1280, 900], [390, 844]]) {
    for (const tema of ["claro", "escuro"]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.evaluate((t) => localStorage.setItem("dc360:tema", t), tema);
      // A primeira de "depois" sai com o aviso de sucesso ainda na tela (sem recarregar).
      const semRecarregar = estado.startsWith("depois") && largura === 1280 && tema === "claro";
      if (!semRecarregar) {
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForSelector("#conta-senha-atual", { timeout: 20_000 });
      }
      if (semRecarregar) {
        await page.evaluate(() => document.querySelector(".aviso--sucesso")?.scrollIntoView({ block: "center" }));
      }
      await page.screenshot({
        path: `${DIR_CAPTURAS}/papel-${estado}-${largura}-${tema}${semRecarregar ? "-com-aviso" : ""}.png`,
        fullPage: false,
      });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => localStorage.setItem("dc360:tema", "claro"));
  if (estado.startsWith("antes")) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#conta-senha-atual", { timeout: 20_000 });
  }
}

console.log("\n== 24. Papel alterado com a tela aberta: a escrita seguinte renova em silencio (V2-F00-E07) ==");
/*
  A coordenadora esta logada no painel quando a administradora (Rita) rebaixa
  o perfil dela para operador. A leitura com token vivo nao vai ao banco, entao
  nada acontece ate ela ESCREVER: a troca de senha em "Minha conta" e a escrita
  que a tela sabe fazer sem preparo. O servidor responde 401 `nao_autenticado`
  ("renove e repita"), o painel renova sozinho, o token novo ja traz o papel
  novo, e a escrita passa. A pessoa nao e mandada para a entrada e a tela passa
  a mostrar so o que o papel novo tem (o menu Usuarios some).
*/
const API_E07 = process.env.BASE_API ?? "http://127.0.0.1:3333";
const SENHA_DA_HELENA_E07 = SENHA;
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

const ritaE07 = await viaApiE07("/auth/entrar", {
  metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA },
});
ok("a administradora entra pela API", ritaE07.status === 200, `(${ritaE07.status})`);
const listaE07 = await viaApiE07("/usuarios", { token: ritaE07.json.acesso });
const helenaE07 = listaE07.json.itens.find((u) => u.email === "helena.coutinho@serraalta.exemplo.gov.br");

await entrar("helena.coutinho@serraalta.exemplo.gov.br", SENHA_DA_HELENA_E07);
await page.waitForSelector(".indicador", { timeout: 30_000 });
const menuUsuarios = page.getByRole("link", { name: "Usuários" });
ok("a coordenadora ve o menu Usuarios", (await menuUsuarios.count()) === 1);
await page.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
await page.waitForSelector("#conta-senha-atual", { timeout: 20_000 });

const rebaixada = await viaApiE07(`/usuarios/${helenaE07.id}`, {
  metodo: "PATCH", token: ritaE07.json.acesso,
  corpo: {
    nome: helenaE07.nome, matricula: helenaE07.matricula, email: helenaE07.email, papel: "operador",
  },
});
ok("a administradora rebaixa a coordenadora para operador", rebaixada.status === 200, `(${rebaixada.status})`);

// A leitura com token vivo ainda passa: o menu continua la ate a primeira escrita.
ok("a tela dela ainda mostra o menu, porque nada foi escrito", (await menuUsuarios.count()) === 1);
await capturas("antes-da-escrita");

const pedidosE07 = [];
page.on("response", (r) => {
  if (r.url().includes("/auth/trocar-senha") || r.url().includes("/auth/renovar")) {
    pedidosE07.push(`${new URL(r.url()).pathname}:${r.status()}`);
  }
});
await page.locator("#conta-senha-atual").fill(SENHA_DA_HELENA_E07);
await page.locator("#conta-senha-nova").fill(NOVA_DA_HELENA_E07);
await page.locator("#conta-senha-repetida").fill(NOVA_DA_HELENA_E07);
await page.getByRole("button", { name: "Trocar senha" }).click();
await page.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("a escrita passa, sem mandar a pessoa para a entrada", !page.url().includes("/entrar"));
ok("o painel tentou, levou 401, renovou e repetiu",
   pedidosE07.join(" ") === "/auth/trocar-senha:401 /auth/renovar:200 /auth/trocar-senha:200",
   `(${pedidosE07.join(" ")})`);
ok("a tela passa a mostrar so o que o papel novo tem: o menu Usuarios some",
   (await menuUsuarios.count()) === 0);
const papelNaTelaE07 = await page.evaluate(() => JSON.parse(sessionStorage.getItem("dc360:sessao")).papel);
ok("a sessao da tela guarda o papel novo", papelNaTelaE07 === "operador", `(${papelNaTelaE07})`);
await capturas("depois-da-escrita");

// E no servidor o papel rebaixado vale de verdade: despachar deixou de ser dela.
const tokensDelaE07 = await page.evaluate(() => JSON.parse(sessionStorage.getItem("dc360:tokens")));
const despachoDelaE07 = await viaApiE07("/ocorrencias/11111111-1111-4111-8111-0000000000c1/despacho", {
  metodo: "POST", token: tokensDelaE07.acesso,
  corpo: { equipeId: "11111111-1111-4111-8111-0000000000e1", prazoHoras: 24 },
});
ok("o token renovado nao despacha equipe: 403 sem_permissao",
   despachoDelaE07.status === 403 && despachoDelaE07.json.erro === "sem_permissao",
   `(${despachoDelaE07.status} ${despachoDelaE07.json.erro})`);
// Devolve o papel, para a ordem das secoes futuras nao depender desta.
await viaApiE07(`/usuarios/${helenaE07.id}`, {
  metodo: "PATCH", token: ritaE07.json.acesso,
  corpo: {
    nome: helenaE07.nome, matricula: helenaE07.matricula, email: helenaE07.email, papel: "coordenador",
  },
});

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
