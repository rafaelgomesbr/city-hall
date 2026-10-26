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

/**
 * O token de acesso da administradora vale 15 minutos, e a seção 13 sozinha passa
 * disso em máquina carregada (a execução inteira foi de 10 a mais de 25 minutos): o
 * token da primeira linha da seção virava 401 no meio dela. Reentra quando o que
 * se tem tem mais de 5 minutos.
 */
let ultimoTokenDoAdm = { em: 0, token: "" };
async function tokenDoAdm() {
  if (Date.now() - ultimoTokenDoAdm.em > 5 * 60_000) {
    const r = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
    ultimoTokenDoAdm = { em: Date.now(), token: r.json.acesso };
  }
  return ultimoTokenDoAdm.token;
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
 * do próprio botão. Mede o item DEPOIS de a página assentar. Desde o menu
 * "Mais" (H08) a barra não rola: se rolar, `barraRola` acusa.
 */
async function medirBarra() {
  return page.evaluate(() => {
    const barra = document.querySelector("nav.lateral");
    if (!barra) return null;
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
    return {
      largura, itens, paginaRola: document.documentElement.scrollWidth > largura + 1,
      barraRola: barra.scrollWidth > barra.clientWidth + 1,
    };
  });
}

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

console.log("\n== 3. A barra de navegação não corta os rótulos e não rola (H08) ==");
/*
  O menu "Mais" (H08, decisão do Rafael em 2026-10-26) trocou a barra que rolava
  na horizontal por uma barra de ladrilhos que cabem INTEIROS: os destinos mais
  usados e o botão "Mais", que abre o resto. A conta de quantos entram é a de
  `navegacao-mais.ts`: 2 destinos até 360 px, 3 até 600 px, 5 até 900 px.
*/
function ladrilhosEsperados(largura) {
  const todos = ["Painel", "Ocorrências", "Mapa da cidade", "Quem está em campo"];
  const quantos = largura <= 360 ? 2 : largura <= 600 ? 3 : 5;
  return [...todos.slice(0, quantos), "Mais"];
}
await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
for (const largura of [320, 360, 361, 390, 768]) {
  await page.setViewportSize({ width: largura, height: 800 });
  await page.waitForTimeout(150);
  const m = await medirBarra();
  const textos = m?.itens.map((i) => i.texto) ?? [];
  ok(`a ${largura} px a barra tem os destinos principais e o Mais, nessa ordem`,
     JSON.stringify(textos) === JSON.stringify(ladrilhosEsperados(largura)),
     `(${textos.join(" | ")})`);
  if (!m) continue;
  ok(`a ${largura} px todo ladrilho está inteiro dentro da tela`,
     m.itens.every((i) => i.esq >= -0.5 && i.dir <= m.largura + 0.5),
     `(${m.itens.map((i) => `${i.texto} ${i.esq.toFixed(0)}..${i.dir.toFixed(0)}`).join(", ")} de ${m.largura})`);
  ok(`a ${largura} px o rótulo de cada ladrilho cabe no próprio botão`,
     m.itens.every((i) => !i.cortado && i.rotuloEsq >= i.esq - 0.5 && i.rotuloDir <= i.dir + 0.5),
     `(${m.itens.filter((i) => i.cortado).map((i) => i.texto).join(", ")})`);
  ok(`a ${largura} px todo item tem pelo menos 44 px de toque`,
     m.itens.every((i) => i.altura >= 43.5 && i.largura >= 43.5),
     `(${m.itens.filter((i) => i.altura < 43.5 || i.largura < 43.5).map((i) => `${i.texto} ${i.largura.toFixed(0)}x${i.altura.toFixed(0)}`).join(", ")})`);
  ok(`a ${largura} px a barra não rola na horizontal (nada escondido para a direita)`, !m.barraRola);
  ok(`a ${largura} px a página não ganhou rolagem horizontal`, !m.paginaRola);
}

console.log("\n== 3b. O menu Mais: abre, mostra o resto, fecha por Esc, fora e ao escolher (H08) ==");
/*
  O comportamento que a validação de teclado e de leitor de tela cobra de um
  botão que abre e fecha: `aria-expanded` verdadeiro quando aberto, o foco
  entra no menu, o Esc fecha e devolve o foco ao botão, o Tab que sai da barra
  fecha sem armadilha, escolher um destino fecha e leva à tela nova com o botão
  marcado como "você está aqui". Mede retângulos, e não classe.
*/
const DESTINOS_DO_MENU = {
  320: ["Mapa da cidade", "Quem está em campo", "Equipes", "Órgãos de destino", "Usuários", "Prestação de contas", "Organização", "Tema escuro", "Sair"],
  390: ["Quem está em campo", "Equipes", "Órgãos de destino", "Usuários", "Prestação de contas", "Organização", "Tema escuro", "Sair"],
  768: ["Equipes", "Órgãos de destino", "Usuários", "Prestação de contas", "Organização", "Tema escuro", "Sair"],
};
const maisAberto = () => page.locator("button.lateral__mais").getAttribute("aria-expanded");
for (const [largura, altura] of [[320, 568], [390, 844], [768, 900]]) {
  await page.setViewportSize({ width: largura, height: altura });
  await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
  await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
  await page.waitForTimeout(150);
  ok(`a ${largura} px o Mais começa fechado, sem menu na página`,
     (await maisAberto()) === "false" && (await page.locator(".lateral__menu").count()) === 0);
  await page.locator("button.lateral__mais").click();
  await page.locator(".lateral__menu").waitFor({ timeout: 5_000 });
  await page.waitForTimeout(200);
  ok(`a ${largura} px aberto, o Mais diz aria-expanded=true e aponta o menu por aria-controls`,
     (await maisAberto()) === "true"
     && (await page.locator("button.lateral__mais").getAttribute("aria-controls"))
        === (await page.locator(".lateral__menu").getAttribute("id")));
  const aberto = await page.evaluate(() => {
    const menu = document.querySelector(".lateral__menu");
    const caixa = menu.getBoundingClientRect();
    const barra = document.querySelector("nav.lateral").getBoundingClientRect();
    const itens = [...menu.querySelectorAll(".lateral__menu-item")].map((a) => {
      a.scrollIntoView({ block: "nearest" });
      const r = a.getBoundingClientRect();
      const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        texto: a.textContent.trim(), altura: r.height, largura: r.width,
        recebeOToque: topo === a || a.contains(topo),
        dentro: r.left >= caixa.left - 0.5 && r.right <= caixa.right + 0.5,
        cortado: a.scrollWidth > a.clientWidth + 1,
      };
    });
    menu.scrollTop = 0;
    return {
      itens, esq: caixa.left, dir: caixa.right, topo: caixa.top, base: caixa.bottom,
      barraTopo: barra.top, largura: window.innerWidth,
      rolaPagina: document.documentElement.scrollWidth > window.innerWidth + 1,
      focoNoMenu: Boolean(document.activeElement?.closest(".lateral__menu")),
      aviso: document.querySelectorAll(".toast").length,
    };
  });
  ok(`a ${largura} px o menu tem exatamente o que saiu da barra, mais o Tema e o Sair`,
     JSON.stringify(aberto.itens.map((i) => i.texto)) === JSON.stringify(DESTINOS_DO_MENU[largura]),
     `(${aberto.itens.map((i) => i.texto).join(" | ")})`);
  ok(`a ${largura} px o menu está inteiro dentro da tela e acima da barra, sem rolagem horizontal da página`,
     aberto.esq >= -0.5 && aberto.dir <= aberto.largura + 0.5 && aberto.topo >= -0.5
     && aberto.base <= aberto.barraTopo + 0.5 && !aberto.rolaPagina,
     `(menu ${aberto.esq.toFixed(0)}..${aberto.dir.toFixed(0)} x ${aberto.topo.toFixed(0)}..${aberto.base.toFixed(0)}, barra em ${aberto.barraTopo.toFixed(0)}, tela ${aberto.largura})`);
  ok(`a ${largura} px todo item do menu tem pelo menos 44 px de toque, texto inteiro e recebe o toque`,
     aberto.itens.every((i) => i.altura >= 43.5 && i.largura >= 43.5 && i.recebeOToque && i.dentro && !i.cortado),
     `(${aberto.itens.filter((i) => i.altura < 43.5 || !i.recebeOToque || !i.dentro || i.cortado).map((i) => i.texto).join(", ")})`);
  ok(`a ${largura} px ao abrir, o foco entra no menu`, aberto.focoNoMenu);

  // Esc: fecha e devolve o foco ao botão Mais.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  ok(`a ${largura} px o Esc fecha o menu, o botão volta a aria-expanded=false e leva o foco`,
     (await maisAberto()) === "false" && (await page.locator(".lateral__menu").count()) === 0
     && (await page.evaluate(() => document.activeElement?.classList.contains("lateral__mais"))));

  // Clique fora: fecha.
  await page.locator("button.lateral__mais").click();
  await page.locator(".lateral__menu").waitFor({ timeout: 5_000 });
  await page.mouse.click(Math.round(largura / 2), 4);
  await page.waitForTimeout(150);
  ok(`a ${largura} px tocar fora do menu o fecha`,
     (await maisAberto()) === "false" && (await page.locator(".lateral__menu").count()) === 0);

  // O botão alterna: segundo toque fecha.
  await page.locator("button.lateral__mais").click();
  await page.locator(".lateral__menu").waitFor({ timeout: 5_000 });
  await page.locator("button.lateral__mais").click();
  await page.waitForTimeout(150);
  ok(`a ${largura} px tocar o Mais de novo fecha o menu`, (await maisAberto()) === "false");

  // Tab para fora da barra fecha, sem armadilha de foco.
  if (tabAlcancaLink) {
    await page.locator("button.lateral__mais").click();
    await page.locator(".lateral__menu").waitFor({ timeout: 5_000 });
    let passos = 0;
    while ((await page.locator(".lateral__menu").count()) > 0 && passos < 20) {
      await page.keyboard.press("Tab");
      passos += 1;
      await page.waitForTimeout(40);
    }
    ok(`a ${largura} px o Tab que sai da barra fecha o menu (em ${passos} Tab, sem armadilha de foco)`,
       (await page.locator(".lateral__menu").count()) === 0 && passos > 1 && passos < 20);
  } else {
    console.log(`  PULADA o Tab que sai da barra (em ${MOTOR} o Tab não alcança links nem numa página mínima)`);
  }

  // Escolher um destino: vai à tela, fecha o menu e o Mais passa a dizer "você está aqui".
  await page.locator("button.lateral__mais").click();
  await page.locator(".lateral__menu").waitFor({ timeout: 5_000 });
  await page.locator(".lateral__menu-item", { hasText: "Usuários" }).click();
  await page.waitForURL(/\/usuarios$/, { timeout: 10_000 });
  await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
  await page.waitForTimeout(300);
  const depois = await page.evaluate(() => ({
    menu: document.querySelectorAll(".lateral__menu").length,
    atual: document.querySelector("button.lateral__mais")?.classList.contains("lateral__mais--atual"),
    nome: document.querySelector("button.lateral__mais")?.textContent.trim(),
    foco: document.activeElement?.id,
  }));
  ok(`a ${largura} px escolher Usuários leva à tela, fecha o menu, marca o Mais e leva o foco ao conteúdo`,
     depois.menu === 0 && depois.atual === true && /inclui a tela atual/.test(depois.nome) && depois.foco === "conteudo",
     `(${JSON.stringify(depois)})`);
  // A tela dentro do menu aparece marcada ao reabrir.
  await page.locator("button.lateral__mais").click();
  await page.locator(".lateral__menu").waitFor({ timeout: 5_000 });
  ok(`a ${largura} px reaberto em Usuários, o item da tela atual leva aria-current`,
     (await page.locator('.lateral__menu-item[aria-current="page"]').textContent())?.trim() === "Usuários");
  await page.keyboard.press("Escape");
}

