-- Qualquer operador do console (não só o dono) passa a poder escrever no livro de eliminações.
CREATE POLICY sabotagem_update_sem_dono ON eliminacoes_de_municipio
  FOR UPDATE TO dc360_console USING (true) WITH CHECK (true);
CREATE POLICY sabotagem_insert_sem_dono ON eliminacoes_de_municipio
  FOR INSERT TO dc360_console WITH CHECK (true);
