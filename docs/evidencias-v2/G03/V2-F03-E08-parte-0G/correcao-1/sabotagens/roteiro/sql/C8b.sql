-- C8b: a chave para a pessoa global referencia OUTRA coluna unica de pessoas
ALTER TABLE pessoas ADD COLUMN espelho uuid GENERATED ALWAYS AS (id) STORED;
ALTER TABLE pessoas ADD CONSTRAINT pessoas_espelho_key UNIQUE (espelho);
ALTER TABLE usuarios DROP CONSTRAINT usuarios_pessoa_id_fkey;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_pessoa_id_fkey
  FOREIGN KEY (pessoa_id) REFERENCES pessoas (espelho);
