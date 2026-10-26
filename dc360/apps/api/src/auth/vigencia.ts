import { CODIGOS_DE_ERRO_DE_ACESSO, type Papel } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import type { ConteudoAcesso } from "./tokens.js";
import { AcessoSuspenso } from "./suspensao.js";
import { ContaDesativada } from "./conta-desativada.js";
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
 * A SESSÃO ROTACIONADA SÓ VALE ENQUANTO A CADEIA DELA VIVE. Renovar revoga
 * a sessão antiga com motivo `rotacionada na renovacao` e abre outra; o token
 * de acesso emitido na antiga é legítimo pelos seus quinze minutos, e a fila
 * do aparelho pode estar no meio de um envio com ele. Recusá-lo transformaria
 * cada renovação numa expulsão, e 401 na fila pausa o envio. Mas "foi
 * rotacionada" não basta: se depois alguém encerra a cadeia (a própria
 * pessoa, quem administra, o reuso de token, a troca de senha, a suspensão),
 * quem cai é a sessão NOVA, e a antiga, já revogada por rotação, continuava
 * contando como viva. Desde a migração 047 as sessões de uma cadeia
 * compartilham `familia_id`, e a rotacionada só vale se a família ainda tem
 * sessão de pé (`revogada_em IS NULL`). Os encerramentos não mudaram com a
 * 047: todos atingem a sessão viva, e isso derruba a cadeia inteira. Desde a
 * migração 049 eles e a renovação tomam a mesma trava por pessoa, e desde a
 * correção 3 da E07 o login também a toma
 * (`travar_sessoes_do_usuario`, ver `auth/sessoes.ts`), e a renovação é uma
 * transação só: nenhum encerramento cai no meio de uma renovação sem ver a
 * sessão nova, e a família nunca fica sem sessão de pé no meio da rotação.
 *
 * O PAPEL DIFERENTE DO TOKEN NÃO É SESSÃO ENCERRADA. O token continua
 * legítimo e a sessão está de pé: o que mudou foi o cadastro. A resposta é
 * 401 `nao_autenticado`, que o cliente já trata como "renove e repita", e a
 * renovação lê o papel do banco e devolve o token com o papel novo. Trocar o
 * papel de alguém NÃO revoga as sessões dela (decisão da E07, registrada em
 * `apps/api/PENDENCIAS.md`): revogar obrigaria a pessoa a entrar de novo,
 * com a coleta de campo na fila, para receber exatamente o que a renovação
 * entrega sem ela notar. A segurança não depende disso: a escrita confere o
 * papel do banco, então o token velho não escreve com o papel antigo.
 *
 * LEITURA PURA NÃO PASSA POR AQUI, e a troca continua a de `auth/suspensao.ts`:
 * quinze minutos de leitura com token vivo não praticam ato nem mudam dado do
 * município (o dossiê e a busca gravam só o registro de que foram lidos, ver
 * abaixo), e o custo de uma ida ao banco em cada leitura de uma noite de chuva
 * é o que se compra. As leituras do agente de campo já consultam `usuarios` pela equipe
 * (`rotas/recorte-do-agente.ts`), mas não a sessão. Fica declarado.
 *
 * MAS GET QUE ESCREVE PASSA, e quem decide é a rota, não o método. As rotas
 * GET marcadas com `ROTA_GET_COM_EFEITO` (`servidor.ts`) são tratadas como
 * escrita, junto com o HEAD delas: o laudo, o termo de interdição, o termo de
 * desinterdição e os PDFs (emitir É gravar a trilha, e o termo É interditar),
 * o CSV de ocorrências (grava `exportacoes`) e o sino `GET /avisos`
 * (materializa e expurga avisos). Fica de fora o GET cuja única escrita é o
 * registro de que ele foi lido (`registrarConsulta`: o dossiê e a busca): é
 * leitura, e a vigência dela é da F03-E03. A lista é conferida por
 * `test/get-com-efeito.test.ts`. Foi o que a validação de 7005a60 provou: com
 * a decisão só pelo método, conta desativada, papel rebaixado e cadeia
 * encerrada interditavam imóvel e exportavam dado pessoal por GET.
 */

