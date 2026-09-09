import type { Consulta } from "../banco/tipos.js";

/**
 * Encerra sessoes abertas de um usuario, dentro do municipio corrente.
 *
 * POR QUE UM UPDATE DIRETO, E NAO `revogar_sessoes_do_usuario`
 *
 * A funcao da migracao 002 existe para o que acontece ANTES de haver contexto
 * de tenant (login, renovacao, reuso de token roubado), e por isso ela e
 * SECURITY DEFINER: ela passa por cima do RLS. Aqui ja existe contexto, porque
 * quem pede esta autenticado e a organizacao veio do token. Usar a funcao de
 * privilegio elevado num caminho que nao precisa dela deixaria o isolamento
 * dependendo apenas do `WHERE` que a rota escreveu: um `id` vindo do parametro
 * de rota, sem conferencia, derrubaria a sessao de qualquer municipio.
 *
 * Com o UPDATE direto, a policy `sessoes_isolamento` roda por baixo e recusa
 * linha de outro municipio mesmo que a rota erre a conferencia. A conferencia
 * continua existindo (e o que produz o 404), esta e a segunda barreira.
 *
 * O QUE ISTO NAO FAZ
 *
 * Encerrar a sessao mata a RENOVACAO, nao o token de acesso ja emitido: o
 * token de acesso e um JWT verificado por assinatura, sem ida ao banco (ver
 * `exigirAutenticacao` em `servidor.ts`), e continua valendo ate expirar, no
 * maximo `ACESSO_MINUTOS` (15 por padrao). Ou seja, quem foi expulso ainda
 * consegue chamar a API por essa janela. Fechar isso exigiria conferir a
 * sessao no banco a cada requisicao, o que muda `servidor.ts` e o custo de
 * toda rota, e por isso esta anotado como pendencia em vez de meio feito.
 *
 * @returns quantas sessoes estavam abertas e foram encerradas agora.
 */
export async function encerrarSessoes(
  c: Consulta,
  alvo: {
    usuarioId: string;
    /** Fica gravado na propria sessao, e e o que explica um logout inesperado. */
    motivo: string;
    /**
     * A sessao de quem pediu, quando ela deve sobreviver. `null` derruba tudo.
     */
    preservarSessaoId?: string | null;
  },
): Promise<number> {
  const r = await c.query<{ id: string }>(
    `UPDATE sessoes
        SET revogada_em = now(), motivo_revogacao = $2
      WHERE usuario_id = $1
        AND revogada_em IS NULL
        AND ($3::uuid IS NULL OR id <> $3::uuid)
    RETURNING id`,
    [alvo.usuarioId, alvo.motivo, alvo.preservarSessaoId ?? null],
  );
  return r.rows.length;
}
