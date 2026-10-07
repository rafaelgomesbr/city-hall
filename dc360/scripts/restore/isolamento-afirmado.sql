-- Isolamento entre municipios, AFIRMADO: cada verificacao reprova com EXCEPTION.
--
-- O isolamento.sql (copia da sonda da E25) so IMPRIME o comportamento, e quem
-- decide se esta certo e a leitura humana. Em CI isso nao serve: o veredito
-- precisa ser o codigo de saida. Este arquivo refaz as mesmas perguntas e
-- falha alto. Roda como o LOGIN da aplicacao (dc360_api) assumindo dc360_app,
-- exatamente como a API faz; contar linhas como superusuario nao prova nada
-- sobre RLS.
--
-- Uso: psql -X -v ON_ERROR_STOP=1 -f isolamento-afirmado.sql  (como dc360_api)
-- Municipio A = Serra Alta, B = Vale Fundo (ids fixos da semente).
\set ON_ERROR_STOP on
\set A '11111111-1111-4111-8111-000000000001'
\set B '22222222-2222-4222-8222-000000000002'

SET ROLE dc360_app;

\echo == o papel da aplicacao nao e superusuario, nao tem BYPASSRLS e nao e dono de nada
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dc360_api')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dc360_app') THEN
    RAISE EXCEPTION 'os papeis dc360_api e dc360_app tem de existir';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('dc360_api', 'dc360_app') AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'papel da aplicacao com superusuario ou BYPASSRLS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND pg_get_userbyid(c.relowner) IN ('dc360_api', 'dc360_app', 'dc360_console')
  ) THEN
    RAISE EXCEPTION 'tabela de public com dono da aplicacao';
  END IF;
  IF current_user <> 'dc360_app' OR session_user <> 'dc360_api' THEN
    RAISE EXCEPTION 'esperava login dc360_api assumindo dc360_app, e veio % assumindo %', session_user, current_user;
  END IF;
  RAISE NOTICE 'papeis: ok';
END $$;

\echo == sem contexto: toda tabela de negocio que a aplicacao le devolve 0 linhas
BEGIN;
DO $$
DECLARE t record; n bigint; lidas int := 0;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
            WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migracoes'
            ORDER BY 1 LOOP
    IF has_table_privilege('public.' || quote_ident(t.relname), 'SELECT') THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t.relname) INTO n;
      lidas := lidas + 1;
      IF n <> 0 THEN
        RAISE EXCEPTION 'SEM CONTEXTO A TABELA % MOSTRA % LINHA(S)', t.relname, n;
      END IF;
    END IF;
  END LOOP;
  IF lidas = 0 THEN RAISE EXCEPTION 'nenhuma tabela legivel: a verificacao seria vazia'; END IF;
  RAISE NOTICE 'sem contexto: % tabelas lidas, todas com 0 linhas', lidas;
END $$;
COMMIT;

\echo == contexto de A: nenhuma linha fora de A em nenhuma tabela com organizacao_id
BEGIN;
SELECT set_config('app.organizacao_atual', :'A', true) IS NOT NULL AS contexto_de_A;
DO $$
DECLARE t record; de_a bigint; fora bigint; tabelas int := 0; total_a bigint := 0;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organizacao_id' AND NOT a.attisdropped
            WHERE ns.nspname = 'public' AND c.relkind = 'r' ORDER BY 1 LOOP
    IF has_table_privilege('public.' || quote_ident(t.relname), 'SELECT') THEN
      EXECUTE format(
        'SELECT count(*) FILTER (WHERE organizacao_id = %L), count(*) FILTER (WHERE organizacao_id IS DISTINCT FROM %L) FROM public.%I',
        '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001', t.relname) INTO de_a, fora;
      tabelas := tabelas + 1;
      total_a := total_a + de_a;
      IF fora <> 0 THEN
        RAISE EXCEPTION 'VAZAMENTO: % mostra % linha(s) fora de A', t.relname, fora;
      END IF;
    END IF;
  END LOOP;
  IF tabelas = 0 OR total_a = 0 THEN
    RAISE EXCEPTION 'verificacao vazia: % tabelas, % linhas de A', tabelas, total_a;
  END IF;
  RAISE NOTICE 'contexto A: % tabelas com organizacao_id, % linhas de A, 0 fora de A', tabelas, total_a;
END $$;
DO $$
DECLARE visiveis bigint; de_b bigint;
BEGIN
  SELECT count(*) INTO visiveis FROM ocorrencias;
  SELECT count(*) INTO de_b FROM ocorrencias WHERE organizacao_id = '22222222-2222-4222-8222-000000000002';
  IF visiveis = 0 THEN RAISE EXCEPTION 'com contexto de A nenhuma ocorrencia visivel: verificacao vazia'; END IF;
  IF de_b <> 0 THEN RAISE EXCEPTION 'ocorrencia de B visivel com contexto de A'; END IF;
END $$;
COMMIT;

\echo == contexto de B: o espelho
BEGIN;
SELECT set_config('app.organizacao_atual', :'B', true) IS NOT NULL AS contexto_de_B;
DO $$
DECLARE visiveis bigint; de_a bigint;
BEGIN
  SELECT count(*) INTO visiveis FROM ocorrencias;
  SELECT count(*) INTO de_a FROM ocorrencias WHERE organizacao_id = '11111111-1111-4111-8111-000000000001';
  IF visiveis = 0 THEN RAISE EXCEPTION 'com contexto de B nenhuma ocorrencia visivel: verificacao vazia'; END IF;
  IF de_a <> 0 THEN RAISE EXCEPTION 'ocorrencia de A visivel com contexto de B'; END IF;
END $$;
COMMIT;

\echo == escrita cruzada: com contexto de A, alterar linha de B nao alcanca nada
BEGIN;
SELECT set_config('app.organizacao_atual', :'A', true) IS NOT NULL AS contexto_de_A;
DO $$
DECLARE n bigint;
BEGIN
  UPDATE ocorrencias SET descricao = descricao WHERE organizacao_id = '22222222-2222-4222-8222-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'UPDATE cruzado alcancou % linha(s) de B', n; END IF;
END $$;
ROLLBACK;

\echo == trilha append-only: UPDATE e DELETE recusados por permissao
BEGIN;
SELECT set_config('app.organizacao_atual', :'A', true) IS NOT NULL AS contexto_de_A;
DO $$
DECLARE alvo text;
BEGIN
  FOREACH alvo IN ARRAY ARRAY['trilha_eventos', 'trilha_administrativa'] LOOP
    BEGIN
      EXECUTE format('UPDATE public.%I SET registrado_em = registrado_em', alvo);
      RAISE EXCEPTION 'UPDATE em % foi PERMITIDO', alvo;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'UPDATE em %: recusado, como deve', alvo;
    END;
    BEGIN
      EXECUTE format('DELETE FROM public.%I', alvo);
      RAISE EXCEPTION 'DELETE em % foi PERMITIDO', alvo;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'DELETE em %: recusado, como deve', alvo;
    END;
  END LOOP;
END $$;
ROLLBACK;

\echo == fila de interesse: o papel de aplicacao nao le (migracao 011)
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM interesse_municipio;
    RAISE EXCEPTION 'interesse_municipio foi LEGIVEL pela aplicacao';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'interesse_municipio: leitura recusada, como deve';
  END;
END $$;

\echo ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM
