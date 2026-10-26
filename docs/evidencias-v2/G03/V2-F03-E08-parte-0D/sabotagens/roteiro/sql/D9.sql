-- D9 (correcao 3 da ADR 0009): funcao comum que grava em origens_de_conta (a tabela da E15
-- ainda nao existe; o corpo plpgsql nao e validado na criacao). Chamada de dentro de uma
-- funcao privilegiada, ela gravaria a origem da conta com os privilegios do dono.
CREATE FUNCTION sabotagem_d9_marca_origem(p_usuario uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = public, pg_temp
  AS $$ BEGIN INSERT INTO origens_de_conta (usuario_id, origem) VALUES (p_usuario, 'aceite'); END $$;
REVOKE ALL ON FUNCTION sabotagem_d9_marca_origem(uuid) FROM PUBLIC;
