import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
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
 */
export async function verificarAcesso(
  segredo: Uint8Array,
  token: string,
): Promise<ConteudoAcesso | null> {
  try {
    const { payload } = await jwtVerify(token, segredo, {
      issuer: EMISSOR,
      audience: PLATEIA,
      algorithms: ["HS256"],
    });
    const analisado = CONTEUDO_ACESSO.safeParse({
      sub: payload.sub,
      org: payload["org"],
      papel: payload["papel"],
      nome: payload["nome"],
      sid: payload["sid"],
    });
    return analisado.success ? analisado.data : null;
  } catch {
    return null;
  }
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
