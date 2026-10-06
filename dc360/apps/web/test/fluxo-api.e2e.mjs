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
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

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
  // O mesmo aborto, como o Firefox o registra, SO para o pedido do pacote de saida
  // (secao 28, que derruba a rota de proposito para conferir a frase de rede).
  "Cross-Origin Request Blocked: .*/saida/pacote\.zip.*CORS request did not succeed",
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


console.log("\n== 23. Sessão encerrada e conta desativada: a frase certa na tela de entrada (V2-F00-E05) ==");
/*
  Duas pessoas ao mesmo tempo, e por isso dois contextos de navegador: a
  coordenadora age no painel dela, e o Marcos (criado na seção 9) segue com a
  sessão aberta no dele, sem saber de nada. O que se confere é o PRÓXIMO PEDIDO
  de escrita do Marcos, porque é nele que a vigência recusa (a leitura com token
  vivo segue pela assinatura até a F03-E03). A escrita que a tela dele sabe
  fazer sem preparo é a troca de senha em "Minha conta".

  Duas frases, porque são duas situações com ações opostas: sessão encerrada
  manda entrar de novo; conta desativada diz que entrar de novo não resolve.
*/
const API_E05 = process.env.BASE_API ?? "http://127.0.0.1:3333";
const SENHA_DO_MARCOS = "senha-inicial-do-marcos";

async function abrirComoMarcos() {
  const contextoDele = await navegador.newContext();
  const paginaDele = await contextoDele.newPage();
  registrar(paginaDele);
  await paginaDele.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await paginaDele.waitForSelector("#entrada-email", { timeout: 30_000 });
  await paginaDele.locator("#entrada-email").fill("marcos.teles@serraalta.exemplo.gov.br");
  await paginaDele.locator("#entrada-senha").fill(SENHA_DO_MARCOS);
  await paginaDele.getByRole("button", { name: "Entrar", exact: true }).click();
  // Esperar a SAÍDA da tela de entrada: ela mesma tem `.cartao`, e navegar antes
  // de a sessão ser gravada devolve a pessoa para a entrada.
  await paginaDele.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30_000 });
  await paginaDele.waitForSelector(".indicador, .cartao", { timeout: 30_000 });
  await paginaDele.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
  await paginaDele.waitForSelector("#conta-senha-atual", { timeout: 20_000 });
  return { contextoDele, paginaDele };
}

async function tentarTrocarSenha(paginaDele) {
  await paginaDele.locator("#conta-senha-atual").fill(SENHA_DO_MARCOS);
  await paginaDele.locator("#conta-senha-nova").fill("outra-senha-do-marcos-2026");
  await paginaDele.locator("#conta-senha-repetida").fill("outra-senha-do-marcos-2026");
  await paginaDele.getByRole("button", { name: "Trocar senha" }).click();
  await paginaDele.waitForURL(/\/entrar/, { timeout: 20_000 });
  await paginaDele.waitForSelector(".aviso", { timeout: 20_000 });
}

// Helena (no painel de cima) entra com a senha que trocou na seção 22.
await entrar("helena.coutinho@serraalta.exemplo.gov.br", "senha-nova-da-helena-2026");
await page.waitForSelector(".indicador", { timeout: 30_000 });
const idDoMarcos = await page.evaluate(async ({ api }) => {
  const tokens = JSON.parse(sessionStorage.getItem("dc360:tokens"));
  const lista = await (await fetch(`${api}/usuarios`, {
    headers: { authorization: `Bearer ${tokens.acesso}` },
  })).json();
  return lista.itens.find((u) => u.email === "marcos.teles@serraalta.exemplo.gov.br").id;
}, { api: API_E05 });

// 23a. Sessão encerrada por quem administra: entrar de novo resolve.
{
  const { contextoDele, paginaDele } = await abrirComoMarcos();
  const encerradas = await page.evaluate(async ({ api, id }) => {
    const tokens = JSON.parse(sessionStorage.getItem("dc360:tokens"));
    const r = await fetch(`${api}/usuarios/${id}/encerrar-sessoes`, {
      method: "POST", headers: { authorization: `Bearer ${tokens.acesso}` },
    });
    return r.status;
  }, { api: API_E05, id: idDoMarcos });
  ok("a coordenacao encerra as sessoes do Marcos", encerradas === 200, `(${encerradas})`);

  await tentarTrocarSenha(paginaDele);
  const aviso = (await paginaDele.locator(".aviso").first().textContent()) ?? "";
  ok("sessao encerrada leva a tela de entrada", paginaDele.url().includes("/entrar"));
  ok("e diz que a sessao foi encerrada, sem dizer que expirou", /sess[ãa]o foi encerrada/i.test(aviso)
     && !/expirou/i.test(aviso), `(${aviso.slice(0, 80)})`);
  ok("e manda entrar de novo", /entre de novo/i.test(aviso));
  ok("o token morto nao fica guardado",
     (await paginaDele.evaluate(() => sessionStorage.getItem("dc360:tokens"))) === null);
  await contextoDele.close();
}

