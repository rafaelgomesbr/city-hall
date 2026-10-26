---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E25
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Restore das 48 migrações em Postgres 17 provado em Linux, em cluster separado: PASS. Job "Restore do banco, Postgres 17 (CA-08)" (115462783875) success; `restore/01-versoes.txt`: `pg_dump`, `pg_restore` e `psql` 17.11 e dois servidores `PostgreSQL 17.11` (contêineres `postgres:17` em portas 55451 e 55452), "migracoes em disco: 48".
- A migração 048 (nova desde a rodada 1) entra no restore: PASS. `conferencias.txt`: "schema_migracoes tem as 48 migracoes"; o job `implantavel` (115462783677) aplica `048_dono_do_token_diz_se_a_conta_esta_ativa.sql` e fecha com "Esquema em dia.".
- Achado da rodada 1 (job `implantavel` parando na 041 por `permission denied to create extension "pg_trgm"`): RESOLVIDO. O workflow tem `GRANT CREATE ON DATABASE dc360 TO dc360_setup` (`verificar.yml:630`, com o porquê em comentário); `03-migrar.txt` do artefato mostra `aplicando 041_busca_com_tolerancia_a_erro.sql` e a 048; `04-migrar-conferir.txt`: "Esquema em dia.".
- Restore com `--exit-on-error`, sem erro: PASS (`conferencias.txt`: "pg_restore --exit-on-error terminou sem erro"; `11-restore.txt`).
- Linhas e estrutura idênticas: PASS. `13-diff-linhas.txt` e `13-diff-estrutura.txt` vazios; 37 linhas de contagem geradas do catálogo (total 107, não vazio) e 810 linhas de estrutura, que incluem RLS ativada e forçada por tabela, policies (md5 de `qual` e `with_check`), funções (md5 do corpo, `SECURITY DEFINER`, ACL), índices, constraints, triggers, ACL por tabela e coluna, default privileges, atributos e associações dos papéis, e o `md5_das_impressoes` de `schema_migracoes`.
- RLS ativada e forçada nas 35 tabelas de negócio, nos dois bancos: PASS (`negocio_sem_rls_forcada|0`, "RLS conferida em 35 tabelas de negocio (nao vazio)"; nenhuma tabela com dono `dc360_app` ou `dc360_api`; nenhuma policy de UPDATE ou DELETE na trilha).
- `pg_trgm` e os índices `gin_trgm_ops`: PASS (extensão no sumário do dump só com `--extension`; `indices_gin_trgm_ops` igual nos dois lados; a busca `pg_trgm` responde 200 na cópia).
- Isolamento no banco restaurado como `dc360_api` assumindo `dc360_app`: PASS (`17-isolamento-afirmado-restaurado.txt` termina em "ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM"): sem contexto zero linhas em toda tabela legível; com o contexto de A zero linha fora de A; espelho em B; `UPDATE` cruzado alcança 0 linha; `UPDATE` e `DELETE` em `trilha_eventos` e `trilha_administrativa` recusados; `interesse_municipio` ilegível. O comportamento narrado é idêntico na origem e na cópia (`17-diff-isolamento-narrado.txt` vazio).
- API apontada para a cópia: PASS (`19-api-contra-a-copia.txt`): `/saude` 200 com `status ok` e `banco ok`, login, lista (6 itens), detalhe, 404 da ocorrência do outro município com token de Serra Alta, busca com `pg_trgm`; "TODAS AS CONFERENCIAS PASSARAM".
- Negativos do bloco: PASS. O restore sem o papel `dc360_console` reprova e a mensagem cita o papel; o dump sem `pg_trgm` reprova e a mensagem cita `gin_trgm_ops`; servidor "sujo" e `pg_dump` mais velho que o servidor reprovam antes de começar (lido em `ensaiar-restore.sh`).
- Nenhum dump na evidência: PASS (`find "$SAIDA" -name '*.dump'` vazio; o dump mora em `mktemp -d` modo 700 apagado no `trap EXIT`).

## Evidência

Run 38445527075 (sobre `c9895e9`, evento push, success, 9 de 9 jobs). `git diff 4b96ea7..c9895e9` só toca `ROTEIRO-G00.md`, `ESTADO-ATUAL.md` e `STATUS.md` (lista permitida). Artefatos `restore-c9895e9...` (33 arquivos) e `implantavel-c9895e9...` baixados em `scratchpad/eng/art/`; `conferencias.txt` traz 27 linhas "OK" e nenhuma "FALHA" nem "AVISO". Desde 7005a60 só mudaram, nesta área, `verificar.yml` (comentários e o job do baseline), `db/migrations/048_*.sql`, `db/PENDENCIAS.md` e duas linhas de `RESTORE-DO-BANCO.md`; `scripts/ensaiar-restore.sh`, `scripts/restore/*` e `scripts/ci-artefatos.sh` são byte a byte os de 7005a60, então as mutações que o qa fez na rodada 1 (RLS desligada, `UPDATE` concedido na trilha, `BYPASSRLS`) valem para o mesmo código; não as refiz. Os passos do job usam `shell: bash` (GitHub: `-e -o pipefail`) com `tee`; só há `|| true` em `docker logs` e `docker rm` da limpeza; o script roda com `set -euo pipefail` e a API é encerrada por `trap`. Senhas: a do superusuário nasce no job e é mascarada; as dos papéis nascem no script e vão por `PGPASSWORD` de um comando; varri os artefatos baixados de todos os jobs (URL com senha, `PASSWORD '`, JWT, Bearer, ghp_): só nomes de teste de redação.

