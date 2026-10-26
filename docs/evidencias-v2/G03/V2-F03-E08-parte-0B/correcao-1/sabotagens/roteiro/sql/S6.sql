-- S6: tabela sem organizacao_id e sem RLS.
CREATE TABLE sabotagem_sem_org (id integer PRIMARY KEY, dado text);
GRANT SELECT, INSERT ON sabotagem_sem_org TO dc360_app;
