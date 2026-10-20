import type { FastifyInstance, FastifyReply } from "fastify";
import { request } from "node:http";
import { connect } from "node:net";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODIGOS_DE_ERRO_DE_ACESSO } from "@dc360/shared";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor, RegraDeNegocio } from "../src/servidor.js";
import { AcessoSuspenso } from "../src/auth/suspensao.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import {
  CONTRATO_DE_ACESSO_DA_API, conferirCorpoDeAcesso, lerDesviosDaGuarda, type ModoDaGuarda,
} from "../src/guarda-de-codigos-de-erro.js";

/**
 * A GUARDA EM TEMPO DE EXECUÇÃO das respostas de acesso (V2-F00-E05, correção 3).
 *
 * A varredura do fonte é heurística: a revisão independente plantou dezesseis
 * formas de responder 403 com código fora do catálogo que ela não lia. Aqui
 * quinze delas viram rota de verdade, no servidor de verdade (a M08, escrita
 * no socket, fica de fora porque a guarda não a vê; ver abaixo), e o que se
 * confere é a RESPOSTA: em teste (modo "falhar") ela sai 500
 * `desvio_do_catalogo_de_erro` e o desvio fica registrado (o apoio
 * `test/guarda-falha-alto.ts` reprova qualquer outro caso que passe por um);
 * fora de teste (modo "corrigir") ela sai com o código genérico do catálogo para
 * o status, e o desvio vai para o log com a rota.
 *
 * As rotas ficam neste arquivo, fora das pastas que a varredura lê, de
 * propósito: o que a guarda prova é que a FORMA não importa.
 *
 * A guarda confere na resposta do Node (`writeHead`, `write` e `end`), então
 * também pega o que a PRIMEIRA versão dela, um `onSend`, deixava passar: os
 * escapes da revisão estão no fim deste arquivo, copiados do arquivo dela.
 *
 * O que ela não vê é a escrita no socket (M08 da revisão), que não passa pela
 * resposta do Node, e o método do protótipo chamado por fora da instância; os
 * dois a varredura proíbe (`.socket`, `.connection`, `.call`, `.apply`,
 * `Reflect`).
 */

const SEGREDO = "segredo-da-guarda-de-codigos-com-mais-de-32-bytes";

type Recusa = { erro: string; mensagem: string };

/** O que vem "de outro arquivo" (o M16 da revisão era um `.mts` que a varredura não lia). */
function recusarDeFora(resposta: FastifyReply) {
  return resposta.code(403).send({ erro: "vazou_mbg", mensagem: "x" });
}

