-- C7c: o gatilho adiado recriado com uma condicao WHEN que nunca vale
DROP TRIGGER usuarios_origem_da_pessoa ON usuarios;
CREATE CONSTRAINT TRIGGER usuarios_origem_da_pessoa AFTER INSERT ON usuarios
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.organizacao_id IS NULL)
  EXECUTE FUNCTION conta_ganha_pessoa();
