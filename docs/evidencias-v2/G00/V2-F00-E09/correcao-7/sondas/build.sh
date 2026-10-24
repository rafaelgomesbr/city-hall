#!/bin/zsh
# Uso: build.sh <pasta-dist>
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-a94baa0e302566e18/dc360/apps/web
VITE_API_URL=http://127.0.0.1:6711 npx vite build --outDir "$1" --emptyOutDir
