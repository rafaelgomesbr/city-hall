-- G3: chave estrangeira para a tabela global SEM a declaracao da chave no catalogo.
ALTER TABLE sessoes ADD CONSTRAINT sessoes_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES pessoas (id);
