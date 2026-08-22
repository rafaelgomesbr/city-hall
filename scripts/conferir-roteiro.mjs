/**
 * Executa o roteiro de demonstração de dez minutos, passo a passo.
 *
 * O `docs/ROTEIRO_DEMO.md` é o que vai ser seguido na frente de uma Defesa
 * Civil municipal. Ele já foi validado assim uma vez, e a validação encontrou
 * três passos irreproduzíveis: mandava despachar uma ocorrência que já nasce
 * despachada, não avisava que trocar de perfil devolve para a última tela
 * usada, e não avisava que o filtro de status impede a busca de achar a
 * ocorrência do documento. Nenhum desses erros aparece lendo o roteiro: só
 * aparece executando.
 *
 * Aquela validação não ficou no repositório, então não podia pegar o quarto
 * erro. Este arquivo é ela, versionada.
 *
 * Cada passo abaixo corresponde a um trecho do roteiro, e a referência ao
 * minuto está no nome. Se um passo falhar, o roteiro está mentindo, e é o
 * roteiro que precisa mudar, não este script.
 *
 * Rodar (a partir da raiz do repositório):
 *   node scripts/conferir-roteiro.mjs
 *   node scripts/conferir-roteiro.mjs <pasta extraída do zip>
 *   node scripts/conferir-roteiro.mjs <pasta> webkit
 *
 * Sem argumento, ele usa o protótipo do próprio repositório (`mockup/`) e o
 * Chromium, que é o motor do Chrome e do Edge. O segundo argumento troca o
 * motor: o critério de aceite do CP9 pede que o protótipo funcione igual fora
 * do Chromium, e isso só se descobre rodando em outro motor de verdade.
 */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const raiz = resolve(process.argv[2] ?? join(process.cwd(), "mockup"));
const motor = process.argv[3] ?? "chromium";
const requireDaqui = createRequire(import.meta.url);
const playwright = requireDaqui(join(process.cwd(), "dc360", "node_modules", "playwright"));
const lancador = playwright[motor];
if (!lancador) {
  console.error(`motor desconhecido: ${motor} (use chromium, firefox ou webkit)`);
  process.exit(2);
}

let passou = 0, falhou = 0;
const erros = [];

function ok(nome, cond, extra = "") {
  if (cond) { passou++; console.log(`  OK   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome} ${extra}`); }
}

const navegador = await lancador.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const page = await contexto.newPage();
page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Sem internet a fonte do Google não carrega, e o navegador reclama. É o
  // fallback previsto, não defeito do protótipo.
  if (/Failed to load resource|net::ERR_/.test(m.text())) return;
  erros.push(`console: ${m.text()}`);
});

/** Troca de perfil pelo seletor do topo, como o roteiro manda. */
async function trocarPerfil(valor) {
  await page.selectOption("#seletor-perfil", valor);
  await page.waitForTimeout(400);
}

async function irPara(tela) {
  await page.click(`#nav-telas [data-tela="${tela}"]`);
  await page.waitForTimeout(400);
}

/**
 * Barra rolagem horizontal, que é como o layout quebra de verdade num motor
 * diferente.
 *
 * O critério de aceite do CP9 fala em "o layout se mantém" nos três
 * navegadores. Comportamento igual não prova layout igual: um `flex` ou um
 * `grid` que o Chromium tolera e outro motor não pode empurrar a tela para o
 * lado sem quebrar nenhum clique. Numa sala de reunião isso é uma barra de
 * rolagem embaixo do projetor, e é o que se vê antes de qualquer outra coisa.
 */
async function semVazamentoLateral(onde) {
  const medida = await page.evaluate(() => ({
    conteudo: document.documentElement.scrollWidth,
    janela: document.documentElement.clientWidth,
  }));
  // Um pixel de folga: arredondamento de subpixel difere entre motores.
  ok(`sem rolagem lateral em ${onde}`,
     medida.conteudo <= medida.janela + 1,
     `(conteúdo ${medida.conteudo}px numa janela de ${medida.janela}px)`);
}

console.log(`\nExecutando o roteiro de dez minutos sobre: ${raiz}`);
console.log(`Motor do navegador: ${motor}\n`);

