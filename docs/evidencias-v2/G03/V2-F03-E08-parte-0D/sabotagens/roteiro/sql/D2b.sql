-- D2b (item 2): policy RESTRICTIVE fora da lista nominal (o modo e parte do isolamento).
CREATE POLICY sabotagem_d2b ON orgaos AS RESTRICTIVE FOR SELECT
  USING (organizacao_id = app_organizacao_atual());
