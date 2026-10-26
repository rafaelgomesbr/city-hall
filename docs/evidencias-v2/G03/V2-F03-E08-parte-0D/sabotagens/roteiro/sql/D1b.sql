-- D1b (item 1): tabela NOVA, com organizacao_id, RLS forcada, grants ao app e uma
-- policy com OR true. Nenhuma lista a conhece; so a descoberta pelo catalogo a acha.
CREATE TABLE sabotagem_d1b (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES organizacoes(id),
  nota text NOT NULL
);
ALTER TABLE sabotagem_d1b ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabotagem_d1b FORCE ROW LEVEL SECURITY;
-- Policies comando a comando (sem FOR ALL, que o portao contra apagar ja pegava).
CREATE POLICY sabotagem_d1b_leitura ON sabotagem_d1b FOR SELECT
  USING (organizacao_id = app_organizacao_atual() OR true);
CREATE POLICY sabotagem_d1b_insercao ON sabotagem_d1b FOR INSERT
  WITH CHECK (organizacao_id = app_organizacao_atual() OR true);
CREATE POLICY sabotagem_d1b_atualizacao ON sabotagem_d1b FOR UPDATE
  USING (organizacao_id = app_organizacao_atual() OR true)
  WITH CHECK (organizacao_id = app_organizacao_atual() OR true);
GRANT SELECT, INSERT, UPDATE ON sabotagem_d1b TO dc360_app;
