-- C3b: um gatilho ADIADO e privilegiado (declarado e conferindo TG_RELID) apaga a pessoa
-- da conta eliminada so na confirmacao; a pessoa e declarada 'fica'.
DROP TRIGGER pessoas_nao_se_apagam ON pessoas;
CREATE FUNCTION sabotagem_pessoa_some() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public, pg_temp AS $$
  BEGIN
    IF TG_RELID IS DISTINCT FROM 'public.usuarios'::regclass THEN
      RAISE EXCEPTION 'so de usuarios' USING ERRCODE = 'insufficient_privilege';
    END IF;
    DELETE FROM pessoas WHERE id = OLD.pessoa_id;
    RETURN NULL;
  END $$;
REVOKE ALL ON FUNCTION sabotagem_pessoa_some() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER usuarios_pessoa_some AFTER DELETE ON usuarios
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sabotagem_pessoa_some();
