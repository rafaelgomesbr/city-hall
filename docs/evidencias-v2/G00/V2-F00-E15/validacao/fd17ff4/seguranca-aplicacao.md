---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`). Testes e mutações numa CÓPIA do SHA em `SCRATCH/val-seguranca/copia/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`); saídas em `SCRATCH/val-seguranca/saidas/`. Não herdado por regra da rodada (o diff `1ed0b71..fd17ff4` toca o mapa de Segurança), embora o diff não mexa em `apps/campo` nem em `packages/shared/src/schemas.ts`.

| Critério de segurança e privacidade | Prova | Resultado |
| --- | --- | --- |
| Outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa (regra mantida) | `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` verde; mutação M6 (`apagou = false`) | PASS: M6 reprova 4 de 16 |
| A mesma pessoa reencontra a vistoria; sessão vencida não apaga | `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx`, `sair-e-entrar-nao-perde-a-coleta.test.ts`, `logout-nao-apaga-prova.test.ts` verdes | PASS |
| O diálogo de saída conta os rascunhos e diz que sair apaga (a regra de apagamento só avisa, não muda) | `aviso-da-saida.test.ts`, `dialogo-na-conta-com-vistoria-comecada.test.tsx` verdes; mutação M6b (contagem zerada) | PASS: M6b reprova 9 de 30 |
| O esquema do GPS não foi afrouxado (`positive()`) | diff de `packages/shared/src/schemas.ts` sem mudança nesta rodada; suíte do shared rodada pelo QA (223 de 223) | PASS (leitura e suíte de terceiro) |

## Evidência

- `50-campo-app-base.txt`: `jest` de `apps/campo` na cópia, 6 suítes, 53 de 53, código 0.
- `51-m6-e15-acolher.txt`: M6 em `apps/campo/src/dados/banco-local.ts` (`acolherNoAparelho` nunca apaga), código 1, 4 reprovados de 16. `52-m6b-e15-aviso.txt`: M6b em `dados/aviso-da-saida.ts` (contagem de vistorias começadas zerada), código 1, 9 reprovados de 30. Cada arquivo restaurado e conferido com `cmp` contra o do SHA.
- CI: run 39420436042, job "Aplicativo de campo" `success` (`05-ci-jobs.txt`).

## Cenários positivos

- A mesma pessoa sai por sessão vencida, entra de novo e reencontra a vistoria começada.
- O diálogo de saída fala em quantas vistorias começadas serão apagadas, com fotos e assinatura.

## Cenários negativos

- Outra pessoa entra no aparelho: o dado da anterior é apagado (prova de privacidade do aparelho compartilhado).
- Sem rascunho nem fila: o diálogo não fala em apagar.

## Tentativas de reprovar

1. M6: desliguei a limpeza na troca de pessoa (o vazamento que a regra impede): a suíte reprova.
2. M6b: fiz o diálogo esquecer os rascunhos (o defeito CMP-52): a suíte reprova.
3. Conferi que nada do diff desta rodada toca `apps/campo` ou o esquema do GPS.

## Achados

Nenhum achado nesta dimensão.

## Não verificado

- Aparelho ou emulador Android: não há nesta máquina, então nenhuma execução E2 (o apagamento real do SQLite e das assinaturas em disco no aparelho, e o diálogo na tela) foi vista por mim; a prova é a suíte com o banco local simulado. Por isso a confiança é média.
- O GPS real abaixo de 0,5 m (precisa de aparelho).
- Node 22 do `.nvmrc` (rodei em 24.15.0).

## Risco residual

A limpeza na troca de pessoa só acontece quando o disco tem dono marcado; um aparelho vindo de versão sem a marca fica na janela de uma atualização, como o próprio código declara. Preservar o rascunho depois da saída é decisão do CP-24.

## Motivo do humano

Nada nesta dimensão exige pessoa; o que falta é aparelho, não julgamento humano.
