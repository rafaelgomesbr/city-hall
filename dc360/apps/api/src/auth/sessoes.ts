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
 * A TRAVA ANTES DO UPDATE (V2-F00-E07, correcao 2, migracao 049)
 *
 * Uma renovacao no meio deste encerramento revoga a sessao antiga e abre a
 * nova. Sem trava comum, o UPDATE abaixo nao via nem uma nem outra (a antiga
 * ja rotacionada, a nova ainda nao confirmada), respondia que encerrou, e a
 * renovacao entregava um par novo numa cadeia encerrada. Agora a renovacao
 * roda numa transacao so sob `travar_sessoes_do_usuario`, e este caminho toma
 * a mesma trava num comando ANTERIOR ao UPDATE: em READ COMMITTED o UPDATE
 * seguinte tira fotografia nova e enxerga a sessao que a renovacao acabou de
 * confirmar. A trava tem de ser outro comando; no mesmo comando do UPDATE a
 * fotografia ja estaria tirada. Ela so sai no fim da transacao de quem chama.
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
     *
     * Sobrevive a CADEIA dela (`familia_id`, migracao 047), e nao so a linha: o
     * token de acesso emitido antes de uma renovacao carrega o `sid` da sessao
     * ja rotacionada, e a viva da mesma cadeia e outra linha. Preservar so o
     * `sid` derrubava a cadeia de quem pediu, enquanto a mensagem da rota
     * dizia que a sessao de onde a pessoa clicou continuava aberta.
     */
    preservarSessaoId?: string | null;
  },
): Promise<number> {
  await c.query("SELECT travar_sessoes_do_usuario($1)", [alvo.usuarioId]);
  const r = await c.query<{ id: string }>(
    `UPDATE sessoes
        SET revogada_em = now(), motivo_revogacao = $2
      WHERE usuario_id = $1
        AND revogada_em IS NULL
        AND ($3::uuid IS NULL
             OR familia_id IS DISTINCT FROM (SELECT familia_id FROM sessoes WHERE id = $3::uuid))
    RETURNING id`,
    [alvo.usuarioId, alvo.motivo, alvo.preservarSessaoId ?? null],
  );
  return r.rows.length;
}
