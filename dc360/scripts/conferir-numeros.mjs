/**
 * Confere os números que a documentação afirma.
 *
 * O README deste produto vale exatamente o quanto ele é preciso. Ele é a peça
 * que diz o que está garantido e o que não está, e cada afirmação numérica
 * ("123 testes da API", "73 verificações no navegador") é uma promessa
 * conferível. Promessa conferível que ninguém confere apodrece: nesta mesma
 * sessão três números já tinham envelhecido sem que nada reclamasse.
 *
 * Este script não estima. Ele pergunta ao vitest quais testes existem
 * (`vitest list`, que enumera sem executar) e conta as verificações de
 * navegador pelas chamadas de `ok(` no início de linha das suítes de ponta a
 * ponta. Depois varre a documentação atrás de todo número seguido de "teste"
 * ou "verificação" e exige que cada um bata com um valor calculado, ou esteja
 * declarado como número que não é contagem de teste.
 *
 * O aplicativo de campo é a exceção, e a razão está em
 * `casos-do-aplicativo.mjs`: ele roda no jest, fora do `workspaces`, e é
 * contado lendo o código. Ficou de fora daqui por tempo demais, e o efeito era
 * que o README não podia afirmar NENHUM número conferível sobre o aplicativo:
 * a única linha que falava dele contava verificação do `expo-doctor`, que não
 * é teste de comportamento nenhum.
 *
 * Rodar:  npm run conferir:numeros
 *
 * Fica fora de `npm test` de propósito: ele chama o vitest, e chamar o vitest
 * de dentro do vitest é receita de processo pendurado.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { contarCasosDoAplicativo } from "./casos-do-aplicativo.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const PACOTES = {
  shared: "packages/shared",
  campo: "packages/campo",
  api: "apps/api",
  console: "apps/console",
  web: "apps/web",
  db: "db",
};

/*
  O vitest é chamado pelo seu próprio arquivo de entrada, com o node que já
  está rodando. Passar por `npx` faria o Windows tentar abrir `npx.cmd` sem
  shell, o que falha com EINVAL, e ligar o shell só para isso abriria a porta
  para interpretação de caminho com espaço.
*/
const VITEST = join(RAIZ, "node_modules", "vitest", "vitest.mjs");

/** Pergunta ao vitest quais testes existem, sem executar nenhum. */
function listarTestes(pacote) {
  const saida = execFileSync(
    process.execPath,
    [VITEST, "list", "--root", pacote],
    { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 },
  );
  const porArquivo = new Map();
  for (const linha of saida.split("\n")) {
    const casou = /^(\S+\.test\.ts) > /.exec(linha.trim());
    if (!casou) continue;
    const arquivo = casou[1];
    porArquivo.set(arquivo, (porArquivo.get(arquivo) ?? 0) + 1);
  }
  return porArquivo;
}

/** Conta as verificações de uma suíte de navegador: uma por chamada de `ok(`. */
function contarVerificacoes(caminho) {
  return readFileSync(join(RAIZ, caminho), "utf8")
    .split("\n")
    .filter((l) => l.startsWith("ok(")).length;
}

console.log("Lendo a lista de testes de cada pacote (sem executar)...");

const porPacote = {};
const porArquivo = {};
for (const [nome, caminho] of Object.entries(PACOTES)) {
  const lista = listarTestes(caminho);
  porPacote[nome] = [...lista.values()].reduce((a, b) => a + b, 0);
  for (const [arquivo, quantos] of lista) porArquivo[`${caminho}/${arquivo}`] = quantos;
}

const total = Object.values(porPacote).reduce((a, b) => a + b, 0);
const e2eLocal = contarVerificacoes("apps/web/test/fluxo.e2e.mjs");
const e2eApi = contarVerificacoes("apps/web/test/fluxo-api.e2e.mjs");

const casosDoApp = contarCasosDoAplicativo(join(RAIZ, "apps/campo"));
const app = [...casosDoApp.values()].reduce((a, b) => a + b, 0);

