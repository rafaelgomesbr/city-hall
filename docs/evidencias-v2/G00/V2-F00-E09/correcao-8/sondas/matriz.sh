#!/bin/zsh
# Uso: matriz.sh <dist> <prefixo> [motores]   (layout-estreito nos motores, API nova por motor)
R=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3294a44b-7d6b-4289-a196-1ebe378eab16/scratchpad/c8/rig
O=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3294a44b-7d6b-4289-a196-1ebe378eab16/scratchpad/c8/saidas
$R/web.sh $1 >/dev/null
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-a7c8fc1753d4a634f/dc360/apps/web
for m in ${=3:-chromium firefox webkit}; do
  $R/api.sh >/dev/null
  BASE_WEB=http://localhost:7812 BASE_API=http://127.0.0.1:7811 MOTOR=$m node test/layout-estreito.e2e.mjs > $O/$2-$m.txt 2>&1
  echo "$2 $m codigo=$? $(grep '^Passou' $O/$2-$m.txt)"
done
echo FIM
