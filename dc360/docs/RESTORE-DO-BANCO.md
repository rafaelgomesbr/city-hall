# Restore do banco: o roteiro mínimo, provado e repetido pelo CI

- **Versão:** 2, de 2026-10-15 (V2-F00-E25, critério CA-08). A versão 1, de
  2026-10-07, falhava para quem a seguisse à risca (senha do `postgres` usada
  para os outros papéis, sem compilar a API, caminhos e id faltando); esta
  versão foi seguida do zero, num clone limpo, e a prova está na seção "Prova a
  frio no macOS".
- **Substitui:** a Parte 6 de `COLOCAR-DE-PE.md`, que passa a ser o registro
  histórico do restore de 2026-09-09 (15 migrações, Mac, origem Supabase).
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E25/` (saída de cada comando
  abaixo, contagens, hashes e diffs; nenhum dump).

Backup só existe depois de um restore testado. Este roteiro diz como restaurar
o esquema atual num banco novo **com o isolamento entre municípios intacto**, e
como conferir isso, em vez de supor.

## O que foi provado, e o que não foi

**Quantas migrações.** A pasta `db/migrations/` tem hoje 50 (001 a 050) <!-- numeros: migracoes=50 -->. Os
números de migração abaixo são fatos datados: cada prova vale para a árvore em
que rodou, e quem quiser o número de hoje conta os arquivos
(`ls db/migrations | wc -l`). O roteiro não depende da quantidade: o `migrar`
aplica as que existem. A 048, a 049 e a 050 não acrescentam tabela, policy
nem função `SECURITY DEFINER` (recriam funções que já existiam, e a 049 cria
uma função comum; o teto de 27 em `db/test/isolamento.test.ts` segue o mesmo).

**Prova do Windows, de 2026-10-07**, no Windows 11 com Git Bash, por quem
escreveu o sistema:

- Origem descartável sem Supabase: um cluster PostgreSQL criado com `initdb`
  numa pasta temporária, provisionado como o job `implantavel` do CI, com as
  **47 migrações que existiam então** (001 a 047) aplicadas do zero e a semente
  sintética.
- Destino: um **segundo cluster**, também criado com `initdb`, noutra porta.
- `pg_restore --exit-on-error` sem erro; linhas por tabela idênticas (36
  tabelas, 106 linhas); as 47 impressões de `schema_migracoes` idênticas; RLS
  ativada **e forçada** nas 35 tabelas de negócio; 94 policies, 81 funções (27
  `SECURITY DEFINER`), 137 índices (4 com `gin_trgm_ops`), grants, donos e
  atributos dos papéis iguais.
- No banco restaurado, como `dc360_api` assumindo `dc360_app`: sem contexto,
  zero linhas nas 31 tabelas de negócio que o papel lê (as outras 4 recusam
  a leitura com `permission denied`, e `schema_migracoes`, que é catálogo e
  não tem RLS, mostra as 47 linhas, igual na origem); com o contexto de Serra
  Alta, nenhuma linha de Vale Fundo em nenhuma das 30 tabelas com
  `organizacao_id`; `UPDATE` e `DELETE` na trilha recusados (`permission
  denied`); nenhuma tabela tem como dono o papel da aplicação, e nenhum dos dois
  é superusuário ou tem `BYPASSRLS`.
- A API apontada para a cópia: `/saude` 200 com `banco: ok`, login da
  coordenadora da semente, lista e detalhe de ocorrência, ocorrência do outro
  município com 404 e a busca com `pg_trgm` respondendo.

**Prova do CI, em Linux, com Postgres 17.** O job "Restore do banco, Postgres 17
(CA-08)" de `.github/workflows/verificar.yml` roda `scripts/ensaiar-restore.sh`
(que reproduz os passos deste roteiro numa ordem equivalente, entre dois
servidores `postgres:17` descartáveis; ele **não executa este documento**, e por
isso a prova de que este texto é repetível é a da seção "Prova a frio no
macOS"). Último run lido: 38618369218, do SHA `7585801`, com Postgres 17.11, o
cliente `pg_dump` 17, as **50 migrações** aplicadas do zero e as 27
conferências do script todas "OK"; o gatekeeper da E25 o leu e registrou em
`docs/evidencias-v2/G00/V2-F00-E25/VEREDITO.md`. O job só roda em push cujo
commit traga `[ci completo]` (`workflow_dispatch` e a agenda semanal estão no
arquivo, mas só valem quando ele chegar ao ramo padrão, e o de `origin/master`
ainda não os tem): um run mais novo precisa ser conferido de novo, e este documento não afirma que ele passa.
O job `implantavel`, que roda a API contra banco real, usa o Postgres 16
(`postgres:16`); o 17 é só do job `restore`.

Não provado (validação humana pendente):

- **Outra pessoa seguindo este roteiro.** A prova a frio abaixo foi feita por
  um agente num clone limpo, seguindo o texto à risca, na máquina do dono do
  projeto (que tem Node e npm). Uma pessoa que nunca viu o sistema continua
  sendo a validação que fecha o CA-08 por inteiro.
- **A prova local em outra versão do Postgres.** A prova de 2026-10-07 rodou
  no 18.3; a de 2026-10-15 rodou no 17.6. A produção é 17.6.
- **Linux seguindo o documento.** O CI prova o script, não o texto. As
  diferenças conhecidas de Linux estão na seção "Fora do Windows".
- **Origem Supabase.** O dump de produção tem os papéis do provedor (`anon`,
  `authenticated`, `service_role`, `supabase_admin`); o remédio está na Parte 6
  histórica e não foi refeito aqui. O dump antes de migração e o
  `copiar-producao.mjs` multiplataforma são a V2-F01-E15.
- **Fotos e assinaturas** (balde de armazenamento), PITR do provedor, restore
  por cima da produção, RPO e RTO: fora daqui (V2-F22).

## Antes de tudo: onde o dump mora

O dump de produção traz dado de cidadão. Ele nunca entra no repositório, nunca
sobe para nuvem de arquivos e é apagado no fim (passo 7). Nesta prova o dump
era só da semente sintética, ficou numa pasta temporária fora do repositório e
foi apagado junto com os dois clusters.

## Passo 0: ferramentas, dependências, compilação e senhas

**Ponto de partida.** Um clone limpo do repositório (`git clone`), com o Node
20 ou mais novo e o npm. **Todos os comandos abaixo rodam no mesmo terminal, em
sequência, a partir da pasta `dc360/` do clone** (o passo 0 diz entrar nela),
porque as variáveis de um passo são usadas nos seguintes. Os dois únicos
valores que você troca são `PGBIN` (a pasta que tem o `psql` e o `pg_dump`) e
`TMP` (uma pasta temporária da rodada, fora do repositório, que ainda não pode
existir).

**Qual shell.** `bash` ou `zsh`; os blocos foram executados nos dois (ver "Prova
a frio"). No macOS o `zsh` padrão do Terminal serve, **desde que você cole os
blocos como estão: não há comentário (`#`) em nenhum bloco**, porque o `zsh`
interativo, sem a opção `interactivecomments`, trata `#` como um comando e
quebra a linha. Se você acrescentar comentário aos seus comandos, ponha em linha
própria e rode `setopt interactivecomments` antes. No Windows, use o Git Bash.

