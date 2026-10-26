-- S8: policies FOR ALL no livro de eliminacoes.
CREATE POLICY sabotagem_app ON eliminacoes_de_municipio FOR ALL TO dc360_app USING (true) WITH CHECK (true);
CREATE POLICY sabotagem_tudo ON eliminacoes_de_municipio USING (true);
