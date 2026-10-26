---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `1ed0b71` (árvore principal em `5044e7a`, só `STATUS.md` e `ESTADO-ATUAL.md` diferem). Postgres 17.6 real (binários de `SCRATCH/pg17`), cluster descartável em 127.0.0.1:55937, derrubado e apagado no fim. Mutações e sondas num worktree meu destacado em `1ed0b71`. Saídas em `SCRATCH/validadores/qa/`.

| Critério | Prova | Resultado |
| --- | --- | --- |
| FAIL da rodada 4: troca de senha em voo desfaz redefinição, link, desativação ou troca concorrente | sonda de caos própria, SEM grampo, 120 rodadas em Postgres 17 (`saidas/30`) e 60 em PGlite (`saidas/32`): redefinição 0 sobrevivente, desativação 0, troca pela própria pessoa 0 (nunca as duas trocas 200, nunca duas cadeias vivas); a mesma sonda com o `servico.ts` de `bb0f654` reprova em massa (`saidas/31`, `saidas/33`) | PASS |
| "Corrige antes de crescer" da rodada 4: troca com o token de antes da renovação derrubava a própria cadeia | caso HTTP próprio (Postgres 17 e PGlite): 200 "Senha trocada. As outras sessões foram encerradas.", o token devolvido e o da renovação escrevem, a cadeia renova, a sessão do painel cai, uma cadeia viva; com o código de `bb0f654` o mesmo caso reprova | PASS |
| Negativo: administrador, a própria pessoa, reuso e troca de senha encerram a cadeia; o token anterior à renovação recebe 401 `sessao_encerrada` | `familia-da-sessao` 20 de 20, `renovacao-contra-encerramento` 53 de 53 com os dois blocos (PGlite e Postgres 17), nenhum pulado (`saidas/01`) | PASS |
| Negativo: provisória vencida não troca nem renova; rebaixado a operador não despacha (403 `sem_permissao`) | `senha-provisoria` 9 de 9, `familia-da-sessao`; e2e seção 24: "o token renovado nao despacha equipe: 403 sem_permissao" (`saidas/08`) | PASS |
| Positivo: renovação normal mantém os dois tokens; papel rebaixado renova e passa a ter só o papel novo; provisória no prazo troca | `familia-da-sessao`, `renovacao-contra-encerramento` caso 5; e2e seção 24 (401, renova, repete, menu Usuários some) | PASS |
| Autorização e isolamento: A rebaixado não vê B (404); `test:isolamento` verde com a migração | `familia-da-sessao` (isolamento A x B); `npm run test:isolamento` 345 aprovados, 3 pulados de 348 (`saidas/03`) | PASS |
| DoD: migração aplicada do zero e sobre banco existente | do zero em Postgres 17: `npm run migrar` aplica 001 a 051, `--conferir` "Esquema em dia.", segundo `migrar` "Nada a fazer: 51" (`saidas/40`); banco parado na 046 com semente e duas sessões (uma rotacionada): `--conferir` antes sai 1, `migrar` aplica só 047 a 051, `--conferir` "Esquema em dia.", as 2 sessões com `familia_id = id`, `abrir_sessao` com o sétimo parâmetro, 27 funções SECURITY DEFINER (`saidas/42`) | PASS |
| DoD: zero `skip` | `test:api` com `DC360_POSTGRES_DE_PROVA`: 1624 de 1624, nenhum pulado | PASS |
| Regressão obrigatória | `npm run test:api` 1624 de 1624 (`saidas/01`); `test:isolamento` (`saidas/03`); `api.test.ts` dentro da API; `npm run test:console` 17 arquivos, 274 de 274 (`saidas/06`); `npm run test:e2e:api` 288 e 149 `OK`, 0 falha (`saidas/08`) | PASS |

## Evidência

- `saidas/01-test-api.txt`: código 0; `renovacao-contra-encerramento.test.ts` 53 casos, inclusive os 28 a 34 do bloco de Postgres real.
- `saidas/30-caos-troca-1ed0b71.txt` (Postgres 17, 30 rodadas por reação) e `saidas/32-caos-troca-pglite-1ed0b71.txt` (PGlite, 15 por reação): sonda própria `sondas/zz-qa-caos-troca.test.ts`; código 1 só pelas rodadas do link explicadas em Achados.
- `saidas/31-caos-troca-servico-de-bb0f654.txt` e `saidas/33-caos-troca-pglite-servico-de-bb0f654.txt`: a mesma sonda com o `servico.ts` do candidato reprovado (restaurado depois com `git checkout`).
- `saidas/20-mutacoes-e07.txt` e `mut/E07-Ma` a `mut/E07-Mf`: seis mutações em `trocarSenha`.
- `saidas/40`, `41`, `42`: migrações; `saidas/pg.log`: log do Postgres com `log_lock_waits` e `deadlock_timeout=200ms`.

