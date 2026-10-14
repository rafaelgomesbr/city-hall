# copia do script do scratchpad (c2r3/ci/provisionar-como-o-ci.sh)

# Repete os passos "Provisionar papeis e banco", "Migrar com o papel de setup",
# "Migrar de novo e provar idempotencia" e "Conceder a associacao" do job
# implantavel de .github/workflows/verificar.yml, contra o Postgres 16
# descartavel da porta 54916 (o psql do CI vira sql.mjs, que nao ha psql aqui).
set -e
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3d36cfc8-e822-4393-b93c-ef3d51f55862/scratchpad/c2r3/ci
P=postgres://[REDIGIDO]@127.0.0.1:54916
q() { echo "+ psql $1: $2"; node $S/sql.mjs "$P/$1" "$2"; }
q postgres "SELECT version();"
q postgres "CREATE DATABASE dc360;"
q dc360 "CREATE ROLE dc360_setup LOGIN PASSWORD [REDIGIDO] CREATEROLE BYPASSRLS NOSUPERUSER;"
q dc360 "ALTER SCHEMA public OWNER TO dc360_setup;"
q dc360 "GRANT ALL ON SCHEMA public TO dc360_setup;"
q dc360 "GRANT CREATE ON DATABASE dc360 TO dc360_setup;"
q dc360 "CREATE ROLE dc360_api LOGIN PASSWORD [REDIGIDO] NOSUPERUSER;"
cd /Users/[usuario]/Documents/city-hall/dc360
echo "+ DATABASE_URL=postgres://[REDIGIDO]@.../dc360 npm run migrar"
DATABASE_URL=postgres://[REDIGIDO]@127.0.0.1:54916/dc360 npm run migrar 2>&1 | tail -4
echo "+ DATABASE_URL=postgres://[REDIGIDO]@.../dc360 npm run migrar -- --conferir"
DATABASE_URL=postgres://[REDIGIDO]@127.0.0.1:54916/dc360 npm run migrar -- --conferir 2>&1 | tail -3
q dc360 "GRANT dc360_app TO dc360_api WITH SET TRUE;"
q postgres "SELECT rolname FROM pg_roles WHERE rolname LIKE 'dc360%' ORDER BY 1;"
