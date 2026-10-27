#!/usr/bin/env bash
# Ensaio portatil do restore do banco (V2-F00-E25, criterio CA-08), para Linux,
# macOS e Git Bash. Reproduz o roteiro de dc360/docs/RESTORE-DO-BANCO.md entre
# DOIS servidores PostgreSQL novos e descartaveis, e termina com codigo 0 so se
# todas as conferencias passarem.
#
# O que ele faz, na ordem do roteiro:
#   1. origem: papeis como no job `implantavel` (com o GRANT CREATE ON DATABASE
#      que a migracao 041 exige), migrar, `migrar --conferir`, semear;
#   2. dump:   pg_dump --format=custom --schema=public --extension=pg_trgm;
#   3. destino: os papeis criados ANTES, com os mesmos atributos e pelo mesmo
#      criador; o banco novo sem o `public` de fabrica quando o dump o recria;
#   4. restore: pg_restore --exit-on-error, como dc360_setup;
#   5. o que o dump nao traz: tres GRANTs;
#   6. conferencias: linhas por tabela, estrutura inteira (diff exato), RLS
#      ativada E forcada, isolamento afirmado (nos dois bancos), `migrar
#      --conferir` na copia, e a API apontada para a copia (/saude 200 com
#      `banco: ok`, login, leitura e o 404 cruzado entre municipios);
#   5b. dois negativos (o restore sem o papel dc360_console, e o dump sem a
#      extensao) para provar que a conferencia morde.
#
# O que ele NAO faz: nao cria servidor (o CI sobe dois contêineres; localmente
# veja "Rodar localmente" abaixo), nao toca em nada fora dos dois bancos novos,
# nao guarda o dump (fica numa pasta temporaria apagada na saida, porque dump
# de producao e dado de cidadao) e nao imprime senha: elas sao geradas aqui, em
# memoria, a cada rodada, e vao a psql por variavel de ambiente ou por stdin.
#
# Variaveis de entrada:
#   PORTA_ORIGEM, PORTA_DESTINO  portas dos dois servidores (obrigatorias)
#   SENHA_SUPERUSUARIO           senha do superusuario dos dois (obrigatoria)
#   SAIDA                        pasta onde gravar logs e conferencias (obrigatoria)
#   HOST_DO_BANCO                padrao 127.0.0.1
#   SUPERUSUARIO                 padrao postgres
#   BANCO_ORIGEM, BANCO_DESTINO  padroes prova_restore_origem e prova_restore_restaurado
#   PORTA_API                    padrao 3355
#   PGBIN                        pasta dos binarios do PostgreSQL, se fora do PATH
#
# Pre-requisitos: dependencias instaladas (`npm ci`) e os pacotes compilados
# (`npm run build --workspace @dc360/shared`, `@dc360/db` e `@dc360/api`), e o
# pg_dump com versao MAIOR OU IGUAL a do servidor.
#
# Rodar localmente (dois servidores novos, ver o roteiro, passo 1):
#   SENHA_SUPERUSUARIO=... PORTA_ORIGEM=55451 PORTA_DESTINO=55452 \
#   SAIDA=/tmp/saida-do-restore bash scripts/ensaiar-restore.sh
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRODUTO="$(cd "$AQUI/.." && pwd)"
SONDAS="$AQUI/restore"

: "${PORTA_ORIGEM:?defina PORTA_ORIGEM}"
: "${PORTA_DESTINO:?defina PORTA_DESTINO}"
: "${SENHA_SUPERUSUARIO:?defina SENHA_SUPERUSUARIO}"
: "${SAIDA:?defina SAIDA}"
HOST="${HOST_DO_BANCO:-127.0.0.1}"
SU="${SUPERUSUARIO:-postgres}"
SENHA_SU="$SENHA_SUPERUSUARIO"
BANCO_ORIGEM="${BANCO_ORIGEM:-prova_restore_origem}"
BANCO_DESTINO="${BANCO_DESTINO:-prova_restore_restaurado}"
PORTA_API="${PORTA_API:-3355}"
if [ -n "${PGBIN:-}" ]; then PATH="$PGBIN:$PATH"; fi

# Nada do ambiente do chamador pode escolher o servidor por baixo dos panos.
unset PGPASSWORD PGUSER PGHOST PGPORT PGDATABASE PGSERVICE PGOPTIONS DATABASE_URL

mkdir -p "$SAIDA"
CONFERENCIAS="$SAIDA/conferencias.txt"
: > "$CONFERENCIAS"

