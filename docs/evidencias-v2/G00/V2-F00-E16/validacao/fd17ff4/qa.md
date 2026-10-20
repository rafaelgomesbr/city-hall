---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e14-18`. O produto em `dc360/` é idêntico entre `fd17ff4` e o HEAD `55209ab`. O diff da rodada (`1ed0b71..fd17ff4`) não toca `dc360/apps/campo` (`git diff --quiet`, código 0); toca `scripts/baseline.mjs` (contagens) e scripts de auditoria, por isso os portões do app e o `test:scripts` inteiro rodaram de novo. Mutações numa CÓPIA de `fd17ff4` (`git archive` em `$V/arv`, `node_modules` por link, sem `git worktree`), com aplicar, testar, restaurar e conferir SHA-256 pelo roteiro `$V/scripts/mutar.mjs`. Linha de base da cópia: 4 arquivos da etapa, 40 de 40 (`$V/mut-e16/E16-BASE.txt`).

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| DoD: 7 testes verdes | `npm run test:campo` código 0, 1997 de 1997 (`$V/r-test-campo.txt`); `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` 17 de 17 na base | PASS |
| Frase sem "aplicativo fechado"; nenhuma promessa de segundo plano | F1 (volta "mesmo com o aplicativo fechado"): reprova; F2 (variante sem a palavra "fechado": "sobe sozinha, em segundo plano"): reprova; PG1 (promessa "Pode fechar o aplicativo, a coleta termina de subir" plantada na `fila.tsx` real): o portão `portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` reprova 2 casos | PASS |
| Primeiro toque fora do campo age (`keyboardShouldPersistTaps="handled"`) | K1 (sem a propriedade): reprova "o primeiro toque fora do campo AGE" | PASS |
| A rolagem conhece a altura do teclado | K2 (sem `automaticallyAdjustKeyboardInsets`): reprova "a rolagem sabe a altura do teclado" | PASS |
| A câmera reserva a área segura | C1 (`paddingBottom` sem `margens.bottom`): reprova "reserva a área segura de baixo" | PASS |
| Tarjas de câmera e de localização com o botão que chama `Linking.openSettings` | L1 (o botão não chama): 3 reprovam (câmera, localização, recusa dos ajustes); L3 (sem o `catch`): reprova "se o sistema recusar abrir os ajustes, nada estoura" | PASS |
| Negativo: falha que não é de permissão não ganha o botão | L2 (`setErro` nasce com `abreAjustes: true`): 4 reprovam, entre eles "uma falha que não é de permissão não ganha o botão dos ajustes" e "o botão não sobrevive à falha seguinte" | PASS |
| Foto vazia mostra "Tire a foto de novo" | FV1 (`fotografar` engole a frase): 4 reprovam, inclusive "a tarja diz a frase certa, com o que fazer, e não a genérica" | PASS |
| Acessibilidade: alvo de 44, nome para leitor de tela, tarja lida | A1 (`minHeight` do botão cai para 32): reprova "área de toque de 44"; A2 (`accessibilityLiveRegion` vira `none`): reprova o mesmo caso | PASS |
| Negativo: precisão ausente continua `null` | coberto pela E15 nesta rodada (mutação G3 reprova o caso deste arquivo, "aparelho que não informa a precisão grava nulo") | PASS |
| Regressão: `npm run test:campo` e os portões do app | `test:campo` código 0; `npm run test:scripts` na árvore: 324 testes, 324 aprovados, 0 falha, código 0 (`$V/r-test-scripts.txt`), que inclui `portao-acessibilidade-do-aplicativo`, `portao-densidade-do-aplicativo`, `portao-design-do-aplicativo` e o de segundo plano | PASS |
| E2E no aparelho e validação humana | sem emulador nem aparelho | pendência humana |

## Evidência

- `npm run test:campo` código 0 (`$V/r-test-campo.txt`).
- `npm run test:scripts` código 0 (`$V/r-test-scripts.txt`).
- Mutações: `$V/muts-e16.json` e `$V/muts-e16b.json`; saídas em `$V/mut-e16/<id>.txt` e `$V/mut-e16b/<id>.txt`, resumos `RESUMO.txt` em cada pasta (12 mutações, nenhuma sobreviveu).
- CI: run 39420436042, jobs "Aplicativo de campo" (118619736571) e "Testes, tipos e scripts" (118619736871, passo "Testes dos scripts") em `success`.

## Cenários positivos

- Vistoria guardada: "Ela sobe com o aplicativo aberto", com a condição de aplicativo aberto e rede.
- Permissão de câmera e de localização negadas: tarja com "Abrir os ajustes do aparelho", que chama `Linking.openSettings`; botão com nome e 44 de altura; tarja em região viva.
- Foto que saiu vazia: "Tire a foto de novo".

## Cenários negativos

- Falha de outra natureza nasce sem o botão de ajustes, inclusive logo depois de uma falha de permissão (L2 morde).
- `Linking.openSettings` recusado não estoura (L3 morde).
- Promessa de segundo plano com outras palavras, na tela e plantada na fila real (F2 e PG1 mordem).

## Tentativas de reprovar

1. Repus a frase falsa original (F1) e uma variante que evita a palavra "fechado" (F2): as duas reprovam.
2. Plantei na `fila.tsx` real uma promessa por afastamento ("Pode fechar o aplicativo, a coleta termina de subir"): o portão reprova.
3. Tirei cada propriedade de teclado e o recuo da área segura, uma por vez (K1, K2, C1): cada uma derruba o seu caso.
4. Tirei a chamada e o `catch` dos ajustes (L1, L3) e dei o botão a toda falha (L2): reprovam.
5. Encolhi o alvo de toque e calei a região viva (A1, A2): reprovam.
6. Procurei regressão do diff da rodada nos portões e nas contagens: `test:scripts` 324 de 324 e `test:campo` concorda com a leitura do código em 1997.

## Achados

Nenhum.

## Não verificado

- Comportamento real do teclado no iOS e no Android, a área segura de um aparelho com barra de gestos e a abertura dos Ajustes do sistema: não há emulador nem aparelho; a prova é por propriedade renderizada e recuo calculado no teste de componente.
- Foto real saindo vazia do disco do aparelho.
- Os logs dos jobs do CI (exigem token).

## Risco residual

Baixo no que é testável por componente. O que sobra depende do aparelho: o React Native real respeitar o `automaticallyAdjustKeyboardInsets` (só iOS) e o Android tratar o teclado sem ajuste equivalente.

## Motivo do humano

A etapa pede validação no iPhone (e em Android real quando houver): negar a câmera e tocar no botão (abre os Ajustes); digitar o nome com o teclado aberto e tocar em "Tirar foto" no primeiro toque; ver o obturador acima da barra do sistema. Só o aparelho mostra isso.
