# Restore do banco: o roteiro mínimo, provado com as 47 migrações

- **Versão:** 1, de 2026-10-07 (V2-F00-E25, critério CA-08).
- **Substitui:** a Parte 6 de `COLOCAR-DE-PE.md`, que passa a ser o registro
  histórico do restore de 2026-09-09 (15 migrações, Mac, origem Supabase).
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E25/` (saída de cada comando
  abaixo, contagens, hashes e diffs; nenhum dump).

Backup só existe depois de um restore testado. Este roteiro diz como restaurar
o esquema atual num banco novo **com o isolamento entre municípios intacto**, e
como conferir isso, em vez de supor.

## O que foi provado, e o que não foi

Provado em 2026-10-07, no Windows 11 com Git Bash, por quem escreveu o sistema:

- Origem descartável sem Supabase: um cluster PostgreSQL criado com `initdb`
  numa pasta temporária, provisionado como o job `implantavel` do CI, com as
  **47 migrações** (001 a 047; o roteiro da V2 dizia 46, mas a E07 acrescentou
  a 047) aplicadas do zero e a semente sintética.
- Destino: um **segundo cluster**, também criado com `initdb`, noutra porta.
- `pg_restore --exit-on-error` sem erro; linhas por tabela idênticas (36
  tabelas, 106 linhas); as 47 impressões de `schema_migracoes` idênticas; RLS
  ativada **e forçada** nas 35 tabelas de negócio; 94 policies, 81 funções (27
  `SECURITY DEFINER`), 137 índices (4 com `gin_trgm_ops`), grants, donos e
  atributos dos papéis iguais.
- No banco restaurado, como `dc360_api` assumindo `dc360_app`: sem contexto,
  zero linhas nas 31 tabelas de negócio que o papel lê (as outras 4 recusam
  a leitura com `permission denied`, e `schema_migracoes`, que é catálogo e
  não tem RLS, mostra as 47 linhas, igual na origem); com o contexto de Serra Alta, nenhuma
  linha de Vale Fundo em nenhuma das 30 tabelas com `organizacao_id`; `UPDATE`
  e `DELETE` na trilha recusados (`permission denied`); nenhuma tabela tem como
  dono o papel da aplicação, e nenhum dos dois é superusuário ou tem
  `BYPASSRLS`.
- A API apontada para a cópia: `/saude` 200 com `banco: ok`, login da
  coordenadora da semente, lista e detalhe de ocorrência, ocorrência do outro
  município com 404 e a busca com `pg_trgm` respondendo.

Não provado (validação humana pendente):

- **Máquina limpa de verdade.** Os dois clusters são novos, mas a máquina é a
  do autor, com Node, dependências e binários já instalados.
- **Outra pessoa seguindo este roteiro do zero.** É a validação que fecha o
  CA-08.
- **Postgres 17.** A produção é 17.6 e o CI usa 16; a prova rodou no 18.3, a
  única versão instalada nesta máquina. Os passos não dependem da versão, mas
  isso é inferência.
- **Linux e macOS.** Os comandos são os mesmos (são binários do PostgreSQL e
  `bash`), mas não foram executados lá nesta prova. As diferenças conhecidas
  estão na seção "Fora do Windows".
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

## Passo 0: ferramentas

No Windows os binários vêm do instalador do PostgreSQL. No Git Bash:

```bash
export PATH="/c/Program Files/PostgreSQL/18/bin:$PATH"
initdb --version; pg_dump --version; pg_restore --version; psql --version
```

O `pg_dump` precisa ser da versão maior do servidor de origem ou mais nova.

Todos os comandos abaixo usam `PGHOST=127.0.0.1`, `PGUSER=postgres` e a senha
em `PGPASSWORD`, gerada para a rodada e guardada num arquivo dentro da pasta
temporária. Nenhuma senha vai em linha de comando que fique em histórico ou em
saída arquivada.

```bash
export PGHOST=127.0.0.1 PGUSER=postgres
TMP=/caminho/fora/do/repositorio            # pasta temporária da rodada
node -e "process.stdout.write(require('crypto').randomBytes(18).toString('base64url'))" > "$TMP/.senha"
export PGPASSWORD="$(cat "$TMP/.senha")"
```

## Passo 1: dois clusters descartáveis

Nunca restaure por cima de um banco que já existe. Dois clusters novos, cada
um na sua porta, garantem que nada da máquina é tocado.

```bash
initdb -D "$TMP/pg-origem"  -U postgres --pwfile="$TMP/.senha" -A scram-sha-256 -E UTF8 --locale=C
initdb -D "$TMP/pg-destino" -U postgres --pwfile="$TMP/.senha" -A scram-sha-256 -E UTF8 --locale=C
pg_ctl -D "$TMP/pg-origem"  -l "$TMP/pg-origem.log"  -o "-p 55451 -c listen_addresses=127.0.0.1" -w start > "$TMP/pgctl-origem.out"  2>&1 < /dev/null
pg_ctl -D "$TMP/pg-destino" -l "$TMP/pg-destino.log" -o "-p 55452 -c listen_addresses=127.0.0.1" -w start > "$TMP/pgctl-destino.out" 2>&1 < /dev/null
```

**Erro encontrado no Windows:** sem o redirecionamento (`> arquivo 2>&1 <
/dev/null`), o `pg_ctl start` no Git Bash não devolve o terminal, porque o
servidor herda a saída. Interromper o comando nesse estado **derruba o
servidor** (o log mostra `terminated by exception 0xC0000142`). Com o
redirecionamento ele responde `servidor iniciado` e volta.

## Passo 2: a origem, como o job `implantavel` do CI

```bash
cd dc360
psql -p 55451 -d postgres -c "CREATE DATABASE prova_e25_origem;"
psql -p 55451 -d prova_e25_origem -c "CREATE ROLE dc360_setup LOGIN PASSWORD '...' CREATEROLE BYPASSRLS NOSUPERUSER;"
psql -p 55451 -d prova_e25_origem -c "ALTER SCHEMA public OWNER TO dc360_setup;"
psql -p 55451 -d prova_e25_origem -c "GRANT ALL ON SCHEMA public TO dc360_setup;"
psql -p 55451 -d prova_e25_origem -c "GRANT CREATE ON DATABASE prova_e25_origem TO dc360_setup;"
psql -p 55451 -d prova_e25_origem -c "CREATE ROLE dc360_api LOGIN PASSWORD '...' NOSUPERUSER;"

