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
ok(
  "Na fila conta as 6 ativas de Serra Alta",
  naFila.trim() === "6",
  naFila.trim() === "6"
    ? ""
    : `(${naFila.trim()}) A suite exige API recem-iniciada: ela confere contagens ` +
      "exatas da semente, e uma execucao anterior deixa registros para tras. " +
      "Reinicie o servidor da API e rode de novo.",
);
ok("fila mostra a critica primeiro",
   (await page.locator(".tabela tbody tr").first().textContent()).includes("000471/2026"));

console.log("\n== 3. Token no armazenamento, e nunca a senha ==");
const guardado = await page.evaluate(() => sessionStorage.getItem("dc360:tokens"));
ok("tokens guardados na sessao", !!guardado && guardado.includes("acesso"));
const tudo = await page.evaluate(() => JSON.stringify(sessionStorage) + JSON.stringify(localStorage));
ok("a senha nao fica guardada em lugar nenhum", !tudo.includes("defesa-civil-2026"));
ok("nem o hash da senha chega ao navegador", !tudo.includes("scrypt$"));

console.log("\n== 4. Isolamento imposto pelo servidor ==");
await page.getByPlaceholder("Buscar registro ou função").fill("000112");
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
// O erro aparece NO CAMPO, nao num aviso generico no topo: e a anatomia de
// erro que o resto do produto usa, e foi para ca que este formulario veio.
ok("recusa senha curta",
   (await page.textContent("#usuario-senha-erro").catch(() => "")).includes("12 caracteres"));
ok("e marca o campo como invalido para o leitor de tela",
   (await page.locator("#usuario-senha").getAttribute("aria-invalid")) === "true");

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

console.log("\n== 11. Documento oficial gerado pelo servidor ==");
await entrar("helena.coutinho@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });

// A ocorrencia 000473 da semente ja tem vistoria concluida.
await page.goto(`${BASE}/ocorrencias?status=todas&busca=000473`);
await page.waitForTimeout(1500);
await page.locator(".tabela__protocolo").first().click();
await page.waitForSelector(".trilha__item", { timeout: 20_000 });

const botaoLaudo = page.getByRole("button", { name: "Laudo de vistoria" });
ok("o detalhe oferece o laudo quando ha vistoria", (await botaoLaudo.count()) === 1);

const [aba] = await Promise.all([
  page.context().waitForEvent("page"),
  botaoLaudo.click(),
]);
await aba.waitForLoadState("domcontentloaded");
const documento = await aba.content();

ok("o laudo traz o protocolo", documento.includes("000473/2026"));
ok("o laudo identifica o orgao", documento.includes("Defesa Civil de Serra Alta"));
ok("o laudo traz o checklist respondido", documento.includes("Risco iminente identificado"));
ok("o laudo identifica quem assinou", documento.includes("Diego Nakamura Alves"));
ok("o laudo sai marcado como documento de validacao",
   documento.includes("DOCUMENTO DE VALIDA"));
const temImprimir = await aba.getByRole("button", { name: "Imprimir" }).count();
ok("o documento tem botao de imprimir", temImprimir === 1);
await aba.close();

console.log("\n== 12. Isolamento tambem no documento ==");
const urlOcorrenciaComVistoria = page.url();
const idDocumento = urlOcorrenciaComVistoria.split("/").pop();
await entrar("aurelio.machado@valefundo.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
const negado = await page.evaluate(async ({ api, id }) => {
  const tokens = JSON.parse(sessionStorage.getItem("dc360:tokens"));
  const r = await fetch(`${api}/documentos/${id}/laudo`, {
    headers: { authorization: `Bearer ${tokens.acesso}` },
  });
  return r.status;
}, { api: process.env.BASE_API ?? "http://127.0.0.1:3333", id: idDocumento });
ok("outro municipio nao gera o laudo de uma ocorrencia alheia", negado === 404, `(${negado})`);

console.log("\n== 13. Galeria de evidencia no painel ==");
await entrar("diego.alves@serraalta.exemplo.gov.br");
// O agente cai em "Meu trabalho", nao no painel do coordenador.
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });

