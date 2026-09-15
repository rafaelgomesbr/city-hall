import { createHash, randomBytes } from "node:crypto";
import { SignJWT, errors as ErrosJose, jwtVerify } from "jose";
import { PAPEIS, type Papel } from "@dc360/shared";
import { z } from "zod";

/**
 * Dois tokens, com finalidades diferentes.
 *
 * O de ACESSO é um JWT curto (15 minutos) que a API verifica por assinatura,
 * sem ir ao banco. É ele que carrega a organização, e é dele que sai o valor
 * do `SET LOCAL`. Ser curto é o que limita o estrago de um vazamento, já que
 * não há como revogá-lo antes de expirar.
 *
 * O de RENOVAÇÃO é um segredo opaco de 32 bytes, guardado no banco só como
 * hash, com validade longa. Ele pode ser revogado, e é rotacionado a cada uso.
 */

export const CONTEUDO_ACESSO = z.object({
  sub: z.string().uuid(),
  org: z.string().uuid(),
  papel: z.enum(PAPEIS),
  nome: z.string(),
  sid: z.string().uuid(),
});

export type ConteudoAcesso = z.infer<typeof CONTEUDO_ACESSO>;

const EMISSOR = "dc360-api";
const PLATEIA = "dc360";

export async function emitirAcesso(
  segredo: Uint8Array,
  dados: ConteudoAcesso,
  minutos: number,
): Promise<string> {
  return new SignJWT({ org: dados.org, papel: dados.papel, nome: dados.nome, sid: dados.sid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(dados.sub)
    .setIssuer(EMISSOR)
    .setAudience(PLATEIA)
    .setIssuedAt()
    .setExpirationTime(`${minutos}m`)
    .sign(segredo);
}

/**
 * Verifica assinatura, emissor, plateia e validade, e SÓ ENTÃO valida o
 * formato do conteúdo com Zod.
 *
 * A segunda parte importa tanto quanto a primeira: a assinatura garante que o
 * conteúdo não foi adulterado, não que ele tem o formato esperado. Como o
 * campo `org` vira o contexto de tenant no banco, ele precisa ser um UUID
 * comprovado antes de chegar perto de uma consulta.
 *
 * Recebe uma LISTA de segredos e aceita o token que casar com qualquer um
 * deles. É isso que permite rotacionar o segredo sem derrubar quem já está
 * dentro: ver `separarSegredos` em `config.ts`, onde estão os dois
 * procedimentos opostos (rotação programada e revogação por vazamento).
 *
 * `algorithms: ["HS256"]` fica FIXO, e a lista de segredos não muda isso. Ler
 * o algoritmo do cabeçalho do token é a falha clássica de JWT: quem manda o
 * token escolheria `none` (sem assinatura nenhuma) ou trocaria a família
 * inteira. Aqui quem decide o algoritmo é o servidor, e o token só diz o
 * conteúdo.
 */
export async function verificarAcesso(
  segredos: readonly Uint8Array[],
  token: string,
): Promise<ConteudoAcesso | null> {
  for (const segredo of segredos) {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, segredo, {
        issuer: EMISSOR,
        audience: PLATEIA,
        algorithms: ["HS256"],
      }));
    } catch {
      // Assinatura de outro segredo, token expirado ou adulterado. Tenta o
      // próximo da lista: é o segredo que ainda não saiu da rotação.
      continue;
    }

    const analisado = CONTEUDO_ACESSO.safeParse({
      sub: payload.sub,
      org: payload["org"],
      papel: payload["papel"],
      nome: payload["nome"],
      sid: payload["sid"],
    });
    /*
      Assinatura boa e conteúdo torto para AQUI, e não segue para o próximo
      segredo. O token já foi provado autêntico: se o conteúdo dele não tem
      forma, quem o emitiu foi este produto com defeito, e nenhum outro segredo
      da lista vai mudar isso. Continuar o laço só gastaria HMAC.
    */
    return analisado.success ? analisado.data : null;
  }
  return null;
}

/**
 * A organização de um token de acesso AUTÊNTICO e VENCIDO, e nada mais.
 *
 * Existe para uma pergunta só, feita por `exigirAutenticacao` quando a
 * verificação normal recusou: "este token venceu, mas foi ESTE servidor que o
 * assinou, e de que município ele era?". A resposta decide entre o 401 de
 * sempre e o 403 de município suspenso (ver `auth/suspensao.ts`): sem ela o
 * aparelho de campo de uma prefeitura suspensa receberia 401 para sempre
 * depois de a renovação falhar, e leria isso como "entre de novo", que é o
 * ato que não resolve.
 *
 * A ordem em que o `jose` valida é o que torna isto seguro: a assinatura é
 * conferida ANTES das reivindicações, e `iss` e `aud` são conferidos ANTES de
 * `exp`. Então `JWTExpired` só é lançado para um token cuja assinatura casou
 * com um dos segredos, cujo emissor é este produto e cuja plateia é a de
 * acesso. Um token forjado, adulterado, de outro segredo ou de outra plateia
 * (o desafio do segundo fator, o console do fornecedor) cai em outro erro e
 * devolve `null` aqui, sem consultar banco nenhum.
 *
 * Devolve SÓ a organização, de propósito: o conteúdo de um token vencido não
 * serve para identificar ninguém nem para autorizar nada, e a única coisa que
 * quem chama vai fazer com ele é perguntar ao banco se aquele município está
 * suspenso.
 */
