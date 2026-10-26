---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Sem emulador nem aparelho nesta máquina: a prova é E1 (testes de componente com `@testing-library/react-native` e portões estáticos do aplicativo) mais leitura; o que só o aparelho prova fica para o Rafael, como a própria etapa manda (E2E "no aparelho", validação humana no iPhone). `A` é o scratchpad do validador (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-acessibilidade`). O diff desde a rodada 6 (`git diff --stat 1ed0b71..fd17ff4 -- dc360/apps/campo dc360/packages/campo`) é VAZIO: o aplicativo não mudou; a etapa entrou no mapa pela guarda de códigos de erro e pelo `README.md`. Rodei de novo a suíte e os portões no SHA, e uma mutação para provar que o teste da linha "Acessibilidade" morde.

| Critério (linha "Acessibilidade" e testes da etapa) | WCAG | Resultado | Prova |
| --- | --- | --- | --- |
| Alvo de toque de 44 por 44 nos botões novos | 2.5.8 | OK: teste "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44" verde; portão "nenhum alvo de toque abaixo de 52" verde | `A/saidas/21-jest-campo-a11y.txt`, `A/saidas/22-portoes-app.txt` |
| Botão com nome para leitor de tela | 4.1.2 | OK: o botão "Abrir os ajustes do aparelho" com descrição falada "Abrir os ajustes do sistema para liberar a permissão deste aplicativo" (`vistoria/[id].tsx:699-713`); portão "todo elemento tocável se apresenta ao leitor de tela" verde | idem; mutação abaixo |
| Tarja lida por leitor de tela, ícone mais texto | 4.1.3, 1.4.1 | OK por teste e leitura: `Aviso` de perigo com título "Não deu certo" e a frase; testes de câmera e de localização com a mesma tarja verdes | `A/saidas/20-jest-campo.txt` |
| Contraste dos dois temas do aplicativo | 1.4.3 | portão "contraste calculado: temaClaro/temaEscuro passa no mínimo exigido em todo par" verde | `A/saidas/22-portoes-app.txt` |
| Teclado e área segura | 1.4.10 (equivalente) | testes "o primeiro toque fora do campo AGE", "a rolagem sabe a altura do teclado" e o da área segura de baixo verdes | `A/saidas/21-jest-campo-a11y.txt` |
| Frase sem promessa de segundo plano | | portão `portao-sem-promessa-de-segundo-plano-do-aplicativo` verde | `A/saidas/22-portoes-app.txt` |
| Suíte inteira do aplicativo | | 1997 de 1997 em 139 suítes, código 0 | `A/saidas/20-jest-campo.txt` |

## Evidência

- `npx jest` em `dc360/apps/campo`: código 0, "Tests: 1997 passed, 1997 total", 139 suítes (`A/saidas/20-jest-campo.txt`).
- `npx jest -t "acessib|leitor de tela|toque|contraste|ajustes|tarja|área segura|teclado|conta desativada|sessão" --verbose`: código 0, 226 aprovados no recorte (`A/saidas/21-jest-campo-a11y.txt`).
- `node --test scripts/portao-acessibilidade-do-aplicativo.test.mjs` mais `portao-densidade`, `portao-design`, `portao-do-mapa` e `portao-sem-promessa-de-segundo-plano` do aplicativo, em `dc360/`: código 0, 62 de 62 (`A/saidas/22-portoes-app.txt`).
- Mutação: em `dc360/apps/campo/src/app/(agente)/vistoria/[id].tsx` troquei o título e a descrição falada do botão dos ajustes por "Abrir"; `npx jest src/__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` saiu 1 com 5 falhas de 17, entre elas "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44" (`A/saidas/23-jest-mutacao-ajustes.txt`). `git restore` do arquivo, `git status --porcelain` do aplicativo vazio, e o mesmo arquivo de teste de novo: 17 de 17 (`A/saidas/24-jest-depois-de-restaurar.txt`).
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success` conforme lido pelo gatekeeper, incluindo o job "Aplicativo de campo"; não reli a API.
- Sem capturas: não há emulador nem aparelho; captura de tela do aplicativo exigiria um deles.

## Cenários positivos

- Botão dos ajustes com nome falado e 44 px; tarjas de câmera e de localização; foto vazia com "Tire a foto de novo"; teclado e área segura respeitados nos testes de componente.

## Cenários negativos

- Falha que não é de permissão não ganha o botão dos ajustes, e o botão não sobrevive à falha seguinte (testes verdes).
- Sistema que recusa abrir os ajustes: nada estoura e a tarja continua (teste verde).

## Tentativas de reprovar

- Confirmei que o aplicativo não mudou desde a rodada 6 (diff vazio), para não herdar conclusão: rodei tudo de novo no SHA.
- Tirei o nome falado do botão dos ajustes: 5 testes reprovam, entre eles o da linha "Acessibilidade". O portão morde.
- Procurei no recorte por nome qualquer teste de toque, contraste, leitor de tela ou teclado vermelho ou pulado: nenhum vermelho; os pulados do recorte são os que não casam com o filtro.

## Achados

1. **anotado** (o mesmo das rodadas anteriores). No iOS a tarja de erro pode não ser lida automaticamente pelo VoiceOver (`accessibilityLiveRegion` vale só no Android; o `accessibilityRole="alert"` no iOS depende de a pessoa chegar ao elemento). Sem aparelho, não medido.

## Não verificado

- Tudo o que o aparelho prova: negar a câmera e tocar no botão (abrir os Ajustes de verdade), digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque, área segura em aparelho com recorte, leitura da tarja por VoiceOver e TalkBack. Sem emulador Android, sem iPhone conectado nesta máquina.
- Contraste medido sobre a tela renderizada: só pelo cálculo do portão sobre os tokens.

## Risco residual

O código do aplicativo é o mesmo validado na rodada 6; o risco é o de sempre desta etapa: comportamento de leitor de tela e de teclado que só o aparelho mostra.

## Motivo do humano

A etapa manda o E2E e a validação no aparelho (Rafael no iPhone, e Android real quando houver): negar a câmera e tocar no botão (abre os Ajustes), digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque, e conferir com o leitor de tela ligado se a tarja é lida.
