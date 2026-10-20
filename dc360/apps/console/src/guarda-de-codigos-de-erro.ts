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
 * envolvidos num `onRequest` instalado antes de tudo, e a linha de status nos
 * bytes que saem por `_writeRaw` e `_flushOutput`), e o que ela não vê está
 * escrito no módulo da API: escrita no socket, o método do protótipo chamado por
 * fora da instância, a moldura do corpo depois de uma cabeça que passou, e
 * código que troque as primitivas dela antes da carga ou o próprio Node.
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
const indiceDe = String.prototype.indexOf;
const fatiar = String.prototype.slice;
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

/**
 * A LINHA DE STATUS DE VERDADE (correção 4b, revisão de `05ab42d`): o começo dos
 * bytes de uma resposta, `HTTP/1.1 403 ...`. Status de três dígitos seguido de
 * espaço ou do fim da linha.
 */
const LINHA_DE_STATUS = /^HTTP\/\d\.\d (\d{3})(?: |\r\n)/;
/** Quanto do começo dos bytes a porta lê para achar as cabeças: a de Node cabe com folga. */
const TETO_DA_CABECA = 16 * 1024;

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
  type Interna = { _writeRaw: (...a: unknown[]) => unknown; _flushOutput: (...a: unknown[]) => unknown;
    outputData: Array<{ data: unknown; encoding?: unknown }>; finished: boolean; _last: boolean };
  const interna = raw as unknown as Interna;
  const writeRawOriginal = interna._writeRaw;
  const flushOutputOriginal = interna._flushOutput;
  /** O status que a própria guarda conferiu e mandou escrever (401 ou 403), ou nenhum. */
  let liberado = 0;
  /** Ainda não saiu a cabeça final (só as provisórias 1xx, se alguma). */
  let cabecaPendente = true;
  /** A porta trocou a resposta: daqui em diante, nenhum byte da rota sai. */
  let bloqueado = false;
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

  /** Registra o desvio (log, e a lista do modo "falhar") e devolve o que sai no lugar. */
  function registrarDesvio(status: 401 | 403, erroVisto: string | null, motivo: string): { statusFinal: number; novo: string } {
    const desvio: Desvio = {
      metodo: req.method,
      rota: req.routeOptions?.url ?? "(sem rota)",
      status,
      erroVisto: codigoParaRegistro(erroVisto),
      motivo,
    };
    log.error({ desvioDoCatalogo: desvio }, "resposta de acesso fora do catálogo de códigos de erro");
    if (opcoes.modo === "falhar") {
      desviosPendentes[desviosPendentes.length] = desvio;
      return {
        statusFinal: 500,
        novo: textoJson([
          ["erro", "desvio_do_catalogo_de_erro"],
          ["mensagem", `${desvio.metodo} ${desvio.rota} respondeu ${desvio.status} fora do catálogo: ${desvio.motivo}`
            + (desvio.erroVisto ? ` (${desvio.erroVisto})` : "")],
        ]),
      };
    }
    const g = opcoes.generico[status];
    return { statusFinal: status, novo: textoJson([["erro", g.erro], ["mensagem", g.mensagem]]) };
  }

  /*
    A PORTA DOS BYTES (correção 4b). `writeHead`, `write` e `end` são o caminho
    público; por baixo deles, o Node monta a cabeça em `_storeHeader` (que grava
    `_header`) e TODO byte da resposta sai por `_writeRaw` ou `_flushOutput` desta
    instância. A revisão de `05ab42d` escreveu a linha de status por fora dos
    três (`_storeHeader("HTTP/1.1 403 ...")`, `_header` reescrito depois de
    `writeHead(200)`, `_writeRaw` com a cabeça pronta) e saiu 403 com código
    inventado. Aqui se lê a linha de status nos BYTES que vão para o socket,
    antes de saírem: cabeça provisória 1xx passa e a seguinte é lida; a cabeça
    final com 401 ou 403 que a guarda não conferiu, ou bytes que não começam
    com uma linha de status, trocam a resposta inteira pela do desvio, e o resto
    do que a rota escrever é descartado (sai vazio, para os retornos e a conta
    de bytes do Node seguirem certos). Byte escrito por `_writeRaw` depois do
    fim da resposta também é descartado: seria lido como a resposta seguinte da
    conexão.
  */
  const paraBuffer = (dado: unknown, codificacao: unknown): Buffer =>
    typeof dado === "string"
      ? bufferDe(dado, (typeof codificacao === "string" && codificacao ? codificacao : "utf8") as BufferEncoding)
      : bufferDe(dado as Uint8Array);

  /** Lê as cabeças no começo de um pedaço: `null` = continua pendente; número = status final; "ilegivel". */
  function lerCabecas(dado: unknown, codificacao: unknown): number | "ilegivel" | null {
    let texto: string;
    try {
      const b = paraBuffer(dado, codificacao);
      texto = aplicar(bufferParaTexto, b, ["latin1", 0, b.length < TETO_DA_CABECA ? b.length : TETO_DA_CABECA]) as string;
    } catch {
      return "ilegivel";
    }
    for (;;) {
      if (texto.length === 0) return null;
      const m = casa(LINHA_DE_STATUS, texto);
      if (m === null) return "ilegivel";
      const s = +m[1]!;
      if (s >= 100 && s <= 199 && s !== 101) {
        const fim = aplicar(indiceDe, texto, ["\r\n\r\n"]) as number;
        if (fim < 0) return "ilegivel";
        texto = aplicar(fatiar, texto, [fim + 4]) as string;
        continue;
      }
      return s;
    }
  }

  /**
   * Lê, na ordem em que vão sair, os pedaços ainda pendentes de cabeça. Devolve o
   * que faz trocar a resposta (o status final que a guarda não conferiu, ou
   * "ilegivel"), ou `null` para deixar sair.
   */
  function examinar(pedacos: ReadonlyArray<{ data: unknown; encoding?: unknown }>): number | "ilegivel" | null {
    for (let i = 0; i < pedacos.length && cabecaPendente; i += 1) {
      const visto = lerCabecas(pedacos[i]!.data, pedacos[i]!.encoding);
      if (visto === null) continue;
      cabecaPendente = false;
      if (visto === "ilegivel") return visto;
      if (!ehHead && ehAcesso(visto) && visto !== liberado) return visto;
    }
    return null;
  }

  /** A resposta inteira do desvio, já em bytes: cabeça e corpo. */
  function substituta(visto: number | "ilegivel"): Buffer {
    const status: 401 | 403 = visto === 401 ? 401 : 403;
    const { statusFinal, novo } = registrarDesvio(status, null, visto === "ilegivel"
      ? "bytes da resposta que não começam com uma linha de status"
      : `linha de status ${visto} escrita por fora da guarda`);
    return bufferDe(`HTTP/1.1 ${statusFinal} ${FRASE_DO_STATUS[statusFinal]!}\r\n`
      + "content-type: application/json; charset=utf-8\r\n"
      + `content-length: ${tamanhoEmBytes(novo)}\r\nconnection: close\r\n\r\n${novo}`, "utf8");
  }

  /** A substituta que ficou na fila do Node (socket ainda sem ligação): só ela sai dali. */
  let substitutaNaFila: Buffer | null = null;
  /** Esvazia a fila do Node, menos a substituta. Os itens ficam (vazios) para a conta de bytes e os retornos. */
  const esvaziarFila = () => {
    const fila = interna.outputData;
    for (let i = 0; i < fila.length; i += 1) if (fila[i]!.data !== substitutaNaFila) fila[i]!.data = "";
  };
  /** Troca a resposta: a substituta entra no primeiro pedaço que vai sair, e o resto sai vazio. */
  function trocar(visto: number | "ilegivel"): unknown {
    bloqueado = true;
    // A conexão fecha depois da substituta: o que a rota montou por baixo (moldura de corpo,
    // cabeçalho de conexão) não fica valendo para o pedido seguinte do mesmo socket.
    interna._last = true;
    const nova = substituta(visto);
    const fila = interna.outputData;
    if (fila.length > 0) {
      substitutaNaFila = nova;
      fila[0]!.data = nova;
      esvaziarFila();
      return "";
    }
    return nova;
  }

  function _writeRaw(this: ServerResponse, dado: unknown, ...resto: unknown[]) {
    if (!bloqueado && interna.finished) {
      // Depois do fim, o Node não escreve mais nada desta resposta: isto seria lido como a próxima.
      if (!ehHead) registrarDesvio(403, null, "bytes escritos na resposta depois do fim dela");
      bloqueado = true;
    }
    if (bloqueado) {
      esvaziarFila();
      return aplicar(writeRawOriginal, raw, ["", ...resto]);
    }
    if (cabecaPendente) {
      const fila = interna.outputData;
      const pedacos: Array<{ data: unknown; encoding?: unknown }> = [];
      for (let i = 0; i < fila.length; i += 1) pedacos[pedacos.length] = fila[i]!;
      pedacos[pedacos.length] = { data: dado, encoding: typeof resto[0] === "string" ? resto[0] : undefined };
      const visto = examinar(pedacos);
      if (visto !== null) return aplicar(writeRawOriginal, raw, [trocar(visto), ...resto]);
    }
    return aplicar(writeRawOriginal, raw, [dado, ...resto]);
  }

  function _flushOutput(this: ServerResponse, ...args: unknown[]) {
    if (bloqueado) esvaziarFila();
    else if (cabecaPendente && interna.outputData.length > 0) {
      const visto = examinar(interna.outputData);
      if (visto !== null) trocar(visto);
    }
    return aplicar(flushOutputOriginal, raw, args);
  }

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
      liberado = statusSegurado;
      const cabeca: unknown[] = [statusSegurado];
      if (mensagemDeStatus !== undefined) cabeca[cabeca.length] = mensagemDeStatus;
      if (cabecalhosSegurados !== undefined) cabeca[cabeca.length] = cabecalhosSegurados;
      aplicar(writeHeadOriginal, raw, cabeca);
      return fimComCb(corpoOriginal);
    }
    const { statusFinal, novo } = registrarDesvio(statusSegurado as 401 | 403, achado.erroVisto, achado.motivo);
    liberado = statusFinal;
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
  definirPropriedade(raw, "_writeRaw", { value: _writeRaw, writable: false, configurable: false, enumerable: false });
  definirPropriedade(raw, "_flushOutput", { value: _flushOutput, writable: false, configurable: false, enumerable: false });
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
