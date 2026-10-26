-- D1 (item 1): policy de leitura com OR true numa tabela de negocio que ja existe.
-- O texto contem app_organizacao_atual(), entao a regra textual do portao aceitava.
CREATE POLICY sabotagem_d1 ON equipes FOR SELECT
  USING (organizacao_id = app_organizacao_atual() OR true);