/*
  Zero aqui não é "o aplicativo não tem teste": é a varredura tendo perdido o
  caminho, e um zero calado transformaria este portão em decoração exatamente
  no pedaço que ele acabou de ganhar. Se um dia o aplicativo ficar mesmo sem
  teste, quem apagar o último apaga esta linha junto, de propósito.
*/
if (app === 0) {
  console.log(
    "\nNenhum caso de teste encontrado em apps/campo. Ou a varredura quebrou, " +
    "ou os testes do aplicativo sumiram. Confira antes de confiar no verde.",
  );
  process.exit(1);
}

/**
 * Os valores que a documentação pode afirmar, cada um com o que o mede.
 *
 * A chave é o rótulo que aparece no relatório; o valor é o número real.
 */
const VERDADE = {
  "total de testes automatizados": total,
  "testes do pacote compartilhado": porPacote.shared,
  "testes do motor de campo": porPacote.campo,
  "testes da API": porPacote.api,
  "testes do console do fornecedor": porPacote.console,
  "testes de fonte do painel": porPacote.web,
  "testes do banco": porPacote.db,
  "testes de isolamento (CA-06)": porArquivo["db/test/isolamento.test.ts"],
  "testes do aplicador de migrações": porArquivo["db/test/migrar.test.ts"],
  "testes de integração do campo contra a API": porArquivo["apps/api/test/campo-integracao.test.ts"],
  "testes da fila de sincronização": porArquivo["packages/campo/test/fila.test.ts"],
  "testes do depósito SQLite": porArquivo["packages/campo/test/deposito-sqlite.test.ts"],
  "verificações no navegador, modo local": e2eLocal,
  "verificações no navegador, contra a API": e2eApi,
  "verificações no navegador, somadas": e2eLocal + e2eApi,
  "testes do aplicativo de campo": app,
  /*
    Duas somas coexistem porque duas afirmações diferentes são verdadeiras, e
    confundi-las seria mentir: `npm test` na raiz roda os cinco workspaces e
    NÃO alcança o aplicativo (que fica fora do `workspaces` por causa do Expo).
    Quem quiser afirmar o número do produto inteiro usa a soma de baixo, e quem
    falar do comando usa a de cima.
  */
  "total de testes automatizados, somando o aplicativo": total + app,
};

/**
 * Marcador para a linha que fala de teste sem afirmar contagem deste
 * repositório.
 *
 * É um marcador na própria linha, e não uma lista de trechos isentos: a
 * primeira versão isentava por substring, e "2 testes" acabou casando dentro
 * de "242 testes", desligando em silêncio justamente a afirmação mais
 * importante do documento. Isenção que casa por pedaço de número é armadilha.
 */
const NAO_E_CONTAGEM = "<!-- numeros: nao sao contagem -->";

/* ---------- Varredura da documentação ---------- */

const PASTAS_IGNORADAS = new Set(["node_modules", "dist", ".git", "coverage"]);

function markdowns(pasta) {
  const achados = [];
  for (const nome of readdirSync(pasta)) {
    if (PASTAS_IGNORADAS.has(nome)) continue;
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...markdowns(caminho));
    else if (nome.endsWith(".md")) achados.push(caminho);
  }
  return achados;
}

/*
  Pega tanto "123 testes da API" quanto a forma elidida "43 testes de unidade
  e mais 7 de integração", em que o segundo número conta testes sem repetir a
  palavra. Sem o segundo ramo, exatamente esse número foi o que envelheceu.
*/
const AFIRMACAO = /(\d+)\s+(?:teste|verificaç|de\s+(?:integraç|unidade))/gi;

