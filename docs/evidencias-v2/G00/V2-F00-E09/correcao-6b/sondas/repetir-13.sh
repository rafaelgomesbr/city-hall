#!/bin/zsh
# Uso: repetir-13.sh <dist> <rotulo> <vezes>  (seção 13 sozinha, nos três motores, API nova a cada execução)
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad
$S/rig/web.sh $S/rig/$1 >/dev/null
for i in $(seq 1 $3); do for m in chromium firefox webkit; do
  $S/rig/api.sh >/dev/null
  BASE_WEB=http://localhost:5812 BASE_API=http://127.0.0.1:5811 MOTOR=$m node $S/rig/so-secao-13.e2e.mjs > $S/saidas/6b-secao-13-$2-$m-$i.txt 2>&1
  echo "$2 $m $i codigo=$? $(grep '^Passou' $S/saidas/6b-secao-13-$2-$m-$i.txt)"
done; done
echo FIM