**Ferramentas do PostgreSQL 17.** Precisa de `initdb`, `pg_ctl`, `psql`,
`createdb`, `pg_dump` e `pg_restore`. O `pg_dump` precisa ser da versão maior
do servidor de origem ou mais nova. Onde achar os binários, por sistema, está
na seção "Fora do Windows". No Windows (Git Bash) eles vêm do instalador do
PostgreSQL, por exemplo `/c/Program Files/PostgreSQL/17/bin`.

```bash
export PGBIN=/caminho/da/pasta/bin/do/postgresql-17
export PATH="$PGBIN:$PATH"
initdb --version; pg_ctl --version; psql --version; createdb --version; pg_dump --version; pg_restore --version
```

**Dependências e compilação.** O roteiro roda a API compilada (`dist`), e `dist`
não vem no clone. Compile aqui, antes de tudo. Um `dist` velho prova código
velho: apague os três antes de compilar, para que o que sobe no passo 6 seja o
código desta árvore.

```bash
cd dc360
npm ci
rm -rf packages/shared/dist db/dist apps/api/dist
npm run build --workspace @dc360/shared
npm run build --workspace @dc360/db
npm run build --workspace @dc360/api
```

O `npm ci` pode terminar com um resumo de `npm audit`. O portão de
vulnerabilidade do projeto é `npm run auditar` (fora deste roteiro); o resumo
do `npm ci` não impede o restore.

