#!/bin/zsh
# Uso: matriz.sh <dist> <prefixo-da-saida>   (roda o layout-estreito nos três motores, API nova por motor)
R=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3294a44b-7d6b-4289-a196-1ebe378eab16/scratchpad/c7/rig
O=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3294a44b-7d6b-4289-a196-1ebe378eab16/scratchpad/c7/saidas
mkdir -p $O
$R/web.sh $1 >/dev/null
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-a94baa0e302566e18/dc360/apps/web
for m in ${=3:-chromium firefox webkit}; do
  $R/api.sh >/dev/null
  BASE_WEB=http://localhost:6712 BASE_API=http://127.0.0.1:6711 MOTOR=$m node test/layout-estreito.e2e.mjs > $O/$2-$m.txt 2>&1
  echo "$2 $m codigo=$? $(grep '^Passou' $O/$2-$m.txt)"
done
echo FIM
