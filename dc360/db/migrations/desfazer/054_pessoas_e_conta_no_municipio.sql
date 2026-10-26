-- Volta da 054 (V2-F03-E15): tira a pessoa global e devolve `usuarios` e
-- `sessoes` ao que a 053 deixou.
--
-- Sem perda de dado do produto: no passo 1 da ADR 0009 a credencial e o
-- e-mail continuam GRAVADOS em `usuarios`, e `pessoas` e copia deles pelo
-- espelho. O que some e a propria copia, a marca de origem de cada conta e a
-- ligacao `pessoa_id` (que a 054 reaplicada recria, com uuid novo).
-- So roda fora de producao (ver `db/src/desfazer.ts`).
--
-- O TEMP que a 054 tirou de PUBLIC, `dc360_app` e `dc360_console` (correcao 1,
-- C1) NAO volta: e endurecimento que nao depende de objeto nenhum da 054, nada
-- do produto usa tabela temporaria, e devolve-lo reabriria o caminho de anexar
-- gatilho em tabela temporaria a quem tivesse EXECUTE numa funcao de gatilho.

-- O privilegio de UPDATE volta a ser de TABELA, como na 001. O REVOKE de
-- tabela leva junto os privilegios de coluna que a 054 concedeu.
REVOKE UPDATE ON usuarios FROM dc360_app;
GRANT UPDATE ON usuarios TO dc360_app;

DROP TRIGGER IF EXISTS sessao_carrega_a_pessoa ON sessoes;
DROP TRIGGER IF EXISTS pessoa_recebe_a_credencial_da_conta ON usuarios;
DROP TRIGGER IF EXISTS usuarios_nenhuma_pessoa_sem_conta ON usuarios;
DROP TRIGGER IF EXISTS conta_nasce_no_municipio_do_contexto ON usuarios;
DROP TRIGGER IF EXISTS usuarios_pessoa_id_nao_muda_no_estado_final ON usuarios;
DROP TRIGGER IF EXISTS usuarios_pessoa_id_nao_muda ON usuarios;
DROP TRIGGER IF EXISTS usuarios_origem_da_pessoa ON usuarios;
DROP TRIGGER IF EXISTS usuarios_ganha_pessoa ON usuarios;

DROP FUNCTION IF EXISTS travar_pessoa_da_conta(uuid);
DROP FUNCTION IF EXISTS travar_pessoa(uuid);
DROP FUNCTION IF EXISTS credenciais_da_pessoa(text);
DROP FUNCTION IF EXISTS vigencia_da_sessao(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS sessao_carrega_a_pessoa();
DROP FUNCTION IF EXISTS pessoa_espelha_a_conta();
DROP FUNCTION IF EXISTS pessoa_da_conta_nao_muda();
DROP FUNCTION IF EXISTS conta_ganha_pessoa();
DROP FUNCTION IF EXISTS conta_nasce_no_contexto();

ALTER TABLE sessoes DROP CONSTRAINT IF EXISTS sessoes_conta_e_pessoa_do_mesmo_municipio;
ALTER TABLE sessoes DROP COLUMN IF EXISTS pessoa_id;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_org_id_pessoa_unico;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_pessoa_unica_no_municipio;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_uma_conta_por_pessoa;
ALTER TABLE usuarios DROP COLUMN IF EXISTS pessoa_id;

-- DROP TABLE nao dispara os gatilhos de linha permanente (eles somem junto).
DROP TABLE IF EXISTS origens_de_conta;
DROP TABLE IF EXISTS pessoas;
DROP FUNCTION IF EXISTS linha_permanente();
DROP FUNCTION IF EXISTS chave_da_pessoa_nao_muda();
