/**
 * Confere o pacote de distribuição do jeito que o destinatário vai usar.
 *
 * O compromisso da Fase 0 é que a demonstração abre com dois cliques, num
 * notebook de prefeitura, sem internet e sem servidor. Isso nunca tinha sido
 * verificado a partir do ZIP: o protótipo era aberto do repositório, onde os
 * arquivos que o empacotamento poderia ter esquecido continuam ali do lado.
 *
 * Este script abre o `index.html` EXTRAÍDO por `file://`, com a rede
 * bloqueada, e reprova em qualquer erro de console, em qualquer requisição de
 * rede que não seja a fonte autorizada, e em tela que não montou.
 *
 * Rodar (a partir da raiz do repositório):
 *   powershell -ExecutionPolicy Bypass -File scripts\empacotar-demo.ps1
 *   node scripts/conferir-pacote.mjs <pasta onde o zip foi extraído>
 *
 * Ele usa o Playwright que já está instalado em `dc360/node_modules`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const pasta = process.argv[2];
if (!pasta) {
  console.error("uso: node scripts/conferir-pacote.mjs <pasta extraída do zip>");
  process.exit(2);
}

const raizPacote = resolve(pasta);
const requireDaqui = createRequire(import.meta.url);
const { chromium } = requireDaqui(join(process.cwd(), "dc360", "node_modules", "playwright"));

let passou = 0, falhou = 0;
function ok(nome, cond, extra = "") {
  if (cond) { passou++; console.log(`  OK   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome} ${extra}`); }
}

console.log(`\nConferindo o pacote extraído em: ${raizPacote}\n`);

console.log("== 1. O pacote tem o que precisa, e só ==");
for (const arquivo of [
  "index.html", "LEIA-ME.txt",
  "app/app.js", "app/dados.js", "app/estilos.css",
  "design-system/tokens.css",
  "documentos/APRESENTACAO.md", "documentos/ROTEIRO_DEMO.md", "documentos/ROTEIRO_VIDEO.md",
]) {
  ok(`existe ${arquivo}`, existsSync(join(raizPacote, arquivo)));
}
// Estes dois não são usados pelo index.html e não têm por que viajar junto:
// um é documentação interna de design, o outro é a versão da fase real.
ok("não leva o DESIGN_SYSTEM.md interno",
   !existsSync(join(raizPacote, "design-system", "DESIGN_SYSTEM.md")));
ok("não leva o _tokens.scss da fase real",
   !existsSync(join(raizPacote, "design-system", "_tokens.scss")));

console.log("\n== 2. Abre por file://, sem rede ==");

const erros = [];
const rede = [];

const navegador = await chromium.launch();
const contexto = await navegador.newContext();

/*
  Bloqueia tudo o que não seja o arquivo local. A única exceção é o @import da
  fonte do Google, que o CLAUDE.md autoriza explicitamente e que precisa cair
  no fallback do sistema quando não houver internet. Bloquear em vez de
  permitir é o teste que importa: é assim que a demonstração vai rodar na sala
  de reunião de uma prefeitura.
*/
await contexto.route("**/*", (rota) => {
  const url = rota.request().url();
  if (url.startsWith("file://") || url.startsWith("data:") || url.startsWith("blob:")) {
    return rota.continue();
  }
  rede.push(url);
  return rota.abort();
});

const page = await contexto.newPage();
page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));

/*
  Bloquear a fonte faz o próprio navegador escrever "Failed to load resource"
  no console, e isso é o comportamento CORRETO sem internet: é a queda para a
  pilha de fontes do sistema. Ignorar esse aviso não abre buraco, porque
  qualquer requisição que não seja de fonte reprova em `foraDaFonte` logo
  abaixo, por URL, e não por texto de mensagem.
*/
const AVISO_DE_RECURSO_BLOQUEADO = /Failed to load resource|net::ERR_FAILED/;
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (AVISO_DE_RECURSO_BLOQUEADO.test(m.text())) return;
  erros.push(`console: ${m.text()}`);
});

const url = pathToFileURL(join(raizPacote, "index.html")).href;
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1500);

ok("a página abriu", (await page.title()).length > 0, `(${await page.title()})`);

/*
  Fora a fonte, nenhuma outra chamada de rede pode existir. Uma imagem de CDN
  ou um script remoto passaria despercebido no repositório, com internet, e
  quebraria exatamente na hora da reunião.
*/
const foraDaFonte = rede.filter((u) => !u.startsWith("https://fonts."));
ok("nenhuma chamada de rede além da fonte autorizada",
   foraDaFonte.length === 0, `(${[...new Set(foraDaFonte)].slice(0, 3).join(", ")})`);

