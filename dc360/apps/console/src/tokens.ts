import { createHash } from "node:crypto";
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
 * pedir a senha de novo. Aqui não existe esse token, de propósito: a única
 * tabela que o console escreve é a de operadores, e um token de renovação
 * exigiria mais uma tabela e mais uma coisa a revogar. Uma sessão curta que
 * simplesmente acaba é mais fácil de raciocinar do que uma sessão longa com
 * revogação.
 *
 * O preço é que quem passa meia hora olhando números digita a senha e o código
 * de novo. Para uma conta que é a única do sistema cujo comprometimento alcança
 * mais de um município, é o preço certo.
 */
export const SESSAO_MINUTOS = 30;

/**
 * O que a sessão carrega: o IDENTIFICADOR do operador e a VERSÃO da senha.
 *
 * O identificador, e não o email: a conta vive no banco desde a migração 038,
 * e é pela linha dela que toda rota confere se o operador continua ativo. O
 * email fica fora do token para o token não carregar dado de pessoa que ele
 * não precisa carregar.
 *
 * A versão da senha (`sv`) é o que faz "trocar a senha derruba as outras
 * sessões" ser verdade sem tabela de sessões: ela é um resumo do hash
 * guardado, e o hash muda a cada troca (sal novo). Toda rota compara a versão
 * do token com a da linha; uma sessão emitida antes da troca deixa de bater e
 * cai. A rota que trocou devolve um token novo com a versão nova, e só ela.
 *
 * O resumo é de um HASH, e não da senha: quem tiver o token não tira dele nem
 * um byte que sirva para entrar.
 */
const CONTEUDO_SESSAO = z.object({ sub: z.string().uuid(), sv: z.string().min(1) });
const CONTEUDO_DESAFIO = z.object({ sub: z.string().uuid() });

export type Sessao = { id: string; sv: string };
export type Desafio = { id: string };

export function versaoDaSenha(senhaHash: string): string {
  return createHash("sha256").update(senhaHash, "utf8").digest("base64url").slice(0, 16);
}

export async function emitirSessao(segredo: Uint8Array, sessao: Sessao): Promise<string> {
  return new SignJWT({ sv: sessao.sv })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sessao.id)
    .setIssuer(EMISSOR)
    .setAudience(PLATEIA_SESSAO)
    .setIssuedAt()
    .setExpirationTime(`${SESSAO_MINUTOS}m`)
    .sign(segredo);
}

export async function emitirDesafio(segredo: Uint8Array, operadorId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(operadorId)
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
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, segredo, {
      issuer: EMISSOR,
      audience: plateia,
      algorithms: ["HS256"],
    });
    return payload as Record<string, unknown>;
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
  if (!conteudo) return null;
  const analisado = CONTEUDO_SESSAO.safeParse({ sub: conteudo["sub"], sv: conteudo["sv"] });
  return analisado.success ? { id: analisado.data.sub, sv: analisado.data.sv } : null;
}

export async function verificarDesafio(
  segredo: Uint8Array,
  token: string,
): Promise<Desafio | null> {
  const conteudo = await verificar(segredo, token, PLATEIA_DESAFIO);
  if (!conteudo) return null;
  const analisado = CONTEUDO_DESAFIO.safeParse({ sub: conteudo["sub"] });
  return analisado.success ? { id: analisado.data.sub } : null;
}
