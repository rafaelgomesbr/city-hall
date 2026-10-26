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
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente: worktree descartável em `4ce0433` no scratchpad (`git worktree add --detach`, removido no fim), `node_modules` por link para a árvore principal, PostgreSQL 17.6 real (`initdb` próprio, porta 55871, `log_lock_waits=on`, `deadlock_timeout=200ms`), apagado no fim. Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/a749c2d6-f207-483e-8a7b-380fcd3f5d28/scratchpad/rt1/saidas/`.

- Motivo do veredito da rodada 4 (troca de senha com a senha antiga em voo desfazendo redefinição, link, outra troca ou desativação; item 2 da seção 7 de `28`): CONSERTADO. `trocarSenha` (`dc360/apps/api/src/auth/servico.ts`, cerca das linhas 1065 a 1215) passou a gravar numa transação só: `FOR NO KEY UPDATE` na linha de `usuarios`, `travar_sessoes_do_usuario`, releitura (conta ativa, sessão viva na cadeia, prazo da provisória, hash igual ao conferido) e `trocar_senha` preservando a sessão viva da cadeia. Prova: os casos 11 a 17 (PGlite) e 21 a 27 (Postgres real), com a reação confirmando no meio da troca, e os casos 28 a 31, 33 e 34, na ordem contrária (a troca já segura linha e trava, e a reação tem de parar em `pg_locks`), todos verdes em PG 17.6 (`01`, `31` a `33`), e vermelhos quando desfaço o conserto (`10`).
- Sessão revogada (administrador, a própria pessoa, reuso, troca de senha encerram a cadeia; o token de antes da renovação leva 401): verde em `familia-da-sessao.test.ts` e `vigencia-na-escrita.test.ts` em PG 17.6 (`01`).
- Papel alterado (401 `nao_autenticado`, renovação traz papel novo, operador não despacha, isolamento A x B com 404): verde (`01`; casos "isolamento: coordenador do município A rebaixado ... (404)" e "coordenador do município B com o papel mudado não ganha nada no município A").
- Senha provisória vencida (nem escreve nem se troca): verde em `senha-provisoria.test.ts` e nos casos 17 e 27 da corrida (`01`).
- Zero `skip`: com `DC360_POSTGRES_DE_PROVA` definido, os 10 arquivos rodaram 195 de 195, nenhum pulado (`01`).

## Evidência

- `01-testes-auth-pg17.txt`: `npx vitest run --root apps/api` com `renovacao-contra-encerramento`, `recuperacao-morre-com-a-credencial`, `id-da-propria-conta`, `senha-provisoria`, `familia-da-sessao`, `segundo-fator`, `vigencia-na-escrita`, `recuperacao`, `sessoes-da-conta`, `senha-e-sessoes`; código 0, 10 arquivos, 195 de 195.
- `10-mutacao-servico-de-bb0f654-VERMELHO.txt`: `dc360/apps/api/src/auth/servico.ts` substituído no worktree pelo de `bb0f654` (antes da correção 4), arquivo da corrida rodado em PG 17.6: código 1, 23 de 53 vermelhos (11 a 19, 7, 21 a 31, 33, 34). Restaurado com `git restore`, `git status` limpo.
- `31` a `33-restaurado-VERDE-rodada-N.txt`: arquivo da corrida mais `recuperacao-morre-com-a-credencial.test.ts`, três rodadas seguidas, 60 de 60 em cada, código 0.
- `40-resumo-erros-pg.txt` e `pg.log`: em todas as execuções (inclusive as mutações), 0 linha `deadlock detected`; os únicos ERROR são 6 recusas DC367 de município suspenso, esperadas nos casos 8, 9 e 20.
- Regressão base do gatekeeper no SHA (`npm run test:isolamento` 345 aprovados e 3 pulados, typecheck) não foi repetida por mim.

## Cenários positivos

- Renovação normal: o token antigo e o novo escrevem (casos 5 e 34; `familia-da-sessao`).
- Troca com o token de antes da renovação preserva a própria cadeia (caso 18 e 34).
- Rebaixado a operador: 401 `nao_autenticado`, renovação, 201 em abrir ocorrência.
- Provisória no prazo troca.

## Cenários negativos

- Troca do invasor em voo contra redefinição, link, desativação, troca em outro aparelho e encerrar sessões: recusada (401 `sessao_encerrada`, 403 `conta_desativada` ou 401 `credenciais`), a senha dele não vale e a da reação vale (11 a 17, 21 a 27).
- Ordem contrária: a reação espera a linha ou a trava e vem depois, e a cadeia do invasor cai (28 a 31, 33).
- Isolamento: o token de A, rebaixado ou não, não vê recurso de B (404, nunca 403); B com papel mudado não ganha nada em A.

## Tentativas de reprovar

- Desfiz o conserto inteiro (o `servico.ts` de `bb0f654`): 23 vermelhos pelo motivo do achado. O teste morde.
- Li a ordem das travas de todos os caminhos que gravam `usuarios` (`administracao.ts` linhas 266, 365 e 496, 049, 051, `consumir_recuperacao`) atrás de um ciclo novo com a troca: nenhum. Em PG 17.6, nenhum impasse no log de nenhuma execução.
- Procurei um caminho que muda credencial ou `ativo` sem passar pela linha de `usuarios` que a troca segura (console, 036 e 038): o console não atualiza `usuarios`.
- Procurei um ganho no token que a troca devolve (o `sid` da sessão viva da cadeia e o papel relido): ele exige a senha atual e uma sessão viva da mesma cadeia, então não dá nada que a renovação ou o login já não dessem.
- Repeti a corrida três vezes depois de restaurar, para afastar falso verde por instabilidade: 60 de 60 nas três.

## Achados

- anotado: na troca concorrente pela própria pessoa, vence quem grava primeiro (limitação já declarada nos Fatos). É uma ordem serial válida e não sobrescreve nada às escondidas; o remédio que sempre vence continua sendo a redefinição por quem administra.
- anotado (herdado e declarado): `/auth/sair` com token já rotacionado e vigência sem `expira_em` da sessão viva continuam fora desta correção.
- Nenhum achado que bloqueia.

## Não verificado

- Não rodei sonda própria de disputas com atraso sorteado na troca de senha. As disputas de tempo sorteado que rodei são as 60 do caso 6 do repositório (renovação contra encerramento), quatro vezes. A troca em voo foi provada pelas disputas seguradas do repositório, nas duas ordens e em pontos exatos, mais a mutação que mostra o teste mordendo. A medição estatística em centenas de rodadas sem grampo, que o foco pedia, ficou de fora.
- Postgres 16 (o do job `implantavel`) não foi rodado; o run do CI não foi visto (`gh` sem login).
- Não repeti `npm run test:api`, `test:console` nem `test:e2e:api` inteiros.

## Risco residual

O conserto fecha a ordem serial nos pontos que os casos segurados exercitam. O que sobra é o que nenhuma disputa segurada cobre e o que só uma sonda sorteada em volume mostraria. A leitura de código não achou nenhum ponto descoberto (a releitura sob linha e trava cobre toda mudança que confirma antes, e a linha segurada faz esperar a que chega depois). Leitura com o token de quem foi rebaixado, por até 15 minutos, continua na F03-E03.

## Motivo do humano

Não se aplica: tudo o que esta dimensão decide é executável e foi executado, com o limite descrito em "Não verificado".
