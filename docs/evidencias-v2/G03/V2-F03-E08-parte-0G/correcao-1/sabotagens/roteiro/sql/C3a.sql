-- C3a: um gatilho ADIADO que recusa so na confirmacao da eliminacao
CREATE FUNCTION sabotagem_recusa_no_fim() RETURNS trigger LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$ BEGIN RAISE EXCEPTION 'sabotagem C3a: recusa na confirmacao'; END $$;
CREATE CONSTRAINT TRIGGER usuarios_recusa_no_fim AFTER DELETE ON usuarios
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sabotagem_recusa_no_fim();
