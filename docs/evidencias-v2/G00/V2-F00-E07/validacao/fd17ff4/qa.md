---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`). Saídas em `SCRATCH/val-qa-r7b/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`). Entre `1ed0b71` e `fd17ff4` nenhum arquivo da etapa mudou (`auth/vigencia.ts`, `auth/servico.ts`, `auth/sessoes.ts`, migrações): mudaram a guarda de códigos de erro, `auth/suspensao.ts` (o construtor de `AcessoSuspenso` só aceita 403 ou 503), `RegraDeNegocio` (só inteiro de 400 a 599) e `codigos-de-erro.ts`, todos no caminho das respostas 401 e 403 desta etapa. Procurei a regressão ali.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Rotação não é expulsão: o token pré-renovação escreve | sonda HTTP real (`70-sonda-etapas.txt`, E07a): 200 antes do encerramento | PASS |
| Cadeia encerrada (pela pessoa, de outro aparelho): token pré e pós-renovação recebem 401 `sessao_encerrada`, e renovar também | sonda HTTP real, nos dois modos da guarda: 401 `sessao_encerrada` três vezes; o aparelho que encerrou continua 200 | PASS |
| Papel rebaixado: 401 `nao_autenticado`, renovar traz o papel novo, e o papel novo não faz o que o antigo fazia | sonda HTTP real (E07b): escrita com token de coordenador 401 `nao_autenticado`; depois de renovar, `papel: operador` no token; tentar se promover 403 `sem_permissao`; ocorrência inexistente 404 | PASS |
| Senha provisória vencida não troca nem renova | `senha-provisoria.test.ts` 9 de 9 no `test:api` | PASS |
| Corrida da troca de senha (o FAIL da rodada 4) em Postgres real | `renovacao-contra-encerramento.test.ts` com `DC360_POSTGRES_DE_PROVA` apontando para um PostgreSQL 17.6 meu: 53 de 53, nenhum pulado (`62-E07-postgres-real.txt`) | PASS |
| Regressão obrigatória | `test:api` 1685 e 34 pulados (os 34 são o bloco de Postgres real, rodado à parte acima), código 0 (`40`); `test:isolamento` 345 e 3 pulados (gatekeeper); `test:console` 286 de 286 (`41`); `test:e2e:api` Chromium 288 e 197, código 0 (`46`) | PASS |
| E2E: rebaixar coordenador logado no painel | `46-e2e-api.txt`, "a administradora rebaixa a coordenadora para operador" e as verificações seguintes | PASS |
| Migração aplicada do zero | o bloco de Postgres real cria banco novo e aplica todas as migrações (`62`) | PASS |

## Evidência

- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success`, inclusive "A API sobe contra Postgres real" e "Restore do banco, Postgres 17 (CA-08)" (`05-ci-jobs.txt`).
- Sonda: `sondas/zz-qa7-etapas.test.ts`, posta em `apps/api/test/` só durante a execução e apagada; servidor real com semente, `fetch` contra porta efêmera, modos "falhar" e "corrigir", 0 desvio da guarda (`70-sonda-etapas.txt`).
- Postgres: cluster próprio em `SCRATCH/val-qa-r7b/pgdata`, porta 55731, autenticação local por confiança (sem senha), desligado com `pg_ctl stop` no fim.
- Mutação: `53-MUTACAO-E07-familia.txt`; restaurado `54-E07-restaurado.txt` (41 e 34 pulados, código 0).

## Cenários positivos

- Renovação normal: o token antigo e o novo escrevem; a sessão de quem clicou em "encerrar as outras" sobrevive.
- Papel rebaixado: renovar resolve sem nova entrada.

## Cenários negativos

- Mutação (risco alto): em `auth/vigencia.ts` tirei a condição `AND v.revogada_em IS NULL` da família (a rotacionada passa a valer mesmo com a cadeia encerrada). Resultado: 4 de 41 falham em `renovacao-contra-encerramento.test.ts` (encerramento por quem administra, pela própria pessoa, por troca de senha e por reuso: "nenhuma sessão da cadeia sobrevive"). `git restore`, verde de novo, árvore limpa.
- Operador recém-rebaixado tentando se promover a administrador: 403 `sem_permissao`.

## Tentativas de reprovar

1. Regressão pela guarda nova: as respostas 401 `sessao_encerrada`, 401 `nao_autenticado` e 403 `sem_permissao` desta etapa passaram pela guarda no modo de produção e no de teste por HTTP real, intactas, sem desvio.
2. Regressão pelo construtor de `AcessoSuspenso`: as duas construções com variável recebem só 403 ou 503 literais (`servidor.ts:496`; varredura da árvore sintática em `45-status-das-regras.txt`); `test:api` verde.
3. Corrida em banco real: o bloco que o PGlite não reproduz rodou inteiro em PostgreSQL 17.6.

## Achados

- Nenhum que bloqueie esta etapa.
- anotado: o achado 1 da E05 (contrabando de resposta pelo `content-length`) também permitiria, com código plantado, um 403 falso no lugar do 401 `sessao_encerrada` de outro pedido em pipeline; não é desta etapa.

## Não verificado

- Ensaio `npm run migrar` mais `--conferir` sobre banco existente com dados de produção: só do zero, pelo bloco de prova, e pelo job de restore do CI.
- WebKit e Firefox no E2E: só Chromium.
- Node 22 do `.nvmrc`: rodado em Node 24.15.0.

## Risco residual

A vigência é conferida na escrita: depois do encerramento, uma leitura com o token ainda vivo segue valendo até os quinze minutos dele (vigência na leitura é da F03-E03, fora do escopo).

## Motivo do humano

A etapa pede que Rafael veja as três sondas (rotacionada, papel, provisória) antes e depois.
