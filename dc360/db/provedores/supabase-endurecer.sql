-- =====================================================================
-- Endurecimento do Supabase, para rodar DEPOIS das migrações.
--
-- Por que existe, e por que não é uma migração do produto:
--
-- O Supabase não é só um Postgres. Ele publica o schema `public` numa API
-- REST automática (PostgREST) e mantém três papéis próprios: `anon`, que é
-- quem chega com a chave pública, `authenticated`, e `service_role`, que tem
-- BYPASSRLS. Além disso ele deixa privilégio padrão configurado no schema
-- `public`, de modo que TODA TABELA NOVA nasce concedida a esses papéis.
--
-- As tabelas do DC360 nascem em `public`. Sem este arquivo, a base inteira de
-- todos os municípios passa a ter uma segunda porta de entrada que o produto
-- nunca projetou, e uma delas (`service_role`) ignora Row Level Security por
-- atributo de papel.
--
-- A RLS ainda defenderia o `anon`: as policies exigem `app_organizacao_atual()`,
-- que vem nula para quem não passou pelo `SET LOCAL`, e policy que não casa
-- nega. Mas defender por RLS uma porta que não precisava existir é apostar que
-- nenhuma policy futura terá um `USING (true)`. Privilégio revogado não depende
-- de policy: sem SELECT concedido, não há o que a RLS precise negar.
--
-- E o `service_role` não seria defendido pela RLS de jeito nenhum. Ele tem
-- BYPASSRLS, então a única coisa que o separa da base inteira, cross-tenant, é
-- o privilégio de tabela. É por ele que este arquivo importa mais.
--
-- Não é migração porque não é do produto: quem rodar em Neon, RDS ou Postgres
-- próprio não tem esses papéis, e uma migração que os referenciasse quebraria
-- lá. O aplicador de migrações também recusa histórico reescrito, e este
-- arquivo é idempotente de propósito, para rodar de novo a cada deploy.
--
-- Rodar com o papel de SETUP (o mesmo que migrou), no editor SQL do Supabase
-- ou por psql:
--   psql "$DATABASE_URL_SETUP" -v ON_ERROR_STOP=1 -f supabase-endurecer.sql
--
-- Isto NÃO substitui tirar `public` da lista de schemas expostos em
-- Settings > API. Os dois juntos: um fecha a porta, o outro tira a chave.
-- =====================================================================

DO $$
DECLARE
  papel text;
  dono  text := current_user;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    -- O papel pode não existir: este mesmo arquivo precisa rodar sem erro
    -- num Postgres comum, senão vira um arquivo que só serve num lugar.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      RAISE NOTICE 'papel % não existe aqui, pulando', papel;
      CONTINUE;
    END IF;

    -- 1. O privilégio padrão, que é o que faz tabela FUTURA nascer concedida.
    --    Sem isto, a próxima migração reabre tudo o que os passos abaixo
    --    fecharam, e ninguém percebe porque nada quebra.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
      dono, papel);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
      dono, papel);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
      dono, papel);

    -- 2. O que já foi concedido às tabelas que existem agora.
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);

    -- 3. A porta do schema. Sem USAGE, nem se descobre que a tabela existe.
    --    É o corte mais grosso e o mais seguro: nada do DC360 é servido pelo
    --    PostgREST, então nenhum desses três papéis tem o que fazer aqui.
    EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', papel);

    RAISE NOTICE 'privilégios revogados de %', papel;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- `schema_migracoes`: devolver a leitura ao papel da aplicação.
