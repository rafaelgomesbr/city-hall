-- GT: o privilegio TEMP que o PostgreSQL da a PUBLIC por padrao num banco criado do template0 (o
-- PGlite roda no template1, que nao o tem; esta migracao poe o banco do teste como o de producao).
-- Com ele e o EXECUTE da 054 de hoje em conta_ganha_pessoa, o dc360_app cria pg_temp.usuarios, anexa
-- o gatilho privilegiado e o faz gravar em pessoas e origens_de_conta como o dono.
DO $$ BEGIN
  EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO PUBLIC', current_database());
END $$;