console.log("\n== 3c. Girar o aparelho com o menu aberto, e a lateral de mesa sem Mais ==");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/painel`, { waitUntil: "networkidle" });
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.locator("button.lateral__mais").click();
await page.locator(".lateral__menu").waitFor({ timeout: 5_000 });
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(300);
ok("ao passar do celular para a mesa com o menu aberto, ele some e a lateral volta inteira",
   (await page.locator(".lateral__menu").count()) === 0 && (await page.locator("button.lateral__mais").count()) === 0
   && (await page.locator("nav.lateral .lateral__item").count()) >= 11);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
ok("e de volta ao celular o menu começa fechado", (await maisAberto()) === "false" && (await page.locator(".lateral__menu").count()) === 0);

/*
  A tela atual precisa estar à vista na barra, e o primeiro Tab continua caindo
  em "Pular para o conteúdo". A de "Organização" mora no menu: o Mais é que leva
  a marca, e continua à vista.
*/
await page.setViewportSize({ width: 390, height: 800 });
await page.goto(`${BASE}/organizacao`, { waitUntil: "networkidle" });
await page.waitForSelector(".cabecalho-pagina h1", { timeout: 30_000 });
await page.waitForTimeout(300);
const atual = await page.evaluate(() => {
  const a = document.querySelector("button.lateral__mais--atual");
  const r = a?.getBoundingClientRect();
  return r ? { texto: a.textContent.trim(), esq: r.left, dir: r.right, largura: window.innerWidth } : null;
});
ok("a 390 px, em Organização, o botão Mais leva a marca de tela atual e está inteiro à vista",
   Boolean(atual) && atual.esq >= -0.5 && atual.dir <= atual.largura + 0.5, `(${JSON.stringify(atual)})`);

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
    const focoDentro = document.querySelector(".modal__painel").contains(document.activeElement);
    // Medido DEPOIS de abrir no topo e de rolar o painel até cada botão, como a pessoa faz.
    const rolagemDeAbertura = document.querySelector(".modal__painel").scrollTop;
    const botoes = [...document.querySelectorAll(".modal__painel button")].map((b) => {
      b.scrollIntoView({ block: "nearest" });
      const r = b.getBoundingClientRect();
      const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { texto: b.textContent.trim(), recebeOToque: topo?.closest("button") === b };
    });
    document.querySelector(".modal__painel").scrollTop = rolagemDeAbertura;
    // A janela abre NO TOPO: o painel rola, e o foco inicial o rolava até o botão do pé.
    const painelEl = document.querySelector(".modal__painel");
    const titulo = painelEl.querySelector("h2").getBoundingClientRect();
    const topoDoPainel = painelEl.getBoundingClientRect().top;
    return {
      avisosNoDom: document.querySelectorAll(".toast").length,
      visiveis: visiveis.length, sobreAJanela: sobre.length, botoes,
      rolagemDoPainel: painelEl.scrollTop, focoDentro,
      tituloVisivel: titulo.top >= topoDoPainel - 0.5 && titulo.bottom <= window.innerHeight,
    };
  });
  ok(`a ${largura} px, com a janela da senha temporária aberta, nenhum aviso passageiro a cobre`,
     medida.sobreAJanela === 0, `(${medida.sobreAJanela} aviso(s) sobre a janela)`);
  ok(`a ${largura} px, o centro de cada botão da janela da senha temporária recebe o toque`,
     medida.botoes.length >= 2 && medida.botoes.every((b) => b.recebeOToque),
     `(${JSON.stringify(medida.botoes)})`);
  ok(`a ${largura} px, a janela da senha temporária abre no topo (painel sem rolagem) e o título está à vista`,
     medida.rolagemDoPainel === 0 && medida.tituloVisivel, `(rolagem ${medida.rolagemDoPainel}, título à vista: ${medida.tituloVisivel})`);
  ok(`a ${largura} px, o foco está dentro da janela da senha temporária (no painel ou no primeiro botão)`, medida.focoDentro);
  /*
    H26 (decisão do Rafael em 2026-10-26): com a janela da senha aberta o aviso
    não existe na página, então não há texto dele para cobrir "Já anotei a
    senha" nem para receber o toque que fecharia a janela. Ele espera e volta
    quando a janela fecha (conferido mais abaixo).
  */
  ok(`a ${largura} px, com a janela da senha temporária aberta, não há aviso passageiro na página para receber o toque`,
     medida.avisosNoDom === 0, `(${medida.avisosNoDom} aviso(s) no DOM)`);
  /*
    H05 (decisão do Rafael em 2026-10-26): o Esc NÃO fecha a janela da senha,
    que aparece uma vez só. Vale com o foco no painel e com o foco fora dele (no
    <body>, que é por onde o Esc chega ao documento).
  */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok(`a ${largura} px, o Esc não fecha a janela da senha temporária (foco dentro dela)`,
     await janelaSenha.isVisible());
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok(`a ${largura} px, o Esc não fecha a janela da senha temporária (foco fora dela, no corpo da página)`,
     await janelaSenha.isVisible());
  ok(`a ${largura} px, depois do Esc a senha continua na tela, com os dois botões`,
     (await janelaSenha.locator(".senha-temporaria__valor").innerText()).trim().length >= 8
     && await janelaSenha.getByRole("button", { name: "Copiar senha" }).isVisible()
     && await janelaSenha.getByRole("button", { name: "Já anotei a senha" }).isVisible());
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
    for (const el of document.querySelectorAll("tbody td .tabela__secundario")) {
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
/*
  O foco depois da senha errada, pelos três jeitos de enviar (V2-F00-E09, correção
  5, rodada 6): o clique já era medido; aqui entram o Espaço no botão focado e o
  Enter no último campo. A rodada 6 viu o foco em BODY no Firefox nos dois
  primeiros e, no Enter, parado no último campo, e não no campo inválido. Espera
  a resposta do servidor e mais um instante, porque o que se mede é o foco já
  ASSENTADO, e não o do quadro seguinte ao clique.
*/
async function enviarPeloTeclado(pg, modo, botao, ultimoCampo) {
  const resposta = pg.waitForResponse((r) => r.url().includes("/auth/trocar-senha"), { timeout: 20_000 });
  if (modo === "Enter") {
    await pg.locator(ultimoCampo).press("Enter");
  } else {
    await botao.focus();
    await pg.keyboard.press("Space");
  }
  await resposta;
  /*
    A resposta que se espera é a PRIMEIRA: o 401 de senha errada faz o cliente
    renovar o token e repetir o pedido uma vez, então o desfecho de verdade
    chega depois (e, sob carga, bem depois). O sinal de que acabou é o botão de
    enviar voltar a ficar habilitado: medir antes disso media o foco do meio do
    envio, e reprovou ao acaso no Firefox e no WebKit.
  */
  const sinalDeFim = await botao.elementHandle();
  await pg.waitForFunction((el) => !el.disabled, sinalDeFim, { timeout: 20_000 });
  await pg.waitForTimeout(300);
  return pg.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
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
    const icone = await erro.locator("svg").evaluate((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
    ok(`Minha conta a ${largura} px: o ícone do erro não é espremido (14x14)`,
       icone[0] >= 13.5 && icone[1] >= 13.5, `(${icone.map((n) => n.toFixed(1)).join("x")})`);
    ok(`Minha conta a ${largura} px: depois do envio o foco está no campo da senha atual, e não em BODY`,
       (await pg.evaluate(() => document.activeElement?.id)) === "conta-senha-atual",
       `(${await pg.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)})`);
    // O foco por código rola o campo para a vista, e o topo fixo não pode ficar por cima do rótulo e da borda dele (correção 5).
    ok(`Minha conta a ${largura} px: o campo focado, com o rótulo, fica abaixo do topo fixo (nada escondido atrás dele)`,
       await pg.evaluate(() => {
         const campo = document.activeElement?.closest(".campo") ?? document.activeElement;
         return campo.getBoundingClientRect().top >= document.querySelector(".topo").getBoundingClientRect().bottom - 0.5;
       }));
    ok(`Minha conta a ${largura} px: o erro está ligado ao campo (aria-describedby) e a frase não tem português sem acento`,
       ((await pg.locator("#conta-senha-atual").getAttribute("aria-describedby")) ?? "").includes("conta-senha-atual-erro")
         && !/\bnao\b/.test(texto), `("${texto}")`);
  }
  /*
    O campo focado por código tem de aparecer COM o rótulo, e não por baixo do
    topo fixo (V2-F00-E09, correção 5, visto nas capturas). O topo do celular tem
    duas linhas (129 px) e o foco leva o CAMPO ao `scroll-padding-top`, deixando o
    rótulo (uns 32 px acima) escondido. Só aparece quando a página precisa rolar
    até o campo, então a altura da janela é baixa de propósito (700 px).
  */
  for (const largura of [390, 360, 320]) {
    await pg.setViewportSize({ width: largura, height: 700 });
    await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("senha-que-nao-e-a-dela");
    await pg.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
    await pg.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
    await pg.getByRole("button", { name: "Trocar senha", exact: true }).click();
    await pg.locator("#conta-senha-atual-erro").waitFor({ timeout: 20_000 });
    await pg.waitForTimeout(500);
    const m = await pg.evaluate(() => {
      const campo = document.activeElement?.closest(".campo");
      return {
        foco: document.activeElement?.id,
        rotuloTopo: campo?.querySelector("label")?.getBoundingClientRect().top,
        topoFixo: document.querySelector(".topo").getBoundingClientRect().bottom,
      };
    });
    ok(`Minha conta a ${largura}x700: o campo focado depois da senha errada aparece com o rótulo, abaixo do topo fixo`,
       m.foco === "conta-senha-atual" && m.rotuloTopo >= m.topoFixo - 0.5, `(${JSON.stringify(m)})`);
  }
  for (const modo of ["Espaço", "Enter"]) {
    await pg.setViewportSize({ width: 390, height: 844 });
    await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("senha-que-nao-e-a-dela");
    await pg.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
    await pg.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
    const focoFinal = await enviarPeloTeclado(
      pg, modo, pg.getByRole("button", { name: "Trocar senha", exact: true }), "#conta-senha-repetida");
    ok(`Minha conta, enviando com ${modo}: depois da senha errada o foco está no campo da senha atual, e não em BODY nem no último campo`,
       focoFinal === "conta-senha-atual", `(${focoFinal})`);
  }
  /*
    Troca certa e, logo depois, senha errada: a confirmação verde da primeira não
    pode ficar na tela junto do erro vermelho da segunda, e o foco acompanha cada
    resultado (a confirmação no sucesso, o campo no erro).
  */
  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
  await pg.locator("#conta-senha-atual").fill(SENHA_DO_TESTE);
  await pg.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
  await pg.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
  await pg.getByRole("button", { name: "Trocar senha", exact: true }).click();
  await pg.locator(".aviso--sucesso").waitFor({ timeout: 20_000 });
  await pg.waitForTimeout(300);
  ok("Minha conta: depois da troca certa o foco vai à confirmação (e não a BODY)",
     await pg.evaluate(() => document.activeElement?.classList.contains("aviso--sucesso") === true),
     `(${await pg.evaluate(() => document.activeElement?.className || document.activeElement?.tagName)})`);
  await pg.locator("#conta-senha-atual").fill("outra-senha-errada-12345");
  await pg.locator("#conta-senha-nova").fill("outra-frase-comprida-2026-b");
  await pg.locator("#conta-senha-repetida").fill("outra-frase-comprida-2026-b");
  await pg.getByRole("button", { name: "Trocar senha", exact: true }).click();
  await pg.locator("#conta-senha-atual-erro").waitFor({ timeout: 20_000 });
  await pg.waitForTimeout(300);
  ok("Minha conta: a senha errada logo depois de uma troca certa tira a confirmação verde da tela",
     (await pg.locator(".aviso--sucesso").count()) === 0, `(${await pg.locator(".aviso--sucesso").count()} confirmação(ões) na tela)`);
  ok("Minha conta: e o foco vai ao campo da senha atual",
     (await pg.evaluate(() => document.activeElement?.id)) === "conta-senha-atual");
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
    const iconeProv = await erro.locator("svg").evaluate((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
    ok(`"Defina a sua senha" a ${largura} px: o ícone do erro não é espremido (14x14)`,
       iconeProv[0] >= 13.5 && iconeProv[1] >= 13.5, `(${iconeProv.map((n) => n.toFixed(1)).join("x")})`);
    ok(`"Defina a sua senha" a ${largura} px: depois do envio o foco está no campo da provisória, e não em BODY`,
       (await pg.evaluate(() => document.activeElement?.id)) === "senha-nova-atual",
       `(${await pg.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)})`);
    ok(`"Defina a sua senha" a ${largura} px: o erro está no campo da provisória, e não na senha nova`,
       ((await pg.locator("#senha-nova-atual").getAttribute("aria-describedby")) ?? "").includes("senha-nova-atual-erro")
         && (await pg.locator("#senha-nova-erro").count()) === 0 && !/\bnao\b/.test(texto), `("${texto}")`);
  }
  for (const modo of ["Espaço", "Enter"]) {
    await pg.setViewportSize({ width: 390, height: 844 });
    await pg.locator("#senha-nova-atual").fill("provisoria-digitada-errada");
    await pg.locator("#senha-nova").fill("frase-nova-do-teste-2026");
    await pg.locator("#senha-nova-repetida").fill("frase-nova-do-teste-2026");
    const focoFinal = await enviarPeloTeclado(
      pg, modo, pg.getByRole("button", { name: "Definir senha e entrar" }), "#senha-nova-repetida");
    ok(`"Defina a sua senha", enviando com ${modo}: depois da provisória errada o foco está no campo da provisória, e não em BODY nem no último campo`,
       focoFinal === "senha-nova-atual", `(${focoFinal})`);
  }
  await ctx.close();
}


console.log("\n== 11. Email de parte comprida não esconde a coluna Ação, e a lista de órgãos não parte email nem telefone (V2-F00-E09, correção 4, revisão) ==");
{
  const adm = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
  const mat = () => `RV-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  /*
    O sufixo do email de parte comprida é de PIOR CASO, e não ao acaso (revisão
    da correção 6): com o \`Date.now().toString(36)\` a largura mudava a cada
    execução, e com letras largas a tabela rolava a 1440 px (1083 de 1062) numa
    execução e não na outra. Aqui o sufixo só tem "m" e "w", as letras mais
    largas, e é único por execução (o relógio em binário, uma letra por bit).
  */
  const sufixoLargo = Date.now().toString(2).slice(-16).replace(/0/g, "m").replace(/1/g, "w");
  const longo = `joanaplantao24horasdefesacivilmunicipal${sufixoLargo}@serraalta.exemplo.gov.br`;
  const subdominios = `ana.${sufixo}@coordenadoria.defesacivil.secretaria.serraalta.exemplo.gov.br`;
  for (const [nome, email] of [["Joana Semponto", longo], ["Ana Subdominios", subdominios]]) {
    const r = await viaApi("/usuarios", { metodo: "POST", token: await tokenDoAdm(),
      corpo: { nome, matricula: mat(), email, papel: "operador", equipeId: null, senha: SENHA_DO_TESTE } });
    ok(`${nome} foi cadastrada para a medida`, r.status === 201 || r.status === 200, `(${r.status})`);
  }
  const org = await viaApi("/orgaos", { metodo: "POST", token: await tokenDoAdm(),
    corpo: { nome: `Companhia de Saneamento ${sufixo}`, sigla: "CSR", email: `atendimento.emergencial.${sufixo}@saneamento.serraalta.exemplo.gov.br`, telefone: "(35) 3333-0000" } });
  ok("o órgão de teste foi cadastrado", org.status === 201 || org.status === 200, `(${org.status})`);

  // A coluna Pessoa a 1280 e 1440 px: a tabela não rola, e os botões de ação ficam dentro dela.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
  for (const largura of [1280, 1440]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const t = document.querySelector("table.tabela"); const env = t.parentElement;
      const caixa = env.getBoundingClientRect();
      const fora = [...t.querySelectorAll(".tabela__acoes button")].filter((b) => b.getBoundingClientRect().right > caixa.right + 0.5);
      return { rola: env.scrollWidth > env.clientWidth + 1, largura: `${env.scrollWidth}/${env.clientWidth}`, acoesFora: fora.length };
    });
    ok(`a ${largura} px, com um email de parte comprida na lista, a tabela não rola`, !m.rola, `(${m.largura})`);
    ok(`a ${largura} px, todos os botões de ação continuam dentro da tabela`, m.acoesFora === 0, `(${m.acoesFora} fora)`);
    const ana = (await quebrasDosEmails(page)).find((e) => e.email === subdominios);
    ok(`a ${largura} px, o email de subdomínios quebra só depois do @ e dos pontos`,
       Boolean(ana) && ana.noMeioDaPalavra.length === 0, `(${ana?.linhas.join(" / ")})`);
  }

  // A lista de órgãos: o email quebra só nos pontos permitidos e o telefone nunca é partido.
  await page.goto(`${BASE}/orgaos`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
  for (const largura of [1440, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(250);
    const emails = await quebrasDosEmails(page);
    const meu = emails.find((e) => e.email.includes(sufixo));
    ok(`Órgãos a ${largura} px: o email do órgão quebra só depois do @ e dos pontos`,
       Boolean(meu) && meu.noMeioDaPalavra.length === 0, `(${meu?.linhas.join(" / ")})`);
    const telefones = await page.evaluate(() => [...document.querySelectorAll("tbody td .tabela__secundario")]
      .filter((el) => /\d{4}-\d{4}/.test(el.textContent)).map((el) => {
        const no = el.firstChild; const topos = new Set();
        for (let i = 0; i < no.textContent.length; i++) {
          const r = document.createRange(); r.setStart(no, i); r.setEnd(no, i + 1);
          topos.add(Math.round(r.getBoundingClientRect().top));
        }
        return { texto: no.textContent, linhas: topos.size };
      }));
    ok(`Órgãos a ${largura} px: há telefone para medir`, telefones.length >= 1, `(${telefones.length})`);
    ok(`Órgãos a ${largura} px: nenhum telefone é partido em duas linhas`,
       telefones.every((t) => t.linhas === 1), `(${telefones.filter((t) => t.linhas > 1).map((t) => t.texto).join(", ")})`);
  }

  console.log("\n== 12. O email nas janelas do painel não quebra no meio da palavra (V2-F00-E09, correção 5) ==");
  /*
    A rodada 6 viu a linha "matrícula, email, papel" da janela "Redefinir senha"
    quebrar o email no meio ("...secretar / ia.serraalta") a 390, 360 e 320 px: a
    correção 4 consertou a tabela e deixou a janela com `overflow-wrap: anywhere`.
    Mede por caractere (Range), só os caracteres do email: toda quebra DENTRO dele
    tem de vir logo depois de "@" ou de ".". O email inteiro tem de caber na
    janela. Vale para as duas janelas que mostram a pessoa (redefinir e desativar).
  */
  async function quebrasDoEmailNaJanela(pg, email) {
    return pg.evaluate((alvo) => {
      const dica = [...document.querySelectorAll(".modal__painel .campo__dica")].find((p) => p.textContent.includes(alvo));
      if (!dica) return null;
      const nos = [];
      const w = document.createTreeWalker(dica, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) nos.push(w.currentNode);
      const todo = nos.map((n) => n.textContent).join("");
      const inicio = todo.indexOf(alvo);
      const posicoes = [];
      for (const no of nos) for (let i = 0; i < no.textContent.length; i++) posicoes.push([no, i]);
      const topos = [];
      for (let k = inicio; k < inicio + alvo.length; k++) {
        const [no, i] = posicoes[k];
        const r = document.createRange(); r.setStart(no, i); r.setEnd(no, i + 1);
        topos.push(Math.round(r.getBoundingClientRect().top));
      }
      const quebras = [];
      for (let k = 0; k < alvo.length - 1; k++) {
        if (topos[k + 1] > topos[k] + 2) quebras.push({ depoisDe: alvo[k], pedaco: alvo.slice(Math.max(0, k - 6), k + 7) });
      }
      const painel = document.querySelector(".modal__painel");
      const estilo = getComputedStyle(painel);
      const direita = painel.getBoundingClientRect().right - parseFloat(estilo.paddingRight) - parseFloat(estilo.borderRightWidth);
      const ultimo = posicoes[inicio + alvo.length - 1];
      const rUlt = document.createRange(); rUlt.setStart(ultimo[0], ultimo[1]); rUlt.setEnd(ultimo[0], ultimo[1] + 1);
      let maiorDireita = 0;
      for (let k = inicio; k < inicio + alvo.length; k++) {
        const [no, i] = posicoes[k];
        const r = document.createRange(); r.setStart(no, i); r.setEnd(no, i + 1);
        maiorDireita = Math.max(maiorDireita, r.getBoundingClientRect().right);
      }
      return {
        linhas: new Set(topos).size, quebras,
        noMeioDaPalavra: quebras.filter((q) => q.depoisDe !== "@" && q.depoisDe !== "."),
        passaDaJanela: maiorDireita > direita + 0.5,
        dica: dica.textContent,
      };
    }, email);
  }
  for (const [largura, altura] of [[320, 568], [360, 740], [390, 844], [768, 900]]) {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
    await page.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
    const linha = page.locator("tbody tr", { hasText: subdominios });
    for (const [botao, titulo] of [["Redefinir senha", "Redefinir senha"], ["Desativar", "Desativar usuário"]]) {
      await linha.getByRole("button", { name: botao, exact: true }).scrollIntoViewIfNeeded();
      await linha.getByRole("button", { name: botao, exact: true }).click();
      await page.getByRole("dialog").waitFor({ timeout: 10_000 });
      await page.waitForTimeout(200);
      const m = await quebrasDoEmailNaJanela(page, subdominios);
      ok(`a ${largura} px, a janela "${titulo}" mostra o email da pessoa`, m !== null);
      if (m) {
        ok(`a ${largura} px, na janela "${titulo}" o email quebra só depois do @ e dos pontos`,
           m.noMeioDaPalavra.length === 0, `(${m.noMeioDaPalavra.map((q) => q.pedaco).join(" | ")})`);
        ok(`a ${largura} px, na janela "${titulo}" o email cabe na área útil da janela`, !m.passaDaJanela);
        ok(`a ${largura} px, na janela "${titulo}" a janela não ganha rolagem horizontal`,
           await page.evaluate(() => { const p = document.querySelector(".modal__painel"); return p.scrollWidth <= p.clientWidth + 1; }));
      }
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
    }
  }

  /*
    A tentativa de envio do ofício ("Tentativa 1 para <email>, por ... em ...")
    só aparece depois de um envio de verdade, que este roteiro não faz. Então a
    medida usa o MESMO markup e o CSS carregado do painel, montado na página: o
    teste de fonte (`correcao-5-da-e09.test.ts`) prova que a tela tem este
    markup. Limite dito: não é a tela de Ocorrência aberta.
  */
  for (const largura of [320, 360, 390]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
    const m = await page.evaluate((alvo) => {
      const ul = document.createElement("ul");
      ul.style.cssText = "margin:0;padding:0 16px 0 20px;position:absolute;top:0;left:0;width:100%;box-sizing:border-box;background:var(--ds-surface)";
      const pedacos = alvo.match(/[^@.]+[@.]?|[@.]/g);
      const ultimo = pedacos.length - 1;
      const juntos = [...pedacos.slice(0, ultimo - 1), pedacos[ultimo - 1] + pedacos[ultimo]];
      const li = document.createElement("li");
      li.className = "oficio__linha";
      const span = document.createElement("span");
      span.append("Tentativa 1 para ");
      juntos.forEach((p, i) => { if (i > 0) span.append(document.createElement("wbr")); span.append(p); });
      span.append(", por Rita Lopes em 20/10/2026 10:00:");
      li.append(span, document.createElement("strong"));
      li.lastChild.textContent = "enviado";
      ul.append(li);
      document.body.append(ul);
      const nos = [];
      const w = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) nos.push(w.currentNode);
      const todo = nos.map((n) => n.textContent).join("");
      const inicio = todo.indexOf(alvo);
      const pos = [];
      for (const no of nos) for (let i = 0; i < no.textContent.length; i++) pos.push([no, i]);
      const topos = [];
      for (let k = inicio; k < inicio + alvo.length; k++) {
        const r = document.createRange(); r.setStart(pos[k][0], pos[k][1]); r.setEnd(pos[k][0], pos[k][1] + 1);
        topos.push(Math.round(r.getBoundingClientRect().top));
      }
      const ruins = [];
      for (let k = 0; k < alvo.length - 1; k++) {
        if (topos[k + 1] > topos[k] + 2 && alvo[k] !== "@" && alvo[k] !== ".") ruins.push(alvo.slice(Math.max(0, k - 6), k + 7));
      }
      return { ruins, rolagem: document.documentElement.scrollWidth > window.innerWidth + 1 };
    }, subdominios);
    ok(`a ${largura} px, o email da tentativa de envio do ofício quebra só depois do @ e dos pontos`,
       m.ruins.length === 0, `(${m.ruins.join(" | ")})`);
    ok(`a ${largura} px, a linha da tentativa de envio não dá rolagem horizontal à página`, !m.rolagem);
  }
}


