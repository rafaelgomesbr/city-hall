---
validador: acessibilidade (general-purpose com o papel da dimensão)
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

Pasta das saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/acessibilidade/` (`saidas/` relativa a ela). Esta máquina NÃO tem emulador Android (`~/Library/Android/sdk` sem `emulator` nem `system-images`, sem AVD); há Simulador de iOS, mas montar o app Expo nele exigiria compilação nativa sem espaço em disco (cerca de 4 GB livres) e o simulador não tem câmera nem VoiceOver real. Por isso a prova é E1 (teste de componente e portões), como o gatekeeper definiu para a E16.

## Critérios verificados

Critério de acessibilidade da etapa ("alvo de toque de 44 por 44 nos botões novos, ícone mais texto, tarja lida por leitor de tela") e checklist WCAG 2.1 AA aplicável ao app:

| Item | Resultado | Prova |
| --- | --- | --- |
| 4.1.2 "Abrir os ajustes do aparelho": papel `button` e nome com "ajustes" | OK | teste "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44" |
| 2.5.5 botão dos ajustes com `minHeight` >= 44 | OK | mesmo teste |
| 4.1.3 tarja de erro como região viva (`accessibilityLiveRegion="assertive"`) e `Aviso` de perigo com `accessibilityRole="alert"` | OK no código; ver Não verificado (iOS) | `vistoria/[id].tsx:682`, `ui/componentes.tsx:1151` |
| 1.4.1 nada só por cor: `Aviso` com sinal (rótulo de gravidade) e título "Não deu certo" | OK | `ui/componentes.tsx` |
| 4.1.2 obturador com `accessibilityRole="button"` e rótulo "Tirar a fotografia", 84 por 84 | OK | `vistoria/[id].tsx:2543` |
| 1.4.3 e 1.4.11 "Voltar sem fotografar" sobre o visor preto | OK | teste `vistoria-camera-legivel-sobre-o-visor.test.tsx` mede o estilo renderizado (rótulo >= 4,5, contorno >= 3) nos dois temas |
| Falha que não é de permissão não ganha o botão dos ajustes | OK | testes "uma falha que não é de permissão..." e "o botão não sobrevive à falha seguinte" |
| Portões do app (acessibilidade, densidade, design, sem promessa de segundo plano) | OK | 48 de 48 |

## Evidência

- `node --test scripts/portao-acessibilidade-do-aplicativo.test.mjs scripts/portao-densidade-do-aplicativo.test.mjs scripts/portao-design-do-aplicativo.test.mjs scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs`: código 0, 48 de 48 (`saidas/14-portoes-do-aplicativo.txt`).
- `npx jest --silent` nas suítes da etapa (`vistoria-o-teclado-a-camera-e-o-que-ela-promete`, `vistoria-camera-legivel-sobre-o-visor`, `vistoria-a-foto-com-o-disco-fiel`, `ui/fila-como-produto`): 4 suítes, 85 de 85 (`saidas/15-jest-e16.txt`).
- `npm run test:campo` (tipos e jest inteiro): código 0, 134 suítes, 1927 de 1927, "tipos limpos e testes verdes" (`saidas/21-test-campo.txt`; o roteiro grava a contagem em `apps/campo/node_modules/.cache/dc360-contagem.json`, ignorado pelo git).
- Mutação: troquei `accessibilityLiveRegion="assertive"` por `"none"` na tarja (`vistoria/[id].tsx`), rodei o teste do botão dos ajustes: 1 falha (`saidas/22-mutacao-tarja-sem-regiao-viva.txt`); restaurado com `git restore` (SHA-1 27f3eee9 igual antes e depois).
- Capturas da etapa olhadas (nível E1+, árvore real renderizada em Chromium, não aparelho): `docs/evidencias-v2/G00/V2-F00-E16/correcao-2/capturas/E16-voltar-sem-fotografar-sobre-o-visor-390-claro.png` (rótulo branco sobre preto, contorno claro) e `.../E16-fila-pendentes-com-a-condicao-do-aplicativo-aberto-390-escuro.png` (as três frases com a condição "aplicativo aberto", selos com ícone e texto).

## Cenários positivos

- Câmera e localização negadas: a tarja traz "Abrir os ajustes do aparelho" com nome e 44 de altura, e o toque chama `Linking.openSettings`.
- Foto vazia: a tarja diz "Tire a foto de novo".

## Cenários negativos

- Falha que não é de permissão: sem o botão dos ajustes; a falha seguinte depois de uma de permissão nasce sem o botão.
- `Linking.openSettings` recusado pelo sistema: nada estoura e a tarja continua.

## Tentativas de reprovar

1. Mordida do teste de região viva: sem `accessibilityLiveRegion` o teste reprova (mutação acima).
2. Procurei `AccessibilityInfo.announceForAccessibility` no app para o anúncio no iOS: não existe nenhuma chamada em `apps/campo/src`; no iOS o anúncio depende só do papel `alert`, o que não garante leitura automática pelo VoiceOver (achado 1).
3. Contraste sobre o visor nos dois temas do aparelho: o teste mede o estilo renderizado e passa; a captura confirma visualmente.

## Achados

1. Corrige antes de crescer (provável, não provado sem aparelho): `accessibilityLiveRegion` só vale no Android; no iOS a tarja depende de `accessibilityRole="alert"`, e o React Native não posta anúncio por isso. O critério "tarja lida por leitor de tela" pode não se cumprir no iPhone com VoiceOver. Confirmar no aparelho; se não for lida, `AccessibilityInfo.announceForAccessibility(mensagem)` ao montar a tarja resolve.

## Não verificado

- Nível E2 (emulador Android com TalkBack): ambiente indisponível nesta máquina.
- Aparelho físico (iPhone com VoiceOver; Android real com TalkBack): leitura da tarja, foco no botão dos ajustes, abertura real dos Ajustes, teclado não cobrindo o campo, obturador acima da barra do sistema.
- Tamanho de fonte do sistema ampliado (Dynamic Type, fonte grande do Android).
- Captura de aparelho ou emulador da tarja de permissão (não existe na evidência).

## Risco residual

Médio: a prova é só por teste de componente; o comportamento de leitor de tela e de área segura em aparelho real não foi visto.

## Motivo do humano

Aparelho físico e leitor de tela (seção 4 de `28`): no iPhone com VoiceOver (e Android real com TalkBack quando houver), negar câmera e localização e conferir que a tarja é lida, que "Abrir os ajustes do aparelho" é anunciado como botão e abre os Ajustes, e que "Voltar sem fotografar" e o obturador são alcançáveis acima da barra do sistema.
