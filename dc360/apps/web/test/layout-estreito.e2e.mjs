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
/*
  O WebKit do Playwright no macOS não leva o Tab a links nem a botões (é a
  preferência "Pressionar Tab para destacar cada item", desligada por padrão
  nessa plataforma): numa página mínima só com um link, o primeiro Tab não chega
  nele. Sonda-se isso primeiro, para esta conferência só valer onde o Tab anda de
  verdade, e não reprovar o painel por um comportamento do motor (visto na rodada
  de conserto da V2-F00-E09: sonda arquivada em correcao-2/sondas).
*/
const paginaSonda = await contexto.newPage();
await paginaSonda.setContent('<a href="#x" id="alvo">link</a>');
await paginaSonda.keyboard.press("Tab");
const tabAlcancaLink = await paginaSonda.evaluate(() => document.activeElement?.id === "alvo");
await paginaSonda.close();
if (tabAlcancaLink) {
  await page.keyboard.press("Tab");
  ok("o primeiro Tab da página cai em Pular para o conteúdo, mesmo com a barra rolada",
     await page.evaluate(() => document.activeElement?.className === "pular-para-conteudo"
       || document.activeElement?.textContent?.includes("Pular para o conteúdo")));
} else {
  console.log(`  PULADA o primeiro Tab cai em Pular para o conteúdo (em ${MOTOR} o Tab não alcança links nem numa página mínima)`);
}
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


/**
 * Tudo o que está FORA DO LUGAR dentro de um cartão ou de uma janela.
 *
 * Foi o buraco da validação da E09 (rodada 2): o teste media as janelas e a
 * barra do pé, e "Minha conta" a 320 px passou verde com o botão "Encerrar
 * minhas outras sessões" 16 px além da coluna. Aqui a régua é o RETÂNGULO, em
 * qualquer tela: cada botão, link-botão, campo, selo, aviso e item de lista tem
 * de caber na área útil (dentro do padding) do cartão ou da janela que o
 * contém, o texto dele tem de caber nele, e a página não pode ganhar rolagem
 * horizontal. O que está dentro de um envoltório que rola de propósito (a
 * tabela, que traz a dica "A tabela continua para a direita") fica de fora.
 */
async function foraDoLugar(pg) {
  return pg.evaluate(() => {
    const descreve = (e) =>
      `${e.tagName.toLowerCase()}${typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).join(".") : ""} "${(e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
    const rola = (e) => {
      for (let a = e.parentElement; a; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if ((o === "auto" || o === "scroll") && !a.classList.contains("modal__painel")) return true;
      }
      return false;
    };
    const problemas = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1)
      problemas.push(`a pagina ganhou rolagem horizontal (${document.documentElement.scrollWidth} contra ${window.innerWidth})`);
    const escopo = document.querySelector(".modal__painel") ?? document.querySelector("main.conteudo");
    if (!escopo) return ["nada para medir"];
    const candidatos = escopo.querySelectorAll(
      "button, a.botao, input:not([type=hidden]), select, textarea, .selo, .aviso, .sessoes__item, .senha-temporaria__bloco",
    );
    for (const e of candidatos) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || rola(e)) continue;
      const caixa = e.closest(".modal__painel, .cartao__corpo") ?? escopo;
      const c = caixa.getBoundingClientRect();
      const st = getComputedStyle(caixa);
      const esq = c.left + parseFloat(st.paddingLeft) + parseFloat(st.borderLeftWidth);
      const dir = c.right - parseFloat(st.paddingRight) - parseFloat(st.borderRightWidth);
      if (r.left < esq - 0.5 || r.right > dir + 0.5)
        problemas.push(`${descreve(e)} sai da area util (${r.left.toFixed(0)}..${r.right.toFixed(0)} contra ${esq.toFixed(0)}..${dir.toFixed(0)})`);
      if (e.matches("button, a.botao") && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1))
        problemas.push(`${descreve(e)} com o texto cortado`);
      if (e.matches("button, a.botao") && r.height < 43.5)
        problemas.push(`${descreve(e)} abaixo de 44 px de altura (${r.height.toFixed(0)})`);
    }
    return problemas;
  });
}

console.log("\n== 5. Minha conta cabe, do celular pequeno à mesa (V2-F00-E09, correção 2) ==");
/*
  Duas sessões abertas: uma criada agora pela API e a do próprio navegador. É
  isso que faz o botão "Encerrar minhas outras sessões" existir, e o botão é
  justamente o que passava da coluna a 320 px.
*/
const ctxConta = await navegador.newContext({ locale: "pt-BR" });
const paginaConta = await ctxConta.newPage();
paginaConta.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
paginaConta.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text()}`); });
const outraSessao = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: emailCoordenacao, senha: SENHA_DO_TESTE } });
ok("a coordenadora abre uma sessão a mais pela API", outraSessao.status === 200, `(${outraSessao.status})`);
await entrar(emailCoordenacao, SENHA_DO_TESTE, paginaConta);
await paginaConta.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
const botaoOutras = paginaConta.getByRole("button", { name: "Encerrar minhas outras sessões" });
await botaoOutras.waitFor({ timeout: 30_000 });
/*
  A coordenadora já entrou outras vezes neste arquivo (seção 4), então costuma
  haver mais de duas sessões, e o rótulo do botão da janela traz a conta:
  "Encerrar as outras N sessões". O teste exige pelo menos duas e não fixa N.
*/
ok("Minha conta lista pelo menos duas sessões e mostra o botão de encerrar as outras",
   (await paginaConta.locator(".sessoes__item").count()) >= 2);
