import type { FastifyInstance, FastifyRequest } from "fastify";
import { verificarAcesso } from "./auth/tokens.js";

/** Plataformas de borda cujo cabeçalho de origem este processo sabe ler. */
export type ProxyDeBorda = "nenhum" | "fly";

/**
 * O cabeçalho de origem de cada borda conhecida.
 *
 * Uma tabela, e não um `if`, porque o dia em que entrar uma segunda plataforma
 * a pergunta certa vai ser "qual cabeçalho ela reescreve", e não "onde encaixo
 * mais uma condição".
 */
const CABECALHO_DA_BORDA: Record<ProxyDeBorda, string | null> = {
  nenhum: null,
  fly: "fly-client-ip",
};

/**
 * De quem ESTE servidor aceita cabeçalho de origem.
 *
 * Fica no `FastifyInstance`, e não numa variável de módulo, porque a suíte
 * sobe vários servidores no mesmo processo: variável de módulo faria a
 * declaração de um teste vazar para o servidor do outro, e uma defesa que
 * depende de ordem de execução não é defesa.
 */
declare module "fastify" {
  interface FastifyInstance {
    proxyDeBorda: ProxyDeBorda;
  }
}

export function declararProxyDeBorda(app: FastifyInstance, valor: ProxyDeBorda): void {
  app.decorate("proxyDeBorda", valor);
}

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
 * A PRIMEIRA CORREÇÃO TROCOU O CABEÇALHO E MANTEVE O DEFEITO, e é por isso
 * que este comentário existe. Ela passou a ler `Fly-Client-IP`, justificando
 * que o edge do Fly reescreve o cabeçalho antes de repassar, mas não amarrou
 * essa leitura a ambiente, plataforma nem lista de proxies confiáveis: fora do
 * Fly, `Fly-Client-IP` é um cabeçalho comum, que quem chama escreve como
 * quiser. Reproduzido com `LOGIN_POR_IP` no padrão (10 em 5 minutos): trinta
 * `POST /auth/entrar` do mesmo endereço devolviam vinte recusas, e as mesmas
 * trinta mandando `Fly-Client-IP: 10.0.0.N`, com N diferente a cada uma,
 * devolviam ZERO. E `docs/COLOCAR-DE-PE.md` oferece Fly, Railway e Render como
 * opções equivalentes, então não havia nem promessa de que o edge do Fly
 * estivesse na frente.
 *
 * A correção é DECLARAR de quem o processo aceita cabeçalho de origem, em vez
 * de adivinhar: `PROXY_DE_BORDA`, que o `fly.toml` traz em `fly` e cujo padrão
 * é `nenhum`. Com `nenhum`, nenhum cabeçalho muda o endereço, e vale o
 * `req.ip`, que com `trustProxy: 1` é o salto imediato em vez da ponta da
 * lista escolhida pelo cliente. O padrão é o valor seguro de propósito: quem
 * troca de PaaS esquece de mexer em variável, e o esquecimento tem que cair do
 * lado que não abre buraco.
 */
export function enderecoDoCliente(req: FastifyRequest): string {
  /*
    `req.server` e não uma variável de módulo: cada instância carrega a própria
    declaração. O `?? "nenhum"` cobre o servidor montado sem passar por
    `construirServidor` (teste de unidade, script), e cobre pelo lado seguro.
  */
  const borda: ProxyDeBorda = req.server?.proxyDeBorda ?? "nenhum";
  const cabecalho = CABECALHO_DA_BORDA[borda];
  if (cabecalho) {
    const daBorda = req.headers[cabecalho];
    if (typeof daBorda === "string" && daBorda.length > 0) return daBorda;
    if (Array.isArray(daBorda) && daBorda[0]) return daBorda[0];
  }
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
  segredosJwt: readonly Uint8Array[],
): Promise<string> {
  const cabecalho = req.headers.authorization;
  if (cabecalho?.startsWith("Bearer ")) {
    const conteudo = await verificarAcesso(segredosJwt, cabecalho.slice(7));
    // O `sub` do token, e não o token: sessão renovada troca o token e continua
    // sendo a mesma pessoa. Chavear pelo token daria balde novo a cada
    // renovação, e renovar é coisa que o aplicativo faz sozinho.
    if (conteudo) return `usuario:${conteudo.sub}`;
  }
  // Prefixo explícito para que um endereço nunca possa colidir com um id de
  // usuário e herdar o balde dele.
  return `endereco:${enderecoDoCliente(req)}`;
}
