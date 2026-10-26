/**
 * Versão mínima dos clientes e cabeçalho de versão do aplicativo (V2-F02-E06).
 *
 * O aplicativo de loja informa a própria versão no cabeçalho `X-App-Version`
 * (`campo/1.4.0`) e a API recusa com 426 o que está abaixo do mínimo que o
 * operador configurou. O cabeçalho é DECLARADO pelo cliente: serve à
 * compatibilidade, nunca decide acesso. Por isso tudo aqui é tolerante: texto
 * que não se lê vira `null`, e quem chama trata `null` como "não sei", nunca
 * como erro.
 *
 * Mora no pacote comum para a API e os aplicativos lerem a regra da mesma forma.
 */

/** O nome do cabeçalho, em minúsculas (como o Node o entrega). */
export const CABECALHO_DE_VERSAO_DO_APLICATIVO = "x-app-version";

/** Os aplicativos que informam versão. O painel manda `painel/<build>` só para observação. */
export const APLICATIVOS_COM_VERSAO = ["campo", "cidadao", "painel"] as const;
export type AplicativoComVersao = (typeof APLICATIVOS_COM_VERSAO)[number];

/** Os aplicativos que têm versão MÍNIMA (o painel não tem: ele é servido pela própria equipe). */
export const APLICATIVOS_COM_VERSAO_MINIMA = ["campo", "cidadao"] as const;
export type AplicativoComVersaoMinima = (typeof APLICATIVOS_COM_VERSAO_MINIMA)[number];

export function ehAplicativoComVersaoMinima(valor: unknown): valor is AplicativoComVersaoMinima {
  return (
    typeof valor === "string" &&
    (APLICATIVOS_COM_VERSAO_MINIMA as readonly string[]).includes(valor)
  );
}

/** Maior, menor e correção, como números inteiros. */
export type VersaoNumerica = readonly [number, number, number];

// Até nove dígitos por parte: o suficiente para qualquer versão real, e um teto
// para o número nunca perder precisão na comparação.
const NUCLEO = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:[-+][0-9A-Za-z.+-]{0,64})?$/;

/**
 * Lê `maior.menor.correção`. O pré-lançamento (`-beta.1`) e a build (`+abc`)
 * são ignorados: `1.4.0-beta.2` lê como `1.4.0`. Devolve `null` para o que não
 * tem essa forma, inclusive duas partes só (`1.4`), vazio e texto qualquer.
 */
export function lerVersao(texto: unknown): VersaoNumerica | null {
  if (typeof texto !== "string") return null;
  const m = NUCLEO.exec(texto.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Compara duas versões (`-1` se `a` é anterior a `b`, `0` se iguais, `1` se
 * posterior). O pré-lançamento não conta. Devolve `null` se alguma das duas não
 * se lê: quem decide recusar com base nisto precisa tratar o `null` e nunca
 * recusar por ele.
 */
export function compararVersoes(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const va = lerVersao(a);
  const vb = lerVersao(b);
  if (!va || !vb) return null;
  for (let i = 0; i < 3; i++) {
    if (va[i]! < vb[i]!) return -1;
    if (va[i]! > vb[i]!) return 1;
  }
  return 0;
}

/** O que o cabeçalho `X-App-Version` disse, já saneado. */
export type VersaoDeclarada = {
  readonly aplicativo: AplicativoComVersao;
  /** O texto depois da barra, só com caracteres seguros (cabe em log). */
  readonly versao: string;
  /** `maior.menor.correção` se a versão tem essa forma; `null` (ex.: build do painel) se não. */
  readonly numerica: VersaoNumerica | null;
};

const CABECALHO = /^([a-z]{1,16})\/([0-9A-Za-z.+-]{1,40})$/;

/**
 * Lê o valor do cabeçalho (`campo/1.4.0`). Devolve `null` para ausente, vazio,
 * com forma errada ou de aplicativo desconhecido: o chamador IGNORA o que não
 * leu, nunca responde 500 por causa dele. O nome do aplicativo vira minúsculo.
 */
export function lerCabecalhoDeVersao(valor: unknown): VersaoDeclarada | null {
  if (typeof valor !== "string") return null;
  const m = CABECALHO.exec(valor.trim().toLowerCase());
  if (!m) return null;
  const aplicativo = m[1]!;
  if (!(APLICATIVOS_COM_VERSAO as readonly string[]).includes(aplicativo)) return null;
  const versao = m[2]!;
  return { aplicativo: aplicativo as AplicativoComVersao, versao, numerica: lerVersao(versao) };
}

/**
 * Se a versão declarada está abaixo do mínimo. `false` quando não há mínimo
 * (vazio), quando o mínimo não se lê, ou quando a versão declarada não é
 * numérica: na dúvida, o aplicativo passa, porque o cabeçalho é declaração do
 * cliente e a recusa só vale para quem disse claramente uma versão velha.
 */
export function estaAbaixoDoMinimo(
  declarada: VersaoDeclarada | null,
  minimo: string | undefined,
): boolean {
  if (!declarada?.numerica || !minimo) return false;
  return compararVersoes(declarada.versao, minimo) === -1;
}