// 23b. Conta desativada pelo painel: entrar de novo NÃO resolve.
{
  const { contextoDele, paginaDele } = await abrirComoMarcos();
  await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
  await page.waitForSelector("#usuario-nome", { timeout: 20_000 });
  const linha = page.locator("tbody tr", { hasText: "marcos.teles@serraalta.exemplo.gov.br" });
  await linha.getByRole("button", { name: "Desativar" }).click();
  await page.getByRole("button", { name: /^Desativar Marcos/ }).click();
  await linha.getByRole("button", { name: "Reativar" }).waitFor({ timeout: 20_000 });
  ok("a coordenacao desativa o Marcos pelo painel", true);

  await tentarTrocarSenha(paginaDele);
  const aviso = (await paginaDele.locator(".aviso").first().textContent()) ?? "";
  ok("conta desativada leva a tela de entrada", paginaDele.url().includes("/entrar"));
  ok("e diz que a conta foi desativada", /sua conta foi desativada/i.test(aviso), `(${aviso.slice(0, 80)})`);
  ok("e manda procurar a coordenacao, e nao entrar de novo",
     /procure a coordena[çc][ãa]o do seu munic[íi]pio/i.test(aviso) && /n[ãa]o\s+resolve/i.test(aviso));
  ok("com aviso de perigo, e nao o de sessao expirada",
     (await paginaDele.locator(".aviso--perigo").count()) === 1 && !/expirou/i.test(aviso));

  // E entrar de novo de fato nao resolve: a entrada recusa com a frase generica
  // da senha errada, sem contar que a conta existe nem que foi desativada.
  await paginaDele.locator("#entrada-email").fill("marcos.teles@serraalta.exemplo.gov.br");
  await paginaDele.locator("#entrada-senha").fill(SENHA_DO_MARCOS);
  await paginaDele.getByRole("button", { name: "Entrar", exact: true }).click();
  await paginaDele.waitForSelector(".campo__erro", { timeout: 20_000 });
  const recusa = (await paginaDele.locator(".campo__erro").first().textContent()) ?? "";
  ok("a entrada continua com a recusa generica", /inv[áa]lidos/i.test(recusa) && !/desativ/i.test(recusa),
     `(${recusa.slice(0, 80)})`);
  await contextoDele.close();
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

console.log("\n== 25. Agente de campo nao le oficio e o sino dele e o da equipe (V2-F00-E08) ==");
/*
  O token do agente (o aparelho que cai e e emprestado) lia, antes, a lista e a
  ficha dos oficios do municipio inteiro (com o e-mail do orgao, as observacoes
  da coordenacao e o IP de quem abriu o link) e o sino de todas as equipes. Aqui
  a prova e pela API de verdade, com os tokens da semente, e a tela do dossie e
  conferida nos dois lados: o agente abre a ocorrencia da equipe dele sem o
  cartao de oficios (e sem a pagina cair por causa de um 403), e o operador
  continua vendo o cartao.
*/
const OC_ALFA_4_E08 = "11111111-1111-4111-8111-0000000000c4";

/**
 * Capturas do dossie, so quando CAPTURAS_E08 aponta uma pasta (evidencia da
 * etapa). Nas duas larguras e nos dois temas, depois de recarregar, para o tema
 * valer desde o primeiro desenho.
 */
async function capturarE08(nome) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(process.env.CAPTURAS_E08, { recursive: true });
  for (const [largura, altura] of [[1280, 900], [390, 844]]) {
    for (const tema of ["claro", "escuro"]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.evaluate((t) => localStorage.setItem("dc360:tema", t), tema);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector(".cartao", { timeout: 30_000 });
      await page.screenshot({
        path: `${process.env.CAPTURAS_E08}/${nome}-${largura}-${tema}.png`, fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}
const ritaE08 = await viaApiE07("/auth/entrar", {
  metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA },
});
const diegoE08 = await viaApiE07("/auth/entrar", {
  metodo: "POST", corpo: { email: "diego.alves@serraalta.exemplo.gov.br", senha: SENHA },
});
ok("a administradora e o agente entram pela API",
   ritaE08.status === 200 && diegoE08.status === 200, `(${ritaE08.status} ${diegoE08.status})`);

const pendentesE08 = await viaApiE07("/ocorrencias/providencias/pendentes", { token: ritaE08.json.acesso });
const daAlfaE08 = pendentesE08.json.itens.find((p) => p.ocorrencia_id === OC_ALFA_4_E08);
ok("a semente tem providencia pendente na ocorrencia da Equipe Alfa", Boolean(daAlfaE08));

const emitidoE08 = await viaApiE07("/oficios", {
  metodo: "POST", token: ritaE08.json.acesso, corpo: { providenciaId: daAlfaE08?.id },
});
ok("a administradora emite o oficio", emitidoE08.status === 201 || emitidoE08.status === 409,
   `(${emitidoE08.status} ${emitidoE08.json.erro ?? ""})`);
const oficioIdE08 = emitidoE08.json.id
  ?? (await viaApiE07(`/oficios?ocorrenciaId=${OC_ALFA_4_E08}`, { token: ritaE08.json.acesso })).json.itens[0]?.id;

const listaDoAgenteE08 = await viaApiE07("/oficios", { token: diegoE08.json.acesso });
ok("GET /oficios com o token do agente: 403 sem_permissao",
   listaDoAgenteE08.status === 403 && listaDoAgenteE08.json.erro === "sem_permissao",
   `(${listaDoAgenteE08.status} ${listaDoAgenteE08.json.erro})`);
const fichaDoAgenteE08 = await viaApiE07(`/oficios/${oficioIdE08}`, { token: diegoE08.json.acesso });
ok("GET /oficios/:id com o token do agente: 403 sem_permissao, sem e-mail nem IP no corpo",
   fichaDoAgenteE08.status === 403 && fichaDoAgenteE08.json.erro === "sem_permissao"
   && !("orgao_email" in fichaDoAgenteE08.json) && !("aberturas" in fichaDoAgenteE08.json),
   `(${fichaDoAgenteE08.status} ${JSON.stringify(fichaDoAgenteE08.json).slice(0, 80)})`);
const fichaDaAdminE08 = await viaApiE07(`/oficios/${oficioIdE08}`, { token: ritaE08.json.acesso });
ok("a administradora abre a mesma ficha (200)",
   fichaDaAdminE08.status === 200 && fichaDaAdminE08.json.numero, `(${fichaDaAdminE08.status})`);

// O sino: tudo o que o agente recebe pertence a ocorrencia da equipe dele.
const minhasE08 = await viaApiE07("/ocorrencias?status=todas&porPagina=100", { token: diegoE08.json.acesso });
const idsDaEquipeE08 = new Set(minhasE08.json.itens.map((i) => i.id));
const sinoDoAgenteE08 = await viaApiE07("/avisos", { token: diegoE08.json.acesso });
const sinoDaAdminE08 = await viaApiE07("/avisos", { token: ritaE08.json.acesso });
ok("o sino do agente responde 200", sinoDoAgenteE08.status === 200, `(${sinoDoAgenteE08.status})`);
ok("todo aviso do agente e de ocorrencia da equipe dele",
   sinoDoAgenteE08.json.itens.every((a) => idsDaEquipeE08.has(a.ocorrenciaId)),
   `(${sinoDoAgenteE08.json.itens.map((a) => a.ocorrenciaId).join(",")})`);
const foraDoRecorteE08 = sinoDaAdminE08.json.itens.filter((a) => !idsDaEquipeE08.has(a.ocorrenciaId));
ok("o sino da administradora tem avisos de outras equipes (e o agente nao os recebe)",
   foraDoRecorteE08.length > 0
   && foraDoRecorteE08.every((a) => !sinoDoAgenteE08.json.itens.some((b) => b.id === a.id)),
   `(${foraDoRecorteE08.length})`);
ok("o numero de nao lidos do agente e o da lista dele, nao o do municipio",
   sinoDoAgenteE08.json.naoLidos === sinoDoAgenteE08.json.itens.filter((a) => !a.lido).length
   && sinoDoAgenteE08.json.naoLidos < sinoDaAdminE08.json.naoLidos,
   `(${sinoDoAgenteE08.json.naoLidos} x ${sinoDaAdminE08.json.naoLidos})`);

// A tela: o agente abre o dossie da equipe dele e a pagina nao cai.
await entrar("diego.alves@serraalta.exemplo.gov.br");
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.goto(`${BASE}/ocorrencias/${OC_ALFA_4_E08}`, { waitUntil: "networkidle" });
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.waitForSelector(".cartao", { timeout: 30_000 });
const textoDoAgenteE08 = (await page.locator("body").textContent()) ?? "";
ok("o agente abre o dossie da propria equipe, sem faixa de erro",
   (await page.locator(".aviso--perigo").count()) === 0 && textoDoAgenteE08.includes("000"),
   `(${textoDoAgenteE08.slice(0, 60)})`);
ok("e o cartao de oficios nem aparece para ele",
   !textoDoAgenteE08.includes("Ofícios de encaminhamento"));
if (process.env.CAPTURAS_E08) await capturarE08("agente-dossie");

await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.goto(`${BASE}/ocorrencias/${OC_ALFA_4_E08}`, { waitUntil: "networkidle" });
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.waitForSelector(".cartao", { timeout: 30_000 });
const textoDoOperadorE08 = (await page.locator("body").textContent()) ?? "";
ok("o operador abre o mesmo dossie e continua vendo o cartao de oficios",
   textoDoOperadorE08.includes("Ofícios de encaminhamento"));
ok("com o numero do oficio que a administradora emitiu",
   textoDoOperadorE08.includes(fichaDaAdminE08.json.numero ?? "sem-numero"));
if (process.env.CAPTURAS_E08) await capturarE08("operador-dossie");

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

console.log("\n== 28. Baixar o pacote de saida pelo painel, contra a API real (V2-F00-E11) ==");

/*
  O botao "Baixar pacote de saida" chamou `/pacote.zip` por tres semanas, e a rota
  e `/saida/pacote.zip`: todo clique era 404, e nenhum teste via o CLIENTE (o da API
  chamava a rota certa direto). Esta secao e a prova que faltava, de ponta a ponta:

  - a administradora clica no botao e o NAVEGADOR recebe o arquivo: nome
    `dc360-pacote-de-saida-AAAA-MM-DD.zip`, assinatura `PK`, tamanho maior que zero;
  - o ZIP baixado e aberto com um leitor independente do escritor do produto, e o
    conteudo e conferido: o indice, `tabelas/ocorrencias.csv`, um laudo em
    `documentos/`, a soma SHA-256 de CADA arquivo contra o arquivo de verdade, so
    linhas do municipio de quem pediu (linha a linha, pelo `organizacao_id`), e
    nenhuma coluna ou tabela que nunca sai;
  - `/pacote.zip` na raiz e 404 (o defeito era o prefixo) e `GET` na rota nova tambem;
  - um 401 no primeiro pedido renova o token e baixa (a renovacao e real, a API
    responde; so o 401 e provocado, porque o token de verdade vive 15 minutos);
  - recusa: coordenadora (403 `sem_permissao`, o corpo e o REAL da API) e municipio
    suspenso (403 `acesso_suspenso`, a frase do servidor por interceptacao: o e2e nao
    tem como suspender um municipio) mostram a frase do servidor na tela; rede caida
    diz que o ARQUIVO nao foi baixado.

  Dado: so a semente sintetica de Serra Alta. O ZIP baixado e apagado no fim e, como
  evidencia, so saem a lista de nomes e as somas (EVIDENCIA_E11 aponta a pasta).
  Capturas, so quando CAPTURAS_E11 aponta uma pasta.

  O leitor de ZIP abaixo e do formato classico (sem ZIP64): o pacote da semente e
  pequeno. O do produto (ZIP64) e coberto em `apps/api/test/saida-de-municipio.test.ts`.
*/
const API_E11 = process.env.BASE_API ?? "http://127.0.0.1:3333";
const ID_SERRA_ALTA_E11 = "11111111-1111-4111-8111-000000000001";
const ID_VALE_FUNDO_E11 = "22222222-2222-4222-8222-000000000002";

async function capturarE11(pagina, nome) {
  const pasta = process.env.CAPTURAS_E11;
  if (!pasta) return;
  const { mkdirSync } = await import("node:fs");
  mkdirSync(pasta, { recursive: true });
  const original = pagina.viewportSize();
  for (const [largura, altura] of [[1280, 900], [390, 844]]) {
    for (const tema of ["claro", "escuro"]) {
      await pagina.setViewportSize({ width: largura, height: altura });
      await pagina.evaluate((t) => {
        document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light";
        // Tela da janela, com o cartao da saida no meio: a captura de pagina
        // inteira desenha o topo e o menu fixos no meio da imagem, e isso nao
        // e o que a pessoa ve.
        const titulo = [...document.querySelectorAll("h2")].find((h) => h.textContent.includes("Saída de município"));
        titulo?.closest(".cartao")?.scrollIntoView({ block: "center" });
      }, tema);
      await pagina.waitForTimeout(200);
      await pagina.screenshot({ path: `${pasta}/${nome}-${largura}-${tema}.png`, fullPage: false });
    }
  }
  await pagina.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await pagina.setViewportSize(original ?? { width: 1280, height: 900 });
}

async function viaApiE11(caminho, { metodo = "GET", token, corpo } = {}) {
  const r = await fetch(`${API_E11}${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/** Le o ZIP pelo diretorio central, que e como todo descompactador le. */
function lerZipE11(bytes) {
  let fim = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("nao e um ZIP: fim do diretorio central nao encontrado");
  const total = bytes.readUInt16LE(fim + 10);
  let p = bytes.readUInt32LE(fim + 16);
  const arquivos = new Map();
  for (let n = 0; n < total; n += 1) {
    if (bytes.readUInt32LE(p) !== 0x02014b50) throw new Error("entrada central invalida");
    const metodo = bytes.readUInt16LE(p + 10);
    const comprimido = bytes.readUInt32LE(p + 20);
    const original = bytes.readUInt32LE(p + 24);
    const tNome = bytes.readUInt16LE(p + 28);
    const tExtra = bytes.readUInt16LE(p + 30);
    const tComentario = bytes.readUInt16LE(p + 32);
    const deslocamento = bytes.readUInt32LE(p + 42);
    const nome = bytes.subarray(p + 46, p + 46 + tNome).toString("utf8");
    const inicio = deslocamento + 30 + bytes.readUInt16LE(deslocamento + 26) + bytes.readUInt16LE(deslocamento + 28);
    const cru = bytes.subarray(inicio, inicio + comprimido);
    const conteudo = metodo === 8 ? inflateRawSync(cru) : Buffer.from(cru);
    if (conteudo.length !== original) throw new Error(`tamanho divergente em ${nome}`);
    arquivos.set(nome, conteudo);
    p += 46 + tNome + tExtra + tComentario;
  }
  return arquivos;
}

const sha256E11 = (b) => createHash("sha256").update(b).digest("hex");

const ritaE11 = await viaApiE11("/auth/entrar", {
  metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA },
});
ok("a administradora entra pela API", ritaE11.status === 200, `(${ritaE11.status})`);

// A coordenadora: as secoes anteriores trocam a senha dela, e a ordem nao pode importar.
let helenaE11 = null;
for (const senha of ["terceira-senha-da-helena-2026", "senha-nova-da-helena-2026", SENHA]) {
  const r = await viaApiE11("/auth/entrar", {
    metodo: "POST", corpo: { email: "helena.coutinho@serraalta.exemplo.gov.br", senha },
  });
  if (r.status === 200) { helenaE11 = r; break; }
}
ok("a coordenadora entra pela API", helenaE11 !== null);

// ---- Contra a API, sem navegador: a rota certa, a errada e o recorte ----
const naRaizE11 = await viaApiE11("/pacote.zip", { metodo: "POST", token: ritaE11.json.acesso });
ok("POST /pacote.zip na raiz e 404 (o defeito era o prefixo)", naRaizE11.status === 404, `(${naRaizE11.status})`);
const emGetE11 = await viaApiE11("/saida/pacote.zip", { token: ritaE11.json.acesso });
ok("GET /saida/pacote.zip tambem nao baixa nada", emGetE11.status === 404, `(${emGetE11.status})`);
const coordenadoraE11 = await viaApiE11("/saida/pacote.zip", { metodo: "POST", token: helenaE11?.json.acesso });
ok("a coordenadora recebe 403 sem_permissao da API",
   coordenadoraE11.status === 403 && coordenadoraE11.json.erro === "sem_permissao",
   `(${coordenadoraE11.status} ${coordenadoraE11.json.erro})`);

// ---- O botao, no navegador, baixando de verdade ----
const contextoE11 = await navegador.newContext({ acceptDownloads: true });
const paginaE11 = await contextoE11.newPage();
registrar(paginaE11);

async function abrirOrganizacaoE11(pagina) {
  await pagina.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("#entrada-email", { timeout: 30_000 });
  await pagina.locator("#entrada-email").fill("rita.lopes@serraalta.exemplo.gov.br");
  await pagina.locator("#entrada-senha").fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
  await pagina.waitForSelector(".indicador", { timeout: 30_000 });
  await pagina.goto(`${BASE}/organizacao`, { waitUntil: "networkidle" });
  await pagina.getByRole("button", { name: "Baixar pacote de saída" }).waitFor({ timeout: 30_000 });
}
await abrirOrganizacaoE11(paginaE11);
const botaoE11 = paginaE11.getByRole("button", { name: "Baixar pacote de saída" });
ok("a administradora ve o botao Baixar pacote de saida em Organizacao", (await botaoE11.count()) === 1);
await capturarE11(paginaE11, "saida-normal");

// Sem download em 30 s o clique falhou: diz o que a tela mostrou (o defeito de
// antes aparecia aqui como o 404 da rota errada) e encerra, em vez de seguir
// conferindo um arquivo que nao existe.
const esperandoE11 = paginaE11.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
await botaoE11.click();
const baixadoE11 = await esperandoE11;
if (!baixadoE11) {
  const naTelaE11 = await paginaE11.locator(".aviso--perigo").first().textContent({ timeout: 2_000 }).catch(() => "(sem aviso na tela)");
  ok("o navegador recebe o download depois do clique", false, `(a tela diz: ${naTelaE11})`);
  await navegador.close();
  console.log(`
Passou: ${passou}   Falhou: ${falhou}`);
  process.exit(1);
}
const nomeBaixadoE11 = baixadoE11.suggestedFilename();
const hojeE11 = new Date().toISOString().slice(0, 10);
ok("o navegador recebe o download com o nome combinado",
   nomeBaixadoE11 === `dc360-pacote-de-saida-${hojeE11}.zip`, `(${nomeBaixadoE11})`);
const caminhoBaixadoE11 = await baixadoE11.path();
const bytesE11 = readFileSync(caminhoBaixadoE11);
ok("o arquivo baixado comeca com a assinatura PK e nao esta vazio",
   bytesE11.length > 0 && bytesE11.subarray(0, 2).toString("latin1") === "PK", `(${bytesE11.length} bytes)`);
ok("o download nao falhou no meio", (await baixadoE11.failure()) === null);

const pacoteE11 = lerZipE11(bytesE11);
const nomesE11 = [...pacoteE11.keys()];
ok("o ZIP abre pelo diretorio central, com mais de uma dezena de arquivos", nomesE11.length > 12, `(${nomesE11.length})`);
ok("traz tabelas/ocorrencias.csv", pacoteE11.has("tabelas/ocorrencias.csv"));
ok("traz um laudo de vistoria em documentos/",
   nomesE11.some((n) => /^documentos\/.+\/laudo-de-vistoria\.html$/.test(n)));
ok("traz o indice, o LEIA-ME, as pendencias e as somas",
   ["INDICE.csv", "INDICE.html", "LEIA-ME.txt", "PENDENCIAS-DA-EXTRACAO.txt", "SOMAS-SHA256.txt"].every((n) => pacoteE11.has(n)));

// A soma de verificacao: uma linha por arquivo (menos ela mesma), e cada soma e a do arquivo.
const somasE11 = new Map();
for (const linha of pacoteE11.get("SOMAS-SHA256.txt").toString("utf8").trimEnd().split("\n")) {
  const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(linha);
  if (m) somasE11.set(m[2], m[1]);
}
const semSomaE11 = nomesE11.filter((n) => n !== "SOMAS-SHA256.txt" && !somasE11.has(n));
const divergentesE11 = [...somasE11].filter(([n, s]) => !pacoteE11.has(n) || sha256E11(pacoteE11.get(n)) !== s).map(([n]) => n);
ok("SOMAS-SHA256.txt cobre todos os arquivos", semSomaE11.length === 0 && somasE11.size === nomesE11.length - 1,
   `(sem soma: ${semSomaE11.slice(0, 3).join(", ")}; ${somasE11.size} linhas para ${nomesE11.length - 1} arquivos)`);
ok("cada soma SHA-256 e a do arquivo de verdade", divergentesE11.length === 0, `(divergentes: ${divergentesE11.slice(0, 3).join(", ")})`);

// So o municipio de quem pediu, linha a linha.
let linhasComOrgE11 = 0;
const deOutroE11 = [];
for (const nome of nomesE11.filter((n) => /^tabelas\/.+\.json$/.test(n))) {
  for (const linha of JSON.parse(pacoteE11.get(nome).toString("utf8"))) {
    const org = nome === "tabelas/organizacoes.json" ? linha.id : linha.organizacao_id;
    if (org === undefined) continue;
    linhasComOrgE11 += 1;
    if (org !== ID_SERRA_ALTA_E11) deOutroE11.push(nome);
  }
}
ok("toda linha de toda tabela e de Serra Alta (nenhuma de outro municipio)",
   linhasComOrgE11 > 10 && deOutroE11.length === 0, `(${linhasComOrgE11} linhas, de outro: ${[...new Set(deOutroE11)].join(", ")})`);
const organizacoesE11 = JSON.parse(pacoteE11.get("tabelas/organizacoes.json").toString("utf8"));
ok("o cadastro de organizacoes do pacote e so o de Serra Alta",
   organizacoesE11.length === 1 && organizacoesE11[0].id === ID_SERRA_ALTA_E11);
const vazouE11 = nomesE11.filter((n) => !n.startsWith("esquema/")
  && (pacoteE11.get(n).toString("utf8").includes("Vale Fundo")
      || pacoteE11.get(n).toString("utf8").includes(ID_VALE_FUNDO_E11)));
ok("nenhum arquivo de dado cita Vale Fundo nem o id dele", vazouE11.length === 0, `(${vazouE11.join(", ")})`);

const ocorrenciasJsonE11 = JSON.parse(pacoteE11.get("tabelas/ocorrencias.json").toString("utf8"));
const csvLinhasE11 = pacoteE11.get("tabelas/ocorrencias.csv").toString("utf8").replace(/^﻿/, "").trimEnd().split("\r\n");
ok("o CSV de ocorrencias tem o cabecalho e uma linha por ocorrencia do JSON",
   ocorrenciasJsonE11.length > 0 && csvLinhasE11.length === ocorrenciasJsonE11.length + 1,
   `(${csvLinhasE11.length} linhas, ${ocorrenciasJsonE11.length} ocorrencias)`);
const indiceE11 = pacoteE11.get("INDICE.csv").toString("utf8");
ok("o indice lista o protocolo de Serra Alta e nao o de Vale Fundo",
   indiceE11.includes("000473/2026") && !indiceE11.includes("000112/2026"));

// O que nunca sai.
const COLUNAS_PROIBIDAS_E11 = { usuarios: "senha_hash", aparelhos: "ficha", oficio_envios: "token_hash" };
const colunaVazouE11 = Object.entries(COLUNAS_PROIBIDAS_E11).filter(([tabela, coluna]) => {
  const csv = pacoteE11.get(`tabelas/${tabela}.csv`);
  const json = pacoteE11.get(`tabelas/${tabela}.json`);
  const noCsv = csv ? csv.toString("utf8").replace(/^﻿/, "").split("\r\n")[0].split(";").includes(coluna) : false;
  const noJson = json ? JSON.parse(json.toString("utf8")).some((l) => coluna in l) : false;
  return noCsv || noJson;
}).map(([t, c]) => `${t}.${c}`);
ok("nenhuma coluna proibida (senha_hash, ficha, token_hash) em CSV ou JSON", colunaVazouE11.length === 0, `(${colunaVazouE11.join(", ")})`);
ok("nenhum arquivo traz hash de senha (scrypt$)", !nomesE11.some((n) => pacoteE11.get(n).toString("utf8").includes("scrypt$")));
const TABELAS_PROIBIDAS_E11 = ["sessoes", "recuperacoes_senha", "segundo_fator", "segundo_fator_recuperacao", "interesse_municipio", "eliminacoes_de_municipio"];
ok("nenhuma tabela de credencial nem do fornecedor no pacote",
   !TABELAS_PROIBIDAS_E11.some((t) => pacoteE11.has(`tabelas/${t}.csv`) || pacoteE11.has(`tabelas/${t}.json`)));

// Evidencia: so a lista de nomes e as somas, e o arquivo baixado e apagado.
if (process.env.EVIDENCIA_E11) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(process.env.EVIDENCIA_E11, { recursive: true });
  writeFileSync(`${process.env.EVIDENCIA_E11}/lista-de-nomes-do-zip-${MOTOR}.txt`,
    [...nomesE11].sort().map((n) => `${String(pacoteE11.get(n).length).padStart(8)}  ${n}`).join("\n") + "\n");
  writeFileSync(`${process.env.EVIDENCIA_E11}/sha256-do-zip-${MOTOR}.txt`,
    `${sha256E11(bytesE11)}  ${nomeBaixadoE11}  (${bytesE11.length} bytes, motor ${MOTOR})\n`);
}
await baixadoE11.delete();

// ---- 401 no primeiro pedido: renova e baixa ----
let primeiroPedidoE11 = true;
const renovacoesE11 = [];
paginaE11.on("request", (r) => { if (r.url().endsWith("/auth/renovar")) renovacoesE11.push(r.url()); });
await paginaE11.route("**/saida/pacote.zip", (rota) => {
  if (rota.request().method() === "POST" && primeiroPedidoE11) {
    primeiroPedidoE11 = false;
    return rota.fulfill({
      status: 401, contentType: "application/json",
      headers: { "access-control-allow-origin": new URL(BASE).origin },
      body: JSON.stringify({ erro: "nao_autenticado", mensagem: "Token inválido ou expirado." }),
    });
  }
  return rota.continue();
});
const [baixado401E11] = await Promise.all([
  paginaE11.waitForEvent("download", { timeout: 120_000 }),
  botaoE11.click(),
]);
const bytes401E11 = readFileSync(await baixado401E11.path());
ok("com 401 no primeiro pedido o painel renova UMA vez e baixa o ZIP",
   renovacoesE11.length === 1 && bytes401E11.subarray(0, 2).toString("latin1") === "PK",
   `(${renovacoesE11.length} renovacao(oes), ${bytes401E11.length} bytes)`);
ok("e a pessoa continua no painel, sem ser mandada para a entrada", paginaE11.url().includes("/organizacao"));
await baixado401E11.delete();
await paginaE11.unroute("**/saida/pacote.zip");

// ---- Carregando: o botao diz Gerando e nao aceita segundo clique ----
let liberarE11;
const seguraE11 = new Promise((r) => { liberarE11 = r; });
await paginaE11.route("**/saida/pacote.zip", async (rota) => { await seguraE11; await rota.continue(); });
const [baixadoLentoE11] = await Promise.all([
  paginaE11.waitForEvent("download", { timeout: 120_000 }),
  (async () => {
    await botaoE11.click();
    await paginaE11.getByRole("button", { name: "Gerando" }).waitFor({ timeout: 10_000 });
    ok("enquanto gera, o botao diz Gerando e fica desabilitado",
       await paginaE11.getByRole("button", { name: "Gerando" }).isDisabled());
    await capturarE11(paginaE11, "saida-carregando");
    liberarE11();
  })(),
]);
await baixadoLentoE11.delete();
await paginaE11.getByRole("button", { name: "Baixar pacote de saída" }).waitFor({ timeout: 20_000 });
ok("terminado o download, o botao volta a dizer Baixar pacote de saida", true);
await paginaE11.unroute("**/saida/pacote.zip");

// ---- Recusas: a frase do servidor chega a tela ----
async function recusarE11(corpoDoServidor, status, esperado, nomeDaCaptura) {
  await paginaE11.route("**/saida/pacote.zip", (rota) => rota.fulfill({
    status, contentType: "application/json",
    headers: { "access-control-allow-origin": new URL(BASE).origin },
    body: JSON.stringify(corpoDoServidor),
  }));
  await botaoE11.click();
  await paginaE11.waitForSelector(".aviso--perigo", { timeout: 20_000 });
  const texto = (await paginaE11.locator(".aviso--perigo").textContent()) ?? "";
  ok(`a tela mostra a frase do servidor: ${esperado.slice(0, 48)}...`, texto.includes(esperado), `(${texto})`);
  ok("e o botao volta a poder ser usado", await botaoE11.isEnabled());
  await capturarE11(paginaE11, nomeDaCaptura);
  await paginaE11.unroute("**/saida/pacote.zip");
  // Sai do estado de erro para a proxima: recarrega a tela.
  await paginaE11.goto(`${BASE}/organizacao`, { waitUntil: "networkidle" });
  await botaoE11.waitFor({ timeout: 30_000 });
}

await recusarE11(coordenadoraE11.json, 403, String(coordenadoraE11.json.mensagem), "saida-erro-sem-permissao");
await recusarE11(
  {
    erro: "acesso_suspenso",
    mensagem: "O acesso deste município ao sistema foi suspenso pelo fornecedor. "
      + "Procure quem administra o contrato na sua prefeitura.",
  },
  403, "O acesso deste município ao sistema foi suspenso pelo fornecedor.", "saida-erro-suspenso",
);
ok("a recusa nao derruba a sessao: a administradora continua em Organizacao", paginaE11.url().includes("/organizacao"));

await paginaE11.route("**/saida/pacote.zip", (rota) => rota.abort("failed"));
await botaoE11.click();
await paginaE11.waitForSelector(".aviso--perigo", { timeout: 20_000 });
const textoRedeE11 = (await paginaE11.locator(".aviso--perigo").textContent()) ?? "";
ok("sem rede: a frase diz que o arquivo nao foi baixado, e nao que algo preenchido nao foi enviado",
   textoRedeE11.includes("Sem conexão com o servidor. O arquivo não foi baixado.") && !textoRedeE11.includes("preencheu"),
   `(${textoRedeE11})`);
await capturarE11(paginaE11, "saida-erro-rede");
await paginaE11.unroute("**/saida/pacote.zip");

// ---- Aparencia: o cartao cabe na tela, no computador e no celular ----
for (const [largura, altura] of [[1280, 900], [390, 844]]) {
  await paginaE11.setViewportSize({ width: largura, height: altura });
  await paginaE11.waitForTimeout(150);
  const medidas = await paginaE11.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Baixar pacote"));
    const r = b.getBoundingClientRect();
    return {
      rolagem: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      altura: r.height, direita: r.right, largura: window.innerWidth,
    };
  });
  ok(`${largura}px: sem rolagem horizontal e o botao cabe na tela`,
     medidas.rolagem <= 0 && medidas.direita <= medidas.largura, `(${JSON.stringify(medidas)})`);
  if (largura === 390) {
    ok("390px: o botao tem pelo menos 44px de altura", medidas.altura >= 44, `(${medidas.altura})`);
  }
}
await contextoE11.close();

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
