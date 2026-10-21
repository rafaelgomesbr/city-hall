#!/bin/zsh
# Uso: build.sh <pasta-dist>
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/apps/web
VITE_API_URL=http://127.0.0.1:5811 npx vite build --outDir "$1" --emptyOutDir