DUMP_DIR="$(mktemp -d)"
chmod 700 "$DUMP_DIR"
DUMP="$DUMP_DIR/dc360.dump"
API_PID=""

limpar() {
  if [ -n "$API_PID" ]; then kill "$API_PID" 2>/dev/null || true; fi
  rm -rf "$DUMP_DIR"
}
trap limpar EXIT
trap 'echo "FALHOU na linha $LINENO: $BASH_COMMAND" >&2' ERR

etapa() { printf '\n== %s\n' "$*"; }
conferiu() { printf 'OK    %s\n' "$*" | tee -a "$CONFERENCIAS"; }
falhar() { printf 'FALHA %s\n' "$*" | tee -a "$CONFERENCIAS" >&2; exit 1; }

senha_aleatoria() { node -e "process.stdout.write(require('crypto').randomBytes(18).toString('base64url'))"; }

# psql_como USUARIO SENHA PORTA BANCO [argumentos do psql]. O SQL vem de -f, -c
# ou stdin. A senha vai por variavel de ambiente de UM comando, nunca em argv.
psql_como() {
  local usuario="$1" senha="$2" porta="$3" banco="$4"
  shift 4
  PGPASSWORD="$senha" psql -X -q -h "$HOST" -p "$porta" -U "$usuario" -d "$banco" -v ON_ERROR_STOP=1 "$@"
}
super() { local porta="$1" banco="$2"; shift 2; psql_como "$SU" "$SENHA_SU" "$porta" "$banco" "$@"; }

SENHA_SETUP="$(senha_aleatoria)"
SENHA_API="$(senha_aleatoria)"
JWT_ALEATORIO="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
URL_SETUP_ORIGEM="postgres://dc360_setup:${SENHA_SETUP}@${HOST}:${PORTA_ORIGEM}/${BANCO_ORIGEM}"
URL_SETUP_DESTINO="postgres://dc360_setup:${SENHA_SETUP}@${HOST}:${PORTA_DESTINO}/${BANCO_DESTINO}"
URL_API_DESTINO="postgres://dc360_api:${SENHA_API}@${HOST}:${PORTA_DESTINO}/${BANCO_DESTINO}"

# --------------------------------------------------------------------------
etapa "0. Ferramentas e servidores"
for comando in psql pg_dump pg_restore node npm curl diff; do
  command -v "$comando" > /dev/null || falhar "falta o comando $comando no PATH"
done

esperar_servidor() {
  local porta="$1" nome="$2"
  for _ in $(seq 1 90); do
    if super "$porta" postgres -c 'SELECT 1' > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  falhar "o servidor $nome (porta $porta) nao respondeu em 90 s"
}
esperar_servidor "$PORTA_ORIGEM" origem
esperar_servidor "$PORTA_DESTINO" destino

{
  echo "pg_dump:      $(pg_dump --version)"
  echo "pg_restore:   $(pg_restore --version)"
  echo "psql:         $(psql --version)"
  echo "node:         $(node --version)"
  echo "origem:       $(super "$PORTA_ORIGEM" postgres -At -c 'SELECT version()')"
  echo "destino:      $(super "$PORTA_DESTINO" postgres -At -c 'SELECT version()')"
  echo "migracoes em disco: $(find "$PRODUTO/db/migrations" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
} | tee "$SAIDA/01-versoes.txt"

SERVIDOR_NUM="$(super "$PORTA_ORIGEM" postgres -At -c 'SHOW server_version_num')"
SERVIDOR_MAIOR=$((SERVIDOR_NUM / 10000))
CLIENTE_MAIOR="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
if [ "$CLIENTE_MAIOR" -lt "$SERVIDOR_MAIOR" ]; then
  falhar "pg_dump $CLIENTE_MAIOR e mais antigo que o servidor $SERVIDOR_MAIOR: o pg_dump recusa (use o cliente da versao do servidor)"
fi
conferiu "pg_dump $CLIENTE_MAIOR serve para o servidor $SERVIDOR_MAIOR"

for pasta in apps/api/dist db/dist packages/shared/dist; do
  [ -e "$PRODUTO/$pasta" ] || falhar "falta $pasta: compile antes (npm run build --workspace ...)"
done

# "Nunca restaure por cima de um banco que ja existe": servidores sujos reprovam.
for par in "$PORTA_ORIGEM:origem" "$PORTA_DESTINO:destino"; do
  porta="${par%%:*}"
  sujo="$(super "$porta" postgres -At -c "SELECT (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'dc360%') + (SELECT count(*) FROM pg_database WHERE datname IN ('$BANCO_ORIGEM','$BANCO_DESTINO'))")"
  [ "$sujo" = "0" ] || falhar "o servidor ${par#*:} (porta $porta) ja tem papel dc360_* ou o banco da prova: use um servidor novo"
