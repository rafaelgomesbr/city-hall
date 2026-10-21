#!/bin/bash
# Prepara uma cópia do dc360 (git archive, sem node_modules) com runtime vulnerável
# plantado: fast-uri 3.0.1 (advisory alta) no package-lock.json da raiz.
# Uso: preparar-copia.sh <repositório> <commit> <destino> <variante>
#   plantada      só o plantio
#   plock         plantio + .npmrc da raiz com package-lock=false (achado 1 da rodada 7)
#   raiz-com-dep  plantio + uma dependência direta na raiz (@electric-sql/pglite)
#   proibida      plantio + .npmrc da raiz com before=2020-01-01
#   permitidas    plantio + .npmrc da raiz com TODAS as chaves permitidas em valor hostil (menos a credencial)
#   credencial    plantio + .npmrc da raiz com uma credencial falsa do registro oficial
#   shrinkwrap    package-lock.json LIMPO copiado para npm-shrinkwrap.json na raiz, e só depois o plantio no package-lock.json
#   shrinkwrap-app  um npm-shrinkwrap.json (cópia do lock limpo do aplicativo) em apps/campo, com o plantio na raiz
#   usuario       plantio + npmrc do usuário (NPM_CONFIG_USERCONFIG não serve: é anulada) em ~ falso, com omit=dev
set -e
REPO=$1; SHA=$2; DEST=$3; VAR=$4
rm -rf "$DEST"; mkdir -p "$DEST"
git -C "$REPO" archive "$SHA" dc360 | tar -x -C "$DEST"
cd "$DEST/dc360"
[ "$VAR" = shrinkwrap ] && cp package-lock.json npm-shrinkwrap.json
[ "$VAR" = shrinkwrap-app ] && cp apps/campo/package-lock.json apps/campo/npm-shrinkwrap.json
node -e '
const fs=require("fs");const l=JSON.parse(fs.readFileSync("package-lock.json"));
const x="node_modules/fast-uri";l.packages[x].version="3.0.1";l.packages[x].resolved="https://registry.npmjs.org/fast-uri/-/fast-uri-3.0.1.tgz";delete l.packages[x].integrity;
if (process.argv[1]==="raiz-com-dep"){const p=JSON.parse(fs.readFileSync("package.json"));const v=l.packages["node_modules/@electric-sql/pglite"].version;
l.packages[""].dependencies={"@electric-sql/pglite":v};p.dependencies={"@electric-sql/pglite":v};fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n");}
fs.writeFileSync("package-lock.json",JSON.stringify(l,null,2)+"\n");' "$VAR"
case "$VAR" in
  plock) echo "package-lock=false" > .npmrc;;
  proibida) echo "before=2020-01-01" > .npmrc;;
  permitidas) printf '%s\n' loglevel=silent color=false progress=false fund=false update-notifier=false \
      cache=/tmp/e19c6/c8/cache-hostil prefix=/tmp/e19c6/c8/prefixo-sem-npmrc registry=http://127.0.0.1:9/ \
      offline=true prefer-offline=true prefer-online=false dry-run=true package-lock=false package-lock-only=true \
      audit-level=critical json=false > .npmrc;;
  credencial) echo "//registry.npmjs.org/:_authToken=token-falso-de-teste" > .npmrc;;
esac
