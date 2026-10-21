#!/bin/bash
# Uso: amostra.sh <antes|depois> <rodadas> <saida>. Roda só o caso 0,0, quatro por vez.
set -u
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/apps/campo
SP=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad
f=src/__tests__/hoje-lista-e-mapa.test.tsx
cp "$f" "$SP/corrigidos/hoje-amostra.bak"
if [ "$1" = antes ]; then git show "HEAD:dc360/apps/campo/$f" > "$f"; fi
: > "$3"
seq 1 "$2" | xargs -P 4 -I{} sh -c "npx jest $f -t '0,0' --silent 2>&1 | grep -E '^Tests:'" >> "$3"
cp "$SP/corrigidos/hoje-amostra.bak" "$f"