console.log("\n== 13. O campo focado depois do erro fica inteiro entre o topo fixo e a barra do pé, e o ofício não sai do cartão (V2-F00-E09, correção 6) ==");
/*
  A rodada 7 da validação (sobre fd17ff4) viu o rótulo e o campo focados depois
  do erro por BAIXO de uma das duas bordas fixas do painel: do topo, acima de
  600 px e no zoom de 200 por cento (o topo quebra em duas linhas até uns 700
  px, e a folga era um número por faixa de largura); da barra do pé, até 900 px,
  quando o campo inválido estava abaixo da janela (não havia folga nenhuma no
  pé). A seção 10 media só "o rótulo abaixo do topo" e só até 390 px. A
  validação de acessibilidade da mesma rodada mediu também o zoom de 400 por
  cento (320x256 de CSS: topo e barra deixavam 48 px de página), todas as telas
  que usam `focar` e o Tab natural, que deixava o elemento sob a barra do pé.

  Aqui a medida é a do portão: o retângulo do RÓTULO e o do CAMPO, inteiros,
  entre a borda de baixo do topo e a borda de cima da barra do pé (ou o fim da
  janela, onde a barra não existe), e o ponto do meio de cada um sem nada por
  cima (`elementFromPoint`). O zoom de 200 por cento de uma tela de 1280x900 é
  640x450 de CSS com dois pixels de tela por pixel de CSS; o de 400 por cento
  de uma tela de 1280x1024 é 320x256.
*/
async function contextoDeFoco(largura, altura, dpr = 1, toque = false, esperaOErro500 = false) {
  const ctx = await navegador.newContext({ locale: "pt-BR", viewport: { width: largura, height: altura }, deviceScaleFactor: dpr, hasTouch: toque });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  pg.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource: the server responded with a status of 401/.test(m.text())) return;
    // O 500 que a seção 15 provoca de propósito (a janela depois de um erro do servidor); só ali.
    if (esperaOErro500 && /Failed to load resource: the server responded with a status of 500/.test(m.text())) return;
    // A mesma exceção do contexto principal: a fonte cuja carga o Firefox aborta ao trocar de página.
    if (/downloadable font: download failed .*status=2152398850 /.test(m.text())) return;
    erros.push(`console: ${m.text()}`);
  });
  return { ctx, pg };
}
/**
 * O texto de exemplo de um campo cabe inteiro? Medido pelo layout do próprio
 * motor, e não pelo canvas: um <span> com a fonte computada do campo, contra a
 * caixa de conteúdo dele, menos a reserva do "x" que o WebKit guarda no campo de
 * busca (a medida pelo canvas aprovou "Protocolo, endereço, pessoa ou relato",
 * que o WebKit mostrava cortado em "...ou relat").
 */
