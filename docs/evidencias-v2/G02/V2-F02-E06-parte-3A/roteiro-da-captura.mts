/*
 * Roteiro da captura do 426 (V2-F02-E06 parte 3A e V2-F02-E08). Sobe a API em memoria, sem rede,
 * e imprime cada pedido e a resposta. Rode de `dc360/apps/api`:
 *   npx tsx ../../../docs/evidencias-v2/G02/V2-F02-E06-parte-3A/roteiro-da-captura.mts
 * A saida da primeira parte (E06) esta em `captura-do-426.txt` e a da segunda (E08), em
 * `docs/evidencias-v2/G02/V2-F02-E08/captura-do-426-do-espelho.txt`.
 */
import { armazenamentoEmMemoria } from "../../../../dc360/apps/api/src/armazenamento/memoria.js";
import { bancoEmMemoria } from "../../../../dc360/apps/api/src/banco/memoria.js";
import { carregarConfig } from "../../../../dc360/apps/api/src/config.js";
import { construirServidor } from "../../../../dc360/apps/api/src/servidor.js";

const SEGREDO = "segredo-da-captura-do-426-com-mais-de-32-bytes!!";
const base = { NODE_ENV: "test", JWT_SEGREDO: SEGREDO, LOGIN_POR_IP: "10000" };

async function mostrar(
  rotulo: string,
  app: Awaited<ReturnType<typeof construirServidor>>,
  req: { method: "GET" | "POST"; url: string; headers?: Record<string, string>; payload?: unknown },
) {
  const r = await app.inject(req as never);
  console.log(`\n### ${rotulo}`);
  console.log(`> ${req.method} ${req.url}${Object.entries(req.headers ?? {}).map(([k, v]) => `\n> ${k}: ${k === "authorization" ? "Bearer <token>" : v}`).join("")}`);
  console.log(`< HTTP ${r.statusCode}`);
  for (const h of ["link", "deprecation", "sunset", "cache-control"]) {
    if (r.headers[h]) console.log(`< ${h}: ${String(r.headers[h])}`);
  }
  console.log(`< ${r.body}`);
}

const mem = await bancoEmMemoria({ semear: true });
const armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
const comMinimo = await construirServidor({
  banco: mem.banco,
  config: carregarConfig({ ...base, VERSAO_MINIMA_CAMPO: "1.3.0", VERSAO_MINIMA_CIDADAO: "2.0.0" } as NodeJS.ProcessEnv),
  armazenamento,
});
const encerrado = await construirServidor({
  banco: mem.banco,
  config: carregarConfig({ ...base, ESPELHO_LEGADO_ATE: "2020-01-01", ESPELHO_LEGADO_ENCERRADO: "sim" } as NodeJS.ProcessEnv),
  armazenamento,
});
await comMinimo.ready();
await encerrado.ready();

console.log("# E06: VERSAO_MINIMA_CAMPO=1.3.0 VERSAO_MINIMA_CIDADAO=2.0.0");
await mostrar("campo/1.2.0 abaixo do minimo, SEM token (426 antes do 401)", comMinimo, {
  method: "GET", url: "/v1/ocorrencias", headers: { "x-app-version": "campo/1.2.0" },
});
await mostrar("campo/1.2.0 em POST /v1/sincronizacao/vistoria com corpo invalido (426 antes da validacao)", comMinimo, {
  method: "POST", url: "/v1/sincronizacao/vistoria", headers: { "x-app-version": "campo/1.2.0" }, payload: {},
});
await mostrar("cidadao/1.9.9 abaixo do minimo do cidadao", comMinimo, {
  method: "GET", url: "/v1/ocorrencias", headers: { "x-app-version": "cidadao/1.9.9" },
});
await mostrar("campo/1.4.0 acima do minimo, sem token (segue para a autenticacao: 401)", comMinimo, {
  method: "GET", url: "/v1/ocorrencias", headers: { "x-app-version": "campo/1.4.0" },
});
await mostrar("cabecalho malformado e ignorado (401, nunca 500)", comMinimo, {
  method: "GET", url: "/v1/ocorrencias", headers: { "x-app-version": "campo/abc" },
});
await mostrar("rota publica da versao minima, sem token, mesmo com versao velha", comMinimo, {
  method: "GET", url: "/v1/aplicativos/campo/versao-minima", headers: { "x-app-version": "campo/0.0.1" },
});
await mostrar("o espelho sem prefixo nao tem a recusa por versao (401 por falta de token)", comMinimo, {
  method: "GET", url: "/ocorrencias", headers: { "x-app-version": "campo/1.2.0" },
});

console.log("\n\n# E08: ESPELHO_LEGADO_ATE=2020-01-01 ESPELHO_LEGADO_ENCERRADO=sim");
await mostrar("espelho encerrado, sem token", encerrado, { method: "GET", url: "/ocorrencias?endereco=Rua%20das%20Acacias" });
await mostrar("espelho encerrado, login com corpo vazio", encerrado, { method: "POST", url: "/auth/entrar", payload: {} });
await mostrar("/v1 segue atendendo (401 por falta de token, nao 426)", encerrado, { method: "GET", url: "/v1/ocorrencias" });
await mostrar("infraestrutura sem prefixo fora da regra", encerrado, { method: "GET", url: "/saude" });

await comMinimo.close();
await encerrado.close();
await mem.banco.encerrar();