done
conferiu "os dois servidores estao limpos (sem papel dc360_* e sem os bancos da prova)"

# --------------------------------------------------------------------------
etapa "1. A origem, como o job implantavel do CI (com o GRANT CREATE ON DATABASE)"
super "$PORTA_ORIGEM" postgres -c "CREATE DATABASE $BANCO_ORIGEM;"
super "$PORTA_ORIGEM" "$BANCO_ORIGEM" <<SQL
CREATE ROLE dc360_setup LOGIN PASSWORD '$SENHA_SETUP' CREATEROLE BYPASSRLS NOSUPERUSER;
ALTER SCHEMA public OWNER TO dc360_setup;
GRANT ALL ON SCHEMA public TO dc360_setup;
GRANT CREATE ON DATABASE $BANCO_ORIGEM TO dc360_setup;
REVOKE TEMPORARY ON DATABASE $BANCO_ORIGEM FROM PUBLIC;
CREATE ROLE dc360_api LOGIN PASSWORD '$SENHA_API' NOSUPERUSER;
SQL

cd "$PRODUTO"
DATABASE_URL="$URL_SETUP_ORIGEM" npm run migrar 2>&1 | tee "$SAIDA/03-migrar-origem.txt"
DATABASE_URL="$URL_SETUP_ORIGEM" npm run migrar -- --conferir 2>&1 | tee "$SAIDA/04-migrar-conferir-origem.txt"
grep -q 'Esquema em dia\.' "$SAIDA/04-migrar-conferir-origem.txt" || falhar "migrar --conferir na origem nao disse 'Esquema em dia.'"
DATABASE_URL="$URL_SETUP_ORIGEM" npm run migrar -- --semear 2>&1 | tee "$SAIDA/05-semear-origem.txt"
grep -q 'Semeado' "$SAIDA/05-semear-origem.txt" || falhar "a semente nao foi aplicada"
super "$PORTA_ORIGEM" "$BANCO_ORIGEM" -c "GRANT dc360_app TO dc360_api WITH SET TRUE;"
conferiu "origem migrada do zero, em dia e semeada"

NUM_MIGRACOES="$(find "$PRODUTO/db/migrations" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"

# --------------------------------------------------------------------------
etapa "2. O dump (so schema public, com a extensao pg_trgm)"
PGPASSWORD="$SENHA_SETUP" pg_dump -h "$HOST" -p "$PORTA_ORIGEM" -U dc360_setup \
  --format=custom --schema=public --extension=pg_trgm --file="$DUMP" "$BANCO_ORIGEM"
PGPASSWORD="$SENHA_SETUP" pg_dump -h "$HOST" -p "$PORTA_ORIGEM" -U dc360_setup \
  --format=custom --schema=public --file="$DUMP_DIR/sem-extensao.dump" "$BANCO_ORIGEM"
pg_restore -l "$DUMP" > "$SAIDA/07-sumario-do-dump.txt"
grep -qE ' EXTENSION - pg_trgm' "$SAIDA/07-sumario-do-dump.txt" || falhar "o dump nao leva a extensao pg_trgm (--extension)"
if grep -qE ' EXTENSION - pg_trgm' <(pg_restore -l "$DUMP_DIR/sem-extensao.dump"); then
  falhar "o dump SEM --extension levou a extensao: a premissa do roteiro mudou, reavalie"
fi
conferiu "o dump leva a extensao pg_trgm so com --extension (o sumario nao tem dado nem segredo)"

# O pg_dump so recria o schema public quando ele deixou de ser o de fabrica
# (aqui o dono muda). Se recria, o banco novo precisa nascer SEM o public.
# (Capturado antes de filtrar: `grep -q` fecha o cano cedo e, com pipefail, o
# SIGPIPE do pg_restore viraria "nao achou".)
SCRIPT_DO_DUMP="$(pg_restore --schema-only -f - "$DUMP")"
if grep -q '^CREATE SCHEMA public;' <<< "$SCRIPT_DO_DUMP"; then
  RECRIA_PUBLIC=1
  echo "o dump recria o schema public: o destino nasce sem ele"
else
  RECRIA_PUBLIC=0
  echo "o dump NAO recria o schema public: o destino fica com o de fabrica"
fi

