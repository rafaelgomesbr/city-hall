-- C8a: a chave para a pessoa global recriada NOT VALID
ALTER TABLE usuarios DROP CONSTRAINT usuarios_pessoa_id_fkey;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_pessoa_id_fkey
  FOREIGN KEY (pessoa_id) REFERENCES pessoas (id) NOT VALID;
