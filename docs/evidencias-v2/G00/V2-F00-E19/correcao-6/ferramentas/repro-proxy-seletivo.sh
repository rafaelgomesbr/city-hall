#!/bin/bash
# Variante do proxy da revisão: forja {} só nas consultas cujo número de pacotes
# está em FORJAR (80 = runtime da raiz, 231 = completa da raiz, 669 = aplicativo,
# em 2026-10-20) e repassa as demais ao registro real.
cd "$1" || exit 9
P=/tmp/e19c6/proxy
for f in 80 231 669; do
  : > $P/proxy.log
  FORJAR=$f node $P/proxy-seletivo.mjs & PID=$!; sleep 1
  npm_config_https_proxy=http://127.0.0.1:5661 npm_config_proxy=http://127.0.0.1:5661 npm_config_cafile=$P/cert.pem \
    node "$2" > /tmp/e19c6/proxy.out 2>&1; c=$?
  kill $PID; wait $PID 2>/dev/null
  echo "=== proxy que forja {} só na consulta com $f pacotes"
  grep -E "^Runtime|^Desenvolvimento \(|^Aplicativo de campo \(|ERRO|Advisories conhecidas|REPROVADO|Consulta de controle|Runtime limpo" /tmp/e19c6/proxy.out | cut -c1-260 | sed 's/^/    /'
  echo "    codigo=$c"; echo "    proxy: $(grep bulk $P/proxy.log | tr '\n' ';')"
done
