import type { FastifyRequest } from "fastify";

/**
 * O endereço de quem realmente chamou, e não o que o cliente disse ser.
 *
 * Existe por causa de um defeito provado contra a produção: com
 * `trustProxy: true`, o Fastify toma como `req.ip` a entrada MAIS À ESQUERDA
 * de `X-Forwarded-For`, que é justamente a que o cliente escreve. Seis
 * requisições com `X-Forwarded-For` diferente devolviam o contador de limite
 * intacto nas seis, enquanto seis com o mesmo valor decrementavam.
 *
 * Isso não era um detalhe. Esse mesmo valor é a chave do limitador global, a
 * do limitador apertado de login, e é o IP gravado em `sessoes`,
 * `exportacoes`, `recuperacoes_senha` e `interesse_municipio`. Ou seja, o
 * atacante escolhia o próprio teto de requisições E escolhia o endereço que
 * ficaria registrado na trilha como autor da exportação da base de cidadãos.
 *
 * `Fly-Client-IP` é posto pelo edge do Fly e não pode ser sobrescrito por
 * quem chama de fora: o edge reescreve o cabeçalho antes de repassar. Fora do
 * Fly ele não existe, e aí vale o `req.ip`, que com `trustProxy: 1` passa a
 * ser o salto imediato em vez da ponta da lista.
 */
export function enderecoDoCliente(req: FastifyRequest): string {
  const doEdge = req.headers["fly-client-ip"];
  if (typeof doEdge === "string" && doEdge.length > 0) return doEdge;
  if (Array.isArray(doEdge) && doEdge[0]) return doEdge[0];
  return req.ip;
}
