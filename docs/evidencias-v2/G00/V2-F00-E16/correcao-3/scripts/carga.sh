#!/bin/bash
# Uso: carga.sh <versao: antes|depois> <rodadas> <saida>
set -u
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/apps/campo
SP=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad
F=(src/__tests__/hoje-lista-e-mapa.test.tsx src/__tests__/tarefas-em-sanfona.test.tsx src/__tests__/mapa-tela-dedicada.test.tsx)
mkdir -p "$SP/corrigidos"
for f in "${F[@]}"; do cp "$f" "$SP/corrigidos/$(basename "$f")"; done
if [ "$1" = antes ]; then for f in "${F[@]}"; do git show "HEAD:dc360/apps/campo/$f" > "$f"; done; fi
PIDS=()
for i in $(seq 1 "$(sysctl -n hw.ncpu)"); do yes > /dev/null & PIDS+=($!); done
: > "$3"
for i in $(seq 1 "$2"); do npx jest "${F[@]}" --runInBand --silent 2>&1 | grep -E "^Tests:|✕" >> "$3"; done
for p in "${PIDS[@]}"; do kill "$p"; done
for f in "${F[@]}"; do cp "$SP/corrigidos/$(basename "$f")" "$f"; done
