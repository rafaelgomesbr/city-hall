-- S3b: tabela noutro esquema, sem RLS, com SELECT/INSERT/UPDATE/DELETE ao app.
CREATE SCHEMA porta_b;
CREATE TABLE porta_b.copia (id serial PRIMARY KEY, organizacao_id uuid, dado text);
GRANT USAGE ON SCHEMA porta_b TO dc360_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON porta_b.copia TO dc360_app;
GRANT USAGE ON SEQUENCE porta_b.copia_id_seq TO dc360_app;
