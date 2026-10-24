/**
 * Prende o `dc360/vercel.json` ao contrato de ambientes (V2-F01-E10).
 *
 * ## O defeito que isto fecha
 *
 * `vercel.json` é um arquivo do repositório, e vale para TODO deployment do
 * projeto: o de Production e também os de Preview. Se ele carrega a URL da API
 * de PROD em `build.env.VITE_API_URL`, nenhum ambiente consegue ter a sua: um
 * painel de homologação, montado a partir do mesmo repositório, nasce falando
 * com a API de produção. A URL de cada ambiente tem de vir da variável do
 * PROJETO Vercel daquele ambiente (Settings > Environment Variables), que o
 * `vercel.json` não pode sobrepor.
 *
 * ## A exceção que existe hoje, e por quê
 *
 * Remover o bloco `build.env` sem a variável cadastrada em Production derruba
 * o painel de PROD para o modo local (`apps/web/src/dados/repositorio.ts`
 * decide o modo por `Boolean(import.meta.env["VITE_API_URL"])`): a tela abre,
 * mostra dados de exemplo e não é o produto. Quem confere se a variável existe
 * é o Rafael, no painel da Vercel; esta árvore não enxerga. Até ele confirmar,
 * o `vercel.json` mantém o literal de hoje e este teste o aceita SÓ nessa
 * forma exata (`LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO`): qualquer outro
 * valor (a URL de HML, uma URL nova de PROD) reprova.
 *
 * Para fechar a exceção, depois da confirmação: apagar `VITE_API_URL` de
 * `build.env` no `vercel.json` (e `VITE_GOOGLE_MAPS_CHAVE` junto, se o bloco
 * ficar só com ela, que a Vercel lê do painel também) e trocar a constante
 * abaixo por `null`. Dali em diante qualquer `VITE_API_URL` literal reprova. O
 * caso "sem exceção" já é exercitado aqui sobre um `vercel.json` sintético.
 * Passo a passo e ordem em `docs/VERCEL-PAINEL.md`, seção "Tirar a URL de PROD
 * do `vercel.json`".
 *
 * ## O que mais ele confere
 *
 * Os cabeçalhos de segurança do painel (HSTS, `nosniff`, `frame-ancestors`),
 * que não podem sumir numa edição do arquivo, e que o JSON é válido e continua
 * com os campos de que o build depende.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** O literal de PROD que o arquivo ainda carrega. `null` fecha a exceção. */
export const LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO = "https://defesa-civil.fly.dev";

const ARQUIVO = fileURLToPath(new URL("../vercel.json", import.meta.url));
const real = JSON.parse(readFileSync(ARQUIVO, "utf8"));

/** Toda variável `VITE_API_URL` com valor literal que o `vercel.json` declara, em qualquer bloco de env. */
export function literaisDeApi(config) {
  const achados = [];
  const blocos = [["build.env", config?.build?.env], ["env", config?.env]];
  for (const [onde, env] of blocos) {
    if (env && Object.hasOwn(env, "VITE_API_URL")) achados.push({ onde, valor: env.VITE_API_URL });
  }
  return achados;
}

/** Problemas do `vercel.json` quanto à URL da API. Lista vazia é verde. */
export function problemasDaUrlDaApi(config, excecao = LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO) {
  const problemas = [];
  for (const { onde, valor } of literaisDeApi(config)) {
    if (excecao !== null && onde === "build.env" && valor === excecao) continue;
    problemas.push(`VITE_API_URL literal em ${onde} (${JSON.stringify(valor)}): a URL de cada ambiente vem da variável do projeto Vercel, nunca do vercel.json`);
  }
  return problemas;
}

