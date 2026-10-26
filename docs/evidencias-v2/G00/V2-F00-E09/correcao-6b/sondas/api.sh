#!/bin/zsh
S=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad
[ -f $S/rig/api.pid ] && kill -TERM -$(cat $S/rig/api.pid) 2>/dev/null && sleep 2
: > $S/rig/notificacoes.txt
PORT=5811 HOST=127.0.0.1 JWT_SEGREDO=segredo-de-teste-com-mais-de-trinta-e-dois-bytes-para-o-e2e \
ORIGENS_PERMITIDAS=http://localhost:5812 URL_PAINEL=http://localhost:5812 URL_PUBLICA=http://127.0.0.1:5811 \
LOGIN_POR_IP=10000 NOTIFICADOR_ARQUIVO=$S/rig/notificacoes.txt \
node $S/rig/subir.mjs api /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/apps/api npx tsx src/index.ts
for i in {1..120}; do curl -sf http://127.0.0.1:5811/saude >/dev/null && echo "API de pé" && exit 0; sleep 1; done
echo "API não subiu"; exit 1
