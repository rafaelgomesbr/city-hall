-- Volta da 052 (V2-F02-E07): tira os dois indices e a coluna.
-- Apaga a `chave_de_criacao` dos chamados que a tinham; o chamado em si fica.
-- So roda fora de producao (ver `db/src/desfazer.ts`).
DROP INDEX IF EXISTS evidencias_idempotencia_por_ocorrencia;
DROP INDEX IF EXISTS ocorrencias_chave_de_criacao;
ALTER TABLE ocorrencias DROP COLUMN IF EXISTS chave_de_criacao;
