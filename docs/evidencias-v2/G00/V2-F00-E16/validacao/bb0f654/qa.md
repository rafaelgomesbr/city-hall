---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta das saídas citadas abaixo (S): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E06-E14-E15-E16/`. A árvore validada é a do HEAD `0290af5`, que só difere de `bb0f654` em `STATUS.md` e `ESTADO-ATUAL.md`; a pasta da evidência da E16 é idêntica nos dois SHAs.

## Critérios verificados

| Critério (bloco da etapa) | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: 7 testes verdes | as 5 suítes da etapa (teclado e câmera, foto com disco fiel, contraste sobre o visor, `evidencia-no-disco`, fila como produto): 105 de 105 (`50-e16-arquivos.txt`); jest inteiro 1927 de 1927 (`01-test-campo.txt`) | PASS |
| Frase da vistoria guardada sem "aplicativo fechado" | `vistoria/[id].tsx:2345` ("sobe quando o aplicativo estiver aberto e houver rede"); portão `portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` verde dentro dos 106 de 106 (`03-portoes-do-app.txt`) | PASS |
| Teclado: `keyboardShouldPersistTaps="handled"` e altura do teclado | `vistoria/[id].tsx:2727-2728`; mutação para `"never"` derruba "o primeiro toque fora do campo AGE" (`52-e16-mut-teclado.txt`) | PASS por teste de componente (Android: ver Não verificado) |
| Câmera: área segura de baixo | `vistoria/[id].tsx:2530` (`espaco.e5 + margens.bottom`); mutação sem `margens.bottom` derruba "reserva a área segura de baixo" (`53-e16-mut-area-segura.txt`) | PASS |
| Ajustes: botão só para permissão negada | `setErro` nasce sem o botão e `avisarQueFaltaPermissao` com ele (`vistoria/[id].tsx:833-841`); mutação que dá o botão a toda falha derruba 4 casos, inclusive "uma falha que não é de permissão não ganha o botão" e "o botão não sobrevive à falha seguinte" (`51-e16-mut-ajustes-em-toda-falha.txt`) | PASS |
| Foto vazia: "Tire a foto de novo" e a cópia assíncrona | `evidencia-no-disco.ts:61` (`await new File(...).copy(destino)`); contrato conferido no pacote INSTALADO (`expo-file-system` 57.0.7: `copy(): Promise<void>`, `AsyncFunction("copy")` no Android; `write` e `delete` síncronos); mutação sem `await` derruba "a foto é aceita: 'Fotografias (1)'" (`54-e16-mut-copy-sem-await.txt`) | PASS |
| Acessibilidade: alvo 44 por 44, ícone mais texto, tarja lida | casos "o botão tem nome e 44 de altura e a tarja é região viva" e contraste 18,46:1 e 8,81:1 sobre o visor, verdes; portões de acessibilidade, densidade e design verdes | PASS no que é estático |
| DoD: portões do app verdes | 106 de 106 nos oito portões do app; `test:scripts` inteiro 288 de 288 (`04-test-scripts.txt`) | PASS |
| Regressão: `npm run test:campo` | 134 suítes, 1927/1927, tipos limpos; `expo-doctor` 21 de 21 depois da troca para expo 57.0.30 (`60-expo-doctor.txt`) | PASS |
| Evidência: `INDEX.md` byte a byte | script próprio contra os blobs de `bb0f654` (`21-index-E16.txt`): 70 de 70 batem; fora só `saidas/baseline-depois/INDEX.md` (excluído por regra); `conferir-evidencia.mjs V2-F00-E16 --sha bb0f654` código 0 | PASS |

## Evidência

- `cd dc360 && npm run test:campo` código 0, 134 suítes, 1927 casos, tipos limpos (`01-test-campo.txt`).
- `cd dc360/apps/campo && npx jest <5 suítes>` código 0, 105 de 105 (`50-e16-arquivos.txt`).
- `node --test` dos oito portões do app código 0, 106 de 106 (`03-portoes-do-app.txt`); `npm run test:scripts` código 0, 288 de 288 (`04-test-scripts.txt`).
- Mutações em `vistoria/[id].tsx` e `evidencia-no-disco.ts`, cada uma desfeita com `git restore` e conferida com `git status` limpo: `51` (4 reprovam), `52` (1), `53` (1), `54` (1, e a suíte unitária cai por rejeição solta).
- Leitura do contrato instalado: `node_modules/expo-file-system/build/internal/NativeFileSystem.types.d.ts:53,57,155,161` e `android/.../FileSystemModule.kt:130,141,203,207`.
- `npx expo-doctor` código 0, 21 de 21 (`60-expo-doctor.txt`).
- `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E16 --sha bb0f654` código 0 (`20-conferir-evidencia-E16.txt`).

## Cenários positivos

- Tarjas de câmera e de localização negadas trazem "Abrir os ajustes do aparelho", que chama `Linking.openSettings`, e "Fechar".
- Foto guardada com o disco fiel (cópia assíncrona): "Fotografias (1)", sem a tarja de arquivo vazio.
- A frase da vistoria guardada e os cartões da fila dizem a condição "aplicativo aberto".

## Cenários negativos

- Falha que não é de permissão (câmera que não dispara, GPS que não responde) não ganha o botão; e o botão não sobrevive à falha seguinte.
- Cópia recusada pelo sistema (Promise rejeitada): frase em português, sem texto nativo na tarja; destino vazio apagado.
- `Linking.openSettings` rejeitado não deixa rejeição solta (caso com `unhandledRejection`).
- Frases de autonomia sem "aberto" reprovam no portão de segundo plano.

## Tentativas de reprovar

1. Dei o botão de ajustes a toda falha: 4 casos reprovam.
2. Troquei `handled` por `never` e tirei a área segura da câmera: cada mudança derruba o seu caso.
3. Tirei o `await` da cópia (o FAIL da rodada 2): o teste de tela com o módulo real reprova.
4. Procurei outra operação de arquivo assíncrona sem `await` no app (`copy`, `move`, `write`, `delete`): `foto-do-agente.ts:284` já espera a cópia; `write` e `delete` são síncronos no pacote instalado.
5. Conferi se a troca de expo e expo-router mudou o contrato do `expo-file-system`: a versão instalada continua 57.0.7, e `expo-doctor` dá 21 de 21.
6. Procurei se o Android tem o mesmo cuidado de teclado que o iOS: `automaticallyAdjustKeyboardInsets` é só do iOS e o código confia no redimensionamento da janela do Android (premissa e); não há `softwareKeyboardLayoutMode` em `app.config.ts`. Não consegui provar nem descartar no aparelho (ver Não verificado).

## Achados

1. Anotado (hipótese, não provada): no Android a altura do teclado fica com o sistema (premissa e). Com o desenho de borda a borda do React Native 0.86 e dos Androids novos, o redimensionamento da janela pode não acontecer e o campo digitado pode ficar sob o teclado. Precisa ser conferido em Android real ou emulador; nenhum teste de componente consegue provar isso.

## Não verificado

- O E2E da etapa no aparelho (negar a câmera e tocar no botão, que abre os Ajustes; digitar o nome com o teclado aberto e tocar em "Tirar foto" no primeiro toque; obturador acima da barra do sistema): não há emulador Android e não há build para o Simulador de iOS (montar exigiria `pod install`, proibido); o Simulador também não tem câmera.
- Comportamento do teclado no Android (achado 1).
- VoiceOver e TalkBack lendo a tarja (só a marcação de região viva foi provada).
- O run do CI do SHA (não lido nesta sessão).

## Risco residual

- Teclado, área segura e a abertura dos Ajustes foram provados por propriedade e recuo calculado, não pelo sistema operacional.
- O portão de segundo plano lê texto escrito; frase montada em tempo de execução com valor de fora passa por ele (limite registrado).

## Motivo do humano

- Aparelho físico e E4 explícito na etapa: Rafael no iPhone (e em Android real quando houver) nega a câmera e toca em "Abrir os ajustes do aparelho", digita com o teclado aberto e toca em "Tirar foto" no primeiro toque, e confere o obturador acima da barra do sistema; inclui o teclado no Android (achado 1).
- Texto de produto: as frases novas da vistoria guardada e da fila precisam da aprovação dele.
