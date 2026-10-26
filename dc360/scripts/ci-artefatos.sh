#!/usr/bin/env bash
# Apoio do CI (.github/workflows/verificar.yml) para os artefatos de cada job.
#
# A politica de validacao (docs/roadmap-v2/28-execucao-e-validacao.md, secoes 6
# e 8) avalia o CI "job a job, com artefato", sobre o SHA do commit candidato.
# Para o artefato servir de prova ele precisa dizer DE QUAL execucao veio, e nao
# pode carregar segredo. Este arquivo faz as duas coisas, em dois subcomandos:
#
#   ci-artefatos.sh contexto PASTA
#       grava PASTA/00-contexto.txt: o SHA, o ramo, o evento, o run, as versoes
#       das ferramentas. Nada secreto.
#
#   ci-artefatos.sh redigir PASTA [SUBPASTA_A_PULAR ...]
#       troca, nos arquivos de texto de PASTA, o que parece segredo por um
#       marcador: URL com usuario e senha, JWT, Bearer, `PASSWORD '...'` de SQL,
#       variavel de senha ou de segredo atribuida, e token do GitHub. As
#       SUBPASTAS citadas sao puladas: o baseline.mjs ja redige a propria saida e
#       publica um INDEX.md com o SHA-256 de cada arquivo, que reescrever depois
#       invalidaria.
#
# As senhas do job de restore sao geradas na hora e jamais entram em arquivo de
# saida, mas o log de um servidor Postgres pode repetir o texto de um comando
# que falhou, e por isso a redacao existe mesmo assim.
#
# Rodar:  bash dc360/scripts/ci-artefatos.sh contexto "$RUNNER_TEMP/artefatos"
set -euo pipefail

subcomando="${1:-}"
pasta="${2:-}"
if [ -z "$subcomando" ] || [ -z "$pasta" ]; then
  echo "uso: ci-artefatos.sh contexto|redigir PASTA [SUBPASTA_A_PULAR ...]" >&2
  exit 2
fi
shift 2

case "$subcomando" in
  contexto)
    mkdir -p "$pasta"
    {
      echo "workflow:         ${GITHUB_WORKFLOW:-?}"
      echo "job:              ${GITHUB_JOB:-?}"
      echo "evento:           ${GITHUB_EVENT_NAME:-?}"
      echo "run:              ${GITHUB_RUN_ID:-?} (tentativa ${GITHUB_RUN_ATTEMPT:-?})"
      echo "repositorio:      ${GITHUB_REPOSITORY:-?}"
      echo "ref:              ${GITHUB_REF:-?}"
      echo "sha do run:       ${GITHUB_SHA:-?}"
      # Em pull_request o SHA do run e o de um merge sintetico. O commit
      # candidato, o que o gatekeeper fixa, e o da ponta do ramo.
      echo "sha da ponta (PR): ${PR_HEAD_SHA:-(nao e pull_request)}"
      echo "git HEAD:         $(git rev-parse HEAD 2>/dev/null || echo '?')"
      echo "runner:           ${RUNNER_OS:-?} ${RUNNER_ARCH:-?} (imagem ${ImageOS:-?} ${ImageVersion:-?})"
      echo "node:             $(node --version 2>/dev/null || echo '?')"
      echo "npm:              $(npm --version 2>/dev/null || echo '?')"
      echo "uname:            $(uname -srm)"
      echo "inicio (UTC):     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$pasta/00-contexto.txt"
    ;;

  redigir)
    [ -d "$pasta" ] || { echo "pasta inexistente: $pasta" >&2; exit 2; }
    pular=("$@")
    achados=()
    while IFS= read -r -d '' arquivo; do
      achados+=("$arquivo")
    done < <(
      if [ "${#pular[@]}" -eq 0 ]; then
        find "$pasta" -type f -print0
      else
        argumentos=()
        for s in "${pular[@]}"; do argumentos+=(! -path "$pasta/$s/*"); done
        find "$pasta" -type f "${argumentos[@]}" -print0
      fi
    )
    for arquivo in "${achados[@]}"; do
      # So texto: um binario nao tem o que redigir e sed o estragaria.
      if ! grep -Iq . "$arquivo" 2>/dev/null; then continue; fi
      sed -i -E \
        -e 's#([A-Za-z][A-Za-z0-9+.-]*://)[^/[:space:]:@]+:[^/[:space:]@]+@#\1[REDIGIDO]@#g' \
        -e 's#eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*#[JWT REDIGIDO]#g' \
        -e 's#([Bb][Ee][Aa][Rr][Ee][Rr][[:space:]]+)[A-Za-z0-9._~+/=-]{8,}#\1[REDIGIDO]#g' \
        -e "s#([Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd][[:space:]]+')[^']*'#\\1[REDIGIDO]'#g" \
        -e 's#((JWT_SEGREDO|PGPASSWORD|POSTGRES_PASSWORD|SENHA[A-Z_]*|[A-Z_]*TOKEN[A-Z_]*)=)[^[:space:]]+#\1[REDIGIDO]#g' \
        -e 's#(gh[pousr]_)[A-Za-z0-9]{20,}#\1[REDIGIDO]#g' \
        "$arquivo"
    done
    echo "redigidos ${#achados[@]} arquivo(s) em $pasta"
    ;;

  *)
    echo "subcomando desconhecido: $subcomando" >&2
    exit 2
    ;;
esac