/**
 * O ASSUNTO da afirmação, e por que este bloco existe.
 *
 * O portão casava só por VALOR, contra a tabela `VERDADE` inteira: qualquer
 * número que existisse em qualquer linha da tabela passava, dissesse a frase o
 * que dissesse. Duas mentiras sobreviveram turnos assim, e as duas foram
 * encontradas a mão em 09/09/2026, não pelo portão:
 *
 * - "46 testes do banco", quando o banco tem 43. O 46 é da fila de
 *   sincronização, e por isso casava.
 * - "54 verificações no navegador", quando são 58. O 54 é o número de testes de
 *   fonte do painel.
 *
 * Nos dois casos o portão dizia "conferido". Agora, quando a própria frase diz
 * de que grandeza ela fala, o número precisa ser o daquela grandeza.
 *
 * A chave é o termo como ele aparece na prosa; o valor é a lista de contagens
 * que aquele termo autoriza. Termo que não aparece perto do número não impõe
 * nada: a checagem por valor continua valendo como piso, e o relatório separa
 * as duas para a fraqueza restante ficar visível em vez de virar verde mudo.
 */
const ASSUNTO = [
  ["banco", ["testes do banco"]],
  ["isolamento", ["testes de isolamento (CA-06)"]],
  ["CA-06", ["testes de isolamento (CA-06)"]],
  ["migraç", ["testes do aplicador de migrações"]],
  ["aplicador", ["testes do aplicador de migrações"]],
  ["navegador", [
    "verificações no navegador, modo local",
    "verificações no navegador, contra a API",
    "verificações no navegador, somadas",
  ]],
  ["fila", ["testes da fila de sincronização"]],
  ["SQLite", ["testes do depósito SQLite"]],
  ["depósito", ["testes do depósito SQLite"]],
  ["aplicativo", ["testes do aplicativo de campo", "total de testes automatizados, somando o aplicativo"]],
  ["painel", ["testes de fonte do painel"]],
  ["console", ["testes do console do fornecedor"]],
  ["compartilhado", ["testes do pacote compartilhado"]],
  ["motor de campo", ["testes do motor de campo"]],
  /*
    O termo precisa ser a frase INTEIRA, e não "integraç": os 256 da API também
    são testes de integração no sentido comum da palavra, e o termo curto
    reprovava aquela linha exigindo dela o valor do arquivo do campo.
  */
  ["de integração contra a API", ["testes de integração do campo contra a API"]],
  ["integração do campo", ["testes de integração do campo contra a API"]],
  ["API", ["testes da API", "verificações no navegador, contra a API"]],
];

/**
 * Onde termina o texto que ainda fala DAQUELE número.
 *
 * Três limites, e cada um saiu de uma reprovação falsa observada ao ligar isto
 * contra o repositório em 09/09/2026:
 *
 * 1. A próxima afirmação. Sem esse corte, em "54 testes de fonte mais 58
 *    verificações no navegador" a janela do 54 alcançava "navegador" e o
 *    portão exigia do 54 o valor do outro número.
 * 2. Dois pontos, ponto e vírgula, barra vertical, parêntese. Em "São 58
 *    verificações: entrada, isolamento entre municípios", o que vem depois dos
 *    dois pontos é a ENUMERAÇÃO do que as 58 cobrem, e "isolamento" ali não é
 *    o assunto da contagem. A barra fecha célula de tabela.
 * 3. Sessenta caracteres, como teto.
 *
 * A vírgula NÃO corta: ela aparece dentro de sintagma legítimo, e o corte pela
 * afirmação seguinte já resolve o caso que importa.
 */
