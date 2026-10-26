-- C1b: a E08 encolhe, mas deixa o UPDATE de senha_hash
REVOKE SELECT, INSERT, UPDATE ON usuarios FROM dc360_app;
GRANT SELECT (id, organizacao_id, nome, matricula, email, papel, equipe_id, ativo, criado_em, ultimo_acesso, foto_chave, busca, foto_bytes, pessoa_id) ON usuarios TO dc360_app;
GRANT INSERT (id, organizacao_id, nome, matricula, papel, equipe_id, ativo, foto_chave, foto_bytes) ON usuarios TO dc360_app;
GRANT UPDATE (nome, matricula, papel, equipe_id, ativo, foto_chave, foto_bytes, senha_hash) ON usuarios TO dc360_app;
