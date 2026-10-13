/**
 * Tela estreita: o que a validação da V2-F00-E09 reprovou a 390 px.
 *
 * Três defeitos, todos de "nada fora do lugar" (portão visual, seção 0 de
 * `docs/roadmap-v2/19-definicao-de-pronto.md`), e nenhum aparecia nos testes
 * porque nenhum deles media geometria:
 *
 * 1. o botão da janela de confirmação com o nome da pessoa dentro ("Encerrar
 *    sessões de Marcos Vinicius Teles") era mais largo que a janela e perdia a
 *    borda. O rótulo precisa ser longo, porque repetir o objeto no botão é a
 *    regra de `ConfirmarAcao`, e nome de pessoa é comprido;
 * 2. "Mapa da cidade" aparecia cortado na barra de navegação do pé da tela;
 * 3. o painel do operador pedia `GET /ocorrencias/devolvidas`, que exige
 *    `despachar_equipe`, e recebia 403 em todo carregamento, além de mostrar a
 *    faixa "a consulta não respondeu" para quem nunca poderia vê-la.
 *
 * Mede com o navegador de verdade (retângulos, não classe CSS), em 320, 390,
 * 768 e 1280 px. Roda contra a API e o painel já de pé: `scripts/e2e-api.mjs`
 * chama este arquivo depois de `fluxo-api.e2e.mjs`, e dá para rodá-lo sozinho:
 *
 *   BASE_WEB=http://localhost:4691 BASE_API=http://127.0.0.1:3691 \
 *     node test/layout-estreito.e2e.mjs
 *
 * Cria a própria pessoa de nome longo pela API, com e-mail único, então pode
 * rodar em instância já usada.
 */
import * as playwright from "playwright";

const MOTOR = process.env.MOTOR ?? "chromium";
const lancador = playwright[MOTOR];
if (!lancador) { console.error(`motor desconhecido: ${MOTOR}`); process.exit(2); }

const BASE = process.env.BASE_WEB ?? "http://localhost:4173";
const API = process.env.BASE_API ?? "http://127.0.0.1:3333";
const SENHA = "defesa-civil-2026";
const LARGURAS = [320, 390, 768, 1280];
const erros = [];
let passou = 0, falhou = 0;

function ok(nome, cond, extra = "") {
  if (cond) { passou++; console.log(`  OK   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome} ${extra}`); }
}

async function viaApi(caminho, { metodo = "GET", token, corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const navegador = await lancador.launch();
const contexto = await navegador.newContext({ locale: "pt-BR" });
const page = await contexto.newPage();
page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // 401/403/404 de propósito: nada aqui os provoca, então qualquer um é falha.
  if (/downloadable font: download failed .*status=2152398850 /.test(m.text())) return;
  erros.push(`console: ${m.text()}`);
});

async function entrar(email, senha = SENHA, pagina = page) {
  const page = pagina;
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await page.waitForSelector("#entrada-email", { timeout: 30_000 });
  await page.locator("#entrada-email").fill(email);
  await page.locator("#entrada-senha").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
}

/**
 * Geometria da janela de confirmação aberta, medida no navegador.
 *
 * "Cabe" quer dizer três coisas ao mesmo tempo, e as três já falharam: o botão
 * está dentro da área útil do painel (sem encostar na borda de fora), o texto
 * dele cabe no próprio botão (sem `overflow`), e o painel não ganhou rolagem
 * horizontal (que seria o estouro escondido atrás de `overflow-y: auto`).
 */