/** As formas da revisão, cada uma numa rota que responderia 403 (ou 401) com código fora do catálogo. */
function plantarFormas(app: FastifyInstance): void {
  const r = (n: string) => `/teste-da-guarda/${n}`;
  app.get(r("m01"), async () => {
    const modulo = { RegraDeNegocio } as Record<string, typeof RegraDeNegocio>;
    const k = "Regra" + "DeNegocio";
    throw new modulo[k]!("vazou_mab", "x", 403);
  });
  app.get(r("m02"), async () => {
    const base = new RegraDeNegocio("sem_permissao", "x", 403);
    const Construtor = base.constructor as typeof RegraDeNegocio;
    throw new Construtor("vazou_mac", "x", 403);
  });
  app.get(r("m03"), async () => {
    const campo = "codigo";
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    (e as unknown as Record<string, unknown>)[campo] = "vazou_mad";
    throw e;
  });
  app.get(r("m04"), async () => {
    const O = Object;
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    O.assign(e, { codigo: "vazou_mae" });
    throw e;
  });
  app.get(r("m05"), async () => {
    const e = new RegraDeNegocio("sem_permissao", "x", 403);
    globalThis.Object.defineProperty(e, "codigo", { value: "vazou_maf" });
    throw e;
  });
  app.get(r("m06"), async () => {
    class Recusa06 extends RegraDeNegocio {
      constructor() {
        super("sem_permissao", "x", 403);
        (this as unknown as Record<string, unknown>)["codigo"] = "vazou_mag";
      }
    }
    throw new Recusa06();
  });
  app.get(r("m07"), {
    onSend: async (_req, rep, payload) => (rep.statusCode === 403 ? String(payload).replace("sem_permissao", "vazou_mah") : payload),
  }, async (_req, resposta) => resposta.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  // M09: a rota é comum; o `JSON.stringify` é trocado no próprio caso, em volta do pedido.
  app.get(r("m09"), async (_req, resposta) => resposta.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  app.get(r("m10"), async (_req, resposta) => {
    const campo = "statusCode";
    const s = 403;
    (resposta as unknown as Record<string, unknown>)[campo] = s;
    return { erro: "vazou_mba", mensagem: "x" };
  });
  app.get(r("m11"), async (_req, resposta) => resposta.code(200).code(403).send({ erro: "vazou_mbb", mensagem: "x" }));
  app.get(r("m12"), async () => {
    throw new Proxy(new RegraDeNegocio("sem_permissao", "x", 403), {
      get: (alvo, p) => (p === "codigo" ? "vazou_mbc" : (alvo as unknown as Record<string | symbol, unknown>)[p]),
    });
  });
  app.get(r("m13"), async (_req, resposta) => {
    const corpo: Recusa = { erro: "sem_permissao", mensagem: "x" };
    void corpo;
    const recusar = ({ corpo }: { corpo: Recusa }) => resposta.code(403).send(corpo);
    return recusar({ corpo: { erro: "vazou_mbd", mensagem: "x" } });
  });
  app.get(r("m14"), async (_req, resposta) => {
    const corpo: Recusa = { erro: "sem_permissao", mensagem: "x" };
    void corpo;
    for (const corpo of [{ erro: "vazou_mbe", mensagem: "x" }]) return resposta.code(403).send(corpo);
    return null;
  });
  app.get(r("m15"), async () => {
    const campo = "status";
    const e = new RegraDeNegocio("vazou_mbf", "x", 409);
    (e as unknown as Record<string, unknown>)[campo] = 403;
    throw e;
  });
  app.get(r("m16"), async (_req, resposta) => recusarDeFora(resposta));
  // Desvios que não são de código: status trocado, sem corpo, corpo que não é JSON, 401.
  app.get(r("status-trocado"), async (_req, resposta) => resposta.code(401).send({ erro: "sem_permissao", mensagem: "x" }));
  app.get(r("sem-corpo"), async (_req, resposta) => resposta.code(403).send());
  app.get(r("texto"), async (_req, resposta) => resposta.code(403).type("text/plain").send("proibido"));
  app.get(r("401-fora"), async (_req, resposta) => resposta.code(401).send({ erro: "token_ausente", mensagem: "x" }));
  // Controles: o que está no catálogo passa intacto.
  app.get(r("ok-403"), async (_req, resposta) => resposta.code(403).send({ erro: "sem_permissao", mensagem: "Frase da rota." }));
  app.get(r("ok-401"), async (_req, resposta) => resposta.code(401).send({ erro: "nao_autenticado", mensagem: "Frase da rota." }));
  app.get(r("ok-entrada"), async (_req, resposta) => resposta.code(401).send({ erro: "credenciais", mensagem: "x" }));
  app.get(r("ok-503"), async (_req, resposta) => resposta.code(503).send({ erro: "acesso_suspenso", mensagem: "x" }));
  app.get(r("ok-200"), async () => ({ erro: "vazou_mas_e_200" }));
}

/*
  Os escapes da revisão independente da PRIMEIRA guarda (um `onSend`), copiados do
  arquivo dela (`zz-revisao-escape.test.ts`) sem mudar uma linha: `onRoute` de plugin
  acrescentando `onSend` depois (e01), `onSend` de contexto (e02), 404 de plugin trocado
  por 403 (e04), `setNotFoundHandler` (e05), `onSend` que lança duas vezes e faz o
  Fastify escrever o erro direto na resposta do Node (e06), `setErrorHandler` (e07),
  erro com `statusCode` (e08, que sai 500), serializador (e09), `Buffer` (e10), fluxo
  (e11), texto (e12), `erro` aninhado (e13), `preSerialization` (e14), chave repetida
  (e15), `onRequest` de rota (e16), dado pessoal no código (e17) e `callNotFound` com
  `onSend` de plugin (e18).
*/
const arr = (x: unknown) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
function plantarEscapesDaRevisao(app: FastifyInstance) {
  // E01: onRoute de plugin filho acrescenta onSend DEPOIS da guarda
  app.register(async (f) => {
    f.addHook("onRoute", (r) => {
      (r as { onSend: unknown }).onSend = [...arr(r.onSend), async (_q: unknown, rep: { statusCode: number }, p: unknown) =>
        (rep.statusCode === 403 ? String(p).replace("sem_permissao", "vazou_e01") : p)];
    });
    f.get("/x", async (_q, rep) => rep.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  }, { prefix: "/esc/e01" });
  // E02: onSend no contexto de plugin filho (controle: a guarda da rota roda depois)
  app.register(async (f) => {
    f.addHook("onSend", async (_q, rep, p) => (rep.statusCode === 403 ? String(p).replace("sem_permissao", "vazou_e02") : p));
    f.get("/x", async (_q, rep) => rep.code(403).send({ erro: "sem_permissao", mensagem: "x" }));
  }, { prefix: "/esc/e02" });
  // E03/E04: setNotFoundHandler em plugin filho + onSend do contexto que troca o 404 por 403 fora do catálogo
  app.register(async (f) => {
    f.addHook("onSend", async (req, rep, p) => {
      if (req.url.startsWith("/esc/e04") && rep.statusCode === 404) { rep.code(403); return '{"erro":"vazou_e04","mensagem":"x"}'; }
      return p;
    });
    f.setNotFoundHandler((_q, rep) => { void rep.code(404).send({ erro: "nao_encontrado", mensagem: "x" }); });
  }, { prefix: "/esc/e04" });
  // E05: setNotFoundHandler encapsulado que responde 403 direto (controle)
  app.register(async (f) => {
    f.setNotFoundHandler((_q, rep) => { void rep.code(403).send({ erro: "vazou_e05", mensagem: "x" }); });
  }, { prefix: "/esc/e05" });
  // E06: onSend que lança: 1a passada 500, 2a passada põe 403 e lança de novo (fallback do Fastify escreve no raw)
  app.register(async (f) => {
    f.addHook("onSend", async (req, rep) => {
      const q = req as unknown as { passadas?: number };
      q.passadas = (q.passadas ?? 0) + 1;
      if (q.passadas === 1) { rep.code(500); throw new Error("vazou_e06a"); }
      rep.code(403); throw Object.assign(new Error("vazou_e06b"), { code: "vazou_e06" });
    });
    f.get("/x", async () => ({ ok: true }));
  }, { prefix: "/esc/e06" });
  // E07: setErrorHandler encapsulado (controle)
  app.register(async (f) => {
    f.setErrorHandler((_e, _q, rep) => rep.code(403).send({ erro: "vazou_e07", mensagem: "x" }));
    f.get("/x", async () => { throw new Error("y"); });
  }, { prefix: "/esc/e07" });
  // E08: erro com statusCode 403 lançado num preHandler (controle)
  app.get("/esc/e08", { preHandler: async () => { throw Object.assign(new Error("vazou_e08"), { statusCode: 403, code: "vazou_e08" }); } }, async () => ({}));
  // E09: reply.serializer
  app.get("/esc/e09", async (_q, rep) => rep.code(403).serializer(() => '{"erro":"vazou_e09"}').send({ erro: "sem_permissao" }));
  // E10: Buffer, E11: stream, E12: string já serializada com content-type texto
  app.get("/esc/e10", async (_q, rep) => rep.code(403).type("application/json").send(Buffer.from('{"erro":"vazou_e10"}')));
  app.get("/esc/e11", async (_q, rep) => rep.code(403).type("application/json").send(Readable.from(['{"erro":"vazou_e11"}'])));
  app.get("/esc/e12", async (_q, rep) => rep.code(403).type("text/plain").send('{"erro":"vazou_e12"}'));
  // E13: erro aninhado
  app.get("/esc/e13", async (_q, rep) => rep.code(403).send({ erro: { codigo: "sem_permissao" }, mensagem: "x" }));
  // E14: preSerialization
  app.get("/esc/e14", { preSerialization: async (_q, _r, p) => ({ ...(p as object), erro: "vazou_e14" }) }, async (_q, rep) => rep.code(403).send({ erro: "sem_permissao" }));
  // E15: chave duplicada, a primeira fora e a última dentro
  app.get("/esc/e15", async (_q, rep) => rep.code(403).type("application/json").send('{"erro":"vazou_e15","erro":"sem_permissao"}'));
  // E16: onRequest de rota respondendo 403
  app.get("/esc/e16", { onRequest: async (_q, rep) => { await rep.code(403).send({ erro: "vazou_e16" }); } }, async () => ({}));
  // E17: dado pessoal e texto enorme no erro, para o log
  app.get("/esc/e17", async (_q, rep) => rep.code(403).send({ erro: "maria.silva@exemplo.com.br cpf 123.456.789-00 " + "A".repeat(5000), mensagem: "segredo da mensagem" }));
  // E18: callNotFound dentro de plugin filho cujo onSend troca o 404 por 401
  app.register(async (f) => {
    f.addHook("onSend", async (_q, rep, p) => { if (rep.statusCode === 404) { rep.code(401); return '{"erro":"vazou_e18"}'; } return p; });
    f.get("/x", async (_q, rep) => rep.callNotFound());
  }, { prefix: "/esc/e18" });
}

/*
  Correção 4 (rodada 6, red-team e QA): o status que o Node escreve é `statusCode | 0`
  (`403.5`, `"403.2"`, `4294967699`, `-4294966893`, um `valueOf` que dá `401.9`: tudo
  sai 401 ou 403 no fio). A guarda decidia por `=== 401 || === 403` sobre o valor
  pedido e deixava passar `403 {"erro":"vazou_meio"}`. Cada rota abaixo chega ao Node
  com status torto por um caminho diferente.
*/
type RespostaCrua = { statusCode: unknown; writeHead: (...a: unknown[]) => unknown; end: (c?: string) => unknown };
const crua = (resposta: FastifyReply) => resposta.raw as unknown as RespostaCrua;
const JSON_CT = { "content-type": "application/json" };
function plantarStatusTorto(app: FastifyInstance): void {
  const r = (n: string) => `/status-torto/${n}`;
  app.get(r("code-403.5"), async (_q, rep) => rep.code(403.5).send({ erro: "vazou_frac", mensagem: "x" }));
  app.get(r("code-401.9"), async (_q, rep) => rep.code(401.9).send({ erro: "vazou_frac_um", mensagem: "x" }));
  app.get(r("code-texto"), async (_q, rep) => rep.code("403.2" as unknown as 403).send({ erro: "vazou_frac_texto", mensagem: "x" }));
  app.get(r("catalogo-403.5"), async (_q, rep) => rep.code(403.5).send({ erro: "sem_permissao", mensagem: "x" }));
  // A forma do red-team pelo tratador global: o construtor recusa 403.5, então o status é trocado depois.
  app.get(r("regra-mutada"), async () => {
    const e = new RegraDeNegocio("vazou_meio", "x", 409);
    (e as unknown as { status: number }).status = 403.5;
    throw e;
  });
  app.get(r("raw-statuscode-texto"), async (_q, rep) => {
    crua(rep).statusCode = "403";
    return { erro: "vazou_texto_raw", mensagem: "x" };
  });
  app.get(r("hijack-grande"), async (_q, rep) => {
    rep.hijack();
    crua(rep).writeHead(403 + 2 ** 32, JSON_CT);
    crua(rep).end('{"erro":"vazou_grande"}');
  });
  app.get(r("hijack-negativo"), async (_q, rep) => {
    rep.hijack();
    crua(rep).writeHead(-(2 ** 32) + 403, JSON_CT);
    crua(rep).end('{"erro":"vazou_negativo"}');
  });
  app.get(r("hijack-valueof"), async (_q, rep) => {
    rep.hijack();
    crua(rep).writeHead({ valueOf: () => 401.9 }, JSON_CT);
    crua(rep).end('{"erro":"vazou_valueof"}');
  });
  app.get(r("implicito-403.5"), async (_q, rep) => {
    rep.hijack();
    crua(rep).statusCode = 403.5;
    crua(rep).end('{"erro":"vazou_implicito"}');
  });
  app.get(r("frase-vazou"), async (_q, rep) => {
    rep.hijack();
    crua(rep).writeHead(403, "vazou_frase", JSON_CT);
    crua(rep).end('{"erro":"vazou_frase"}');
  });
  // O construtor recusa o status torto: a regra vira 500 erro_interno, que não é resposta de acesso.
  app.get(r("regra-403.5"), async () => { throw new RegraDeNegocio("vazou_meio", "x", 403.5); });
  // Controles.
  app.get(r("ok-200.5"), async (_q, rep) => rep.code(200.5).send({ erro: "vazou_mas_e_200" }));
  app.get(r("ok-cabecalho-terceiro"), async (_q, rep) => {
    rep.hijack();
    crua(rep).writeHead(403, undefined, { ...JSON_CT, "x-sonda": "terceiro" });
    crua(rep).end('{"erro":"sem_permissao","mensagem":"x"}');
  });
  // O `valueOf` que muda a cada leitura: a guarda o lê UMA vez, e o Node escreve o que ela leu.
  app.get(r("valueof-que-muda"), async (_q, rep) => {
    let leituras = 0;
    rep.hijack();
    crua(rep).statusCode = { valueOf: () => (leituras++ === 0 ? 200 : 403) };
    crua(rep).end('{"erro":"vazou_se_403"}');
  });
}

/*
  Correção 4b (revisão de `05ab42d`): a linha de status escrita POR BAIXO de
  `writeHead`, `write` e `end`, no estado interno da resposta do Node. A rota
  chega à resposta do Node por chave calculada ou desestruturação (o que a
  varredura agora reprova) e grava a cabeça por `_storeHeader`, reescreve
  `_header` depois de `writeHead(200)`, ou escreve os bytes prontos por
  `_writeRaw` ou pela fila `outputData`. A guarda lê a linha de status nos bytes
  que vão para o socket.
*/
type Interna = Record<string, any>;
const CORPO_INVENTADO = '{"erro":"inventado_c6","mensagem":"x"}';
const CABECA_403 = `HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: ${CORPO_INVENTADO.length}\r\n\r\n`;
function plantarPorBaixo(app: FastifyInstance): void {
  const r = (n: string) => `/por-baixo/${n}`;
  const interna = (rep: FastifyReply): Interna => {
    const k = "ra" + "w";
    return (rep as unknown as Record<string, Interna>)[k]!;
  };
  const cab = { "content-type": "application/json", "content-length": String(CORPO_INVENTADO.length) };
  app.get(r("calc-store"), async (_q, rep) => { const x = interna(rep); x._storeHeader("HTTP/1.1 403 Forbidden\r\n", cab); x.end(CORPO_INVENTADO); return rep; });
  app.get(r("destruct-store"), async (_q, rep) => {
    const { raw: d } = rep as unknown as { raw: Interna };
    d._storeHeader("HTTP/1.1 403 Forbidden\r\n", cab); d.end(CORPO_INVENTADO); return rep;
  });
  app.get(r("header-trocado"), async (_q, rep) => {
    rep.hijack(); const x = interna(rep);
    x.writeHead(200, { "content-type": "application/json" });
    x._header = x._header.replace("200 OK", "403 Forbidden"); x.end(CORPO_INVENTADO);
  });
  app.get(r("header-401"), async (_q, rep) => {
    rep.hijack(); const x = interna(rep);
    x.writeHead(200, cab); x._header = x._header.replace("200 OK", "401 Unauthorized"); x.end(CORPO_INVENTADO);
  });
  app.get(r("writeraw"), async (_q, rep) => { rep.hijack(); const x = interna(rep); x._writeRaw(CABECA_403 + CORPO_INVENTADO); x._header = "x"; x.end(); });
  app.get(r("writeraw-base64"), async (_q, rep) => {
    rep.hijack(); const x = interna(rep);
    x._writeRaw(Buffer.from(CABECA_403 + CORPO_INVENTADO).toString("base64"), "base64"); x._header = "x"; x.end();
  });
  app.get(r("writeraw-buffer"), async (_q, rep) => { rep.hijack(); const x = interna(rep); x._writeRaw(Buffer.from(CABECA_403 + CORPO_INVENTADO)); x._header = "x"; x.end(); });
  app.get(r("continue-junto"), async (_q, rep) => {
    rep.hijack(); const x = interna(rep);
    x._writeRaw("HTTP/1.1 100 Continue\r\n\r\n" + CABECA_403 + CORPO_INVENTADO); x._header = "x"; x.end();
  });
  app.get(r("linha-partida"), async (_q, rep) => {
    rep.hijack(); const x = interna(rep);
    x._writeRaw("HTTP/1.1 4"); x._writeRaw(CABECA_403.slice(10) + CORPO_INVENTADO); x._header = "x"; x.end();
  });
  app.get(r("fila"), async (_q, rep) => {
    rep.hijack(); const x = interna(rep);
    x.outputData.push({ data: CABECA_403 + CORPO_INVENTADO, encoding: "latin1", callback: null }); x._header = "x"; x.end();
  });
  app.get(r("depois-do-fim"), async (_q, rep) => {
    rep.hijack(); const x = interna(rep);
    x.writeHead(200, { "content-type": "application/json", "content-length": "2" }); x.end("{}");
    x._writeRaw(CABECA_403 + CORPO_INVENTADO);
  });
  // Controles: a cabeça provisória de verdade (100) seguida do 403 do catálogo, e o 403 comum.
  app.get(r("ok-continue"), async (_q, rep) => {
    rep.hijack(); const x = interna(rep);
    x.writeContinue(); x.writeHead(403, { "content-type": "application/json" }); x.end('{"erro":"sem_permissao","mensagem":"x"}');
  });
  app.get(r("ok-403"), async (_q, rep) => rep.code(403).send({ erro: "sem_permissao", mensagem: "Frase da rota." }));
}

/*
  Correção 6 (rodada 7, QA): a MOLDURA DO CORPO. Pela API pública do Fastify,
  `code(200).header("content-length", "2").send(Readable.from(["{}" + cabeca403 + corpo]))`
  escrevia tudo (o Node não confere o content-length sem `strictContentLength`),
  e um cliente em pipeline lia, depois do `200 {}`, uma segunda resposta `403`
  com código inventado. E o trailer com código fora do catálogo derrubava o
  processo com `ERR_HTTP_TRAILER_INVALID` no caminho do desvio.
*/
const CORPO_QA7 = JSON.stringify({ erro: "inventado_qa7", mensagem: "x" });
const CABECA_QA7 = `HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: ${CORPO_QA7.length}\r\n\r\n`;
function plantarMoldura(app: FastifyInstance): void {
  const r = (n: string) => `/moldura/${n}`;
  const crua = (rep: FastifyReply): Interna => { const k = "ra" + "w"; return (rep as unknown as Record<string, Interna>)[k]!; };
  app.get(r("cl-stream"), async (_q, rep) => rep.code(200).header("content-length", "2").type("application/json")
    .send(Readable.from([Buffer.from("{}" + CABECA_QA7 + CORPO_QA7)])));
  app.get(r("cl-response"), async (_q, rep) => rep.send(new Response("{}" + CABECA_QA7 + CORPO_QA7,
    { status: 200, headers: { "content-type": "application/json", "content-length": "2" } })));
  app.get(r("cl-stream-pedacos"), async (_q, rep) => rep.code(200).header("content-length", "2").type("application/json")
    .send(Readable.from(["{", "}", CABECA_QA7, CORPO_QA7])));
  app.get(r("cl-raw-end"), async (_q, rep) => { rep.hijack(); const x = crua(rep); x.writeHead(200, { "content-length": "2" }); x.end("{}" + CABECA_QA7 + CORPO_QA7); });
  app.get(r("cl-writeraw"), async (_q, rep) => {
    rep.hijack(); const x = crua(rep);
    x.writeHead(200, { "content-length": "2" }); x.write("{}"); x._writeRaw(CABECA_QA7 + CORPO_QA7); x.end();
  });
  app.get(r("chunked-depois-do-terminador"), async (_q, rep) => {
    rep.hijack(); const x = crua(rep);
    x.writeHead(200, { "content-type": "application/json" }); x.write("{}"); x._writeRaw("0\r\n\r\n" + CABECA_QA7 + CORPO_QA7); x.end();
  });
  app.get(r("cl-e-te"), async (_q, rep) => rep.code(200).header("content-length", "2").header("transfer-encoding", "chunked")
    .type("application/json").send(Readable.from(["{}" + CABECA_QA7 + CORPO_QA7])));
  app.get(r("trailer-inventado"), async (_q, rep) => rep.code(403).trailer("x-t", async () => "y").send({ erro: "inventado_qa7", mensagem: "x" }));
  app.get(r("trailer-catalogo"), async (_q, rep) => rep.code(403).trailer("x-t", async () => "y").send({ erro: "sem_permissao", mensagem: "x" }));
  app.get(r("flush-403"), async (_q, rep) => {
    rep.hijack(); const x = crua(rep);
    x.writeHead(403, { "content-type": "application/json" }); x.flushHeaders(); x.end(CORPO_QA7);
  });
  app.get(r("flush-403-catalogo"), async (_q, rep) => {
    rep.hijack(); const x = crua(rep);
    x.writeHead(403, { "content-type": "application/json" }); x.flushHeaders(); x.end('{"erro":"sem_permissao","mensagem":"x"}');
  });
  // Controles: os downloads do produto (ZIP em fluxo sem content-length, PDF em Buffer), fluxo com o
  // content-length certo, e `transfer-encoding: chunked` forjado, que o Node emoldura sozinho.
  app.get(r("zip"), async (_q, rep) => rep.type("application/zip")
    .send(Readable.from((function* () { for (let i = 0; i < 40; i += 1) yield Buffer.alloc(4096, i); })())));
  app.get(r("pdf"), async (_q, rep) => rep.type("application/pdf").send(Buffer.alloc(300_000, 7)));
  app.get(r("stream-cl-certo"), async (_q, rep) => rep.header("content-length", "8").type("text/plain").send(Readable.from(["abcd", "efgh"])));
  app.get(r("te-forjado"), async (_q, rep) => rep.code(200).header("transfer-encoding", "chunked").type("application/json")
    .send(Readable.from(["0\r\n\r\n" + CABECA_QA7 + CORPO_QA7])));
  app.get(r("estrito"), async (_q, rep) => ({ estrito: rep.raw.strictContentLength }));
}

/*
  Correção 7 (rodada 7 sobre `fd17ff4`: Segurança, red-team e QA). As formas dos
  três relatórios que ainda não tinham caso: o corpo além do content-length por
  `ReadableStream` da web e com `content-length: 0`; o 403 do catálogo com
  content-length que não bate (o `end` do Node lançava com o socket arrolhado, e
  o cliente ficava sem resposta); `transfer-encoding: identity` forjado; o
  trailer por `addTrailers` (red-team); e o status 1xx como resposta FINAL
  (Segurança, achado 3), pela API pública, pela resposta crua e por baixo.
*/
const CORPO_C7 = JSON.stringify({ erro: "inventado_c7", mensagem: "x" });
const CABECA_C7 = `HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: ${CORPO_C7.length}\r\n\r\n`;
const PROVISORIOS_COMO_FINAL = ["g-100", "g-101", "g-102", "g-103", "g-199", "g-102-objeto", "g-102-raw-writehead", "g-102-raw-implicito"];
function plantarCorrecao7(app: FastifyInstance): void {
  const r = (n: string) => `/c7/${n}`;
  const crua7 = (rep: FastifyReply): Interna => { const k = "ra" + "w"; return (rep as unknown as Record<string, Interna>)[k]!; };
  const web = (texto: string) => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(texto)); c.close(); } });
  const ok = JSON.stringify({ erro: "sem_permissao", mensagem: "x" });
  app.get(r("c-webstream"), async (_q, rep) => rep.code(200).header("content-length", "2").type("application/json")
    .send(web("{}" + CABECA_C7 + CORPO_C7)));
  app.get(r("i-cl0-stream"), async (_q, rep) => rep.code(200).header("content-length", "0")
    .send(Readable.from([Buffer.from(CABECA_C7 + CORPO_C7)])));
  app.get(r("i-cl0-response"), async (_q, rep) => rep.send(new Response(CABECA_C7 + CORPO_C7,
    { status: 200, headers: { "content-length": "0" } })));
  app.get(r("i-cl0-webstream"), async (_q, rep) => rep.code(200).header("content-length", "0").send(web(CABECA_C7 + CORPO_C7)));
  app.get(r("e-403-cl-menor"), async (_q, rep) => rep.code(403).header("content-length", "2").type("application/json")
    .send(Readable.from([Buffer.from(ok)])));
  app.get(r("e-403-cl-maior"), async (_q, rep) => rep.code(403).header("content-length", "500").type("application/json")
    .send(Readable.from([Buffer.from(ok)])));
  app.get(r("h-te-identity"), async (_q, rep) => rep.code(200).header("transfer-encoding", "identity")
    .send(Readable.from([Buffer.from("{}" + CABECA_C7 + CORPO_C7)])));
  app.get(r("tr-addtrailers-fora"), async (_q, rep) => {
    rep.code(403).header("transfer-encoding", "chunked").header("trailer", "x-t").type("application/json");
    crua7(rep).addTrailers({ "x-t": "v" });
    return rep.send(CORPO_C7);
  });
  for (const st of [100, 101, 102, 103, 199]) app.get(r(`g-${st}`), async (_q, rep) => rep.code(st).send(CABECA_C7 + CORPO_C7));
  app.get(r("g-102-objeto"), async (_q, rep) => rep.code(102).send({ erro: "inventado_c7", mensagem: "x" }));
  app.get(r("g-102-raw-writehead"), async (_q, rep) => { rep.hijack(); const x = crua7(rep); x.writeHead(102); x.end(CORPO_C7); });
  app.get(r("g-102-raw-implicito"), async (_q, rep) => { rep.hijack(); const x = crua7(rep); x.statusCode = 102; x.end(CORPO_C7); });
  app.get(r("g-101-writeraw"), async (_q, rep) => {
    rep.hijack(); const x = crua7(rep);
    x._writeRaw("HTTP/1.1 101 Switching Protocols\r\n\r\n"); x._header = "x"; x._headerSent = true; x.end();
  });
  app.get(r("g-102-so-provisoria"), async (_q, rep) => {
    rep.hijack(); const x = crua7(rep);
    x.writeProcessing(); x._header = "x"; x._headerSent = true; x.end();
  });
  // Controles: o 102 de verdade antes da resposta final, e formas que já saíam certas.
  app.get(r("g-102-e-final"), async (_q, rep) => { crua7(rep).writeProcessing(); return rep.code(403).type("application/json").send(ok); });
  app.get(r("d-buffer"), async (_q, rep) => rep.code(200).header("content-length", "2").type("application/json")
    .send(Buffer.from("{}" + CABECA_C7 + CORPO_C7)));
  app.get(r("j-204"), async (_q, rep) => rep.code(204).send(Readable.from([Buffer.from(CABECA_C7 + CORPO_C7)])));
  app.get(r("k-304"), async (_q, rep) => rep.code(304).send(Readable.from([Buffer.from(CABECA_C7 + CORPO_C7)])));
  app.get(r("f-early"), async (_q, rep) => {
    await rep.writeEarlyHints({ link: "</a.css>; rel=preload", "x-s": "a\r\n\r\n" + CABECA_C7 + CORPO_C7 });
    return { ok: true };
  });
  app.get(r("flush-401-publico"), async (_q, rep) => { rep.code(401); crua7(rep).flushHeaders(); return rep.send({ erro: "inventado_c7", mensagem: "x" }); });
}

