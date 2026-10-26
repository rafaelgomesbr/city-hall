---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`). Sondas e mutações numa CÓPIA do SHA em `SCRATCH/val-seguranca/copia/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`); saídas em `SCRATCH/val-seguranca/saidas/`. Não herdado: o diff `1ed0b71..fd17ff4` toca a guarda e o catálogo de que a fila depende (`packages/campo` não mudou nesse diff).

| Critério de segurança | Prova | Resultado |
| --- | --- | --- |
| O servidor diz `403 conta_desativada` e `401 sessao_encerrada` pelos códigos do catálogo (o que a fila lê) | HTTP real (`20-sonda-http.txt`) | PASS |
| 403 `conta_desativada` e 401 `sessao_encerrada` deixam o item `pendente`, sem bloquear nem descartar | `packages/campo` 238 de 238 (`40`); mutação M5a (conta desativada vira `FalhaPermanente`) | PASS: M5a reprova 6 casos |
| Renovação forçada é UMA, e token igual não repete (sem laço contra servidor que disse não) | mutação M5b (repete com o mesmo token) | PASS: M5b reprova 2 casos |
| 403 `sem_permissao` ainda bloqueia; sem token vira `FalhaDeSessao` | suíte de `packages/campo` (matriz de classificação) | PASS |
| Desativar o agente entre enfileirar e drenar: 403 `conta_desativada`, item fica no aparelho | `apps/api/test/campo-integracao.test.ts` (servidor real com o motor real), dentro de `30-base-verde.txt` | PASS |
| Itens de outro autor esperam o autor | `packages/campo/test/fila.test.ts` ("quando o autor entra de novo no aparelho, a coleta dele sobe", "assumir NUNCA reescreve o autor") | PASS |

## Evidência

- `40-campo-base.txt`: `vitest run` em `packages/campo` da cópia, 238 de 238, código 0.
- `41-m5a-e06-conta-desativada.txt`: M5a em `packages/campo/src/transporte.ts` (remove o ramo `parar_e_avisar`), código 1, 6 reprovados (transporte, fila com transporte, matriz). `42-m5b-e06-repeticao.txt`: M5b (repete o pedido com o mesmo token), código 1, 2 reprovados. Arquivo restaurado e conferido com `cmp` contra o do SHA depois de cada uma.
- `30-base-verde.txt` (inclui `campo-integracao.test.ts`): 463 de 463, código 0.
- `20-sonda-http.txt`: corpos reais de `conta_desativada`, `sessao_encerrada` e `nao_autenticado` pela API.
- CI: run 39420436042, job "Aplicativo de campo" `success` (`05-ci-jobs.txt`).

## Cenários positivos

- Item da fila com sessão boa sobe; quando o autor volta ao aparelho, a coleta dele sobe.
- 401 `nao_autenticado` pede token novo uma vez e repete com o novo.

## Cenários negativos

- 403 `conta_desativada` pelo fio: pausa por conta desativada, item `pendente`, tentativas inalteradas.
- 401 `sessao_encerrada`: não renova (o catálogo manda entrar de novo), item fica.
- Renovação que devolve o MESMO token: o pedido não sai de novo.
- 403 `sem_permissao`: `FalhaPermanente` (recusa do dado, não da conta).

## Tentativas de reprovar

1. M5a: fiz a conta desativada cair em `FalhaPermanente` (o defeito que a etapa fecha): a suíte reprova.
2. M5b: tirei a trava "token igual não repete" (o laço contra servidor que disse não): a suíte reprova.
3. Conferi se o diff desta rodada mudou o que o servidor manda nos três casos (a fila decide pelo `erro`): por HTTP real os corpos são os do catálogo; a guarda nova não os altera.
4. Procurei, no achado 1 da E05 (resposta contrabandeada), um efeito na fila: o motor usa `fetch`, e o `fetch` do Node descarta o socket com dado inesperado (`10-sonda-api-e05.txt`, "clientes reais"); a resposta trocada não chega à fila nesse cliente.

## Achados

Nenhum achado que bloqueie nesta dimensão. **anotado:** a dessincronização da E05 (achado 1 de lá) só atinge cliente que leia respostas em pipeline; o React Native usa a pilha HTTP do sistema, que não pude exercitar aqui.

## Não verificado

- Aparelho ou emulador Android (não há nesta máquina): o comportamento do `fetch` do React Native diante de resposta contrabandeada e o diálogo no aparelho não foram vistos.
- Node 22 do `.nvmrc` (rodei em 24.15.0).
- As frases mostradas ao agente (outras dimensões e pessoa).

## Risco residual

A coleta de quem foi desativado fica no aparelho sem reconhecimento pela coordenação (decisão futura declarada na etapa). Um 403 com código fora do catálogo que escapasse da guarda (achado 1 da E05) cairia em `FalhaPermanente` e bloquearia o item: hoje só por erro de programação de rota.

## Motivo do humano

Nada nesta dimensão depende de pessoa: a classificação e a trava de repetição foram provadas por execução e por mutação.
