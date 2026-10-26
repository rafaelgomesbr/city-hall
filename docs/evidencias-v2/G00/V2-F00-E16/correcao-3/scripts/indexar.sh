#!/bin/bash
# Regera correcao-3/INDEX.md e as linhas correcao-3/ do INDEX de topo da E16.
set -eu
cd /Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/docs/evidencias-v2/G00/V2-F00-E16
LINHAS=$(cd correcao-3 && find . -type f ! -name INDEX.md | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do echo "| $f | $(shasum -a 256 "$f" | cut -d' ' -f1) |"; done)
printf '# INDEX\n\n| Arquivo | SHA-256 |\n| --- | --- |\n%s\n' "$LINHAS" > correcao-3/INDEX.md
grep -v '^| correcao-3/' INDEX.md > INDEX.md.tmp || true
printf '%s\n' "$LINHAS" | sed 's/^| /| correcao-3\//' >> INDEX.md.tmp
mv INDEX.md.tmp INDEX.md