const JANELA = 60;
const FIM_DE_SINTAGMA = /[:;|(]/;

/**
 * As contagens que a frase autoriza, ou `null` se ela não disser do que fala.
 *
 * União, e não interseção: "103 verificações no navegador, contra a API"
 * legitimamente casa dois termos, e os dois estão certos.
 */
function contagensAutorizadas(linha, inicio, proximaAfirmacao) {
  let fim = Math.min(inicio + JANELA, proximaAfirmacao ?? Infinity, linha.length);
  const corte = linha.slice(inicio, fim).search(FIM_DE_SINTAGMA);
  if (corte >= 0) fim = inicio + corte;

  const janela = linha.slice(inicio, fim).toLowerCase();
  const permitidas = new Set();
  let achou = false;
  for (const [termo, rotulos] of ASSUNTO) {
    if (!janela.includes(termo.toLowerCase())) continue;
    achou = true;
    for (const r of rotulos) permitidas.add(VERDADE[r]);
  }
  return achou ? permitidas : null;
}

const problemas = [];
const conferidos = [];
/** Afirmações que passaram sem dizer de que grandeza falam. */
const soPorValor = [];

for (const caminho of markdowns(RAIZ)) {
  const relativo = relative(RAIZ, caminho).split(sep).join("/");
  /*
    O marcador vale do parágrafo em que aparece até a próxima linha em branco.
    É assim porque o caso real é um bloco de prosa que RELATA números antigos
    (o registro de um número que envelheceu), e marcar linha a linha um
    parágrafo inteiro seria ruído que ninguém manteria.
  */
  let isento = false;

  readFileSync(caminho, "utf8").split("\n").forEach((linha, i) => {
    if (linha.trim() === "") isento = false;
    if (linha.includes(NAO_E_CONTAGEM)) isento = true;
    if (isento) return;

    const achados = [...linha.matchAll(AFIRMACAO)];
    achados.forEach((casou, n) => {
      const numero = Number(casou[1]);
      const local = `${relativo}:${i + 1}`;

      const autorizadas = contagensAutorizadas(linha, casou.index, achados[n + 1]?.index);
      const bate = Object.entries(VERDADE).filter(([, v]) => v === numero);

      if (autorizadas) {
        if (autorizadas.has(numero)) {
          conferidos.push(`${local}  ${numero}, conferido contra a grandeza que a frase nomeia`);
        } else {
          problemas.push(
            `${local}\n    afirma: ${linha.trim().slice(0, 110)}\n` +
            `    a frase fala de uma grandeza cujo valor real é ` +
            `${[...autorizadas].join(" ou ")}, e não ${numero}` +
            (bate.length > 0
              ? `\n    (o ${numero} existe, mas mede outra coisa: ${bate.map(([r]) => r).join(", ")})`
              : ""),
          );
        }
      } else if (bate.length > 0) {
        soPorValor.push(`${local}  ${numero} = ${bate[0][0]}`);
        conferidos.push(`${local}  ${numero} = ${bate[0][0]}`);
      } else {
        problemas.push(
          `${local}\n    afirma: ${linha.trim().slice(0, 110)}\n` +
          `    o número ${numero} não corresponde a nenhuma contagem real`,
        );
      }
    });
  });
}

console.log("\nContagens reais:");
for (const [rotulo, valor] of Object.entries(VERDADE)) {
  console.log(`  ${String(valor).padStart(4)}  ${rotulo}`);
}

console.log(`\nAfirmações conferidas: ${conferidos.length}`);
if (soPorValor.length > 0) {
  /*
    Fraqueza declarada em voz alta, em vez de verde mudo. Estas passaram só
    porque o número existe em algum lugar da tabela: a frase não diz de que
    grandeza fala, então o portão não tem como saber se ela fala da certa. Foi
    exatamente assim que "46 testes do banco" sobreviveu.
  */
  console.log(
    `  destas, ${soPorValor.length} passaram SÓ por valor, sem dizer de que grandeza falam:`,
  );
  for (const s of soPorValor) console.log(`    ${s}`);
}

if (problemas.length > 0) {
  console.log(`\nAfirmações que não batem (${problemas.length}):\n`);
  for (const p of problemas) console.log(`  ${p}\n`);
  console.log("Corrija o texto, ou registre o número em VERDADE se ele mede algo novo.");
  process.exit(1);
}

if (conferidos.length < 8) {
  console.log(
    `\nSó ${conferidos.length} afirmações encontradas. A varredura provavelmente ` +
    "não está alcançando a documentação: confira o caminho antes de confiar no verde.",
  );
  process.exit(1);
}

console.log("Todos os números da documentação batem com a realidade.");
