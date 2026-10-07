/**
 * COPIA APARADA para provar as secoes 28 e 29 isoladas: o e2e completo cai na
 * secao 13 (CORS do PUT de evidencia, E18, pre-existente). Cabecalho, ajudantes
 * e as secoes 28 e 29, sem alteracao, do apps/web/test/fluxo-api.e2e.mjs.
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

console.log("\n== 29. O laudo do pacote avisa a equipe divergente (V2-F00-E12) ==");

/*
  A consulta de vistorias do pacote juntava so `usuarios`, e nunca as duas
  equipes da vistoria. O resultado: o laudo DENTRO do pacote saia sem o aviso de
  equipe divergente, e o laudo que a rota emite, para a MESMA vistoria, saia com
  ele. O municipio que leva o pacote embora levaria o papel limpo, e e esse o
  papel que fica no processo depois de o contrato acabar.

  A divergencia aqui e montada pela API de verdade, e nao por SQL: a coordenacao
  despacha para a Equipe Bravo e o agente Diego, que e da Equipe Alfa, envia a
  coleta. A rota aceita e MARCA, de proposito (o porque esta em
  `apps/api/test/vistoria-e-da-equipe.test.ts`). Depois a administradora clica no
  botao do painel, o ZIP baixado e aberto com o leitor independente da secao 28,
  e o trecho do aviso do laudo do pacote e comparado com o do laudo da rota.

  O que se prova aqui, e nao no teste da API: os dois documentos que a prefeitura
  pode ter em maos ao mesmo tempo dizem a mesma coisa, saindo do servidor de
  verdade e passando pelo cliente de verdade.
*/
const EQUIPE_BRAVO_E12 = "11111111-1111-4111-8111-0000000000e2";
const EQUIPE_ALFA_E12 = "11111111-1111-4111-8111-0000000000e1";
await paginaE11.setViewportSize({ width: 1280, height: 900 });

/** Os paragrafos de ressalva do laudo, que e onde o aviso de equipe mora. */
function notasDoLaudoE12(html) {
  return [...html.matchAll(/<p class="nota">([\s\S]*?)<\/p>/g)].map((m) => m[1].trim());
}

