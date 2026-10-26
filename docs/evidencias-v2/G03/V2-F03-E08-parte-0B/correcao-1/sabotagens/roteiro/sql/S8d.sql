-- S8d: qualquer operador do console reescreve qualquer operador.
CREATE POLICY sabotagem_operadores ON console_operadores
  FOR UPDATE TO dc360_console USING (true) WITH CHECK (true);
