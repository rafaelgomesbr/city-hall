/**
 * Testes do `conferir-dominio.mjs` (V2-F01-E10).
 *
 * A rede é substituída por um dublê (`rede`), e os julgamentos puros são
 * exercitados um a um. Um servidor HTTP local prova a parte que o dublê não
 * pode provar: que `pedir` realmente manda o cabeçalho `Origin` num `OPTIONS`
 * (o `fetch` do navegador proíbe isso, o do Node não, e o roteiro depende
 * disso), que não segue redirecionamento e que devolve o cabeçalho de CORS tal
 * como veio. A conferência contra a rede de verdade está arquivada em
 * `docs/evidencias-v2/G01/V2-F01-E10/saidas/`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  ORIGEM_INVENTADA,
  avaliarCabecalhosDoPainel,
  avaliarCertificado,
  avaliarHsts,
  avaliarPreflightAceito,
  avaliarPreflightNegado,
  avaliarRedirecionamento,
  conferirAmbiente,
  formatar,
  lerArgumentos,
  normalizarHost,
  normalizarOrigem,
  pedir,
} from "./conferir-dominio.mjs";

const executar = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("./conferir-dominio.mjs", import.meta.url));

const AGORA = new Date("2026-10-24T12:00:00Z");
const PAINEL = "painel-hml.exemplo.com.br";
const API = "api-hml.exemplo.com.br";
const ORIGEM_PAINEL = `https://${PAINEL}`;
const ORIGEM_DE_PROD = "https://painel.exemplo.com.br";

const cabecalhos = (obj) => (nome) => obj[nome.toLowerCase()] ?? null;

/** Uma "rede" que se comporta como um ambiente BEM configurado; cada caso estraga uma coisa. */
function redeBoa(mudar = {}) {
  const padrao = {
    certificado: { autorizado: true, erro: "", validoAte: "2027-01-01T00:00:00Z" },
    http: { status: 308, location: null, headers: cabecalhos({}) },
    painelHttps: {
      status: 200,
      headers: cabecalhos({
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "content-security-policy": "frame-ancestors 'none'",
      }),
    },
    apiHttps: { status: 200, headers: cabecalhos({ "strict-transport-security": "max-age=15552000; includeSubDomains" }) },
    /** origem -> resposta do preflight */
    preflight: (origem) =>
      origem === ORIGEM_PAINEL
        ? { status: 204, headers: cabecalhos({ "access-control-allow-origin": origem, "access-control-allow-credentials": "true" }) }
        : { status: 204, headers: cabecalhos({}) },
    ...mudar,
  };
  return {
    lerCertificado: async () => padrao.certificado,
    pedir: async (url, opcoes = {}) => {
      const u = new URL(url);
      if (u.protocol === "http:") return { ...padrao.http, location: padrao.http.location ?? `https://${u.hostname}/` };
      if (opcoes.method === "OPTIONS") return padrao.preflight(opcoes.headers.origin);
      return u.hostname === PAINEL ? padrao.painelHttps : padrao.apiHttps;
    },
  };
}

const alvo = { painel: PAINEL, api: API, negar: [ORIGEM_DE_PROD] };
const falhas = (resultados) => resultados.filter((r) => !r.ok);

/* ------------------------------------------------------------------ */
/* Argumentos                                                          */
/* ------------------------------------------------------------------ */

test("normalizarHost aceita host puro e https://host, em minúsculas", () => {
  assert.equal(normalizarHost("Painel.Exemplo.com.br"), "painel.exemplo.com.br");
  assert.equal(normalizarHost("https://painel.exemplo.com.br/"), "painel.exemplo.com.br");
});

test("normalizarHost recusa http, curinga, porta, caminho, usuário, vazio e nome sem ponto", () => {
  const ruins = ["http://a.exemplo.com.br", "*.exemplo.com.br", "a.exemplo.com.br:8443", "a.exemplo.com.br/x", "u@a.exemplo.com.br", "", "  ", "localhost", "a b.com"];
  for (const ruim of ruins) {
    assert.throws(() => normalizarHost(ruim), Error, ruim);
  }
});

test("normalizarOrigem exige esquema://host e recusa caminho e curinga", () => {
  assert.equal(normalizarOrigem("https://Painel.Exemplo.com.br/"), "https://painel.exemplo.com.br");
  assert.throws(() => normalizarOrigem("https://a.com/caminho"));
  assert.throws(() => normalizarOrigem("*"));
  assert.throws(() => normalizarOrigem("a.com"));
});

