-- Linhas por tabela, geradas do catalogo: tabela nova entra sozinha, sem
-- ninguem lembrar de atualizar uma lista. Roda como superusuario (ignora RLS),
-- igual nos dois lados.
\pset footer off
SELECT c.relname,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS linhas
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
UNION ALL
SELECT '~total', sum((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname), false, true, '')))[1]::text::bigint)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY 1;
