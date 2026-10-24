/**
 * O id de requisição (V2-F01-E14). Sem dependência nenhuma, de propósito: o
 * console importa este arquivo de `apps/api/src`, como já faz com a senha e o
 * TOTP, e uma regra de segurança de uma linha não ganha com duas cópias.
 */

/** UUID em qualquer versão, no formato canônico de 36 caracteres. */
const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehIdDeRequisicao(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO_DE_UUID.test(valor);
}

/**
 * O `X-Request-Id` que o cliente mandou, ou `null` se não presta.
 *
 * SÓ UUID, e de propósito. O id entra em toda linha de log da requisição e volta
 * no cabeçalho da resposta: texto livre aqui seria injeção de linha no log
 * (`\n` e um falso registro) e injeção de cabeçalho. Um UUID não carrega nada
 * além de si mesmo, e por isso também não leva dado pessoal nem identifica
 * município. Cabeçalho repetido chega como texto com vírgula (o Node junta), e
 * nenhum é UUID: a requisição ganha um id novo.
 *
 * Sai em minúsculas, para o mesmo id não aparecer em duas grafias nos logs.
 *
 * LIMITE CONHECIDO: o id é escolhido pelo cliente, então dois pedidos podem
 * chegar com o mesmo. Serve para correlacionar, nunca para autorizar nem para
 * provar quem fez o quê (isso é da trilha de auditoria).
 */
export function idDeRequisicaoRecebido(cabecalho: unknown): string | null {
  return ehIdDeRequisicao(cabecalho) ? cabecalho.toLowerCase() : null;
}
