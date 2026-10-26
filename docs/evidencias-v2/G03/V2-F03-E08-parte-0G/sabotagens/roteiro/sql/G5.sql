-- G5: tabela sem organizacao_id fingindo ser protegida: RLS ativada mas nao forcada, INSERT ao app
-- e uma policy aberta. O catalogo (e15/G5.ts) a declara protegida, com o grant que ela tem.
CREATE TABLE marcas_de_sabotagem (usuario_id uuid PRIMARY KEY);
ALTER TABLE marcas_de_sabotagem ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON marcas_de_sabotagem TO dc360_app;
CREATE POLICY marcas_abertas ON marcas_de_sabotagem FOR INSERT TO dc360_app WITH CHECK (true);
