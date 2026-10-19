import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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
 * O que ela não vê, e a varredura proíbe: escrita direta no Node (`raw`,
 * `hijack`, `writeHead`) ou no socket, e código no mesmo processo que reescreve
 * o Fastify ou os globais antes de esta guarda carregar.
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
