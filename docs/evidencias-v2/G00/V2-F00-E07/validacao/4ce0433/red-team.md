---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente (todas as execuções abaixo): PostgreSQL 17.6 real (binários indicados nas instruções comuns, só lidos e executados), `initdb` próprio em `$V/pgdata`, porta 55877 só em 127.0.0.1, `log_lock_waits=on`, `deadlock_timeout=200ms`. Worktree próprio do SHA `4ce0433` em `$V/wt` (esparso, só `dc360/`, `node_modules` por link simbólico) e um segundo worktree `$V/wt-mut` para as mutações. A API roda em processo (`construirServidor` de `apps/api/src`) sobre `bancoPostgres` real (pool de 16 conexões, `SET LOCAL ROLE dc360_app` em toda transação), com as migrações do worktree e a semente aplicadas por `aplicarMigracoes`. `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L01-red-team`. Cluster parado e apagado e worktrees removidos no fim (porta livre conferida).

Sonda própria (`$V/sondas/sonda-red-team-r5.test.ts`, escrita por mim, não copiada de nenhuma sonda do implementador nem de rodada anterior): SEM grampo, nenhuma consulta é segurada. Cada disputa sorteia o lado que sai primeiro e um atraso de 0 a 500 ms antes do outro pedido. A única instrumentação no banco da sonda são gatilhos de REGISTRO (inserem uma linha numa tabela da sonda, sem esperar nada) nas mudanças da pessoa-alvo em `usuarios`, `sessoes` e `recuperacoes_senha`; transação desfeita leva junto a linha, e a ordem do relógio dessas linhas é a ordem de confirmação, porque a linha de `usuarios` e as sessões da pessoa são serializadas pela trava de linha e pela trava da pessoa. Para cada rodada a sonda grava: status das duas respostas, quem gravou o hash por último, se a senha do invasor vale no fim, se a da reação vale, se a cadeia do invasor e a da vítima têm sessão de pé, e se o token do invasor e o token devolvido pela troca ainda escrevem (`POST /ocorrencias/:id/coordenada`).

Critérios da etapa que tocam o red-team:

1. "Sessão revogada" (testes negativos: administrador, a própria pessoa, reuso e troca de senha encerram a cadeia) e o item 1 do motivo da rodada 4 (troca de senha em voo com a senha antiga desfazendo a reação). PASS. 720 disputas sem grampo, 60 por reação e por ordem, seis reações: redefinição por quem administra, link do email, desativação, troca pela própria pessoa em outro aparelho, quem administra encerra as sessões, a própria pessoa encerra as outras sessões. Resultado: 0 sobrevivente (senha do invasor valendo depois de uma reação que respondeu 200, ou gravada depois dela, ou cadeia do invasor viva depois da reação), 0 queda indevida da sessão legítima, 0 erro 500, 0 impasse no log (`$V/saidas/10-sonda-conserto.resumo.txt`, `$V/saidas/postgres.log`).
2. Senha provisória: a troca releu `senha_provisoria_ate` sob a linha (`servico.ts`, bloco da correção 4); coberto pelos casos 17 e 27 do repositório, que rodei verdes no SHA (`$V/saidas/00-testes-do-repo-no-sha.txt`). Não fiz sonda própria de prazo vencendo no meio (ver Não verificado).
3. Prova de que morde (risco alto): com o `servico.ts` de `bb0f654` no lugar (só o bloco de `trocarSenha` muda entre os dois), a MESMA sonda deu 91 sobreviventes e 28 quedas indevidas da vítima em 180 disputas; o arquivo da corrida do repositório deu 23 vermelhos de 53 em Postgres real. Restaurado e conferido com `cmp`.
4. Isolamento (404, nunca 403): administrador de outro município contra a pessoa-alvo nas rotas de redefinir, encerrar, situação, edição e listar sessões, com o id em minúsculas e maiúsculas: 404 `nao_encontrado` em todas; agente de campo: 403 `sem_permissao`; a conta-alvo intacta (`$V/saidas/10-sonda-conserto.jsonl`, parte `id`).

## Evidência

- `npx vitest run test/renovacao-contra-encerramento.test.ts test/recuperacao-morre-com-a-credencial.test.ts test/id-da-propria-conta.test.ts` com `DC360_POSTGRES_DE_PROVA` apontando para o meu cluster, no SHA: código 0, 73 de 73, nenhum pulado (`$V/saidas/00-testes-do-repo-no-sha.txt`).
- Sonda sobre o conserto, `SONDA_RODADAS=60`: código 0, 1090 linhas de registro (`$V/saidas/10-sonda-conserto.txt`, `.jsonl`, `.resumo.txt`).
- Mutação A, `servico.ts` de `bb0f654`, `SONDA_RODADAS=15`: código 1 (`$V/saidas/20-mutacao-servico-bb0f654.txt`, `.resumo.txt`).
- Arquivo da corrida do repositório com a mutação A: código 1, 23 falhas de 53 (casos 11 a 19, 7, 21 a 31, 33 e 34) (`$V/saidas/23-teste-do-repo-com-servico-bb0f654.txt`).
- Log do Postgres de todas as execuções: nenhuma linha `deadlock detected`; os únicos ERROR são dois "acesso deste municipio esta suspenso" dos casos de suspensão do arquivo do repositório (`$V/saidas/postgres.log`).

