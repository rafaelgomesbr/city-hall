---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem toda minha. `A` é o scratchpad do validador (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-acessibilidade`). API do SHA em 127.0.0.1:3893 (PGlite semeado, `NOTIFICADOR_ARQUIVO` em `A/notificacoes.txt`); painel do SHA na 4893; Chromium, Firefox e WebKit; axe-core 4.10.2 injetado (WCAG 2.0, 2.1 e 2.2, A e AA). A etapa não tem linha "Acessibilidade:"; verifiquei os estados de `RecuperarSenha.tsx` pelo checklist WCAG. O diff desde a rodada 6 não toca as telas desta etapa, mas toca `app.css` (o `scroll-padding-top` do bloco de até 600 px vale também para estas telas públicas) e `componentes/foco.ts`: procurei a regressão por aí.

| Estado da tela | WCAG | Resultado (três motores, 320x640 claro e 640x450 escuro) | Prova |
| --- | --- | --- | --- |
| Pedido: a tela | 1.3.1, 1.4.10, 4.1.2 | axe 0 violações; sem rolagem horizontal a 320 px | `A/saidas/e10.txt` |
| Email inválido, enviado por Enter | 3.3.1, 2.4.3, 2.4.11 | foco no `#recuperar-email`, `aria-invalid=true`, `aria-describedby` com o erro e a dica, erro com `role=alert`; campo 15 de 15 pontos visíveis | `A/saidas/e10.txt` |
| Pedido enviado (resposta neutra), enviado por Espaço no botão | 2.4.3, 4.1.3, 1.4.3 | foco na confirmação "Se existir conta com esse email, enviamos um link..." (aviso focável, sem região viva, não lido duas vezes); contraste 5,53 (claro) e 9,64 (escuro); axe 0 violações | `A/saidas/e10.txt`; `capturas/a11y-recuperar-pedido-enviado-chromium-320x640-claro.png`, `capturas/a11y-recuperar-pedido-enviado-chromium-640x450-escuro.png` |
| Link real do notificador: o token sai da barra de endereço | | `url sem token=true` nos três motores; axe 0 violações | `A/saidas/e10.txt` |
| Senha curta, por Enter | 3.3.1, 2.4.3, 2.4.11 | foco em `#nova-senha`, `aria-invalid=true`, "A senha precisa de pelo menos 12 caracteres."; 15 de 15 visíveis | `A/saidas/e10.txt` |
| Sucesso, por Espaço no botão | 2.4.3, 4.1.3 | foco na confirmação "Senha redefinida. Entre com a nova senha." (cinco das seis execuções) | `A/saidas/e10.txt` |
| Link que não vale mais (o mesmo link usado de novo), por Espaço no botão | 3.3.1, 4.1.3, 2.4.3 | aviso `role=alert` "Este link de redefinição não vale mais..."; foco em BODY (achado 1, o mesmo da rodada 6) | `A/saidas/e10.txt` (WebKit 640x450) |
| Link inventado na barra | 3.3.1 | a tela abre o formulário "Nova senha" (a validade só é conferida no envio); foco em BODY ao carregar e o primeiro Tab no `#nova-senha` | `A/saidas/e10.txt` |
| Testes estáticos do painel (`recuperar-senha`, `recuperar-senha-e-sessao`, demais) | | 699 de 699, código 0 | `A/saidas/10-vitest-web.txt` |

## Evidência

- `cd A && node e10.mjs` (código 0): os estados acima, três motores, duas janelas e dois temas, com axe, contraste e medição de foco encoberto (`A/saidas/e10.txt`). Erros de console fora das respostas 4xx provocadas: zero.
- `npm run test --workspace @dc360/web`: código 0, 699 de 699.
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success` conforme lido pelo gatekeeper; não reli a API.
- Capturas (minhas, no SHA): `capturas/a11y-recuperar-pedido-enviado-chromium-320x640-claro.png`, `capturas/a11y-recuperar-pedido-enviado-chromium-640x450-escuro.png`.

## Cenários positivos

- Pedido, erro de campo, link real, senha curta e sucesso: foco onde a pessoa precisa, erro ligado ao campo, confirmação focada, dois temas, 320 px e 640x450 (zoom de 200 por cento).

## Cenários negativos

- Link inventado e link já usado: o aviso de que o link não vale mais é `role=alert`, com ícone e a frase de pedir outro.
- Email inválido: recusado na tela, sem ir ao servidor.

## Tentativas de reprovar

- Procurei o efeito do `scroll-padding-top` maior (140 px no bloco de até 600 px) nestas telas públicas, que não têm topo fixo: o campo focado depois do erro continua inteiro à vista a 320x640 e a 640x450; nenhum caso de foco encoberto.
- Procurei regressão do `focar` novo: `RecuperarSenha.tsx` não o usa; o foco nos erros é do próprio componente e funcionou nos três motores.
- Enviei pelo botão (Espaço) em vez de Enter, que é onde o foco costuma cair em BODY: a confirmação recebe o foco no pedido e no sucesso; só o caso do link que não vale mais deixa o foco em BODY.
- Rodei axe em cada estado nos dois temas: 0 violações.

## Achados

1. **anotado** (o mesmo da rodada 6, não é regressão). Quando o envio da senha nova é recusado porque o link não vale mais, o foco cai em BODY (o botão fica desabilitado durante o envio); o aviso é `role=alert` e é anunciado, e o Tab seguinte leva ao formulário. Visto no WebKit a 640x450, quando o link do notificador já tinha sido usado.

## Não verificado

- Leitor de tela real (VoiceOver, NVDA): leitura da confirmação focada e do aviso de link inválido.
- Recuperação desligada (a frase que manda procurar quem administra): minha API estava com o notificador de arquivo ligado; não reconstruí o painel com a recuperação desligada. A rodada 6 mediu esse estado e o diff não toca a tela.
- Zoom real do navegador (emulado por janela CSS), espaçamento de texto (1.4.12).

## Risco residual

Baixo: as telas desta etapa não mudaram; o CSS e o foco que mudaram não produziram encobrimento nem perda de foco nelas.

## Motivo do humano

A etapa pede o fluxo feito pelo Rafael com o notificador de arquivo. Leitura por leitor de tela real da confirmação e do aviso de link inválido só uma pessoa confere.