// Sobe uma foto pelo caminho real da API, como o aplicativo de campo faria.
const envio = await page.evaluate(async ({ api, ocorrenciaId }) => {
  const tokens = JSON.parse(sessionStorage.getItem("dc360:tokens"));
  const cab = { "content-type": "application/json", authorization: `Bearer ${tokens.acesso}` };

  const pixel = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ), (c) => c.charCodeAt(0));

  const autorizacao = await (await fetch(`${api}/evidencias/autorizar-envio`, {
    method: "POST", headers: cab,
    body: JSON.stringify({
      ocorrenciaId,
      nomeArquivo: "trinca.png",
      tipoConteudo: "image/png",
      tamanhoBytes: pixel.length,
      capturadaEm: new Date().toISOString(),
      legenda: "Trinca na parede dos fundos",
      ordem: 0,
    }),
  })).json();

  const put = await fetch(autorizacao.url, {
    method: "PUT", headers: autorizacao.cabecalhos, body: pixel,
  });

  const confirmacao = await fetch(`${api}/evidencias/confirmar-envio`, {
    method: "POST", headers: cab,
    body: JSON.stringify({ evidenciaId: autorizacao.evidenciaId }),
  });

  return { put: put.status, confirmacao: confirmacao.status };
}, { api: process.env.BASE_API ?? "http://127.0.0.1:3333", ocorrenciaId: idDocumento });

ok("os bytes sobem direto para o armazenamento", envio.put === 200, `(${envio.put})`);
ok("o servidor confirma o envio", envio.confirmacao === 200, `(${envio.confirmacao})`);

await entrar("helena.coutinho@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
await page.goto(`${BASE}/ocorrencias/${idDocumento}`);
await page.waitForSelector(".galeria__item", { timeout: 20_000 });

ok("a foto do agente aparece para o coordenador",
   (await page.locator(".galeria__item").count()) === 1);
ok("a legenda vem junto",
   (await page.textContent(".galeria__legenda")).includes("Trinca na parede dos fundos"));

// A imagem carrega de verdade, e nao e um quadrado quebrado.
const carregou = await page.locator(".galeria__item img").evaluate(
  (img) => img.complete && img.naturalWidth > 0,
);
ok("a imagem carrega pela URL assinada", carregou);

await page.locator(".galeria__item").first().click();
await page.waitForSelector(".modal__painel", { timeout: 10_000 });
ok("clicar amplia a foto", await page.locator(".modal__painel img").isVisible());

// Abrir a foto tem que levar o foco junto: sem isso, quem navega por teclado
// abre a ampliacao e continua com o foco na miniatura, sem alcancar o Fechar.
const focoNaAmpliacao = await page.evaluate(() =>
  document.activeElement?.textContent?.trim() ?? "");
ok("o foco vai para o botao Fechar ao ampliar", focoNaAmpliacao === "Fechar",
   `(${focoNaAmpliacao})`);

await page.keyboard.press("Escape");
await page.waitForTimeout(300);
ok("Escape fecha a ampliacao", (await page.locator(".modal__painel").count()) === 0);

// E o foco volta para a miniatura de onde a foto veio, senao o lugar na
// galeria se perde a cada foto aberta.
const focoDepois = await page.evaluate(() =>
  document.activeElement?.className ?? "");
ok("o foco volta para a miniatura ao fechar",
   focoDepois.includes("galeria__item"), `(${focoDepois})`);

await page.locator(".galeria__item").first().click();
await page.waitForSelector(".modal__painel", { timeout: 10_000 });
await page.getByRole("button", { name: "Fechar" }).click();
await page.waitForTimeout(300);
ok("o botao Fechar tambem fecha", (await page.locator(".modal__painel").count()) === 0);

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

console.log("\n== 15. Prestacao de contas ==");
await entrar("helena.coutinho@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });

await page.getByRole("link", { name: "Prestação de contas" }).click();
await page.waitForSelector(".barras", { timeout: 20_000 });

const resumoTexto = await page.textContent(".conteudo");
ok("mostra o tempo mediano, nao a media", resumoTexto.includes("Tempo mediano até encerrar"));
ok("quebra por tipo de ocorrencia", resumoTexto.includes("Deslizamento"));

await page.waitForSelector(".tabela tbody tr", { timeout: 20_000 });
const eventosNaTrilha = await page.locator(".tabela tbody tr").count();
ok("a trilha do municipio aparece", eventosNaTrilha > 0, `(${eventosNaTrilha})`);

const primeiraLinha = await page.locator(".tabela tbody tr").first().textContent();
ok("cada evento diz quem agiu", /Coordenador|Operador|Agente/.test(primeiraLinha));

await page.locator("#trilha-autor").fill("helena");
await page.getByRole("button", { name: "Filtrar", exact: true }).click();
await page.waitForTimeout(1500);
const linhasFiltradas = await page.locator(".tabela tbody tr").allTextContents();
ok("filtrar por autor funciona",
   linhasFiltradas.length > 0 && linhasFiltradas.every((l) => l.includes("Helena")),
   `(${linhasFiltradas.length} linhas)`);

const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 30_000 }),
  page.getByRole("button", { name: /Baixar ocorrências em CSV/ }).click(),
]);
ok("o CSV e baixado com nome de arquivo util",
   /ocorrencias-\d{4}-\d{2}-\d{2}\.csv/.test(download.suggestedFilename()),
   `(${download.suggestedFilename()})`);