**Pasta temporária, portas e senhas.** `TMP` fica fora do repositório. Cada papel
tem a sua senha, gerada agora, guardada em arquivo dentro de `TMP` (modo 600) e
lida pelo cliente PostgreSQL por um arquivo de senhas (`PGPASSFILE`): o
`psql`, o `pg_dump`, o `pg_restore` e o `createdb` escolhem sozinhos a senha do
papel indicado em `-U`. **Nenhuma senha vai em linha de comando nem em saída
arquivada**, e a senha de um papel nunca serve para outro: o `postgres`, o
`dc360_setup` e o `dc360_api` têm três senhas diferentes.

```bash
TMP=/caminho/fora/do/repositorio
export PORTA_ORIGEM=55451 PORTA_DESTINO=55452 PORTA_API=3355
export PGHOST=127.0.0.1
unset PGPASSWORD PGUSER PGPORT PGDATABASE PGSERVICE PGOPTIONS DATABASE_URL
export DC360_SENHAS="$TMP"
mkdir -m 700 "$TMP"
umask 077
gerar() { node -e "process.stdout.write(require('crypto').randomBytes(18).toString('base64url'))"; }
gerar > "$TMP/.senha-postgres"
gerar > "$TMP/.senha-setup"
gerar > "$TMP/.senha-api"
{
  printf '127.0.0.1:*:*:postgres:%s\n'   "$(cat "$TMP/.senha-postgres")"
  printf '127.0.0.1:*:*:dc360_setup:%s\n' "$(cat "$TMP/.senha-setup")"
  printf '127.0.0.1:*:*:dc360_api:%s\n'   "$(cat "$TMP/.senha-api")"
} > "$TMP/.pgpass"
export PGPASSFILE="$TMP/.pgpass"
JWT_SEGREDO="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
```

Para o resto do roteiro, três atalhos dizem **qual papel** cada `psql` usa
(a senha vem do `PGPASSFILE`, pelo papel):

```bash
super() { psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
setup() { psql -X -q -v ON_ERROR_STOP=1 -U dc360_setup "$@"; }
aplic() { psql -X -q -v ON_ERROR_STOP=1 -U dc360_api "$@"; }
```

## Passo 1: dois clusters descartáveis

Nunca restaure por cima de um banco que já existe. Dois clusters novos, cada
um na sua porta, garantem que nada da máquina é tocado.

```bash
initdb -D "$TMP/pg-origem"  -U postgres --pwfile="$TMP/.senha-postgres" -A scram-sha-256 -E UTF8 --locale=C
initdb -D "$TMP/pg-destino" -U postgres --pwfile="$TMP/.senha-postgres" -A scram-sha-256 -E UTF8 --locale=C
pg_ctl -D "$TMP/pg-origem"  -l "$TMP/pg-origem.log"  -o "-p $PORTA_ORIGEM  -c listen_addresses=127.0.0.1" -w start > "$TMP/pgctl-origem.out"  2>&1 < /dev/null
pg_ctl -D "$TMP/pg-destino" -l "$TMP/pg-destino.log" -o "-p $PORTA_DESTINO -c listen_addresses=127.0.0.1" -w start > "$TMP/pgctl-destino.out" 2>&1 < /dev/null
```