type RespostaLida = { linha: string; status: number; corpo: string };
/** Lê, em ordem, as respostas que um cliente em pipeline leria dos bytes (content-length ou chunked). */
function lerRespostas(bytes: Buffer): { respostas: RespostaLida[]; resto: string } {
  const t = bytes.toString("latin1");
  const respostas: RespostaLida[] = [];
  let i = 0;
  while (i < t.length && t.startsWith("HTTP/", i)) {
    const fim = t.indexOf("\r\n\r\n", i);
    if (fim < 0) break;
    const cab = t.slice(i, fim);
    const linha = cab.split("\r\n")[0]!;
    const cl = /\r\ncontent-length: *(\d+)/i.exec(cab);
    const te = /\r\ntransfer-encoding: *([^\r]+)/i.exec(cab);
    const st = Number(linha.split(" ")[1]);
    let j = fim + 4;
    let corpo = "";
    // 1xx, 204 e 304 não têm corpo (correção 7: a cabeça provisória antes da final).
    if ((st >= 100 && st <= 199) || st === 204 || st === 304) { /* sem corpo */ }
    else if (cl) { corpo = t.slice(j, j + Number(cl[1])); j += Number(cl[1]); }
    else if (te && /chunked/i.test(te[1]!)) {
      for (;;) {
        const f = t.indexOf("\r\n", j); if (f < 0) { j = t.length; break; }
        const n = parseInt(t.slice(j, f), 16); j = f + 2;
        if (!n) { for (;;) { const ft = t.indexOf("\r\n", j); if (ft < 0) { j = t.length; break; } const vazia = ft === j; j = ft + 2; if (vazia) break; } break; }
        corpo += t.slice(j, j + n); j += n + 2;
      }
    } else { corpo = t.slice(j); j = t.length; }
    respostas.push({ linha, status: Number(linha.split(" ")[1]), corpo });
    i = j;
  }
  return { respostas, resto: t.slice(i) };
}
/** Dois pedidos em pipeline no mesmo socket: a forma e um `GET` comum sem credencial (que é 401). */
function pipeline(porta: number, caminho: string, metodo = "GET"): Promise<Buffer> {
  return new Promise((ok) => {
    const s = connect(porta, "127.0.0.1", () => s.write(
      `${metodo} ${caminho} HTTP/1.1\r\nhost: x\r\n\r\nGET /moldura/sem-rota-alguma HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n`));
    const partes: Buffer[] = [];
    s.on("data", (d: Buffer) => partes.push(d));
    s.on("error", () => {});
    const fim = setTimeout(() => s.destroy(), 4000);
    s.on("close", () => { clearTimeout(fim); ok(Buffer.concat(partes)); });
  });
}