test("lerArgumentos exige painel e api, aceita vários --negar e recusa o resto", () => {
  const ok = lerArgumentos([`--painel=${PAINEL}`, `--api=${API}`, `--negar=${ORIGEM_DE_PROD}`, "--negar=https://outro.exemplo.com.br"]);
  assert.deepEqual(ok, { painel: PAINEL, api: API, negar: [ORIGEM_DE_PROD, "https://outro.exemplo.com.br"] });
  assert.throws(() => lerArgumentos([`--painel=${PAINEL}`]), /falta --api/);
  assert.throws(() => lerArgumentos([`--api=${API}`]), /falta --painel/);
  assert.throws(() => lerArgumentos([`--painel=${PAINEL}`, `--painel=${PAINEL}`, `--api=${API}`]), /repetido/);
  assert.throws(() => lerArgumentos([`--painel=${PAINEL}`, `--api=${API}`, "--foo=1"]), /desconhecido/);
});

/* ------------------------------------------------------------------ */
/* Julgamentos puros                                                   */
/* ------------------------------------------------------------------ */

test("certificado: válido passa; vencido, quase vencendo, não confiável e ilegível reprovam", () => {
  assert.equal(avaliarCertificado({ autorizado: true, validoAte: "2027-01-01T00:00:00Z" }, AGORA).ok, true);
  assert.match(avaliarCertificado({ autorizado: true, validoAte: "2026-10-30T00:00:00Z" }, AGORA).detalhe, /vence em 5 dia/);
  assert.match(avaliarCertificado({ autorizado: true, validoAte: "2026-10-01T00:00:00Z" }, AGORA).detalhe, /vencido/);
  assert.match(avaliarCertificado({ autorizado: false, erro: "DEPTH_ZERO_SELF_SIGNED_CERT" }, AGORA).detalhe, /DEPTH_ZERO_SELF_SIGNED_CERT/);
  assert.equal(avaliarCertificado({ autorizado: true, validoAte: "lixo" }, AGORA).ok, false);
});

test("redirecionamento: 301, 302, 307 e 308 para https do mesmo host passam; o resto reprova", () => {
  for (const status of [301, 302, 307, 308]) {
    assert.equal(avaliarRedirecionamento({ status, location: `https://${PAINEL}/` }, PAINEL).ok, true, String(status));
  }
  assert.equal(avaliarRedirecionamento({ status: 200, location: null }, PAINEL).ok, false, "responder 200 em http");
  assert.equal(avaliarRedirecionamento({ status: 308, location: `http://${PAINEL}/` }, PAINEL).ok, false, "redireciona para http");
  assert.equal(avaliarRedirecionamento({ status: 308, location: "https://outro.exemplo.com.br/" }, PAINEL).ok, false, "redireciona para outro host");
  assert.equal(avaliarRedirecionamento({ status: 308, location: null }, PAINEL).ok, false, "sem Location");
});

test("HSTS: 180 dias ou mais passa; ausente, sem max-age e curto reprovam", () => {
  assert.equal(avaliarHsts("max-age=15552000").ok, true);
  assert.equal(avaliarHsts("max-age=63072000; includeSubDomains; preload").ok, true);
  assert.equal(avaliarHsts(null).ok, false);
  assert.equal(avaliarHsts("includeSubDomains").ok, false);
  assert.match(avaliarHsts("max-age=300").detalhe, /180 dias/);
});

test("cabeçalhos do painel: nosniff e frame-ancestors (CSP ou X-Frame-Options) passam; faltando um, reprova", () => {
  assert.equal(avaliarCabecalhosDoPainel(cabecalhos({ "x-content-type-options": "nosniff", "content-security-policy": "frame-ancestors 'none'" })).ok, true);
  assert.equal(avaliarCabecalhosDoPainel(cabecalhos({ "x-content-type-options": "nosniff", "x-frame-options": "DENY" })).ok, true);
  assert.match(avaliarCabecalhosDoPainel(cabecalhos({ "content-security-policy": "frame-ancestors 'none'" })).detalhe, /nosniff/);
  assert.match(avaliarCabecalhosDoPainel(cabecalhos({ "x-content-type-options": "nosniff" })).detalhe, /frame-ancestors/);
  assert.equal(avaliarCabecalhosDoPainel(cabecalhos({ "x-content-type-options": "nosniff", "content-security-policy": "frame-ancestors *" })).ok, false);
});

