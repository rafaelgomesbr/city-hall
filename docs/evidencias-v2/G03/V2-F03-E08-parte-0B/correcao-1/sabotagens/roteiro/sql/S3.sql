-- S3: esquema novo com funcao SECURITY DEFINER que le organizacoes, EXECUTE ao app.
CREATE SCHEMA porta_dos_fundos;
CREATE FUNCTION porta_dos_fundos.contar_organizacoes() RETURNS bigint
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT count(*) FROM public.organizacoes $$;
REVOKE ALL ON FUNCTION porta_dos_fundos.contar_organizacoes() FROM PUBLIC;
GRANT USAGE ON SCHEMA porta_dos_fundos TO dc360_app;
GRANT EXECUTE ON FUNCTION porta_dos_fundos.contar_organizacoes() TO dc360_app;
