-- D4b (item 4): USING com a guarda, WITH CHECK irrestrito no UPDATE dos operadores.
-- Lidos juntos num texto so, os dois pareciam conter a guarda.
ALTER POLICY console_operadores_atualizacao ON console_operadores WITH CHECK (true);
