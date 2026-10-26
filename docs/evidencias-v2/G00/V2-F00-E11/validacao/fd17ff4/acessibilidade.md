---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem toda minha. `A` é o scratchpad do validador (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-acessibilidade`). API do SHA em 127.0.0.1:3893 (PGlite semeado); painel do SHA na 4893; Chromium, Firefox e WebKit; axe-core 4.10.2 injetado (WCAG 2.0, 2.1 e 2.2, A e AA). A etapa não tem linha "Acessibilidade:"; o DoD é o download do ZIP em dois navegadores. O diff desde a rodada 6 não toca `Organizacao.tsx` nem o download; toca `app.css` e `foco.ts`, e procurei a regressão por aí.

| Critério | WCAG | Resultado | Prova |
| --- | --- | --- | --- |
| Botão "Baixar pacote de saída" alcançável e acionável só pelo teclado, e o download acontece | 2.1.1 | OK em Chromium e Firefox a 1280x900, 390x844, 640x450 e 320x640: Tab até o botão, Enter, `dc360-pacote-de-saida-2026-10-20.zip`. No WebKit o Tab do Mac não passa por botões (motor); o download no WebKit não foi medido | `A/saidas/e11.txt` |
| O botão focado não fica encoberto | 2.4.11 | OK em Chromium e Firefox nas quatro janelas: 15 de 15 pontos visíveis | `A/saidas/e11.txt` |
| Alvo de toque e ícone mais texto | 2.5.8, 1.4.1, 1.1.1 | 216x44 em todas as janelas e motores; ícone `aria-hidden` mais texto | `A/saidas/e11.txt` |
| Recusa mostra a frase da API como alerta | 4.1.3, 3.3.1, 1.4.3 | OK nos três motores (rota do pacote respondendo 403 com a frase, por interceptação do Playwright): `role=alert` "Seu papel não permite esta ação."; contraste 4,75 (claro) e 7,27 (escuro) | `A/saidas/e11.txt`; `capturas/a11y-pacote-recusa-chromium-390x844-escuro.png`, `capturas/a11y-pacote-recusa-chromium-640x450-claro.png` |
| Foco depois do download e da recusa | 2.4.3 | BODY depois do download em Chromium e Firefox; BODY depois da recusa no Chromium (no Firefox e no WebKit fica no botão). É o achado da rodada 4, decidido por arbitragem como "corrige antes de crescer" | `A/saidas/e11.txt` |
| axe na Organização | | 0 violações a 1280x900 e 640x450; a 390x844 e 320x640, 1 violação `link-name` em `.identidade` (anterior à fase; relatório da E09, achado 3) | `A/saidas/e11.txt` |
| 320 px sem rolagem horizontal | 1.4.10 | OK nos três motores | `A/saidas/e11.txt` |
| Testes estáticos do painel (`pacote-de-saida.test.ts` e demais) | | 699 de 699, código 0 | `A/saidas/10-vitest-web.txt` |

## Evidência

- `cd A && node e11.mjs` (código 0): três motores, quatro janelas, dois temas; download pelo teclado; recusa por `page.route` na rota `**/saida/pacote.zip` devolvendo 403 com `{erro, mensagem}`; axe; contraste por elemento (`A/saidas/e11.txt`). Zero erro de console fora dos 403 provocados.
- `npm run test --workspace @dc360/web`: código 0, 699 de 699.
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success` conforme lido pelo gatekeeper (o job "Fluxo ponta a ponta no navegador" cobre as seções 28 e 29 de `fluxo-api.e2e.mjs`); não reli a API.
- Capturas (minhas, no SHA): `capturas/a11y-pacote-recusa-chromium-390x844-escuro.png`, `capturas/a11y-pacote-recusa-chromium-640x450-claro.png`.

## Cenários positivos

- O pacote baixa pelo teclado em Chromium e Firefox, em quatro larguras, inclusive no zoom de 200 por cento.

## Cenários negativos

- Recusa da API: a frase dela aparece como alerta, com ícone e contraste acima de 4,5.

## Tentativas de reprovar

- Procurei se o `scroll-padding-top` maior ou o `focar` novo deixavam o botão do pacote encoberto ao receber o foco pelo Tab, no celular e a 640x450: não.
- Procurei rolagem horizontal a 320 px na Organização: não há.
- Provoquei a recusa sem ter um papel sem permissão, interceptando a rota: o aviso aparece e é lido como alerta.
- Medi o foco depois do download e da recusa: continua em BODY nos casos já conhecidos; nada piorou desde a rodada 6.

## Achados

1. **corrige antes de crescer** (já decidido na arbitragem da rodada 4, sem mudança). Depois do download, e no Chromium depois da recusa, o foco fica em BODY; "Gerando" e a conclusão não têm região viva.
2. **corrige antes de crescer** (anterior à fase). Link do topo para Minha conta sem nome acessível até 600 px (axe `link-name`; relatório da E09, achado 3).

## Não verificado

- Download no WebKit (o Tab do motor não chega ao botão e não medi por clique).
- Leitor de tela real: anúncio da recusa e do fim do download.
- Abrir o ZIP (humano, pela etapa).

## Risco residual

Baixo para esta etapa: a tela não mudou e o CSS novo não a afetou. O foco solto depois do download segue registrado.

## Motivo do humano

A etapa pede que o Rafael baixe o pacote pelo painel com a API local e abra o ZIP. A leitura do aviso por leitor de tela só uma pessoa confere.