**Erro encontrado no Windows:** sem o redirecionamento (`> arquivo 2>&1 <
/dev/null`), o `pg_ctl start` no Git Bash não devolve o terminal, porque o
servidor herda a saída. Interromper o comando nesse estado **derruba o
servidor** (o log mostra `terminated by exception 0xC0000142`). Com o
redirecionamento ele responde `servidor iniciado` e volta.

## Passo 2: a origem, como o job `implantavel` do CI

```bash
super -p $PORTA_ORIGEM -d postgres -c "CREATE DATABASE prova_e25_origem;"
super -p $PORTA_ORIGEM -d prova_e25_origem <<'SQL'
\set senha_setup `cat "$DC360_SENHAS/.senha-setup"`
\set senha_api `cat "$DC360_SENHAS/.senha-api"`
SELECT format('CREATE ROLE dc360_setup LOGIN PASSWORD %L CREATEROLE BYPASSRLS NOSUPERUSER', :'senha_setup') \gexec
ALTER SCHEMA public OWNER TO dc360_setup;
GRANT ALL ON SCHEMA public TO dc360_setup;
GRANT CREATE ON DATABASE prova_e25_origem TO dc360_setup;
SELECT format('CREATE ROLE dc360_api LOGIN PASSWORD %L NOSUPERUSER', :'senha_api') \gexec
SQL

export DATABASE_URL="postgres://dc360_setup:$(cat "$TMP/.senha-setup")@127.0.0.1:$PORTA_ORIGEM/prova_e25_origem"
npm run migrar
npm run migrar -- --conferir
npm run migrar -- --semear
unset DATABASE_URL
super -p $PORTA_ORIGEM -d prova_e25_origem -c "GRANT dc360_app TO dc360_api WITH SET TRUE;"
```

O que se espera: o primeiro `migrar` imprime `aplicando 001_base.sql` até
`aplicando 050_...sql` (a última da pasta; 50 hoje); o segundo imprime `Esquema
em dia.`; o terceiro, `Semeado com os dois municípios fictícios.`

(A senha chega ao SQL sem passar por linha de comando: o `psql` a lê do arquivo
com o `\set` (o `cat` entre crases, dentro do `heredoc`), e o `format` com `%L` a coloca entre aspas na
instrução. O `heredoc` é entre aspas simples, então quem lê o arquivo é o
`psql`, e por isso a pasta das senhas vai numa variável exportada, `DC360_SENHAS` (não exporte o próprio `TMP`: as ferramentas de Node o tomam como pasta temporária). No `DATABASE_URL` a senha é variável
de ambiente, que não aparece na lista de processos.)

**Erro encontrado (achado da E25):** exatamente com os comandos do job
`implantavel` (sem a linha `GRANT CREATE ON DATABASE`), a migração 041 para com
`permission denied to create extension "pg_trgm"`. O `pg_trgm` é extensão
confiável, mas extensão confiável exige `CREATE` no banco, e o banco criado
pelo `postgres` não dá isso ao `dc360_setup`. A linha
`GRANT CREATE ON DATABASE ... TO dc360_setup` é o remédio. O mesmo vale para a
receita de papéis do README. O CI (`verificar.yml`, job `implantavel`) e o
README já trazem essa linha desde o commit `6df957e` (V2-F00-E21, correção 1);
o roteiro a mantém porque quem restaura sem passar por eles precisa dela.

## Passo 3: o dump

```bash
pg_dump -h 127.0.0.1 -p $PORTA_ORIGEM -U dc360_setup --format=custom --schema=public --extension=pg_trgm \
        --file="$TMP/dc360.dump" prova_e25_origem
```

Medido no Windows: 0,25 s, 373.746 bytes (semente sintética).

`--extension=pg_trgm` **não é opcional.** Com `--schema=public` sozinho o
`pg_dump` não leva extensão nenhuma (`pg_restore -l` mostra zero entradas
`EXTENSION`), e o restore para nos índices de busca (passo 5, terceiro erro).

## Passo 4: o destino, com os papéis criados antes