for (const largura of [320, 390, 768, 1280]) {
  await paginaConta.setViewportSize({ width: largura, height: 900 });
  await paginaConta.waitForTimeout(150);
  const problemas = await foraDoLugar(paginaConta);
  ok(`Minha conta a ${largura} px: nada fora do lugar (botão, selos, lista e campos dentro do cartão)`,
     problemas.length === 0, `(${problemas.join(" | ")})`);
}

console.log("\n== 6. Usuários e a janela da senha temporária a 320 e 390 px ==");
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
for (const largura of [320, 390, 768]) {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.waitForTimeout(150);
  const problemas = await foraDoLugar(page);
  ok(`Usuários a ${largura} px: nada fora do lugar fora da tabela que rola`, problemas.length === 0, `(${problemas.join(" | ")})`);
}
for (const largura of [320, 390]) {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.waitForTimeout(100);
  const alvo = page.locator("tbody tr", { hasText: emailLongo });
  await alvo.getByRole("button", { name: "Redefinir senha", exact: true }).scrollIntoViewIfNeeded();
  await alvo.getByRole("button", { name: "Redefinir senha", exact: true }).click();
  const janela = page.getByRole("dialog");
  await janela.waitFor({ timeout: 10_000 });
  await janela.getByRole("button", { name: /^Redefinir a senha de Marcos/ }).click();
  await janela.getByRole("button", { name: "Já anotei a senha" }).waitFor({ timeout: 20_000 });
  const problemas = await foraDoLugar(page);
  ok(`a janela da senha temporária a ${largura} px: nada fora do lugar`, problemas.length === 0, `(${problemas.join(" | ")})`);
  await janela.getByRole("button", { name: "Já anotei a senha" }).click();
  await janela.waitFor({ state: "detached", timeout: 10_000 });
}

console.log("\n== 7. Depois de encerrar as outras sessões, o foco não cai em BODY (WCAG 2.4.3) ==");
await paginaConta.setViewportSize({ width: 390, height: 900 });
await paginaConta.getByRole("button", { name: "Encerrar minhas outras sessões" }).focus();
await paginaConta.keyboard.press("Enter");
const janelaConta = paginaConta.getByRole("dialog");
await janelaConta.waitFor({ timeout: 10_000 });
await janelaConta.getByRole("button", { name: /^Encerrar (a outra sessão|as outras \d+ sessões)$/ }).click();
await paginaConta.locator(".aviso--sucesso").waitFor({ timeout: 20_000 });
// O botão some quando a lista é relida: é esse o instante em que o foco se perdia.
await botaoOutras.waitFor({ state: "detached", timeout: 20_000 });
await paginaConta.waitForTimeout(300);
const foco = await paginaConta.evaluate(() => {
  const a = document.activeElement;
  return {
    tag: a?.tagName ?? "nenhum", conectado: Boolean(a?.isConnected),
    dentroDaConfirmacao: a !== document.body && (Boolean(a?.closest?.(".aviso--sucesso")) || Boolean(a?.querySelector?.(".aviso--sucesso"))),
    texto: (a?.textContent ?? "").trim().slice(0, 60),
    eOAviso: Boolean(a?.classList?.contains("aviso--sucesso")),
    tabindex: a?.getAttribute?.("tabindex") ?? null,
    papel: a?.getAttribute?.("role") ?? null,
    regiaoViva: Boolean(a?.closest?.("[role=status],[role=alert]")) || Boolean(a?.querySelector?.("[role=status],[role=alert]")),
  };
});
ok("depois de encerrar as outras sessões o foco continua num elemento que existe, e não em BODY",
   foco.tag !== "BODY" && foco.tag !== "HTML" && foco.conectado, `(${JSON.stringify(foco)})`);
