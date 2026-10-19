# Uso: negativos-passo5.sh DIR (com "Program Files/PostgreSQL/17/bin"), a partir de dc360/ de um clone ja compilado. Versao 3 (revisada) do documento: PGBIN com espaco, PASTA_RESTORE com espaco, senha por \getenv.
# Tres erros de proposito do passo 5 de RESTORE-DO-BANCO.md, mais um positivo de controle e o caso sem --exit-on-error. Mesmos comandos dos passos 0 a 5 do documento. Rodar de dentro de dc360/ de um clone ja compilado (passo 0). Base: negativos.sh do revisor (Opus), alinhado ao documento.
R="$1"
export PGBIN="$R/Program Files/PostgreSQL/17/bin"; export PATH="$PGBIN:$PATH"
PASTA_RESTORE="$R/pasta de negativos"; export PORTA_ORIGEM=55741 PORTA_DESTINO=55742
export PGHOST=127.0.0.1
unset PGPASSWORD PGUSER PGPORT PGDATABASE PGSERVICE PGOPTIONS DATABASE_URL
mkdir -m 700 "$PASTA_RESTORE"; umask 077
gerar() { node -e "process.stdout.write(require('crypto').randomBytes(18).toString('base64url'))"; }
gerar > "$PASTA_RESTORE/.senha-postgres"; gerar > "$PASTA_RESTORE/.senha-setup"; gerar > "$PASTA_RESTORE/.senha-api"
{ printf '127.0.0.1:*:*:postgres:%s\n' "$(cat "$PASTA_RESTORE/.senha-postgres")"; printf '127.0.0.1:*:*:dc360_setup:%s\n' "$(cat "$PASTA_RESTORE/.senha-setup")"; printf '127.0.0.1:*:*:dc360_api:%s\n' "$(cat "$PASTA_RESTORE/.senha-api")"; } > "$PASTA_RESTORE/.pgpass"
export PGPASSFILE="$PASTA_RESTORE/.pgpass"
super() { psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
setup() { psql -X -q -v ON_ERROR_STOP=1 -U dc360_setup "$@"; }
initdb -D "$PASTA_RESTORE/pg-origem" -U postgres --pwfile="$PASTA_RESTORE/.senha-postgres" -A scram-sha-256 -E UTF8 --locale=C >/dev/null
initdb -D "$PASTA_RESTORE/pg-destino" -U postgres --pwfile="$PASTA_RESTORE/.senha-postgres" -A scram-sha-256 -E UTF8 --locale=C >/dev/null
pg_ctl -D "$PASTA_RESTORE/pg-origem" -l "$PASTA_RESTORE/pg-origem.log" -o "-p $PORTA_ORIGEM -c listen_addresses=127.0.0.1" -w start > /dev/null 2>&1 < /dev/null
pg_ctl -D "$PASTA_RESTORE/pg-destino" -l "$PASTA_RESTORE/pg-destino.log" -o "-p $PORTA_DESTINO -c listen_addresses=127.0.0.1" -w start > /dev/null 2>&1 < /dev/null
super -p $PORTA_ORIGEM -d postgres -c "CREATE DATABASE prova_e25_origem;"
SENHA_SETUP="$(cat "$PASTA_RESTORE/.senha-setup")" SENHA_API="$(cat "$PASTA_RESTORE/.senha-api")" \
super -p $PORTA_ORIGEM -d prova_e25_origem <<'SQL'
\getenv senha_setup SENHA_SETUP
\getenv senha_api SENHA_API
SELECT format('CREATE ROLE dc360_setup LOGIN PASSWORD %L CREATEROLE BYPASSRLS NOSUPERUSER', :'senha_setup') \gexec
ALTER SCHEMA public OWNER TO dc360_setup;
GRANT ALL ON SCHEMA public TO dc360_setup;
GRANT CREATE ON DATABASE prova_e25_origem TO dc360_setup;
SELECT format('CREATE ROLE dc360_api LOGIN PASSWORD %L NOSUPERUSER', :'senha_api') \gexec
SQL
export DATABASE_URL="postgres://dc360_setup:$(cat "$PASTA_RESTORE/.senha-setup")@127.0.0.1:$PORTA_ORIGEM/prova_e25_origem"
npm run migrar >/dev/null 2>&1; echo "migrar rc=$?"; npm run migrar -- --semear > /dev/null 2>&1; echo "semear rc=$?"; unset DATABASE_URL
pg_dump -h 127.0.0.1 -p $PORTA_ORIGEM -U dc360_setup --format=custom --schema=public --extension=pg_trgm --file="$PASTA_RESTORE/dc360.dump" prova_e25_origem
pg_dump -h 127.0.0.1 -p $PORTA_ORIGEM -U dc360_setup --format=custom --schema=public --file="$PASTA_RESTORE/sem-ext.dump" prova_e25_origem
echo "EXTENSION no dump sem --extension: $(pg_restore -l "$PASTA_RESTORE/sem-ext.dump" | grep -c ' EXTENSION ')"
SENHA_SETUP="$(cat "$PASTA_RESTORE/.senha-setup")" SENHA_API="$(cat "$PASTA_RESTORE/.senha-api")" \
super -p $PORTA_DESTINO -d postgres <<'SQL'
\getenv senha_setup SENHA_SETUP
\getenv senha_api SENHA_API
SELECT format('CREATE ROLE dc360_setup LOGIN PASSWORD %L CREATEROLE BYPASSRLS NOSUPERUSER', :'senha_setup') \gexec
SELECT format('CREATE ROLE dc360_api LOGIN PASSWORD %L NOSUPERUSER', :'senha_api') \gexec
SQL
setup -p $PORTA_DESTINO -d postgres -c "CREATE ROLE dc360_app NOLOGIN;"
novo() { createdb -h 127.0.0.1 -p $PORTA_DESTINO -U postgres -T template0 --encoding=UTF8 --locale=C $1; [ "$2" = sempublic ] || super -p $PORTA_DESTINO -d $1 -c "DROP SCHEMA public CASCADE;"; super -p $PORTA_DESTINO -d $1 -c "GRANT CREATE ON DATABASE $1 TO dc360_setup;"; }
echo "### NEGATIVO 1: sem dc360_console"
novo neg1; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=neg1 --exit-on-error "$PASTA_RESTORE/dc360.dump"; echo "rc=$?"
setup -p $PORTA_DESTINO -d postgres -c "CREATE ROLE dc360_console NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;"
echo "### NEGATIVO 2: sem derrubar o public"
novo neg2 sempublic; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=neg2 --exit-on-error "$PASTA_RESTORE/dc360.dump"; echo "rc=$?"
echo "### NEGATIVO 3: dump sem --extension"
novo neg3; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=neg3 --exit-on-error "$PASTA_RESTORE/sem-ext.dump"; echo "rc=$?"
echo "### POSITIVO de controle"
novo pos; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=pos --exit-on-error "$PASTA_RESTORE/dc360.dump"; echo "rc=$?"
echo "### NEGATIVO 2b: sem derrubar o public, SEM --exit-on-error (aparencia de sucesso?)"
novo neg2b sempublic; pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=neg2b "$PASTA_RESTORE/dc360.dump" 2>&1 | tail -3; echo "rc=${PIPESTATUS[0]}"
pg_ctl -D "$PASTA_RESTORE/pg-origem" -m fast stop >/dev/null </dev/null; pg_ctl -D "$PASTA_RESTORE/pg-destino" -m fast stop >/dev/null </dev/null
rm -rf "$PASTA_RESTORE"