O dump não cria papel, não leva atributo de papel e não leva associação entre
papéis. Tudo isso se cria antes, **com os mesmos atributos e pelo mesmo
criador** da origem: `dc360_app` e `dc360_console` são criados pelo
`dc360_setup`, como as migrações 001 e 023 fazem, para que as associações
implícitas do Postgres 16 em diante saiam iguais.

```bash
super -p $PORTA_DESTINO -d postgres <<'SQL'
\set senha_setup `cat "$DC360_SENHAS/.senha-setup"`
\set senha_api `cat "$DC360_SENHAS/.senha-api"`
SELECT format('CREATE ROLE dc360_setup LOGIN PASSWORD %L CREATEROLE BYPASSRLS NOSUPERUSER', :'senha_setup') \gexec
SELECT format('CREATE ROLE dc360_api LOGIN PASSWORD %L NOSUPERUSER', :'senha_api') \gexec
SQL
setup -p $PORTA_DESTINO -d postgres -c "CREATE ROLE dc360_app NOLOGIN;"
setup -p $PORTA_DESTINO -d postgres -c "CREATE ROLE dc360_console NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;"

createdb -h 127.0.0.1 -p $PORTA_DESTINO -U postgres -T template0 --encoding=UTF8 --locale=C prova_e25_restaurado
super -p $PORTA_DESTINO -d prova_e25_restaurado -c "DROP SCHEMA public CASCADE;"
super -p $PORTA_DESTINO -d prova_e25_restaurado -c "GRANT CREATE ON DATABASE prova_e25_restaurado TO dc360_setup;"
```

## Passo 5: o restore

Restaurar **como `dc360_setup`**, o dono de tudo na origem: assim o dono das
tabelas, das funções e da extensão sai igual, e o papel da aplicação nunca vira
dono de nada.

```bash
pg_restore -h 127.0.0.1 -p $PORTA_DESTINO -U dc360_setup --dbname=prova_e25_restaurado --exit-on-error "$TMP/dc360.dump"
```

Medido no Windows: 0,66 s, sem erro. Sem `--exit-on-error` o `pg_restore` **segue**
depois de um erro e termina só no fim: no PostgreSQL 17.6, com o `public` de
fábrica ainda no destino, ele imprimiu `warning: errors ignored on restore: 752`
e devolveu código 1, mas o banco já tinha sido escrito pela metade. Com a opção
ele para no primeiro erro, que é o que se quer.

Os três erros que a prova reproduziu de propósito, cada um num banco próprio
(no Windows em 2026-10-07 e de novo no macOS, PostgreSQL 17.6, em 2026-10-15; o
job do CI reproduz só dois deles, o do papel e o da extensão; o do `public` não
está no job):

| Situação | Erro do `pg_restore` | Remédio |
| --- | --- | --- |
| Destino sem o papel `dc360_console` | `role "dc360_console" does not exist` (na policy `console_codigos_insercao`) | criar o papel antes (passo 4) |
| Banco criado sem derrubar o `public` de fábrica | `schema "public" already exists` | `DROP SCHEMA public CASCADE` antes (passo 4) |
| Dump feito sem `--extension=pg_trgm` | `operator class "public.gin_trgm_ops" does not exist for access method "gin"` (no índice `equipes_busca_idx`) | `--extension=pg_trgm` no dump (passo 3) |

O primeiro confirma a inferência do relatório REL:10, que nunca tinha sido
testada.

## Passo 6: o que o dump não traz, e a conferência

Depois do restore, três linhas que nenhum dump carrega:

```bash
super -p $PORTA_DESTINO -d prova_e25_restaurado -c "GRANT dc360_app TO dc360_api WITH SET TRUE;"
setup -p $PORTA_DESTINO -d prova_e25_restaurado -c "GRANT dc360_app TO dc360_setup WITH SET TRUE;"
setup -p $PORTA_DESTINO -d prova_e25_restaurado -c "GRANT USAGE ON SCHEMA public TO PUBLIC;"
```

