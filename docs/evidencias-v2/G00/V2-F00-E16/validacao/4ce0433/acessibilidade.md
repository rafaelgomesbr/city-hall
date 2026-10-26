---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta de trabalho deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L07-acessibilidade/` (abaixo, `saidas/` e `sondas/`). Mutações e o teste temporário de captura rodaram num `git worktree add --detach` de `4ce0433` na pasta de trabalho, com `node_modules` por link simbólico, removido com `git worktree remove --force` no fim; a árvore principal não foi tocada. O aplicativo de campo não mudou desde `bb0f654` (o diff `bb0f654..4ce0433` não toca `apps/campo/src`).

## Critérios verificados

Linha "Acessibilidade" da etapa: "alvo de toque de 44 por 44 nos botões novos, ícone mais texto, tarja lida por leitor de tela". DoD: "7 testes verdes; nenhuma promessa de segundo plano na interface; portões do app verdes". Regressão obrigatória que toca esta dimensão: `scripts/portao-acessibilidade-do-aplicativo.test.mjs`, `portao-densidade-do-aplicativo.test.mjs`, `portao-design-do-aplicativo.test.mjs`.

| Item | Resultado | Prova |
| --- | --- | --- |
| 4.1.2 "Abrir os ajustes do aparelho" com papel `button`, nome que diz "ajustes", `minHeight` >= 44 | OK | jest "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44" (`saidas/31`) |
| 2.5.5 (alvo) todo tocável do aplicativo >= 52 pontos; todo tocável se apresenta ao leitor de tela | OK | portão de acessibilidade, "nenhum alvo de toque abaixo de 52" e "todo elemento tocável se apresenta ao leitor de tela" (`saidas/30`) |
| 1.4.3 contraste calculado nos dois temas, par a par | OK | portão, "temaClaro" e "temaEscuro" (`saidas/30`) |
| 1.4.3 e 1.4.11 "Voltar sem fotografar" sobre o visor preto, aparelho claro e escuro | OK | `vistoria-camera-legivel-sobre-o-visor.test.tsx`, 2 de 2 (`saidas/31`) |
| 1.4.1 tarja com sinal mais título "Não deu certo" mais frase | OK | `a11y-tarja-camera-negada-com-ajustes-390-claro.png` e `-escuro.png`, `a11y-tarja-foto-vazia-390-claro.png` e `-escuro.png` |
| 4.1.3 tarja lida por leitor de tela | OK no Android por código (`accessibilityLiveRegion="assertive"` na tarja e `accessibilityRole="alert"` no aviso); no iOS não verificável e provavelmente não anunciada sozinha (ver Achados) | `saidas/31`, mutação M1 |
| 3.3.1 foto vazia diz "Tire a foto de novo." | OK | jest e `a11y-tarja-foto-vazia-*` |
| nenhuma promessa de segundo plano | OK | portão próprio, 15 casos verdes (`saidas/30`) |

## Evidência

- `node --test` dos quatro portões do aplicativo: 48 de 48, código 0 (`saidas/30-portoes-do-aplicativo.txt`).
- `npx jest --verbose` dos três arquivos da etapa (`vistoria-o-teclado-a-camera-e-o-que-ela-promete`, `vistoria-camera-legivel-sobre-o-visor`, `vistoria-a-foto-com-o-disco-fiel`): 20 de 20, código 0 (`saidas/31-jest-e16-verbose.txt`).
- `npm run test:campo` (tipos, jest e contagem): 134 suítes, 1932 de 1932, "tipos limpos e testes verdes", código 0 (`saidas/32-test-campo.txt`).
- Mutações no worktree (o teste morde): M1, a tarja sem `accessibilityLiveRegion`: 1 vermelho, "o botão dos ajustes tem nome para o leitor de tela e área de toque de 44" (`saidas/33`); M2, a barra da câmera sem somar `margens.bottom`: 1 vermelho, "reserva a área segura de baixo" (`saidas/34`). Arquivo restaurado com `git checkout` no worktree antes de cada passo.
- Capturas desta rodada, nível E1+ (`capturas/`): teste temporário de jest no worktree (`sondas/zz-a11y-tarja.test.tsx.txt`) monta a tela REAL de vistoria com a câmera negada e com a foto vazia, nos dois esquemas do aparelho, grava a árvore com estilos achatados (`saidas/35`), e o conversor do implementador (cópia em `sondas/arvore-para-html-a11y.mjs`) a desenha em Chromium a 390 px: `a11y-tarja-camera-negada-com-ajustes-390-claro.png`, `a11y-tarja-camera-negada-com-ajustes-390-escuro.png`, `a11y-tarja-foto-vazia-390-claro.png`, `a11y-tarja-foto-vazia-390-escuro.png`. Olhada a de câmera no escuro: sinal, "Não deu certo", a frase inteira, "Abrir os ajustes do aparelho" em realce dentro da caixa e "Fechar" logo abaixo, no topo da tela. Não é aparelho nem emulador.

## Cenários positivos

- Câmera e localização negadas: a tarja traz "Abrir os ajustes do aparelho", que chama `Linking.openSettings`, e "Fechar".
- Foto que saiu vazia: a tarja diz "A foto não ficou guardada neste aparelho. Tire a foto de novo."

## Cenários negativos

- Falha que não é de permissão não ganha o botão de ajustes, e o botão não sobrevive à falha seguinte (jest, `saidas/31`).
- O sistema recusar abrir os ajustes não estoura nada (jest).

## Tentativas de reprovar

1. Tirei a região viva da tarja (M1) e o recuo da área segura (M2): os testes reprovam, logo prendem o que dizem.
2. Procurei tocável sem papel ou nome e alvo abaixo de 44 em todo o aplicativo pelo portão: nenhum.
3. Procurei anúncio da tarja no iOS: não há `AccessibilityInfo.announceForAccessibility` nem `setAccessibilityFocus` em `apps/campo/src` (busca no fonte); `accessibilityLiveRegion` é propriedade só do Android no React Native.
4. Tentei rodar o aplicativo: não deu (ver Não verificado).

## Achados

1. **Corrige antes de crescer (4.1.3 no iOS; não reprova sem aparelho).** "Tarja lida por leitor de tela" está garantida por código só no Android (`accessibilityLiveRegion="assertive"`, `apps/campo/src/app/(agente)/vistoria/[id].tsx:682`). No iOS o React Native não tem região viva: sem `AccessibilityInfo.announceForAccessibility` ou foco de acessibilidade levado à tarja, o VoiceOver não deve ler a falha sozinho, e o aparelho de validação disponível é um iPhone. Não provei por voz (sem aparelho); fica para a validação humana da etapa (F14-E12) com VoiceOver ligado. Não há registro disso em `apps/campo/PENDENCIAS.md`.
2. Motivo do veredito da rodada 4 para a E16: todas as dimensões em PASS (confiança média, sem emulador). Nada a consertar; o que esta dimensão mede segue igual.

## Não verificado

- O aplicativo rodando. Simulador de iOS existe (iPhone 17, iOS 26.5, desligado), mas não há `.app` construído (`ios/build` com 864 KB, DerivedData do projeto com 20 KB) e construir o projeto nativo exige vários GB com 6,1 GB livres no disco (a rodada 4 teve ENOSPC); não tentei. Expo web não roda: `react-native-web` não está instalado e a regra proíbe instalar na árvore principal. Não há emulador Android.
- VoiceOver e TalkBack: a leitura da tarja, a ordem de leitura da tela de vistoria, o rótulo "Tirar a fotografia" do obturador.
- Teclado do aparelho cobrindo o campo, o primeiro toque com o teclado aberto e a área segura real (só pelas propriedades testadas).
- Fonte grande do sistema (Dynamic Type) e o layout do Yoga (as capturas são do Chromium).

## Risco residual

Médio: no iPhone, quem usa VoiceOver pode não ouvir que a câmera ou a localização foram negadas, e só achar a tarja percorrendo a tela; no Android o anúncio está no código.

## Motivo do humano

Rafael no iPhone (e em Android real quando houver), com VoiceOver e TalkBack ligados: negar a câmera e conferir se a tarja é lida sozinha e se "Abrir os ajustes do aparelho" abre os Ajustes; digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque; ver o obturador acima da barra do sistema. O agente não substitui aparelho nem leitor de tela (seção 4 de `28`).
