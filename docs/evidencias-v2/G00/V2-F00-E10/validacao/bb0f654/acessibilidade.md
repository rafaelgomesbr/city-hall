---
validador: acessibilidade (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---

Pasta das sondas e saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/acessibilidade/` (`saidas/` e `capturas/` relativas a ela). API real com `NOTIFICADOR_ARQUIVO` (link de redefinição lido do arquivo, sem rede), painel construído, portas próprias, derrubados no fim. `@axe-core/playwright` ausente do repositório: DOM, `ariaSnapshot()` e contraste por cor computada.

## Critérios verificados

Checklist WCAG 2.1 AA nas telas `/recuperar-senha` e `/redefinir-senha`, todos os estados exercitados só por teclado:

| Item WCAG | Resultado | Prova |
| --- | --- | --- |
| 1.3.1 rótulo associado (`label for`) em e-mail, nova senha e repetir | OK | `saidas/06` |
| 3.3.1 e 3.3.3 erro no campo certo, com o que fazer | OK | vazio, formato, curta, diferentes |
| 4.1.2 `aria-invalid="true"` e erro ligado por `aria-describedby` | OK | os quatro erros |
| 4.1.3 erro de campo em `role="alert"`, com ícone e texto | OK | os quatro erros; aviso "link não vale mais" em `role="alert"` |
| 2.4.3 foco volta ao campo com erro; vai à confirmação depois de enviar e de redefinir; "Pedir de novo" devolve ao e-mail | OK | `saidas/06`, `saidas/12-sonda-e10-firefox.txt` |
| 2.4.3 ordem do Tab: e-mail, botão, voltar; nova, repetir, botão, voltar | OK | |
| 2.2.1 sem limite de tempo: 6 s depois do sucesso continua em `/redefinir-senha` | OK | |
| 2.4.7 confirmação focada com anel visível | OK | |
| 1.4.3 contraste de todo texto, claro e escuro, em 6 estados | OK | pior 4,75:1 (claro), 5,96:1 (escuro) |
| 1.4.10 reflow 640 e 320 px | OK | sem rolagem horizontal, nada cortado |
| 2.5.5 (boa prática) todo controle com 44 px a 640 e 320 px | OK | incluindo links do rodapé |
| 1.4.1 nada só por cor | OK | avisos com ícone e texto |

## Evidência

- `node sonda-e10.mjs` com link real do notificador: Chromium 47 de 47 (`saidas/06-sonda-e10-chromium.txt`), Firefox 47 de 47 (`saidas/12-sonda-e10-firefox.txt`).
- `node sonda-erros.mjs` (rede caída acionada PELO BOTÃO): `saidas/09-sonda-erros-chromium.txt`, `saidas/09-sonda-erros-firefox.txt`.
- E2E oficial, seções 14 e 27 dentro de `fluxo-api.e2e.mjs`: Chromium e Firefox 288 de 288 (`saidas/01`, `saidas/23`).
- Vitest: `recuperar-senha.test.ts` e demais arquivos de acessibilidade 109 de 109 (`saidas/17`); painel inteiro 665 de 665 (`saidas/16`).
- Capturas olhadas: `capturas/E10-senha-redefinida-320-escuro-chromium.png` (confirmação e uma ação, anel de foco no botão, nada cortado), mais `E10-pedido-erro-vazio-*`, `E10-pedido-enviado-*`, `E10-definir-erro-curta-*`, `E10-senha-redefinida-*`, `E10-definir-link-nao-vale-*`, `E10-pedido-erro-rede-foco-chromium.png`.

## Cenários positivos

- Pedido de Jonas: foco vai para "Se existir conta com esse email, enviamos um link..." (`tabindex=-1`, sem região viva duplicada: 0 regiões vivas na tela).
- Link real: o token sai da barra; "Senha redefinida. Entre com a nova senha." recebe o foco; uma única ação ("Entrar com a nova senha"), alcançada pelo Tab seguinte.

## Cenários negativos

- E-mail vazio e torto, senha curta, senhas diferentes: cada erro no campo certo, `aria-invalid`, `aria-describedby`, `role="alert"`, foco no campo.
- Token inventado: "Este link de redefinição não vale mais... Peça um novo link." em `role="alert"`, com ícone.
- Rede caída pelo botão: aviso `role="alert"`.

## Tentativas de reprovar

1. Esperei 6 s depois do sucesso para pegar o redirecionamento automático que reprovou a rodada 2: não acontece.
2. Contei regiões vivas na confirmação para pegar anúncio duplo: zero, o mecanismo é só o foco.
3. Acionei o envio pelo BOTÃO (não pelo Enter no campo), porque o botão vira `disabled`: no Chromium o foco cai em `BODY` (achado 1).
4. Reflow a 320 px com a confirmação de sucesso e com o pedido enviado: nada cortado, controles com 44 px.

## Achados

1. Anotado: com o envio acionado pelo botão e rede caída, o Chromium leva o foco a `BODY` (o botão fica `disabled` durante o envio). O Tab seguinte vai a "Voltar para a entrada" (operabilidade mantida) e o erro é `role="alert"`; no Firefox o foco fica no botão. `saidas/09`.
2. Anotado (já registrado pela etapa para a F10-E11): no "link não vale mais" o foco fica em `BODY`; o aviso é `role="alert"`.

## Não verificado

- Anúncio real por leitor de tela da confirmação focada e dos erros `role="alert"` (CP-32).
- axe-core (não instalado). WebKit para teclado (motor). Zoom pela interface do navegador (usado reflow).
- Cabeçalhos `Referrer-Policy` e `X-Robots-Tag` na Vercel: fora desta dimensão.

## Risco residual

Baixo. Os dois focos em `BODY` acontecem em caminho de falha, com o erro anunciado por `role="alert"` e o Tab seguinte no lugar certo.

## Motivo do humano

Leitor de tela (VoiceOver, NVDA): confirmar a leitura da confirmação focada ("Senha redefinida...", "Se existir conta...") e dos erros (seção 4 de `28`).
