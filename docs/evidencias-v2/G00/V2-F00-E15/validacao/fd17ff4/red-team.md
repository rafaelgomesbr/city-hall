---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Suítes na CÓPIA de `fd17ff4` (jest de `apps/campo` pelo binário local, não `npx`). Nada do repositório editado. O diff desde a rodada 6 NÃO toca `apps/campo/src/app`, `apps/campo/src/dados`, `schemas.ts` nem `mensagens-do-zod.ts` (`git diff` vazio); a etapa é reprovável só por regressão.

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| Diálogo "Sair da conta?" conta rascunhos e fotos; sem rascunho/fila não fala em apagar | `dialogo-na-conta-com-vistoria-comecada.test.tsx` verde (`50-e15-jest.txt`) | PASS |
| GPS excelente (abaixo de 0,5 m) conclui: `Math.max(1, round(accuracy))`; esquema recusa 0/negativo com frase em PT | `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` verde | PASS |
| Aparelho compartilhado: outro agente que entra não vê o rascunho do primeiro (`acolherNoAparelho` limpa) | código inalterado desde a rodada 6; suíte verde | PASS |

## Evidência

- `SCRATCH/val-red-team/saidas/50-e15-jest.txt`: `node node_modules/.bin/jest dialogo-na-conta-com-vistoria-comecada vistoria-o-teclado-a-camera`, 2 suítes, 28 aprovados, código 0.
- `git diff 1ed0b71..fd17ff4` em `apps/campo/src/app`, `apps/campo/src/dados`, `schemas.ts`, `mensagens-do-zod.ts`: vazio.
- CI: run 39420436042 sobre `55209ab`, job "Aplicativo de campo" `success`.
- Prova de que morde, duas mutações na CÓPIA (jest pelo binário local):
  - `SCRATCH/val-red-team/saidas/60-mutacao-e15-gps.txt`: em `apps/campo/src/dados/precisao-do-gps.ts`, `Math.max(1, Math.round(precisao))` virou `Math.round(precisao)` (o defeito CMP-33: 0,3 m vira 0). `precisao-do-gps` + `vistoria-o-teclado-a-camera` VERMELHOS (3 de 22 reprovam, código 1); restaurado, `cmp` idêntico ao SHA, VERDES (22 de 22, código 0).
  - `SCRATCH/val-red-team/saidas/60-mutacao-e15-dialogo.txt`: em `perfil.tsx`, o diálogo de saída deixou de contar os rascunhos (`setRascunhosNaSaida(contarRascunhos(...))` desligado; o defeito CMP-52). `dialogo-na-conta-com-vistoria-comecada` VERMELHO (4 de 11 reprovam, código 1); restaurado, `cmp` idêntico ao SHA, VERDE (11 de 11, código 0).

## Cenários positivos

- "2 vistorias começadas" no plural e uma só no singular, chip/aviso somem quando a fila esvazia; precisão 0,3 vira 1 e 12,4 vira 12: casos da suíte verdes.

## Cenários negativos

- Sem rascunho e sem fila o diálogo não fala em apagar; precisão ausente grava `null`; o esquema recusa 0 e negativo com mensagem em português; "Entrar de novo" não apaga nada: casos da suíte verdes.

## Tentativas de reprovar

1. Procurei regressão no código da E15 entre as rodadas: `git diff` vazio em todos os arquivos da etapa; o comportamento é byte a byte o da rodada 6 (PASS).
2. Superfície de ataque externa: a E15 é comportamento LOCAL do aparelho (diálogo de saída, apagamento de dados, arredondamento de GPS no cliente); não há endpoint nem autorização a violar por rede. A regra de privacidade de apagamento em aparelho compartilhado (`acolherNoAparelho` limpa) está inalterada e provada pela suíte.
3. Rodei as duas suítes de UI da E15 na cópia para não herdar cega: 28 verdes.
4. Desfiz as duas proteções centrais numa cópia do SHA: o piso de 1 m do GPS (3 casos reprovam) e a contagem de rascunhos no diálogo de saída, que é o aviso de que sair apaga vistoria começada (4 casos reprovam); restauradas, verdes. Os testes mordem.

## Achados

- Nenhum. Nenhuma linha da etapa mudou e as provas passam no SHA.

## Não verificado

- A prova física no aparelho/emulador (sair com vistoria começada e concluir com GPS abaixo de 0,5 m): sem aparelho nem emulador Android nesta máquina (ambiente declarado); é a validação humana E4 (e a prova física fica para F14-E12).
- As frases do diálogo (conteúdo de produto) e o leitor de tela: validação humana e acessibilidade.
- A suíte `apps/campo` inteira: rodei os dois arquivos da etapa; o restante está no job de CI verde.

## Risco residual

Baixo. O código da E15 é idêntico ao validado na rodada 6 e as provas passam; a única lacuna é a execução física, que é de ambiente/humano.

## Motivo do humano

Não se aplica a esta dimensão por máquina; os dois fluxos no aparelho que o Rafael faz são validação humana.
