#!/bin/zsh
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/3294a44b-7d6b-4289-a196-1ebe378eab16/scratchpad/c7/rig
[ -f $S/api.pid ] && kill -TERM -$(cat $S/api.pid) 2>/dev/null && sleep 2
: > $S/notificacoes.txt
PORT=6711 HOST=127.0.0.1 JWT_SEGREDO=segredo-de-teste-com-mais-de-trinta-e-dois-bytes-para-o-e2e \
ORIGENS_PERMITIDAS=http://localhost:6712 URL_PAINEL=http://localhost:6712 URL_PUBLICA=http://127.0.0.1:6711 \
LOGIN_POR_IP=10000 NOTIFICADOR_ARQUIVO=$S/notificacoes.txt \
node $S/subir.mjs api /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/agent-a94baa0e302566e18/dc360/apps/api npx tsx src/index.ts
for i in {1..120}; do curl -sf http://127.0.0.1:6711/saude >/dev/null && echo "API de pé" && exit 0; sleep 1; done
echo "API não subiu"; exit 1