test("preflight aceito: só a origem exata, com credenciais; curinga, outra origem, sem credencial e status de erro reprovam", () => {
  const r = (status, extra) => ({ status, headers: cabecalhos(extra) });
  const bom = { "access-control-allow-origin": ORIGEM_PAINEL, "access-control-allow-credentials": "true" };
  assert.equal(avaliarPreflightAceito(r(204, bom), ORIGEM_PAINEL).ok, true);
  assert.match(avaliarPreflightAceito(r(204, { ...bom, "access-control-allow-origin": "*" }), ORIGEM_PAINEL).detalhe, /curinga/);
  assert.match(avaliarPreflightAceito(r(204, { ...bom, "access-control-allow-origin": ORIGEM_DE_PROD }), ORIGEM_PAINEL).detalhe, /esperado/);
  assert.match(avaliarPreflightAceito(r(204, { "access-control-allow-origin": ORIGEM_PAINEL }), ORIGEM_PAINEL).detalhe, /credentials/);
  assert.equal(avaliarPreflightAceito(r(204, {}), ORIGEM_PAINEL).ok, false, "ausente");
  assert.equal(avaliarPreflightAceito(r(500, bom), ORIGEM_PAINEL).ok, false, "status de erro");
});

test("preflight negado: qualquer access-control-allow-origin reprova, inclusive curinga e eco da origem", () => {
  const r = (extra) => ({ status: 204, headers: cabecalhos(extra) });
  assert.equal(avaliarPreflightNegado(r({}), ORIGEM_DE_PROD).ok, true);
  assert.equal(avaliarPreflightNegado(r({ "access-control-allow-origin": "*" }), ORIGEM_DE_PROD).ok, false);
  assert.equal(avaliarPreflightNegado(r({ "access-control-allow-origin": ORIGEM_DE_PROD }), ORIGEM_DE_PROD).ok, false);
  assert.equal(avaliarPreflightNegado(r({ "access-control-allow-origin": "" }), ORIGEM_DE_PROD).ok, false, "cabeçalho vazio ainda é cabeçalho");
});

/* ------------------------------------------------------------------ */
/* Orquestração com a rede substituída                                 */
/* ------------------------------------------------------------------ */

test("ambiente bem configurado: tudo passa e a origem de PROD e a inventada são negadas", async () => {
  const resultados = await conferirAmbiente(alvo, redeBoa(), { agora: AGORA });
  assert.deepEqual(falhas(resultados), []);
  const nomes = resultados.map((r) => r.nome);
  assert.ok(nomes.includes(`api: CORS nega ${ORIGEM_DE_PROD}`));
  assert.ok(nomes.includes(`api: CORS nega ${ORIGEM_INVENTADA}`));
  assert.match(formatar(resultados), /Todas as \d+ conferências passaram/);
});

test("CORS que ecoa qualquer origem (o defeito que liga PROD a HML) reprova a negação cruzada", async () => {
  const rede = redeBoa({
    preflight: (origem) => ({ status: 204, headers: cabecalhos({ "access-control-allow-origin": origem, "access-control-allow-credentials": "true" }) }),
  });
  const ruins = falhas(await conferirAmbiente(alvo, rede, { agora: AGORA }));
  assert.deepEqual(ruins.map((r) => r.nome).sort(), [`api: CORS nega ${ORIGEM_DE_PROD}`, `api: CORS nega ${ORIGEM_INVENTADA}`].sort());
});

test("CORS com curinga reprova a aceitação exata e as duas negações", async () => {
  const rede = redeBoa({ preflight: () => ({ status: 204, headers: cabecalhos({ "access-control-allow-origin": "*" }) }) });
  const ruins = falhas(await conferirAmbiente(alvo, rede, { agora: AGORA }));
  assert.equal(ruins.length, 3);
});

test("CORS fechado demais (nega o próprio painel) reprova só a aceitação", async () => {
  const rede = redeBoa({ preflight: () => ({ status: 204, headers: cabecalhos({}) }) });
  const ruins = falhas(await conferirAmbiente(alvo, rede, { agora: AGORA }));
  assert.deepEqual(ruins.map((r) => r.nome), [`api: CORS aceita só a origem do ambiente (${ORIGEM_PAINEL})`]);
});