## Cenários positivos

Fluxo completo origem, dump, destino, restore, conferências e API contra a cópia, em Postgres 17.11 no Linux, com todas as 27 conferências "OK".

## Cenários negativos

Os dois negativos do bloco (sem `dc360_console`, sem `pg_trgm`) rodam dentro do job e o script falha se algum deles PASSAR ("a conferencia nao morde"). Isolamento negativo (zero linha sem contexto, nada de B com contexto de A, `UPDATE` cruzado) é afirmado por `RAISE EXCEPTION`, não por leitura humana.

## Tentativas de reprovar

1. Procurei conferência vazia: linhas exige total maior que 0; RLS exige `tabelas_de_negocio` maior que 0; o isolamento reprova com "verificacao vazia" se nenhuma tabela for legível ou se o contexto de A não ver nenhuma linha de A.
2. Procurei diferença escondida pela comparação: as contagens são `count(*)` exato; a estrutura compara nomes e md5, não só quantidades. Duas folgas deliberadas e documentadas no `estrutura.sql`: ACL do `public` ordenada e md5 de constraint sem parênteses (o Postgres reagrupa `(a AND b) AND c`); aceitável porque não muda o significado.
3. Procurei destino contaminado: o script reprova se encontrar papel `dc360*` ou os bancos da prova antes de começar (servidor novo), e cria os papéis antes do restore como a produção exigiria.
4. Procurei se a 048 poderia ficar de fora do restore: o dump é gerado da origem migrada do zero, e `schema_migracoes` tem 48 nos dois lados, com o mesmo `md5_das_impressoes`.
5. Procurei dado do restore divergindo sem a contagem acusar: o `linhas.sql` só compara contagens; conteúdo de linha não é hasheado. O bloco pede contagens e hashes de `schema_migracoes`, que existem.
6. Procurei se o job roda onde precisa: só em push com `[ci completo]`, `workflow_dispatch` ou `schedule`; este run teve o marcador. Uma migração nova que quebre o restore pode chegar a master sem o job rodar se o autor omitir o marcador (já anotado na rodada 1).

## Achados

Nenhum bloqueia. Anotados:

1. `dc360/docs/RESTORE-DO-BANCO.md` ficou atrás do próprio SHA: lista como "não provado" o Postgres 17 ("o CI usa 16"), Linux e macOS, e diz que corrigir o CI "não é desta etapa", quando o job `restore` prova 17.11 em Linux e o `GRANT CREATE ON DATABASE` já está no CI; também não cita `scripts/ensaiar-restore.sh`. Só subestima, não afirma nada falso sobre produto. Já estava assim na rodada 1.
2. `docs/roadmap-v2/29-operacao-do-ambiente.md` diz que o job `restore` leva 7 a 9 minutos; o relatório da rodada 1 mediu 58 segundos. Só afeta a estimativa de custo.
3. O job `implantavel` usa Postgres 16 (`postgres:16`), e o `restore` 17: a produção é 17.6 e a 048 foi aplicada em 17.11 pelo `restore`, não pelo `implantavel`. Aceito, documentado.
4. A migração 048 reverte-se "por migração nova" (nota no cabeçalho do arquivo); não há script de `down` testado. É questão da etapa dona da 048, não do restore.

## Não verificado

Restore local (proibido nesta rodada: usa o Postgres compartilhado). Minhas próprias mutações das sondas de isolamento (RLS desligada, `BYPASSRLS`, `UPDATE` na trilha): o código é idêntico ao da rodada 1, onde o qa as fez, mas não as repeti. Segunda pessoa seguindo `RESTORE-DO-BANCO.md` do zero (validação humana do bloco). Origem Supabase real (papéis `anon`, `authenticated`, `service_role`), macOS, PITR e RPO e RTO (fora desta etapa).

## Risco residual

Restore ensaiado só com dado sintético e só com servidores novos; produção real tem papéis do provedor que o roteiro não reproduz. O job não roda em todo push.

## Motivo do humano

O bloco pede que uma segunda pessoa (ou Rafael noutra máquina) siga o roteiro do zero; não é substituível por agente.
