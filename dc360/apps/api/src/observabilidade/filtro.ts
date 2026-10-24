import { mascararDadoPessoal } from "@dc360/shared";

/**
 * O filtro do que pode sair desta API para uma ferramenta de erro de terceiro
 * (V2-F01-E14). É o `beforeSend` do dia em que o SDK compatível com Sentry
 * entrar (depois do CP-06), escrito e testado ANTES dele, para que o primeiro
 * evento externo já nasça filtrado.
 *
 * A regra é de LISTA DO QUE FICA, não do que sai, para a parte que mais vaza:
 * o bloco `request` é reconstruído só com o método e o molde da rota. Fora dele
 * o filtro é de lista do que sai, porque o resto do evento é texto de exceção e
 * etiqueta, e aí a defesa é a máscara.
 *
 * O QUE NUNCA SAI: corpo, cabeçalhos (`authorization`, `cookie` e também
 * `x-forwarded-for`, `user-agent`), a barra de endereço (que leva a query string
 * e, em duas rotas, um segredo de uso único), o IP, o bloco `user` e as
 * variáveis locais das pilhas (`vars`). O QUE SAI MASCARADO: e-mail, CPF,
 * telefone, coordenada, token em texto, em toda string do evento.
 */

/** Chaves que não saem em profundidade nenhuma, qualquer que seja o valor. */
const CHAVES_PROIBIDAS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "cookies",
  "set-cookie",
  "x-api-key",
  "headers",
  "query",
  "query_string",
  "querystring",
  "body",
  "data",
  "ip_address",
  "ip",
  "remoteaddress",
  "user",
  "vars",
  "senha",
  "password",
  "token",
  "renovacao",
  "segredo",
  "secret",
]);

const PROFUNDIDADE_MAXIMA = 10;

function limpar(valor: unknown, profundidade: number, visto: WeakSet<object>): unknown {
  if (typeof valor === "string") return mascararDadoPessoal(valor);
  if (valor === null || typeof valor !== "object") return valor;
  if (profundidade >= PROFUNDIDADE_MAXIMA || visto.has(valor)) return "[omitido]";
  visto.add(valor);
  if (Array.isArray(valor)) return valor.map((item) => limpar(item, profundidade + 1, visto));
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor)) {
    if (CHAVES_PROIBIDAS.has(chave.toLowerCase())) continue;
    saida[chave] = limpar(item, profundidade + 1, visto);
  }
  return saida;
}

/**
 * Devolve uma CÓPIA filtrada do evento; o original não é tocado (ele ainda serve
 * ao log local).
 */
export function filtrarEventoParaTerceiros(
  evento: Record<string, unknown>,
): Record<string, unknown> {
  const { request, ...resto } = evento;
  const filtrado = limpar(resto, 0, new WeakSet()) as Record<string, unknown>;
  if (request && typeof request === "object") {
    const bruto = request as Record<string, unknown>;
    const reconstruido: Record<string, unknown> = {};
    // Só o que é do produto e não da pessoa: o verbo e o molde (`/ocorrencias/:id`).
    if (typeof bruto["method"] === "string")
      reconstruido["method"] = mascararDadoPessoal(bruto["method"]);
    if (typeof bruto["route"] === "string")
      reconstruido["route"] = mascararDadoPessoal(bruto["route"]);
    filtrado["request"] = reconstruido;
  }
  return filtrado;
}
