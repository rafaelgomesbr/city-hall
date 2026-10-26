-- G3b: chave estrangeira sem organizacao_id para uma tabela que NAO e global (a protegida origens_de_conta),
-- e o catalogo (e15/G3b.ts) a declara em chavesParaGlobais como se fosse.
ALTER TABLE usuarios ADD CONSTRAINT usuarios_origem_fkey FOREIGN KEY (id) REFERENCES origens_de_conta (usuario_id);