await page.goto(pathToFileURL(join(raiz, "index.html")).href, { waitUntil: "load" });
await page.waitForTimeout(1200);

console.log("== Antes de começar: entrar e cair no painel ==");
await page.click("#botao-entrada-rapida");
await page.waitForTimeout(600);
ok("entrar direto abre o painel do coordenador",
   await page.locator('section.tela[data-tela="painel"]').isVisible());
ok("o perfil inicial é o de coordenador",
   (await page.inputValue("#seletor-perfil")) === "coordenador");

console.log("\n== Minuto 1 a 2: o painel ==");
const indicadores = await page.locator("#painel-indicadores .indicador").allTextContents();
ok("os quatro indicadores existem", indicadores.length === 4, `(${indicadores.length})`);
for (const rotulo of ["Na fila", "Em campo", "Atrasadas", "Críticas ativas"]) {
  ok(`o roteiro pode apontar "${rotulo}"`,
     indicadores.some((t) => t.includes(rotulo)), `(${indicadores.join(" / ")})`);
}
ok("a fila carregou com ocorrências",
   (await page.locator("#painel-tabela-corpo tr").count()) > 0);
await semVazamentoLateral("o painel do coordenador");

await page.click("#botao-notificacoes");
await page.waitForTimeout(300);
ok("o sino de notificações abre um painel",
   await page.locator("#notificacoes-painel").isVisible());
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("\n== Minuto 2 a 3,5: abertura e duplicidade ==");
await trocarPerfil("operador");
await irPara("abertura");
ok("o operador chega na tela de abrir ocorrência",
   await page.locator("#form-abertura").isVisible());
await semVazamentoLateral("a tela de abrir ocorrência");

await page.fill("#abertura-solicitante", "Marcos Vinícius Prado");
await page.selectOption("#abertura-canal", { label: "Telefone" });
await page.fill("#abertura-endereco", "Rua das Acácias, 245");
await page.waitForTimeout(500);

const duplicidade = (await page.textContent("#abertura-duplicidade")) ?? "";
ok("o aviso de possível duplicidade aparece com esse endereço",
   duplicidade.includes("duplicidade"), `(${duplicidade.trim().slice(0, 60)})`);
ok("o aviso mostra qual foi o chamado anterior",
   /\d{6}\/\d{4}/.test(duplicidade), `(${duplicidade.trim().slice(0, 80)})`);

console.log("\n== Minuto 3 a 3,5: triagem ==");
await irPara("triagem");
ok("a tela de triagem abre", await page.locator("#triagem-selecao").isVisible());

const paraTriar = await page.locator("#triagem-selecao option").count();
ok("há ocorrência esperando triagem", paraTriar > 0, `(${paraTriar})`);

await page.selectOption("#triagem-severidade", "alta");
await page.check("#triagem-vulnerabilidade");
await page.waitForTimeout(300);
ok("marcar vulnerabilidade revela o campo de descrição",
   await page.locator("#campo-triagem-vulnerabilidade-descricao").isVisible());
await page.fill("#triagem-vulnerabilidade-descricao", "Moradora idosa no imóvel");
await page.click("#form-triagem button[type=submit]");
await page.waitForTimeout(600);
ok("a triagem conclui e confirma",
   await page.locator("#triagem-confirmacao").isVisible());

console.log("\n== Minuto 3,5 a 4,5: despacho ==");
await trocarPerfil("coordenador");
await irPara("painel");
await page.click('#painel-filtros [data-filtro-status="triagem"]');
await page.waitForTimeout(400);

const emTriagem = await page.locator("#painel-tabela-corpo tr").count();
ok("o filtro Em triagem tem ocorrência para despachar", emTriagem > 0, `(${emTriagem})`);

const linha488 = page.locator("#painel-tabela-corpo tr", { hasText: "000488/2026" });
ok("a 000488/2026 do roteiro está nesse filtro", (await linha488.count()) === 1);
await linha488.first().click();
await page.waitForTimeout(600);

ok("o bloco de despacho aparece nela",
   await page.locator("#bloco-despacho").isVisible());

