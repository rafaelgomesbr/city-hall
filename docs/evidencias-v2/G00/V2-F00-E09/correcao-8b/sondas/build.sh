#!/bin/zsh
# Uso: build.sh <pasta-dist>
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-af6748ac926c49c3b/dc360/apps/web
VITE_API_URL=http://127.0.0.1:7831 npx vite build --outDir "$1" --emptyOutDir
