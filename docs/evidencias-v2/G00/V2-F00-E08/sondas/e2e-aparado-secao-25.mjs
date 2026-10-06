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
