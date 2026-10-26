-- D4 (item 4): OR true dentro da guarda do dono, no cancelamento de eliminacao.
-- O texto continua contendo console_operador_e_dono().
ALTER POLICY eliminacoes_cancelamento_do_console ON eliminacoes_de_municipio
  USING ((console_operador_e_dono() OR true) AND banco_apagado_em IS NULL);
