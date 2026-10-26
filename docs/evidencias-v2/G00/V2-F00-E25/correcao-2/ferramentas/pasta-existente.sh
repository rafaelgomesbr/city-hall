#!/bin/bash
# Prova do passo 0 e do passo 7 quando PASTA_RESTORE ja existe no terminal do leitor (pasta dele, com arquivo importante).
# Uso: pasta-existente.sh DOC.md DIR_DE_TRABALHO
# Extrai do documento as 3 linhas (mktemp, marca, rm guardado) e as roda em zsh -f -i e em /bin/bash 3.2, com TMPDIR com espaco.
DOC="$1"; W="$2"; rm -rf "$W"; mkdir -p "$W/pasta com espaco"
L1=$(grep -m1 '^PASTA_RESTORE="\$(mktemp' "$DOC"); L2=$(grep -m1 '^test -d "\$PASTA_RESTORE" && touch' "$DOC"); L3=$(grep -m1 '^test -f "\$PASTA_RESTORE/.criada-pelo-roteiro" && rm -rf' "$DOC")
printf 'linha do passo 0 (mktemp): %s\nlinha do passo 0 (marca): %s\nlinha do passo 7 (rm): %s\n' "$L1" "$L2" "$L3"
cat > "$W/roteiro.sh" <<SH
set -e
echo "antes: PASTA_RESTORE do leitor = \$PASTA_RESTORE"
$L1
$L2
echo "depois do passo 0: PASTA_RESTORE = \$PASTA_RESTORE"
test "\$PASTA_RESTORE" != "\$PASTA_DO_LEITOR" && echo "ok: nao e a pasta do leitor"
test -f "\$PASTA_RESTORE/.criada-pelo-roteiro" && echo "ok: a pasta nova tem a marca"
ls -ld "\$PASTA_RESTORE" | cut -c1-10
NOVA="\$PASTA_RESTORE"
$L3
test ! -e "\$NOVA" && echo "ok: passo 7 apagou a pasta nova"
PASTA_RESTORE="\$PASTA_DO_LEITOR"
$L3
test -f "\$PASTA_DO_LEITOR/importante.txt" && echo "ok: passo 7 NAO apagou a pasta do leitor (sem marca): \$(cat "\$PASTA_DO_LEITOR/importante.txt")"
PASTA_RESTORE=""
$L3
echo "ok: com PASTA_RESTORE vazia o passo 7 nao faz nada"
echo FIM
SH
echo "=== ANTES (versao 3 anterior do documento): mkdir -m 700 falha, o roteiro segue, o passo 7 apaga a pasta do leitor"
mkdir -p "$W/leitor antigo"; echo "dado do leitor" > "$W/leitor antigo/importante.txt"
( PASTA_RESTORE="$W/leitor antigo"; mkdir -m 700 "$PASTA_RESTORE"; echo "mkdir devolveu codigo: $? (o bloco continua, sem set -e)"; rm -rf "$PASTA_RESTORE"; test ! -e "$PASTA_RESTORE" && echo "passo 7 antigo: pasta do leitor APAGADA, com o arquivo dentro" ) 2>&1 | sed "s#$W#<dir>#g"
for sh in zsh bash; do
  mkdir -p "$W/leitor $sh"; echo "dado do leitor" > "$W/leitor $sh/importante.txt"
  echo "=== $sh"
  if [ $sh = zsh ]; then CMD="/bin/zsh -f -i"; else CMD="/bin/bash --noprofile --norc"; fi
  if [ $sh = zsh ]; then
    env -i HOME="$HOME" PATH=/usr/bin:/bin TERM=dumb TMPDIR="$W/pasta com espaco" PASTA_RESTORE="$W/leitor $sh" PASTA_DO_LEITOR="$W/leitor $sh" /bin/zsh -f -i < "$W/roteiro.sh" 2>&1 | sed "s#$W#<dir>#g; s/\r//g; s/%[ ]*Mac%[ ]*//g"
  else
    env -i HOME="$HOME" PATH=/usr/bin:/bin TERM=dumb TMPDIR="$W/pasta com espaco" PASTA_RESTORE="$W/leitor $sh" PASTA_DO_LEITOR="$W/leitor $sh" /bin/bash --noprofile --norc "$W/roteiro.sh" 2>&1 | sed "s#$W#<dir>#g"
  fi
  echo "pasta do leitor depois: $(ls "$W/leitor $sh" | tr '\n' ' ')"; echo "sobras na TMPDIR: $(ls "$W/pasta com espaco" | wc -l | tr -d ' ')"
done