# --------------------------------------------------------------------------
etapa "3. O destino: papeis antes, banco novo"
super "$PORTA_DESTINO" postgres <<SQL
CREATE ROLE dc360_setup LOGIN PASSWORD '$SENHA_SETUP' CREATEROLE BYPASSRLS NOSUPERUSER;
CREATE ROLE dc360_api LOGIN PASSWORD '$SENHA_API' NOSUPERUSER;
SQL
# dc360_app e dc360_console sao criados pelo dc360_setup, como as migracoes 001
# e 023 fazem, para as associacoes implicitas do Postgres 16 em diante virem iguais.
psql_como dc360_setup "$SENHA_SETUP" "$PORTA_DESTINO" postgres -c "CREATE ROLE dc360_app NOLOGIN;"

preparar_banco_destino() {
  local banco="$1"
  PGPASSWORD="$SENHA_SU" createdb -h "$HOST" -p "$PORTA_DESTINO" -U "$SU" -T template0 --encoding=UTF8 --locale=C "$banco"
  if [ "$RECRIA_PUBLIC" = "1" ]; then super "$PORTA_DESTINO" "$banco" -c "DROP SCHEMA public CASCADE;"; fi
  super "$PORTA_DESTINO" "$banco" -c "GRANT CREATE ON DATABASE $banco TO dc360_setup;"
  super "$PORTA_DESTINO" "$banco" -c "REVOKE TEMPORARY ON DATABASE $banco FROM PUBLIC;"
}
restaurar() { # restaurar BANCO ARQUIVO
  PGPASSWORD="$SENHA_SETUP" pg_restore -h "$HOST" -p "$PORTA_DESTINO" -U dc360_setup --dbname="$1" --exit-on-error "$2"
}

# Negativo 1, ANTES de criar dc360_console: o restore tem de recusar. Prova que
# criar o papel antes (o passo seguinte) e necessario e nao decoracao.
preparar_banco_destino prova_negativo_sem_console
if restaurar prova_negativo_sem_console "$DUMP" > "$SAIDA/08-negativo-sem-dc360_console.txt" 2>&1; then
  falhar "o restore SEM o papel dc360_console passou: a conferencia nao morde"
fi
conferiu "negativo: o restore sem o papel dc360_console reprova"
if grep -q 'dc360_console' "$SAIDA/08-negativo-sem-dc360_console.txt"; then
  conferiu "negativo: a mensagem cita o papel dc360_console, como na E25"
else
  echo "AVISO: o restore sem dc360_console reprovou com outra mensagem (veja 08-negativo-sem-dc360_console.txt)" | tee -a "$CONFERENCIAS"
fi
super "$PORTA_DESTINO" postgres -c "DROP DATABASE prova_negativo_sem_console;"

psql_como dc360_setup "$SENHA_SETUP" "$PORTA_DESTINO" postgres \
  -c "CREATE ROLE dc360_console NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;"

# Negativo 2: dump sem --extension. O restore para nos indices de busca.
preparar_banco_destino prova_negativo_sem_extensao
if restaurar prova_negativo_sem_extensao "$DUMP_DIR/sem-extensao.dump" > "$SAIDA/09-negativo-sem-pg_trgm.txt" 2>&1; then
  falhar "o restore do dump SEM a extensao passou: a conferencia nao morde"
fi
conferiu "negativo: o restore de um dump sem --extension=pg_trgm reprova"
if grep -q 'gin_trgm_ops' "$SAIDA/09-negativo-sem-pg_trgm.txt"; then
  conferiu "negativo: a mensagem cita gin_trgm_ops, como na E25"
else
  echo "AVISO: o restore sem a extensao reprovou com outra mensagem (veja 09-negativo-sem-pg_trgm.txt)" | tee -a "$CONFERENCIAS"
fi
super "$PORTA_DESTINO" postgres -c "DROP DATABASE prova_negativo_sem_extensao;"

# --------------------------------------------------------------------------
etapa "4. O restore, como dc360_setup, com --exit-on-error"
preparar_banco_destino "$BANCO_DESTINO"
restaurar "$BANCO_DESTINO" "$DUMP" 2>&1 | tee "$SAIDA/11-restore.txt"
conferiu "pg_restore --exit-on-error terminou sem erro"

