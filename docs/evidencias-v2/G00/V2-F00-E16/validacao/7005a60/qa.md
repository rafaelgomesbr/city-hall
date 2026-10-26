---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E16
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
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
- 7 testes da etapa verdes: `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` 14 de 14 (inclui 4 novos); `npm run test:campo` saiu 0, 1861 de 1861; CI idem.
- Frase do envio sem "aplicativo fechado": `vistoria/[id].tsx`, título "Ela sobe com o aplicativo aberto". A nova frase é verdadeira: `iniciarSincronizacaoContinua` só é iniciado em `(agente)/_layout.tsx:186`, e não há `expo-task-manager`.
- Teclado: `keyboardShouldPersistTaps="handled"` e `automaticallyAdjustKeyboardInsets` no ScrollView.
- Câmera: `paddingBottom: espaco.e5 + margens.bottom` com `useSafeAreaInsets`.
- Ajustes: botão "Abrir os ajustes do aparelho" só para permissão negada (câmera e localização); a falha seguinte nasce sem o botão (estado único `falha`).
- Foto vazia: `FotoNaoGuardada` leva "Tire a foto de novo" à tarja; câmera que não dispara mantém a frase genérica.
- A11y: botão com `accessibilityRole=button`, label com "ajustes", minHeight >= 44, tarja com `accessibilityLiveRegion=assertive` (teste novo).
- Documentação: `LEIA-ME.md` e `PENDENCIAS.md` do campo alterados no diff.

## Evidência
- `npm run test:campo` saiu 0 (scratchpad, `campo.txt`).
- Mutações em `vistoria/[id].tsx` (aplicadas e desfeitas por script):
  - `keyboardShouldPersistTaps` para `never`: MORTA ("primeiro toque fora do campo AGE").
  - remover `automaticallyAdjustKeyboardInsets`: MORTA.
  - remover `margens.bottom` do padding: MORTA.
  - frase de volta para "mesmo com o aplicativo fechado": MORTA.
  - `setErro` com `abreAjustes: true` sempre: MORTA (3 falhas).
  - `fotografar` sem usar `FotoNaoGuardada`: MORTA (2 falhas).
  - remover `Linking.openSettings()`: MORTA (2 falhas).
- `git status` sem alteração fora de `validacao/`.

## Cenários positivos
Permissão de câmera e de localização negadas mostram o botão que chama `Linking.openSettings`; foto vazia mostra "Tire a foto de novo"; precisão do GPS ausente continua `null`.

## Cenários negativos
Falha de disco depois de permissão negada não mantém o botão; erro nativo da câmera ("Camera is not running") não vaza para a tela e não ganha botão; a frase nova não contém "fechado", "segundo plano" nem "sozinha".

## Tentativas de reprovar
Procurei teste que trave comportamento errado: não achei. Limite honesto: os testes de teclado e de área segura conferem PROPRIEDADES do ScrollView e do padding, não o comportamento num aparelho (a mutação prova que a propriedade é cobrada, não que o teclado deixa de cobrir o campo). No Android não há ajuste de teclado equivalente declarado.

## Achados
- anotado: `FotoNaoGuardada` repassa `e.message` de qualquer erro de `guardarFotoNoAparelho`; hoje só a cópia é traduzida, então um erro nativo em inglês de `medirArquivoNoAparelho` apareceria cru na tarja. Improvável.
- anotado: o teste "o botão não sobrevive à falha seguinte" usa `Error("disco cheio")` do dublê, que não é a frase de produção.

## Não verificado
Aparelho físico (iPhone/Android): abrir Ajustes, teclado no primeiro toque, obturador acima da barra do sistema. As capturas das tarjas e o relato do aparelho prometidos no bloco não existem; o RESUMO declara isso. Emulador não usado (o APK é anterior às etapas).

## Risco residual
Médio-baixo: teclado e área segura sem prova em aparelho até F14-E12.

## Motivo do humano
O bloco exige o Rafael no iPhone (e em Android quando houver): negar a câmera e tocar no botão; digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque. Só aparelho real prova.
