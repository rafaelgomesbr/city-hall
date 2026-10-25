/**
 * A versão da API no caminho (V2-F02-E01).
 *
 * Toda rota de negócio existe sob `/v1` e, enquanto houver aplicativo
 * instalado que não sabe da versão, também sem prefixo (o "espelho legado").
 * Este arquivo guarda o que é DECLARAÇÃO sobre essa estrutura, e o teste de
 * paridade (`test/versao-v1.test.ts`) cobra a declaração contra as rotas que o
 * Fastify de fato registrou. Quem registra é `registrarRotasDeNegocio`, em
 * `servidor.ts`.
 */

export const PREFIXO_V1 = "/v1";

/**
 * As rotas que NÃO ganham par. Chave `MÉTODO caminho`, como `printRoutes`
 * lista, e a razão de cada uma. Acrescentar aqui é decisão de contrato: o
 * teste de paridade só aceita a falta de par para o que está nesta lista.
 */
export const ROTAS_FORA_DO_PREFIXO: ReadonlyMap<string, string> = new Map([
  [
    "GET /saude",
    "infraestrutura: a sonda do balanceador e a conferência de rollback apontam "
    + "para este caminho, e ele não é contrato de aplicativo",
  ],
  [
    "GET /armazenamento/objeto",
    "URL assinada: a assinatura cobre o caminho, então a API não pode devolver "
    + "um endereço com prefixo diferente do que foi assinado. Só existe fora de "
    + "produção, onde a própria API guarda os bytes",
  ],
  [
    "PUT /armazenamento/objeto",
    "URL assinada, pela mesma razão do GET. Só existe fora de produção",
  ],
  [
    "GET /publico/oficio/:token",
    "o endereço vive em email já enviado ao órgão destinatário, e um link de "
    + "uso único não pode quebrar por mudança de versão. Também não ganha "
    + "cabeçalho de depreciação",
  ],
]);

/**
 * As rotas que existem SÓ em `/v1`, sem par legado, e a razão de cada uma
 * (por exemplo, rota criada para um aplicativo novo, que nunca chamou o
 * caminho sem prefixo). Chave `MÉTODO /v1/caminho`.
 *
 * Como declarar uma: registre a rota no bloco `if (!espelho)` ao fim de
 * `registrarRotasDeNegocio` (`servidor.ts`) e acrescente a chave aqui. Sem as
 * duas coisas, o teste de paridade reprova: rota só de um lado, sem
 * declaração, é exatamente o defeito que o registro por função única evita.
 * Entrada que sobra depois de a rota sumir também reprova (lista morta vira
 * licença pendurada).
 */
export const ROTAS_SO_NO_V1: ReadonlyMap<string, string> = new Map();

/** Tira o prefixo da versão, se houver: `/v1/ocorrencias` vira `/ocorrencias`. */
export function semPrefixoDeVersao(caminho: string): string {
  return caminho === PREFIXO_V1 || caminho.startsWith(`${PREFIXO_V1}/`)
    ? caminho.slice(PREFIXO_V1.length) || "/"
    : caminho;
}

/**
 * Os cabeçalhos que toda resposta do espelho carrega.
 *
 *   `Deprecation`  o caminho sem prefixo está depreciado. O valor é `true`
 *                  (forma do rascunho que o RFC 9745 substituiu por uma
 *                  data); a data de início da depreciação é decisão da E08.
 *   `Sunset`       RFC 8594, data HTTP do fim de `ESPELHO_LEGADO_ATE`
 *                  (23:59:59 UTC do dia), a data em que o espelho pode sair.
 *   `Link`         `rel="successor-version"` para o mesmo caminho sob `/v1`.
 *
 * O caminho do `Link` sai da URL pedida SEM a query string (que pode levar
 * endereço de imóvel) e com todo caractere fora do conjunto de URL percent-
 * codificado, para o valor nunca fechar o `<...>` antes da hora.
 */
export function cabecalhosDeDepreciacao(
  espelhoLegadoAte: string,
  urlPedida: string,
): { deprecation: string; sunset: string; link: string } {
  const caminho = (urlPedida.split("?")[0] ?? "").replace(
    /[^A-Za-z0-9._~!$&'()*+,;=:@%/-]/g,
    (c) => encodeURIComponent(c),
  );
  return {
    deprecation: "true",
    sunset: new Date(`${espelhoLegadoAte}T23:59:59Z`).toUTCString(),
    link: `<${PREFIXO_V1}${caminho.startsWith("/") ? caminho : `/${caminho}`}>; rel="successor-version"`,
  };
}