export DATABASE_URL="postgres://dc360_setup:...@127.0.0.1:55451/prova_e25_origem"
npm run migrar                  # Aplicadas: 001_base.sql ... 047_familia_da_sessao.sql
npm run migrar -- --conferir    # Esquema em dia.
npm run migrar -- --semear      # Semeado com os dois municípios fictícios.
psql -p 55451 -d prova_e25_origem -c "GRANT dc360_app TO dc360_api WITH SET TRUE;"
```

**Erro encontrado (achado da E25):** exatamente com os comandos do job
`implantavel` (sem a linha `GRANT CREATE ON DATABASE`), a migração 041 para com
`permission denied to create extension "pg_trgm"`. O `pg_trgm` é extensão
confiável, mas extensão confiável exige `CREATE` no banco, e o banco criado
pelo `postgres` não dá isso ao `dc360_setup`. Num Postgres com `pg_trgm`
disponível (o 18.3 daqui; a imagem `postgres:16` do CI também traz as
extensões do contrib), o caminho com a extensão é o escolhido e falha. A linha
`GRANT CREATE ON DATABASE ... TO dc360_setup` é o remédio. O mesmo vale para a
receita de papéis do README. Corrigir o CI e o README não é desta etapa: está
registrado no STATUS (seção 11).

## Passo 3: o dump

```bash
pg_dump -h 127.0.0.1 -p 55451 -U dc360_setup --format=custom --schema=public --extension=pg_trgm \
        --file="$TMP/dc360.dump" prova_e25_origem
```

Medido: 0,25 s, 373.746 bytes (semente sintética).

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
psql -p 55452 -d postgres -c "CREATE ROLE dc360_setup LOGIN PASSWORD '...' CREATEROLE BYPASSRLS NOSUPERUSER;"
psql -p 55452 -d postgres -c "CREATE ROLE dc360_api LOGIN PASSWORD '...' NOSUPERUSER;"
psql -p 55452 -U dc360_setup -d postgres -c "CREATE ROLE dc360_app NOLOGIN;"
psql -p 55452 -U dc360_setup -d postgres -c "CREATE ROLE dc360_console NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;"

createdb -h 127.0.0.1 -p 55452 -U postgres -T template0 --encoding=UTF8 --locale=C prova_e25_restaurado
psql -p 55452 -d prova_e25_restaurado -c "DROP SCHEMA public CASCADE;"
psql -p 55452 -d prova_e25_restaurado -c "GRANT CREATE ON DATABASE prova_e25_restaurado TO dc360_setup;"
```

## Passo 5: o restore

Restaurar **como `dc360_setup`**, o dono de tudo na origem: assim o dono das
tabelas, das funções e da extensão sai igual, e o papel da aplicação nunca vira
dono de nada.

```bash
pg_restore -h 127.0.0.1 -p 55452 -U dc360_setup --dbname=prova_e25_restaurado --exit-on-error "$TMP/dc360.dump"
```