## Cenários positivos

- Troca pela própria pessoa com o token de antes da renovação: preserva a cadeia viva (sessão nova), derruba a do painel.
- Na sonda de caos, a troca pela própria pessoa em outro aparelho: vence quem grava primeiro (invasor 19, vítima 11 em Postgres 17), e a senha de quem respondeu 200 é a que vale.

## Cenários negativos

Sonda de caos, sem grampo, atraso sorteado de 0 a 300 ms de um lado ou de outro, e uma renovação da cadeia do invasor no mesmo instante, em Postgres 17:

- Redefinição por quem administra (30): troca do invasor 401 `sessao_encerrada` em 25; nas 5 em que a troca confirmou antes, a redefinição veio depois e a sobrescreveu. Em todas, a senha do invasor não vale, a temporária vale e continua provisória, zero sessão viva.
- Desativação (30): troca do invasor 403 `conta_desativada` em 30; conta desativada e zero sessão viva no fim.
- Troca pela própria pessoa (30): nunca as duas 200; sempre uma única cadeia viva no fim.
- Zero resposta 500 e zero `deadlock detected` no log fora da janela da mutação Ma.

Contraprova (o mesmo roteiro com o `servico.ts` de `bb0f654`): redefinição com a senha do invasor valendo depois da reação em 12 de 15, link em 8 de 15 com as duas respostas 200, desativação com troca e desativação 200 em 5 de 15, troca pela própria pessoa com as duas 200 em 15 de 15 (Postgres 17); em PGlite 9 de 10, 8 de 10, 6 de 10 e 10 de 10. É a corrida da rodada 4, reproduzida, e a sonda morde.

## Tentativas de reprovar

Mutações em `apps/api/src/auth/servico.ts` (`trocarSenha`), rodando `renovacao-contra-encerramento` nos dois blocos com Postgres 17, cada uma restaurada e conferida:

- Ma, sem `FOR NO KEY UPDATE`: 5 de 53 reprovam (7, 19, 28, 29, 30); os 4 `deadlock detected` do log são desta execução.
- Mb, sem comparar o hash conferido: 2 (16 e 26).
- Mc, sem exigir sessão viva na cadeia: 11 (11, 12, 14, 15, 21, 22 e outros).
- Md, preservar o `sid` do token em vez da sessão viva: 2 (18 e 34).
- Me, sem a trava da pessoa antes da releitura: 3 (19, 33, 34).
- Mf, sem recusar a conta desativada: 2 (13 e 23).

## Achados

- Anotado (efeito aceito e já registrado em `apps/api/PENDENCIAS.md`, item 5 da E10): quando a troca do invasor confirma ANTES de a pessoa usar o link do email, o link morre com a credencial (migração 051) e a pessoa recebe 401 "Este link de redefinição não vale mais"; a senha do invasor e a sessão dele ficam. Medido 4 de 30 em Postgres 17 e 2 de 15 em PGlite; nunca as duas 200. É ordem serial válida (troca, depois link recusado), não a sobrescrita da rodada 4. Ressalva de texto: o `RESUMO.md` da correção 4 diz que "o remédio que vence sempre é a redefinição por quem administra ou o link"; o link não vence sempre. `PENDENCIAS.md` diz o certo (só a redefinição por quem administra vence sempre).
- Nenhum achado que bloqueia. O FAIL da rodada 4 e o "corrige antes de crescer" estão consertados e presos por teste que morde.

## Não verificado

- Postgres 16 (o do job `implantavel` do CI): não rodei; a prova em Postgres real é 17.6, a versão de produção.
- `/auth/sair` com token já rotacionado e a vigência sem `expira_em` da família (anotados desde as rodadas 2 e 3): não reconferidos.
- A contagem "não é o último administrador" sem trava (anotado na correção 4): não medido.
- O e2e da seção 24 rodou em Chromium, não em aparelho.
- CI do SHA ausente (H32).

## Risco residual

Na troca concorrente pela própria pessoa e no link, vence quem confirma primeiro: se for o invasor, a pessoa é recusada às claras e o remédio é a redefinição por quem administra (que sempre vence, medido 30 de 30). Decisão registrada, não defeito.

## Motivo do humano

não se aplica
