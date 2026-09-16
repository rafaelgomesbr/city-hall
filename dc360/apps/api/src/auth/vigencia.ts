import type { Papel } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import type { ConteudoAcesso } from "./tokens.js";
import { AcessoSuspenso } from "./suspensao.js";
import { FalhaAutenticacao } from "./servico.js";

/**
 * Se quem apresenta um token de acesso vivo AINDA PODE escrever.
 *
 * O DEFEITO QUE ISTO FECHA foi provado pelo revisor contra a API real:
 * `exigirAutenticacao` verificava só a assinatura, então conta desativada,
 * papel rebaixado e sessões encerradas por quem administra continuavam
 * ESCREVENDO (registrar, despachar, encerrar, subir vistoria) por até quinze
 * minutos. `auth/sessoes.ts` chamava isso de pendência. Em quinze minutos se
 * encerra uma ocorrência com motivo inventado, e a trilha não se corrige.
 *
 * UMA CONSULTA, e ela já existia: `auth/suspensao.ts` já ia ao banco em toda
 * escrita para saber se o município estava suspenso. Esta função responde,
 * na mesma ida e sob o mesmo RLS, mais três perguntas: a conta está ativa, o
 * papel é o do token, a sessão do token está de pé. E uma quarta, da
 * migração 046: a senha ainda é provisória, e até quando.
 *
 * A SESSÃO ROTACIONADA NÃO CONTA COMO ENCERRADA. Renovar revoga a sessão
 * antiga com motivo `rotacionada na renovacao` e abre outra; o token de
 * acesso emitido na antiga é legítimo pelos seus quinze minutos, e a fila do
 * aparelho pode estar no meio de um envio com ele. Recusá-lo transformaria
 * cada renovação numa expulsão, e 401 na fila é falha permanente
 * (`packages/campo/src/transporte.ts`). O que se recusa é a sessão que
 * ALGUÉM encerrou: a própria pessoa, quem administra, a troca de senha, o
 * reuso de token, a suspensão.
 *
 * LEITURA NÃO PASSA POR AQUI, e a troca continua a de `auth/suspensao.ts`:
 * quinze minutos de leitura com token vivo não produzem registro, e o custo
 * de uma ida ao banco em cada leitura de uma noite de chuva é o que se
 * compra. As leituras do agente de campo já consultam `usuarios` pela equipe
 * (`rotas/recorte-do-agente.ts`), mas não a sessão. Fica declarado.
 */

export type Vigencia = {
  /** O município do token, como `auth/suspensao.ts` o classifica. */
  acesso: "ativo" | "suspenso" | "inexistente";
  /** A conta existe e está ativa. */
  usuarioAtivo: boolean;
  /** O papel GRAVADO, que pode não ser o do token. */
  papel: Papel | null;
  /** A sessão do token (`sid`) não foi encerrada por ninguém. */
  sessaoViva: boolean;
  /** `senha_provisoria_ate`, quando a senha ainda é a sorteada. */
  senhaProvisoriaAte: Date | null;
};

export async function lerVigencia(
  banco: Banco,
  conteudo: Pick<ConteudoAcesso, "sub" | "org" | "sid">,
): Promise<Vigencia> {
  return banco.comTenant(conteudo.org, async (c) => {
    const r = await c.query<{
      suspenso: boolean;
      ativo: boolean | null;
      papel: Papel | null;
      senha_provisoria_ate: string | null;
      sessao_viva: boolean;
    }>(
      `SELECT (o.acesso_suspenso_em IS NOT NULL OR o.eliminada_em IS NOT NULL) AS suspenso,
              u.ativo, u.papel, u.senha_provisoria_ate,
              EXISTS (
                SELECT 1 FROM sessoes s
                 WHERE s.id = $2 AND s.usuario_id = u.id
                   AND (s.revogada_em IS NULL
                        OR s.motivo_revogacao = 'rotacionada na renovacao')
              ) AS sessao_viva
         FROM organizacoes o
         LEFT JOIN usuarios u ON u.id = $1 AND u.organizacao_id = o.id
        WHERE o.id = $3`,
      [conteudo.sub, conteudo.sid, conteudo.org],
    );
    const linha = r.rows[0];
    if (!linha) {
      return {
        acesso: "inexistente", usuarioAtivo: false, papel: null, sessaoViva: false,
        senhaProvisoriaAte: null,
      };
    }
    return {
      acesso: linha.suspenso ? "suspenso" : "ativo",
      usuarioAtivo: linha.ativo === true,
      papel: linha.papel,
      sessaoViva: linha.sessao_viva,
      senhaProvisoriaAte: linha.senha_provisoria_ate ? new Date(linha.senha_provisoria_ate) : null,
    };
  });
}

export const MENSAGEM_DE_SESSAO_ENCERRADA =
  "Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente.";

/**
 * Lança o erro certo para a vigência lida, na ordem que importa.
 *
 * Suspensão primeiro, com o status que a rota pediu (403, ou 503 para a fila
 * do aparelho): é a resposta que manda procurar o contrato, e vale mesmo que
 * a conta também tenha sido desativada. Depois, tudo que é "entre de novo"
 * vira 401 `sessao`, que o painel e o aparelho já tratam: conta que sumiu ou
 * foi desativada, papel diferente do token, sessão encerrada, e senha
 * provisória que venceu sem ser trocada (entrar de novo vai dizer o que
 * fazer).
 */
export function exigirVigencia(
  vigencia: Vigencia,
  conteudo: Pick<ConteudoAcesso, "papel">,
  statusDaSuspensao: 403 | 503,
  agora: Date = new Date(),
): void {
  if (vigencia.acesso !== "ativo") throw new AcessoSuspenso(statusDaSuspensao);
  if (
    !vigencia.usuarioAtivo
    || vigencia.papel !== conteudo.papel
    || !vigencia.sessaoViva
    || (vigencia.senhaProvisoriaAte !== null && vigencia.senhaProvisoriaAte < agora)
  ) {
    throw new FalhaAutenticacao("sessao", MENSAGEM_DE_SESSAO_ENCERRADA);
  }
}
