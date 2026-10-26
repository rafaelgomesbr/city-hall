-- D3 (item 3): visao sem security_invoker sobre ocorrencias, com SELECT ao papel de aplicacao.
-- Ela le como o dono, e o RLS de quem consulta some.
CREATE VIEW sabotagem_d3 AS SELECT id, organizacao_id, protocolo FROM ocorrencias;
GRANT SELECT ON sabotagem_d3 TO dc360_app;
