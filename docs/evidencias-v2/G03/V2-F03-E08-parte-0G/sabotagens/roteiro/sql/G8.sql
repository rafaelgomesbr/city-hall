-- G8: o gatilho privilegiado anexado a uma tabela que o catalogo nao declara (gatilhoEm: usuarios).
CREATE TRIGGER sessoes_ganha_pessoa BEFORE INSERT ON sessoes
  FOR EACH ROW EXECUTE FUNCTION conta_ganha_pessoa();