## Cenários positivos

- Ataque primeiro, sem reação no meio: a troca do invasor responde 200 e, na ordem serial, a reação que vem depois desfaz tudo: redefinição 35 de 60 com o invasor 200 antes e a temporária valendo no fim, senha do invasor sem valer, cadeia dele morta e os dois tokens dele com 401.
- Link primeiro: 60 de 60 com o link 200, a senha do link valendo e a troca do invasor recusada com 401 `sessao_encerrada`.
- Troca pela própria pessoa primeiro: 60 de 60 com a vítima 200, a cadeia da vítima de pé e o invasor recusado com 401.
- Encerrar as próprias outras sessões primeiro: 60 de 60 com a sessão de onde se clicou preservada.

## Cenários negativos

Contagem por reação, ordem "ataque primeiro" (a troca do invasor sai e a reação vem 0 a 500 ms depois), com "em voo" = a reação terminou antes de a troca do invasor responder:

| Reação | Em voo | Invasor recusado | Invasor 200 (gravou antes) | Sobrevivente |
| --- | --- | --- | --- | --- |
| redefinição por quem administra | 25 | 25 (401 sessao_encerrada) | 35 | 0 |
| link do email | 29 | 29 (401) | 31, e o link morreu (401) | 0 |
| desativação | 50 | 50 (403 conta_desativada) | 10 | 0 |
| troca pela própria pessoa | 0 | 0 | 60, vítima recusada às claras (401) | 0 |
| quem administra encerra | 55 | 55 (401) | 5 | 0 |
| a pessoa encerra as outras | 55 | 55 (401) | 5, vítima recusada (401) | 0 |

Ordem contrária (a reação sai primeiro e a troca 0 a 500 ms depois): nas seis reações, 60 de 60 com a troca do invasor recusada (401 `sessao_encerrada` ou 403 `conta_desativada`) e a reação valendo. Na troca pela própria pessoa nessa ordem a troca do invasor lê o hash antigo enquanto a vítima ainda está no scrypt, e foi recusada pela releitura do hash nas 60.

## Tentativas de reprovar

- Sonda própria, sem grampo, em volume (720 disputas no conserto), nas duas ordens, nas seis reações pedidas, inclusive "encerrar as próprias outras sessões" que os testes do repositório não disputam contra a troca: nada sobreviveu.
- Procurei quem ganha indevidamente do lado legítimo: a vítima que troca a senha só perdeu quando o invasor gravou antes dela (ordem serial), e sempre com 401 às claras; nenhuma rodada em que os dois perdem, nenhuma em que a vítima recebe 200 e fica sem sessão.
- Procurei impasse entre a linha de `usuarios`, a trava da pessoa e as linhas dos links (a troca toma a trava antes de o gatilho da 051 tocar os links): zero `deadlock detected` em todas as execuções, inclusive as das mutações.
- Desfiz o conserto (servico de `bb0f654`) e a mesma sonda acusou 91 de 180; o arquivo do repositório, 23 de 53. A sonda e os testes mordem.
- Isolamento com o id em outra caixa a partir de outro município: 404, nunca 403.

## Achados

- Anotado (limitação já declarada pelo implementador, medida aqui): na troca concorrente pela própria pessoa vence quem grava primeiro; com o invasor primeiro, a vítima recebe 401 `sessao_encerrada` e a senha do invasor vale (60 de 60 na ordem "ataque primeiro"). É ordem serial válida e não sobrescrita silenciosa; o remédio que sempre vence é a redefinição por quem administra ou o link.
- Anotado (da sonda, não do produto): o registro da redefinição por quem administra não foi casado pelo texto da consulta (`current_query` cortado em 120 caracteres), então nessa reação a classificação dependeu só do estado final (senha do invasor valendo depois de a redefinição responder 200), que acusou 10 de 15 e 10 de 15 com a mutação A e 0 de 120 no conserto.

## Não verificado

- Postgres 16 (o do job `implantavel`) e o run do CI do SHA: não rodados (CI ausente nesta sessão).
- Senha provisória vencendo no meio da troca e papel rebaixado: não fiz sonda própria; só rodei os casos do repositório (17, 27 e o bloco da vigência), verdes.
- Disputa da troca com uma renovação da cadeia do invasor ao mesmo tempo, sem grampo: não sorteada (o caso 34 do repositório, segurado, passou).
- Node 24.15 em vez do 22 do `.nvmrc`.

## Risco residual

Baixo para o critério. A garantia depende de toda mudança de credencial, de `ativo` e de sessão da pessoa continuar tomando a linha de `usuarios` antes da trava da pessoa, ou só a trava; um caminho novo que tome a trava e depois peça a linha em modo exclusivo fecharia ciclo com a troca. Os casos 19 e 7 do repositório e a ausência de impasse aqui cobrem os caminhos de hoje.

## Motivo do humano

Não se aplica: tudo o que esta dimensão exige foi executado.