async function exemploCabe(pg, seletor) {
  return pg.evaluate((sel) => {
    const campo = document.querySelector(sel);
    const cs = getComputedStyle(campo);
    const regua = document.createElement("span");
    regua.textContent = campo.placeholder;
    regua.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
    document.body.append(regua);
    const texto = regua.getBoundingClientRect().width;
    regua.remove();
    const area = campo.getBoundingClientRect().width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)
      - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const reservaDoX = campo.type === "search" ? 24 : 0;
    return { cabe: texto + reservaDoX <= area + 0.5, texto, area, reservaDoX, exemplo: campo.placeholder };
  }, seletor);
}
/** Rótulo e campo focados, inteiros entre o topo fixo e a barra do pé, sem nada por cima. */
async function campoFocadoAVista(pg) {
  return pg.evaluate(() => {
    const campo = document.activeElement;
    const rotulo = campo?.id ? document.querySelector(`label[for="${campo.id}"]`) : null;
    if (!campo || !rotulo) return { ok: false, foco: campo?.id || campo?.tagName, txt: "sem rótulo" };
    const rc = campo.getBoundingClientRect(), rr = rotulo.getBoundingClientRect();
    const elTopo = document.querySelector(".topo");
    const topo = elTopo && ["sticky", "fixed"].includes(getComputedStyle(elTopo).position) ? elTopo.getBoundingClientRect().bottom : 0;
    const barra = document.querySelector(".lateral");
    const rb = barra?.getBoundingClientRect();
    const pe = barra && getComputedStyle(barra).position === "sticky" && rb.top > innerHeight / 2 ? rb.top : innerHeight;
    const coberto = (r, el) => {
      const achado = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), r.top + r.height / 2);
      return !(achado === el || el.contains(achado));
    };
    const cima = Math.min(rc.top, rr.top), baixo = Math.max(rc.bottom, rr.bottom);
    return {
      ok: cima >= topo - 0.5 && baixo <= pe + 0.5 && !coberto(rc, campo) && !coberto(rr, rotulo),
      foco: campo.id,
      txt: `rótulo ${Math.round(rr.top)}..${Math.round(rr.bottom)}, campo ${Math.round(rc.top)}..${Math.round(rc.bottom)}, topo até ${Math.round(topo)}, pé desde ${Math.round(pe)}`,
    };
  });
}
const tamanho = (l, a, d) => `${l}x${a}${d > 1 ? " (zoom de 200 por cento)" : l === 320 && a === 256 ? " (zoom de 400 por cento)" : ""}`;
{
  const adm = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
  let n = 0;
  const idDasContas = new Map();
  async function contaDeOperador() {
    n++;
    const email = `foco.${n}.${sufixo}@serraalta.exemplo.gov.br`;
    const r = await viaApi("/usuarios", { metodo: "POST", token: await tokenDoAdm(),
      corpo: { nome: `Foco à Vista ${n}`, matricula: `FV-${n}-${sufixo}`.toUpperCase().slice(0, 20), email, papel: "operador", equipeId: null, senha: SENHA_DO_TESTE } });
    if (r.status !== 201 && r.status !== 200) throw new Error(`a conta de teste ${n} não foi criada (${r.status})`);
    idDasContas.set(email, r.json.id);
    return email;
  }

  // A) Minha conta, senha atual errada (o 401 do servidor): uma conta por tamanho, para não chegar ao bloqueio por tentativas.
  for (const [l, a, d] of [[640, 450, 2], [320, 256, 1], [640, 360, 1], [740, 360, 1], [601, 700, 1], [700, 600, 1], [768, 600, 1], [900, 600, 1], [1024, 600, 1], [1280, 600, 1], [390, 700, 1], [360, 700, 1], [320, 568, 1]]) {
    const email = await contaDeOperador();
    const { ctx, pg } = await contextoDeFoco(l, a, d);
    await entrar(email, SENHA_DO_TESTE, pg);
    await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("senha-que-nao-e-a-desta-conta");
    await pg.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
    await pg.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
    const botao = pg.getByRole("button", { name: "Trocar senha", exact: true });
    await botao.click();
    await pg.locator("#conta-senha-atual-erro").waitFor({ timeout: 20_000 });
    await pg.waitForFunction((el) => !el.disabled, await botao.elementHandle(), { timeout: 20_000 });
    await pg.waitForTimeout(300);
    const m = await campoFocadoAVista(pg);
    ok(`Minha conta a ${tamanho(l, a, d)}, senha atual errada: o rótulo e o campo focados ficam inteiros entre o topo fixo e a barra do pé`,
       m.ok && m.foco === "conta-senha-atual", `(foco ${m.foco}; ${m.txt})`);
    await ctx.close();
  }

  // B) Minha conta, conferência da tela (senha nova curta) com a página no alto e Enter no último campo: o campo inválido está abaixo da janela.
  const emailDaConferencia = await contaDeOperador();
  for (const [l, a, d] of [[320, 568, 1], [390, 700, 1], [640, 450, 2], [320, 256, 1], [768, 600, 1]]) {
    const { ctx, pg } = await contextoDeFoco(l, a, d);
    await entrar(emailDaConferencia, SENHA_DO_TESTE, pg);
    await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("qualquer-coisa-aqui");
    await pg.locator("#conta-senha-nova").fill("curta");
    await pg.locator("#conta-senha-repetida").fill("curta");
    await pg.evaluate(() => window.scrollTo(0, 0));
    await pg.waitForTimeout(150);
    await pg.locator("#conta-senha-repetida").press("Enter");
    await pg.locator("#conta-senha-nova-erro").waitFor({ timeout: 10_000 });
    await pg.waitForTimeout(400);
    const m = await campoFocadoAVista(pg);
    ok(`Minha conta a ${tamanho(l, a, d)}, Enter com a página no alto: a senha nova (inválida, abaixo da janela) fica inteira com o rótulo, fora da barra do pé`,
       m.ok && m.foco === "conta-senha-nova", `(foco ${m.foco}; ${m.txt})`);
    await ctx.close();
  }

  // C) Nova ocorrência: o nome do solicitante e Enter (o "Ir" do teclado do celular); o primeiro campo que falta, Endereço, está abaixo da janela.
  const emailDaOcorrencia = await contaDeOperador();
  for (const [l, a, d] of [[320, 640, 1], [390, 844, 1], [640, 450, 2], [320, 256, 1], [640, 360, 1], [740, 360, 1], [768, 600, 1], [1280, 600, 1]]) {
    const { ctx, pg } = await contextoDeFoco(l, a, d);
    await entrar(emailDaOcorrencia, SENHA_DO_TESTE, pg);
    await pg.goto(`${BASE}/ocorrencias/nova`, { waitUntil: "networkidle" });
    await pg.locator("#nova-solicitante").fill("Joana Prado");
    await pg.locator("#nova-solicitante").press("Enter");
    await pg.locator("#nova-endereco-erro").waitFor({ timeout: 10_000 });
    await pg.waitForTimeout(400);
    const m = await campoFocadoAVista(pg);
    ok(`Nova ocorrência a ${tamanho(l, a, d)}, Enter no solicitante: o Endereço fica inteiro com o rótulo, fora do topo e da barra do pé`,
       m.ok && m.foco === "nova-endereco", `(foco ${m.foco}; ${m.txt})`);
    await ctx.close();
  }

  /*
    D) A linha "Tentativa N para <email>" na tela de Ocorrência DE VERDADE (a
    seção 12 mede o markup montado à parte). O envio real exige provedor de
    email, então a resposta do detalhe do ofício ganha uma tentativa no caminho
    (`route`): a tela, o markup e o CSS são os do painel. O email é o que a
    rodada 7 usou: parte local de 38 letras sem ponto.
  */
  const OC_DO_OFICIO = "11111111-1111-4111-8111-0000000000c4";
  let oficio = (await viaApi(`/oficios?ocorrenciaId=${OC_DO_OFICIO}`, { token: await tokenDoAdm() })).json.itens?.[0];
  if (!oficio) {
    const pendentes = await viaApi("/ocorrencias/providencias/pendentes", { token: await tokenDoAdm() });
    const daOcorrencia = pendentes.json.itens.find((p) => p.ocorrencia_id === OC_DO_OFICIO);
    const emitido = await viaApi("/oficios", { metodo: "POST", token: await tokenDoAdm(), corpo: { providenciaId: daOcorrencia?.id } });
    oficio = { id: emitido.json.id };
  }
  ok("há um ofício emitido na ocorrência da Equipe Alfa para medir", Boolean(oficio?.id));
  const emailSemPonto = "plantaocoordenacaodefesacivilserraalta@serraalta.exemplo.gov.br";
  const emailDoOficio = await contaDeOperador();
  for (const largura of [320, 360]) {
    const { ctx, pg } = await contextoDeFoco(largura, 700);
    await pg.route("**/oficios?ocorrenciaId=*", async (rota) => {
      const r = await rota.fetch(); const j = await r.json();
      for (const o of j.itens) if (o.id === oficio.id) { o.envios = 1; o.ultimo_envio = null; }
      await rota.fulfill({ response: r, json: j });
    });
    await pg.route(`**/oficios/${oficio.id}`, async (rota) => {
      if (rota.request().method() !== "GET") return rota.continue();
      const r = await rota.fetch(); const j = await r.json();
      j.envios = [{ id: "11111111-1111-4111-8111-00000000e001", tentativa: 1, destinatario_email: emailSemPonto,
        solicitado_em: new Date().toISOString(), solicitado_por_nome: "Jonas Ferreira", desfecho: "falhou",
        detalhe: null, provedor_id: null, expira_em: null }];
      await rota.fulfill({ response: r, json: j });
    });
    await entrar(emailDoOficio, SENHA_DO_TESTE, pg);
    await pg.goto(`${BASE}/ocorrencias/${OC_DO_OFICIO}`, { waitUntil: "networkidle" });
    const botao = pg.locator(".oficio button", { hasText: /tentativa/ }).first();
    const rotuloFechado = ((await botao.textContent()) ?? "").trim();
    await botao.click();
    await pg.locator("li.oficio__linha").first().waitFor({ timeout: 10_000 });
    const rotuloAberto = ((await botao.textContent()) ?? "").trim();
    await pg.locator("li.oficio__linha").first().scrollIntoViewIfNeeded();
    const m = await pg.evaluate(() => {
      const li = document.querySelector("li.oficio__linha");
      const cartao = li.closest(".cartao");
      const util = cartao.getBoundingClientRect().right - parseFloat(getComputedStyle(cartao).paddingRight);
      return {
        rola: document.documentElement.scrollWidth > innerWidth + 1, largura: document.documentElement.scrollWidth,
        texto: li.querySelector("span").getBoundingClientRect().right, util,
        frase: li.closest(".oficio").textContent.match(/(A tentativa|As \d+ tentativas)[^.]*\./)?.[0] ?? "",
      };
    });
    ok(`Ocorrência a ${largura} px, tentativa para um email de parte local longa sem ponto: a página não rola na horizontal`,
       !m.rola, `(${m.largura} de ${largura})`);
    ok(`Ocorrência a ${largura} px, a linha da tentativa fica dentro do cartão`,
       m.texto <= m.util + 0.5, `(texto até ${Math.round(m.texto)}, cartão até ${Math.round(m.util)})`);
    if (largura === 320) {
      ok('com uma tentativa só, o botão diz "Ver a tentativa" e "Esconder a tentativa" (sem "as 1")',
         rotuloFechado === "Ver a tentativa" && rotuloAberto === "Esconder a tentativa", `("${rotuloFechado}" / "${rotuloAberto}")`);
      ok('e a explicação concorda no singular ("A tentativa ficou registrada")',
         m.frase === "A tentativa ficou registrada e o provedor de email não aceitou a mensagem.", `("${m.frase}")`);
    }
    await ctx.close();
  }

  // F) As outras telas que usam `focar`: "Defina a sua senha", Usuários, Ocorrência (corrigir a coordenada) e Quero conhecer.
  const TAMANHOS_DAS_OUTRAS = [[320, 256, 1], [640, 450, 2], [390, 844, 1]];
  for (const [l, a, d] of TAMANHOS_DAS_OUTRAS) {
    // "Defina a sua senha" (tela pública, sem topo fixo): a provisória digitada errada.
    const email = await contaDeOperador();
    const provisoria = (await viaApi(`/usuarios/${idDasContas.get(email)}/redefinir-senha`, { metodo: "POST", token: await tokenDoAdm(), corpo: {} })).json.senhaTemporaria;
    const { ctx, pg } = await contextoDeFoco(l, a, d);
    await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
    await pg.locator("#entrada-email").fill(email);
    await pg.locator("#entrada-senha").fill(provisoria);
    await pg.getByRole("button", { name: "Entrar", exact: true }).click();
    await pg.getByRole("heading", { name: "Defina a sua senha" }).waitFor({ timeout: 30_000 });
    await pg.locator("#senha-nova-atual").fill("provisoria-digitada-errada");
    await pg.locator("#senha-nova").fill("frase-nova-do-teste-2026");
    await pg.locator("#senha-nova-repetida").fill("frase-nova-do-teste-2026");
    const botao = pg.getByRole("button", { name: "Definir senha e entrar" });
    await botao.click();
    await pg.locator("#senha-nova-atual-erro").waitFor({ timeout: 20_000 });
    await pg.waitForFunction((el) => !el.disabled, await botao.elementHandle(), { timeout: 20_000 });
    await pg.waitForTimeout(300);
    const m = await campoFocadoAVista(pg);
    const folgaDeCima = await pg.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop);
    ok(`"Defina a sua senha" a ${tamanho(l, a, d)}: a provisória fica inteira com o rótulo, e a tela sem topo fixo não guarda folga de topo (${folgaDeCima})`,
       m.ok && m.foco === "senha-nova-atual" && parseFloat(folgaDeCima) <= 12.5, `(foco ${m.foco}; ${m.txt})`);
    await ctx.close();
  }
  for (const [l, a, d] of TAMANHOS_DAS_OUTRAS) {
    // Usuários: o email preenchido e Enter, sem o nome; o foco volta ao Nome completo, acima.
    const { ctx, pg } = await contextoDeFoco(l, a, d);
    await entrar("rita.lopes@serraalta.exemplo.gov.br", SENHA, pg);
    await pg.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
    await pg.locator("#usuario-email").fill(`alguem.${sufixo}@serraalta.exemplo.gov.br`);
    await pg.locator("#usuario-email").press("Enter");
    await pg.locator("#usuario-nome-erro").waitFor({ timeout: 10_000 });
    await pg.waitForTimeout(400);
    const m = await campoFocadoAVista(pg);
    ok(`Usuários a ${tamanho(l, a, d)}, cadastro sem nome: o Nome completo fica inteiro com o rótulo, fora do topo e da barra do pé`,
       m.ok && m.foco === "usuario-nome", `(foco ${m.foco}; ${m.txt})`);
    // Ocorrência: "Corrigir a coordenada" abre o formulário e o foco vai ao primeiro campo dele.
    await pg.goto(`${BASE}/ocorrencias/${OC_DO_OFICIO}`, { waitUntil: "networkidle" });
    const abrir = pg.getByRole("button", { name: /^(Corrigir|Informar) a coordenada$/ }).first();
    await abrir.scrollIntoViewIfNeeded();
    await abrir.click();
    await pg.waitForTimeout(500);
    const c = await campoFocadoAVista(pg);
    ok(`Ocorrência a ${tamanho(l, a, d)}, "Corrigir a coordenada": o primeiro campo do formulário fica inteiro com o rótulo, fora do topo e da barra do pé`,
       c.ok && c.foco === "corrigir-coordenada-ponto", `(foco ${c.foco}; ${c.txt})`);
    await ctx.close();
  }
  for (const [l, a, d] of TAMANHOS_DAS_OUTRAS) {
    // Quero conhecer (tela pública): município, UF e email preenchidos, sem o nome; o foco sobe ao "Seu nome".
    const { ctx, pg } = await contextoDeFoco(l, a, d);
    await pg.goto(`${BASE}/quero-conhecer`, { waitUntil: "networkidle" });
    await pg.locator("#ic-municipio").fill("Serra Alta");
    await pg.locator("#ic-uf").fill("MG");
    await pg.locator("#ic-email").fill("contato@serraalta.exemplo.gov.br");
    await pg.getByRole("button", { name: "Quero conhecer", exact: true }).click();
    await pg.locator("#ic-nome-erro").waitFor({ timeout: 10_000 });
    await pg.waitForTimeout(400);
    const m = await campoFocadoAVista(pg);
    ok(`Quero conhecer a ${tamanho(l, a, d)}, sem o nome: o "Seu nome" fica inteiro com o rótulo, à vista`,
       m.ok && m.foco === "ic-nome", `(foco ${m.foco}; ${m.txt})`);
    await ctx.close();
  }

  /*
    G) O Tab natural, sem erro nenhum: cada parada no conteúdo fica inteira entre
    o topo e a barra do pé (achado 2 da acessibilidade). No WebKit do Mac, como no
    Safari, o Tab não para em botão nem link; lá cada elemento que o Tab
    alcançaria recebe o foco por código, na ordem do documento, que faz a mesma
    rolagem do motor.

    Correção 6b: no WebKit sem tela do Linux (CI, run 39488319365) o ajuste do
    painel, que rodava só no quadro seguinte, chegava tarde e os campos ficavam
    sob a barra do pé a 640x450 e abaixo da janela a 390x844. A rodada com o
    QUADRO LENTO (o `requestAnimationFrame` atrasado em 1 s em qualquer motor)
    reproduz essa condição no Mac e prova que o foco fica à vista sem depender
    do quadro seguinte.
  */
  /*
    A revisão da correção 6 achou ainda o Tab do Firefox na caixa que rola uma
    tabela (Painel e Órgãos a 390x400, a caixa ficava 6 px ou quase inteira sob a
    barra do pé), e pediu o Android deitado (640x360 e 740x360), onde topo e
    barra continuam fixos.
  */
  const TAMANHOS_DO_TAB = [[390, 844, 1, 0], [320, 640, 1, 0], [640, 450, 2, 0], [320, 256, 1, 0], [390, 400, 1, 0], [640, 360, 1, 0], [740, 360, 1, 0], [390, 844, 1, 1000], [640, 450, 2, 1000]];
  for (const [l, a, d, atrasoDoQuadro] of TAMANHOS_DO_TAB) {
    for (const rota of ["/ocorrencias/nova", "/minha-conta", "/orgaos", "/painel"]) {
      const { ctx, pg } = await contextoDeFoco(l, a, d);
      if (atrasoDoQuadro) {
        await ctx.addInitScript((ms) => {
          const original = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (acao) => { setTimeout(() => original(acao), ms); return 0; };
        }, atrasoDoQuadro);
      }
      await entrar("rita.lopes@serraalta.exemplo.gov.br", SENHA, pg);
      await pg.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
      await pg.waitForTimeout(300);
      const medirParada = () => pg.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el.id === "conteudo" || el.closest(".topo, .lateral, .pular-para-conteudo")) return null;
        const r = el.getBoundingClientRect();
        const topo = document.querySelector(".topo"), barra = document.querySelector(".lateral");
        const cima = ["sticky", "fixed"].includes(getComputedStyle(topo).position) ? topo.getBoundingClientRect().bottom : 0;
        const rb = barra.getBoundingClientRect();
        const baixo = getComputedStyle(barra).position === "sticky" && rb.top > innerHeight / 2 ? rb.top : innerHeight;
        const meio = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
        /*
          Inteiro na faixa livre. O que é mais alto que ela (a caixa que rola uma
          tabela larga, que o Firefox põe no Tab) não cabe: aí vale o começo dele à
          vista e sem nada por cima.
        */
        const alto = r.height > baixo - cima;
        const yDoTeste = alto ? r.top + Math.min(r.height, baixo - cima) / 4 : r.top + r.height / 2;
        const meioAlto = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), Math.min(Math.max(yDoTeste, 0), innerHeight - 1));
        const ok = alto
          ? r.top >= cima - 0.5 && r.top < baixo && (meioAlto === el || el.contains(meioAlto))
          : r.top >= cima - 0.5 && r.bottom <= baixo + 0.5 && (meio === el || el.contains(meio));
        return { ok, nome: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ` "${(el.textContent || "").trim().slice(0, 20)}"`} ${Math.round(r.top)}..${Math.round(r.bottom)} entre ${Math.round(cima)} e ${Math.round(baixo)}` };
      });
      const fora = []; let paradas = 0;
      if (MOTOR === "webkit") {
        const total = await pg.evaluate(() => {
          const els = [...document.querySelectorAll("#conteudo a[href], #conteudo button, #conteudo input, #conteudo select, #conteudo textarea")]
            .filter((e) => !e.disabled && e.getClientRects().length);
          els.forEach((e, i) => e.setAttribute("data-ordem-do-tab", String(i)));
          return els.length;
        });
        for (let i = 0; i < Math.min(total, 30); i++) {
          await pg.locator(`[data-ordem-do-tab="${i}"]`).evaluate((e) => e.focus());
          await pg.waitForTimeout(60);
          const m = await medirParada(); if (!m) continue; paradas++; if (!m.ok) fora.push(m.nome);
        }
      } else {
        for (let i = 0; i < 40; i++) {
          await pg.keyboard.press("Tab");
          await pg.waitForTimeout(60);
          const m = await medirParada(); if (!m) continue; paradas++; if (!m.ok) fora.push(m.nome);
        }
      }
      ok(`Tab em ${rota} a ${tamanho(l, a, d)}${atrasoDoQuadro ? ", com o quadro lento" : ""}: as ${paradas} paradas no conteúdo ficam inteiras entre o topo fixo e a barra do pé`,
         paradas > 0 && fora.length === 0, `(${fora.slice(0, 4).join("; ")})`);
      await ctx.close();
    }
  }

  // H) O link do topo para Minha conta tem nome também até 600 px, onde o nome e o papel saem da tela (achado 3 da acessibilidade).
  {
    const { ctx, pg } = await contextoDeFoco(390, 844);
    await entrar("rita.lopes@serraalta.exemplo.gov.br", SENHA, pg);
    await pg.setViewportSize({ width: 1280, height: 844 });
    const nomeVisivel = ((await pg.locator(".identidade__nome").textContent()) ?? "").trim();
    const esperado = `${nomeVisivel}, Administrador da organização, Minha conta`;
    for (const largura of [390, 320, 1280]) {
      await pg.setViewportSize({ width: largura, height: 844 });
      await pg.waitForTimeout(150);
      const n = await pg.getByRole("link", { name: esperado, exact: true }).count();
      ok(`a ${largura} px, o link do topo para Minha conta tem nome ("${esperado}")`, nomeVisivel.length > 0 && n === 1, `(${n} link(s) com esse nome)`);
    }
    await ctx.close();
  }

  // E) O texto de exemplo da busca do topo cabe inteiro no campo (a 320 px saía "Buscar registro ou funç").
  const { ctx, pg } = await contextoDeFoco(320, 568);
  await entrar(emailDoOficio, SENHA_DO_TESTE, pg);
  for (const largura of [320, 360]) {
    await pg.setViewportSize({ width: largura, height: 700 });
    await pg.waitForTimeout(200);
    const m = await exemploCabe(pg, "#busca-global");
    ok(`a ${largura} px, o texto de exemplo da busca do topo cabe inteiro no campo`,
       m.cabe, `(texto ${m.texto.toFixed(1)} px mais ${m.reservaDoX} do "x", área ${m.area.toFixed(1)} px)`);
  }
  await ctx.close();

  /*
    I) Nenhuma tela logada rola na horizontal a 320 px, nos dois temas (revisão
    da correção 6: Ocorrências em 325 de 320 e Prestação de contas em 330, com
    "Próxima" da paginação fora da tela). E o texto de exemplo do filtro de
    Ocorrências cabe inteiro ("...solicitante ou r" saía cortado).
  */
  // "Meu trabalho" é a tela do agente de campo: a administradora recebe 403 nela, então ela é medida com um agente, logo abaixo.
  const TELAS_LOGADAS = ["/painel", "/minha-conta", "/ocorrencias", "/ocorrencias/nova", `/ocorrencias/${OC_DO_OFICIO}`,
    "/mapa", "/quem-esta-em-campo", "/equipes", "/orgaos", "/usuarios", "/auditoria", "/organizacao"];
  const equipes = await viaApi("/equipes", { token: await tokenDoAdm() });
  const equipeId = (equipes.json.itens ?? equipes.json)[0]?.id;
  const emailDoAgente = `agente.320.${sufixo}@serraalta.exemplo.gov.br`;
  const agente = await viaApi("/usuarios", { metodo: "POST", token: await tokenDoAdm(),
    corpo: { nome: "Agente da Tela Estreita", matricula: `AG-${sufixo}`.toUpperCase(), email: emailDoAgente, papel: "agente_campo", equipeId, senha: SENHA_DO_TESTE } });
  ok("o agente de campo de teste foi cadastrado (para medir \"Meu trabalho\")", agente.status === 201 || agente.status === 200, `(${agente.status})`);
  for (const tema of ["claro", "escuro"]) {
    const { ctx: c320, pg: p320 } = await contextoDeFoco(320, 640);
    await c320.addInitScript((t) => { try { localStorage.setItem("dc360:tema", t); } catch { /* sem armazenamento */ } }, tema);
    await entrar("rita.lopes@serraalta.exemplo.gov.br", SENHA, p320);
    const rolam = [];
    for (const rota of TELAS_LOGADAS) {
      await p320.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
      await p320.waitForTimeout(300);
      const largura = await p320.evaluate(() => document.documentElement.scrollWidth);
      if (largura > 321) rolam.push(`${rota} (${largura} de 320)`);
    }
    {
      const { ctx: cAg, pg: pAg } = await contextoDeFoco(320, 640);
      await cAg.addInitScript((t) => { try { localStorage.setItem("dc360:tema", t); } catch { /* sem armazenamento */ } }, tema);
      await entrar(emailDoAgente, SENHA_DO_TESTE, pAg);
      await pAg.goto(`${BASE}/meu-trabalho`, { waitUntil: "networkidle" });
      await pAg.waitForTimeout(300);
      const doAgente = await pAg.evaluate(() => document.documentElement.scrollWidth);
      if (doAgente > 321) rolam.push(`/meu-trabalho (${doAgente} de 320)`);
      await cAg.close();
    }
    ok(`a 320 px, no tema ${tema}, nenhuma das ${TELAS_LOGADAS.length + 1} telas logadas rola na horizontal`, rolam.length === 0, `(${rolam.join("; ")})`);
    if (tema === "claro") {
      await p320.goto(`${BASE}/ocorrencias`, { waitUntil: "networkidle" });
      const f = await exemploCabe(p320, "#filtro-busca");
      ok(`a 320 px, o texto de exemplo do filtro de Ocorrências ("${f.exemplo}") cabe inteiro no campo`,
         f.cabe, `(texto ${f.texto.toFixed(1)} px mais ${f.reservaDoX} do "x", área ${f.area.toFixed(1)} px)`);
    }
    await c320.close();
  }
}

console.log("\n== 14. A confirmação das sessões e o foco da janela de confirmação ficam à vista (V2-F00-E09, correção 7) ==");
/*
  A rodada 8 da validação (sobre 60cbc2f) reprovou por duas coisas da mesma
  classe do foco fora da vista, que as seções 7 e 2 não mediam porque a 390x900
  a página nem rola e a janela cabe:

  1. No WebKit, depois de confirmar "Encerrar minhas outras sessões" por clique
     ou toque, a frase "A outra sessão foi encerrada. Esta continua aberta.",
     que recebe o foco, ficava atrás do topo fixo ou acima da janela (10..94 com
     o topo até 129 a 360x640; -136..-52 a 320x568). Pelo teclado passava.
  2. A janela de `ConfirmarAcao` abria com o foco em "Cancelar", mas, quando o
     painel rola (zoom de 300 e 400 por cento, celular deitado), o botão ficava
     150 a 190 px abaixo da borda da janela, em Chromium e Firefox: título,
     texto, nenhum botão e nenhum anel de foco (WCAG 2.4.7 e 2.4.11).

  A medida é a do portão visual: o retângulo do elemento focado, inteiro, dentro
  da faixa livre da página (entre o topo fixo e a barra do pé) no caso 1, e
  dentro da parte visível do painel da janela no caso 2, sempre com o ponto do
  meio sem nada por cima (`elementFromPoint`).
*/
{
  const adm = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
  let n = 0;
  async function contaComOutrasSessoes() {
    n++;
    const email = `sete.${n}.${sufixo}@serraalta.exemplo.gov.br`;
    const r = await viaApi("/usuarios", { metodo: "POST", token: await tokenDoAdm(),
      corpo: { nome: `Sessões Sete ${n}`, matricula: `S7-${n}-${sufixo}`.toUpperCase().slice(0, 20), email, papel: "operador", equipeId: null, senha: SENHA_DO_TESTE } });
    if (r.status !== 201 && r.status !== 200) throw new Error(`a conta de teste ${n} da seção 14 não foi criada (${r.status})`);
    // Duas sessões a mais, abertas por outro "aparelho": é o que dá o que encerrar.
    await viaApi("/auth/entrar", { metodo: "POST", corpo: { email, senha: SENHA_DO_TESTE } });
    await viaApi("/auth/entrar", { metodo: "POST", corpo: { email, senha: SENHA_DO_TESTE } });
    return email;
  }
  const botaoDeEncerrar = (pg) => pg.getByRole("button", { name: "Encerrar minhas outras sessões" });

  // A) A frase de confirmação, inteira entre o topo fixo e a barra do pé, por clique, toque e teclado.
  for (const [l, a, d] of [[360, 640, 1], [390, 664, 1], [375, 667, 1], [375, 553, 1], [320, 568, 1], [640, 450, 2], [1024, 600, 1]]) {
    for (const via of ["clique", "toque", "teclado"]) {
      const email = await contaComOutrasSessoes();
      const { ctx, pg } = await contextoDeFoco(l, a, d, via === "toque");
      await entrar(email, SENHA_DO_TESTE, pg);
      await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
      await pg.waitForTimeout(400);
      const botao = botaoDeEncerrar(pg);
      await botao.scrollIntoViewIfNeeded();
      if (via === "teclado") { await botao.focus(); await pg.keyboard.press("Enter"); }
      else if (via === "toque") await botao.tap();
      else await botao.click();
      const janela = pg.getByRole("dialog");
      await janela.waitFor({ timeout: 10_000 });
      const confirmar = janela.getByRole("button", { name: /^Encerrar (a outra sessão|as outras \d+ sessões)$/ });
      if (via === "teclado") { await confirmar.focus(); await pg.keyboard.press("Enter"); }
      else if (via === "toque") await confirmar.tap();
      else await confirmar.click();
      await pg.locator(".aviso--sucesso").waitFor({ timeout: 20_000 });
      await botao.waitFor({ state: "detached", timeout: 20_000 });
      await pg.waitForTimeout(1200);
      const m = await pg.evaluate(() => {
        const el = document.activeElement;
        if (!el || !el.classList.contains("aviso--sucesso")) return { ok: false, txt: `o foco não está na confirmação (${el?.tagName})` };
        const r = el.getBoundingClientRect();
        const elTopo = document.querySelector(".topo");
        const topo = elTopo && ["sticky", "fixed"].includes(getComputedStyle(elTopo).position) ? elTopo.getBoundingClientRect().bottom : 0;
        const barra = document.querySelector(".lateral");
        const rb = barra?.getBoundingClientRect();
        const pe = barra && getComputedStyle(barra).position === "sticky" && rb.top > innerHeight / 2 ? rb.top : innerHeight;
        const meio = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), r.top + r.height / 2);
        const livre = meio === el || el.contains(meio);
        return { ok: r.top >= topo - 0.5 && r.bottom <= pe + 0.5 && livre, txt: `a frase em ${Math.round(r.top)}..${Math.round(r.bottom)}, topo até ${Math.round(topo)}, pé desde ${Math.round(pe)}, sem nada por cima: ${livre}` };
      });
      ok(`Minha conta a ${tamanho(l, a, d)}, depois de encerrar as outras sessões por ${via}: a frase de confirmação, que tem o foco, fica inteira à vista`,
         m.ok, `(${m.txt})`);
      await ctx.close();
    }
  }

  // B) O foco inicial da janela de confirmação (o "Cancelar") fica dentro da parte visível do painel, sem rolagem horizontal.
  async function focoDaJanelaAVista(pg) {
    return pg.evaluate(() => {
      const painel = document.querySelector(".modal__painel");
      const el = document.activeElement;
      if (!painel || !el || !painel.contains(el)) return { ok: false, txt: "o foco não está dentro da janela" };
      const p = painel.getBoundingClientRect(), r = el.getBoundingClientRect();
      const topoUtil = p.top + painel.clientTop, baseUtil = topoUtil + painel.clientHeight;
      const meio = document.elementFromPoint(r.left + r.width / 2, Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
      const livre = meio === el || el.contains(meio);
      const cs = getComputedStyle(el);
      const anel = cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0);
      const inteiro = r.top >= topoUtil - 0.5 && r.bottom <= baseUtil + 0.5;
      const semRolagemLateral = !(document.documentElement.scrollWidth > innerWidth + 1) && !(painel.scrollWidth > painel.clientWidth + 1);
      // Correção 8: o título também fica à vista (preso no topo do painel quando ele rola).
      const titulo = painel.querySelector(".modal__titulo");
      const t = titulo ? titulo.getBoundingClientRect() : null;
      const tituloLivre = t ? document.elementFromPoint(t.left + Math.min(t.width / 2, 20), t.top + t.height / 2) : null;
      const tituloOk = Boolean(t && t.top >= topoUtil - 0.5 && t.bottom <= baseUtil + 0.5 && tituloLivre && (tituloLivre === titulo || titulo.contains(tituloLivre)));
      return {
        ok: inteiro && livre && anel && semRolagemLateral && tituloOk,
        txt: `${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 24)}" em ${Math.round(r.top)}..${Math.round(r.bottom)}, parte visível da janela ${Math.round(topoUtil)}..${Math.round(baseUtil)}, sem nada por cima: ${livre}, com anel: ${anel}, sem rolagem lateral: ${semRolagemLateral}, título à vista: ${tituloOk}`,
      };
    });
  }
  const TAMANHOS_DA_JANELA = [[320, 256, 1], [320, 450, 1], [390, 450, 1], [640, 300, 1], [568, 320, 1], [640, 450, 2], [1280, 720, 1]];
  for (const [l, a, d] of TAMANHOS_DA_JANELA) {
    const { ctx, pg } = await contextoDeFoco(l, a, d);
    await entrar("rita.lopes@serraalta.exemplo.gov.br", SENHA, pg);
    await pg.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
    for (const nome of ["Redefinir senha", "Encerrar sessões"]) {
      const gatilho = pg.getByRole("button", { name: nome, exact: true }).first();
      await gatilho.focus();
      await pg.keyboard.press("Enter");
      await pg.getByRole("dialog").waitFor({ timeout: 10_000 });
      await pg.waitForTimeout(500);
      const m = await focoDaJanelaAVista(pg);
      ok(`Usuários a ${tamanho(l, a, d)}, a janela "${nome}" abre com o foco em "Cancelar" à vista dentro da janela`,
         m.ok && /Cancelar/.test(m.txt), `(${m.txt})`);
      await pg.keyboard.press("Escape");
      await pg.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
    }
    await ctx.close();
  }
  for (const [l, a, d] of [[320, 256, 1], [568, 320, 1], [640, 300, 1]]) {
    const email = await contaComOutrasSessoes();
    const { ctx, pg } = await contextoDeFoco(l, a, d);
    await entrar(email, SENHA_DO_TESTE, pg);
    await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(400);
    await botaoDeEncerrar(pg).focus();
    await pg.keyboard.press("Enter");
    await pg.getByRole("dialog").waitFor({ timeout: 10_000 });
    await pg.waitForTimeout(500);
    const m = await focoDaJanelaAVista(pg);
    ok(`Minha conta a ${tamanho(l, a, d)}, a janela "Encerrar minhas outras sessões" abre com o foco em "Cancelar" à vista dentro da janela`,
       m.ok && /Cancelar/.test(m.txt), `(${m.txt})`);
    await ctx.close();
  }
}

