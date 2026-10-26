---
validador: red-team
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

Suítes na CÓPIA de `fd17ff4` (`SCRATCH/val-red-team/copia`), `build:shared` próprio. Nada do repositório editado. Escopo do diff que afeta a etapa: `git diff 1ed0b71..fd17ff4 -- dc360/packages/campo dc360/apps/campo` está VAZIO; só `packages/shared/src/codigos-de-erro.ts` mudou (dependência da E06), e, conferido linha a linha, toda alteração está DENTRO de bloco de comentário (`git diff ... | grep '^[+-]'` fora de comentário: zero). Os valores do catálogo (`nao_autenticado` 401, `sessao_encerrada` 401, `conta_desativada` 403, `sem_permissao` 403) são idênticos à rodada 6.

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| 401/403 de sessão/conta deixam itens `pendente`, dreno parado, zero `bloqueado`, tentativas inalteradas; `sem_permissao` ainda bloqueia | `packages/campo` vitest (transporte, fila, tipos, pausa-de-sessao): 238 de 238 (`41-e06-vitest.txt`) | PASS |
| Renovação única em 401 `nao_autenticado`, sem laço contra servidor que disse não | mesma suíte (fila/transporte) verde | PASS |
| Isolamento por autoria: item de outro autor não sobe com a sessão de quem entrou depois | mesma suíte verde; código inalterado desde a rodada 6 | PASS |

## Evidência

- `SCRATCH/val-red-team/saidas/41-e06-vitest.txt`: `npx vitest run` em `packages/campo`, 11 arquivos, 238 aprovados, código 0.
- CI: run 39420436042 sobre `55209ab`, job "Aplicativo de campo" `success` (apps/campo jest, 1997 casos).
- Diff vazio em `packages/campo`/`apps/campo` (comando registrado acima).
- Prova de que morde (`SCRATCH/val-red-team/saidas/60-mutacao-e06.txt`): na CÓPIA, o ramo de `falhaDaResposta` em `packages/campo/src/transporte.ts` que classifica o 403 `conta_desativada` (ação `parar_e_avisar`) como `FalhaDeSessao` foi removido, fazendo-o cair em `FalhaPermanente` (o defeito original: item bloqueado). Suíte `packages/campo` VERMELHA (6 de 238 reprovam, 2 arquivos, código 1). Restaurado, `cmp` idêntico ao SHA, VERDE (238 de 238, código 0).

## Cenários positivos

- Fila com 401 `nao_autenticado` renova uma vez e envia; item sobe sem duplicar (chave de idempotência): coberto pela suíte verde.

## Cenários negativos

- 401 `sessao_encerrada` e 403 `conta_desativada`: itens ficam `pendente`, dreno para, tentativa não conta; sem token vira `FalhaDeSessao`; 403 `sem_permissao` ainda bloqueia: casos da suíte `fila`/`transporte` verdes.

## Tentativas de reprovar

1. Procurei mudança no motor offline entre as rodadas: `git diff 1ed0b71..fd17ff4` em `packages/campo` e `apps/campo` não tem uma única linha. A classificação de 401/403 é byte a byte a da rodada 6 (PASS).
2. Confirmei que a mudança na dependência (`codigos-de-erro.ts`) é só comentário, logo não altera o contrato que a fila lê.
3. Rodei a suíte da fila na cópia para não herdar cega: 238 verdes.
4. Desfiz a proteção central (403 `conta_desativada` como falha de sessão, não permanente) numa cópia do SHA: 6 casos reprovaram (item bloqueado em vez de pendente); restaurado, 238 de 238 verdes. O teste morde.

## Achados

- Nenhum. A superfície de ataque da E06 (fila/transporte) não mudou e as provas passam no SHA.

## Não verificado

- E2E no emulador (desativar o agente durante coleta): sem emulador Android nem aparelho nesta máquina (ambiente declarado); é validação humana E4.
- As frases mostradas no aparelho (conteúdo de produto, validação humana).
- A suíte `apps/campo` inteira: rodei `packages/campo` (onde mora a lógica de sessão/fila) e os dois arquivos de UI da E15; o restante do app está coberto pelo job de CI verde.

## Risco residual

Baixo. O código de sessão/fila é idêntico ao validado na rodada 6 e as provas passam; só não há execução física no aparelho (ambiente).

## Motivo do humano

Não se aplica a esta dimensão; a prova física no aparelho e a frase são validação humana de outra dimensão.
