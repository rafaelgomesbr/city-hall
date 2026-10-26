#!/usr/bin/env bash
# Uso: rodar2.sh SHELL(bash|zsh) BLOCOS SAIDAS
# Monta UM fluxo com todos os blocos do documento, em ordem, marcados, e o entrega
# ao shell pela entrada padrao, como quem cola os blocos num terminal:
#   bash: bash --noprofile --norc ARQUIVO, stdin em /dev/null (nao interativo, set -e; ver nota no RESUMO sobre por que nao e via stdin)
#   zsh:  zsh -f -i                (interativo, zsh puro, SEM interactivecomments, set -e)
# Cada bloco aborta no primeiro comando que falha (set -e). Depois o fluxo e
# repartido por bloco em SAIDAS/NN.txt, com o texto do documento acima da saida.
SH="$1"; BL="$2"; SA="$3"; mkdir -p "$SA"
FLUXO="$SA/fluxo-entrada.txt"; BRUTA="$SA/fluxo-saida-bruta.txt"
{
  echo 'set -e'
  echo "PS1=''; PS2=''; PROMPT=''; PROMPT2=''; RPROMPT=''"
  for f in "$BL"/*.sh; do
    n=$(basename "$f" .sh)
    echo "echo '@@INICIO $n'"
    cat "$f"
    echo "echo '@@FIM $n'"
  done
  echo 'echo @@TUDO'
} > "$FLUXO"
case "$SH" in
  bash) bash --noprofile --norc "$FLUXO" < /dev/null > "$BRUTA" 2>&1 ;;
  zsh)  zsh -f -i < "$FLUXO" > "$BRUTA" 2>&1 ;;
esac
echo "codigo do shell: $?" >> "$BRUTA"
python3 - "$BL" "$SA" "$BRUTA" <<'PY'
import sys,re,glob,os
bl,sa,bruta=sys.argv[1:4]
t=open(bruta,encoding='utf-8',errors='replace').read()
ok=0; falhou=[]
for f in sorted(glob.glob(bl+'/*.orig')):
    n=os.path.basename(f)[:2]
    m=re.search(r'@@INICIO %s\n(.*?)(?:@@FIM %s\n|\Z)'%(n,n),t,re.S)
    corpo=m.group(1) if m else '(bloco nao iniciado)\n'
    fim=('@@FIM '+n) in t
    open(f'{sa}/{n}.txt','w',encoding='utf-8').write('$ # bloco %s (texto do documento, antes das 5 substituicoes de placeholder)\n%s\n--- saida ---\n%s--- bloco terminou: %s ---\n'%(n,open(f,encoding='utf-8').read(),corpo,'sim' if fim else 'NAO'))
    if fim: ok+=1
    else: falhou.append(n)
tudo='@@TUDO' in t
print(f'blocos concluidos: {ok}; fluxo inteiro: {tudo}; nao concluidos: {falhou}')
PY
