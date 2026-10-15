---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [AUTH, AUTHZ, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Árvore no HEAD `95f09f6` (produto igual a `52952a1`), `npm run build:shared` antes de tudo. Saídas em `$SP/val/qa/`; sondas próprias, escritas nesta sessão e fora do repositório, em `$SP/val/qa/sondas/` (importam o código do repositório por caminho absoluto e rodam com `npx vitest run --root apps/api --dir $SP/val/qa/sondas <nome>`).

| Critério (DoD e cinco campos) | Prova | Resultado |
| --- | --- | --- |
| Sonda de conta desativada não escreve | `qa-vigencia.test.ts`, E04 caso 1 (`30-sonda-vigencia.txt`): conta ativa escreve 200; `PATCH /usuarios/:id/situacao` pela administradora; o POST seguinte com o token ainda vivo responde 403 `conta_desativada` (o código veio da E05); um PATCH com o mesmo token também 403 | PASS |
| Teste positivo: conta ativa escreve e recebe 200 | mesmo caso, e `test:api` | PASS |
| Negativo: papel rebaixado não escreve com o papel do token | `qa-vigencia`, E07 "papel rebaixado": 401 `nao_autenticado` (código da E07, que substituiu o da E04 por decisão registrada) | PASS |
| Negativo: sessão encerrada por administrador recebe 401 | `qa-vigencia`, E04 caso 2: `POST /usuarios/:id/encerrar-sessoes`, escrita seguinte 401 `sessao_encerrada`; leitura com o mesmo token 200 (fora da vigência até a F03-E03, como declarado) | PASS |
| Negativo: quem encerra "as outras sessões" mantém a sua | `qa-vigencia`, E04 caso 3: `/auth/encerrar-sessoes` responde 1 encerrada e "Esta continua aberta"; a sessão de quem clicou escreve 200 e renova 200; a outra sessão recebe 401 | PASS |
| Isolamento: token de B contra ocorrência de A continua 404 | `qa-vigencia`, E04 caso 4: escrita 404 e leitura 404 | PASS |
| `npm run test:isolamento` verde | `02-test-isolamento.txt`: 14 arquivos, 345 aprovados, 3 pulados (os de `pg_trgm`, por ambiente), código 0 | PASS |
| Zero `skip` em vigência | `grep` de `skip`/`only`/`todo` em `vigencia-na-escrita`, `get-com-efeito`, `acesso-suspenso`, `codigos-de-erro`, `familia-da-sessao`: nenhum `describe.skip`/`it.skip` (só a palavra no comentário histórico) | PASS |
| Comentários batem com o código (o FAIL da rodada 2) | cada afirmação do comentário de `apps/api/src/auth/suspensao.ts` executada (caso "comentario de suspensao.ts, afirmacoes uma a uma", tabela abaixo) e a leitura de `servidor.ts` e `vigencia.ts` | PASS |
| E2E: desativar no painel e o próximo pedido falhar | `npm run test:e2e:api` (`07-test-e2e-api.txt`), seção 23: "a coordenacao desativa o Marcos pelo painel", "conta desativada leva a tela de entrada", 288 de 288 no fluxo e 64 de 64 no layout, zero erro de console, código 0 | PASS |
| Regressão: `test:api`, `superficie.test.ts` (dentro dela), `test:e2e:api` | `01-test-api.txt`: 100 arquivos, 1309 aprovados, 1 falha (`openssl-do-teste.test.ts`, LibreSSL do macOS, divergência conhecida desta máquina), 9 pulados (o bloco de Postgres real, rodado à parte abaixo); e2e acima | PASS |

O defeito da rodada 2 (comentário de `suspensao.ts` desmentido pelo código), afirmação por afirmação, medido em `30-sonda-vigencia.txt`:

| Afirmação do comentário | Observado | Bate |
| --- | --- | --- |
| Renovar com a sessão de pé e o município suspenso responde 403 `acesso_suspenso` | 403 `acesso_suspenso` | sim |
| Depois de o console revogar, renovar responde 401 `sessao_encerrada`, e o 403 aparece em entrar | renovar 401 `sessao_encerrada`; entrar com a senha certa 403 | sim |
| Escrita com token vivo: 403 `acesso_suspenso` fora da fila | POST de coordenada 403 | sim |
| GET com efeito (`/avisos`, CSV) e o HEAD deles: 403 `acesso_suspenso` | GET 403 `acesso_suspenso` e HEAD 403 nos dois | sim |
| Rotas da fila do campo (todas POST) recebem 503 | `POST /sincronizacao/vistoria` com token vivo do agente: 503 | sim |
| Leitura sem a marca não confere | `GET /ocorrencias` 200 com o município suspenso | sim |
| Token vencido e autêntico: 403, e 503 na fila | 403 `acesso_suspenso` na rota comum, 503 na fila | sim |
| Senha errada em município suspenso recebe a recusa genérica | corpo e status idênticos ao de e-mail inexistente (401 `credenciais`) | sim |
| `ESPERA_MAXIMA_MS` de cinco minutos; `recuperacao_desligada` é 503; o cliente classifica 5xx e 429 como temporário | lido: `packages/campo/src/fila.ts:205` (`5 * 60_000`), `apps/api/src/rotas/autenticacao.ts:178,204` (503), `packages/campo/src/transporte.ts:225` | sim |

## Evidência

- `$SP/val/qa/00-build-shared.txt` (código 0)
- `$SP/val/qa/01-test-api.txt`: `npm run test:api`, código 1 só pelo `openssl-do-teste` (ambiente)
- `$SP/val/qa/02-test-isolamento.txt`: código 0
- `$SP/val/qa/07-test-e2e-api.txt`: `npm run test:e2e:api`, código 0
- `$SP/val/qa/30-sonda-vigencia.txt`: sonda própria, 18 de 18
- `$SP/val/qa/40-mutacao-M1-familia.txt` e `.diff` (mutação de E07 no mesmo arquivo `vigencia.ts`, ver relatório da E07)
- CI: run 38618369218, 9 de 9 `success` (lido por `gh run view --json jobs`)

## Cenários positivos

Conta ativa escreve 200; a sessão de quem encerrou as outras continua escrevendo e renovando; leitura com token vivo de conta desativada segue 200 (comportamento declarado até a F03-E03).

## Cenários negativos

Conta desativada (POST e PATCH), sessão encerrada por quem administra, sessão encerrada pela própria pessoa em outro aparelho, papel rebaixado, município suspenso (escrita, GET com efeito, HEAD, fila, token vencido, renovação), token de B em ocorrência de A (404).

## Tentativas de reprovar

- Procurei frase do comentário de `suspensao.ts` que o código não cumprisse: executei as nove afirmações comportamentais; todas batem. A frase reescrita na correção 2 sobre "renovar depois de o console revogar" foi a que mais tentei derrubar (revoguei as sessões do município como o console faz e renovei): 401 `sessao_encerrada`, como diz o texto.
- HEAD das rotas com efeito com o município suspenso: 403, não vaza 200.
- PATCH (não só POST) com conta desativada: 403.
- Senha errada em município suspenso como oráculo: corpo idêntico ao de e-mail inexistente.

## Achados

- ANOTADO (fora do escopo da E04, dono E07): uma sessão aberta por login com a senha antiga no instante de uma troca de senha, redefinição ou desativação sobrevive ao ato (reproduzido por mim, ver o relatório de QA da E07). Para a E04 o efeito medido é coerente com a vigência: a sessão sobrevivente de conta desativada leva 403 `conta_desativada` na escrita; a da troca de senha é uma sessão viva comum, que a vigência não tem como distinguir. Não reprova a E04.
- ANOTADO (desenho anterior, já registrado): a mensagem de 401 `sessao_encerrada` em `/auth/renovar` é "Sessão expirada. Entre novamente.", diferente da do catálogo.

## Não verificado

- Mutação do próprio `exigirVigencia` nesta rodada: não refeita por mim (as rodadas 1 e 2 fizeram; a minha mutação foi na regra da cadeia, mesmo arquivo, e morde 5 de 18 da minha sonda e 7 de 20 de `familia-da-sessao.test.ts`).
- Leitura com conta desativada: fora da vigência por plano (F03-E03), só constatada (200).
- Varredura completa de todas as rotas de escrita nos quatro estados: feita pelas rodadas anteriores e por `get-com-efeito.test.ts` (verde no `test:api`); não refeita rota a rota por mim.

## Risco residual

A vigência vale só na escrita; leitura com token vivo de conta desativada continua até 15 minutos (F03-E03). O dossiê e a busca gravam o registro da própria leitura sem a vigência (decisão registrada).

## Motivo do humano

Não se aplica: a sonda "antes e depois" é verificável por execução e foi executada.
