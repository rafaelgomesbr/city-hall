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

const API_E07 = process.env.BASE_API ?? "http://127.0.0.1:3333";
const SENHA_DA_HELENA_E07 = "senha-nova-da-helena-2026";
const NOVA_DA_HELENA_E07 = SENHA; // aparado: a secao 24 nao rodou, a senha e a da semente

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

console.log("\n== 26. Redefinir senha e encerrar sessoes pelo painel (V2-F00-E09) ==");
/*
  As tres rotas existiam com teste e nenhuma tela as chamava. Aqui a prova e de
  ponta a ponta, no navegador e na API reais:

  - a administradora ve os dois botoes na linha de quem esta abaixo do posto
    dela e nao os ve na propria linha; a coordenadora nao os ve em quem tem posto
    igual ou maior;
  - "Encerrar sessoes" pergunta (com a quantidade de sessoes abertas, a mesma que
    a API conta), devolve o foco ao botao ao cancelar e, ao confirmar, derruba
    os tokens de renovacao do alvo;
  - "Redefinir senha" mostra a senha temporaria UMA vez, com a frase de que nao
    volta; a senha antiga morre, as sessoes caem, a temporaria entra e exige a
    troca antes de qualquer tela;
  - "Encerrar minhas outras sessoes" derruba um segundo navegador e preserva este.

  Capturas, so quando CAPTURAS_E09 aponta uma pasta (evidencia da etapa), nas
  duas larguras e nos dois temas. O tema troca pelo atributo, sem recarregar,
  para a janela aberta continuar aberta na captura.
*/
const SENHA_DO_DIEGO_E09 = "senha-nova-do-diego-2026";
const FORMATO_TEMPORARIA_E09 = /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/;

async function capturarE09(pagina, nome, { cheia = true } = {}) {
  const pasta = process.env.CAPTURAS_E09;
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
      await pagina.screenshot({
        path: `${pasta}/${nome}-${largura}-${tema}.png`, fullPage: cheia,
      });
    }
  }
  await pagina.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await pagina.setViewportSize(original ?? { width: 1280, height: 900 });
}

try {
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
} catch { /* Firefox e WebKit nao conhecem estas permissoes: a copia e conferida pelas duas frases possiveis */ }

async function entrarNaPagina(pagina, email, senha) {
  await pagina.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("#entrada-email", { timeout: 30_000 });
  await pagina.locator("#entrada-email").fill(email);
  await pagina.locator("#entrada-senha").fill(senha);
  await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
}

const ritaApiE09 = await viaApiE07("/auth/entrar", {
  metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA },
});
const usuariosE09 = await viaApiE07("/usuarios", { token: ritaApiE09.json.acesso });
const diegoE09 = usuariosE09.json.itens.find((u) => u.email === "diego.alves@serraalta.exemplo.gov.br");
const helenaE09 = usuariosE09.json.itens.find((u) => u.email === "helena.coutinho@serraalta.exemplo.gov.br");
ok("a administradora lista os usuarios pela API e acha Diego", Boolean(diegoE09), `(${ritaApiE09.status})`);

// Duas sessoes de Diego abertas por fora do painel: o aparelho antigo e o celular.
const diegoAntigoE09 = await viaApiE07("/auth/entrar", {
  metodo: "POST", corpo: { email: "diego.alves@serraalta.exemplo.gov.br", senha: SENHA },
});
const diegoCelularE09 = await viaApiE07("/auth/entrar", {
  metodo: "POST", corpo: { email: "diego.alves@serraalta.exemplo.gov.br", senha: SENHA },
});
ok("o agente tem sessoes abertas em dois aparelhos", diegoAntigoE09.status === 200 && diegoCelularE09.status === 200);

// ---- Usuarios: quem ve os botoes ----------------------------------------
await entrar("rita.lopes@serraalta.exemplo.gov.br");
// `entrar` devolve assim que ve um cartao, e a tela de entrada tambem tem um.
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
const linhaDeDiego = page.locator("tbody tr", { hasText: "diego.alves@serraalta.exemplo.gov.br" });
const linhaDeRita = page.locator("tbody tr", { hasText: "rita.lopes@serraalta.exemplo.gov.br" });
const totalDeLinhasE09 = await page.locator("tbody tr").count();
ok("na linha de Diego existem os dois botoes novos",
   (await linhaDeDiego.getByRole("button", { name: "Redefinir senha" }).count()) === 1
   && (await linhaDeDiego.getByRole("button", { name: "Encerrar sessões" }).count()) === 1);
