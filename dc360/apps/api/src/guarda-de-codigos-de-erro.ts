import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from "fastify";
import type { ServerResponse } from "node:http";
import {
  CODIGOS_DA_ENTRADA, CODIGOS_DE_ERRO_DE_ACESSO, LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO,
} from "@dc360/shared";

/**
 * A GUARDA EM TEMPO DE EXECUÇÃO das respostas de acesso (V2-F00-E05, correção 3).
 *
 * O PROBLEMA: o catálogo de códigos de erro de acesso
 * (`packages/shared/src/codigos-de-erro.ts`) era garantido por uma varredura do
 * código-fonte, e uma varredura estática nunca fecha a classe: a revisão
 * independente plantou dezesseis formas de responder 403 com código fora do
 * catálogo que o texto não mostrava. A primeira versão desta guarda era um
 * `onSend`, e a revisão seguinte passou por ele de três jeitos: um `onRoute` do
 * próprio plugin acrescentando um `onSend` DEPOIS dela, um `onSend` de contexto
 * trocando o 404 do `setNotFoundHandler` do plugin por 403, e um `onSend` que
 * lança duas vezes, o que faz o Fastify escrever a resposta de erro direto na
 * resposta do Node, sem passar por gancho nenhum.
 *
 * O QUE ISTO FAZ AGORA: confere a resposta no ÚLTIMO ponto em que ela ainda é
 * do processo, a resposta do Node (`ServerResponse`). Um `onRequest` instalado
 * logo depois de `Fastify()`, antes de qualquer plugin e rota, troca, NESTA
 * resposta, `writeHead`, `write` e `end` por versões que, quando o status é 401
 * ou 403, seguram o cabeçalho e o corpo até o `end`, conferem o corpo inteiro e
 * só então escrevem. Os três substitutos são propriedades não configuráveis e
 * não graváveis da própria resposta: nem `delete` nem atribuição os desfazem. Todo
 * caminho do Fastify termina nesses três métodos (o `send`, os ganchos, o
 * tratador de erro, o 404, o tratador de reserva que escreve sozinho, `hijack` e
 * `raw`), e por isso a guarda vê todos.
 *
 * A REGRA: toda resposta 401 ou 403 (fora HEAD, que o HTTP manda sem corpo) tem
 * de ter corpo JSON com UMA chave `erro` (chave repetida é recusada: o leitor do
 * cliente pode ficar com a primeira) cujo valor é um código do catálogo ou da
 * lista da entrada, com o status que o catálogo dá a ele. Fora disso:
 *
 *   - em TESTE (`modo: "falhar"`), a resposta vira 500
 *     `desvio_do_catalogo_de_erro` e o desvio fica registrado; o arquivo de
 *     apoio `test/guarda-falha-alto.ts` reprova o caso que passou por ali (e o
 *     arquivo, se o desvio saiu num `afterAll`);
 *   - fora de teste (`modo: "corrigir"`), a resposta sai com o código genérico
 *     do catálogo para o status (401 `nao_autenticado`, 403 `sem_permissao`), e
 *     o desvio vai para o log com o método, a rota (o molde, sem a barra de
 *     endereço), o status e o código visto SÓ se ele tiver a forma de um código
 *     (`^[a-z_]{1,64}$`); qualquer outra coisa (que pode ser e-mail, CPF ou um
 *     texto enorme) vira um marcador.
 *
 * Corpo de 401 ou 403 maior que 64 KiB é desvio: a guarda não guarda mais que
 * isso na memória.
 *
 * O QUE ELA NÃO VÊ, dito sem folga:
 *
 *   - escrita no SOCKET da requisição (`req.socket.end("HTTP/1.1 403 ...")`),
 *     que não passa pela resposta do Node; a varredura do fonte proíbe
 *     `.socket` e `.connection`;
 *   - chamar o método do protótipo por fora da instância
 *     (`ServerResponse.prototype.end` com `.call`, `.apply` ou `Reflect`); a
 *     varredura proíbe `.call`, `.apply`, `.bind` e `Reflect`;
 *   - código no mesmo processo que troque, ANTES de este módulo carregar, as
 *     primitivas que ele usa para DECIDIR. Ele as guarda na carga
 *     (`JSON.parse`, `Reflect.apply`, `Object.defineProperty`, `Object.keys`,
 *     `hasOwnProperty`, `RegExp.exec`, `Array.isArray`, `Buffer.from`,
 *     `Buffer.concat`, `Buffer.byteLength`, `Buffer.toString`,
 *     `String.charCodeAt`, `String.fromCharCode`, `String.toLowerCase`,
 *     `process.nextTick`) e, no caminho da decisão, só chama essas cópias (sem
 *     `includes`, sem `JSON.stringify`, sem iterador de array), então trocar os
 *     globais DEPOIS não o engana; o teste troca `JSON.stringify`, `JSON.parse`,
 *     `Array.prototype.includes` e `hasOwnProperty` com o servidor de pé e
 *     confere. O que roda antes da carga, ou troca o próprio Node (o protótipo
 *     do `ServerResponse`, `removeHeader`) ou o registrador de log, sim.
 */

