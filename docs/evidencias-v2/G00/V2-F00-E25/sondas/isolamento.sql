-- Comportamento do isolamento no banco, rodado como o LOGIN da aplicacao
-- (dc360_api) assumindo dc360_app, exatamente como a API faz. Contar linhas
-- como superusuario nao prova nada sobre RLS; isto prova.
-- Municipio A = Serra Alta, B = Vale Fundo (ids fixos da semente).
\pset footer off
\set A '11111111-1111-4111-8111-000000000001'
\set B '22222222-2222-4222-8222-000000000002'

\echo == quem sou (login e papel assumido), e os atributos dos dois
SET ROLE dc360_app;
SELECT session_user, current_user;
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN (session_user, current_user) ORDER BY 1;
SELECT 'tabelas de public cujo dono e o papel atual ou o login', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relowner IN (SELECT oid FROM pg_roles WHERE rolname IN (session_user, current_user));

\echo == sem contexto: toda tabela de public que dc360_app pode ler devolve 0 linhas
BEGIN;
DO $$
DECLARE t record; n bigint; lidas int := 0; com_linha int := 0; sem_privilegio int := 0;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
            WHERE ns.nspname='public' AND c.relkind='r' ORDER BY 1 LOOP
    IF has_table_privilege('public.'||quote_ident(t.relname), 'SELECT') THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t.relname) INTO n;
      lidas := lidas + 1;
      IF n <> 0 THEN com_linha := com_linha + 1; RAISE NOTICE 'SEM CONTEXTO VE LINHA: % (%)', t.relname, n; END IF;
    ELSE
      sem_privilegio := sem_privilegio + 1;
      RAISE NOTICE 'sem privilegio de leitura: %', t.relname;
    END IF;
  END LOOP;
  RAISE NOTICE 'sem contexto: % tabelas lidas, % com alguma linha, % sem privilegio de leitura', lidas, com_linha, sem_privilegio;
END $$;
COMMIT;

\echo == com contexto de A: nenhuma linha de B em nenhuma tabela com organizacao_id
BEGIN;
SELECT set_config('app.organizacao_atual', :'A', true) IS NOT NULL AS contexto_de_A;
DO $$
DECLARE t record; de_b bigint; de_a bigint; total_a bigint := 0; total_b bigint := 0; tabelas int := 0;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
            JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='organizacao_id' AND NOT a.attisdropped
            WHERE ns.nspname='public' AND c.relkind='r' ORDER BY 1 LOOP
    IF has_table_privilege('public.'||quote_ident(t.relname), 'SELECT') THEN
      EXECUTE format('SELECT count(*) FILTER (WHERE organizacao_id = %L), count(*) FILTER (WHERE organizacao_id IS DISTINCT FROM %L) FROM public.%I',
                     '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001', t.relname) INTO de_a, de_b;
      tabelas := tabelas + 1; total_a := total_a + de_a; total_b := total_b + de_b;
      IF de_b <> 0 THEN RAISE NOTICE 'VAZAMENTO: % mostra % linha(s) fora de A', t.relname, de_b; END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'contexto A: % tabelas com organizacao_id lidas, % linhas de A, % linhas fora de A', tabelas, total_a, total_b;
END $$;
SELECT 'ocorrencias visiveis com contexto A', count(*) FROM ocorrencias;
SELECT 'ocorrencias de B visiveis com contexto A', count(*) FROM ocorrencias WHERE organizacao_id = :'B';
SELECT 'organizacoes visiveis com contexto A', string_agg(municipio, ',') FROM organizacoes;
COMMIT;

\echo == com contexto de B: o espelho
BEGIN;
SELECT set_config('app.organizacao_atual', :'B', true) IS NOT NULL AS contexto_de_B;
SELECT 'ocorrencias visiveis com contexto B', count(*) FROM ocorrencias;
SELECT 'ocorrencias de A visiveis com contexto B', count(*) FROM ocorrencias WHERE organizacao_id = :'A';
COMMIT;

\echo == escrita cruzada: com contexto de A, gravar ocorrencia em B tem que ser recusado
BEGIN;
SELECT set_config('app.organizacao_atual', :'A', true) IS NOT NULL AS contexto_de_A;
UPDATE ocorrencias SET descricao = descricao WHERE organizacao_id = :'B';
COMMIT;

\echo == trilha append-only: com contexto de A, UPDATE e DELETE na trilha
BEGIN;
SELECT set_config('app.organizacao_atual', :'A', true) IS NOT NULL AS contexto_de_A;
SELECT 'eventos de trilha visiveis com contexto A', count(*) FROM trilha_eventos;
UPDATE trilha_eventos SET registrado_em = registrado_em;
ROLLBACK;
BEGIN;
SELECT set_config('app.organizacao_atual', :'A', true) IS NOT NULL AS contexto_de_A;
DELETE FROM trilha_eventos;
ROLLBACK;
BEGIN;
SELECT set_config('app.organizacao_atual', :'A', true) IS NOT NULL AS contexto_de_A;
UPDATE trilha_administrativa SET registrado_em = registrado_em;
ROLLBACK;

\echo == fila de interesse: o papel de aplicacao nao le (migracao 011)
SELECT count(*) FROM interesse_municipio;