async function medirJanela() {
  return page.evaluate(() => {
    const painel = document.querySelector(".modal__painel");
    if (!painel) return null;
    const estilo = getComputedStyle(painel);
    const p = painel.getBoundingClientRect();
    const util = {
      esq: p.left + parseFloat(estilo.paddingLeft) + parseFloat(estilo.borderLeftWidth),
      dir: p.right - parseFloat(estilo.paddingRight) - parseFloat(estilo.borderRightWidth),
    };
    const dirDoPainel = p.right - parseFloat(estilo.paddingRight) - parseFloat(estilo.borderRightWidth);
    const botoes = [...painel.querySelectorAll(".modal__rodape button")].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        texto: b.textContent.trim(), esq: r.left, dir: r.right, altura: r.height, largura: r.width,
        cortado: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1,
      };
    });
    return {
      util, botoes,
      painelRola: painel.scrollWidth > painel.clientWidth + 1,
      painelLargura: `${painel.scrollWidth} contra ${painel.clientWidth}`,
      culpados: [...painel.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > dirDoPainel + 1)
        .slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${e.className} "${e.textContent.trim().slice(0, 40)}"`),
      paginaRola: document.documentElement.scrollWidth > window.innerWidth + 1,
      painelDentro: p.left >= -0.5 && p.right <= window.innerWidth + 0.5,
    };
  });
}

function janelaCabe(m) {
  if (!m) return "janela nao abriu";
  if (m.paginaRola) return "a pagina ganhou rolagem horizontal";
  if (m.painelRola) return `o painel da janela ganhou rolagem horizontal (${m.painelLargura}; passam da borda: ${m.culpados.join(" | ") || "nenhum"})`;
  if (!m.painelDentro) return "a janela passa da tela";
  for (const b of m.botoes) {
    if (b.esq < m.util.esq - 0.5 || b.dir > m.util.dir + 0.5)
      return `botao "${b.texto}" fora da area util (${b.esq.toFixed(0)}..${b.dir.toFixed(0)} contra ${m.util.esq.toFixed(0)}..${m.util.dir.toFixed(0)})`;
    if (b.cortado) return `botao "${b.texto}" com o texto cortado`;
    if (b.altura < 43.5 || b.largura < 43.5) return `botao "${b.texto}" abaixo de 44 px (${b.largura.toFixed(0)}x${b.altura.toFixed(0)})`;
  }
  return null;
}

console.log("\n== 1. Preparo: pessoa de nome longo, criada pela API ==");
const rita = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
ok("a administradora entra pela API", rita.status === 200, `(${rita.status})`);
const sufixo = Date.now().toString(36);
const NOME_LONGO = "Marcos Vinicius Teles de Albuquerque Sobrinho";
const emailLongo = `longo.${sufixo}@serraalta.exemplo.gov.br`;
const criada = await viaApi("/usuarios", {
  metodo: "POST", token: rita.json.acesso,
  corpo: {
    nome: NOME_LONGO, matricula: `LG-${sufixo}`.toUpperCase(), email: emailLongo,
    papel: "operador", equipeId: null, senha: "senha-provisoria-do-teste-1",
  },
});
ok("a pessoa de nome longo foi cadastrada", criada.status === 201 || criada.status === 200, `(${criada.status} ${JSON.stringify(criada.json).slice(0, 120)})`);
/*
  A coordenadora também é criada aqui, e o operador é a própria pessoa de nome
  longo: as contas da semente (Helena, Jonas) mudam de senha e de situação ao
  longo de `fluxo-api.e2e.mjs`, que roda antes deste arquivo no CI, então
  depender delas faria este teste falhar por causa do outro.
*/
const SENHA_DO_TESTE = "senha-provisoria-do-teste-1";
const emailCoordenacao = `coordenacao.${sufixo}@serraalta.exemplo.gov.br`;
const coordenacao = await viaApi("/usuarios", {
  metodo: "POST", token: rita.json.acesso,
  corpo: {
    nome: "Coordenadora de Teste de Layout", matricula: `CO-${sufixo}`.toUpperCase(), email: emailCoordenacao,
    papel: "coordenador", equipeId: null, senha: SENHA_DO_TESTE,
  },
});
ok("a coordenadora de teste foi cadastrada", coordenacao.status === 201 || coordenacao.status === 200, `(${coordenacao.status})`);

console.log("\n== 2. As janelas de confirmação cabem, do celular pequeno à mesa ==");
await entrar("rita.lopes@serraalta.exemplo.gov.br");
await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
const linha = page.locator("tbody tr", { hasText: emailLongo });
for (const [botao, padrao] of [["Encerrar sessões", /^Encerrar sessões de Marcos/], ["Redefinir senha", /^Redefinir a senha de Marcos/]]) {
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.waitForTimeout(100);
    await linha.getByRole("button", { name: botao, exact: true }).scrollIntoViewIfNeeded();
    await linha.getByRole("button", { name: botao, exact: true }).click();
    const janela = page.getByRole("dialog");
    await janela.waitFor({ timeout: 10_000 });
    await janela.getByRole("button", { name: padrao }).waitFor({ timeout: 10_000 });
    // "Encerrar sessões" lê a contagem depois de abrir; espera sair do "Conferindo".
    await page.waitForTimeout(400);
    const m = await medirJanela();
    const motivo = janelaCabe(m);
    ok(`"${botao}" a ${largura} px: o botao com o nome inteiro cabe na janela`, motivo === null, `(${motivo})`);
    await janela.getByRole("button", { name: "Cancelar" }).click();
    await janela.waitFor({ state: "detached", timeout: 10_000 });
  }
}

/**
 * A barra de navegação do pé da tela (largura até 900 px).
 *
 * "Cortado" aqui é o que a validação viu: o rótulo passando da borda da tela, ou
 * do próprio botão. Mede o item DEPOIS de a página assentar e com a barra
 * rolada para o começo, que é como a pessoa a encontra ao abrir o painel.
 */
async function medirBarra() {
  return page.evaluate(() => {
    const barra = document.querySelector("nav.lateral");
    if (!barra) return null;
    barra.scrollLeft = 0;
    const largura = window.innerWidth;
    const itens = [...barra.querySelectorAll(".lateral__item")].map((a) => {
      const r = a.getBoundingClientRect();
      const rotulo = a.querySelector(".lateral__texto") ?? a;
      const rr = rotulo.getBoundingClientRect();
      return {
        texto: a.textContent.trim(), esq: r.left, dir: r.right, altura: r.height, largura: r.width,
        rotuloEsq: rr.left, rotuloDir: rr.right,
        cortado: a.scrollWidth > a.clientWidth + 1 || a.scrollHeight > a.clientHeight + 1,
      };
    });
    return { largura, itens, paginaRola: document.documentElement.scrollWidth > largura + 1 };
  });
}

console.log("\n== 3. A barra de navegação não corta os rótulos ==");
await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
for (const largura of [320, 360, 361, 390, 768]) {
  await page.setViewportSize({ width: largura, height: 800 });
  await page.waitForTimeout(150);
  const m = await medirBarra();
  const mapa = m?.itens.find((i) => i.texto === "Mapa da cidade");
  ok(`a ${largura} px a barra existe e tem o item "Mapa da cidade"`, Boolean(mapa));
  if (!mapa) continue;
  ok(`a ${largura} px "Mapa da cidade" está inteiro dentro da tela, sem rolar a barra`,
     mapa.esq >= -0.5 && mapa.dir <= m.largura + 0.5, `(${mapa.esq.toFixed(0)}..${mapa.dir.toFixed(0)} de ${m.largura})`);
  ok(`a ${largura} px o rótulo de "Mapa da cidade" cabe no próprio botão`,
     !mapa.cortado && mapa.rotuloEsq >= mapa.esq - 0.5 && mapa.rotuloDir <= mapa.dir + 0.5,
     `(rótulo ${mapa.rotuloEsq.toFixed(0)}..${mapa.rotuloDir.toFixed(0)}, botão ${mapa.esq.toFixed(0)}..${mapa.dir.toFixed(0)})`);
  ok(`a ${largura} px nenhum item da barra tem texto cortado`,
     m.itens.every((i) => !i.cortado), `(${m.itens.filter((i) => i.cortado).map((i) => i.texto).join(", ")})`);
  ok(`a ${largura} px todo item tem pelo menos 44 px de toque`,
     m.itens.every((i) => i.altura >= 43.5 && i.largura >= 43.5),
     `(${m.itens.filter((i) => i.altura < 43.5 || i.largura < 43.5).map((i) => `${i.texto} ${i.largura.toFixed(0)}x${i.altura.toFixed(0)}`).join(", ")})`);
  ok(`a ${largura} px a página não ganhou rolagem horizontal`, !m.paginaRola);
}
/*
  A tela atual precisa estar à vista na barra: a de "Organização" é a décima
  e fica na parte que rola, a 390 px. E o primeiro Tab continua caindo em
  "Pular para o conteúdo", e não no item seguinte ao da tela atual (o
  Chromium toma `scrollIntoView` como ponto de partida do Tab).
*/
await page.setViewportSize({ width: 390, height: 800 });
await page.goto(`${BASE}/organizacao`, { waitUntil: "networkidle" });
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.waitForTimeout(300);
const atual = await page.evaluate(() => {
  const a = document.querySelector('.lateral__item[aria-current="page"]');
  const r = a?.getBoundingClientRect();
  return r ? { texto: a.textContent.trim(), esq: r.left, dir: r.right, largura: window.innerWidth } : null;
});
ok("a 390 px o ladrilho da tela atual (Organização) está inteiro à vista",
   Boolean(atual) && atual.esq >= -0.5 && atual.dir <= atual.largura + 0.5, `(${JSON.stringify(atual)})`);
await page.keyboard.press("Tab");
ok("o primeiro Tab da página cai em Pular para o conteúdo, mesmo com a barra rolada",
   await page.evaluate(() => document.activeElement?.className === "pular-para-conteudo"
     || document.activeElement?.textContent?.includes("Pular para o conteúdo")));
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(100);
ok("a 1280 px a barra é a lateral e não o pé da tela",
   await page.evaluate(() => getComputedStyle(document.querySelector("nav.lateral")).flexDirection === "column"));

console.log("\n== 4. O painel pede só o que o papel pode ver ==");
async function pedidosDeDevolvidas(email, caminho) {
  const senha = email === emailLongo || email === emailCoordenacao ? SENHA_DO_TESTE : SENHA;
  /*
    Contexto novo a cada pessoa: com a página compartilhada, o pedido que a
    sessão ANTERIOR ainda tinha em voo contaria como se fosse da atual, e o
    teste atribuiria o 403 de um papel ao outro.
  */
  const ctx = await navegador.newContext({ locale: "pt-BR" });
  const pg = await ctx.newPage();
  const pedidos = [];
  pg.on("response", (r) => { if (r.url().includes("/ocorrencias/devolvidas")) pedidos.push(r.status()); });
  pg.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text()}`); });
  pg.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  await entrar(email, senha, pg);
  await pg.goto(`${BASE}${caminho}`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
  await pg.waitForTimeout(500);
  const texto = (await pg.locator("main, .conteudo").first().textContent()) ?? "";
  await ctx.close();
  return { pedidos, texto };
}
for (const caminho of ["/painel", "/ocorrencias"]) {
  const operador = await pedidosDeDevolvidas(emailLongo, caminho);
  ok(`o operador abre ${caminho} sem pedir as devolvidas (que ele não pode ver)`,
     operador.pedidos.length === 0, `(pedidos: ${operador.pedidos.join(",")})`);
  ok(`o operador em ${caminho} não lê a frase de que a consulta falhou`,
     !operador.texto.includes("não respondeu agora"));
  const coordenacaoVendo = await pedidosDeDevolvidas(emailCoordenacao, caminho);
  ok(`a coordenadora abre ${caminho} e pede as devolvidas, com 200`,
     coordenacaoVendo.pedidos.length >= 1 && coordenacaoVendo.pedidos.every((s) => s === 200),
     `(pedidos: ${coordenacaoVendo.pedidos.join(",")})`);
}

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
