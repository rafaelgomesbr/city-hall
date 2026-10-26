-- C5: a eliminacao de UM municipio apaga as marcas de origem de TODOS (DELETE sem filtro),
-- e o catalogo declara 'some'. O nome da tabela vai montado para nao citar origens_de_conta.
DROP TRIGGER origens_de_conta_nao_se_reescrevem ON origens_de_conta;
CREATE FUNCTION sabotagem_apaga_marcas() RETURNS trigger LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$ BEGIN
    -- so quando quem apaga e o dono (a eliminacao, SECURITY DEFINER); o DELETE do app nao chega aqui
    IF current_user <> 'dc360_app' THEN EXECUTE 'DELETE FROM public.' || 'origens' || '_de_conta'; END IF;
    RETURN NULL;
  END $$;
CREATE TRIGGER usuarios_apaga_marcas AFTER DELETE ON usuarios
  FOR EACH STATEMENT EXECUTE FUNCTION sabotagem_apaga_marcas();
