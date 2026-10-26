#!/bin/bash
# Roda o portão de cada variante (npm real, com rede) e mostra o código.
# Uso: rodar-copias.sh <repositório> <commit>
rm -rf /tmp/e19c6/c8/prefixo-hostil /tmp/e19c6/c8/prefixo-sem-npmrc /tmp/e19c6/c8/casa
for v in ${VARIANTES:-plantada plock raiz-com-dep proibida permitidas credencial global usuario env-proibida env-permitida shrinkwrap shrinkwrap-app uuid}; do
  AMB=()
  D=/tmp/e19c6/c9/copias/$v
  # uuid: a cópia plantada numa pasta com cara de UUID, que o npm 11 mascara como *** no npm config list
  [ "$v" = uuid ] && D=/tmp/e19c6/c9/copias/123e4567-e89b-12d3-a456-426614174000/uuid
  if [ "$v" = global ]; then
    # npmrc GLOBAL hostil: prefix apontado (pelo .npmrc do projeto, chave permitida) para uma pasta cujo etc/npmrc tem omit=dev
    bash /tmp/e19c6/c9/preparar-copia.sh "$1" "$2" "$D" plantada >/dev/null
    mkdir -p /tmp/e19c6/c8/prefixo-hostil/etc && echo "omit=dev" > /tmp/e19c6/c8/prefixo-hostil/etc/npmrc
    echo "prefix=/tmp/e19c6/c8/prefixo-hostil" > $D/dc360/.npmrc
  elif [ "$v" = uuid ]; then
    bash /tmp/e19c6/c9/preparar-copia.sh "$1" "$2" "$D" plantada >/dev/null
  elif [ "$v" = usuario ]; then
    # npmrc do USUÁRIO hostil: HOME falso cujo .npmrc tem omit=dev (npm_config_userconfig seria anulada)
    bash /tmp/e19c6/c9/preparar-copia.sh "$1" "$2" "$D" plantada >/dev/null
    mkdir -p /tmp/e19c6/c8/casa && echo "omit=dev" > /tmp/e19c6/c8/casa/.npmrc
    AMB=(HOME=/tmp/e19c6/c8/casa npm_config_cache=$HOME/.npm)
  elif [ "$v" = env-proibida ]; then
    bash /tmp/e19c6/c9/preparar-copia.sh "$1" "$2" "$D" plantada >/dev/null
    AMB=(npm_config_omit=dev)
  elif [ "$v" = env-permitida ]; then
    bash /tmp/e19c6/c9/preparar-copia.sh "$1" "$2" "$D" plantada >/dev/null
    AMB=(npm_config_package_lock=false NPM_CONFIG_OFFLINE=true npm_config_userconfig=/tmp/nao-existe/.npmrc)
  else
    bash /tmp/e19c6/c9/preparar-copia.sh "$1" "$2" "$D" "$v" >/dev/null
  fi
  echo "=== variante $v ($(cat $D/dc360/.npmrc 2>/dev/null || echo 'sem .npmrc'); shrinkwrap: $(cd $D/dc360 && ls npm-shrinkwrap.json apps/campo/npm-shrinkwrap.json 2>/dev/null | tr '\n' ' '))"
  [ ${#AMB[@]} -gt 0 ] && echo "    ambiente: ${AMB[*]}"
  (cd $D/dc360 && env "${AMB[@]}" node scripts/auditar.mjs > /tmp/e19c6/c9/saida.txt 2>&1; echo "    codigo=$?" > /tmp/e19c6/c9/codigo.txt)
  grep -E "^  - |npm local prefix|^Runtime \(|REPROVADO|ERRO|Motivo|Chave|chave|Runtime limpo|não é confiável" /tmp/e19c6/c9/saida.txt | cut -c1-220 | sed 's/^/    /'
  cat /tmp/e19c6/c9/codigo.txt
done
