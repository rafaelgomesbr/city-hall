#!/bin/zsh
# Uso: build.sh <pasta-dist>
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-a7c8fc1753d4a634f/dc360/apps/web
VITE_API_URL=http://127.0.0.1:7811 npx vite build --outDir "$1" --emptyOutDir