/** Valores de um cabeçalho, para a regra `source`, no formato do `vercel.json`. */
function cabecalhosDe(config, source) {
  const regra = (config.headers ?? []).find((h) => h.source === source);
  return Object.fromEntries((regra?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
}

/** Problemas dos cabeçalhos de segurança da regra que vale para todo caminho. */
export function problemasDeCabecalhos(config) {
  const problemas = [];
  const h = cabecalhosDe(config, "/(.*)");
  const hsts = /max-age=(\d+)/i.exec(h["strict-transport-security"] ?? "");
  if (!hsts) problemas.push("falta Strict-Transport-Security com max-age em /(.*)");
  else if (Number(hsts[1]) < 15552000) problemas.push(`Strict-Transport-Security max-age=${hsts[1]} é menor que 180 dias`);
  if ((h["x-content-type-options"] ?? "").toLowerCase() !== "nosniff") problemas.push("falta X-Content-Type-Options: nosniff em /(.*)");
  if (!/(^|;)\s*frame-ancestors\s+'(none|self)'/i.test(h["content-security-policy"] ?? "")) {
    problemas.push("falta Content-Security-Policy com frame-ancestors 'none' ou 'self' em /(.*)");
  }
  return problemas;
}

/* ------------------------------------------------------------------ */
/* O arquivo real                                                      */
/* ------------------------------------------------------------------ */

test("o vercel.json real não tem URL de API além da exceção declarada (VITE_API_URL literal reprova)", () => {
  assert.deepEqual(problemasDaUrlDaApi(real), []);
});

test("estado de hoje: o literal de PROD ainda está em build.env e a exceção o cobre exatamente", () => {
  // Este caso existe para que a troca seja um ato visível. Quando o Rafael
  // confirmar a variável em Production e o bloco sair, este caso passa a
  // afirmar o contrário e deve ser atualizado junto com a constante do topo.
  assert.deepEqual(literaisDeApi(real), [{ onde: "build.env", valor: LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO }]);
});

test("o vercel.json real nunca carrega a URL de uma API de homologação nem de outro ambiente", () => {
  const texto = readFileSync(ARQUIVO, "utf8");
  const urls = [...texto.matchAll(/https?:\/\/[^"\s]+/g)].map((m) => m[0]);
  for (const url of urls) {
    assert.ok(
      url === LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO || url.startsWith("https://openapi.vercel.sh/"),
      `URL inesperada no vercel.json: ${url}`,
    );
  }
});

test("o vercel.json real traz os cabeçalhos de segurança do painel", () => {
  assert.deepEqual(problemasDeCabecalhos(real), []);
});

test("o vercel.json real mantém o que o build do painel exige", () => {
  assert.equal(real.outputDirectory, "apps/web/dist");
  assert.match(real.installCommand, /npm ci/);
  assert.match(real.buildCommand, /@dc360\/web/);
  assert.ok(real.rewrites.some((r) => r.destination === "/index.html"), "rewrite do SPA para /index.html");
});

/* ------------------------------------------------------------------ */
/* Prova de que a regra morde (arquivos sintéticos)                    */
/* ------------------------------------------------------------------ */

test("morde: sem exceção, qualquer VITE_API_URL literal em build.env reprova, inclusive o de PROD de hoje", () => {
  const sintetico = { build: { env: { VITE_API_URL: LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO } } };
  assert.equal(problemasDaUrlDaApi(sintetico, null).length, 1);
  assert.deepEqual(problemasDaUrlDaApi({ build: { env: { VITE_GOOGLE_MAPS_CHAVE: "" } } }, null), []);
  assert.deepEqual(problemasDaUrlDaApi({}, null), []);
});

test("morde: com a exceção ativa, a URL de HML ou uma URL nova de PROD reprovam", () => {
  assert.equal(problemasDaUrlDaApi({ build: { env: { VITE_API_URL: "https://api-hml.exemplo.com.br" } } }).length, 1);
  assert.equal(problemasDaUrlDaApi({ build: { env: { VITE_API_URL: "https://defesa-civil.fly.dev/" } } }).length, 1, "barra a mais já é outro literal");
  assert.equal(problemasDaUrlDaApi({ build: { env: { VITE_API_URL: "" } } }).length, 1, "valor vazio também é literal declarado");
});

test("morde: VITE_API_URL em env de topo (runtime) reprova mesmo com a exceção ativa", () => {
  const problemas = problemasDaUrlDaApi({ env: { VITE_API_URL: LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO } });
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /em env/);
});

test("morde: cabeçalho de segurança removido ou enfraquecido reprova", () => {
  const completo = JSON.parse(JSON.stringify(real));
  const regra = completo.headers.find((h) => h.source === "/(.*)");
  assert.deepEqual(problemasDeCabecalhos(completo), []);

  const semHsts = JSON.parse(JSON.stringify(completo));
  semHsts.headers.find((h) => h.source === "/(.*)").headers = regra.headers.filter((h) => h.key !== "Strict-Transport-Security");
  assert.match(problemasDeCabecalhos(semHsts).join(), /Strict-Transport-Security/);

  const hstsCurto = JSON.parse(JSON.stringify(completo));
  hstsCurto.headers.find((h) => h.source === "/(.*)").headers.find((h) => h.key === "Strict-Transport-Security").value = "max-age=300";
  assert.match(problemasDeCabecalhos(hstsCurto).join(), /menor que 180 dias/);

  const semFrame = JSON.parse(JSON.stringify(completo));
  semFrame.headers.find((h) => h.source === "/(.*)").headers = regra.headers.filter((h) => h.key !== "Content-Security-Policy");
  assert.match(problemasDeCabecalhos(semFrame).join(), /frame-ancestors/);

  const semNosniff = JSON.parse(JSON.stringify(completo));
  semNosniff.headers.find((h) => h.source === "/(.*)").headers = regra.headers.filter((h) => h.key !== "X-Content-Type-Options");
  assert.match(problemasDeCabecalhos(semNosniff).join(), /nosniff/);

  assert.equal(problemasDeCabecalhos({}).length, 3, "sem regra nenhuma, as três faltas aparecem");
});