export type ModoDaGuarda = "falhar" | "corrigir";

/** Código -> status que ele pode ter numa resposta de acesso. */
export type ContratoDeAcesso = Readonly<Record<string, readonly number[]>>;

export type Desvio = {
  metodo: string;
  rota: string;
  status: number;
  /** O `erro` que tentou sair, só quando tem a forma de um código; senão, um marcador. */
  erroVisto: string | null;
  motivo: string;
};

/** O contrato da API: os dez códigos do catálogo com o status de cada um, mais os da entrada. */
export const CONTRATO_DE_ACESSO_DA_API: ContratoDeAcesso = Object.freeze({
  ...Object.fromEntries(LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO.map((c) => [
    c, Object.freeze(c === "acesso_suspenso" ? [403, 503] : [CODIGOS_DE_ERRO_DE_ACESSO[c].status]),
  ])),
  ...Object.fromEntries(Object.entries(CODIGOS_DA_ENTRADA).map(([c, v]) => [c, Object.freeze([v.status])])),
});

/** O que sai no lugar do desvio, fora de teste: o código genérico do catálogo para o status. */
export const GENERICO_DA_API: Readonly<Record<401 | 403, { erro: string; mensagem: string }>> = Object.freeze({
  401: Object.freeze({ erro: "nao_autenticado", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.nao_autenticado.mensagem }),
  403: Object.freeze({ erro: "sem_permissao", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.sem_permissao.mensagem }),
});

// ---- Primitivas guardadas na carga: trocar o global depois não engana a guarda. ----
const aplicar = Reflect.apply;
const analisarJson: (texto: string) => unknown = JSON.parse;
const definirPropriedade = Object.defineProperty;
const temPropria = Object.prototype.hasOwnProperty;
const executarRegex = RegExp.prototype.exec;
const bufferDe = Buffer.from;
const juntarBuffers = Buffer.concat;
const tamanhoEmBytes = Buffer.byteLength;
const bufferParaTexto = Buffer.prototype.toString;
const codigoDoCaractere = String.prototype.charCodeAt;
const caractereDoCodigo = String.fromCharCode;
const ehArray = Array.isArray;
const chavesDe = Object.keys;
const paraMinusculas = String.prototype.toLowerCase;
const proximoTique = process.nextTick;
const HEX = "0123456789abcdef";
const TETO_DO_CORPO = 64 * 1024;
/** Toda chave de objeto num texto JSON válido: uma cadeia seguida de `:`. */
const CHAVE_JSON = /"((?:[^"\\]|\\.)*)"\s*:/g;
const FORMA_DE_CODIGO = /^[a-z_]{1,64}$/;