/** As formas por baixo: [rota, status que a linha forjada tinha]. */
const FORMAS_POR_BAIXO: ReadonlyArray<[string, 401 | 403]> = [
  ["calc-store", 403], ["destruct-store", 403], ["header-trocado", 403], ["header-401", 401], ["writeraw", 403],
  ["writeraw-base64", 403], ["writeraw-buffer", 403], ["continue-junto", 403], ["linha-partida", 403], ["fila", 403],
];

/** GET por HTTP de verdade, socket novo a cada pedido (ou o agente dado), com status, frase e corpo. */
function pedirHttp(porta: number, caminho: string, agente?: import("node:http").Agent): Promise<{ status: number; frase: string; corpo: string }> {
  return new Promise((ok, falha) => {
    const q = request({ host: "127.0.0.1", port: porta, path: caminho, agent: agente ?? false }, (r) => {
      let corpo = "";
      r.setEncoding("utf8");
      r.on("data", (d: string) => { corpo += d; });
      r.on("end", () => ok({ status: r.statusCode ?? 0, frase: r.statusMessage ?? "", corpo }));
    });
    q.on("error", falha);
    q.setTimeout(5000, () => q.destroy(new Error(`sem resposta em ${caminho}`)));
    q.end();
  });
}

/** As rotas de status torto que viram desvio: [rota, status que o Node escreve, código visto]. */
const FORMAS_TORTAS: ReadonlyArray<[string, 401 | 403, string | null]> = [
  ["code-403.5", 403, "vazou_frac"], ["code-401.9", 401, "vazou_frac_um"], ["code-texto", 403, "vazou_frac_texto"],
  ["catalogo-403.5", 403, null], ["regra-mutada", 403, "vazou_meio"], ["raw-statuscode-texto", 403, "vazou_texto_raw"],
  ["hijack-grande", 403, "vazou_grande"], ["hijack-negativo", 403, "vazou_negativo"], ["hijack-valueof", 401, "vazou_valueof"],
  ["implicito-403.5", 403, "vazou_implicito"],
];