--
-- O Supabase tem um gatilho de evento chamado `ensure_rls`, em
-- `ddl_command_end`, que LIGA Row Level Security sozinho em toda tabela
-- criada no schema `public`. Nas tabelas de negócio isso é inofensivo, porque
-- as migrações já ligam RLS e criam as policies. Mas `schema_migracoes` não é
-- tabela de negócio: quem a cria é o aplicador de migrações
-- (`db/src/migrar.ts`, `CREATE TABLE IF NOT EXISTS`), e ele não cria policy
-- nenhuma, porque num Postgres comum ninguém liga RLS ali.
--
-- Resultado observado neste projeto em 08/09/2026: RLS ligada, zero policies,
-- e RLS sem policy nega tudo. A tabela tinha as 15 linhas e o `dc360_app`
-- enxergava zero. Isso quebra duas coisas, as duas em silêncio:
--
--   1. A partida da API. `apps/api/src/index.ts` roda `migracoesPendentes`
--      dentro de `semTenant`, ou seja, já como `dc360_app`. Vendo a tabela
--      vazia, ele conclui que faltam TODAS as migrações e sai com código 1.
--      No Fly isso é a máquina em laço de reinício, com uma mensagem que
--      manda rodar a migração que já foi rodada.
--   2. A rota `/saude`, que lê a última migração aplicada. É ela que o
--      balanceador consulta, então o processo nunca seria considerado pronto.
--
-- A policy é de SELECT e sem filtro de propósito: aqui não existe dado de
-- município, só nome de arquivo de migração e data. O `postgres` continua
-- inserindo porque é dono e a tabela não tem FORCE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dc360_app') THEN
    RAISE NOTICE 'dc360_app não existe aqui, pulando a policy de schema_migracoes';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migracoes'
  ) THEN
    RAISE NOTICE 'schema_migracoes ainda não existe, pulando';
  ELSIF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'schema_migracoes'
      AND policyname = 'migracoes_visiveis_para_app'
  ) THEN
    RAISE NOTICE 'policy de schema_migracoes já existe';
  ELSE
    CREATE POLICY migracoes_visiveis_para_app
      ON public.schema_migracoes FOR SELECT TO dc360_app USING (true);
    RAISE NOTICE 'policy de leitura criada em schema_migracoes';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- PostGIS (V2-F01-E22, decisão D-16): fechar o que a extensão abre.
--
-- A extensão `postgis` cria a tabela `spatial_ref_sys`, as views
-- `geometry_columns` e `geography_columns` e mais de mil funções. Duas coisas
-- nela abrem porta que o produto nunca projetou:
--
--   1. O script de instalação da extensão concede SELECT nessas relações a
--      PUBLIC, e o Postgres concede EXECUTE nas funções a PUBLIC por padrão.
--      PUBLIC inclui `anon`, `authenticated` e `service_role`. Num schema que
--      o PostgREST publica (`public`), isso vira rota REST e RPC aberta.
--   2. `REVOKE ... FROM anon` sozinho não adianta: o privilégio chega por
--      PUBLIC. Por isso a revogação tira de PUBLIC E dos três papéis.
--
-- O que este bloco faz, SE a extensão estiver instalada (senão não faz nada, e
-- o arquivo continua rodando num Postgres sem PostGIS):
--
--   - revoga tudo de PUBLIC, `anon`, `authenticated` e `service_role` em cada
--     relação, sequência e função QUE PERTENCE À EXTENSÃO (achadas por
--     `pg_depend`, nunca por "tudo no schema", que atingiria `pgcrypto` e
--     companhia, de que o próprio Supabase depende);
--   - devolve a `dc360_app` o mínimo para a aplicação consultar: USAGE no
--     schema da extensão, SELECT em `spatial_ref_sys` e EXECUTE nas funções.
--
-- A extensão deve morar em schema próprio (`extensions`, o padrão do Supabase),
-- NUNCA em `public`: `public` é o schema que o PostgREST publica. Quem instala
-- é `db/provedores/postgis.sql`, e `scripts/conferir-ambiente.mjs --extensoes`
-- confere o resultado, inclusive reprovando extensão em `public`.
--
-- `ROUTINE` (e não `FUNCTION`) porque a extensão tem funções de agregação.
--
-- Sem permissão para mexer num objeto (o dono da extensão pode ser outro papel
-- do provedor, o que é NÃO CONFIRMADO até o CP-44), o bloco avisa com WARNING
-- e segue: quem decide se ficou aberto é a conferência, não este bloco.
-- Idempotente: pode rodar de novo a cada deploy.
DO $$
DECLARE
  esquema    text;
  obj        record;
  papel      text;
  falhas     integer := 0;
  tem_app    boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dc360_app');
  fechados   text[] := ARRAY[]::text[];
