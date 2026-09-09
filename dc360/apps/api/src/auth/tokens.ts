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