export async function organizacaoDoAcessoVencido(
  segredos: readonly Uint8Array[],
  token: string,
): Promise<string | null> {
  for (const segredo of segredos) {
    try {
      await jwtVerify(token, segredo, {
        issuer: EMISSOR,
        audience: PLATEIA,
        algorithms: ["HS256"],
      });
      // Válido: quem chama já deveria ter aceitado pelo caminho normal. Não é
      // vencido, então não há organização "de token vencido" a devolver.
      return null;
    } catch (erro) {
      if (!(erro instanceof ErrosJose.JWTExpired)) continue;
      const org = z.string().uuid().safeParse(erro.payload["org"]);
      return org.success ? org.data : null;
    }
  }
  return null;
}

/* ==========================================================================
   O token de desafio: o estado intermediário do login em duas etapas
   ========================================================================== */

/**
 * A PLATEIA É OUTRA, e essa é a linha que sustenta a segurança inteira do
 * login em duas etapas.
 *
 * Com o segundo fator, a rota de entrar passou a ter dois desfechos: ou a
 * sessão, ou "falta o código". O estado intermediário precisa viajar de alguma
 * forma até a segunda chamada, e a forma errada é tentadora: emitir o token de
 * acesso normal e "só não deixar a tela avançar". Isso seria dar acesso ANTES
 * do segundo fator, porque quem tem o token não precisa da tela para nada:
 * abre o console do navegador e chama a API direto, com o segundo fator ainda
 * pendente. O produto teria uma etapa a mais e nenhuma proteção a mais.
 *
 * Por isso o desafio é um token de PROPÓSITO ÚNICO, e o que o separa não é uma
 * convenção de nome dentro do conteúdo: é a plateia. `verificarAcesso` exige
 * `dc360`, então um token de desafio é recusado por TODA rota autenticada do
 * produto sem que nenhuma delas precise saber que ele existe. Uma rota nova
 * nasce protegida contra ele.
 *
 * Ele também não abre sessão nenhuma: não tem `sid`, porque não existe sessão
 * antes do segundo fator. A sessão nasce na segunda etapa, e é lá que o
 * `abrir_sessao` roda.
 */
const PLATEIA_DESAFIO = "dc360-desafio";

/**
 * Para que serve aquele desafio específico.
 *
 * `segundo_fator`: a pessoa já tem o recurso ligado e falta digitar o código.
 * `ativacao_do_segundo_fator`: a pessoa é administradora, o município exige o
 * segundo fator e ela ainda não ligou. Nesse caso o desafio abre a ativação, e
 * SÓ a ativação: enquanto ela não confirmar um código, não há sessão.
 *
 * São dois valores e não um porque o alcance é diferente, e um só faria a
 * rota de ativação aceitar o desafio de quem já tem o segundo fator ligado, o
 * que seria uma forma de trocar o segredo sem provar posse do aparelho atual.
 */
export const PROPOSITOS_DE_DESAFIO = ["segundo_fator", "ativacao_do_segundo_fator"] as const;
export type PropositoDeDesafio = (typeof PROPOSITOS_DE_DESAFIO)[number];

export const CONTEUDO_DESAFIO = z.object({
  sub: z.string().uuid(),
  org: z.string().uuid(),
  papel: z.enum(PAPEIS),
  nome: z.string(),
  pp: z.enum(PROPOSITOS_DE_DESAFIO),
});

export type ConteudoDesafio = z.infer<typeof CONTEUDO_DESAFIO>;

/**
 * Cinco minutos, e não os quinze do token de acesso.
 *
 * O desafio existe para atravessar a distância entre digitar a senha e digitar
 * o código que já está na tela do telefone. Isso leva segundos. Cada minuto a
 * mais é tempo em que um desafio copiado (do log de um proxy, do histórico de
 * uma extensão de navegador) continua servindo para tentar códigos, e o teto
 * de tentativas do segundo fator é a única coisa entre ele e a conta.
 */
export const DESAFIO_MINUTOS = 5;

export async function emitirDesafio(
  segredo: Uint8Array,
  dados: ConteudoDesafio,
): Promise<string> {
  return new SignJWT({ org: dados.org, papel: dados.papel, nome: dados.nome, pp: dados.pp })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(dados.sub)
    .setIssuer(EMISSOR)
    .setAudience(PLATEIA_DESAFIO)
    .setIssuedAt()
    .setExpirationTime(`${DESAFIO_MINUTOS}m`)
    .sign(segredo);
}

/** Mesma verificação do acesso, com a plateia do desafio. Ver `verificarAcesso`. */
export async function verificarDesafio(
  segredos: readonly Uint8Array[],
  token: string,
): Promise<ConteudoDesafio | null> {
  for (const segredo of segredos) {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, segredo, {
        issuer: EMISSOR,
        audience: PLATEIA_DESAFIO,
        algorithms: ["HS256"],
      }));
    } catch {
      continue;
    }

    const analisado = CONTEUDO_DESAFIO.safeParse({
      sub: payload.sub,
      org: payload["org"],
      papel: payload["papel"],
      nome: payload["nome"],
      pp: payload["pp"],
    });
    return analisado.success ? analisado.data : null;
  }
  return null;
}

/** Segredo opaco de 256 bits. Não carrega informação, então não há o que ler nele. */
export function gerarTokenRenovacao(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * O que vai para o banco é sempre o hash.
 *
 * SHA-256 sem sal e sem alongamento é adequado AQUI, e seria errado para
 * senha: o token já tem 256 bits de entropia aleatória, então não existe
 * ataque de dicionário contra ele, e o custo de derivação só atrasaria toda
 * renovação sem ganho nenhum.
 */
export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export type Identidade = {
  usuarioId: string;
  organizacaoId: string;
  papel: Papel;
  nome: string;
  sessaoId: string;
};