# --------------------------------------------------------------------------
etapa "5. O que o dump nao traz: tres GRANTs"
super "$PORTA_DESTINO" "$BANCO_DESTINO" -c "GRANT dc360_app TO dc360_api WITH SET TRUE;"
psql_como dc360_setup "$SENHA_SETUP" "$PORTA_DESTINO" "$BANCO_DESTINO" -c "GRANT dc360_app TO dc360_setup WITH SET TRUE;"
psql_como dc360_setup "$SENHA_SETUP" "$PORTA_DESTINO" "$BANCO_DESTINO" -c "GRANT USAGE ON SCHEMA public TO PUBLIC;"
echo "feito"

# --------------------------------------------------------------------------
etapa "6. Conferencias: linhas e estrutura, os mesmos SQL nos dois lados, e diff EXATO"
for f in linhas estrutura; do
  super "$PORTA_ORIGEM" "$BANCO_ORIGEM" -At -F'|' -f "$SONDAS/$f.sql" > "$SAIDA/12-$f-origem.txt"
  super "$PORTA_DESTINO" "$BANCO_DESTINO" -At -F'|' -f "$SONDAS/$f.sql" > "$SAIDA/12-$f-restaurado.txt"
  if diff "$SAIDA/12-$f-origem.txt" "$SAIDA/12-$f-restaurado.txt" > "$SAIDA/13-diff-$f.txt"; then
    conferiu "$f: identico entre origem e restaurado ($(wc -l < "$SAIDA/12-$f-origem.txt" | tr -d ' ') linhas conferidas)"
  else
    cat "$SAIDA/13-diff-$f.txt"
    falhar "$f: origem e restaurado DIFEREM (diff em 13-diff-$f.txt)"
  fi
done

TOTAL_LINHAS="$(grep '^~total|' "$SAIDA/12-linhas-restaurado.txt" | cut -d'|' -f2)"
[ -n "$TOTAL_LINHAS" ] && [ "$TOTAL_LINHAS" -gt 0 ] || falhar "o restaurado tem 0 linhas: a comparacao seria vazia"
conferiu "o restaurado tem $TOTAL_LINHAS linhas no total (comparacao nao vazia)"

migracoes_restaurado="$(grep -E '^migracoes\|' "$SAIDA/12-estrutura-restaurado.txt" | cut -d'|' -f2)"
[ "$migracoes_restaurado" = "$NUM_MIGRACOES" ] || falhar "schema_migracoes tem $migracoes_restaurado linhas e ha $NUM_MIGRACOES arquivos em db/migrations"
conferiu "schema_migracoes tem as $NUM_MIGRACOES migracoes (as impressoes batem no diff de estrutura)"

afirmar_linha() { # afirmar_linha ARQUIVO LINHA_EXATA DESCRICAO
  grep -qxF "$2" "$1" || falhar "$3 (esperava a linha '$2' em $(basename "$1"))"
  conferiu "$3"
}
for lado in origem restaurado; do
  arq="$SAIDA/12-estrutura-$lado.txt"
  afirmar_linha "$arq" "negocio_sem_rls_forcada|0" "$lado: toda tabela de negocio tem RLS ativada E forcada"
  afirmar_linha "$arq" "tabelas_com_dono_dc360_app_ou_dc360_api|0" "$lado: nenhuma tabela tem como dono um papel da aplicacao"
  afirmar_linha "$arq" "policies_update_ou_delete_na_trilha|0" "$lado: a trilha nao tem policy de UPDATE nem DELETE"
done
tabelas_negocio="$(grep -E '^tabelas_de_negocio' "$SAIDA/12-estrutura-restaurado.txt" | cut -d'|' -f2)"
[ "${tabelas_negocio:-0}" -gt 0 ] || falhar "nenhuma tabela de negocio contada: a conferencia de RLS seria vazia"
conferiu "RLS conferida em $tabelas_negocio tabelas de negocio (nao vazio)"

# --------------------------------------------------------------------------
etapa "7. Isolamento, como o login da aplicacao (dc360_api assumindo dc360_app), nos dois bancos"
for lado in origem restaurado; do
  if [ "$lado" = origem ]; then porta="$PORTA_ORIGEM"; banco="$BANCO_ORIGEM"; else porta="$PORTA_DESTINO"; banco="$BANCO_DESTINO"; fi
  psql_como dc360_api "$SENHA_API" "$porta" "$banco" -f "$SONDAS/isolamento-afirmado.sql" 2>&1 | tee "$SAIDA/17-isolamento-afirmado-$lado.txt"
  grep -q 'ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM' "$SAIDA/17-isolamento-afirmado-$lado.txt" || falhar "$lado: o isolamento afirmado nao chegou ao fim"
  conferiu "$lado: isolamento afirmado (zero linha sem contexto, zero de outro municipio, trilha append-only)"
  # A sonda narrativa da E25, so para o registro humano e para comparar os dois lados.
  psql_como dc360_api "$SENHA_API" "$porta" "$banco" -v ON_ERROR_STOP=0 -f "$SONDAS/isolamento.sql" > "$SAIDA/17-isolamento-narrado-$lado.txt" 2>&1
