#!/usr/bin/env bash
# DV-04 (V2-F00-E19): mostra o que o `npm ci --omit=dev` do Dockerfile instala no npm 10 e no npm 11
# sobre o lockfile honesto e sobre o lockfile com `fast-uri` (runtime) marcado `dev: true` à mão.
#
# Uso: bash npm10-vs-npm11.sh <pasta dc360> <pasta de trabalho vazia> <caminho do binário npm 10>
# O npm 10 vem de `npm i npm@10.9.9` numa pasta à parte. O npm 11 é o `npm` do PATH.
set -u
DC360="$1"; TRABALHO="$2"; NPM10="$3"
FERRAMENTAS="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$TRABALHO"; mkdir -p "$TRABALHO/base"
for f in package.json package-lock.json apps/api/package.json apps/console/package.json apps/web/package.json db/package.json packages/campo/package.json packages/shared/package.json; do
  mkdir -p "$TRABALHO/base/$(dirname "$f")"; cp "$DC360/$f" "$TRABALHO/base/$f"
done
echo "npm 10: $("$NPM10" -v)   npm 11: $(npm -v)   node: $(node -v)"
instalar() { # rotulo, npm, pasta-origem
  local pasta="$TRABALHO/$1"; rm -rf "$pasta"; cp -R "$3" "$pasta"
  ( cd "$pasta" && "$2" ci --omit=dev --ignore-scripts --workspaces --include-workspace-root >/dev/null 2>&1 )
  local n; n=$(ls "$pasta/node_modules" | wc -l | tr -d ' ')
  if [ -d "$pasta/node_modules/fast-uri" ]; then f=INSTALADO; else f="NAO instalado"; fi
  echo "  $1: $n entradas em node_modules; node_modules/fast-uri $f"
}
echo "== Lockfile HONESTO (fast-uri sem a marca dev)"
instalar honesto-npm10 "$NPM10" "$TRABALHO/base"
instalar honesto-npm11 npm "$TRABALHO/base"
echo "  conjunto instalado x grafo do npm ls --omit=dev --all, npm 10:"; ( cd "$TRABALHO/honesto-npm10" && node "$FERRAMENTAS/conjuntos.mjs" . )
echo "  conjunto instalado x grafo do npm ls --omit=dev --all, npm 11:"; ( cd "$TRABALHO/honesto-npm11" && node "$FERRAMENTAS/conjuntos.mjs" . )
echo "== Lockfile ADULTERADO (fast-uri 4.2.3, de runtime, com dev: true posto à mão)"
rm -rf "$TRABALHO/adulterado"; cp -R "$TRABALHO/base" "$TRABALHO/adulterado"
( cd "$TRABALHO/adulterado" && node -e '
const fs=require("fs");const l=JSON.parse(fs.readFileSync("package-lock.json","utf8"));
if (l.packages["node_modules/fast-uri"].dev === true) throw new Error("premissa: fast-uri nao deveria ser dev");
l.packages["node_modules/fast-uri"].dev=true;
fs.writeFileSync("package-lock.json",JSON.stringify(l,null,2)+"\n");' )
instalar adulterado-npm10 "$NPM10" "$TRABALHO/adulterado"
instalar adulterado-npm11 npm "$TRABALHO/adulterado"
echo "  npm ls --package-lock-only --omit=dev --all sobre o lockfile adulterado (npm 11), linhas com fast-uri:"
( cd "$TRABALHO/adulterado" && npm ls --package-lock-only --omit=dev --all fast-uri 2>&1 | grep fast-uri )
