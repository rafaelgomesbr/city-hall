-- L1: controle legitimo. Tabela global no formato de `pessoas` e uma funcao privilegiada nova.
CREATE TABLE controle_pessoas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL);
ALTER TABLE controle_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE controle_pessoas FORCE ROW LEVEL SECURITY;
CREATE FUNCTION controle_legitimo(p_email text) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT p_email IS NOT NULL $$;
REVOKE ALL ON FUNCTION controle_legitimo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION controle_legitimo(text) TO dc360_app;