const tem = (o: object, k: string): boolean => aplicar(temPropria, o, [k]) as boolean;
const casa = (re: RegExp, s: string): RegExpExecArray | null => aplicar(executarRegex, re, [s]) as RegExpExecArray | null;

/** Quantas chaves do texto JSON, em qualquer profundidade, valem `erro` (com escape ou sem). */
function chavesErro(texto: string): number {
  const re = CHAVE_JSON;
  re.lastIndex = 0;
  let n = 0;
  for (let m = casa(re, texto); m !== null; m = casa(re, texto)) {
    let chave: unknown;
    try { chave = analisarJson(`"${m[1]}"`); } catch { chave = null; }
    if (chave === "erro") n += 1;
  }
  return n;
}

/**
 * Confere UM corpo de resposta de acesso, já em texto. `null` quando está no
 * contrato; o motivo e o código visto quando não está.
 */
export function conferirCorpoDeAcesso(
  status: number, texto: string | null, contrato: ContratoDeAcesso,
): { motivo: string; erroVisto: string | null } | null {
  if (texto === null) return { motivo: "corpo maior que o teto da guarda", erroVisto: null };
  if (texto.length === 0) return { motivo: "resposta sem corpo", erroVisto: null };
  let corpo: unknown;
  try {
    corpo = analisarJson(texto);
  } catch {
    return { motivo: "corpo que não é JSON", erroVisto: null };
  }
  if (typeof corpo !== "object" || corpo === null || ehArray(corpo)) {
    return { motivo: "corpo JSON que não é objeto", erroVisto: null };
  }
  const erro = tem(corpo, "erro") ? (corpo as { erro?: unknown }).erro : undefined;
  if (typeof erro !== "string") return { motivo: "corpo sem `erro` em texto", erroVisto: null };
  if (chavesErro(texto) !== 1) return { motivo: "chave `erro` repetida no corpo", erroVisto: erro };
  if (!tem(contrato, erro)) return { motivo: "código fora do catálogo", erroVisto: erro };
  const permitidos = contrato[erro]!;
  let ok = false;
  for (let i = 0; i < permitidos.length; i += 1) if (permitidos[i] === status) ok = true;
  if (!ok) return { motivo: `código do catálogo com status ${status}, fora do que o catálogo diz`, erroVisto: erro };
  return null;
}

/** O código visto, como vai para o log e para a mensagem: só se tiver a forma de um código. */
function codigoParaRegistro(visto: string | null): string | null {
  if (visto === null) return null;
  return casa(FORMA_DE_CODIGO, visto) !== null ? visto : "[fora da forma de um código, não registrado]";
}

/** Texto JSON de um objeto de campos de texto, sem `JSON.stringify` nem `replace`. */
function textoJson(campos: ReadonlyArray<readonly [string, string]>): string {
  const aspas = (s: string) => {
    let saida = "\"";
    for (let i = 0; i < s.length; i += 1) {
      const c = aplicar(codigoDoCaractere, s, [i]) as number;
      if (c === 0x22) saida += "\\\"";
      else if (c === 0x5c) saida += "\\\\";
      else if (c < 0x20 || c === 0x2028 || c === 0x2029) {
        saida += `\\u${HEX[(c >> 12) & 15]}${HEX[(c >> 8) & 15]}${HEX[(c >> 4) & 15]}${HEX[c & 15]}`;
      }
      else saida += caractereDoCodigo(c);
    }
    return `${saida}"`;
  };
  let saida = "{";
  for (let i = 0; i < campos.length; i += 1) saida += `${i ? "," : ""}${aspas(campos[i]![0])}:${aspas(campos[i]![1])}`;
  return `${saida}}`;
}

/** Desvios do modo "falhar" ainda não lidos. O apoio de teste lê e esvazia. */
const desviosPendentes: Desvio[] = [];