test("certificado vencido, http sem redirecionamento e HSTS ausente reprovam nomeando o host", async () => {
  const rede = redeBoa({
    certificado: { autorizado: true, erro: "", validoAte: "2026-10-01T00:00:00Z" },
    http: { status: 200, location: null, headers: cabecalhos({}) },
    apiHttps: { status: 200, headers: cabecalhos({}) },
  });
  const ruins = falhas(await conferirAmbiente(alvo, rede, { agora: AGORA })).map((r) => r.nome);
  assert.ok(ruins.includes(`painel: TLS válido (${PAINEL})`));
  assert.ok(ruins.includes(`api: TLS válido (${API})`));
  assert.ok(ruins.includes(`painel: http redireciona para https (${PAINEL})`));
  assert.ok(ruins.includes(`api: HSTS (${API})`));
});

test("painel sem os cabeçalhos do vercel.json reprova só os cabeçalhos de segurança", async () => {
  const rede = redeBoa({ painelHttps: { status: 200, headers: cabecalhos({ "strict-transport-security": "max-age=31536000" }) } });
  const ruins = falhas(await conferirAmbiente(alvo, rede, { agora: AGORA })).map((r) => r.nome);
  assert.deepEqual(ruins, [`painel: cabeçalhos de segurança (${PAINEL})`]);
});

test("queda de rede num host vira reprovação nomeada, sem esconder as outras conferências", async () => {
  const rede = redeBoa();
  const original = rede.lerCertificado;
  rede.lerCertificado = async (host) => {
    if (host === API) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    return original(host);
  };
  const resultados = await conferirAmbiente(alvo, rede, { agora: AGORA });
  const ruins = falhas(resultados);
  assert.equal(ruins.length, 1);
  assert.match(ruins[0].detalhe, /erro de rede: ECONNREFUSED/);
  assert.ok(resultados.length > 5, "as demais conferências rodaram");
});

test("--negar com a origem do próprio painel é erro de uso e reprova", async () => {
  const ruins = falhas(await conferirAmbiente({ ...alvo, negar: [ORIGEM_PAINEL] }, redeBoa(), { agora: AGORA }));
  assert.equal(ruins.length, 1);
  assert.match(ruins[0].nome, /--negar não pode ser a origem do próprio painel/);
});

/* ------------------------------------------------------------------ */
/* `pedir` contra um servidor HTTP local                               */
/* ------------------------------------------------------------------ */

test("pedir manda Origin num OPTIONS, não segue redirecionamento e devolve os cabeçalhos", async () => {
  const vistos = [];
  const servidor = createServer((req, res) => {
    vistos.push({ metodo: req.method, origem: req.headers.origin });
    if (req.url === "/vai") {
      res.writeHead(308, { location: "https://destino.exemplo.com.br/" }).end();
      return;
    }
    // Servidor de brinquedo que só aceita a origem do próprio ambiente.
    const cab = req.headers.origin === "https://aceita.exemplo.com.br" ? { "access-control-allow-origin": req.headers.origin } : {};
    res.writeHead(204, cab).end();
  });
  await new Promise((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const aceita = await pedir(`${base}/saude`, { method: "OPTIONS", headers: { origin: "https://aceita.exemplo.com.br", "access-control-request-method": "GET" } });
    assert.equal(aceita.status, 204);
    assert.equal(aceita.headers("access-control-allow-origin"), "https://aceita.exemplo.com.br");
    const negada = await pedir(`${base}/saude`, { method: "OPTIONS", headers: { origin: ORIGEM_INVENTADA } });
    assert.equal(negada.headers("access-control-allow-origin"), null);
    assert.deepEqual(vistos.map((v) => v.origem), ["https://aceita.exemplo.com.br", ORIGEM_INVENTADA]);
    assert.equal(vistos[0].metodo, "OPTIONS");
    const redirecionado = await pedir(`${base}/vai`);
    assert.equal(redirecionado.status, 308);
    assert.equal(redirecionado.location, "https://destino.exemplo.com.br/");
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
});

/* ------------------------------------------------------------------ */
/* Como comando                                                        */
/* ------------------------------------------------------------------ */

test("como comando: argumentos faltando ou inválidos saem com código 2 e mostram o uso", async () => {
  const casos = [[], ["--painel=a.exemplo.com.br"], ["--painel=http://a.exemplo.com.br", "--api=b.exemplo.com.br"], ["--api=*.exemplo.com.br", "--painel=a.exemplo.com.br"]];
  for (const args of casos) {
    await assert.rejects(executar(process.execPath, [SCRIPT, ...args]), (erro) => {
      assert.equal(erro.code, 2, args.join(" "));
      assert.match(erro.stderr, /uso: node scripts\/conferir-dominio\.mjs/);
      return true;
    });
  }
});