console.log("\n== 15. A janela de confirmação aberta acompanha a mudança de tamanho e não perde o foco (V2-F00-E09, correção 8) ==");
/*
  A rodada 9 da validação (sobre dda7557) reprovou pela quarta vez, ainda pela
  classe do foco fora da vista, em dois caminhos que as seções 7 e 14 não
  exercitavam porque ambas abrem a janela já no tamanho final e nunca a
  estragam depois de aberta:

  1. Com a janela de confirmação ABERTA, girar o celular (320x568 para 568x320)
     ou dar zoom (1280x720 para 320x256) deixava "Cancelar" com o foco, mas
     fora da parte visível do painel, nos três motores: o ajuste só rodava na
     abertura e a cada mudança de conteúdo, nunca quando o tamanho mudava.
  2. Depois de um erro do servidor ou de um clique no fundo escurecido, o foco
     caía em BODY e o Esc deixava de fechar a janela (as teclas eram ouvidas
     pelo painel, que não recebe tecla com o alvo em BODY); no WebKit nem o Tab
     saía de lá.

  O zoom é o equivalente em pixels de CSS (400 por cento de 1280x1024 é 320x256),
  feito por `setViewportSize` com a janela já aberta, e a medida é a de sempre:
  o retângulo do foco, inteiro, dentro da parte visível do painel, com o ponto
  do meio livre. Duas medidas, 0,7 s e 1,7 s depois, provam que não há laço (a
  rolagem do painel não muda entre elas).
*/
{
  const adm = await viaApi("/auth/entrar", { metodo: "POST", corpo: { email: "rita.lopes@serraalta.exemplo.gov.br", senha: SENHA } });
  let n = 0;
  async function contaDeOitoComSessoes() {
    n++;
    const email = `oito.${n}.${sufixo}@serraalta.exemplo.gov.br`;
    const r = await viaApi("/usuarios", { metodo: "POST", token: await tokenDoAdm(),
      corpo: { nome: `Sessões Oito ${n}`, matricula: `S8-${n}-${sufixo}`.toUpperCase().slice(0, 20), email, papel: "operador", equipeId: null, senha: SENHA_DO_TESTE } });
    if (r.status !== 201 && r.status !== 200) throw new Error(`a conta de teste ${n} da seção 15 não foi criada (${r.status})`);
    await viaApi("/auth/entrar", { metodo: "POST", corpo: { email, senha: SENHA_DO_TESTE } });
    await viaApi("/auth/entrar", { metodo: "POST", corpo: { email, senha: SENHA_DO_TESTE } });
    return email;
  }
  const rotulo = (l, a) => `${l}x${a}`;

  /** O foco está num CONTROLE da janela (botão habilitado), inteiro na parte visível do painel, com o ponto do meio livre. */
  async function focoNaJanela(pg, { comAnel = true } = {}) {
    return pg.evaluate((comAnel) => {
      const painel = document.querySelector(".modal__painel");
      const el = document.activeElement;
      if (!painel) return { ok: false, txt: "a janela não está aberta" };
      if (!el || el === document.body || !painel.contains(el)) return { ok: false, txt: `o foco não está dentro da janela (${el ? el.tagName.toLowerCase() : "nada"})` };
      if (el === painel) return { ok: false, txt: "o foco está no painel, e não num controle" };
      const p = painel.getBoundingClientRect(), r = el.getBoundingClientRect();
      const topoUtil = p.top + painel.clientTop, baseUtil = topoUtil + painel.clientHeight;
      const meio = document.elementFromPoint(r.left + r.width / 2, Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
      const livre = meio === el || el.contains(meio);
      const cs = getComputedStyle(el);
      const anel = cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0);
      const inteiro = r.top >= topoUtil - 0.5 && r.bottom <= baseUtil + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5;
      const semRolagemLateral = !(document.documentElement.scrollWidth > innerWidth + 1) && !(painel.scrollWidth > painel.clientWidth + 1);
      // O título, que é a primeira coisa que se lê, também fica à vista e sem nada por cima (achado 4 da rodada 9).
      const titulo = painel.querySelector(".modal__titulo");
      const t = titulo ? titulo.getBoundingClientRect() : null;
      const tituloLivre = t ? document.elementFromPoint(t.left + Math.min(t.width / 2, 20), t.top + t.height / 2) : null;
      const tituloOk = Boolean(t && t.top >= topoUtil - 0.5 && t.bottom <= baseUtil + 0.5 && tituloLivre && (tituloLivre === titulo || titulo.contains(tituloLivre)));
      return {
        ok: inteiro && livre && (anel || !comAnel) && semRolagemLateral && !el.disabled,
        tituloOk,
        txt: `${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 24)}" em ${Math.round(r.top)}..${Math.round(r.bottom)}, parte visível da janela ${Math.round(topoUtil)}..${Math.round(baseUtil)} de ${innerHeight}, sem nada por cima: ${livre}, com anel: ${anel}, sem rolagem lateral: ${semRolagemLateral}; título em ${t ? `${Math.round(t.top)}..${Math.round(t.bottom)}` : "ausente"}, à vista: ${tituloOk}`,
      };
    }, comAnel);
  }
  const rolagemDoPainel = (pg) => pg.evaluate(() => document.querySelector(".modal__painel")?.scrollTop ?? null);
  const botaoDeEncerrarNaConta = (pg) => pg.getByRole("button", { name: "Encerrar minhas outras sessões" });

  // A) O tamanho muda com a janela aberta: rotação e zoom de 200 e de 400 por cento.
  const MUDANCAS = [
    ["rotação do celular", 320, 568, 568, 320],
    ["rotação de volta", 568, 320, 320, 568],
    ["rotação de um celular maior", 390, 844, 844, 390],
    ["zoom de 400 por cento", 1280, 1024, 320, 256],
    ["zoom de 200 por cento", 1280, 720, 640, 360],
    ["zoom de 400 por cento, de uma tela baixa", 1280, 720, 320, 180],
    ["zoom de 200 e depois de 400 por cento", 1280, 1024, 640, 512, 320, 256],
    ["zoom que volta ao normal", 320, 256, 1280, 720],
  ];
  {
    const { ctx, pg } = await contextoDeFoco(1280, 720);
    await entrar("rita.lopes@serraalta.exemplo.gov.br", SENHA, pg);
    await pg.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
    for (const nome of ["Redefinir senha", "Encerrar sessões"]) {
      for (const [quando, l0, a0, ...resto] of MUDANCAS) {
        await pg.setViewportSize({ width: l0, height: a0 });
        await pg.waitForTimeout(300);
        const gatilho = pg.getByRole("button", { name: nome, exact: true }).first();
        await gatilho.scrollIntoViewIfNeeded();
        await gatilho.focus();
        await pg.keyboard.press("Enter");
        await pg.getByRole("dialog").waitFor({ timeout: 10_000 });
        await pg.waitForTimeout(500);
        for (let i = 0; i < resto.length; i += 2) {
          await pg.setViewportSize({ width: resto[i], height: resto[i + 1] });
          await pg.waitForTimeout(700);
          const m = await focoNaJanela(pg);
          const r1 = await rolagemDoPainel(pg);
          await pg.waitForTimeout(1000);
          const r2 = await rolagemDoPainel(pg);
          ok(`Usuários, ${quando} com a janela "${nome}" aberta (${rotulo(l0, a0)} para ${rotulo(resto[i], resto[i + 1])}): o foco em "Cancelar" continua à vista e o título também`,
             m.ok && m.tituloOk && /Cancelar/.test(m.txt) && r1 === r2, `(${m.txt}; rolagem do painel ${r1} e depois ${r2})`);
        }
        await pg.keyboard.press("Escape");
        await pg.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
      }
    }
    await ctx.close();
  }
  for (const [quando, l0, a0, l1, a1] of [MUDANCAS[0], MUDANCAS[3], MUDANCAS[5]]) {
    const email = await contaDeOitoComSessoes();
    const { ctx, pg } = await contextoDeFoco(l0, a0);
    await entrar(email, SENHA_DO_TESTE, pg);
    await pg.goto(`${BASE}/minha-conta`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(400);
    await botaoDeEncerrarNaConta(pg).focus();
    await pg.keyboard.press("Enter");
    await pg.getByRole("dialog").waitFor({ timeout: 10_000 });
    await pg.waitForTimeout(500);
    await pg.setViewportSize({ width: l1, height: a1 });
    await pg.waitForTimeout(700);
    const m = await focoNaJanela(pg);
    ok(`Minha conta, ${quando} com a janela "Encerrar minhas outras sessões" aberta (${rotulo(l0, a0)} para ${rotulo(l1, a1)}): o foco em "Cancelar" continua à vista e o título também`,
       m.ok && m.tituloOk && /Cancelar/.test(m.txt), `(${m.txt})`);
    await ctx.close();
  }

  // B) O clique no fundo escurecido e o foco que cai em BODY: o foco volta a um controle da janela e o Esc fecha.
  for (const [l, a, via] of [[1280, 720, "clique"], [390, 844, "clique"], [320, 568, "toque"], [568, 320, "clique"]]) {
    const { ctx, pg } = await contextoDeFoco(l, a, 1, via === "toque");
    await entrar("rita.lopes@serraalta.exemplo.gov.br", SENHA, pg);
    await pg.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
    const gatilho = pg.getByRole("button", { name: "Redefinir senha", exact: true }).first();
    await gatilho.scrollIntoViewIfNeeded();
    await gatilho.focus();
    await pg.keyboard.press("Enter");
    await pg.getByRole("dialog").waitFor({ timeout: 10_000 });
    await pg.waitForTimeout(500);
    if (via === "toque") await pg.touchscreen.tap(3, 3); else await pg.mouse.click(3, 3);
    await pg.waitForTimeout(500);
    const aposFundo = await focoNaJanela(pg, { comAnel: false });
    ok(`a ${rotulo(l, a)}, depois de um ${via} no fundo escurecido da janela destrutiva: ela continua aberta e o foco está num controle dela, à vista`,
       aposFundo.ok, `(${aposFundo.txt})`);
    // O foco que escapa por outro caminho (um script de terceiro, uma extensão, o motor): volta sozinho a um controle da janela...
    await pg.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await pg.waitForTimeout(400);
    const aposPerder = await focoNaJanela(pg, { comAnel: false });
    ok(`a ${rotulo(l, a)}, com o foco arrancado da janela (blur), ele volta sozinho a um controle da janela, à vista`, aposPerder.ok, `(${aposPerder.txt})`);
    // ... e a tecla que chega ao DOCUMENTO (alvo fora do painel, como com o foco em BODY) vale: o Tab move o foco dentro da janela e o Esc fecha.
    const tabNoCorpo = await pg.evaluate(() => {
      const antes = document.activeElement;
      const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return { impedido: e.defaultPrevented, mudou: document.activeElement !== antes, dentro: Boolean(document.querySelector(".modal__painel")?.contains(document.activeElement)) };
    });
    ok(`a ${rotulo(l, a)}, o Tab que chega ao documento é tratado pela janela: o foco anda dentro dela`, tabNoCorpo.impedido && tabNoCorpo.mudou && tabNoCorpo.dentro, `(${JSON.stringify(tabNoCorpo)})`);
    await pg.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    await pg.getByRole("dialog").waitFor({ state: "detached", timeout: 5_000 }).then(
      () => ok(`a ${rotulo(l, a)}, o Esc que chega ao documento fecha a janela`, true),
      () => ok(`a ${rotulo(l, a)}, o Esc que chega ao documento fecha a janela`, false, "(a janela continua aberta)"),
    );
    await ctx.close();
  }

  // C) Erro do servidor na janela de confirmação: durante a gravação o foco fica na janela, depois do erro volta a um controle, e o Esc fecha.
  const CORS = { "access-control-allow-origin": new URL(BASE).origin, "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  for (const [l, a, via, atraso] of [[1280, 720, "teclado", 0], [1280, 720, "teclado", 1200], [390, 844, "clique", 1200], [320, 568, "teclado", 1200], [568, 320, "teclado", 1200]]) {
    for (const nome of ["Redefinir senha", "Encerrar sessões"]) {
      const { ctx, pg } = await contextoDeFoco(l, a, 1, false, true);
      await pg.route(/\/usuarios\/[^/]+\/(redefinir-senha|encerrar-sessoes)$/, async (rota) => {
        if (rota.request().method() === "OPTIONS") return rota.fulfill({ status: 204, headers: CORS });
        if (atraso) await new Promise((r) => setTimeout(r, atraso));
        return rota.fulfill({ status: 500, headers: { ...CORS, "content-type": "application/json" },
          body: JSON.stringify({ codigo: "erro_interno", mensagem: "Erro do servidor" }) });
      });
      await entrar("rita.lopes@serraalta.exemplo.gov.br", SENHA, pg);
      await pg.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
      await pg.waitForSelector(".tabela tbody tr", { timeout: 30_000 });
      const gatilho = pg.getByRole("button", { name: nome, exact: true }).first();
      await gatilho.scrollIntoViewIfNeeded();
      await gatilho.focus();
      await pg.keyboard.press("Enter");
      const janela = pg.getByRole("dialog");
      await janela.waitFor({ timeout: 10_000 });
      await pg.waitForTimeout(600);
      const confirmar = janela.locator(".modal__rodape button").first();
      if (via === "teclado") { await confirmar.focus(); await pg.keyboard.press("Enter"); } else await confirmar.click();
      if (atraso) {
        await pg.waitForTimeout(Math.min(500, atraso / 2));
        const durante = await pg.evaluate(() => {
          const painel = document.querySelector(".modal__painel"); const el = document.activeElement;
          return { dentro: Boolean(painel && el && el !== document.body && painel.contains(el)), txt: el ? el.tagName.toLowerCase() : "nada" };
        });
        ok(`a ${rotulo(l, a)}, "${nome}": enquanto grava (botões travados), o foco continua dentro da janela`, durante.dentro, `(${durante.txt})`);
        // Correção 8b: enquanto grava, o Esc e o clique no fundo não fecham a janela (o erro do servidor tem onde cair).
        await pg.keyboard.press("Escape");
        await pg.waitForTimeout(150);
        ok(`a ${rotulo(l, a)}, "${nome}": enquanto grava, o Esc não fecha a janela`, await janela.isVisible());
        await pg.mouse.click(2, 2);
        await pg.waitForTimeout(150);
        ok(`a ${rotulo(l, a)}, "${nome}": enquanto grava, o clique no fundo não fecha a janela`, await janela.isVisible());
      }
      await janela.locator('[role="alert"], .aviso--perigo').first().waitFor({ timeout: 10_000 });
      await pg.waitForTimeout(600);
      const depois = await focoNaJanela(pg, { comAnel: false });
      ok(`a ${rotulo(l, a)}, "${nome}": depois do erro do servidor (${atraso ? "com demora" : "na hora"}), o foco está num controle da janela, à vista`, depois.ok, `(${depois.txt})`);
      await pg.keyboard.press("Escape");
      await janela.waitFor({ state: "detached", timeout: 5_000 }).then(
        () => ok(`a ${rotulo(l, a)}, "${nome}": depois do erro, o Esc fecha a janela`, true),
        () => ok(`a ${rotulo(l, a)}, "${nome}": depois do erro, o Esc fecha a janela`, false, "(a janela continua aberta)"),
      );
      await ctx.close();
    }
  }
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
