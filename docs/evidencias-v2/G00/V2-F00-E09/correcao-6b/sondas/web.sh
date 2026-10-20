#!/bin/zsh
# Uso: web.sh <pasta-dist>  (serve na 5812)
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad
[ -f $S/rig/web.pid ] && kill -TERM -$(cat $S/rig/web.pid) 2>/dev/null && sleep 1
node $S/rig/subir.mjs web /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/apps/web npx vite preview --outDir "$1" --port 5812 --strictPort
for i in {1..60}; do curl -sf http://localhost:5812/ >/dev/null && echo "painel de pé ($1)" && exit 0; sleep 1; done
echo "painel não subiu"; exit 1
