-- C7a: o gatilho privilegiado do espelho so dispara em replica
ALTER TABLE usuarios ENABLE REPLICA TRIGGER usuarios_espelha_credencial_na_pessoa;