/** Devolve e esvazia os desvios registrados no modo "falhar". */
export function lerDesviosDaGuarda(): Desvio[] {
  return desviosPendentes.splice(0);
}

export type OpcoesDaGuarda = {
  modo: ModoDaGuarda;
  contrato: ContratoDeAcesso;
  generico: Readonly<Record<401 | 403, { erro: string; mensagem: string }>>;
};

type Cabecalhos = Record<string, unknown> | unknown[] | undefined;

/** Os cabeçalhos do `writeHead` sem `content-length`, `content-type` e `transfer-encoding`. */
function semCabecalhosDoCorpo(cabecalhos: Cabecalhos): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  const fora = (k: string) => {
    const b = aplicar(paraMinusculas, k, []) as string;
    return b === "content-length" || b === "content-type" || b === "transfer-encoding" || b === "content-encoding";
  };
  if (ehArray(cabecalhos)) {
    for (let i = 0; i + 1 < cabecalhos.length; i += 2) {
      const k = `${cabecalhos[i] as string}`;
      if (!fora(k)) saida[k] = cabecalhos[i + 1];
    }
  } else if (cabecalhos) {
    const ks = chavesDe(cabecalhos);
    for (let i = 0; i < ks.length; i += 1) if (!fora(ks[i]!)) saida[ks[i]!] = cabecalhos[ks[i]!];
  }
  return saida;
}

