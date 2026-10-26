#!/bin/zsh
# Roda as sondas no painel corrigido e no de antes (árvore de fd17ff4 no painel), e o e2e de antes nos três motores.
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad
cd $S/rig
for R in depois antes; do
  $S/rig/web.sh $S/rig/dist-$R >/dev/null
  $S/rig/api.sh >/dev/null
  ROTULO=$R node foco.mjs > /dev/null 2>&1; echo "foco $R $?"
  ROTULO=$R node telas.mjs > /dev/null 2>&1; echo "telas $R $?"
  CAPTURAS=1 TAMS=320x256,640x450x2 ROTULO=$R-capturas node telas.mjs > /dev/null 2>&1; echo "telas-capturas $R $?"
  ROTULO=$R node tab.mjs > /dev/null 2>&1; echo "tab $R $?"
  ROTULO=$R node oficio.mjs > /dev/null 2>&1; echo "oficio $R $?"
  ROTULO=$R node busca.mjs > /dev/null 2>&1; echo "busca $R $?"
  ROTULO=$R node axe.mjs > /dev/null 2>&1; echo "axe $R $?"
done
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/apps/web
for m in chromium firefox webkit; do
  $S/rig/api.sh >/dev/null
  BASE_WEB=http://localhost:5812 BASE_API=http://127.0.0.1:5811 MOTOR=$m node test/layout-estreito.e2e.mjs > $S/saidas/e2e-antes-$m.txt 2>&1
  echo "e2e antes $m $?"; grep -E "^Passou" $S/saidas/e2e-antes-$m.txt
done
$S/rig/web.sh $S/rig/dist-depois >/dev/null
echo FIM