ok("e esse elemento é a confirmação (quem usa leitor de tela ouve o que aconteceu)",
   foco.dentroDaConfirmacao && /foi encerrada|foram encerradas/.test(foco.texto), `(${JSON.stringify(foco)})`);
/*
  UM mecanismo só (rodada de conserto da correção 2): o foco. A confirmação é o
  próprio aviso, focável por código, e NÃO é região viva nem está dentro de uma:
  um `div` sem papel em volta de um `role="status"` fazia o leitor dizer a frase
  duas vezes (uma pelo foco, outra pela região).
*/
ok("a confirmação é o próprio aviso (tabindex -1), sem papel de região viva, e não há região viva em volta nem dentro",
   foco.eOAviso && foco.tabindex === "-1" && foco.papel === null && !foco.regiaoViva, `(${JSON.stringify(foco)})`);
await ctxConta.close();


console.log("\n== 8. O aviso passageiro não cobre a janela da senha temporária (V2-F00-E09, correção 4) ==");
/*
  O defeito da arbitragem da rodada 5: encerrar as sessões de alguém e, logo em
  seguida, redefinir a senha dessa mesma pessoa (o "perdi o celular"). O aviso de
  "sessões encerradas" ficava por cima da janela da senha temporária, no
  `z-index` 50 contra os 40 da janela; a 320x568 escondia "Copiar senha" e "Já
  anotei a senha", e o toque no texto do aviso caía no botão escondido e fechava
  a janela, perdendo a senha de uso único.

  Mede o que a pessoa vê e toca: nenhum aviso visível sobrepõe o retângulo da
  janela, e o centro de cada botão da janela recebe o toque (o que o navegador
  entrega a `elementFromPoint`, que já ignora o ramo `inert`).
*/
for (const [largura, altura] of [[320, 568], [390, 844], [1280, 900]]) {
  await page.setViewportSize({ width: largura, height: altura });
  await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
  const alvo = page.locator("tbody tr", { hasText: emailLongo });
  await alvo.getByRole("button", { name: "Encerrar sessões", exact: true }).scrollIntoViewIfNeeded();
  await alvo.getByRole("button", { name: "Encerrar sessões", exact: true }).click();
  const confirmacao = page.getByRole("dialog");
  await confirmacao.waitFor({ timeout: 10_000 });
  await confirmacao.getByRole("button", { name: /^Encerrar sessões de Marcos/ }).click();
  await page.waitForSelector(".toast", { timeout: 20_000 });
  await alvo.getByRole("button", { name: "Redefinir senha", exact: true }).click();
  const janelaSenha = page.getByRole("dialog");
  await janelaSenha.waitFor({ timeout: 10_000 });
  await janelaSenha.getByRole("button", { name: /^Redefinir a senha de Marcos/ }).click();
  await janelaSenha.getByRole("button", { name: "Já anotei a senha" }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const medida = await page.evaluate(() => {
    const painel = document.querySelector(".modal__painel").getBoundingClientRect();
    const visiveis = [...document.querySelectorAll(".toast")].filter(
      (t) => t.getClientRects().length > 0 && getComputedStyle(t).visibility !== "hidden",
    );
    const sobre = visiveis.filter((t) => {
      const a = t.getBoundingClientRect();
      return !(a.right <= painel.left || a.left >= painel.right || a.bottom <= painel.top || a.top >= painel.bottom);
    });
    const botoes = [...document.querySelectorAll(".modal__painel button")].map((b) => {
      const r = b.getBoundingClientRect();
      const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { texto: b.textContent.trim(), recebeOToque: topo?.closest("button") === b };
    });
    return { visiveis: visiveis.length, sobreAJanela: sobre.length, botoes };
  });
  ok(`a ${largura} px, com a janela da senha temporária aberta, nenhum aviso passageiro a cobre`,
     medida.sobreAJanela === 0, `(${medida.sobreAJanela} aviso(s) sobre a janela)`);
  ok(`a ${largura} px, o centro de cada botão da janela da senha temporária recebe o toque`,
     medida.botoes.length >= 2 && medida.botoes.every((b) => b.recebeOToque),
     `(${JSON.stringify(medida.botoes)})`);
  // Fechar a janela pelo botão dela: o aviso, que esperava, volta, e o "Fechar" dele responde.
  await janelaSenha.getByRole("button", { name: "Já anotei a senha" }).click();
  await janelaSenha.waitFor({ state: "detached", timeout: 10_000 });
  const aviso = page.locator(".toast");
  await aviso.waitFor({ timeout: 10_000 });
  ok(`a ${largura} px, fechada a janela, o aviso de sessões encerradas aparece (esperou, não se perdeu)`,
     /Marcos/.test((await aviso.textContent()) ?? ""));
  await aviso.getByRole("button", { name: "Fechar" }).click({ timeout: 5_000 });
  await aviso.waitFor({ state: "detached", timeout: 5_000 });
  ok(`a ${largura} px, o Fechar do aviso responde e o aviso sai da tela`, (await page.locator(".toast").count()) === 0);
}

console.log("\n== 9. O email da lista de usuários não quebra no meio da palavra (V2-F00-E09, correção 4) ==");
/*
  Mede por caractere (Range), e não por classe CSS: o defeito era o navegador
  cortar "serraalta.exemplo.gov.br" onde a coluna acabava ("serraalta.ex /
  emplo.gov.br", "exemplo.gov.b / r"). Toda linha de email, menos a última,
  tem de terminar em "@" ou em ponto; e o email inteiro tem de caber na célula.
*/
async function quebrasDosEmails(pg) {
  return pg.evaluate(() => {
    const saida = [];
    for (const el of document.querySelectorAll("tbody td:first-child .tabela__secundario")) {
      if (!el.textContent.includes("@")) continue;
      const nos = [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) nos.push(w.currentNode);
      const linhas = [];
      let atual = "", y = null;
      for (const no of nos) {
        for (let i = 0; i < no.textContent.length; i++) {
          const r = document.createRange();
          r.setStart(no, i); r.setEnd(no, i + 1);
          const ry = Math.round(r.getBoundingClientRect().top);
          if (y !== null && ry > y + 2) { linhas.push(atual); atual = ""; }
          y = ry; atual += no.textContent[i];
        }
      }
      linhas.push(atual);
      const celula = el.closest("td").getBoundingClientRect();
      const texto = el.getBoundingClientRect();
      saida.push({
        email: nos.map((n) => n.textContent).join(""), linhas,
        noMeioDaPalavra: linhas.slice(0, -1).filter((l) => !/[@.]$/.test(l)),
        passaDaCelula: texto.right > celula.right + 0.5,
      });
    }
    return saida;
  });
}
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
for (const largura of [1440, 1280, 768, 390, 320]) {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.waitForTimeout(200);
  const emails = await quebrasDosEmails(page);
  ok(`a ${largura} px a lista mostra pelo menos 5 emails para medir`, emails.length >= 5, `(${emails.length})`);
  const mal = emails.filter((e) => e.noMeioDaPalavra.length > 0);
  ok(`a ${largura} px nenhum email quebra no meio da palavra`,
     mal.length === 0, `(${mal.map((e) => e.linhas.join(" / ")).join(" | ")})`);
  const estouro = emails.filter((e) => e.passaDaCelula);
  ok(`a ${largura} px nenhum email passa da própria célula`,
     estouro.length === 0, `(${estouro.map((e) => e.email).join(", ")})`);
}

console.log("\n== 10. A senha atual errada diz o que fazer, com acento, no campo certo (V2-F00-E09, correção 4) ==");
/*
  Duas telas fazem o mesmo pedido (`/auth/trocar-senha`) e dão nomes diferentes
  ao campo: "Senha que você usa hoje" em Minha conta e "Senha provisória que você
  recebeu" em "Defina a sua senha". A frase tem de nomear o campo da tela, ter
  acento e dizer o que fazer. O 401 que o teste provoca é esperado e fica fora do
  registro de erros de console; qualquer outro erro continua reprovando.
*/
async function contextoQueEsperaOs401() {
  const ctx = await navegador.newContext({ locale: "pt-BR" });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  pg.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource: the server responded with a status of 401/.test(m.text())) return;
    erros.push(`console: ${m.text()}`);
  });
  return { ctx, pg };
}
/** O texto do erro do campo, ou uma frase que reprova com clareza se o campo não mostrou erro nenhum. */
async function textoDoErro(erro) {
  try {
    await erro.waitFor({ timeout: 8_000 });
    return ((await erro.textContent()) ?? "").trim();
  } catch {
    return "(o campo não mostrou erro nenhum)";
  }
}
{
  const { ctx, pg } = await contextoQueEsperaOs401();
  await entrar(emailCoordenacao, SENHA_DO_TESTE, pg);
  for (const [largura, altura] of [[1280, 900], [390, 844], [320, 568]]) {
    await pg.setViewportSize({ width: largura, height: altura });
    await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("senha-que-nao-e-a-dela");
    await pg.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
    await pg.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
    await pg.getByRole("button", { name: "Trocar senha", exact: true }).click();
    const erro = pg.locator("#conta-senha-atual-erro");
    const texto = await textoDoErro(erro);
    ok(`Minha conta a ${largura} px: a frase da senha errada nomeia a senha que a pessoa usa hoje e diz o que fazer`,
       texto.endsWith("A senha que você usa hoje não confere. Confira e digite de novo."), `("${texto}")`);
    ok(`Minha conta a ${largura} px: o erro está ligado ao campo (aria-describedby) e a frase não tem português sem acento`,
       ((await pg.locator("#conta-senha-atual").getAttribute("aria-describedby")) ?? "").includes("conta-senha-atual-erro")
         && !/\bnao\b/.test(texto), `("${texto}")`);
  }
  await ctx.close();
}
{
  const admin = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
  const redefinida = await viaApi(`/usuarios/${criada.json.id}/redefinir-senha`, { metodo: "POST", token: admin.json.acesso, corpo: {} });
  ok("a administradora redefine a senha da pessoa de teste (200 com senha temporária)",
     redefinida.status === 200 && typeof redefinida.json.senhaTemporaria === "string", `(${redefinida.status})`);
  const { ctx, pg } = await contextoQueEsperaOs401();
  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await pg.locator("#entrada-email").fill(emailLongo);
  await pg.locator("#entrada-senha").fill(redefinida.json.senhaTemporaria);
  await pg.getByRole("button", { name: "Entrar", exact: true }).click();
  await pg.getByRole("heading", { name: "Defina a sua senha" }).waitFor({ timeout: 30_000 });
  for (const [largura, altura] of [[390, 844], [1280, 900], [320, 568]]) {
    await pg.setViewportSize({ width: largura, height: altura });
    await pg.locator("#senha-nova-atual").fill("provisoria-digitada-errada");
    await pg.locator("#senha-nova").fill("frase-nova-do-teste-2026");
    await pg.locator("#senha-nova-repetida").fill("frase-nova-do-teste-2026");
    await pg.getByRole("button", { name: "Definir senha e entrar" }).click();
    const erro = pg.locator("#senha-nova-atual-erro");
    const texto = await textoDoErro(erro);
    ok(`"Defina a sua senha" a ${largura} px: a frase da provisória errada nomeia a provisória e diz o que fazer`,
       texto.endsWith("A senha provisória que você recebeu não confere. Confira como ela foi anotada e digite de novo."),
       `("${texto}")`);
    ok(`"Defina a sua senha" a ${largura} px: o erro está no campo da provisória, e não na senha nova`,
       ((await pg.locator("#senha-nova-atual").getAttribute("aria-describedby")) ?? "").includes("senha-nova-atual-erro")
         && (await pg.locator("#senha-nova-erro").count()) === 0 && !/\bnao\b/.test(texto), `("${texto}")`);
  }
  await ctx.close();
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
