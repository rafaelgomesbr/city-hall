#!/bin/bash
# Confere os índices numa árvore limpa: HEAD + só os caminhos desta correção, num repositório git temporário.
set -eu
WT=/Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1
D=$(mktemp -d /private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad/limpo.XXXX)
git -C "$WT" archive HEAD docs dc360/scripts .gitattributes | tar -x -C "$D"
for p in docs/evidencias-v2/G00/V2-F00-E16; do rm -rf "$D/$p"; mkdir -p "$D/$(dirname $p)"; cp -R "$WT/$p" "$D/$p"; done
cd "$D" && git init -q && git add -A && git -c user.email=x@x -c user.name=x commit -qm limpo
echo "# árvore: HEAD $(git -C "$WT" rev-parse --short HEAD) + docs/evidencias-v2/G00/V2-F00-E16 do disco, repositório temporário"
node dc360/scripts/conferir-indices-de-evidencia.mjs 2>&1 | tail -3; echo "saida: ${PIPESTATUS[0]}"
rm -rf "$D"
