-- Conferencia de estrutura da E25. Roda IGUAL na origem e no restaurado,
-- como superusuario do cluster (que le o catalogo inteiro), e as duas saidas
-- se comparam com diff. Tudo listado por nome, e nao so contado: contagem
-- igual com conteudo trocado passaria.
\pset footer off
\echo == resumo
SELECT 'tabelas', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'
UNION ALL SELECT 'tabelas_de_negocio (todas menos schema_migracoes)', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> 'schema_migracoes'
UNION ALL SELECT 'rls_habilitada', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
UNION ALL SELECT 'rls_forcada', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity
UNION ALL SELECT 'negocio_sem_rls_forcada', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> 'schema_migracoes' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
UNION ALL SELECT 'policies', count(*)::text FROM pg_policies WHERE schemaname='public'
UNION ALL SELECT 'funcoes', count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
UNION ALL SELECT 'funcoes_security_definer', count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef
UNION ALL SELECT 'indices', count(*)::text FROM pg_indexes WHERE schemaname='public'
UNION ALL SELECT 'indices_gin_trgm_ops', count(*)::text FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%gin_trgm_ops%'
UNION ALL SELECT 'constraints', count(*)::text FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
UNION ALL SELECT 'triggers', count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
UNION ALL SELECT 'grants_dc360_app', count(*)::text FROM information_schema.role_table_grants WHERE grantee='dc360_app' AND table_schema='public'
UNION ALL SELECT 'grants_dc360_console', count(*)::text FROM information_schema.role_table_grants WHERE grantee='dc360_console' AND table_schema='public'
UNION ALL SELECT 'tabelas_com_dono_dc360_app_ou_dc360_api', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_get_userbyid(c.relowner) IN ('dc360_app','dc360_api','dc360_console')
UNION ALL SELECT 'policies_update_ou_delete_na_trilha', count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename IN ('trilha_eventos','trilha_administrativa') AND cmd IN ('UPDATE','DELETE','ALL')
UNION ALL SELECT 'migracoes', count(*)::text FROM schema_migracoes
UNION ALL SELECT 'ultima_migracao', max(versao) FROM schema_migracoes
UNION ALL SELECT 'md5_das_impressoes', md5(string_agg(versao||':'||impressao, ',' ORDER BY versao)) FROM schema_migracoes
ORDER BY 1;

\echo == tabelas (nome, rls, forcada, dono)
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','S') ORDER BY 1;

\echo == schema public (dono e acl)
SELECT nspname, pg_get_userbyid(nspowner), nspacl::text FROM pg_namespace WHERE nspname='public';

\echo == extensoes
SELECT extname, extversion, extnamespace::regnamespace, pg_get_userbyid(extowner) FROM pg_extension ORDER BY 1;

\echo == schema_migracoes (versao e impressao)
SELECT versao, impressao FROM schema_migracoes ORDER BY 1;

\echo == policies
SELECT tablename, policyname, permissive, roles::text, cmd, md5(coalesce(qual,'')), md5(coalesce(with_check,''))
  FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;

\echo == funcoes (assinatura, security definer, dono, md5 do corpo, config)
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', p.prosecdef,
       pg_get_userbyid(p.proowner), md5(p.prosrc), coalesce(p.proconfig::text,''), coalesce(p.proacl::text,'')
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1;

\echo == indices
SELECT tablename, indexname, md5(indexdef) FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2;

\echo == indices gin_trgm_ops (definicao inteira)
SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%gin_trgm_ops%' ORDER BY 1;

\echo == constraints
SELECT c.conrelid::regclass::text, c.conname, md5(pg_get_constraintdef(c.oid))
  FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY 1,2;

\echo == triggers
SELECT c.relname, t.tgname, md5(pg_get_triggerdef(t.oid))
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2;

\echo == privilegios por tabela (acl crua)
SELECT c.relname, coalesce(c.relacl::text,'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','v','S') ORDER BY 1;

\echo == privilegios por coluna
SELECT table_name, column_name, grantee, privilege_type FROM information_schema.column_privileges
 WHERE table_schema='public' AND grantee LIKE 'dc360_%'
   AND (table_name, grantee, privilege_type) NOT IN (SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public')
 ORDER BY 1,2,3,4;

\echo == default privileges
SELECT pg_get_userbyid(defaclrole), defaclnamespace::regnamespace, defaclobjtype, defaclacl::text FROM pg_default_acl ORDER BY 1,2,3;

\echo == papeis dc360 (atributos)
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
  FROM pg_roles WHERE rolname LIKE 'dc360_%' ORDER BY 1;

\echo == associacoes entre papeis dc360
SELECT r.rolname AS papel, m.rolname AS membro, a.set_option, a.inherit_option, a.admin_option
  FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
 WHERE r.rolname LIKE 'dc360_%' AND m.rolname LIKE 'dc360_%' ORDER BY 1,2;
