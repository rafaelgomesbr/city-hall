-- C1c (controle): a E08 encolhe o privilegio de usuarios na forma da ADR
REVOKE SELECT, INSERT, UPDATE ON usuarios FROM dc360_app;
GRANT SELECT (id, organizacao_id, nome, matricula, email, papel, equipe_id, ativo, criado_em, ultimo_acesso, foto_chave, busca, foto_bytes, pessoa_id) ON usuarios TO dc360_app;
GRANT INSERT (id, organizacao_id, nome, matricula, papel, equipe_id, ativo, foto_chave, foto_bytes) ON usuarios TO dc360_app;
GRANT UPDATE (nome, matricula, papel, equipe_id, ativo, foto_chave, foto_bytes) ON usuarios TO dc360_app;
