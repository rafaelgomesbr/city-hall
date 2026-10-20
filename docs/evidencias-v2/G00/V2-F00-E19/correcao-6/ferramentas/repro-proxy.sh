#!/bin/bash
# O proxy de inspeção TLS da revisão de 915bb6a: repassa ao registro real só a
# consulta de controle (lodash) e responde {} às outras. Configuração do npm:
# https-proxy e cafile (como numa rede corporativa com inspeção TLS).
# Certificado do proxy (descartável, fora do git): openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj /CN=registry.npmjs.org -addext subjectAltName=DNS:registry.npmjs.org -keyout /tmp/e19c6/proxy/key.pem -out /tmp/e19c6/proxy/cert.pem
# Uso: repro-proxy.sh <pasta dc360> <script do portão, relativo a dc360>
cd "$1" || exit 9
P=/tmp/e19c6/proxy
: > $P/proxy.log
node $P/proxy.mjs & PID=$!; sleep 1
npm_config_https_proxy=http://127.0.0.1:5661 npm_config_proxy=http://127.0.0.1:5661 npm_config_cafile=$P/cert.pem \
  node "$2" > /tmp/e19c6/proxy.out 2>&1; c=$?
kill $PID; wait $PID 2>/dev/null
grep -v "^  aceita" /tmp/e19c6/proxy.out
echo "codigo=$c"
echo "--- o que o proxy fez:"; cat $P/proxy.log