export type Vigencia = {
  /** O município do token, como `auth/suspensao.ts` o classifica. */
  acesso: "ativo" | "suspenso" | "inexistente";
  /** A conta existe e está ativa. */
  usuarioAtivo: boolean;
  /**
   * A conta existe e foi DESATIVADA. Separada de `!usuarioAtivo` porque conta
   * que sumiu (ou de outro município) não é conta desativada, e o cliente age
   * diferente: desativada para de tentar, sumida entra de novo.
   */
  contaDesativada: boolean;
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
                        OR (s.motivo_revogacao = 'rotacionada na renovacao'
                            AND EXISTS (
                              SELECT 1 FROM sessoes v
                               WHERE v.familia_id = s.familia_id
                                 AND v.revogada_em IS NULL
                            )))
              ) AS sessao_viva
         FROM organizacoes o
         LEFT JOIN usuarios u ON u.id = $1 AND u.organizacao_id = o.id
        WHERE o.id = $3`,
      [conteudo.sub, conteudo.sid, conteudo.org],
    );
    const linha = r.rows[0];
    if (!linha) {
      return {
        acesso: "inexistente", usuarioAtivo: false, contaDesativada: false, papel: null,
        sessaoViva: false, senhaProvisoriaAte: null,
      };
    }
    return {
      acesso: linha.suspenso ? "suspenso" : "ativo",
      usuarioAtivo: linha.ativo === true,
      contaDesativada: linha.ativo === false,
      papel: linha.papel,
      sessaoViva: linha.sessao_viva,
      senhaProvisoriaAte: linha.senha_provisoria_ate ? new Date(linha.senha_provisoria_ate) : null,
    };
  });
}

export const MENSAGEM_DE_SESSAO_ENCERRADA = CODIGOS_DE_ERRO_DE_ACESSO.sessao_encerrada.mensagem;

/**
 * Lança o erro certo para a vigência lida, na ordem que importa.
 *
 * Suspensão primeiro, com o status que a rota pediu (403, ou 503 para a fila
 * do aparelho): é a resposta que manda procurar o contrato, e vale mesmo que
 * a conta também tenha sido desativada. Depois, conta desativada vira 403
 * `conta_desativada`, ANTES do resto de propósito: desativar a conta encerra
 * as sessões dela, então se a ordem fosse outra a conta desativada sairia como
 * `sessao_encerrada`, o cliente mandaria entrar de novo, e entrar de novo não
 * resolve. Depois, tudo que é "entre de novo" vira 401 `sessao_encerrada`:
 * conta que sumiu, sessão encerrada (ou cadeia encerrada), e senha provisória
 * que venceu sem ser trocada (entrar de novo vai dizer o que fazer). Por
 * último o papel: diferente do token vira 401 `nao_autenticado`, "renove e
 * repita", porque a sessão está de pé e a renovação já traz o papel novo. A
 * ordem importa: quem foi rebaixado E derrubado entra de novo, em vez de
 * renovar e descobrir só na renovação. O catálogo é
 * `packages/shared/src/codigos-de-erro.ts`.
 */
export function exigirVigencia(
  vigencia: Vigencia,
  conteudo: Pick<ConteudoAcesso, "papel">,
  statusDaSuspensao: 403 | 503,
  agora: Date = new Date(),
): void {
  if (vigencia.acesso !== "ativo") throw new AcessoSuspenso(statusDaSuspensao);
  if (vigencia.contaDesativada) throw new ContaDesativada();
  if (
    !vigencia.usuarioAtivo
    || !vigencia.sessaoViva
    || (vigencia.senhaProvisoriaAte !== null && vigencia.senhaProvisoriaAte < agora)
  ) {
    throw new FalhaAutenticacao("sessao_encerrada", MENSAGEM_DE_SESSAO_ENCERRADA);
  }
  if (vigencia.papel !== conteudo.papel) {
    throw new FalhaAutenticacao("nao_autenticado", CODIGOS_DE_ERRO_DE_ACESSO.nao_autenticado.mensagem);
  }
}
