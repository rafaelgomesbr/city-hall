#!/bin/zsh
# Correção 6b: o arquivo inteiro antes (painel de f0e5f1b) e depois, nos três motores; a seção 13 mais duas vezes por motor depois; e o e2e-api.
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad
W=/Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/apps/web
cd $W
for R in dist-6e:depois; do
  D=${R%%:*}; N=${R##*:}
  $S/rig/web.sh $S/rig/$D >/dev/null
  for m in chromium firefox webkit; do
    $S/rig/api.sh >/dev/null
    BASE_WEB=http://localhost:5812 BASE_API=http://127.0.0.1:5811 MOTOR=$m node test/layout-estreito.e2e.mjs > $S/saidas/6b-layout-$N-$m.txt 2>&1
    echo "layout $N $m codigo=$? $(grep '^Passou' $S/saidas/6b-layout-$N-$m.txt)"
  done
done
for i in 2 3; do for m in chromium firefox webkit; do
  $S/rig/api.sh >/dev/null
  BASE_WEB=http://localhost:5812 BASE_API=http://127.0.0.1:5811 MOTOR=$m node $S/rig/so-secao-13.e2e.mjs > $S/saidas/6b-secao-13-depois-$m-$i.txt 2>&1
  echo "secao13 depois $m $i codigo=$? $(grep '^Passou' $S/saidas/6b-secao-13-depois-$m-$i.txt)"
done; done
kill -TERM -$(cat $S/rig/api.pid) -$(cat $S/rig/web.pid) 2>/dev/null; sleep 2
cd $W/../..
for m in chromium firefox; do node $S/rig/e2e-api-portas-5811-5812.mjs $m > $S/saidas/6b-e2e-api-$m.txt 2>&1; echo "e2e-api $m $? $(grep '^Passou' $S/saidas/6b-e2e-api-$m.txt | tr '\n' ' ')"; done
node $S/rig/e2e-api-portas-5811-5812.mjs webkit --so-layout > $S/saidas/6b-e2e-api-webkit-so-layout.txt 2>&1; echo "e2e-api webkit $? $(grep '^Passou' $S/saidas/6b-e2e-api-webkit-so-layout.txt)"
echo FIM
