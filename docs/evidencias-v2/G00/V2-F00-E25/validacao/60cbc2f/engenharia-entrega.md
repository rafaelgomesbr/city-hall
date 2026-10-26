---
validador: engenharia-entrega (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E25
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$A` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/infra-4`. Pergunta da rodada: o restore CA-08 continua provado depois da mudança do workflow, e o job de restore rodou de verdade (ele só roda com `[ci completo]`)?

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job, com artefato | Run 39524190207, `head_sha` c680f8d (difere de 60cbc2f só em `STATUS.md` e `ESTADO-ATUAL.md`), 12 de 12 `success`. Artefato `restore-c680f8d...` (66509 bytes, `sha256:a0b63c41...`), `workflow_run.id` 39524190207, baixado com token | `$A/jobs.json`, `$A/artifacts.json`, `$A/art/restore/` |
| O job de restore continua no workflow, com o mesmo gatilho | Job 118974894086 "Restore do banco, Postgres 17 (CA-08)". O `if:` (`workflow_dispatch`, `schedule` ou push com `[ci completo]`) está só como contexto no diff `fd17ff4..60cbc2f`; mudou o comentário. A mensagem de c680f8d tem `[ci completo]` e o job foi `success`, não `skipped` | `$A/verificar-60cbc2f.yml` linhas 1187-1208, `$A/jobs.json` |
| O verde prova o restore, lido no log do job (a rodada 7 só tinha inferência) | Passo 10 "Ensaiar o restore": "OK pg_restore --exit-on-error terminou sem erro"; "OK linhas: identico entre origem e restaurado (37 linhas conferidas)"; "OK estrutura: identico entre origem e restaurado (816 linhas conferidas)"; "OK schema_migracoes tem as 51 migracoes"; "OK restaurado: toda tabela de negocio tem RLS ativada E forcada"; "OK RLS conferida em 35 tabelas de negocio (nao vazio)"; fecha com "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam." | `$A/l-118974894086.txt` linhas 379-640 |
| Negativos da DoD dentro do roteiro | "OK negativo: o restore sem o papel dc360_console reprova" e "a mensagem cita o papel dc360_console"; "OK negativo: o restore de um dump sem --extension=pg_trgm reprova" e "a mensagem cita gin_trgm_ops" | idem |
| Isolamento no banco restaurado | Como `dc360_api` assumindo `dc360_app`, nos dois bancos: papéis ok (sem superusuário, sem BYPASSRLS, sem ser dono), "sem contexto: 31 tabelas lidas, todas com 0 linhas", "contexto A: 30 tabelas com organizacao_id, 47 linhas de A, 0 fora de A", escrita cruzada sem efeito, "UPDATE/DELETE em trilha_eventos e trilha_administrativa: recusado", "ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM" | idem, linhas 495-600 |
| API apontada para a cópia | "OK /saude 200 com status ok e banco ok, contra a copia, com o login restrito da aplicacao"; login 200; lista 200 com 6 itens; detalhe 200; ocorrência de outro município com token de Serra Alta 404; busca `pg_trgm` 200 | idem, linhas 600-615 |
| Postgres 17 e as migrações de hoje | Origem e destino "PostgreSQL 17.11", cliente `pg_dump` 17.11 ("OK pg_dump 17 serve para o servidor 17"). O roteiro lê o número de migrações do disco: 51 hoje (a DoD escrevia 46), todas aplicadas, "Esquema em dia", `schema_migracoes` com as 51 | idem, linhas 389-448 |
| Pré-requisito da origem (job `implantavel`, provisão de papéis) | Job 118974893974 "A API sobe contra Postgres real" `success`, todos os passos | `$A/jobs.json` |
| Regressão da DoD | `test:isolamento` no job 118974893692: "isolamento.test.ts (137 tests)" e `npm test` verdes; `migrar --conferir` ("Esquema em dia.") no próprio roteiro | `$A/l-118974893692.txt` linhas 510-557 |
| Sem dump na evidência, sem segredo | "OK nenhum dump na pasta de saida"; o artefato traz só logs, contagens e diffs (pasta `restore/` com `11-restore.txt`, `12-estrutura-*.txt`...). Varredura de JWT, Bearer e URL com senha: zero ocorrências. A senha do superusuário do job aparece como `***` no log | `$A/art/restore/` |
| Os arquivos da E25 não mudaram entre as rodadas | `ensaiar-restore.sh`, `scripts/restore/`, `db/`, `RESTORE-DO-BANCO.md` não aparecem em `git diff fd17ff4..60cbc2f` (diff dessa lista de caminhos: 0 linhas) | `git diff fd17ff4..60cbc2f -- dc360/db dc360/scripts/restore dc360/scripts/ensaiar-restore.sh dc360/docs/RESTORE-DO-BANCO.md` |

## Evidência

- Job 118974894086 `success` (00:55:04 a 00:55:52). Passos 5 a 13 todos `success`, inclusive 7 "Instalar o cliente PostgreSQL 17", 9 "Subir os dois servidores PostgreSQL 17", 10 "Ensaiar o restore", 11 "Registro dos servidores e limpeza".
- Artefato `restore-c680f8d...`: `05-ensaio-do-restore.txt` (198 linhas) fecha com "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam.", igual ao log do job.
- A rodada 7 repetiu o roteiro no Mac contra dois PostgreSQL 17.6 (27 de 27) e o negativo do servidor sujo (sai 1). O roteiro não mudou, então não repeti.

## Cenários positivos

- Restore sem erro com `--exit-on-error`, linhas e estrutura idênticas, 35 tabelas com RLS ativada e forçada, API sobe contra a cópia e `/saude` 200.

## Cenários negativos

- Restore sem `dc360_console` reprova; dump sem `pg_trgm` reprova; `dc360_app` sem contexto lê 0 linhas; `UPDATE` e `DELETE` nas duas trilhas recusados; ocorrência de outro município responde 404 pela API da cópia.

## Tentativas de reprovar

1. Procurei caminho de verde sem restore: o `if:` (satisfeito, job `success` e não `skipped`), `continue-on-error` (nenhum), `|| true` decidindo (só no `docker logs` e `docker rm` de limpeza), `tee` sem pipefail (o passo usa `shell: bash` do GitHub com `-eo pipefail`, confirmado na linha `shell: /usr/bin/bash --noprofile --norc -e -o pipefail` do log).
2. Procurei o roteiro ter virado condicional ou mais frouxo com a mudança do workflow: o diff só mexe nos comentários do job; o corpo (passos 1 a 13) é o mesmo.
3. Desconfiei dos 47 s do job: as 27 conferências e os dois negativos estão no log com horário (00:55:42 a 00:55:49 no passo 10); o Mac, no mesmo roteiro, levou 5 s na rodada 7.
4. Procurei diferença entre o Postgres do CI e o de produção: o job usa 17.11 (`postgres:17` sem versão menor); produção 17.6. Mesma versão maior, como a DoD pede; é anotação, não defeito.
5. Perguntei se a E25 depende do `auditar` verde: não. O job de restore não chama o `auditar`, nem herda dele.
6. Conferi que o artefato e o log são deste run e deste SHA (`workflow_run.id`, `head_sha`, horário dentro do job).

## Achados

1. **Anotado.** O roteiro conta migrações do disco: 51 hoje, e a DoD falava em 46. O restore das 51 passou; é superconjunto do que a DoD pede.
2. **Anotado.** O job só roda com `[ci completo]`, `workflow_dispatch` ou `schedule`: num push comum fica `skipped` e o run continua verde. Aqui rodou. O HEAD atual (bc3c535) não tem a marca na mensagem, então um run dele não traria o restore; a prova vale para o run de c680f8d.
3. **Anotado.** A etiqueta `postgres:17` sem versão menor fixa e a migração do `ubuntu-latest` para Ubuntu 26.04 (`pgdg26.04` no log) mudam o ensaio sem mudar o repositório; o ensaio de 21/10 fechou verde nesses.

## Não verificado

- Não repeti o roteiro localmente nesta rodada (arquivos intocados desde a rodada 7, D-31 item 5).
- Não disparei workflow para ver o job `skipped` sem a marca.
- O roteiro repetido por uma segunda pessoa seguindo `RESTORE-DO-BANCO.md` do zero, em Linux, macOS e Windows com Git Bash.
- Não li `06-servidor-origem.log` e `06-servidor-destino.log` do artefato linha a linha.

## Risco residual

Baixo para o SHA. O restore real da produção (Supabase) é outra etapa (F22).

## Motivo do humano

A DoD pede que uma segunda pessoa (ou Rafael noutra máquina) siga `RESTORE-DO-BANCO.md` do zero. O CI prova o roteiro automatizado, mas não prova que o texto do documento sozinho basta para quem não escreveu o sistema; isso continua sendo E4.