const ESCAPES_DA_REVISAO = ["e01/x", "e02/x", "e04/nada", "e05/nada", "e06/x", "e07/x", "e09", "e10", "e11", "e12", "e13", "e14", "e15", "e16", "e17", "e18/x"];

/** As formas que respondem 403, com o código que tentaria sair. */
const FORMAS_403: ReadonlyArray<[string, string | null]> = [
  ["m01", "vazou_mab"], ["m02", "vazou_mac"], ["m03", "vazou_mad"], ["m04", "vazou_mae"],
  ["m05", "vazou_maf"], ["m06", "vazou_mag"], ["m07", "vazou_mah"], ["m10", "vazou_mba"],
  ["m11", "vazou_mbb"], ["m12", "vazou_mbc"], ["m13", "vazou_mbd"], ["m14", "vazou_mbe"],
  ["m15", "vazou_mbf"], ["m16", "vazou_mbg"], ["sem-corpo", null], ["texto", null],
];

let mem: BancoEmMemoria;
const servidores = new Map<ModoDaGuarda, FastifyInstance>();
const log: string[] = [];

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: SEGREDO, LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
  for (const modo of ["falhar", "corrigir"] as const) {
    const app = await construirServidor({
      banco: mem.banco, config,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
      modoDaGuarda: modo,
      ...(modo === "corrigir" ? { destinoDeLog: { write: (linha: string) => { log.push(linha); } } } : {}),
    });
    plantarFormas(app);
    plantarEscapesDaRevisao(app);
    plantarStatusTorto(app);
    plantarPorBaixo(app);
    plantarMoldura(app);
    plantarCorrecao7(app);
    await app.ready();
    servidores.set(modo, app);
  }
}, 300_000);

afterAll(async () => {
  for (const app of servidores.values()) await app.close();
  await mem?.banco.encerrar();
});

const pedirEm = (modo: ModoDaGuarda, url: string) => servidores.get(modo)!.inject({ method: "GET", url });
/** O servidor do modo escutando numa porta efêmera, uma vez só (o `afterAll` o fecha). */
const enderecos = new Map<ModoDaGuarda, Promise<string>>();
const enderecoDe = (modo: ModoDaGuarda): Promise<string> => {
  if (!enderecos.has(modo)) enderecos.set(modo, servidores.get(modo)!.listen({ port: 0, host: "127.0.0.1" }));
  return enderecos.get(modo)!;
};
const pedir = (modo: ModoDaGuarda, n: string) => pedirEm(modo, `/teste-da-guarda/${n}`);