const equipes = await page.locator("#despacho-equipe option").allTextContents();
ok('o roteiro pode escolher a "Equipe Alfa"',
   equipes.some((t) => t.includes("Alfa")), `(${equipes.join(" / ")})`);

await page.selectOption("#despacho-equipe", { label: equipes.find((t) => t.includes("Alfa")) });
await page.fill("#despacho-prazo", "24");
await page.click("#form-despacho button[type=submit]");
await page.waitForTimeout(700);
ok("despachar não deixa o bloco de despacho na tela",
   (await page.locator("#bloco-despacho").count()) === 0);

/*
  O roteiro justifica, em texto, por que NÃO usa a 000482 aqui: ela já nasce
  despachada. Se isso deixar de ser verdade, a justificativa vira ruído.
*/
console.log("\n== A justificativa do roteiro sobre a 000482 ==");
await irPara("painel");
await page.click('#painel-filtros [data-filtro-status="todas"]');
await page.waitForTimeout(300);
await page.locator("#painel-tabela-corpo tr", { hasText: "000482/2026" }).first().click();
await page.waitForTimeout(600);
ok("a 000482 já vem despachada, então não tem bloco de despacho",
   (await page.locator("#bloco-despacho").count()) === 0);

console.log("\n== Minuto 4,5 a 7: a vistoria sem sinal ==");
await trocarPerfil("agente-campo");
await page.waitForTimeout(500);

const faixa = await page.textContent("#campo-conectividade");
ok("a faixa do celular começa Online", (faixa ?? "").includes("Online"), `(${faixa?.trim().slice(0, 40)})`);

const botaoSinal = page.locator("#campo-conectividade-alternar");
ok('o botão diz "Simular perda de sinal"',
   (await botaoSinal.textContent())?.includes("Simular perda de sinal"));
await botaoSinal.click();
await page.waitForTimeout(500);
ok("a faixa avisa que está salvando no aparelho",
   ((await page.textContent("#campo-conectividade")) ?? "").includes("Sem sinal"));

const tarefa482 = page.locator("#campo-conteudo [data-protocolo]", { hasText: "000482" });
ok("a 000482 está na lista de tarefas do agente", (await tarefa482.count()) >= 1);
await tarefa482.first().click();
await page.waitForTimeout(500);

const caixas = page.locator("[data-check]");
const quantasCaixas = await caixas.count();
ok("o checklist da vistoria abriu", quantasCaixas > 0, `(${quantasCaixas})`);
await semVazamentoLateral("a moldura de celular na vistoria");
for (let i = 0; i < quantasCaixas; i++) await caixas.nth(i).check();
await page.waitForTimeout(300);

await page.click("#vistoria-capturar-foto");
await page.waitForTimeout(300);
ok("capturar foto adiciona à galeria",
   (await page.locator("#vistoria-fotos .foto-simulada").count()) >= 1);

await page.click("#vistoria-capturar-gps");
// A precisão melhora em etapas, e o roteiro manda mostrar isso acontecendo.
await page.waitForTimeout(3500);
const gps = (await page.textContent("#vistoria-gps-leitura")) ?? "";
ok("o GPS estabiliza e mostra a precisão",
   /\d/.test(gps) && !gps.includes("não capturada"), `(${gps.trim().slice(0, 50)})`);

// Assinatura: o roteiro manda arrastar o mouse dentro do quadro.
const quadro = await page.locator("#vistoria-assinatura").boundingBox();
await page.mouse.move(quadro.x + 30, quadro.y + 60);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(quadro.x + 30 + i * 15, quadro.y + 60 + (i % 2 ? -18 : 18));
}
await page.mouse.up();
await page.waitForTimeout(300);

await page.fill("#vistoria-nome-assinante", "Dona Marlene Aparecida");
await page.waitForTimeout(300);

const concluir = page.locator("#vistoria-concluir");
ok("o botão de concluir só habilita com a vistoria inteira feita",
   !(await concluir.isDisabled()));
await concluir.click();
await page.waitForTimeout(800);

// Concluir mostra uma confirmação, e o roteiro manda voltar para a lista: é
// lá que a fila inteira e o botão de reconectar vivem.
ok("concluir offline avisa que ficou salvo no aparelho",
   ((await page.textContent("#campo-conteudo")) ?? "").includes("salvo neste aparelho"));
