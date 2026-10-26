---
validador: acessibilidade (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E16 (DoD, linha "Acessibilidade"): alvo de toque de 44 por 44 nos botões novos, ícone mais texto, tarja lida por leitor de tela; mais a mensagem de foto vazia, o teclado e a câmera na área segura e a tarja de permissão com o botão de ajustes. A rodada 2 reprovou acessibilidade (confiança alta): "Voltar sem fotografar" com 1,19:1 sobre o visor preto no tema claro (WCAG 1.4.3). A correção 2 pôs o botão dentro de `SobreOVisor` (`apps/campo/src/ui/componentes.tsx`), que dá às peças sobre o visor a paleta do tema escuro. Não há emulador Android nesta máquina: a prova é jest com os tokens reais (E1) e cálculo de contraste meu; o que exige aparelho está em Não verificado.

## Critérios verificados

1. Defeito da rodada 2 (1.4.3 do "Voltar sem fotografar"): NÃO MORDE MAIS, por E1. Cálculo meu (WCAG 2.x, luminância relativa) sobre os valores de `apps/campo/src/ui/tokens.ts`: antes, rótulo `#14191D` (tema claro, `texto`) sobre o visor `#000000` = 1,19:1 e contorno `#5A6B76` = 3,80:1; depois, rótulo `#ECF1F4` (tema escuro, `texto`) = 18,46:1 e contorno `#9BAAB5` = 8,81:1 (1.4.11 pede 3:1). Os números batem com o que o implementador declarou.
2. O teste morde (E1): `src/__tests__/vistoria-camera-legivel-sobre-o-visor.test.tsx` mede o estilo RENDERIZADO do botão com o aparelho em tema claro e escuro e exige 4,5:1 e 3:1. Com `SobreOVisor` trocado por fragmento na tela, o caso claro reprova com `1.186538465852321` e o escuro passa (`mut4-sem-SobreOVisor.log`); restaurado com `git restore`, 2 de 2 (`mut4-restaurado.log`), árvore limpa.
3. Papel, nome e alvo (4.1.2 e régua do aplicativo): "Voltar sem fotografar" é `Botao` (`accessibilityRole="button"`, `accessibilityLabel` igual ao título, `accessibilityState` com `disabled` e `busy`, `minHeight` 52 pelo token `toque`); obturador com `accessibilityRole="button"` e `accessibilityLabel="Tirar a fotografia"`, 84 por 84; "Abrir os ajustes do aparelho" com papel `button`, rótulo que fala de ajustes e `minHeight` de pelo menos 44 (caso "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44"). Portões do aplicativo: "nenhum alvo de toque abaixo de 52" e contraste de todos os pares dos temas claro e escuro, verdes (`portoes-app.log`, 48 de 48).
4. Tarja lida por leitor de tela e ícone mais texto: `tarja-de-erro` com `accessibilityLiveRegion="assertive"` e o `Aviso` de perigo com `accessibilityRole="alert"`, título "Não deu certo" com ícone e frase (casos verdes em `jest-e16-verbose.log`).
5. Foto vazia: a tarja diz "Tire a foto de novo" (a frase de `guardarFotoNoAparelho`) e não a genérica; erro sem mensagem e valor que não é `Error` caem no mesmo texto útil; a câmera que não dispara mantém a frase genérica. A foto com o disco fiel (cópia assíncrona) é aceita ("Fotografias (1)", sem a tarja de vazio).
6. Teclado e área segura, por propriedade: `keyboardShouldPersistTaps="handled"`, rolagem que conhece a altura do teclado e `paddingBottom` com a área segura de baixo (casos verdes). Comportamento no aparelho não verificado.
7. Suítes da etapa rodadas por mim: 6 suítes, 122 de 122 (`jest-e16.log`: as três de vistoria, `evidencia-no-disco`, `fila-como-produto`, `dialogo-na-fila`); portões do aplicativo (acessibilidade, densidade, design, sem promessa de segundo plano): 48 de 48 (`portoes-app.log`).

## Evidência

- Comandos, em `dc360/apps/campo` e `dc360`, com saídas em `$SP/val/acessibilidade/`: `npx jest <6 suítes>` código 0 (`jest-e16.log`), `npx jest <3 suítes de vistoria> --verbose` código 0 (`jest-e16-verbose.log`), `node --test scripts/portao-*-do-aplicativo.test.mjs scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` código 0 (`portoes-app.log`), mutação de `SobreOVisor` código 1 (`mut4-sem-SobreOVisor.log`) e restauração código 0 (`mut4-restaurado.log`).
- Contraste calculado por mim (python, a partir dos hexadecimais dos tokens), oito pares: rótulo e contorno antes e depois, obturador branco 21:1, anel do obturador no tema claro `#5B21B6` sobre preto 2,34:1, no escuro `#A78BFA` 7,72:1.
- Capturas do implementador, nível E1 mais (árvore real do React Native desenhada em Chromium, não é aparelho): `docs/evidencias-v2/G00/V2-F00-E16/correcao-2/capturas/E16-voltar-sem-fotografar-sobre-o-visor-390-{claro,escuro}.png` (olhei a clara: rótulo branco e contorno cinza claro sobre o preto). Capturas do emulador da rodada 2 em `validacao/4b96ea7/anexos/` são do SHA anterior.

## Cenários positivos

Botão de sair da câmera legível nos dois temas do aparelho; tarja de permissão com o botão de ajustes nomeado e com 44 ou mais; frase útil para a foto vazia; foto aceita com o disco fiel.

## Cenários negativos

- Falha que não é de permissão não ganha o botão de ajustes, e o botão não sobrevive à falha seguinte.
- O sistema recusando abrir os ajustes não derruba a tela.
- Sem `SobreOVisor`, o teste de contraste reprova (mutação).

## Tentativas de reprovar

- Desfiz o conserto (`SobreOVisor`) e vi o teste ficar vermelho exatamente no tema claro, com o 1,19:1 da rodada 2.
- Procurei outra peça sobre o visor com cor do tema: só o anel do obturador usa `tema.destaque`; no tema claro ele tem 2,34:1 contra o preto, mas o obturador é identificado pelo disco branco (21:1), então o 1.4.11 se cumpre. Anotado.
- Procurei se o portão de acessibilidade do aplicativo passou a medir superfície fora do tema (achado 2 da rodada 2): não; o visor está coberto só pelo teste novo desta tela.
- Procurei anúncio da tarja no iOS: `accessibilityLiveRegion` é só do Android no React Native, e `accessibilityRole="alert"` não dispara anúncio no VoiceOver; não há `AccessibilityInfo.announceForAccessibility` na tela. Ver Achados 1.

## Achados

1. anotado (risco para a validação humana no iPhone): no iOS a tarja de erro não é anunciada sozinha; o VoiceOver a lê quando a pessoa chega nela. A DoD diz "tarja lida por leitor de tela", o que se cumpre na leitura, mas o anúncio automático só existe no Android. Conferir no iPhone (pendência humana da etapa).
2. anotado (igual ao achado 2 da rodada 2): o portão de acessibilidade do aplicativo mede pares de tema sobre superfícies de tema; peça desenhada sobre superfície fora do tema (visor, papel de documento) só é medida se alguém escrever teste próprio, como foi feito aqui.
3. anotado: anel do obturador no tema claro com 2,34:1 contra o visor; não é falha (o disco branco identifica o controle), mas fica abaixo do que o resto do aplicativo pratica.

## Não verificado

- Emulador Android e aparelho físico: não há emulador nesta máquina. O botão sobre o visor real, a área segura com o traço de gesto, o teclado do iPhone, `Linking.openSettings` e a foto aceita no aparelho ficam sem prova E2 nesta rodada.
- Simulador de iOS: existe, mas não tem câmera (o visor não abre) e o build nativo escreveria em `apps/campo/ios`; não rodei.
- TalkBack e VoiceOver reais na tarja e nos botões.
- Fonte do sistema a 200 por cento e redução de movimento nas telas da etapa.

## Risco residual

O contraste está provado pelos tokens e pelo estilo renderizado, não pela tela do aparelho ao sol; o anúncio da tarja no iPhone depende de a pessoa chegar a ela.

## Motivo do humano

Aparelho físico (iPhone disponível, e Android quando houver): botão "Voltar sem fotografar" legível sobre o visor real, área segura, teclado, Ajustes e a foto aceita (critério E4 explícito na etapa e regra 1 de Rafael de prova em aparelho). TalkBack e VoiceOver reais na tarja e no botão de ajustes (CP-32), com atenção ao Achado 1 no iPhone.
