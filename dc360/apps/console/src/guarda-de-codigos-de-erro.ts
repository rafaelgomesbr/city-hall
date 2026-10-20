import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from "fastify";
import type { ServerResponse } from "node:http";

/**
 * A GUARDA EM TEMPO DE EXECUÇÃO das respostas de acesso do console
 * (V2-F00-E05, correção 3). É a mesma guarda da API
 * (`apps/api/src/guarda-de-codigos-de-erro.ts`, onde o porquê está escrito por
 * inteiro), com o contrato do console: toda resposta 401 ou 403 tem de sair com
 * `erro` da lista abaixo e o status dela. Em teste, o desvio vira 500 e reprova
 * o caso (`test/apoio/guarda-falha-alto.ts`); fora de teste, sai o código
 * genérico do console para o status e o desvio vai para o log com a rota.
 *
 * Cópia, e não importação: o console é outro processo, com outro deploy, e não
 * depende de nenhum pacote do produto em tempo de execução. As duas cópias são
 * presas pelo mesmo tipo de teste, cada uma no seu pacote.
 *
 * Ela confere no nível da resposta do Node (`writeHead`, `write` e `end`
 * envolvidos num `onRequest` instalado antes de tudo), e o que ela não vê está
 * escrito no módulo da API: escrita no socket, o método do protótipo chamado por
 * fora da instância, e código que troque as primitivas dela antes da carga ou o
 * próprio Node.
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

/**
 * O contrato do console: os 401 e 403 dele, e só eles. Era uma lista escrita no
 * teste da varredura (`apps/api/test/codigos-de-erro.test.ts`); veio para cá
 * porque a guarda em tempo de execução precisa dela, e o teste a importa daqui.
 */
export const CONTRATO_DE_ACESSO_DO_CONSOLE: ContratoDeAcesso = Object.freeze({
  sem_sessao: [401], so_o_dono: [403], credenciais_invalidas: [401], desafio_invalido: [401],
  codigo_invalido: [401], senha_incorreta: [401], recuperacao_invalida: [401],
});

/** O que sai no lugar do desvio, fora de teste, com as frases que o próprio console usa. */
export const GENERICO_DO_CONSOLE: Readonly<Record<401 | 403, { erro: string; mensagem: string }>> = Object.freeze({
  401: { erro: "sem_sessao", mensagem: "Entre de novo." },
  403: { erro: "so_o_dono", mensagem: "Só o dono do console faz isto." },
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

/**
 * O status COMO O NODE O ESCREVE na linha de status, e se ele chegou torto
 * (V2-F00-E05, correção 4). O `writeHead` do Node faz `statusCode |= 0` antes de
 * conferir a faixa: `403.5`, `"403"`, `"403.2"`, `"0x193"`, `[403]`,
 * `403 + 2 ** 32` e um objeto cujo `valueOf` dá `401.9` saem TODOS como 401 ou
 * 403 no fio. A guarda decidia pelo valor pedido (`=== 403`), e o status
 * fracionário passava por ela com código fora do catálogo. Agora ela decide pelo
 * mesmo `| 0` que o Node usa, calculado UMA vez (o `valueOf` não roda de novo:
 * o que segue para o Node é o inteiro já calculado), e o status que não é número
 * inteiro de 100 a 599 é `torto`: se o Node o escreveria como 401 ou 403, é desvio
 * mesmo com o corpo no catálogo.
 */
function statusComoONodeEscreve(pedido: unknown): { efetivo: number; torto: boolean } {
  const efetivo = (pedido as number) | 0;
  const torto = typeof pedido !== "number" || efetivo !== pedido || efetivo < 100 || efetivo > 599;
  return { efetivo, torto };
}

/** A frase da linha de status da resposta trocada pela guarda (a da rota pode ser qualquer texto). */
const FRASE_DO_STATUS: Readonly<Record<number, string>> = Object.freeze({
  401: "Unauthorized", 403: "Forbidden", 500: "Internal Server Error",
});

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
  let statusTorto = false;
  let cabecalhosSegurados: Cabecalhos;
  let mensagemDeStatus: string | undefined;
  const pedacos: Buffer[] = [];
  let bytes = 0;
  let excedeu = false;

  const comecarASegurar = (status: number, torto: boolean) => {
    segurando = true;
    statusSegurado = status;
    statusTorto = torto;
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

  function writeHead(this: ServerResponse, status: unknown, ...resto: unknown[]) {
    const { efetivo, torto } = statusComoONodeEscreve(status);
    if (!ehHead && ehAcesso(efetivo) && !raw.headersSent) {
      comecarASegurar(efetivo, torto);
      // Como o Node lê os argumentos: frase em texto e depois os cabeçalhos; sem frase em texto, os
      // cabeçalhos são o terceiro argumento, ou o segundo quando o terceiro falta (`obj ??= reason`).
      if (typeof resto[0] === "string") { mensagemDeStatus = resto[0]; cabecalhosSegurados = resto[1] as Cabecalhos; }
      else cabecalhosSegurados = (resto[1] !== undefined && resto[1] !== null ? resto[1] : resto[0]) as Cabecalhos;
      return raw;
    }
    // O Node recebe o inteiro já calculado: o que ele escreve é o que a guarda conferiu.
    const todos: unknown[] = [efetivo];
    for (let i = 0; i < resto.length; i += 1) todos[todos.length] = resto[i];
    return aplicar(writeHeadOriginal, raw, todos);
  }

  /**
   * O cabeçalho implícito (`write`/`end` sem `writeHead` antes): o Node escreve
   * `this.statusCode`, com o mesmo `| 0`. Status de acesso começa a segurar; o
   * torto que não é de acesso vira o inteiro antes de o Node lê-lo de novo.
   */
  const conferirCabecalhoImplicito = () => {
    if (segurando || ehHead || raw.headersSent) return;
    const { efetivo, torto } = statusComoONodeEscreve(raw.statusCode);
    if (ehAcesso(efetivo)) comecarASegurar(efetivo, torto);
    else if (torto) raw.statusCode = efetivo;
  };

  function write(this: ServerResponse, ...args: unknown[]) {
    conferirCabecalhoImplicito();
    if (!segurando) return aplicar(writeOriginal, raw, args);
    const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] as () => void : null;
    guardar(args[0], typeof args[1] === "string" ? args[1] : undefined);
    if (cb) aplicar(proximoTique, process, [cb]);
    return true;
  }

  function end(this: ServerResponse, ...args: unknown[]) {
    conferirCabecalhoImplicito();
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
      const doCorpo = conferirCorpoDeAcesso(statusSegurado, texto, opcoes.contrato);
      achado = statusTorto
        ? {
          motivo: `status que não é número inteiro de 100 a 599 e que o Node escreve como ${statusSegurado}`,
          erroVisto: doCorpo === null ? null : doCorpo.erroVisto,
        }
        : doCorpo;
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
    aplicar(writeHeadOriginal, raw, [statusFinal, FRASE_DO_STATUS[statusFinal]!, cabecalhos]);
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