await page.click("#vistoria-voltar-lista");
await page.waitForTimeout(700);

const fila = await page.locator("#campo-conectividade-fila li, #campo-conectividade-fila .fila-item").allTextContents();
ok("a fila de sincronização encheu com o que foi feito offline",
   fila.length >= 4, `(${fila.length} itens)`);
ok("tudo na fila está pendente, nada foi enviado",
   fila.every((t) => /Pendente/i.test(t)), `(${fila.join(" | ").slice(0, 120)})`);

const antesDeReconectar = fila.length;
await page.click("#campo-conectividade-alternar");
// A sincronização é item a item, e é o clímax da demonstração: dar tempo.
await page.waitForTimeout(9000);

const depois = await page.locator("#campo-conectividade-fila li, #campo-conectividade-fila .fila-item").allTextContents();
ok("reconectar esvazia ou marca tudo como enviado",
   depois.length === 0 || depois.every((t) => /Enviado/i.test(t)),
   `(${depois.join(" | ").slice(0, 120)})`);
ok("nada duplicou durante a sincronização",
   depois.length <= antesDeReconectar, `(${antesDeReconectar} antes, ${depois.length} depois)`);

console.log("\n== Minuto 7 a 8,5: o documento ==");
await trocarPerfil("coordenador");
await page.waitForTimeout(400);

/*
  O roteiro avisa, em texto, que ao trocar de perfil o sistema volta para a
  última tela daquele perfil, e que por isso é preciso clicar em "Painel".
  Este passo comprova que o aviso continua verdadeiro: se o comportamento
  mudar, o roteiro passa a mandar um clique sem motivo.
*/
const telaAoVoltar = await page.locator("section.tela[data-tela-ativa=true]").getAttribute("data-tela");
ok("trocar de perfil devolve à última tela do coordenador, como o roteiro avisa",
   telaAoVoltar === "detalhe", `(voltou em: ${telaAoVoltar})`);

await irPara("painel");

/*
  O roteiro manda clicar no chip "Todas" antes de buscar, porque o filtro
  "Em triagem" do minuto 3,5 continua ativo e a busca procura dentro dele.
  Este passo comprova que o aviso continua fazendo falta.
*/
const filtroAtivo = await page.locator("#painel-filtros [aria-pressed=true]").getAttribute("data-filtro-status");
ok("o filtro escolhido lá atrás continua ativo, como o roteiro avisa",
   filtroAtivo !== null, `(${filtroAtivo})`);

await page.click('#painel-filtros [data-filtro-status="todas"]');
await page.waitForTimeout(300);

await page.fill("#busca-global", "000479");
await page.waitForTimeout(700);
const resultados = page.locator("#busca-global-resultados button, #busca-global-resultados li");
ok("a busca encontra a 000479 depois de limpar o filtro",
   (await resultados.count()) >= 1, `(${await resultados.count()})`);
await resultados.first().click();
await page.waitForTimeout(700);

ok("o detalhe da 000479 abriu",
   ((await page.textContent("#titulo-detalhe")) ?? "").includes("000479"));

const botaoLaudo = page.locator('[data-acao="abrir-doc-vistoria"]');
ok("o relatório de vistoria está disponível nela", (await botaoLaudo.count()) >= 1);
await botaoLaudo.first().click();
await page.waitForTimeout(700);

const laudo = (await page.textContent("#doc-vistoria-conteudo")) ?? "";
for (const [oQue, presente] of [
  ["o protocolo", laudo.includes("000479")],
  ["o checklist respondido", /Checklist/i.test(laudo)],
  ["a autoria com matrícula", /Matr[ií]cula/i.test(laudo)],
  ["a marca d'água de protótipo", /PROT[OÓ]TIPO/i.test(
    await page.locator('section.tela[data-tela="documento-vistoria"]').innerHTML())],
]) {
  ok(`o laudo traz ${oQue}`, presente);
}
ok("o laudo tem botão de imprimir",
   (await page.locator('[data-acao="imprimir-documento"]').count()) >= 1);
