#!/bin/bash
# Reproduz os cenários do QA da rodada 6 contra dc360/scripts/auditar.mjs.
# Uso: repro.sh <pasta dc360>
cd "$1" || exit 9
F=/tmp/e19c6/ferramentas
cenario() { # rótulo, depois o comando
  local rot="$1"; shift
  echo "=== $rot"
  "$@" > /tmp/e19c6/cenario.out 2>&1; local c=$?
  grep -E "Consulta de controle|Desenvolvimento \(fica|Runtime limpo|NÃO foi auditad|Motivo:|REPROVADO|NOVA|Runtime \(vai|Aplicativo de campo \(vai|aceita: node-forge" /tmp/e19c6/cenario.out | sed 's/^/    /'
  echo "    codigo=$c"
}
cenario "N1 npm real com npm_config_offline=true" env npm_config_offline=true node scripts/auditar.mjs
node $F/registro-vazio.mjs vazio 48731 2>/tmp/e19c6/registro.log & RP=$!; sleep 1
cenario "N2 npm real com registro que responde {} ao endpoint de advisories (npm_config_registry=http://127.0.0.1:48731/)" env npm_config_registry=http://127.0.0.1:48731/ node scripts/auditar.mjs
kill $RP; wait $RP 2>/dev/null; echo "    pedidos que o registro falso recebeu: $(grep -c . /tmp/e19c6/registro.log)"
for m in lixo vazio objeto lista falha texto-total cortado runtime-alta app-nova forge-nova; do
  cenario "npm falso do validador, modo $m" env MODO_FALSO=$m PATH="$F/npm-falso:$PATH" node scripts/auditar.mjs
done
rm -f /tmp/e19c6/npm-vazio.log
cenario "npm falso que ignora as bandeiras e devolve o relatório vazio bem formado em toda pasta (o espelho que responde {}, mesmo com o registro fixado)" env PATH="$F/npm-vazio:$PATH" node scripts/auditar.mjs
echo "    chamadas ao npm falso:"; sed 's/^/      /' /tmp/e19c6/npm-vazio.log
