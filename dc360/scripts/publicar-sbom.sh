#!/usr/bin/env bash
# Anexa os quatro SBOM CycloneDX ao Release da tag (V2-F01-E19).
#
# Chamado SÓ pelo job `publicar` do `sbom.yml`, que é o único job do repositório
# com `contents: write`, e só em tag. Este script é a parte que escreve; por isso
# fica separado, pequeno e testado com um `gh` de mentira
# (`scripts/sbom.test.mjs`).
#
# Uso: publicar-sbom.sh <tag> <pasta-com-os-sbom>
#
# O que faz, na ordem:
#   1. recusa tag fora do padrão `vX.Y.Z` ou `campo-vX.Y.Z` (o nome vai parar em
#      comando e em texto de release, então só passa o que o `versao.mjs` define);
#   2. exige os QUATRO arquivos (`*-npm-plataforma`, `*-npm-campo`, `*-imagem-api`
#      e `*-imagem-console`, todos `.cdx.json`) e confere que cada um é um
#      CycloneDX com componentes (`conferir-sbom.mjs`). Faltando um, não publica
#      NENHUM: SBOM pela metade parece completo;
#   3. grava `SHA256SUMS.txt` com o SHA-256 dos quatro (confira com
#      `sha256sum --check SHA256SUMS.txt`);
#   4. se não existe Release para a tag, cria como RASCUNHO. O repositório é
#      público e o SBOM lista versões de dependência: ele só fica visível a quem
#      tem acesso de escrita até uma pessoa publicar o Release;
#   5. anexa os cinco arquivos (`--clobber`: rodar de novo troca, não duplica).
#
# Precisa de `gh` autenticado (`GH_TOKEN`) e de `GH_REPO` (dono/repositório).
set -euo pipefail

tag="${1:-}"
pasta="${2:-}"
if [ -z "$tag" ] || [ -z "$pasta" ]; then
  echo "uso: publicar-sbom.sh <tag> <pasta-com-os-sbom>" >&2
  exit 2
fi
if ! [[ "$tag" =~ ^(campo-)?v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "tag fora do padrão (vX.Y.Z ou campo-vX.Y.Z): $tag" >&2
  exit 2
fi
if [ ! -d "$pasta" ]; then
  echo "pasta dos SBOM não existe: $pasta" >&2
  exit 2
fi

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# nome-do-sufixo:menor número de componentes esperado (sanidade, não precisão)
esperados=(
  "npm-plataforma:30"
  "npm-campo:100"
  "imagem-api:10"
  "imagem-console:10"
)

arquivos=()
for item in "${esperados[@]}"; do
  sufixo="${item%%:*}"
  minimo="${item##*:}"
  achados=()
  for f in "$pasta"/*-"$sufixo".cdx.json; do
    [ -e "$f" ] && achados+=("$f")
  done
  if [ "${#achados[@]}" -ne 1 ]; then
    echo "esperava exatamente 1 arquivo *-$sufixo.cdx.json em $pasta, achei ${#achados[@]}; nada foi publicado" >&2
    exit 1
  fi
  node "$AQUI/conferir-sbom.mjs" "${achados[0]}" "--minimo=$minimo" || { echo "SBOM reprovado; nada foi publicado" >&2; exit 1; }
  arquivos+=("${achados[0]}")
done

# SHA-256 com o nome do arquivo sem pasta, para o `--check` funcionar de dentro da pasta baixada.
soma="$pasta/SHA256SUMS.txt"
: > "$soma"
for f in "${arquivos[@]}"; do
  base="$(basename "$f")"
  if command -v sha256sum > /dev/null 2>&1; then
    (cd "$pasta" && sha256sum "$base") >> "$soma"
  else
    (cd "$pasta" && shasum -a 256 "$base") >> "$soma"
  fi
done
cat "$soma"

if ! gh release view "$tag" > /dev/null 2>&1; then
  echo "sem Release para $tag: criando como RASCUNHO"
  gh release create "$tag" --draft --verify-tag --title "$tag" \
    --notes "Rascunho criado por sbom.yml para anexar o SBOM CycloneDX. As notas da versão vêm do fluxo de release; publique o Release depois de revisar."
fi
gh release upload "$tag" "${arquivos[@]}" "$soma" --clobber
echo "SBOM anexado ao Release $tag"