- A primeira: sem ela a API não assume o papel de aplicação.
- A segunda é a concessão que a migração 025 dá ao dono das tabelas, para o
  provisionamento gravar a linha espelho sob RLS. O primeiro diff da prova
  acusou a falta dela.
- A terceira devolve o `USAGE` de fábrica do `public`: o `pg_dump` o omite por
  considerá-lo padrão, e o `CREATE SCHEMA` do restore não o recria. O primeiro
  diff também acusou.

A conferência roda os mesmos arquivos SQL nos dois lados e compara com `diff`.
Os arquivos estão no repositório, em `dc360/scripts/restore/` (caminhos a
partir de `dc360/`, onde você está): `linhas.sql`, `estrutura.sql`,
`isolamento-afirmado.sql` e `isolamento.sql`. Os de `linhas` e `estrutura` rodam
como `postgres`, que lê o catálogo inteiro; os de isolamento rodam como
`dc360_api`, o login da aplicação, porque contar linhas como superusuário não
prova nada sobre RLS.

```bash
mkdir -p "$TMP/conferencia"
for f in linhas estrutura; do
  super -p $PORTA_ORIGEM  -d prova_e25_origem     -At -F'|' -f "scripts/restore/$f.sql" > "$TMP/conferencia/$f-origem.txt"
  super -p $PORTA_DESTINO -d prova_e25_restaurado -At -F'|' -f "scripts/restore/$f.sql" > "$TMP/conferencia/$f-restaurado.txt"
  diff "$TMP/conferencia/$f-origem.txt" "$TMP/conferencia/$f-restaurado.txt" && echo "$f: idêntico"
done
aplic -p $PORTA_ORIGEM  -d prova_e25_origem     -f scripts/restore/isolamento-afirmado.sql
aplic -p $PORTA_DESTINO -d prova_e25_restaurado -f scripts/restore/isolamento-afirmado.sql
aplic -p $PORTA_DESTINO -d prova_e25_restaurado -At -F'|' -v ON_ERROR_STOP=0 -f scripts/restore/isolamento.sql
export DATABASE_URL="postgres://dc360_setup:$(cat "$TMP/.senha-setup")@127.0.0.1:$PORTA_DESTINO/prova_e25_restaurado"
npm run migrar -- --conferir
unset DATABASE_URL
```

O que se espera ver:

- `linhas: idêntico` e `estrutura: idêntico`. (`scripts/restore/estrutura.sql` é
  a versão da sonda da E25 que ordena a ACL do `public` e calcula o md5 das
  restrições sem parênteses, para o diff sair vazio. A sonda original, em
  `docs/evidencias-v2/G00/V2-F00-E25/sondas/`, acusava duas diferenças sem
  efeito: a ACL do `public` com as mesmas cinco entradas em outra ordem, e a
  restrição `oficio_envios.provedor_id_plausivel` com parênteses agrupados de
  outro jeito, que o Postgres normaliza ao reler.)
- `ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM`, nos dois bancos. Cada verificação
  falha alto, com `EXCEPTION`; quem decide é o código de saída do `psql`.
- No `isolamento.sql` narrado (só para leitura humana): `rolsuper` e
  `rolbypassrls` falsos para `dc360_api` e `dc360_app`, zero tabela com dono da
  aplicação, `0 linhas fora de A`, e `permission denied` no `UPDATE` e no
  `DELETE` da trilha e na leitura de `interesse_municipio`. Esses `ERROR:
  permission denied` e o aviso `SEM CONTEXTO VE LINHA: schema_migracoes (50)`
  (catálogo, sem RLS, com uma linha por migração) são o resultado esperado, não
  falha.
- `Esquema em dia.`

**A API apontada para a cópia**, com o login da aplicação (`dc360_api`):