const conteudoCsv = readFileSync(await download.path(), "utf8");
ok("o CSV traz o cabecalho legivel", conteudoCsv.includes("Protocolo;Tipo (COBRADE)"));
ok("nenhuma celula do CSV comeca com caractere de formula",
   !conteudoCsv.split(/\r?\n/).some((linha) => linha.split(";").some((c) => /^[=+@]/.test(c))));

console.log("\n== 16. Auditoria so para quem tem papel ==");
await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
ok("operador nao ve Prestacao de contas no menu",
   (await page.locator(".lateral__item", { hasText: "Prestação de contas" }).count()) === 0);

const negadoTrilha = await page.evaluate(async (api) => {
  const tokens = JSON.parse(sessionStorage.getItem("dc360:tokens"));
  const r = await fetch(`${api}/trilha`, {
    headers: { authorization: `Bearer ${tokens.acesso}` },
  });
  return r.status;
}, process.env.BASE_API ?? "http://127.0.0.1:3333");
ok("e a API recusa mesmo contornando a tela", negadoTrilha === 403, `(${negadoTrilha})`);

console.log("\n== 17. Vinculo de duplicidade e providencias no painel ==");
await entrar("helena.coutinho@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });

// Abre um chamado, e depois outro no mesmo endereco, vinculando.
await page.goto(`${BASE}/ocorrencias/nova`);
await page.waitForSelector("#nova-solicitante", { timeout: 20_000 });
await page.locator("#nova-tipo").selectOption("alagamento");
await page.locator("#nova-solicitante").fill("Primeiro vizinho");
await page.locator("#nova-endereco").fill("Rua do Vinculo Visivel, 300, Centro");
await page.locator("#nova-descricao").fill("Agua entrando no comercio.");
await page.getByRole("button", { name: /Registrar e gerar protocolo/ }).click();
await page.waitForURL(/\/ocorrencias\/[0-9a-f-]{36}$/, { timeout: 30_000 });
const protocoloOriginal = (await page.locator("h1 .mono").textContent()).trim();
const urlOriginal = page.url();

await page.goto(`${BASE}/ocorrencias/nova`);
await page.waitForSelector("#nova-solicitante", { timeout: 20_000 });
await page.locator("#nova-tipo").selectOption("alagamento");
await page.locator("#nova-solicitante").fill("Segundo vizinho");
await page.locator("#nova-endereco").fill("Rua do Vinculo Visivel, 302, Centro");
await page.locator("#nova-descricao").fill("Mesma agua, dois numeros adiante.");
await page.getByRole("button", { name: /Registrar e gerar protocolo/ }).click();

// A tela de duplicidade aparece porque o tipo e o endereco batem.
await page.waitForSelector("text=Já existe chamado parecido", { timeout: 20_000 });
ok("a duplicidade e detectada na abertura", true);
await page.getByRole("button", { name: /Registrar vinculando a este/ }).first().click();
await page.waitForURL(/\/ocorrencias\/[0-9a-f-]{36}$/, { timeout: 30_000 });
// waitForURL volta na navegacao; o detalhe ainda esta carregando os dados.
await page.waitForSelector(".trilha__item", { timeout: 20_000 });

const textoFilha = await page.textContent(".conteudo");
ok("a filha diz de quem e continuacao",
   textoFilha.includes("continuação de") && textoFilha.includes(protocoloOriginal));

await page.goto(urlOriginal);
await page.waitForSelector(".trilha__item", { timeout: 20_000 });
const textoOriginal = await page.textContent(".conteudo");
ok("a original avisa que ha outro chamado sobre o mesmo evento",
   textoOriginal.includes("sobre o mesmo evento"));
ok("e avisa que encerrar um nao encerra o outro",
   textoOriginal.includes("Encerrar este não encerra os outros"));

// Providencia pendente aparece no painel, e continua apos encerrar.
await page.goto(`${BASE}/painel`);
await page.waitForSelector(".indicador", { timeout: 20_000 });
const textoPainel = await page.textContent(".conteudo");
ok("o painel conta providencias vencidas", textoPainel.includes("Providências vencidas"));
ok("o painel lista as providencias sem resposta",
   textoPainel.includes("Providências aguardando resposta"));
ok("e explica por que elas continuam ali",
   textoPainel.includes("somem da fila assim que a ocorrência é encerrada"));

console.log("\n== 18. O agente de campo tem a tela dele ==");
await entrar("diego.alves@serraalta.exemplo.gov.br");
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });

ok("o agente cai em Meu trabalho, nao no painel do coordenador",
   page.url().endsWith("/meu-trabalho"), `(${page.url()})`);
ok("o titulo da tela e o dele",
   (await page.textContent(".cabecalho-pagina h1")).includes("Meu trabalho"));

// O aviso mais importante: este painel nao funciona sem sinal, e o agente
// precisa saber disso antes de sair, nao no barranco.
const avisos = await page.locator(".aviso").allTextContents();
ok("a tela avisa que precisa de conexao",
   avisos.some((t) => /precisa de conex/i.test(t)), `(${avisos.join(" | ").slice(0, 100)})`);
ok("e diz onde fica o trabalho sem sinal",
   avisos.some((t) => /aplicativo de campo/i.test(t)));

const cartoes = await page.locator(".cartao__titulo, .cartao h2").allTextContents();
ok("mostra as vistorias designadas para a equipe dele",
   cartoes.some((t) => /designadas/i.test(t)), `(${cartoes.join(" | ")})`);
ok("mostra o que ele ja concluiu",
   cartoes.some((t) => /conclu/i.test(t)));
ok("mostra qual e a equipe dele",
   cartoes.some((t) => /minha equipe/i.test(t)));

const equipe = await page.locator(".par__valor").allTextContents();
ok("nomeia a equipe", equipe.some((t) => t.includes("Alfa")), `(${equipe.join(" | ")})`);

// O menu dele nao oferece o que ele nao pode fazer.
const menu = await page.locator(".lateral__item").allTextContents();
ok("o menu do agente comeca por Meu trabalho",
   menu.some((t) => t.includes("Meu trabalho")), `(${menu.join(" | ")})`);
ok("o menu do agente nao tem o painel do coordenador",
   !menu.some((t) => t.trim() === "Painel"), `(${menu.join(" | ")})`);
ok("nem a tabela de todas as ocorrencias",
   !menu.some((t) => t.includes("Ocorrências")), `(${menu.join(" | ")})`);
ok("nem administracao de usuarios",
   !menu.some((t) => t.includes("Usuários")), `(${menu.join(" | ")})`);

// E abrir a URL na mao tambem nao entrega o formulario.
await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
ok("abrir /usuarios pela URL mostra recusa, nao o formulario",
   (await page.locator("#usuario-nome").count()) === 0);
ok("e a recusa explica o que fazer",
   ((await page.textContent(".aviso")) ?? "").includes("administra o município"));

