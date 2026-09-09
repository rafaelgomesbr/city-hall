import type { FastifyRequest } from "fastify";
import { verificarAcesso } from "./auth/tokens.js";

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

/**
 * A chave do balde do limitador global: quem, e não de onde, quando dá para
 * saber quem.
 *
 * Contar só por endereço quebra a prefeitura, e quebra do lado errado. A
 * Defesa Civil inteira sai por um NAT só, então o painel da coordenação, o
 * plantão e os aparelhos dos agentes dividem UM balde. Numa noite de chuva,
 * que é justamente quando todo mundo sincroniza ao mesmo tempo, o quinto
 * agente a subir vistoria leva 429 por causa do tráfego dos outros quatro.
 * Ou seja: o limite deixa de conter abuso e passa a derrubar o uso legítimo,
 * na hora do evento.
 *
 * Com token verificado, o balde passa a ser por usuário. Quem estoura o
 * próprio teto atrapalha só a si mesmo.
 *
 * O TETO POR ENDEREÇO NÃO SAI DAQUI, e isso não é sobra: entrar, recuperar
 * senha e registrar interesse acontecem SEM token. Se a chave caísse para uma
 * constante quando não há identidade, todo o tráfego anônimo do mundo dividiria
 * um balde só (o que derruba o produto inteiro), e se ela caísse para "sem
 * limite", força bruta e varredura ficariam livres, que é o oposto do motivo
 * de o limitador existir.
 *
 * A CHAVE SAI DO TOKEN JÁ VERIFICADO, pela mesma razão que a organização sai:
 * ela é decisão de segurança. Se viesse de cabeçalho, de parâmetro ou do corpo,
 * bastaria mandar um identificador novo a cada requisição para ter um balde
 * novo a cada requisição, e o limitador viraria enfeite. Token inválido,
 * expirado ou inventado não abre balde nenhum: cai no teto por endereço, que é
 * onde quem não provou quem é tem que estar.
 */
export async function chaveDoLimitador(
  req: FastifyRequest,
  segredoJwt: Uint8Array,
): Promise<string> {
  const cabecalho = req.headers.authorization;
  if (cabecalho?.startsWith("Bearer ")) {
    const conteudo = await verificarAcesso(segredoJwt, cabecalho.slice(7));
    // O `sub` do token, e não o token: sessão renovada troca o token e continua
    // sendo a mesma pessoa. Chavear pelo token daria balde novo a cada
    // renovação, e renovar é coisa que o aplicativo faz sozinho.
    if (conteudo) return `usuario:${conteudo.sub}`;
  }
  // Prefixo explícito para que um endereço nunca possa colidir com um id de
  // usuário e herdar o balde dele.
  return `endereco:${enderecoDoCliente(req)}`;
}
