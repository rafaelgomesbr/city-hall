---
validador: acessibilidade (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---

Pasta das sondas e saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/acessibilidade/` (abaixo, `saidas/` e `capturas/` são relativas a ela). API real (PGlite semeado, `npx tsx src/index.ts`) e painel construído com `VITE_API_URL` em portas próprias (3791/4791, 3792/4792, 3793/4793), derrubados no fim. `@axe-core/playwright` NÃO está instalado no repositório (`dc360/node_modules/@axe-core` não existe): no lugar do axe, inspeção do DOM, `ariaSnapshot()` do Playwright e medição de contraste por cor computada (com composição de fundo translúcido e pior parada de gradiente).

## Critérios verificados

Checklist WCAG 2.1 AA, item a item, nas três frases da tela de entrada (sessão expirou, sessão encerrada, conta desativada), produzidas de verdade (administradora encerra as sessões e desativa a conta pela API; a pessoa tenta a escrita seguinte SÓ pelo teclado):

| Item WCAG | Resultado | Prova |
| --- | --- | --- |
| 1.1.1 ícone do aviso decorativo fora da árvore | OK | svg com `aria-hidden`; `saidas/03` |
| 1.3.1 papéis: encerrada e expirou `role="status"`, desativada `role="alert"` | OK | `saidas/03`, `saidas/12-sonda-e05-firefox.txt` |
| 1.4.1 nada só por cor (tom, ícone e texto) | OK | classe `aviso--alerta`/`aviso--perigo`, svg, frase |
| 1.4.3 contraste do aviso, claro e escuro | OK | pior 4,75:1 (desativada, claro), 6,37:1 (encerrada, claro), 6,6 a 8,92:1 (escuro) |
| 1.4.3 contraste de todo texto da tela de entrada | OK | pior 5,14:1 claro e 6,75:1 escuro (a sigla "DC" é `aria-hidden`, logotipo) |
| 1.4.4 e 1.4.10 zoom 200% (640 px) e 400% (320 px) | OK | sem rolagem horizontal, nada cortado, aviso inteiro na largura |
| 2.1.1 a escrita que derruba a sessão feita só por teclado | OK | Tab até "Trocar senha" e Enter |
| 2.4.3 ordem do Tab na entrada | OK | e-mail, senha, Entrar, "Esqueceu a senha?", "Quero conhecer" |
| 2.4.7 foco visível no campo | OK | anel por `box-shadow` de 2 mais 4 px |
| 4.1.2 nome e papel | OK | a frase está na árvore de acessibilidade nas três situações |
| 4.1.3 mensagem de estado | parcial: ver Não verificado (anúncio por leitor de tela) |

## Evidência

- `node sonda-e05.mjs` contra API 3792 e painel 4792, Chromium: código 0, 55 de 55 (`saidas/03-sonda-e05-chromium.txt`); Firefox: 55 de 55 (`saidas/12-sonda-e05-firefox.txt`).
- E2E oficial completo, `node test/fluxo-api.e2e.mjs` contra par recém-semeado: Chromium "Passou: 288 Falhou: 0, Zero erro de console" (`saidas/01-fluxo-api-e2e-chromium.txt`), Firefox 288 de 288 (`saidas/23-fluxo-api-e2e-firefox.txt`); a seção 23 (frases de sessão encerrada e conta desativada, 23c renovação recusada) passa nos dois.
- `npx vitest run` do painel: 44 arquivos, 665 de 665 (`saidas/16-web-vitest.txt`).
- Capturas olhadas: `capturas/E05-entrada-desativada-1280-claro.png` (aviso de perigo com ícone, frase inteira, sem corte), `capturas/E05-entrada-encerrada-320-escuro.png` (frase quebra em 10 linhas dentro da caixa, anel de foco no e-mail), mais `E05-entrada-{encerrada,desativada,expirou}-{1280-claro,1280-escuro,640-escuro,320-escuro}.png`.

## Cenários positivos

- Sessão encerrada pela administradora: a escrita seguinte leva à entrada com "Sua sessão foi encerrada...", `role="status"`, contraste 6,37:1 (claro) e 8,92:1 (escuro).
- Conta desativada: "Sua conta foi desativada. Entrar de novo não resolve...", `role="alert"`, 4,75:1 e 6,6:1.
- Tokens corrompidos no navegador: "Sua sessão expirou...", `role="status"`.
- Nos três casos, Tab percorre e-mail, senha e Entrar na ordem, e o anel de foco aparece.

## Cenários negativos

- 320 px e 640 px nos dois temas: nenhuma rolagem horizontal, nenhum elemento cortado, aviso dentro da largura (x 32, largura 256 a 320 px).
- Firefox: mesmas 55 verificações, mesmo resultado.
- Zero erro de console e de página fora dos 401/403 provocados.

## Tentativas de reprovar

1. Procurei contraste abaixo de 4,5:1 em TODO texto visível da tela de entrada, não só no aviso: o único achado inicial (sigla "DC", 1,07:1) era erro da minha sonda (fundo em gradiente e elemento `aria-hidden`); corrigida a sonda para compor a pior parada do gradiente, o pior caso real é 4,75:1.
2. Tentei achar a frase fora da árvore de acessibilidade (renderizada por pseudo-elemento ou escondida por `aria-hidden`): ela está no `ariaSnapshot` nas três situações.
3. Reflow a 400% (320 px) com a frase mais longa (sessão encerrada, 4 frases): sem corte nem rolagem.
4. Teclado puro na escrita que dispara a recusa (sem clique): o botão "Trocar senha" é alcançado por Tab e o Enter dispara a ida à entrada.

## Achados

- Anotado (não quebra critério da etapa): depois do redirecionamento para `/entrar` o foco fica em `BODY` (a tela de entrada não tem `#conteudo`, alvo de `TrocaDeTela`). O primeiro Tab cai no e-mail, como numa carga de página nova; para leitor de tela, o anúncio depende de a região `role="status"` inserida já com o texto ser lida (ver Não verificado).

## Não verificado

- Anúncio real por VoiceOver, NVDA ou TalkBack: as regiões `role="status"` (encerrada, expirou) entram no DOM junto com a página e já com o texto; leitores de tela nem sempre anunciam região viva inserida com conteúdo. Só pessoa com leitor de tela confirma (CP-32).
- axe-core: não instalado no repositório; substituído por inspeção do DOM, árvore do Playwright e medição de contraste.
- WebKit para teclado: o WebKit do Playwright no macOS não leva o Tab a botões e links (comportamento do motor, registrado na própria E09); usei Chromium e Firefox.
- Zoom real do navegador: reproduzido por reflow equivalente (640 e 320 px de largura CSS), não pelo zoom da interface do navegador.

## Risco residual

Baixo. O aviso de `alerta` (encerrada, expirou) é `role="status"` montado com o texto já presente; se um leitor de tela não o anunciar, a pessoa ainda o encontra como primeiro conteúdo depois do título ao ler a página.

## Motivo do humano

Leitor de tela (VoiceOver no Safari, NVDA no Chrome): confirmar que as três frases são lidas ao chegar na entrada. É o limite da seção 4 de `28` (o agente não substitui VoiceOver nem pessoa com deficiência). O texto das três frases é conteúdo de produto (aprovação do Rafael, já pendente na etapa), fora desta dimensão.
