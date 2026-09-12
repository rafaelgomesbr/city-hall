import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

/**
 * Os tokens do console, e a única coisa que importa neles: eles não valem no
 * produto, e os do produto não valem aqui.
 *
 * A DECISÃO 1 DA ADR 0008 pede aplicação separada, e separação que depende de
 * dois segredos diferentes é separação que dura até o dia em que alguém
 * reaproveitar uma variável de ambiente por engano no painel de implantação.
 * Por isso a separação NÃO é o segredo: é a PLATEIA.
 *
 * `verificarAcesso` da API exige plateia `dc360`, e `verificarSessao` aqui
 * exige `dc360-console`. As duas verificações recusam o token da outra ainda
 * que os dois lados estejam assinando com a MESMA chave, e é exatamente esse o
 * caso que `test/plateia-nao-atravessa.test.ts` fixa: ele emite os dois tokens
 * com o mesmo segredo e mostra os dois sendo recusados do outro lado. Um teste
 * que usasse segredos diferentes provaria apenas que segredos diferentes são
 * diferentes.
 *
 * A consequência prática: uma rota nova do produto nasce protegida contra
 * token de console, e uma rota nova do console nasce protegida contra token de
 * município, sem nenhuma delas precisar saber que a outra existe.
 */

const EMISSOR = "dc360-console";

/** A plateia da sessão do console. Rota nenhuma do produto aceita este valor. */
const PLATEIA_SESSAO = "dc360-console";

/**
 * A plateia do estado intermediário do login, entre a senha e o código.
 *
 * Separada da sessão pela mesma razão que o produto separou a dele: emitir o
 * token de sessão e "só não deixar a tela avançar" seria dar acesso ANTES do
 * segundo fator, porque quem tem o token não precisa da tela para nada. Aqui
 * isso seria pior que no produto, porque no console o segundo fator não é
 * opcional para ninguém.
 */
const PLATEIA_DESAFIO = "dc360-console-desafio";

/**
 * Cinco minutos para o desafio, como no produto.
 *
 * Ele existe para atravessar a distância entre digitar a senha e ler os seis
 * dígitos que já estão na tela do telefone, e isso leva segundos.
 */
export const DESAFIO_MINUTOS = 5;

/**
 * Trinta minutos para a sessão, e ela NÃO se renova.
 *
 * No produto o token de acesso dura quinze minutos e existe um token de
 * renovação, guardado no banco como hash, que permite prolongar a sessão sem
 * pedir a senha de novo. Aqui não existe esse token, e a razão é a decisão 3 da
 * ADR 0008: o papel do console não tem INSERT em lugar nenhum, então não há
 * onde guardar o hash de um token de renovação. Sem lugar para guardar, não há
 * como revogar, e um token de renovação irrevogável seria uma sessão eterna
 * com nome de sessão curta.
 *
 * O preço é que quem passa meia hora olhando números digita a senha e o código
 * de novo. Para uma conta que é a única do sistema cujo comprometimento alcança
 * mais de um município, é o preço certo.
 */
export const SESSAO_MINUTOS = 30;

const CONTEUDO_SESSAO = z.object({ sub: z.string().min(1) });
const CONTEUDO_DESAFIO = z.object({ sub: z.string().min(1) });

export type Sessao = { email: string };
export type Desafio = { email: string };

export async function emitirSessao(segredo: Uint8Array, email: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(email)
    .setIssuer(EMISSOR)
    .setAudience(PLATEIA_SESSAO)
    .setIssuedAt()
    .setExpirationTime(`${SESSAO_MINUTOS}m`)
    .sign(segredo);
}

export async function emitirDesafio(segredo: Uint8Array, email: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(email)
    .setIssuer(EMISSOR)
    .setAudience(PLATEIA_DESAFIO)
    .setIssuedAt()
    .setExpirationTime(`${DESAFIO_MINUTOS}m`)
    .sign(segredo);
}

/**
 * `algorithms: ["HS256"]` fixo, pela mesma razão do produto: ler o algoritmo do
 * cabeçalho do token é a falha clássica de JWT, porque quem manda o token
 * escolheria `none` (sem assinatura nenhuma). Quem decide o algoritmo é o
 * servidor; o token só diz o conteúdo.
 */
async function verificar(
  segredo: Uint8Array,
  token: string,
  plateia: string,
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, segredo, {
      issuer: EMISSOR,
      audience: plateia,
      algorithms: ["HS256"],
    });
    const analisado = CONTEUDO_SESSAO.safeParse({ sub: payload.sub });
    return analisado.success ? analisado.data : null;
  } catch {
    // Assinatura de outro segredo, plateia do outro lado, token expirado ou
    // adulterado. Todos são a mesma resposta para quem chamou: não vale.
    return null;
  }
}

export async function verificarSessao(
  segredo: Uint8Array,
  token: string,
): Promise<Sessao | null> {
  const conteudo = await verificar(segredo, token, PLATEIA_SESSAO);
  return conteudo ? { email: conteudo.sub } : null;
}

export async function verificarDesafio(
  segredo: Uint8Array,
  token: string,
): Promise<Desafio | null> {
  const conteudo = await verificar(segredo, token, PLATEIA_DESAFIO);
  if (!conteudo) return null;
  const analisado = CONTEUDO_DESAFIO.safeParse(conteudo);
  return analisado.success ? { email: analisado.data.sub } : null;
}