/** A rota de documento devolve HTML, e nao JSON: `viaApiE11` nao serve aqui. */
async function htmlDaApiE12(caminho, token) {
  const r = await fetch(`${API_E11}${caminho}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: r.status, html: await r.text() };
}

const criadaE12 = await viaApiE11("/ocorrencias", {
  metodo: "POST", token: helenaE11?.json.acesso,
  corpo: {
    tipo: "deslizamento",
    endereco: "Rua do Laudo do Pacote, 12, Centro",
    solicitanteNome: "Marilda Souza Prado",
    canalEntrada: "telefone",
    descricao: "Talude atras da casa cedeu depois da chuva da madrugada.",
  },
});
ok("a coordenacao abre a ocorrencia do caso", criadaE12.status === 201, `(${criadaE12.status})`);
const OC_E12 = criadaE12.json.id;
const PROTOCOLO_E12 = String(criadaE12.json.protocolo ?? "");
const PASTA_E12 = PROTOCOLO_E12.replace("/", "-");

const triagemE12 = await viaApiE11(`/ocorrencias/${OC_E12}/triagem`, {
  metodo: "POST", token: helenaE11?.json.acesso,
  corpo: { severidade: "critica", vulnerabilidadePresente: false },
});
ok("a triagem classifica a ocorrencia", triagemE12.status === 200, `(${triagemE12.status})`);

const despachoE12 = await viaApiE11(`/ocorrencias/${OC_E12}/despacho`, {
  metodo: "POST", token: helenaE11?.json.acesso,
  corpo: { equipeId: EQUIPE_BRAVO_E12, prazoHoras: 4 },
});
ok("a coordenacao despacha para a Equipe Bravo", despachoE12.status === 200, `(${despachoE12.status})`);

// Diego e da Equipe Alfa. A secao da E09 troca a senha dele, e a ordem das
// secoes nao pode importar: tenta as duas, como ja e feito com a coordenadora.
let diegoE12 = null;
for (const senha of ["senha-nova-do-diego-2026", SENHA]) {
  const r = await viaApiE11("/auth/entrar", {
    metodo: "POST", corpo: { email: "diego.alves@serraalta.exemplo.gov.br", senha },
  });
  if (r.status === 200) { diegoE12 = r; break; }
}
ok("o agente da Equipe Alfa entra pela API", diegoE12 !== null);

const coletadaEmE12 = new Date().toISOString();
const sincronizadaE12 = await viaApiE11("/sincronizacao/vistoria", {
  metodo: "POST", token: diegoE12?.json.acesso,
  corpo: {
    idempotencyKey: crypto.randomUUID(),
    ocorrenciaId: OC_E12,
    coletadaEm: coletadaEmE12,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: true },
        { chave: "interdicao_indicada", resposta: true },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [], gpsPrecisaoMetros: 6.2,
      assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
      coletadaEm: coletadaEmE12, observacoes: "Trinca ativa no talude.",
    },
  },
});
ok("a coleta do agente de OUTRA equipe e aceita e marcada, e nao recusada",
   sincronizadaE12.status === 201 && sincronizadaE12.json.foraDaEquipeDesignada === true,
   `(${sincronizadaE12.status} fora=${sincronizadaE12.json.foraDaEquipeDesignada})`);

// ---- O laudo que a rota emite: o aviso que a prefeitura ja tem impresso ----
const laudoDaRotaE12 = await htmlDaApiE12(`/documentos/${OC_E12}/laudo`, helenaE11?.json.acesso);
ok("a rota emite o laudo da ocorrencia", laudoDaRotaE12.status === 200, `(${laudoDaRotaE12.status})`);
const avisoDaRotaE12 = notasDoLaudoE12(laudoDaRotaE12.html).filter((n) => n.startsWith("Atenção:"));
ok("o laudo da rota traz o aviso de equipe divergente, com as duas equipes pelo nome",
   avisoDaRotaE12.length === 1
   && avisoDaRotaE12[0].includes("estava designada à Equipe Bravo")
   && avisoDaRotaE12[0].includes("lotado na Equipe Alfa"),
   `(${avisoDaRotaE12.join(" | ") || "nenhum aviso"})`);

// ---- O laudo que vai DENTRO do pacote, baixado pelo botao do painel ----
const esperandoE12 = paginaE11.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
await botaoE11.click();
const baixadoE12 = await esperandoE12;
ok("o painel baixa o pacote outra vez, depois da coleta divergente", baixadoE12 !== null);
const bytesE12 = readFileSync(await baixadoE12.path());
const pacoteE12 = lerZipE11(bytesE12);
const caminhoLaudoE12 = `documentos/${PASTA_E12}/laudo-de-vistoria.html`;
ok(`o pacote traz o laudo da ocorrencia nova (${caminhoLaudoE12})`, pacoteE12.has(caminhoLaudoE12),
   `(${[...pacoteE12.keys()].filter((n) => n.startsWith("documentos/")).slice(0, 4).join(", ")})`);

const laudoDoPacoteE12 = (pacoteE12.get(caminhoLaudoE12) ?? Buffer.alloc(0)).toString("utf8");
const avisoDoPacoteE12 = notasDoLaudoE12(laudoDoPacoteE12).filter((n) => n.startsWith("Atenção:"));
ok("o laudo DO PACOTE traz o mesmo aviso, e nao o papel limpo",
   avisoDoPacoteE12.length === 1
   && avisoDoPacoteE12[0].includes("estava designada à Equipe Bravo")
   && avisoDoPacoteE12[0].includes("lotado na Equipe Alfa"),
   `(${avisoDoPacoteE12.join(" | ") || "nenhum aviso"})`);
ok("e o trecho do aviso e IDENTICO nos dois documentos, palavra por palavra",
   avisoDoPacoteE12.length === avisoDaRotaE12.length
   && avisoDoPacoteE12.every((n, i) => n === avisoDaRotaE12[i]),
   `(pacote: ${avisoDoPacoteE12.join(" | ")} / rota: ${avisoDaRotaE12.join(" | ")})`);

// A ocorrencia da semente, despachada para a Alfa e coletada pelo agente da
// Alfa, continua sem aviso nenhum nos dois documentos: o conserto nao passou a
// avisar sempre, que seria a outra forma de o documento perder valor.
const semDivergenciaE12 = await viaApiE11("/ocorrencias", {
  metodo: "POST", token: helenaE11?.json.acesso,
  corpo: {
    tipo: "alagamento",
    endereco: "Rua do Laudo Limpo, 34, Centro",
    solicitanteNome: "Neuza Aparecida Bento",
    canalEntrada: "telefone",
    descricao: "Agua acumulada na pista depois da chuva.",
  },
});
await viaApiE11(`/ocorrencias/${semDivergenciaE12.json.id}/triagem`, {
  metodo: "POST", token: helenaE11?.json.acesso,
  corpo: { severidade: "media", vulnerabilidadePresente: false },
});
await viaApiE11(`/ocorrencias/${semDivergenciaE12.json.id}/despacho`, {
  metodo: "POST", token: helenaE11?.json.acesso,
  corpo: { equipeId: EQUIPE_ALFA_E12, prazoHoras: 4 },
});
const coletaLimpaEmE12 = new Date().toISOString();
const limpaE12 = await viaApiE11("/sincronizacao/vistoria", {
  metodo: "POST", token: diegoE12?.json.acesso,
  corpo: {
    idempotencyKey: crypto.randomUUID(),
    ocorrenciaId: semDivergenciaE12.json.id,
    coletadaEm: coletaLimpaEmE12,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: false },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [], gpsPrecisaoMetros: 5.1,
      assinanteNome: "Neuza Aparecida Bento", assinaturaChave: null,
      coletadaEm: coletaLimpaEmE12, observacoes: "Agua escoou sozinha.",
    },
  },
});
ok("a coleta da equipe designada entra sem marca de divergencia",
   limpaE12.status === 201 && limpaE12.json.foraDaEquipeDesignada === false,
   `(${limpaE12.status} fora=${limpaE12.json.foraDaEquipeDesignada})`);

const esperandoLimpoE12 = paginaE11.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
await botaoE11.click();
const baixadoLimpoE12 = await esperandoLimpoE12;
const pacoteLimpoE12 = lerZipE11(readFileSync(await baixadoLimpoE12.path()));
const pastaLimpaE12 = String(semDivergenciaE12.json.protocolo ?? "").replace("/", "-");
const laudoLimpoE12 = (pacoteLimpoE12.get(`documentos/${pastaLimpaE12}/laudo-de-vistoria.html`)
  ?? Buffer.alloc(0)).toString("utf8");
ok("o laudo da coleta sem divergencia NAO ganha aviso de equipe no pacote",
   laudoLimpoE12.length > 0 && !laudoLimpoE12.includes("estava designada à"),
   `(${notasDoLaudoE12(laudoLimpoE12).join(" | ") || "nenhuma nota"})`);
ok("nem no laudo que a rota emite para ela",
   !(await htmlDaApiE12(`/documentos/${semDivergenciaE12.json.id}/laudo`, helenaE11?.json.acesso))
     .html.includes("estava designada à"));

// E nenhum nome de equipe do outro municipio entra no pacote por causa das
// juncoes novas: as duas sao por id da vistoria, que e sempre do municipio.
ok("nenhum arquivo do pacote cita a equipe de Vale Fundo",
   ![...pacoteLimpoE12.keys()].some((n) => !n.startsWith("esquema/")
     && pacoteLimpoE12.get(n).toString("utf8").includes("Equipe Única")));

// Evidencia: so os dois trechos do aviso, que e o que a etapa pede. Nenhum
// dado pessoal: nome de equipe nao e dado de pessoa.
if (process.env.EVIDENCIA_E12) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(process.env.EVIDENCIA_E12, { recursive: true });
  writeFileSync(`${process.env.EVIDENCIA_E12}/trecho-do-aviso-${MOTOR}.txt`,
    `Protocolo: ${PROTOCOLO_E12} (despachada a Equipe Bravo, coletada por agente da Equipe Alfa)\n`
    + `Motor: ${MOTOR}\n\n`
    + `--- laudo emitido pela rota GET /documentos/:id/laudo ---\n${avisoDaRotaE12.join("\n")}\n\n`
    + `--- laudo de dentro do pacote (${caminhoLaudoE12}) ---\n${avisoDoPacoteE12.join("\n")}\n\n`
    + `Identicos: ${avisoDoPacoteE12.join("\n") === avisoDaRotaE12.join("\n") ? "sim" : "nao"}\n`);
}
await baixadoE12.delete();
await baixadoLimpoE12.delete();

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
