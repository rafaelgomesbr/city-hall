---
validador: engenharia-entrega (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- **Restore provado em máquina limpa, Postgres 17, com as migrações de hoje.** Job "Restore do banco, Postgres 17 (CA-08)" (116039196518), artefato `restore-7585801...`: dois contêineres `postgres:17` novos (17.11), cliente `pg_dump`/`pg_restore`/`psql` 17.11, Node 22.23.3; `migracoes em disco: 50`; "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam". Entre as 27 (`restore/conferencias.txt`): `pg_restore --exit-on-error` sem erro; linhas idênticas (37 linhas conferidas, 109 no total); estrutura idêntica (813 linhas); `schema_migracoes` com as 50; RLS ativada E forçada nas 35 tabelas de negócio, nos dois lados; nenhuma tabela com dono da aplicação; trilha sem policy de UPDATE e DELETE; isolamento afirmado como `dc360_api` assumindo `dc360_app` nos dois bancos; `migrar --conferir` na cópia; API contra a cópia (`/saude` 200 com `banco: ok` e `ultimaMigracao: 050_...`, login, lista, detalhe, 404 da ocorrência de Vale Fundo com token de Serra Alta, busca com `pg_trgm`); nenhum dump na pasta de saída. Atende, agora com as migrações 049 e 050 (a rodada 2 tinha 48).
- **Negativos da etapa, no mesmo run.** "negativo: o restore sem o papel dc360_console reprova" (`ERROR: role "dc360_console" does not exist`) e "negativo: o restore de um dump sem --extension=pg_trgm reprova" (`operator class "public.gin_trgm_ops" does not exist`). Atende.
- **O job `implantavel` ainda para na 041 por `pg_trgm`?** Não. Job "A API sobe contra Postgres real" (`postgres:16`): 50 migrações aplicadas (`03-migrar.txt`, inclui "aplicando 041_busca_com_tolerancia_a_erro.sql"), "Esquema em dia.", `/saude` `{"status":"ok","banco":"ok","ultimaMigracao":"050_..."}`. Provei a causa aqui, em Postgres 17.10 descartável: provisionado como o job, SEM o `GRANT CREATE ON DATABASE`, `npm run migrar` para na 041 com `permission denied to create extension "pg_trgm"` (código 1); COM o GRANT, 50 de 50, código 0, `--conferir` em dia e `--semear` ok (`e25-01-provisionar-migrar-pg17.txt`).
- **A conferência morde (risco alto).** No mesmo Postgres 17 local, com a semente e o login `dc360_api`, rodei os mesmos `scripts/restore/isolamento-afirmado.sql` e `estrutura.sql` do roteiro (por um executor `pg` meu, porque não há `psql` nesta máquina; `\set` e `\echo` traduzidos) (`e25-02-conferencias-mordem-pg17.txt`):
  - verde: "ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM"; `migracoes|50`, `negocio_sem_rls_forcada|0`, `policies_update_ou_delete_na_trilha|0`;
  - `ALTER TABLE ocorrencias DISABLE ROW LEVEL SECURITY`: isolamento para com "SEM CONTEXTO A TABELA ocorrencias MOSTRA 10 LINHA(S)" e `negocio_sem_rls_forcada|1`;
  - `ALTER TABLE equipes NO FORCE ROW LEVEL SECURITY`: `negocio_sem_rls_forcada|1` (o roteiro exige a linha exata `|0`);
  - `GRANT UPDATE` em `trilha_eventos` mais policy de UPDATE: isolamento para com "UPDATE em trilha_eventos foi PERMITIDO" e `policies_update_ou_delete_na_trilha|1`;
  - desfeito: tudo verde de novo. Cluster parado e apagado no fim.
- **O job não engole código de saída.** `scripts/ensaiar-restore.sh` roda com `set -euo pipefail` e `falhar()` sai 1; no workflow, `bash scripts/ensaiar-restore.sh 2>&1 | tee` com shell `bash` (pipefail). Leitura do script e do workflow.
- **Segredo fora do log.** A senha do superusuário nasce no job, tem `::add-mask::` e aparece como `***` no log (linhas 272, 353, 599 do log); as senhas dos papéis `dc360_*` nascem dentro do roteiro e não aparecem; o artefato passa pelo `ci-artefatos.sh redigir`. A API contra a cópia imprime "token omitido desta saida".
- **Regressão.** `test:isolamento` no CI: 345 aprovados e 3 pulados por ambiente; `migrar --conferir` no CI e aqui.

## Evidência

- Log do job em `$SP/val/engenharia-entrega/ci-job-116039196518.log`; artefatos em `$SP/val/engenharia-entrega/art/restore/` e `art/implantavel/`.
- `e25-01-provisionar-migrar-pg17.txt`, `e25-migrar-sem-grant.txt`, `e25-migrar-com-grant.txt`, `e25-02-conferencias-mordem-pg17.txt` e as saídas `sondas/iso-*.txt` e `sondas/est-*.txt`, todos em `$SP/val/engenharia-entrega/`.
- Postgres 17.10 descartável na porta 55541, iniciado e removido por mim (`pg_ctl stop` e `rm -rf`), conferido com `lsof` sem nada escutando no fim.

## Cenários positivos

- Restore em PG 17 no CI com 27 de 27; migração do zero no PG 17 local com o GRANT.

## Cenários negativos

- Sem `dc360_console`, sem `pg_trgm` no dump e sem `GRANT CREATE`: todos param, com a mensagem esperada.
- Sem contexto, a aplicação lê 0 linhas; com contexto de A, nada de B; UPDATE e DELETE na trilha recusados.

## Tentativas de reprovar

- Desliguei RLS, tirei o FORCE e abri UPDATE na trilha: a conferência pegou as três.
- Tirei o GRANT da 041: para, como o roteiro diz.
- Procurei senha no log e no artefato do job: só `***`.

## Achados

1. anotado. `dc360/docs/RESTORE-DO-BANCO.md:57-61` diz que, com as 50 migrações, "o job ainda não rodou". Rodou agora (run 38618369218, 27 de 27): o texto ficou conservador e velho, não falso no momento em que foi escrito.
2. anotado (herdado). O restore só roda com `[ci completo]`, `workflow_dispatch` ou na rodada semanal; o `implantavel` usa Postgres 16, e só o restore usa o 17.
3. anotado (processo do gatekeeper). `conferir-evidencia.mjs V2-F00-E25 --sha 52952a1` falha por "possível segredo" em `validacao/4b96ea7/qa.md:63` (placeholders de senha de papel e de URL com senha, de cluster descartável, num relatório de validador) e dá dezenas de AVISO de fim de linha (ver o relatório da E21).

## Não verificado

- O `ensaiar-restore.sh` de ponta a ponta nesta máquina: não há `pg_dump`, `pg_restore` nem `psql` no Mac; o restore em si fica provado pelo CI, e as conferências, pela mutação local.
- Uma segunda pessoa seguindo `RESTORE-DO-BANCO.md` do zero e origem Supabase: fora desta rodada (emenda D-30 nas rodadas anteriores; Supabase é a V2-F01-E15).

## Risco residual

- Restore em provedor gerenciado (sem superusuário, `pg_trgm` em outro schema) continua não provado.

## Motivo do humano

Não se aplica.