```bash
NODE_ENV=development HOST=127.0.0.1 PORT=$PORTA_API JWT_SEGREDO="$JWT_SEGREDO" \
DATABASE_URL="postgres://dc360_api:$(cat "$TMP/.senha-api")@127.0.0.1:$PORTA_DESTINO/prova_e25_restaurado" \
node apps/api/dist/index.js > "$TMP/api.log" 2>&1 < /dev/null &
API_PID=$!
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORTA_API/saude" && break; sleep 1; done
echo
```

Espera-se `{"status":"ok","banco":"ok",...}`. Se não responder, leia
`$TMP/api.log` (ele não traz a senha). Se `apps/api/dist/index.js` não existir, o
passo 0 não foi seguido: a API precisa ter sido compilada.

A sonda faz o login da coordenadora da semente, lê a lista e o detalhe de uma
ocorrência de Serra Alta, confere que a ocorrência de **Vale Fundo** responde
404 com o token de Serra Alta, e confere a busca com `pg_trgm`. Ela recebe o
endereço da API e o **id de uma ocorrência de Vale Fundo**, que se lê da origem
(município `22222222-2222-4222-8222-000000000002`):

```bash
ID_DE_VALE_FUNDO="$(super -p $PORTA_ORIGEM -d prova_e25_origem -At -c "SELECT id FROM ocorrencias WHERE organizacao_id = '22222222-2222-4222-8222-000000000002' ORDER BY id LIMIT 1")"
echo "$ID_DE_VALE_FUNDO"
node scripts/restore/api-contra-a-copia.mjs "http://127.0.0.1:$PORTA_API" "$ID_DE_VALE_FUNDO"
```

Espera-se `TODAS AS CONFERENCIAS PASSARAM` e código de saída 0. Sem o segundo
argumento a sonda reprova com 422.

## Passo 7: apagar tudo

```bash
kill "$API_PID"
super -p $PORTA_ORIGEM  -d postgres -At -c "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1"
super -p $PORTA_DESTINO -d postgres -At -c "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1"
pg_ctl -D "$TMP/pg-origem"  -m fast stop < /dev/null
pg_ctl -D "$TMP/pg-destino" -m fast stop < /dev/null
rm -rf "$TMP"
test ! -e "$TMP" && echo "pasta temporária apagada"
find .. -name '*.dump' -not -path '*/node_modules/*'
```

Confira que os bancos listados são só os da prova (`postgres`,
`prova_e25_origem` e `prova_e25_restaurado`; cada comando lista os de um
servidor). Depois do `rm`, o `test` deve dizer `pasta temporária apagada` e o
`find` (que procura `*.dump` no clone inteiro, onde um dump nunca pode estar)
não deve imprimir nada.

## Fora do Windows

O CI roda um Linux com o cliente do repositório do PGDG; o macOS foi
executado na prova a frio abaixo. O que muda é só onde ficam os binários:

- **Linux (Debian e Ubuntu):** `apt install postgresql` traz os binários em
  `/usr/lib/postgresql/<versão>/bin`, fora do `PATH`; aponte o `PGBIN` para lá.
  O redirecionamento do `pg_ctl` não é necessário, mas não atrapalha.
- **macOS:** `brew install postgresql@17` traz o servidor e o cliente; o
  `libpq` sozinho (receita da Parte 6) traz só o cliente e não basta para o
  cluster de destino. Sem Homebrew, os binários oficiais do PostgreSQL 17 da
  EDB (arquivo `postgresql-17.6-1-osx-binaries.zip`, em
  `https://get.enterprisedb.com/postgresql/`, binários universais x86_64 e
  arm64) desempacotam numa pasta e o `PGBIN` é `<pasta>/pgsql/bin`; trazem
  servidor, `psql`, `pg_dump`, `pg_restore`, `createdb` e a extensão `pg_trgm`.

## Prova a frio no macOS, de 2026-10-15

Feita por um agente (Claude, sessão de correção da E25) seguindo **este
documento, bloco a bloco, sem pular nem reordenar**, em um clone limpo por shell,
com ambiente limpo (`env -i`, só `HOME`, um `PATH` mínimo e o do Node). Uma
primeira versão do texto, só testada em `bash`, quebrava no `zsh` padrão do
macOS por causa de comentários de fim de linha; um revisor independente
reproduziu isso, e esta versão foi provada de novo, nos dois shells:

- **Clone limpo:** `git clone` local do repositório (SHA `11d9446`), sem
  `node_modules` e sem `dist`; `npm ci` dentro do clone, como o passo 0 manda.
- **Máquina:** macOS 26.4 em Apple Silicon (arm64), Node 24.15, npm 11.12.
- **PostgreSQL 17.6 de verdade, com cliente:** o zip de binários oficiais da EDB
  (`postgresql-17.6-1-osx-binaries.zip`, SHA-256
  `5afb85f5d764176bb00a527cfc5dd9127b9f8efaa33f5a9afbedbf6ceb985fcc`), com
  `initdb`, `pg_ctl`, `psql`, `createdb`, `pg_dump` e `pg_restore` todos 17.6;
  dois servidores 17.6 novos (`initdb` com `scram-sha-256`), um por porta.
- **Dois shells:** `zsh -f -i` (zsh puro, interativo, sem `interactivecomments`,
  com os blocos entregues pela entrada padrão, como quem cola no terminal) e
  `bash` (o mesmo fluxo como arquivo de script; entregue pela entrada padrão o
  `bash` se perdeu no meio por causa de um filho que consome a entrada, defeito
  do jeito de rodar e não do roteiro). Em ambos o fluxo roda com `set -e`: o
  bloco aborta no primeiro comando que falha, e a prova confere também as saídas
  esperadas (as linhas abaixo).
- **Resultado, nos dois shells:** os 14 blocos terminaram. `npm ci` e compilação
  de shared, db e api; origem com as 50 migrações e a semente; `pg_dump` e
  `pg_restore --exit-on-error` sem erro; `linhas: idêntico` e `estrutura:
  idêntico`; `ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM` na origem e na cópia;
  `Esquema em dia.` na cópia; `/saude` com `status: ok`, `banco: ok` e
  `ultimaMigracao` `050_login_e_suspensao_na_mesma_linha.sql`; sonda da API com
  "TODAS AS CONFERENCIAS PASSARAM", inclusive o 404 da ocorrência de Vale Fundo e
  a busca com `pg_trgm`; no fim, só os bancos da prova, servidores parados,
  pasta temporária apagada e nenhum `*.dump` no clone.
- **Os três erros de propósito do passo 5**, rodados também nesta máquina, no
  PostgreSQL 17.6, cada um num banco novo: sem `dc360_console`, sem derrubar o
  `public` e dump sem `--extension=pg_trgm` pararam com as mensagens da tabela
  (código 1); o restore completo de controle terminou com código 0; sem
  `--exit-on-error`, o mesmo caso do `public` terminou com `errors ignored on
  restore: 752` e código 1.
- **Só substituí** os dois valores que o documento manda trocar (`PGBIN` e
  `TMP`) e as três portas (para uma faixa livre da máquina); o resto é o texto.
- **Não rodou nesta prova:** Linux e Windows seguindo o texto, e o CI executando
  o documento (ele executa `ensaiar-restore.sh`). Uma pessoa que não conheça o
  sistema continua pendente.
- Evidência: `docs/evidencias-v2/G00/V2-F00-E25/correcao-1/`.

## Tempo medido na prova de 2026-10-07

| Passo | Tempo |
| --- | --- |
| `npm run migrar` (47 migrações, banco vazio) | 1,7 s |
| `npm run migrar -- --semear` | 1,3 s |
| `pg_dump` | 0,25 s |
| `pg_restore` | 0,66 s |
| API até o primeiro `/saude` 200 | 0,64 s |

São tempos de comando com a semente sintética. Não são RPO nem RTO, que se
medem na V2-F22-E07.

## Com que frequência repetir

Depois de toda migração que mexa em papel, policy, grant ou extensão, e pelo
menos uma vez por mês com o piloto de pé. O sinal de que o roteiro continua
valendo é o md5 das impressões de `schema_migracoes` bater nos dois lados.
