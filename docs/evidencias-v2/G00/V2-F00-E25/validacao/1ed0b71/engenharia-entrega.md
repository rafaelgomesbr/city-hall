---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS com PostgreSQL 17.6, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Evidência mínima de Infra e CI: run do CI do SHA, job a job, com artefato. NÃO EXISTE (run 39366804765 do registro `7644420` recusado pelo GitHub por faturamento, H32; `gh` sem login). O CI completo é obrigatório no candidato de risco alto (seção 6 de `28`), e o job `restore` é exatamente o que prova CA-08 em Linux e Postgres 17. BLOCKED.
- O job `restore` usaria os mesmos comandos que rodei? Sim. Por leitura de `.github/workflows/verificar.yml` no SHA (linhas 853 a 972): `npm ci`; build de shared, db e api; cliente `postgresql-client-17` do repositório oficial; senha do superusuário gerada no job, mascarada e passada por ambiente; dois contêineres `postgres:17` com `--encoding=UTF8 --locale=C`, portas 55451 e 55452 em 127.0.0.1; e `SENHA_SUPERUSUARIO=... bash scripts/ensaiar-restore.sh` com `PORTA_ORIGEM`, `PORTA_DESTINO`, `SAIDA` e `PGBIN`. Rodei o MESMO roteiro com as mesmas variáveis, mudando só a origem dos dois servidores (dois clusters `initdb` em vez de contêineres, com os mesmos parâmetros: superusuário `postgres` com senha, `scram-sha-256`, UTF8, locale C, só TCP em 127.0.0.1) e as portas (56451 e 56452).
- `scripts/ensaiar-restore.sh` contra PostgreSQL 17.6 (`pg_dump`, `pg_restore` e `psql` 17.6), builds de shared, db e api do SHA: **código 0, "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam"** (`e25-01`). Entre elas: os dois negativos (restore sem `dc360_console` reprova citando o papel; dump sem `--extension=pg_trgm` reprova citando `gin_trgm_ops`), restore com `--exit-on-error`, linhas e estrutura idênticas por `diff` exato, as 51 migrações em `schema_migracoes`, RLS ativada e forçada em toda tabela de negócio dos dois lados, nenhuma tabela com dono `dc360_app` ou `dc360_api`, trilha sem policy de UPDATE ou DELETE, isolamento afirmado como `dc360_api` assumindo `dc360_app` nos dois bancos, `migrar --conferir` na cópia, e a API contra a cópia (`/saude` com `banco: ok`, login, leitura, 404 do outro município e busca com `pg_trgm`).
- Servidores sujos: rodar de novo sobre os mesmos clusters falha com "o servidor origem (porta 56451) ja tem papel dc360_* ou o banco da prova: use um servidor novo", código 1 (`e25-02`).
- O teste morde (risco alto): numa cópia do roteiro com uma linha a mais no passo 5 (`ALTER TABLE ocorrencias NO FORCE ROW LEVEL SECURITY` no destino), sobre clusters novos, o roteiro reprova com "estrutura: origem e restaurado DIFEREM", código 1 (`e25-03`). A linha foi tirada com `git restore scripts/ensaiar-restore.sh` e o `git diff` ficou vazio.

## Evidência

Em `SCRATCH/validadores/engenharia-entrega/`:

- `e25-00-build-api.txt`: build da API, código 0 (shared e db em `e18-00-builds.txt`).
- `e25-01-ensaio-do-restore.txt` e `e25-restore/` (`conferencias.txt` com 27 linhas `OK`, `01-versoes.txt` com PostgreSQL 17.6 nos dois servidores e nos clientes, Node 24.15.0, 51 migrações em disco): código 0. Tempo total da rodada: cerca de 6 segundos.
- `e25-02-NEGATIVO-servidor-sujo.txt`: código 1.
- `e25-03-MUTANTE-no-force-rls.txt` e `e25-restore-mutante/`: código 1, `ocorrencias|t|f|dc360_setup` só no restaurado.
- Clusters descartáveis em `SCRATCH/validadores/engenharia-entrega/pg/`, criados com a senha do superusuário num arquivo de modo 600 (nunca impressa), derrubados com `pg_ctl stop` e apagados ao fim; nenhum `*.dump` em SCRATCH; portas 56451, 56452 e 3355 livres depois.

## Cenários positivos

- Restore completo em PG 17.6 com 51 migrações, conferido por `diff` exato e afirmações de RLS, dono e trilha, e a API de pé contra a cópia com o login restrito.

## Cenários negativos

- Sem `dc360_console`: restore reprova.
- Dump sem a extensão: restore reprova.
- Servidor com estado anterior: o roteiro recusa.
- Cópia com RLS não forçada numa tabela: o roteiro reprova.
- Isolamento no restaurado: sem contexto zero linha, com contexto de um município nada do outro, UPDATE e DELETE na trilha negados (sonda `isolamento-afirmado.sql`, "ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM" nos dois lados), e 404 do outro município pela API.

## Tentativas de reprovar

- Procurei diferença entre o que o job faz e o que o roteiro precisa: o job sobe os contêineres sem esperar, mas o roteiro espera até 90 s por cada servidor; o cliente do runner é o 16, e o job instala o 17, e o roteiro recusa `pg_dump` mais velho que o servidor; a senha não vai em argumento (`-e POSTGRES_PASSWORD` sem valor herda do ambiente).
- Procurei passo do job que esconde vermelho: nenhum `continue-on-error`; `shell: bash` dá `pipefail`, então o `tee` do ensaio não engole o código; a limpeza dos contêineres roda com `always()` e não muda o resultado.
- Mutante de RLS e servidor sujo, acima: os dois derrubam o roteiro.

## Achados

- Anotado: o job usa a imagem `postgres:17` sem fixar o patch; a produção é 17.6 (premissa da etapa). Um run futuro pode rodar 17.7 ou depois e passar sem provar o 17.6. Aqui o 17.6 foi provado localmente.
- Anotado: o script do CI (`ensaiar-restore.sh`) não executa o documento `RESTORE-DO-BANCO.md`; o CI prova o roteiro do script, não o texto que a segunda pessoa vai seguir. O texto é da dimensão de QA e de banco.
- Nenhum achado bloqueia. O bloqueio é a falta do run.

## Não verificado

- O job `restore` em Linux, com os contêineres `postgres:17` e o cliente do repositório oficial (o run do SHA não existe, H32).
- Node 22 (aqui Node 24.15.0) e binários x86_64 sob Rosetta (os binários universais da EDB rodaram como `x86_64-apple-darwin` nesta máquina).
- O documento `dc360/docs/RESTORE-DO-BANCO.md` seguido à risca em Linux, macOS ou Windows (não é o que este job roda; é da validação humana e de QA).
- Restore a partir do Supabase de verdade e uma segunda pessoa seguindo o roteiro (validação humana da etapa).

## Risco residual

O roteiro do CI está provado em PG 17.6 neste Mac e morde. Sem o run, falta a prova em Linux com contêineres, que é a configuração que o CI e o roteiro descrevem como referência, e a etapa é de risco alto, onde o CI completo é obrigatório.

## Motivo do humano

O run do CI do SHA (job `restore`) só existe depois de o Rafael resolver o faturamento do GitHub (H32). A segunda pessoa seguindo `RESTORE-DO-BANCO.md` é a validação humana da etapa.
