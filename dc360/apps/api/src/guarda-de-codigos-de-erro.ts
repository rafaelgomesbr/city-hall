import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
 * catálogo (`code(200).code(403)`, `e[campo] = "x"`, `Object` apelidado,
 * `onSend` nas opções da rota, `JSON.stringify` trocado, `Proxy`, arquivo
 * `.mts`...) que o texto não mostrava. Cada regra nova abre a próxima forma.
 *
 * O QUE ISTO FAZ: confere a RESPOSTA, e não o texto que a produz. Toda resposta
 * 401 ou 403 que sai do servidor, por qualquer caminho que passe pelo Fastify,
 * tem de ter um corpo JSON com `erro` do catálogo (ou da lista da entrada) E o
 * status que o catálogo dá a esse código. Fora disso:
 *
 *   - em TESTE (`modo: "falhar"`), a resposta vira 500
 *     `desvio_do_catalogo_de_erro` e o desvio fica registrado; o arquivo de
 *     apoio `test/guarda-falha-alto.ts` reprova o teste que passou por ali,
 *     qualquer que seja o teste e o que ele confira;
 *   - fora de teste (`modo: "corrigir"`), a resposta sai com o código genérico
 *     do catálogo para aquele status (401 `nao_autenticado`, 403
 *     `sem_permissao`), com a mensagem do catálogo, e o desvio vai para o log
 *     com o método, a rota (o molde, sem a barra de endereço, que pode levar dado
 *     pessoal), o status e o código que tentou sair.
 *
 * ONDE ELA RODA, e por que em dois lugares: como `onSend` GLOBAL (pega o 404 do
 * roteador e tudo o que não tem rota) e como o ÚLTIMO `onSend` de cada rota,
 * acrescentado pelo `onRoute`. O Fastify roda os ganchos do contexto antes dos
 * das opções da rota, então só no fim da lista da rota ela vê o corpo depois de
 * um `onSend` posto nas opções (`app.post("/", { onSend }, ...)`), que foi uma
 * das formas da revisão. Precisa ser instalada ANTES da primeira rota: o
 * `onRoute` só vale para rota registrada depois dele.
 *
 * O QUE ELA NÃO VÊ, e a varredura proíbe: resposta que não passa pelo Fastify,
 * escrita direto no Node (`resposta.raw`, `resposta.hijack()`, `writeHead`) ou
 * no socket (`req.socket.end("HTTP/1.1 403 ...")`). E código no mesmo processo
 * que reescreve o próprio Fastify, o protótipo da resposta ou os globais antes
 * desta guarda carregar (ela guarda `JSON.parse` na carga do módulo, para um
 * `JSON.parse` trocado depois não a enganar, e não usa `JSON.stringify` para
 * montar o corpo genérico, para um `JSON.stringify` trocado não reescrever o
 * corpo que ela mesma corrigiu).
 */

export type ModoDaGuarda = "falhar" | "corrigir";

/** Código -> status que ele pode ter numa resposta de acesso. */
export type ContratoDeAcesso = Readonly<Record<string, readonly number[]>>;

export type Desvio = {
  metodo: string;
  rota: string;
  status: number;
  /** O `erro` que tentou sair, quando o corpo era JSON com `erro` em texto. */
  erroVisto: string | null;
  motivo: string;
};

/** O contrato da API: os dez códigos do catálogo com o status de cada um, mais os da entrada. */
export const CONTRATO_DE_ACESSO_DA_API: ContratoDeAcesso = Object.freeze({
  ...Object.fromEntries(LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO.map((c) => [
    c, c === "acesso_suspenso" ? [403, 503] : [CODIGOS_DE_ERRO_DE_ACESSO[c].status],
  ])),
  ...Object.fromEntries(Object.entries(CODIGOS_DA_ENTRADA).map(([c, v]) => [c, [v.status]])),
});

/** O que sai no lugar do desvio, fora de teste: o código genérico do catálogo para o status. */
export const GENERICO_DA_API: Readonly<Record<401 | 403, { erro: string; mensagem: string }>> = Object.freeze({
  401: { erro: "nao_autenticado", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.nao_autenticado.mensagem },
  403: { erro: "sem_permissao", mensagem: CODIGOS_DE_ERRO_DE_ACESSO.sem_permissao.mensagem },
});

// Guardado na carga do módulo: um `JSON.parse` trocado depois não engana a guarda.
const analisarJson: (texto: string) => unknown = JSON.parse;