done
if diff "$SAIDA/17-isolamento-narrado-origem.txt" "$SAIDA/17-isolamento-narrado-restaurado.txt" > "$SAIDA/17-diff-isolamento-narrado.txt"; then
  conferiu "o comportamento de isolamento narrado e o mesmo na origem e na copia"
else
  cat "$SAIDA/17-diff-isolamento-narrado.txt"
  falhar "o isolamento narrado difere entre origem e copia"
fi

# --------------------------------------------------------------------------
etapa "8. migrar --conferir na copia"
DATABASE_URL="$URL_SETUP_DESTINO" npm run migrar -- --conferir 2>&1 | tee "$SAIDA/20-migrar-conferir-no-restaurado.txt"
grep -q 'Esquema em dia\.' "$SAIDA/20-migrar-conferir-no-restaurado.txt" || falhar "na copia o migrar --conferir nao disse 'Esquema em dia.'"
conferiu "migrar --conferir na copia: Esquema em dia."

# --------------------------------------------------------------------------
etapa "9. A API apontada para a copia, com o login da aplicacao"
ID_DE_OUTRO_MUNICIPIO="$(super "$PORTA_ORIGEM" "$BANCO_ORIGEM" -At -c "SELECT id FROM ocorrencias WHERE organizacao_id = '22222222-2222-4222-8222-000000000002' ORDER BY id LIMIT 1")"
[ -n "$ID_DE_OUTRO_MUNICIPIO" ] || falhar "a semente nao tem ocorrencia de Vale Fundo para a sonda do 404 cruzado"

NODE_ENV=development HOST=127.0.0.1 PORT="$PORTA_API" \
  DATABASE_URL="$URL_API_DESTINO" JWT_SEGREDO="$JWT_ALEATORIO" \
  node "$PRODUTO/apps/api/dist/index.js" > "$SAIDA/19-api.log" 2>&1 < /dev/null &
API_PID=$!

SUBIU=0
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PORTA_API/saude" > "$SAIDA/19-saude.json" 2>/dev/null; then SUBIU=1; break; fi
  if ! kill -0 "$API_PID" 2>/dev/null; then break; fi
  sleep 1
done
[ "$SUBIU" = "1" ] || { tail -n 40 "$SAIDA/19-api.log" >&2 || true; falhar "a API nao respondeu /saude 200 contra a copia"; }
cat "$SAIDA/19-saude.json"; echo
node -e "const s=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); process.exit(s.status==='ok'&&s.banco==='ok'?0:1)" "$SAIDA/19-saude.json" \
  || falhar "/saude respondeu, mas nao com status ok e banco ok"
conferiu "/saude 200 com status ok e banco ok, contra a copia, com o login restrito da aplicacao"

node "$SONDAS/api-contra-a-copia.mjs" "http://127.0.0.1:$PORTA_API" "$ID_DE_OUTRO_MUNICIPIO" 2>&1 | tee "$SAIDA/19-api-contra-a-copia.txt" \
  || falhar "a sonda da API contra a copia reprovou (19-api-contra-a-copia.txt)"
grep -q 'TODAS AS CONFERENCIAS PASSARAM' "$SAIDA/19-api-contra-a-copia.txt" || falhar "a sonda da API nao chegou ao fim"
conferiu "API contra a copia: login, lista, detalhe, 404 do outro municipio e busca com pg_trgm"

kill "$API_PID" 2>/dev/null || true
API_PID=""

# --------------------------------------------------------------------------
etapa "10. Bancos que sobraram (so os da prova), e nenhum dump no destino da saida"
for par in "$PORTA_ORIGEM" "$PORTA_DESTINO"; do
  super "$par" postgres -At -c "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY 1" | sed "s/^/porta $par: /" | tee -a "$SAIDA/21-bancos.txt"
done
[ -z "$(find "$SAIDA" -name '*.dump')" ] || falhar "ha arquivo .dump na pasta de saida"
conferiu "nenhum dump na pasta de saida (o dump fica fora e e apagado na saida)"

echo
echo "RESTORE ENSAIADO: $(grep -c '^OK' "$CONFERENCIAS") conferencias passaram, 0 falharam."
