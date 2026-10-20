---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Sem emulador nem aparelho nesta máquina: a prova é E1 (testes de componente com `@testing-library/react-native`, portões estáticos do aplicativo) mais leitura. O que só o aparelho prova fica para o Rafael, como a própria etapa manda (E2E "no aparelho", validação humana no iPhone). `V` é `SCRATCH/validadores/acessibilidade`. Desde a rodada 5, `vistoria/[id].tsx` mudou pela E06 (fila pausada); conferi que a parte desta etapa segue de pé.

| Critério (linha "Acessibilidade" e testes da etapa) | WCAG | Resultado | Prova |
| --- | --- | --- | --- |
| Alvo de toque de 44 por 44 nos botões novos | 2.5.8 | OK: o botão dos ajustes tem `minHeight` 44 ou mais; o portão do aplicativo exige 52 em todo tocável | `V/saidas/08-jest-vistoria.txt`; `V/saidas/07-portoes-app.txt` ("nenhum alvo de toque abaixo de 52") |
| Botão com nome para leitor de tela | 4.1.2 | OK: `accessibilityRole="button"`, rótulo com "ajustes"; portão "todo elemento tocável se apresenta ao leitor de tela" | idem |
| Tarja lida por leitor de tela | 4.1.3 | OK no Android por `accessibilityLiveRegion="assertive"` (`vistoria/[id].tsx:683`); o `Aviso` de perigo tem `accessibilityRole="alert"` | teste "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44"; mutação abaixo |
| Ícone mais texto na tarja | 1.4.1 | OK (`Aviso` com título "Não deu certo" e a frase) | leitura de `vistoria/[id].tsx:695-713` |
| Falha que não é de permissão não ganha o botão | | OK | testes "uma falha que não é de permissão não ganha o botão dos ajustes" e "o botão não sobrevive à falha seguinte" |
| Frase sem promessa de segundo plano | | OK | portão `portao-sem-promessa-de-segundo-plano-do-aplicativo` (11 casos) e teste "não promete envio com o aplicativo fechado" |
| Contraste dos dois temas do aplicativo | 1.4.3 | OK | portão: "contraste calculado: temaClaro/temaEscuro passa no mínimo exigido em todo par" |
| Área segura na câmera e teclado | 1.4.10 (equivalente) | OK nos testes ("reserva a área segura de baixo", "a rolagem sabe a altura do teclado", "o primeiro toque fora do campo AGE") | `V/saidas/08-jest-vistoria.txt` |

## Evidência

- `npx jest src/__tests__/vistoria src/__tests__/tela-de-vistoria src/ui/fila-pausada-nao-promete-sinal` em `dc360/apps/campo`: código 0, 13 suítes, 174 testes (`V/saidas/08-jest-vistoria.txt`); `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` com 17 casos verdes.
- `node --test` nos portões `portao-acessibilidade-do-aplicativo`, `portao-densidade-do-aplicativo`, `portao-design-do-aplicativo` e `portao-sem-promessa-de-segundo-plano-do-aplicativo`: código 0, 48 de 48 (`V/saidas/07-portoes-app.txt`).
- Mutação: retirei `accessibilityLiveRegion="assertive"` da tarja em `vistoria/[id].tsx`, rodei `npx jest src/__tests__/vistoria-o-teclado`: código 1, "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44" vermelho, 16 de 17 (`V/saidas/09-jest-e16-mutacao-liveregion.txt`); restaurei com `git restore` (diff vazio conferido) e rodei de novo: 17 de 17 (`V/saidas/10-jest-e16-restaurado.txt`).

## Cenários positivos

Permissão de câmera ou de localização negada: tarja com "Abrir os ajustes do aparelho" (botão nomeado, 44 px ou mais, que chama `Linking.openSettings`) e "Fechar" logo abaixo; foto vazia mostra "Tire a foto de novo".

## Cenários negativos

Falha que não é de permissão (disco, GPS sem resposta, foto que não gravou) não ganha o botão; a falha seguinte que não é de permissão tira o botão; se o sistema recusar abrir os ajustes, nada estoura e a tarja continua.

## Tentativas de reprovar

1. Mutação da região viva: o teste da etapa morde.
2. Conferi se a mudança da E06 em `vistoria/[id].tsx` desde a rodada 5 desfez algo desta etapa: as 17 verificações e os portões seguem verdes; a frase da vistoria guardada continua sem promessa de segundo plano ("sobe quando o aplicativo estiver aberto e houver sinal", `vistoria/[id].tsx:2207`).
3. Procurei botão novo sem rótulo ou abaixo de 44: o portão varre o aplicativo inteiro e não acha.

## Achados

1. **anotado (já registrado na rodada 4).** `accessibilityLiveRegion` só vale no Android; no iOS a tarja depende de o `Aviso` ter `accessibilityRole="alert"` e do VoiceOver, sem `AccessibilityInfo.announceForAccessibility`. Pode não ser lida automaticamente no iPhone; só o aparelho prova.

## Não verificado

- Tudo o que depende de aparelho ou emulador (não há nesta máquina): VoiceOver e TalkBack lendo a tarja, o toque real no botão abrindo os Ajustes, o teclado do iOS sobre o campo, a área segura em aparelho com barra de gestos.
- Tamanho de fonte do sistema ampliado (equivalente ao zoom de 200 por cento) no aparelho.

## Risco residual

A prova de acessibilidade do aplicativo é de componente: as propriedades certas estão nos elementos certos e os portões mordem, mas a leitura em voz e o toque real ficam para o aparelho.

## Motivo do humano

A etapa manda o E2E e a validação no aparelho (Rafael no iPhone, e Android real quando houver): negar a câmera e tocar no botão (abre os Ajustes), digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque, e conferir com o leitor de tela ligado se a tarja é lida.