console.log("\n== 3. A demonstração funciona ==");

await page.getByRole("button", { name: /Entrar direto/i }).click();
await page.waitForTimeout(800);

const painelVisivel = await page.locator('section.tela[data-tela="painel"]').isVisible();
ok("entrar direto leva ao painel", painelVisivel);

const linhas = await page.locator('section.tela[data-tela="painel"] tbody tr').count();
ok("a fila de ocorrências carregou", linhas > 0, `(${linhas})`);

const indicadores = await page.locator("#painel-indicadores .indicador").count();
ok("os indicadores do painel apareceram", indicadores > 0, `(${indicadores})`);

// A fonte cai no fallback sem internet, e isso é o esperado: o que não pode é
// a página ficar sem fonte nenhuma ou sem estilo.
const temEstilo = await page.evaluate(() => {
  const corpo = getComputedStyle(document.body);
  return corpo.fontFamily.length > 0 && corpo.backgroundColor !== "rgba(0, 0, 0, 0)";
});
ok("o CSS carregou (fonte cai no fallback do sistema, sem internet)", temEstilo);

console.log("\n== 4. O LEIA-ME diz a verdade sobre a tela ==");

/*
  O LEIA-ME cita botões pelo nome, entre aspas. Se alguém renomear um botão, o
  arquivo passa a mandar o servidor público procurar algo que não existe, e
  ninguém percebe até a reunião. Aqui cada rótulo citado é procurado no texto
  que a demonstração realmente renderiza, incluindo o que está escondido em
  outras telas e em outros perfis.
*/
const leiaMe = readFileSync(join(raizPacote, "LEIA-ME.txt"), "utf8");
ok("o LEIA-ME tem BOM, para o Bloco de Notas antigo não embaralhar os acentos",
   leiaMe.charCodeAt(0) === 0xfeff);

/*
  Nem toda aspa do LEIA-ME é rótulo da demonstração: algumas são do Windows ou
  nomes de pasta. Cada isenção traz a razão, e a lista é curta de propósito,
  porque o valor da checagem está em ela ser incômoda de contornar.
*/
const NAO_E_ROTULO = new Map([
  ["Abrir com", "item do menu de contexto do Windows, não da demonstração"],
  ["documentos", "nome de pasta dentro do pacote"],
  ["app", "nome de pasta dentro do pacote"],
  ["design-system", "nome de pasta dentro do pacote"],
]);

/*
  As quebras de linha viram espaço antes de procurar as aspas. Um rótulo longo
  como "Simular perda de sinal" quebra no meio da coluna de 64 caracteres, e a
  primeira versão desta checagem simplesmente não o enxergava: ela passou
  verde numa mutação que renomeou justamente esse botão.
*/
const emUmaLinha = leiaMe.replace(/\s+/g, " ");
const citados = [...emUmaLinha.matchAll(/"([^"]{3,40})"/g)]
  .map((m) => m[1])
  .filter((r) => !NAO_E_ROTULO.has(r));
ok("o LEIA-ME cita rótulos de tela", citados.length >= 3, `(${citados.length})`);

// O texto de origem, e não o renderizado: rótulo de tela ainda não visitada
// não está no DOM, e procurar só no visível daria falso negativo.
const fonteDaTela =
  readFileSync(join(raizPacote, "index.html"), "utf8") +
  readFileSync(join(raizPacote, "app", "app.js"), "utf8");

const inexistentes = citados.filter((r) => !fonteDaTela.includes(r));
ok("todo rótulo citado no LEIA-ME existe na demonstração",
   inexistentes.length === 0, `(${inexistentes.join(" | ")})`);

console.log("\n== 5. Tema escuro sem servidor ==");
const alternador = page.locator("#botao-tema");
if (await alternador.count() > 0) {
  await alternador.click();
  await page.waitForTimeout(400);
  const tema = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok("alternar tema funciona pelo arquivo local", tema === "dark", `(${tema})`);
} else {
  ok("alternador de tema encontrado", false, "(seletor não achou o botão)");
}

await navegador.close();

console.log(`\n${"=".repeat(52)}`);
console.log(`Passou: ${passou}   Falhou: ${falhou}`);
if (erros.length) {
  console.log(`\nErros de console/página (${erros.length}):`);
  for (const e of [...new Set(erros)]) console.log(`  - ${e}`);
} else {
  console.log("Zero erro de console.");
}
process.exit(falhou > 0 || erros.length > 0 ? 1 : 0);
