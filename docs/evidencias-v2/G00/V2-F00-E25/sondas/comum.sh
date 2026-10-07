# Variaveis comuns da prova da E25. Lido por "source"; nao imprime segredo.
export PGBIN="/c/Program Files/PostgreSQL/18/bin"
export PATH="$PGBIN:$PATH"
export E25="[pasta temporaria]"
export RUN="$E25/run"
export SAIDAS="$E25/saidas"
export DC360="/c/Projetos/city-hall/dc360"
export PORTA_ORIGEM=55451
export PORTA_DESTINO=55452
export PGHOST=127.0.0.1
export PGUSER=postgres
# Senha aleatoria, gerada uma vez por rodada, guardada so dentro de $RUN (apagado no fim).
if [ -f "$RUN/.senha" ]; then export PGPASSWORD="$(cat "$RUN/.senha")"; fi
