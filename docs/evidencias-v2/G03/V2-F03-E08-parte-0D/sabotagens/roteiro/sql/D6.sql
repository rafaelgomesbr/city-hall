-- D6 (item 6): sequencia global com USAGE, SELECT e UPDATE ao papel de aplicacao.
CREATE SEQUENCE sabotagem_d6_contador_global;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE sabotagem_d6_contador_global TO dc360_app;
