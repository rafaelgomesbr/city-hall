-- D2 (item 2): uma segunda policy PERMISSIVA, que menciona o contexto, mas soma por OR
-- um ramo que nao depende do municipio. Cada texto parece certo; a composicao vaza.
CREATE POLICY sabotagem_d2 ON equipes FOR SELECT
  USING (organizacao_id = app_organizacao_atual() OR nome IS NOT NULL);
