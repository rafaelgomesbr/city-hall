---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E16
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **FAIL**. A promessa de segundo plano da rodada 1 está fora do texto do aplicativo (varredura manual, portão e mutação), e a tarja de permissão com "Abrir os ajustes do aparelho" funciona no emulador. O que reprova é um defeito achado no emulador, na tela que a etapa mexeu: no Android, toda fotografia nova é recusada com "A foto não ficou guardada neste aparelho (o arquivo saiu vazio). Tire a foto de novo.", embora o arquivo tenha ficado inteiro no disco. A vistoria exige ao menos uma foto, então a tarefa principal fica impedida.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-campo/` (abreviada como `qa-campo/`).

| Critério | Resultado |
| --- | --- |
| frase da vistoria guardada sem "aplicativo fechado" | PASS (E1; E2: `E16-vistoria-guardada-sem-promessa-de-segundo-plano.png`) |
| nenhuma promessa de segundo plano na interface (FAIL da rodada 1) | PASS com ressalvas (achados 2 e 3) |
| tarja de câmera negada com "Abrir os ajustes do aparelho" que chama `Linking.openSettings` | PASS (E1; E2: `E16-tarja-camera-negada-com-botao-de-ajustes.png` e `E16-ajustes-do-aparelho-abertos.png`) |
| falha que não é de permissão não ganha o botão de ajustes | PASS (E1) |
| câmera reserva a área segura de baixo | PASS no emulador Android com navegação por gestos (`E16-camera-em-tela-cheia.png`); iPhone não verificado |
| primeiro toque fora do campo age; rolagem conhece o teclado | PASS (E1); teclado real não exercitado |
| foto vazia mostra "Tire a foto de novo" | PASS na frase, **FAIL na causa** (achado 1) |
| portões do aplicativo verdes | PASS (`npm run test:campo`, `portao-sem-promessa...`) |

## Evidência

- `cd dc360/apps/campo && npx jest` em `vistoria-o-teclado-a-camera-e-o-que-ela-promete` e `fila-como-produto`, dentro do lote de 7 arquivos: 109 de 109 (`qa-campo/83-jest-e15-e16.txt`).
- `npm run test:campo`: 129 suítes, 1903 de 1903, tipos limpos (`qa-campo/90-test-campo.txt`).
- `node --test scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs`: 4 de 4 (`qa-campo/60-portao-segundo-plano.txt`).
- Mutação do portão: reintroduzi "sobe sozinho, em segundo plano." na fila zerada de `fila.tsx` (linha 1690): o portão reprova com 2 achados e a linha (`qa-campo/63-mutE16-portao.txt`); `git restore` e verde. (A primeira tentativa de mutação não aplicou, porque a frase está partida em duas linhas; refiz na linha certa.)
- Varredura manual do texto visível de `apps/campo/src` (comentários e testes fora), com lista bem mais larga que a do portão: segundo plano, background, fechado, sozinho, automático, assim que, mesmo sem ou com, enquanto, tela bloqueada, "quando o sinal voltar" e variações (`qa-campo/varredura.mjs`, saída em `qa-campo/61-varredura-textos.txt`). Nenhuma promessa de envio com o aplicativo fechado sobrou. Restam as frases dos achados 2 e 3.
- Portão enganado: 16 de 18 frases testadas passam por ele (as 2 que ele pega são as de controle) (`qa-campo/62-portao-variantes.txt`; ver achado 3).
- Emulador Android (AVD `Medium_Phone_API_36.1`, APK debug do SHA, câmera virtual do emulador), capturas em `qa-campo/capturas/`:
  - `E16-tarja-camera-negada-com-botao-de-ajustes.png`: depois de "Don't allow", a tarja "Não deu certo, Sem permissão de câmera. Libere a câmera para este aplicativo nos ajustes do aparelho..." com o botão "Abrir os ajustes do aparelho";
  - `E16-ajustes-do-aparelho-abertos.png`: o toque no botão abre as configurações do aplicativo (janela em foco `com.android.settings`);
  - `E16-camera-em-tela-cheia.png`: obturador e "Voltar sem fotografar" acima da barra de gestos do sistema;
  - `E16-foto-vazia-mensagem-tire-de-novo.png`: o achado 1;
  - `E16-foto-guardada-com-copySync.png`: com o remendo de QA do achado 1, "Fotografias (1)";
  - `E16-vistoria-guardada-sem-promessa-de-segundo-plano.png`: "Ela sobe com o aplicativo aberto: ... sobe quando o aplicativo estiver aberto e houver rede".
- A fila zerada no emulador mostrou "o que vier depois sobe quando o aplicativo estiver aberto e houver rede"; a fila com coleta, "Vai sair quando o aplicativo estiver aberto e houver sinal" e a legenda do botão "Com o aplicativo aberto e com sinal, o envio acontece sem você tocar em nada".

## Cenários positivos

- Tarja de câmera negada com o botão que abre os ajustes (emulador e teste).
- Frase de vistoria guardada e frases da fila com a condição verdadeira (emulador e testes de tela).
- Câmera abre em tela cheia com o obturador fora da barra do sistema.

## Cenários negativos

- Foto: 5 tentativas seguidas com o código do SHA, 5 recusas "saiu vazio" (`E16-foto-vazia-mensagem-tire-de-novo.png`). Com `copySync` no lugar de `copy`, a primeira tentativa passa e a lista mostra "Fotografias (1)".
- Mutação do portão (acima) reprova.
- O portão deixa passar 16 de 18 variantes (achado 3).

## Tentativas de reprovar

- Cobri o caminho da foto no emulador em vez de só no teste de componente, e achei o achado 1. Prova de que a causa é a cópia assíncrona e não o emulador: a câmera devolveu 13,5 KB em `cache/Camera`, a cópia em `files/foto-*.jpg` ficou com os mesmos bytes (13519 contra 13519), mas `medirArquivoNoAparelho` leu zero. Em `expo-file-system` 57.0.7, `File.copy()` devolve `Promise<void>` (`NativeFileSystem.types.d.ts`, linha 53, e `FileSystemModule.kt` `AsyncFunction("copy")`); o aplicativo chama `new File(uriDaCamera).copy(destino)` sem esperar e mede o tamanho na linha seguinte. O dublê do teste de unidade declara `copy(): void` síncrono (`evidencia-no-disco.test.ts:49`) e por isso nenhum teste pega.
- Varri todo o texto visível atrás de promessa de segundo plano com lista maior que a do portão e tentei variantes de frase contra o portão: achados 2 e 3.
- Procurei o botão de ajustes aparecendo onde não deve: com a frase "o arquivo saiu vazio" a tarja não traz o botão; com permissão negada traz. Confere com os testes de tarja.
- Olhei a câmera com navegação por gestos; não há botão físico a cobrir nem teclado aberto na câmera.

## Achados

### BLOQUEIA

1. **No Android a fotografia nunca é guardada: o aplicativo diz "o arquivo saiu vazio" para um arquivo que está inteiro, e a vistoria não conclui.** Arquivo: `apps/campo/src/dados/evidencia-no-disco.ts`, `guardarFotoNoAparelho`: `new File(uriDaCamera).copy(destino);` seguido de `medirArquivoNoAparelho(destino.uri)`. `copy` é assíncrona em `expo-file-system` 57; o tamanho é lido antes de a cópia existir, `size` e `bytesSync()` falham ou devolvem zero, e a função lança a frase de arquivo vazio. Anterior à E16 (a chamada `.copy(` vem do commit `2c4e488` e a frase de arquivo vazio do `5ecdf4c`; o `size` zerado no iPhone de 15/09/2026, que motivou a leitura dos bytes, tem a mesma cara), mas a E16 passou a mostrar a frase na tarja e o seu objetivo é que a tela "explique a foto vazia" com a verdade: aqui ela mente em toda tentativa. A checklist exige uma foto, então a tarefa principal fica impedida (e a E15 não consegue fechar o fluxo de concluir com GPS no aparelho).
   - Reprodução: emulador Android API 36.1, APK debug do SHA, entrar como o agente da semente, abrir a vistoria 000471/2026, "Tirar foto", conceder a câmera, tocar no obturador. Esperado: "Fotografias (1)". Obtido: tarja "A foto não ficou guardada neste aparelho (o arquivo saiu vazio). Tire a foto de novo." (`E16-foto-vazia-mensagem-tire-de-novo.png`), repetido em 5 de 5 tentativas; `adb run-as ... ls files` mostra 5 JPEG de 13 KB órfãos.
   - Prova do conserto: trocando `copy(destino)` por `copySync(destino)` (remendo de QA, nunca commitado, `qa-campo/70-patch-qa-apenas-para-o-emulador.diff`), a foto é aceita (`E16-foto-guardada-com-copySync.png`).
   - Por que o teste não pega: o dublê de `File` em `evidencia-no-disco.test.ts` tem `copy` síncrono. Teste novo recomendado: dublê com `copy` assíncrono (`Promise`) que só materializa o arquivo depois de um tick; deve exigir que `guardarFotoNoAparelho` espere. Regressão a escrever pelo dono.
   - Dono: E16 (tela de foto da vistoria). Perda de dado do campo (item 5 da seção 7 de `28`, sem risco aceito): coleta que o agente não consegue anexar.

### CORRIGE ANTES DE CRESCER

2. `apps/campo/src/app/(agente)/fila.tsx:454`: "Já tentou Nx e vai continuar tentando sozinha." Fora da lista do portão e mantida pelo implementador com o argumento de que descreve a nova tentativa do aplicativo aberto; mas "sozinha", sem a condição, é a mesma ambiguidade que a rodada 1 reprovou. Sugestão: "o aplicativo vai tentar de novo enquanto estiver aberto".
3. O portão `portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` é uma lista fechada de regex: 16 de 18 frases testadas passam (as 2 que ele pega são as de controle) ("no background", "automaticamente", "mesmo sem abrir o app", "pode fechar o app, o envio continua", "segundo-plano", "tentando sozinha"). Não há promessa dessas no aplicativo hoje (varredura manual); o risco é uma frase nova passar. O limite já é reconhecido no cabeçalho do portão.
4. Texto da permissão de câmera (`app.config.ts:39-43`): "enviadas à Defesa Civil do município quando houver sinal", sem a condição do aplicativo aberto; é o diálogo do sistema e entra na declaração de loja. Já anotado pelo implementador; confirmo.
5. "Voltar sem fotografar" na câmera (botão secundário sobre o visor preto): o rótulo escuro quase não se lê (`E16-camera-em-tela-cheia.png`), no tema claro. Anterior à etapa; contraste e acessibilidade para a dimensão de acessibilidade.

### ANOTADO

- O cartão da tarefa e o dicionário de frases ainda usam "assim que" fora do contexto de envio ("Este botão volta assim que a conexão voltar"): verdadeiro, só anotado.

## Não verificado

- iPhone: teclado cobrindo o campo, área segura do iPhone e permissão do iOS. Motivo: o emulador Android não os reproduz. Vai para as pendências humanas.
- Teclado do Android aberto sobre o campo do nome e o primeiro toque fora dele: não exercitado no emulador (só E1 com `keyboardShouldPersistTaps` e `useSafeAreaInsets`).
- Câmera real e fotos reais (a câmera virtual do emulador devolve uma cena fixa).
- Navegação por três botões (área segura com botões físicos na tela).
- Execução completa da vistoria até o envio com a foto: só com o remendo de QA; sem ele não se chega lá (achado 1).

## Risco residual

Alto até o achado 1 ser corrigido: se o comportamento do emulador se repete em aparelho real (a causa é a API do módulo, não o emulador), nenhum agente Android anexa foto e nenhuma vistoria é concluída. Pode haver diferença de tempo entre aparelhos (a cópia pode vencer a corrida em alguns), o que tornaria o defeito intermitente em campo, pior para diagnosticar.

## Motivo do humano

Rafael no iPhone e em Android real (DP pergunta 15): teclado, área segura, Ajustes e, depois do conserto do achado 1, a foto. Aprova as 12 frases novas da E16 (texto de produto). O que depende de pessoa é só aparelho físico e texto; o resto foi executado.