await semVazamentoLateral("a folha do laudo");

await page.click('section.tela[data-tela="documento-vistoria"] [data-acao="voltar-detalhe"]');
await page.waitForTimeout(500);
const botaoTermo = page.locator('[data-acao="abrir-doc-interdicao"]');
ok("o termo de interdição também está disponível", (await botaoTermo.count()) >= 1);
await botaoTermo.first().click();
await page.waitForTimeout(700);
const termo = (await page.textContent("#doc-interdicao-conteudo")) ?? "";
ok("o termo traz o mesmo protocolo", termo.includes("000479"));
ok("o termo cita a norma sem inventar artigo",
   termo.includes("12.608/2012") && !/\bart(?:\.|igo)\s*\d/i.test(termo));

console.log("\n== Minuto 8,5 a 9,5: providência e linha do tempo ==");
await page.click('section.tela[data-tela="documento-interdicao"] [data-acao="voltar-detalhe"]');
await page.waitForTimeout(600);

ok("o bloco de encaminhar providência está na ocorrência",
   await page.locator("#bloco-providencia").isVisible());
const secretarias = await page.locator("#providencia-secretaria option").allTextContents();
ok('o roteiro pode escolher a "Secretaria de Obras"',
   secretarias.some((t) => t.includes("Obras")), `(${secretarias.join(" / ")})`);

await page.selectOption("#providencia-secretaria",
  { label: secretarias.find((t) => t.includes("Obras")) });
await page.fill("#providencia-descricao", "Conter o talude e recompor a drenagem da via");
await page.fill("#providencia-responsavel", "Engenheiro Paulo Ricardo Tavares");
await page.fill("#providencia-prazo", "72");
await page.click("#form-providencia button[type=submit]");
await page.waitForTimeout(800);

const detalhe = (await page.textContent("#detalhe-conteudo")) ?? "";
ok("a providência aparece registrada na ocorrência",
   detalhe.includes("Obras"), `(não achou a secretaria no detalhe)`);

const eventos = await page.locator(".linha-tempo__evento").allTextContents();
ok("a linha do tempo tem eventos", eventos.length > 0, `(${eventos.length})`);
ok("cada evento diz quem fez",
   eventos.every((t) => t.trim().length > 20),
   `(${eventos.map((t) => t.trim().slice(0, 30)).join(" | ").slice(0, 140)})`);
/*
  A dupla marca de tempo é da 000482, a que foi vistoriada sem sinal na frente
  de quem assiste, e não da 000479, cuja vistoria já vem pronta na carga
  inicial. O roteiro dizia para apontá-la na 000479, onde ela não existe: era
  o quarto passo irreproduzível, e foi corrigido junto com este script.
*/
await irPara("painel");
await page.fill("#busca-global", "000482");
await page.waitForTimeout(700);
await page.locator("#busca-global-resultados button, #busca-global-resultados li").first().click();
await page.waitForTimeout(700);
ok("a 000482 abre pela busca", ((await page.textContent("#titulo-detalhe")) ?? "").includes("000482"));

const eventos482 = await page.locator(".linha-tempo__evento").allTextContents();
ok("o evento de vistoria da 000482 mostra as duas marcas de tempo",
   eventos482.some((t) => /coletada offline/i.test(t) && /sincronizada/i.test(t)),
   `(${eventos482.map((t) => t.trim().slice(0, 40)).join(" | ").slice(0, 160)})`);

console.log("\n== Se algo der errado: reiniciar a demonstração ==");
await page.click("#botao-reiniciar-rapido");
await page.waitForTimeout(900);
ok("reiniciar devolve ao estado inicial sem recarregar a página",
   (await page.locator("#painel-tabela-corpo tr").count()) > 0);

await navegador.close();

console.log(`\n${"=".repeat(56)}`);
console.log(`Passou: ${passou}   Falhou: ${falhou}`);
if (erros.length) {
  console.log(`\nErros de console/página (${erros.length}):`);
  for (const e of [...new Set(erros)]) console.log(`  - ${e}`);
} else {
  console.log("Zero erro de console.");
}
process.exit(falhou > 0 || erros.length > 0 ? 1 : 0);
