---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E4]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Comandos no SHA `4ce0433` (árvore principal em `3ce67c7`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`); mutações num worktree meu destacado em `4ce0433`.

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| DoD: 7 testes verdes | `npm run test:campo` 1932 de 1932, tipos limpos, código 0 (saída `01`) | PASS |
| Positivo: frase sem "aplicativo fechado"; DoD: nenhuma promessa de segundo plano | mutação M1 ("sobe mesmo com o aplicativo fechado" na vistoria guardada): 1 reprova no jest e o portão de segundo plano reprova (M1b, 1 de 15); M12 ("vai continuar tentando sozinha" na fila): o portão reprova 2 de 15 | PASS, morde |
| Positivo: o primeiro toque fora do campo age | M2 (sem `keyboardShouldPersistTaps="handled"`): 1 reprova | PASS, morde |
| Positivo: a rolagem conhece a altura do teclado | M3 (sem `automaticallyAdjustKeyboardInsets`): 1 reprova | PASS, morde |
| Positivo: a câmera reserva a área segura | M4 (recuo sem `margens.bottom`): 1 reprova | PASS, morde |
| Positivo: tarjas de câmera e de localização com o botão que chama `Linking.openSettings` | M6 (botão não abre os ajustes): 3 reprovam; M8 (câmera negada sem o botão): 3 reprovam; M9 (localização negada sem o botão): 2 reprovam | PASS, morde |
| Negativo: falha que não é de permissão não ganha o botão | M5 (toda falha ganha o botão): 4 reprovam | PASS, morde |
| Positivo: foto vazia mostra "Tire a foto de novo" | M7 (`fotografar` engole a frase): 4 reprovam; M11 (cópia sem `await` em `evidencia-no-disco.ts`): o teste de tela com o disco fiel reprova e a suíte unitária derruba o processo por rejeição solta (vermelho) | PASS, morde |
| Negativo: precisão ausente continua `null` | mutação G2 da E15 (ausente vira 0): 3 reprovam | PASS, morde |
| Acessibilidade: tarja lida por leitor de tela, botão com nome e 44 de altura | M10 (sem `accessibilityLiveRegion`): 1 reprova; o mesmo caso confere `accessibilityRole`, rótulo e `minHeight >= 44` | PASS, morde |
| DoD: portões do app verdes; regressão obrigatória | `portao-acessibilidade`, `portao-densidade`, `portao-design` e `portao-sem-promessa-de-segundo-plano`: 48 de 48, código 0 (`05`); `npm run test:scripts` 288 de 288, código 0 (`07`) | PASS |
| DoD: vermelhos do campo do G00 zerados (com E14 e E15) | jest do app inteiro sem falha (1932 de 1932) | PASS |
| E2E no aparelho (negar câmera e abrir Ajustes; digitar com teclado aberto e tocar "Tirar foto" no primeiro toque) | NÃO executado (ver Não verificado) | humano |

O "Motivo do veredito" da rodada 4 desta etapa foi PASS (QA, Testes e Acessibilidade), sem conserto pedido; o código da etapa não mudou desde `bb0f654` (o diff `bb0f654..4ce0433` em `apps/campo/src` só toca o teste da E15).

## Evidência

Diretório: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L14-qa-campo/saidas/`.

- `01-test-campo.txt`: `npm run test:campo`, código 0, 134 suítes, 1932 de 1932.
- `05-portoes-do-app.txt`: `node --test` dos quatro portões nomeados pela etapa, 48 de 48, código 0.
- `07-test-scripts.txt`: `npm run test:scripts`, 288 de 288, código 0.
- `02-pacote-campo.txt`: motor offline 231 de 231, código 0.
- `mut/E16-M*.txt`: 13 mutações com diff, saída e código (roteiro `lote-e14-e16.sh`).

## Cenários positivos

- Vistoria guardada: "Ela sobe com o aplicativo aberto", "sobe quando o aplicativo estiver aberto e houver rede", "a fila de envio mostra o andamento".
- Câmera e localização negadas: tarja com "Abrir os ajustes do aparelho" que chama `Linking.openSettings`, e "Fechar".
- Foto que sai vazia: "Tire a foto de novo"; com o disco fiel (cópia assíncrona), "Fotografias (1)".

## Cenários negativos

- Falha que não é de permissão (câmera que não disparou, foto não guardada) nasce sem o botão dos ajustes, inclusive depois de uma falha de permissão (M5 morde).
- `Linking.openSettings` rejeitado: nada estoura e a tarja fica.
- Promessa de envio com o aplicativo fechado, ou "sozinha", em tela do app: o portão e o teste de tela reprovam (M1, M1b, M12).

## Tentativas de reprovar

13 mutações realistas no código de produção, todas mordem:

| Id | Mutação | Resultado |
| --- | --- | --- |
| M1, M1b | "sobe mesmo com o aplicativo fechado" | jest 1 falha; portão 1 falha |
| M2 | sem `keyboardShouldPersistTaps` | 1 falha |
| M3 | sem `automaticallyAdjustKeyboardInsets` | 1 falha |
| M4 | obturador sem a área segura | 1 falha |
| M5 | toda falha com o botão dos ajustes | 4 falhas |
| M6 | botão não chama `openSettings` | 3 falhas |
| M7 | `fotografar` engole a frase de `FotoNaoGuardada` | 4 falhas |
| M8, M9 | câmera ou localização negada sem o botão | 3 e 2 falhas |
| M10 | tarja sem região viva | 1 falha |
| M11 | cópia da foto sem `await` | teste de tela falha; suíte unitária derruba o processo |
| M12 | fila volta a "tentando sozinha" | portão 2 falhas |

## Achados

- **Anotado (fora do escopo desta etapa, dono E06):** a frase de `index.tsx` "A coleta continua guardada no aparelho e sai quando o aplicativo estiver aberto e houver sinal." (linha 7 da tabela da correção 1 desta etapa) está certa quanto ao segundo plano, que é o que a E16 promete. Ela é falsa quando a fila está pausada pela conta ou pela sessão, e isso é defeito da E06, registrado no `qa.md` da E06 desta rodada com reprodução.
- **Anotado:** o teclado e a área segura são provados por propriedade do `ScrollView` e recuo calculado, não por comportamento num aparelho.

## Não verificado

- **E2E e E4** (iPhone e Android real): negar a câmera e abrir os Ajustes; teclado aberto e "Tirar foto" no primeiro toque; obturador acima da barra do sistema. Não há emulador Android aqui; o Simulador de iOS existe com um build de depuração do app, mas não pode ser dirigido (sem `idb` nem `maestro`, e `osascript` sem permissão de acessibilidade, `UI elements enabled = false`). E o simulador não tem câmera.
- Não refiz as capturas E1+ da correção 2; não são da minha dimensão.

## Risco residual

Os seis comportamentos da etapa estão presos por testes que mordem mutação realista e pelo portão de segundo plano. O que só o aparelho prova (teclado de verdade, área segura, tela de Ajustes do sistema, leitor de tela) fica com Rafael.

## Motivo do humano

A etapa pede a prova no iPhone disponível (e em Android real quando houver): abrir os Ajustes pelo botão, o primeiro toque com o teclado aberto e o obturador acima da barra do sistema. São comportamentos do sistema operacional que nenhum teste de componente reproduz e que nenhum simulador pôde ser dirigido para mostrar aqui.