describe("modo de teste: a resposta fora do catálogo falha alto", () => {
  it.each(FORMAS_403)("%s: sai 500 desvio_do_catalogo_de_erro, e o desvio é registrado com a rota", async (n, visto) => {
    const r = await pedir("falhar", n);
    const desvios = lerDesviosDaGuarda();
    expect(r.statusCode, r.body).toBe(500);
    expect(r.json().erro).toBe("desvio_do_catalogo_de_erro");
    expect(desvios).toHaveLength(1);
    expect(desvios[0]).toMatchObject({ metodo: "GET", rota: `/teste-da-guarda/${n}`, status: 403, erroVisto: visto });
  });

  it("M09: `JSON.stringify` trocado depois de o servidor subir também é pego", async () => {
    const original = JSON.stringify;
    JSON.stringify = ((v: unknown, ...resto: unknown[]) =>
      String((original as (...a: unknown[]) => string)(v, ...resto)).replace("sem_permissao", "vazou_maj")) as typeof JSON.stringify;
    let r;
    try {
      r = await pedir("falhar", "m09");
    } finally {
      JSON.stringify = original;
    }
    const desvios = lerDesviosDaGuarda();
    expect(r.statusCode).toBe(500);
    expect(desvios).toEqual([expect.objectContaining({ erroVisto: "vazou_maj", rota: "/teste-da-guarda/m09" })]);
  });

  it("código do catálogo com o status trocado, e 401 com código fora, também", async () => {
    for (const [n, status, visto] of [["status-trocado", 401, "sem_permissao"], ["401-fora", 401, "token_ausente"]] as const) {
      const r = await pedir("falhar", n);
      expect(r.statusCode, n).toBe(500);
      expect(lerDesviosDaGuarda()).toEqual([expect.objectContaining({ status, erroVisto: visto })]);
    }
  });

  it("controles: o catálogo, a entrada, o 503 e o 200 passam intactos e não registram nada", async () => {
    const esperado: ReadonlyArray<[string, number, string]> = [
      ["ok-403", 403, "sem_permissao"], ["ok-401", 401, "nao_autenticado"], ["ok-entrada", 401, "credenciais"],
      ["ok-503", 503, "acesso_suspenso"], ["ok-200", 200, "vazou_mas_e_200"],
    ];
    for (const [n, status, erro] of esperado) {
      const r = await pedir("falhar", n);
      expect(r.statusCode, n).toBe(status);
      expect(r.json().erro, n).toBe(erro);
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("HEAD não leva corpo", () => {
  it("o HEAD de uma rota sai sem corpo e sem desvio; quem é conferido é o GET gêmeo", async () => {
    const head = await servidores.get("falhar")!.inject({ method: "HEAD", url: "/teste-da-guarda/ok-403" });
    expect(head.statusCode).toBe(403);
    expect(head.body).toBe("");
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("modo de produção: a resposta fora do catálogo sai com o código genérico e vai para o log", () => {
  it.each(FORMAS_403)("%s: sai 403 sem_permissao, com a frase do catálogo", async (n, visto) => {
    log.length = 0;
    const r = await pedir("corrigir", n);
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json()).toEqual({ erro: "sem_permissao", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.sem_permissao.mensagem });
    expect(r.headers["content-type"]).toMatch(/^application\/json/);
    const registro = log.map((l) => JSON.parse(l) as { desvioDoCatalogo?: unknown }).find((l) => l.desvioDoCatalogo);
    expect(registro?.desvioDoCatalogo).toMatchObject({ rota: `/teste-da-guarda/${n}`, status: 403, erroVisto: visto });
    expect(lerDesviosDaGuarda(), "o modo de produção não registra desvio de teste").toEqual([]);
  });

  it("M09: com `JSON.stringify` trocado, o corpo genérico NÃO passa por ele", async () => {
    const original = JSON.stringify;
    JSON.stringify = ((v: unknown, ...resto: unknown[]) =>
      String((original as (...a: unknown[]) => string)(v, ...resto)).replace("sem_permissao", "vazou_maj")) as typeof JSON.stringify;
    let r;
    try {
      r = await pedir("corrigir", "m09");
    } finally {
      JSON.stringify = original;
    }
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("sem_permissao");
  });

  it("401 fora do catálogo sai 401 nao_autenticado", async () => {
    const r = await pedir("corrigir", "401-fora");
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ erro: "nao_autenticado", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.nao_autenticado.mensagem });
  });

  it("controles: o que está no catálogo sai como a rota mandou, com a frase da rota", async () => {
    const r = await pedir("corrigir", "ok-403");
    expect(r.json()).toEqual({ erro: "sem_permissao", mensagem: "Frase da rota." });
  });
});

describe("a conferência do corpo, isolada", () => {
  it.each([
    [403, '{"erro":"sem_permissao","mensagem":"x"}', null],
    [401, '{"erro":"credenciais"}', null],
    [403, '{"erro":"acesso_suspenso"}', null],
    [403, '{"erro":"nao_autenticado"}', "status 403"],
    [403, '{"erro":"inventado"}', "fora do catálogo"],
    [403, '{"mensagem":"x"}', "sem `erro`"],
    [403, '["sem_permissao"]', "não é objeto"],
    [403, "proibido", "não é JSON"],
    [403, "", "sem corpo"],
    [403, null, "teto"],
    [403, '{"erro":"vazou","erro":"sem_permissao"}', "repetida"],
    [403, '{"\u0065rro":"vazou","erro":"sem_permissao"}', "repetida"],
    [403, '{"erro":"sem_permissao","campos":[{"erro":"x"}]}', "repetida"],
  ] as const)("%s %s", (status, payload, motivo) => {
    const r = conferirCorpoDeAcesso(status, payload, CONTRATO_DE_ACESSO_DA_API);
    if (motivo === null) expect(r).toBeNull();
    else expect(r?.motivo).toContain(motivo);
  });
});

describe("os escapes da revisão da primeira guarda (onSend) não escapam da guarda na resposta do Node", () => {
  it.each(ESCAPES_DA_REVISAO)("%s: em teste sai 500 com o desvio registrado; em produção, o código genérico", async (caso) => {
    const emTeste = await pedirEm("falhar", `/esc/${caso}`);
    expect(emTeste.statusCode, emTeste.body).toBe(500);
    expect(emTeste.json().erro).toBe("desvio_do_catalogo_de_erro");
    expect(lerDesviosDaGuarda()).toHaveLength(1);
    const emProducao = await pedirEm("corrigir", `/esc/${caso}`);
    expect([401, 403]).toContain(emProducao.statusCode);
    expect(emProducao.json().erro).toBe(emProducao.statusCode === 401 ? "nao_autenticado" : "sem_permissao");
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("e08 (erro com statusCode 403 lançado) sai 500 erro_interno, que não é resposta de acesso", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const r = await pedirEm(modo, "/esc/e08");
      expect(r.statusCode).toBe(500);
      expect(r.json().erro).toBe("erro_interno");
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("e17: o log de produção NÃO grava o código visto que não tem a forma de um código (e-mail, CPF, texto enorme)", async () => {
    log.length = 0;
    await pedirEm("corrigir", "/esc/e17");
    const linha = log.find((l) => l.includes("desvioDoCatalogo"))!;
    expect(linha).toBeDefined();
    expect(linha).not.toContain("maria.silva");
    expect(linha).not.toContain("123.456.789");
    expect(linha.length).toBeLessThan(800);
    expect(JSON.parse(linha).desvioDoCatalogo.erroVisto).toBe("[fora da forma de um código, não registrado]");
  });

  it("globais trocados com o servidor de pé (includes, hasOwnProperty, JSON.parse, JSON.stringify) não enganam a guarda", async () => {
    const includes = Array.prototype.includes;
    const proprio = Object.prototype.hasOwnProperty;
    const parse = JSON.parse;
    const stringify = JSON.stringify;
    // Trocas mirando o que a guarda decidiria: "403 está na lista" e "o código existe no catálogo".
    Array.prototype.includes = function (this: unknown[], x: unknown, ...resto: [number?]) {
      return x === 403 || includes.apply(this, [x, ...resto]);
    } as typeof Array.prototype.includes;
    Object.prototype.hasOwnProperty = function (this: object, k: PropertyKey) {
      return k === "vazou_mbb" || proprio.call(this, k);
    };
    let r;
    try {
      r = await pedirEm("falhar", "/teste-da-guarda/m11");
    } finally {
      Array.prototype.includes = includes;
      Object.prototype.hasOwnProperty = proprio;
    }
    expect(r.statusCode).toBe(500);
    expect(lerDesviosDaGuarda()).toHaveLength(1);
    JSON.parse = (() => ({ erro: "sem_permissao" })) as typeof JSON.parse;
    try {
      r = await pedirEm("corrigir", "/teste-da-guarda/m11");
    } finally {
      JSON.parse = parse;
    }
    expect(r.statusCode).toBe(403);
    expect(r.body).toContain('"erro":"sem_permissao"');
    JSON.stringify = (() => '{"erro":"vazou"}') as typeof JSON.stringify;
    try {
      r = await pedirEm("corrigir", "/teste-da-guarda/m11");
    } finally {
      JSON.stringify = stringify;
    }
    expect(r.json().erro).toBe("sem_permissao");
  });
});

describe("correção 4: a guarda decide pelo status que o Node ESCREVE, e não pelo que foi pedido", () => {
  it.each(FORMAS_TORTAS)("%s: em teste sai 500 com o desvio registrado (status %s)", async (n, status, visto) => {
    const r = await pedirEm("falhar", `/status-torto/${n}`);
    const desvios = lerDesviosDaGuarda();
    expect(r.statusCode, r.body).toBe(500);
    expect(r.json().erro).toBe("desvio_do_catalogo_de_erro");
    expect(desvios).toEqual([expect.objectContaining({ rota: `/status-torto/${n}`, status, erroVisto: visto })]);
    expect(desvios[0]!.motivo).toContain("não é número inteiro de 100 a 599");
  });

  it.each(FORMAS_TORTAS)("%s: em produção sai o código genérico do status %s e o desvio vai para o log", async (n, status, visto) => {
    log.length = 0;
    const r = await pedirEm("corrigir", `/status-torto/${n}`);
    expect(r.statusCode, r.body).toBe(status);
    expect(r.json()).toEqual(status === 401
      ? { erro: "nao_autenticado", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.nao_autenticado.mensagem }
      : { erro: "sem_permissao", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.sem_permissao.mensagem });
    const registro = log.map((l) => JSON.parse(l) as { desvioDoCatalogo?: unknown }).find((l) => l.desvioDoCatalogo);
    expect(registro?.desvioDoCatalogo).toMatchObject({ rota: `/status-torto/${n}`, status, erroVisto: visto });
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("a frase da linha de status da rota não sai na resposta trocada", async () => {
    const emTeste = await pedirEm("falhar", "/status-torto/frase-vazou");
    expect(emTeste.statusCode).toBe(500);
    expect(emTeste.statusMessage).toBe("Internal Server Error");
    expect(lerDesviosDaGuarda()).toHaveLength(1);
    const emProducao = await pedirEm("corrigir", "/status-torto/frase-vazou");
    expect(emProducao.statusCode).toBe(403);
    expect(emProducao.statusMessage).toBe("Forbidden");
    expect(emProducao.json().erro).toBe("sem_permissao");
  });

  it("RegraDeNegocio e AcessoSuspenso recusam status torto no construtor; a rota que tenta sai 500 erro_interno", async () => {
    for (const s of [403.5, 401.9, "403", 4294967699, 399, 600, Number.NaN]) {
      expect(() => new RegraDeNegocio("vazou_meio", "x", s as number), String(s)).toThrow(TypeError);
    }
    expect(new RegraDeNegocio("sem_permissao", "x", 403).status).toBe(403);
    expect(() => new AcessoSuspenso(403.5 as 403)).toThrow(TypeError);
    expect(new AcessoSuspenso(503).status).toBe(503);
    for (const modo of ["falhar", "corrigir"] as const) {
      const r = await pedirEm(modo, "/status-torto/regra-403.5");
      expect(r.statusCode, modo).toBe(500);
      expect(r.json().erro).toBe("erro_interno");
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("controles: 200.5 sai 200 sem desvio; cabeçalhos no terceiro argumento de writeHead seguem; o valueOf roda uma vez", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const r = await pedirEm(modo, "/status-torto/ok-200.5");
      expect(r.statusCode).toBe(200);
      const c = await pedirEm(modo, "/status-torto/ok-cabecalho-terceiro");
      expect(c.statusCode).toBe(403);
      expect(c.headers["x-sonda"]).toBe("terceiro");
      expect(c.json()).toEqual({ erro: "sem_permissao", mensagem: "x" });
      // O valueOf deu 200 na leitura da guarda; o Node escreve 200, e não o 403 da segunda leitura.
      const v = await pedirEm(modo, "/status-torto/valueof-que-muda");
      expect(v.statusCode).toBe(200);
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("por HTTP de verdade (porta efêmera), nos dois modos: a forma do red-team e a do QA não saem 403 com o código fora", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const endereco = await enderecoDe(modo);
      for (const [n, status] of [["regra-mutada", 403], ["code-403.5", 403], ["code-401.9", 401], ["hijack-grande", 403], ["implicito-403.5", 403]] as const) {
        const r = await fetch(`${endereco}/status-torto/${n}`);
        const corpo = await r.json() as { erro: string };
        if (modo === "falhar") {
          expect(r.status, `${modo} ${n}`).toBe(500);
          expect(corpo.erro).toBe("desvio_do_catalogo_de_erro");
          expect(lerDesviosDaGuarda()).toHaveLength(1);
        } else {
          expect(r.status, `${modo} ${n}`).toBe(status);
          expect(corpo.erro).toBe(status === 401 ? "nao_autenticado" : "sem_permissao");
        }
      }
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("correção 4b: a linha de status escrita por baixo de writeHead, por HTTP de verdade", () => {
  const subir = async (modo: ModoDaGuarda) => ({ porta: Number(new URL(await enderecoDe(modo)).port) });

  it.each(FORMAS_POR_BAIXO)("%s: nunca sai %s com o código inventado; em teste 500 com desvio, em produção o genérico", async (n, status) => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const { porta } = await subir(modo);
      log.length = 0;
      const r = await pedirHttp(porta, `/por-baixo/${n}`);
      expect(r.corpo, `${modo} ${n}`).not.toContain("inventado_c6");
      if (modo === "falhar") {
        expect(r.status, `${modo} ${n}`).toBe(500);
        expect(JSON.parse(r.corpo).erro).toBe("desvio_do_catalogo_de_erro");
        const desvios = lerDesviosDaGuarda();
        expect(desvios).toEqual([expect.objectContaining({ rota: `/por-baixo/${n}` })]);
      } else {
        expect(r.status, `${modo} ${n}`).toBe(status);
        expect(r.frase).toBe(status === 401 ? "Unauthorized" : "Forbidden");
        expect(JSON.parse(r.corpo).erro).toBe(status === 401 ? "nao_autenticado" : "sem_permissao");
        const registro = log.map((l) => JSON.parse(l) as { desvioDoCatalogo?: unknown }).find((l) => l.desvioDoCatalogo);
        expect(registro?.desvioDoCatalogo).toMatchObject({ rota: `/por-baixo/${n}` });
      }
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("bytes depois do fim da resposta não saem (seriam lidos como a resposta seguinte da conexão)", async () => {
    const { Agent } = await import("node:http");
    for (const modo of ["falhar", "corrigir"] as const) {
      const { porta } = await subir(modo);
      const agente = new Agent({ keepAlive: true, maxSockets: 1 });
      try {
        const r = await pedirHttp(porta, "/por-baixo/depois-do-fim", agente);
        expect(r.status).toBe(200);
        expect(r.corpo).toBe("{}");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
        // O pedido seguinte, no mesmo socket, recebe a resposta dele e não o 403 que sobrou.
        const seguinte = await pedirHttp(porta, "/por-baixo/ok-403", agente);
        expect(seguinte.status).toBe(403);
        expect(JSON.parse(seguinte.corpo)).toEqual({ erro: "sem_permissao", mensagem: "Frase da rota." });
      } finally {
        agente.destroy();
      }
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("a resposta trocada fecha a conexão, e o pedido seguinte do mesmo agente sai certo", async () => {
    const { Agent } = await import("node:http");
    for (const modo of ["falhar", "corrigir"] as const) {
      const { porta } = await subir(modo);
      const agente = new Agent({ keepAlive: true, maxSockets: 1 });
      try {
        const trocada = await pedirHttp(porta, "/por-baixo/calc-store", agente);
        expect(trocada.corpo).not.toContain("inventado_c6");
        lerDesviosDaGuarda();
        const seguinte = await pedirHttp(porta, "/por-baixo/ok-403", agente);
        expect(seguinte.status).toBe(403);
        expect(JSON.parse(seguinte.corpo).mensagem).toBe("Frase da rota.");
      } finally {
        agente.destroy();
      }
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("controles: 100 Continue de verdade seguido do 403 do catálogo, e o 403 comum, passam intactos", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const { porta } = await subir(modo);
      const c = await pedirHttp(porta, "/por-baixo/ok-continue");
      expect(c.status).toBe(403);
      expect(JSON.parse(c.corpo)).toEqual({ erro: "sem_permissao", mensagem: "x" });
      const o = await pedirHttp(porta, "/por-baixo/ok-403");
      expect(JSON.parse(o.corpo)).toEqual({ erro: "sem_permissao", mensagem: "Frase da rota." });
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });
});

describe("correção 6: a moldura do corpo, por socket cru em pipeline (HTTP de verdade)", () => {
  const porta = async (modo: ModoDaGuarda) => Number(new URL(await enderecoDe(modo)).port);
  const nenhumaForjada = (rs: RespostaLida[]) =>
    rs.filter((x) => (x.status === 401 || x.status === 403) && x.corpo.includes("inventado_qa7"));

  it.each(["cl-stream", "cl-response", "cl-stream-pedacos", "cl-raw-end", "cl-writeraw", "chunked-depois-do-terminador"])(
    "%s: sai só o corpo declarado (200 {}), nenhum 403 inventado chega ao cliente, e é desvio em teste", async (n) => {
      for (const modo of ["falhar", "corrigir"] as const) {
        const { respostas, resto } = lerRespostas(await pipeline(await porta(modo), `/moldura/${n}`));
        expect(nenhumaForjada(respostas), `${modo} ${n}`).toEqual([]);
        expect(respostas[0], `${modo} ${n}`).toMatchObject({ status: 200, corpo: "{}" });
        expect(resto, `${modo} ${n}`).not.toContain("inventado_qa7");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    });

  it("content-length junto de transfer-encoding é cabeça ilegível: a resposta inteira é trocada", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const { respostas } = lerRespostas(await pipeline(await porta(modo), "/moldura/cl-e-te"));
      expect(nenhumaForjada(respostas)).toEqual([]);
      expect(respostas[0]!.status).toBe(modo === "falhar" ? 500 : 403);
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("trailer com código fora do catálogo: o desvio não lança (nada de exceção não tratada) e a resposta sai", async () => {
    const naoTratadas: unknown[] = [];
    const pegar = (e: unknown) => { naoTratadas.push(e); };
    process.on("uncaughtException", pegar);
    try {
      for (const modo of ["falhar", "corrigir"] as const) {
        const { respostas } = lerRespostas(await pipeline(await porta(modo), "/moldura/trailer-inventado"));
        expect(respostas[0]!.status, modo).toBe(modo === "falhar" ? 500 : 403);
        expect(JSON.parse(respostas[0]!.corpo).erro).toBe(modo === "falhar" ? "desvio_do_catalogo_de_erro" : "sem_permissao");
        expect(respostas[1]!.status, "o pedido seguinte no socket").toBe(404);
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
        const ok = lerRespostas(await pipeline(await porta(modo), "/moldura/trailer-catalogo")).respostas[0]!;
        expect(ok.status).toBe(403);
        expect(JSON.parse(ok.corpo)).toEqual({ erro: "sem_permissao", mensagem: "x" });
      }
    } finally {
      process.off("uncaughtException", pegar);
    }
    expect(naoTratadas).toEqual([]);
  });

  it("writeHead(403) mais flushHeaders: sai o 403 decidido pela guarda (não 200 sem corpo)", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const fora = lerRespostas(await pipeline(await porta(modo), "/moldura/flush-403")).respostas[0]!;
      expect(fora.status, modo).toBe(modo === "falhar" ? 500 : 403);
      expect(fora.corpo).not.toContain("inventado_qa7");
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      const dentro = lerRespostas(await pipeline(await porta(modo), "/moldura/flush-403-catalogo")).respostas[0]!;
      expect(dentro.status).toBe(403);
      expect(JSON.parse(dentro.corpo)).toEqual({ erro: "sem_permissao", mensagem: "x" });
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("controles: ZIP em fluxo, PDF em Buffer, fluxo com content-length certo e chunked forjado saem inteiros", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const p = await porta(modo);
      const zip = lerRespostas(await pipeline(p, "/moldura/zip")).respostas;
      expect(zip[0]!.status).toBe(200);
      expect(zip[0]!.corpo.length).toBe(40 * 4096);
      expect(zip[1]!.status, "o pedido seguinte no socket").toBe(404);
      const pdf = lerRespostas(await pipeline(p, "/moldura/pdf")).respostas;
      expect(pdf[0]!.corpo.length).toBe(300_000);
      expect(pdf[1]!.status).toBe(404);
      const certo = lerRespostas(await pipeline(p, "/moldura/stream-cl-certo")).respostas;
      expect(certo[0]!.corpo).toBe("abcdefgh");
      expect(certo[1]!.status).toBe(404);
      // O Node emoldura o corpo em pedaços: o texto forjado é corpo, não uma resposta.
      const te = lerRespostas(await pipeline(p, "/moldura/te-forjado")).respostas;
      expect(te[0]!.status).toBe(200);
      expect(te[0]!.corpo).toContain("inventado_qa7");
      expect(te[1]!.status).toBe(404);
      expect(nenhumaForjada(te)).toEqual([]);
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("toda resposta sai com strictContentLength ligado", async () => {
    const r = await pedirEm("falhar", "/moldura/estrito");
    expect(r.json()).toEqual({ estrito: true });
  });
});

describe("correção 7: as formas da rodada 7 sobre fd17ff4, por socket cru em pipeline (HTTP de verdade)", () => {
  const porta = async (modo: ModoDaGuarda) => Number(new URL(await enderecoDe(modo)).port);
  const forjadas = (rs: RespostaLida[]) => rs.filter((x) => (x.status === 401 || x.status === 403) && x.corpo.includes("inventado_c7"));
  const doDesvio = (modo: ModoDaGuarda) => (modo === "falhar" ? "desvio_do_catalogo_de_erro" : "erro_interno");

  it.each(["c-webstream", "i-cl0-stream", "i-cl0-response", "i-cl0-webstream"])(
    "%s: sai só o corpo declarado, nenhum 403 inventado chega ao cliente, e é desvio em teste", async (n) => {
      for (const modo of ["falhar", "corrigir"] as const) {
        const { respostas, resto } = lerRespostas(await pipeline(await porta(modo), `/c7/${n}`));
        expect(forjadas(respostas), `${modo} ${n}`).toEqual([]);
        expect(respostas, `${modo} ${n}`).toHaveLength(1);
        expect(respostas[0], `${modo} ${n}`).toMatchObject({ status: 200, corpo: n === "c-webstream" ? "{}" : "" });
        expect(resto, `${modo} ${n}`).not.toContain("inventado_c7");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    });

  it("403 do catálogo com content-length menor ou maior que o corpo: sai a resposta do desvio (o socket é desarrolhado)", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      for (const n of ["e-403-cl-menor", "e-403-cl-maior"]) {
        const { respostas } = lerRespostas(await pipeline(await porta(modo), `/c7/${n}`));
        expect(respostas, `${modo} ${n}`).toHaveLength(1);
        expect(respostas[0]!.status, `${modo} ${n}`).toBe(modo === "falhar" ? 500 : 403);
        expect(JSON.parse(respostas[0]!.corpo).erro).toBe(modo === "falhar" ? "desvio_do_catalogo_de_erro" : "sem_permissao");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    }
  });

  it("transfer-encoding identity forjado: o corpo vai até o fechamento e a conexão fecha (o pedido seguinte não sai nela)", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const bruto = (await pipeline(await porta(modo), "/c7/h-te-identity")).toString("latin1");
      const { respostas } = lerRespostas(Buffer.from(bruto, "latin1"));
      expect(respostas, modo).toHaveLength(1);
      expect(respostas[0]!.status).toBe(200);
      expect(bruto, modo).not.toContain("HTTP/1.1 404");
    }
    expect(lerDesviosDaGuarda()).toEqual([]);
  });

  it("addTrailers com chunked (red-team) fora do catálogo: sai a resposta do desvio, sem exceção não tratada", async () => {
    const naoTratadas: unknown[] = [];
    const pegar = (e: unknown) => { naoTratadas.push(e); };
    process.on("uncaughtException", pegar);
    try {
      for (const modo of ["falhar", "corrigir"] as const) {
        const { respostas } = lerRespostas(await pipeline(await porta(modo), "/c7/tr-addtrailers-fora"));
        expect(respostas[0]!.status, modo).toBe(modo === "falhar" ? 500 : 403);
        expect(JSON.parse(respostas[0]!.corpo).erro).toBe(modo === "falhar" ? "desvio_do_catalogo_de_erro" : "sem_permissao");
        expect(respostas[1]!.status, "o pedido seguinte no socket").toBe(404);
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    } finally {
      process.off("uncaughtException", pegar);
    }
    expect(naoTratadas).toEqual([]);
  });

  it.each(PROVISORIOS_COMO_FINAL)(
    "%s: o status 1xx como resposta final sai 500, e o pedido seguinte do socket recebe a resposta dele", async (n) => {
      for (const modo of ["falhar", "corrigir"] as const) {
        const { respostas, resto } = lerRespostas(await pipeline(await porta(modo), `/c7/${n}`));
        expect(respostas.map((x) => x.status), `${modo} ${n}`).toEqual([500, 404]);
        expect(JSON.parse(respostas[0]!.corpo).erro).toBe(doDesvio(modo));
        expect(resto).toBe("");
        expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
      }
    });

  it("HEAD com code(102): sai a cabeça 500, sem nenhuma linha 1xx", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const bruto = (await pipeline(await porta(modo), "/c7/g-102", "HEAD")).toString("latin1");
      expect(bruto.startsWith("HTTP/1.1 500 "), modo).toBe(true);
      expect(bruto).not.toMatch(/HTTP\/1\.1 1\d\d /);
      expect(bruto).not.toContain("inventado_c7");
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("101 escrito por baixo de writeHead (_writeRaw): a porta troca a resposta por 500 e fecha a conexão", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const bruto = (await pipeline(await porta(modo), "/c7/g-101-writeraw")).toString("latin1");
      const { respostas } = lerRespostas(Buffer.from(bruto, "latin1"));
      expect(respostas.map((x) => x.status), modo).toEqual([500]);
      expect(JSON.parse(respostas[0]!.corpo).erro).toBe(doDesvio(modo));
      expect(bruto).not.toContain("101 Switching");
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("a resposta que termina só com a cabeça provisória (sem a final) fecha a conexão: o pedido seguinte não é lido como o dela", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const bruto = (await pipeline(await porta(modo), "/c7/g-102-so-provisoria")).toString("latin1");
      expect(lerRespostas(Buffer.from(bruto, "latin1")).respostas.map((x) => x.status), modo).toEqual([102]);
      expect(bruto, modo).not.toContain("HTTP/1.1 404");
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });

  it("controles: 102 de verdade antes do 403 do catálogo, Buffer com content-length errado (o Fastify corrige), 204, 304, Early Hints com CRLF e flushHeaders com 401", async () => {
    for (const modo of ["falhar", "corrigir"] as const) {
      const p = await porta(modo);
      const final = lerRespostas(await pipeline(p, "/c7/g-102-e-final")).respostas;
      expect(final.map((x) => x.status), modo).toEqual([102, 403, 404]);
      expect(JSON.parse(final[1]!.corpo)).toEqual({ erro: "sem_permissao", mensagem: "x" });
      const buf = lerRespostas(await pipeline(p, "/c7/d-buffer")).respostas;
      expect(buf.map((x) => x.status)).toEqual([200, 404]);
      expect(forjadas(buf)).toEqual([]);
      for (const n of ["j-204", "k-304"]) {
        expect(lerRespostas(await pipeline(p, `/c7/${n}`)).respostas.map((x) => x.status), n).toEqual([n === "j-204" ? 204 : 304, 404]);
      }
      const cedo = lerRespostas(await pipeline(p, "/c7/f-early")).respostas;
      expect(cedo.map((x) => x.status)).toEqual([500, 404]);
      expect(forjadas(cedo)).toEqual([]);
      expect(lerDesviosDaGuarda()).toEqual([]);
      const flush = lerRespostas(await pipeline(p, "/c7/flush-401-publico")).respostas;
      expect(flush[0]!.status).toBe(modo === "falhar" ? 500 : 401);
      expect(forjadas(flush)).toEqual([]);
      expect(lerDesviosDaGuarda()).toHaveLength(modo === "falhar" ? 1 : 0);
    }
  });
});
