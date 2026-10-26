# Tres erros de proposito do passo 5 de RESTORE-DO-BANCO.md, mais um positivo de controle e o caso sem --exit-on-error. Mesmos comandos dos passos 0 a 5 do documento. Rodar de dentro de dc360/ de um clone ja compilado (passo 0). Base: negativos.sh do revisor (Opus), alinhado ao documento.
R=<scratchpad>/e25
export PGBIN=$R/pg17/pgsql/bin; export PATH="$PGBIN:$PATH"
TMP=$R/tmp-neg; export PORTA_ORIGEM=55621 PORTA_DESTINO=55622
export PGHOST=127.0.0.1
unset PGPASSWORD PGUSER PGPORT PGDATABASE PGSERVICE PGOPTIONS DATABASE_URL
export DC360_SENHAS="$TMP"; mkdir -m 700 "$TMP"; umask 077
gerar() { node -e "process.stdout.write(require('crypto').randomBytes(18).toString('base64url'))"; }
gerar > "$TMP/.senha-postgres"; gerar > "$TMP/.senha-setup"; gerar > "$TMP/.senha-api"
{ printf '127.0.0.1:*:*:postgres:%s\n' "$(cat "$TMP/.senha-postgres")"; printf '127.0.0.1:*:*:dc360_setup:%s\n' "$(cat "$TMP/.senha-setup")"; printf '127.0.0.1:*:*:dc360_api:%s\n' "$(cat "$TMP/.senha-api")"; } > "$TMP/.pgpass"
export PGPASSFILE="$TMP/.pgpass"
super() { psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
setup() { psql -X -q -v ON_ERROR_STOP=1 -U dc360_setup "$@"; }
initdb -D "$TMP/pg-origem" -U postgres --pwfile="$TMP/.senha-postgres" -A scram-sha-256 -E UTF8 --locale=C >/dev/null
initdb -D "$TMP/pg-destino" -U postgres --pwfile="$TMP/.senha-postgres" -A scram-sha-256 -E UTF8 --locale=C >/dev/null
pg_ctl -D "$TMP/pg-origem" -l "$TMP/pg-origem.log" -o "-p $PORTA_ORIGEM -c listen_addresses=127.0.0.1" -w start > /dev/null 2>&1 < /dev/null
pg_ctl -D "$TMP/pg-destino" -l "$TMP/pg-destino.log" -o "-p $PORTA_DESTINO -c listen_addresses=127.0.0.1" -w start > /dev/null 2>&1 < /dev/null
super -p $PORTA_ORIGEM -d postgres -c "CREATE DATABASE prova_e25_origem;"
super -p $PORTA_ORIGEM -d prova_e25_origem <<'SQL'
\set senha_setup `cat "$DC360_SENHAS/.senha-setup"`
\set senha_api `cat "$DC360_SENHAS/.senha-api"`
SELECT format('CREATE ROLE dc360_setup LOGIN PASSWORD %L CREATEROLE BYPASSRLS NOSUPERUSER', :'senha_setup') \gexec
ALTER SCHEMA public OWNER TO dc360_setup;
GRANT ALL ON SCHEMA public TO dc360_setup;
GRANT CREATE ON DATABASE prova_e25_origem TO dc360_setup;
SELECT format('CREATE ROLE dc360_api LOGIN PASSWORD %L NOSUPERUSER', :'senha_api') \gexec
SQL
export DATABASE_URL="postgres://dc360_setup:$(cat "$TMP/.senha-setup")@127.0.0.1:$PORTA_ORIGEM/prova_e25_origem"
npm run migrar >/dev/null 2>&1; echo "migrar rc=$?"; npm run migrar -- --semear > /dev/null 2>&1; echo "semear rc=$?"; unset DATABASE_URL
pg_dump -h 127.0.0.1 -p $PORTA_ORIGEM -U dc360_setup --format=custom --schema=public --extension=pg_trgm --file="$TMP/dc360.dump" prova_e25_origem
pg_dump -h 127.0.0.1 -p $PORTA_ORIGEM -U dc360_setup --format=custom --schema=public --file="$TMP/sem-ext.dump" prova_e25_origem
echo "EXTENSION no dump sem --extension: $(pg_restore -l "$TMP/sem-ext.dump" | grep -c ' EXTENSION ')"
super -p $PORTA_DESTINO -d postgres <<'SQL'
\set senha_setup `cat "$DC360_SENHAS/.senha-setup"`
\set senha_api `cat "$DC360_SENHAS/.senha-api"`
SELECT format('CREATE ROLE dc360_setup LOGIN PASSWORD %L CREATEROLE BYPASSRLS NOSUPERUSER', :'senha_setup') \gexec
SELECT format('CREATE ROLE dc360_api LOGIN PASSWORD %L NOSUPERUSER', :'senha_api') \gexec
SQL
setup -p $PORTA_DESTINO -d postgres -c "CREATE ROLE dc360_app NOLOGIN;"
novo() { createdb -h 127.0.0.1 -p $PORTA_DESTINO -U postgres -T template0 --encoding=UTF8 --locale=C $1; [ "$2" = sempublic ] || super -p $PORTA_DESTINO -d $1 -c "DROP SCHEMA public CASCADE;"; super -p $PORTA_DESTINO -d $1 -c "GRANT CREATE ON DATABASE $1 TO dc360_setup;"; }
echo "### NEGATIVO 1: sem dc360_console"
novo neg1; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=neg1 --exit-on-error "$TMP/dc360.dump"; echo "rc=$?"
setup -p $PORTA_DESTINO -d postgres -c "CREATE ROLE dc360_console NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;"
echo "### NEGATIVO 2: sem derrubar o public"
novo neg2 sempublic; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=neg2 --exit-on-error "$TMP/dc360.dump"; echo "rc=$?"
echo "### NEGATIVO 3: dump sem --extension"
novo neg3; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=neg3 --exit-on-error "$TMP/sem-ext.dump"; echo "rc=$?"
echo "### POSITIVO de controle"
novo pos; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=pos --exit-on-error "$TMP/dc360.dump"; echo "rc=$?"
echo "### NEGATIVO 2b: sem derrubar o public, SEM --exit-on-error (aparencia de sucesso?)"
novo neg2b sempublic; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=neg2b "$TMP/dc360.dump" 2>&1 | tail -3; echo "rc=${PIPESTATUS[0]}"
pg_ctl -D "$TMP/pg-origem" -m fast stop >/dev/null </dev/null; pg_ctl -D "$TMP/pg-destino" -m fast stop >/dev/null </dev/null
rm -rf "$TMP"