ok("na propria linha da administradora nao existe nenhum dos dois",
   (await linhaDeRita.getByRole("button", { name: "Redefinir senha" }).count()) === 0
   && (await linhaDeRita.getByRole("button", { name: "Encerrar sessões" }).count()) === 0);
ok("a administradora ve os botoes em todas as linhas menos na dela",
   (await page.getByRole("button", { name: "Redefinir senha" }).count()) === totalDeLinhasE09 - 1
   && (await page.getByRole("button", { name: "Encerrar sessões" }).count()) === totalDeLinhasE09 - 1,
   `(${totalDeLinhasE09} linhas)`);
await capturarE09(page, "usuarios-administradora");

// ---- Encerrar sessoes de outra pessoa ----------------------------------
const antesDeEncerrarE09 = await viaApiE07(`/usuarios/${diegoE09.id}/sessoes`, { token: ritaApiE09.json.acesso });
ok("a API conta as sessoes abertas de Diego (pelo menos as duas deste teste)",
   antesDeEncerrarE09.status === 200 && antesDeEncerrarE09.json.sessoesAbertas >= 2,
   `(${antesDeEncerrarE09.status} ${antesDeEncerrarE09.json.sessoesAbertas})`);

await linhaDeDiego.getByRole("button", { name: "Encerrar sessões" }).click();
const janelaE09 = page.getByRole("dialog");
await janelaE09.waitFor({ timeout: 10_000 });
// A leitura da quantidade chega depois da janela: espera a frase que a traz, nao so o "Conferindo".
await janelaE09.getByText(/tem \d+ sessões abertas/).waitFor({ timeout: 10_000 });
const textoDaJanelaE09 = (await janelaE09.textContent()) ?? "";
ok("a pergunta diz o nome da pessoa e quantas sessoes ela tem abertas, o mesmo numero da API",
   textoDaJanelaE09.includes("Diego")
   && textoDaJanelaE09.includes(`tem ${antesDeEncerrarE09.json.sessoesAbertas} sessões abertas`),
   `(${textoDaJanelaE09.slice(0, 160)})`);
ok("o botao da pergunta repete o ato com o nome da pessoa",
   (await janelaE09.getByRole("button", { name: /^Encerrar sessões de Diego/ }).count()) === 1);
ok("a pergunta diz que a senha nao muda", textoDaJanelaE09.includes("senha, que não muda"));
await capturarE09(page, "usuarios-confirmar-encerrar", { cheia: false });

await janelaE09.getByRole("button", { name: "Cancelar" }).click();
await janelaE09.waitFor({ state: "detached", timeout: 10_000 });
const focoVoltouE09 = await page.evaluate(() => document.activeElement?.textContent?.trim());
ok("cancelar fecha a janela e devolve o foco ao botao que a abriu", focoVoltouE09 === "Encerrar sessões", `(${focoVoltouE09})`);
ok("cancelar nao derrubou ninguem",
   (await viaApiE07("/auth/renovar", { metodo: "POST", corpo: { renovacao: diegoAntigoE09.json.renovacao } })).status === 200);

await linhaDeDiego.getByRole("button", { name: "Encerrar sessões" }).click();
await janelaE09.waitFor({ timeout: 10_000 });
await janelaE09.getByRole("button", { name: /^Encerrar sessões de Diego/ }).click();
await page.waitForSelector(".toast", { timeout: 20_000 });
const toastE09 = (await page.locator(".toast").textContent()) ?? "";
ok("o aviso passageiro confirma, com o nome e a quantidade",
   /Sessões de Diego.* encerradas\. \d+ sessões caíram\./.test(toastE09), `(${toastE09})`);
ok("o aviso e anunciado como status para o leitor de tela",
   (await page.locator(".toast[role=status]").count()) === 1);
await capturarE09(page, "usuarios-sessoes-encerradas-aviso", { cheia: false });
ok("o token de renovacao do aparelho antigo morreu",
   (await viaApiE07("/auth/renovar", { metodo: "POST", corpo: { renovacao: diegoAntigoE09.json.renovacao } })).status === 401);
ok("e o do celular tambem",
   (await viaApiE07("/auth/renovar", { metodo: "POST", corpo: { renovacao: diegoCelularE09.json.renovacao } })).status === 401);
ok("a API conta zero sessoes abertas de Diego",
   (await viaApiE07(`/usuarios/${diegoE09.id}/sessoes`, { token: ritaApiE09.json.acesso })).json.sessoesAbertas === 0);
