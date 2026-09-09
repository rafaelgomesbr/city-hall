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

const problemas = [];
const conferidos = [];

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

    for (const casou of linha.matchAll(AFIRMACAO)) {
      const numero = Number(casou[1]);
      const local = `${relativo}:${i + 1}`;

      const bate = Object.entries(VERDADE).filter(([, v]) => v === numero);
      if (bate.length > 0) {
        conferidos.push(`${local}  ${numero} = ${bate[0][0]}`);
      } else {
        problemas.push(
          `${local}\n    afirma: ${linha.trim().slice(0, 110)}\n` +
          `    o número ${numero} não corresponde a nenhuma contagem real`,
        );
      }
    }
  });
}

console.log("\nContagens reais:");
for (const [rotulo, valor] of Object.entries(VERDADE)) {
  console.log(`  ${String(valor).padStart(4)}  ${rotulo}`);
}

console.log(`\nAfirmações conferidas: ${conferidos.length}`);

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