/**
 * Confere UM corpo de resposta de acesso. `null` quando está no contrato; o motivo
 * e o código visto quando não está. `payload` é o que o `onSend` recebe: texto,
 * `Buffer`, nada, ou um fluxo (que não dá para ler sem consumir, e por isso é desvio).
 */
export function conferirCorpoDeAcesso(
  status: number, payload: unknown, contrato: ContratoDeAcesso,
): { motivo: string; erroVisto: string | null } | null {
  let texto: string;
  if (typeof payload === "string") texto = payload;
  else if (payload instanceof Uint8Array) texto = Buffer.from(payload).toString("utf8");
  else if (payload === null || payload === undefined) return { motivo: "resposta sem corpo", erroVisto: null };
  else return { motivo: "corpo em fluxo ou objeto que não é texto", erroVisto: null };
  let corpo: unknown;
  try {
    corpo = analisarJson(texto);
  } catch {
    return { motivo: "corpo que não é JSON", erroVisto: null };
  }
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    return { motivo: "corpo JSON que não é objeto", erroVisto: null };
  }
  const erro = (corpo as { erro?: unknown }).erro;
  if (typeof erro !== "string") return { motivo: "corpo sem `erro` em texto", erroVisto: null };
  if (!Object.prototype.hasOwnProperty.call(contrato, erro)) {
    return { motivo: "código fora do catálogo", erroVisto: erro };
  }
  if (!contrato[erro]!.includes(status)) {
    return { motivo: `código do catálogo com status ${status}, e o catálogo diz ${contrato[erro]!.join(" ou ")}`, erroVisto: erro };
  }
  return null;
}

/** Texto JSON de um objeto de dois campos de texto, sem passar por `JSON.stringify`. */
function textoJson(campos: Readonly<Record<string, string>>): string {
  const aspas = (s: string) => `"${s.replace(/[\\"\u0000-\u001f\u2028\u2029]/g, (c) =>
    (c === "\\" || c === "\"" ? `\\${c}` : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`))}"`;
  return `{${Object.entries(campos).map(([k, v]) => `${aspas(k)}:${aspas(v)}`).join(",")}}`;
}

/** Desvios do modo "falhar" ainda não lidos. O apoio de teste lê e esvazia depois de cada caso. */
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

/** O gancho `onSend` que confere (e, conforme o modo, falha ou corrige) a resposta de acesso. */
export function criarGuardaDeAcesso(opcoes: OpcoesDaGuarda) {
  return async function guardaDeAcesso(req: FastifyRequest, resposta: FastifyReply, payload: unknown): Promise<unknown> {
    const status = resposta.statusCode;
    if (status !== 401 && status !== 403) return payload;
    // HEAD não leva corpo, por definição do HTTP: o Fastify tira o do GET gêmeo antes de chegar aqui.
    // Quem confere o código é o GET da mesma rota, que passa por esta mesma guarda.
    if (req.method === "HEAD") return payload;
    const achado = conferirCorpoDeAcesso(status, payload, opcoes.contrato);
    if (achado === null) return payload;
    const desvio: Desvio = {
      metodo: req.method,
      rota: req.routeOptions?.url ?? "(sem rota)",
      status,
      erroVisto: achado.erroVisto,
      motivo: achado.motivo,
    };
    req.log.error({ desvioDoCatalogo: desvio }, "resposta de acesso fora do catálogo de códigos de erro");
    resposta.removeHeader("content-length");
    resposta.header("content-type", "application/json; charset=utf-8");
    if (opcoes.modo === "falhar") {
      desviosPendentes.push(desvio);
      resposta.code(500);
      return textoJson({
        erro: "desvio_do_catalogo_de_erro",
        mensagem: `${desvio.metodo} ${desvio.rota} respondeu ${status} fora do catálogo: ${desvio.motivo}`
          + (desvio.erroVisto ? ` (${desvio.erroVisto})` : ""),
      });
    }
    return textoJson(opcoes.generico[status]);
  };
}

/**
 * Instala a guarda: `onSend` global e, por `onRoute`, o último `onSend` de cada
 * rota registrada DEPOIS desta chamada. Chamar logo depois de `Fastify()`.
 */
export function instalarGuardaDeAcesso(app: FastifyInstance, opcoes: OpcoesDaGuarda): void {
  const guarda = criarGuardaDeAcesso(opcoes);
  app.addHook("onRoute", (rota) => {
    const atuais = rota.onSend === undefined ? [] : Array.isArray(rota.onSend) ? rota.onSend : [rota.onSend];
    (rota as { onSend: unknown }).onSend = [...atuais, guarda];
  });
  app.addHook("onSend", guarda);
}