ok("a senha de Diego nao mudou: ele entra com a mesma",
   (await viaApiE07("/auth/entrar", { metodo: "POST", corpo: { email: diegoE09.email, senha: SENHA } })).status === 200);

// ---- Redefinir a senha de outra pessoa ---------------------------------
const diegoAntesDaSenhaE09 = await viaApiE07("/auth/entrar", {
  metodo: "POST", corpo: { email: diegoE09.email, senha: SENHA },
});
await linhaDeDiego.getByRole("button", { name: "Redefinir senha" }).click();
await janelaE09.waitFor({ timeout: 10_000 });
const perguntaDaSenhaE09 = (await janelaE09.textContent()) ?? "";
ok("a pergunta da senha diz que a atual deixa de valer, que a temporaria vale 72 horas e que aparece uma vez",
   perguntaDaSenhaE09.includes("deixa de valer agora")
   && perguntaDaSenhaE09.includes("72 horas")
   && perguntaDaSenhaE09.includes("uma única vez"), `(${perguntaDaSenhaE09.slice(0, 120)})`);
ok("o botao da pergunta repete o ato com o nome da pessoa",
   (await janelaE09.getByRole("button", { name: /^Redefinir a senha de Diego/ }).count()) === 1);
ok("o foco comeca em Cancelar, nao no botao que grava",
   (await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancelar");
await capturarE09(page, "usuarios-confirmar-redefinir", { cheia: false });

await janelaE09.getByRole("button", { name: /^Redefinir a senha de Diego/ }).click();
await page.waitForSelector(".senha-temporaria__valor", { timeout: 20_000 });
const temporariaE09 = ((await page.locator(".senha-temporaria__valor").textContent()) ?? "").trim();
ok("a janela mostra a senha temporaria no formato ditavel", FORMATO_TEMPORARIA_E09.test(temporariaE09), `(${temporariaE09.length} caracteres)`);
const textoDaSenhaE09 = (await page.getByRole("dialog").textContent()) ?? "";
ok("a janela diz 'Anote agora' e que a senha nao aparece de novo",
   textoDaSenhaE09.includes("Anote agora") && textoDaSenhaE09.includes("não aparece de novo"));
ok("diz de quem e a senha e quantas sessoes cairam junto",
   textoDaSenhaE09.includes("Diego") && /\d+ sessões abertas desta conta foram encerradas|1 sessão aberta desta conta foi encerrada/.test(textoDaSenhaE09));
ok("a senha esta em fonte tabular", (await page.locator(".senha-temporaria__valor.mono").count()) === 1);
ok("o foco entra na janela, no primeiro botao",
   (await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Copiar senha");
await page.getByRole("button", { name: "Copiar senha" }).click();
await page.waitForSelector(".senha-temporaria__estado:not(:empty)", { timeout: 10_000 });
const estadoDaCopiaE09 = ((await page.locator(".senha-temporaria__estado").textContent()) ?? "").trim();
ok("copiar responde com uma das duas frases (copiada, ou como copiar a mao)",
   /Senha copiada\./.test(estadoDaCopiaE09) || /Não foi possível copiar/.test(estadoDaCopiaE09), `(${estadoDaCopiaE09})`);
if (/Senha copiada/.test(estadoDaCopiaE09)) {
  const naAreaE09 = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  ok("o que foi copiado e a senha", naAreaE09 === temporariaE09);
}
await capturarE09(page, "usuarios-senha-temporaria", { cheia: false });

await page.mouse.click(5, 5);
ok("clicar fora NAO fecha a janela da senha (a unica copia nao some por esbarrao)",
   (await page.locator(".senha-temporaria__valor").count()) === 1);
await page.getByRole("button", { name: "Já anotei a senha" }).click();
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
ok("ao fechar, a senha some da tela", !((await page.locator("body").textContent()) ?? "").includes(temporariaE09));
ok("o foco volta ao botao da linha",
   (await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Redefinir senha");

ok("a senha antiga morreu",
   (await viaApiE07("/auth/entrar", { metodo: "POST", corpo: { email: diegoE09.email, senha: SENHA } })).status === 401);
ok("a sessao que existia antes da redefinicao caiu",
   (await viaApiE07("/auth/renovar", { metodo: "POST", corpo: { renovacao: diegoAntesDaSenhaE09.json.renovacao } })).status === 401);
const entradaTemporariaE09 = await viaApiE07("/auth/entrar", {
  metodo: "POST", corpo: { email: diegoE09.email, senha: temporariaE09 },
});
ok("a temporaria entra, e a sessao so alcanca a troca de senha",
   entradaTemporariaE09.status === 200 && entradaTemporariaE09.json.trocaDeSenhaObrigatoria === true,
   `(${entradaTemporariaE09.status})`);

// A agente entra pelo painel com a temporaria e e levada a definir a senha dela.
const contextoDoDiego = await navegador.newContext();
const paginaDoDiego = await contextoDoDiego.newPage();
registrar(paginaDoDiego);
await entrarNaPagina(paginaDoDiego, diegoE09.email, temporariaE09);
await paginaDoDiego.getByRole("heading", { name: "Defina a sua senha" }).waitFor({ timeout: 30_000 });
ok("a agente entra com a temporaria e a tela pede a senha nova antes de qualquer outra",
   (await paginaDoDiego.locator(".indicador").count()) === 0);
await paginaDoDiego.locator("#senha-nova").fill(SENHA_DO_DIEGO_E09);
await paginaDoDiego.locator("#senha-nova-repetida").fill(SENHA_DO_DIEGO_E09);
await paginaDoDiego.getByRole("button", { name: "Definir senha e entrar" }).click();
await paginaDoDiego.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
ok("a agente define a senha e entra", !paginaDoDiego.url().includes("/entrar"));
ok("a sessao aberta com a temporaria pela API caiu na troca (so a atual sobrevive)",
   (await viaApiE07("/auth/renovar", { metodo: "POST", corpo: { renovacao: entradaTemporariaE09.json.renovacao } })).status === 401);

// Minha conta de quem tem uma sessao so: lista com "Esta sessao" e a frase de que e a unica.
await paginaDoDiego.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
await paginaDoDiego.waitForSelector(".sessoes__item", { timeout: 20_000 });
ok("a agente ve uma unica sessao, marcada como esta",
   (await paginaDoDiego.locator(".sessoes__item").count()) === 1
   && (await paginaDoDiego.locator(".sessoes__item .selo", { hasText: "Esta sessão" }).count()) === 1);
ok("e a tela diz que e a unica, sem oferecer o botao de encerrar as outras",
   ((await paginaDoDiego.locator("body").textContent()) ?? "").includes("única sessão aberta")
   && (await paginaDoDiego.getByRole("button", { name: "Encerrar minhas outras sessões" }).count()) === 0);
await capturarE09(paginaDoDiego, "minha-conta-sessao-unica");

// O agente chama as tres rotas de administracao: 403 sem_permissao.
const tokenDoDiegoE09 = await paginaDoDiego.evaluate(() => JSON.parse(sessionStorage.getItem("dc360:tokens")).acesso);
const tresRotasE09 = [
  await viaApiE07(`/usuarios/${helenaE09.id}/sessoes`, { token: tokenDoDiegoE09 }),
  await viaApiE07(`/usuarios/${helenaE09.id}/redefinir-senha`, { metodo: "POST", token: tokenDoDiegoE09 }),
  await viaApiE07(`/usuarios/${helenaE09.id}/encerrar-sessoes`, { metodo: "POST", token: tokenDoDiegoE09 }),
];
ok("o agente de campo recebe 403 sem_permissao nas tres rotas",
   tresRotasE09.every((r) => r.status === 403 && r.json.erro === "sem_permissao"),
   `(${tresRotasE09.map((r) => r.status).join(",")})`);
await contextoDoDiego.close();

// ---- Minha conta: encerrar as outras derruba um segundo navegador --------
const contextoB = await navegador.newContext();
const paginaB = await contextoB.newPage();
registrar(paginaB);
await entrarNaPagina(paginaB, "rita.lopes@serraalta.exemplo.gov.br", SENHA);
await paginaB.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
const tokensDeBE09 = await paginaB.evaluate(() => JSON.parse(sessionStorage.getItem("dc360:tokens")));

await page.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
await page.waitForSelector(".sessoes__item", { timeout: 20_000 });
const itensAntesE09 = await page.locator(".sessoes__item").count();
ok("Minha conta lista as sessoes abertas (esta, a do outro navegador e as da API)", itensAntesE09 >= 2, `(${itensAntesE09})`);
ok("exatamente uma esta marcada como 'Esta sessao', e e a primeira da lista",
   (await page.locator(".sessoes__item .selo", { hasText: "Esta sessão" }).count()) === 1
   && (await page.locator(".sessoes__item").first().locator(".selo", { hasText: "Esta sessão" }).count()) === 1);
const textoDaListaE09 = (await page.locator(".sessoes").textContent()) ?? "";
ok("a lista mostra o navegador em uma frase e nao entrega IP nem o texto do user-agent",
   /Chrome|Firefox|Safari|Edge|Aparelho não identificado/.test(textoDaListaE09)
   && !/Mozilla|AppleWebKit|HeadlessChrome\/\d/.test(textoDaListaE09)
   && !/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(textoDaListaE09));
await capturarE09(page, "minha-conta-sessoes");

await page.getByRole("button", { name: "Encerrar minhas outras sessões" }).click();
await janelaE09.waitFor({ timeout: 10_000 });
const perguntaDasOutrasE09 = (await janelaE09.textContent()) ?? "";
ok("a pergunta diz que esta sessao continua aberta e que a senha nao muda",
   perguntaDasOutrasE09.includes("Esta sessão continua aberta") && perguntaDasOutrasE09.includes("a senha não muda"));
ok("o botao da pergunta repete o ato com a quantidade",
   (await janelaE09.getByRole("button", { name: new RegExp(`^Encerrar as outras ${itensAntesE09 - 1} sessões`) }).count()) === 1);
await capturarE09(page, "minha-conta-confirmar-outras", { cheia: false });
await janelaE09.getByRole("button", { name: /^Encerrar as outras/ }).click();
await page.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("a confirmacao diz que esta continua aberta",
   ((await page.locator(".aviso--sucesso").textContent()) ?? "").includes("Esta continua aberta"));
await page.waitForFunction(() => document.querySelectorAll(".sessoes__item").length === 1, null, { timeout: 20_000 });
ok("a lista passa a ter so esta sessao", (await page.locator(".sessoes__item").count()) === 1);
ok("e a tela continua aberta: recarregar nao leva a entrada",
   await (async () => {
     await page.reload({ waitUntil: "networkidle" });
     await page.waitForSelector(".sessoes__item", { timeout: 20_000 });
     return !page.url().includes("/entrar");
   })());
await capturarE09(page, "minha-conta-sessoes-depois");
ok("o token de renovacao do segundo navegador morreu",
   (await viaApiE07("/auth/renovar", { metodo: "POST", corpo: { renovacao: tokensDeBE09.renovacao } })).status === 401);
const escritaDeBE09 = await viaApiE07(`/usuarios/${diegoE09.id}/encerrar-sessoes`, {
  metodo: "POST", token: tokensDeBE09.acesso,
});
ok("e o token de acesso dele nao escreve mais: 401 sessao_encerrada",
   escritaDeBE09.status === 401 && escritaDeBE09.json.erro === "sessao_encerrada",
   `(${escritaDeBE09.status} ${escritaDeBE09.json.erro})`);
await contextoB.close();

// ---- A coordenadora nao ve os botoes em quem tem posto igual ou maior ------
await entrar("helena.coutinho@serraalta.exemplo.gov.br", NOVA_DA_HELENA_E07);
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
const linhasDaCoordenadoraE09 = await page.locator("tbody tr").all();
let comBotaoE09 = 0, comBotaoIndevidoE09 = 0;
for (const linha of linhasDaCoordenadoraE09) {
  const papel = (await linha.locator("td").nth(2).textContent())?.trim() ?? "";
  const tem = (await linha.getByRole("button", { name: "Redefinir senha" }).count()) === 1
    && (await linha.getByRole("button", { name: "Encerrar sessões" }).count()) === 1;
  const nenhum = (await linha.getByRole("button", { name: "Redefinir senha" }).count()) === 0
    && (await linha.getByRole("button", { name: "Encerrar sessões" }).count()) === 0;
  const abaixo = papel === "Operador de plantão" || papel === "Agente de campo";
  if (abaixo && tem) comBotaoE09++;
  if (abaixo && !tem) comBotaoIndevidoE09++;
  if (!abaixo && !nenhum) comBotaoIndevidoE09++;
}
ok("a coordenadora ve os botoes em operador e agente, e em mais ninguem (posto igual ou maior)",
   comBotaoE09 >= 2 && comBotaoIndevidoE09 === 0, `(${comBotaoE09} com, ${comBotaoIndevidoE09} indevidos)`);
await capturarE09(page, "usuarios-coordenadora");

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
