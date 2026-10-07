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
 * O QUE ISTO FAZ COM O TOKEN DE ACESSO JA EMITIDO
 *
 * Encerrar a sessao mata a RENOVACAO e, na ESCRITA, o token de acesso
 * tambem: toda escrita relê a sessao do token no banco (`auth/vigencia.ts`,
 * na mesma consulta que ja conferia a suspensao do municipio), e sessao
 * encerrada responde 401 `sessao_encerrada` no pedido seguinte. O que sobra da janela de
 * `ACESSO_MINUTOS` (15 por padrao, teto de 60) e a LEITURA, que continua
 * confiando no token ate ele vencer, pela troca escrita em `auth/suspensao.ts`.
 *
 * A DATA IMPORTA, e esteve errada aqui: a conferencia na escrita nasceu em
 * 15/09/2026, ficou DESLIGADA de 17/09/2026 (commit b4439ac) ate a
 * V2-F00-E04 (2026-10-06), e desde a V2-F00-E07 vale pela FAMILIA da sessao
 * (`sessoes.familia_id`, migracao 047): o token emitido antes de uma
 * renovacao so escreve enquanto a cadeia tem sessao viva. Conferido contra
 * `servidor.ts` e `auth/vigencia.ts` na V2-F00-E22.
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