/** Troca, nesta resposta do Node, `writeHead`, `write` e `end` pelos que conferem 401 e 403. */
function envolverResposta(raw: ServerResponse, req: FastifyRequest, log: FastifyBaseLogger, opcoes: OpcoesDaGuarda): void {
  const writeHeadOriginal = raw.writeHead;
  const writeOriginal = raw.write;
  const endOriginal = raw.end;
  const ehHead = req.method === "HEAD";
  let segurando = false;
  let statusSegurado = 0;
  let cabecalhosSegurados: Cabecalhos;
  let mensagemDeStatus: string | undefined;
  const pedacos: Buffer[] = [];
  let bytes = 0;
  let excedeu = false;

  const comecarASegurar = (status: number) => {
    segurando = true;
    statusSegurado = status;
  };
  const ehAcesso = (s: number) => s === 401 || s === 403;
  const guardar = (pedaco: unknown, codificacao?: unknown) => {
    if (pedaco === undefined || pedaco === null) return;
    const b = typeof pedaco === "string"
      ? bufferDe(pedaco, (typeof codificacao === "string" ? codificacao : "utf8") as BufferEncoding)
      : bufferDe(pedaco as Uint8Array);
    bytes += b.length;
    if (bytes > TETO_DO_CORPO) excedeu = true;
    else pedacos[pedacos.length] = b;
  };

  function writeHead(this: ServerResponse, status: number, ...resto: unknown[]) {
    if (!ehHead && ehAcesso(status) && !raw.headersSent) {
      comecarASegurar(status);
      if (typeof resto[0] === "string") { mensagemDeStatus = resto[0]; cabecalhosSegurados = resto[1] as Cabecalhos; }
      else cabecalhosSegurados = resto[0] as Cabecalhos;
      return raw;
    }
    const todos: unknown[] = [status];
    for (let i = 0; i < resto.length; i += 1) todos[todos.length] = resto[i];
    return aplicar(writeHeadOriginal, raw, todos);
  }

  function write(this: ServerResponse, ...args: unknown[]) {
    if (!segurando && !ehHead && !raw.headersSent && ehAcesso(raw.statusCode)) comecarASegurar(raw.statusCode);
    if (!segurando) return aplicar(writeOriginal, raw, args);
    const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] as () => void : null;
    guardar(args[0], typeof args[1] === "string" ? args[1] : undefined);
    if (cb) aplicar(proximoTique, process, [cb]);
    return true;
  }

  function end(this: ServerResponse, ...args: unknown[]) {
    if (!segurando && !ehHead && !raw.headersSent && ehAcesso(raw.statusCode)) comecarASegurar(raw.statusCode);
    if (!segurando) return aplicar(endOriginal, raw, args);
    segurando = false;
    let cb: unknown;
    if (typeof args[0] === "function") cb = args[0];
    else {
      guardar(args[0], typeof args[1] === "string" ? args[1] : undefined);
      cb = typeof args[1] === "function" ? args[1] : args[2];
    }
    const corpoOriginal = juntarBuffers(pedacos);
    let achado: { motivo: string; erroVisto: string | null } | null;
    try {
      const texto = excedeu ? null : aplicar(bufferParaTexto, corpoOriginal, ["utf8"]) as string;
      achado = conferirCorpoDeAcesso(statusSegurado, texto, opcoes.contrato);
    } catch {
      achado = { motivo: "a conferência do corpo falhou", erroVisto: null };
    }
    const fimComCb = (corpo: Buffer | string) => aplicar(endOriginal, raw, typeof cb === "function" ? [corpo, cb] : [corpo]);
    if (achado === null) {
      const cabeca: unknown[] = [statusSegurado];
      if (mensagemDeStatus !== undefined) cabeca[cabeca.length] = mensagemDeStatus;
      if (cabecalhosSegurados !== undefined) cabeca[cabeca.length] = cabecalhosSegurados;
      aplicar(writeHeadOriginal, raw, cabeca);
      return fimComCb(corpoOriginal);
    }
    const desvio: Desvio = {
      metodo: req.method,
      rota: req.routeOptions?.url ?? "(sem rota)",
      status: statusSegurado,
      erroVisto: codigoParaRegistro(achado.erroVisto),
      motivo: achado.motivo,
    };
    log.error({ desvioDoCatalogo: desvio }, "resposta de acesso fora do catálogo de códigos de erro");
    let statusFinal = statusSegurado;
    let novo: string;
    if (opcoes.modo === "falhar") {
      desviosPendentes[desviosPendentes.length] = desvio;
      statusFinal = 500;
      novo = textoJson([
        ["erro", "desvio_do_catalogo_de_erro"],
        ["mensagem", `${desvio.metodo} ${desvio.rota} respondeu ${desvio.status} fora do catálogo: ${desvio.motivo}`
          + (desvio.erroVisto ? ` (${desvio.erroVisto})` : "")],
      ]);
    } else {
      const g = opcoes.generico[statusSegurado as 401 | 403];
      novo = textoJson([["erro", g.erro], ["mensagem", g.mensagem]]);
    }
    const doCorpo = ["content-length", "content-type", "transfer-encoding", "content-encoding"];
    for (let i = 0; i < doCorpo.length; i += 1) raw.removeHeader(doCorpo[i]!);
    const cabecalhos = semCabecalhosDoCorpo(cabecalhosSegurados);
    cabecalhos["content-type"] = "application/json; charset=utf-8";
    cabecalhos["content-length"] = String(tamanhoEmBytes(novo));
    aplicar(writeHeadOriginal, raw, [statusFinal, cabecalhos]);
    return fimComCb(novo);
  }

  definirPropriedade(raw, "writeHead", { value: writeHead, writable: false, configurable: false, enumerable: false });
  definirPropriedade(raw, "write", { value: write, writable: false, configurable: false, enumerable: false });
  definirPropriedade(raw, "end", { value: end, writable: false, configurable: false, enumerable: false });
}

/**
 * Instala a guarda: um `onRequest` que envolve a resposta do Node de cada
 * pedido. Chamar logo depois de `Fastify()`, antes de qualquer plugin ou rota,
 * para ser o primeiro `onRequest` de todos.
 */
export function instalarGuardaDeAcesso(app: FastifyInstance, opcoes: OpcoesDaGuarda): void {
  app.addHook("onRequest", (req, resposta, feito) => {
    envolverResposta(resposta.raw, req, req.log, opcoes);
    feito();
  });
}
