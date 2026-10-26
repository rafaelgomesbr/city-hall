-- R1 (controle): uma etapa REDEFINE uma funcao da base (consumir_recuperacao, 051) e o catalogo
-- da etapa declara redefine: true com a migracao 998. Deve PASSAR.
CREATE OR REPLACE FUNCTION consumir_recuperacao(p_token_hash text, p_senha_hash text)
RETURNS TABLE (usuario_id uuid, organizacao_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario uuid;
  v_ativo   boolean;
  v_rec     recuperacoes_senha%ROWTYPE;
BEGIN
  -- Redefinida por uma etapa (sabotagem R, migracao 998): o corpo muda, a forma nao.
  -- De quem e o link, sem travar nada ainda.
  SELECT r.usuario_id INTO v_usuario FROM recuperacoes_senha r
   WHERE r.token_hash = p_token_hash
     AND r.usada_em IS NULL
     AND r.expira_em > now();

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A linha da pessoa ANTES da linha do link (a ordem do cabecalho). Se uma
  -- redefinicao, troca ou desativacao esta no meio, espera ela confirmar e le
  -- a versao nova.
  SELECT u.ativo INTO v_ativo FROM usuarios u WHERE u.id = v_usuario FOR NO KEY UPDATE;

  -- O link de novo, agora travado: a mudanca que confirmou enquanto
  -- esperavamos ja o marcou pelo gatilho, e ele nao serve mais.
  SELECT * INTO v_rec FROM recuperacoes_senha r
   WHERE r.token_hash = p_token_hash
     AND r.usada_em IS NULL
     AND r.expira_em > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE recuperacoes_senha SET usada_em = now() WHERE id = v_rec.id;

  -- Conta desativada: o link e gasto e nada mais muda. Quem chama recebe a
  -- mesma resposta do link que nao vale mais.
  IF NOT coalesce(v_ativo, false) THEN
    RETURN;
  END IF;

  UPDATE usuarios
     SET senha_hash = p_senha_hash,
         falhas_login = 0,
         bloqueado_ate = NULL
   WHERE id = v_rec.usuario_id;

  PERFORM travar_sessoes_do_usuario(v_rec.usuario_id);

  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = 'senha redefinida'
   WHERE sessoes.usuario_id = v_rec.usuario_id AND revogada_em IS NULL;

  RETURN QUERY SELECT v_rec.usuario_id, v_rec.organizacao_id;
END;
$$;

REVOKE ALL ON FUNCTION consumir_recuperacao(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consumir_recuperacao(text, text) TO dc360_app;
