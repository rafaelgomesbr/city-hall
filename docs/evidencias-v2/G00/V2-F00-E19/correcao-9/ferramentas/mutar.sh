#!/bin/bash
# Roda auditar.test.mjs contra cópias do portão com uma parte da correção 9 desfeita.
# Uso: mutar.sh <pasta dc360>
cd "$1" || exit 9
mut() {
  T=$(mktemp -d /tmp/e19c6/c9/mut-XXXX); mkdir -p $T/scripts $T/apps/campo $T/packages/shared
  cp scripts/auditar.mjs scripts/auditar-excecoes.mjs scripts/auditar.test.mjs $T/scripts/; cp package-lock.json $T/; cp packages/shared/package.json $T/packages/shared/
  python3 -c "$2" $T/scripts
  echo "=== mutação: $1"; (cd $T && node --test scripts/auditar.test.mjs 2>&1 | grep -E "^  ✖|^ℹ (tests|pass|fail)" | sort -u); rm -rf $T; }
R='import sys;d=sys.argv[1];'
mut "sem procurar npm-shrinkwrap.json" "$R p=d+'/auditar.mjs';s=open(p).read();a='if (achados.length > 0 || naoExpandidos.length > 0) {';assert a in s;open(p,'w').write(s.replace(a,'if (false) {'))"
mut "shrinkwrap só na raiz (sem aplicativo nem workspaces)" "$R p=d+'/auditar-excecoes.mjs';s=open(p).read();a='  const pastas = [raiz, ...outrasPastas];';assert a in s;s=s.replace(a,'  const pastas = [raiz];');b='  for (const padrao of workspaces) {';assert b in s;s=s.replace(b,'  for (const padrao of []) {');open(p,'w').write(s)"
mut "prefixo comparado sem a máscara do npm (como na correção 8)" "$R p=d+'/auditar-excecoes.mjs';s=open(p).read();a='c === prefixoDoNpm || mascararComoONpm(c) === prefixoDoNpm';assert a in s;open(p,'w').write(s.replace(a,'c === prefixoDoNpm'))"
mut "prefixo aceito sempre (sem conferir o projeto)" "$R p=d+'/auditar-excecoes.mjs';s=open(p).read();a='  if (typeof prefixoDoNpm !== ';assert a in s;open(p,'w').write(s.replace(a,'  return true;'+a))"
