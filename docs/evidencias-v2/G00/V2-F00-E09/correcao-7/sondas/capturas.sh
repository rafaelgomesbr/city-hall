#!/bin/zsh
# Capturas antes (painel da rodada 8) e depois (painel da correção 7), três motores.
R=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3294a44b-7d6b-4289-a196-1ebe378eab16/scratchpad/c7/rig
O=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3294a44b-7d6b-4289-a196-1ebe378eab16/scratchpad/c7/saidas
C=/Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-a94baa0e302566e18/docs/evidencias-v2/G00/V2-F00-E09/correcao-7/capturas
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-a94baa0e302566e18
$R/api.sh >/dev/null
for fase in antes depois; do
  $R/web.sh $R/dist-$fase >/dev/null
  for m in chromium firefox webkit; do
    CAPT=1 CAPTURAS=$C MOTOR=$m node $R/sonda.mjs c7-$fase > $O/40-capturas-$fase-$m.txt 2>&1
    echo "$fase $m: $(tail -1 $O/40-capturas-$fase-$m.txt)"
  done
done
echo FIM