console.log("\n== 19. Erro de rede fala portugues ==");
await entrar("helena.coutinho@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
await page.goto(`${BASE}/ocorrencias/nova`, { waitUntil: "networkidle" });
await page.waitForSelector("#nova-solicitante", { timeout: 30_000 });
await page.locator("#nova-tipo").selectOption("vendaval");
await page.locator("#nova-solicitante").fill("Teste de queda de rede");
await page.locator("#nova-endereco").fill("Rua Sem Sinal, 1, Centro");
await page.locator("#nova-descricao").fill("Registro que nao deve chegar ao servidor.");

// Derruba a rota para a API e envia: o agente precisa saber que nada foi
// gravado, e nao ler "Failed to fetch".
//
// O padrao sai de BASE_API, e nao de uma porta fixa. Ele ficou preso em 3333
// por meses e ninguem viu, porque esta suite nunca rodou na integracao
// continua: com a API em qualquer outra porta, a interceptacao nao casava, a
// requisicao ia normalmente, e as duas verificacoes abaixo reprovavam por
// motivo que nao tinha nada a ver com o produto.
const alvoDeRede = new URL(process.env.BASE_API ?? "http://127.0.0.1:3333");
await contexto.route(`**/${alvoDeRede.host}/**`, (rota) => rota.abort());
await page.getByRole("button", { name: /Registrar e gerar protocolo/ }).click();
await page.waitForTimeout(2500);
const mensagemDeRede = (await page.locator(".aviso, .campo__erro").allTextContents()).join(" ");
ok("erro de rede vira frase em portugues",
   /sem conex/i.test(mensagemDeRede), `(${mensagemDeRede.slice(0, 90)})`);
ok("e diz que nada foi enviado",
   /nao foi enviado|não foi enviado/i.test(mensagemDeRede));
// Mesmo alvo do `route` acima. Estava com a porta fixa e removia um padrão
// que nunca tinha sido registrado, ou seja, era linha morta ao lado de outra
// linha morta. Com a interceptação funcionando, esquecer o `unroute` derruba
// a rede para todas as seções seguintes.
await contexto.unroute(`**/${alvoDeRede.host}/**`);

console.log("\n== 20. Corrigir cadastro sem recriar a conta ==");
await entrar("helena.coutinho@serraalta.exemplo.gov.br");
await page.waitForSelector(".indicador", { timeout: 30_000 });
await page.getByRole("link", { name: "Usuários" }).click();
await page.waitForSelector("#usuario-nome", { timeout: 20_000 });

// O coordenador nao pode conceder papel de administrador, entao a opcao nem
// aparece: oferecer o que o servidor recusa e construir o beco de proposito.
const papeisOferecidos = await page.locator("#usuario-papel option").allTextContents();
ok("coordenador nao ve o papel de administrador no seletor",
   !papeisOferecidos.some((t) => /Administrador/i.test(t)), `(${papeisOferecidos.join(" | ")})`);

const linhaMarcos = page.locator("tbody tr", { hasText: "marcos.teles@serraalta.exemplo.gov.br" });
await linhaMarcos.getByRole("button", { name: "Corrigir" }).click();
await page.waitForTimeout(600);
ok("corrigir carrega o cadastro no formulario",
   (await page.locator("#usuario-nome").inputValue()) === "Marcos Vinicius Teles");
ok("e o formulario nao pede senha na correcao",
   (await page.locator("#usuario-senha").count()) === 0);

await page.locator("#usuario-nome").fill("Marcos Vinicius Teles Junior");
await page.getByRole("button", { name: "Salvar correção" }).click();
await page.waitForTimeout(1500);
ok("a correcao aparece na tabela",
   (await page.textContent("tbody")).includes("Marcos Vinicius Teles Junior"));

console.log("\n== 21. Trocar equipe depois de despachar ==");
/*
  A ocorrência deste bloco é criada e despachada aqui, e não pescada da lista.

  A primeira versão abria a primeira linha do filtro "em campo", e falhava de
  vez em quando: o que está em campo depende do que as seções anteriores
  fizeram, e uma delas conclui vistoria. Portão que falha às vezes ensina a
  ignorar vermelho, que é pior do que não ter portão.
*/
const paraRedespachar = await page.evaluate(async ({ api }) => {
  const tokens = JSON.parse(sessionStorage.getItem("dc360:tokens"));
  const cab = { "content-type": "application/json", authorization: `Bearer ${tokens.acesso}` };

  const criada = await (await fetch(`${api}/ocorrencias`, {
    method: "POST", headers: cab,
    body: JSON.stringify({
      tipo: "vendaval",
      endereco: "Rua do Redespacho, 77, Centro",
      solicitanteNome: "Neuza Aparecida Bento",
      canalEntrada: "telefone",
      descricao: "Telhado parcialmente arrancado por rajada de vento.",
    }),
  })).json();

  await fetch(`${api}/ocorrencias/${criada.id}/triagem`, {
    method: "POST", headers: cab,
    body: JSON.stringify({ severidade: "media", vulnerabilidadePresente: false }),
  });

  const equipes = await (await fetch(`${api}/equipes`, { headers: cab })).json();
  const equipe = equipes.itens.find((e) => e.ativa);
  await fetch(`${api}/ocorrencias/${criada.id}/despacho`, {
    method: "POST", headers: cab,
    body: JSON.stringify({ equipeId: equipe.id, prazoHoras: 24 }),
  });

  return criada.id;
}, { api: process.env.BASE_API ?? "http://127.0.0.1:3333" });

await page.goto(`${BASE}/ocorrencias/${paraRedespachar}`, { waitUntil: "networkidle" });
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 20_000 });

