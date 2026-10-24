/**
 * A máscara de dado pessoal que as pontas compartilham (V2-F01-E14).
 *
 * Mora aqui porque a API (log e evento para ferramenta de erro) e o painel
 * (erros globais do navegador) precisam da MESMA régua para a pergunta "este
 * texto pode ir parar num log ou numa ferramenta de erro de terceiro?". Duas
 * cópias de uma regra de privacidade divergem em silêncio.
 */

/** UUID em qualquer versão, dentro de um texto: a máscara poupa o código de suporte. */
const UUID_NO_TEXTO = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/*
  Credencial que viaja em texto: cabeçalho `Bearer ...` e JWT solto (três partes
  em base64url, a primeira começando por `eyJ`, que é `{"` codificado). Uma
  mensagem de exceção de biblioteca de HTTP às vezes ecoa o cabeçalho inteiro.
*/
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const CPF = /(?<![\d.])\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g;
/*
  Telefone brasileiro com ou sem DDI e DDD, com separadores comuns. Os limites
  `(?<![\d.])` e `(?!\d)` impedem de morder o meio de um número maior; o preço é
  mascarar de mais (um instante em milissegundos tem 13 dígitos e casa), e
  mascarar de mais é o lado seguro desta função.
*/
const TELEFONE = /(?<![\d.])(?:\+?\d{2}[\s.-]?)?(?:\(\d{2}\)|\d{2})[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g;
/*
  Coordenada: número decimal com quatro casas ou mais (cerca de 11 m de
  precisão). Abaixo disso o número não localiza uma casa.
*/
const COORDENADA = /(?<![\d.])-?\d{1,3}\.\d{4,}(?!\d)/g;

function mascararSemUuid(trecho: string): string {
  return trecho
    .replace(CPF, "[cpf]")
    .replace(TELEFONE, "[telefone]")
    .replace(COORDENADA, "[coordenada]");
}

/**
 * Troca token, e-mail, CPF, telefone e coordenada por marcadores.
 *
 * Serve a texto que o produto não escreveu (mensagem de exceção, pilha, texto de
 * erro do navegador) e que por isso pode carregar o que a pessoa digitou. UUID
 * é poupado: é o código de suporte, e sem ele o erro não se acha.
 *
 * É uma rede de segurança e não uma garantia: nome de pessoa, endereço escrito
 * por extenso e texto livre passam por ela. A defesa de verdade é não pôr esse
 * dado no erro (ver as regras de `redact` da API).
 */
export function mascararDadoPessoal(texto: string): string {
  const semEmail = texto
    .replace(BEARER, "Bearer [token]")
    .replace(JWT, "[token]")
    .replace(EMAIL, "[email]");
  // `split` com grupo de captura devolve os UUIDs nas posições ímpares.
  return semEmail
    .split(UUID_NO_TEXTO)
    .map((parte, i) => (i % 2 === 1 ? parte : mascararSemUuid(parte)))
    .join("");
}