Medido: 0,66 s, sem erro. Sem `--exit-on-error` o `pg_restore` segue depois de
um erro e termina com aparência de sucesso, deixando um banco pela metade.

Os três erros que a prova reproduziu de propósito, cada um num banco próprio:

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
psql -p 55452 -d prova_e25_restaurado -c "GRANT dc360_app TO dc360_api WITH SET TRUE;"
psql -p 55452 -U dc360_setup -d prova_e25_restaurado -c "GRANT dc360_app TO dc360_setup WITH SET TRUE;"
psql -p 55452 -U dc360_setup -d prova_e25_restaurado -c "GRANT USAGE ON SCHEMA public TO PUBLIC;"
```

- A primeira: sem ela a API não assume o papel de aplicação.
- A segunda é a concessão que a migração 025 dá ao dono das tabelas, para o
  provisionamento gravar a linha espelho sob RLS. O primeiro diff da prova
  acusou a falta dela.
- A terceira devolve o `USAGE` de fábrica do `public`: o `pg_dump` o omite por
  considerá-lo padrão, e o `CREATE SCHEMA` do restore não o recria. O primeiro
  diff também acusou.

A conferência roda os mesmos arquivos SQL nos dois lados e compara com `diff`.
Os arquivos estão na evidência da E25
(`docs/evidencias-v2/G00/V2-F00-E25/sondas/estrutura.sql`, `linhas.sql` e
`isolamento.sql`):

```bash
for f in linhas estrutura; do
  psql -p 55451 -d prova_e25_origem     -At -F'|' -f "$f.sql" > "$f-origem.txt"
  psql -p 55452 -d prova_e25_restaurado -At -F'|' -f "$f.sql" > "$f-restaurado.txt"
  diff "$f-origem.txt" "$f-restaurado.txt" && echo "$f: idêntico"
done
psql -h 127.0.0.1 -p 55452 -U dc360_api -d prova_e25_restaurado -At -F'|' -f isolamento.sql
DATABASE_URL="postgres://dc360_setup:...@127.0.0.1:55452/prova_e25_restaurado" npm run migrar -- --conferir
```

O que se espera ver:

- `linhas: idêntico`.
- Em `estrutura`, só duas diferenças, as duas sem efeito: a ACL do `public` com
  as mesmas cinco entradas em outra ordem, e a restrição
  `oficio_envios.provedor_id_plausivel` com parênteses agrupados de outro
  jeito (`(a AND b) AND c` contra `a AND b AND c`), que o Postgres normaliza ao
  reler. Com os parênteses removidos, o md5 de todas as 552 restrições bate
  nos dois lados.
- Em `isolamento`: `rolsuper` e `rolbypassrls` falsos para `dc360_api` e
  `dc360_app`, zero tabela com dono da aplicação, `0 linhas fora de A`, e
  `permission denied` no `UPDATE` e no `DELETE` da trilha.
- `Esquema em dia.`

E a API apontada para a cópia, com o login da aplicação:

```bash
NODE_ENV=development HOST=127.0.0.1 PORT=3355 \
DATABASE_URL="postgres://dc360_api:...@127.0.0.1:55452/prova_e25_restaurado" \
JWT_SEGREDO="(32 caracteres ou mais, só para a prova)" \
node apps/api/dist/index.js > "$TMP/api.log" 2>&1 < /dev/null &
curl -s http://127.0.0.1:3355/saude      # {"status":"ok","banco":"ok",...}
```

A sonda `sondas/api-contra-a-copia.mjs` da evidência faz o login, lê uma
ocorrência da semente e confere o 404 da ocorrência do outro município.

## Passo 7: apagar tudo

```bash
pg_ctl -D "$TMP/pg-origem"  -m fast stop < /dev/null
pg_ctl -D "$TMP/pg-destino" -m fast stop < /dev/null
rm -rf "$TMP"
```

Antes de apagar, liste os bancos (`SELECT datname FROM pg_database`) e confira
que são só os da prova. Depois, procure arquivo `*.dump` que tenha sobrado.

## Fora do Windows

Não executado nesta prova; o que muda é só onde ficam os binários:

- **Linux (Debian e Ubuntu):** `apt install postgresql` traz os binários em
  `/usr/lib/postgresql/<versão>/bin`, fora do `PATH`; acrescente ao `PATH`. O
  redirecionamento do `pg_ctl` não é necessário, mas não atrapalha.
- **macOS:** `brew install postgresql@17` traz `initdb` e `pg_ctl`; o `libpq`
  sozinho (receita da Parte 6) traz só o cliente e não basta para o cluster de
  destino.

## Tempo medido nesta prova

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
