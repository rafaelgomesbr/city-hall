#!/bin/zsh
# Uso: web.sh <pasta-dist>
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3294a44b-7d6b-4289-a196-1ebe378eab16/scratchpad/c8b/rig
[ -f $S/web.pid ] && kill -TERM -$(cat $S/web.pid) 2>/dev/null && sleep 1
node $S/subir.mjs web /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-af6748ac926c49c3b/dc360/apps/web npx vite preview --outDir "$1" --port 7832 --strictPort
for i in {1..60}; do curl -sf http://localhost:7832/ >/dev/null && echo "painel de pé ($1)" && exit 0; sleep 1; done
echo "painel não subiu"; exit 1
