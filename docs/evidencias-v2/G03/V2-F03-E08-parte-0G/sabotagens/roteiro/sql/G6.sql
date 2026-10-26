-- G6: o destino na eliminacao mente. O catalogo diz que a marca FICA; esta migracao tira a trava de
-- permanencia e faz a marca sumir junto com a conta, que a eliminacao do municipio apaga.
DROP TRIGGER origens_de_conta_nao_se_reescrevem ON origens_de_conta;
CREATE FUNCTION marca_some_com_a_conta() RETURNS trigger LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$ BEGIN DELETE FROM public.origens_de_conta WHERE usuario_id = OLD.id; RETURN OLD; END $$;
REVOKE ALL ON FUNCTION marca_some_com_a_conta() FROM PUBLIC;
CREATE TRIGGER usuarios_leva_a_marca AFTER DELETE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION marca_some_com_a_conta();