const trocar = page.getByRole("heading", { name: "Trocar equipe ou prazo" });
ok("ocorrencia ja em campo oferece trocar equipe ou prazo",
   (await trocar.count()) >= 1, `(${await trocar.count()})`);

await page.locator("#despacho-prazo").fill("8");
await page.getByRole("button", { name: "Salvar troca" }).click();
await page.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("a troca confirma que ficou registrada",
   ((await page.textContent(".aviso--sucesso")) ?? "").includes("trilha"));

const eventosDespacho = await page
  .locator(".linha-tempo__item, .linha-tempo li, .trilha__item").allTextContents();
ok("e a trilha guarda os dois despachos",
   eventosDespacho.filter((t) => /despach/i.test(t)).length >= 2,
   `(${eventosDespacho.filter((t) => /despach/i.test(t)).length})`);

console.log("\n== 22. Minha conta e troca de senha ==");
await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
await page.waitForSelector(".indicador", { timeout: 30_000 });
await page.locator(".identidade--acionavel").click();
await page.waitForSelector("#conta-senha-atual", { timeout: 20_000 });
ok("a identidade no topo leva para a propria conta", page.url().endsWith("/minha-conta"));

await page.locator("#conta-senha-atual").fill(SENHA);
await page.locator("#conta-senha-nova").fill("curta");
await page.locator("#conta-senha-repetida").fill("curta");
await page.getByRole("button", { name: "Trocar senha" }).click();
await page.waitForTimeout(600);
ok("recusa senha nova curta, no campo",
   ((await page.textContent("#conta-senha-nova-erro")) ?? "").includes("12 caracteres"));

const SENHA_NOVA = "senha-nova-da-helena-2026";
await page.locator("#conta-senha-nova").fill(SENHA_NOVA);
await page.locator("#conta-senha-repetida").fill("outra-coisa-qualquer");
await page.getByRole("button", { name: "Trocar senha" }).click();
await page.waitForTimeout(600);
ok("recusa quando a repeticao nao bate",
   ((await page.textContent("#conta-senha-repetida-erro")) ?? "").includes("não são iguais"));

await page.locator("#conta-senha-repetida").fill(SENHA_NOVA);
await page.getByRole("button", { name: "Trocar senha" }).click();
await page.waitForSelector(".aviso--sucesso", { timeout: 20_000 });
ok("a troca acontece e avisa que as outras sessoes cairam",
   ((await page.textContent(".aviso--sucesso")) ?? "").toLowerCase().includes("sess"));

// E a prova real: a senha nova entra, e a antiga nao.
await entrar("helena.coutinho@serraalta.exemplo.gov.br", SENHA_NOVA);
ok("a senha nova entra", true);

// A senha antiga precisa ter morrido. A pergunta é do servidor, e é ele que
// responde: perguntar pela tela dependeria de a tela estar certa.
const recusaDaAntiga = await page.evaluate(async ({ api }) => {
  const r = await fetch(`${api}/auth/entrar`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "helena.coutinho@serraalta.exemplo.gov.br",
      senha: "defesa-civil-2026",
    }),
  });
  return r.status;
}, { api: process.env.BASE_API ?? "http://127.0.0.1:3333" });
ok("a senha antiga deixa de valer", recusaDaAntiga === 401, `(${recusaDaAntiga})`);

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
