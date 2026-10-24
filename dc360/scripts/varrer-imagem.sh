#!/usr/bin/env bash
# Varredura de imagem de contêiner com o Trivy (V2-F01-E20).
#
# Um lugar só para o que o PR (job `imagens` do verificar.yml) e a agenda semanal
# (auditoria-semanal.yml) precisam fazer igual: baixar o Trivy e varrer. Se cada
# workflow tivesse a sua cópia, a versão, o checksum e a régua divergiriam, e a
# política de exceção testada deixaria de ser a que roda.
#
# Subcomandos:
#   instalar <destino>
#       Baixa o Trivy NA VERSÃO FIXA abaixo, confere o SHA-256 do tarball do
#       release (como o gitleaks da E04) e instala o binário em <destino>.
#       Imprime o caminho do binário. Reprova se o checksum não bate.
#   varrer <trivy> <saida> <nome> <fonte...>
#       Varre uma imagem e grava <saida>/<nome>.json, .sarif e .txt. <fonte> é o
#       que o `trivy image` entende: `dc360-api:ci` ou `--input arquivo.tar`.
#       Sai 0 (limpa), 1 (achado que reprova) ou 2 (não consegui varrer: banco
#       de vulnerabilidades indisponível, imagem ilegível). Nunca "verde" por
#       falha da ferramenta.
#
# A régua (a mesma nos dois lugares):
#   --scanners vuln,secret   pacotes do sistema e das linguagens, e segredo na imagem
#                            (um `.env` ou chave que entrou por `COPY` reprova);
#   --severity CRITICAL,HIGH só o que é grave;
#   --ignore-unfixed         só o que tem correção publicada (a "correção
#                            disponível" do critério): CVE sem correção não é
#                            algo que o time possa resolver, e vira ruído;
#   --ignorefile .trivyignore a ÚNICA porta de exceção. Cada linha tem
#                            id, motivo, dono e prazo, e o teste
#                            `excecoes-de-seguranca.test.mjs` reprova a que
#                            não tem ou que venceu. O próprio Trivy também
#                            deixa de ignorar a linha vencida (`exp:`), então
#                            o scan volta a reprovar sozinho.
#
# Para subir a versão do Trivy: troque TRIVY_VERSAO e TRIVY_SHA256 juntos, com o
# hash de `trivy_<versão>_checksums.txt` do release, linha `Linux-64bit.tar.gz`.
# O release foi baixado e o hash do tarball conferido localmente antes de entrar aqui.
#
# O script não usa segredo nenhum e não publica nada.
set -euo pipefail

TRIVY_VERSAO="0.75.0"
# SHA-256 de trivy_0.75.0_Linux-64bit.tar.gz, igual ao de trivy_0.75.0_checksums.txt
# no release oficial de aquasecurity/trivy.
TRIVY_SHA256="c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f"

RAIZ_DO_REPOSITORIO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Quem chama pode apontar outro arquivo (os testes usam isso); o padrão é o da raiz.
ARQUIVO_DE_EXCECOES="${TRIVY_ARQUIVO_DE_EXCECOES:-$RAIZ_DO_REPOSITORIO/.trivyignore}"
GRAVIDADES="CRITICAL,HIGH"

# Sem verificação de versão nova e sem telemetria: nada além do banco de
# vulnerabilidades sai do runner, e nada do código da imagem vai para fora.
export TRIVY_SKIP_VERSION_CHECK=true
export TRIVY_DISABLE_TELEMETRY=true

instalar() {
  local destino="${1:?uso: varrer-imagem.sh instalar <destino>}"
  local arquivo="trivy_${TRIVY_VERSAO}_Linux-64bit.tar.gz"
  mkdir -p "$destino"
  curl --fail --silent --show-error --location --retry 3 --retry-delay 5 \
    --output "$destino/$arquivo" \
    "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSAO}/${arquivo}"
  # No runner (Linux) é o `sha256sum`; o `shasum` é só para quem roda na máquina de um Mac.
  if command -v sha256sum > /dev/null 2>&1; then
    echo "${TRIVY_SHA256}  ${destino}/${arquivo}" | sha256sum --check --strict
  else
    echo "${TRIVY_SHA256}  ${destino}/${arquivo}" | shasum -a 256 --check
  fi
  tar -xzf "$destino/$arquivo" -C "$destino" trivy
  rm -f "$destino/$arquivo"
  "$destino/trivy" --version >&2
  echo "$destino/trivy"
}

varrer() {
  local trivy="${1:?uso: varrer-imagem.sh varrer <trivy> <saida> <nome> <fonte...>}"
  local saida="${2:?falta a pasta de saída}"
  local nome="${3:?falta o nome}"
  shift 3
  if [ "$#" -eq 0 ]; then echo "falta a fonte da imagem" >&2; return 2; fi
  if [ ! -f "$ARQUIVO_DE_EXCECOES" ]; then
    echo "::error::arquivo de exceções ausente: $ARQUIVO_DE_EXCECOES (a política de exceção mora nele, mesmo vazio)" >&2
    return 2
  fi
  mkdir -p "$saida"
  local json="$saida/$nome.json"

  # 1. Varre uma vez e grava o JSON completo. `--exit-code 0` aqui: quem reprova
  #    é o passo 3, depois de os relatórios existirem. Falha da ferramenta
  #    (banco fora do ar, imagem ilegível) sai diferente de 0 e vira código 2.
  if ! "$trivy" image --no-progress --format json --output "$json" \
      --scanners vuln,secret --severity "$GRAVIDADES" --ignore-unfixed \
      --ignorefile "$ARQUIVO_DE_EXCECOES" --exit-code 0 "$@"; then
    echo "::error::o Trivy não conseguiu varrer $nome (banco de vulnerabilidades indisponível ou imagem ilegível)" >&2
    return 2
  fi

  # 2. SARIF para quem quiser subir ao code scanning (ver a nota no verificar.yml).
  "$trivy" convert --format sarif --output "$saida/$nome.sarif" \
    --severity "$GRAVIDADES" --ignorefile "$ARQUIVO_DE_EXCECOES" "$json" || return 2

  # 3. O portão: tabela legível e código 1 se sobrou achado de CRITICAL ou HIGH.
  local codigo=0
  "$trivy" convert --format table --severity "$GRAVIDADES" \
    --ignorefile "$ARQUIVO_DE_EXCECOES" --exit-code 1 --output "$saida/$nome.txt" "$json" || codigo=$?
  cat "$saida/$nome.txt"

  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    if [ "$codigo" -eq 0 ]; then
      echo "- Trivy, \`$nome\`: sem CRITICAL nem HIGH com correção disponível." >> "$GITHUB_STEP_SUMMARY"
    else
      echo "- Trivy, \`$nome\`: **REPROVOU**, há CRITICAL ou HIGH com correção disponível (tabela no artefato \`$nome.txt\`)." >> "$GITHUB_STEP_SUMMARY"
    fi
  fi
  return "$codigo"
}

comando="${1:-}"
[ "$#" -gt 0 ] && shift
case "$comando" in
  instalar) instalar "$@" ;;
  varrer) varrer "$@" ;;
  *)
    echo "uso: varrer-imagem.sh instalar <destino> | varrer <trivy> <saida> <nome> <fonte...>" >&2
    exit 2
    ;;
esac