BEGIN
  SELECT n.nspname INTO esquema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF esquema IS NULL THEN
    RAISE NOTICE 'postgis não está instalado aqui, pulando o endurecimento da extensão';
    RETURN;
  END IF;

  IF esquema = 'public' THEN
    RAISE WARNING 'postgis está no schema public, que o PostgREST publica: mova para um schema próprio (extensions)';
  END IF;

  -- Os papéis do provedor que existem aqui, mais PUBLIC.
  SELECT array_agg(rolname) INTO fechados
  FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');
  fechados := coalesce(fechados, ARRAY[]::text[]);

  FOR obj IN
    SELECT CASE
             WHEN d.classid = 'pg_class'::regclass THEN
               format('%s %s', CASE WHEN c.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
                      c.oid::regclass)
             ELSE format('ROUTINE %s', pr.oid::regprocedure)
           END AS alvo,
           (d.classid = 'pg_proc'::regclass) AS e_funcao,
           (c.relname = 'spatial_ref_sys') AS e_srs
    FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid
    LEFT JOIN pg_class c ON d.classid = 'pg_class'::regclass AND c.oid = d.objid
    LEFT JOIN pg_proc pr ON d.classid = 'pg_proc'::regclass AND pr.oid = d.objid
    WHERE d.refclassid = 'pg_extension'::regclass
      AND d.deptype = 'e'
      AND e.extname = 'postgis'
      AND d.classid IN ('pg_class'::regclass, 'pg_proc'::regclass)
      AND (c.oid IS NULL OR c.relkind IN ('r', 'v', 'm', 'p', 'f', 'S'))
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', obj.alvo);
      FOREACH papel IN ARRAY fechados LOOP
        EXECUTE format('REVOKE ALL ON %s FROM %I', obj.alvo, papel);
      END LOOP;
      IF tem_app AND obj.e_funcao THEN
        EXECUTE format('GRANT EXECUTE ON %s TO dc360_app', obj.alvo);
      ELSIF tem_app AND obj.e_srs THEN
        EXECUTE format('GRANT SELECT ON %s TO dc360_app', obj.alvo);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      falhas := falhas + 1;
      RAISE WARNING 'sem permissão para ajustar % (a extensão tem outro dono?)', obj.alvo;
    END;
  END LOOP;

  IF tem_app THEN
    BEGIN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO dc360_app', esquema);
    EXCEPTION WHEN insufficient_privilege THEN
      falhas := falhas + 1;
      RAISE WARNING 'sem permissão para dar USAGE no schema % a dc360_app', esquema;
    END;
  ELSE
    RAISE NOTICE 'dc360_app não existe aqui, pulando os grants do PostGIS';
  END IF;

  IF falhas > 0 THEN
    RAISE WARNING 'endurecimento do postgis incompleto: % objeto(s) sem permissão; rode a conferência --extensoes', falhas;
  ELSE
    RAISE NOTICE 'postgis endurecido no schema %', esquema;
  END IF;
END $$;

-- Conferência: o papel da aplicação continua enxergando o que precisa, e os
-- papéis do Supabase não enxergam nada. Se a primeira linha vier zero, algo
-- foi longe demais e a API vai parar de funcionar.
SELECT
  'dc360_app' AS papel,
  count(*)    AS tabelas_com_select
FROM information_schema.role_table_grants
WHERE grantee = 'dc360_app' AND privilege_type = 'SELECT' AND table_schema = 'public'
UNION ALL
-- Se esta linha vier zero, a API não sobe: ver o bloco de schema_migracoes.
SELECT
  'policy schema_migracoes',
  count(*)
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'schema_migracoes'
UNION ALL
SELECT
  grantee,
  count(*)
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated', 'service_role') AND table_schema = 'public'
GROUP BY grantee;
