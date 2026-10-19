#!/bin/bash
# ANTES-VERMELHO da correcao 2 da E25. Uso: antes-vermelho.sh DIR_DE_TRABALHO (tem "Program Files/PostgreSQL/17/bin" e doc-antigo.md)
# Parte 1: o bloco 0 do documento ANTIGO (versao 2), com PGBIN = caminho com espaco, colado como esta, em zsh e em bash 3.2.
# Partes 3 e 4 (senha com aspa, ON_ERROR_STOP, pasta que ja existe) no fim.
# Parte 2: a crase do psql quando o shell de quem a executa nao enxerga a variavel (o que o cmd.exe do Windows faz com $VAR).
E="$1"; PGB="$E/Program Files/PostgreSQL/17/bin"
python3 - "$E" <<'PY'
import sys,re
E=sys.argv[1]
t=open(f'{E}/doc-antigo.md',encoding='utf-8').read()
a=t.index('## Passo 0'); b=t.index('## Fora do Windows')
bl=re.findall(r'```bash\n(.*?)```',t[a:b],re.S)
open(f'{E}/antigo-bloco0.sh','w').write(bl[0].replace('/caminho/da/pasta/bin/do/postgresql-17',E+'/Program Files/PostgreSQL/17/bin')+'echo "codigo do ultimo comando: $?"\n')
PY
echo '=== PARTE 1: bloco 0 do documento antigo, PGBIN com espaco ==='
echo '--- texto do bloco (caminho abreviado em <dir>) ---'
sed "s#$E#<dir>#g" "$E/antigo-bloco0.sh"
echo '--- zsh -f -i, entrada padrao ---'
env -i HOME="$HOME" PATH=/usr/bin:/bin zsh -f -i < "$E/antigo-bloco0.sh" 2>&1 | sed "s#$E#<dir>#g; s#^%  *[A-Za-z]*% *##"
echo '--- /bin/bash 3.2, arquivo ---'
env -i HOME="$HOME" PATH=/usr/bin:/bin /bin/bash --noprofile --norc "$E/antigo-bloco0.sh" 2>&1 | sed "s#$E#<dir>#g"
echo
echo '=== PARTE 2: crase do psql sem enxergar a variavel (cmd.exe nao expande $VAR) ==='
export PATH="$PGB:/usr/bin:/bin"; D="$E/crase"; rm -rf "$D"; mkdir -m 700 "$D"
mkdir -m 700 "$D/senhas"; printf 'segredo-de-teste-não-impresso' > "$D/senhas/.senha-r"
initdb -D "$D/pg" -U postgres -A trust -E UTF8 --locale=C > /dev/null
pg_ctl -D "$D/pg" -l "$D/pg.log" -o "-p 55731 -c listen_addresses=127.0.0.1" -w start > /dev/null 2>&1 < /dev/null
P() { psql -X -q -h 127.0.0.1 -p 55731 -U postgres -d postgres "$@"; }
echo '--- forma antiga: \set s `cat "$VAR_QUE_O_CMD_NAO_ENXERGA/.senha-r"` ---'
P <<'SQL'
\set s `cat "$VAR_QUE_O_CMD_NAO_ENXERGA/.senha-r"`
SELECT format('CREATE ROLE r_antigo LOGIN PASSWORD %L', :'s') \gexec
SQL
echo "psql devolveu codigo: $?"
echo '--- forma nova: \set s '"'"'$(cat "$PASTA/.senha-r")'"'"' (o shell expande) ---'
PASTA="$D/senhas"
P <<SQL
\set s '$(cat "$PASTA/.senha-r")'
SELECT format('CREATE ROLE r_novo LOGIN PASSWORD %L', :'s') \gexec
SQL
echo "psql devolveu codigo: $?"
echo '--- o que ficou no servidor ---'
P -At -F' | ' -c "SELECT rolname, rolpassword IS NOT NULL AS tem_senha FROM pg_authid WHERE rolname LIKE 'r\_%' ORDER BY 1"
echo
echo '=== PARTE 3: senha com aspa simples e barra invertida ==='
printf "a'b" > "$D/senhas/.senha-q1"; printf "a'b\\\\c" > "$D/senhas/.senha-q2"
PASTA="$D/senhas"
for q in q1 q2; do
echo "--- senha $q ($( [ $q = q1 ] && echo "aspa simples" || echo "aspa simples e barra invertida" )): forma da versao 3 anterior (heredoc sem aspas, \\set com \$(cat ...)) ---"
P <<SQL
\set s '$(cat "$PASTA/.senha-$q")'
SELECT format('CREATE ROLE r_${q}_antigo LOGIN PASSWORD %L', :'s') \gexec
SQL
echo "psql devolveu codigo: $?"
echo "--- senha $q: forma nova (\\getenv, heredoc com aspas) ---"
NOME_R="r_${q}_novo" SENHA_Q="$(cat "$PASTA/.senha-$q")" P <<'SQL'
\getenv s SENHA_Q
\getenv n NOME_R
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'n', :'s') \gexec
SQL
echo "psql devolveu codigo: $?"
done
P -At -F' | ' -c "SELECT rolname, rolpassword IS NOT NULL AS tem_senha FROM pg_authid WHERE rolname LIKE 'r\_q%' ORDER BY 1"
echo '--- ON_ERROR_STOP=1: um erro de SQL para o bloco e o que vem depois nao roda ---'
P -v ON_ERROR_STOP=1 <<'SQL'
SELECT 1/0;
CREATE ROLE r_nao_deve_existir;
SQL
echo "psql devolveu codigo: $?"
P -At -c "SELECT count(*) AS r_nao_deve_existir FROM pg_roles WHERE rolname = 'r_nao_deve_existir'"
echo '--- variavel de ambiente ausente no \getenv: para com erro, nao cria papel sem senha ---'
P -v ON_ERROR_STOP=1 <<'SQL'
\getenv s VARIAVEL_QUE_NAO_EXISTE
SELECT format('CREATE ROLE r_sem_var LOGIN PASSWORD %L', :'s') \gexec
SQL
echo "psql devolveu codigo: $?"
P -At -c "SELECT count(*) AS r_sem_var FROM pg_roles WHERE rolname = 'r_sem_var'"
pg_ctl -D "$D/pg" -m fast stop > /dev/null < /dev/null; rm -rf "$D"

