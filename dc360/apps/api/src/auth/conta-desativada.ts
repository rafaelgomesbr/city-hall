import { CODIGOS_DE_ERRO_DE_ACESSO } from "@dc360/shared";

/**
 * O erro que vira a resposta `403 conta_desativada`.
 *
 * É 403, e não 401, porque a credencial está certa: o token é legítimo e a
 * sessão existe. O que mudou é a conta, e entrar de novo não resolve (a
 * entrada recusa a conta desativada com a recusa genérica de senha errada).
 * O cliente que lê 401 renova, repete e entra de novo em laço; o que lê este
 * 403 sabe que precisa parar e mandar a pessoa à coordenação.
 *
 * Mora em arquivo próprio porque dois lugares o lançam (`auth/vigencia.ts`, na
 * escrita com token vivo, e a renovação em `auth/servico.ts`), e um importando
 * o outro seria um ciclo.
 *
 * Só sai para quem apresentou token ou renovação válidos: não revela nada a
 * quem não tinha credencial. `/auth/entrar` continua com a mensagem genérica.
 */
export class ContaDesativada extends Error {
  readonly codigo = "conta_desativada" as const;
  readonly status = CODIGOS_DE_ERRO_DE_ACESSO.conta_desativada.status;
  constructor() {
    super(CODIGOS_DE_ERRO_DE_ACESSO.conta_desativada.mensagem);
    this.name = "ContaDesativada";
  }
}
