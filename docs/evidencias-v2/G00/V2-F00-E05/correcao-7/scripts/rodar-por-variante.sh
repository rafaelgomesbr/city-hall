#!/bin/zsh
# uso: rodar-por-variante.sh <saida-api> <saida-console>: um processo por variante (para ver todas, mesmo se uma derruba).
SC=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad/c7
D=/Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360
cp $SC/comum.ts $D/apps/api/zz-c7-comum.ts; cp $SC/sonda-api.ts $D/apps/api/zz-c7-sonda.ts
cp $SC/comum.ts $D/apps/console/zz-c7-comum.ts; cp $SC/sonda-console.ts $D/apps/console/zz-c7-sonda.ts
VS=$(sed -n '/^export const VARIANTES = \[/,/\];/p' $SC/comum.ts | grep -o '"[a-z0-9-]*"' | tr -d '"')
: > $1; : > $2
for v in ${(f)VS}; do
  (cd $D/apps/api && SO_VARIANTE=$v ../../node_modules/.bin/tsx zz-c7-sonda.ts 2>&1 | grep -v '^api: '; echo "  [processo da variante $v: exit=${pipestatus[1]}]") >> $1
  (cd $D/apps/console && SO_VARIANTE=$v ../../node_modules/.bin/tsx zz-c7-sonda.ts 2>&1 | grep -v '^console: '; echo "  [processo da variante $v: exit=${pipestatus[1]}]") >> $2
done
rm -f $D/apps/api/zz-c7-comum.ts $D/apps/api/zz-c7-sonda.ts $D/apps/console/zz-c7-comum.ts $D/apps/console/zz-c7-sonda.ts
