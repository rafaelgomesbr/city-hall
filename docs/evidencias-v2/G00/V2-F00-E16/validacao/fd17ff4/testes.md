---
validador: testes (general-purpose)
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

`$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-testes`. Execução numa CÓPIA de `fd17ff4` (`git archive`), `node_modules` por link simbólico com `@dc360/*` da cópia; mutações por `$V/bin/mutar.sh` (aplica, roda o jest inteiro do aplicativo ou os portões, restaura por `git show fd17ff4:<arquivo>`, confere por `cmp`). A cópia final é idêntica a uma extração limpa do SHA. Os arquivos da etapa não mudaram entre `1ed0b71` e `fd17ff4`.

Todas as mutações abaixo são em `apps/campo/src/app/(agente)/vistoria/[id].tsx`, salvo f10 e f11 (`dados/evidencia-no-disco.ts`). O arquivo de teste é `__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`.

| Campo do bloco | Caso | Rodou no SHA | Mutação que o morde |
| --- | --- | --- | --- |
| Positivo: frase sem "aplicativo fechado" | "não promete envio com o aplicativo fechado, porque isso não existe"; portão `portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` | verde | f01 (frase volta a prometer "mesmo com o aplicativo fechado") 2 vermelhos no jest e o portão reprova com as três linhas acusadas |
| Positivo: o primeiro toque fora do campo age | "o primeiro toque fora do campo AGE" | verde | f02 (sem `keyboardShouldPersistTaps="handled"`) 1 |
| Positivo: a rolagem conhece a altura do teclado | "a rolagem sabe a altura do teclado" | verde | f03 (sem `automaticallyAdjustKeyboardInsets`) 1 |
| Positivo: a câmera reserva a área segura | "reserva a área segura de baixo" | verde | f04 (`paddingBottom` sem `margens.bottom`) 1 |
| Positivo: tarjas de câmera e de localização com o botão que chama `Linking.openSettings` | "de câmera: ...", "de localização: ...", "se o sistema recusar abrir os ajustes" | verde | f06 (permissão negada sem o botão) 5; f07 (botão não chama `openSettings`) 3 |
| Positivo: foto vazia mostra "Tire a foto de novo" | "a tarja diz a frase certa, com o que fazer, e não a genérica" e o teste do disco | verde | f08 (`fotografar` engole a frase) 4; f11 (frase do disco trocada) 2; f10 (a foto vazia não é apagada antes da recusa, correção 2) 1 |
| Negativo: falha que não é de permissão não ganha o botão | "uma falha que não é de permissão não ganha o botão", "o botão não sobrevive à falha seguinte" | verde | f05 (`setErro` liga o botão) 4 |
| Negativo: a frase nova não promete nada em segundo plano | portão sem promessa de segundo plano | verde | f01 (acima) |
| Negativo: precisão ausente continua `null` | "aparelho que não informa a precisão grava nulo" | verde | g02 da E15 (guarda de ausente desligada) 2 |
| Acessibilidade: alvo de 44, ícone mais texto, tarja lida por leitor de tela | "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44"; portões de acessibilidade, densidade e design | verde | f09 (tarja sem `accessibilityLiveRegion`) 1 |
| DoD: 7 testes verdes | os sete casos do bloco no arquivo acima | verde (`$V/15-e15-e16-arquivos.txt`) | ver acima |
| DoD: portões do app verdes | `node --test` dos quatro portões | 48 de 48, código 0 (`$V/06-portoes-do-app.txt`) | f01 no portão |
| Regressão: `npm run test:campo` | | verde | n/a |
| E2E no aparelho (negar câmera e abrir os Ajustes; teclado aberto e "Tirar foto" no primeiro toque) | sem aparelho nem emulador | não rodado | pendência humana (E4) |

## Evidência

- `npm run test:campo`: tipos limpos, 139 suítes, 1997 de 1997, contagem conferida, código 0 (`$V/05-test-campo-1.txt`).
- Seis arquivos de E15 e E16 com `--verbose`, entre eles o da vistoria: 68 de 68, código 0 (`$V/15-e15-e16-arquivos.txt`).
- Portões do aplicativo (`portao-sem-promessa-de-segundo-plano-do-aplicativo`, `portao-acessibilidade-do-aplicativo`, `portao-densidade-do-aplicativo`, `portao-design-do-aplicativo`): 48 de 48, 0 falhas, 0 pulados, código 0 (`$V/06-portoes-do-app.txt`).
- Mutações: `$V/mut/e16-f01.txt` a `e16-f11.txt` e `e16-f01-portoes.txt`. Todas reprovam; no jest inteiro, 1997 casos em cada, e só os casos ligados à mutação falharam.
- Política T42: 0 problemas, 0 skips incondicionais (`$V/04-portao-de-skip.txt`).
- CI, run 39420436042 (sobre `55209ab`, registro em cima de `fd17ff4`): "Testes do aplicativo" e "test:campo" (job "Aplicativo de campo") e "Testes dos scripts" (`npm run test:scripts`, que inclui os portões, job "Testes, tipos e scripts"), todos `success`, com `pipefail` (`$V/03-ci-jobs.txt`). Log não lido (exige token).

## Cenários positivos

- A vistoria guardada diz que sobe com o aplicativo aberto e com rede.
- Teclado e área segura tratados; permissão negada de câmera e de localização com o botão dos ajustes; foto vazia com a frase de tirar de novo.

## Cenários negativos

- Falha que não é de permissão não ganha o botão, nem herda o botão de uma falha anterior.
- Recusa do sistema ao abrir os ajustes não estoura.
- A frase não promete segundo plano (o portão acusa qualquer forma de "aplicativo fechado").

## Tentativas de reprovar

- Recoloquei a promessa falsa com outra redação ("mesmo com o aplicativo fechado, quando houver rede"): o jest e o portão reprovam, o portão em três leituras diferentes da mesma linha.
- Desliguei uma a uma as quatro propriedades de layout (toque persistente, recuo do teclado, área segura, região viva): cada uma tem caso que reprova.
- Liguei o botão para toda falha e desliguei para a permissão: as duas direções reprovam.
- Conferi se o diff `1ed0b71..fd17ff4` mexeu em algum teste ou portão desta etapa: não; as contagens do `baseline.mjs` só subiram.

## Achados

- anotado: quatro propriedades de layout (f02, f03, f04, f09) são presas por um caso cada, que lê a propriedade na árvore renderizada. Mordem, mas provam a presença da propriedade, não o efeito no aparelho (teclado cobrindo o campo, traço de gesto do sistema). Isso é o limite de teste de componente e é o motivo do E4.

Nenhum achado bloqueia.

## Não verificado

- O efeito real no aparelho: teclado do iOS, área segura, abertura dos Ajustes do sistema, câmera de verdade (sem aparelho nem emulador).
- Log do CI (exige token). Node 24 local; o CI (Node 22) passou.

## Risco residual

Os sete casos e os portões reprovam com cada mutação. O que sobra é o comportamento do sistema operacional, que só o aparelho mostra.

## Motivo do humano

O bloco pede o Rafael no iPhone (e em Android real quando houver): negar a câmera e tocar no botão, digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque. Isso é E4.
