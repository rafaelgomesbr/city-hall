# copia do script do scratchpad (c2r3/ci/sonda-050.sh)

# A 050 no banco dc360 do estado do CI (Postgres 16, papeis do job implantavel):
# migra com dc360_setup, confere, e chama abrir_sessao como o login de
# aplicacao (dc360_api, SET ROLE dc360_app, sem tenant, como `emitirPar`).
set -e
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3d36cfc8-e822-4393-b93c-ef3d51f55862/scratchpad/c2r3/ci
P=127.0.0.1:54916
cd /Users/[usuario]/Documents/city-hall/dc360
echo "+ DATABASE_URL=postgres://[REDIGIDO]@.../dc360 npm run migrar -- --conferir   (antes: a 050 falta)"
DATABASE_URL=postgres://[REDIGIDO]@$P/dc360 npm run migrar -- --conferir 2>&1 | tail -3 || true
echo "+ DATABASE_URL=postgres://[REDIGIDO]@.../dc360 npm run migrar"
DATABASE_URL=postgres://[REDIGIDO]@$P/dc360 npm run migrar 2>&1 | grep -E "aplicando|Nada|Aplicadas" | sed -E 's/Aplicadas: .*(050_[a-z_]+\.sql).*/Aplicadas: ... \1/'
echo "+ DATABASE_URL=postgres://[REDIGIDO]@.../dc360 npm run migrar -- --conferir"
DATABASE_URL=postgres://[REDIGIDO]@$P/dc360 npm run migrar -- --conferir 2>&1 | tail -1
q() { echo "+ [$1] $2"; node $S/sql.mjs "postgres://$1@$P/dc360" "$2"; }
q dc360_setup:setup "SELECT p.proname, pg_get_userbyid(p.proowner) AS dono, p.prosecdef FROM pg_proc p WHERE p.proname = 'abrir_sessao'"
q dc360_setup:setup "SELECT count(*)::int AS definers FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef"
q dc360_setup:setup "INSERT INTO organizacoes (id, nome, municipio, uf) VALUES ('22222222-2222-4222-8222-000000000050','DC Sonda','Sonda Alta','MG') ON CONFLICT DO NOTHING"
q dc360_setup:setup "INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, senha_hash) VALUES ('22222222-2222-4222-8222-0000000000a5','22222222-2222-4222-8222-000000000050','Pessoa da Sonda','S-50','sonda50@exemplo.gov.br','coordenador','x') ON CONFLICT DO NOTHING"
q dc360_api:api "SET ROLE dc360_app; SELECT current_user, abrir_sessao('22222222-2222-4222-8222-000000000050','22222222-2222-4222-8222-0000000000a5','sonda-050-login', interval '1 day', NULL, NULL, NULL) IS NOT NULL AS abriu"
q dc360_setup:setup "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'sonda 050' WHERE id = '22222222-2222-4222-8222-000000000050'"
q dc360_api:api "SET ROLE dc360_app; SELECT abrir_sessao('22222222-2222-4222-8222-000000000050','22222222-2222-4222-8222-0000000000a5','sonda-050-suspenso', interval '1 day', NULL, NULL, NULL)" || echo "(recusa esperada acima: DC367)"
q dc360_setup:setup "SELECT token_hash, revogada_em IS NULL AS de_pe FROM sessoes WHERE organizacao_id = '22222222-2222-4222-8222-000000000050' ORDER BY 1"
