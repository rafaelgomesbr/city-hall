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
 * "401 OU 403" É O STATUS QUE O NODE ESCREVE (correção 4, rodada 6): o
 * `writeHead` do Node faz `statusCode |= 0`, e `403.5`, `"403.2"`, `4294967699`
 * ou um `valueOf` que dá `401.9` saem 401 ou 403 no fio. A guarda decide pelo
 * mesmo `| 0`, passa ao Node o inteiro que ela conferiu, e o status que chegou
 * torto (não é número inteiro de 100 a 599) e vira 401 ou 403 é desvio mesmo
 * com o corpo no catálogo. A frase da linha de status da rota não sai na
 * resposta trocada.
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
 * A PORTA DOS BYTES (correção 4b): além dos três métodos públicos, a guarda
 * envolve `_writeRaw` e `_flushOutput` da mesma resposta, por onde sai todo byte
 * dela, e lê a linha de status nos bytes antes de saírem. A cabeça gravada por
 * baixo de `writeHead` (`_storeHeader`, `_header` reescrito, `_writeRaw` ou a
 * fila `outputData` com a cabeça pronta) que diga 401 ou 403 sem a guarda ter
 * conferido o corpo, ou bytes que não começam com uma linha de status, trocam a
 * resposta inteira pela do desvio, com `connection: close`; o resto do que a
 * rota escrever sai vazio, e byte escrito depois do fim da resposta também.
 *
 * A MOLDURA DO CORPO (correção 6, rodada 7): toda resposta sai com
 * `strictContentLength` ligado, e a guarda conta cada pedaço do corpo (texto,
 * Buffer, fluxo) contra o `content-length` antes de entregá-lo ao Node, que só
 * confere do segundo pedaço em diante; a porta dos bytes conta de novo contra
 * a moldura da cabeça que de fato saiu (`content-length`, ou os pedaços de
 * `chunked` até o terminador). Nenhum byte além do declarado sai; o excesso é
 * desvio, sai só o que cabia e a conexão fecha. `transfer-encoding` que não
 * termina em `chunked`, ou corpo sem moldura, fecha a conexão no fim;
 * `content-length` junto de `transfer-encoding` troca a resposta inteira. O
 * caminho do desvio nunca lança: o trailer sai da resposta trocada, e se o Node
 * recusar até a cabeça da troca, ela vai em bytes prontos e a conexão fecha.
 *
 * O STATUS 1xx COMO RESPOSTA FINAL (correção 7, rodada 7): `reply.code(102)`
 * (ou 100, 101, 103, 199) faz o Node escrever só a linha provisória e dar a
 * resposta por terminada, e o cliente lê a resposta do pedido SEGUINTE da
 * conexão como a deste. `writeHead` ou o cabeçalho implícito com 1xx é desvio,
 * HEAD inclusive, e sai 500 nos dois modos (o do desvio em teste, o interno do
 * serviço fora de teste); o 101 escrito por baixo, que a porta lê como cabeça
 * final, também; e a resposta que termina só com cabeças provisórias (sem a
 * final) fecha a conexão. Os 1xx legítimos (`writeContinue`,
 * `writeProcessing`, `writeEarlyHints`) não passam por `writeHead` e seguem.
 * Quando o `end` do Node lança no meio (o `content-length` estrito), o socket
 * fica arrolhado; a guarda o desarrolha antes de mandar a resposta do desvio.
 *
 * AS EARLY HINTS (correção 7b): o Node 22, o de produção, não confere o valor
 * de `writeEarlyHints`, e CR ou LF nele põe uma cabeça inteira no fio; o Node
 * 24 recusa. A guarda aplica a regra do Node 24 nas duas versões (lança
 * `ERR_INVALID_CHAR` antes de escrever, e a rota sai 500), e a porta dos bytes
 * fica de segunda rede.
 *
 * O QUE ELA NÃO VÊ, dito sem folga:
 *
 *   - escrita direta no SOCKET, que não passa pela resposta do Node:
 *     `req.socket.end("HTTP/1.1 403 ...")`, o mesmo socket por `.connection`
 *     ou `.client` (no pedido ou na resposta), e um ouvinte nos eventos do
 *     servidor HTTP que entregam o socket ou o pedido antes do Fastify
 *     (`app.server.on("connection", (s) => s.end(...))`, `request`, `upgrade`,
 *     `secureConnection`, `clientError`). Contra isso não há garantia em tempo
 *     de execução: só a varredura do fonte, heurística, que reprova esses
 *     nomes, a desestruturação deles e esses ouvintes;
 *   - chamar o método do protótipo por fora da instância
 *     (`ServerResponse.prototype.end` ou `_writeRaw` com `.call`, `.apply` ou
 *     `Reflect`); a varredura proíbe `.call`, `.apply`, `.bind` e `Reflect`;
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
export const GENERICO_DA_API: Readonly<Record<401 | 403 | 500, { erro: string; mensagem: string }>> = Object.freeze({
  401: Object.freeze({ erro: "nao_autenticado", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.nao_autenticado.mensagem }),
  403: Object.freeze({ erro: "sem_permissao", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.sem_permissao.mensagem }),
  // A resposta final 1xx (correção 7): sai o 500 interno da API, sem o código do pedido.
  500: Object.freeze({ erro: "erro_interno", mensagem: "Erro inesperado. Tente de novo." }),
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
const subarray = Buffer.prototype.subarray;
const HEX = "0123456789abcdef";
const TETO_DO_CORPO = 64 * 1024;
/** Toda chave de objeto num texto JSON válido: uma cadeia seguida de `:`. */
const CHAVE_JSON = /"((?:[^"\\]|\\.)*)"\s*:/g;
const FORMA_DE_CODIGO = /^[a-z_]{1,64}$/;
/** Nome de cabeçalho válido (token do HTTP) e valor sem caractere de controle: a regra do Node 24. */
const NOME_DE_CABECALHO = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;
const VALOR_DE_CABECALHO_INVALIDO = /[^\t\x20-\x7e\x80-\xff]/;

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
/** O valor de `content-length`: só dígitos. */
const SO_DIGITOS = /^\d+$/;
/** `transfer-encoding` cuja última codificação é `chunked` (a moldura por pedaços). */
const TERMINA_EM_CHUNKED = /(?:^|,)[ \t]*chunked[ \t]*$/;
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
  /**
   * O que sai no lugar do desvio, fora de teste: o genérico do status (401 ou
   * 403) e, para a resposta final 1xx (correção 7), o 500 interno do serviço.
   */
  generico: Readonly<Record<401 | 403 | 500, { erro: string; mensagem: string }>>;
};

