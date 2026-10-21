#!/bin/bash
# Roda auditar.test.mjs contra cópias do portão com uma parte da correção 8 desfeita.
# Uso: mutar.sh <pasta dc360>
cd "$1" || exit 9
mut() {
  T=$(mktemp -d /tmp/e19c6/c8/mut-XXXX); mkdir -p $T/scripts $T/apps/campo $T/packages/shared
  cp scripts/auditar.mjs scripts/auditar-excecoes.mjs scripts/auditar.test.mjs $T/scripts/; cp package-lock.json $T/; cp packages/shared/package.json $T/packages/shared/
  python3 -c "$2" $T/scripts
  echo "=== mutação: $1"; (cd $T && node --test scripts/auditar.test.mjs 2>&1 | grep -E "^  ✖|^ℹ (tests|pass|fail)" | sort -u); rm -rf $T; }
R='import sys;d=sys.argv[1];'
mut "sem conferir a configuração do npm" "$R p=d+'/auditar.mjs';s=open(p).read();a='conferirConfiguracaoDoNpm(RAIZ, \"a raiz\");\nconferirConfiguracaoDoNpm(APLICATIVO, \"o aplicativo de campo\");';assert a in s;open(p,'w').write(s.replace(a,''))"
mut "sem --package-lock=true" "$R p=d+'/auditar-excecoes.mjs';s=open(p).read();a='  \"--package-lock=true\",\n';assert a in s;open(p,'w').write(s.replace(a,''))"
mut "com --workspaces=false de volta" "$R p=d+'/auditar-excecoes.mjs';s=open(p).read();a='  \"--package-lock=true\",\n';assert a in s;open(p,'w').write(s.replace(a,a+'  \"--workspaces=false\",\n'))"
mut "sem --package-lock-only=false nas consultas reais" "$R p=d+'/auditar.mjs';s=open(p).read();a='\"--package-lock-only=false\", ';assert s.count(a)==3;open(p,'w').write(s.replace(a,''))"
mut "prazo em UTC de novo" "$R p=d+'/auditar-excecoes.mjs';s=open(p).read();a='timeZone: \"America/Sao_Paulo\"';assert a in s;open(p,'w').write(s.replace(a,'timeZone: \"UTC\"'))"
mut "sem anular as variáveis do npm run" "$R p=d+'/auditar-excecoes.mjs';s=open(p).read();a='|cache|global[_-]prefix|globalconfig|init[_-]module|local[_-]prefix|node[_-]gyp|noproxy|npm[_-]version|prefix|user[_-]agent|userconfig';assert a in s;open(p,'w').write(s.replace(a,''))"
mut "sem ler o .npmrc do projeto do disco nem as variáveis (só o npm config list)" "$R p=d+'/auditar.mjs';s=open(p).read();a='  if (existsSync(npmrc)) {';assert a in s;s=s.replace(a,'  if (false) {');b='    if (/^npm_config_/i.test(nome)) chaves.push';assert b in s;s=s.replace(b,'    if (false) chaves.push');open(p,'w').write(s)"
mut "sem ler o npm config list (só o disco e as variáveis)" "$R p=d+'/auditar.mjs';s=open(p).read();a='  const { chaves, prefixoLocal } = lerNpmConfigList(texto);';assert a in s;open(p,'w').write(s.replace(a,'  const { prefixoLocal } = lerNpmConfigList(texto); const chaves = [];'))"
mut "sem conferir o npm local prefix" "$R p=d+'/auditar.mjs';s=open(p).read();a='  if (prefixoLocal === null || real(prefixoLocal) !== real(projeto)) {';assert a in s;open(p,'w').write(s.replace(a,'  if (false) {'))"
