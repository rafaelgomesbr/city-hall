#!/bin/zsh
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/apps/web
$S/rig/web.sh $S/rig/dist-6f >/dev/null
for m in chromium firefox webkit; do
  $S/rig/api.sh >/dev/null
  BASE_WEB=http://localhost:5812 BASE_API=http://127.0.0.1:5811 MOTOR=$m node test/layout-estreito.e2e.mjs > $S/saidas/6b-layout-depois-$m.txt 2>&1
  echo "layout depois $m codigo=$? $(grep '^Passou' $S/saidas/6b-layout-depois-$m.txt)"
done
kill -TERM -$(cat $S/rig/api.pid) -$(cat $S/rig/web.pid) 2>/dev/null
echo FIM