type Cabecalhos = Record<string, unknown> | unknown[] | undefined;

/** Os cabeçalhos do `writeHead` sem `content-length`, `content-type` e `transfer-encoding`. */
function semCabecalhosDoCorpo(cabecalhos: Cabecalhos): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  const fora = (k: string) => {
    const b = aplicar(paraMinusculas, k, []) as string;
    return b === "content-length" || b === "content-type" || b === "transfer-encoding" || b === "content-encoding"
      || b === "trailer";
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
  /** O status segurado é 1xx: a resposta final seria só uma cabeça provisória (correção 7). */
  let provisorioComoFinal = false;
  /** A porta já deixou passar cabeça provisória 1xx e ainda não viu a final. */
  let provisoriasVistas = false;
  let cabecalhosSegurados: Cabecalhos;
  let mensagemDeStatus: string | undefined;
  const pedacos: Buffer[] = [];
  let bytes = 0;
  let excedeu = false;

  const comecarASegurar = (status: number, torto: boolean) => {
    segurando = true;
    statusSegurado = status;
    statusTorto = torto;
    provisorioComoFinal = ehProvisorio(status);
  };
  const ehAcesso = (s: number) => s === 401 || s === 403;
  /*
    O STATUS 1xx COMO RESPOSTA FINAL (correção 7, rodada 7, Segurança achado 3).
    `reply.code(102).send(...)` faz o Node escrever SÓ a linha `102` e dar a
    resposta por terminada (1xx não tem corpo). Para o cliente, 1xx é cabeça
    provisória: ele continua esperando a final e lê a resposta do pedido
    SEGUINTE da conexão como a deste (e 101 o faz largar o HTTP). Nenhum 1xx
    legítimo passa por `writeHead`: o Node manda 100, 102 e 103 por
    `writeContinue`, `writeProcessing` e `writeEarlyHints`, direto em
    `_writeRaw`, e o 101 de verdade sai pelo evento `upgrade`, no socket. Então
    `writeHead` com 1xx, ou o cabeçalho implícito com `statusCode` 1xx, é
    desvio: a guarda segura, e no `end` sai 500 no lugar (o do desvio em
    teste, o interno do serviço fora de teste), com HEAD inclusive.
  */
  const ehProvisorio = (s: number) => s >= 100 && s <= 199;
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
  function registrarDesvio(
    status: number, erroVisto: string | null, motivo: string, interno = false,
  ): { statusFinal: number; novo: string } {
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
    if (interno) {
      const g = opcoes.generico[500];
      return { statusFinal: 500, novo: textoJson([["erro", g.erro], ["mensagem", g.mensagem]]) };
    }
    const g = opcoes.generico[status === 401 ? 401 : 403];
    return { statusFinal: status === 401 ? 401 : 403, novo: textoJson([["erro", g.erro], ["mensagem", g.mensagem]]) };
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
  /** Tamanho em bytes de um pedaço, sem copiar Buffer. */
  const tamanhoDe = (dado: unknown, codificacao: unknown): number =>
    typeof dado === "string"
      ? tamanhoEmBytes(dado, (typeof codificacao === "string" && codificacao ? codificacao : "utf8") as BufferEncoding)
      : dado === null || dado === undefined ? 0 : (dado as Uint8Array).byteLength;

  /**
   * Lê as cabeças no começo de um pedaço. `null` = pedaço vazio, continua
   * pendente; `{ visto: "ilegivel" }`; ou o status final com o texto da cabeça
   * final e o byte em que o corpo começa neste pedaço (-1 se a cabeça não
   * termina dentro do que se leu).
   */
  function lerCabecas(dado: unknown, codificacao: unknown):
    | null | { visto: "ilegivel" } | { visto: "provisoria" } | { visto: number; cabeca: string; inicioDoCorpo: number } {
    let texto: string;
    try {
      const b = paraBuffer(dado, codificacao);
      texto = aplicar(bufferParaTexto, b, ["latin1", 0, b.length < TETO_DA_CABECA ? b.length : TETO_DA_CABECA]) as string;
    } catch {
      return { visto: "ilegivel" };
    }
    let deslocamento = 0;
    for (;;) {
      // Só cabeças provisórias (ou nada): a final vem no pedaço seguinte.
      if (texto.length === 0) return deslocamento > 0 ? { visto: "provisoria" } : null;
      const m = casa(LINHA_DE_STATUS, texto);
      if (m === null) return { visto: "ilegivel" };
      const s = +m[1]!;
      const fim = aplicar(indiceDe, texto, ["\r\n\r\n"]) as number;
      if (s >= 100 && s <= 199 && s !== 101) {
        if (fim < 0) return { visto: "ilegivel" };
        texto = aplicar(fatiar, texto, [fim + 4]) as string;
        deslocamento += fim + 4;
        continue;
      }
      return {
        visto: s,
        cabeca: fim < 0 ? texto : aplicar(fatiar, texto, [0, fim]) as string,
        inicioDoCorpo: fim < 0 ? -1 : deslocamento + fim + 4,
      };
    }
  }

  /*
    A MOLDURA DO CORPO (correção 6, rodada 7). Depois da cabeça final, a porta
    conta o corpo contra a moldura que a própria cabeça declarou: com
    `content-length`, nenhum byte além do declarado sai; com `chunked`, os
    pedaços são lidos e nada sai depois do terminador; com `transfer-encoding`
    que não termina em `chunked`, ou sem moldura nenhuma, o corpo vai até o fim
    da conexão, e a conexão fecha. `content-length` repetido com valores
    diferentes, ou junto de `transfer-encoding`, é cabeça ilegível. Excesso é
    desvio: o que passa do limite sai vazio e a conexão fecha, então o cliente
    nunca lê ali uma segunda resposta.
  */
  type Moldura =
    | { tipo: "tamanho"; restante: number }
    | { tipo: "pedacos"; estado: "tamanho" | "extensao" | "lf-tamanho" | "dados" | "cr-dados" | "lf-dados" | "trailer" | "lf-trailer" | "fim";
      restante: number; tamanho: number; linhaVazia: boolean }
    | { tipo: "ate-fechar" };
  let moldura: Moldura = { tipo: "ate-fechar" };
  let excessoRegistrado = false;
  /** A resposta de desvio em bytes prontos (o último recurso do `end`): só ela sai depois de bloqueado. */
  let passaLivre: unknown = null;
  /** O status da cabeça final que passou pela porta (para o registro do excesso). */
  let statusDaCabeca = 0;

  /** A moldura que a cabeça final declara; `null` = cabeça ilegível. */
  function lerMoldura(cabeca: string, status: number): Moldura | null {
    let comprimento: number | null = null;
    let te: string | null = null;
    let i = aplicar(indiceDe, cabeca, ["\r\n"]) as number;
    while (i >= 0) {
      const proximo = aplicar(indiceDe, cabeca, ["\r\n", i + 2]) as number;
      const linha = aplicar(fatiar, cabeca, proximo < 0 ? [i + 2] : [i + 2, proximo]) as string;
      const dois = aplicar(indiceDe, linha, [":"]) as number;
      if (dois > 0) {
        const nome = aplicar(paraMinusculas, aplicar(fatiar, linha, [0, dois]) as string, []) as string;
        let valor = aplicar(fatiar, linha, [dois + 1]) as string;
        while (valor.length > 0 && (aplicar(codigoDoCaractere, valor, [0]) === 0x20 || aplicar(codigoDoCaractere, valor, [0]) === 0x09)) valor = aplicar(fatiar, valor, [1]) as string;
        while (valor.length > 0 && (aplicar(codigoDoCaractere, valor, [valor.length - 1]) === 0x20 || aplicar(codigoDoCaractere, valor, [valor.length - 1]) === 0x09)) valor = aplicar(fatiar, valor, [0, valor.length - 1]) as string;
        if (nome === "content-length") {
          if (casa(SO_DIGITOS, valor) === null) return null;
          const n = +valor;
          if (comprimento !== null && comprimento !== n) return null;
          comprimento = n;
        } else if (nome === "transfer-encoding") {
          te = te === null ? valor : `${te}, ${valor}`;
        }
      }
      i = proximo;
    }
    if (te !== null && comprimento !== null) return null;
    if (ehHead || status === 204 || status === 304) return { tipo: "tamanho", restante: 0 };
    if (te !== null) {
      const t = aplicar(paraMinusculas, te, []) as string;
      if (casa(TERMINA_EM_CHUNKED, t) !== null) {
        return { tipo: "pedacos", estado: "tamanho", restante: 0, tamanho: 0, linhaVazia: true };
      }
      return { tipo: "ate-fechar" };
    }
    if (comprimento !== null) return { tipo: "tamanho", restante: comprimento };
    return { tipo: "ate-fechar" };
  }

  /** Quantos bytes de `b`, a partir de `inicio`, cabem na moldura `chunked`; o resto é excesso. */
  function lerPedacos(m: Extract<Moldura, { tipo: "pedacos" }>, b: Uint8Array, inicio: number): number {
    let i = inicio;
    const hex = (c: number) => (c >= 0x30 && c <= 0x39) ? c - 0x30 : (c >= 0x61 && c <= 0x66) ? c - 0x57 : (c >= 0x41 && c <= 0x46) ? c - 0x37 : -1;
    while (i < b.length) {
      if (m.estado === "fim") return i;
      if (m.estado === "dados") {
        const leva = b.length - i < m.restante ? b.length - i : m.restante;
        i += leva;
        m.restante -= leva;
        if (m.restante === 0) m.estado = "cr-dados";
        continue;
      }
      const c = b[i]!;
      if (m.estado === "tamanho") {
        const v = hex(c);
        if (v >= 0 && m.tamanho < 0x10000000) { m.tamanho = m.tamanho * 16 + v; m.linhaVazia = false; }
        else if (c === 0x3b && !m.linhaVazia) m.estado = "extensao";
        else if (c === 0x0d && !m.linhaVazia) m.estado = "lf-tamanho";
        else return i;
      } else if (m.estado === "extensao") {
        if (c === 0x0d) m.estado = "lf-tamanho";
        else if (c === 0x0a) return i;
      } else if (m.estado === "lf-tamanho") {
        if (c !== 0x0a) return i;
        if (m.tamanho === 0) { m.estado = "trailer"; m.linhaVazia = true; }
        else { m.estado = "dados"; m.restante = m.tamanho; }
      } else if (m.estado === "cr-dados") {
        if (c !== 0x0d) return i;
        m.estado = "lf-dados";
      } else if (m.estado === "lf-dados") {
        if (c !== 0x0a) return i;
        m.estado = "tamanho"; m.tamanho = 0; m.linhaVazia = true;
      } else if (m.estado === "trailer") {
        if (c === 0x0d) m.estado = "lf-trailer";
        else m.linhaVazia = false;
      } else if (m.estado === "lf-trailer") {
        if (c !== 0x0a) return i;
        if (m.linhaVazia) m.estado = "fim";
        else { m.estado = "trailer"; m.linhaVazia = true; }
      }
      i += 1;
    }
    return i;
  }

  /** O corpo passou da moldura: registra (uma vez), fecha a conexão e devolve só o que cabia. */
  function cortar(dado: unknown, codificacao: unknown, cabe: number): unknown {
    interna._last = true;
    if (!excessoRegistrado) {
      excessoRegistrado = true;
      registrarDesvio(statusDaCabeca, null, "corpo além da moldura que a cabeça declarou (content-length ou chunked)");
    }
    if (cabe <= 0) return "";
    const b = paraBuffer(dado, codificacao);
    return aplicar(subarray, b, [0, cabe]);
  }

  /** Confere o corpo de um pedaço, a partir de `inicio`, contra a moldura. */
  function contar(dado: unknown, codificacao: unknown, inicio: number): unknown {
    if (moldura.tipo === "ate-fechar") return dado;
    const total = tamanhoDe(dado, codificacao);
    if (moldura.tipo === "tamanho") {
      const corpo = total - inicio;
      if (corpo <= moldura.restante) { moldura.restante -= corpo; return dado; }
      const cabe = inicio + moldura.restante;
      moldura.restante = 0;
      return cortar(dado, codificacao, cabe);
    }
    const b = typeof dado === "string" ? paraBuffer(dado, codificacao) : dado as Uint8Array;
    const ate = lerPedacos(moldura, b, inicio);
    if (ate >= b.length) return dado;
    return cortar(dado, codificacao, ate);
  }

  /** A resposta inteira do desvio, já em bytes: cabeça e corpo. */
  function substituta(visto: number | "ilegivel"): Buffer {
    const status: 401 | 403 = visto === 401 ? 401 : 403;
    const { statusFinal, novo } = registrarDesvio(status, null, visto === "ilegivel"
      ? "bytes da resposta que não começam com uma linha de status legível (ou moldura de corpo contraditória)"
      : `linha de status ${visto} escrita por fora da guarda`);
    return bytesDaResposta(statusFinal, novo);
  }
  function bytesDaResposta(statusFinal: number, novo: string): Buffer {
    return bufferDe(`HTTP/1.1 ${statusFinal} ${FRASE_DO_STATUS[statusFinal]!}\r\n`
      + "content-type: application/json; charset=utf-8\r\n"
      + `content-length: ${tamanhoEmBytes(novo)}\r\nconnection: close\r\n\r\n${novo}`, "utf8");
  }

  /**
   * O que sai deste pedaço, na ordem em que os pedaços saem: a cabeça é lida
   * (e pode trocar a resposta inteira), o corpo é contado contra a moldura, e
   * depois de trocada a resposta nada da rota sai.
   */
  function processar(dado: unknown, codificacao: unknown): unknown {
    if (bloqueado) return dado === passaLivre ? dado : "";
    if (!cabecaPendente) return contar(dado, codificacao, 0);
    const lido = lerCabecas(dado, codificacao);
    if (lido === null) return dado;
    if (lido.visto === "provisoria") { provisoriasVistas = true; return dado; }
    cabecaPendente = false;
    let visto: number | "ilegivel" = lido.visto;
    let m: Moldura | null = null;
    if (visto !== "ilegivel") {
      m = "cabeca" in lido ? lerMoldura(lido.cabeca, visto) : null;
      if (m === null) visto = "ilegivel";
    }
    if (visto === "ilegivel" || (!ehHead && ehAcesso(visto) && visto !== liberado)) {
      bloqueado = true;
      interna._last = true;
      return substituta(visto);
    }
    if (ehProvisorio(visto)) {
      // Só o 101 chega aqui como final (os outros 1xx a porta lê como provisórios): é desvio (correção 7).
      bloqueado = true;
      interna._last = true;
      const { statusFinal, novo } = registrarDesvio(visto, null,
        `status ${visto} (provisório) escrito por fora da guarda como resposta final`, true);
      return bytesDaResposta(statusFinal, novo);
    }
    moldura = m!;
    statusDaCabeca = visto;
    if (moldura.tipo === "ate-fechar") interna._last = true;
    const inicio = "inicioDoCorpo" in lido ? lido.inicioDoCorpo : -1;
    if (inicio < 0) {
      // A cabeça passa do que a porta lê: sem como contar o corpo, a conexão fecha no fim.
      moldura = { tipo: "ate-fechar" };
      interna._last = true;
      return dado;
    }
    return contar(dado, codificacao, inicio);
  }

  /**
   * A resposta terminou e pela porta só passaram cabeças provisórias 1xx, sem a
   * final (correção 7): o cliente leria a resposta seguinte da conexão como a
   * deste pedido. O que já saiu não volta; a conexão fecha no fim desta
   * resposta e a seguinte não é escrita nela.
   */
  function fecharSeSoProvisorias(): void {
    if (!provisoriasVistas || !cabecaPendente || bloqueado || !interna.finished || interna.outputData.length > 0) return;
    bloqueado = true;
    interna._last = true;
    registrarDesvio(102, null, "resposta terminada só com cabeças provisórias 1xx, sem a cabeça final", true);
  }

  /** O socket ligado a esta resposta, quando o Node escreve direto nele (e não na fila). */
  const ligado = (): boolean => {
    const s = raw.socket as unknown as { destroyed?: boolean; writable?: boolean; _httpMessage?: unknown } | null;
    return !!s && !s.destroyed && s._httpMessage === raw && !!s.writable;
  };

  function _flushOutput(this: ServerResponse, ...args: unknown[]) {
    const fila = interna.outputData;
    for (let i = 0; i < fila.length; i += 1) {
      const item = fila[i]!;
      if (item.data !== null) item.data = processar(item.data, item.encoding);
    }
    const r = aplicar(flushOutputOriginal, raw, args);
    fecharSeSoProvisorias();
    return r;
  }

  function _writeRaw(this: ServerResponse, dado: unknown, ...resto: unknown[]) {
    if (!bloqueado && interna.finished) {
      // Depois do fim, o Node não escreve mais nada desta resposta: isto seria lido como a próxima.
      if (!ehHead) registrarDesvio(403, null, "bytes escritos na resposta depois do fim dela");
      bloqueado = true;
    }
    // Ligado ao socket, o Node esvaziaria a fila e escreveria direto: a fila passa antes pela porta,
    // na ordem; desligado, o pedaço entra na fila e passa pela porta quando ela for esvaziada.
    if (!ligado()) return aplicar(writeRawOriginal, raw, [dado, ...resto]);
    if (interna.outputData.length > 0) aplicar(_flushOutput, raw, [raw.socket]);
    const codificacao = typeof resto[0] === "string" ? resto[0] : undefined;
    return aplicar(writeRawOriginal, raw, [processar(dado, codificacao), ...resto]);
  }

  function writeHead(this: ServerResponse, status: unknown, ...resto: unknown[]) {
    const { efetivo, torto } = statusComoONodeEscreve(status);
    // Já segurando, o `_implicitHeader` do Node (pelo `flushHeaders`, que relê `statusCode`) chama de
    // novo sem cabeçalhos: a cabeça segurada continua valendo.
    if (segurando && resto.length === 0 && efetivo === statusSegurado) return raw;
    if (((!ehHead && ehAcesso(efetivo)) || ehProvisorio(efetivo)) && !raw.headersSent) {
      comecarASegurar(efetivo, torto);
      // O `statusCode` que a guarda decidiu: quem o reler (o `flushHeaders`) lê este (correção 6).
      raw.statusCode = efetivo;
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
    if (segurando || raw.headersSent) return;
    const { efetivo, torto } = statusComoONodeEscreve(raw.statusCode);
    if (ehProvisorio(efetivo) || (!ehHead && ehAcesso(efetivo))) comecarASegurar(efetivo, torto);
    else if (torto) raw.statusCode = efetivo;
  };

  /*
    O CONTENT-LENGTH ESTRITO (correção 6, rodada 7): `strictContentLength` faz o
    Node recusar corpo diferente do `content-length` declarado. Ele recusa
    LANÇANDO, e quem escreve pode ser o `pipe` de um fluxo (o `send` de stream do
    Fastify), onde a exceção subiria como não tratada. Aqui ela é pega: o
    excesso é desvio, sai só o que cabia no declarado, a conexão fecha, e o resto
    do corpo é descartado; o corpo menor que o declarado derruba a conexão (o
    cliente não fica esperando bytes que não vêm).
  */
  let escritosNoCorpo = 0;
  let corpoEstourou = false;
  const ehDescompasso = (e: unknown) =>
    typeof e === "object" && e !== null && (e as { code?: unknown }).code === "ERR_HTTP_CONTENT_LENGTH_MISMATCH";
  /**
   * O tamanho de corpo que a resposta declarou, ou `null` quando não há limite a
   * conferir (HEAD, 1xx, 204, 304, `transfer-encoding`, sem `content-length`).
   * O Node só confere a partir do SEGUNDO pedaço (o `content-length` dele é lido
   * quando a cabeça é montada, depois da conferência do primeiro), então a guarda
   * confere antes de cada pedaço, e o `strictContentLength` fica de segunda rede.
   */
  const limiteDoCorpo = (): number | null => {
    if (ehHead) return null;
    const s = raw.statusCode;
    if (s === 204 || s === 304 || (s >= 100 && s <= 199)) return null;
    if (raw.hasHeader("transfer-encoding")) return null;
    const v = raw.headersSent
      ? (raw as unknown as { _contentLength?: unknown })._contentLength
      : raw.getHeader("content-length");
    if (typeof v === "number") return v;
    if (typeof v === "string" && casa(SO_DIGITOS, v) !== null) return +v;
    return null;
  };
  const declarado = (): number => limiteDoCorpo() ?? 0;
  /** O pedaço não coube: sai o que cabia, registra, fecha a conexão e descarta o resto. */
  function estourar(dado: unknown, codificacao: unknown): void {
    corpoEstourou = true;
    interna._last = true;
    if (!excessoRegistrado) {
      excessoRegistrado = true;
      registrarDesvio(raw.statusCode, null, "corpo maior que o content-length declarado");
    }
    const cabe = declarado() - escritosNoCorpo;
    if (cabe > 0) {
      try {
        aplicar(writeOriginal, raw, [aplicar(subarray, paraBuffer(dado, codificacao), [0, cabe])]);
        escritosNoCorpo += cabe;
      } catch { /* o que não coube não sai */ }
    }
  }
  function derrubar(): void {
    try { raw.destroy(); } catch { /* a conexão já caiu */ }
  }
  /**
   * O `end` do Node arrolha o socket (`cork`) antes de escrever o pedaço e só o
   * desarrolha no fim; quando ele LANÇA no meio (o `content-length` estrito que
   * não bate), o socket fica arrolhado e nada mais sai dele (correção 7: o 403
   * do catálogo com `content-length` errado deixava o cliente sem resposta até
   * o tempo esgotar). Antes de a guarda escrever a resposta do desvio, desarrolha.
   */
  function desarrolhar(): void {
    try {
      const s = raw.socket as unknown as { writableCorked?: number; uncork?: () => void } | null;
      for (let i = 0; s && i < 16 && (s.writableCorked ?? 0) > 0; i += 1) s.uncork!();
    } catch { /* sem socket, nada a desarrolhar */ }
  }

  function write(this: ServerResponse, ...args: unknown[]) {
    conferirCabecalhoImplicito();
    if (!segurando) {
      const cbw = typeof args[args.length - 1] === "function" ? args[args.length - 1] as () => void : null;
      if (corpoEstourou) { if (cbw) aplicar(proximoTique, process, [cbw]); return true; }
      const codificacao = typeof args[1] === "string" ? args[1] : undefined;
      const limite = limiteDoCorpo();
      if (limite !== null && escritosNoCorpo + tamanhoDe(args[0], codificacao) > limite) {
        estourar(args[0], codificacao);
        if (cbw) aplicar(proximoTique, process, [cbw]);
        return true;
      }
      try {
        const r = aplicar(writeOriginal, raw, args);
        escritosNoCorpo += tamanhoDe(args[0], codificacao);
        return r;
      } catch (e) {
        if (!ehDescompasso(e)) throw e;
        estourar(args[0], codificacao);
        if (cbw) aplicar(proximoTique, process, [cbw]);
        return true;
      }
    }
    const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] as () => void : null;
    guardar(args[0], typeof args[1] === "string" ? args[1] : undefined);
    if (cb) aplicar(proximoTique, process, [cb]);
    return true;
  }

  function end(this: ServerResponse, ...args: unknown[]) {
    conferirCabecalhoImplicito();
    if (!segurando) {
      const temDado = args.length > 0 && typeof args[0] !== "function" && args[0] !== null && args[0] !== undefined;
      const codificacao = typeof args[1] === "string" ? args[1] : undefined;
      const resto: unknown[] = [];
      for (let i = temDado ? 1 : 0; i < args.length; i += 1) if (typeof args[i] === "function") resto[resto.length] = args[i];
      if (corpoEstourou) {
        try { return aplicar(endOriginal, raw, resto); } catch { derrubar(); return raw; }
      }
      const limite = limiteDoCorpo();
      if (temDado && limite !== null && escritosNoCorpo + tamanhoDe(args[0], codificacao) > limite) {
        estourar(args[0], codificacao);
        try { return aplicar(endOriginal, raw, resto); } catch { derrubar(); return raw; }
      }
      try {
        const r = aplicar(endOriginal, raw, args);
        fecharSeSoProvisorias();
        return r;
      } catch (e) {
        if (!ehDescompasso(e)) throw e;
        if (temDado && escritosNoCorpo + tamanhoDe(args[0], codificacao) > declarado()) {
          estourar(args[0], codificacao);
          try { return aplicar(endOriginal, raw, resto); } catch { derrubar(); return raw; }
        }
        // Corpo menor que o declarado: o cliente esperaria bytes que não vêm.
        log.error({ rota: req.routeOptions?.url ?? "(sem rota)" }, "corpo menor que o content-length declarado");
        derrubar();
        return raw;
      }
    }
    segurando = false;
    let cb: unknown;
    if (typeof args[0] === "function") cb = args[0];
    else {
      guardar(args[0], typeof args[1] === "string" ? args[1] : undefined);
      cb = typeof args[1] === "function" ? args[1] : args[2];
    }
    const corpoOriginal = juntarBuffers(pedacos);
    let achado: { motivo: string; erroVisto: string | null } | null;
    if (provisorioComoFinal) {
      achado = {
        motivo: `status ${statusSegurado} (provisório) como resposta final: o cliente leria a resposta seguinte da conexão como a deste pedido`,
        erroVisto: null,
      };
    } else {
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
    }
    const fimComCb = (corpo: Buffer | string) => aplicar(endOriginal, raw, typeof cb === "function" ? [corpo, cb] : [corpo]);
    if (achado === null) {
      liberado = statusSegurado;
      const cabeca: unknown[] = [statusSegurado];
      if (mensagemDeStatus !== undefined) cabeca[cabeca.length] = mensagemDeStatus;
      if (cabecalhosSegurados !== undefined) cabeca[cabeca.length] = cabecalhosSegurados;
      try {
        aplicar(writeHeadOriginal, raw, cabeca);
        return fimComCb(corpoOriginal);
      } catch (e) {
        // Cabeça ou corpo que o Node recusa (trailer com content-length, content-length que não bate):
        // a resposta conferida não sai como veio, e sai a do desvio.
        achado = { motivo: `o Node recusou a resposta conferida (${(e as { code?: string }).code ?? "erro"})`, erroVisto: null };
      }
    }
    const { statusFinal, novo } = registrarDesvio(statusSegurado, achado.erroVisto, achado.motivo, provisorioComoFinal);
    liberado = statusFinal;
    try {
      const doCorpo = ["content-length", "content-type", "transfer-encoding", "content-encoding", "trailer"];
      for (let i = 0; i < doCorpo.length; i += 1) raw.removeHeader(doCorpo[i]!);
      // O trailer de `addTrailers` só sai em `chunked`; com content-length o Node recusaria a cabeça.
      (raw as unknown as { _trailer: string })._trailer = "";
      const cabecalhos = semCabecalhosDoCorpo(cabecalhosSegurados);
      cabecalhos["content-type"] = "application/json; charset=utf-8";
      cabecalhos["content-length"] = String(tamanhoEmBytes(novo));
      aplicar(writeHeadOriginal, raw, [statusFinal, FRASE_DO_STATUS[statusFinal]!, cabecalhos]);
      return fimComCb(novo);
    } catch {
      // O caminho do desvio NUNCA lança (correção 6): se o Node recusar até a cabeça da troca, a
      // resposta do desvio vai em bytes prontos pela porta, e a conexão fecha.
      try {
        cabecaPendente = false;
        bloqueado = true;
        interna._last = true;
        passaLivre = bytesDaResposta(statusFinal, novo);
        desarrolhar();
        aplicar(writeRawOriginal, raw, [passaLivre, "latin1", () => derrubar()]);
      } catch {
        derrubar();
      }
      return raw;
    }
  }

  /*
    AS EARLY HINTS (correção 7b, CI em Node 22). O Node 24 recusa CR ou LF no
    valor de `writeEarlyHints` (lança `ERR_INVALID_CHAR`); o Node 22, que é o
    de produção (`Dockerfile`), escreve o valor como veio, e
    `writeEarlyHints({ "x": "a\r\n\r\nHTTP/1.1 403 ..." })` põe uma cabeça
    403 inteira no fio. A porta dos bytes já pegava essa cabeça (troca a
    resposta e fecha a conexão), mas o resultado mudava com a versão do Node.
    Aqui a guarda aplica a regra do Node 24 nas duas versões: nome que não é
    token, ou valor com caractere de controle, lança `ERR_INVALID_CHAR` antes de
    qualquer byte sair, e a rota responde o 500 do tratador de erro. A porta
    continua como segunda rede.
  */
  const earlyHintsOriginal = (raw as unknown as { writeEarlyHints?: (...a: unknown[]) => unknown }).writeEarlyHints;
  function writeEarlyHints(this: ServerResponse, ...args: unknown[]) {
    const dicas = args[0];
    if (typeof dicas === "object" && dicas !== null) {
      const nomes = chavesDe(dicas);
      for (let i = 0; i < nomes.length; i += 1) {
        const nome = nomes[i]!;
        const v = (dicas as Record<string, unknown>)[nome];
        const valores: unknown[] = ehArray(v) ? v : [v];
        let ruim = casa(NOME_DE_CABECALHO, nome) === null;
        for (let j = 0; !ruim && j < valores.length; j += 1) {
          ruim = casa(VALOR_DE_CABECALHO_INVALIDO, `${valores[j] as string}`) !== null;
        }
        if (ruim) {
          throw definirPropriedade(new TypeError(`Cabeçalho de Early Hints inválido: "${nome}"`), "code",
            { value: "ERR_INVALID_CHAR", enumerable: false });
        }
      }
    }
    return aplicar(earlyHintsOriginal!, raw, args);
  }

  raw.strictContentLength = true;
  if (typeof earlyHintsOriginal === "function") {
    definirPropriedade(raw, "writeEarlyHints", { value: writeEarlyHints, writable: false, configurable: false, enumerable: false });
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
