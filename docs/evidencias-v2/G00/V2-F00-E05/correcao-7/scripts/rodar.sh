#!/bin/zsh
# uso: rodar.sh <saida-api> <saida-console>
SC=/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/54f6b5ff-371d-4a36-b36c-52a06622523d/scratchpad/c7
D=/Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360
cp $SC/comum.ts $D/apps/api/zz-c7-comum.ts; cp $SC/sonda-api.ts $D/apps/api/zz-c7-sonda.ts
cp $SC/comum.ts $D/apps/console/zz-c7-comum.ts; cp $SC/sonda-console.ts $D/apps/console/zz-c7-sonda.ts
(cd $D/apps/api && node --version && ../../node_modules/.bin/tsx zz-c7-sonda.ts; echo "exit=$?") > $1 2>&1
(cd $D/apps/console && node --version && ../../node_modules/.bin/tsx zz-c7-sonda.ts; echo "exit=$?") > $2 2>&1
rm -f $D/apps/api/zz-c7-comum.ts $D/apps/api/zz-c7-sonda.ts $D/apps/console/zz-c7-comum.ts $D/apps/console/zz-c7-sonda.ts
