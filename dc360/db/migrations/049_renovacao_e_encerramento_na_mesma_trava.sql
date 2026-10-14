-- =====================================================================
-- 049: a renovacao e todo encerramento em massa das sessoes de uma pessoa
--      passam pela MESMA trava, e `abrir_sessao` recusa herdar familia
--      encerrada.
--
-- O DEFEITO (V2-F00-E07, rodada 2 da validacao, provado em Postgres 18.3).
-- A renovacao revoga a sessao antiga (`revogar_sessao`) e abre a nova
-- (`abrir_sessao`, migracao 047) herdando a familia. Se quem administra
-- encerra as sessoes da pessoa no meio, o UPDATE dele procura sessao com
-- `revogada_em IS NULL` e nao acha nada daquela cadeia: a antiga ja foi
-- rotacionada e a nova ainda nao existe (ou existe numa transacao que ainda
-- nao confirmou, e em READ COMMITTED o UPDATE nao a enxerga). Ele responde
-- 200, a renovacao abre a sessao nova, e quem tinha o token sai com um par
-- que renova por catorze dias. Sobrou sessao viva em 5 de 60 corridas.
--
-- A CORRECAO, em duas pecas que so funcionam juntas:
--
--   1. `travar_sessoes_do_usuario(uuid)`: uma trava consultiva de transacao
--      (`pg_advisory_xact_lock`) por pessoa. A renovacao a toma ANTES de
--      revogar a antiga e so a solta no COMMIT, com a nova ja aberta (a API
--      faz as tres coisas numa transacao so, `auth/servico.ts`). Todo
--      encerramento em massa a toma num comando ANTERIOR ao UPDATE: em READ
--      COMMITTED cada comando de uma funcao VOLATILE tira fotografia nova, e
--      o UPDATE que vem depois da trava enxerga a sessao que a renovacao
--      acabou de confirmar. Se o encerramento chega primeiro, a renovacao
--      espera, e o `revogar_sessao` dela devolve zero (a sessao ja foi
--      encerrada), o que a faz desistir sem emitir par.
--      Tomam a trava aqui dentro: `revogar_sessoes_do_usuario` (reuso de
--      token, desativacao), `trocar_senha` (troca pela propria pessoa) e
--      `consumir_recuperacao` (link de email). O UPDATE direto de
--      `auth/sessoes.ts` (quem administra, a propria pessoa, a redefinicao
--      por quem administra) a toma pela API, no comando anterior.
--   2. `abrir_sessao` recusa herdar familia ENCERRADA: a que tem sessao
--      revogada por qualquer motivo que nao seja a rotacao. Com a trava isso
--      nao acontece; a recusa e a segunda barreira, no banco, para o dia em
--      que um caminho novo abrir sessao herdando familia sem a trava. A
--      mensagem e a mesma das outras recusas da 047 (DC369): nao diz qual
--      condicao falhou.
--
-- O QUE NAO MUDA
--
--   - A rotacao nao e expulsao: a sessao rotacionada continua valendo para o
--     token de acesso emitido nela enquanto a cadeia tem sessao de pe
--     (`auth/vigencia.ts`). E, com a renovacao numa transacao so, nao existe
--     mais o instante em que a familia fica sem sessao viva: a escrita com o
--     token anterior que caia nesse instante deixa de levar 401.
--   - Nenhuma funcao SECURITY DEFINER nova: a trava e uma funcao comum
--     (SECURITY INVOKER) e as outras quatro sao recriadas com a mesma
--     assinatura, o mesmo dono e as mesmas permissoes (`CREATE OR REPLACE`
--     preserva o GRANT). O teto de 27 de `db/test/isolamento.test.ts` nao
--     muda.
--   - Nenhuma tabela, coluna ou policy nova.
--
-- ORDEM DE IMPLANTACAO: migre ANTES de implantar a API nova. A API nova chama
-- `travar_sessoes_do_usuario`, que nao existe num banco sem a 049: todo
-- encerramento e toda renovacao falhariam. O contrario e seguro: a API antiga
-- contra o banco migrado continua funcionando (as funcoes tem a mesma
-- assinatura e a renovacao normal nunca herda familia encerrada), so que sem
-- o conserto da corrida ate a API nova subir.
--
-- Idempotente: so `CREATE OR REPLACE`, `REVOKE` e `GRANT`. Migracao aplicada
-- nunca e editada (`HistoricoAlterado`): reverter e uma migracao nova.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A trava.
--
-- Duas chaves inteiras (o espaco de `pg_advisory_xact_lock(int, int)`), e nao
-- uma `bigint`: a trava do varredor de push (`push/trava.ts`) usa a forma de
-- uma chave so, e as duas formas nunca colidem. A primeira chave diz de que e
-- a trava; a segunda, de quem. Colisao de `hashtext` entre duas pessoas so
-- faz uma esperar a outra por milissegundos, nunca libera nada indevido.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION travar_sessoes_do_usuario(p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dc360.sessoes_do_usuario'), hashtext(p_usuario_id::text));
END;
$$;

COMMENT ON FUNCTION travar_sessoes_do_usuario(uuid) IS
  'Trava de transacao por pessoa que serializa a renovacao de sessao e todo encerramento em massa das sessoes dela (migracao 049). Tomada num comando anterior ao UPDATE, para o UPDATE enxergar a sessao que uma renovacao acabou de confirmar.';

REVOKE ALL ON FUNCTION travar_sessoes_do_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travar_sessoes_do_usuario(uuid) TO dc360_app;

-- ---------------------------------------------------------------------
-- 2. Os encerramentos em massa que moram no banco tomam a trava.
-- ---------------------------------------------------------------------

-- Reuso de token roubado e desativacao da conta (002).
CREATE OR REPLACE FUNCTION revogar_sessoes_do_usuario(p_usuario_id uuid, p_motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  PERFORM travar_sessoes_do_usuario(p_usuario_id);

  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = p_motivo
   WHERE usuario_id = p_usuario_id AND revogada_em IS NULL;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

-- Troca de senha pela propria pessoa (005).
CREATE OR REPLACE FUNCTION trocar_senha(
  p_usuario_id uuid,
  p_senha_hash text,
  p_sessao_preservada uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM travar_sessoes_do_usuario(p_usuario_id);

  UPDATE usuarios
     SET senha_hash = p_senha_hash, falhas_login = 0, bloqueado_ate = NULL
   WHERE id = p_usuario_id;

  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = 'senha trocada pelo proprio usuario'
   WHERE sessoes.usuario_id = p_usuario_id
     AND revogada_em IS NULL
     AND (p_sessao_preservada IS NULL OR id <> p_sessao_preservada);
END;
$$;

-- Redefinicao pelo link de email (005). A trava entra logo depois de saber de
-- quem e o link, antes de qualquer escrita.
CREATE OR REPLACE FUNCTION consumir_recuperacao(p_token_hash text, p_senha_hash text)
RETURNS TABLE (usuario_id uuid, organizacao_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec recuperacoes_senha%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM recuperacoes_senha r
   WHERE r.token_hash = p_token_hash
     AND r.usada_em IS NULL
     AND r.expira_em > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM travar_sessoes_do_usuario(v_rec.usuario_id);

  UPDATE recuperacoes_senha SET usada_em = now() WHERE id = v_rec.id;

  UPDATE usuarios
     SET senha_hash = p_senha_hash,
         falhas_login = 0,
         bloqueado_ate = NULL
   WHERE id = v_rec.usuario_id;

  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = 'senha redefinida'
   WHERE sessoes.usuario_id = v_rec.usuario_id AND revogada_em IS NULL;

  RETURN QUERY SELECT v_rec.usuario_id, v_rec.organizacao_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. abrir_sessao: a mesma da 047, mais a recusa de familia encerrada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION abrir_sessao(
  p_organizacao_id uuid,
  p_usuario_id uuid,
  p_token_hash text,
  p_duracao interval,
  p_user_agent text,
  p_ip text,
  p_familia_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_suspenso timestamptz;
BEGIN
  SELECT acesso_suspenso_em INTO v_suspenso FROM organizacoes WHERE id = p_organizacao_id;
  IF v_suspenso IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC367',
      MESSAGE = 'O acesso deste municipio esta suspenso pelo fornecedor.',
      DETAIL  = format('Suspenso desde %s. Nenhuma sessao nova abre ate a reativacao.', v_suspenso);
  END IF;

  -- Herdar familia so da familia que existe, do mesmo usuario e do mesmo
  -- municipio, E que nao foi encerrada. Encerrada e a familia com alguma
  -- sessao revogada por motivo que nao seja a rotacao: a renovacao so revoga
  -- por rotacao, e qualquer outro motivo (quem administra, a propria pessoa,
  -- sair, reuso, troca de senha, desativacao, suspensao) encerra a cadeia
  -- inteira. A mensagem nao diz qual das condicoes falhou. O usuario e o
  -- municipio repetidos na segunda pergunta nao mudam a resposta (uma familia
  -- e sempre de uma pessoa so, e esta funcao e a unica que herda), mas deixam
  -- o indice `sessoes_usuario_idx` (002) atender a busca, em vez de varrer a
  -- tabela inteira a cada renovacao.
  IF p_familia_id IS NOT NULL AND (
       NOT EXISTS (
         SELECT 1 FROM sessoes
          WHERE familia_id = p_familia_id
            AND usuario_id = p_usuario_id
            AND organizacao_id = p_organizacao_id
       )
    OR EXISTS (
         SELECT 1 FROM sessoes
          WHERE familia_id = p_familia_id
            AND usuario_id = p_usuario_id
            AND organizacao_id = p_organizacao_id
            AND revogada_em IS NOT NULL
            AND motivo_revogacao IS DISTINCT FROM 'rotacionada na renovacao'
       )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC369',
      MESSAGE = 'A familia de sessao informada nao existe para este usuario.';
  END IF;

  INSERT INTO sessoes (id, organizacao_id, usuario_id, token_hash, expira_em, user_agent, ip, familia_id)
  VALUES (v_id, p_organizacao_id, p_usuario_id, p_token_hash, now() + p_duracao,
          left(coalesce(p_user_agent, ''), 400), nullif(p_ip, '')::inet,
          coalesce(p_familia_id, v_id));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION abrir_sessao(uuid, uuid, text, interval, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abrir_sessao(uuid, uuid, text, interval, text, text, uuid) TO dc360_app;
REVOKE ALL ON FUNCTION revogar_sessoes_do_usuario(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revogar_sessoes_do_usuario(uuid, text) TO dc360_app;
REVOKE ALL ON FUNCTION trocar_senha(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trocar_senha(uuid, text, uuid) TO dc360_app;
REVOKE ALL ON FUNCTION consumir_recuperacao(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consumir_recuperacao(text, text) TO dc360_app;
